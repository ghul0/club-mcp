import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { CoursesResponseSchema, CourseListItemSchema, type CourseListItem } from '../schemas/courses.js';

export const ListCoursesOutputSchema = z.object({
  courses: z.array(CourseListItemSchema),
  count: z.number().int().nonnegative(),
});

export const ListCoursesInputSchema = z
  .object({
    include_sections: z.boolean().optional().default(true),
  })
  .strict();

export type ListCoursesInput = z.input<typeof ListCoursesInputSchema>;

export interface ListCoursesOutput {
  readonly courses: readonly CourseListItem[];
  readonly count: number;
}

const COURSES_PATH = '/courses/all-courses';

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractCourses = (response: z.infer<typeof CoursesResponseSchema>): readonly CourseListItem[] => {
  const raw = response.courses;
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.data;
};

const stripSections = (course: CourseListItem): CourseListItem => {
  if (course.sections === undefined) {
    return course;
  }
  const stripped: CourseListItem = { course: course.course };
  if (course.track !== undefined) {
    return { ...stripped, track: course.track };
  }
  return stripped;
};

export const listCourses = async (
  client: GetClient,
  input?: ListCoursesInput,
): Promise<Result<ListCoursesOutput, AppError>> => {
  const parsed = ListCoursesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }
  const { include_sections } = parsed.data;

  const response = await client.get(COURSES_PATH, CoursesResponseSchema);

  if (!response.ok) {
    return err(response.error);
  }

  const courses = extractCourses(response.value);
  if (include_sections) {
    return ok({ courses, count: courses.length });
  }
  const stripped = courses.map(stripSections);
  return ok({ courses: stripped, count: stripped.length });
};
