# Free SEO + AEO Audit MCP Server for Claude Code, Cursor, Windsurf

[![npm](https://img.shields.io/npm/v/@ranki.io/seo-aeo-mcp.svg)](https://www.npmjs.com/package/@ranki.io/seo-aeo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/1fancy/seo-aeo-audit-mcp-ranki/blob/main/LICENSE)
[![MCP 2024-11-05](https://img.shields.io/badge/MCP-2024--11--05-orange)](https://modelcontextprotocol.io)
[![Live at mcp.ranki.io](https://img.shields.io/badge/live-mcp.ranki.io-black)](https://mcp.ranki.io)

**The free SEO audit tool, AEO audit tool, Core Web Vitals auditor and image optimizer that lives inside Claude Code, Cursor, Windsurf and ChatGPT Desktop.** Your AI editor calls 22 SEO + AEO tools over MCP, fixes the issues directly in your codebase, and proves the score moved &mdash; in one conversation. Lighthouse 42 → 96. AEO 38 → 96. No 40-page audit PDFs.

This is the **Node / TypeScript** edition of [Ranki MCP](https://github.com/1fancy/seo-aeo-audit-mcp-ranki). The hosted [PHP server](https://github.com/1fancy/seo-aeo-audit-mcp-ranki/tree/main/server) powers [`mcp.ranki.io`](https://mcp.ranki.io); this package is the native-Node alternative, distributed via npm so any MCP-capable client can install it locally with `npx`.

## Quick links

- 🚀 **[Live demo & install guide](https://mcp.ranki.io)** &middot; mcp.ranki.io
- 🔑 **[Get a free Ranki.io API key](https://app.ranki.io/developer)** &middot; required only for the 7 paid bridge tools
- 📖 **[Developer documentation](https://ranki.io/developers)** &middot; REST API, MCP, Skill reference
- 📝 **[How vibe coders rank on Google + AI search without learning SEO](https://ranki.io/blog/rank-on-google-and-ai-search-without-learning-seo)** &middot; long-form guide
- 🌐 **[Ranki.io — AI SEO + AEO automation platform](https://ranki.io)** &middot; SaaS that auto-generates ranking content
- 🐙 **[GitHub source](https://github.com/1fancy/seo-aeo-audit-mcp-ranki)** &middot; PHP + TypeScript both included

## Install (one line)

```bash
npx @ranki.io/cli install
```

Auto-detects Claude Code / Claude Desktop / Cursor / Windsurf / ChatGPT Desktop and writes the right MCP config. Or use the manual snippets below.

### Manual install &mdash; Claude Desktop / Claude Code / ChatGPT Desktop (stdio)

Add this to your MCP config:

```json
{
  "mcpServers": {
    "ranki": {
      "command": "npx",
      "args": ["-y", "@ranki.io/seo-aeo-mcp"],
      "env": {
        "RANKI_API_KEY": "rk_live_..."
      }
    }
  }
}
```

`RANKI_API_KEY` is **optional** &mdash; only the 7 paid bridge tools need it. The 15 free tools work without an account.

### Manual install &mdash; Cursor / Windsurf / self-hosted (HTTP)

```bash
npx @ranki.io/seo-aeo-mcp --serve --port 8787
# Then point your MCP client at http://127.0.0.1:8787 with X-API-Key header
```

Binds to `127.0.0.1` by default. Set `RANKI_MCP_HOST=0.0.0.0` to expose on a LAN / VPS (read the security section first).

## What it actually does &mdash; 22 tools

### SEO audit, AEO audit, Core Web Vitals (free, 15 tools)

| Tool | Purpose |
|---|---|
| `audit_seo` | 10-check on-page SEO scorecard (title, meta, H1, canonical, viewport, HTTPS, OpenGraph, image alt, internal links, JSON-LD) |
| `audit_aeo` | 8-check **Answer Engine Optimization** scorecard (FAQPage / Article schema, definitional intro, author byline, llms.txt, robots AI crawler access, answer-style headings, structured tables) |
| `audit_hidden_pages` | Classifies every URL as `robots-disallow` / `noindex` / `keep` / `unsure` &mdash; finds the admin pages, checkouts and search-result URLs that should not be indexed by Google |
| `audit_speed` | Real Lighthouse + Core Web Vitals via Google PageSpeed Insights. Returns image opportunities with bytes saved per file, render-blocking JS / CSS, failing on-page SEO audits |
| `audit_core_web_vitals` | Focused LCP / CLS / INP audit with literal fix recipes per metric |
| `optimize_images` | For each image URL: target format (AVIF + WebP), responsive widths, `<picture>` block with `srcset`, the literal `sharp-cli` / `cwebp` / `avifenc` command to run, alt text suggestion |
| `generate_sitemap_xml` | Deploy-ready `sitemap.xml` |
| `generate_llms_txt` | The emerging `llms.txt` standard for telling AI crawlers what your site is about |
| `generate_robots_txt` | `robots.txt` that explicitly allows or denies GPTBot, ClaudeBot, PerplexityBot, Google-Extended |
| `seo_starter_kit` | The four baseline files most vibe-coded sites are missing, ready to deploy |
| `find_topic_ideas` | Structured brief for 15 article topics across informational / commercial / transactional intent |
| `find_keyword_gap` | Methodology for keyword-gap analysis against named competitors |
| `propose_titles_metas` | 5 title + meta description candidates per page across 5 angles (length-validated) |
| `explain_seo_terms` | Reference glossary of 40+ SEO and AEO terms |
| `install_skill` | Install commands for the [Ranki SEO Skill](https://github.com/1fancy/ranki-seo-skills) across every supported AI editor |

### Your Ranki.io account &mdash; real ranking data inside your IDE (paid, 7 tools)

These call the Ranki.io REST API at `app.ranki.io`. **The TypeScript server never opens a database connection** &mdash; every paid call goes through Laravel's `ApiKeyAuth` middleware and is scoped to the calling user's data on the server side. No DB credentials, no schema knowledge, no direct DB access in this npm package.

| Tool | Purpose |
|---|---|
| `get_account` | Whoami &mdash; name, email, plan, daily / monthly limits, current usage |
| `list_projects` | Lists your Ranki.io projects |
| `list_articles` | Paginated index of a project's articles: nano_id, title, status, language, focus keywords, TOC, word count, SEO score |
| `get_article` | Single article &mdash; title, content_html, focus keywords, TOC, image URLs |
| `list_rank_tracking` | 28-day Google Search Console summary: totals, top 20 by clicks, top 20 opportunity keywords (the easy wins) |
| `list_gsc_keywords` | Full paginated GSC keyword list, sortable |
| `ai_visibility` | Recorded AI-citation snapshots: which topics appeared in ChatGPT, Claude, Perplexity and Google AI Overview SERPs |

[**Get an API key at app.ranki.io/developer →**](https://app.ranki.io/developer)

## A typical session, condensed

```
You: audit my site speed and fix the slow images

Claude: → Calling ranki.audit_speed(url="https://myapp.dev")
        ← Lighthouse: 42 perf · LCP 4.8s · 3 images blocking the paint.
        → Calling ranki.optimize_images([hero.png, banner.jpg, card.png])…
        ← 3 files, recipes returned.
        → Running sharp-cli to convert hero.png → hero.avif + hero.webp…
        → Editing app/page.tsx — rewriting <img> as <picture srcset>, adding alt text…
        → Calling ranki.audit_speed again to verify…
        ← Lighthouse: 96 perf · LCP 1.4s.
```

Two prompts. Lighthouse jumped 54 points. The agent did all the work in your codebase. You reviewed the diff and hit deploy.

## Environment

| Variable | Purpose |
|---|---|
| `RANKI_API_KEY` | API key for the 7 paid bridge tools. Optional for the 15 free tools. Get one at [app.ranki.io/developer](https://app.ranki.io/developer). |
| `GOOGLE_PSI_API_KEY` | Google PageSpeed Insights API key. Optional &mdash; without it, `audit_speed` and `audit_core_web_vitals` share Google's unauthenticated quota (~1 req/min). With it: 25,000 calls/day. |
| `RANKI_API_BASE` | Override the upstream Ranki.io API (default `https://app.ranki.io`). Self-hosted Ranki.io deployments only. |
| `RANKI_MCP_HOST` | Bind interface for `--serve` (default `127.0.0.1`). |
| `MCP_TRUSTED_PROXIES` | CSV of CIDR ranges trusted to set `X-Forwarded-For` / `CF-Connecting-IP`. Cloudflare ranges are always trusted. |

## Security

Hardened for public traffic. Same posture as the PHP server at `mcp.ranki.io`:

- **SSRF guard** &mdash; every outbound fetch validates URL scheme (http/https only), resolves the hostname, and rejects any IP in private / loopback / link-local / reserved / cloud-metadata ranges (incl. AWS IMDS `169.254.169.254`). Redirects are followed manually with re-validation at every hop.
- **Body size cap** &mdash; 64 KB hard limit on `--serve` requests; returns HTTP 413.
- **JSON depth cap** &mdash; depth 16, throws `-32700` on deeper input.
- **Tool-name allowlist** &mdash; `^[a-z][a-z0-9_]{0,63}$` before any filesystem touch.
- **Atomic daily rate-limit** &mdash; file-locked counters in `/tmp/ranki-mcp-rl/`. Same scheme as the PHP impl, so if you run both on one host they share state.
- **IP-spoof block** &mdash; `X-Forwarded-For` / `CF-Connecting-IP` headers are honoured ONLY when `req.socket.remoteAddress` is inside Cloudflare's published ranges (or a `MCP_TRUSTED_PROXIES` CIDR).
- **No DB access** &mdash; the TypeScript server has zero database code.

The SSRF guard ships with regression tests &mdash; see `tests/ssrf.test.ts`.

## Why this matters &mdash; AEO is the new SEO

In 2026, the gap between "site renders" and "site ranks" is wider than ever. AI search took 30% of clicks from Google. Most vibe-coded sites have no FAQPage schema, no `llms.txt`, robots.txt that quietly blocks ClaudeBot, hero images that crush LCP, H2s that AI can't extract as answers &mdash; and the dev never learns why ChatGPT doesn't cite them.

Ranki MCP closes that gap programmatically. Your agent does the audit, applies the fix, re-runs the audit. You ship.

Read the full story: [How vibe coders rank on Google + AI search without learning SEO →](https://ranki.io/blog/rank-on-google-and-ai-search-without-learning-seo)

## Develop

```bash
npm install
npm run dev          # tsx, hot reload on stdio
npm run build        # → dist/
npm test             # vitest
npm run serve        # HTTP server on :8787
```

## Parity with the PHP server

The PHP server at [`server/`](https://github.com/1fancy/seo-aeo-audit-mcp-ranki/tree/main/server) (production deployment on `mcp.ranki.io`) and this TypeScript impl expose **the same 22 tools, with identical descriptions, the same JSON output, the same SSRF guard, the same rate limits, the same security posture**. Tool descriptions in `src/tools/registry.ts` are kept in lockstep with `lib/registry.php`. If you find a divergence, please open an issue &mdash; it's a bug in one of them.

## License

MIT. See [LICENSE](https://github.com/1fancy/seo-aeo-audit-mcp-ranki/blob/main/LICENSE).

Built by [Ranki.io](https://ranki.io) &middot; AI SEO + AEO automation platform.
