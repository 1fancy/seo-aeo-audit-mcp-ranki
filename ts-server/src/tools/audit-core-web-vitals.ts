import { z } from 'zod';
import { textContent, normalizeUrl } from '../mcp-helpers.js';

export const AuditCwvInput = z.object({
  url: z.string().min(1, 'url is required'),
  strategy: z.enum(['mobile', 'desktop']).optional().default('mobile'),
});

type Rating = 'good' | 'needs-improvement' | 'poor' | 'unknown';

function rate(value: number | undefined, thresholds: [number, number]): Rating {
  if (value === undefined) return 'unknown';
  if (value <= thresholds[0]) return 'good';
  if (value <= thresholds[1]) return 'needs-improvement';
  return 'poor';
}

export async function auditCoreWebVitals(args: z.infer<typeof AuditCwvInput>) {
  const url = normalizeUrl(args.url);
  const strategy = args.strategy;
  const key = process.env.GOOGLE_PSI_API_KEY ?? '';

  const params = new URLSearchParams({ url, strategy, category: 'PERFORMANCE' });
  if (key) params.set('key', key);

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 60_000);
    res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RankiMCP-TS/0.1' },
    });
    clearTimeout(t);
  } catch (e) {
    return textContent(`Couldn't fetch Core Web Vitals: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (res.status === 429) {
    return textContent(
      `PageSpeed Insights rate-limited the request (HTTP 429). Try again in 60 seconds, or set GOOGLE_PSI_API_KEY (free Google Cloud key) to lift the cap to 25,000 calls/day.`,
    );
  }
  if (!res.ok) {
    return textContent(
      `Couldn't fetch Core Web Vitals for ${url} (HTTP ${res.status}). The URL must be public and reachable from the open internet.`,
    );
  }

  const data = (await res.json()) as { lighthouseResult?: { audits?: Record<string, { numericValue?: number; displayValue?: string; details?: { items?: Array<{ url?: string; items?: Array<{ url?: string; node?: { snippet?: string } }> }> } }> } };
  const audits = data.lighthouseResult?.audits ?? {};

  const lcpNum = audits['largest-contentful-paint']?.numericValue;
  const clsNum = audits['cumulative-layout-shift']?.numericValue;
  const inpNum =
    audits['interaction-to-next-paint']?.numericValue ??
    audits['experimental-interaction-to-next-paint']?.numericValue;
  const lcpDisp = audits['largest-contentful-paint']?.displayValue ?? 'n/a';
  const clsDisp = audits['cumulative-layout-shift']?.displayValue ?? 'n/a';
  const inpDisp =
    audits['interaction-to-next-paint']?.displayValue ??
    audits['experimental-interaction-to-next-paint']?.displayValue ??
    'n/a';

  const lcpRate = rate(lcpNum, [2500, 4000]);
  const clsRate = rate(clsNum, [0.1, 0.25]);
  const inpRate = rate(inpNum, [200, 500]);

  let lcpElement = '';
  let lcpUrl = '';
  const lcpDetails = audits['largest-contentful-paint-element']?.details?.items ?? [];
  for (const it of lcpDetails) {
    for (const sub of it.items ?? []) {
      if (sub.url && !lcpUrl) lcpUrl = sub.url;
      if (sub.node?.snippet && !lcpElement) lcpElement = sub.node.snippet;
    }
  }

  let out = `CORE WEB VITALS — ${url}\nStrategy: ${strategy}\n\n`;

  out += `LCP — Largest Contentful Paint: ${lcpDisp} (${lcpRate})\n`;
  if (lcpElement) out += `  Largest element: ${lcpElement.slice(0, 200)}\n`;
  if (lcpUrl) out += `  Resource URL:    ${lcpUrl}\n`;
  out += lcpFix(lcpRate, lcpUrl) + '\n';

  out += `CLS — Cumulative Layout Shift: ${clsDisp} (${clsRate})\n`;
  out += clsFix(clsRate) + '\n';

  out += `INP — Interaction to Next Paint: ${inpDisp} (${inpRate})\n`;
  out += inpFix(inpRate) + '\n';

  out += `Once changes ship, re-run \`audit_core_web_vitals\` to confirm metrics moved. Google rewards green CWV in mobile rankings.\n`;
  return textContent(out);
}

function lcpFix(r: Rating, lcpUrl: string): string {
  if (r === 'good') return "  Status: passing Google's threshold (<2.5s). Don't regress.\n";
  if (r === 'unknown') return '  (LCP not measured.)\n';
  const preload = `<link rel="preload" as="image" href="${lcpUrl || '...'}" fetchpriority="high">`;
  if (r === 'needs-improvement') {
    return `  Fix recipes:
    1. Preload the LCP image: ${preload}
    2. Convert the LCP image to WebP / AVIF (call \`optimize_images\`).
    3. Move the LCP element above the fold in the markup.
    4. Inline critical CSS for the LCP element.
`;
  }
  return `  Fix recipes (poor — fix urgently):
    1. Optimize the LCP resource itself — call \`optimize_images\` if it's an image, defer/split if it's JS-injected content.
    2. Preload it: ${preload}
    3. Check TTFB — if your server response > 800ms, the rest of the budget is gone before LCP can paint.
    4. Remove render-blocking CSS / JS in the <head> (defer non-critical).
`;
}

function clsFix(r: Rating): string {
  if (r === 'good') return "  Status: passing Google's threshold (<0.1).\n";
  if (r === 'unknown') return '  (CLS not measured.)\n';
  return `  Fix recipes:
    1. Add explicit width and height attributes to every <img> tag.
    2. Reserve space for ads / iframes (use min-height or aspect-ratio).
    3. Avoid inserting content above existing content (e.g., late-loading banners).
    4. Preload web fonts and use font-display: optional to avoid layout shift when fonts swap.
    5. For carousels / sliders, set a fixed height container before the JS hydrates.
`;
}

function inpFix(r: Rating): string {
  if (r === 'good') return "  Status: passing Google's threshold (<200ms).\n";
  if (r === 'unknown')
    return '  (INP not measured — needs real user interaction. Try a desktop strategy or open the URL manually first.)\n';
  return `  Fix recipes:
    1. Break long JavaScript tasks (>50ms) into smaller chunks (use setTimeout or scheduler.yield).
    2. Defer third-party scripts (analytics, chat widgets) — they often block the main thread.
    3. Replace heavy event handlers with passive listeners where possible.
    4. Move expensive work off the main thread with Web Workers.
    5. If using React: wrap expensive renders in React.memo / useMemo, avoid re-renders on every keystroke.
`;
}
