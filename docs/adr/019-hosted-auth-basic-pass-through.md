# ADR-019: Hosted MCP authorization — Basic Auth pass-through

Status: accepted

Supersedes: [ADR-002](002-hosted-auth-oauth-resource-server.md), [ADR-003](003-hosted-credential-connect-flow.md), [ADR-010](010-hosted-oauth-provider.md), [ADR-011](011-credential-storage.md), [ADR-014](014-key-management.md)

Modifies: [ADR-013](013-hosted-deployment-platform.md), [ADR-015](015-rate-limits.md)

## Context

ADR-002, ADR-003, ADR-010, ADR-011, and ADR-014 together specified the hosted public MCP server as an OAuth 2.1 protected resource backed by Keycloak, with per-user WordPress Application Passwords captured via an encrypted `connect` redirect flow and persisted in PostgreSQL using envelope encryption with a key-encryption key held outside the database. That stack matched a multi-tenant SaaS shape with non-technical users connecting arbitrary personal WordPress sites.

The actual deployment target is narrower:

- a single Fluent Community site (`club.hyperhuman.pl`),
- a small group of technical users,
- a first hosted address at `hyperhuman-mcp.kingscode.pl`,
- the read-only operation set already shipped in `@hhc-mcp/stdio@0.0.3` (13 tools).

Every component of the original stack carries a non-trivial operational and security cost: a Keycloak deployment with admin lifecycle, a PostgreSQL service with backup and migration policy, an envelope encryption path with DEK and KEK handling, a key rotation runbook, and processor liability for at-rest WordPress credentials. Once a credential store exists, the hosted server becomes a honey pot: the union of every connected user's WordPress access in one box.

The simpler model — let the client present `Authorization: Basic base64(HHC_USER:HHC_APP_PASS)` on every `/mcp` request and have `@hhc-mcp/http` decode it in memory and reuse it as upstream Basic Auth — has the same security model as the stdio variant: the user holds the secret, the server is a transparent proxy.

ADR-003 rejected this option on the grounds that "public remote MCP clients such as Claude and ChatGPT do not provide arbitrary per-user upstream credential headers." Revised state of the world (2026-05-16):

- Claude Desktop Custom Connectors accept an arbitrary `Authorization` header configured per connector.
- MCP Inspector accepts arbitrary headers.
- Cursor accepts arbitrary headers.
- ChatGPT Custom Connectors require OAuth 2.1 with PKCE and reject Basic Auth.

ChatGPT compatibility is therefore the only feature lost, and it is not in scope for the first hosted target.

## Decision

Hosted public mode uses Basic Auth pass-through. No OAuth server. No credential store. No KMS.

1. Clients send `Authorization: Basic base64(<wp_username>:<wp_app_password>)` on every `/mcp` request.
2. `@hhc-mcp/http` decodes the header at request time, holds the credentials in process memory for the duration of that request only, and uses them as upstream Basic Auth against `club.hyperhuman.pl` (per ADR-007 base URL policy).
3. The server persists no per-user data: no encrypted blobs, no DEKs, no `users` table.
4. The server runs no authorization server. There is no Keycloak. There is no `/connect`, `/callback`, or `/disconnect`.
5. The server publishes no `/.well-known/oauth-protected-resource` document.
6. TLS is mandatory for `/mcp`. The first hosted deployment terminates TLS at Cloudflare and reaches the origin process through a Cloudflare Tunnel; no public port is exposed at the origin.
7. Missing or malformed `Authorization` header returns HTTP `401` with a plain-text body describing the expected header. The response MUST NOT include a `WWW-Authenticate: Basic` challenge, to prevent browsers from prompting on accidental visits.
8. The server MAY emit an audit log keyed by `wp_username` (PII, not a secret) and tool name. It MUST NOT log any portion of the password, the raw `Authorization` header, tool argument payloads, or upstream response bodies.
9. ChatGPT Custom Connector compatibility is explicitly deferred. If required later, it can be added as a thin OAuth façade in front of the same Basic Auth core: an opaque Bearer token decodes to `(user, pass)` for upstream use, with no persistent state introduced. That work needs its own ADR when it is taken on.

## Consequences

- `@hhc-mcp/http` ships as a single Node process. No Keycloak, no PostgreSQL, no KMS infrastructure.
- Hosted security model is identical to stdio: user-held secret, server-transient. No honey pot.
- GDPR posture: operator of infrastructure, not processor of personal data, provided the audit log records only `wp_username` and tool name (never argument payloads or response bodies).
- Token revocation = user rotates their Application Password in WordPress. There is no deprovisioning code on the server side.
- ChatGPT Custom Connector is unsupported until a future façade ADR.
- Brute force protection lives at WordPress (its native Application Password rate limit, optionally hardened with `wp-fail2ban`) and at Cloudflare (WAF / per-IP throttle). Per-MCP-subject throttling in our process is not implemented for MVP and is added only on observed pressure.
- ADR-013 still holds (VPS + Docker Compose + Cloudflare Tunnel), but the Compose file contains exactly one service.
- ADR-015 hard caps (max concurrency 4 default / 8 absolute, max 100 scanned feeds per request, max 2 000 scanned comments per request) remain in force in `@hhc-mcp/core`. The per-MCP-subject and per-WP-user request-per-minute limits in ADR-015 are deferred.
- Roadmap effect: `v0.3.0` (Keycloak OAuth resource server) and `v0.4.0` (encrypted WordPress connect flow) milestones are removed. `v0.2.0` is simplified to "HTTP transport + Basic Auth pass-through + all 13 tools wired"; the next milestone after that is hosted deployment at `hyperhuman-mcp.kingscode.pl` behind Cloudflare Tunnel.

## References

- ADR-002, ADR-003, ADR-010, ADR-011, ADR-014 — superseded
- ADR-013, ADR-015 — modified
- ADR-005 (distribution targets), ADR-006 (read-only v1), ADR-007 (base URL policy), ADR-008 (error model), ADR-016 (MCP error envelope)
- `docs/hosted-auth.md` — rewritten to reflect this decision
- `ROADMAP.md` — v0.2.0..v1.0.0 updated
