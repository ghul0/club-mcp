# ADR-013: First hosted deployment platform

Status: accepted

## Context

Hosted public mode requires `@hhc-mcp/http`, Keycloak, PostgreSQL, encrypted credential storage, and optional Cloudflare origin protection. The first deployment should minimize platform-specific complexity.

## Decision

Use VPS + Docker Compose + Cloudflare Tunnel as the first hosted deployment platform.

## Consequences

- Deployment docs and examples target Docker Compose first.
- Keycloak, PostgreSQL, and `@hhc-mcp/http` run as separate services.
- Cloudflare Tunnel exposes the HTTP service without opening public origin ports.
- Other platforms can be added later after the first deployment works.
