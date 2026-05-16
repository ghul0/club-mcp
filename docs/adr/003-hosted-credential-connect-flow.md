# ADR-003: Hosted upstream credential flow

Status: superseded by [ADR-019](019-hosted-auth-basic-pass-through.md)

## Context

A stateless hosted MCP server where clients pass WordPress Application Passwords as custom headers is privacy-preserving, but it is not generally compatible with public remote MCP clients such as Claude and ChatGPT. Those clients typically do not provide arbitrary per-user upstream credential headers to tools.

## Decision

Hosted public MCP MVP uses an encrypted connect flow for upstream WordPress Application Passwords.

Flow:

1. User authenticates to the hosted MCP server through MCP OAuth.
2. User opens `connect` flow.
3. Server redirects to WordPress `authorize-application.php` with `app_name`, `app_id`, `success_url`, `reject_url`, and CSRF `state`.
4. WordPress redirects back with `site_url`, `user_login`, and `password`.
5. Server immediately encrypts the app password and stores only the minimum credential record.
6. Server uses that per-user credential for read-only REST calls.

Stateless header mode remains allowed only for private/self-hosted deployments and developer testing.

## Consequences

- Hosted public mode stores encrypted credentials, so it cannot be zero-storage.
- Hosted public mode can still avoid storing club content, search results, comments, posts, and profile data.
- Storage, KMS/envelope encryption, revoke, and disconnect are part of hosted MVP.
