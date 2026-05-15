import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { err, ok } from '../src/result.js';
import { externalService } from '../src/errors.js';
import { FeedsListResponseSchema } from '../src/schemas/feeds.js';
import { CommentsResponseSchema } from '../src/schemas/comments.js';
import { getRecentComments } from '../src/operations/get-recent-comments.js';

type FeedsListResponse = z.infer<typeof FeedsListResponseSchema>;
type CommentsResponse = z.infer<typeof CommentsResponseSchema>;

const NOW = new Date('2024-06-15T12:00:00.000Z');

const feed = (
  id: number,
  createdAt: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  created_at: createdAt,
  title: `Post ${String(id)}`,
  ...extras,
});

const comment = (
  id: number,
  postId: number,
  createdAt: string,
): Record<string, unknown> => ({
  id,
  post_id: postId,
  created_at: createdAt,
  message: `c${String(id)}`,
});

interface FeedPage {
  readonly data: ReadonlyArray<Record<string, unknown>>;
  readonly has_more: boolean;
}

interface CommentPage {
  readonly data: ReadonlyArray<Record<string, unknown>>;
  readonly has_more: boolean;
}

const feedsResponse = (page: FeedPage): FeedsListResponse =>
  ({ feeds: { data: [...page.data], has_more: page.has_more } }) as FeedsListResponse;

const commentsResponse = (page: CommentPage): CommentsResponse =>
  ({ comments: { data: [...page.data], has_more: page.has_more } }) as CommentsResponse;

interface FixtureSpec {
  readonly feedPages: ReadonlyArray<FeedPage>;
  readonly commentsByFeedId: ReadonlyMap<number, ReadonlyArray<CommentPage>>;
  readonly commentsError?: ReadonlyMap<number, AppError>;
}

