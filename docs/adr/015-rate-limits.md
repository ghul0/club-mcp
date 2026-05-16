# ADR-015: Initial hosted rate limits

Status: partially superseded by [ADR-019](019-hosted-auth-basic-pass-through.md)

## Context

The hosted server must protect itself and the upstream club site. Recent-comment scans can fan out into many upstream requests.

[ADR-019](019-hosted-auth-basic-pass-through.md) defers the per-MCP-subject and per-WP-user request-per-minute limits below until operational pain demonstrates they are needed. The hard caps (concurrency, scanned feeds, scanned comments) remain in force inside `@hhc-mcp/core`.

## Decision

Hard caps (enforced in `@hhc-mcp/core`, apply to both stdio and hosted):

- `HHC_MAX_UPSTREAM_CONCURRENCY=4` (default)
- hard maximum upstream concurrency per request: 8
- hard maximum scanned feeds per recent-comment / search request: 100
- hard maximum scanned comments per recent-comment / search request: 2,000

Deferred until needed (ADR-019):

- ~~`HHC_RATE_LIMIT_PER_MCP_USER_PER_MINUTE=60`~~
- ~~`HHC_RATE_LIMIT_PER_WP_USER_PER_MINUTE=120`~~
- ~~`HHC_RECENT_COMMENT_SCANS_PER_USER_PER_HOUR=10`~~

## Consequences

- Hard caps are active today (T1-06, T1-24, T1-27 in `@hhc-mcp/core`).
- Per-user request-per-minute throttling is unimplemented for hosted MVP. Add when WP origin or our process shows pressure.
- Local stdio uses the same scan/concurrency caps and never needs per-service rate limiting.
- The scanned-feeds hard cap is 100 (not 500 as originally listed); that lower bound is what the implemented `search_content` / `get_recent_comments` actually enforce.
