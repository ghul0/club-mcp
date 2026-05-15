import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import { isErr, isOk } from '../src/result.js';
import { searchContent } from '../src/operations/search-content.js';

type GetArgs = [string, z.ZodTypeAny, Record<string, string | number | boolean | undefined> | undefined];

type Handler = (path: string, query: Record<string, string | number | boolean | undefined> | undefined) =>
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

const makeClient = (handler: Handler): { client: GetClient; calls: GetArgs[] } => {
  const calls: GetArgs[] = [];
  const get = vi.fn(
    async (
      path: string,
      _schema: z.ZodTypeAny,
      query?: Record<string, string | number | boolean | undefined>,
    ) => {
      calls.push([path, _schema, query]);
      return handler(path, query);
    },
  );
  return { client: { get } as unknown as GetClient, calls };
};

const memberFixture = (id: number, name: string) => ({
  user_id: id,
  display_name: name,
  username: name.toLowerCase(),
});

const feedFixture = (id: number, message: string) => ({
  id,
  message,
  created_at: '2025-01-01T00:00:00Z',
});

const commentFixture = (id: number, message: string) => ({
  id,
  message,
  created_at: '2025-01-02T00:00:00Z',
});

describe('searchContent', () => {
  it('runs all three scopes in parallel and returns combined results', async () => {
    const { client, calls } = makeClient((path) => {
      if (path === '/members') {
        return { ok: true, value: { members: [memberFixture(1, 'Alice'), memberFixture(2, 'Bob')] } };
      }
      if (path === '/feeds') {
        return {
          ok: true,
          value: {
            feeds: [
              feedFixture(10, 'startup growth tips'),
              feedFixture(11, 'general topic'),
              feedFixture(12, 'startup launch story'),
            ],
          },
        };
      }
      if (path === '/feeds/10/comments') {
        return { ok: true, value: { comments: [commentFixture(100, 'I love startup grind')] } };
      }
      if (path === '/feeds/11/comments') {
        return { ok: true, value: { comments: [commentFixture(101, 'totally unrelated')] } };
      }
      if (path === '/feeds/12/comments') {
        return { ok: true, value: { comments: [commentFixture(102, 'another startup mention')] } };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await searchContent(client, { query: 'startup' });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.query).toBe('startup');
    expect(result.value.members).toHaveLength(2);
    expect(result.value.posts).toHaveLength(3);
    expect(result.value.comments).toHaveLength(2);
    expect(result.value.comments.map((c) => c.comment.id).sort()).toEqual([100, 102]);
    expect(calls.some(([p]) => p === '/members')).toBe(true);
    expect(calls.some(([p]) => p === '/feeds')).toBe(true);
  });

  it('runs only members when include_members=true and the others=false', async () => {
    const { client, calls } = makeClient((path) => {
      if (path === '/members') {
        return { ok: true, value: { members: [memberFixture(1, 'Alice')] } };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'alice',
      include_members: true,
      include_posts: false,
      include_comments: false,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.members).toHaveLength(1);
    expect(result.value.posts).toEqual([]);
    expect(result.value.comments).toEqual([]);
    expect(calls.every(([p]) => p === '/members')).toBe(true);
  });

  it('returns validationError when query is empty', async () => {
    const { client } = makeClient(() => {
      throw new Error('should not call');
    });
    const result = await searchContent(client, { query: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('accepts a 200-char query (doc max)', async () => {
    const { client } = makeClient(() => ({ ok: true, value: { members: [] } }));
    const result = await searchContent(client, {
      query: 'a'.repeat(200),
      include_posts: false,
      include_comments: false,
    });
    expect(isOk(result)).toBe(true);
  });

  it('rejects a query exceeding 200 chars (doc max)', async () => {
    const { client } = makeClient(() => {
      throw new Error('should not call');
    });
    const result = await searchContent(client, { query: 'a'.repeat(201) });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('caps members and posts at limit', async () => {
    const manyMembers = Array.from({ length: 10 }, (_, i) => memberFixture(i + 1, `User${(i + 1).toString()}`));
    const manyFeeds = Array.from({ length: 10 }, (_, i) => feedFixture(i + 1, `topic ${(i + 1).toString()}`));
    const { client } = makeClient((path) => {
      if (path === '/members') return { ok: true, value: { members: manyMembers } };
      if (path === '/feeds') return { ok: true, value: { feeds: manyFeeds } };
      throw new Error(`unexpected: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'topic',
      include_comments: false,
      limit: 3,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.members).toHaveLength(3);
    expect(result.value.posts).toHaveLength(3);
  });

  it('filters comments by query substring and caps globally', async () => {
    const { client } = makeClient((path) => {
      if (path === '/feeds') {
        return {
          ok: true,
          value: { feeds: [feedFixture(1, 'p1'), feedFixture(2, 'p2'), feedFixture(3, 'p3')] },
        };
      }
      if (path === '/feeds/1/comments') {
        return {
          ok: true,
          value: {
            comments: [
              commentFixture(10, 'foo bar'),
              commentFixture(11, 'needle here'),
            ],
          },
        };
      }
      if (path === '/feeds/2/comments') {
        return {
          ok: true,
          value: { comments: [commentFixture(20, 'no match')] },
        };
      }
      if (path === '/feeds/3/comments') {
        return {
          ok: true,
          value: {
            comments: [
              commentFixture(30, 'needle again'),
              commentFixture(31, 'another needle'),
            ],
          },
        };
      }
      throw new Error(`unexpected: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'needle',
      include_members: false,
      include_posts: false,
      include_comments: true,
      limit: 2,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.comments).toHaveLength(2);
    for (const item of result.value.comments) {
      expect(String(item.comment.message)).toContain('needle');
    }
  });

  it('propagates error when a scope sub-request fails', async () => {
    const { client } = makeClient((path) => {
      if (path === '/members') {
        return {
          ok: false,
          error: { code: 'upstream_unauthorized', message: 'no auth', retryable: false },
        };
      }
      if (path === '/feeds') {
        return { ok: true, value: { feeds: [] } };
      }
      throw new Error(`unexpected: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'x',
      include_comments: false,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_unauthorized');
  });
});
