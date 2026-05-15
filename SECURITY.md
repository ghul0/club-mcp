# Security policy

## Supported versions

This project is in design/MVP stage. No production-supported version exists yet.

## Reporting vulnerabilities

Report security issues privately to the project owner. Do not open a public issue containing secrets, credentials, tokens, payloads, or exploit details.

## Security baseline

- v1 is read-only.
- No owner cookies or owner nonce in hosted mode.
- No generic REST proxy tool.
- Per-user upstream WordPress Application Passwords only.
- Hosted public mode encrypts stored upstream credentials.
- No posts, comments, profile bodies, or search results are persisted by default.
- Logs must redact credentials, tokens, cookies, nonces, callback query params, and content payloads.

## Revocation

Users can revoke WordPress Application Passwords in WordPress user profile settings. Hosted mode must also provide a disconnect flow before production release.
