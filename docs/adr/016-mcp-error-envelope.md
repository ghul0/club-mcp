# ADR-016: MCP tool error envelope

Status: accepted

## Context

ADR-008 defines typed Result-style expected errors in `@hhc-mcp/core`. MCP tools need a consistent mapping from those errors to `tools/call` results.

## Decision

Expected errors are returned as MCP tool execution errors with `isError: true`.

The result contains:

- `content[0].type = "text"`,
- `content[0].text` as a safe human-readable message,
- `structuredContent.error.code`,
- `structuredContent.error.message`,
- `structuredContent.error.retryable`,
- `structuredContent.error.correlation_id` when available.

Protocol errors are reserved for malformed JSON-RPC, unknown tools, and invalid MCP request shape.

Error payloads must never include credentials, auth headers, cookies, nonces, app passwords, callback query strings, or raw upstream response bodies.

## Consequences

- LLM clients receive actionable self-correction messages.
- Operators can correlate failures without logging sensitive data.
- Tool handlers remain thin mappers from core Result errors to MCP tool results.
