import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auditSeo } from '../src/tools/audit-seo.js';
import * as ssrf from '../src/ssrf-guard.js';

const PERFECT_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Perfect SEO Test Page — Ranki MCP Audit Fixture</title>
  <meta name="description" content="A handcrafted HTML fixture that passes every check in the audit_seo tool. Useful as a regression baseline.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.com/perfect">
  <meta property="og:title" content="Perfect SEO Test Page">
  <meta property="og:description" content="A handcrafted HTML fixture that passes every check.">
  <meta property="og:image" content="https://example.com/og.png">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
</head>
<body>
  <h1>Perfect SEO Test Page</h1>
  <p>This page is designed to pass every check. The audit should score 100.</p>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="/blog">Blog</a>
  <img src="/a.png" alt="A"><img src="/b.png" alt="B"><img src="/c.png" alt="C">
</body>
</html>`;

const BROKEN_HTML = `<html><body><h1>X</h1><h1>Y</h1><img src="/x.png"></body></html>`;

describe('audit_seo', () => {
  beforeEach(() => {
    vi.spyOn(ssrf, 'safeFetchUrl');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scores 100 on the perfect fixture', async () => {
    vi.mocked(ssrf.safeFetchUrl).mockResolvedValue({
      html: PERFECT_HTML,
      status: 200,
      finalUrl: 'https://example.com/perfect',
    });
    const r = await auditSeo({ url: 'https://example.com/perfect' });
    const text = r.content[0].text;
    expect(text).toMatch(/Score: 100\/100/);
    expect(text).toMatch(/10\/10 checks passed/);
  });

  it('scores poorly on broken HTML', async () => {
    vi.mocked(ssrf.safeFetchUrl).mockResolvedValue({
      html: BROKEN_HTML,
      status: 200,
      finalUrl: 'https://example.com/broken',
    });
    const r = await auditSeo({ url: 'https://example.com/broken' });
    const text = r.content[0].text;
    const m = /Score: (\d+)\/100/.exec(text);
    expect(m).not.toBeNull();
    expect(parseInt(m![1], 10)).toBeLessThan(50);
  });
});
