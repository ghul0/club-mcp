# Roadmap

Semantic versioning. Pre-1.0 minors are feature increments; 1.0 marks production hardening.

## v0.0.1 — local stdio MVP

Scope:

- Phase 0 bootstrap (P0-01..P0-20): process, gates, CI/CD, agent workflow infrastructure.
- Phase 1 `@hhc-mcp/core`: 12 read-only operations, Zod schemas at every boundary, GET-only HTTP client, pagination/concurrency/date/redaction helpers, typed `Result<T, E>` errors, golden tests against `hhc.py`.
- Phase 2 `@hhc-mcp/stdio`: MCP stdio transport, all 12 tools registered with `readOnlyHint: true`, error envelope mapping per ADR-016, npm publish.

Definition of done:

- `npx @hhc-mcp/stdio` boots.
- Claude Desktop config example works against a real WordPress Application Password.
- Coverage thresholds met (80/80/75/80).
- Read-only invariant tests green.
- Golden parity vs `hhc.py` for all 12 operations.

ADRs binding: 001, 004, 005, 006, 007, 008, 009, 016, 017.

## v0.1.0 — local production-ready

Scope:

- `hhc-mcp login`, `logout`, `auth status` CLI commands.
- OS keyring storage (macOS Keychain, Linux Secret Service, Windows Credential Manager).
- Env-var auth remains supported for automation/CI.

Definition of done:

- Keyring-backed credential flow exercised on Linux CI plus macOS manual.
- `hhc-mcp login` validates against `/wp-json/` before persisting.
- No secret printed to stdout or stderr.

ADRs binding: 005.

## v0.2.0 — `@hhc-mcp/http` skeleton

Scope:

- Hono server with `/mcp` Streamable HTTP endpoint.
- `GET /.well-known/oauth-protected-resource`.
- `GET /healthz`.
- Structured, redacted logging.
- OpenTelemetry and Sentry hooks with payload scrubbing.

Definition of done:

- MCP Inspector connects via HTTP.
- Request body limit and origin validation enforced.
- Dockerfile builds green; container runs as non-root.

ADRs binding: 002, 004.

## v0.3.0 — Keycloak OAuth resource server

Scope:

- Keycloak deployment guide for development and first hosted environment.
- Bearer token validation: JWKS, issuer, audience, resource.
- Compatibility tests for MCP Inspector, Claude Custom Connector, and ChatGPT remote connector.

Definition of done:

- All three target clients connect and call at least one tool successfully.
- Tokens with wrong audience or resource are rejected with `401`.
- Least-privilege scopes documented.

ADRs binding: 002, 010.

## v0.4.0 — encrypted WordPress connect flow

Scope:

- `/connect`, `/callback`, `/disconnect` routes.
- WordPress `authorize-application.php` integration with `app_id`, `success_url`, `reject_url`, CSRF `state`.
- PostgreSQL credential store with application-level envelope encryption.

Definition of done:

- Connect flow stores app password encrypted at rest.
- Disconnect revokes and clears the server-side record.
- Callback handler never logs query parameters.
- Key material loaded from a Docker secret or external secret manager.

ADRs binding: 003, 011, 014.

## v0.5.0 — hosted read-only tools

Scope:

- Same 12 tools wired over Streamable HTTP.
- Hosted rate limits applied per ADR-015.
- Dual-mode integration tests comparing stdio and HTTP outputs for identical inputs.

Definition of done:

- Dual-mode parity test green for all 12 tools.
- Rate limits enforce per-MCP-subject and per-WordPress-user.
- Cross-user credential isolation tested.

ADRs binding: 008, 015, 016.

## v1.0.0 — production hardening

Scope:

- Upstream timeout, retry/backoff, circuit breaker.
- Full pass of the security checklist (sections A–P).
- Deployment runbook (ADR-013) executed end to end.
- Sigstore provenance attestation on every npm release.

Definition of done:

- Security checklist sections A–P all green.
- Load test passes at documented rate-limit targets.
- Self-hosted remote docs produce a working deployment without operator intervention beyond documented steps.

ADRs binding: all.
