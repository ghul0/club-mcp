import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import { z } from 'zod';
import { createHttpClient } from '../src/http/client.js';
import { isErr, isOk } from '../src/result.js';

const BASE = 'https://club.hyperhuman.pl';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const PingSchema = z.object({ ok: z.boolean(), name: z.string() });

describe('createHttpClient', () => {
  it('returns ok(value) for 200 JSON matching schema', async () => {
    server.use(
      http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: true, name: 'pong' })),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ ok: true, name: 'pong' });
  });

  it('maps 401 to upstream_unauthorized', async () => {
    server.use(
      http.get(`${BASE}/api/secret`, () => HttpResponse.json({}, { status: 401 })),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/secret', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_unauthorized');
    expect(result.error.retryable).toBe(false);
  });

  it('maps 403 to upstream_forbidden', async () => {
    server.use(
      http.get(`${BASE}/api/secret`, () => HttpResponse.json({}, { status: 403 })),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/secret', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_forbidden');
  });

  it('maps 404 to upstream_not_found', async () => {
    server.use(
      http.get(`${BASE}/api/missing`, () => HttpResponse.json({}, { status: 404 })),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/missing', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_not_found');
  });

  it('maps 429 with retries exhausted to rate_limit', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/throttled`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 429 });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 2 });
    const result = await client.get('/api/throttled', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('rate_limit');
    expect(result.error.retryable).toBe(true);
    expect(calls).toBe(3);
  });

  it('retries 500 and returns ok when subsequent call succeeds', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/flaky`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({}, { status: 500 });
        }
        return HttpResponse.json({ ok: true, name: 'recovered' });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 2 });
    const result = await client.get('/api/flaky', PingSchema);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.name).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('maps persistent 500 to external_service retryable after retries exhausted', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/broken`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 2 });
    const result = await client.get('/api/broken', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
    expect(result.error.retryable).toBe(true);
    expect(calls).toBe(3);
  });

  it('does NOT retry 400-class (except 429); maps to external_service non-retryable', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/bad`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 400 });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 2 });
    const result = await client.get('/api/bad', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
    expect(result.error.retryable).toBe(false);
    expect(calls).toBe(1);
  });

  it('maps Zod parse failure to external_service non-retryable with parse details', async () => {
    server.use(
      http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: 'not-a-bool', name: 42 })),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/ping', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
    expect(result.error.retryable).toBe(false);
    expect(result.error.message.toLowerCase()).toMatch(/parse|schema|validation|invalid/);
  });

  it('maps timeout to external_service retryable', async () => {
    server.use(
      http.get(`${BASE}/api/slow`, async () => {
        await delay(200);
        return HttpResponse.json({ ok: true, name: 'late' });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 20, maxRetries: 0 });
    const result = await client.get('/api/slow', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
    expect(result.error.retryable).toBe(true);
  });

  it('rejects 3xx redirect responses as external_service', async () => {
    server.use(
      http.get(`${BASE}/api/redirect`, () =>
        new HttpResponse(null, { status: 302, headers: { Location: 'https://evil.example/' } }),
      ),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/redirect', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
  });

  it('throws Error when path does not start with /', () => {
    const client = createHttpClient({ baseUrl: BASE });
    expect(() => client.get('api/ping', PingSchema)).toThrow();
  });

  it('throws Error at construction when baseUrl not in allowlist', () => {
    expect(() =>
      createHttpClient({ baseUrl: 'https://other.example', allowedBaseUrls: [BASE] }),
    ).toThrow();
  });

  it('throws Error at construction when baseUrl is not HTTPS', () => {
    expect(() => createHttpClient({ baseUrl: 'http://club.hyperhuman.pl' })).toThrow();
  });

  it('invokes authHeader once per request and sets Authorization header', async () => {
    const authHeader = vi.fn(() => 'Basic abc==');
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/api/ping`, ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, name: 'pong' });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, authHeader });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    expect(authHeader).toHaveBeenCalledTimes(1);
    expect(seenAuth).toBe('Basic abc==');
  });

  it('encodes query params and drops undefined values', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${BASE}/api/search`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json({ ok: true, name: 'q' });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/search', PingSchema, {
      q: 'hello world',
      page: 2,
      flag: true,
      skip: undefined,
    });

    expect(isOk(result)).toBe(true);
    const parsed = new URL(seenUrl);
    expect(parsed.searchParams.get('q')).toBe('hello world');
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('flag')).toBe('true');
    expect(parsed.searchParams.has('skip')).toBe(false);
  });

  it('sends a User-Agent header by default', async () => {
    let seenUa: string | null = null;
    server.use(
      http.get(`${BASE}/api/ping`, ({ request }) => {
        seenUa = request.headers.get('user-agent');
        return HttpResponse.json({ ok: true, name: 'pong' });
      }),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    await client.get('/api/ping', PingSchema);

    expect(seenUa).toMatch(/hhc-mcp/);
  });

  it('maps network error to external_service retryable', async () => {
    server.use(
      http.get(`${BASE}/api/down`, () => HttpResponse.error()),
    );

    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0 });
    const result = await client.get('/api/down', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('external_service');
    expect(result.error.retryable).toBe(true);
  });
});
