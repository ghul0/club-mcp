import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Result } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import type { GetClient } from '../src/http/client.js';
import { getFeed } from '../src/operations/get-feed.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamNotFound, externalService } from '../src/errors.js';

const sampleFeed = {
  id: 42,
  slug: 'hello',
  title: 'Hello',
  message: 'world',
  created_at: '2026-01-01T00:00:00Z',
};

const createMockClient = (
  impl: GetClient['get'],
): { client: GetClient; spy: ReturnType<typeof vi.fn> } => {
  const spy = vi.fn(impl);
  return { client: { get: spy as unknown as GetClient['get'] }, spy };
};

describe('getFeed', () => {
  it('returns ok({ feed }) on happy path with include_comments=false', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    const result = await getFeed(client, { feed_id: 42, include_comments: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.feed.id).toBe(42);
    expect(result.value.comments).toBeUndefined();
    expect(spy).toHaveBeenCalledWith('/feeds/42/by-id', expect.anything());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rejects string feed_id (doc spec: positive integer only)', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    const result = await getFeed(client, {
      feed_id: '42' as unknown as number,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns validation error for non-positive numeric feed_id', async () => {
    const { client, spy } = createMockClient(async () => ok({ feed: sampleFeed }));

    const result = await getFeed(client, { feed_id: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('propagates upstream_not_found from client (feed-by-id)', async () => {
    const { client } = createMockClient(async () => err(upstreamNotFound('upstream returned 404')));

    const result = await getFeed(client, { feed_id: 999, include_comments: false });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_not_found');
  });

  it('rejects non-integer feed_id (doc spec: integer only)', async () => {
    const { client, spy } = createMockClient(async () => ok({ feed: sampleFeed }));

    const result = await getFeed(client, {
      feed_id: 3.5 as unknown as number,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches comments and attaches them when include_comments=true (default)', async () => {
    const sampleComments = [
      { id: 1, post_id: 42, created_at: '2026-01-01 12:00:00', message: 'first' },
      { id: 2, post_id: 42, created_at: '2026-01-01 13:00:00', message: 'second' },
    ];
    const spy = vi.fn(async (
      path: string,
    ): Promise<Result<unknown, AppError>> => {
      if (path === '/feeds/42/by-id') {
        return ok({ feed: sampleFeed });
      }
      if (path === '/feeds/42/comments') {
        return ok({ comments: { data: sampleComments, has_more: false } });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getFeed(client, { feed_id: 42 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.feed.id).toBe(42);
    expect(result.value.comments).toHaveLength(2);
    expect(result.value.comments?.[0]?.id).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('respects comment_limit cap', async () => {
    const spy = vi.fn(async (
      path: string,
      _schema: unknown,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<unknown, AppError>> => {
      if (path === '/feeds/42/by-id') {
        return ok({ feed: sampleFeed });
      }
      if (path === '/feeds/42/comments') {
        const page = Number(query?.page ?? 1);
        const start = (page - 1) * 3 + 1;
        return ok({
          comments: {
            data: [
              { id: start, post_id: 42, created_at: '2026-01-01 12:00:00', message: 'c' },
              { id: start + 1, post_id: 42, created_at: '2026-01-01 12:00:00', message: 'c' },
              { id: start + 2, post_id: 42, created_at: '2026-01-01 12:00:00', message: 'c' },
            ],
            has_more: true,
          },
        });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getFeed(client, { feed_id: 42, comment_limit: 5 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.comments).toHaveLength(5);
  });

  it('propagates upstream error from comments sub-fetch', async () => {
    const failure = externalService('comments-down');
    const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/feeds/42/by-id') {
        return ok({ feed: sampleFeed });
      }
      if (path === '/feeds/42/comments') {
        return err(failure);
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getFeed(client, { feed_id: 42 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toBe('comments-down');
  });
});
