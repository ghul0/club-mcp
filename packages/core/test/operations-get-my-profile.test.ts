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
  it('returns ok({ profile }) on happy path when include_spaces=false (defaults: include_private_fields=false)', async () => {
    const { client, spy } = makeClient(() =>
      Promise.resolve(ok({ profile: sampleProfile })),
    );

    const result = await getMyProfile(client, { include_spaces: false });

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

    const result = await getMyProfile(client);

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

    const result = await getMyProfile(client, { include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('accepts an omitted input and applies defaults (include_spaces=true)', async () => {
    const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/me/spaces') {
        return ok({ spaces: [] });
      }
      return ok({ profile: sampleProfile });
    });
    const client: GetClient = { get: spy as unknown as GetClient['get'] };

    const result = await getMyProfile(client);

    expect(isOk(result)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('redacts private fields by default (include_private_fields=false)', async () => {
    const profileWithEmail = { ...sampleProfile, email: 'thomas@example.com' } as Record<string, unknown>;
    const { client } = makeClient(() =>
      Promise.resolve(ok({ profile: profileWithEmail })),
    );

    const result = await getMyProfile(client, { include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const profile = result.value.profile as unknown as Record<string, unknown>;
    expect(profile.email).toBeUndefined();
  });

  it('preserves email when include_private_fields=true', async () => {
    const profileWithEmail = { ...sampleProfile, email: 'thomas@example.com' } as Record<string, unknown>;
    const { client } = makeClient(() =>
      Promise.resolve(ok({ profile: profileWithEmail })),
    );

    const result = await getMyProfile(client, {
      include_spaces: false,
      include_private_fields: true,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const profile = result.value.profile as unknown as Record<string, unknown>;
    expect(profile.email).toBe('thomas@example.com');
  });

  it('rejects unknown keys via strict schema (e.g. legacy consent key)', async () => {
    const { client, spy } = makeClient(() => {
      throw new Error('client must not be called');
    });

    const result = await getMyProfile(
      client,
      { consent: true } as unknown as GetMyProfileInput,
    );

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('propagates upstream 401 errors unchanged', async () => {
    const upstream = upstreamUnauthorized('upstream returned 401');
    const { client } = makeClient(() => Promise.resolve(err(upstream)));

    const result = await getMyProfile(client, { include_spaces: false });

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

    const result = await getMyProfile(client);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toBe('spaces-down');
  });
});
