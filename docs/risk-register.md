# Risk register

Tracks operational risks for the AI-only implementation workflow. Likelihood and Impact are coarse three-level scales: L = Low, M = Medium, H = High; Impact C = Critical (extends H).

| # | Risk | L | I | Mitigation | Trigger | Owner |
|---|---|---|---|---|---|---|
| R1 | AI misinterprets an ADR (e.g., adds a write tool against ADR-006). | H | H | Reviewer-B has ADR conformance as primary axis. CODEOWNERS forces ADR review. ESLint custom rule will block tool names outside the `docs/read-only-tools.md` allowlist (planned in Phase 1). | Tool registered with a non-allowlisted name; production REST client invoked with non-GET method. | Architect |
| R2 | Infinite review ping-pong between Reviewer-A and Reviewer-B. | M | M | Fix-loop cap of 3 rounds. Round 4 escalates to Architect. Reviewers must cite an ADR or AC line; preference-based blocks are out of scope. | A PR enters its fourth review round. | Architect |
| R3 | Secret leak in a commit (credentials in fixtures, `.env`). | M | C | Pre-commit gitleaks and CI gitleaks. `.env*` already in `.gitignore`. Reviewer-B has secret detection as a primary axis. | Gitleaks finding on any branch; secret-like string in PR diff. | Implementer |
| R4 | MCP spec drift: server stops matching client expectations. | M | H | MCP schema contract test (P0-07) pinned to the `@modelcontextprotocol/sdk` version. Dependabot SDK PRs auto-reviewed by both bots. | Contract test fails in CI; client connect fails after SDK bump. | Test-Runner |
| R5 | Reviewer model drift: `xhigh` tier deprecated or throttled. | L | H | Fallback models documented in `docs/agent-workflow.md`. Sessions are content-addressable, so swap is mechanical. | `pi` returns rate-limit or unsupported-model error. | Architect |
| R6 | Zod schema and TypeScript type drift (validated shape differs from inferred type). | M | H | Lint rule forbidding hand-written types where `z.infer<typeof ...>` exists. Reviewer-A checks every PR. | Hand-written interface for a Zod-validated shape. | Implementer |
| R7 | "No comments" rule degrades knowledge transfer. | M | M | Compensated by richer ADRs, ACs in GitHub Issues, descriptive test names, and mandatory PR-body rationale. | Reviewer or operator reports difficulty reconstructing intent from code alone. | Architect |
| R8 | Full Phase 1+2 before v0.0.1 increases late-integration risk. | M | M | Internal smoke after T1-15 + T2-08: wire `club_search_members` through core+stdio before the other tools are added. | Stdio transport rejects core operation outputs after a batch of operations is implemented. | Planner |
| R9 | Fluent Community changes a route or response schema. | M | H | Versioned Zod envelopes. Failed parse returns `ExternalServiceError` with a `correlation_id` instead of crashing. | `ZodError` raised against an upstream response in production. | Implementer |
| R10 | WordPress Application Passwords disabled on a target site. | M | M | Actionable error message in tools. Documentation in `docs/local-mode.md` advises users to ask site admins to enable. Fallback to cookie+nonce remains opt-in. | `401` on Basic-Auth `/wp-json/` probe; site admin reports the feature is disabled. | Architect |

## Owner responsibilities

- **Architect**: review ADR conformance; escalate spec ambiguity; approve fallback decisions.
- **Implementer**: enforce TDD and Zod hygiene; treat any flagged secret as a hard stop.
- **Test-Runner (CI)**: keep contract tests pinned; surface failures within minutes of merge.
- **Planner**: track integration order; insert internal smoke milestones.

## Review cadence

Reviewed at every minor version bump and on any new ADR. Update Likelihood and Impact when evidence accumulates; add new rows as new risks become visible.
