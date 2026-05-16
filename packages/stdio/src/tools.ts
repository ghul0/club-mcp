import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  searchMembers,
  SearchMembersInputSchema,
  SearchMembersOutputSchema,
  getFeed,
  GetFeedInputSchema,
  GetFeedOutputSchema,
  getFeedComments,
  GetFeedCommentsInputSchema,
  GetFeedCommentsOutputSchema,
  getRecentPosts,
  GetRecentPostsInputSchema,
  GetRecentPostsOutputSchema,
  getRecentComments,
  GetRecentCommentsInputSchema,
  GetRecentCommentsOutputSchema,
  searchContent,
  SearchContentInputSchema,
  SearchContentOutputSchema,
  getProfile,
  GetProfileInputSchema,
  GetProfileOutputSchema,
  getMyProfile,
  GetMyProfileInputSchema,
  GetMyProfileOutputSchema,
  listSpaces,
  ListSpacesInputSchema,
  ListSpacesOutputSchema,
  listCourses,
  ListCoursesInputSchema,
  ListCoursesOutputSchema,
  getUnreadNotifications,
  GetUnreadNotificationsInputSchema,
  GetUnreadNotificationsOutputSchema,
  getUserComments,
  GetUserCommentsInputSchema,
  GetUserCommentsOutputSchema,
  getSinceSummary,
  GetSinceSummaryInputSchema,
  GetSinceSummaryOutputSchema,
  externalServiceNonRetryable,
  redactKeys,
  ok,
  err,
  type Result,
  type AppError,
  type GetClient,
  type GetMyProfileOutput,
} from '@hhc-mcp/core';
import { mapResultToTool, type ToolResult } from './error-mapper.js';

export type ToolAnnotations = {
  readonly readOnlyHint: true;
  readonly destructiveHint: false;
  readonly idempotentHint: true;
  readonly openWorldHint: false;
};

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: ToolAnnotations;
};

export type ToolDeps = {
  readonly client: GetClient;
};

type ToolHandler = (deps: ToolDeps, input: unknown) => Promise<ToolResult>;

type ToolEntry = {
  readonly def: ToolDefinition;
  readonly handler: ToolHandler;
};

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const toJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const json: unknown = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' });
  return json as Record<string, unknown>;
};

const validateOutput = <T>(
  schema: z.ZodType<unknown>,
  result: Result<T, AppError>,
): Result<T, AppError> => {
  if (!result.ok) {
    return result;
  }
  const parsed = schema.safeParse(result.value);
  if (!parsed.success) {
    return err(
      externalServiceNonRetryable(
        `internal output schema mismatch: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      ),
    );
  }
  return ok(parsed.data as T);
};

const inputRequestsPrivateFields = (input: unknown): boolean => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  return (input as { readonly include_private_fields?: unknown }).include_private_fields === true;
};

const redactMyProfileOutput = (
  value: GetMyProfileOutput,
  preserveEmail: boolean,
): GetMyProfileOutput => {
  const sanitized = redactKeys(value);
  if (!preserveEmail || value.profile.email === undefined) {
    return sanitized;
  }
  return {
    ...sanitized,
    profile: {
      ...sanitized.profile,
      email: value.profile.email,
    },
  };
};

const tools: readonly ToolEntry[] = [
  {
    def: {
      name: 'club_search_members',
      description: 'Find visible members/profiles by search text.',
      inputSchema: toJsonSchema(SearchMembersInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          SearchMembersOutputSchema,
          await searchMembers(deps.client, input as z.input<typeof SearchMembersInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_profile',
      description: 'Get visible profile fields for another user.',
      inputSchema: toJsonSchema(GetProfileInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetProfileOutputSchema,
          await getProfile(deps.client, input as z.input<typeof GetProfileInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_my_profile',
      description: 'Get the authenticated user\'s own profile (private fields redacted by default).',
      inputSchema: toJsonSchema(GetMyProfileInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) => {
      const preserveEmail = inputRequestsPrivateFields(input);
      return mapResultToTool(
        validateOutput(
          GetMyProfileOutputSchema,
          await getMyProfile(deps.client, input as z.input<typeof GetMyProfileInputSchema>),
        ),
        undefined,
        (value) => redactMyProfileOutput(value, preserveEmail),
      );
    },
  },
  {
    def: {
      name: 'club_list_spaces',
      description: 'List visible spaces/pokoje.',
      inputSchema: toJsonSchema(ListSpacesInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          ListSpacesOutputSchema,
          await listSpaces(deps.client, input as z.input<typeof ListSpacesInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_list_courses',
      description: 'List visible courses.',
      inputSchema: toJsonSchema(ListCoursesInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          ListCoursesOutputSchema,
          await listCourses(deps.client, input as z.input<typeof ListCoursesInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_feed',
      description: 'Fetch one visible post/thread by ID.',
      inputSchema: toJsonSchema(GetFeedInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetFeedOutputSchema,
          await getFeed(deps.client, input as z.input<typeof GetFeedInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_feed_comments',
      description: 'Fetch comments for one visible feed.',
      inputSchema: toJsonSchema(GetFeedCommentsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetFeedCommentsOutputSchema,
          await getFeedComments(deps.client, input as z.input<typeof GetFeedCommentsInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_user_comments',
      description: 'List comments by a specific user, optionally since a time.',
      inputSchema: toJsonSchema(GetUserCommentsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetUserCommentsOutputSchema,
          await getUserComments(deps.client, input as z.input<typeof GetUserCommentsInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_recent_posts',
      description: 'List visible posts created since a given time.',
      inputSchema: toJsonSchema(GetRecentPostsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetRecentPostsOutputSchema,
          await getRecentPosts(deps.client, input as z.input<typeof GetRecentPostsInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_recent_comments',
      description: 'List visible comments created or edited since a given time.',
      inputSchema: toJsonSchema(GetRecentCommentsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetRecentCommentsOutputSchema,
          await getRecentComments(deps.client, input as z.input<typeof GetRecentCommentsInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_since_summary',
      description: 'Convenience aggregation for what is new since a given time.',
      inputSchema: toJsonSchema(GetSinceSummaryInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetSinceSummaryOutputSchema,
          await getSinceSummary(deps.client, input as z.input<typeof GetSinceSummaryInputSchema>),
        ),
      ),
  },
  {
    def: {
      name: 'club_get_unread_notifications',
      description: 'Get unread notification count and visible unread notification metadata for the authenticated user.',
      inputSchema: toJsonSchema(GetUnreadNotificationsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          GetUnreadNotificationsOutputSchema,
          await getUnreadNotifications(
            deps.client,
            input as z.input<typeof GetUnreadNotificationsInputSchema>,
          ),
        ),
      ),
  },
  {
    def: {
      name: 'club_search_content',
      description: 'Search visible posts, comments, and members.',
      inputSchema: toJsonSchema(SearchContentInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(
        validateOutput(
          SearchContentOutputSchema,
          await searchContent(deps.client, input as z.input<typeof SearchContentInputSchema>),
        ),
      ),
  },
];

export const listToolDefinitions = (): readonly ToolDefinition[] => tools.map((t) => t.def);

export const callTool = async (
  deps: ToolDeps,
  name: string,
  args: unknown,
): Promise<ToolResult> => {
  const found = tools.find((t) => t.def.name === name);
  if (!found) {
    return {
      isError: true,
      content: [{ type: 'text', text: `validation: unknown tool: ${name}` }],
      structuredContent: {
        error: {
          code: 'validation',
          message: `unknown tool: ${name}`,
          retryable: false,
        },
      },
    };
  }
  return found.handler(deps, args);
};
