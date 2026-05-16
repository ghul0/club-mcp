# ADR-014: Key management for hosted credentials

Status: superseded by [ADR-019](019-hosted-auth-basic-pass-through.md)

## Context

ADR-011 selects PostgreSQL plus application-level envelope encryption. The key-encryption key must live outside PostgreSQL.

## Decision

For MVP, use Docker secrets or 1Password/Doppler as the key source. For production with broader usage, prefer Vault or cloud KMS if available.

The application reads a key reference from `HHC_ENCRYPTION_KEY_REF` and resolves it through the configured secret provider.

## Consequences

- The raw key is never stored in PostgreSQL.
- Backups of PostgreSQL alone do not expose app passwords.
- Key rotation must be documented before production launch.
- Docker Compose examples use Docker secrets by default.
