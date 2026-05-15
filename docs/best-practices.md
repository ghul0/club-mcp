# Best practices for read-only REST-backed MCP servers

This document summarizes best practices for three variants that wrap the Hyper Human Club / Fluent Community REST API:

1. **Local stdio MCP** — recommended privacy-first default.
2. **Hosted public Streamable HTTP MCP** — OAuth-protected remote server with optional Cloudflare origin protection.
3. **Self-hosted remote MCP** — operator-run HTTP server.

It is intentionally conservative: read-only tools, no owner credentials, minimal processing, and no unnecessary storage.

## 1. Non-negotiable design goals

1. **Read-only by construction**
   - Expose only tools that map to safe REST `GET` requests.
   - Do not expose generic REST proxy/fetch tools.
   - Do not expose any tool that accepts arbitrary URL, arbitrary HTTP method, arbitrary route, or arbitrary headers.
   - Hard-block `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, and write-like Fluent Community routes.

2. **No shared owner account**
   - Never use the owner’s browser cookies or `X-WP-Nonce` in a public hosted MCP server.
   - Every user should authenticate upstream as themselves, or the server should return no club data.

3. **Account/role-bound visibility**
   - The upstream Fluent Community REST API returns what the authenticated user can see in the web UI.
   - The MCP server must not claim to provide admin/private access unless the upstream user actually has it.

4. **Minimal data processing**
   - Prefer local stdio when zero hosted processing is required.
   - Hosted public mode may store only encrypted upstream credentials and minimal credential metadata.
   - Process club API responses in memory only.
   - Do not persist response bodies, comments, profile data, search results, exported datasets, or raw prompts.

5. **No data/content logs**
   - Log only operational metadata: timestamp, tool name, HTTP status, latency, record counts, correlation ID.
   - Never log request bodies containing credentials, `Authorization`, `Cookie`, `X-WP-Nonce`, app passwords, `Cf-Access-Jwt-Assertion`, or upstream response bodies.

## 2. MCP transport best practices

### Local stdio transport

For the local variant:

- Use stdio transport.
- The MCP client spawns the server as a subprocess.
- Credentials are read from local env vars or OS keyring.
- The hosted infrastructure is not in the data path.
- Do not write anything except valid MCP JSON-RPC messages to stdout.
- Write logs, if any, to stderr and redact secrets.
- Prefer WordPress Application Passwords over cookie+nonce.

### Hosted Streamable HTTP transport

The current MCP spec defines **Streamable HTTP** as the remote/server transport.

Important requirements from the MCP transport spec:

- Use a single HTTP endpoint path, e.g. `/mcp`, supporting POST and optionally GET for SSE.
- Every JSON-RPC message from client to server is a new HTTP POST.
- Clients must include `Accept: application/json, text/event-stream` for POST.
- Server may return either `application/json` or `text/event-stream`.
- If HTTP is used, clients include `MCP-Protocol-Version`, e.g. `2025-11-25`.
- Validate `Origin` on all incoming Streamable HTTP connections to mitigate DNS rebinding.
- If an invalid `Origin` is present, return `403 Forbidden`.
- Implement proper authentication for all connections.
- Do not use MCP session IDs as authentication.
- If session IDs are used, generate cryptographically secure IDs and bind them to the authenticated user.

For our project:

- Endpoint: `https://mcp.example.com/mcp`.
- Use Streamable HTTP, not old HTTP+SSE unless older clients require compatibility.
- Do not rely on stateful sessions for auth.
- Consider a stateless MCP transport configuration if the chosen SDK supports it.
- If using sessions, store no club data in session state.

## 3. MCP authorization best practices

For remote HTTP MCP servers, authorization is optional in the spec but strongly recommended for user data.

Official MCP authorization principles:

- A protected MCP server acts as an OAuth 2.1 resource server.
- MCP clients send `Authorization: Bearer <access-token>` on every request.
- Access tokens must not be included in URL query strings.
- MCP servers validate tokens before processing requests.
- Tokens must be issued specifically for the MCP server audience/resource.
- MCP servers must not accept or transit tokens meant for other services.
- OAuth authorization should use HTTPS, exact redirect URI validation, state, and PKCE.
- MCP clients use Resource Indicators (`resource`) to bind tokens to the intended MCP server.
- MCP servers that require authorization publish Protected Resource Metadata.

### Practical interpretation for this project

There are two different auth layers:

```text
MCP client -> club-mcp server        OAuth 2.1 bearer token for public hosted mode
Optional edge -> club-mcp server     Cloudflare Access / Tunnel for private edge protection
club-mcp server -> HyperHuman REST   per-user WordPress credential
```

Do not mix them.

