import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';

export const GenerateSitemapXmlInput = z.object({
  urls: z.array(z.string().min(1)).min(1).max(50000),
  changefreq: z
    .enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])
    .optional()
    .default('weekly'),
});

export async function generateSitemapXml(args: z.infer<typeof GenerateSitemapXmlInput>) {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const url of args.urls) {
    const u = escapeXml(url.trim());
    if (!u) continue;
    lines.push('  <url>');
    lines.push(`    <loc>${u}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    lines.push(`    <changefreq>${args.changefreq}</changefreq>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');

  let out = `Deploy this as /sitemap.xml at your site root (${args.urls.length} URLs):\n\n`;
  out += lines.join('\n');
  out += `\n\nAfter deploy, submit it in Google Search Console:\n`;
  out += `  https://search.google.com/search-console/sitemaps\n`;
  out += `Also add this line to robots.txt:\n  Sitemap: https://<your-domain>/sitemap.xml\n`;
  return textContent(out);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
