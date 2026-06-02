/**
 * Thin client for the Ranki.io REST API at app.ranki.io.
 *
 * Used by the 7 paid bridge tools. The TS server NEVER touches your
 * database — every paid call goes through Laravel's ApiKeyAuth
 * middleware and is scoped to the calling user's data by the existing
 * `where('owner_id', auth()->id())` guards on every controller.
 *
 * Override the upstream with RANKI_API_BASE for self-hosted Ranki.io
 * deployments. Default is the hosted SaaS.
 */

const DEFAULT_BASE = 'https://app.ranki.io';
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'RankiMCP-TS/0.1';

export function rankiApiBase(): string {
  return process.env.RANKI_API_BASE ?? DEFAULT_BASE;
}

export class RankiApiError extends Error {
  constructor(public readonly userMessage: string, public readonly status: number) {
    super(userMessage);
    this.name = 'RankiApiError';
  }
}

/**
 * Call any /api/v1/* endpoint with the user's API key. Returns parsed
 * JSON on 2xx; throws RankiApiError with a friendly message otherwise.
 * Error messages are matched 1:1 to lib/registry.php's rk_mcp_api_call
 * so users get the same guidance regardless of language.
 */
export async function rankiApiCall<T = unknown>(
  endpoint: string,
  apiKey: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  if (!apiKey) {
    throw new RankiApiError(
      `This tool reads your private Ranki.io data, so it needs your API key.

Generate one in 30 seconds at: https://app.ranki.io/developer
Then set it in your MCP client config:
  • stdio (Claude Desktop / Code): env.RANKI_API_KEY = "rk_live_..."
  • HTTP (Cursor / Windsurf):       headers.X-API-Key = "rk_live_..."`,
      401,
    );
  }

  const url = rankiApiBase() + endpoint;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (controller.signal.aborted) {
      throw new RankiApiError(
        `Request to app.ranki.io timed out after ${REQUEST_TIMEOUT_MS}ms. Try again in a moment — this is usually transient.`,
        0,
      );
    }
    throw new RankiApiError(
      `Couldn't reach app.ranki.io (network error: ${msg}). Try again in a moment — this is usually transient.`,
      0,
    );
  }
  clearTimeout(timer);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 401) {
    const reason = (body as { error?: string } | null)?.error ?? '';
    if (reason === 'missing_api_key') {
      throw new RankiApiError(
        `Your MCP client didn't send the API key header.

Double-check the config — stdio clients use env.RANKI_API_KEY, HTTP clients use headers.X-API-Key.
Then restart the client (some IDEs need a full reload before MCP env changes take effect).`,
        401,
      );
    }
    throw new RankiApiError(
      `Your Ranki.io API key isn't valid (it may have been regenerated or revoked).

1. Open https://app.ranki.io/developer and click Reveal to copy the current key.
2. Paste it into your MCP client config.
3. Restart the client and retry.

If you generated a new key, the previous one stopped working the moment you did.`,
      401,
    );
  }

  if (response.status === 429) {
    const retry = (body as { retry_after?: number } | null)?.retry_after;
    throw new RankiApiError(
      `Rate limited by app.ranki.io (60 requests per minute per key)${
        retry ? `. Retry in ${retry}s.` : '. Slow down by a few seconds and retry.'
      }`,
      429,
    );
  }

  if (!response.ok) {
    const msg =
      (body as { message?: string } | null)?.message ??
      `app.ranki.io returned HTTP ${response.status}`;
    throw new RankiApiError(msg, response.status);
  }

  if (body === null) {
    throw new RankiApiError(
      `Unexpected response from app.ranki.io (HTTP ${response.status}). If this keeps happening, ping support@ranki.io.`,
      response.status,
    );
  }

  return body as T;
}
