import { describe, expect, it } from 'vitest';
import { MemberSchema, MembersResponseSchema } from '../src/schemas/members.js';

describe('MemberSchema', () => {
  it('accepts a minimal valid member', () => {
    const parsed = MemberSchema.parse({
      user_id: 1,
      display_name: 'Ada',
      username: 'ada',
    });

    expect(parsed.user_id).toBe(1);
    expect(parsed.display_name).toBe('Ada');
    expect(parsed.username).toBe('ada');
  });

  it('accepts a full member shape', () => {
    const parsed = MemberSchema.parse({
      user_id: 42,
      display_name: 'Grace Hopper',
      username: 'grace',
      avatar: 'https://example.com/a.png',
      short_description: 'compiler pioneer',
      total_points: 230,
      last_activity: '2026-05-14 23:05:26',
      permalink: 'https://club.hyperhuman.pl/u/grace',
    });

    expect(parsed.total_points).toBe(230);
    expect(parsed.permalink).toBe('https://club.hyperhuman.pl/u/grace');
  });

  it('coerces a numeric-string user_id to a number', () => {
    const parsed = MemberSchema.parse({
      user_id: '7',
      display_name: 'Lin',
      username: 'lin',
    });

    expect(parsed.user_id).toBe(7);
  });

  it('rejects when user_id is missing', () => {
    const result = MemberSchema.safeParse({
      display_name: 'Lin',
      username: 'lin',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when user_id is not coercible to a positive integer', () => {
    const result = MemberSchema.safeParse({
      user_id: 'not-a-number',
      display_name: 'Lin',
      username: 'lin',
    });

    expect(result.success).toBe(false);
  });

  it('allows unknown additional fields via passthrough', () => {
    const parsed = MemberSchema.parse({
      user_id: 1,
      display_name: 'Ada',
      username: 'ada',
      future_field: 'preserved',
      another: 99,
    }) as Record<string, unknown>;

    expect(parsed.future_field).toBe('preserved');
    expect(parsed.another).toBe(99);
  });

  it('accepts null for nullable optional fields', () => {
    const parsed = MemberSchema.parse({
      user_id: 1,
      display_name: 'Ada',
      username: 'ada',
      avatar: null,
      short_description: null,
      total_points: null,
      last_activity: null,
    });

    expect(parsed.avatar).toBeNull();
    expect(parsed.total_points).toBeNull();
  });
});

describe('MembersResponseSchema', () => {
  it('accepts members as a plain array', () => {
    const parsed = MembersResponseSchema.parse({
      members: [
        { user_id: 1, display_name: 'Ada', username: 'ada' },
        { user_id: 2, display_name: 'Lin', username: 'lin' },
      ],
    });

    const members = parsed.members;
    expect(Array.isArray(members)).toBe(true);
    if (Array.isArray(members)) {
      expect(members).toHaveLength(2);
      expect(members[0]?.username).toBe('ada');
    }
  });

  it('accepts members as a data envelope with total and has_more', () => {
    const parsed = MembersResponseSchema.parse({
      members: {
        data: [
          { user_id: 1, display_name: 'Ada', username: 'ada' },
        ],
        total: 292,
        has_more: true,
      },
    });

    const members = parsed.members;
    expect(Array.isArray(members)).toBe(false);
    if (!Array.isArray(members)) {
      expect(members.total).toBe(292);
      expect(members.has_more).toBe(true);
      expect(members.data[0]?.user_id).toBe(1);
    }
  });

  it('preserves unknown top-level fields via passthrough', () => {
    const parsed = MembersResponseSchema.parse({
      members: [{ user_id: 1, display_name: 'Ada', username: 'ada' }],
      meta: { generated_at: '2026-05-14T23:00:00Z' },
    }) as Record<string, unknown>;

    expect(parsed.meta).toEqual({ generated_at: '2026-05-14T23:00:00Z' });
  });

  it('rejects when members is missing', () => {
    const result = MembersResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
