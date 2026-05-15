import { describe, expect, it, vi } from 'vitest';
import { ok, isOk } from '../../src/result.js';
import type { GetClient } from '../../src/http/client.js';
import { searchMembers } from '../../src/operations/search-members.js';
import {
  type Fixture,
  assertMatchesShape,
  assertOpMatchesFixture,
  listFixtureFiles,
  loadFixture,
  resolveOperation,
  OPERATIONS,
  FIXTURES_DIR,
} from './oracle.js';

const fixtureFiles = listFixtureFiles();

describe('golden harness (hhc.py oracle)', () => {
  describe('smoke', () => {
    it('OPERATIONS table exposes the 12 read-only ops', () => {
      const names = Object.keys(OPERATIONS).sort();
      expect(names).toEqual(
        [
          'get_feed',
          'get_feed_comments',
          'get_my_profile',
          'get_profile',
          'get_recent_comments',
          'get_recent_posts',
          'get_unread_notifications',
          'get_user_comments',
          'list_courses',
          'list_spaces',
          'search_content',
          'search_members',
        ].sort(),
      );
    });

    it('resolveOperation returns the matching TS function', () => {
      expect(resolveOperation('search_members')).toBe(searchMembers);
    });

    it('resolveOperation throws on unknown operation', () => {
      expect(() => resolveOperation('not_a_real_op')).toThrow(/unknown operation/);
    });

    it('runs an inline fixture against searchMembers (mechanism check)', async () => {
      const fixture: Fixture = {
        operation: 'search_members',
        input: { query: 'alice', limit: 10 },
        upstream: {
          path: '/members',
          query: { search: 'alice', per_page: 10 },
          response: {
            members: [
              { user_id: 1, display_name: 'Alice', username: 'alice' },
              { user_id: 2, display_name: 'Albert', username: 'albert' },
            ],
          },
        },
        expected: {
          members: [
            { user_id: 1, display_name: 'Alice', username: 'alice' },
            { user_id: 2, display_name: 'Albert', username: 'albert' },
          ],
        },
      };

      await assertOpMatchesFixture(fixture);
    });

    it('detects a shape mismatch (oracle actually fires)', async () => {
      const fixture: Fixture = {
        operation: 'search_members',
        input: { query: 'alice', limit: 10 },
        upstream: {
          response: {
            members: [{ user_id: 1, display_name: 'Alice', username: 'alice' }],
          },
        },
        expected: {
          members: [{ user_id: 999, display_name: 'Nope', username: 'nope' }],
        },
      };

      await expect(assertOpMatchesFixture(fixture)).rejects.toThrow();
    });

    it('tolerates extra passthrough fields in actual output', () => {
      assertMatchesShape(
        { members: [{ user_id: 1, username: 'alice', extra: 'ok' }] },
        { members: [{ user_id: 1, username: 'alice' }] },
      );
    });

    it('flags missing fields in actual output', () => {
      expect(() =>
        assertMatchesShape(
          { members: [{ user_id: 1 }] },
          { members: [{ user_id: 1, username: 'alice' }] },
        ),
      ).toThrow();
    });

    it('passes through the mocked client unchanged (read-only check)', async () => {
      const getMock = vi.fn(() =>
        Promise.resolve(
          ok({ members: [{ user_id: 1, display_name: 'X', username: 'x' }] }),
        ),
      );
      const client: GetClient = { get: getMock as unknown as GetClient['get'] };
      const result = await searchMembers(client, { query: 'x' });
      expect(isOk(result)).toBe(true);
      expect(getMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('recorded fixtures', () => {
    if (fixtureFiles.length === 0) {
      it.skip('no fixtures recorded yet — see fixtures/README.md', () => {
        // eslint-disable-next-line no-console
        console.log(`[golden] no fixtures recorded under ${FIXTURES_DIR}`);
      });
      return;
    }

    for (const file of fixtureFiles) {
      it(`fixture ${file}`, async () => {
        const fixture = loadFixture(file);
        await assertOpMatchesFixture(fixture);
      });
    }
  });
});
