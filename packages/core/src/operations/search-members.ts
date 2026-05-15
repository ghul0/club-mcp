import { z } from 'zod';
import type { GetClient } from '../http/client.js';
import type { Result } from '../result.js';
import { err } from '../result.js';
import type { AppError } from '../errors.js';
import { validationError } from '../errors.js';
import { MembersResponseSchema, type Member } from '../schemas/members.js';

export const SearchMembersInputSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().positive().max(100).optional().default(50),
});

export type SearchMembersInput = z.input<typeof SearchMembersInputSchema>;

export interface SearchMembersOutput {
  readonly members: readonly Member[];
}

const formatIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `invalid input: ${issues.join('; ')}${suffix}`;
};

const extractMembers = (response: z.infer<typeof MembersResponseSchema>): readonly Member[] => {
  const raw = response.members;
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw.data;
};

export const searchMembers = async (
  client: GetClient,
  input: SearchMembersInput,
): Promise<Result<SearchMembersOutput, AppError>> => {
  const parsed = SearchMembersInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(formatIssues(parsed.error)));
  }

  const { query, limit } = parsed.data;

  const response = await client.get('/members', MembersResponseSchema, {
    search: query,
    per_page: limit,
  });

  if (!response.ok) {
    return err(response.error);
  }

  return { ok: true, value: { members: extractMembers(response.value) } };
};
