import { describe, expect, it } from 'vitest';
import { SpaceListItemSchema, SpacesResponseSchema } from '../src/schemas/spaces.js';

const baseSpace = {
  id: 14,
  slug: 'dyskusje',
  title: 'Dyskusje',
  description: 'Open discussion space',
  privacy: 'public',
  members_count: 120,
  permalink: 'https://club.hyperhuman.pl/space/dyskusje',
};

describe('SpaceListItemSchema', () => {
  it('accepts a valid space payload', () => {
    const parsed = SpaceListItemSchema.safeParse(baseSpace);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(14);
      expect(parsed.data.slug).toBe('dyskusje');
    }
  });

  it('accepts a minimal space with only slug', () => {
    const parsed = SpaceListItemSchema.safeParse({ slug: 'minimalna' });
    expect(parsed.success).toBe(true);
  });

  it('rejects a space missing slug', () => {
    const { slug: _slug, ...withoutSlug } = baseSpace;
    const parsed = SpaceListItemSchema.safeParse(withoutSlug);
    expect(parsed.success).toBe(false);
  });

  it('coerces a numeric-string id into a number', () => {
    const parsed = SpaceListItemSchema.safeParse({ ...baseSpace, id: '14' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(14);
    }
  });

  it('coerces a numeric-string members_count into a number', () => {
    const parsed = SpaceListItemSchema.safeParse({ ...baseSpace, members_count: '120' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.members_count).toBe(120);
    }
  });

  it('accepts nullable optional fields set to null', () => {
    const parsed = SpaceListItemSchema.safeParse({
      slug: 'minimal',
      title: null,
      description: null,
      privacy: null,
      members_count: null,
      permalink: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('preserves unknown fields via passthrough', () => {
    const parsed = SpaceListItemSchema.safeParse({
      ...baseSpace,
      permissions: { can_create_post: true },
      future_field: 42,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly permissions?: unknown; readonly future_field?: unknown };
      expect(data.permissions).toEqual({ can_create_post: true });
      expect(data.future_field).toBe(42);
    }
  });
});

describe('SpacesResponseSchema', () => {
  it('accepts the array form of the spaces envelope', () => {
    const parsed = SpacesResponseSchema.safeParse({ spaces: [baseSpace] });
    expect(parsed.success).toBe(true);
  });

  it('accepts the data envelope form with total and has_more', () => {
    const parsed = SpacesResponseSchema.safeParse({
      spaces: {
        data: [baseSpace],
        total: 1,
        has_more: false,
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const spaces = parsed.data.spaces;
      expect(Array.isArray(spaces)).toBe(false);
      if (!Array.isArray(spaces)) {
        expect(spaces.total).toBe(1);
        expect(spaces.has_more).toBe(false);
      }
    }
  });

  it('rejects a payload missing the spaces field', () => {
    const parsed = SpacesResponseSchema.safeParse({ items: [baseSpace] });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload with a malformed entry', () => {
    const malformed = { ...baseSpace, id: 'not-a-number' };
    const parsed = SpacesResponseSchema.safeParse({ spaces: [malformed] });
    expect(parsed.success).toBe(false);
  });

  it('preserves unknown top-level fields via passthrough', () => {
    const parsed = SpacesResponseSchema.safeParse({
      spaces: [baseSpace],
      meta: { generated_at: '2026-05-15T00:00:00Z' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly meta?: unknown };
      expect(data.meta).toEqual({ generated_at: '2026-05-15T00:00:00Z' });
    }
  });
});
