import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const ListProjectsInput = z.object({
  per_page: z.number().int().min(1).max(50).optional().default(25),
});

interface ProjectRow {
  id: string;
  name?: string;
  url?: string;
  is_active?: boolean;
  writing_language?: string;
  posts_per_month?: number;
}

interface ListResponse {
  data: ProjectRow[];
  meta?: {
    current_page?: number;
    last_page?: number;
    total?: number;
  };
}

export async function listProjects(args: z.infer<typeof ListProjectsInput>, apiKey: string) {
  const r = await rankiApiCall<ListResponse>(`/api/v1/projects?per_page=${args.per_page}`, apiKey);
  const rows = r.data ?? [];
  const meta = r.meta ?? {};
  if (rows.length === 0) {
    return textContent(
      'No projects in your Ranki.io account yet. Create one at https://app.ranki.io/projects/new.',
    );
  }
  let out = `PROJECTS — ${meta.total ?? rows.length} total · page ${meta.current_page ?? 1} of ${meta.last_page ?? 1}\n\n`;
  for (const p of rows) {
    out += `[${p.id}]  ${p.name ?? '(unnamed)'}\n`;
    out += `  URL:      ${p.url ?? '(none)'}\n`;
    out += `  Active:   ${p.is_active ? 'yes' : 'no'} · Language: ${p.writing_language ?? '?'} · Posts/month: ${p.posts_per_month ?? 0}\n\n`;
  }
  out += `Next steps:\n`;
  out += `  • \`list_articles(project_id="...")\` — see articles in a project.\n`;
  out += `  • \`list_rank_tracking(project_id="...")\` — Google Search Console summary.\n`;
  out += `  • \`ai_visibility(project_id="...")\` — which topics ChatGPT/Claude/Perplexity have cited.\n`;
  return textContent(out);
}
