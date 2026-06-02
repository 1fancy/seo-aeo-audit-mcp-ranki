/**
 * Daily quota counter with atomic file locking. Mirrors the PHP
 * lib/ratelimit.php scheme — same /tmp/ranki-mcp-rl/ directory, same
 * sha1(scope|day) filename — so a host running BOTH the PHP server
 * (mcp.ranki.io) and this TS server share state.
 *
 * Atomicity: O_CREAT+O_RDWR open, advisory lock via fs/promises.flock
 * via a sentinel `.lock` file (Node has no built-in flock, but a single
 * tmp lockfile per scope behaves identically for daily-counter math).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FREE_LIMIT = 5;
export const KEYED_LIMIT = 500;

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: string;
  secondsUntilReset: number;
}

function bucketDir(): string {
  return join(tmpdir(), 'ranki-mcp-rl');
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

function bucketPath(scope: string): string {
  return join(bucketDir(), sha1(scope + '|' + dayKey()));
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(bucketDir(), { recursive: true, mode: 0o755 });
  } catch {
    /* dir may already exist or be unwritable; the open below will fail loudly */
  }
}

function tomorrowEpoch(): number {
  const now = new Date();
  const t = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.floor(t / 1000);
}

function buildResult(allowed: boolean, count: number, limit: number): RateLimitResult {
  const tomorrow = tomorrowEpoch();
  const nowS = Math.floor(Date.now() / 1000);
  const resetIso = new Date(tomorrow * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    allowed,
    used: count,
    limit,
    resetAt: resetIso,
    secondsUntilReset: Math.max(0, tomorrow - nowS),
  };
}

/**
 * Atomic read-modify-write. We acquire an exclusive lockfile, read the
 * counter, increment if under cap, write back, release.
 *
 * Lockfile is a sibling `.lock` per bucket. mkdir is atomic across
 * processes on POSIX — we use it as a mutex (lockfile pattern). If the
 * lockfile is stale (>5s old), we steal it.
 */
async function checkScope(scope: string, limit: number): Promise<RateLimitResult> {
  await ensureDir();
  const file = bucketPath(scope);
  const lock = file + '.lock';
  const start = Date.now();

  // Try to acquire the lock for up to 1s. If we can't, fail open with
  // the conservative "not allowed" result — better than DoSing the
  // caller on lock contention.
  while (true) {
    try {
      await fs.mkdir(lock);
      break;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'EEXIST') {
        // Steal stale lockfile (>5s) to recover from a crashed process.
        try {
          const st = await fs.stat(lock);
          if (Date.now() - st.mtimeMs > 5_000) {
            await fs.rmdir(lock).catch(() => undefined);
            continue;
          }
        } catch {
          /* lock gone — try again */
        }
        if (Date.now() - start > 1_000) {
          return buildResult(false, limit, limit);
        }
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      // Unexpected error — fall through, treat as allowed (don't DoS).
      return buildResult(true, 0, limit);
    }
  }

  try {
    let count = 0;
    try {
      const existing = await fs.readFile(file, 'utf8');
      const n = parseInt(existing, 10);
      if (Number.isFinite(n) && n >= 0) count = n;
    } catch {
      /* no file → count stays 0 */
    }
    const allowed = count < limit;
    if (allowed) {
      count++;
      await fs.writeFile(file, String(count), { mode: 0o644 });
    }
    return buildResult(allowed, count, limit);
  } finally {
    await fs.rmdir(lock).catch(() => undefined);
  }
}

export function checkIp(ip: string, limitOverride?: number): Promise<RateLimitResult> {
  return checkScope('ip:' + ip, limitOverride ?? FREE_LIMIT);
}

export function checkKey(apiKey: string): Promise<RateLimitResult> {
  return checkScope('key:' + sha1Hex(apiKey), KEYED_LIMIT);
}

function sha1Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex'); // sha256 matches PHP impl
}

export function formatReset(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
