# Contributing

## Standards

Follow the project standards bundled in this repository:

- `AGENTS.md`
- `llms.txt`
- `docs/stack-decision.md`
- `docs/adr/`
- `docs/security-checklist.md`
- `docs/best-practices.md`

The project was derived from internal TypeScript-first AI-native standards. The effective rules are captured in the files above so contributors do not need access to private owner paths.

## TypeScript rules

- Strict TypeScript.
- Zod at every data boundary.
- No `any` in domain/application code.
- External REST data starts as `unknown`.
- No comments, JSDoc, or TSDoc in production TypeScript source or repo-owned JavaScript config.
- Functions over classes unless framework/resource lifetime requires a class.
- Expected errors use typed Result-style errors.
- Vitest for tests.
- MSW for upstream REST mocks.

## Security rules

- Do not commit secrets.
- Do not log credentials or content payloads.
- Do not add write tools to v1.
- Do not add arbitrary REST proxy behavior.
- Do not use owner cookies or owner nonce in hosted mode.

## Quality gates

Before merging implementation changes, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
