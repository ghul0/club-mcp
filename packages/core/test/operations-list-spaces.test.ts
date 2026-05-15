import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { externalService } from '../src/errors.js';
import { SpacesResponseSchema } from '../src/schemas/spaces.js';
import { listSpaces } from '../src/operations/list-spaces.js';

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

describe('listSpaces', () => {
  it('returns ok with spaces on happy path (array shape)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          spaces: [
            { id: 1, slug: 'general', title: 'General' },
            { id: 2, slug: 'random', title: 'Random' },
          ],
        }),
      ),
    );

    const result = await listSpaces(client, { include_members: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toHaveLength(2);
    expect(result.value.spaces[0]?.slug).toBe('general');
  });

  it('returns ok with spaces on object shape ({data: [...]})', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          spaces: {
            data: [{ id: 7, slug: 'gamma', title: 'Gamma' }],
            total: 1,
          },
        }),
      ),
    );

    const result = await listSpaces(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toHaveLength(1);
    expect(result.value.spaces[0]?.slug).toBe('gamma');
  });

  it('calls /spaces/all-spaces with no query params', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client, { include_members: true, member_limit: 25 });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/spaces/all-spaces');
    expect(args?.[1]).toBe(SpacesResponseSchema);
    expect(args?.[2]).toBeUndefined();
  });

  it('accepts an omitted input and applies defaults', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await listSpaces(client);

    expect(isOk(result)).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty input object and applies defaults', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await listSpaces(client, {});

    expect(isOk(result)).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('returns validation error when member_limit exceeds 100', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listSpaces(client, { member_limit: 101 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when member_limit is zero or negative', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listSpaces(client, { member_limit: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('returns ok with empty list when upstream returns no spaces', async () => {
    const client = makeClient(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );

    const result = await listSpaces(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toEqual([]);
  });

  it('returns ok with empty list when upstream returns empty data envelope', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          spaces: { data: [] as Array<{ slug: string }>, total: 0 },
        }),
      ),
    );

    const result = await listSpaces(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toEqual([]);
  });

  it('propagates client errors unchanged', async () => {
    const upstreamErr = externalService('upstream boom');
    const client = makeClient(() => Promise.resolve(err(upstreamErr)));

    const result = await listSpaces(client);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(upstreamErr);
  });

  it('fans out to /spaces/{slug}/members when include_members=true (Bucket A4)', async () => {
    const calls: { path: string; query?: Record<string, string | number | boolean | undefined> }[] = [];
    const getMock = vi.fn(
      async (
        path: string,
        _schema: unknown,
        query?: Record<string, string | number | boolean | undefined>,
      ) => {
        calls.push({ path, query });
        if (path === '/spaces/all-spaces') {
          return ok({
            spaces: [
              { id: 1, slug: 'general', title: 'General' },
              { id: 2, slug: 'random', title: 'Random' },
            ],
          });
        }
        if (path === '/spaces/general/members') {
          return ok({
            members: [{ user_id: 1, display_name: 'Alice', username: 'alice' }],
          });
        }
        if (path === '/spaces/random/members') {
          return ok({
            members: [
              { user_id: 2, display_name: 'Bob', username: 'bob' },
              { user_id: 3, display_name: 'Carol', username: 'carol' },
            ],
          });
        }
        throw new Error(`unexpected ${path}`);
      },
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await listSpaces(client, { include_members: true, member_limit: 25 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces).toHaveLength(2);
    const general = result.value.spaces.find((s) => s.slug === 'general');
    const random = result.value.spaces.find((s) => s.slug === 'random');
    expect(general?.members).toHaveLength(1);
    expect(random?.members).toHaveLength(2);
    const memberCalls = calls.filter((c) => c.path.endsWith('/members'));
    expect(memberCalls).toHaveLength(2);
    expect(memberCalls[0]?.query?.per_page).toBe(25);
  });

  it('does NOT fetch members when include_members=false (Bucket A4)', async () => {
    const getMock = vi.fn(
      async (path: string) => {
        if (path === '/spaces/all-spaces') {
          return ok({ spaces: [{ id: 1, slug: 'general', title: 'General' }] });
        }
        throw new Error(`unexpected ${path}`);
      },
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await listSpaces(client, { include_members: false });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.spaces[0]?.members).toBeUndefined();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client, { member_limit: 999 });

    expect(getMock).not.toHaveBeenCalled();
  });
});
