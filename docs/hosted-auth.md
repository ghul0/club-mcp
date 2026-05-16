# Hosted authentication design

Authoritative source: [ADR-019](adr/019-hosted-auth-basic-pass-through.md). This document explains the operational shape.

Hosted public MCP uses Basic Auth pass-through. The server is a transparent proxy: the user holds the secret, the server holds it in memory only for the duration of one request.

```text
MCP client → @hhc-mcp/http                Authorization: Basic base64(wp_user:wp_app_pass)
@hhc-mcp/http → club.hyperhuman.pl/wp-json  same Basic header, forwarded 1:1
```

There is no OAuth server, no Keycloak, no PostgreSQL credential store, no key-encryption key. The original design (ADR-002/003/010/011/014) was superseded.

## Wire format

Every `/mcp` request MUST carry:

```http
Authorization: Basic <base64(wp_username:wp_app_password)>
```

Where `wp_username` is the WordPress user login on `club.hyperhuman.pl` and `wp_app_password` is a WordPress Application Password created via that user's profile.

The server:

- decodes the header on each request,
- holds `(user, pass)` in request-scoped memory only,
- forwards the same `Authorization: Basic ...` header to the upstream WordPress REST API,
- never logs the raw header, the password, or tool arguments,
- never persists either value to disk.

## Error responses

| Condition | Status | Body | Notes |
|---|---|---|---|
| Missing `Authorization` header | `401` | text describing required header | No `WWW-Authenticate: Basic` (avoids browser prompts on accidental visits). |
| Malformed header / non-Basic scheme | `401` | text describing required format | Same as above. |
| Decoded credentials rejected upstream by WordPress | mapped to MCP error envelope per [ADR-016](adr/016-mcp-error-envelope.md), `error.code = "auth"` | actionable message | Server does not retry with different credentials. |
| Decoded credentials valid but upstream forbids the resource | mapped to MCP error envelope, `error.code = "forbidden"` | actionable message | Application Password capabilities are WordPress-side. |

## TLS and edge

The first hosted deployment runs behind Cloudflare:

- TLS terminates at Cloudflare (`hyperhuman-mcp.kingscode.pl`).
- Cloudflare Tunnel reaches the origin `@hhc-mcp/http` process. No public origin port.
- WAF and per-IP throttle are configured at Cloudflare.

Cloudflare Access is not used to gate `/mcp` for public clients; the bearer of a valid WordPress Application Password is the authenticated principal. Cloudflare Access is acceptable for private/self-hosted variants per ADR-019 §6.

## Audit log

If enabled, audit log records:

- `wp_username` (decoded from the header; PII, not a secret),
- request timestamp,
- tool name,
- HTTP status returned to the MCP client,
- `correlation_id` per ADR-008.

It MUST NOT record:

- the password,
- the raw `Authorization` header,
- tool argument payloads,
- upstream response bodies.

## Revocation

A user revokes hosted access by rotating or deleting the Application Password in WordPress (`Users → Profile → Application Passwords`). There is no server-side deprovisioning step.

## Brute-force protection

Defence in depth, not in our process:

1. WordPress' native Application Password rate limit per IP / per user. Optionally harden with `wp-fail2ban`.
2. Cloudflare WAF + per-IP throttle in front of `/mcp`.

Our process implements no per-IP or per-user request-per-minute limit. ADR-015 hard caps (concurrency, scanned-feed/comment limits) apply inside individual tool calls and are sufficient to bound upstream pressure per request.

## Client compatibility

| Client | Status | Notes |
|---|---|---|
| Claude Desktop Custom Connector | supported | `Authorization` header configurable in connector form. |
| MCP Inspector | supported | Arbitrary headers. |
| Cursor | supported | Arbitrary headers. |
| Claude Code | supported | Arbitrary headers via MCP config. |
| ChatGPT Custom Connector | not supported | Requires OAuth 2.1 with PKCE; Basic Auth rejected. Deferred to a future OAuth-façade ADR. |

Verify exact behaviour for each target client during `v0.2.0` integration.

## Fallback if Application Passwords are disabled

The hosted server returns an actionable error:

```text
Application Passwords are not available for this account/site on
club.hyperhuman.pl. Ask the site admin to enable the WordPress
Application Passwords feature, or use the local stdio variant
(`npx @hhc-mcp/stdio`).
```

Cookie + nonce fallback is not supported in hosted public mode.

## Self-hosted variants

Operators running their own deployment may add stronger edge protection in front of Basic Auth — for example Cloudflare Access service tokens, mTLS, or an oauth2-proxy/Authelia front. Whatever they layer on top must still know the authenticated subject and not rely on an unverified header from the public internet.

That layering is out of scope for the hosted MVP and out of scope for `@hhc-mcp/http`. The core server stays Basic-Auth pass-through.
