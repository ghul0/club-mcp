import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { upstreamNotFound, externalService } from '../src/errors.js';
import { ProfileResponseSchema } from '../src/schemas/profile.js';
import { getProfile } from '../src/operations/get-profile.js';

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

const profileOnlyClient = (
  profile: Record<string, unknown> = { user_id: 1, username: 'alice', display_name: 'Alice' },
): { client: GetClient; spy: ReturnType<typeof vi.fn> } => {
  const spy = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
    if (path.endsWith('/spaces')) {
      return ok({ spaces: [] });
    }
    if (path.endsWith('/comments')) {
      return ok({ comments: [] });
    }
    return ok({ profile });
  });
  return { client: { get: spy as unknown as GetClient['get'] }, spy };
};

describe('getProfile', () => {
  it('returns ok with profile on happy path (no sub-resources by default flags)', async () => {
    const { client } = profileOnlyClient({ user_id: 42, username: 'thomas', display_name: 'Thomas' });

    const result = await getProfile(client, { username: 'thomas', include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.profile.username).toBe('thomas');
    expect(result.value.profile.user_id).toBe(42);
    expect(result.value.profile.display_name).toBe('Thomas');
    expect(result.value.spaces).toBeUndefined();
    expect(result.value.recent_comments).toBeUndefined();
  });

  it('calls /profile/{username} with response schema and no query when no flags set', async () => {
    const getMock = vi.fn((path: string) => {
      if (path.endsWith('/spaces')) {
        return Promise.resolve(ok({ spaces: [] }));
      }
      return Promise.resolve(
        ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } }),
      );
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getProfile(client, { username: 'alice', include_spaces: false });

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

    const result = await getProfile(client, { username: 'ghost', include_spaces: false });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(notFound);
    expect(result.error.code).toBe('upstream_not_found');
  });

  it('does NOT fetch spaces when include_spaces=false', async () => {
    const getMock = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path.endsWith('/spaces')) {
        return ok({ spaces: [{ slug: 'should-not-appear' }] });
      }
      return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'alice', include_spaces: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toBeUndefined();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0]?.[0]).toBe('/profile/alice');
  });

  it('fetches spaces when include_spaces=true and attaches them to output', async () => {
    const sampleSpaces = [
      { id: 10, slug: 'dyskusje', title: 'Dyskusje', privacy: 'public' },
      { id: 11, slug: 'startupy', title: 'Startupy', privacy: 'public' },
    ];
    const getMock = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/alice/spaces') {
        return ok({ spaces: sampleSpaces });
      }
      if (path === '/profile/alice') {
        return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'alice', include_spaces: true });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.value.spaces).toHaveLength(2);
    expect(result.value.spaces?.[0]?.slug).toBe('dyskusje');
  });

  it('does NOT fetch recent_comments by default', async () => {
    const getMock = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path.endsWith('/spaces')) {
        return ok({ spaces: [] });
      }
      if (path.endsWith('/comments')) {
        return ok({ comments: [{ id: 1, post_id: 5, created_at: '2024-06-15 12:00:00' }] });
      }
      return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'alice' });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.recent_comments).toBeUndefined();
    const paths = getMock.mock.calls.map((c) => c[0] as string);
    expect(paths).not.toContain('/profile/alice/comments');
  });

  it('fetches recent_comments when include_recent_comments=true and attaches them', async () => {
    const sampleComments = [
      { id: 9001, post_id: 100, created_at: '2024-06-15 12:00:00', message: 'hi' },
      { id: 9002, post_id: 101, created_at: '2024-06-15 13:00:00', message: 'there' },
    ];
    const getMock = vi.fn(async (path: string, _schema: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/alice/spaces') {
        return ok({ spaces: [] });
      }
      if (path === '/profile/alice/comments') {
        expect(query?.page).toBe(1);
        expect(query?.per_page).toBe(20);
        return ok({ comments: sampleComments });
      }
      if (path === '/profile/alice') {
        return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'alice', include_recent_comments: true });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.recent_comments).toHaveLength(2);
    expect(result.value.recent_comments?.[0]?.id).toBe(9001);
  });

  it('fetches both spaces and recent_comments in parallel when both flags set', async () => {
    const calls: string[] = [];
    const getMock = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      calls.push(path);
      if (path === '/profile/alice/spaces') {
        return ok({ spaces: [{ slug: 's1' }] });
      }
      if (path === '/profile/alice/comments') {
        return ok({ comments: [{ id: 1, post_id: 5, created_at: '2024-06-15 12:00:00' }] });
      }
      if (path === '/profile/alice') {
        return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
      }
      return err(externalService(`unexpected ${path}`));
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, {
      username: 'alice',
      include_spaces: true,
      include_recent_comments: true,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toBeDefined();
    expect(result.value.recent_comments).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it('propagates upstream error from spaces sub-fetch', async () => {
    const subFailure = externalService('spaces-down');
    const getMock = vi.fn(async (path: string): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/alice/spaces') {
        return err(subFailure);
      }
      return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await getProfile(client, { username: 'alice', include_spaces: true });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toBe('spaces-down');
  });

  it('uses limit as per_page for the recent_comments sub-fetch', async () => {
    let observedQuery: Record<string, string | number | boolean | undefined> | undefined;
    const getMock = vi.fn(async (
      path: string,
      _schema: unknown,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<unknown, AppError>> => {
      if (path === '/profile/alice/comments') {
        observedQuery = query;
        return ok({ comments: [] });
      }
      return ok({ profile: { user_id: 1, username: 'alice', display_name: 'Alice' } });
    });
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await getProfile(client, {
      username: 'alice',
      include_spaces: false,
      include_recent_comments: true,
      limit: 50,
    });

    expect(observedQuery?.per_page).toBe(50);
    expect(observedQuery?.page).toBe(1);
  });
});
