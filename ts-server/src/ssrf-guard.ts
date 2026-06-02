/**
 * SSRF guard for outbound HTTP fetches.
 *
 * The MCP server receives URLs from the public internet (every audit_*
 * tool takes a `url` arg). Without validation, an attacker could ask us
 * to fetch http://127.0.0.1/, http://169.254.169.254/ (AWS IMDS),
 * file:///etc/passwd, gopher:// etc. and read back internal state.
 *
 * This module is the TS twin of lib/registry.php's rk_mcp_url_blocked_reason
 * + the manual-redirect fetch wrapper. Behaviour MUST stay in sync so
 * the two impls block exactly the same URLs.
 */
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

const MAX_URL_LEN = 2048;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const CLOUD_METADATA_IPS = new Set([
  '169.254.169.254', // AWS IMDS v1/v2, GCP, Azure
  '169.254.170.2',   // AWS task metadata
  '100.100.100.200', // Alibaba Cloud
  '0.0.0.0',
]);

const REJECT_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

const USER_AGENT = 'Mozilla/5.0 (compatible; RankiMCP/0.3-ts; +https://ranki.io/developers/mcp)';

export interface FetchResult {
  html: string;
  status: number;
  finalUrl: string;
}

/**
 * Returns a human-readable refusal reason if the URL must be blocked,
 * or null if it's safe to fetch. Pure function — no network I/O for the
 * URL/scheme check; only DNS resolution if it gets that far.
 */
export async function urlBlockedReason(url: string): Promise<string | null> {
  if (url.length > MAX_URL_LEN) {
    return `URL is too long (max ${MAX_URL_LEN} characters).`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'URL is malformed. Expected an absolute http:// or https:// URL.';
  }

  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return `Only http:// and https:// URLs are accepted (got: ${scheme}://). file:// gopher:// and other schemes are disabled.`;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === '' || REJECT_HOSTS.has(host) || host.endsWith('.localhost')) {
    return `Refusing to fetch ${host} — it resolves to internal infrastructure.`;
  }

  // Literal IP in the URL? Validate directly without DNS.
  if (isIP(host)) {
    if (ipIsPrivate(host)) {
      return `Refusing to fetch ${host} — it resolves to a private, loopback, link-local or cloud-metadata address (${host}).`;
    }
    return null;
  }

  // Resolve all A + AAAA records and reject if ANY is private. Catches
  // attacker-controlled domains that A-record to 127.0.0.1 etc.
  let ips: string[] = [];
  try {
    const v4 = await dns.resolve4(host).catch(() => [] as string[]);
    const v6 = await dns.resolve6(host).catch(() => [] as string[]);
    ips = [...v4, ...v6];
  } catch {
    // fall through with empty list
  }
  if (ips.length === 0) {
    return `Couldn't resolve host ${host}. Check the URL is correct and the site is reachable.`;
  }
  for (const ip of ips) {
    if (ipIsPrivate(ip)) {
      return `Refusing to fetch ${host} — it resolves to a private, loopback, link-local or cloud-metadata address (${ip}).`;
    }
  }
  return null;
}

/**
 * True iff the IP is loopback, private, link-local, cloud-metadata,
 * reserved, multicast, or otherwise not a public unicast address.
 *
 * Covers RFC 1918 (10/8, 172.16/12, 192.168/16), RFC 6598 (100.64/10
 * CGNAT), RFC 3927 (169.254/16 link-local), 127/8 loopback, 0/8, 224/4
 * multicast, 240/4 reserved, IPv6 loopback / link-local / ULA, etc.
 */
export function ipIsPrivate(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true; // not a valid IP → treat as unsafe
  if (CLOUD_METADATA_IPS.has(ip)) return true;

  if (family === 4) {
    const o = ip.split('.').map((n) => parseInt(n, 10));
    if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = o;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0.0/24 IETF
    if (a === 192 && b === 0 && o[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && o[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && o[2] === 113) return true; // TEST-NET-3
    if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
    if (a! >= 224) return true; // multicast + reserved
    return false;
  }

  // IPv6 — normalize to lowercase, check loopback / link-local / ULA /
  // mapped v4. Node's isIP already validates shape.
  const lc = ip.toLowerCase();
  if (lc === '::' || lc === '::1') return true;
  if (lc.startsWith('fe80:') || lc.startsWith('fe80::')) return true; // link-local
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true; // unique local
  if (lc.startsWith('ff')) return true; // multicast
  if (lc.startsWith('::ffff:')) {
    // IPv4-mapped — extract and re-check
    const mapped = lc.slice(7);
    if (isIP(mapped) === 4) return ipIsPrivate(mapped);
  }
  return false;
}

/**
 * SSRF-safe fetch. Validates the URL, manually follows up to 5
 * redirects (re-validating each hop), caps body at 8 MB.
 *
 * Throws a plain Error with a human-readable message on block / timeout
 * — callers let it propagate so the dispatcher returns a JSON-RPC error.
 */
export async function safeFetchUrl(
  url: string,
  options: { timeoutMs?: number; method?: 'GET' | 'HEAD' } = {},
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const method = options.method ?? 'GET';
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const reason = await urlBlockedReason(current);
    if (reason !== null) throw new Error(reason);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      if (controller.signal.aborted) {
        throw new Error(`Request timed out after ${timeoutMs}ms while fetching ${current}.`);
      }
      throw new Error(`Network error fetching ${current}: ${msg}`);
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { html: '', status: response.status, finalUrl: current };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { html: '', status: response.status, finalUrl: current };
      }
      current = next.toString();
      continue;
    }

    // Read body with byte cap (8 MB).
    if (method === 'HEAD' || !response.body) {
      return { html: '', status: response.status, finalUrl: current };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPONSE_BYTES) {
        // truncate; we'll still return what we have so far
        chunks.push(value.subarray(0, MAX_RESPONSE_BYTES - (total - value.length)));
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return {
      html: buf.toString('utf8'),
      status: response.status,
      finalUrl: current,
    };
  }
  throw new Error('Too many redirects (>5).');
}
