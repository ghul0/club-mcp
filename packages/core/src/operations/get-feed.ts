import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { Feed } from '../schemas/feeds.js';
import { FeedByIdResponseSchema, FeedSchema } from '../schemas/feeds.js';
import type { Comment } from '../schemas/comments.js';
import { CommentsResponseSchema, CommentSchema } from '../schemas/comments.js';

export const GetFeedOutputSchema = z.object({
  feed: FeedSchema,
  comments: z.array(CommentSchema).optional(),
});
import { paginate, type Page, type PageRequest } from '../pagination.js';

export const GetFeedInputSchema = z
  .object({
    feed_id: z.number().int().positive(),
    include_comments: z.boolean().optional().default(true),
    comment_limit: z.number().int().positive().max(200).optional().default(100),
  })
  .strict();

export type GetFeedInput = z.input<typeof GetFeedInputSchema>;
type ResolvedInput = z.output<typeof GetFeedInputSchema>;

export interface GetFeedOutput {
  readonly feed: Feed;
  readonly comments?: readonly Comment[];
}

const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 20;

const extractCommentPage = (
  envelope: z.infer<typeof CommentsResponseSchema>,
  perPage: number,
): Page<Comment> => {
  const raw = envelope.comments;
  if (Array.isArray(raw)) {
    return {
      items: raw,
      hasMore: raw.length >= perPage,
      totalScanned: raw.length,
    };
  }
  const items = raw.data;
  const hasMore = raw.has_more ?? items.length >= perPage;
  return {
    items,
    hasMore,
    totalScanned: items.length,
  };
};

export const getFeed = async (
  client: GetClient,
  input: GetFeedInput,
): Promise<Result<GetFeedOutput, AppError>> => {
  const parsed = GetFeedInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'invalid input';
    return err(validationError(message));
  }

  const resolved: ResolvedInput = parsed.data;
  const feedPath = `/feeds/${String(resolved.feed_id)}/by-id`;
  const feedResult = await client.get(feedPath, FeedByIdResponseSchema);
  if (!feedResult.ok) {
    return err(feedResult.error);
  }

  if (!resolved.include_comments) {
    return ok({ feed: feedResult.value.feed });
  }

  const commentsPath = `/feeds/${String(resolved.feed_id)}/comments`;
  const fetchPage = async (
    req: PageRequest,
  ): Promise<Result<Page<Comment>, AppError>> => {
    const response = await client.get(commentsPath, CommentsResponseSchema, {
      page: req.page,
      per_page: req.perPage,
    });
    if (!response.ok) {
      return err(response.error);
    }
    return ok(extractCommentPage(response.value, req.perPage));
  };

  const commentsResult = await paginate(fetchPage, {
    maxItems: resolved.comment_limit,
    maxPages: MAX_COMMENT_PAGES,
    perPage: COMMENTS_PER_PAGE,
  });

  if (!commentsResult.ok) {
    return err(commentsResult.error);
  }

  return ok({ feed: feedResult.value.feed, comments: commentsResult.value });
};
