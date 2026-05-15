import { describe, expect, it } from 'vitest';
import * as Core from '../src/index.js';

const FUNCTIONS: readonly string[] = [
  'ok',
  'err',
  'isOk',
  'isErr',
  'map',
  'flatMap',
  'match',
  'validationError',
  'authMissing',
  'authInvalid',
  'upstreamUnauthorized',
  'upstreamForbidden',
  'upstreamNotFound',
  'rateLimit',
  'externalService',
  'unsupportedAuth',
  'createHttpClient',
  'paginate',
  'concurrentMap',
  'parseSince',
  'formatWpLocal',
  'redactKeys',
  'htmlToText',
  'truncate',
  'createBasicAuthProvider',
  'loadBasicAuthFromEnv',
  'redactBasicAuth',
];

const OPERATIONS: readonly string[] = [
  'searchMembers',
  'getFeed',
  'getFeedComments',
  'getRecentPosts',
  'getRecentComments',
  'searchContent',
  'getProfile',
  'getMyProfile',
  'listSpaces',
  'listCourses',
  'getUnreadNotifications',
];

const SCHEMAS: readonly string[] = [
  'MemberSchema',
  'MembersResponseSchema',
  'AuthorSchema',
  'SpaceSchema',
  'FeedSchema',
  'FeedsListResponseSchema',
  'FeedByIdResponseSchema',
  'CommentSchema',
  'CommentsResponseSchema',
  'ProfileSchema',
  'ProfileResponseSchema',
  'ProfileSpacesResponseSchema',
  'ProfileCommentsResponseSchema',
  'ProfileBundleSchema',
  'SpaceListItemSchema',
  'SpacesResponseSchema',
  'CourseListItemSchema',
  'CoursesResponseSchema',
  'NotificationItemSchema',
  'UnreadNotificationsResponseSchema',
  'AppErrorEnvelope',
];

const INPUT_SCHEMAS: readonly string[] = [
  'SearchMembersInputSchema',
  'GetFeedInputSchema',
  'GetFeedCommentsInputSchema',
  'GetRecentPostsInputSchema',
  'GetRecentCommentsInputSchema',
  'SearchContentInputSchema',
  'GetProfileInputSchema',
  'GetMyProfileInputSchema',
  'ListSpacesInputSchema',
  'ListCoursesInputSchema',
  'GetUnreadNotificationsInputSchema',
];

const CONSTANTS: readonly string[] = ['packageName', 'DEFAULT_CONCURRENCY', 'MAX_CONCURRENCY'];

const EXPECTED_RUNTIME_EXPORTS: ReadonlyArray<string> = [
  ...FUNCTIONS,
  ...OPERATIONS,
  ...SCHEMAS,
  ...INPUT_SCHEMAS,
  ...CONSTANTS,
];

