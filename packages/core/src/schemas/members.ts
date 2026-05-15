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

export type Member = z.infer<typeof MemberSchema>;
export type MembersResponse = z.infer<typeof MembersResponseSchema>;
