import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import type { AppError } from '../errors.js';
import { err, ok } from '../result.js';
import { validationError } from '../errors.js';
import { getRecentPosts, type GetRecentPostsOutput } from './get-recent-posts.js';
import { getRecentComments, type GetRecentCommentsOutput } from './get-recent-comments.js';

export const GetSinceSummaryInputSchema = z.object({
  since: z.string().min(1),
  maxPosts: z.number().int().positive().max(500).optional().default(100),
  maxCommentsPerPost: z.number().int().positive().max(200).optional().default(50),
  concurrency: z.number().int().positive().max(8).optional().default(4),
});

export type GetSinceSummaryInput = z.input<typeof GetSinceSummaryInputSchema>;
type ResolvedInput = z.output<typeof GetSinceSummaryInputSchema>;

export type GetSinceSummaryOutput = {
  readonly since: string;
  readonly posts: GetRecentPostsOutput['posts'];
  readonly comments: GetRecentCommentsOutput['comments'];
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

  const [postsResult, commentsResult] = await Promise.all([
    getRecentPosts(client, { since: resolved.since, maxItems: resolved.maxPosts }, now),
    getRecentComments(
      client,
      {
        since: resolved.since,
        maxPosts: resolved.maxPosts,
        maxCommentsPerPost: resolved.maxCommentsPerPost,
        concurrency: resolved.concurrency,
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

  return ok({
    since: postsResult.value.since,
    posts: postsResult.value.posts,
    comments: commentsResult.value.comments,
  });
};
