/**
 * Shared helpers for MCP tool implementations.
 *
 * `textContent` wraps a string into the MCP content envelope.
 * The HTML helpers are minimal regex-based — same logic as the PHP
 * tools so output stays in parity. We deliberately do NOT add a real
 * HTML parser dependency: every check we run is well-defined enough
 * to express as a regex, and we keep the dep tree tiny.
 */

export type McpContent = {
  content: Array<{ type: 'text'; text: string }>;
};

export function textContent(text: string): McpContent {
  return { content: [{ type: 'text', text }] };
}

export function normalizeUrl(input: string): string {
  const u = input.trim();
  if (!/^https?:\/\//i.test(u)) return 'https://' + u;
  return u;
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : '';
}

export function extractMeta(html: string, name: string): string {
  // name OR property variants — name="description", property="og:title", etc.
  const re = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*["']${escapeRegExp(name)}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${escapeRegExp(name)}["']`,
    'i',
  );
  const m = re.exec(html) || re2.exec(html);
  return m ? decodeEntities(m[1].trim()) : '';
}

export function countMatches(html: string, re: RegExp): number {
  return (html.match(re) || []).length;
}

export function extractHeadings(html: string, levels: number[] = [2, 3]): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  const re = new RegExp(`<h([${levels.join('')}])[^>]*>([\\s\\S]*?)<\\/h\\1>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = stripTags(m[2]).trim();
    if (txt) out.push({ level: parseInt(m[1], 10), text: txt });
  }
  return out;
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
