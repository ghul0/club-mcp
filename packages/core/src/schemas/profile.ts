import { z } from 'zod';
import { CommentSchema } from './comments.js';

export const ProfileSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  username: z.string(),
  display_name: z.string(),
  avatar: z.string().nullable().optional(),
  cover_photo: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  short_description_rendered: z.string().nullable().optional(),
  social_links: z.unknown().nullable().optional(),
  total_points: z.coerce.number().int().nonnegative().nullable().optional(),
  last_activity: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

export const ProfileResponseSchema = z.object({
  profile: ProfileSchema,
});

const ProfileSpaceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
});

export const ProfileSpacesResponseSchema = z.object({
  spaces: z.union([
    z.array(ProfileSpaceSchema),
    z.object({
      data: z.array(ProfileSpaceSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export const ProfileCommentsResponseSchema = z.object({
  comments: z.union([
    z.array(CommentSchema),
    z.object({
      data: z.array(CommentSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
  xprofile: ProfileSchema.optional(),
});

export const ProfileBundleSchema = z.object({
  profile: ProfileSchema,
  xprofile: ProfileSchema.optional(),
  spaces: z.array(ProfileSpaceSchema),
  recent_comments: z.array(CommentSchema),
});

export const PublicProfileSchema = z.object({
  user_id: z.number().int().positive(),
  display_name: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
  cover_photo: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  social_links: z.unknown().nullable().optional(),
  short_description_text: z.string().nullable().optional(),
  short_description_html: z.string().nullable().optional(),
  total_points: z.number().int().nonnegative().nullable().optional(),
  last_activity: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type ProfileSpace = z.infer<typeof ProfileSpaceSchema>;
export type ProfileSpacesResponse = z.infer<typeof ProfileSpacesResponseSchema>;
export type ProfileCommentsResponse = z.infer<typeof ProfileCommentsResponseSchema>;
export type ProfileBundle = z.infer<typeof ProfileBundleSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;

export interface ToPublicProfileOptions {
  readonly includePrivateFields?: boolean;
}

export const toPublicProfile = (
  p: Profile,
  options?: ToPublicProfileOptions,
): PublicProfile => {
  const out: PublicProfile = {
    user_id: p.user_id,
    display_name: p.display_name,
    username: p.username,
    avatar: p.avatar ?? null,
    cover_photo: p.cover_photo ?? null,
    website: p.website ?? null,
    social_links: p.social_links ?? null,
    short_description_text: p.short_description ?? null,
    short_description_html: p.short_description_rendered ?? null,
    total_points: p.total_points ?? null,
    last_activity: p.last_activity ?? null,
  };
  if (options?.includePrivateFields === true && p.email !== undefined && p.email !== null) {
    out.email = p.email;
  }
  return out;
};
