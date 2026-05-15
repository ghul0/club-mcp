# ADR-001: TypeScript-first implementation

Status: accepted

## Context

Internal standards define strict TypeScript as the default application language. Python is allowed for ML/data/research/helper modules, but not as a parallel product stack for new applications. The existing Hyper Human Club CLI is Python and is valuable as behavior reference, but reusing it directly would create a two-stack product.

## Decision

Implement `club-mcp` in TypeScript.

Use:

- strict TypeScript,
- pnpm workspace,
- Zod for every data boundary,
- official MCP TypeScript SDK,
- Vitest and MSW for tests,
- Hono or thin Node HTTP adapter for hosted Streamable HTTP,
- npm/npx distribution for local stdio,
- Docker/GHCR distribution for hosted/self-hosted HTTP.

The existing Python `hhc.py` is a test oracle and behavior reference only.

## Consequences

- REST behavior must be ported to TypeScript.
- Upstream REST JSON starts as `unknown` and is validated with Zod.
- No production MCP code imports or shells out to Python.
- The first implementation takes longer than a Python wrapper but yields a single maintainable stack.
