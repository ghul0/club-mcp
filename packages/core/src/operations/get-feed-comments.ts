import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Page, PageRequest } from '../pagination.js';
import { paginate } from '../pagination.js';
import type { Comment, PublicComment } from '../schemas/comments.js';
import {
  CommentsResponseSchema,
  PublicCommentSchema,
  toPublicComment,
} from '../schemas/comments.js';

export const GetFeedCommentsOutputSchema = z.object({
  comments: z.array(PublicCommentSchema),
});

export const GetFeedCommentsInputSchema = z
  .object({
    feed_id: z.number().int().positive(),
    limit: z.number().int().positive().max(200).optional().default(100),
  })
  .strict();

export type GetFeedCommentsInput = z.input<typeof GetFeedCommentsInputSchema>;

export interface GetFeedCommentsOutput {
  readonly comments: readonly PublicComment[];
}

const PER_PAGE = 100;
const MAX_PAGES = 20;

const extractPage = (
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

export const getFeedComments = async (
  client: GetClient,
  input: GetFeedCommentsInput,
): Promise<Result<GetFeedCommentsOutput, AppError>> => {
  const parsed = GetFeedCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'invalid input';
    return err(validationError(message));
  }

  const { feed_id, limit } = parsed.data;
  const path = `/feeds/${String(feed_id)}/comments`;

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
    return ok(extractPage(response.value, req.perPage));
  };

  const result = await paginate(fetchPage, {
    maxItems: limit,
    maxPages: MAX_PAGES,
    perPage: PER_PAGE,
  });

  if (!result.ok) {
    return err(result.error);
  }

  const comments: PublicComment[] = result.value.map((c) =>
    toPublicComment(c, { includeReactionsCount: true, includeStatus: true }),
  );
  return ok({ comments });
};
