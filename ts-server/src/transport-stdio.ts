/**
 * stdio MCP transport — for local clients that spawn the server as a
 * subprocess (Claude Code, Claude Desktop, ChatGPT Desktop). Uses the
 * official @modelcontextprotocol/sdk so we get free protocol compliance.
 *
 * API key flows in via env (RANKI_API_KEY). Rate limiting is NOT
 * enforced for stdio mode — each user runs their own subprocess, so
 * there's no shared abuse vector. The hosted PHP server handles that
 * for the HTTP / multi-tenant case.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, getTool, isKeyedTool } from './tools/registry.js';
import { RankiApiError } from './ranki-api.js';

export async function runStdio(): Promise<void> {
  const server = new Server(
    { name: 'ranki', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
      throw new Error(`Invalid tool name: ${name}`);
    }
    const tool = getTool(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const apiKey = (process.env.RANKI_API_KEY ?? '').trim();
    if (isKeyedTool(name) && !apiKey) {
      throw new Error(
        `Tool \`${name}\` reads your private Ranki.io data and requires an API key.\n\n` +
          `1. Generate one at https://app.ranki.io/developer (30 seconds).\n` +
          `2. Set env.RANKI_API_KEY="rk_live_..." in your MCP client config.\n` +
          `3. Restart the client and retry.`,
      );
    }

    try {
      return await tool.call(args, apiKey);
    } catch (e) {
      if (e instanceof RankiApiError) throw new Error(e.userMessage);
      throw e;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stay alive — Server keeps the process running until stdin closes.
}
