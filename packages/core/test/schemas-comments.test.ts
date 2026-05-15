import { describe, expect, it } from 'vitest';
import { CommentSchema, CommentsResponseSchema } from '../src/schemas/comments.js';

const baseComment = {
  id: 1220,
  post_id: 162,
  parent_id: null,
  message: 'plain text body',
  message_rendered: '<p>plain text body</p>',
  created_at: '2026-05-14 22:38:21',
  updated_at: '2026-05-14 22:38:21',
  xprofile: {
    user_id: 1,
    username: 'hyper_maciek',
    display_name: 'Maciek',
  },
};

describe('CommentSchema', () => {
  it('accepts a valid comment payload', () => {
    const parsed = CommentSchema.safeParse(baseComment);
    expect(parsed.success).toBe(true);
  });

  it('rejects a comment without id', () => {
    const { id: _id, ...withoutId } = baseComment;
    const parsed = CommentSchema.safeParse(withoutId);
    expect(parsed.success).toBe(false);
  });

  it('coerces a numeric string id into a number', () => {
    const parsed = CommentSchema.safeParse({ ...baseComment, id: '1220' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(1220);
    }
  });

  it('accepts a comment with author instead of xprofile', () => {
    const { xprofile: _xprofile, ...rest } = baseComment;
    const withAuthor = {
      ...rest,
      author: {
        user_id: 1,
        username: 'hyper_maciek',
        display_name: 'Maciek',
      },
    };
    const parsed = CommentSchema.safeParse(withAuthor);
    expect(parsed.success).toBe(true);
  });

  it('accepts a comment with neither author nor xprofile', () => {
    const { xprofile: _xprofile, ...rest } = baseComment;
    const parsed = CommentSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
  });

  it('accepts a comment with parent_id set to null', () => {
    const parsed = CommentSchema.safeParse({ ...baseComment, parent_id: null });
    expect(parsed.success).toBe(true);
  });

  it('accepts a comment with a numeric parent_id reply target', () => {
    const parsed = CommentSchema.safeParse({ ...baseComment, parent_id: 1201 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.parent_id).toBe(1201);
    }
  });

  it('strips unknown fields it does not declare (Output DTO allowlist)', () => {
    const parsed = CommentSchema.safeParse({ ...baseComment, status: 'published', custom_flag: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly status?: unknown; readonly custom_flag?: unknown };
      expect(data.status).toBeUndefined();
      expect(data.custom_flag).toBeUndefined();
    }
  });
});

describe('CommentsResponseSchema', () => {
  it('accepts the array form of the comments envelope', () => {
    const parsed = CommentsResponseSchema.safeParse({ comments: [baseComment] });
    expect(parsed.success).toBe(true);
  });

  it('accepts the object form with data, has_more and total', () => {
    const parsed = CommentsResponseSchema.safeParse({
      comments: {
        data: [baseComment],
        has_more: false,
        total: 1,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing the comments field', () => {
    const parsed = CommentsResponseSchema.safeParse({ items: [baseComment] });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload where comments contains a malformed entry', () => {
    const malformed = { ...baseComment, id: 'not-a-number' };
    const parsed = CommentsResponseSchema.safeParse({ comments: [malformed] });
    expect(parsed.success).toBe(false);
  });
});
