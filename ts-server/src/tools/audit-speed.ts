import { z } from 'zod';
import { textContent, normalizeUrl } from '../mcp-helpers.js';

export const AuditSpeedInput = z.object({
  url: z.string().min(1, 'url is required'),
  strategy: z.enum(['mobile', 'desktop']).optional().default('mobile'),
});

export async function auditSpeed(args: z.infer<typeof AuditSpeedInput>) {
  const url = normalizeUrl(args.url);
  const strategy = args.strategy;
  const key = process.env.GOOGLE_PSI_API_KEY ?? '';

  const params = new URLSearchParams({
    url,
    strategy,
  });
  for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'SEO', 'BEST_PRACTICES']) {
    params.append('category', c);
  }
  if (key) params.set('key', key);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 60_000);
    res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RankiMCP-TS/0.1 (+https://ranki.io/developers/mcp)' },
    });
    clearTimeout(t);
  } catch (e) {
    return textContent(
      `Couldn't reach PageSpeed Insights for ${url}: ${e instanceof Error ? e.message : String(e)}. Try again in a moment.`,
    );
  }

  if (res.status === 429) {
    return textContent(
      `PageSpeed Insights rate-limited the request (HTTP 429). The Ranki MCP is sharing Google's unauthenticated PSI quota — tight cap. Try again in 60 seconds, or set GOOGLE_PSI_API_KEY (free Google Cloud key) to lift the cap to 25,000 calls/day.`,
    );
  }
  if (res.status === 403) {
    return textContent(
      `PageSpeed Insights rejected the request (HTTP 403). The server's GOOGLE_PSI_API_KEY is invalid or out of quota.`,
    );
  }
  if (res.status === 400) {
    return textContent(
      `PageSpeed Insights couldn't analyze ${url} (HTTP 400). Either the URL isn't reachable from the open internet, it requires login, or Lighthouse failed to load the page.`,
    );
  }
  if (!res.ok) {
    return textContent(`PageSpeed Insights returned HTTP ${res.status} for ${url}.`);
  }

  const data = (await res.json()) as PsiResponse;
  const lhr = data.lighthouseResult;
  if (!lhr) return textContent('Unexpected PageSpeed Insights response (no lighthouseResult).');

  const cat = lhr.categories ?? {};
  const audits = lhr.audits ?? {};

  const scoreLine = (c: PsiCategory | undefined, label: string) => {
    if (!c || c.score === null || c.score === undefined) return `  ${label}: n/a`;
    return `  ${label}: ${Math.round(c.score * 100)}/100`;
  };

  const lcp = audits['largest-contentful-paint']?.displayValue ?? 'n/a';
  const cls = audits['cumulative-layout-shift']?.displayValue ?? 'n/a';
  const inp =
    audits['interaction-to-next-paint']?.displayValue ??
    audits['experimental-interaction-to-next-paint']?.displayValue ??
    'n/a';
  const fcp = audits['first-contentful-paint']?.displayValue ?? 'n/a';
  const ttfb = audits['server-response-time']?.displayValue ?? 'n/a';

  const imageIssues: string[] = [];
  for (const id of [
    'uses-optimized-images',
    'modern-image-formats',
    'uses-responsive-images',
    'efficient-animated-content',
    'offscreen-images',
  ]) {
    const a = audits[id];
    if (!a) continue;
    const savingsMs = a.details?.overallSavingsMs ?? 0;
    const savingsBytes = a.details?.overallSavingsBytes ?? 0;
    if (savingsMs < 100 && savingsBytes < 10_240) continue;
    const items = (a.details?.items ?? []).slice(0, 5);
    const lines: string[] = [];
    for (const it of items) {
      if (!it.url) continue;
      const size = it.totalBytes ? ` (${(it.totalBytes / 1024).toFixed(1)} KB)` : '';
      const save = it.wastedBytes ? ` → save ${(it.wastedBytes / 1024).toFixed(1)} KB` : '';
      lines.push(`    - ${it.url}${size}${save}`);
    }
    imageIssues.push(`  · ${a.title} — ${a.description ?? ''}\n${lines.join('\n')}`);
  }

  const blocking: string[] = [];
  for (const id of [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'unminified-css',
    'unminified-javascript',
  ]) {
    const a = audits[id];
    if (!a || (a.score ?? 1) >= 0.9) continue;
    blocking.push(`  · ${a.title} — ${a.displayValue ?? ''}`);
  }

  const seoFails: string[] = [];
  for (const [id, a] of Object.entries(audits)) {
    if (
      a &&
      typeof a.score === 'number' &&
      a.score === 0 &&
      [
        'document-title',
        'meta-description',
        'image-alt',
        'robots-txt',
        'canonical',
        'hreflang',
        'is-crawlable',
        'tap-targets',
        'viewport',
        'http-status-code',
      ].includes(id)
    ) {
      seoFails.push(`  · ${a.title}`);
    }
  }

  let out = `PAGESPEED INSIGHTS — ${url}\nStrategy: ${strategy}\n\n`;
  out += `Lighthouse scores\n`;
  out += `${scoreLine(cat.performance, 'Performance ')}\n`;
  out += `${scoreLine(cat.accessibility, 'Accessibility')}\n`;
  out += `${scoreLine(cat['best-practices'], 'Best Practices')}\n`;
  out += `${scoreLine(cat.seo, 'SEO         ')}\n\n`;

  out += `Core Web Vitals\n`;
  out += `  LCP (Largest Contentful Paint):  ${lcp}\n`;
  out += `  CLS (Cumulative Layout Shift):   ${cls}\n`;
  out += `  INP (Interaction to Next Paint): ${inp}\n`;
  out += `  FCP (First Contentful Paint):    ${fcp}\n`;
  out += `  TTFB (Server response):          ${ttfb}\n\n`;

  if (imageIssues.length) {
    out += `Image opportunities (call \`optimize_images\` next, then convert the files)\n${imageIssues.join('\n')}\n\n`;
  }
  if (blocking.length) {
    out += `JS / CSS issues\n${blocking.join('\n')}\n\n`;
  }
  if (seoFails.length) {
    out += `On-page SEO failures (call \`audit_seo\` for fix recipes)\n${seoFails.join('\n')}\n\n`;
  }

  out += `Next steps for the agent:\n`;
  out += `  1. If image opportunities above, call \`optimize_images\` with the URLs to get target format + dims + alt + <picture> markup, then convert the actual files in the repo with sharp (Node) or cwebp (CLI).\n`;
  out += `  2. If LCP > 2.5s and the largest element is an image, preload it: <link rel="preload" as="image" href="..." fetchpriority="high">.\n`;
  out += `  3. If CLS > 0.1, add explicit width/height attributes to every <img> and reserve space for ads / late-loaded content.\n`;
  out += `  4. If render-blocking JS, defer non-critical scripts (\`<script defer>\` or \`<script async>\`).\n`;
  out += `  5. Re-run \`audit_speed\` after deploy to confirm scores moved.\n`;

  return textContent(out);
}

// ---- PSI response shape (minimal slice we use) -----------------------------

interface PsiCategory {
  score?: number | null;
}

interface PsiAuditItem {
  url?: string;
  totalBytes?: number;
  wastedBytes?: number;
}

interface PsiAudit {
  title: string;
  description?: string;
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
  details?: {
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: PsiAuditItem[];
  };
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, PsiCategory>;
    audits?: Record<string, PsiAudit>;
  };
}
