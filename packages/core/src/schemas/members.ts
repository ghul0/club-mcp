import { z } from 'zod';

export const MemberSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  display_name: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  total_points: z.coerce.number().int().nonnegative().nullable().optional(),
  last_activity: z.string().nullable().optional(),
  permalink: z.string().url().optional(),
});

export const MembersResponseSchema = z.object({
  members: z.union([
    z.array(MemberSchema),
    z.object({
      data: z.array(MemberSchema),
      total: z.number().optional(),
      has_more: z.boolean().optional(),
    }),
  ]),
});

export const PublicMemberSchema = z.object({
  user_id: z.number().int().positive(),
  display_name: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  total_points: z.number().int().nonnegative().nullable().optional(),
  last_activity: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

export type Member = z.infer<typeof MemberSchema>;
export type MembersResponse = z.infer<typeof MembersResponseSchema>;
export type PublicMember = z.infer<typeof PublicMemberSchema>;

export const toPublicMember = (m: Member): PublicMember => ({
  user_id: m.user_id,
  display_name: m.display_name,
  username: m.username,
  avatar: m.avatar ?? null,
  short_description: m.short_description ?? null,
  total_points: m.total_points ?? null,
  last_activity: m.last_activity ?? null,
  permalink: m.permalink ?? null,
});