- The MCP OAuth token proves the caller may access the hosted MCP server.
- Cloudflare Access can protect a private edge/origin, but it is not the public hosted MCP auth model.
- The WordPress credential proves which Hyper Human Club user is making upstream REST calls.
- The token received by the MCP server must not be blindly forwarded to WordPress.
- The upstream WordPress credential must be separate and account-bound.

## 4. Cloudflare Access/Tunnel best practices

Cloudflare can protect the origin and private deployments. Public hosted MCP still needs OAuth 2.1/Protected Resource Metadata for MCP clients.

Recommended Cloudflare setup:

1. **Cloudflare Tunnel**
   - Run `cloudflared` on the origin host.
   - Origin service listens only on `127.0.0.1` or a private network.
   - Firewall blocks public inbound traffic to origin.
   - Traffic reaches origin only through Cloudflare.

2. **Cloudflare Access for private/self-hosted edge**
   - Protect `https://mcp.example.com/mcp` and any connect/callback endpoints only in private deployments.
   - Prefer per-user identity provider login where possible.
   - For clients that cannot do interactive Cloudflare Access, use per-client/per-user Service Tokens.
   - Avoid one shared Service Token for all users.
   - Do not assume Cloudflare Access alone will satisfy public Claude/ChatGPT remote MCP auth.

3. **Validate Cloudflare JWT at origin**
   - Cloudflare sends `Cf-Access-Jwt-Assertion` to origin.
   - Validate JWT signature using Cloudflare JWKS.
   - Validate issuer and Application Audience (`aud`).
   - Use the JWT subject/email only as MCP-layer identity.

