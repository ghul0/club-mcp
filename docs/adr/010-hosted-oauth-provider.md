# ADR-010: Hosted OAuth provider

Status: superseded by [ADR-019](019-hosted-auth-basic-pass-through.md)

## Context

Hosted public MCP needs OAuth 2.1-compatible authorization behavior for remote clients. Cloudflare Access is useful as edge protection but is not a portable public MCP authorization server. Building a custom OAuth provider from scratch would create avoidable security risk.

## Decision

Use Keycloak as the first hosted OAuth provider for public hosted mode.

Reasons:

- self-hostable,
- standards-oriented OIDC/OAuth implementation,
- supports PKCE/JWKS/OIDC discovery patterns needed by MCP auth,
- aligns with the MCP authorization tutorial example,
- can share the deployment database platform with the credential store,
- easier to replace later than a custom OAuth implementation.

Cloudflare Tunnel remains recommended for origin protection. Cloudflare Access may be used for private/self-hosted edge gating but not as the public OAuth provider.

## Consequences

- Hosted deployment docs should include Keycloak setup first.
- `@hhc-mcp/http` validates Keycloak-issued tokens.
- OAuth provider abstraction should remain narrow enough to support future Auth0/Zitadel/Auth.js replacement if needed.
- Keycloak adds infrastructure weight, but lowers auth correctness risk.
