/**
 * Central tool registry — definitions + dispatch.
 *
 * Tool descriptions are intentionally identical (semantically) to the
 * PHP impl's lib/registry.php so a client switching between PHP-hosted
 * and TS-hosted variants sees the same tool list and capabilities.
 */
import { z } from 'zod';
import type { McpContent } from '../mcp-helpers.js';

import { auditSeo, AuditSeoInput } from './audit-seo.js';
import { auditAeo, AuditAeoInput } from './audit-aeo.js';
import { auditHiddenPages, AuditHiddenPagesInput } from './audit-hidden-pages.js';
import { auditSpeed, AuditSpeedInput } from './audit-speed.js';
import { auditCoreWebVitals, AuditCwvInput } from './audit-core-web-vitals.js';
import { optimizeImages, OptimizeImagesInput } from './optimize-images.js';
import { generateSitemapXml, GenerateSitemapXmlInput } from './generate-sitemap-xml.js';
import { generateLlmsTxt, GenerateLlmsTxtInput } from './generate-llms-txt.js';
import { generateRobotsTxt, GenerateRobotsTxtInput } from './generate-robots-txt.js';
import { seoStarterKit, SeoStarterKitInput } from './seo-starter-kit.js';
import { findTopicIdeas, FindTopicIdeasInput } from './find-topic-ideas.js';
import { findKeywordGap, FindKeywordGapInput } from './find-keyword-gap.js';
import { proposeTitlesMetas, ProposeTitlesMetasInput } from './propose-titles-metas.js';
import { explainSeoTerms, ExplainSeoTermsInput } from './explain-seo-terms.js';
import { installSkill, InstallSkillInput } from './install-skill.js';

import { getAccount, GetAccountInput } from './bridge/get-account.js';
import { listProjects, ListProjectsInput } from './bridge/list-projects.js';
import { listArticles, ListArticlesInput } from './bridge/list-articles.js';
import { getArticle, GetArticleInput } from './bridge/get-article.js';
import { listRankTracking, ListRankTrackingInput } from './bridge/list-rank-tracking.js';
import { listGscKeywords, ListGscKeywordsInput } from './bridge/list-gsc-keywords.js';
import { aiVisibility, AiVisibilityInput } from './bridge/ai-visibility.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  keyed: boolean; // requires X-API-Key
  call: (args: unknown, apiKey: string) => Promise<McpContent>;
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Hand-rolled — zod-to-json-schema is overkill for our flat input
  // shapes and adds 30KB. MCP clients only need {type, properties,
  // required} at the top level for our tools.
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, v] of Object.entries(shape)) {
      properties[key] = jsonSchemaField(v);
      if (!v.isOptional()) required.push(key);
    }
    const out: Record<string, unknown> = { type: 'object', properties };
    if (required.length) out.required = required;
    return out;
  }
  return { type: 'object' };
}

function jsonSchemaField(z2: z.ZodTypeAny): Record<string, unknown> {
  const desc = z2.description;
  // unwrap optional + default
  let inner = z2;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
    inner = (inner as z.ZodOptional<z.ZodTypeAny> | z.ZodDefault<z.ZodTypeAny>)._def
      .innerType as z.ZodTypeAny;
  }
  let field: Record<string, unknown>;
  if (inner instanceof z.ZodString) field = { type: 'string' };
  else if (inner instanceof z.ZodNumber) field = { type: 'integer' };
  else if (inner instanceof z.ZodBoolean) field = { type: 'boolean' };
  else if (inner instanceof z.ZodEnum)
    field = { type: 'string', enum: (inner as z.ZodEnum<[string, ...string[]]>).options };
  else if (inner instanceof z.ZodArray) field = { type: 'array', items: jsonSchemaField(inner.element) };
  else if (inner instanceof z.ZodObject) field = zodToJsonSchema(inner);
  else field = { type: 'string' };
  if (desc) field.description = desc;
  return field;
}

function wrap<S extends z.ZodTypeAny>(
  schema: S,
  fn: (args: z.infer<S>, apiKey: string) => Promise<McpContent>,
): (args: unknown, apiKey: string) => Promise<McpContent> {
  return async (args, apiKey) => {
    const parsed = schema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error('Invalid arguments: ' + parsed.error.issues.map((i) => i.message).join('; '));
    }
    return fn(parsed.data, apiKey);
  };
}

