import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import { err, ok } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { upstreamNotFound } from '../src/errors.js';
import { getFeedComments } from '../src/operations/get-feed-comments.js';

interface CommentLike {
  readonly id: number;
  readonly created_at: string;
  readonly message: string;
}

const makeComment = (id: number): CommentLike => ({
  id,
  created_at: '2026-05-14 22:38:21',
  message: `comment ${String(id)}`,
});

const buildClient = (
  responder: (path: string, query?: Record<string, string | number | boolean | undefined>) => Result<unknown, AppError>,
): GetClient => ({
  get: vi.fn(
    async <TSchema extends z.ZodTypeAny>(
      path: string,
      schema: TSchema,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<z.infer<TSchema>, AppError>> => {
      const outcome = responder(path, query);
      if (!outcome.ok) {
        return err(outcome.error);
      }
      const parsed = schema.safeParse(outcome.value);
      if (!parsed.success) {
        throw new Error(`mock schema mismatch: ${parsed.error.message}`);
      }
      return ok(parsed.data as z.infer<TSchema>);
    },
  ),
});

describe('getFeedComments', () => {
  it('returns all comments from a single page when has_more is false', async () => {
    const client = buildClient((path) => {
      if (path !== '/feeds/162/comments') {
        return err(upstreamNotFound('wrong path'));
      }
      return ok({
        comments: {
          data: [makeComment(1), makeComment(2), makeComment(3)],
          has_more: false,
        },
      });
    });

    const result = await getFeedComments(client, { feedId: 162 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('walks multiple pages, concatenating results until has_more=false', async () => {
    const pages: ReadonlyArray<{ data: CommentLike[]; has_more: boolean }> = [
      { data: [makeComment(1), makeComment(2)], has_more: true },
      { data: [makeComment(3), makeComment(4)], has_more: true },
      { data: [makeComment(5)], has_more: false },
    ];
    const client = buildClient((path, query) => {
      if (path !== '/feeds/slug-feed/comments') {
        return err(upstreamNotFound('wrong path'));
      }
      const page = Number(query?.page ?? 1) - 1;
      const data = pages[page];
      if (data === undefined) {
        return err(upstreamNotFound('no such page'));
      }
      return ok({ comments: data });
    });

    const result = await getFeedComments(client, { feedId: 'slug-feed', maxItems: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it('rejects an empty feedId with a validation error', async () => {
    const client = buildClient(() => ok({ comments: [] }));

    const result = await getFeedComments(client, { feedId: '' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('propagates an upstream 404 from the underlying client', async () => {
    const failure = upstreamNotFound('feed not found');
    const client = buildClient(() => err(failure));

    const result = await getFeedComments(client, { feedId: 9999 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('upstream_not_found');
  });

  it('caps results at maxItems even if upstream has more pages', async () => {
    const client = buildClient((_path, query) => {
      const page = Number(query?.page ?? 1);
      const start = (page - 1) * 3 + 1;
      return ok({
        comments: {
          data: [makeComment(start), makeComment(start + 1), makeComment(start + 2)],
          has_more: true,
        },
      });
    });

    const result = await getFeedComments(client, { feedId: 162, maxItems: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments.length).toBe(7);
    expect(result.value.comments.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('accepts the array form of the comments envelope', async () => {
    const client = buildClient(() =>
      ok({ comments: [makeComment(10), makeComment(11)] }),
    );

    const result = await getFeedComments(client, { feedId: 162, maxItems: 50 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments.map((c) => c.id)).toEqual([10, 11]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive feedId number with a validation error', async () => {
    const client = buildClient(() => ok({ comments: [] }));

    const result = await getFeedComments(client, { feedId: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
  });
});
