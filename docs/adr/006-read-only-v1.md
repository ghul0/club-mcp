# ADR-006: Read-only v1

Status: accepted

## Context

Fluent Community exposes write routes for posts, comments, reactions, profile updates, and admin workflows. The project requirement is a safe read-only MCP surface.

## Decision

Version 1 exposes only read-only tools backed by upstream `GET` requests.

Forbidden in v1:

- create post/comment,
- edit/delete post/comment,
- reactions,
- join/leave spaces,
- profile updates,
- uploads,
- admin routes,
- generic REST proxy.

## Consequences

- The core REST client in production supports only `GET`.
- Tool registration must include `readOnlyHint: true`.
- Tests must enforce the read-only invariant.
