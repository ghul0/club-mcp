# Open questions before implementation

All currently identified architecture-level choices are resolved in `docs/adr/`.

## Resolved

- Local target: Claude Desktop first, then Claude Code/Pi, with MCP Inspector for debugging.
- Hosted public target: MCP Inspector, Claude Desktop Custom Connector, Claude Code, Cursor.
- Hosted auth: Basic Auth pass-through (ADR-019). No OAuth server, no credential store.
- Hosted credential storage: none. The server holds credentials only in request-scoped memory.
- License: MIT.
- Package layout: pnpm workspace with `@hhc-mcp/core`, `@hhc-mcp/stdio`, `@hhc-mcp/http`.
- Distribution: npx/npm for local stdio, Docker/GHCR for HTTP.
- First hosted deployment platform: VPS + Docker Compose (one service) + Cloudflare Tunnel, served at `hyperhuman-mcp.kingscode.pl`.
- Rate limits: hard caps in `@hhc-mcp/core` only (ADR-015 partial). Per-MCP-subject / per-WP-user throttling deferred until operational pain.
- MCP tool error envelope: see ADR-016.

## Revisit later

- Whether to add ChatGPT Custom Connector compatibility via an OAuth façade (would require a new ADR; Basic Auth core remains).
- Whether to publish the npm packages under a personal scope or organization scope.
- Whether to add a managed hosted tier beyond self-hosted Docker.
- Whether the hyperhuman club host (TBD) can replace the kingscode VPS; depends on whether it supports Docker + a long-running Node process.
- Whether per-MCP-subject or per-WP-user request-per-minute throttling becomes necessary (defer until pain).
