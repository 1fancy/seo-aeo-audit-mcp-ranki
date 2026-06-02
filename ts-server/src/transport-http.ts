/**
 * HTTP JSON-RPC 2.0 transport — for Cursor / Windsurf / self-hosted
 * setups. Same security guards as the hardened PHP dispatcher:
 *
 *   - 64 KB request body cap (Content-Length precheck + read-cap)
 *   - JSON parsing only (no XML / form bodies)
 *   - Tool-name allowlist (regex)
 *   - SSRF guard inside each tool (via ssrf-guard.ts)
 *   - Per-IP + per-key daily quota (file-locked counters)
 *
 * No DB, no framework. Native node:http. The TS server's IP-detection
 * trusts X-Forwarded-For / CF-Connecting-IP ONLY when REMOTE_ADDR is
 * inside the Cloudflare range — same allowlist as the PHP impl. For
 * self-hosted setups behind a non-CF proxy, set MCP_TRUSTED_PROXIES.
 */
import http from 'node:http';
import { isIP } from 'node:net';
import { TOOLS, getTool, isKeyedTool } from './tools/registry.js';
import { checkIp, checkKey, formatReset } from './ratelimit.js';
import { RankiApiError } from './ranki-api.js';
import { ipIsPrivate } from './ssrf-guard.js';

const MAX_BODY_BYTES = 65_536;
const MAX_JSON_DEPTH = 16;

const CLOUDFLARE_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

export async function runHttp(opts: { host: string; port: number }): Promise<void> {
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      console.error('[ranki-seo-aeo-mcp] uncaught:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      }
    }
  });

  server.listen(opts.port, opts.host, () => {
    const where = opts.host === '0.0.0.0' ? '<all interfaces>' : opts.host;
    process.stderr.write(`ranki-seo-aeo-mcp listening on http://${where}:${opts.port}\n`);
    process.stderr.write(`  POST JSON-RPC 2.0 envelopes (initialize / tools/list / tools/call / ping).\n`);
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed', message: 'POST JSON-RPC only' }));
    return;
  }

  // Body-size precheck
  const declared = parseInt(String(req.headers['content-length'] ?? '0'), 10);
  if (declared > MAX_BODY_BYTES) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'payload_too_large',
        message: `Request body must be ≤${MAX_BODY_BYTES} bytes.`,
      }),
    );
    return;
  }

  // Read with hard cap
  const chunks: Buffer[] = [];
  let total = 0;
  let oversize = false;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      oversize = true;
      break;
    }
    chunks.push(buf);
  }
  if (oversize) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'payload_too_large',
        message: `Request body must be ≤${MAX_BODY_BYTES} bytes.`,
      }),
    );
    return;
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    if (!validateDepth(parsed, MAX_JSON_DEPTH)) {
      throw new Error('Maximum stack depth exceeded');
    }
  } catch (e) {
    return replyError(res, null, -32700, 'Parse error: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { jsonrpc?: unknown }).jsonrpc !== '2.0' ||
    typeof (parsed as { method?: unknown }).method !== 'string'
  ) {
    return replyError(
      res,
      null,
      -32600,
      'Invalid Request — expected a JSON-RPC 2.0 body with "method" and "jsonrpc": "2.0".',
    );
  }

  const reqObj = parsed as {
    jsonrpc: '2.0';
    id: number | string | null;
    method: string;
    params?: Record<string, unknown>;
  };
  const id = reqObj.id ?? null;
  const apiKey = String(req.headers['x-api-key'] ?? '').trim();

  try {
    switch (reqObj.method) {
      case 'initialize':
        return replyResult(res, id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'ranki', version: '0.1.0' },
        });
      case 'tools/list':
        return replyResult(res, id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case 'tools/call': {
        const params = reqObj.params ?? {};
        const name = String(params.name ?? '');
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        if (!name) {
          return replyError(res, id, -32602, 'Missing tool name. Call `tools/list` to see all available tools.');
        }
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
          return replyError(res, id, -32602, `Invalid tool name: ${name}`);
        }
        const tool = getTool(name);
        if (!tool) {
          return replyError(res, id, -32601, `Unknown tool: ${name}`);
        }
        if (isKeyedTool(name) && !apiKey) {
          return replyError(
            res,
            id,
            -32001,
            `This tool (\`${name}\`) reads your private Ranki.io data, so it needs your API key.\n\n` +
              `1. Generate one at https://app.ranki.io/developer (30 seconds).\n` +
              `2. Add it to your MCP client config under headers.X-API-Key (HTTP) or env.RANKI_API_KEY (stdio).\n` +
              `3. Restart the client and retry this tool.`,
          );
        }

        // Rate limit
        const clientIp = detectClientIp(req);
        const ipRl = await checkIp(clientIp, apiKey ? 100 : undefined);
        const rl = apiKey ? await checkKey(apiKey) : ipRl;
        const effective = apiKey && !ipRl.allowed ? ipRl : rl;
        res.setHeader('X-RateLimit-Limit', String(effective.limit));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, effective.limit - effective.used)));
        res.setHeader('X-RateLimit-Reset', effective.resetAt);

        if (!effective.allowed) {
          const reset = formatReset(effective.secondsUntilReset);
          const msg = apiKey
            ? `Daily quota reached on this API key: ${effective.limit} of ${effective.limit} calls used today.\n\nQuota resets in ${reset} (at ${effective.resetAt}).\n\nRunning a real workload that needs more? Email support@ranki.io.`
            : `You've reached the free daily quota: ${effective.limit} of ${effective.limit} calls used from your IP.\n\nQuota resets in ${reset} (at ${effective.resetAt}).\n\nFor 500 calls per day on the same tools, grab a free Ranki.io API key at https://app.ranki.io/developer.`;
          return replyError(res, id, -32000, msg);
        }

        try {
          const result = await tool.call(args, apiKey);
          return replyResult(res, id, result);
        } catch (e) {
          if (e instanceof RankiApiError) return replyError(res, id, -32603, e.userMessage);
          return replyError(res, id, -32603, e instanceof Error ? e.message : String(e));
        }
      }
      case 'ping':
        return replyResult(res, id, {});
      default:
        return replyError(
          res,
          id,
          -32601,
          `Method not found: ${reqObj.method}. Supported: initialize, tools/list, tools/call, ping.`,
        );
    }
  } catch (e) {
    console.error('[ranki-seo-aeo-mcp]', e);
    return replyError(res, id, -32603, e instanceof Error ? e.message : String(e));
  }
}

