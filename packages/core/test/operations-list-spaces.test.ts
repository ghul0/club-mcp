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

    const result = await listSpaces(client, { limit: 10 });

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

  it('calls /spaces/all-spaces with per_page query param', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client, { limit: 25 });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/spaces/all-spaces');
    expect(args?.[1]).toBe(SpacesResponseSchema);
    expect(args?.[2]).toEqual({ per_page: 25 });
  });

  it('defaults limit to 100 when input is omitted', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client);

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 100 });
  });

  it('defaults limit to 100 when input is provided without limit', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client, {});

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 100 });
  });

  it('returns validation error when limit exceeds 200', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listSpaces(client, { limit: 201 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when limit is zero or negative', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listSpaces(client, { limit: 0 });

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

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() =>
      Promise.resolve(ok({ spaces: [] as Array<{ slug: string }> })),
    );
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listSpaces(client, { limit: 999 });

    expect(getMock).not.toHaveBeenCalled();
  });
});
