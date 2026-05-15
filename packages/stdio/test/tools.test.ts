import { describe, expect, it, vi } from 'vitest';
import { ok, err, validationError, type GetClient } from '@hhc-mcp/core';
import { callTool, listToolDefinitions } from '../src/tools.js';

const EXPECTED_TOOL_NAMES: readonly string[] = [
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
];

const buildMockClient = (
  responses: Record<string, unknown> = {},
): { client: GetClient; calls: { path: string; query?: Record<string, unknown> }[] } => {
  const calls: { path: string; query?: Record<string, unknown> }[] = [];
  const client: GetClient = {
    get: vi.fn((path: string, _schema: unknown, query?: Record<string, unknown>) => {
      calls.push(query === undefined ? { path } : { path, query });
      const body = responses[path] ?? responses['*'];
      if (body === undefined) {
        return Promise.resolve(err(validationError('no mock for path ' + path)));
      }
      return Promise.resolve(ok(body));
    }) as unknown as GetClient['get'],
  };
  return { client, calls };
};

describe('listToolDefinitions', () => {
  it('returns all 13 expected tools with the club_ prefix', () => {
    const defs = listToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toHaveLength(EXPECTED_TOOL_NAMES.length);
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(names).toContain(expected);
    }
    for (const name of names) {
      expect(name.startsWith('club_')).toBe(true);
    }
  });

  it('annotates every tool as readOnly and closed-world', () => {
    const defs = listToolDefinitions();
    for (const def of defs) {
      expect(def.annotations.readOnlyHint).toBe(true);
      expect(def.annotations.openWorldHint).toBe(false);
      expect(def.annotations.destructiveHint).toBe(false);
      expect(def.annotations.idempotentHint).toBe(true);
    }
  });

  it('every tool has an object inputSchema and a non-empty description', () => {
    const defs = listToolDefinitions();
    for (const def of defs) {
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.inputSchema).toBeTypeOf('object');
      expect((def.inputSchema as { type?: unknown }).type).toBe('object');
    }
  });

  it('produces unique tool names', () => {
    const defs = listToolDefinitions();
    const set = new Set(defs.map((d) => d.name));
    expect(set.size).toBe(defs.length);
  });
});

describe('callTool', () => {
  it('returns a validation error envelope for an unknown tool name', async () => {
    const { client } = buildMockClient();
    const result = await callTool({ client }, 'club_does_not_exist', {});
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error: { code: string; retryable: boolean } };
    expect(structured.error.code).toBe('validation');
    expect(structured.error.retryable).toBe(false);
  });

  it('routes club_search_members to the searchMembers operation and hits /members', async () => {
    const { client, calls } = buildMockClient({
      '/members': { members: [] },
    });
    const result = await callTool({ client }, 'club_search_members', {
      query: 'thomas',
      limit: 5,
    });
    expect(result.isError).toBeUndefined();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.path).toBe('/members');
  });

  it('returns a validation error envelope when operation input is invalid', async () => {
    const { client } = buildMockClient();
    const result = await callTool({ client }, 'club_search_members', {});
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { error: { code: string } };
    expect(structured.error.code).toBe('validation');
  });

  it('validates output shape on success (Bucket C defense in depth)', async () => {
    const { client } = buildMockClient({
      '/members': { members: [{ user_id: 1, username: 'thomas', display_name: 'Thomas' }] },
    });
    const result = await callTool({ client }, 'club_search_members', { query: 'thomas' });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { result: { members: unknown[] } };
    expect(structured.result.members).toHaveLength(1);
  });

  it('returns external_service error when output is structurally broken (defense in depth)', async () => {
    const { client } = buildMockClient({
      '/notifications/unread': { notifications: [{ id: 'not-a-number', created_at: '2026-05-15' }] },
    });
    const result = await callTool({ client }, 'club_get_unread_notifications', {});
    expect(result.isError).toBe(true);
  });
});
