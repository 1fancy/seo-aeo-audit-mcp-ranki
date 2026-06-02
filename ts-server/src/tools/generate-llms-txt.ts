import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';

export const GenerateLlmsTxtInput = z.object({
  site_name: z.string().min(1),
  summary: z.string().min(1),
  key_pages: z
    .array(
      z.object({
        url: z.string().min(1),
        title: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export async function generateLlmsTxt(args: z.infer<typeof GenerateLlmsTxtInput>) {
  const lines: string[] = [];
  lines.push(`# ${args.site_name}`);
  lines.push('');
  lines.push(`> ${args.summary.trim()}`);
  lines.push('');
  if (args.key_pages.length) {
    lines.push('## Key pages');
    lines.push('');
    for (const p of args.key_pages) {
      const t = (p.title ?? '').trim() || p.url;
      lines.push(`- [${t}](${p.url})`);
    }
    lines.push('');
  }
  lines.push('## Optional');
  lines.push('');
  lines.push('- Crawlers welcome: GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Cohere-AI');
  lines.push('');

  let out = `Deploy this as /llms.txt at your site root:\n\n`;
  out += lines.join('\n');
  out += `\n\nllms.txt is read by Anthropic, Mistral, Cohere and a growing list of AI crawlers as a curated, machine-friendly index of your site. Domains that publish one are cited measurably more often.\n`;
  return textContent(out);
}
