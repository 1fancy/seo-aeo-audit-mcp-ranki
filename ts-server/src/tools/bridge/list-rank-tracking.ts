import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const ListRankTrackingInput = z.object({
  project_id: z.string().min(1, 'project_id is required'),
});

interface KeywordRow {
  keyword?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface GscResponse {
  data?: {
    project_id?: string;
    gsc_connected?: boolean;
    gsc_property?: string | null;
    last_synced_at?: string | null;
    totals?: { keywords?: number; clicks?: number; impressions?: number };
    top_keywords?: KeywordRow[];
    opportunities?: KeywordRow[];
  };
}

export async function listRankTracking(
  args: z.infer<typeof ListRankTrackingInput>,
  apiKey: string,
) {
  const r = await rankiApiCall<GscResponse>(
    `/api/v1/projects/${encodeURIComponent(args.project_id)}/gsc`,
    apiKey,
  );
  const d = r.data ?? {};

  if (!d.gsc_connected) {
    return textContent(
      `Project ${args.project_id} doesn't have Google Search Console connected.\n\n` +
        `Connect it at https://app.ranki.io/projects/${args.project_id}/gsc (one OAuth click) and then re-run this tool.\n\n` +
        `Without GSC, the only ranking data available is the AI-citation snapshots from \`ai_visibility\`.`,
    );
  }

  const totals = d.totals ?? {};
  const top = d.top_keywords ?? [];
  const opps = d.opportunities ?? [];

  let out = `GOOGLE SEARCH CONSOLE — project ${args.project_id}\n`;
  out += `Property: ${d.gsc_property ?? 'n/a'}\n`;
  out += `Last synced: ${d.last_synced_at ?? 'never'}\n\n`;
  out += `Totals (last 28 days)\n`;
  out += `  Keywords tracked: ${totals.keywords ?? 0}\n`;
  out += `  Total clicks:     ${totals.clicks ?? 0}\n`;
  out += `  Total impressions: ${totals.impressions ?? 0}\n\n`;

  if (top.length) {
    out += `Top 20 keywords by clicks\n`;
    for (const k of top) out += formatKwRow(k);
    out += '\n';
  }
  if (opps.length) {
    out += `Top 20 opportunities (position > 10, impressions ≥ 10 — easy wins if you optimize content)\n`;
    for (const k of opps) out += formatOppRow(k);
    out += '\n';
    out += `These are the keywords to write content for next — already ranking but not yet on page 1.\n`;
    out += `Pick the top 3 and call \`find_topic_ideas\` for each to plan articles.\n`;
  }
  return textContent(out);
}

function formatKwRow(k: KeywordRow): string {
  const kw = String(k.keyword ?? '').slice(0, 50).padEnd(50);
  return `  ${kw} clicks=${pad(k.clicks ?? 0, 5)} impr=${pad(k.impressions ?? 0, 7)} ctr=${((k.ctr ?? 0) * 100).toFixed(2)}% pos=${(k.position ?? 0).toFixed(1)}\n`;
}
function formatOppRow(k: KeywordRow): string {
  const kw = String(k.keyword ?? '').slice(0, 50).padEnd(50);
  return `  ${kw} impr=${pad(k.impressions ?? 0, 6)} pos=${(k.position ?? 0).toFixed(1)} ctr=${((k.ctr ?? 0) * 100).toFixed(2)}%\n`;
}
function pad(n: number, w: number): string {
  return String(n).padEnd(w);
}
