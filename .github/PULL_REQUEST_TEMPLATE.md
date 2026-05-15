## Ticket

<!-- e.g. P0-04, T1-15. Link the GitHub Issue. -->

Closes #

## ADRs touched or referenced

<!-- e.g. ADR-004, ADR-008. Mark NEW if this PR introduces one. -->

## Test list (TDD)

<!-- Test cases written BEFORE production code. Check each that is implemented. -->

- [ ] 
- [ ] 

## Reviewer A (codex) checklist

- [ ] Tests committed before production code (TDD red commit present in history)
- [ ] Zod schemas at every external and tool boundary
- [ ] No `any` in domain or application code
- [ ] No comments in TypeScript source
- [ ] ADR-006, ADR-007, ADR-008, ADR-016 conformance verified
- [ ] Coverage thresholds met
- [ ] Read-only invariant tests unaffected

## Reviewer B (claude-opus) checklist

- [ ] No secret, credential, or upstream payload appears in code, tests, fixtures, or logs
- [ ] Error envelope (ADR-016) used for expected failures
- [ ] Package boundaries (ADR-004) respected; no deep cross-package imports
- [ ] KISS over SOLID; any complexity is justified by the spec
- [ ] Tool names align with `docs/read-only-tools.md` allowlist
- [ ] Logs redact per `AGENTS.md`

## How to verify

<!-- Concrete commands and expected outcomes. -->
