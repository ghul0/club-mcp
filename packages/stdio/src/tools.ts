import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  searchMembers,
  SearchMembersInputSchema,
  getFeed,
  GetFeedInputSchema,
  getFeedComments,
  GetFeedCommentsInputSchema,
  getRecentPosts,
  GetRecentPostsInputSchema,
  getRecentComments,
  GetRecentCommentsInputSchema,
  searchContent,
  SearchContentInputSchema,
  getProfile,
  GetProfileInputSchema,
  getMyProfile,
  GetMyProfileInputSchema,
  listSpaces,
  ListSpacesInputSchema,
  listCourses,
  ListCoursesInputSchema,
  getUnreadNotifications,
  GetUnreadNotificationsInputSchema,
  getUserComments,
  GetUserCommentsInputSchema,
  getSinceSummary,
  GetSinceSummaryInputSchema,
  type GetClient,
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

const tools: readonly ToolEntry[] = [
  {
    def: {
      name: 'club_search_members',
      description: 'Find visible members/profiles by search text.',
      inputSchema: toJsonSchema(SearchMembersInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await searchMembers(deps.client, input as z.input<typeof SearchMembersInputSchema>)),
  },
  {
    def: {
      name: 'club_get_profile',
      description: 'Get visible profile fields for another user.',
      inputSchema: toJsonSchema(GetProfileInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await getProfile(deps.client, input as z.input<typeof GetProfileInputSchema>)),
  },
  {
    def: {
      name: 'club_get_my_profile',
      description: 'Get the authenticated user\'s own profile (may include private fields with consent).',
      inputSchema: toJsonSchema(GetMyProfileInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await getMyProfile(deps.client, input as z.input<typeof GetMyProfileInputSchema>)),
  },
  {
    def: {
      name: 'club_list_spaces',
      description: 'List visible spaces/pokoje.',
      inputSchema: toJsonSchema(ListSpacesInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await listSpaces(deps.client, input as z.input<typeof ListSpacesInputSchema>)),
  },
  {
    def: {
      name: 'club_list_courses',
      description: 'List visible courses.',
      inputSchema: toJsonSchema(ListCoursesInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await listCourses(deps.client, input as z.input<typeof ListCoursesInputSchema>)),
  },
  {
    def: {
      name: 'club_get_feed',
      description: 'Fetch one visible post/thread by ID.',
      inputSchema: toJsonSchema(GetFeedInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    handler: async (deps, input) =>
      mapResultToTool(await getFeed(deps.client, input as z.input<typeof GetFeedInputSchema>)),
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
        await getFeedComments(deps.client, input as z.input<typeof GetFeedCommentsInputSchema>),
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
        await getUserComments(deps.client, input as z.input<typeof GetUserCommentsInputSchema>),
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
        await getRecentPosts(deps.client, input as z.input<typeof GetRecentPostsInputSchema>),
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
        await getRecentComments(deps.client, input as z.input<typeof GetRecentCommentsInputSchema>),
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
        await getSinceSummary(deps.client, input as z.input<typeof GetSinceSummaryInputSchema>),
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
        await getUnreadNotifications(
          deps.client,
          input as z.input<typeof GetUnreadNotificationsInputSchema>,
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
        await searchContent(deps.client, input as z.input<typeof SearchContentInputSchema>),
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
