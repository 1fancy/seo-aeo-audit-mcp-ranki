import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const AiVisibilityInput = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  since: z.string().optional(),
  cited_only: z.boolean().optional(),
  per_page: z.number().int().min(1).max(100).optional().default(50),
});

interface Row {
  keyword?: string;
  position?: number | null;
  source?: string;
  ai_cited?: boolean;
  captured_at?: string;
}

interface Response {
  data: Row[];
  meta?: {
    project_id?: string;
    since?: string;
    current_page?: number;
    last_page?: number;
    total?: number;
    summary?: { cited?: number; total?: number };
  };
}

export async function aiVisibility(args: z.infer<typeof AiVisibilityInput>, apiKey: string) {
  const params = new URLSearchParams();
  params.set('per_page', String(args.per_page));
  if (args.cited_only) params.set('cited_only', '1');
  if (args.since) params.set('since', args.since);

  const r = await rankiApiCall<Response>(
    `/api/v1/projects/${encodeURIComponent(args.project_id)}/ai-visibility?${params.toString()}`,
    apiKey,
  );
  const rows = r.data ?? [];
  const meta = r.meta ?? {};
  const summary = meta.summary ?? {};
  const cited = summary.cited ?? 0;
  const total = summary.total ?? 0;
  const pct = total > 0 ? ((cited / total) * 100).toFixed(1) : '0';

  let out = `AI VISIBILITY — project ${args.project_id}\nSince ${meta.since ?? 'unknown'}\n\n`;
  out += `Summary\n  Snapshots:  ${total}\n  AI-cited:   ${cited} (${pct}%)\n\n`;

  if (total === 0) {
    out += `No snapshots in this window. Ranki.io captures these periodically — check Topic Radar at https://app.ranki.io/projects/${args.project_id}/topics.\n`;
    return textContent(out);
  }

  out += `Recent snapshots\n`;
  for (const r2 of rows) {
    const mark = r2.ai_cited ? '★ AI-CITED' : '         ';
    const kw = String(r2.keyword ?? '').slice(0, 55).padEnd(55);
    const pos = r2.position !== null && r2.position !== undefined ? r2.position.toFixed(1).padStart(5) : '  n/a';
    const src = String(r2.source ?? '?').padEnd(5);
    out += `  ${mark}  ${kw}  pos=${pos}  src=${src}  ${r2.captured_at ?? ''}\n`;
  }
  if ((meta.current_page ?? 1) < (meta.last_page ?? 1)) {
    out += `\nMore pages available — call again with the next page.\n`;
  }

  out += `\nNext steps:\n`;
  out += `  1. Focus content updates on keywords that are NOT yet AI-cited but ARE ranking top 10 in classic SERPs.\n`;
  out += `  2. Add FAQPage schema + definitional intros on those pages (call \`audit_aeo\` on each).\n`;
  return textContent(out);
}
