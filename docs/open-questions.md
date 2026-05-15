# Open questions before implementation

All currently identified architecture-level choices are resolved in `docs/adr/`.

## Resolved

- Local target: Claude Desktop first, then Claude Code/Pi, with MCP Inspector for debugging.
- Hosted public target: MCP Inspector, Claude Custom Connector, and ChatGPT remote connector.
- Hosted OAuth provider: Keycloak first.
- Hosted credential storage: PostgreSQL plus application-level envelope encryption.
- License: MIT.
- Package layout: pnpm workspace with `@hhc-mcp/core`, `@hhc-mcp/stdio`, `@hhc-mcp/http`.
- Distribution: npx/npm for local stdio, Docker/GHCR for HTTP.
- First hosted deployment platform: VPS + Docker Compose + Cloudflare Tunnel.
- Key management MVP: Docker secrets or 1Password/Doppler; production may use Vault/cloud KMS.
- Initial hosted rate limits: see ADR-015.
- MCP tool error envelope: see ADR-016.

## Revisit later

- Whether to support another hosted OAuth provider after Keycloak.
- Whether to publish the npm packages under a personal scope or organization scope.
- Whether to add a managed hosted tier beyond self-hosted Docker.
