import { z } from 'zod';

const AuthorSchema = z
  .object({
    user_id: z.coerce.number().int().positive(),
    username: z.string(),
    display_name: z.string(),
    permalink: z.string().optional(),
  })
  .passthrough();

export const CommentSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    post_id: z.coerce.number().int().positive().nullable().optional(),
    parent_id: z.coerce.number().int().positive().nullable().optional(),
    message: z.string().nullable().optional(),
    message_rendered: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
    author: AuthorSchema.optional(),
    xprofile: AuthorSchema.optional(),
    reactions_count: z.coerce.number().int().nonnegative().nullable().optional(),
  })
  .passthrough();

export const CommentsResponseSchema = z
  .object({
    comments: z.union([
      z.array(CommentSchema),
      z
        .object({
          data: z.array(CommentSchema),
          has_more: z.boolean().optional(),
          total: z.number().optional(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export type Comment = z.infer<typeof CommentSchema>;
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;
