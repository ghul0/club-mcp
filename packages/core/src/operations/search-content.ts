import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import type { AppError } from '../errors.js';
import { err, ok } from '../result.js';
import { validationError } from '../errors.js';
import { parseSince } from '../date.js';
import { concurrentMap } from '../concurrency.js';
import { MembersResponseSchema, MemberSchema, type Member } from '../schemas/members.js';
import { FeedsListResponseSchema, FeedSchema, type Feed } from '../schemas/feeds.js';
import { CommentsResponseSchema, CommentSchema, type Comment } from '../schemas/comments.js';

const MAX_SCANNED_COMMENTS = 2000;

const hasControlChars = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const SearchContentInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .refine((v) => !hasControlChars(v), { message: 'must not contain control characters' })
      .refine((v) => v === v.trim(), { message: 'must be trimmed (no leading or trailing whitespace)' }),
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

export type SearchResultKind = 'member' | 'post' | 'comment';

export const SearchResultSchema = z.object({
  kind: z.enum(['member', 'post', 'comment']),
  matched_field: z.string(),
  score: z.number().optional(),
  member: MemberSchema.optional(),
  post: FeedSchema.optional(),
  comment: CommentSchema.optional(),
});

export const SearchScanMetadataSchema = z.object({
  scanned_feeds: z.number().int().nonnegative(),
  scanned_comments: z.number().int().nonnegative(),
  since: z.string().optional(),
  generated_at: z.string(),
});

export const SearchContentOutputSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
  counts: z.object({
    members: z.number().int().nonnegative(),
    posts: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
  }),
  scan_metadata: SearchScanMetadataSchema,
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchScanMetadata = z.infer<typeof SearchScanMetadataSchema>;
export type SearchContentOutput = z.infer<typeof SearchContentOutputSchema>;

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

interface CommentScanOutcome {
  readonly hits: ReadonlyArray<{ readonly feedId: number; readonly comment: Comment }>;
  readonly scannedComments: number;
  readonly scannedFeeds: number;
}

const fetchCommentsForScope = async (
  client: GetClient,
  input: SearchContentParsed,
  sinceTimestamp: string | undefined,
): Promise<Result<CommentScanOutcome, AppError>> => {
  const feedsRes = await client.get('/feeds', FeedsListResponseSchema, {
    per_page: input.scan_feed_limit,
    order_by_type: 'new_activity',
  });
  if (!feedsRes.ok) {
    return err(feedsRes.error);
  }
  const feeds = extractFeeds(feedsRes.value).slice(0, input.scan_feed_limit);
  if (feeds.length === 0) {
    return ok({ hits: [], scannedComments: 0, scannedFeeds: 0 });
  }

  let scannedComments = 0;
  let scannedFeeds = 0;
  let capReached = false;

  const perFeed = await concurrentMap(
    feeds,
    async (feed): Promise<Result<ReadonlyArray<{ feedId: number; comment: Comment }>, AppError>> => {
      if (capReached) {
        return ok([]);
      }
      const path = `/feeds/${feed.id.toString()}/comments`;
      const res = await client.get(path, CommentsResponseSchema, {
        per_page: input.limit,
      });
      if (!res.ok) {
        return err(res.error);
      }
      const items = extractComments(res.value);
      scannedFeeds += 1;
      const remaining = MAX_SCANNED_COMMENTS - scannedComments;
      const toScan = items.slice(0, Math.max(0, remaining));
      scannedComments += toScan.length;
      if (scannedComments >= MAX_SCANNED_COMMENTS) {
        capReached = true;
      }
      const hits: { feedId: number; comment: Comment }[] = [];
      for (const comment of toScan) {
        if (sinceTimestamp !== undefined) {
          const createdOk = comment.created_at >= sinceTimestamp;
          const updatedOk =
            typeof comment.updated_at === 'string' && comment.updated_at >= sinceTimestamp;
          if (!createdOk && !updatedOk) {
            continue;
          }
        }
        if (matchesQuery(comment.message, input.query) || matchesQuery(comment.message_rendered, input.query)) {
          hits.push({ feedId: feed.id, comment });
        }
      }
      return ok(hits);
    },
    input.concurrency,
  );

  const collected: { feedId: number; comment: Comment }[] = [];
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
  return ok({ hits: collected, scannedComments, scannedFeeds });
};

