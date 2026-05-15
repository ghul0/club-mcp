import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamUnauthorized } from '../src/errors.js';
import { ProfileResponseSchema } from '../src/schemas/profile.js';
import { getMyProfile, type GetMyProfileInput } from '../src/operations/get-my-profile.js';

const sampleProfile = {
  user_id: 7,
  username: 'thomas',
  display_name: 'Thomas',
};

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): { client: GetClient; spy: ReturnType<typeof vi.fn> } => {
  const spy = vi.fn(impl);
  return { client: { get: spy as unknown as GetClient['get'] }, spy };
};

describe('getMyProfile', () => {
  it('returns ok({ profile }) on happy path when consent=true', async () => {
    const { client, spy } = makeClient(() =>
      Promise.resolve(ok({ profile: sampleProfile })),
    );

    const result = await getMyProfile(client, { consent: true });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.profile.user_id).toBe(7);
    expect(result.value.profile.username).toBe('thomas');
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0];
    expect(args?.[0]).toBe('/profile/me');
    expect(args?.[1]).toBe(ProfileResponseSchema);
  });

  it('returns validation error and does not call client when consent is false', async () => {
    const { client, spy } = makeClient(() => {
      throw new Error('client must not be called');
    });

    const result = await getMyProfile(client, { consent: false } as unknown as GetMyProfileInput);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns validation error and does not call client when consent is missing', async () => {
    const { client, spy } = makeClient(() => {
      throw new Error('client must not be called');
    });

    const result = await getMyProfile(client, {} as unknown as GetMyProfileInput);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns validation error when consent is not a boolean true literal', async () => {
    const { client, spy } = makeClient(() => {
      throw new Error('client must not be called');
    });

    const result = await getMyProfile(
      client,
      { consent: 'yes' } as unknown as GetMyProfileInput,
    );

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('propagates upstream 401 errors unchanged', async () => {
    const upstream = upstreamUnauthorized('upstream returned 401');
    const { client } = makeClient(() => Promise.resolve(err(upstream)));

    const result = await getMyProfile(client, { consent: true });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_unauthorized');
    expect(result.error).toBe(upstream);
  });
});
