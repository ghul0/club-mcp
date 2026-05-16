# Architecture

> **Hosted auth pivot (2026-05-16).** [ADR-019](adr/019-hosted-auth-basic-pass-through.md) replaced the original hosted OAuth/Keycloak/encrypted-PostgreSQL design with HTTP Basic Auth pass-through and no credential storage. Sections of this document that pre-date ADR-019 are kept for historical context but the "Hosted auth model" and "Remaining product choices" sections below reflect the current decision. Older sections retain references to OAuth/Keycloak/Connect-flow only as a record of what was superseded.

## Summary

`club-mcp` supports two read-only MCP deployment variants with one shared TypeScript core:

1. **Local stdio MCP** — recommended privacy-first default.
2. **Hosted/self-hosted Streamable HTTP MCP** — remote connector authenticated via Basic Auth pass-through (ADR-019), with Cloudflare Tunnel publishing the origin.

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

Current design: HTTP Basic Auth pass-through. Authoritative source: [ADR-019](adr/019-hosted-auth-basic-pass-through.md). Operational details: `docs/hosted-auth.md`.

The hosted server is a transparent proxy. Each `/mcp` request carries `Authorization: Basic base64(wp_username:wp_app_password)`. `@hhc-mcp/http` decodes the header in memory only and forwards it 1:1 as upstream Basic Auth against `club.hyperhuman.pl`. No credential storage, no OAuth authorization server, no `/connect` redirect flow, no `/.well-known/oauth-protected-resource` document.

Cloudflare Tunnel publishes the origin at `hyperhuman-mcp.kingscode.pl`; TLS terminates at Cloudflare. Cloudflare Access remains acceptable for private/self-hosted edge gating.

If Application Passwords are disabled for a WordPress account or site, the hosted server returns an actionable error (see `docs/hosted-auth.md`). Local stdio mode may use cookie + nonce fallback in restricted scenarios; hosted mode does not.

### Historical: OAuth + connect flow (superseded by ADR-019)

The original design (ADRs 002/003/010/011/014) specified an OAuth 2.1 protected resource server backed by Keycloak with an encrypted WordPress Application Password connect flow stored in PostgreSQL using envelope encryption. That stack carried a multi-tenant SaaS shape that the actual deployment target does not warrant. See ADR-019 §Context for the rationale.

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
- hosted target: MCP Inspector, Claude Desktop Custom Connector, Claude Code, Cursor (ChatGPT explicitly out of scope per ADR-019),
- hosted auth: HTTP Basic Auth pass-through (ADR-019),
- hosted credential storage: none,
- hosted deployment platform: VPS + Docker Compose (one service) + Cloudflare Tunnel (ADR-013, modified by ADR-019),
- license: MIT.

No architecture-level blockers remain for Phase 1-3. Hosted implementation follows ADR-013, ADR-016, and ADR-019.
