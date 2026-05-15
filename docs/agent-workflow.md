# Agent workflow

The project is implemented entirely by AI agents. Six roles run through the `pi` CLI. Two roles use OpenAI Codex; the rest use Claude Opus.

## Roles and invocations

```
implementer  pi -p --model openai-codex/gpt-5.5:xhigh        --session impl-<ticket>
reviewer-a   pi -p --model openai-codex/gpt-5.5:xhigh        --session rev-a-<pr>
reviewer-b   pi -p --model claude-agent-sdk/claude-opus-4-7:xhigh  --session rev-b-<pr>
architect    pi -p --model claude-agent-sdk/claude-opus-4-7:xhigh  --session arch-<area>
planner      pi -p --model claude-agent-sdk/claude-opus-4-7:xhigh  --session plan-<sprint>
merger       pi -p --model claude-agent-sdk/claude-opus-4-7:xhigh  --session merge-bot
```

Sessions persist on disk. Implementer reuses the same `impl-<ticket>` session across all review rounds for one ticket. Every PR gets its own `rev-a-<pr>` and `rev-b-<pr>` session. No cross-ticket session reuse.

## Per-ticket flow

Per ADR-018, dual review runs locally as a pre-push Husky hook, not in GitHub Actions.

1. **Pick** — Planner moves the GitHub Issue from `Ready` to `In Progress`. Branch is created from `main` with the convention `<type>/<ticket-id>-<slug>` where `<type>` is `feat|fix|chore|docs|test|refactor|ci|build`.
2. **Spec read** — Implementer reads the AC plus every referenced ADR, then posts a test list to the draft PR body. No production code yet.
3. **Tests first (TDD red)** — Implementer commits only failing test files. Local `pnpm typecheck && pnpm lint && pnpm test` is expected to compile cleanly and report assertion failures only.
4. **Implement (TDD green)** — Implementer makes the failing tests pass. Local full gate must pass: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test -- --coverage && pnpm build`.
5. **Local dual review on push** — `git push` triggers `.husky/pre-push` → `scripts/local-review.ts`. It spawns two `pi` processes in parallel (Reviewer-A = `openai-codex/gpt-5.5`, Reviewer-B = `claude-agent-sdk/claude-opus-4-7`) against `git diff @{u}..HEAD`. Each emits `VERDICT: APPROVE | REQUEST_CHANGES`. The hook exits non-zero if either reviewer requests changes; the push is blocked.
6. **Fix loop** — On `REQUEST_CHANGES`, Implementer reads the reviewer output, fixes, commits, repeats `git push`. Cap is 3 rounds. After round 3, escalate to Architect (clarify AC, open ADR, or rebuild test list).
7. **Emergency override** — `SKIP_LOCAL_REVIEW=1 git push` bypasses the hook. The reason MUST be documented in the PR body. Reviewers/Operator can require a re-run before merge.
8. **PR open** — After successful push: `gh pr create -f` (or `--fill`) opens the PR. CI `verify` runs on the PR (typecheck, lint, test, build, coverage, gitleaks, audit).
9. **Merge** — When CI `verify` is green, squash-merge: `gh pr merge <n> --squash --delete-branch`. Branch protection requires only the `verify` status check (per ADR-018, no required AI approvals — local dual review already enforces correctness pre-push).

## Conventional commit format

```
<type>(<scope>): <subject>

<body>

Refs: <ticket-id>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `build`, `perf`, `revert` (enforced by `commitlint.config.js`). Allowed scopes: `core`, `stdio`, `http`, `deps`, `docs`, `ci`, `build`, `repo`, `scripts`, `adr` (enforced by `commitlint.config.js`).

## TDD discipline

- First commit on a feature branch contains only test files or scaffolding.
- Production code commits do not introduce untested branches.
- Coverage thresholds are configured in `vitest.config.ts` and enforced by CI.

## Authority

- ADRs are authoritative. Any reviewer can block a PR on a deviation.
- Adding or superseding an ADR is restricted to the Architect role and follows ADR-017.
- Tool surface is restricted to `docs/read-only-tools.md`. Adding or renaming a tool requires an ADR.

## Fallback models

If a model tier is throttled or deprecated:

- Implementer fallback: `openai-codex/gpt-5.5:high`.
- Reviewer-A fallback: `openai-codex/gpt-5.5:high`.
- Reviewer-B fallback: `claude-agent-sdk/claude-opus-4-7:high`.
- Architect fallback: `claude-agent-sdk/claude-opus-4-7:high`.

The fallback used must be noted in the PR body.

## Session hygiene

- One `impl-<ticket>` per ticket; resume across review rounds.
- One `rev-a-<pr>` and one `rev-b-<pr>` per PR; reused across review rounds.
- Sessions are archived after merge; never resumed for a new ticket.
- Architect sessions are scoped per area (`arch-adr`, `arch-spec-<ticket>`).

## When a reviewer blocks

Reviewer comments must cite either an ADR section or an acceptance criterion line. Preference-based blocks are out of scope. If a reviewer cannot anchor the block, the Implementer escalates to Architect for clarification.
