import { describe, expect, it } from 'vitest';
import { listToolDefinitions } from '../src/tools.js';

const EXPECTED_TOOL_NAMES = [
  'club_search_members',
  'club_get_profile',
  'club_get_my_profile',
  'club_list_spaces',
  'club_list_courses',
  'club_get_feed',
  'club_get_feed_comments',
  'club_get_user_comments',
  'club_get_recent_posts',
  'club_get_recent_comments',
  'club_get_since_summary',
  'club_get_unread_notifications',
  'club_search_content',
] as const;

describe('tools/list snapshot', () => {
  it('exposes exactly 13 tools', () => {
    const defs = listToolDefinitions();
    expect(defs).toHaveLength(13);
    expect(EXPECTED_TOOL_NAMES).toHaveLength(13);
  });

  it('emits tools in the canonical registration order with the club_ prefix', () => {
    const defs = listToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toEqual([...EXPECTED_TOOL_NAMES]);
    for (const name of names) {
      expect(name.startsWith('club_')).toBe(true);
    }
  });

  it('produces a stable snapshot of the full tools/list output', () => {
    const defs = listToolDefinitions();
    expect(defs).toMatchSnapshot();
  });

  it('sets all four MCP hint flags on every tool', () => {
    const defs = listToolDefinitions();
    for (const def of defs) {
      const a = def.annotations;
      expect(Object.prototype.hasOwnProperty.call(a, 'readOnlyHint')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(a, 'destructiveHint')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(a, 'idempotentHint')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(a, 'openWorldHint')).toBe(true);
      expect(a.readOnlyHint).toBe(true);
      expect(a.destructiveHint).toBe(false);
      expect(a.idempotentHint).toBe(true);
      expect(a.openWorldHint).toBe(false);
    }
  });

  it('exposes a JSON Schema object inputSchema with a properties record on every tool', () => {
    const defs = listToolDefinitions();
    for (const def of defs) {
      const schema = def.inputSchema as {
        type?: unknown;
        properties?: unknown;
      };
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeTypeOf('object');
      expect(schema.properties).not.toBeNull();
    }
  });
});
