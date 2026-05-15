# ADR-017: Decision log policy

Status: accepted

## Context

club-mcp is implemented entirely by AI agents using a dual-reviewer workflow. Architectural choices that bind future work, constrain public APIs, or shift security boundaries must be captured explicitly so that subsequent agent sessions make consistent decisions and reviewers have an authoritative reference to enforce against.

## Decision

A new ADR is required when any of the following applies:

- Architectural choice with lasting consequences (technology, package layout, module boundaries).
- Public API change (Zod schemas, tool names, error envelopes, exported types).
- Security boundary change (auth flow, credential storage, redaction policy).
- Build, release, or deployment infrastructure change.
- Replacement or supersession of a previous ADR.

Process:

1. Architect role proposes the ADR via a PR with status `proposed` using `docs/adr/_template.md`.
2. Reviewer-A and Reviewer-B review the ADR PR through the standard dual-review workflow.
3. Merge transitions status to `accepted`.
4. A new ADR that replaces an earlier one MUST set the prior ADR status to `superseded` and add a reference link in both directions.

Numbering:

- Files: `docs/adr/NNN-kebab-case-title.md`.
- `N` increments sequentially across the repository, no gaps.

Lifecycle:

- `proposed` — open for review.
- `accepted` — merged and authoritative.
- `rejected` — closed without merge; kept in repo with rationale in the Decision section.
- `superseded` — replaced; must link to successor.

Content requirements:

- Every ADR uses `docs/adr/_template.md`.
- Decision is stated unambiguously; no optionality.
- Consequences lists at least one concrete downstream change.
- Rationale anchors in KISS, security, compatibility, or explicit ADR reference.

## Consequences

- Reviewers can cite ADR text as a blocking veto on review.
- New choices are visible to future agent sessions through stable filenames and sequential numbering.
- Drift is detectable: any code path contradicting an `accepted` ADR is a review block.
- Adding or superseding an ADR is restricted to the Architect role.

## References

- `docs/adr/_template.md`
- `docs/agent-workflow.md`
- ADR-001..ADR-016 (existing accepted decisions)
