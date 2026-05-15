# ADR-015: Initial hosted rate limits

Status: accepted

## Context

The hosted server must protect itself and the upstream club site. Recent-comment scans can fan out into many upstream requests.

## Decision

Initial hosted limits:

- `HHC_RATE_LIMIT_PER_MCP_USER_PER_MINUTE=60`
- `HHC_RATE_LIMIT_PER_WP_USER_PER_MINUTE=120`
- `HHC_RECENT_COMMENT_SCANS_PER_USER_PER_HOUR=10`
- `HHC_MAX_UPSTREAM_CONCURRENCY=4`
- hard maximum upstream concurrency per request: 8
- hard maximum scanned feeds per recent-comment request: 500
- hard maximum scanned comments per recent-comment request: 2,000

## Consequences

- Rate limit keys include MCP subject and upstream WP user where available.
- Hosted defaults are conservative and can be raised after observing real usage.
- Local stdio can use the same scan/concurrency caps but does not need per-service rate limiting by default.
