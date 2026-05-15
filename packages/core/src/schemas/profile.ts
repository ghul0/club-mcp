import { z } from 'zod';
import { CommentSchema } from './comments.js';

export const ProfileSchema = z
  .object({
    user_id: z.coerce.number().int().positive(),
    username: z.string(),
    display_name: z.string(),
    avatar: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    short_description: z.string().nullable().optional(),
    short_description_rendered: z.string().nullable().optional(),
    social_links: z.unknown().nullable().optional(),
    total_points: z.coerce.number().int().nonnegative().nullable().optional(),
    last_activity: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    permalink: z.string().nullable().optional(),
  })
  .passthrough();

export const ProfileResponseSchema = z
  .object({
    profile: ProfileSchema,
  })
  .passthrough();

const ProfileSpaceSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    slug: z.string(),
    title: z.string().nullable().optional(),
    privacy: z.string().nullable().optional(),
  })
  .passthrough();

export const ProfileSpacesResponseSchema = z
  .object({
    spaces: z.union([
      z.array(ProfileSpaceSchema),
      z
        .object({
          data: z.array(ProfileSpaceSchema),
          has_more: z.boolean().optional(),
          total: z.number().optional(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export const ProfileCommentsResponseSchema = z
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
    xprofile: ProfileSchema.optional(),
  })
  .passthrough();

export const ProfileBundleSchema = z
  .object({
    profile: ProfileSchema,
    xprofile: ProfileSchema.optional(),
    spaces: z.array(ProfileSpaceSchema),
    recent_comments: z.array(CommentSchema),
  })
  .passthrough();

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type ProfileSpace = z.infer<typeof ProfileSpaceSchema>;
export type ProfileSpacesResponse = z.infer<typeof ProfileSpacesResponseSchema>;
export type ProfileCommentsResponse = z.infer<typeof ProfileCommentsResponseSchema>;
export type ProfileBundle = z.infer<typeof ProfileBundleSchema>;
