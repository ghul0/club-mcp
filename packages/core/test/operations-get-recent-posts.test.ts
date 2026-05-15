import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import { err, ok } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { externalService } from '../src/errors.js';
import type { Feed } from '../src/schemas/feeds.js';
import { getRecentPosts } from '../src/operations/get-recent-posts.js';

interface FeedsEnvelope {
  readonly feeds: {
    readonly data: ReadonlyArray<Feed>;
    readonly has_more?: boolean;
  };
}

const NOW = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));

const makeFeed = (id: number, createdAt: string): Feed => ({
  id,
  slug: `slug-${String(id)}`,
  title: `Title ${String(id)}`,
  created_at: createdAt,
});

interface MockClientState {
  readonly calls: Array<{ path: string; query?: Record<string, string | number | boolean | undefined> }>;
}

const makeClient = (
  responder: (
    page: number,
    perPage: number,
  ) => Result<FeedsEnvelope, AppError>,
): { client: GetClient; state: MockClientState } => {
  const state: MockClientState = { calls: [] };
  const client: GetClient = {
    get: vi.fn(
      async <TSchema extends z.ZodTypeAny>(
        path: string,
        schema: TSchema,
        query?: Record<string, string | number | boolean | undefined>,
      ): Promise<Result<z.infer<TSchema>, AppError>> => {
        state.calls.push({ path, query });
        const page = Number(query?.page ?? 1);
        const perPage = Number(query?.per_page ?? 100);
        const outcome = responder(page, perPage);
        if (!outcome.ok) {
          return err(outcome.error);
        }
        const parsed = schema.safeParse(outcome.value);
        if (!parsed.success) {
          return err(externalService('schema validation failed in mock'));
        }
        return ok(parsed.data as z.infer<TSchema>);
      },
    ),
  };
  return { client, state };
};

describe('getRecentPosts', () => {
  it('returns posts created at or after the since timestamp', async () => {
    const feeds: ReadonlyArray<Feed> = [
      makeFeed(1, '2026-05-15 11:00:00'),
      makeFeed(2, '2026-05-15 10:00:00'),
      makeFeed(3, '2026-05-15 09:30:00'),
    ];
    const { client, state } = makeClient(() =>
      ok({ feeds: { data: feeds.slice(), has_more: false } }),
    );

    const result = await getRecentPosts(client, { since: '2026-05-15 09:00:00' }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.posts.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(result.value.since).toBe('2026-05-15 09:00:00');
    expect(state.calls.length).toBe(1);
    expect(state.calls[0]?.path).toBe('/feeds');
  });

  it('filters out posts older than the since threshold', async () => {
    const feeds: ReadonlyArray<Feed> = [
      makeFeed(10, '2026-05-15 11:00:00'),
      makeFeed(11, '2026-05-15 10:00:00'),
      makeFeed(12, '2026-05-15 08:00:00'),
      makeFeed(13, '2026-05-14 18:00:00'),
    ];
    const { client } = makeClient(() =>
      ok({ feeds: { data: feeds.slice(), has_more: false } }),
    );

    const result = await getRecentPosts(client, { since: '2026-05-15 09:00:00' }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.posts.map((p) => p.id)).toEqual([10, 11]);
  });

  it('propagates a validation error when since is invalid', async () => {
    const { client, state } = makeClient(() =>
      ok({ feeds: { data: [], has_more: false } }),
    );

    const result = await getRecentPosts(client, { since: 'not-a-date' }, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(state.calls.length).toBe(0);
  });

  it('propagates a validation error when since fails the input schema (empty)', async () => {
    const { client, state } = makeClient(() =>
      ok({ feeds: { data: [], has_more: false } }),
    );

    const result = await getRecentPosts(
      client,
      { since: '' } as unknown as { since: string },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(state.calls.length).toBe(0);
  });

  it('respects the limit cap (post-filter cap)', async () => {
    const pageOne: ReadonlyArray<Feed> = [
      makeFeed(1, '2026-05-15 11:30:00'),
      makeFeed(2, '2026-05-15 11:20:00'),
      makeFeed(3, '2026-05-15 11:10:00'),
    ];
    const pageTwo: ReadonlyArray<Feed> = [
      makeFeed(4, '2026-05-15 11:00:00'),
      makeFeed(5, '2026-05-15 10:50:00'),
      makeFeed(6, '2026-05-15 10:40:00'),
    ];
    const { client, state } = makeClient((page) => {
      if (page === 1) {
        return ok({ feeds: { data: pageOne.slice(), has_more: true } });
      }
      if (page === 2) {
        return ok({ feeds: { data: pageTwo.slice(), has_more: false } });
      }
      return ok({ feeds: { data: [], has_more: false } });
    });

    const result = await getRecentPosts(
      client,
      { since: '2026-05-15 00:00:00', limit: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.posts.length).toBe(4);
    expect(result.value.posts.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(state.calls.length).toBe(2);
  });

  it('returns an empty list when the upstream returns no feeds', async () => {
    const { client } = makeClient(() =>
      ok({ feeds: { data: [], has_more: false } }),
    );

    const result = await getRecentPosts(client, { since: '2026-05-15 00:00:00' }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.posts).toEqual([]);
    expect(result.value.since).toBe('2026-05-15 00:00:00');
  });

  it('stops paginating early when the oldest item on a page is older than since', async () => {
    const pageOne: ReadonlyArray<Feed> = [
      makeFeed(1, '2026-05-15 11:30:00'),
      makeFeed(2, '2026-05-15 11:00:00'),
    ];
    const pageTwo: ReadonlyArray<Feed> = [
      makeFeed(3, '2026-05-15 10:30:00'),
      makeFeed(4, '2026-05-15 08:00:00'),
    ];
    const { client, state } = makeClient((page) => {
      if (page === 1) {
        return ok({ feeds: { data: pageOne.slice(), has_more: true } });
      }
      if (page === 2) {
        return ok({ feeds: { data: pageTwo.slice(), has_more: true } });
      }
      return ok({
        feeds: { data: [makeFeed(99, '2025-01-01 00:00:00')], has_more: true },
      });
    });

    const result = await getRecentPosts(
      client,
      { since: '2026-05-15 09:00:00' },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.posts.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(state.calls.length).toBe(2);
  });

  it('forwards upstream errors from the client', async () => {
    const failure = externalService('boom');
    const { client } = makeClient(() => err(failure));

    const result = await getRecentPosts(
      client,
      { since: '2026-05-15 00:00:00' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('external_service');
    expect(result.error.message).toBe('boom');
  });
});
