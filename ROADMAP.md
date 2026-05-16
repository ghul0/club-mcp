# Roadmap

Semantic versioning. Pre-1.0 minors are feature increments; 1.0 marks production hardening.

## v0.0.x — local stdio MVP (shipped)

Shipped: `v0.0.1` (tag-only), `v0.0.2` (first npm publish, 13 read-only tools), `v0.0.3` (SBOM pipeline fix, populated CHANGELOG).

Scope delivered:

- Phase 0 bootstrap (P0-01..P0-20): process, gates, CI/CD, agent workflow infrastructure.
- Phase 1 `@hhc-mcp/core`: 13 read-only operations, Zod schemas at every boundary, GET-only HTTP client, pagination / concurrency / date / redaction helpers, typed `Result<T, E>` errors, golden tests against `hhc.py`.
- Phase 2 `@hhc-mcp/stdio`: MCP stdio transport, all 13 tools registered with `readOnlyHint: true`, error envelope per ADR-016, Sigstore provenance on every npm release.

ADRs binding: 001, 004, 005, 006, 007, 008, 009, 016, 017.

## v0.1.0 — local production-ready

Scope:

- `hhc-mcp login`, `logout`, `auth status` CLI commands.
- OS keyring storage (macOS Keychain, Linux Secret Service, Windows Credential Manager).
- Env-var auth remains supported for automation/CI.
- P0-21: fix pre-push SSH timeout via post-commit cache.

Definition of done:

- Keyring-backed credential flow exercised on Linux CI plus macOS manual.
- `hhc-mcp login` validates against `/wp-json/` before persisting.
- No secret printed to stdout or stderr.
- Pre-push hook completes in under 5 s on a clean push.

ADRs binding: 005.

## v0.2.0 — `@hhc-mcp/http` with Basic Auth pass-through

Authoritative auth design: [ADR-019](docs/adr/019-hosted-auth-basic-pass-through.md).

Scope:

- Hono server with `/mcp` Streamable HTTP endpoint.
- `Authorization: Basic` required on every request; decoded in memory only; forwarded 1:1 to upstream WordPress.
- `GET /healthz`.
- Structured, redacted logging (`wp_username` and tool name only — never password, raw header, arguments, or response bodies).
- All 13 tools wired over HTTP using the same `@hhc-mcp/core` operations as stdio.
- Dual-mode parity test: identical inputs produce identical outputs via stdio and HTTP transports.
- Dockerfile builds; container runs as non-root.

Explicit non-goals (per ADR-019):

- no OAuth authorization server,
- no Keycloak,
- no PostgreSQL credential store,
- no `/connect` / `/callback` / `/disconnect` routes,
- no `/.well-known/oauth-protected-resource`,
- no ChatGPT Custom Connector compatibility (deferred to a future OAuth-façade ADR if needed).

Definition of done:

- MCP Inspector connects over HTTP with a Basic header and exercises every tool.
- Missing or malformed `Authorization` returns `401` without `WWW-Authenticate: Basic`.
- Dual-mode parity test green for all 13 tools.

ADRs binding: 004, 007, 008, 016, 019.

## v0.3.0 — first hosted deployment

Scope:

- VPS + Docker Compose with one service (`@hhc-mcp/http`).
- Cloudflare Tunnel publishing the service at `hyperhuman-mcp.kingscode.pl`.
- Cloudflare WAF baseline + per-IP throttle in front of `/mcp`.
- Operator runbook in `docs/self-hosted-remote.md`: provision, deploy, rotate the image, decommission.
- End-to-end verification: Claude Desktop Custom Connector → hosted URL → `club.hyperhuman.pl` REST → 13 tools.

Definition of done:

- A new user can connect Claude Desktop to `hyperhuman-mcp.kingscode.pl` using only a WordPress Application Password and the documented configuration snippet.
- No public port exposed at the origin.
- Cloudflare logs show throttle and WAF activity.
- Audit log records only `wp_username` and tool name (verified by a redaction test).

ADRs binding: 013, 019.

## v1.0.0 — production hardening

Scope:

- Upstream timeout, retry/backoff, circuit breaker in `@hhc-mcp/core`.
- Full pass of the security checklist (sections A–P).
- Deployment runbook (ADR-013) executed end to end on a clean VPS.
- Sigstore provenance attestation visible on every npm release.
- Decision: whether to add an OAuth façade for ChatGPT compatibility (separate ADR if yes).

Definition of done:

- Security checklist sections A–P all green.
- Load profile documented (no formal rate-limit gate per ADR-019; hard caps from ADR-015 verified under load).
- Self-hosted remote docs produce a working deployment with no operator intervention beyond documented steps.

ADRs binding: all current accepted ADRs.

## Open decisions parked for later

- Whether to add a managed hosted tier beyond self-hosted Docker.
- Whether to publish npm packages under a personal scope or organization scope.
- Whether to add ChatGPT compatibility via OAuth façade (requires a new ADR).
- Whether to add per-MCP-subject or per-WP-user request-per-minute throttling (deferred per ADR-019 / ADR-015 until operational pain).
