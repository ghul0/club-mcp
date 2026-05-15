import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamNotFound } from '../src/errors.js';
import { ProfileResponseSchema } from '../src/schemas/profile.js';
import { getProfile } from '../src/operations/get-profile.js';

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

describe('getProfile', () => {
  it('returns ok with profile on happy path', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          profile: {
            user_id: 42,
            username: 'thomas',
            display_name: 'Thomas',
          },
        }),
      ),
    );

    const result = await getProfile(client, { username: 'thomas' });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.profile.username).toBe('thomas');
    expect(result.value.profile.user_id).toBe(42);
    expect(result.value.profile.display_name).toBe('Thomas');
  });

  it('calls /profile/{username} with response schema and no query', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(
        ok({
          profile: { user_id: 1, username: 'alice', display_name: 'Alice' },
        }),
      ),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getProfile(client, { username: 'alice' });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/profile/alice');
    expect(args?.[1]).toBe(ProfileResponseSchema);
    expect(args?.[2]).toBeUndefined();
  });

  it('rejects usernames with special characters not allowed by the doc pattern', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(
        ok({
          profile: { user_id: 1, username: 'a b/c?', display_name: 'A' },
        }),
      ),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'a b/c?' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('returns validation error for empty username', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await getProfile(client, { username: '' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when username exceeds 80 chars (doc pattern)', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await getProfile(client, { username: 'a'.repeat(81) });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(
        ok({ profile: { user_id: 1, username: 'x', display_name: 'X' } }),
      ),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getProfile(client, { username: '' });

    expect(getMock).not.toHaveBeenCalled();
  });

  it('propagates upstream_not_found (404) unchanged', async () => {
    const notFound = upstreamNotFound('upstream returned 404');
    const client = makeClient(() => Promise.resolve(err(notFound)));

    const result = await getProfile(client, { username: 'ghost' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(notFound);
    expect(result.error.code).toBe('upstream_not_found');
  });
});