4. **Service Token usage**
   - Standard headers: `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
   - Some clients support only one custom header; Cloudflare supports single-header service token auth configuration.
   - Tokens expire; design revocation and rotation.

## 5. Upstream WordPress / Fluent Community auth

### Preferred upstream method: WordPress Application Passwords

WordPress Application Passwords are designed for programmatic REST API access over HTTPS.

Useful facts:

- WordPress has shipped Application Passwords since 5.6.
- REST calls use Basic Auth over HTTPS:

```bash
curl --user "USERNAME:APPLICATION_PASSWORD" https://club.hyperhuman.pl/wp-json/...
```

- Discovery is available at `/wp-json/` under:

```json
{
  "authentication": {
    "application-passwords": {
      "endpoints": {
        "authorization": "https://club.hyperhuman.pl/wp-admin/authorize-application.php"
      }
    }
  }
}
```

- The authorization flow accepts:
  - `app_name` required,
  - `app_id` recommended,
  - `success_url` recommended,
  - `reject_url` optional.
- On approval, WordPress redirects to `success_url` with `site_url`, `user_login`, and `password`.
- App passwords are revocable from WordPress user profile.
- App passwords should be stored encrypted if persisted.

### Avoid in hosted public mode

- Do not use browser cookies plus `X-WP-Nonce` for public hosted MCP.
- Do not import Playwright browser sessions into the hosted server.
- Do not use one bot/admin account unless intentionally building a shared-visibility service.

### True OAuth to WordPress

Native WordPress REST does not provide a full OAuth/OIDC flow by default. True OAuth/OIDC/JWT would require plugin or site-side support. For the current Hyper Human Club case, Application Passwords are the practical path if enabled.

## 6. Data minimization patterns

### Pattern A — local stdio no-storage MVP

User supplies upstream WordPress credentials to the local stdio process via env or OS keyring.

Pros:

- No database of users.
- No persistent credential storage.
- Minimal breach impact.

Cons:

- Env-var setup may store credentials in local plaintext MCP config.
- Credentials pass through local process memory.
- Must be extremely careful with local stderr logs and error reporting.

Possible credential input methods:

- env vars:
  - `HHC_USER`
  - `HHC_APP_PASS`
- OS keyring via `hhc-mcp login`.

### Pattern B — hosted public encrypted credential storage

User completes WordPress Application Password connect flow once. Server stores encrypted app password keyed by MCP OAuth identity.

Pros:

- Much better UX.
- Compatible with clients that cannot send upstream credentials on every request.

Cons:

- Server stores secrets.
- Requires database/KMS/backup/revocation/security hardening.

If used:

- Encrypt secrets with KMS or envelope encryption.
- Store only `mcp_subject`, `wp_site`, `wp_user_login`, encrypted app password, timestamps, and revocation status.
- Never store raw club content.
- Implement disconnect/revoke.
- Avoid backups containing plaintext secrets.

### Pattern C — self-hosted/private stateless headers

A self-hosted operator may choose stateless upstream credential headers for trusted private clients. This is not the public hosted default because common public MCP clients do not reliably support arbitrary upstream secret headers.

## 7. Read-only enforcement

Read-only must be implemented in multiple layers.

### Layer 1: tool allowlist

Only register read-only tools:

- `club_search_members`
- `club_get_profile`
- `club_get_my_profile`
- `club_get_recent_posts`
- `club_get_recent_comments`
- `club_get_user_comments`
- `club_get_feed`
- `club_get_feed_comments`
- `club_list_spaces`
- `club_list_courses`
- `club_get_unread_notifications`

Do not register:

- `club_post_add`
- `club_comment_add`
- `club_comment_edit`
- `club_delete_*`
- `club_react_*`
- `club_join_space`
- `club_update_profile`
- any admin write tool

### Layer 2: HTTP method restriction

The REST client wrapper should have only a `get()` method for production read-only mode.

If a lower-level HTTP client supports other methods, guard it:

```text
if method != GET: throw SecurityError
```

### Layer 3: route allowlist

Allow only known REST paths under:

```text
https://club.hyperhuman.pl/wp-json/fluent-community/v2
```

No arbitrary URL input. No arbitrary host input.

### Layer 4: tool annotations

Use MCP tool annotations where supported:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

Notes:

- `readOnlyHint` tells clients the tool does not modify the environment.
- `destructiveHint` and `idempotentHint` are meaningful primarily when `readOnlyHint == false`, but setting conservative values is still useful documentation.
- `openWorldHint: false` is appropriate because tools interact with a fixed, closed upstream domain rather than arbitrary web search.

### Layer 5: tests

Add tests proving:

- no registered tool maps to non-GET method,
- no arbitrary route/URL tool exists,
- all tool definitions include `readOnlyHint: true`,
- write-looking upstream paths are rejected,
- logs redact auth headers and body values.

## 8. Tool schema and output best practices

MCP tool spec recommendations:

- Every tool should define a precise Zod schema.
- Generate or expose corresponding JSON Schema for MCP tool definitions.
- Derive TypeScript types from Zod schemas rather than duplicating contracts.
- Use `additionalProperties: false` / strict Zod objects where possible.
- Keep tool names stable and simple: lowercase, underscores, no spaces.
- Prefer structured output via `structuredContent`.
- Also include a text JSON representation for compatibility.
- Define `outputSchema` for predictable results.
- Report tool execution errors with `isError: true` and actionable messages.
- Use protocol errors for invalid MCP requests and unknown tools.

For LLM safety:

- Do not return unbounded full exports by default.
- Require explicit limits.
- Truncate or paginate long text fields.
- Include `next_cursor`/`has_more` for large outputs.
- Include source identifiers/permalinks so the user can verify.

## 9. Input validation for REST-backed tools

Validate all user-supplied parameters before hitting upstream REST.

TypeScript/Zod requirements:

- Tool input schemas are Zod schemas.
- Tool output schemas are Zod schemas.
- Upstream REST responses are received as `unknown`.
- Upstream REST responses are parsed through endpoint-specific Zod schemas before domain use.
- Zod parse failures become typed tool execution errors and never leak raw payloads.

Examples:

- `since`: parse into `YYYY-MM-DD HH:MM:SS`; reject ambiguous invalid dates.
- `username`: allow only `[A-Za-z0-9_-]`, max length.
- `feed_id`: integer, positive, bounded.
- `space`: slug pattern `[A-Za-z0-9_-]`.
- `query`: max length, trim, no control chars.
- `page`: integer 1..reasonable max.
- `per_page`: default 50/100, max 100 or 200 depending endpoint.
- `limit`: max cap to prevent large exports.

Avoid exposing raw upstream query composition directly to the model.

Source-code style requirement:

- Production TypeScript source contains no comments/JSDoc/TSDoc.
- Decisions and explanations live in `docs/` and `docs/adr/`, not in code comments.

## 10. Output sanitization and privacy controls

Even read-only data can be sensitive.

Recommended controls:

- Do not return secrets/credentials under any circumstance.
- Strip or redact unexpected fields with names like `email`, `token`, `nonce`, `password`, `cookie`, `auth`, `secret` unless explicitly intended and allowed.
- For other users’ profiles, return only fields present in public/profile response.
- For current user profile, consider redacting e-mail by default unless a tool explicitly asks for own profile and user consents.
- Normalize HTML fields into both `html` and `text` variants if helpful.
- Preserve source permalink and IDs for auditability.
- Avoid returning hidden admin-looking route data.

## 11. Logging and telemetry

Recommended log event shape:

```json
{
  "ts": "2026-05-15T10:00:00Z",
  "correlation_id": "...",
  "cf_subject_hash": "...",
  "tool": "club_get_recent_comments",
  "status": "ok",
  "upstream_status": 200,
  "duration_ms": 842,
  "record_count": 42
}
```

Do not log:

- WordPress app password,
- Basic Auth header,
- Cloudflare Access token/JWT,
- cookies/nonces,
- raw request arguments if they contain names/queries and you want strict privacy,
- raw response bodies,
- comments, posts, profile descriptions.

If debugging requires payloads, use a separate local/dev-only mode with explicit opt-in and automatic redaction.

## 12. Rate limits, quotas, and backpressure

Protect both your server and the club site.

Controls:

- Per Cloudflare identity / service token rate limit.
- Per upstream WP username rate limit if available.
- Per tool max pages / max items.
- Concurrency cap for comment fan-out.
- Timeouts for all upstream requests.
- Retry only on transient 429/5xx, with exponential backoff and jitter.
- Circuit breaker if upstream begins failing.

Suggested defaults:

- `club_get_recent_posts`: max 500 posts scanned.
- `club_get_recent_comments`: max 500 feeds scanned and max 2,000 comments scanned per call.
- `club_get_user_comments`: max 500 comments returned with pagination.
- Upstream concurrency: 4-8 requests max.
- Request timeout: 10-20 seconds.

## 13. Multi-tenant isolation

Risks: one user sees another user’s cache/result/credentials.

Mitigations:

- Stateless mode: no persistent cross-request cache.
- If caching is necessary, key by stable authenticated MCP identity + upstream WP user + route + params.
- Never global-cache profile/feed/comment bodies across users unless data is explicitly public and identical for all users; safer to avoid shared cache entirely.
- Do not include credentials in cache keys directly; hash if needed.
- Clear in-memory session data on disconnect/TTL.

## 14. SSRF and egress controls

Because this MCP server is a REST wrapper, do not allow arbitrary upstream hosts.

- Hardcode upstream host: `club.hyperhuman.pl`.
- Hardcode REST base: `/wp-json/fluent-community/v2`.
- Reject redirects to any other host.
- Use HTTPS only.
- Disable or validate redirects.
- Configure container/firewall egress allowlist if possible:
  - allow `club.hyperhuman.pl:443`, Cloudflare JWKS, auth provider endpoints,
  - block metadata IP `169.254.169.254`, private ranges, localhost except required local services.

## 15. Handling recent comments/posts

Known API limitation: no confirmed global `comments_since` endpoint.

Reliable algorithm:

1. Fetch visible feeds with pagination.
2. Filter new posts by `feed.created_at >= since`.
3. For feeds with `comments_count > 0`, fetch `/feeds/{id}/comments`.
4. Filter comments by `created_at >= since` and optionally `updated_at >= since`.
5. Return bounded results with counts and next cursor if needed.

For a specific user:

1. Resolve username using `/members?search=...` if needed.
2. Fetch `/profile/{username}/comments?page=...&per_page=...`.
3. Filter locally by date.
4. Backfill profile metadata if individual comment objects omit `xprofile`.

## 16. Prompt-injection considerations

Posts/comments/profiles are untrusted text. They may include instructions aimed at the AI.

Mitigations:

- Treat upstream content as data, not instructions.
- Tool descriptions should explicitly say returned content is untrusted user-generated content.
- Wrap content in structured fields, not in free-form assistant instructions.
- Include metadata labels (`author`, `created_at`, `permalink`) separately from body.
- Avoid returning executable markdown/HTML without context.
- If returning HTML, also return stripped text.

## 17. Deployment hardening

- Run as non-root.
- Container read-only filesystem if possible.
- No shell execution in request path.
- Disable debug endpoints in production.
- Use secure dependency versions and lockfile.
- Use secret scanning in CI.
- Pin Node.js version.
- Health endpoint returns only generic status.
- Metrics endpoint protected.
- Add security headers for any browser pages:
  - `Content-Security-Policy`,
  - `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`,
  - `Referrer-Policy: no-referrer`,
  - `X-Content-Type-Options: nosniff`.

## 18. Testing requirements

Minimum tests before deployment:

- MCP protocol initialize/tools/list/tools/call smoke tests.
- JSON Schema validation tests for every tool.
- Read-only invariant tests.
- Auth missing/invalid/expired tests.
- Cloudflare JWT validation tests with bad issuer/audience.
- Upstream Basic Auth failure tests.
- Pagination tests.
- Date parsing tests.
- Cross-user isolation tests.
- Log redaction tests.
- Rate limit tests.
- Error response tests ensuring no credentials leak.

## 19. Recommended build architecture

For maximum minimization, start with the **local stdio variant**:

- User runs MCP locally.
- User supplies WordPress Application Password via env vars or OS keyring.
- Your hosted server is not in the data path.
- Read-only tools only.
- No cache.
- No response body logs.

Then add the **hosted stateless variant**:

- Cloudflare Tunnel + Access in front.
- Origin validates `Cf-Access-Jwt-Assertion`.
- No database.
- Upstream WordPress Application Password provided per connection/request by the user.
- Read-only tools only.
- No cache.
- No response body logs.
- Bounded pagination and concurrency.

Only if hosted UX requires it, add encrypted per-user app-password storage with explicit connect/disconnect flows.
