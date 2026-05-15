import { describe, expect, it } from 'vitest';
import {
  ProfileBundleSchema,
  ProfileResponseSchema,
  ProfileSchema,
  ProfileSpacesResponseSchema,
  ProfileCommentsResponseSchema,
} from '../src/schemas/profile.js';

describe('ProfileSchema', () => {
  it('accepts a minimal valid profile', () => {
    const parsed = ProfileSchema.parse({
      user_id: 58,
      username: 'thomas',
      display_name: 'Thomas',
    });

    expect(parsed.user_id).toBe(58);
    expect(parsed.username).toBe('thomas');
    expect(parsed.display_name).toBe('Thomas');
  });

  it('accepts a full profile shape', () => {
    const parsed = ProfileSchema.parse({
      user_id: 58,
      username: 'thomas',
      display_name: 'Thomas Mlynek',
      website: 'https://hyperhuman.pl',
      short_description: 'AI consultant',
      short_description_rendered: '<p>AI consultant</p>',
      social_links: { linkedin: 'https://linkedin.com/in/thomas' },
      total_points: 1240,
      last_activity: '2026-05-14 23:05:26',
      created_at: '2024-01-01 10:00:00',
      permalink: 'https://club.hyperhuman.pl/u/thomas',
      avatar: 'https://example.com/a.png',
    });

    expect(parsed.total_points).toBe(1240);
    expect(parsed.website).toBe('https://hyperhuman.pl');
  });

  it('coerces a numeric-string user_id to a number', () => {
    const parsed = ProfileSchema.parse({
      user_id: '58',
      username: 'thomas',
      display_name: 'Thomas',
    });

    expect(parsed.user_id).toBe(58);
    expect(typeof parsed.user_id).toBe('number');
  });

  it('rejects when user_id is missing', () => {
    const result = ProfileSchema.safeParse({
      username: 'thomas',
      display_name: 'Thomas',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when username is missing', () => {
    const result = ProfileSchema.safeParse({
      user_id: 58,
      display_name: 'Thomas',
    });

    expect(result.success).toBe(false);
  });

  it('allows unknown additional fields via passthrough', () => {
    const parsed = ProfileSchema.parse({
      user_id: 1,
      username: 'thomas',
      display_name: 'Thomas',
      future_field: 'preserved',
      meta: { foo: 'bar' },
    }) as Record<string, unknown>;

    expect(parsed.future_field).toBe('preserved');
    expect(parsed.meta).toEqual({ foo: 'bar' });
  });

  it('accepts null for nullable optional fields', () => {
    const parsed = ProfileSchema.parse({
      user_id: 1,
      username: 'thomas',
      display_name: 'Thomas',
      website: null,
      short_description: null,
      short_description_rendered: null,
      social_links: null,
      total_points: null,
      last_activity: null,
      created_at: null,
      permalink: null,
      avatar: null,
    });

    expect(parsed.website).toBeNull();
    expect(parsed.total_points).toBeNull();
    expect(parsed.permalink).toBeNull();
  });
});

describe('ProfileResponseSchema', () => {
  it('accepts the wrapped envelope form { profile: {...} }', () => {
    const parsed = ProfileResponseSchema.parse({
      profile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
    });

    expect(parsed.profile.user_id).toBe(58);
    expect(parsed.profile.username).toBe('thomas');
  });

  it('preserves unknown top-level fields via passthrough', () => {
    const parsed = ProfileResponseSchema.parse({
      profile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
      meta: { generated_at: '2026-05-14T23:00:00Z' },
    }) as Record<string, unknown>;

    expect(parsed.meta).toEqual({ generated_at: '2026-05-14T23:00:00Z' });
  });

  it('rejects when profile is missing', () => {
    const result = ProfileResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects when nested profile is invalid', () => {
    const result = ProfileResponseSchema.safeParse({
      profile: { username: 'thomas', display_name: 'Thomas' },
    });

    expect(result.success).toBe(false);
  });
});

describe('ProfileSpacesResponseSchema', () => {
  it('accepts spaces as an array envelope', () => {
    const parsed = ProfileSpacesResponseSchema.parse({
      spaces: [
        { id: 14, slug: 'dyskusje', title: 'Dyskusje' },
        { id: 15, slug: 'startups', title: 'Startups' },
      ],
    });

    const spaces = parsed.spaces;
    expect(Array.isArray(spaces)).toBe(true);
    if (Array.isArray(spaces)) {
      expect(spaces).toHaveLength(2);
      expect(spaces[0]?.slug).toBe('dyskusje');
    }
  });

  it('accepts spaces as an object form with data', () => {
    const parsed = ProfileSpacesResponseSchema.parse({
      spaces: {
        data: [{ slug: 'dyskusje', title: 'Dyskusje' }],
        total: 1,
        has_more: false,
      },
    });

    const spaces = parsed.spaces;
    expect(Array.isArray(spaces)).toBe(false);
    if (!Array.isArray(spaces)) {
      expect(spaces.data[0]?.slug).toBe('dyskusje');
      expect(spaces.total).toBe(1);
    }
  });

  it('rejects when spaces is missing', () => {
    const result = ProfileSpacesResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('ProfileCommentsResponseSchema', () => {
  it('accepts comments as an array envelope', () => {
    const parsed = ProfileCommentsResponseSchema.parse({
      comments: [
        {
          id: 100,
          created_at: '2026-05-14 16:31:56',
          message: 'hi',
        },
      ],
    });

    const comments = parsed.comments;
    expect(Array.isArray(comments)).toBe(true);
    if (Array.isArray(comments)) {
      expect(comments[0]?.id).toBe(100);
    }
  });

  it('accepts comments object form plus an xprofile envelope', () => {
    const parsed = ProfileCommentsResponseSchema.parse({
      comments: {
        data: [
          {
            id: 101,
            created_at: '2026-05-14 16:31:56',
          },
        ],
        total: 1,
        has_more: false,
      },
      xprofile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
    });

    expect(parsed.xprofile?.username).toBe('thomas');
    const comments = parsed.comments;
    if (!Array.isArray(comments)) {
      expect(comments.data[0]?.id).toBe(101);
    }
  });

  it('rejects when comments is missing', () => {
    const result = ProfileCommentsResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('ProfileBundleSchema', () => {
  it('accepts a full bundle with profile, spaces, and recent_comments', () => {
    const parsed = ProfileBundleSchema.parse({
      profile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
      spaces: [
        { id: 14, slug: 'dyskusje', title: 'Dyskusje' },
      ],
      recent_comments: [
        { id: 100, created_at: '2026-05-14 16:31:56' },
      ],
    });

    expect(parsed.profile.username).toBe('thomas');
    expect(parsed.spaces).toHaveLength(1);
    expect(parsed.recent_comments).toHaveLength(1);
  });

  it('accepts a bundle with optional xprofile envelope', () => {
    const parsed = ProfileBundleSchema.parse({
      profile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
      xprofile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
      spaces: [],
      recent_comments: [],
    });

    expect(parsed.xprofile?.username).toBe('thomas');
  });

  it('preserves unknown bundle fields via passthrough', () => {
    const parsed = ProfileBundleSchema.parse({
      profile: {
        user_id: 58,
        username: 'thomas',
        display_name: 'Thomas',
      },
      spaces: [],
      recent_comments: [],
      summary: { posts_count_visible: 4 },
    }) as Record<string, unknown>;

    expect(parsed.summary).toEqual({ posts_count_visible: 4 });
  });

  it('rejects a bundle missing profile', () => {
    const result = ProfileBundleSchema.safeParse({
      spaces: [],
      recent_comments: [],
    });

    expect(result.success).toBe(false);
  });
});
