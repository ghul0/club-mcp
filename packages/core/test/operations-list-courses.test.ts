import { describe, expect, it, vi } from 'vitest';
import type { GetClient } from '../src/http/client.js';
import { err, isErr, isOk, ok } from '../src/result.js';
import { externalService } from '../src/errors.js';
import { CoursesResponseSchema } from '../src/schemas/courses.js';
import { listCourses } from '../src/operations/list-courses.js';

const makeClient = (
  impl: (path: string, schema: unknown, query?: Record<string, string | number | boolean | undefined>) => unknown,
): GetClient => ({
  get: vi.fn(impl) as unknown as GetClient['get'],
});

describe('listCourses', () => {
  it('returns ok with courses on happy path (array shape)', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          courses: [
            { course: { id: 1, slug: 'intro', title: 'Intro' } },
            { course: { id: 2, slug: 'advanced', title: 'Advanced' } },
          ],
        }),
      ),
    );

    const result = await listCourses(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.courses).toHaveLength(2);
    expect(result.value.courses[0]?.course.slug).toBe('intro');
  });

  it('returns ok with courses on object shape ({data: [...]})', async () => {
    const client = makeClient(() =>
      Promise.resolve(
        ok({
          courses: {
            data: [{ course: { id: 9, slug: 'beta', title: 'Beta' } }],
            total: 1,
          },
        }),
      ),
    );

    const result = await listCourses(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.courses).toHaveLength(1);
    expect(result.value.courses[0]?.course.slug).toBe('beta');
  });

  it('calls /courses/all-courses with per_page query param', async () => {
    const getMock = vi.fn(() => Promise.resolve(ok({ courses: [] })));
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listCourses(client, { limit: 25 });

    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe('/courses/all-courses');
    expect(args?.[1]).toBe(CoursesResponseSchema);
    expect(args?.[2]).toEqual({ per_page: 25 });
  });

  it('defaults limit to 100 when omitted', async () => {
    const getMock = vi.fn(() => Promise.resolve(ok({ courses: [] })));
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listCourses(client);

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 100 });
  });

  it('defaults limit to 100 when input is empty object', async () => {
    const getMock = vi.fn(() => Promise.resolve(ok({ courses: [] })));
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listCourses(client, {});

    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual({ per_page: 100 });
  });

  it('returns validation error when limit exceeds 200', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listCourses(client, { limit: 201 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.retryable).toBe(false);
  });

  it('returns validation error when limit is zero or negative', async () => {
    const client = makeClient(() => {
      throw new Error('should not be called');
    });

    const result = await listCourses(client, { limit: 0 });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('returns ok with empty array when upstream returns empty', async () => {
    const client = makeClient(() => Promise.resolve(ok({ courses: [] })));

    const result = await listCourses(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.courses).toEqual([]);
  });

  it('returns ok with empty array when upstream returns empty object shape', async () => {
    const client = makeClient(() => Promise.resolve(ok({ courses: { data: [] } })));

    const result = await listCourses(client);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.courses).toEqual([]);
  });

  it('propagates client errors unchanged', async () => {
    const upstreamErr = externalService('upstream boom');
    const client = makeClient(() => Promise.resolve(err(upstreamErr)));

    const result = await listCourses(client);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBe(upstreamErr);
  });

  it('does not call client when input is invalid', async () => {
    const getMock = vi.fn(() => Promise.resolve(ok({ courses: [] })));
    const client: GetClient = { get: getMock as unknown as GetClient['get'] };

    await listCourses(client, { limit: -1 });

    expect(getMock).not.toHaveBeenCalled();
  });
});
