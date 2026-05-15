import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import type { AppError } from '../errors.js';
import { err, ok } from '../result.js';
import { validationError } from '../errors.js';
import { parseSince } from '../date.js';
import { PublicFeedSchema } from '../schemas/feeds.js';
import { PublicCommentSchema, type PublicComment } from '../schemas/comments.js';
import { getRecentPosts, type GetRecentPostsOutput } from './get-recent-posts.js';
import { getRecentComments } from './get-recent-comments.js';

export const GetSinceSummaryOutputSchema = z.object({
  new_posts: z.array(PublicFeedSchema),
  new_comments: z.array(PublicCommentSchema),
  edited_comments: z.array(PublicCommentSchema),
  counts: z.object({
    new_posts: z.number().int().nonnegative(),
    new_comments: z.number().int().nonnegative(),
    edited_comments: z.number().int().nonnegative(),
  }),
  scan_metadata: z.object({
    scanned_feeds: z.number().int().nonnegative(),
    scanned_comments: z.number().int().nonnegative(),
    since: z.string(),
    generated_at: z.string(),
  }),
});

export const GetSinceSummaryInputSchema = z
  .object({
    since: z.string().min(1).max(40),
    limit_posts: z.number().int().positive().max(200).optional().default(50),
    limit_comments: z.number().int().positive().max(200).optional().default(100),
    include_edits: z.boolean().optional().default(true),
  })
  .strict();

export type GetSinceSummaryInput = z.input<typeof GetSinceSummaryInputSchema>;
type ResolvedInput = z.output<typeof GetSinceSummaryInputSchema>;

export type GetSinceSummaryOutput = {
  readonly new_posts: GetRecentPostsOutput['posts'];
  readonly new_comments: readonly PublicComment[];
  readonly edited_comments: readonly PublicComment[];
  readonly counts: {
    readonly new_posts: number;
    readonly new_comments: number;
    readonly edited_comments: number;
  };
  readonly scan_metadata: {
    readonly scanned_feeds: number;
    readonly scanned_comments: number;
    readonly since: string;
    readonly generated_at: string;
  };
};

const formatZodIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid getSinceSummary input: ${issues.join('; ')}${suffix}`;
};

export const getSinceSummary = async (
  client: GetClient,
  input: GetSinceSummaryInput,
  now?: Date,
): Promise<Result<GetSinceSummaryOutput, AppError>> => {
  const parsed = GetSinceSummaryInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatZodIssues(parsed.error)));
  }
  const resolved: ResolvedInput = parsed.data;

  const sinceResult = parseSince(resolved.since, now);
  if (!sinceResult.ok) {
    return err(sinceResult.error);
  }
  const sinceTimestamp = sinceResult.value;

  const [postsResult, commentsResult] = await Promise.all([
    getRecentPosts(client, { since: resolved.since, limit: resolved.limit_posts }, now),
    getRecentComments(
      client,
      {
        since: resolved.since,
        limit: resolved.limit_comments,
        include_edits: resolved.include_edits,
      },
      now,
    ),
  ]);

  if (!postsResult.ok) {
    return err(postsResult.error);
  }
  if (!commentsResult.ok) {
    return err(commentsResult.error);
  }

  const newComments: PublicComment[] = [];
  const editedComments: PublicComment[] = [];
  for (const item of commentsResult.value.comments) {
    if (item.created_at >= sinceTimestamp) {
      newComments.push(item);
    } else if (typeof item.updated_at === 'string' && item.updated_at >= sinceTimestamp) {
      editedComments.push(item);
    }
  }

  const generatedAt = (now ?? new Date()).toISOString();

  return ok({
    new_posts: postsResult.value.posts,
    new_comments: newComments,
    edited_comments: editedComments,
    counts: {
      new_posts: postsResult.value.posts.length,
      new_comments: newComments.length,
      edited_comments: editedComments.length,
    },
    scan_metadata: {
      scanned_feeds: commentsResult.value.scan_metadata.scanned_feeds,
      scanned_comments: commentsResult.value.scan_metadata.scanned_comments,
      since: sinceTimestamp,
      generated_at: generatedAt,
    },
  });
};
