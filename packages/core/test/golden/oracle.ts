import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, vi } from 'vitest';
import type { GetClient } from '../../src/http/client.js';
import { ok } from '../../src/result.js';
import { isOk } from '../../src/result.js';
import { searchMembers } from '../../src/operations/search-members.js';
import { searchContent } from '../../src/operations/search-content.js';
import { getProfile } from '../../src/operations/get-profile.js';
import { getMyProfile } from '../../src/operations/get-my-profile.js';
import { listSpaces } from '../../src/operations/list-spaces.js';
import { listCourses } from '../../src/operations/list-courses.js';
import { getFeed } from '../../src/operations/get-feed.js';
import { getFeedComments } from '../../src/operations/get-feed-comments.js';
import { getUserComments } from '../../src/operations/get-user-comments.js';
import { getRecentPosts } from '../../src/operations/get-recent-posts.js';
import { getRecentComments } from '../../src/operations/get-recent-comments.js';
import { getUnreadNotifications } from '../../src/operations/get-unread-notifications.js';
import { getSinceSummary } from '../../src/operations/get-since-summary.js';

export type OperationFn = (
  client: GetClient,
  input: unknown,
) => Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>;

export const OPERATIONS: Readonly<Record<string, OperationFn>> = Object.freeze({
  search_members: searchMembers as unknown as OperationFn,
  search_content: searchContent as unknown as OperationFn,
  get_profile: getProfile as unknown as OperationFn,
  get_my_profile: getMyProfile as unknown as OperationFn,
  list_spaces: listSpaces as unknown as OperationFn,
  list_courses: listCourses as unknown as OperationFn,
  get_feed: getFeed as unknown as OperationFn,
  get_feed_comments: getFeedComments as unknown as OperationFn,
  get_user_comments: getUserComments as unknown as OperationFn,
  get_recent_posts: getRecentPosts as unknown as OperationFn,
  get_recent_comments: getRecentComments as unknown as OperationFn,
  get_unread_notifications: getUnreadNotifications as unknown as OperationFn,
  get_since_summary: getSinceSummary as unknown as OperationFn,
});

export interface FixtureUpstream {
  readonly path?: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly response: unknown;
}

export interface Fixture {
  readonly operation: string;
  readonly input: unknown;
  readonly upstream: FixtureUpstream;
  readonly expected: unknown;
}

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const FIXTURES_DIR: string = join(HERE, 'fixtures');

export const listFixtureFiles = (dir: string = FIXTURES_DIR): readonly string[] => {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
};

export const loadFixture = (name: string, dir: string = FIXTURES_DIR): Fixture => {
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const filePath = join(dir, filename);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return assertIsFixture(parsed, filename);
};

const assertIsFixture = (value: unknown, source: string): Fixture => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`fixture ${source}: expected object`);
  }
  const v = value as Record<string, unknown>;
  if (typeof v.operation !== 'string') {
    throw new Error(`fixture ${source}: missing string 'operation'`);
  }
  if (!('input' in v)) {
    throw new Error(`fixture ${source}: missing 'input'`);
  }
  if (typeof v.upstream !== 'object' || v.upstream === null) {
    throw new Error(`fixture ${source}: missing object 'upstream'`);
  }
  if (!('expected' in v)) {
    throw new Error(`fixture ${source}: missing 'expected'`);
  }
  const up = v.upstream as Record<string, unknown>;
  if (!('response' in up)) {
    throw new Error(`fixture ${source}: missing 'upstream.response'`);
  }
  return {
    operation: v.operation,
    input: v.input,
    upstream: {
      path: typeof up.path === 'string' ? up.path : undefined,
      query: typeof up.query === 'object' && up.query !== null
        ? (up.query as Record<string, string | number | boolean | undefined>)
        : undefined,
      response: up.response,
    },
    expected: v.expected,
  };
};

export const makeMockClient = (
  fixture: Fixture,
): { client: GetClient; getMock: ReturnType<typeof vi.fn> } => {
  const getMock = vi.fn(() => Promise.resolve(ok(fixture.upstream.response)));
  const client: GetClient = { get: getMock as unknown as GetClient['get'] };
  return { client, getMock };
};

export const resolveOperation = (name: string): OperationFn => {
  const fn = OPERATIONS[name];
  if (!fn) {
    const available = Object.keys(OPERATIONS).sort().join(', ');
    throw new Error(`unknown operation '${name}'. Known: ${available}`);
  }
  return fn;
};

export const assertMatchesShape = (actual: unknown, expected: unknown, path: string = '<root>'): void => {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path}: expected array`).toBe(true);
    const actualArr = actual as readonly unknown[];
    expect(actualArr.length, `${path}: array length mismatch`).toBe(expected.length);
    expected.forEach((item, idx) => {
      assertMatchesShape(actualArr[idx], item, `${path}[${String(idx)}]`);
    });
    return;
  }

  if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${path}: expected object`).toBe(true);
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;
    for (const key of Object.keys(expObj)) {
      expect(key in actObj, `${path}.${key}: missing in actual`).toBe(true);
      assertMatchesShape(actObj[key], expObj[key], `${path}.${key}`);
    }
    return;
  }

  expect(actual, `${path}: value mismatch`).toStrictEqual(expected);
};

export const assertOpMatchesFixture = async (fixture: Fixture): Promise<void> => {
  const op = resolveOperation(fixture.operation);
  const { client, getMock } = makeMockClient(fixture);

  const result = await op(client, fixture.input);

  if (!isOk(result)) {
    throw new Error(
      `fixture '${fixture.operation}': operation returned error: ${JSON.stringify(result.error)}`,
    );
  }

  assertMatchesShape(result.value, fixture.expected);

  if (fixture.upstream.path !== undefined) {
    expect(getMock).toHaveBeenCalledTimes(1);
    const args = getMock.mock.calls[0];
    expect(args?.[0]).toBe(fixture.upstream.path);
  }

  if (fixture.upstream.query !== undefined) {
    const args = getMock.mock.calls[0];
    expect(args?.[2]).toEqual(fixture.upstream.query);
  }
};
