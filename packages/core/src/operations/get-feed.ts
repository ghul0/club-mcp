import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Result } from '../result.js';
import { err } from '../result.js';
import type { Feed } from '../schemas/feeds.js';
import { FeedByIdResponseSchema } from '../schemas/feeds.js';

export const GetFeedInputSchema = z.object({
  feedId: z.union([z.string().min(1), z.number().int().positive()]),
});

export type GetFeedInput = z.infer<typeof GetFeedInputSchema>;

export interface GetFeedOutput {
  readonly feed: Feed;
}

const buildPath = (feedId: string | number): string => {
  const segment = typeof feedId === 'number' ? String(feedId) : encodeURIComponent(feedId);
  return `/feeds/${segment}/by-id`;
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

  const path = buildPath(parsed.data.feedId);
  const result = await client.get(path, FeedByIdResponseSchema);
  if (!result.ok) {
    return err(result.error);
  }
  return { ok: true, value: { feed: result.value.feed } };
};
