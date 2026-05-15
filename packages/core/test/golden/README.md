# Golden test harness vs `hhc.py` (oracle)

The Python CLI at `~/.claude/skills/hyperhuman-club/scripts/hhc.py` is
the behavior reference for `@hhc-mcp/core`. This directory holds a
fixture-driven harness that proves each of the 12 read-only TypeScript
operations produces output structurally equivalent to what the Python
reference returns for the same upstream payload.

## Layout

- `oracle.ts` — helpers: fixture loader, operation dispatch table, mock
  client builder, shape-comparison assertion.
- `harness.test.ts` — Vitest suite. Includes inline smoke tests that
  exercise the harness mechanism, plus a dynamic loop that turns every
  `fixtures/*.json` file into a test case.
- `fixtures/` — empty placeholder. Real fixtures are recorded against a
  live Hyper Human Club account. See `fixtures/README.md` for format.

## Comparison rules

- Structural match, not byte-for-byte. JSON object key order is ignored.
- The TypeScript output is allowed to contain extra fields beyond what
  `expected` declares. Core schemas use `.passthrough()`, so the TS layer
  often preserves more than the Python reference normalizes. The harness
  checks that every field present in `expected` is present and
  deep-equal in the actual output, and that arrays match in length.
- The optional `upstream.path` and `upstream.query` assertions verify
  the operation called the mocked HTTP client with the expected
  arguments.

## CI behavior

- When `fixtures/` contains no JSON files, the recorded-fixtures
  describe block becomes a single skipped test that prints
  `[golden] no fixtures recorded under ...`. The suite stays green.
- The smoke tests always run and verify the harness itself.
- The harness never performs live HTTP calls. The mocked client is
  injected via the `GetClient` interface.

## Running locally

```
pnpm -C packages/core test golden
```

## Adding a fixture

See `fixtures/README.md` for the exact JSON shape and the recording
workflow.
