# ADR-011: Hosted credential storage

Status: accepted

## Context

Hosted public mode must store per-user WordPress Application Passwords because public remote MCP clients do not reliably send arbitrary upstream credentials per request. Storage must be minimal and encrypted.

## Decision

Use PostgreSQL plus application-level envelope encryption for hosted public credential storage.

Store only:

- MCP subject identifier,
- WordPress site URL,
- WordPress user login,
- encrypted application password payload,
- key/version metadata,
- created/updated/last-used timestamps,
- revoked/disconnected state.

Encryption:

- use envelope encryption,
- use AES-256-GCM or XChaCha20-Poly1305,
- generate per-record data encryption keys where practical,
- keep key-encryption key outside the database,
- load key material from Docker secret, secret manager, Vault, 1Password, or equivalent.

For simple single-server MVP, a 32-byte master key from a Docker secret or environment secret is acceptable if rotation and backup implications are documented.

## Consequences

- No club content is stored.
- Credential storage requires migrations, backup policy, and key rotation plan.
- Keycloak and `@hhc-mcp/http` may share PostgreSQL infrastructure but should use separate databases or schemas.
