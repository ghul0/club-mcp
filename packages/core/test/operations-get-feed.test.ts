import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import { getFeed } from '../src/operations/get-feed.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamNotFound } from '../src/errors.js';

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
  it('returns ok({ feed }) on happy path with numeric id', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    const result = await getFeed(client, { feed_id: 42 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.feed.id).toBe(42);
    expect(spy).toHaveBeenCalledWith('/feeds/42/by-id', expect.anything());
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

  it('propagates upstream_not_found from client', async () => {
    const { client } = createMockClient(async () => err(upstreamNotFound('upstream returned 404')));

    const result = await getFeed(client, { feed_id: 999 });

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

  it('accepts include_comments + comment_limit per docs (deferred fetch in Fix-G)', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    const result = await getFeed(client, {
      feed_id: 42,
      include_comments: true,
      comment_limit: 200,
    });

    expect(isOk(result)).toBe(true);
    expect(spy).toHaveBeenCalledWith('/feeds/42/by-id', expect.anything());
  });
});
