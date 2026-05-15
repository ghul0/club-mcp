# club-mcp

Read-only MCP access to the Hyper Human Club / Fluent Community REST API.

## Goal

Support three deployment variants with one shared TypeScript read-only core:

1. **Local stdio MCP** — recommended privacy-first default; credentials and club data stay on the user's machine.
2. **Hosted public Streamable HTTP MCP** — OAuth-protected remote connector with encrypted per-user WordPress credential storage.
3. **Self-hosted remote MCP** — operator deploys the HTTP server on their own infrastructure.

All variants expose safe read-only tools such as `club_get_recent_posts`, `club_get_recent_comments`, `club_get_user_comments`, `club_search_members`, and `club_get_profile` without sharing the owner’s browser session.

## Current status

v0.0.x ships the local stdio MCP server with 13 read-only tools that wrap the Hyper Human Club / Fluent Community REST API (`club_search_members`, `club_get_profile`, `club_get_my_profile`, `club_list_spaces`, `club_list_courses`, `club_get_feed`, `club_get_feed_comments`, `club_get_user_comments`, `club_get_recent_posts`, `club_get_recent_comments`, `club_get_since_summary`, `club_get_unread_notifications`, `club_search_content`). All tools are read-only and run against the authenticated user's own scope.

Published packages:

- `@hhc-mcp/core` — framework-agnostic core (GET-only REST client, Zod schemas, 13 operations).
- `@hhc-mcp/stdio` — local stdio MCP transport, ready to register with Claude Desktop or any MCP client.

`@hhc-mcp/http` is scaffold-only and reserved for v0.2.0 (hosted/self-hosted HTTP transport).

### Install

```bash
npx -y @hhc-mcp/stdio
```

Or as a dependency:

```bash
pnpm add @hhc-mcp/stdio @hhc-mcp/core
```

See `docs/local-mode.md` for the Claude Desktop config and credential setup.

License: MIT.

## Key decisions

- TypeScript-first implementation.
- pnpm workspace with `@hhc-mcp/core`, `@hhc-mcp/stdio`, `@hhc-mcp/http`.
- v1 is read-only only.
- No POST/PATCH/PUT/DELETE tools.
- No generic REST proxy tool.
- No owner cookies/nonces in hosted mode.
- Per-user upstream auth through WordPress Application Passwords.
- Local stdio is recommended for maximum privacy.
- Hosted public mode uses MCP OAuth 2.1 protected resource server behavior with Keycloak first.
- Cloudflare Tunnel can protect the origin; Cloudflare Access is optional private edge protection, not the public MCP auth model.

## Local stdio direction

```text
MCP client
  -> local @hhc-mcp/stdio process
  -> @hhc-mcp/core
  -> https://club.hyperhuman.pl/wp-json/fluent-community/v2
```

Example config:

```json
{
  "mcpServers": {
    "hyperhuman-club": {
      "command": "npx",
      "args": ["-y", "@hhc-mcp/stdio"],
      "env": {
        "HHC_BASE_URL": "https://club.hyperhuman.pl",
        "HHC_USER": "your_wp_login",
        "HHC_APP_PASS": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

## Hosted public direction

```text
MCP client
  -> OAuth-protected /mcp endpoint
  -> @hhc-mcp/http
  -> encrypted per-user WordPress Application Password
  -> @hhc-mcp/core
  -> club.hyperhuman.pl REST API
```

Hosted public mode does process upstream REST responses in memory, but it must not persist club content or log content bodies.

## Folder structure

```text
club-mcp/
  docs/
    adr/
    architecture.md
    best-practices.md
    hosted-auth.md
    hosted-auth.md
    implementation-plan.md
    open-questions.md
    read-only-tools.md
    references.md
    security-checklist.md
    self-hosted-remote.md
    stack-decision.md
    variants.md
  packages/
    core/
    stdio/
    http/
  research/
```

## Most important docs

- `docs/stack-decision.md` — TypeScript-first stack decision.
- `docs/adr/` — formal architecture decisions.
- `docs/variants.md` — local, hosted public, and self-hosted variants.
- `docs/architecture.md` — system architecture.
- `docs/hosted-auth.md` — hosted auth and connect flow.
- `docs/read-only-tools.md` — read-only tool contracts.
- `docs/security-checklist.md` — practical checklist.
- `docs/implementation-plan.md` — build phases and estimates.
- `docs/open-questions.md` — remaining owner decisions before coding.
