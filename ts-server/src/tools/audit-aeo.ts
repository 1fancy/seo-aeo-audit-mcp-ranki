import { z } from 'zod';
import { safeFetchUrl } from '../ssrf-guard.js';
import { textContent, normalizeUrl, stripTags } from '../mcp-helpers.js';

export const AuditAeoInput = z.object({
  url: z.string().min(1, 'url is required'),
});

const ANSWER_PREFIXES = [
  /^what\s+(?:is|are|does|do)/i,
  /^how\s+(?:do|does|to|can)/i,
  /^why\s+/i,
  /^when\s+/i,
  /^where\s+/i,
  /^which\s+/i,
  /^who\s+/i,
];

export async function auditAeo(args: z.infer<typeof AuditAeoInput>) {
  const url = normalizeUrl(args.url);
  const { html, status, finalUrl } = await safeFetchUrl(url);
  if (status >= 400) {
    return textContent(`Could not fetch ${url} (HTTP ${status}).`);
  }

  const checks: Array<{ name: string; pass: boolean; fix: string }> = [];

  // Parse JSON-LD blocks
  const jsonLdBlocks: string[] = [];
  const reLd = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = reLd.exec(html)) !== null) jsonLdBlocks.push(m[1]);
  const joinedLd = jsonLdBlocks.join(' ');

  // 1. FAQPage JSON-LD
  const hasFaq = /"@type"\s*:\s*"FAQPage"/i.test(joinedLd);
  checks.push({
    name: 'FAQPage JSON-LD',
    pass: hasFaq,
    fix: hasFaq
      ? ''
      : 'Add a FAQPage JSON-LD block with 5-8 real Q/A pairs at the bottom of the page. Single highest-leverage AEO signal.',
  });

  // 2. Article / BlogPosting JSON-LD
  const hasArticle = /"@type"\s*:\s*"(?:Article|BlogPosting|NewsArticle)"/i.test(joinedLd);
  checks.push({
    name: 'Article / BlogPosting JSON-LD',
    pass: hasArticle,
    fix: hasArticle
      ? ''
      : 'Add Article schema with headline, author (@type Person), datePublished, articleBody. Tells extractors what to quote.',
  });

  // 3. Definitional intro (first <p> under 90 words, starts with "X is/are/does")
  const firstPMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const firstP = firstPMatch ? stripTags(firstPMatch[1]).trim() : '';
  const firstPWords = firstP.split(/\s+/).filter(Boolean).length;
  const looksDefinitional =
    firstPWords > 0 &&
    firstPWords <= 90 &&
    /^(?:[A-Z][A-Za-zÀ-ÿ-]*\s+(?:is|are|means|refers\s+to|stands\s+for|describes|defines)\b)/i.test(
      firstP,
    );
  checks.push({
    name: `Definitional first paragraph (${firstPWords} words)`,
    pass: looksDefinitional,
    fix: looksDefinitional
      ? ''
      : 'Rewrite the first paragraph as 30-90 words that directly define/answer the page topic. ChatGPT, Claude and Perplexity quote this verbatim into their answer.',
  });

  // 4. Author byline
  const hasAuthor =
    /<meta[^>]+name\s*=\s*["']author["']/i.test(html) ||
    /rel\s*=\s*["']author["']/i.test(html) ||
    /itemprop\s*=\s*["']author["']/i.test(html) ||
    /"author"\s*:\s*\{[^}]*"@type"\s*:\s*"Person"/i.test(joinedLd);
  checks.push({
    name: 'Author byline detectable',
    pass: hasAuthor,
    fix: hasAuthor
      ? ''
      : 'Add an author signal — `<meta name="author">` in <head>, or `rel="author"`, or include `author` in your Article JSON-LD.',
  });

  // 5. llms.txt presence at root
  let llmsOk = false;
  try {
    const root = new URL(finalUrl);
    const llmsUrl = `${root.protocol}//${root.host}/llms.txt`;
    const r = await safeFetchUrl(llmsUrl, { timeoutMs: 6_000 });
    llmsOk = r.status >= 200 && r.status < 300 && r.html.trim().length > 0;
  } catch {
    /* keep false */
  }
  checks.push({
    name: 'llms.txt at site root',
    pass: llmsOk,
    fix: llmsOk
      ? ''
      : 'Create /llms.txt — a 5-line Markdown index of your most important pages. Use `generate_llms_txt` to build one.',
  });

  // 6. robots.txt allows AI bots
  let robotsOk = false;
  try {
    const root = new URL(finalUrl);
    const robotsUrl = `${root.protocol}//${root.host}/robots.txt`;
    const r = await safeFetchUrl(robotsUrl, { timeoutMs: 6_000 });
    if (r.status >= 200 && r.status < 300) {
      const body = r.html.toLowerCase();
      // Pass if either no disallow for these bots, OR explicit allow.
      const bots = ['gptbot', 'claudebot', 'perplexitybot', 'google-extended'];
      const explicitlyBlocks = bots.some((b) =>
        new RegExp(`user-agent:\\s*${b}[\\s\\S]*?disallow:\\s*/`, 'i').test(body),
      );
      robotsOk = !explicitlyBlocks;
    } else {
      // No robots.txt → default-allow all bots.
      robotsOk = true;
    }
  } catch {
    /* keep false */
  }
  checks.push({
    name: 'robots.txt allows AI bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended)',
    pass: robotsOk,
    fix: robotsOk
      ? ''
      : 'Edit robots.txt to NOT block GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended. Use `generate_robots_txt` to get a safe template.',
  });

  // 7. Answer-style H2/H3 (≥2 headings phrased as questions)
  const headings: string[] = [];
  const reH = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = reH.exec(html)) !== null) headings.push(stripTags(m[2]).trim());
  const answerStyle = headings.filter((h) =>
    ANSWER_PREFIXES.some((p) => p.test(h)) || h.trimEnd().endsWith('?'),
  ).length;
  checks.push({
    name: `Answer-style H2/H3 headings (current: ${answerStyle})`,
    pass: answerStyle >= 2,
    fix:
      answerStyle >= 2
        ? ''
        : 'Rewrite at least 2 H2/H3 as the literal question a user types (e.g., "How does X work" or "What is X"). ChatGPT extracts these as answer anchors.',
  });

  // 8. Structured table(s)
  const tables = countOccurrences(html, /<table[\s>]/gi);
  checks.push({
    name: `Structured table(s) for comparisons (current: ${tables})`,
    pass: tables >= 1,
    fix:
      tables >= 1
        ? ''
        : 'Add at least one comparison / spec / pricing <table>. AI engines pull tabular data verbatim into AI Overviews.',
  });

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);

  let out = `AEO Audit for ${url}\nScore: ${score}/100 (${passed}/${checks.length} checks passed)\n\n`;
  for (const c of checks) {
    out += `${c.pass ? '✓' : '✗'} ${c.name}\n`;
    if (!c.pass && c.fix) out += `   Fix: ${c.fix}\n`;
  }
  return textContent(out);
}

function countOccurrences(s: string, re: RegExp): number {
  return (s.match(re) || []).length;
}
