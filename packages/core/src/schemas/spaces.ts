import { z } from 'zod';
import { PublicMemberSchema, toPublicMember, type Member, type PublicMember } from './members.js';

export const SpaceListItemSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
  members_count: z.coerce.number().int().nonnegative().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

export const SpacesResponseSchema = z.object({
  spaces: z.union([
    z.array(SpaceListItemSchema),
    z.object({
      data: z.array(SpaceListItemSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export const PublicSpaceSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  title: z.string().nullable().optional(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
  members_count: z.number().int().nonnegative().nullable().optional(),
  permalink: z.string().nullable().optional(),
  members: z.array(PublicMemberSchema).optional(),
});

export type SpaceListItem = z.infer<typeof SpaceListItemSchema>;
export type SpacesResponse = z.infer<typeof SpacesResponseSchema>;
export type PublicSpace = z.infer<typeof PublicSpaceSchema>;

export const toPublicSpace = (s: SpaceListItem, members?: readonly Member[]): PublicSpace => {
  const out: PublicSpace = {
    id: s.id ?? null,
    title: s.title ?? null,
    slug: s.slug,
    description: s.description ?? null,
    privacy: s.privacy ?? null,
    members_count: s.members_count ?? null,
    permalink: s.permalink ?? null,
  };
  if (members !== undefined) {
    const mapped: PublicMember[] = members.map((m) => toPublicMember(m));
    out.members = mapped;
  }
  return out;
};
