import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import type { AppError } from '../errors.js';
import { err, ok } from '../result.js';
import { validationError } from '../errors.js';
import { parseSince } from '../date.js';
import { paginate, type Page, type PageRequest } from '../pagination.js';
import { concurrentMap } from '../concurrency.js';
import { FeedsListResponseSchema, type Feed } from '../schemas/feeds.js';
import { CommentsResponseSchema, CommentSchema, type Comment } from '../schemas/comments.js';

export const RecentCommentItemSchema = z.object({
  feed: z.object({
    id: z.coerce.number().int().positive(),
    title: z.string().nullable().optional(),
  }),
  comment: CommentSchema,
});

export const GetRecentCommentsOutputSchema = z.object({
  comments: z.array(RecentCommentItemSchema),
  since: z.string(),
});

export const GetRecentCommentsInputSchema = z
  .object({
    since: z.string().min(1).max(40),
    include_edits: z.boolean().optional().default(true),
    limit: z.number().int().positive().max(200).optional().default(100),
    scan_feed_limit: z.number().int().positive().max(500).optional().default(300),
    comment_per_feed_limit: z.number().int().positive().max(200).optional().default(100),
    concurrency: z.number().int().positive().max(8).optional().default(4),
  })
  .strict();

export type GetRecentCommentsInput = z.input<typeof GetRecentCommentsInputSchema>;
type ResolvedInput = z.output<typeof GetRecentCommentsInputSchema>;

export type RecentCommentItem = {
  readonly feed: Pick<Feed, 'id' | 'title'>;
  readonly comment: Comment;
};

export type GetRecentCommentsOutput = {
  readonly comments: readonly RecentCommentItem[];
  readonly since: string;
};

const FEEDS_PER_PAGE = 100;
const COMMENTS_PER_PAGE = 100;

const formatZodIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid getRecentComments input: ${issues.join('; ')}${suffix}`;
};

const extractFeedPage = (
  response: z.infer<typeof FeedsListResponseSchema>,
  perPage: number,
): { readonly items: ReadonlyArray<Feed>; readonly hasMore: boolean } => {
  const feeds = response.feeds;
  if (Array.isArray(feeds)) {
    return { items: feeds, hasMore: feeds.length >= perPage };
  }
  const items = feeds.data;
  const hasMore = feeds.has_more ?? items.length >= perPage;
  return { items, hasMore };
};

const extractCommentPage = (
  response: z.infer<typeof CommentsResponseSchema>,
  perPage: number,
): { readonly items: ReadonlyArray<Comment>; readonly hasMore: boolean } => {
  const comments = response.comments;
  if (Array.isArray(comments)) {
    return { items: comments, hasMore: comments.length >= perPage };
  }
  const items = comments.data;
  const hasMore = comments.has_more ?? items.length >= perPage;
  return { items, hasMore };
};

const feedActivityAt = (feed: Feed): string | undefined => {
  if (typeof feed.last_comment_at === 'string' && feed.last_comment_at.length > 0) {
    return feed.last_comment_at;
  }
  if (typeof feed.updated_at === 'string' && feed.updated_at.length > 0) {
    return feed.updated_at;
  }
  return undefined;
};

const fetchActivityFeeds = async (
  client: GetClient,
  since: string,
  scanFeedLimit: number,
): Promise<Result<ReadonlyArray<Feed>, AppError>> => {
  const fetchPage = async (
    req: PageRequest,
  ): Promise<Result<Page<Feed>, AppError>> => {
    const response = await client.get('/feeds', FeedsListResponseSchema, {
      page: req.page,
      per_page: req.perPage,
      order_by_type: 'new_activity',
    });
    if (!response.ok) {
      return err(response.error);
    }
    const { items, hasMore } = extractFeedPage(response.value, req.perPage);
    const kept: Feed[] = [];
    let stop = false;
    for (const item of items) {
      const activity = feedActivityAt(item);
      if (activity !== undefined && activity < since) {
        stop = true;
        break;
      }
      kept.push(item);
    }
    return ok({
      items: kept,
      hasMore: !stop && hasMore,
      totalScanned: items.length,
    });
  };

  return paginate<Feed>(fetchPage, {
    maxItems: scanFeedLimit,
    perPage: FEEDS_PER_PAGE,
    maxPages: 20,
  });
};

const fetchCommentsForFeed = async (
  client: GetClient,
  feedId: number,
  since: string,
  includeEdits: boolean,
  maxComments: number,
): Promise<Result<ReadonlyArray<Comment>, AppError>> => {
  const path = `/feeds/${String(feedId)}/comments`;
  const fetchPage = async (
    req: PageRequest,
  ): Promise<Result<Page<Comment>, AppError>> => {
    const response = await client.get(path, CommentsResponseSchema, {
      page: req.page,
      per_page: req.perPage,
    });
    if (!response.ok) {
      return err(response.error);
    }
    const { items, hasMore } = extractCommentPage(response.value, req.perPage);
    return ok({ items, hasMore, totalScanned: items.length });
  };

  const collected = await paginate<Comment>(fetchPage, {
    maxItems: maxComments,
    perPage: COMMENTS_PER_PAGE,
    maxPages: 20,
  });
  if (!collected.ok) {
    return err(collected.error);
  }
  const filtered = collected.value.filter((c) => {
    if (c.created_at >= since) {
      return true;
    }
    if (includeEdits && typeof c.updated_at === 'string' && c.updated_at >= since) {
      return true;
    }
    return false;
  });
  return ok(filtered);
};

export const getRecentComments = async (
  client: GetClient,
  input: GetRecentCommentsInput,
  now?: Date,
): Promise<Result<GetRecentCommentsOutput, AppError>> => {
  const parsed = GetRecentCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatZodIssues(parsed.error)));
  }
  const resolved: ResolvedInput = parsed.data;

  const sinceResult = parseSince(resolved.since, now);
  if (!sinceResult.ok) {
    return err(sinceResult.error);
  }
  const since = sinceResult.value;

  const feedsResult = await fetchActivityFeeds(client, since, resolved.scan_feed_limit);
  if (!feedsResult.ok) {
    return err(feedsResult.error);
  }
  const feeds = feedsResult.value;

  if (feeds.length === 0) {
    return ok({ comments: [], since });
  }

  const perFeedResults = await concurrentMap<Feed, Result<ReadonlyArray<Comment>, AppError>>(
    feeds,
    (f) => fetchCommentsForFeed(client, f.id, since, resolved.include_edits, resolved.comment_per_feed_limit),
    resolved.concurrency,
  );

  const collected: RecentCommentItem[] = [];
  for (let i = 0; i < perFeedResults.length; i++) {
    const r = perFeedResults[i];
    const f = feeds[i];
    if (!r || !f) {
      continue;
    }
    if (!r.ok) {
      return err(r.error);
    }
    for (const c of r.value) {
      collected.push({ feed: { id: f.id, title: f.title }, comment: c });
      if (collected.length >= resolved.limit) {
        break;
      }
    }
    if (collected.length >= resolved.limit) {
      break;
    }
  }

  return ok({ comments: collected, since });
};
