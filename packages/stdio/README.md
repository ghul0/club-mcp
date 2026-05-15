# @hhc-mcp/stdio

Local stdio Model Context Protocol (MCP) server for the Hyper Human Club /
Fluent Community REST API. Exposes 13 read-only tools to MCP clients such as
Claude Desktop, Cursor, and the MCP Inspector. Privacy-first by default: your
WordPress credentials and the club data never leave your machine.

## Status

v0.0.1 — first release of the local-stdio mode. The hosted Streamable HTTP
variant (`@hhc-mcp/http`) is planned for v0.2.0+. The CLI binary is registered
as `hhc-mcp`.

## Installation

Once published, install globally or invoke directly via `npx`:

```bash
npm install -g @hhc-mcp/stdio
# or, no install required:
npx -y @hhc-mcp/stdio
```

Inside the monorepo, the binary is available after `pnpm build` at
`packages/stdio/dist/index.js`.

## Configuration

The stdio server is configured entirely through environment variables.
Authentication uses a WordPress Application Password — not your login
password and not a browser cookie. All three variables are validated via Zod
at startup; an invalid or missing value exits with a typed validation error.

| Variable        | Required | Description                                                                                                  |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `HHC_BASE_URL`  | yes      | Base URL of the club, e.g. `https://club.hyperhuman.pl`. Used as the root for the Fluent Community REST API. |
| `HHC_USER`      | yes      | Your WordPress login (username or email).                                                                    |
| `HHC_APP_PASS`  | yes      | A WordPress Application Password (Settings → Profile → Application Passwords; 24-char, space-grouped).       |

## Claude Desktop config

Add a server entry to `claude_desktop_config.json`:

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

## Tools

All 13 tools are READ-ONLY (ADR-006). Each declares `readOnlyHint: true` and
`openWorldHint: false`.

| Tool name                       | Description                                                |
| ------------------------------- | ---------------------------------------------------------- |
| `club_search_members`           | Search members by query string                             |
| `club_get_profile`              | Fetch a member profile by username                         |
| `club_get_my_profile`           | Fetch the authenticated user's profile (consent-gated)     |
| `club_list_spaces`              | List all spaces in the community                           |
| `club_list_courses`             | List all courses                                           |
| `club_get_feed`                 | Fetch a single feed by id                                  |
| `club_get_feed_comments`        | Fetch comments for a feed (paginated)                      |
| `club_get_user_comments`        | Fetch all comments by a given user                         |
| `club_get_recent_posts`         | Posts since a timestamp                                    |
| `club_get_recent_comments`      | Comments since a timestamp (fan-out per post)              |
| `club_get_since_summary`        | Combined recent posts + comments summary                   |
| `club_get_unread_notifications` | Authenticated user's unread notifications                  |
| `club_search_content`           | Search across members + posts + comments (fan-out)         |

See [docs/read-only-tools.md](https://github.com/ghul0/club-mcp/blob/main/docs/read-only-tools.md)
for the full tool contracts.

## Security

- 100% read-only. No write endpoints are reachable from this server (ADR-006);
  non-GET HTTP verbs are excluded both by lint and a runtime invariant test.
- Credentials live in your local environment only; no telemetry, no remote
  storage, no writes to disk.
- Logs go to stderr, never stdout (stdout is reserved for JSON-RPC).
  Authorization headers and credential keys are redacted via `redactKeys`
  from `@hhc-mcp/core`.
- All upstream responses are validated against Zod envelopes; unexpected
  shapes return a typed `AppError` rather than crashing.
- HTTPS-only upstream. `HHC_BASE_URL` must use `https://`; the REST client
  rejects `http://` base URLs at startup (no localhost exception).

## Architecture

- TypeScript strict mode, no runtime exceptions for expected errors —
  everything is `Result<T, AppError>` (see ADR-008).
- `@hhc-mcp/core` provides the framework-agnostic operations; `@hhc-mcp/stdio`
  wires them into the MCP stdio transport.
- Pure GET upstream; non-GET HTTP verbs are statically excluded via lint and a
  runtime invariant test.

## Design references

- [docs/adr/004-pnpm-monorepo-packages.md](https://github.com/ghul0/club-mcp/blob/main/docs/adr/004-pnpm-monorepo-packages.md)
  — package boundaries.
- [docs/adr/005-distribution-targets.md](https://github.com/ghul0/club-mcp/blob/main/docs/adr/005-distribution-targets.md)
  — stdio as primary distribution.
- [docs/adr/006-read-only-v1.md](https://github.com/ghul0/club-mcp/blob/main/docs/adr/006-read-only-v1.md)
  — read-only-only contract.
- [docs/adr/008-error-model.md](https://github.com/ghul0/club-mcp/blob/main/docs/adr/008-error-model.md)
  — `Result<T, AppError>` model.
- [docs/read-only-tools.md](https://github.com/ghul0/club-mcp/blob/main/docs/read-only-tools.md)
  — tool catalog.

## License

MIT — see [LICENSE](./LICENSE).
