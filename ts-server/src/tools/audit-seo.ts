import { z } from 'zod';
import { safeFetchUrl } from '../ssrf-guard.js';
import {
  textContent,
  normalizeUrl,
  extractTitle,
  extractMeta,
  countMatches,
} from '../mcp-helpers.js';

export const AuditSeoInput = z.object({
  url: z.string().min(1, 'url is required'),
});

export async function auditSeo(args: z.infer<typeof AuditSeoInput>) {
  const url = normalizeUrl(args.url);
  const { html, status, finalUrl } = await safeFetchUrl(url);
  if (status >= 400) {
    return textContent(`Could not fetch ${url} (HTTP ${status}).`);
  }

  const checks: Array<{ name: string; pass: boolean; fix: string }> = [];

  // 1. Title length
  const title = extractTitle(html);
  const titleLen = [...title].length;
  checks.push({
    name: `Title length (30-70 chars; current: ${titleLen})`,
    pass: titleLen >= 30 && titleLen <= 70,
    fix:
      titleLen < 30
        ? 'Title is too short — Google may rewrite it. Aim for 50-65 chars including primary keyword.'
        : titleLen > 70
          ? 'Title is too long — Google will truncate in SERPs. Trim to 50-65 chars.'
          : 'Looking good.',
  });

  // 2. Meta description
  const desc = extractMeta(html, 'description');
  const descLen = [...desc].length;
  checks.push({
    name: `Meta description (80-160 chars; current: ${descLen})`,
    pass: descLen >= 80 && descLen <= 160,
    fix:
      descLen === 0
        ? 'No meta description tag. Add `<meta name="description" content="...">` to <head>.'
        : descLen < 80
          ? 'Description is too short. Aim for 140-160 chars.'
          : descLen > 160
            ? 'Description is too long; Google truncates ~160 chars.'
            : 'Looking good.',
  });

  // 3. Exactly one H1
  const h1Count = countMatches(html, /<h1[^>]*>/gi);
  checks.push({
    name: `Exactly one <h1> (current: ${h1Count})`,
    pass: h1Count === 1,
    fix:
      h1Count === 0
        ? 'No H1 on page. Add one matching the page intent.'
        : 'Multiple H1s. Pick the main one; convert the rest to H2/H3.',
  });

  // 4. Canonical
  const hasCanonical = /<link[^>]+rel\s*=\s*["']canonical["']/i.test(html);
  checks.push({
    name: 'Canonical link',
    pass: hasCanonical,
    fix: hasCanonical
      ? ''
      : 'Add `<link rel="canonical" href="<absolute URL>">` so Google knows the preferred version.',
  });

  // 5. Viewport
  const hasViewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
  checks.push({
    name: 'Viewport meta tag',
    pass: hasViewport,
    fix: hasViewport
      ? ''
      : 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` — mobile-first indexing requires it.',
  });

  // 6. HTTPS
  const isHttps = finalUrl.startsWith('https://');
  checks.push({
    name: 'HTTPS',
    pass: isHttps,
    fix: isHttps ? '' : 'Serve over HTTPS. HTTP is a hard SEO penalty in 2026.',
  });

  // 7. Open Graph completeness
  const ogTitle = extractMeta(html, 'og:title');
  const ogDesc = extractMeta(html, 'og:description');
  const ogImage = extractMeta(html, 'og:image');
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    name: `Open Graph (og:title, og:description, og:image; current: ${ogCount}/3)`,
    pass: ogCount === 3,
    fix:
      ogCount === 3
        ? ''
        : 'Add the missing og: tags. They power social-share previews and feed AEO context.',
  });

  // 8. Image alt coverage
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((t) => /\balt\s*=\s*["'][^"']/i.test(t)).length;
  const altCoverage = imgs.length === 0 ? 1 : imgsWithAlt / imgs.length;
  checks.push({
    name: `Image alt coverage (${imgsWithAlt}/${imgs.length})`,
    pass: altCoverage >= 0.9,
    fix:
      imgs.length === 0
        ? 'No images detected.'
        : altCoverage < 0.9
          ? 'Add descriptive alt text to every <img>. Accessibility + AEO both rely on it.'
          : '',
  });

  // 9. Internal links
  let host = '';
  try {
    host = new URL(finalUrl).host;
  } catch {
    /* ignore */
  }
  const anchors = html.match(/<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi) || [];
  let internal = 0;
  for (const a of anchors) {
    const m = /href\s*=\s*["']([^"']+)["']/i.exec(a);
    if (!m) continue;
    const href = m[1];
    if (href.startsWith('/') || (host && href.includes(host))) internal++;
  }
  checks.push({
    name: `Internal links (current: ${internal})`,
    pass: internal >= 3,
    fix:
      internal < 3
        ? 'Add at least 3 internal links to related pages. Helps Google crawl + distributes authority.'
        : '',
  });

  // 10. Any JSON-LD
  const hasJsonLd = /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html);
  checks.push({
    name: 'JSON-LD structured data present',
    pass: hasJsonLd,
    fix: hasJsonLd
      ? ''
      : 'Add at least one JSON-LD block (Organization, Article, or FAQPage). Big AEO + SEO win.',
  });

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);

  let out = `SEO Audit for ${url}\nScore: ${score}/100 (${passed}/${checks.length} checks passed)\n\n`;
  for (const c of checks) {
    out += `${c.pass ? '✓' : '✗'} ${c.name}\n`;
    if (!c.pass && c.fix) out += `   Fix: ${c.fix}\n`;
  }
  return textContent(out);
}
