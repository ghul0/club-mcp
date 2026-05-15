# ADR-005: Distribution targets

Status: accepted

## Context

Local MCP and hosted/self-hosted MCP have different distribution needs. Earlier Python-oriented docs mentioned `uvx`, but ADR-001 selects TypeScript.

## Decision

Distribution targets:

- local stdio MCP: npm package, runnable with `npx` or package-manager equivalent,
- hosted HTTP MCP: Docker image published to GHCR,
- self-hosted remote: same GHCR image plus documented environment variables and reverse-proxy examples.

Do not use PyPI/uvx for the production MCP product.

## Consequences

- Claude Desktop/Code examples use `npx`, not `uvx`.
- Deployment docs use Docker/GHCR.
- CI should build npm packages and Docker images.
