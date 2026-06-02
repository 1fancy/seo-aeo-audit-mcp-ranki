import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';

export const ExplainSeoTermsInput = z.object({
  category: z
    .enum(['all', 'basics', 'aeo', 'technical', 'analytics', 'penalty'])
    .optional()
    .default('all'),
});

type Category = 'basics' | 'aeo' | 'technical' | 'analytics' | 'penalty';

const GLOSSARY: Record<Category, Array<{ term: string; def: string }>> = {
  basics: [
    { term: 'SEO', def: 'Search Engine Optimization — making your site appear in Google/Bing/DuckDuckGo organic results.' },
    { term: 'SERP', def: 'Search Engine Results Page. The page Google returns when you search.' },
    { term: 'Keyword', def: 'The exact phrase a user types into a search engine.' },
    { term: 'Search intent', def: 'What the user wants: informational, commercial, transactional, or navigational.' },
    { term: 'CTR', def: 'Click-Through Rate — % of people who click your result after seeing it in SERPs.' },
    { term: 'Impressions', def: 'How many times your page appeared in any SERP. From Google Search Console.' },
    { term: 'Canonical', def: 'The "preferred" URL when the same content lives at multiple paths. Set with `<link rel="canonical">`.' },
    { term: 'Internal link', def: 'A link from one page on your site to another page on your site. Distributes authority + helps Google crawl.' },
    { term: 'Backlink', def: 'A link from another site to yours. Quality > quantity in 2026 — one editorial link from a strong site beats 100 directory links.' },
    { term: 'H1', def: 'The page\'s main heading. Should be unique per page, match the page intent, contain the primary keyword.' },
  ],
  aeo: [
    { term: 'AEO', def: 'Answer Engine Optimization — making your site appear in ChatGPT, Claude, Perplexity, and Google AI Overview answers.' },
    { term: 'GEO', def: 'Generative Engine Optimization — synonym for AEO, focused on generative AI answers specifically.' },
    { term: 'FAQPage schema', def: 'A JSON-LD structured-data block listing 5-8 question/answer pairs. Highest-impact AEO signal in 2026.' },
    { term: 'llms.txt', def: 'A root-level Markdown file (yourdomain.com/llms.txt) that gives AI crawlers a curated index of your most important pages.' },
    { term: 'Definitional intro', def: 'The first <p> after each H2 — 30-90 words that directly answers the heading. AI engines quote this verbatim.' },
    { term: 'Answer-style heading', def: 'An H2/H3 phrased as the literal question a user types. "What is X?" "How does X work?" — not "Everything about X".' },
    { term: 'GPTBot', def: 'OpenAI\'s crawler for ChatGPT and GPT model training. Allow it in robots.txt to be cited.' },
    { term: 'ClaudeBot', def: 'Anthropic\'s crawler for Claude model training. Allow it in robots.txt.' },
    { term: 'PerplexityBot', def: 'Perplexity\'s crawler. Allow it in robots.txt or you won\'t appear in Perplexity citations.' },
    { term: 'Google-Extended', def: 'Opt-in/out signal for Google\'s Bard / Gemini / AI Overviews use of your content.' },
  ],
  technical: [
    { term: 'JSON-LD', def: 'JavaScript Object Notation for Linked Data. The structured-data format Google and AI engines parse first.' },
    { term: 'schema.org', def: 'The vocabulary of structured-data types (Article, Product, FAQPage, Organization, etc.).' },
    { term: 'robots.txt', def: 'A root-level text file that tells crawlers which paths they can/can\'t access.' },
    { term: 'sitemap.xml', def: 'An XML file listing every public URL on your site. Submit to Google Search Console after deploy.' },
    { term: 'Core Web Vitals', def: 'Three performance metrics Google uses as ranking signals: LCP, CLS, INP.' },
    { term: 'LCP', def: 'Largest Contentful Paint. Time until the biggest visible element renders. Target: under 2.5s.' },
    { term: 'CLS', def: 'Cumulative Layout Shift. How much content jumps around as the page loads. Target: under 0.1.' },
    { term: 'INP', def: 'Interaction to Next Paint. Lag between user input and visual response. Target: under 200ms.' },
    { term: 'hreflang', def: 'A `<link rel="alternate" hreflang="...">` tag that tells Google about translated versions of a page.' },
    { term: 'noindex', def: '`<meta name="robots" content="noindex">` — tells search engines not to include this page in their index.' },
    { term: 'rel="nofollow"', def: 'A link attribute that says "don\'t pass authority through this link". Used on paid links, untrusted UGC, etc.' },
    { term: 'rel="canonical"', def: 'Tells search engines the preferred URL when the same content lives at multiple paths.' },
    { term: 'Open Graph', def: 'A set of `<meta property="og:...">` tags that control how your page previews on social shares.' },
  ],
  analytics: [
    { term: 'GSC', def: 'Google Search Console. Free Google tool showing your impressions, clicks, position, and indexing status.' },
    { term: 'GA4', def: 'Google Analytics 4. Successor to Universal Analytics; tracks user behavior on your site.' },
    { term: 'Position', def: 'Your page\'s rank for a query in Google SERPs (1 = top). From GSC.' },
    { term: 'AI visibility', def: 'How often your tracked topics appear in ChatGPT / Claude / Perplexity / Google AI Overview SERPs.' },
    { term: 'Rank tracking', def: 'Monitoring your position for target queries over time to spot wins and regressions.' },
  ],
  penalty: [
    { term: 'Helpful Content Update', def: 'A 2022-onward Google ranking signal that demotes pages written for search engines, not humans. Site-wide effect.' },
    { term: 'Doorway pages', def: 'Multiple low-quality pages targeting close keyword variants. Penalized.' },
    { term: 'Keyword stuffing', def: 'Cramming the same keyword unnaturally many times into a page. Penalized since the 2010s.' },
    { term: 'Cloaking', def: 'Showing different content to Google than to users. Manual-action penalty.' },
    { term: 'E-E-A-T', def: 'Experience, Expertise, Authoritativeness, Trustworthiness. Google\'s human-rater criteria. Affects YMYL pages most.' },
  ],
};

export async function explainSeoTerms(args: z.infer<typeof ExplainSeoTermsInput>) {
  const cat = args.category;
  const cats: Category[] = cat === 'all' ? ['basics', 'aeo', 'technical', 'analytics', 'penalty'] : [cat];

  let out = `SEO + AEO GLOSSARY${cat === 'all' ? '' : ` — ${cat.toUpperCase()}`}\n\n`;
  for (const c of cats) {
    out += `## ${c.toUpperCase()}\n\n`;
    for (const { term, def } of GLOSSARY[c]) {
      out += `**${term}** — ${def}\n\n`;
    }
  }
  return textContent(out);
}
