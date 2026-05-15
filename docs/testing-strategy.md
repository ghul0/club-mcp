# Testing strategy

## Goals

- Prove read-only behavior.
- Prove local stdio and hosted HTTP variants produce equivalent structured results.
- Prove TypeScript contracts and Zod schemas catch invalid upstream payloads.
- Prove logs and errors never leak credentials or content payloads.

## Test layers

### Unit tests

Target package: `@hhc-mcp/core`.

Use Vitest for:

- date parsing,
- URL/base validation,
- input schemas,
- output schemas,
- sanitization/redaction,
- typed error mapping,
- pagination helpers,
- bounded concurrency helper.

### Network integration tests with MSW

Use MSW to mock Fluent Community REST endpoints at network level.

Mock scenarios:

- happy path envelopes,
- malformed JSON,
- missing fields,
- 401 upstream unauthorized,
- 403 upstream forbidden,
- 404 not found,
- 429 rate limited,
- 5xx transient failures,
- paginated feeds/members/comments,
- comments missing `xprofile` requiring profile backfill.

### Golden tests against `hhc.py`

The existing Python CLI is a behavior reference only.

Golden generation process:

1. Run `~/.claude/skills/hyperhuman-club/scripts/hhc.py` with a representative query.
2. Save redacted JSON fixture under `packages/core/test/fixtures/golden/`.
3. Run the TypeScript core operation against equivalent mocked upstream data or a controlled live account.
4. Compare normalized structured output.

Golden fixtures must not contain credentials or sensitive private fields.

Representative golden cases:

- since today 12:00,
- recent comments with edits,
- user comments with missing `xprofile`,
- member search,
- profile with spaces,
- feed with comments,
- courses list.

### MCP stdio tests

Target package: `@hhc-mcp/stdio`.

Verify:

- initialize,
- tools/list,
- each tool schema,
- tools/call success,
- tools/call typed error,
- stdout contains only MCP JSON-RPC,
- stderr/logs redact credentials.

### MCP HTTP tests

Target package: `@hhc-mcp/http`.

Verify:

- Protected Resource Metadata,
- WWW-Authenticate challenge,
- bearer token validation,
- audience/resource rejection,
- Streamable HTTP initialize,
- tools/list,
- tools/call,
- request body limits,
- origin validation.

### Dual-mode integration tests

For each core operation:

1. Prepare the same mocked upstream REST data.
2. Call local stdio tool.
3. Call hosted HTTP tool handler.
4. Compare `structuredContent` after removing transport metadata.

Required dual-mode cases:

- `club_search_members`,
- `club_get_profile`,
- `club_get_recent_posts`,
- `club_get_recent_comments`,
- `club_get_user_comments`,
- `club_get_feed`,
- `club_list_spaces`.

### Security invariant tests

Required tests:

- no registered tool maps to non-GET upstream method,
- no arbitrary URL/route/method/header tool exists,
- every tool has `readOnlyHint: true`,
- every upstream route is allowlisted,
- redaction removes app password, Basic Auth, cookies, nonces, JWTs, callback password query,
- hosted credential lookup is isolated by MCP subject.

## Fixture policy

- No live credentials in fixtures.
- No raw private profile e-mails in fixtures.
- No full real post/comment bodies unless explicitly synthetic or consented.
- Prefer synthetic fixtures matching real API shape.

## CI gates

CI runs:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Coverage target after implementation starts:

```text
lines >= 80
functions >= 80
branches >= 75
statements >= 80
```
