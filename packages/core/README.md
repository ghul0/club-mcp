# @hhc-mcp/core

Pure TypeScript library for reading the Hyper Human Club / Fluent Community REST
API. Framework-agnostic foundation shared by `@hhc-mcp/stdio` and `@hhc-mcp/http`.

## Purpose

`@hhc-mcp/core` is the read-only domain core of the `club-mcp` workspace
(ADR-004). It exposes:

- A GET-only HTTP client with HTTPS enforcement, base-URL allowlist, timeouts,
  retries with exponential backoff and jitter, and Zod response validation.
- Zod envelopes for the Fluent Community v2 API (members, feeds, comments).
- A `Result<T, AppError>` discriminated union and a typed `AppError` taxonomy.
- Helpers for pagination, bounded concurrency, date parsing, and response
  redaction / HTML normalization.

The package contains no I/O transport (stdio, HTTP), no MCP server code, and
no write operations. It targets ESM and Node 22+.

## Installation

`@hhc-mcp/core` is published as part of the `club-mcp` pnpm workspace.

```bash
pnpm add @hhc-mcp/core
```

Inside the monorepo, depend on it via `"@hhc-mcp/core": "workspace:*"`.

## Quick start

```ts
import {
  createHttpClient,
  MembersResponseSchema,
  isOk,
} from '@hhc-mcp/core';

const basic = Buffer.from(`${process.env.HHC_USER}:${process.env.HHC_APP_PASS}`).toString('base64');

const client = createHttpClient({
  baseUrl: 'https://club.hyperhuman.pl',
  allowedBaseUrls: ['https://club.hyperhuman.pl'],
  authHeader: () => `Basic ${basic}`,
});

const result = await client.get(
  '/wp-json/fluent-community/v2/members',
  MembersResponseSchema,
  { search: 'thomas', per_page: 20 },
);

if (isOk(result)) {
  console.log(result.value.members);
} else {
  console.error(result.error.code, result.error.message);
}
```

## Public API

### Foundation

- `Result<T, E>`, `ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `match`
- `AppError`, `ErrorCode`, `AppErrorEnvelope`
- Error constructors: `validationError`, `authMissing`, `authInvalid`,
  `upstreamUnauthorized`, `upstreamForbidden`, `upstreamNotFound`, `rateLimit`,
  `externalService`, `unsupportedAuth`

### HTTP client

- `createHttpClient(options: HttpClientOptions): GetClient`
- `HttpClientOptions`, `GetClient`

### Schemas (Zod envelopes)

- Members: `MemberSchema`, `MembersResponseSchema`, types `Member`,
  `MembersResponse`
- Feeds: `AuthorSchema`, `SpaceSchema`, `FeedSchema`, `FeedsListResponseSchema`,
  `FeedByIdResponseSchema`, plus inferred types
- Comments: `CommentSchema`, `CommentsResponseSchema`, plus inferred types

### Helpers

- Pagination: `paginate`, `PageRequest`, `Page<T>`, `PaginateOptions`
- Concurrency: `concurrentMap`, `DEFAULT_CONCURRENCY`, `MAX_CONCURRENCY`
- Date: `parseSince`, `formatWpLocal` (WordPress local datetime format)
- Redaction: `redactKeys`, `htmlToText`, `truncate`, `RedactionOptions`

## Error model

Every operation returns `Promise<Result<T, AppError>>`. Use `isOk` / `isErr` (or
`match`) to branch. `AppError.code` is a closed union (`validation`,
`auth_missing`, `auth_invalid`, `upstream_unauthorized`, `upstream_forbidden`,
`upstream_not_found`, `rate_limit`, `external_service`, `unsupported_auth`) and
`AppError.retryable` distinguishes transient from permanent failures.
Exceptions are reserved for programmer errors (invalid base URL, invalid path).

## Constraints

- GET-only. There is no POST/PATCH/PUT/DELETE surface in v1 (ADR-006).
- HTTPS-only base URLs; redirects are not followed.
- All responses are validated through Zod schemas before being returned.

## License

MIT — see [LICENSE](./LICENSE).
