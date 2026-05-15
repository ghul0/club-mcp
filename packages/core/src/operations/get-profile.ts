import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import {
  ProfileResponseSchema,
  ProfileSpacesResponseSchema,
  ProfileCommentsResponseSchema,
  ProfileSchema,
  type Profile,
  type ProfileSpace,
} from '../schemas/profile.js';
import { CommentSchema, type Comment } from '../schemas/comments.js';

const ProfileSpaceOutSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
});

export const GetProfileOutputSchema = z.object({
  profile: ProfileSchema,
  spaces: z.array(ProfileSpaceOutSchema).optional(),
  recent_comments: z.array(CommentSchema).optional(),
});

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
type ResolvedInput = z.output<typeof GetProfileInputSchema>;

export interface GetProfileOutput {
  readonly profile: Profile;
  readonly spaces?: readonly ProfileSpace[];
  readonly recent_comments?: readonly Comment[];
}

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractSpaces = (
  envelope: z.infer<typeof ProfileSpacesResponseSchema>,
): readonly ProfileSpace[] => {
  const spaces = envelope.spaces;
  if (Array.isArray(spaces)) {
    return spaces;
  }
  return spaces.data;
};

const extractProfileComments = (
  envelope: z.infer<typeof ProfileCommentsResponseSchema>,
): readonly Comment[] => {
  const comments = envelope.comments;
  if (Array.isArray(comments)) {
    return comments;
  }
  return comments.data;
};

export const getProfile = async (
  client: GetClient,
  input: GetProfileInput,
): Promise<Result<GetProfileOutput, AppError>> => {
  const parsed = GetProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }

  const resolved: ResolvedInput = parsed.data;
  const encoded = encodeURIComponent(resolved.username);
  const profilePath = `/profile/${encoded}`;

  const profileResponse = await client.get(profilePath, ProfileResponseSchema);
  if (!profileResponse.ok) {
    return err(profileResponse.error);
  }

  const subFetches: Array<Promise<Result<unknown, AppError>>> = [];
  if (resolved.include_spaces) {
    subFetches.push(client.get(`${profilePath}/spaces`, ProfileSpacesResponseSchema));
  }
  if (resolved.include_recent_comments) {
    subFetches.push(
      client.get(`${profilePath}/comments`, ProfileCommentsResponseSchema, {
        page: 1,
        per_page: resolved.limit,
      }),
    );
  }

  if (subFetches.length === 0) {
    return ok({ profile: profileResponse.value.profile });
  }

  const subResults = await Promise.all(subFetches);
  let cursor = 0;
  let spaces: readonly ProfileSpace[] | undefined;
  let recentComments: readonly Comment[] | undefined;

  if (resolved.include_spaces) {
    const r = subResults[cursor];
    cursor += 1;
    if (!r) {
      return err(validationError('internal: missing sub-fetch result'));
    }
    if (!r.ok) {
      return err(r.error);
    }
    spaces = extractSpaces(r.value as z.infer<typeof ProfileSpacesResponseSchema>);
  }
  if (resolved.include_recent_comments) {
    const r = subResults[cursor];
    cursor += 1;
    if (!r) {
      return err(validationError('internal: missing sub-fetch result'));
    }
    if (!r.ok) {
      return err(r.error);
    }
    recentComments = extractProfileComments(
      r.value as z.infer<typeof ProfileCommentsResponseSchema>,
    );
  }

  const output: GetProfileOutput = {
    profile: profileResponse.value.profile,
    ...(spaces !== undefined ? { spaces } : {}),
    ...(recentComments !== undefined ? { recent_comments: recentComments } : {}),
  };
  return ok(output);
};