export const TOOLS: ToolDef[] = [
  // ---- Discovery / strategy ---------------------------------------------
  {
    name: 'seo_starter_kit',
    keyed: false,
    description:
      "For vibe-coders who just shipped a site and don't know what SEO files to add. Returns the exact contents of robots.txt, sitemap.xml, llms.txt, and JSON-LD structured data — plus a deployment checklist. The calling AI applies the files to the user's repo. No API key required.",
    inputSchema: zodToJsonSchema(SeoStarterKitInput),
    call: wrap(SeoStarterKitInput, seoStarterKit),
  },
  {
    name: 'find_topic_ideas',
    keyed: false,
    description:
      "For vibe-coders who don't know what to write about. Given a site URL, returns a structured brief telling your agent how to discover 15 article topics across informational / commercial / transactional intent, with prioritization. No API key required.",
    inputSchema: zodToJsonSchema(FindTopicIdeasInput),
    call: wrap(FindTopicIdeasInput, findTopicIdeas),
  },
  {
    name: 'find_keyword_gap',
    keyed: false,
    description:
      "Methodology for keyword-gap analysis against named competitors. If no competitors are given, instructs the agent to ask the user first. No API key required.",
    inputSchema: zodToJsonSchema(FindKeywordGapInput),
    call: wrap(FindKeywordGapInput, findKeywordGap),
  },
  {
    name: 'explain_seo_terms',
    keyed: false,
    description:
      "Reference glossary of 40+ SEO + AEO terms (SEO, AEO, FAQPage, JSON-LD, canonical, llms.txt, Core Web Vitals, E-E-A-T, helpful content update, doorway pages…). Filter by category: basics | aeo | technical | analytics | penalty | all. No API key required.",
    inputSchema: zodToJsonSchema(ExplainSeoTermsInput),
    call: wrap(ExplainSeoTermsInput, explainSeoTerms),
  },
  {
    name: 'install_skill',
    keyed: false,
    description:
      "Returns the exact install commands for the Ranki SEO + AEO Skill across every supported agent (Claude Code, Claude Desktop, Cursor, Windsurf, Claude.ai web Projects, generic AGENTS.md). No API key required.",
    inputSchema: zodToJsonSchema(InstallSkillInput),
    call: wrap(InstallSkillInput, installSkill),
  },
  // ---- Audit ------------------------------------------------------------
  {
    name: 'audit_seo',
    keyed: false,
    description:
      'Audit a URL for on-page SEO. Checks title length, meta description, H1 count, canonical, viewport, HTTPS, OpenGraph completeness, image alt coverage, internal link count, JSON-LD presence. Returns 0-100 scorecard with per-failure fix recipes. No API key required.',
    inputSchema: zodToJsonSchema(AuditSeoInput),
    call: wrap(AuditSeoInput, auditSeo),
  },
  {
    name: 'audit_aeo',
    keyed: false,
    description:
      'Audit a URL for Answer Engine Optimization. Checks FAQPage / Article JSON-LD, definitional intro (<90 words), author byline, llms.txt presence, robots.txt AI-bot access, answer-style H2/H3 headings, structured tables. No API key required.',
    inputSchema: zodToJsonSchema(AuditAeoInput),
    call: wrap(AuditAeoInput, auditAeo),
  },
  {
    name: 'audit_hidden_pages',
    keyed: false,
    description:
      "For 'which pages should I hide from search engines?' — classifies each path as robots-disallow / noindex / keep / unsure. Crawls a domain 1 level deep when given. Returns a ready-to-paste robots.txt block. No API key required.",
    inputSchema: zodToJsonSchema(AuditHiddenPagesInput),
    call: wrap(AuditHiddenPagesInput, auditHiddenPages),
  },
  {
    name: 'audit_speed',
    keyed: false,
    description:
      "Real Core Web Vitals + Lighthouse scores via Google PageSpeed Insights. Returns image opportunities (bytes saved per file), render-blocking JS/CSS, failing on-page SEO audits. The agent uses this to decide what to fix first — typically: call optimize_images next, convert the files, rewrite <img> markup. No API key required.",
    inputSchema: zodToJsonSchema(AuditSpeedInput),
    call: wrap(AuditSpeedInput, auditSpeed),
  },
  {
    name: 'audit_core_web_vitals',
    keyed: false,
    description:
      'Focused Core Web Vitals audit — one paragraph per metric (LCP / CLS / INP) with literal fix recipes. Picks the LCP element URL out of Lighthouse so the agent knows which file to optimize. No API key required.',
    inputSchema: zodToJsonSchema(AuditCwvInput),
    call: wrap(AuditCwvInput, auditCoreWebVitals),
  },
  // ---- Generate ---------------------------------------------------------
  {
    name: 'optimize_images',
    keyed: false,
    description:
      'For each image URL, returns target format (AVIF + WebP), responsive widths, alt-text suggestion, the literal sharp-cli / cwebp / avifenc command, and a ready-to-paste <picture> block with srcset. Agent converts the files locally. No API key required.',
    inputSchema: zodToJsonSchema(OptimizeImagesInput),
    call: wrap(OptimizeImagesInput, optimizeImages),
  },
  {
    name: 'generate_sitemap_xml',
    keyed: false,
    description: 'Generate a deploy-ready sitemap.xml from a URL list with current lastmod dates. No API key required.',
    inputSchema: zodToJsonSchema(GenerateSitemapXmlInput),
    call: wrap(GenerateSitemapXmlInput, generateSitemapXml),
  },
  {
    name: 'generate_llms_txt',
    keyed: false,
    description: 'Generate an llms.txt file from site name, summary and key pages. No API key required.',
    inputSchema: zodToJsonSchema(GenerateLlmsTxtInput),
    call: wrap(GenerateLlmsTxtInput, generateLlmsTxt),
  },
  {
    name: 'generate_robots_txt',
    keyed: false,
    description: 'Generate a robots.txt that explicitly allows or denies GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc. Default: allow all. No API key required.',
    inputSchema: zodToJsonSchema(GenerateRobotsTxtInput),
    call: wrap(GenerateRobotsTxtInput, generateRobotsTxt),
  },
  {
    name: 'propose_titles_metas',
    keyed: false,
    description:
      "5 title + meta description candidates per page across 5 angles (descriptive, benefit-led, question, specific, keyword-first). Reads each URL's title, h1 and first paragraph for context. Length-validated. No API key required.",
    inputSchema: zodToJsonSchema(ProposeTitlesMetasInput),
    call: wrap(ProposeTitlesMetasInput, proposeTitlesMetas),
  },
  // ---- Bridge to Ranki.io account (paid) --------------------------------
  {
    name: 'get_account',
    keyed: true,
    description: 'Whoami for your Ranki.io API key — name, email, plan, daily/monthly limits, current usage. Best first call after pasting a key. Requires X-API-Key.',
    inputSchema: zodToJsonSchema(GetAccountInput),
    call: wrap(GetAccountInput, getAccount),
  },
  {
    name: 'list_projects',
    keyed: true,
    description: 'List the projects in your Ranki.io account (id, name, url, status, language). Requires X-API-Key.',
    inputSchema: zodToJsonSchema(ListProjectsInput),
    call: wrap(ListProjectsInput, listProjects),
  },
  {
    name: 'list_articles',
    keyed: true,
    description:
      "Paginated index of articles in a Ranki.io project: nano_id, project_id, title, status, language, focus_keyword[], TOC outline, word count, SEO score, published_at. The agent then calls get_article(article_id) for the full HTML. Optional status filter. Requires X-API-Key.",
    inputSchema: zodToJsonSchema(ListArticlesInput),
    call: wrap(ListArticlesInput, listArticles),
  },
  {
    name: 'get_article',
    keyed: true,
    description: 'Fetch a single article by nano_id — title, content_html, focus keyword, TOC, image URLs, SEO score. Requires X-API-Key.',
    inputSchema: zodToJsonSchema(GetArticleInput),
    call: wrap(GetArticleInput, getArticle),
  },
  {
    name: 'list_rank_tracking',
    keyed: true,
    description:
      "Google Search Console summary for a project: 28-day totals, top 20 keywords by clicks, top 20 opportunity keywords (position > 10 with impressions — the easy wins). Requires X-API-Key + GSC connected.",
    inputSchema: zodToJsonSchema(ListRankTrackingInput),
    call: wrap(ListRankTrackingInput, listRankTracking),
  },
  {
    name: 'list_gsc_keywords',
    keyed: true,
    description: "Paginated full GSC keyword list with sort + min-impressions filter. Requires X-API-Key.",
    inputSchema: zodToJsonSchema(ListGscKeywordsInput),
    call: wrap(ListGscKeywordsInput, listGscKeywords),
  },
  {
    name: 'ai_visibility',
    keyed: true,
    description:
      "Recorded AI-citation snapshots for the project's tracked topics: which appeared in ChatGPT, Claude, Perplexity, Google AI Overviews at capture time. Counts and per-row detail. Requires X-API-Key.",
    inputSchema: zodToJsonSchema(AiVisibilityInput),
    call: wrap(AiVisibilityInput, aiVisibility),
  },
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function isKeyedTool(name: string): boolean {
  return TOOLS.find((t) => t.name === name)?.keyed ?? false;
}
