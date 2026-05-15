import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { concurrentMap } from '../concurrency.js';
import { MembersResponseSchema, MemberSchema, type Member } from '../schemas/members.js';
import { SpacesResponseSchema, SpaceListItemSchema, type SpaceListItem } from '../schemas/spaces.js';

export const ListSpacesOutputSchema = z.object({
  spaces: z.array(
    SpaceListItemSchema.extend({
      members: z.array(MemberSchema).optional(),
    }),
  ),
});

export const ListSpacesInputSchema = z
  .object({
    include_members: z.boolean().optional().default(false),
    member_limit: z.number().int().positive().max(100).optional().default(50),
  })
  .strict();

export type ListSpacesInput = z.input<typeof ListSpacesInputSchema>;

export type SpaceWithMembers = SpaceListItem & {
  readonly members?: readonly Member[];
};

export interface ListSpacesOutput {
  readonly spaces: readonly SpaceWithMembers[];
}

const SPACE_MEMBER_CONCURRENCY = 4;

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractSpaces = (response: z.infer<typeof SpacesResponseSchema>): readonly SpaceListItem[] => {
  const raw = response.spaces;
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.data;
};

const extractMembers = (response: z.infer<typeof MembersResponseSchema>): readonly Member[] => {
  const raw = response.members;
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.data;
};

const fetchSpaceMembers = async (
  client: GetClient,
  slug: string,
  memberLimit: number,
): Promise<Result<readonly Member[], AppError>> => {
  const path = `/spaces/${encodeURIComponent(slug)}/members`;
  const response = await client.get(path, MembersResponseSchema, {
    page: 1,
    per_page: memberLimit,
  });
  if (!response.ok) {
    return err(response.error);
  }
  return ok(extractMembers(response.value).slice(0, memberLimit));
};

export const listSpaces = async (
  client: GetClient,
  input?: ListSpacesInput,
): Promise<Result<ListSpacesOutput, AppError>> => {
  const parsed = ListSpacesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }
  const { include_members, member_limit } = parsed.data;

  const response = await client.get('/spaces/all-spaces', SpacesResponseSchema);
  if (!response.ok) {
    return err(response.error);
  }
  const spaces = extractSpaces(response.value);

  if (!include_members || spaces.length === 0) {
    return ok({ spaces });
  }

  const memberResults = await concurrentMap(
    spaces,
    (space) => fetchSpaceMembers(client, space.slug, member_limit),
    SPACE_MEMBER_CONCURRENCY,
  );

  const enriched: SpaceWithMembers[] = [];
  for (let i = 0; i < spaces.length; i += 1) {
    const space = spaces[i];
    const result = memberResults[i];
    if (!space || !result) {
      continue;
    }
    if (!result.ok) {
      return err(result.error);
    }
    enriched.push({ ...space, members: result.value });
  }
  return ok({ spaces: enriched });
};
