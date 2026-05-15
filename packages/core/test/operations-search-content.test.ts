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
    expect(result.value.counts.members).toBe(2);
    expect(result.value.counts.posts).toBe(3);
    expect(result.value.counts.comments).toBe(2);
    const commentResults = result.value.results.filter((r) => r.kind === 'comment');
    const commentIds = commentResults
      .map((r) => r.comment?.id)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    expect(commentIds).toEqual([100, 102]);
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
    expect(result.value.counts.members).toBe(1);
    expect(result.value.counts.posts).toBe(0);
    expect(result.value.counts.comments).toBe(0);
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

  it('rejects a query with control characters (Bucket D hardening)', async () => {
    const { client } = makeClient(() => {
      throw new Error('should not call');
    });
    const result = await searchContent(client, { query: 'abcdef' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('rejects a query with leading or trailing whitespace (Bucket D trim)', async () => {
    const { client } = makeClient(() => {
      throw new Error('should not call');
    });
    const result = await searchContent(client, { query: '  hello  ' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('caps combined results at the global limit (members fill first, posts next)', async () => {
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
      limit: 5,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const total = result.value.counts.members + result.value.counts.posts + result.value.counts.comments;
    expect(total).toBe(5);
    expect(result.value.results.length).toBe(5);
    expect(result.value.counts.members).toBe(5);
    expect(result.value.counts.posts).toBe(0);
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
    expect(result.value.counts.comments).toBe(2);
    const hits = result.value.results.filter((r) => r.kind === 'comment');
    for (const item of hits) {
      expect(String(item.comment?.message_text ?? '')).toContain('needle');
    }
  });

  it('reports scan_metadata.scanned_comments and respects the 2000 hard cap (Bucket E)', async () => {
    let totalCommentsServed = 0;
    const feeds = Array.from({ length: 30 }, (_, i) => feedFixture(i + 1, `post ${(i + 1).toString()}`));
    const { client } = makeClient((path) => {
      if (path === '/feeds') {
        return { ok: true, value: { feeds } };
      }
      if (/^\/feeds\/\d+\/comments$/.exec(path)) {
        const comments = Array.from({ length: 100 }, (_, j) => {
          totalCommentsServed += 1;
          return commentFixture(totalCommentsServed, `comment body ${totalCommentsServed.toString()}`);
        });
        return { ok: true, value: { comments } };
      }
      throw new Error(`unexpected: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'comment',
      include_members: false,
      include_posts: false,
      include_comments: true,
      limit: 100,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.scan_metadata.scanned_comments).toBeLessThanOrEqual(2000);
    expect(result.value.scan_metadata.scanned_comments).toBeGreaterThan(0);
  });

  it('filters comments by since timestamp when provided (Bucket A3)', async () => {
    const { client } = makeClient((path) => {
      if (path === '/feeds') {
        return { ok: true, value: { feeds: [feedFixture(1, 'p1')] } };
      }
      if (path === '/feeds/1/comments') {
        return {
          ok: true,
          value: {
            comments: [
              { id: 1, message: 'needle one', created_at: '2025-01-01 00:00:00' },
              { id: 2, message: 'needle two', created_at: '2026-06-01 12:00:00' },
            ],
          },
        };
      }
      throw new Error(`unexpected: ${path}`);
    });

    const result = await searchContent(client, {
      query: 'needle',
      since: '2026-01-01',
      include_members: false,
      include_posts: false,
      include_comments: true,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const ids = result.value.results
      .filter((r) => r.kind === 'comment')
      .map((r) => r.comment?.id);
    expect(ids).toEqual([2]);
    expect(result.value.scan_metadata.since).toBe('2026-01-01 00:00:00');
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
