# ADR-007: Base URL policy

Status: accepted

## Context

Docs previously mixed “hardcoded base URL” with `HHC_BASE_URL` configuration. The tool is primarily for `club.hyperhuman.pl`, but local and self-hosted operators may need explicit configuration.

## Decision

Use a parameterized base URL with a safe default.

Default:

```text
https://club.hyperhuman.pl
```

Local stdio:

- `HHC_BASE_URL` may override the default.
- Override must be HTTPS.

Hosted public by us:

- allowed base URL is fixed to `https://club.hyperhuman.pl` unless the operator explicitly enables a configured allowlist.

Self-hosted remote:

- operator may configure `HHC_BASE_URL` and `HHC_ALLOWED_BASE_URLS`.

## Consequences

- No arbitrary URL tool input.
- REST client validates base URL at startup.
- Redirects to other hosts are rejected.
