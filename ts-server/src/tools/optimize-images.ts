import { z } from 'zod';
import { textContent } from '../mcp-helpers.js';
import { urlBlockedReason } from '../ssrf-guard.js';

export const OptimizeImagesInput = z.object({
  images: z.array(z.string()).min(1).max(20, 'Up to 20 images at once.'),
  max_width: z.number().int().min(200).max(4000).optional().default(1600),
});

export async function optimizeImages(args: z.infer<typeof OptimizeImagesInput>) {
  const maxWidth = args.max_width;
  let out = `IMAGE OPTIMIZATION PLAN — ${args.images.length} image(s)\n`;
  out += `Target formats (in priority order): AVIF (best compression), WebP (fallback), original (final fallback)\n\n`;

  let i = 0;
  for (const img of args.images) {
    i++;
    const isUrl = /^https?:\/\//i.test(img);
    const base = basename(stripQuery(isUrl ? safePath(img) : img));
    const ext = extension(base).toLowerCase();
    const stem = base.slice(0, base.length - (ext ? ext.length + 1 : 0));

    let bytes: number | null = null;
    if (isUrl) {
      // HEAD with SSRF guard. If it blocks, we skip size probe but still
      // emit the recipe — the agent has the URL string regardless.
      if ((await urlBlockedReason(img).catch(() => null)) === null) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 8_000);
          const r = await fetch(img, {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'User-Agent': 'RankiMCP-TS/0.1 (+https://ranki.io)' },
          });
          clearTimeout(t);
          const cl = r.headers.get('content-length');
          if (cl) bytes = parseInt(cl, 10);
        } catch {
          /* size probe optional */
        }
      }
    }

    let altSuggestion = stem.replace(/[-_]/g, ' ').trim();
    if (altSuggestion) altSuggestion = altSuggestion[0].toUpperCase() + altSuggestion.slice(1);
    if (altSuggestion.length > 100) altSuggestion = altSuggestion.slice(0, 97) + '…';
    if (!altSuggestion || /^\d+$/.test(altSuggestion)) {
      altSuggestion = 'TODO: describe what this image shows (the agent must replace this)';
    }

    let verdict: 'already-modern' | 'convert' | 'unknown-format' = 'unknown-format';
    if (['svg', 'webp', 'avif'].includes(ext)) verdict = 'already-modern';
    else if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) verdict = 'convert';

    const sizeStr = bytes !== null ? ` (${(bytes / 1024).toFixed(1)} KB)` : '';
    out += `[${i}] ${img}${sizeStr}\n`;
    out += `  Current format: ${ext || 'unknown'}\n`;

    if (verdict === 'already-modern') {
      out += `  Verdict:        already-modern — no conversion needed.\n`;
      out += `  Action:         confirm the <img alt="..."> describes the image (current suggestion: "${altSuggestion}").\n\n`;
      continue;
    }
    if (verdict === 'unknown-format') {
      out += `  Verdict:        unknown extension — agent should inspect manually.\n\n`;
      continue;
    }

    const w2x = Math.round(maxWidth * 2);
    const wMobile = Math.round(maxWidth * 0.5);

    out += `  Verdict:        convert to AVIF + WebP (keep original as fallback)\n`;
    out += `  Alt suggestion: "${altSuggestion}"\n`;
    out += `  Target widths:  ${maxWidth}w (1x), ${wMobile}w (mobile)\n\n`;
    out += `  Sharp (Node — preferred for build pipelines):\n`;
    out += `    npx sharp-cli -i "${stem}.${ext}" -o "${stem}.avif" -f avif --quality 50 resize ${maxWidth}\n`;
    out += `    npx sharp-cli -i "${stem}.${ext}" -o "${stem}.webp" -f webp --quality 75 resize ${maxWidth}\n`;
    out += `    npx sharp-cli -i "${stem}.${ext}" -o "${stem}@2x.avif" -f avif --quality 50 resize ${w2x}\n`;
    out += `    npx sharp-cli -i "${stem}.${ext}" -o "${stem}@2x.webp" -f webp --quality 75 resize ${w2x}\n\n`;
    out += `  cwebp / avifenc (CLI fallback):\n`;
    out += `    cwebp -q 75 -resize ${maxWidth} 0 "${stem}.${ext}" -o "${stem}.webp"\n`;
    out += `    avifenc --min 25 --max 35 "${stem}.${ext}" "${stem}.avif"\n\n`;
    out += `  Replace existing <img> with responsive <picture>:\n`;
    out += `    <picture>\n`;
    out += `      <source type="image/avif" srcset="${stem}.avif 1x, ${stem}@2x.avif 2x">\n`;
    out += `      <source type="image/webp" srcset="${stem}.webp 1x, ${stem}@2x.webp 2x">\n`;
    out += `      <img src="${stem}.${ext}" alt="${altSuggestion}" width="${maxWidth}" loading="lazy" decoding="async">\n`;
    out += `    </picture>\n\n`;
  }

  out += `Agent workflow:\n`;
  out += `  1. Find these image files in the repo (use Grep/Glob — they're referenced from <img src> or import statements).\n`;
  out += `  2. Run the conversion command for each (sharp if package.json has it, else cwebp/avifenc).\n`;
  out += `  3. Replace every <img> referencing the original with the <picture> block above. Adapt to your framework (React/Vue/Astro/Svelte).\n`;
  out += `  4. Update alt attributes (the suggestions above are heuristic stems — write something descriptive and accessible).\n`;
  out += `  5. Add \`loading="lazy"\` to below-the-fold images. Hero image stays eager-loaded with fetchpriority="high".\n`;
  out += `  6. Commit with: 'Convert images to AVIF + WebP, add responsive <picture>, fix alt text'.\n`;
  out += `  7. Call \`audit_speed\` against the deployed URL to confirm LCP dropped.\n`;
  return textContent(out);
}

function stripQuery(s: string): string {
  const q = s.indexOf('?');
  return q >= 0 ? s.slice(0, q) : s;
}
function basename(s: string): string {
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}
function extension(s: string): string {
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i + 1).toLowerCase() : '';
}
function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
