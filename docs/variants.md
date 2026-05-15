# Deployment variants

`club-mcp` has three deployment variants built from one TypeScript pnpm workspace.

## Variant A — local stdio MCP, recommended default

```text
MCP client
  -> local @hhc-mcp/stdio process
  -> @hhc-mcp/core
  -> club.hyperhuman.pl REST API
```

### Privacy profile

This is the strongest privacy option.

- Your hosted infrastructure is not in the data path.
- Your server does not see club posts, comments, profiles, or credentials.
- Credentials stay on the user's machine.
- The model never sees credentials, including in error messages.
- The local MCP host and local process can technically access credentials because they run on the user's machine.

### Auth

Primary MVP:

```text
HHC_USER + HHC_APP_PASS
```

Phase 2:

```text
OS keyring via hhc-mcp login
```

Fallback only if explicitly enabled:

```text
HHC_COOKIE + HHC_WP_NONCE
~/.config/hyperhuman-club/auth.json
```

Cookies + nonce are less stable because nonce expires and may require refresh from HTML.

### Config example

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

### Keyring UX

```bash
npx @hhc-mcp/stdio login
npx @hhc-mcp/stdio auth status
npx @hhc-mcp/stdio logout
```

`login` prompts for base URL, username, and hidden Application Password. It validates credentials before storing and never prints the secret.

## Variant B — hosted public MCP by us

```text
MCP client
  -> OAuth-protected remote Streamable HTTP MCP endpoint
  -> @hhc-mcp/http
  -> encrypted per-user WordPress credential
  -> @hhc-mcp/core
  -> club.hyperhuman.pl REST API
```

### Privacy profile

Hosted public mode cannot be zero-processing. The hosted server receives upstream REST responses in memory and returns MCP results.

It should still be no-content-storage:

- no posts/comments/profile body cache,
- no body logs,
- no owner credentials,
- no shared bot account,
- encrypted per-user WordPress Application Password only,
- minimal metadata logs.

### Auth

MCP-layer auth:

- OAuth 2.1 protected resource server,
- Protected Resource Metadata,
- bearer token validation on every request,
- audience/resource validation,
- least-privilege scopes.

Edge/origin protection:

- Cloudflare Tunnel recommended,
- Cloudflare Access optional for private gating, not a substitute for public MCP OAuth.

Upstream club auth:

- encrypted per-user WordPress Application Password from connect flow.

## Variant C — self-hosted remote

```text
Third-party operator
  -> deploys GHCR Docker image
  -> configures auth and base URL
  -> users connect to operator's endpoint
```

Self-hosted remote is for users/organizations that want a remote MCP but do not want our hosted server to process data.

Supported modes:

- OAuth public mode,
- Cloudflare Access private mode,
- nginx/Traefik with OIDC/JWT,
- stateless upstream credential headers for trusted private clients.

See `docs/self-hosted-remote.md`.

## Shared package layout

```text
@hhc-mcp/core
  shared GET-only REST/domain logic

@hhc-mcp/stdio
  local stdio transport

@hhc-mcp/http
  hosted/self-hosted HTTP transport
```

## Shared read-only tools

Tool names are consistent across variants:

```text
club_search_members
club_get_profile
club_get_my_profile
club_list_spaces
club_get_feed
club_get_feed_comments
club_get_user_comments
club_get_recent_posts
club_get_recent_comments
club_get_since_summary
club_list_courses
club_get_unread_notifications
```

All results are scoped to what the authenticated upstream WordPress/Fluent Community account can see.

## Forbidden v1 tools

```text
club_comment_add
club_post_add
club_comment_edit
club_delete_*
club_react_*
club_join_space
club_update_profile
```

## Build order

1. Build `@hhc-mcp/core`.
2. Build local `@hhc-mcp/stdio`.
3. Add keyring support.
4. Build hosted/self-hosted `@hhc-mcp/http` skeleton.
5. Add public hosted OAuth.
6. Add encrypted WordPress connect flow.
7. Add self-hosted remote docs/examples.

This preserves the privacy-first local path while still enabling hosted and self-hosted remote variants.
