# ADR-004: pnpm workspace with three packages

Status: accepted

## Context

The project needs both local stdio and hosted HTTP MCP variants. They should share one read-only REST/domain core to avoid behavior drift.

## Decision

Use a pnpm workspace monorepo with three packages:

```text
packages/core   -> @hhc-mcp/core
packages/stdio  -> @hhc-mcp/stdio
packages/http   -> @hhc-mcp/http
```

Rules:

- `@hhc-mcp/core` contains GET-only REST client, schemas, operations, redaction, date parsing, and test utilities.
- `@hhc-mcp/stdio` contains only local stdio transport and local auth acquisition.
- `@hhc-mcp/http` contains only hosted/self-hosted HTTP transport, OAuth/Cloudflare middleware, connect flow, and deployment adapters.
- Package imports go through public `src/index.ts` entry points.
- No deep imports between packages.

## Consequences

- The implementation plan and scaffolds must be workspace-based, not single-package.
- Dual-mode integration tests compare stdio and HTTP outputs for the same core operations.
