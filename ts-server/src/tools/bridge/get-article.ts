import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const GetArticleInput = z.object({
  article_id: z.string().min(1, 'article_id is required (nano_id, e.g. LISQJJOGF)'),
});

interface ArticleResponse {
  data?: {
    id?: string;
    project_id?: string;
    title?: string;
    slug?: string;
    status?: string;
    language?: string;
    focus_keyword?: string[];
    word_count?: number;
    seo_score?: number | null;
    toc?: Array<{ level: number; text: string }>;
    images?: string[];
    content_html?: string;
    published_at?: string | null;
    updated_at?: string | null;
  };
}

export async function getArticle(args: z.infer<typeof GetArticleInput>, apiKey: string) {
  const r = await rankiApiCall<ArticleResponse>(
    `/api/v1/articles/${encodeURIComponent(args.article_id)}`,
    apiKey,
  );
  const a = r.data;
  if (!a) return textContent(`No article returned for id ${args.article_id}.`);

  const seo = a.seo_score !== null && a.seo_score !== undefined ? String(a.seo_score) : '—';
  const kws = a.focus_keyword && a.focus_keyword.length ? a.focus_keyword.join(', ') : '(none)';

  let out = `ARTICLE — ${a.id}\n${'='.repeat(72)}\n`;
  out += `Title:    ${a.title ?? '(untitled)'}\n`;
  out += `Slug:     ${a.slug ?? '(none)'}\n`;
  out += `Status:   ${a.status ?? '?'} · Lang: ${a.language ?? '?'} · Words: ${a.word_count ?? 0} · SEO: ${seo}\n`;
  out += `Project:  ${a.project_id ?? '?'}\n`;
  if (a.published_at) out += `Published: ${a.published_at}\n`;
  out += `Keywords: ${kws}\n\n`;

  if (a.toc && a.toc.length) {
    out += `TABLE OF CONTENTS\n`;
    for (const h of a.toc) {
      out += `${'  '.repeat(Math.max(0, h.level - 2))}- ${h.text}\n`;
    }
    out += '\n';
  }

  if (a.images && a.images.length) {
    out += `IMAGES (${a.images.length})\n`;
    for (const u of a.images.slice(0, 20)) out += `  ${u}\n`;
    if (a.images.length > 20) out += `  … and ${a.images.length - 20} more\n`;
    out += '\n';
  }

  out += `CONTENT (HTML — ${(a.content_html ?? '').length} chars)\n`;
  out += '-'.repeat(72) + '\n';
  out += (a.content_html ?? '(empty)') + '\n';
  return textContent(out);
}
