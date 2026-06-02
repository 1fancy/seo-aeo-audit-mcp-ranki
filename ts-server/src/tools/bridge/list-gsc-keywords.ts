import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const ListGscKeywordsInput = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  sort: z.enum(['clicks', 'impressions', 'position', 'ctr']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  min_impressions: z.number().int().min(0).optional(),
  per_page: z.number().int().min(1).max(100).optional().default(50),
});

interface Row {
  keyword?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface Response {
  data: Row[];
  meta?: {
    current_page?: number;
    last_page?: number;
    total?: number;
    gsc_connected?: boolean;
    last_synced_at?: string | null;
  };
}

export async function listGscKeywords(
  args: z.infer<typeof ListGscKeywordsInput>,
  apiKey: string,
) {
  const params = new URLSearchParams();
  if (args.sort) params.set('sort', args.sort);
  if (args.dir) params.set('dir', args.dir);
  if (args.min_impressions !== undefined) params.set('min_impressions', String(args.min_impressions));
  params.set('per_page', String(args.per_page));

  const r = await rankiApiCall<Response>(
    `/api/v1/projects/${encodeURIComponent(args.project_id)}/keywords?${params.toString()}`,
    apiKey,
  );
  const rows = r.data ?? [];
  const meta = r.meta ?? {};

  if (!meta.gsc_connected) {
    return textContent(
      `Project ${args.project_id} doesn't have Google Search Console connected.\n` +
        `Connect at https://app.ranki.io/projects/${args.project_id}/gsc and resync, then try again.`,
    );
  }
  if (rows.length === 0) {
    return textContent(
      `No keywords returned for project ${args.project_id}.\n` +
        (meta.last_synced_at ? `Last sync: ${meta.last_synced_at}.\n` : 'GSC has never been synced for this project.\n') +
        `Trigger a sync at https://app.ranki.io/projects/${args.project_id}/gsc.`,
    );
  }

  let out = `GSC KEYWORDS — project ${args.project_id}\n`;
  out += `Page ${meta.current_page ?? 1} of ${meta.last_page ?? 1} · ${meta.total ?? rows.length} keywords total · last synced ${meta.last_synced_at ?? 'unknown'}\n\n`;
  for (const k of rows) {
    const kw = String(k.keyword ?? '').slice(0, 55).padEnd(55);
    out += `  ${kw} clicks=${pad(k.clicks ?? 0, 5)} impr=${pad(k.impressions ?? 0, 7)} ctr=${((k.ctr ?? 0) * 100).toFixed(2)}% pos=${(k.position ?? 0).toFixed(1)}\n`;
  }
  if ((meta.current_page ?? 1) < (meta.last_page ?? 1)) {
    out += `\nMore pages available — call again with per_page=${args.per_page} and next page.\n`;
  }
  return textContent(out);
}

function pad(n: number, w: number): string {
  return String(n).padEnd(w);
}
