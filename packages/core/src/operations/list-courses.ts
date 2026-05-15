import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { CoursesResponseSchema, type CourseListItem } from '../schemas/courses.js';

export const ListCoursesInputSchema = z.object({
  limit: z.number().int().positive().max(200).optional().default(100),
});

export type ListCoursesInput = z.input<typeof ListCoursesInputSchema>;

export interface ListCoursesOutput {
  readonly courses: readonly CourseListItem[];
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

export const listCourses = async (
  client: GetClient,
  input?: ListCoursesInput,
): Promise<Result<ListCoursesOutput, AppError>> => {
  const parsed = ListCoursesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }

  const { limit } = parsed.data;

  const response = await client.get(COURSES_PATH, CoursesResponseSchema, {
    per_page: limit,
  });

  if (!response.ok) {
    return err(response.error);
  }

  return ok({ courses: extractCourses(response.value) });
};
