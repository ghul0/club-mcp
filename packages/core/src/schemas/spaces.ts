import { z } from 'zod';

export const SpaceListItemSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    slug: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    privacy: z.string().nullable().optional(),
    members_count: z.coerce.number().int().nonnegative().nullable().optional(),
    permalink: z.string().nullable().optional(),
  })
  .passthrough();

export const SpacesResponseSchema = z
  .object({
    spaces: z.union([
      z.array(SpaceListItemSchema),
      z
        .object({
          data: z.array(SpaceListItemSchema),
          has_more: z.boolean().optional(),
          total: z.number().optional(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export type SpaceListItem = z.infer<typeof SpaceListItemSchema>;
export type SpacesResponse = z.infer<typeof SpacesResponseSchema>;
