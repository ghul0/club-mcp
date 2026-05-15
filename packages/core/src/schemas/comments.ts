import { z } from 'zod';
import {
  PublicAuthorSchema,
  PublicSpaceRefSchema,
  toPublicAuthor,
  toPublicSpaceRef,
  type Feed,
} from './feeds.js';

const AuthorSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  username: z.string(),
  display_name: z.string(),
  permalink: z.string().optional(),
});

export const CommentSchema = z.object({
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
  status: z.string().nullable().optional(),
});

export const CommentsResponseSchema = z.object({
  comments: z.union([
    z.array(CommentSchema),
    z.object({
      data: z.array(CommentSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export const PublicPostRefSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

export const PublicCommentSchema = z.object({
  id: z.number().int().positive(),
  post_id: z.number().int().positive().nullable().optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  author: PublicAuthorSchema.optional(),
  message_text: z.string().nullable().optional(),
  message_html: z.string().nullable().optional(),
  post: PublicPostRefSchema.optional(),
  space: PublicSpaceRefSchema.optional(),
  reactions_count: z.number().int().nonnegative().nullable().optional(),
  status: z.string().nullable().optional(),
  edit_reason: z.string().nullable().optional(),
});

export type Comment = z.infer<typeof CommentSchema>;
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;
export type PublicPostRef = z.infer<typeof PublicPostRefSchema>;
export type PublicComment = z.infer<typeof PublicCommentSchema>;

export interface ToPublicCommentOptions {
  readonly feed?: Feed;
  readonly includeReactionsCount?: boolean;
  readonly includeStatus?: boolean;
  readonly editReason?: string | null;
}

export const toPublicComment = (
  c: Comment,
  options?: ToPublicCommentOptions,
): PublicComment => {
  const base: PublicComment = {
    id: c.id,
    post_id: c.post_id ?? null,
    parent_id: c.parent_id ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at ?? null,
    message_text: c.message ?? null,
    message_html: c.message_rendered ?? null,
  };
  const author = toPublicAuthor(c.author ?? c.xprofile);
  if (author !== undefined) {
    base.author = author;
  }
  if (options?.feed !== undefined) {
    const f = options.feed;
    base.post = {
      id: f.id,
      title: f.title ?? null,
      permalink: f.permalink ?? null,
    };
    const space = toPublicSpaceRef(f.space);
    if (space !== undefined) {
      base.space = space;
    }
  }
  if (options?.includeReactionsCount === true) {
    base.reactions_count = c.reactions_count ?? null;
  }
  if (options?.includeStatus === true) {
    base.status = c.status ?? null;
  }
  if (options?.editReason !== undefined) {
    base.edit_reason = options.editReason;
  }
  return base;
};
