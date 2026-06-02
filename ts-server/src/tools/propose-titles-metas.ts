import { z } from 'zod';
import { safeFetchUrl } from '../ssrf-guard.js';
import { textContent, normalizeUrl, extractTitle, extractMeta, stripTags } from '../mcp-helpers.js';

export const ProposeTitlesMetasInput = z.object({
  urls: z.array(z.string()).max(8).optional(),
  pages_description: z.string().optional(),
  focus_keyword: z.string().optional(),
});

interface PageFacts {
  url: string;
  title: string;
  h1: string;
  intro: string;
  detected: boolean;
}

export async function proposeTitlesMetas(args: z.infer<typeof ProposeTitlesMetasInput>) {
  const urls = (args.urls ?? []).slice(0, 8);
  const fk = (args.focus_keyword ?? '').trim();
  const pagesDesc = (args.pages_description ?? '').trim();

  if (urls.length === 0 && !pagesDesc) {
    return textContent(
      `propose_titles_metas — pass either \`urls\` (up to 8) or \`pages_description\` (free-text description of pages not yet deployed).`,
    );
  }

  const pages: PageFacts[] = [];
  for (const u of urls) {
    const url = normalizeUrl(u);
    try {
      const r = await safeFetchUrl(url, { timeoutMs: 8_000 });
      const title = extractTitle(r.html);
      const desc = extractMeta(r.html, 'description');
      const h1m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(r.html);
      const h1 = h1m ? stripTags(h1m[1]).trim() : '';
      const pm = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(r.html);
      const intro = pm ? stripTags(pm[1]).trim().slice(0, 200) : '';
      pages.push({ url, title: title || desc, h1, intro, detected: true });
    } catch (e) {
      pages.push({
        url,
        title: '',
        h1: '',
        intro: `(could not fetch: ${e instanceof Error ? e.message : String(e)})`,
        detected: false,
      });
    }
  }
  if (pagesDesc) {
    pages.push({ url: '(pre-deploy)', title: '', h1: '', intro: pagesDesc.slice(0, 400), detected: false });
  }

  let out = `TITLE + META CANDIDATES — ${pages.length} page(s)\n`;
  if (fk) out += `Focus keyword (front-loaded where natural): ${fk}\n`;
  out += `\nLength rules: titles 50-65 chars · meta descriptions 140-160 chars.\n\n`;

  for (const p of pages) {
    out += `## ${p.url}\n`;
    if (p.detected) {
      out += `Current title: ${p.title || '(none)'}\n`;
      if (p.h1) out += `H1:            ${p.h1}\n`;
      if (p.intro) out += `Intro:         ${p.intro}\n`;
    } else {
      out += `Pre-deploy / free-text: ${p.intro}\n`;
    }
    out += `\n`;
    out += `| # | Angle             | Title (validate length)                                   | Meta description                                                                                  |\n`;
    out += `|---|-------------------|-----------------------------------------------------------|---------------------------------------------------------------------------------------------------|\n`;
    const subject = p.h1 || p.title || pagesDesc || 'this page';
    const candidates = candidatesFor(subject, fk);
    candidates.forEach((c, i) => {
      out += `| ${i + 1} | ${c.angle.padEnd(17)} | ${truncate(c.title, 58)} | ${truncate(c.meta, 156)} |\n`;
    });
    out += `\nAgent task: present these to the user, let them pick one row per page, then apply the chosen title + meta to the corresponding template / route.\n\n`;
  }
  return textContent(out);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function candidatesFor(subject: string, focusKeyword: string): Array<{ angle: string; title: string; meta: string }> {
  const fk = focusKeyword ? focusKeyword.trim() : '';
  const fkPrefix = fk ? `${fk} — ` : '';
  return [
    {
      angle: 'Descriptive',
      title: `${fkPrefix}${subject}`,
      meta: `Everything you need to know about ${subject}. Practical guide, examples and the exact steps to take next.`,
    },
    {
      angle: 'Benefit-led',
      title: `Get more out of ${subject} (in 2026)`,
      meta: `Save hours and ship faster with ${subject}. Concrete tactics, real results, no fluff. Updated for 2026.`,
    },
    {
      angle: 'Question',
      title: `What is ${subject}, and how do you actually use it?`,
      meta: `Plain answer to "${subject}" with examples, a step-by-step setup and the common mistakes to avoid.`,
    },
    {
      angle: 'Specific',
      title: `${subject} in 5 minutes — the 2026 playbook`,
      meta: `5-minute walkthrough of ${subject}: the exact 7 steps, the gotchas, and a checklist you can copy.`,
    },
    {
      angle: 'Keyword-first',
      title: `${fk || subject}: complete 2026 guide`,
      meta: `${fk || subject} — the complete 2026 guide. Setup, examples, benchmarks and the rare mistakes that cost teams weeks.`,
    },
  ];
}
