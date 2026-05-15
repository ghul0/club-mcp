import { describe, expect, it } from 'vitest';
import {
  AuthorSchema,
  FeedByIdResponseSchema,
  FeedSchema,
  FeedsListResponseSchema,
  SpaceSchema,
} from '../src/schemas/feeds.js';

describe('feeds schemas', () => {
  it('accepts a valid feeds list in the array form', () => {
    const payload = {
      feeds: [
        {
          id: 412,
          slug: 'hello',
          title: 'Hello world',
          message: 'body',
          message_rendered: '<p>body</p>',
          created_at: '2026-05-14 16:31:56',
        },
      ],
    };

    const parsed = FeedsListResponseSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
  });

  it('accepts a valid feeds list in the object form with pagination metadata', () => {
    const payload = {
      feeds: {
        data: [
          {
            id: 123,
            slug: 'first',
            title: 'First',
            created_at: '2026-05-14 16:31:56',
          },
          {
            id: 124,
            slug: 'second',
            title: 'Second',
            created_at: '2026-05-14 17:00:00',
          },
        ],
        has_more: true,
        total: 200,
      },
    };

    const parsed = FeedsListResponseSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('expected success');
    }
    const feeds = parsed.data.feeds;
    expect(Array.isArray(feeds)).toBe(false);
    if (Array.isArray(feeds)) {
      throw new Error('expected object form');
    }
    expect(feeds.data.length).toBe(2);
    expect(feeds.has_more).toBe(true);
    expect(feeds.total).toBe(200);
  });

  it('accepts a valid by-id envelope', () => {
    const payload = {
      feed: {
        id: 412,
        slug: 'hello',
        title: 'Hello',
        created_at: '2026-05-14 16:31:56',
        author: {
          user_id: 58,
          username: 'tester',
          display_name: 'Tester',
        },
        space: {
          slug: 'dyskusje',
          title: 'Dyskusje',
        },
        comments_count: 4,
        reactions_count: 3,
        permalink: 'https://club.hyperhuman.pl/space/dyskusje/post/hello',
      },
    };

    const parsed = FeedByIdResponseSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
  });

  it('rejects a feed payload missing id', () => {
    const payload = {
      feed: {
        slug: 'hello',
        title: 'Hello',
        created_at: '2026-05-14 16:31:56',
      },
    };

    const parsed = FeedByIdResponseSchema.safeParse(payload);

    expect(parsed.success).toBe(false);
  });

  it('coerces a numeric feed id from string', () => {
    const parsed = FeedSchema.safeParse({
      id: '412',
      created_at: '2026-05-14 16:31:56',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('expected success');
    }
    expect(parsed.data.id).toBe(412);
    expect(typeof parsed.data.id).toBe('number');
  });

  it('rejects a non-positive feed id', () => {
    const parsed = FeedSchema.safeParse({
      id: 0,
      created_at: '2026-05-14 16:31:56',
    });

    expect(parsed.success).toBe(false);
  });

  it('strips unknown keys on feed envelopes (Output DTO allowlist)', () => {
    const parsed = FeedSchema.safeParse({
      id: 99,
      created_at: '2026-05-14 16:31:56',
      custom_meta: { foo: 'bar' },
      space_id: 14,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('expected success');
    }
    const data = parsed.data as Record<string, unknown>;
    expect(data.custom_meta).toBeUndefined();
    expect(data.space_id).toBeUndefined();
    expect(data.id).toBe(99);
  });

  it('treats nested author and space as optional', () => {
    const parsed = FeedSchema.safeParse({
      id: 1,
      created_at: '2026-05-14 16:31:56',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('expected success');
    }
    expect(parsed.data.author).toBeUndefined();
    expect(parsed.data.space).toBeUndefined();
  });

  it('validates nested author and space when present', () => {
    const validAuthor = AuthorSchema.safeParse({
      user_id: 58,
      username: 'tester',
      display_name: 'Tester',
      short_description: null,
    });
    const validSpace = SpaceSchema.safeParse({
      slug: 'dyskusje',
      title: 'Dyskusje',
    });
    const invalidAuthor = AuthorSchema.safeParse({
      username: 'tester',
      display_name: 'Tester',
    });

    expect(validAuthor.success).toBe(true);
    expect(validSpace.success).toBe(true);
    expect(invalidAuthor.success).toBe(false);
  });

  it('accepts a multi-feed list with mixed nullable fields', () => {
    const payload = {
      feeds: {
        data: [
          {
            id: 1,
            slug: null,
            title: null,
            message: null,
            message_rendered: null,
            created_at: '2026-05-14 16:31:56',
            updated_at: null,
            comments_count: null,
            reactions_count: null,
            permalink: null,
          },
          {
            id: '2',
            slug: 'second',
            title: 'Second',
            created_at: '2026-05-14 17:00:00',
            comments_count: '5',
            reactions_count: '7',
          },
        ],
        has_more: false,
      },
    };

    const parsed = FeedsListResponseSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('expected success');
    }
    const feeds = parsed.data.feeds;
    if (Array.isArray(feeds)) {
      throw new Error('expected object form');
    }
    expect(feeds.data[0]?.id).toBe(1);
    expect(feeds.data[1]?.id).toBe(2);
    expect(feeds.data[1]?.comments_count).toBe(5);
    expect(feeds.data[1]?.reactions_count).toBe(7);
  });

  it('rejects a feeds list when feeds is not an array or object', () => {
    const parsed = FeedsListResponseSchema.safeParse({ feeds: 'oops' });

    expect(parsed.success).toBe(false);
  });

  it('rejects a feed missing created_at', () => {
    const parsed = FeedSchema.safeParse({ id: 1 });

    expect(parsed.success).toBe(false);
  });
});
