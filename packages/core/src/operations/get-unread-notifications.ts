import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import {
  UnreadNotificationsResponseSchema,
  type NotificationItem,
} from '../schemas/notifications.js';

export const GetUnreadNotificationsInputSchema = z.object({
  limit: z.number().int().positive().max(200).optional().default(50),
});

export type GetUnreadNotificationsInput = z.input<typeof GetUnreadNotificationsInputSchema>;

export interface GetUnreadNotificationsOutput {
  readonly notifications: readonly NotificationItem[];
}

const NOTIFICATIONS_PATH = '/notifications/unread';

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractNotifications = (
  response: z.infer<typeof UnreadNotificationsResponseSchema>,
): readonly NotificationItem[] => {
  const raw = response.notifications;
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.data;
};

export const getUnreadNotifications = async (
  client: GetClient,
  input?: GetUnreadNotificationsInput,
): Promise<Result<GetUnreadNotificationsOutput, AppError>> => {
  const parsed = GetUnreadNotificationsInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }

  const { limit } = parsed.data;

  const response = await client.get(NOTIFICATIONS_PATH, UnreadNotificationsResponseSchema, {
    per_page: limit,
  });

  if (!response.ok) {
    return err(response.error);
  }

  return ok({ notifications: extractNotifications(response.value) });
};