function replyResult(res: http.ServerResponse, id: number | string | null, result: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

function replyError(
  res: http.ServerResponse,
  id: number | string | null,
  code: number,
  message: string,
): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
}

function validateDepth(v: unknown, max: number, current = 0): boolean {
  if (current > max) return false;
  if (Array.isArray(v)) return v.every((x) => validateDepth(x, max, current + 1));
  if (v && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).every((x) => validateDepth(x, max, current + 1));
  }
  return true;
}

function detectClientIp(req: http.IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '0.0.0.0';
  const extra = process.env.MCP_TRUSTED_PROXIES ?? '';
  const trusted = extra ? [...CLOUDFLARE_RANGES, ...extra.split(',').map((s) => s.trim())] : CLOUDFLARE_RANGES;

  const trust = trusted.some((cidr) => cidrContains(remote, cidr));
  if (trust) {
    const cf = String(req.headers['cf-connecting-ip'] ?? '').split(',')[0].trim();
    if (cf && isIP(cf)) return cf;
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (xff && isIP(xff)) return xff;
  }
  // Strip IPv6 prefix if v4-mapped (::ffff:1.2.3.4 → 1.2.3.4)
  const m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(remote);
  if (m) return m[1];
  return isIP(remote) ? remote : '0.0.0.0';
}

function cidrContains(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [subnet, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isIP(ip) !== 4 || isIP(subnet) !== 4 || !Number.isFinite(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const ipNum = ipToNum(ip);
  const subNum = ipToNum(subnet);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (subNum & mask);
}

function ipToNum(ip: string): number {
  return ip
    .split('.')
    .map((n) => parseInt(n, 10))
    .reduce((acc, o) => ((acc << 8) | o) >>> 0, 0);
}

// expose for tests
export { detectClientIp, cidrContains, ipIsPrivate };
