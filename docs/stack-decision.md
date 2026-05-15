# Stack decision

Status: accepted

This document is mirrored as ADR-001 in `docs/adr/001-typescript-first.md`.

## Decision

The implementation stack for `club-mcp` is **TypeScript-first**.

```text
TypeScript strict
pnpm workspace
Zod at every data boundary
Vitest + MSW for tests and network mocking
official MCP TypeScript SDK
Hono or thin Node HTTP adapter for hosted HTTP transport
npx/npm for local stdio distribution
GHCR Docker image for hosted/self-hosted HTTP distribution
```

Python is **not** an implementation target for the MCP product. The existing Python `hhc.py` remains a behavior reference and test oracle only.

## Context

Reviewed internal standards:

- `/home/nixen/shared/skills/AI-Native_Stack_Reference_PL.md`
- `/home/nixen/shared/skills/typescript-development-guide-en.md`
- `/home/nixen/shared/skills/python311_guidelines_senior.md`

The AI-Native reference is authoritative for new application code: strict TypeScript is the default application language, with Zod contracts, strong tooling, and MCP as the integration standard. Python is allowed for ML/data/research/helper modules, but not as a parallel product stack here.

## Consequences

- Build shared REST/MCP logic in TypeScript.
- Port behavior from `hhc.py`; do not import or shell out to it in production MCP code.
- Use `hhc.py` for golden tests and behavioral comparison only.
- Use Zod schemas for tool inputs, tool outputs, and upstream REST response validation.
- Treat upstream REST JSON as `unknown` until validated.
- Use TypeScript strict compiler flags.
- Use Vitest for tests and MSW for network-level REST mocks.
- Use pnpm workspaces with separate packages.
- Use npm/npx package distribution for local stdio.
- Use Docker/GHCR for hosted and self-hosted remote.

## Package naming

Use consistent `hhc-*` package names:

```text
@hhc-mcp/core
@hhc-mcp/stdio
@hhc-mcp/http
```

The repository folder may remain `club-mcp`, but package names should use the `hhc-mcp` namespace/prefix.

## TypeScript coding rules that matter most here

- `strict: true` and additional strict flags.
- No `any` in domain/application code.
- External data starts as `unknown` and is validated with Zod.
- Tool inputs and outputs have explicit Zod schemas.
- No comments/JSDoc/TSDoc in source code.
- Functions over classes unless persistent state/resource adapter requirements justify a class.
- Expected errors use typed `Result` or another stable typed error shape.
- Structured logs with redaction; no `console.log` in production code.
- One public package entry point per package; no deep imports between packages.
- Vitest tests, MSW network mocks, and read-only invariant tests.

## Hosted HTTP stack

Hosted `@hhc-mcp/http` is a pure integration service, not a web app. Next.js is not required. Use Hono or a thin Node HTTP adapter around the MCP SDK because the AI-Native stack allows lean API services for specialized integration layers.

## Local stdio stack

Local `@hhc-mcp/stdio` is a Node CLI package distributed through npm/npx. It reads credentials from environment variables in MVP and OS keyring in phase 2.

## Python status

Python is not part of the production implementation plan.

Allowed Python usage:

- existing `~/.claude/skills/hyperhuman-club/scripts/hhc.py` as a behavior reference,
- golden-test oracle during TypeScript porting,
- one-off manual comparison during development.

Not allowed for production MCP code:

- importing `hhc.py`,
- shelling out to `hhc.py`,
- publishing a Python MCP package as the main implementation,
- maintaining parallel Python and TypeScript implementations.
