import { z } from 'zod';

const ActorSchema = z.object({
  user_id: z.coerce.number().int().positive().optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
});

export const NotificationItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  type: z.string().nullable().optional(),
  created_at: z.string(),
  message_text: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
  actor: ActorSchema.nullable().optional(),
});

export const UnreadNotificationsResponseSchema = z.object({
  unread_count: z.coerce.number().int().nonnegative().optional(),
  notifications: z.union([
    z.array(NotificationItemSchema),
    z.object({
      data: z.array(NotificationItemSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;
export type UnreadNotificationsResponse = z.infer<typeof UnreadNotificationsResponseSchema>;
