# Self-hosted remote MCP

Self-hosted remote is the third distribution variant: an operator runs the HTTP MCP server on their own infrastructure. This avoids sending club data through our hosted service while still giving users a remote MCP endpoint.

## When to choose this

Choose self-hosted remote when:

- users cannot run local stdio MCP,
- the organization does not want our hosted server to process data,
- the operator can manage auth, secrets, and updates,
- a remote connector URL is required.

## Distribution

Use the same Docker image as hosted HTTP:

```text
ghcr.io/<owner>/hhc-mcp-http:<version>
```

Package inside the image:

```text
@hhc-mcp/http
```

## Auth modes

### Mode A — OAuth public mode

Best for public remote clients.

Operator provides or configures:

- OAuth authorization server,
- Protected Resource Metadata,
- bearer token validation,
- audience/resource validation,
- encrypted WordPress Application Password connect flow.

### Mode B — Cloudflare Access private mode

Best for a private team behind Cloudflare.

- Cloudflare Tunnel hides the origin.
- Cloudflare Access protects `/mcp` and connect endpoints.
- Origin validates `Cf-Access-Jwt-Assertion`.
- This may not satisfy public Claude/ChatGPT remote connector OAuth expectations.

### Mode C — reverse proxy OIDC/JWT

Best when the operator already has an IdP.

Examples:

- nginx + oauth2-proxy,
- Traefik ForwardAuth,
- Authelia,
- Keycloak gatekeeper-style proxy.

The origin should receive a validated identity header or JWT and must verify it according to the chosen mode.

### Mode D — stateless upstream credential headers

Only for trusted/private clients.

Client sends upstream credential headers to the self-hosted MCP endpoint over HTTPS. The server does not store credentials.

This mode is not recommended for public hosted connectors because common MCP clients do not reliably support arbitrary per-user upstream credential headers.

## Environment variables

```bash
HHC_BASE_URL=https://club.hyperhuman.pl
HHC_ALLOWED_BASE_URLS=https://club.hyperhuman.pl
HHC_READ_ONLY=true
HHC_AUTH_MODE=oauth
HHC_ENCRYPTION_KEY_REF=...
HHC_LOG_LEVEL=info
HHC_RATE_LIMIT_PER_MINUTE=60
```

For Cloudflare private mode:

```bash
HHC_AUTH_MODE=cloudflare_access
CLOUDFLARE_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
CLOUDFLARE_POLICY_AUD=<aud>
```

For stateless private header mode:

```bash
HHC_AUTH_MODE=private_headers
```

## Docker Compose sketch

```yaml
services:
  hhc-mcp-http:
    image: ghcr.io/example/hhc-mcp-http:latest
    restart: unless-stopped
    environment:
      HHC_BASE_URL: https://club.hyperhuman.pl
      HHC_ALLOWED_BASE_URLS: https://club.hyperhuman.pl
      HHC_READ_ONLY: "true"
      HHC_AUTH_MODE: cloudflare_access
    ports:
      - "127.0.0.1:3333:3333"
```

## Reverse proxy notes

- Preserve streaming/SSE behavior for Streamable HTTP.
- Disable buffering for `/mcp` if it breaks streaming.
- Enforce HTTPS.
- Set request body limits.
- Preserve `Authorization` header.
- Do not log query strings on connect/callback endpoints.

## Cloudflare WAF notes

Cloudflare WAF is not the same as Cloudflare Access. WAF can block or mutate unusual long-lived/streaming requests if rules are too aggressive.

Test:

- MCP initialize,
- tools/list,
- tools/call with longer response,
- SSE/streaming behavior if used,
- WordPress connect callback.

## Cost notes

Cloudflare Access plan limits and pricing can affect teams. Verify current Cloudflare terms before recommending it as the default for a larger organization.

## Operator responsibilities

The self-host operator is responsible for:

- TLS/domain,
- auth provider configuration,
- credential encryption if using connect flow,
- backups of credential metadata if needed,
- revocation/disconnect process,
- rate limits,
- logs and telemetry redaction,
- updates and CVE patching,
- ensuring no club content is persisted unless they explicitly change defaults.
