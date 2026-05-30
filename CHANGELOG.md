# Changelog

All notable changes to `@hhc-mcp/core` and `@hhc-mcp/stdio` are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-05-30

### Added
- **Cookie + nonce auth fallback for `@hhc-mcp/stdio`** (ADR-020). The local server now authenticates with either a WordPress Application Password (HTTP Basic, existing) or a WordPress session cookie + `X-WP-Nonce`, selected by `HHC_AUTH_MODE` (`auto` | `basic` | `cookie`). `auto` prefers Basic when its credentials are present and falls back to cookie auth otherwise, so the server works when Application Passwords is disabled at the club and switches to Basic automatically once it is enabled.
- **`AuthProvider` contract in `@hhc-mcp/core`**: an `auth` option on the HTTP client (`headers()` plus an optional `onUnauthorized()`), with a one-shot `401/403` refresh-retry that does not consume the transient retry budget. The legacy `authHeader` callback still works.
- **Auth-file store (`HHC_AUTH_FILE`)** in stdio: reads `cookie`/`nonce`/`user`/`app_pass` (env vars take precedence; `HHC_WP_NONCE` with `HHC_NONCE` alias), refreshes the nonce from site-root HTML on `401/403`, and persists it back atomically (unique temp + rename, cleanup on failure, symlinks resolved, unknown fields preserved). Point it at the `hhc` CLI's `~/.config/hyperhuman-club/auth.json` to share one credential source.

### Fixed
- **`lint-staged` config** now lives in `lint-staged.config.mjs` with function entries, so local commits run. The previous `package.json` entry appended staged paths and `|| true` to eslint as patterns, failing every local commit touching `packages/**/*.ts`.

### Notes
- The GET-only read-only invariant (ADR-006) is unchanged; cookie+nonce cannot perform writes through the client.

## [0.0.3] - 2026-05-16

### Fixed
- **release.yml SBOM step** now uses `@cyclonedx/cdxgen --type pnpm` instead of `@cyclonedx/cyclonedx-npm`. The previous tool called `npm ls`, which does not understand pnpm workspace symlinks and exited 254 with hundreds of "missing devDeps" entries (`hasown`, `math-intrinsics`, `dunder-proto`, …). Packages still published in v0.0.2 because the SBOM step ran after `npm publish`, but the resulting workflow run was marked `failure`. cdxgen has native pnpm support.

### Chores
- `.playwright-mcp/` added to `.gitignore` to prevent local browser-automation scratch (screenshots, evaluation result spillovers, transient token files) from being accidentally committed.

## [0.0.2] - 2026-05-16

First release on the npm registry. v0.0.1 was tagged but never published (CI lacked `NPM_TOKEN`).

### Added
- **13 read-only MCP tools** wired end-to-end through `@hhc-mcp/stdio`:
  `club_search_members`, `club_get_profile`, `club_get_my_profile`, `club_list_spaces`, `club_list_courses`, `club_get_feed`, `club_get_feed_comments`, `club_get_user_comments`, `club_get_recent_posts`, `club_get_recent_comments`, `club_get_since_summary`, `club_get_unread_notifications`, `club_search_content`.
- **Explicit Zod output schemas** for every tool. `stdio` validates handler outputs against the schema via `validateOutput` and returns `parsed.data` so `.strip()` acts as a real final sanitizer.
- **Public output shapes** separated from raw upstream parse schemas. `toPublicFeed`, `toPublicComment`, `toPublicProfile`, `toPublicMember`, `toPublicSpace` map upstream entities to docs-named fields (`message_text`/`message_html`, `short_description_text`/`_html`, `cover_photo`, nested `post.{id,title,permalink}`, `space.{slug,title}`, `pagination.{current_page,has_more}`).
- **`edit_reason` on edited comments** in `get_since_summary` output (`updated_after_since`).
- **`scan_metadata` plumbing** from `getRecentComments` into `get_since_summary`: real `scanned_feeds` and `scanned_comments` counts (was: hardcoded `scanned_feeds: 0`).
- **`spaces.permissions`** field in `list_spaces` output per docs line 417.
- **`unread_count`** field in `get_unread_notifications` output.
- **Conditional `email` preservation** in `get_my_profile`: schema accepts `email` always; stdio transport `redactMyProfileOutput` returns it only when the caller passes `include_private_fields=true`.
- **Profile-level `xprofile` fallback author** for `get_user_comments`. Upstream `/profile/{username}/comments` lists author once at the envelope level for trimmed comment rows; the operation now backfills.

