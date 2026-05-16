import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { PublicFeed } from '../schemas/feeds.js';
import {
  FeedByIdResponseSchema,
  PublicFeedSchema,
  toPublicFeed,
} from '../schemas/feeds.js';
import type { Comment, PublicComment } from '../schemas/comments.js';
import {
  CommentsResponseSchema,
  PublicCommentSchema,
  toPublicComment,
} from '../schemas/comments.js';

export const GetFeedOutputSchema = z.object({
  feed: PublicFeedSchema,
  comments: z.array(PublicCommentSchema).optional(),
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
  readonly feed: PublicFeed;
  readonly comments?: readonly PublicComment[];
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

  const rawFeed = feedResult.value.feed;
  const publicFeed = toPublicFeed(rawFeed);

  if (!resolved.include_comments) {
    return ok({ feed: publicFeed });
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

  const comments: PublicComment[] = commentsResult.value.map((c) =>
    toPublicComment(c, { includeReactionsCount: true, includeStatus: true }),
  );
  return ok({ feed: publicFeed, comments });
};
