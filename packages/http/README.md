# @hhc-mcp/http

Hosted Streamable HTTP MCP server for the Hyper Human Club read-only core.

## Status

Scaffold only in v0.0.x. The hosted variant is planned for v0.2.0+ and tracked
in `ROADMAP.md`. The package currently exports nothing beyond its package
identifier; do not depend on it from production code yet.

## Purpose

`@hhc-mcp/http` will host the same 13 read-only tools as `@hhc-mcp/stdio`
behind a `/mcp` endpoint authenticated with HTTP Basic Auth pass-through,
so MCP clients can connect without a local install. It composes Hono with
`@modelcontextprotocol/sdk` and consumes `@hhc-mcp/core` for all REST behavior.

## Planned endpoints

- `POST /mcp` — Streamable HTTP MCP transport. Requires
  `Authorization: Basic base64(wp_user:wp_app_pass)` on every request.
  The header is decoded in memory only and forwarded 1:1 to the upstream
  WordPress REST API.
- `GET /healthz` — liveness probe.

There is no `/.well-known/oauth-protected-resource`, no `/connect`, no
`/callback`, no `/disconnect`, and no credential storage.

## Design references

- `docs/adr/019-hosted-auth-basic-pass-through.md` — authoritative hosted
  auth design.
- `docs/adr/013-hosted-deployment-platform.md` — VPS + Docker Compose +
  Cloudflare Tunnel.
- `docs/adr/007-base-url-policy.md` — single-base-URL policy.
- `docs/adr/008-error-model.md`, `docs/adr/016-mcp-error-envelope.md` —
  error semantics on the wire.
- `docs/hosted-auth.md` — operational narrative.
- `ROADMAP.md` — phase-by-phase build plan.
- Superseded: ADRs 002, 003, 010, 011, 014 (previous OAuth + Keycloak +
  encrypted-PostgreSQL design; kept in the repository for historical
  context per ADR-017).

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

MIT — see [LICENSE](./LICENSE).
