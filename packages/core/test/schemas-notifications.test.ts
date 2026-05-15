import { describe, expect, it } from 'vitest';
import {
  NotificationItemSchema,
  UnreadNotificationsResponseSchema,
} from '../src/schemas/notifications.js';

const baseNotification = {
  id: 501,
  type: 'comment',
  created_at: '2026-05-14 23:00:00',
  message_text: 'New reply on your post',
  permalink: 'https://club.hyperhuman.pl/space/dyskusje/post/abc#comment-1241',
  actor: {
    user_id: 7,
    username: 'lin',
    display_name: 'Lin',
  },
};

describe('NotificationItemSchema', () => {
  it('accepts a valid notification payload', () => {
    const parsed = NotificationItemSchema.safeParse(baseNotification);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(501);
      expect(parsed.data.type).toBe('comment');
    }
  });

  it('accepts a minimal notification without optional fields', () => {
    const parsed = NotificationItemSchema.safeParse({
      id: 1,
      type: 'mention',
      created_at: '2026-05-14 23:00:00',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a notification without id', () => {
    const { id: _id, ...withoutId } = baseNotification;
    const parsed = NotificationItemSchema.safeParse(withoutId);
    expect(parsed.success).toBe(false);
  });

  it('rejects a notification without created_at', () => {
    const { created_at: _ca, ...withoutCreatedAt } = baseNotification;
    const parsed = NotificationItemSchema.safeParse(withoutCreatedAt);
    expect(parsed.success).toBe(false);
  });

  it('coerces a numeric-string id into a number', () => {
    const parsed = NotificationItemSchema.safeParse({ ...baseNotification, id: '501' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(501);
    }
  });

  it('accepts permalink and actor set to null', () => {
    const parsed = NotificationItemSchema.safeParse({
      ...baseNotification,
      permalink: null,
      actor: null,
      message_text: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('strips unknown fields (Output DTO allowlist)', () => {
    const parsed = NotificationItemSchema.safeParse({
      ...baseNotification,
      future_field: 'preserved',
      is_seen: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly future_field?: unknown; readonly is_seen?: unknown };
      expect(data.future_field).toBeUndefined();
      expect(data.is_seen).toBeUndefined();
    }
  });
});

describe('UnreadNotificationsResponseSchema', () => {
  it('accepts the array form with unread_count', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      unread_count: 2,
      notifications: [baseNotification],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unread_count).toBe(2);
    }
  });

  it('accepts a payload with only notifications array', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      notifications: [baseNotification],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the data envelope form with total and has_more', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      unread_count: 1,
      notifications: {
        data: [baseNotification],
        total: 1,
        has_more: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('coerces a numeric-string unread_count', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      unread_count: '3',
      notifications: [baseNotification],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unread_count).toBe(3);
    }
  });

  it('rejects a payload missing the notifications field', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({ unread_count: 0 });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload with a malformed entry', () => {
    const malformed = { ...baseNotification, id: 'not-a-number' };
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      notifications: [malformed],
    });
    expect(parsed.success).toBe(false);
  });

  it('strips unknown top-level fields (Output DTO allowlist)', () => {
    const parsed = UnreadNotificationsResponseSchema.safeParse({
      unread_count: 0,
      notifications: [],
      meta: { generated_at: '2026-05-15T00:00:00Z' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly meta?: unknown };
      expect(data.meta).toBeUndefined();
    }
  });
});
