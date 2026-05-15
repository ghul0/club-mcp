import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { ProfileResponseSchema, type Profile } from '../schemas/profile.js';

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export const GetProfileInputSchema = z
  .object({
    username: z.string().regex(USERNAME_PATTERN, 'must match ^[A-Za-z0-9_-]{1,80}$'),
    include_spaces: z.boolean().optional().default(true),
    include_recent_comments: z.boolean().optional().default(false),
    limit: z.number().int().positive().max(100).optional().default(20),
  })
  .strict();

export type GetProfileInput = z.input<typeof GetProfileInputSchema>;

export interface GetProfileOutput {
  readonly profile: Profile;
}

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

export const getProfile = async (
  client: GetClient,
  input: GetProfileInput,
): Promise<Result<GetProfileOutput, AppError>> => {
  const parsed = GetProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }

  const { username } = parsed.data;
  const path = `/profile/${encodeURIComponent(username)}`;

  const response = await client.get(path, ProfileResponseSchema);
  if (!response.ok) {
    return err(response.error);
  }

  return ok({ profile: response.value.profile });
};
