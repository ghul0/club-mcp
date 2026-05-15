import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { SpacesResponseSchema, type SpaceListItem } from '../schemas/spaces.js';

export const ListSpacesInputSchema = z
  .object({
    include_members: z.boolean().optional().default(false),
    member_limit: z.number().int().positive().max(100).optional().default(50),
  })
  .strict();

export type ListSpacesInput = z.input<typeof ListSpacesInputSchema>;

export interface ListSpacesOutput {
  readonly spaces: readonly SpaceListItem[];
}

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

export const listSpaces = async (
  client: GetClient,
  input?: ListSpacesInput,
): Promise<Result<ListSpacesOutput, AppError>> => {
  const parsed = ListSpacesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }


  const response = await client.get('/spaces/all-spaces', SpacesResponseSchema);

  if (!response.ok) {
    return err(response.error);
  }

  return ok({ spaces: extractSpaces(response.value) });
};
