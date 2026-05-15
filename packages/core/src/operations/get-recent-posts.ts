import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { parseSince } from '../date.js';
import { paginate } from '../pagination.js';
import type { Feed } from '../schemas/feeds.js';
import { FeedsListResponseSchema } from '../schemas/feeds.js';

const SPACE_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export const GetRecentPostsInputSchema = z
  .object({
    since: z.string().min(1).max(40),
    space: z.string().regex(SPACE_PATTERN, 'must match ^[A-Za-z0-9_-]{1,120}$').optional(),
    limit: z.number().int().positive().max(200).optional().default(50),
    scan_feed_limit: z.number().int().positive().max(500).optional().default(300),
  })
  .strict();

export type GetRecentPostsInput = z.input<typeof GetRecentPostsInputSchema>;
type ResolvedInput = z.output<typeof GetRecentPostsInputSchema>;

export interface GetRecentPostsOutput {
  readonly posts: readonly Feed[];
  readonly since: string;
}

const FEEDS_PATH = '/feeds';
const DEFAULT_PER_PAGE = 100;

const validateInput = (input: GetRecentPostsInput): Result<ResolvedInput, AppError> => {
  const parsed = GetRecentPostsInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'input';
    const message = issue ? issue.message : 'invalid input';
    return err({
      code: 'validation',
      message: `invalid getRecentPosts input: ${path}: ${message}`,
      retryable: false,
    });
  }
  return ok(parsed.data);
};

const extractFeeds = (
  envelope: z.infer<typeof FeedsListResponseSchema>,
): { items: ReadonlyArray<Feed>; hasMore: boolean } => {
  const feeds = envelope.feeds;
  if (Array.isArray(feeds)) {
    return { items: feeds, hasMore: false };
  }
  return { items: feeds.data, hasMore: feeds.has_more === true };
};

const oldestCreatedAt = (items: ReadonlyArray<Feed>): string | undefined => {
  if (items.length === 0) {
    return undefined;
  }
  let oldest = items[0]?.created_at;
  for (const item of items) {
    if (oldest === undefined || item.created_at < oldest) {
      oldest = item.created_at;
    }
  }
  return oldest;
};

export const getRecentPosts = async (
  client: GetClient,
  input: GetRecentPostsInput,
  now?: Date,
): Promise<Result<GetRecentPostsOutput, AppError>> => {
  const validated = validateInput(input);
  if (!validated.ok) {
    return err(validated.error);
  }
  const { since: rawSince, limit, scan_feed_limit } = validated.value;

  const sinceResult = parseSince(rawSince, now);
  if (!sinceResult.ok) {
    return err(sinceResult.error);
  }
  const sinceTimestamp = sinceResult.value;

  const fetchPage = async (req: {
    readonly page: number;
    readonly perPage: number;
  }): Promise<
    Result<{ readonly items: ReadonlyArray<Feed>; readonly hasMore: boolean; readonly totalScanned: number }, AppError>
  > => {
    const response = await client.get(FEEDS_PATH, FeedsListResponseSchema, {
      page: req.page,
      per_page: req.perPage,
    });
    if (!response.ok) {
      return err(response.error);
    }
    const { items, hasMore } = extractFeeds(response.value);
    const oldest = oldestCreatedAt(items);
    const reachedThreshold = oldest !== undefined && oldest < sinceTimestamp;
    return ok({
      items,
      hasMore: hasMore && !reachedThreshold,
      totalScanned: items.length,
    });
  };

  const paged = await paginate(fetchPage, {
    maxItems: scan_feed_limit,
    perPage: DEFAULT_PER_PAGE,
  });

  if (!paged.ok) {
    return err(paged.error);
  }

  const filtered: Feed[] = [];
  for (const item of paged.value) {
    if (item.created_at >= sinceTimestamp) {
      filtered.push(item);
      if (filtered.length >= limit) {
        break;
      }
    }
  }

  return ok({ posts: filtered, since: sinceTimestamp });
};