const makeClient = (spec: FixtureSpec): GetClient => {
  const get = vi.fn(
    async (
      path: string,
      _schema: unknown,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<unknown, AppError>> => {
      const pageNum = typeof query?.page === 'number' ? query.page : 1;
      if (path === '/feeds') {
        const p = spec.feedPages[pageNum - 1];
        if (!p) {
          return ok(feedsResponse({ data: [], has_more: false }));
        }
        return ok(feedsResponse(p));
      }
      const commentMatch = /^\/feeds\/(\d+)\/comments$/.exec(path);
      if (commentMatch) {
        const feedId = Number(commentMatch[1]);
        const errOverride = spec.commentsError?.get(feedId);
        if (errOverride) {
          return err(errOverride);
        }
        const pages = spec.commentsByFeedId.get(feedId);
        const p = pages?.[pageNum - 1];
        if (!p) {
          return ok(commentsResponse({ data: [], has_more: false }));
        }
        return ok(commentsResponse(p));
      }
      return err(externalService(`unexpected path ${path}`));
    },
  );
  return { get } as unknown as GetClient;
};

describe('getRecentComments', () => {
  it('returns flattened comments across multiple feeds (happy path)', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [
            feed(101, '2024-06-15 11:00:00'),
            feed(102, '2024-06-15 10:00:00'),
          ],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          101,
          [
            {
              data: [
                comment(9001, 101, '2024-06-15 11:30:00'),
                comment(9002, 101, '2024-06-15 11:31:00'),
              ],
              has_more: false,
            },
          ],
        ],
        [
          102,
          [
            {
              data: [
                comment(9003, 102, '2024-06-15 11:32:00'),
                comment(9004, 102, '2024-06-15 11:33:00'),
              ],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(4);
    expect(result.value.since).toBe('2024-06-15 00:00:00');
    const ids = result.value.comments.map((c) => c.comment.id).sort((a, b) => a - b);
    expect(ids).toEqual([9001, 9002, 9003, 9004]);
    for (const item of result.value.comments) {
      expect(item.feed.id).toBeGreaterThan(0);
      expect(typeof item.feed.title).toBe('string');
    }
  });

  it('filters out comments older than since', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [feed(201, '2024-06-15 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          201,
          [
            {
              data: [
                comment(5001, 201, '2024-06-14 09:00:00'),
                comment(5002, 201, '2024-06-15 11:30:00'),
              ],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(1);
    expect(result.value.comments[0]?.comment.id).toBe(5002);
  });

  it('rejects invalid since with a validation error', async () => {
    const client = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getRecentComments(
      client,
      { since: 'not-a-date', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
  });

  it('rejects empty since with a validation error', async () => {
    const client = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getRecentComments(
      client,
      { since: '', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
  });

  it('respects scan_feed_limit cap and stops fetching feeds early', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [
            feed(301, '2024-06-15 11:00:00'),
            feed(302, '2024-06-15 10:00:00'),
            feed(303, '2024-06-15 09:00:00'),
          ],
          has_more: true,
        },
      ],
      commentsByFeedId: new Map([
        [
          301,
          [{ data: [comment(7001, 301, '2024-06-15 11:30:00')], has_more: false }],
        ],
        [
          302,
          [{ data: [comment(7002, 302, '2024-06-15 11:31:00')], has_more: false }],
        ],
        [
          303,
          [{ data: [comment(7003, 303, '2024-06-15 11:32:00')], has_more: false }],
        ],
      ]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 2, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(2);
    const ids = result.value.comments.map((c) => c.comment.id).sort((a, b) => a - b);
    expect(ids).toEqual([7001, 7002]);
  });

  it('stops scanning feeds once an older post is encountered', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [
            feed(401, '2024-06-15 11:00:00'),
            feed(402, '2024-06-10 11:00:00'),
            feed(403, '2024-06-09 11:00:00'),
          ],
          has_more: true,
        },
      ],
      commentsByFeedId: new Map([
        [
          401,
          [{ data: [comment(6001, 401, '2024-06-15 11:30:00')], has_more: false }],
        ],
        [
          402,
          [{ data: [comment(6002, 402, '2024-06-15 11:31:00')], has_more: false }],
        ],
        [
          403,
          [{ data: [comment(6003, 403, '2024-06-15 11:32:00')], has_more: false }],
        ],
      ]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(1);
    expect(result.value.comments[0]?.comment.id).toBe(6001);
  });

  it('respects comment_per_feed_limit cap', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [feed(501, '2024-06-15 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          501,
          [
            {
              data: [
                comment(8001, 501, '2024-06-15 11:30:00'),
                comment(8002, 501, '2024-06-15 11:31:00'),
                comment(8003, 501, '2024-06-15 11:32:00'),
              ],
              has_more: true,
            },
            {
              data: [comment(8004, 501, '2024-06-15 11:33:00')],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 2, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(2);
  });

  it('returns empty comments when no recent posts exist', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [feed(601, '2024-06-10 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map(),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toEqual([]);
    expect(result.value.since).toBe('2024-06-15 00:00:00');
  });

  it('propagates an error from a per-post comments fetch', async () => {
    const failure = externalService('boom');
    const client = makeClient({
      feedPages: [
        {
          data: [
            feed(701, '2024-06-15 11:00:00'),
            feed(702, '2024-06-15 10:00:00'),
          ],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          701,
          [{ data: [comment(7701, 701, '2024-06-15 11:30:00')], has_more: false }],
        ],
      ]),
      commentsError: new Map([[702, failure]]),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('external_service');
    expect(result.error.message).toBe('boom');
  });

  it('propagates an error from the feeds listing', async () => {
    const failure = externalService('feeds-down');
    const get = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/feeds') {
        return err(failure);
      }
      return err(externalService(`unexpected path ${path}`));
    });
    const client = { get } as unknown as GetClient;

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', scan_feed_limit: 100, comment_per_feed_limit: 50, concurrency: 4 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('external_service');
    expect(result.error.message).toBe('feeds-down');
  });

  it('applies defaults for scan_feed_limit, comment_per_feed_limit, and concurrency when omitted', async () => {
    const client = makeClient({
      feedPages: [
        {
          data: [feed(801, '2024-06-15 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [801, [{ data: [comment(8801, 801, '2024-06-15 11:30:00')], has_more: false }]],
      ]),
    });

    const result = await getRecentComments(client, { since: '2024-06-15' }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(1);
  });

  it('rejects out-of-range concurrency via input validation', async () => {
    const client = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getRecentComments(
      client,
      { since: '2024-06-15', concurrency: 99 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
  });
});
