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

    const result = await getUnreadNotifications(client, { limit: 10 });

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

    const result = await getUnreadNotifications(client, { limit: 10 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.notifications).toHaveLength(1);
    expect(result.value.notifications[0]?.id).toBe(501);
  });

  it('calls /notifications/unread with per_page query param', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client, { limit: 25 });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/notifications/unread');
    expect(args?.[1]).toBe(UnreadNotificationsResponseSchema);
    expect(args?.[2]).toEqual({ per_page: 25 });
  });

  it('defaults limit to 50 when omitted', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client);

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 50 });
  });

  it('defaults limit to 50 when input is empty object', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client, {});

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 50 });
  });

  it('returns validation error when limit exceeds 200', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await getUnreadNotifications(client, { limit: 201 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when limit is zero or negative', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await getUnreadNotifications(client, { limit: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('returns ok with empty notifications when upstream returns none', async () => {
    const client = makeClient(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );

    const result = await getUnreadNotifications(client, { limit: 50 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.notifications).toEqual([]);
  });

  it('propagates upstream 401 unauthorized errors unchanged', async () => {
    const upstreamErr = upstreamUnauthorized('upstream returned 401');
    const client = makeClient(() => Promise.resolve(err(upstreamErr)));

    const result = await getUnreadNotifications(client, { limit: 10 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(upstreamErr);
    expect(result.error.code).toBe('upstream_unauthorized');
  });

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ unread_count: 0, notifications: [] as Array<typeof baseNotification> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getUnreadNotifications(client, { limit: 500 });

    expect(getMock).not.toHaveBeenCalled();
  });
});
