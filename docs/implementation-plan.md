# Implementation plan

## Phase 0 — decisions already made

Accepted architecture decisions:

- ADR-001: TypeScript-first implementation.
- ADR-002: hosted public MCP uses OAuth 2.1 protected resource server model.
- ADR-003: hosted public MVP uses encrypted WordPress Application Password connect flow.
- ADR-004: pnpm workspace with three packages.
- ADR-005: npm/npx for local stdio, GHCR Docker for HTTP.
- ADR-006: read-only v1.
- ADR-007: parameterized base URL with safe default.
- ADR-008: typed Result-style expected errors.
- ADR-009: target clients and test order.
- ADR-010: Keycloak as first hosted OAuth provider.
- ADR-011: PostgreSQL plus envelope encryption for hosted credentials.
- ADR-012: MIT license.
- ADR-013: VPS + Docker Compose + Cloudflare Tunnel as first hosted deployment.
- ADR-014: Docker secrets or 1Password/Doppler for MVP key management.
- ADR-015: initial hosted rate limits.
- ADR-016: MCP tool error envelope.

No Python production implementation is planned. The Python `hhc.py` is a behavior reference and golden-test oracle only.

## Phase 1 — TypeScript workspace scaffold

Deliverables:

- `pnpm-workspace.yaml`.
- root `package.json`.
- root `tsconfig.base.json` with strict flags.
- root Vitest config.
- root ESLint/formatter config matching the TypeScript standard.
- packages:
  - `packages/core`,
  - `packages/stdio`,
  - `packages/http`.
- `AGENTS.md` and `llms.txt`.
- `.env.example`.
- CI outline: typecheck, lint, test, secret scan, build.

Estimate: 0.5-1 day.

## Phase 2 — `@hhc-mcp/core`

Deliverables:

- GET-only REST client.
- Base URL validation with default `https://club.hyperhuman.pl`.
- WordPress Application Password Basic Auth adapter.
- Cookie+nonce adapter behind explicit feature flag if retained.
- Zod schemas for upstream REST envelopes.
- Tool input/output Zod schemas shared by transports.
- Date parser.
- Pagination helpers.
- Bounded concurrency helper.
- Sanitization/redaction helpers.
- Typed `Result<T, E>` error model.
- Read-only operations:
  - `club_search_members`,
  - `club_get_profile`,
  - `club_list_spaces`,
  - `club_get_feed`,
  - `club_get_feed_comments`,
  - `club_get_user_comments`,
  - `club_get_recent_posts`,
  - `club_get_recent_comments`,
  - `club_get_since_summary`,
  - `club_list_courses`,
  - `club_get_unread_notifications`,
  - `club_get_my_profile`.

Testing:

- Vitest unit tests.
- MSW for upstream REST mocking.
- Golden-test fixtures generated from `~/.claude/skills/hyperhuman-club/scripts/hhc.py` for representative queries.
- Read-only invariant tests proving no non-GET upstream call exists.
- Zod validation tests for malformed upstream data.

Estimate: 2-3 days.

## Phase 3 — `@hhc-mcp/stdio` local MCP

Deliverables:

- stdio MCP server using official TypeScript MCP SDK.
- Tool registration for read-only tools.
- `readOnlyHint: true` annotations.
- Env auth:
  - `HHC_BASE_URL`,
  - `HHC_USER`,
  - `HHC_APP_PASS`.
- Local errors redacted so the model never sees credentials.
- Claude Desktop and Claude Code config examples using `npx`.

Testing:

- MCP initialize/tools/list/tools/call smoke tests.
- Snapshot of tool list.
- Dual comparison against core operation outputs.

Estimate: 1-1.5 days after core.

## Phase 4 — local OS keyring UX

Deliverables:

- `hhc-mcp login` interactive CLI.
- `hhc-mcp logout`.
- `hhc-mcp auth status`.
- Hidden input for Application Password.
- Immediate credential validation against `/wp-json/` or a safe read-only endpoint.
- OS keyring storage.
- Env vars remain supported for automation.

UX requirements:

- prompt for `HHC_BASE_URL` with default,
- prompt for `HHC_USER`,
- hidden prompt for `HHC_APP_PASS`,
- validate credentials before storing,
- print no secret values,
- show revoke instructions.

Estimate: 1-2 days.

## Phase 5 — `@hhc-mcp/http` hosted HTTP skeleton

Deliverables:

- Hono or thin Node HTTP app.
- Streamable HTTP `/mcp` endpoint.
- `GET /.well-known/oauth-protected-resource`.
- `GET /healthz`.
- request body limits.
- origin validation.
- structured redacted logging.
- OpenTelemetry hooks.
- Sentry or equivalent error reporting hooks with scrubbing.
- Dockerfile.
- GHCR image build.

Testing:

- MCP HTTP initialize/tools/list/tools/call smoke tests.
- origin validation tests.
- request size tests.

Estimate: 1.5-2 days after local/core.

## Phase 6 — hosted OAuth resource server

Deliverables:

