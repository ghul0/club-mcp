import { z } from 'zod';

export const AuthorSchema = z
  .object({
    user_id: z.coerce.number().int().positive(),
    username: z.string(),
    display_name: z.string(),
    permalink: z.string().optional(),
    short_description: z.string().nullable().optional(),
  })
  .passthrough();

export const SpaceSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    slug: z.string(),
    title: z.string().optional(),
  })
  .passthrough();

export const FeedSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    slug: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    message_rendered: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
    author: AuthorSchema.optional(),
    space: SpaceSchema.optional(),
    comments_count: z.coerce.number().int().nonnegative().nullable().optional(),
    reactions_count: z.coerce.number().int().nonnegative().nullable().optional(),
    permalink: z.string().nullable().optional(),
  })
  .passthrough();

export const FeedsListResponseSchema = z
  .object({
    feeds: z.union([
      z.array(FeedSchema),
      z
        .object({
          data: z.array(FeedSchema),
          has_more: z.boolean().optional(),
          total: z.number().optional(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export const FeedByIdResponseSchema = z
  .object({
    feed: FeedSchema,
  })
  .passthrough();

export type Author = z.infer<typeof AuthorSchema>;
export type Space = z.infer<typeof SpaceSchema>;
export type Feed = z.infer<typeof FeedSchema>;
export type FeedsListResponse = z.infer<typeof FeedsListResponseSchema>;
export type FeedByIdResponse = z.infer<typeof FeedByIdResponseSchema>;
