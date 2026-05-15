import { describe, expect, it } from 'vitest';
import { ZodError, type ZodIssue } from 'zod';
import { MembersResponseSchema } from '../src/schemas/members.js';
import {
  FeedByIdResponseSchema,
  FeedsListResponseSchema,
} from '../src/schemas/feeds.js';
import { CommentsResponseSchema } from '../src/schemas/comments.js';

function flattenIssues(issues: readonly ZodIssue[]): ZodIssue[] {
  const out: ZodIssue[] = [];
  for (const issue of issues) {
    out.push(issue);
    if (issue.code === 'invalid_union') {
      for (const inner of issue.unionErrors) {
        out.push(...flattenIssues(inner.issues));
      }
    }
  }
  return out;
}

function allPaths(error: ZodError): string[] {
  return flattenIssues(error.issues).map((issue) => issue.path.join('.'));
}

const validMember = {
  user_id: 1,
  display_name: 'Ada',
  username: 'ada',
};

const validFeed = {
  id: 412,
  slug: 'hello',
  title: 'Hello world',
  created_at: '2026-05-14 16:31:56',
};

const validComment = {
  id: 1220,
  post_id: 162,
  parent_id: null,
  message: 'plain text body',
  created_at: '2026-05-14 22:38:21',
};

describe('MembersResponseSchema boundary', () => {
  it('rejects malformed non-object inputs (string, number, null, array, undefined)', () => {
    expect(MembersResponseSchema.safeParse('oops').success).toBe(false);
    expect(MembersResponseSchema.safeParse(42).success).toBe(false);
    expect(MembersResponseSchema.safeParse(null).success).toBe(false);
    expect(MembersResponseSchema.safeParse([validMember]).success).toBe(false);
    expect(MembersResponseSchema.safeParse(undefined).success).toBe(false);
  });

  it('rejects when required members field is missing and reports the field path', () => {
    const result = MembersResponseSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('members');
    }
  });

  it('rejects when members has wrong type (object id field as object)', () => {
    const result = MembersResponseSchema.safeParse({
      members: [{ ...validMember, user_id: { nested: 'object' } }],
    });
    expect(result.success).toBe(false);
    expect(() =>
      MembersResponseSchema.parse({
        members: [{ ...validMember, user_id: { nested: 'object' } }],
      }),
    ).toThrow(ZodError);
  });

  it('rejects when nested members entry omits a required field (display_name)', () => {
    const result = MembersResponseSchema.safeParse({
      members: [{ user_id: 1, username: 'ada' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = allPaths(result.error);
      expect(paths.some((p) => p.endsWith('display_name'))).toBe(true);
      expect(paths.some((p) => p.startsWith('members'))).toBe(true);
    }
  });

  it('preserves extra unknown top-level fields via passthrough', () => {
    const parsed = MembersResponseSchema.parse({
      members: [validMember],
      meta: { generated_at: '2026-05-14T23:00:00Z' },
      unknown_top_level: 123,
    }) as Record<string, unknown>;
    expect(parsed.meta).toEqual({ generated_at: '2026-05-14T23:00:00Z' });
    expect(parsed.unknown_top_level).toBe(123);
  });

  it('accepts an explicit empty array of members but rejects when members key is absent', () => {
    expect(MembersResponseSchema.safeParse({ members: [] }).success).toBe(true);
    expect(MembersResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('FeedsListResponseSchema boundary', () => {
  it('rejects malformed non-object inputs (string, number, null, array, boolean)', () => {
    expect(FeedsListResponseSchema.safeParse('oops').success).toBe(false);
    expect(FeedsListResponseSchema.safeParse(0).success).toBe(false);
    expect(FeedsListResponseSchema.safeParse(null).success).toBe(false);
    expect(FeedsListResponseSchema.safeParse([validFeed]).success).toBe(false);
    expect(FeedsListResponseSchema.safeParse(true).success).toBe(false);
  });

  it('rejects when required feeds field is missing and reports the field path', () => {
    const result = FeedsListResponseSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('feeds');
    }
  });

  it('rejects when feeds field has the wrong scalar type', () => {
    expect(FeedsListResponseSchema.safeParse({ feeds: 'oops' }).success).toBe(false);
    expect(FeedsListResponseSchema.safeParse({ feeds: 42 }).success).toBe(false);
    expect(FeedsListResponseSchema.safeParse({ feeds: null }).success).toBe(false);
  });

  it('rejects when a nested feed has id of wrong type (object)', () => {
    const result = FeedsListResponseSchema.safeParse({
      feeds: [{ ...validFeed, id: { nested: true } }],
    });
    expect(result.success).toBe(false);
    expect(() =>
      FeedsListResponseSchema.parse({
        feeds: [{ ...validFeed, id: { nested: true } }],
      }),
    ).toThrow(ZodError);
  });

  it('rejects when a nested feed omits a required field (created_at)', () => {
    const result = FeedsListResponseSchema.safeParse({
      feeds: [{ id: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = allPaths(result.error);
      expect(paths.some((p) => p.endsWith('created_at'))).toBe(true);
      expect(paths.some((p) => p.startsWith('feeds'))).toBe(true);
    }
  });

  it('preserves extra unknown top-level fields via passthrough', () => {
    const parsed = FeedsListResponseSchema.parse({
      feeds: [validFeed],
      pagination_info: { cursor: 'abc' },
      experimental_flag: true,
    }) as Record<string, unknown>;
    expect(parsed.pagination_info).toEqual({ cursor: 'abc' });
    expect(parsed.experimental_flag).toBe(true);
  });

  it('preserves extra unknown fields inside the object-form feeds envelope via passthrough', () => {
    const parsed = FeedsListResponseSchema.parse({
      feeds: {
        data: [validFeed],
        has_more: false,
        cursor: 'next-page-token',
      },
    });
    expect(Array.isArray(parsed.feeds)).toBe(false);
    if (!Array.isArray(parsed.feeds)) {
      const envelope = parsed.feeds as Record<string, unknown>;
      expect(envelope.cursor).toBe('next-page-token');
    }
  });

  it('accepts an explicit empty array but rejects when feeds key is absent', () => {
    expect(FeedsListResponseSchema.safeParse({ feeds: [] }).success).toBe(true);
    expect(FeedsListResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('FeedByIdResponseSchema boundary', () => {
  it('rejects malformed non-object inputs', () => {
    expect(FeedByIdResponseSchema.safeParse('oops').success).toBe(false);
    expect(FeedByIdResponseSchema.safeParse(7).success).toBe(false);
    expect(FeedByIdResponseSchema.safeParse(null).success).toBe(false);
    expect(FeedByIdResponseSchema.safeParse([validFeed]).success).toBe(false);
  });

  it('rejects when required feed field is missing and reports the field path', () => {
    const result = FeedByIdResponseSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('feed');
    }
  });

  it('rejects when feed.id has wrong type (object)', () => {
    const result = FeedByIdResponseSchema.safeParse({
      feed: { ...validFeed, id: { not: 'a number' } },
    });
    expect(result.success).toBe(false);
    expect(() =>
      FeedByIdResponseSchema.parse({
        feed: { ...validFeed, id: { not: 'a number' } },
      }),
    ).toThrow(ZodError);
  });

  it('rejects when feed omits a required field (created_at)', () => {
    const result = FeedByIdResponseSchema.safeParse({
      feed: { id: 412, slug: 'hello' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('feed.created_at');
    }
  });

  it('preserves extra unknown top-level fields via passthrough', () => {
    const parsed = FeedByIdResponseSchema.parse({
      feed: validFeed,
      debug_trace_id: 'trace-xyz',
      future_field: { nested: true },
    }) as Record<string, unknown>;
    expect(parsed.debug_trace_id).toBe('trace-xyz');
    expect(parsed.future_field).toEqual({ nested: true });
  });
});

describe('CommentsResponseSchema boundary', () => {
  it('rejects malformed non-object inputs (string, number, null, array)', () => {
    expect(CommentsResponseSchema.safeParse('oops').success).toBe(false);
    expect(CommentsResponseSchema.safeParse(99).success).toBe(false);
    expect(CommentsResponseSchema.safeParse(null).success).toBe(false);
    expect(CommentsResponseSchema.safeParse([validComment]).success).toBe(false);
  });

  it('rejects when required comments field is missing and reports the field path', () => {
    const result = CommentsResponseSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('comments');
    }
  });

  it('rejects when comments has wrong scalar type', () => {
    expect(CommentsResponseSchema.safeParse({ comments: 'oops' }).success).toBe(false);
    expect(CommentsResponseSchema.safeParse({ comments: 5 }).success).toBe(false);
    expect(CommentsResponseSchema.safeParse({ comments: null }).success).toBe(false);
  });

  it('rejects when nested comment has id of wrong type (object)', () => {
    const result = CommentsResponseSchema.safeParse({
      comments: [{ ...validComment, id: { foo: 'bar' } }],
    });
    expect(result.success).toBe(false);
    expect(() =>
      CommentsResponseSchema.parse({
        comments: [{ ...validComment, id: { foo: 'bar' } }],
      }),
    ).toThrow(ZodError);
  });

  it('rejects when a nested comment omits a required field (created_at)', () => {
    const result = CommentsResponseSchema.safeParse({
      comments: [{ id: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = allPaths(result.error);
      expect(paths.some((p) => p.endsWith('created_at'))).toBe(true);
      expect(paths.some((p) => p.startsWith('comments'))).toBe(true);
    }
  });

  it('preserves extra unknown top-level fields via passthrough', () => {
    const parsed = CommentsResponseSchema.parse({
      comments: [validComment],
      server_time: '2026-05-14T23:59:59Z',
      experiment_bucket: 'A',
    }) as Record<string, unknown>;
    expect(parsed.server_time).toBe('2026-05-14T23:59:59Z');
    expect(parsed.experiment_bucket).toBe('A');
  });

  it('preserves extra unknown fields inside the object-form comments envelope via passthrough', () => {
    const parsed = CommentsResponseSchema.parse({
      comments: {
        data: [validComment],
        has_more: false,
        cursor: 'next-comment-page',
      },
    });
    expect(Array.isArray(parsed.comments)).toBe(false);
    if (!Array.isArray(parsed.comments)) {
      const envelope = parsed.comments as Record<string, unknown>;
      expect(envelope.cursor).toBe('next-comment-page');
    }
  });

  it('accepts an explicit empty array but rejects when comments key is absent', () => {
    expect(CommentsResponseSchema.safeParse({ comments: [] }).success).toBe(true);
    expect(CommentsResponseSchema.safeParse({}).success).toBe(false);
  });
});
