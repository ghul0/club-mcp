import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { err, ok } from '../src/result.js';
import { externalService } from '../src/errors.js';
import { FeedsListResponseSchema } from '../src/schemas/feeds.js';
import { CommentsResponseSchema } from '../src/schemas/comments.js';
import { getSinceSummary } from '../src/operations/get-since-summary.js';

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

const commentRow = (
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
  readonly feedsError?: AppError;
  readonly commentsError?: ReadonlyMap<number, AppError>;
}

interface ClientHandle {
  readonly client: GetClient;
  readonly feedCalls: ReadonlyArray<number>;
  readonly commentCalls: ReadonlyArray<number>;
  readonly orderByTypes: ReadonlyArray<string | undefined>;
}

const makeClient = (spec: FixtureSpec): ClientHandle => {
  const feedCalls: number[] = [];
  const commentCalls: number[] = [];
  const orderByTypes: Array<string | undefined> = [];
  const get = vi.fn(
    async (
      path: string,
      _schema: unknown,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<unknown, AppError>> => {
      const pageNum = typeof query?.page === 'number' ? query.page : 1;
      if (path === '/feeds') {
        feedCalls.push(pageNum);
        const ob = query?.order_by_type;
        orderByTypes.push(typeof ob === 'string' ? ob : undefined);
        if (spec.feedsError) {
          return err(spec.feedsError);
        }
        const p = spec.feedPages[pageNum - 1];
        if (!p) {
          return ok(feedsResponse({ data: [], has_more: false }));
        }
        return ok(feedsResponse(p));
      }
      const commentMatch = /^\/feeds\/(\d+)\/comments$/.exec(path);
      if (commentMatch) {
        const feedId = Number(commentMatch[1]);
        commentCalls.push(feedId);
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
  const client = { get } as unknown as GetClient;
  return { client, feedCalls, commentCalls, orderByTypes };
};

describe('getSinceSummary', () => {
  it('combines recent posts and comments since the threshold (happy path)', async () => {
    const handle = makeClient({
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
                commentRow(9001, 101, '2024-06-15 11:30:00'),
                commentRow(9002, 101, '2024-06-15 11:31:00'),
              ],
              has_more: false,
            },
          ],
        ],
        [
          102,
          [
            {
              data: [commentRow(9003, 102, '2024-06-15 11:32:00')],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.scan_metadata.since).toBe('2024-06-15 00:00:00');
    expect(result.value.new_posts.map((p) => p.id).sort((a, b) => a - b)).toEqual([101, 102]);
    expect(result.value.new_comments).toHaveLength(3);
    const commentIds = result.value.new_comments.map((c) => c.comment.id).sort((a, b) => a - b);
    expect(commentIds).toEqual([9001, 9002, 9003]);
    expect(result.value.counts.new_posts).toBe(2);
    expect(result.value.counts.new_comments).toBe(3);
    expect(result.value.counts.edited_comments).toBe(0);
  });

  it('returns ok with empty arrays when no recent activity exists', async () => {
    const handle = makeClient({
      feedPages: [
        {
          data: [feed(201, '2024-06-10 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map(),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.scan_metadata.since).toBe('2024-06-15 00:00:00');
    expect(result.value.new_posts).toEqual([]);
    expect(result.value.new_comments).toEqual([]);
    expect(result.value.edited_comments).toEqual([]);
  });

  it('rejects an invalid since string with a validation error and makes no client calls', async () => {
    const handle = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(handle.feedCalls.length).toBe(0);
    expect(handle.commentCalls.length).toBe(0);
  });

  it('rejects an unparseable since with a validation error and makes no client calls', async () => {
    const handle = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: 'not-a-date' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(handle.feedCalls.length).toBe(0);
    expect(handle.commentCalls.length).toBe(0);
  });

  it('rejects unknown keys via strict input validation', async () => {
    const handle = makeClient({
      feedPages: [],
      commentsByFeedId: new Map(),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', concurrency: 99 } as unknown as Parameters<typeof getSinceSummary>[1],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(handle.feedCalls.length).toBe(0);
  });

  it('propagates an error from the posts (feeds) call', async () => {
    const failure = externalService('posts-down');
    const get = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/feeds') {
        return err(failure);
      }
      return err(externalService(`unexpected path ${path}`));
    });
    const client = { get } as unknown as GetClient;

    const result = await getSinceSummary(
      client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('external_service');
    expect(result.error.message).toBe('posts-down');
  });

  it('propagates an error from the comments call', async () => {
    const failure = externalService('comments-down');
    const handle = makeClient({
      feedPages: [
        {
          data: [feed(301, '2024-06-15 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map(),
      commentsError: new Map([[301, failure]]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50 },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('external_service');
    expect(result.error.message).toBe('comments-down');
  });

  it('respects limit_posts cap on the posts slice (comments slice has independent cap per docs)', async () => {
    const handle = makeClient({
      feedPages: [
        {
          data: [
            feed(401, '2024-06-15 11:00:00'),
            feed(402, '2024-06-15 10:00:00'),
            feed(403, '2024-06-15 09:00:00'),
          ],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [401, [{ data: [commentRow(1001, 401, '2024-06-15 11:30:00')], has_more: false }]],
        [402, [{ data: [commentRow(1002, 402, '2024-06-15 11:31:00')], has_more: false }]],
        [403, [{ data: [commentRow(1003, 403, '2024-06-15 11:32:00')], has_more: false }]],
      ]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 2, limit_comments: 50 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.new_posts).toHaveLength(2);
    expect(result.value.new_comments.length).toBeGreaterThanOrEqual(2);
  });

  it('respects maxCommentsPerPost cap', async () => {
    const handle = makeClient({
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
                commentRow(2001, 501, '2024-06-15 11:30:00'),
                commentRow(2002, 501, '2024-06-15 11:31:00'),
                commentRow(2003, 501, '2024-06-15 11:32:00'),
              ],
              has_more: true,
            },
            {
              data: [commentRow(2004, 501, '2024-06-15 11:33:00')],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 2 },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.new_comments).toHaveLength(2);
  });

  it('applies defaults for maxPosts, maxCommentsPerPost, and concurrency when omitted', async () => {
    const handle = makeClient({
      feedPages: [
        {
          data: [feed(601, '2024-06-15 11:00:00')],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [601, [{ data: [commentRow(3001, 601, '2024-06-15 11:30:00')], has_more: false }]],
      ]),
    });

    const result = await getSinceSummary(handle.client, { since: '2024-06-15' }, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.new_posts).toHaveLength(1);
    expect(result.value.new_comments).toHaveLength(1);
  });

  it('forwards include_edits=true so edited old comments are included in comments slice', async () => {
    const handle = makeClient({
      feedPages: [
        {
          data: [feed(701, '2024-06-15 11:00:00', { last_comment_at: '2024-06-15 12:00:00' })],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          701,
          [
            {
              data: [
                { id: 4001, post_id: 701, created_at: '2024-06-14 09:00:00', updated_at: '2024-06-15 12:00:00', message: 'edited' },
                commentRow(4002, 701, '2024-06-15 11:30:00'),
              ],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50, include_edits: true },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const allIds = [
      ...result.value.new_comments.map((c) => c.comment.id),
      ...result.value.edited_comments.map((c) => c.comment.id),
    ].sort((a, b) => a - b);
    expect(allIds).toEqual([4001, 4002]);
    expect(result.value.edited_comments.map((c) => c.comment.id)).toEqual([4001]);
    expect(result.value.new_comments.map((c) => c.comment.id)).toEqual([4002]);
  });

  it('forwards include_edits=false so edited old comments are excluded', async () => {
    const handle = makeClient({
      feedPages: [
        {
          data: [feed(801, '2024-06-15 11:00:00', { last_comment_at: '2024-06-15 12:00:00' })],
          has_more: false,
        },
      ],
      commentsByFeedId: new Map([
        [
          801,
          [
            {
              data: [
                { id: 5001, post_id: 801, created_at: '2024-06-14 09:00:00', updated_at: '2024-06-15 12:00:00', message: 'edited' },
                commentRow(5002, 801, '2024-06-15 11:30:00'),
              ],
              has_more: false,
            },
          ],
        ],
      ]),
    });

    const result = await getSinceSummary(
      handle.client,
      { since: '2024-06-15', limit_posts: 100, limit_comments: 50, include_edits: false },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.new_comments).toHaveLength(1);
    expect(result.value.new_comments[0]?.comment.id).toBe(5002);
    expect(result.value.edited_comments).toHaveLength(0);
  });
});
