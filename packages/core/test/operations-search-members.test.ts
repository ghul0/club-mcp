import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { externalService } from '../src/errors.js';
import { MembersResponseSchema } from '../src/schemas/members.js';
import { searchMembers } from '../src/operations/search-members.js';

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

describe('searchMembers', () => {
  it('returns ok with members on happy path (array shape)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          members: [
            { user_id: 1, display_name: 'Alice', username: 'alice' },
            { user_id: 2, display_name: 'Bob', username: 'bob' },
          ],
        }),
      ),
    );

    const result = await searchMembers(client, { query: 'al', limit: 10 });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.members).toHaveLength(2);
    expect(result.value.members[0]?.username).toBe('alice');
  });

  it('returns ok with members on object shape ({data: [...]})', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          members: {
            data: [{ user_id: 7, display_name: 'Gamma', username: 'gamma' }],
            total: 1,
          },
        }),
      ),
    );

    const result = await searchMembers(client, { query: 'gam' });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.members).toHaveLength(1);
    expect(result.value.members[0]?.username).toBe('gamma');
  });

  it('calls /members with search and per_page query params', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ members: [] as Array<{ user_id: number; display_name: string; username: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await searchMembers(client, { query: 'thomas', limit: 25 });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/members');
    expect(args?.[1]).toBe(MembersResponseSchema);
    expect(args?.[2]).toEqual({ search: 'thomas', per_page: 25 });
  });

  it('defaults limit to 20 when omitted (per docs/read-only-tools.md)', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ members: [] as Array<{ user_id: number; display_name: string; username: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await searchMembers(client, { query: 'q' });

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ search: 'q', per_page: 20 });
  });

  it('returns validation error for empty query', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: '', limit: 10 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when limit exceeds 100', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: 'q', limit: 101 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('returns validation error when limit is zero or negative', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: 'q', limit: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('accepts queries up to 200 chars (doc spec)', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ members: [] as Array<{ user_id: number; display_name: string; username: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    const result = await searchMembers(client, { query: 'a'.repeat(200) });

    expect(isOk(result)).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('returns validation error when query exceeds 200 chars', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: 'a'.repeat(201) });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('rejects a query with control characters (Bucket D hardening)', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: 'abcdef' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('rejects a query with leading or trailing whitespace (Bucket D trim)', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await searchMembers(client, { query: '  hello  ' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('propagates client errors unchanged', async () => {
    const upstreamErr = externalService('upstream boom');
    const client = makeClient(() => Promise.resolve(err(upstreamErr)));

    const result = await searchMembers(client, { query: 'x' });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(upstreamErr);
  });

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ members: [] as Array<{ user_id: number; display_name: string; username: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await searchMembers(client, { query: '' });

    expect(getMock).not.toHaveBeenCalled();
  });
});
