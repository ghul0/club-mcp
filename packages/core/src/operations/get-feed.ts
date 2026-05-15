import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import type { Result } from '../result.js';
import { err } from '../result.js';
import type { Feed } from '../schemas/feeds.js';
import { FeedByIdResponseSchema } from '../schemas/feeds.js';

export const GetFeedInputSchema = z
  .object({
    feed_id: z.number().int().positive(),
    include_comments: z.boolean().optional().default(true),
    comment_limit: z.number().int().positive().max(200).optional().default(100),
  })
  .strict();

export type GetFeedInput = z.input<typeof GetFeedInputSchema>;

export interface GetFeedOutput {
  readonly feed: Feed;
}

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

  const path = `/feeds/${String(parsed.data.feed_id)}/by-id`;
  const result = await client.get(path, FeedByIdResponseSchema);
  if (!result.ok) {
    return err(result.error);
  }
  return { ok: true, value: { feed: result.value.feed } };
};
