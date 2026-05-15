# @hhc-mcp/http

Hosted Streamable HTTP MCP server for the Hyper Human Club read-only core.

## Status

Scaffold only in v0.0.x. The hosted variant is planned for v0.2.0+ and tracked
in `ROADMAP.md`. The package currently exports nothing beyond its package
identifier; do not depend on it from production code yet.

## Purpose

`@hhc-mcp/http` will host the same 12 read-only tools as `@hhc-mcp/stdio`
behind an OAuth 2.1 protected `/mcp` endpoint, so MCP clients can connect
without a local install. It composes Hono with `@modelcontextprotocol/sdk`
and consumes `@hhc-mcp/core` for all REST behavior.

## Planned endpoints

- `POST /mcp` — Streamable HTTP MCP transport, protected by OAuth 2.1.
- `GET /healthz` — liveness probe.
- `GET /.well-known/oauth-protected-resource` — RFC 9728 protected-resource
  metadata pointing at the configured authorization server.

## Design references

- `docs/adr/002-hosted-auth-oauth-resource-server.md` — OAuth resource-server
  posture.
- `docs/adr/003-hosted-credential-connect-flow.md` — connect-flow that turns a
  WordPress Application Password into an encrypted per-user credential.
- `docs/adr/010-hosted-oauth-provider.md`,
  `docs/adr/011-credential-storage.md`,
  `docs/adr/013-hosted-deployment-platform.md`,
  `docs/adr/014-key-management.md` — platform, storage, and key-management.
- `docs/hosted-auth.md` — narrative description of the hosted auth flow.
- `ROADMAP.md` — phase-by-phase build plan.

## Boundaries (ADR-004)

- No deep imports into `@hhc-mcp/stdio` or into another package's internals.
- All REST behavior comes from `@hhc-mcp/core` to keep stdio and HTTP variants
  behaviorally identical.
- Read-only only; no POST/PATCH/PUT/DELETE tools (ADR-006).

## Installation

Not yet published. Once available:

```bash
pnpm add @hhc-mcp/http
```

## License

MIT.
