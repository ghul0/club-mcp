import { z } from 'zod';

const CourseInnerSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  description_text: z.string().nullable().optional(),
  description_html: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
});

const CourseLessonSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: z.string().nullable().optional(),
});

const CourseSectionSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: z.string().nullable().optional(),
  lessons: z.array(CourseLessonSchema).optional(),
});

export const CourseListItemSchema = z.object({
  course: CourseInnerSchema,
  sections: z.array(CourseSectionSchema).optional(),
  track: z.string().nullable().optional(),
});

export const CoursesResponseSchema = z.object({
  courses: z.union([
    z.array(CourseListItemSchema),
    z.object({
      data: z.array(CourseListItemSchema),
      has_more: z.boolean().optional(),
      total: z.number().optional(),
    }),
  ]),
});

export type CourseListItem = z.infer<typeof CourseListItemSchema>;
export type CoursesResponse = z.infer<typeof CoursesResponseSchema>;
