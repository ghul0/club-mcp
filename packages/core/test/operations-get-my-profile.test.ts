import { describe, expect, it, vi } from 'vitest';
import type { Result } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamUnauthorized, externalService } from '../src/errors.js';
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
  it('returns ok({ profile }) on happy path when consent=true and include_spaces=false', async () => {
    const { client, spy } = makeClient(() =>
      Promise.resolve(ok({ profile: sampleProfile })),
    );

    const result = await getMyProfile(client, { consent: true, include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.profile.user_id).toBe(7);
    expect(result.value.profile.username).toBe('thomas');
    expect(result.value.spaces).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0];
    expect(args?.[0]).toBe('/profile/me');
    expect(args?.[1]).toBe(ProfileResponseSchema);
  });

  it('fetches /profile/me/spaces when include_spaces=true (default) and attaches them', async () => {
    const sampleSpaces = [
      { id: 10, slug: 'dyskusje', title: 'Dyskusje', privacy: 'public' },
    ];
    const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/me/spaces') {
        return ok({ spaces: sampleSpaces });
      }
      if (path === '/profile/me') {
        return ok({ profile: sampleProfile });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getMyProfile(client, { consent: true });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toHaveLength(1);
    expect(result.value.spaces?.[0]?.slug).toBe('dyskusje');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does NOT fetch spaces when include_spaces=false', async () => {
    const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/me/spaces') {
        return ok({ spaces: [{ slug: 'should-not-appear' }] });
      }
      return ok({ profile: sampleProfile });
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getMyProfile(client, { consent: true, include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
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

    const result = await getMyProfile(client, { consent: true, include_spaces: false });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_unauthorized');
    expect(result.error).toBe(upstream);
  });

  it('propagates upstream error from spaces sub-fetch', async () => {
    const failure = externalService('spaces-down');
    const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/me/spaces') {
        return err(failure);
      }
      return ok({ profile: sampleProfile });
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getMyProfile(client, { consent: true });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toBe('spaces-down');
  });
});
