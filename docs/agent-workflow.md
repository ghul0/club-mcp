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

1. **Pick** — Planner moves the GitHub Issue from `Ready` to `In Progress`. Branch is created from `main` with the convention `<type>/<ticket-id>-<slug>` where `<type>` is `feat|fix|chore|docs|test|refactor|ci|build`.
2. **Spec read** — Implementer reads the AC plus every referenced ADR, then posts a test list to the draft PR body. No production code yet.
3. **Tests first (TDD red)** — Implementer commits only failing test files. Local `pnpm typecheck && pnpm lint && pnpm test` is expected to compile cleanly and report assertion failures only.
4. **Implement (TDD green)** — Implementer makes the failing tests pass. Local full gate must pass: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test -- --coverage && pnpm build`.
5. **Mark ready** — PR moved out of draft.
6. **Dual review** — `dual-review.yml` workflow fans out reviewer-a and reviewer-b in parallel. Each posts `APPROVE` or `REQUEST_CHANGES` with line-anchored comments via the corresponding GitHub App bot identity.
7. **Fix loop** — On `REQUEST_CHANGES`, Implementer resumes the same `impl-<ticket>` session and pushes fixup commits. Commit subject prefix is `fix(review-a): ...` or `fix(review-b): ...`. Cap is 3 rounds.
8. **Escalation** — If round 4 is reached, the merger workflow opens a comment that auto-assigns Architect to clarify the AC or open an ADR PR. The ticket is paused until Architect resolves.
9. **Merge** — Merger squash-merges only when: both bots APPROVED on the latest SHA, all required CI checks green, no `do-not-merge` label, no merge conflicts. Branch is deleted; the GitHub Issue is moved to `Done`.

## Conventional commit format

```
<type>(<scope>): <subject>

<body>

Refs: <ticket-id>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `build`. Allowed scopes: `core`, `stdio`, `http`, `deps`, `docs`, `ci`, `build`, `repo`.

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