- Keycloak deployment/config guide for development and first hosted deployment.
- Protected Resource Metadata.
- `WWW-Authenticate` challenges with `resource_metadata`.
- bearer token validation for Keycloak-issued tokens.
- audience/resource validation.
- least-privilege scopes.
- target-client compatibility tests for MCP Inspector, Claude Custom Connector, and ChatGPT remote connector.

Estimate: 3-5 days including Keycloak setup and client compatibility testing.

## Phase 7 — hosted encrypted WordPress connect flow

Deliverables:

- `/connect` route.
- WordPress Application Password authorize URL generation with:
  - `app_name`,
  - `app_id`,
  - `success_url`,
  - `reject_url`,
  - CSRF `state`.
- `/callback` route with state validation.
- encrypted app password storage.
- `/disconnect` route.
- revoke/disconnect docs.
- no callback query logging.

Storage decision:

- PostgreSQL plus application-level envelope encryption.
- Key material outside the database through Docker secret, secret manager, Vault, 1Password, or equivalent.

Estimate: 2-4 days depending on the selected secret manager.

## Phase 8 — hosted read-only tools

Deliverables:

- same read-only tool set exposed over Streamable HTTP.
- same input/output schemas as stdio.
- same core operations.
- hosted-specific rate limits.
- hosted-specific pagination caps.
- hosted-specific concurrency caps.

Testing:

- dual-mode integration tests: same fixture credentials/query produce equivalent structured output via stdio and HTTP.
- cross-user isolation tests.
- encrypted credential lookup tests.
- log redaction tests.

Estimate: 1-2 days.

## Phase 9 — self-hosted remote docs and examples

Deliverables:

- `docs/self-hosted-remote.md`.
- Docker Compose example for VPS deployment.
- Cloudflare Tunnel example.
- nginx + OIDC/JWT example.
- Traefik + OIDC example.
- stateless header mode documentation for private/trusted deployments.
- WAF/cost notes.

Estimate: 1 day.

## Phase 10 — hardening and release

Deliverables:

- rate limits,
- upstream timeout/backoff/circuit breaker,
- dependency scanning,
- secret scanning,
- security headers for browser routes,
- final security checklist pass,
- npm package publish workflow,
- Docker/GHCR publish workflow,
- changelog and release notes.

Estimate: 1-2 days.

## Total estimates

### Local stdio MVP

```text
Phase 1 scaffold:          0.5-1 day
Phase 2 TypeScript core:   2-3 days
Phase 3 stdio MCP:         1-1.5 days
Total:                     3.5-5.5 days
```

### Local production-ready

```text
Local MVP:                 3.5-5.5 days
Phase 4 keyring UX:        1-2 days
Hardening subset:          0.5-1 day
Total:                     5-8.5 days
```

### Hosted public MVP

```text
Local/core foundation:     3.5-5.5 days
Phase 5 HTTP skeleton:     1.5-2 days
Phase 6 Keycloak OAuth:    3-5 days
Phase 7 connect flow:      2-4 days
Phase 8 hosted tools:      1-2 days
Total:                     11-18.5 days
```

### Self-hosted remote package

```text
After HTTP foundation:     +1-2 days for docs/examples/config polish
```

## Repository scaffold

```text
club-mcp/
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
  vitest.config.ts
  eslint.config.js
  AGENTS.md
  llms.txt
  SECURITY.md
  CONTRIBUTING.md
  CHANGELOG.md
  LICENSE
  .env.example
  Dockerfile
  docs/
    adr/
    architecture.md
    best-practices.md
    implementation-plan.md
    read-only-tools.md
    references.md
    security-checklist.md
    self-hosted-remote.md
    stack-decision.md
    variants.md
  packages/
    core/
      package.json
      src/
        index.ts
        auth/
        hhc/
        operations/
        schemas/
        shared/
      test/
    stdio/
      package.json
      src/
        index.ts
        cli.ts
        server.ts
        local-auth.ts
      test/
    http/
      package.json
      src/
        index.ts
        app.ts
        mcp.ts
        oauth/
        connect/
        storage/
      test/
```

## Definition of done for local stdio MVP

- [ ] `npx @hhc-mcp/stdio` works.
- [ ] User can provide own upstream WP Application Password via env.
- [ ] Read-only tools work.
- [ ] No hosted server processes club data.
- [ ] Model never sees credentials.
- [ ] Logs contain no secrets or content.
- [ ] Read-only invariant tests pass.
- [ ] Golden comparison against `hhc.py` exists for representative cases.

## Definition of done for hosted public MVP

- [ ] Remote MCP client connects through OAuth-compliant hosted endpoint.
- [ ] Protected Resource Metadata is served.
- [ ] Bearer token audience/resource validation works.
- [ ] User can connect WordPress Application Password through encrypted connect flow.
- [ ] Same read-only tools work through HTTP transport.
- [ ] No club content is persisted.
- [ ] Credentials are encrypted at rest.
- [ ] Logs contain no secrets or content.
- [ ] MCP tool errors follow ADR-016.
- [ ] Dual-mode integration tests pass.
- [ ] Security checklist passes.
