# Architecture

## Summary

`club-mcp` supports two read-only MCP deployment variants with one shared TypeScript core:

1. **Local stdio MCP** — recommended privacy-first default.
2. **Hosted/self-hosted Streamable HTTP MCP** — remote connector with OAuth for public hosted mode and optional Cloudflare edge protection.

```text
packages/core   -> @hhc-mcp/core   -> GET-only REST/domain logic
packages/stdio  -> @hhc-mcp/stdio  -> local stdio MCP transport
packages/http   -> @hhc-mcp/http   -> hosted/self-hosted Streamable HTTP transport
```

Authoritative decisions:

- `docs/stack-decision.md`
- `docs/adr/001-typescript-first.md`
- `docs/adr/002-hosted-auth-oauth-resource-server.md`
- `docs/adr/003-hosted-credential-connect-flow.md`
- `docs/adr/004-pnpm-monorepo-packages.md`
- `docs/adr/005-distribution-targets.md`
- `docs/adr/006-read-only-v1.md`
- `docs/adr/007-base-url-policy.md`
- `docs/adr/008-error-model.md`
- `docs/adr/009-target-clients.md`
- `docs/adr/010-hosted-oauth-provider.md`
- `docs/adr/011-credential-storage.md`
- `docs/adr/012-license.md`
- `docs/adr/013-hosted-deployment-platform.md`
- `docs/adr/014-key-management.md`
- `docs/adr/015-rate-limits.md`
- `docs/adr/016-mcp-error-envelope.md`

## Local stdio variant

```text
MCP client
  -> local @hhc-mcp/stdio process over stdio
  -> @hhc-mcp/core
  -> club.hyperhuman.pl REST API
```

Properties:

- best privacy posture,
- no hosted server in the data path,
- credentials stay on the user's machine,
- model never receives credentials,
- credentials are redacted from all errors and logs.

Auth sources:

1. OS keyring, after `hhc-mcp login`,
2. `HHC_USER` + `HHC_APP_PASS` env vars,
3. cookie + nonce fallback only if explicitly enabled for power users.

Distribution:

```bash
npx @hhc-mcp/stdio
```

Example MCP config:

```json
{
  "mcpServers": {
    "hyperhuman-club": {
      "command": "npx",
      "args": ["-y", "@hhc-mcp/stdio"],
      "env": {
        "HHC_BASE_URL": "https://club.hyperhuman.pl",
        "HHC_USER": "your_wp_login",
        "HHC_APP_PASS": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

## Hosted public variant

```text
MCP client
  -> OAuth 2.1 protected Streamable HTTP MCP endpoint
  -> @hhc-mcp/http
  -> encrypted per-user WordPress Application Password
  -> @hhc-mcp/core
  -> club.hyperhuman.pl REST API
```

Properties:

- suitable for Claude/ChatGPT-style public remote connectors,
- implements MCP OAuth/Protected Resource Metadata,
- stores encrypted upstream credentials because public clients generally cannot pass custom upstream secrets per request,
- does not store club content, posts, comments, search results, or profile bodies,
- Cloudflare Tunnel is recommended for origin protection,
- Cloudflare Access is optional edge protection for private deployments, not the public MCP auth model.

Required endpoints:

```text
POST/GET /mcp
GET /.well-known/oauth-protected-resource
GET /connect
GET /callback
POST /disconnect
GET /healthz
```

## Self-hosted remote variant

```text
Self-host operator
  -> deploys @hhc-mcp/http Docker image
  -> chooses auth mode
  -> users connect through operator's domain