describe('@hhc-mcp/core public exports (ADR-004 boundary)', () => {
  it('exposes Result helpers as functions', () => {
    const helpers: readonly string[] = ['ok', 'err', 'isOk', 'isErr', 'map', 'flatMap', 'match'];
    for (const name of helpers) {
      expect(typeof Core[name as keyof typeof Core]).toBe('function');
    }
  });

  it('exposes error constructors as functions', () => {
    const constructors: readonly string[] = [
      'validationError',
      'authMissing',
      'authInvalid',
      'upstreamUnauthorized',
      'upstreamForbidden',
      'upstreamNotFound',
      'rateLimit',
      'externalService',
      'unsupportedAuth',
    ];
    for (const name of constructors) {
      expect(typeof Core[name as keyof typeof Core]).toBe('function');
    }
  });

  it('error constructors produce a well-formed AppError', () => {
    const e = Core.validationError('bad input');
    expect(e.code).toBe('validation');
    expect(e.message).toBe('bad input');
    expect(e.retryable).toBe(false);
    const parsed = Core.AppErrorEnvelope.safeParse(e);
    expect(parsed.success).toBe(true);
  });

  it('exposes HTTP client factory and helpers', () => {
    expect(typeof Core.createHttpClient).toBe('function');
    expect(typeof Core.paginate).toBe('function');
    expect(typeof Core.concurrentMap).toBe('function');
  });

  it('exposes date and redaction helpers', () => {
    expect(typeof Core.parseSince).toBe('function');
    expect(typeof Core.formatWpLocal).toBe('function');
    expect(typeof Core.redactKeys).toBe('function');
    expect(typeof Core.htmlToText).toBe('function');
    expect(typeof Core.truncate).toBe('function');
  });

  it('exposes basic auth provider helpers', () => {
    expect(typeof Core.createBasicAuthProvider).toBe('function');
    expect(typeof Core.loadBasicAuthFromEnv).toBe('function');
    expect(typeof Core.redactBasicAuth).toBe('function');
  });

  it('exposes all 11 operation functions', () => {
    expect(OPERATIONS.length).toBe(11);
    for (const op of OPERATIONS) {
      expect(typeof Core[op as keyof typeof Core]).toBe('function');
    }
  });

  it('exposes all response Zod schemas with parse method', () => {
    for (const name of SCHEMAS) {
      const schema = Core[name as keyof typeof Core] as { parse?: unknown; safeParse?: unknown } | undefined;
      expect(schema).toBeDefined();
      expect(typeof schema?.parse).toBe('function');
      expect(typeof schema?.safeParse).toBe('function');
    }
  });

  it('exposes all 11 operation input schemas with parse method', () => {
    expect(INPUT_SCHEMAS.length).toBe(11);
    for (const name of INPUT_SCHEMAS) {
      const schema = Core[name as keyof typeof Core] as { parse?: unknown; safeParse?: unknown } | undefined;
      expect(schema).toBeDefined();
      expect(typeof schema?.parse).toBe('function');
      expect(typeof schema?.safeParse).toBe('function');
    }
  });

  it('exposes packageName constant', () => {
    expect(Core.packageName).toBe('@hhc-mcp/core');
  });

  it('rejects underscore-prefixed or "internal" exports', () => {
    const keys = Object.keys(Core);
    for (const key of keys) {
      expect(key.startsWith('_')).toBe(false);
      expect(key.toLowerCase().includes('internal')).toBe(false);
      expect(key.toLowerCase().includes('private')).toBe(false);
    }
  });

  it('only exposes documented runtime exports (no undocumented leaks)', () => {
    const documented = new Set(EXPECTED_RUNTIME_EXPORTS);
    const actual = Object.keys(Core);
    const undocumented = actual.filter((k) => !documented.has(k));
    expect(undocumented).toEqual([]);
  });

  it('documented runtime exports are all present', () => {
    const actual = new Set(Object.keys(Core));
    const missing = EXPECTED_RUNTIME_EXPORTS.filter((k) => !actual.has(k));
    expect(missing).toEqual([]);
  });
});

describe('@hhc-mcp/core type-level public surface (ADR-004)', () => {
  it('imports type-only exports without runtime presence', () => {
    type _Result = Core.Result<number, string>;
    type _AppError = Core.AppError;
    type _ErrorCode = Core.ErrorCode;
    type _GetClient = Core.GetClient;
    type _BasicAuthProvider = Core.BasicAuthProvider;
    type _SearchMembersInput = Core.SearchMembersInput;
    type _SearchMembersOutput = Core.SearchMembersOutput;
    type _GetFeedInput = Core.GetFeedInput;
    type _GetFeedOutput = Core.GetFeedOutput;
    type _GetFeedCommentsInput = Core.GetFeedCommentsInput;
    type _GetFeedCommentsOutput = Core.GetFeedCommentsOutput;
    type _GetRecentPostsInput = Core.GetRecentPostsInput;
    type _GetRecentPostsOutput = Core.GetRecentPostsOutput;
    type _GetRecentCommentsInput = Core.GetRecentCommentsInput;
    type _GetRecentCommentsOutput = Core.GetRecentCommentsOutput;
    type _RecentCommentItem = Core.RecentCommentItem;
    type _SearchContentInput = Core.SearchContentInput;
    type _SearchContentOutput = Core.SearchContentOutput;
    type _GetProfileInput = Core.GetProfileInput;
    type _GetProfileOutput = Core.GetProfileOutput;
    type _GetMyProfileInput = Core.GetMyProfileInput;
    type _GetMyProfileOutput = Core.GetMyProfileOutput;
    type _ListSpacesInput = Core.ListSpacesInput;
    type _ListSpacesOutput = Core.ListSpacesOutput;
    type _ListCoursesInput = Core.ListCoursesInput;
    type _ListCoursesOutput = Core.ListCoursesOutput;
    type _GetUnreadNotificationsInput = Core.GetUnreadNotificationsInput;
    type _GetUnreadNotificationsOutput = Core.GetUnreadNotificationsOutput;

    const witness: _Result = Core.ok(1);
    expect(witness.ok).toBe(true);
  });
});
