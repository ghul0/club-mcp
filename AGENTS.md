# AGENTS.md

## Project goal

Build read-only MCP access to Hyper Human Club / Fluent Community REST API.

## Authoritative decisions

Read before coding:

- `llms.txt`
- `docs/stack-decision.md`
- `docs/adr/001-typescript-first.md`
- `docs/adr/002-hosted-auth-oauth-resource-server.md`
- `docs/adr/003-hosted-credential-connect-flow.md`
- `docs/adr/004-pnpm-monorepo-packages.md`
- `docs/adr/005-distribution-targets.md`
- `docs/adr/006-read-only-v1.md`
- `docs/adr/007-base-url-policy.md`
- `docs/adr/008-error-model.md`

## Hard rules

- TypeScript only for production implementation.
- Python `hhc.py` is a behavior reference and golden-test oracle only.
- v1 is read-only.
- No generic REST proxy tool.
- No owner cookies or owner nonce in hosted mode.
- Upstream data is scoped to the authenticated WordPress account.
- Use Zod for all inputs, outputs, and upstream REST response validation.
- Treat upstream JSON as `unknown` until validated.
- Do not log secrets, credentials, raw callback query, posts, comments, profile bodies, or response payloads.
- Production TypeScript source must not contain comments/JSDoc/TSDoc.

## Package boundaries

- `@hhc-mcp/core`: GET-only REST/domain logic.
- `@hhc-mcp/stdio`: local stdio transport.
- `@hhc-mcp/http`: hosted/self-hosted HTTP transport.

Imports between packages must go through public `src/index.ts` entry points.

## Tool naming

All MCP tools use `club_*` names.

Allowed v1 tools are listed in `docs/read-only-tools.md`.
