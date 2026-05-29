# Local mode — Claude Desktop integration

This guide explains how to run `@hhc-mcp/stdio` locally and connect Claude
Desktop to it. The server is read-only and never leaves your machine.

## Prerequisites

- Node.js 22+ and `pnpm` (or `npm`).
- A WordPress account on your Hyper Human Club instance, authenticated by
  either a WordPress Application Password (sections 1 and 3 below) or a
  session cookie + nonce (section 3b). Application Passwords is preferred
  but not required — use cookie auth when the feature is disabled at the club.
- Claude Desktop installed (macOS / Windows / Linux).

## 1. Generate a WordPress Application Password

1. Log in to your WordPress admin (`https://<your-club>/wp-admin/profile.php`).
2. Scroll to "Application Passwords".
3. Enter a name (e.g. "Claude Desktop") and click "Add New".
4. Copy the generated password — it looks like `xxxx xxxx xxxx xxxx xxxx xxxx`.
   You will not see it again.

## 2. Install `@hhc-mcp/stdio`

Either install globally:

```bash
npm install -g @hhc-mcp/stdio
```

Or use `npx` directly in the Claude Desktop config below — no install step
required.

## 3. Configure Claude Desktop

Open Claude Desktop's MCP config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "hyper-human-club": {
      "command": "npx",
      "args": ["-y", "@hhc-mcp/stdio"],
      "env": {
        "HHC_BASE_URL": "https://your-club.example.com",
        "HHC_USER": "your-wordpress-username",
        "HHC_APP_PASS": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

Replace the three env values with your actual base URL, WP username, and the
App Password from step 1.

Notes:

- `HHC_BASE_URL` is the bare site root of your WordPress install (e.g.
  `https://club.hyperhuman.pl`). The client automatically appends the Fluent
  Community API path (`/wp-json/fluent-community/v2`) to every request.
- `HHC_BASE_URL` is required and has no default, even though ADR-007 names
  `https://club.hyperhuman.pl` as the canonical target. The local stdio mode
  prefers explicit > implicit to prevent accidental traffic to the wrong club
  when the variable is unset or misspelled; multi-tenant operators must opt in
  per deployment.
- HTTPS is mandatory. HTTP base URLs are rejected on startup.
- A trailing slash on the base URL is tolerated but not required.

## 3b. Cookie auth (when Application Passwords is unavailable)

If the club has WordPress Application Passwords disabled, the server can
authenticate with a session cookie + nonce instead. Set `HHC_AUTH_MODE` to
`auto` (the default) or `cookie`. In `auto`, the server uses the Application
Password when `HHC_USER` + `HHC_APP_PASS` are present and falls back to cookie
auth otherwise.

WordPress cookie auth requires an `X-WP-Nonce` that expires (~12h). When a
cookie is present, the server refreshes the nonce automatically on a `401/403`
and persists the new value if an auth file is configured. The simplest setup
reuses the `hhc` CLI's credential file, which already keeps a fresh
cookie + nonce:

```json
{
  "mcpServers": {
    "hyperhuman-club": {
      "command": "npx",
      "args": ["-y", "@hhc-mcp/stdio"],
      "env": {
        "HHC_BASE_URL": "https://club.hyperhuman.pl",
        "HHC_AUTH_MODE": "auto",
        "HHC_AUTH_FILE": "/home/you/.config/hyperhuman-club/auth.json"
      }
    }
  }
}
```

Alternatively pass the cookie inline with `HHC_COOKIE` and `HHC_WP_NONCE`
(env vars override the auth file). Without an auth file, a refreshed nonce is
held in memory for the process lifetime only. Once Application Passwords gets
enabled, add `HHC_USER` + `HHC_APP_PASS` and `auto` switches to Basic. See
`docs/adr/020-local-cookie-auth-fallback.md`.

## 4. Restart Claude Desktop

Quit and reopen Claude Desktop. The `hyper-human-club` server should appear in
the MCP tools list (the hammer icon in the conversation input). You should see
13 read-only tools available:

- `club_search_members`
- `club_get_profile`
- `club_get_my_profile`
- `club_list_spaces`
- `club_list_courses`
- `club_get_feed`
- `club_get_feed_comments`
- `club_get_user_comments`
- `club_get_recent_posts`
- `club_get_recent_comments`
- `club_get_since_summary`
- `club_get_unread_notifications`
- `club_search_content`

## 5. Try a tool

In Claude Desktop, ask: "Search the club for members named alice" — Claude
should invoke `club_search_members` and return the results.

## Security notes

- All tools are READ-ONLY (see `docs/adr/006-read-only-v1.md`). No data ever
  leaves your machine via this server.
- The HHC App Password is stored only in your local Claude Desktop config
  file. Treat that file as a secret.
- The server logs to stderr only (stdout is reserved for JSON-RPC). Logs are
  passed through `redactKeys` from `@hhc-mcp/core`, so authorization headers
  and credential fields are redacted before they hit your terminal or log
  file.

## Troubleshooting

- "Cannot find module" → run `npm install -g @hhc-mcp/stdio` first, or keep
  the `npx -y @hhc-mcp/stdio` form so the package is fetched on demand.
- 401 Unauthorized → your App Password is wrong, expired, or your WP user
  lacks read permission on Fluent Community endpoints.
- "HHC_BASE_URL is not a valid URL" / "baseUrl must use https" → check the
  base URL format: HTTPS only, site root domain (no `/wp-json/...` suffix);
  the client appends the Fluent Community API path for you.
- No tools appear in Claude Desktop → confirm the JSON file is valid (no
  trailing commas), then fully quit and relaunch Claude Desktop. The MCP
  server is spawned at startup only.

## See also

- `packages/stdio/README.md` — package overview and env var reference.
- `docs/read-only-tools.md` — full tool catalog with input/output schemas.
- `docs/adr/005-distribution-targets.md` — why stdio is the primary local
  distribution target.
- `docs/adr/006-read-only-v1.md` — read-only contract.
