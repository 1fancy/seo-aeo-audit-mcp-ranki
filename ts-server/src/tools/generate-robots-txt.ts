import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';

export const GenerateRobotsTxtInput = z.object({
  sitemap_url: z.string().min(1),
  allow_ai: z.boolean().optional().default(true),
  disallow_paths: z.array(z.string()).optional().default([]),
});

const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Cohere-AI',
  'CCBot',
];

export async function generateRobotsTxt(args: z.infer<typeof GenerateRobotsTxtInput>) {
  const lines: string[] = [];
  lines.push('User-agent: *');
  lines.push('Allow: /');
  for (const p of args.disallow_paths) {
    const path = p.startsWith('/') ? p : '/' + p;
    lines.push(`Disallow: ${path}`);
  }
  lines.push('');

  if (args.allow_ai) {
    lines.push('# AI crawlers — explicitly allowed (default in 2026)');
    for (const bot of AI_BOTS) {
      lines.push(`User-agent: ${bot}`);
      lines.push('Allow: /');
      for (const p of args.disallow_paths) {
        const path = p.startsWith('/') ? p : '/' + p;
        lines.push(`Disallow: ${path}`);
      }
      lines.push('');
    }
  } else {
    lines.push('# AI crawlers — blocked by request');
    for (const bot of AI_BOTS) {
      lines.push(`User-agent: ${bot}`);
      lines.push('Disallow: /');
      lines.push('');
    }
  }

  lines.push(`Sitemap: ${args.sitemap_url}`);

  let out = `Deploy this as /robots.txt at your site root:\n\n`;
  out += lines.join('\n');
  if (!args.allow_ai) {
    out += `\n\nNote: blocking AI crawlers removes you from ChatGPT, Claude and Perplexity citation pools. Consider whether the lost traffic is worth the lost training-data exposure.`;
  }
  return textContent(out);
}