### Fixed
- **6 tools previously ignored input params**:
  - `get_user_comments.since` was dropped silently.
  - `get_recent_posts.space` was dropped; query also missed `feed_base_url=feeds` and `order_by_type=new_activity`.
  - `search_content.since` was dropped.
  - `list_spaces.{include_members,member_limit}` were dropped.
  - `list_courses.include_sections` was dropped.
  - `get_my_profile.include_private_fields` had no effect.
- **`search_content` correctness**:
  - Paginates `/feeds` up to `scan_feed_limit` with `per_page=100` (was: single page, capped at 100 feeds regardless of `scan_feed_limit`).
  - Post search now includes `search=<query>&search_in[]=post_content` per docs line 519.
  - `limit` is now a global cap across combined results (members → posts → comments), not per-category.
  - `since` filters members by `last_activity`.
  - Comment hits carry the source `Feed` so `post.{id,title,permalink}` and `space.{slug,title}` are preserved even when `include_posts=false` or the host post does not match the query.
  - Hard cap of 2000 scanned comments enforced.
- **`get_user_comments` correctness**:
  - Filters by `since` page-by-page (was: filter applied after limit truncation, missing matches beyond the first page).
  - Sets `pagination.has_more=true` when the client-side limit truncates a page with remaining matching items.
  - Surfaces `post.{id,title,permalink}` from raw upstream `comment.post` even when no `Feed` context is available.
- **`get_recent_posts` correctness**: Removed unsafe early-stop that truncated pagination when the oldest `created_at` on a page was older than `since`. Under `order_by_type=new_activity`, `created_at` is non-monotonic; the early-stop dropped valid matches.
- **`query` validation** for `search_members` and `search_content`: rejects control characters and untrimmed whitespace per docs common rule.
- **CI `pnpm audit`**: removed broken `-r` flag (pnpm 10 dropped `-r` for `audit`), gate now runs.

### Changed
- **Output field names** match `docs/read-only-tools.md` exactly. Renames vs v0.0.1 internal state: `message`→`message_text`, `message_rendered`→`message_html`, `short_description`→`short_description_text`/`_html` (profile), envelope-level shape for `get_since_summary` is now `{new_posts[], new_comments[], edited_comments[], counts, scan_metadata}` and for `search_content` is `{results[].{kind,score?,matched_field,member?,post?,comment?}, counts, scan_metadata}`.

### Supply chain
- Both packages signed with Sigstore provenance via npm OIDC.
- `workspace:*` correctly rewritten by pnpm publish: `@hhc-mcp/stdio@0.0.2` resolves to concrete `@hhc-mcp/core@0.0.2`.

### Known issues
- SBOM step in release.yml failed (does not block publish — fixed in 0.0.3).

## [0.0.1] - 2026-05-15

Tag-only release. Pre-publish code review found 19 contract drift issues; v0.0.1 was never pushed to npm. See v0.0.2 notes for the full fix list.

## Pre-release (governance bootstrap)

- Added architecture, security, and implementation docs for local stdio, hosted public, and self-hosted remote MCP variants.
- Accepted TypeScript-first implementation decision.
- Accepted read-only v1 decision.
- Added ADRs for hosted auth, credential connect flow, monorepo package layout, distribution targets, base URL policy, and error model.
