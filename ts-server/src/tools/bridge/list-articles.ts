import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const ListArticlesInput = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  status: z.string().regex(/^[a-z_]+$/i).optional(),
  per_page: z.number().int().min(1).max(100).optional().default(25),
  page: z.number().int().min(1).optional(),
});

interface ArticleRow {
  id: string;
  project_id?: string;
  title?: string;
  status?: string;
  language?: string;
  focus_keyword?: string[];
  toc?: Array<{ level: number; text: string }>;
  word_count?: number;
  seo_score?: number | null;
  published_at?: string | null;
  updated_at?: string | null;
}

interface ListResponse {
  data: ArticleRow[];
  meta?: {
    current_page?: number;
    last_page?: number;
    total?: number;
  };
}

export async function listArticles(args: z.infer<typeof ListArticlesInput>, apiKey: string) {
  const params = new URLSearchParams();
  params.set('per_page', String(args.per_page));
  if (args.page) params.set('page', String(args.page));
  if (args.status) params.set('status', args.status);

  const r = await rankiApiCall<ListResponse>(
    `/api/v1/projects/${encodeURIComponent(args.project_id)}/articles?${params.toString()}`,
    apiKey,
  );
  const rows = r.data ?? [];
  const meta = r.meta ?? {};

  const total = meta.total ?? rows.length;
  const page = meta.current_page ?? 1;
  const lastPage = meta.last_page ?? 1;

  if (total === 0) {
    return textContent(
      `No articles in project ${args.project_id} yet${args.status ? ` with status=${args.status}` : ''}.\n\n` +
        `Generate one at https://app.ranki.io/projects/${args.project_id} or use the Ranki.io content pipeline.`,
    );
  }

  let out = `ARTICLES — project ${args.project_id}\n`;
  out += `Page ${page} of ${lastPage} · ${total} articles total\n`;
  if (args.status) out += `Filter: status=${args.status}\n`;
  out += '-'.repeat(72) + '\n\n';

  for (const a of rows) {
    const seo = a.seo_score !== null && a.seo_score !== undefined ? String(a.seo_score) : '—';
    const kws = a.focus_keyword && a.focus_keyword.length ? a.focus_keyword.slice(0, 5).join(', ') : '(none)';
    const tocH2 = (a.toc ?? []).filter((h) => h.level === 2).slice(0, 6).map((h) => h.text);
    out += `[${a.id ?? '?'}]  ${a.title ?? '(untitled)'}\n`;
    out += `  Status: ${a.status ?? '?'} · Lang: ${a.language ?? '?'} · Words: ${a.word_count ?? 0} · SEO: ${seo}\n`;
    out += `  Keywords: ${kws}\n`;
    if (tocH2.length) out += `  TOC (h2): ${tocH2.join(' · ')}\n`;
    if (a.published_at) out += `  Published: ${a.published_at}\n`;
    else if (a.updated_at) out += `  Updated:   ${a.updated_at}\n`;
    out += '\n';
  }

  if (page < lastPage) {
    out += '-'.repeat(72) + '\n';
    out += `More pages available. Call again with page=${page + 1}.\n`;
  }
  out += `\nTo open one in full (content_html, images, SEO checklist):\n  get_article(article_id="<nano_id from above>")\n`;
  return textContent(out);
}
