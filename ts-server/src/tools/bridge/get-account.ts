import { z } from 'zod';
import { rankiApiCall } from '../../ranki-api.js';
import { textContent } from '../../mcp-helpers.js';

export const GetAccountInput = z.object({}).strict();

interface MeResponse {
  name?: string;
  email?: string;
  plan?: string;
  subscription_status?: string;
  on_trial?: boolean;
  limits?: {
    projects?: number;
    posts_per_day?: number;
    posts_per_month?: number;
  };
  usage?: {
    projects?: number;
    posts_this_month?: number;
  };
}

export async function getAccount(_args: z.infer<typeof GetAccountInput>, apiKey: string) {
  const r = await rankiApiCall<MeResponse>('/api/v1/me', apiKey);
  const limits = r.limits ?? {};
  const usage = r.usage ?? {};

  const projects = usage.projects ?? 0;
  const projectsLimit = limits.projects ?? 0;
  const postsPerDay = limits.posts_per_day ?? 0;
  const postsPerMonth = limits.posts_per_month ?? 0;
  const postsThisMonth = usage.posts_this_month;

  let statusLine = r.plan ?? 'unknown';
  if (r.on_trial) statusLine += ' (trial)';
  if (r.subscription_status === 'canceled') statusLine += ' · canceled';
  else if (r.subscription_status === 'past_due') statusLine += ' · past due';

  let out = `✓ API key verified — connected to Ranki.io.\n\n`;
  out += `Account\n`;
  out += `  Name:    ${r.name ?? '(no name)'}\n`;
  out += `  Email:   ${r.email ?? '(no email)'}\n`;
  out += `  Plan:    ${statusLine}\n\n`;
  out += `Daily and monthly limits\n`;
  out += `  Articles/day:   ${postsPerDay > 0 ? postsPerDay : 'n/a'}\n`;
  out += `  Articles/month: ${postsPerMonth > 0 ? postsPerMonth : 'n/a'}${
    postsThisMonth !== undefined ? ` (used: ${postsThisMonth})` : ''
  }\n`;
  out += `  Projects:       ${projects} of ${projectsLimit > 0 ? projectsLimit : '∞'}\n\n`;
  out += `Next steps\n`;
  if (projects === 0) {
    out += `  • Create your first project at https://app.ranki.io/projects/new\n`;
  } else {
    out += `  • List your projects with \`list_projects\`.\n`;
    out += `  • For one project, call \`list_articles(project_id=...)\` to see what's been generated.\n`;
    out += `  • Or \`list_rank_tracking(project_id=...)\` to anchor a content session in real GSC data.\n`;
  }
  return textContent(out);
}
