import { describe, expect, it } from 'vitest';
import { ToolSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { listToolDefinitions } from '../src/tools.js';

describe('MCP contract: tool definitions conform to @modelcontextprotocol/sdk schema', () => {
  const tools = listToolDefinitions();

  it('every tool passes ToolSchema.safeParse', () => {
    for (const tool of tools) {
      const parsed = ToolSchema.safeParse(tool);
      if (!parsed.success) {
        throw new Error(
          `Tool ${tool.name} fails ToolSchema: ${JSON.stringify(parsed.error.format(), null, 2)}`,
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('the full tools/list envelope passes ListToolsResultSchema', () => {
    const envelope = { tools };
    const parsed = ListToolsResultSchema.safeParse(envelope);
    if (!parsed.success) {
      throw new Error(
        `ListToolsResult fails: ${JSON.stringify(parsed.error.format(), null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('every tool name uses club_ prefix', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^club_/);
    }
  });

  it('every tool has readOnlyHint: true (ADR-006)', () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it('every tool has openWorldHint: false', () => {
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint).toBe(false);
    }
  });

  it('tool count is exactly 13', () => {
    expect(tools.length).toBe(13);
  });
});