```

Self-hosted operators can choose:

- OAuth public mode,
- Cloudflare Access private mode,
- reverse proxy with OIDC/JWT,
- stateless upstream credential headers for trusted/private clients.

See `docs/self-hosted-remote.md`.

## Shared core

`@hhc-mcp/core` owns all behavior that must be identical across transports:

- base URL validation,
- GET-only Fluent Community REST client,
- WordPress Application Password Basic Auth adapter,
- optional cookie+nonce adapter behind an explicit feature flag,
- Zod schemas for upstream REST responses,
- Zod schemas for tool inputs and outputs,
- date parsing,
- pagination,
- bounded concurrency,
- redaction/sanitization,
- typed `Result<T, E>` errors,
- read-only operations.

The existing Python CLI at `~/.claude/skills/hyperhuman-club/scripts/hhc.py` is a behavior reference and golden-test oracle only. Production TypeScript code must not import it or shell out to it.

## Upstream REST API

Default base URL:

```text
https://club.hyperhuman.pl
```

REST base:

```text
/wp-json/fluent-community/v2
```

The base URL is parameterized with a safe default. It is not supplied by model/tool input.

Verified read-only endpoints:

```text
GET /feeds
GET /feeds/{feed_id}/by-id
GET /feeds/{feed_id}/comments
GET /members
GET /profile/{username}
GET /profile/{username}/comments
GET /profile/{username}/spaces
GET /spaces
GET /spaces/all-spaces
GET /spaces/discover
GET /spaces/{spaceSlug}/members
GET /courses
GET /courses/all-courses
GET /leaderboard
GET /notifications/unread
GET /activities
GET /feeds/ticker
```

Every response is treated as `unknown` and validated with Zod before being used by domain operations.

## Hosted auth model

### MCP-layer auth

Hosted public mode follows MCP Authorization:

- the MCP server is an OAuth 2.1 protected resource server,
- it publishes Protected Resource Metadata,
- it returns `WWW-Authenticate` challenges when auth is missing/invalid,
- it validates bearer tokens on every request,
- it validates audience/resource binding,
- it uses least-privilege scopes.

Cloudflare Tunnel can hide the origin. Cloudflare Access can be used for private/self-hosted mode or additional edge gating, but cannot replace public MCP OAuth for Claude/ChatGPT-style remote connectors.

### Upstream club auth

Each user has their own upstream WordPress Application Password.

Hosted public mode uses an encrypted connect flow:

1. User authorizes MCP server.
2. User opens `/connect`.
3. Server redirects to WordPress Application Password authorization endpoint:

```text
https://club.hyperhuman.pl/wp-admin/authorize-application.php
```

with:

```text
app_name=HyperHuman Club MCP
app_id=<stable UUID for this MCP app>
success_url=https://mcp.example.com/callback
reject_url=https://mcp.example.com/connect/rejected
state=<csrf state tracked by our server>
```

4. Callback receives `site_url`, `user_login`, `password`.
5. Server validates state, encrypts app password, and stores the minimum credential record.
6. Tool calls use that per-user credential.

If Application Passwords are disabled for a WordPress account/site, hosted public mode cannot safely connect that account without adding another site-supported auth method. Local mode may optionally use cookie+nonce fallback.

## Package boundaries

```text
@hhc-mcp/core
  public entry: packages/core/src/index.ts
  no MCP transport imports
  no Hono/HTTP imports
  no OS keyring imports

@hhc-mcp/stdio
  public entry: packages/stdio/src/index.ts
  imports @hhc-mcp/core only through public entry

@hhc-mcp/http
  public entry: packages/http/src/index.ts
  imports @hhc-mcp/core only through public entry
```

No deep imports between packages.

## Hosted observability

Hosted mode should include:

- structured JSON logs with redaction,
- correlation IDs,
- OpenTelemetry traces for request/tool/upstream spans,
- Sentry or equivalent error reporting with payload scrubbing,
- metrics for status, latency, counts, rate limits, and upstream failures.

Local stdio mode should avoid telemetry by default.

## Hono + MCP HTTP setup direction

`@hhc-mcp/http` should use Hono only as a thin HTTP shell:

```text
Hono middleware
  -> request size/origin/auth checks
  -> MCP Streamable HTTP handler
  -> tool handlers call @hhc-mcp/core
```

Business logic must stay in `@hhc-mcp/core`, not in Hono route handlers.

## Deployment shape

Hosted/self-hosted HTTP:

```text
GHCR Docker image
  listens on 127.0.0.1:PORT or container PORT
reverse proxy / Cloudflare Tunnel
  maps https://mcp.example.com -> container
```

Origin hardening:

- non-root user,
- read-only filesystem where possible,
- no public inbound origin if using Tunnel,
- secrets from environment/secret manager,
- structured logs with redaction,
- WAF rules tested to avoid MCP false positives.

## Remaining product choices

Chosen:

- local target: Claude Desktop first, then Claude Code/Pi, with MCP Inspector for debugging,
- hosted target: MCP Inspector, Claude Custom Connector, ChatGPT remote connector,
- hosted OAuth provider: Keycloak first,
- credential storage: PostgreSQL plus application-level envelope encryption,
- license: MIT.

No architecture-level blockers remain for Phase 1-3. Hosted implementation should follow ADR-013 through ADR-016.