const matchedFieldForMember = (member: Member, needle: string): string => {
  const lower = needle.toLowerCase();
  if (member.display_name.toLowerCase().includes(lower)) {
    return 'display_name';
  }
  if (member.username.toLowerCase().includes(lower)) {
    return 'username';
  }
  if (typeof member.short_description === 'string' && member.short_description.toLowerCase().includes(lower)) {
    return 'short_description';
  }
  return 'unknown';
};

const matchedFieldForPost = (post: Feed, needle: string): string => {
  const lower = needle.toLowerCase();
  if (typeof post.title === 'string' && post.title.toLowerCase().includes(lower)) {
    return 'title';
  }
  if (typeof post.message === 'string' && post.message.toLowerCase().includes(lower)) {
    return 'message';
  }
  if (typeof post.message_rendered === 'string' && post.message_rendered.toLowerCase().includes(lower)) {
    return 'message_rendered';
  }
  return 'unknown';
};

const matchedFieldForComment = (comment: Comment, needle: string): string => {
  const lower = needle.toLowerCase();
  if (typeof comment.message === 'string' && comment.message.toLowerCase().includes(lower)) {
    return 'message';
  }
  if (typeof comment.message_rendered === 'string' && comment.message_rendered.toLowerCase().includes(lower)) {
    return 'message_rendered';
  }
  return 'unknown';
};

const passesSince = (
  createdAt: string,
  updatedAt: string | null | undefined,
  sinceTimestamp: string | undefined,
): boolean => {
  if (sinceTimestamp === undefined) {
    return true;
  }
  if (createdAt >= sinceTimestamp) {
    return true;
  }
  return typeof updatedAt === 'string' && updatedAt >= sinceTimestamp;
};

export const searchContent = async (
  client: GetClient,
  input: SearchContentInput,
  now?: Date,
): Promise<Result<SearchContentOutput, AppError>> => {
  const parsed = SearchContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatZodIssues(parsed.error)));
  }
  const parameters = parsed.data;

  let sinceTimestamp: string | undefined;
  if (parameters.since !== undefined) {
    const sinceResult = parseSince(parameters.since, now);
    if (!sinceResult.ok) {
      return err(sinceResult.error);
    }
    sinceTimestamp = sinceResult.value;
  }

  const membersPromise: Promise<Result<readonly Member[], AppError>> = parameters.include_members
    ? fetchMembers(client, parameters)
    : Promise.resolve(ok<readonly Member[]>([]));
  const postsPromise: Promise<Result<readonly Feed[], AppError>> = parameters.include_posts
    ? fetchPosts(client, parameters)
    : Promise.resolve(ok<readonly Feed[]>([]));
  const commentsPromise: Promise<Result<CommentScanOutcome, AppError>> = parameters.include_comments
    ? fetchCommentsForScope(client, parameters, sinceTimestamp)
    : Promise.resolve(ok<CommentScanOutcome>({ hits: [], scannedComments: 0, scannedFeeds: 0 }));

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

  const members = membersResult.value;
  const posts = postsResult.value.filter((p) => passesSince(p.created_at, p.updated_at, sinceTimestamp));
  const commentHits = commentsResult.value.hits;

  const results: SearchResult[] = [];
  for (const member of members) {
    results.push({
      kind: 'member',
      matched_field: matchedFieldForMember(member, parameters.query),
      member,
    });
  }
  for (const post of posts) {
    results.push({
      kind: 'post',
      matched_field: matchedFieldForPost(post, parameters.query),
      post,
    });
  }
  for (const hit of commentHits) {
    results.push({
      kind: 'comment',
      matched_field: matchedFieldForComment(hit.comment, parameters.query),
      comment: hit.comment,
    });
  }

  const output: SearchContentOutput = {
    query: parameters.query,
    results,
    counts: {
      members: members.length,
      posts: posts.length,
      comments: commentHits.length,
    },
    scan_metadata: {
      scanned_feeds: commentsResult.value.scannedFeeds,
      scanned_comments: commentsResult.value.scannedComments,
      ...(sinceTimestamp !== undefined ? { since: sinceTimestamp } : {}),
      generated_at: (now ?? new Date()).toISOString(),
    },
  };
  return ok(output);
};
