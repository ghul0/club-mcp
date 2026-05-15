import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import type { AppError } from '../errors.js';
import { err, ok } from '../result.js';
import { validationError } from '../errors.js';
import { concurrentMap } from '../concurrency.js';
import { MembersResponseSchema, type Member } from '../schemas/members.js';
import { FeedsListResponseSchema, type Feed } from '../schemas/feeds.js';
import { CommentsResponseSchema, type Comment } from '../schemas/comments.js';

export const SearchContentInputSchema = z
  .object({
    query: z.string().min(1).max(200),
    since: z.string().min(1).max(40).optional(),
    include_posts: z.boolean().optional().default(true),
    include_comments: z.boolean().optional().default(true),
    include_members: z.boolean().optional().default(true),
    limit: z.number().int().positive().max(100).optional().default(50),
    scan_feed_limit: z.number().int().positive().max(500).optional().default(300),
    concurrency: z.number().int().positive().max(8).optional().default(4),
  })
  .strict();

export type SearchContentInput = z.input<typeof SearchContentInputSchema>;
export type SearchContentParsed = z.output<typeof SearchContentInputSchema>;

export interface SearchContentCommentHit {
  readonly feedId: number | string;
  readonly comment: Comment;
}

export interface SearchContentOutput {
  readonly query: string;
  readonly members: readonly Member[];
  readonly posts: readonly Feed[];
  readonly comments: readonly SearchContentCommentHit[];
}

const formatZodIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${(error.issues.length - 3).toString()} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractMembers = (raw: z.infer<typeof MembersResponseSchema>): readonly Member[] => {
  const members = raw.members;
  if (Array.isArray(members)) {
    return members;
  }
  return members.data;
};

const extractFeeds = (raw: z.infer<typeof FeedsListResponseSchema>): readonly Feed[] => {
  const feeds = raw.feeds;
  if (Array.isArray(feeds)) {
    return feeds;
  }
  return feeds.data;
};

const extractComments = (raw: z.infer<typeof CommentsResponseSchema>): readonly Comment[] => {
  const comments = raw.comments;
  if (Array.isArray(comments)) {
    return comments;
  }
  return comments.data;
};

const fetchMembers = async (
  client: GetClient,
  input: SearchContentParsed,
): Promise<Result<readonly Member[], AppError>> => {
  const res = await client.get('/members', MembersResponseSchema, {
    search: input.query,
    per_page: input.limit,
  });
  if (!res.ok) {
    return err(res.error);
  }
  return ok(extractMembers(res.value).slice(0, input.limit));
};

const fetchPosts = async (
  client: GetClient,
  input: SearchContentParsed,
): Promise<Result<readonly Feed[], AppError>> => {
  const res = await client.get('/feeds', FeedsListResponseSchema, {
    search: input.query,
    per_page: input.limit,
    order_by_type: 'new_activity',
  });
  if (!res.ok) {
    return err(res.error);
  }
  return ok(extractFeeds(res.value).slice(0, input.limit));
};

const matchesQuery = (text: string | null | undefined, needle: string): boolean => {
  if (text === null || text === undefined) {
    return false;
  }
  return text.toLowerCase().includes(needle.toLowerCase());
};

const fetchCommentsForScope = async (
  client: GetClient,
  input: SearchContentParsed,
): Promise<Result<readonly SearchContentCommentHit[], AppError>> => {
  const feedsRes = await client.get('/feeds', FeedsListResponseSchema, {
    per_page: input.scan_feed_limit,
    order_by_type: 'new_activity',
  });
  if (!feedsRes.ok) {
    return err(feedsRes.error);
  }
  const feeds = extractFeeds(feedsRes.value).slice(0, input.scan_feed_limit);
  if (feeds.length === 0) {
    return ok([]);
  }

  const perFeed = await concurrentMap(
    feeds,
    async (feed): Promise<Result<readonly SearchContentCommentHit[], AppError>> => {
      const path = `/feeds/${feed.id.toString()}/comments`;
      const res = await client.get(path, CommentsResponseSchema, {
        per_page: input.limit,
      });
      if (!res.ok) {
        return err(res.error);
      }
      const hits: SearchContentCommentHit[] = [];
      for (const comment of extractComments(res.value)) {
        if (matchesQuery(comment.message, input.query) || matchesQuery(comment.message_rendered, input.query)) {
          hits.push({ feedId: feed.id, comment });
        }
      }
      return ok(hits);
    },
    input.concurrency,
  );

  const collected: SearchContentCommentHit[] = [];
  for (const result of perFeed) {
    if (!result.ok) {
      return err(result.error);
    }
    for (const hit of result.value) {
      if (collected.length >= input.limit) {
        break;
      }
      collected.push(hit);
    }
    if (collected.length >= input.limit) {
      break;
    }
  }
  return ok(collected);
};

export const searchContent = async (
  client: GetClient,
  input: SearchContentInput,
): Promise<Result<SearchContentOutput, AppError>> => {
  const parsed = SearchContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatZodIssues(parsed.error)));
  }
  const parameters = parsed.data;

  const membersPromise: Promise<Result<readonly Member[], AppError>> = parameters.include_members
    ? fetchMembers(client, parameters)
    : Promise.resolve(ok<readonly Member[]>([]));
  const postsPromise: Promise<Result<readonly Feed[], AppError>> = parameters.include_posts
    ? fetchPosts(client, parameters)
    : Promise.resolve(ok<readonly Feed[]>([]));
  const commentsPromise: Promise<Result<readonly SearchContentCommentHit[], AppError>> = parameters.include_comments
    ? fetchCommentsForScope(client, parameters)
    : Promise.resolve(ok<readonly SearchContentCommentHit[]>([]));

  const [membersResult, postsResult, commentsResult] = await Promise.all([
    membersPromise,
    postsPromise,
    commentsPromise,
  ]);

  if (!membersResult.ok) {
    return err(membersResult.error);
  }
  if (!postsResult.ok) {
    return err(postsResult.error);
  }
  if (!commentsResult.ok) {
    return err(commentsResult.error);
  }

  return ok({
    query: parameters.query,
    members: membersResult.value,
    posts: postsResult.value,
    comments: commentsResult.value,
  });
};
