import { z } from 'zod';
import { safeFetchUrl } from '../ssrf-guard.js';
import { textContent, normalizeUrl, extractTitle, extractMeta, stripTags } from '../mcp-helpers.js';

export const FindTopicIdeasInput = z.object({
  url: z.string().min(1),
});

export async function findTopicIdeas(args: z.infer<typeof FindTopicIdeasInput>) {
  const url = normalizeUrl(args.url);
  let title = '';
  let desc = '';
  let h1 = '';
  let firstParagraph = '';
  try {
    const r = await safeFetchUrl(url, { timeoutMs: 8_000 });
    if (r.status >= 200 && r.status < 400) {
      title = extractTitle(r.html);
      desc = extractMeta(r.html, 'description') || extractMeta(r.html, 'og:description');
      const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(r.html);
      if (h1m) h1 = stripTags(h1m[1]).trim();
      const pm = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(r.html);
      if (pm) firstParagraph = stripTags(pm[1]).trim();
    }
  } catch {
    /* user may have given a domain we can't fetch — still return the methodology */
  }

  let out = `TOPIC IDEAS BRIEF — for ${url}\n\n`;
  if (title || h1 || desc) {
    out += `Site facts detected\n`;
    if (title) out += `  Title:       ${title}\n`;
    if (h1) out += `  H1:          ${h1}\n`;
    if (desc) out += `  Description: ${desc}\n`;
    if (firstParagraph) out += `  Intro:       ${firstParagraph.slice(0, 200)}…\n`;
    out += `\n`;
  }
  out += `Methodology: generate 15 article topics for this site across 3 search intents.\n\n`;
  out += `1. Informational (5 topics) — "What is X", "How does X work", "Why X matters". Lowest competition,\n`;
  out += `   highest AEO citation potential. Target featured snippets and ChatGPT answers.\n`;
  out += `2. Commercial (5 topics) — "Best X for Y", "X vs Y", "Top 10 X compared". Higher intent traffic,\n`;
  out += `   include comparison tables, pricing, pros/cons. AI Overviews love these.\n`;
  out += `3. Transactional (5 topics) — "How to fix X", "X stopped working", specific error messages. Long-tail,\n`;
  out += `   low competition, highest conversion. Solve the exact problem in the first paragraph.\n\n`;
  out += `Prioritization criteria (pick 3 to write FIRST):\n`;
  out += `  • Search intent matches what the product / site explicitly solves.\n`;
  out += `  • Long-tail (4+ word phrases) over head terms.\n`;
  out += `  • Low SERP competition (no big-domain monopoly on page 1).\n`;
  out += `  • Has FAQ-shaped questions you can answer with a definitional first paragraph.\n\n`;
  out += `Agent task:\n`;
  out += `  1. Generate the 15 topics from the facts above. Phrase each as the literal query a user types.\n`;
  out += `  2. For each, propose a 1-line title + 2-line meta description.\n`;
  out += `  3. Mark the top 3 to write first with reasoning.\n`;
  out += `  4. Offer to draft outlines for the top 3.\n`;
  return textContent(out);
}
