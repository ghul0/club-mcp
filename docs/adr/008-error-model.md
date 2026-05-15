# ADR-008: Typed error model

Status: accepted

## Context

The TypeScript standard requires stable error shapes and discourages hidden exception control flow for expected errors.

## Decision

Use a typed `Result<T, E>` style for expected domain/application errors in `@hhc-mcp/core`.

Expected errors include:

- validation errors,
- missing auth,
- upstream unauthorized,
- upstream forbidden,
- upstream not found,
- rate limit,
- user-visible business constraints.

Throw only for unrecoverable startup/config invariants and exhaustive `never` failures.

## Consequences

- Tool handlers map typed errors to MCP tool execution errors with `isError: true`.
- Logs use stable error codes.
- No secrets are included in error contexts.
