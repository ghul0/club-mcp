import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import {
  ProfileResponseSchema,
  ProfileSpacesResponseSchema,
  type Profile,
  type ProfileSpace,
} from '../schemas/profile.js';

export const GetMyProfileInputSchema = z
  .object({
    consent: z.literal(true, {
      errorMap: () => ({
        message: 'consent must be explicitly true to fetch own profile (privacy gate)',
      }),
    }),
    include_private_fields: z.boolean().optional().default(false),
    include_spaces: z.boolean().optional().default(true),
  })
  .strict();

export type GetMyProfileInput = z.input<typeof GetMyProfileInputSchema>;
type ResolvedInput = z.output<typeof GetMyProfileInputSchema>;

export interface GetMyProfileOutput {
  readonly profile: Profile;
  readonly spaces?: readonly ProfileSpace[];
}

const ME_PATH = '/profile/me';
const ME_SPACES_PATH = '/profile/me/spaces';

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid getMyProfile input: ${issues.join('; ')}${suffix}`;
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

export const getMyProfile = async (
  client: GetClient,
  input: GetMyProfileInput,
): Promise<Result<GetMyProfileOutput, AppError>> => {
  const parsed = GetMyProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }
  const resolved: ResolvedInput = parsed.data;

  const profileResponse = await client.get(ME_PATH, ProfileResponseSchema);
  if (!profileResponse.ok) {
    return err(profileResponse.error);
  }

  if (!resolved.include_spaces) {
    return ok({ profile: profileResponse.value.profile });
  }

  const spacesResponse = await client.get(ME_SPACES_PATH, ProfileSpacesResponseSchema);
  if (!spacesResponse.ok) {
    return err(spacesResponse.error);
  }

  return ok({
    profile: profileResponse.value.profile,
    spaces: extractSpaces(spacesResponse.value),
  });
};
