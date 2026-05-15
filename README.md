# club-mcp

Read-only MCP access to the Hyper Human Club / Fluent Community REST API.

## Goal

Support three deployment variants with one shared TypeScript read-only core:

1. **Local stdio MCP** — recommended privacy-first default; credentials and club data stay on the user's machine.
2. **Hosted public Streamable HTTP MCP** — OAuth-protected remote connector with encrypted per-user WordPress credential storage.
3. **Self-hosted remote MCP** — operator deploys the HTTP server on their own infrastructure.

All variants expose safe read-only tools such as `club_get_recent_posts`, `club_get_recent_comments`, `club_get_user_comments`, `club_search_members`, and `club_get_profile` without sharing the owner’s browser session.

## Current status

This repository folder currently contains architecture docs and an initial TypeScript pnpm workspace scaffold. Production implementation is not complete yet.

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
