# Golden fixtures (oracle test data)

This directory holds recorded oracle fixtures that compare the TypeScript
core operations in `@hhc-mcp/core` against the Python reference
implementation in `~/.claude/skills/hyperhuman-club/scripts/hhc.py`.

Each fixture is a JSON file named `<operation>-<scenario>.json` (for
example `search-members-basic.json` or `get-feed-empty.json`). The
harness in `../harness.test.ts` picks them up automatically.

## Fixture format

```jsonc
{
  "operation": "search_members",
  "input": { "query": "alice", "limit": 10 },
  "upstream": {
    "path": "/members",
    "query": { "search": "alice", "per_page": 10 },
    "response": {
      "members": [
        { "user_id": 1, "display_name": "Alice", "username": "alice" }
      ]
    }
  },
  "expected": {
    "members": [
      { "user_id": 1, "display_name": "Alice", "username": "alice" }
    ]
  }
}
```

Fields:

- `operation` — snake_case operation name. Mapping to TypeScript functions
  lives in `../oracle.ts` (`OPERATIONS`).
- `input` — input passed to the TypeScript operation function.
- `upstream.path` — optional. When set, the harness asserts the
  operation called the mocked client with this path.
- `upstream.query` — optional. When set, the harness asserts the
  operation called the mocked client with this query record.
- `upstream.response` — raw upstream JSON the mocked client returns to
  the operation under test.
- `expected` — canonical normalized shape the operation must produce.
  Comparison uses `toEqual` (order-insensitive for object keys). The
  TypeScript output is allowed to contain extra fields because schemas
  use `.passthrough()`; the harness asserts that every field present in
  `expected` is present and deep-equal in the actual output.

## Recording new fixtures

1. Run `~/.claude/skills/hyperhuman-club/scripts/hhc.py` against a
   representative scenario on a live Hyper Human Club account.
2. Capture the upstream HTTP path, query parameters, and raw JSON
   response (these become `upstream.path`, `upstream.query`,
   `upstream.response`).
3. Capture the canonical structured output the Python reference returns
   for the same call (this becomes `expected`).
4. Redact private data (emails, raw post bodies, credentials) before
   committing. See `docs/testing-strategy.md` fixture policy.
5. Save the JSON to this directory.

## Notes

- The harness skips gracefully when this directory contains no JSON
  fixtures. The smoke test in `../harness.test.ts` proves the harness
  mechanism itself works using an inline fixture.
- Field-order in JSON does not matter; the comparison is structural.
- Do not commit live credentials, raw private profile emails, or full
  real post/comment bodies. Prefer synthetic fixtures shaped like the
  real API.
