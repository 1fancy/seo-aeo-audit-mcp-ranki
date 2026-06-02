import { z } from 'zod';
import { safeFetchUrl } from '../ssrf-guard.js';
import { textContent, normalizeUrl } from '../mcp-helpers.js';

export const AuditHiddenPagesInput = z.object({
  urls: z.array(z.string()).max(200).optional(),
  domain: z.string().optional(),
});

type Classification = 'robots-disallow' | 'noindex' | 'keep' | 'unsure';

interface Row {
  url: string;
  classification: Classification;
  reason: string;
}

const PATTERNS: Array<{ classification: Classification; re: RegExp; reason: string }> = [
  { classification: 'robots-disallow', re: /\/(?:admin|administrator|wp-admin|dashboard|console|backoffice)(?:\/|$)/i, reason: 'admin / dashboard surface' },
  { classification: 'robots-disallow', re: /\/(?:api|graphql|rpc)(?:\/|$)/i, reason: 'API endpoint' },
  { classification: 'robots-disallow', re: /\/(?:draft|drafts|preview|staging)(?:\/|$)/i, reason: 'draft / preview / staging' },
  { classification: 'robots-disallow', re: /\/_(?:next|nuxt|astro)\//i, reason: 'framework build artifact' },
  { classification: 'noindex', re: /\/(?:login|signin|signup|register|logout|auth)(?:\/|$)/i, reason: 'auth flow' },
  { classification: 'noindex', re: /\/(?:account|settings|profile|billing|subscription)(?:\/|$)/i, reason: 'logged-in user surface' },
  { classification: 'noindex', re: /\/(?:checkout|cart|order|payment|invoice)(?:\/|$)/i, reason: 'checkout / commerce flow' },
  { classification: 'noindex', re: /\/(?:thank-you|thanks|success|confirmation)(?:\/|$)/i, reason: 'thank-you / confirmation page' },
  { classification: 'noindex', re: /\/(?:404|500|error)(?:\/|$)/i, reason: 'error page' },
  { classification: 'noindex', re: /\/search(?:\/|\?|$)/i, reason: 'on-site search results' },
  { classification: 'noindex', re: /\?(?:page|p)=([4-9]|\d{2,})\b/i, reason: 'pagination past page 3' },
];

export async function auditHiddenPages(args: z.infer<typeof AuditHiddenPagesInput>) {
  let urls: string[] = (args.urls ?? []).map((u) => u.trim()).filter(Boolean);

  if (args.domain) {
    const domain = normalizeUrl(args.domain);
    try {
      const sitemap = await safeFetchUrl(domain.replace(/\/$/, '') + '/sitemap.xml', { timeoutMs: 6_000 });
      if (sitemap.status >= 200 && sitemap.status < 300) {
        const locs = sitemap.html.match(/<loc>([^<]+)<\/loc>/gi) || [];
        for (const l of locs.slice(0, 100)) {
          const m = /<loc>([^<]+)<\/loc>/i.exec(l);
          if (m) urls.push(m[1].trim());
        }
      }
    } catch {
      /* ignore — sitemap may not exist */
    }
    try {
      const home = await safeFetchUrl(domain, { timeoutMs: 6_000 });
      if (home.status >= 200 && home.status < 300) {
        const re = /<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi;
        let m: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((m = re.exec(home.html)) !== null) {
          const href = m[1];
          let abs: string;
          try {
            abs = new URL(href, domain).toString();
          } catch {
            continue;
          }
          if (seen.has(abs)) continue;
          seen.add(abs);
          urls.push(abs);
          if (seen.size > 100) break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Dedup + cap at 200
  urls = Array.from(new Set(urls)).slice(0, 200);
  if (urls.length === 0) {
    return textContent('No URLs provided (and no sitemap.xml could be parsed). Pass `urls` or `domain`.');
  }

  const rows: Row[] = urls.map((u) => classify(u));
  const groups: Record<Classification, Row[]> = {
    'robots-disallow': [],
    noindex: [],
    keep: [],
    unsure: [],
  };
  for (const r of rows) groups[r.classification].push(r);

  let out = `HIDDEN-PAGES AUDIT — ${rows.length} URL(s) classified\n\n`;
  out += `Summary\n`;
  out += `  robots_disallow: ${groups['robots-disallow'].length}\n`;
  out += `  noindex:         ${groups.noindex.length}\n`;
  out += `  keep:            ${groups.keep.length}\n`;
  out += `  unsure:          ${groups.unsure.length}\n\n`;

  for (const cls of ['robots-disallow', 'noindex', 'unsure'] as const) {
    if (!groups[cls].length) continue;
    out += `${cls.toUpperCase()}\n`;
    for (const r of groups[cls]) {
      out += `  ${r.url}  — ${r.reason}\n`;
    }
    out += '\n';
  }

  // Ready-to-paste robots.txt block
  const disallowPaths = Array.from(
    new Set(
      groups['robots-disallow']
        .map((r) => {
          try {
            return new URL(r.url).pathname.split('/').slice(0, 3).join('/') || '/';
          } catch {
            return null;
          }
        })
        .filter((p): p is string => !!p && p !== '/'),
    ),
  ).sort();
  if (disallowPaths.length) {
    out += `Add to robots.txt:\n`;
    out += `User-agent: *\n`;
    for (const p of disallowPaths) out += `Disallow: ${p}\n`;
    out += '\n';
  }
  if (groups.noindex.length) {
    out += `Add a <meta name="robots" content="noindex"> tag to each noindex page above.\n`;
    out += `For Next.js: \`export const metadata = { robots: { index: false } }\` in app/.../page.tsx.\n`;
    out += `For Astro:   \`<meta name="robots" content="noindex">\` in the page's <head>.\n\n`;
  }

  return textContent(out);
}

function classify(rawUrl: string): Row {
  let path = rawUrl;
  try {
    const u = new URL(rawUrl);
    path = u.pathname + u.search;
  } catch {
    // not absolute — match against the raw string
  }
  for (const { classification, re, reason } of PATTERNS) {
    if (re.test(path)) return { url: rawUrl, classification, reason };
  }
  return { url: rawUrl, classification: 'keep', reason: 'looks like real content' };
}
