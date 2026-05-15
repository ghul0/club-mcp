import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { GetClient } from '../src/http/client.js';
import type { Result } from '../src/result.js';
import { err, ok } from '../src/result.js';
import type { AppError } from '../src/errors.js';
import { upstreamNotFound } from '../src/errors.js';
import { getUserComments } from '../src/operations/get-user-comments.js';

interface AuthorLike {
  readonly user_id: number;
  readonly username: string;
  readonly display_name: string;
}

interface CommentLike {
  readonly id: number;
  readonly created_at: string;
  readonly message: string;
  readonly author?: AuthorLike;
  readonly xprofile?: AuthorLike;
}

const author = (username: string): AuthorLike => ({
  user_id: 42,
  username,
  display_name: username,
});

const makeComment = (id: number, extras: Partial<CommentLike> = {}): CommentLike => ({
  id,
  created_at: '2026-05-14 22:38:21',
  message: `comment ${String(id)}`,
  ...extras,
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

describe('getUserComments', () => {
  it('returns comments from /profile/{username}/comments with backfill applied', async () => {
    const xp = author('thomas');
    const client = buildClient((path) => {
      if (path !== '/profile/thomas/comments') {
        return err(upstreamNotFound('wrong path'));
      }
      return ok({
        comments: {
          data: [
            makeComment(1, { xprofile: xp }),
            makeComment(2, { xprofile: xp }),
          ],
          has_more: false,
        },
      });
    });

    const result = await getUserComments(client, { username: 'thomas' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(2);
    expect(result.value.comments[0]?.author?.username).toBe('thomas');
    expect(result.value.comments[1]?.author?.username).toBe('thomas');
  });

  it('rejects an empty username with a validation error', async () => {
    const client = buildClient(() => ok({ comments: [] }));

    const result = await getUserComments(client, { username: '' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('backfills author from xprofile when author is missing', async () => {
    const xp = author('legacy_user');
    const client = buildClient(() =>
      ok({
        comments: [makeComment(10, { xprofile: xp })],
      }),
    );

    const result = await getUserComments(client, { username: 'legacy_user' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const comment = result.value.comments[0];
    expect(comment?.author).toEqual(xp);
    expect(comment?.xprofile).toEqual(xp);
  });

  it('leaves comments with an existing author unchanged', async () => {
    const existing = author('real_author');
    const xp = author('xprofile_user');
    const client = buildClient(() =>
      ok({
        comments: [makeComment(20, { author: existing, xprofile: xp })],
      }),
    );

    const result = await getUserComments(client, { username: 'real_author' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments[0]?.author).toEqual(existing);
  });

  it('does not invent an author when neither author nor xprofile is present', async () => {
    const client = buildClient(() => ok({ comments: [makeComment(30)] }));

    const result = await getUserComments(client, { username: 'someone' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments[0]?.author).toBeUndefined();
    expect(result.value.comments[0]?.xprofile).toBeUndefined();
  });

  it('caps results at limit even if upstream has more pages', async () => {
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

    const result = await getUserComments(client, { username: 'thomas', limit: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(5);
    expect(result.value.comments.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('filters comments by since timestamp when provided (Bucket A1)', async () => {
    const NOW = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    const client = buildClient(() =>
      ok({
        comments: [
          makeComment(1, { created_at: '2025-01-01 00:00:00' }),
          makeComment(2, { created_at: '2026-06-01 12:00:00' }),
        ],
      }),
    );

    const result = await getUserComments(
      client,
      { username: 'thomas', since: '2026-01-01' },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments.map((c) => c.id)).toEqual([2]);
  });

  it('includes edited old comments when updated_at >= since (Bucket A1)', async () => {
    const NOW = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    const client = buildClient(() =>
      ok({
        comments: [
          {
            id: 99,
            created_at: '2025-01-01 00:00:00',
            updated_at: '2026-06-01 12:00:00',
            message: 'edited late',
          },
        ],
      }),
    );

    const result = await getUserComments(
      client,
      { username: 'thomas', since: '2026-01-01' },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.comments).toHaveLength(1);
    expect(result.value.comments[0]?.id).toBe(99);
  });

  it('returns a validation error when since is unparseable (Bucket A1)', async () => {
    const client = buildClient(() => ok({ comments: [] }));

    const result = await getUserComments(client, {
      username: 'thomas',
      since: 'not-a-date',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('validation');
  });

  it('propagates an upstream 404 from the underlying client', async () => {
    const failure = upstreamNotFound('profile not found');
    const client = buildClient(() => err(failure));

    const result = await getUserComments(client, { username: 'ghost' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('upstream_not_found');
  });
});
