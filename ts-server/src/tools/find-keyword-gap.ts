import { z } from 'zod';
import { textContent, normalizeUrl } from '../mcp-helpers.js';

export const FindKeywordGapInput = z.object({
  url: z.string().min(1),
  competitors: z.array(z.string()).max(5).optional(),
});

export async function findKeywordGap(args: z.infer<typeof FindKeywordGapInput>) {
  const url = normalizeUrl(args.url);
  const comps = (args.competitors ?? []).map((c) => c.trim()).filter(Boolean);

  if (comps.length === 0) {
    return textContent(
      `KEYWORD-GAP ANALYSIS — methodology\n\n` +
        `No competitor URLs provided yet. Ask the user for 1-5 competitor sites and re-run.\n\n` +
        `Suggested prompt to the user:\n` +
        `  "Which 3 sites do you suspect are stealing your keywords or showing up in queries you should own? Drop the URLs."\n\n` +
        `Once we have competitor URLs, the tool returns the per-step gap analysis methodology and the agent walks the user through it.\n`,
    );
  }

  let out = `KEYWORD-GAP ANALYSIS — ${url} vs ${comps.length} competitor(s)\n\n`;
  out += `Competitors:\n`;
  for (const c of comps) out += `  - ${normalizeUrl(c)}\n`;
  out += `\n`;
  out += `Methodology (the agent walks the user through this):\n\n`;
  out += `1. Pull the top 20 ranking pages for each domain (you can use the user's GSC if they have a paid Ranki.io key — call list_rank_tracking).\n`;
  out += `2. For each competitor, extract the queries they rank top-10 for that the user does NOT rank for.\n`;
  out += `3. Group by intent (informational / commercial / transactional).\n`;
  out += `4. Score each gap on:\n`;
  out += `   • Search volume estimate (use the GSC impressions data if available).\n`;
  out += `   • Topical fit with the user's product (does the user CARE about ranking for this?).\n`;
  out += `   • Difficulty (how many competitors already rank for it, how authoritative they are).\n`;
  out += `5. Return the top 10 gaps in a Markdown table: query, intent, competitor that owns it, your current position (or "not ranking"), priority score (1-5).\n`;
  out += `6. Offer to outline the top 3 articles to close the gap.\n\n`;
  out += `Without third-party SEO API data, the agent should be transparent: "Volume estimates are heuristic — confirm with GSC or a keyword tool before committing to a full content plan."\n`;
  return textContent(out);
}
