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

    const result = await getFeed(client, { feedId: 42 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.feed.id).toBe(42);
    expect(spy).toHaveBeenCalledWith('/feeds/42/by-id', expect.anything());
  });

  it('accepts string ids and forwards them in the path', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    const result = await getFeed(client, { feedId: '42' });

    expect(isOk(result)).toBe(true);
    expect(spy).toHaveBeenCalledWith('/feeds/42/by-id', expect.anything());
  });

  it('returns validation error for empty string feedId', async () => {
    const { client, spy } = createMockClient(async () => ok({ feed: sampleFeed }));

    const result = await getFeed(client, { feedId: '' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns validation error for non-positive numeric feedId', async () => {
    const { client, spy } = createMockClient(async () => ok({ feed: sampleFeed }));

    const result = await getFeed(client, { feedId: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('propagates upstream_not_found from client', async () => {
    const { client } = createMockClient(async () => err(upstreamNotFound('upstream returned 404')));

    const result = await getFeed(client, { feedId: 999 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_not_found');
  });

  it('url-encodes string feedId path segment', async () => {
    const { client, spy } = createMockClient(async <TSchema extends z.ZodTypeAny>(
      _path: string,
      schema: TSchema,
    ) => ok(schema.parse({ feed: sampleFeed })));

    await getFeed(client, { feedId: 'a/b' });

    expect(spy).toHaveBeenCalledWith('/feeds/a%2Fb/by-id', expect.anything());
  });
});
