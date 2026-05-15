import { describe, expect, it } from 'vitest';
import { CourseListItemSchema, CoursesResponseSchema } from '../src/schemas/courses.js';

const baseCourse = {
  course: {
    id: 9,
    slug: 'ai-basics',
    title: 'AI Basics',
    description_text: 'Intro course',
    description_html: '<p>Intro course</p>',
    permalink: 'https://club.hyperhuman.pl/course/ai-basics',
  },
  sections: [
    {
      id: 1,
      title: 'Module 1',
      lessons: [{ id: 101, title: 'Lesson 1' }],
    },
  ],
};

describe('CourseListItemSchema', () => {
  it('accepts a valid course payload', () => {
    const parsed = CourseListItemSchema.safeParse(baseCourse);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.course.id).toBe(9);
      expect(parsed.data.course.slug).toBe('ai-basics');
    }
  });

  it('accepts a course with only the inner course slug', () => {
    const parsed = CourseListItemSchema.safeParse({ course: { slug: 'minimum' } });
    expect(parsed.success).toBe(true);
  });

  it('rejects when the course object is missing', () => {
    const parsed = CourseListItemSchema.safeParse({ sections: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejects when the inner course slug is missing', () => {
    const parsed = CourseListItemSchema.safeParse({ course: { title: 'No slug' } });
    expect(parsed.success).toBe(false);
  });

  it('coerces a numeric-string course id into a number', () => {
    const parsed = CourseListItemSchema.safeParse({
      ...baseCourse,
      course: { ...baseCourse.course, id: '9' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.course.id).toBe(9);
    }
  });

  it('accepts a course with no sections array', () => {
    const parsed = CourseListItemSchema.safeParse({ course: baseCourse.course });
    expect(parsed.success).toBe(true);
  });

  it('preserves unknown fields via passthrough', () => {
    const parsed = CourseListItemSchema.safeParse({
      ...baseCourse,
      track: 'beginner',
      future_field: { nested: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly track?: unknown; readonly future_field?: unknown };
      expect(data.track).toBe('beginner');
      expect(data.future_field).toEqual({ nested: true });
    }
  });
});

describe('CoursesResponseSchema', () => {
  it('accepts the array form of the courses envelope', () => {
    const parsed = CoursesResponseSchema.safeParse({ courses: [baseCourse] });
    expect(parsed.success).toBe(true);
  });

  it('accepts the data envelope form with total and has_more', () => {
    const parsed = CoursesResponseSchema.safeParse({
      courses: {
        data: [baseCourse],
        total: 1,
        has_more: false,
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const courses = parsed.data.courses;
      expect(Array.isArray(courses)).toBe(false);
      if (!Array.isArray(courses)) {
        expect(courses.total).toBe(1);
      }
    }
  });

  it('rejects a payload missing the courses field', () => {
    const parsed = CoursesResponseSchema.safeParse({ items: [baseCourse] });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload with a malformed entry', () => {
    const malformed = { course: { id: 'not-a-number', slug: 'x' } };
    const parsed = CoursesResponseSchema.safeParse({ courses: [malformed] });
    expect(parsed.success).toBe(false);
  });

  it('preserves unknown top-level fields via passthrough', () => {
    const parsed = CoursesResponseSchema.safeParse({
      courses: [baseCourse],
      count: 1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as { readonly count?: unknown };
      expect(data.count).toBe(1);
    }
  });
});
