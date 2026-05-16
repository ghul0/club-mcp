import { z } from 'zod';

export const AuthorSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  username: z.string(),
  display_name: z.string(),
  permalink: z.string().optional(),
  short_description: z.string().nullable().optional(),
});

export const SpaceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().optional(),
});

export const FeedSchema = z.object({
  id: z.coerce.number().int().positive(),
  slug: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  message_rendered: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  last_comment_at: z.string().nullable().optional(),
  author: AuthorSchema.optional(),
  space: SpaceSchema.optional(),
  comments_count: z.coerce.number().int().nonnegative().nullable().optional(),
  reactions_count: z.coerce.number().int().nonnegative().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

export const FeedsListResponseSchema = z.object({
  feeds: z.union([
    z.array(FeedSchema),
    z.object({
      data: z.array(FeedSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export const FeedByIdResponseSchema = z.object({
  feed: FeedSchema,
});

export const PublicAuthorSchema = z.object({
  user_id: z.number().int().positive(),
  username: z.string(),
  display_name: z.string(),
});

export const PublicSpaceRefSchema = z.object({
  slug: z.string(),
  title: z.string().nullable().optional(),
});

export const PublicFeedSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  message_text: z.string().nullable().optional(),
  message_html: z.string().nullable().optional(),
  created_at: z.string(),
  author: PublicAuthorSchema.optional(),
  space: PublicSpaceRefSchema.optional(),
  comments_count: z.number().int().nonnegative().nullable().optional(),
  reactions_count: z.number().int().nonnegative().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

export type Author = z.infer<typeof AuthorSchema>;
export type Space = z.infer<typeof SpaceSchema>;
export type Feed = z.infer<typeof FeedSchema>;
export type FeedsListResponse = z.infer<typeof FeedsListResponseSchema>;
export type FeedByIdResponse = z.infer<typeof FeedByIdResponseSchema>;
export type PublicAuthor = z.infer<typeof PublicAuthorSchema>;
export type PublicSpaceRef = z.infer<typeof PublicSpaceRefSchema>;
export type PublicFeed = z.infer<typeof PublicFeedSchema>;

export const toPublicAuthor = (a: Author | undefined): PublicAuthor | undefined => {
  if (a === undefined) {
    return undefined;
  }
  return {
    user_id: a.user_id,
    username: a.username,
    display_name: a.display_name,
  };
};

export const toPublicSpaceRef = (s: Space | undefined): PublicSpaceRef | undefined => {
  if (s === undefined) {
    return undefined;
  }
  return {
    slug: s.slug,
    title: s.title ?? null,
  };
};

export const toPublicFeed = (f: Feed): PublicFeed => {
  const out: PublicFeed = {
    id: f.id,
    slug: f.slug ?? null,
    title: f.title ?? null,
    message_text: f.message ?? null,
    message_html: f.message_rendered ?? null,
    created_at: f.created_at,
    comments_count: f.comments_count ?? null,
    reactions_count: f.reactions_count ?? null,
    permalink: f.permalink ?? null,
  };
  const author = toPublicAuthor(f.author);
  if (author !== undefined) {
    out.author = author;
  }
  const space = toPublicSpaceRef(f.space);
  if (space !== undefined) {
    out.space = space;
  }
  return out;
};
