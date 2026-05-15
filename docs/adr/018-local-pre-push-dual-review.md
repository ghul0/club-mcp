# ADR-018: Local pre-push dual review

Status: accepted

## Context

ADR-002 and the earlier P0-19 design assumed dual AI review runs on GitHub Actions as two GitHub Apps (`rev-a-bot`, `rev-b-bot`). That model requires:

- Two GitHub Apps with private keys stored as repository secrets.
- Upstream model API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN`) stored as repository secrets.
- A runner (GitHub-hosted or self-hosted) with `pi` installed at every PR event.

The operator already runs `pi` locally with their own credentials (Claude/OpenAI subscriptions configured in the local environment). Pushing the review step into GitHub Actions duplicates auth infrastructure for no gain when the operator is the sole human contributor and all production code is written by AI agents driven from the same local environment.

## Decision

Dual AI review runs locally as a Husky `pre-push` hook, not in GitHub Actions.

Flow:

1. AI agent (Implementer) commits on a feature branch.
2. `git push` triggers `.husky/pre-push`.
3. `pre-push` runs `scripts/local-review.ts`, which:
   - resolves the diff against `@{u}` (upstream tracking branch) or `origin/main` as fallback;
   - writes the diff to a temp file;
   - spawns two `pi -p` processes in parallel — Reviewer-A (`openai-codex/gpt-5.5`) and Reviewer-B (`claude-agent-sdk/claude-opus-4-7`) — each receiving the diff as an `@file` attachment and a role-specific focus prompt;
   - parses each output for a `VERDICT: APPROVE | REQUEST_CHANGES` line;
   - prints both reviews to stderr;
   - exits non-zero if either reviewer requests changes, blocking the push.
4. After both `APPROVE`, the push proceeds.
5. CI on GitHub still runs `verify` (typecheck, lint, test, build, gitleaks, coverage). Branch protection enforces `verify` green before merge.
6. PR review by humans remains optional. AI bot reviews from `rev-a-bot`/`rev-b-bot` GitHub Apps remain available as a fallback but are not the default workflow.

Emergency override: `SKIP_LOCAL_REVIEW=1 git push` bypasses the hook. The reason must be documented in the PR body.

## Consequences

- No upstream model API keys are stored in GitHub Actions secrets.
- No `dual-review.yml` workflow runs on push events.
- `OPENAI_API_KEY` / `ANTHROPIC_OAUTH_TOKEN` need only exist in the operator's local environment, where `pi` already reads them.
- The two GitHub Apps registered under P0-18 stay registered as a future fallback but contribute no required approvals to branch protection.
- Branch protection (ADR pending, P0-10) requires only the `verify` status check and no AI approvals.
- A dishonest or compromised local environment can bypass review with `SKIP_LOCAL_REVIEW=1`. This is acceptable because the operator is the only human with push access, the override leaves a documented PR-body trail, and CI `verify` still enforces correctness invariants.
- The fix-loop semantics (round cap = 3, escalate to Architect) from `docs/agent-workflow.md` shift from GitHub PR comments to local terminal output and Implementer-session prompts.

## References

- `docs/agent-workflow.md`
- `docs/adr/002-hosted-auth-oauth-resource-server.md` (constrains hosted MCP, not contributor workflow)
- `scripts/local-review.ts`
- `.husky/pre-push`
