import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, isKeyedTool } from '../src/tools/registry.js';

describe('registry', () => {
  it('exposes 22 tools', () => {
    expect(TOOLS.length).toBe(22);
  });

  it('marks 7 tools as keyed', () => {
    expect(TOOLS.filter((t) => t.keyed).length).toBe(7);
  });

  it('marks 15 tools as free', () => {
    expect(TOOLS.filter((t) => !t.keyed).length).toBe(15);
  });

  it('each tool has a unique name', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tool names match the allowlist regex', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it('getTool returns undefined for unknown', () => {
    expect(getTool('not_a_tool')).toBeUndefined();
  });

  it('isKeyedTool reflects definition', () => {
    expect(isKeyedTool('audit_seo')).toBe(false);
    expect(isKeyedTool('list_articles')).toBe(true);
    expect(isKeyedTool('list_rank_tracking')).toBe(true);
    expect(isKeyedTool('ai_visibility')).toBe(true);
  });

  it('every tool has a non-empty description and an object inputSchema', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});
