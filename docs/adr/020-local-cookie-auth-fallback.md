# ADR-020: Local stdio cookie+nonce auth fallback

Status: accepted

Modifies: [ADR-019](019-hosted-auth-basic-pass-through.md), [ADR-004](004-pnpm-monorepo-packages.md)

## Context

`@hhc-mcp/stdio` authenticated only via a WordPress Application Password (`HHC_USER` + `HHC_APP_PASS`, HTTP Basic). On `club.hyperhuman.pl` the Application Passwords feature is not guaranteed to be enabled: behind some security plugins and Cloudflare configurations it is disabled or rejected, in which case Basic auth returns `401` and the server is unusable.

The same operator already runs the `hhc` CLI, which authenticates with a WordPress session cookie (`wordpress_logged_in_*`) plus an `X-WP-Nonce` header and keeps both fresh in `~/.config/hyperhuman-club/auth.json`. WordPress cookie authentication requires a valid nonce on every request including reads, and the nonce expires (~12h), so a durable cookie mode needs a refresh path. The `hhc` CLI already solves this: on `401/403` it re-fetches the site root HTML and parses the nonce out of `fluentComAdmin.rest.nonce`.

We want the stdio server to work today via the cookie the operator already has, and to use the Application Password automatically once that feature is enabled and credentials are supplied — without a second auth implementation drifting from the proven one.

## Decision

`@hhc-mcp/stdio` supports two local auth methods selected by credential presence, with Application Password preferred.

1. `HHC_AUTH_MODE` (`auto` default | `basic` | `cookie`). In `auto`: if `HHC_USER` + `HHC_APP_PASS` resolve, use Basic; otherwise, if a cookie resolves, use cookie+nonce; otherwise fail at startup with a clear message.
2. Credentials resolve with environment precedence over the auth file: `HHC_USER`/`HHC_APP_PASS`, `HHC_COOKIE`, `HHC_WP_NONCE` (alias `HHC_NONCE`) override the matching fields in the file named by `HHC_AUTH_FILE`. Pointing `HHC_AUTH_FILE` at the `hhc` CLI's `~/.config/hyperhuman-club/auth.json` shares one source of truth.
3. Cookie mode sends `Cookie` + `X-WP-Nonce`. On `401/403` it refreshes once per request: GET the site root with the cookie, parse the nonce (`fluentComAdmin` scope first, then a generic `"nonce":"…"` match), persist it back to the auth file (updating only `nonce` + `nonce_refreshed_at`, never clobbering `cookie`/`user`/`app_pass`), and retry the original request once. The refresh retry does not consume the transient (`429`/`5xx`) retry budget.
4. The refresh fetch has a timeout and logs neither HTML nor headers. A failed refresh surfaces the original `401/403`; it never crashes the server.
5. Per ADR-004, `@hhc-mcp/core` owns only the transport contract: the `AuthProvider` interface (`headers()` + optional `onUnauthorized()`) and its use inside the HTTP client. All "local auth acquisition" — the file store, the nonce refresh, the cookie provider, and mode selection — lives in `@hhc-mcp/stdio`.

## Consequences

- The read-only invariant (ADR-006) is unchanged and intact: the core client is still GET-only (`method: 'GET'` hardcoded, `redirect: 'manual'`, enforced by `readonly-invariant.test.ts`). A valid nonce cannot perform writes through this client.
- ADR-019 scoped the MVP to Basic-only; this ADR adds cookie+nonce strictly for the local stdio transport. The hosted `@hhc-mcp/http` Basic Auth pass-through model is untouched.
- ADR-004's "stdio contains only local stdio transport and local auth acquisition" is honored: core gains one auth type and zero new runtime factories; the cookie provider and file store ship in stdio.
- `HHC_USER`/`HHC_APP_PASS` become optional; `loadStdioConfig` validates only `HHC_BASE_URL`, and a new `resolveAuth` performs credential resolution and mode selection.
- Cookies carried in the cookie string (including `cf_clearance`) ride along to the upstream as-is; if Cloudflare challenges the site-root refresh, the refresh fails and the call returns its original auth error.
- Trade-off accepted: cookie mode depends on a refreshable nonce and a session cookie that the operator must supply (typically via the shared `hhc` auth file); this is more moving parts than Basic, justified by working when Application Passwords is unavailable.
- The auth-file write is atomic per writer (unique temp name + `rename`, cleanup on failure, symlinks resolved so a shared target is written through, unknown fields preserved). It does NOT take a cross-process lock. When the file is shared with the `hhc` CLI, a simultaneous nonce refresh from both writers is last-writer-wins on the `nonce`/`nonce_refreshed_at` fields only; the window is ~12h-rare and self-heals on the next refresh. Cross-process file locking is intentionally not added (it would pull in a non-stdlib dependency for a benign, self-correcting race).

## References

- ADR-004 (workspace packages), ADR-006 (read-only v1), ADR-007 (base URL policy), ADR-019 (hosted Basic Auth pass-through)
- `hhc` CLI cookie+nonce reference: `~/.claude/skills/hyperhuman-club/scripts/hhc.py` (`_headers`, `refresh_nonce`)
- `packages/stdio/src/auth.ts`, `packages/stdio/src/auth-file.ts`, `packages/core/src/http/client.ts`
