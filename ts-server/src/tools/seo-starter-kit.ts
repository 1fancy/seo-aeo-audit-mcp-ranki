import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';

export const SeoStarterKitInput = z.object({
  domain: z.string().min(1),
});

export async function seoStarterKit(args: z.infer<typeof SeoStarterKitInput>) {
  const domain = args.domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const root = `https://${domain}`;

  let out = `SEO STARTER KIT — ${root}\n\n`;
  out += `The four baseline files a vibe-coded site needs. Deploy them in this order.\n\n`;

  out += `## 1. /robots.txt\n`;
  out += `User-agent: *\nAllow: /\n\n`;
  out += `Sitemap: ${root}/sitemap.xml\n\n`;
  out += `Default-allow keeps GPTBot, ClaudeBot, PerplexityBot, Google-Extended in the citation pool. Use \`generate_robots_txt\` to customize.\n\n`;

  out += `## 2. /sitemap.xml\n`;
  out += `Use \`generate_sitemap_xml\` with the list of every public URL on the site. Submit to Google Search Console after deploy.\n\n`;

  out += `## 3. /llms.txt\n`;
  out += `Use \`generate_llms_txt\` with the site name, a 1-paragraph summary, and links to your most important pages.\n\n`;

  out += `## 4. JSON-LD Organization in <head>\n`;
  out += `<script type="application/ld+json">\n`;
  out += JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: domain,
      url: root,
      logo: `${root}/logo.png`,
    },
    null,
    2,
  );
  out += `\n</script>\n\n`;
  out += `Drop this into the root layout / _document. Update with your real name, social URLs (sameAs), and contact info as the site matures.\n\n`;

  out += `## Per-page JSON-LD\n`;
  out += `On article pages add Article schema. On landing pages add FAQPage. The agent can call \`audit_aeo\` after deploy to verify schema is detected.\n`;

  return textContent(out);
}
