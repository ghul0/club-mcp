import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Page, PageRequest } from '../pagination.js';
import { paginate } from '../pagination.js';
import type { Comment } from '../schemas/comments.js';
import { CommentsResponseSchema } from '../schemas/comments.js';

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export const GetUserCommentsInputSchema = z
  .object({
    username: z.string().regex(USERNAME_PATTERN, 'must match ^[A-Za-z0-9_-]{1,80}$'),
    since: z.string().min(1).max(40).optional(),
    limit: z.number().int().positive().max(200).optional().default(100),
  })
  .strict();

export type GetUserCommentsInput = z.input<typeof GetUserCommentsInputSchema>;

export interface GetUserCommentsOutput {
  readonly comments: readonly Comment[];
}

const PER_PAGE = 100;
const MAX_PAGES = 50;

const backfillAuthor = (comment: Comment): Comment => {
  if (comment.author !== undefined) {
    return comment;
  }
  if (comment.xprofile === undefined) {
    return comment;
  }
  return { ...comment, author: comment.xprofile };
};

const extractPage = (
  envelope: z.infer<typeof CommentsResponseSchema>,
  perPage: number,
): Page<Comment> => {
  const raw = envelope.comments;
  if (Array.isArray(raw)) {
    const items = raw.map(backfillAuthor);
    return {
      items,
      hasMore: items.length >= perPage,
      totalScanned: items.length,
    };
  }
  const items = raw.data.map(backfillAuthor);
  const hasMore = raw.has_more ?? items.length >= perPage;
  return {
    items,
    hasMore,
    totalScanned: items.length,
  };
};

export const getUserComments = async (
  client: GetClient,
  input: GetUserCommentsInput,
): Promise<Result<GetUserCommentsOutput, AppError>> => {
  const parsed = GetUserCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'invalid input';
    return err(validationError(message));
  }

  const { username, limit } = parsed.data;
  const path = `/profile/${encodeURIComponent(username)}/comments`;

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

  return ok({ comments: result.value });
};
