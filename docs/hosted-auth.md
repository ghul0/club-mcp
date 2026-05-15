# Hosted authentication design

Hosted public MCP has two independent auth layers. The first hosted OAuth provider is Keycloak.

```text
MCP client -> @hhc-mcp/http       OAuth 2.1 bearer token for MCP server
@hhc-mcp/http -> WordPress REST   per-user WordPress Application Password
```

## MCP-layer auth for public hosted mode

Public hosted mode implements MCP Authorization with Keycloak as the first authorization server.

Required behavior:

- serve `/.well-known/oauth-protected-resource`,
- return `WWW-Authenticate: Bearer ... resource_metadata=...` on 401,
- require `Authorization: Bearer <token>` on every `/mcp` request,
- validate token issuer/signature/expiry/audience/resource,
- reject tokens not issued for this MCP server,
- never forward MCP bearer tokens to WordPress,
- use least-privilege scopes.

## Cloudflare role

Cloudflare can still be useful:

- Cloudflare Tunnel hides origin.
- Cloudflare WAF can reduce generic abuse.
- Cloudflare Access can protect private/self-hosted deployments.

Cloudflare Access alone is not the public MCP auth model for Claude/ChatGPT-style remote connectors.

## WordPress Application Password connect flow

Discovery:

```text
GET https://club.hyperhuman.pl/wp-json/
```

Expected field:

```text
authentication.application-passwords.endpoints.authorization
```

Authorization URL parameters:

```text
app_name     required, human-readable app name
app_id       stable UUID for this MCP app
success_url  HTTPS callback endpoint
reject_url   HTTPS reject endpoint
state        our CSRF binding, tracked server-side or encrypted cookie
```

Callback query from WordPress:

```text
site_url
user_login
password
```

Handling requirements:

- never log callback query,
- validate `state`,
- validate `site_url` against allowed base URL,
- immediately encrypt `password`,
- store minimal credential metadata,
- test credential with a safe read-only request,
- show success without printing secret.

## Fallback if Application Passwords are disabled

Hosted public mode returns an actionable error:

```text
Application Passwords are not available for this account/site. Use local stdio mode or ask the site admin to enable Application Passwords.
```

Cookie+nonce fallback is not supported in hosted public mode.

## Client matrix

| Client | Local stdio | Hosted public OAuth | Cloudflare Access private | Stateless upstream headers |
|---|---:|---:|---:|---:|
| Claude Desktop local | yes | n/a | n/a | via local env only |
| Claude Code local | yes | n/a | n/a | via local env only |
| Claude Custom Connector | n/a | target | maybe not enough alone | generally no |
| ChatGPT remote connector | n/a | target | maybe not enough alone | generally no |
| MCP Inspector | yes | useful for tests | useful for tests | useful for private tests |
| Self-hosted private client | optional | optional | yes | yes, if trusted |

Exact client compatibility must be verified during implementation against the first selected hosted client.

## Keycloak baseline

Keycloak is the first supported hosted OAuth provider because it is self-hostable, standards-oriented, and aligns with MCP authorization tutorial patterns.

Expected Keycloak setup:

- OIDC/OAuth realm for `hhc-mcp`,
- client/scopes for MCP access,
- audience/resource configured for the MCP server URL,
- JWKS available to `@hhc-mcp/http`,
- PKCE enabled,
- short-lived access tokens,
- refresh-token policy chosen according to hosted client behavior.

## Alternative edge/auth stacks

Self-hosted operators may use alternatives:

- nginx + oauth2-proxy,
- Traefik + ForwardAuth/OIDC,
- Keycloak/OIDC directly,
- Authelia,
- Cloudflare Access,
- native OAuth provider embedded in `@hhc-mcp/http`.

Whatever stack is used, the server must know the authenticated MCP subject and must not rely on an unverified header from the public internet.
