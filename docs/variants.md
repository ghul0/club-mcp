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
- no credential storage,
- per-user WordPress Application Password presented on every request, held only in memory.

### Auth

Hosted public mode uses HTTP Basic Auth pass-through (see [ADR-019](adr/019-hosted-auth-basic-pass-through.md) and `docs/hosted-auth.md`):

- every `/mcp` request carries `Authorization: Basic base64(wp_user:wp_app_pass)`,
- the header is decoded in memory only and never persisted,
- the same header is forwarded 1:1 to upstream `club.hyperhuman.pl`,
- no OAuth authorization server, no `/connect` flow, no Protected Resource Metadata.

Edge/origin protection:

- Cloudflare Tunnel publishes the origin; TLS terminates at Cloudflare,
- Cloudflare WAF + per-IP throttle in front of `/mcp`,
- Cloudflare Access optional for private/self-hosted gating.

Upstream club auth:

- per-user WordPress Application Password from the same `Authorization` header, forwarded directly.

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

1. Build `@hhc-mcp/core`. (shipped in v0.0.x)
2. Build local `@hhc-mcp/stdio`. (shipped in v0.0.x)
3. Add keyring support. (v0.1.0)
4. Build hosted `@hhc-mcp/http` with Basic Auth pass-through. (v0.2.0, per ADR-019)
5. First hosted deployment behind Cloudflare Tunnel. (v0.3.0)
6. Add self-hosted remote docs/examples. (v0.3.0+, see `docs/self-hosted-remote.md`)

Steps 5 ("public hosted OAuth") and 6 ("encrypted WordPress connect flow") from the original plan are removed per ADR-019. ChatGPT Custom Connector support — the only feature that would require OAuth — is parked until a separate ADR commits to building an OAuth façade.
