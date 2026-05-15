import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamUnauthorized } from '../src/errors.js';
import { UnreadNotificationsResponseSchema } from '../src/schemas/notifications.js';
import { getUnreadNotifications } from '../src/operations/get-unread-notifications.js';

const baseNotification = {
  id: 501,
  type: 'comment',
  created_at: '2026-05-14 23:00:00',
  message_text: 'New reply on your post',
  permalink: 'https://club.hyperhuman.pl/space/dyskusje/post/abc#comment-1241',
  actor: { user_id: 7, username: 'lin', display_name: 'Lin' },
};

const makeClient = (
  impl: (
    path: string,
    schema: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

describe('getUnreadNotifications', () => {
  it('returns ok with notifications on happy path (array shape)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          unread_count: 1,
          notifications: [baseNotification],
        }),
      ),
    );

    const result = await getUnreadNotifications(client, {});

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.notifications).toHaveLength(1);
    expect(result.value.notifications[0]?.id).toBe(501);
  });

  it('returns ok with notifications on object shape ({data: [...]})', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          unread_count: 1,
          notifications: { data: [baseNotification], total: 1, has_more: false },
        }),
      ),
    );

    const result = await getUnreadNotifications(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.notifications).toHaveLength(1);
    expect(result.value.notifications[0]?.id).toBe(501);
  });

  it('calls /notifications/unread with no query params (doc: empty input)', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client);

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/notifications/unread');
    expect(args?.[1]).toBe(UnreadNotificationsResponseSchema);
    expect(args?.[2]).toBeUndefined();
  });

  it('accepts an omitted input', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client);

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty input object', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client, {});

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown keys via strict schema', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await getUnreadNotifications(client, {
      limit: 10,
    } as unknown as Parameters<typeof getUnreadNotifications>[1]);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns ok with empty notifications when upstream returns none', async () => {
    const client = makeClient(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );

    const result = await getUnreadNotifications(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.notifications).toEqual([]);
  });

  it('returns unread_count from upstream when provided (Bucket B7)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          unread_count: 5,
          notifications: [baseNotification],
        }),
      ),
    );

    const result = await getUnreadNotifications(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.unread_count).toBe(5);
    expect(result.value.notifications).toHaveLength(1);
  });

  it('falls back to notifications.length for unread_count when upstream omits it (Bucket B7)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          notifications: [baseNotification, { ...baseNotification, id: 502 }],
        }),
      ),
    );

    const result = await getUnreadNotifications(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.unread_count).toBe(2);
    expect(result.value.notifications).toHaveLength(2);
  });

  it('propagates upstream 401 unauthorized errors unchanged', async () => {
    const upstreamErr = upstreamUnauthorized('upstream returned 401');
    const client = makeClient(() => Promise.resolve(err(upstreamErr)));

    const result = await getUnreadNotifications(client);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(upstreamErr);
    expect(result.error.code).toBe('upstream_unauthorized');
  });
});
