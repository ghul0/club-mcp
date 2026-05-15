# @hhc-mcp/stdio

Local stdio MCP server for the Hyper Human Club. Privacy-first default: your
WordPress credentials and the club data never leave your machine.

## Status

In progress for v0.0.1 (Phase 2). The package currently exports only its
package identifier; the stdio transport and the 12 read-only tools land in
later T1 / T2 tickets. The CLI binary is registered as `hhc-mcp`.

## Purpose

`@hhc-mcp/stdio` is the local MCP transport variant from ADR-004 and ADR-005.
It wraps `@hhc-mcp/core` (GET-only Fluent Community REST client, Zod
envelopes, redaction) behind an MCP stdio server that ships with 12 read-only
tools, including:

- `club_get_recent_posts`, `club_get_recent_comments`,
  `club_get_user_comments`
- `club_search_members`, `club_get_profile`
- additional read-only feed / comment / space tools (see
  `docs/read-only-tools.md`)

## Installation

Once published, run directly via `npx`:

```bash
npx @hhc-mcp/stdio
```

Inside the monorepo, the binary is available after `pnpm build` as
`packages/stdio/dist/index.js` (registered as `hhc-mcp`).

## Configuration

The stdio server is configured entirely through environment variables. There
is no config file. Authentication uses a WordPress Application Password (not
your login password and not a browser cookie).

| Variable        | Required | Description                                                |
| --------------- | -------- | ---------------------------------------------------------- |
| `HHC_BASE_URL`  | yes      | HTTPS base URL of the club, e.g. `https://club.hyperhuman.pl`. |
| `HHC_USER`      | yes      | Your WordPress login (username or email).                  |
| `HHC_APP_PASS`  | yes      | A WordPress Application Password (24-char, space-grouped). |

## Claude Desktop config

Add a server entry to `claude_desktop_config.json` (a fully-worked example
arrives in ticket T2-09):

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

## Security

- Read-only: no POST/PATCH/PUT/DELETE tool surface (ADR-006).
- Secrets are read from environment variables only; they are never written to
  disk, never sent to MCP clients, and never included in tool outputs.
- All logging goes to stderr only and is run through `redactKeys` from
  `@hhc-mcp/core` so credentials, tokens, and cookies cannot leak.
- HTTPS-only upstream; HTTP redirects are rejected.

## Design references

- `docs/adr/004-pnpm-monorepo-packages.md` — package boundaries.
- `docs/adr/005-distribution-targets.md` — stdio as primary distribution.
- `docs/adr/006-read-only-v1.md` — read-only-only contract.
- `docs/read-only-tools.md` — tool catalog.
- `ROADMAP.md` — phase plan.

## License

MIT.
