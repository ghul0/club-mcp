# Security checklist

## A. Global read-only invariants

- [ ] Server is explicitly read-only in v1.
- [ ] Production REST client supports only upstream `GET`.
- [ ] No tools perform writes, reactions, joins/leaves, profile updates, admin actions, uploads, or deletes.
- [ ] No generic REST proxy tool exists.
- [ ] No arbitrary URL, route, host, method, or header input exists.
- [ ] Upstream calls are restricted to validated `HHC_BASE_URL` and `/wp-json/fluent-community/v2`.
- [ ] All tools have `readOnlyHint: true` where supported.
- [ ] Tests scan all registered tools/routes and fail on non-GET mappings.

## B. TypeScript and schemas

- [ ] TypeScript `strict: true` is enabled.
- [ ] Additional strict flags are enabled: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitReturns`.
- [ ] No `any` in domain/application code.
- [ ] External REST responses start as `unknown`.
- [ ] Zod validates every tool input.
- [ ] Zod validates every tool output.
- [ ] Zod validates every upstream response envelope before use.
- [ ] Production TypeScript source contains no comments/JSDoc/TSDoc.

## C. Local stdio mode

- [ ] Credentials are read from env or OS keyring, not from prompts visible to the model.
- [ ] Model never receives credentials, including in errors.
- [ ] Logs go to stderr, not stdout.
- [ ] stdout contains only valid MCP JSON-RPC.
- [ ] `hhc-mcp login` uses hidden input for app password.
- [ ] `hhc-mcp login` validates credentials before storing.
- [ ] OS keyring secrets are not duplicated into plaintext config.
- [ ] Env var examples warn about plaintext local config tradeoff.
- [ ] Cookie+nonce fallback is disabled unless explicitly enabled.

## D. Hosted public MCP auth

- [ ] Hosted public mode uses Keycloak as the first OAuth provider.
- [ ] Hosted public mode implements OAuth 2.1 protected resource server behavior.
- [ ] `/.well-known/oauth-protected-resource` exists.
- [ ] 401 responses include `WWW-Authenticate` with `resource_metadata`.
- [ ] Bearer token is required on every `/mcp` request.
- [ ] Tokens are never accepted from URI query strings.
- [ ] Token signature/issuer/audience/resource are validated.
- [ ] Tokens issued for other services are rejected.
- [ ] Token passthrough to WordPress is forbidden.
- [ ] Scopes are least-privilege and not wildcard/omnibus.
- [ ] Invalid tokens return 401; insufficient scopes return 403.

## E. Cloudflare/private edge

- [ ] Cloudflare Tunnel hides origin if used.
- [ ] Origin is not publicly reachable except through intended proxy/tunnel.
- [ ] Cloudflare Access is treated as private edge protection, not the public MCP auth model.
- [ ] If Cloudflare Access is used, origin validates `Cf-Access-Jwt-Assertion` signature, issuer, and audience.
- [ ] Cloudflare signing keys are loaded via JWKS and handle rotation.
- [ ] Cloudflare WAF rules are tested against MCP Streamable HTTP traffic to avoid false positives.
- [ ] Cloudflare plan/cost constraints are documented for the deployment.

## F. Hosted upstream WordPress credentials

- [ ] Hosted credential storage uses PostgreSQL plus application-level envelope encryption.
- [ ] Key material is stored outside PostgreSQL.
- [ ] Hosted server does not use owner browser cookies or owner `X-WP-Nonce`.
- [ ] Each user authenticates upstream as themselves.
- [ ] WordPress Application Password is the primary upstream auth method.
- [ ] Upstream credentials are never included in URL query strings except the transient WordPress callback before immediate handling.
- [ ] Callback query containing app password is never logged.
- [ ] App password is encrypted immediately or rejected.
- [ ] Encryption uses KMS/envelope encryption or an equivalent secret-management design.
- [ ] Stored credential record is minimal: `mcp_subject`, `wp_site`, `wp_user_login`, encrypted app password, timestamps, revocation state.
- [ ] Disconnect/revoke exists.
- [ ] If Application Passwords are unavailable, hosted public mode returns a clear unsupported-auth error.

## G. Input validation

- [ ] All tool inputs use Zod schemas.
- [ ] Objects are strict / `additionalProperties: false` in exposed JSON Schema.
- [ ] Date parsing is strict and unambiguous.
- [ ] `username`, `space_slug`, IDs, page, limit, query length are bounded.
- [ ] No raw query string passthrough from model to upstream.
- [ ] Base URL override is validated and not accepted as a tool argument.

## H. Output minimization

- [ ] Returned fields are allowlisted per tool.
- [ ] Unexpected sensitive keys are redacted: `password`, `secret`, `token`, `nonce`, `cookie`, `authorization`, `email` by default.
- [ ] Long text fields are bounded or paginated.
- [ ] HTML is treated as untrusted content; text variant is provided where useful.
- [ ] No raw full export by default.
- [ ] Source IDs/permalinks are included for verification.
- [ ] Tool descriptions say results are scoped to the authenticated upstream account.

## I. Logging and telemetry

- [ ] Logs contain no content bodies.
- [ ] Logs contain no credentials/tokens/cookies/nonces/JWTs.
- [ ] Logs contain no raw callback query with WordPress app password.
- [ ] Logs contain correlation IDs, tool name, status, latency, counts only.
- [ ] Debug payload logging is disabled in production.
- [ ] Error messages returned to clients are sanitized.
- [ ] MCP tool errors follow ADR-016 and use `isError: true` for expected tool execution errors.
- [ ] Hosted mode scrubs Sentry/OpenTelemetry payloads.
- [ ] Local mode has no telemetry by default.

## J. Rate limits and DoS controls

- [ ] Per-identity rate limit.
- [ ] Per-tool max pages/items.
- [ ] Upstream request timeout.
- [ ] Bounded concurrency for comment fan-out, default 4 and max 8.
- [ ] Retry/backoff only for transient failures.
- [ ] Circuit breaker or fail-fast on upstream degradation.
- [ ] Request body size limit.
- [ ] `club_get_recent_comments` caps scanned feeds and comments.

## K. Multi-tenant isolation

- [ ] Hosted credential lookup is keyed by authenticated MCP subject.
- [ ] No user can select another user’s stored upstream credential.
- [ ] No shared response cache in MVP.
- [ ] If cache exists later, key includes authenticated MCP subject and upstream WP user.
- [ ] Cross-user tests verify isolation.

## L. SSRF/egress

- [ ] Upstream host/base URL is allowlisted.
- [ ] Redirects are disabled or validated to same host.
- [ ] Egress firewall/container policy blocks private ranges and metadata IP where possible.
- [ ] OAuth discovery URLs require HTTPS in production.
- [ ] OAuth discovery blocks private IPs and unsafe redirects where the server performs discovery.

## M. Self-hosted remote mode

- [ ] Self-hosted docs clearly identify operator responsibilities.
- [ ] Default Docker image is read-only v1.
- [ ] Example configs do not contain real secrets.
- [ ] Operator can choose OAuth, Cloudflare Access, or reverse-proxy OIDC/JWT mode.
- [ ] Stateless upstream header mode is marked private/trusted only.
- [ ] Self-hosted base URL allowlist is documented.
- [ ] Reverse proxy examples preserve streaming/SSE behavior.

## N. Connect flow

- [ ] `state` is random, single-use, and short TTL.
- [ ] `success_url` is HTTPS.
- [ ] `reject_url` is set.
- [ ] `app_id` is stable and documented.
- [ ] Callback handler never logs raw query params.
- [ ] App password is immediately encrypted or discarded.
- [ ] User has disconnect/revoke path.
- [ ] Consent page clearly identifies MCP app and requested upstream access.
- [ ] CSP prevents clickjacking with `frame-ancestors 'none'`.

## O. Deployment

- [ ] Runs as non-root.
- [ ] Filesystem is read-only or writable dirs are minimal.
- [ ] No shell execution in request path.
- [ ] Dependency lockfile is committed.
- [ ] CI runs typecheck, lint, test, build, and secret scan.
- [ ] Health endpoint reveals no secrets.
- [ ] Metrics endpoint is protected.
- [ ] Docker image is published to GHCR.

## P. Test matrix

- [ ] Missing hosted OAuth -> 401.
- [ ] Invalid hosted token issuer/audience -> 401/403.
- [ ] Missing upstream credential -> actionable tool error, no upstream REST call.
- [ ] Bad upstream credential -> sanitized 401 tool error.
- [ ] Tool input invalid -> typed tool execution error or JSON-RPC invalid params.
- [ ] Date filter works for posts/comments.
- [ ] User comments lookup works and backfills profile metadata if needed.
- [ ] Read-only invariant test scans all registered tools.
- [ ] Log redaction test with fake secrets.
- [ ] Dual-mode integration test compares stdio and HTTP outputs for same core operation.
- [ ] Load/rate-limit test.
