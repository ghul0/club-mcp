# ADR-013: First hosted deployment platform

Status: accepted

## Context

Hosted public mode requires `@hhc-mcp/http` and optional Cloudflare origin protection. The first deployment should minimize platform-specific complexity.

Originally this ADR also required Keycloak and PostgreSQL. [ADR-019](019-hosted-auth-basic-pass-through.md) removes both: hosted auth is Basic Auth pass-through, no auth server, no credential store.

## Decision

Use VPS + Docker Compose + Cloudflare Tunnel as the first hosted deployment platform.

## Consequences

- Deployment docs and examples target Docker Compose first.
- The Compose file contains a single service (`@hhc-mcp/http`) per ADR-019. Keycloak and PostgreSQL are no longer part of hosted MVP.
- Cloudflare Tunnel exposes the HTTP service without opening public origin ports.
- TLS terminates at Cloudflare; the origin is reachable only through the Tunnel.
- Other platforms can be added later after the first deployment works.
