import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { redactKeys } from '../redaction.js';
import {
  ProfileResponseSchema,
  ProfileSpacesResponseSchema,
  ProfileSchema,
  type Profile,
  type ProfileSpace,
} from '../schemas/profile.js';

const ProfileSpaceOutSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
});

export const GetMyProfileOutputSchema = z.object({
  profile: ProfileSchema,
  spaces: z.array(ProfileSpaceOutSchema).optional(),
});

const PRIVATE_FIELD_KEYS: ReadonlyArray<string> = [
  'email',
  'user_email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'address',
  'ip_address',
  'last_login_ip',
];

export const GetMyProfileInputSchema = z
  .object({
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

const redactPrivateFields = (profile: Profile): Profile =>
  redactKeys(profile, { blocklistKeys: PRIVATE_FIELD_KEYS });

export const getMyProfile = async (
  client: GetClient,
  input?: GetMyProfileInput,
): Promise<Result<GetMyProfileOutput, AppError>> => {
  const parsed = GetMyProfileInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }
  const resolved: ResolvedInput = parsed.data;

  const profileResponse = await client.get(ME_PATH, ProfileResponseSchema);
  if (!profileResponse.ok) {
    return err(profileResponse.error);
  }
  const profile = resolved.include_private_fields
    ? profileResponse.value.profile
    : redactPrivateFields(profileResponse.value.profile);

  if (!resolved.include_spaces) {
    return ok({ profile });
  }

  const spacesResponse = await client.get(ME_SPACES_PATH, ProfileSpacesResponseSchema);
  if (!spacesResponse.ok) {
    return err(spacesResponse.error);
  }

  return ok({
    profile,
    spaces: extractSpaces(spacesResponse.value),
  });
};
