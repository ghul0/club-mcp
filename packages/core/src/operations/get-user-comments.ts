import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { parseSince } from '../date.js';
import type { Comment, PublicComment } from '../schemas/comments.js';
import {
  CommentsResponseSchema,
  PublicCommentSchema,
  toPublicComment,
} from '../schemas/comments.js';

export const GetUserCommentsOutputSchema = z.object({
  comments: z.array(PublicCommentSchema),
  pagination: z.object({
    current_page: z.number().int().positive(),
    has_more: z.boolean(),
  }),
});

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
  readonly comments: readonly PublicComment[];
  readonly pagination: {
    readonly current_page: number;
    readonly has_more: boolean;
  };
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

interface ExtractedCommentPage {
  readonly items: ReadonlyArray<Comment>;
  readonly hasMore: boolean;
}

const extractPage = (
  envelope: z.infer<typeof CommentsResponseSchema>,
  perPage: number,
): ExtractedCommentPage => {
  const raw = envelope.comments;
  if (Array.isArray(raw)) {
    const items = raw.map(backfillAuthor);
    return { items, hasMore: items.length >= perPage };
  }
  const items = raw.data.map(backfillAuthor);
  const hasMore = raw.has_more ?? items.length >= perPage;
  return { items, hasMore };
};

const passesSince = (c: Comment, threshold: string): boolean => {
  if (c.created_at >= threshold) {
    return true;
  }
  return typeof c.updated_at === 'string' && c.updated_at >= threshold;
};

export const getUserComments = async (
  client: GetClient,
  input: GetUserCommentsInput,
  now?: Date,
): Promise<Result<GetUserCommentsOutput, AppError>> => {
  const parsed = GetUserCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'invalid input';
    return err(validationError(message));
  }

  const { username, since: rawSince, limit } = parsed.data;

  let sinceTimestamp: string | undefined;
  if (rawSince !== undefined) {
    const sinceResult = parseSince(rawSince, now);
    if (!sinceResult.ok) {
      return err(sinceResult.error);
    }
    sinceTimestamp = sinceResult.value;
  }

  const path = `/profile/${encodeURIComponent(username)}/comments`;

  const collected: Comment[] = [];
  let currentPage = 1;
  let hasMore = false;

  while (currentPage <= MAX_PAGES) {
    const response = await client.get(path, CommentsResponseSchema, {
      page: currentPage,
      per_page: PER_PAGE,
    });
    if (!response.ok) {
      return err(response.error);
    }
    const page = extractPage(response.value, PER_PAGE);
    hasMore = page.hasMore;

    for (const c of page.items) {
      if (sinceTimestamp !== undefined && !passesSince(c, sinceTimestamp)) {
        continue;
      }
      if (collected.length >= limit) {
        break;
      }
      collected.push(c);
    }

    if (collected.length >= limit) {
      break;
    }
    if (!hasMore) {
      break;
    }
    currentPage += 1;
  }

  const comments: PublicComment[] = collected.map((c) => toPublicComment(c));
  return ok({
    comments,
    pagination: { current_page: currentPage, has_more: hasMore },
  });
};
