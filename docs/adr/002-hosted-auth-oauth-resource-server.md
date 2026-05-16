# ADR-002: Hosted public MCP authorization

Status: superseded by [ADR-019](019-hosted-auth-basic-pass-through.md)

## Context

Cloudflare Access is useful for protecting origins and private deployments, but public remote MCP clients such as Claude and ChatGPT generally expect the MCP server to support the MCP HTTP authorization model based on OAuth 2.1 and Protected Resource Metadata. Cloudflare-specific service-token headers are not a portable hosted MCP auth model.

## Decision

For public hosted remote MCP, implement the MCP server as an OAuth 2.1 protected resource server.

Requirements:

- serve Protected Resource Metadata at the required well-known endpoint,
- return `WWW-Authenticate` with `resource_metadata` on unauthorized requests,
- validate bearer tokens on every request,
- validate token audience/resource,
- do not accept or pass through tokens issued for other services,
- use least-privilege scopes,
- support OAuth flow expected by target clients.

Cloudflare Tunnel remains recommended for origin protection. Cloudflare Access may be used as optional private edge protection or for self-hosted/private deployments, but it is not the sole public hosted MCP authorization mechanism.

## Consequences

- Hosted public MVP must include OAuth/Protected Resource Metadata work.
- Cloudflare Access-only hosted mode is classified as private/self-hosted mode, not public connector mode.
- The hosted auth docs must distinguish public OAuth mode from private Cloudflare edge mode.
