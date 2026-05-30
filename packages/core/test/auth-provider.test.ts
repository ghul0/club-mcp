import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { createHttpClient, FLUENT_COMMUNITY_API_PREFIX, type AuthProvider } from '../src/http/client.js';
import { isErr, isOk } from '../src/result.js';

const BASE = 'https://club.hyperhuman.pl';
const PREFIX = FLUENT_COMMUNITY_API_PREFIX;
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

describe('createHttpClient auth provider', () => {
  it('merges provider headers (cookie + x-wp-nonce) into the request', async () => {
    let seenCookie: string | null = null;
    let seenNonce: string | null = null;
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, ({ request }) => {
        seenCookie = request.headers.get('cookie');
        seenNonce = request.headers.get('x-wp-nonce');
        return HttpResponse.json({ ok: true, name: 'pong' });
      }),
    );
    const auth: AuthProvider = {
      headers: () => ({ cookie: 'wordpress_logged_in_x=abc', 'x-wp-nonce': 'nonce123' }),
    };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    expect(seenCookie).toBe('wordpress_logged_in_x=abc');
    expect(seenNonce).toBe('nonce123');
  });

  it('refreshes once on 401 and retries even with maxRetries:0', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, ({ request }) => {
        calls += 1;
        if (request.headers.get('x-wp-nonce') === 'fresh') {
          return HttpResponse.json({ ok: true, name: 'pong' });
        }
        return HttpResponse.json({}, { status: 401 });
      }),
    );
    let nonce = 'stale';
    const onUnauthorized = vi.fn(async () => {
      nonce = 'fresh';
      return Promise.resolve(true);
    });
    const auth: AuthProvider = {
      headers: () => ({ cookie: 'c=1', 'x-wp-nonce': nonce }),
      onUnauthorized,
    };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it('retries a network error on the post-refresh attempt using the transient budget', async () => {
    let calls = 0;
    let nonce = 'stale';
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({}, { status: 401 });
        if (calls === 2) return HttpResponse.error();
        return HttpResponse.json({ ok: true, name: 'pong' });
      }),
    );
    const onUnauthorized = vi.fn(() => {
      nonce = 'fresh';
      return Promise.resolve(true);
    });
    const auth: AuthProvider = {
      headers: () => ({ cookie: 'c=1', 'x-wp-nonce': nonce }),
      onUnauthorized,
    };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 1, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3);
  });

  it('returns the original 401 when refresh yields false', async () => {
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, () => HttpResponse.json({}, { status: 401 })),
    );
    const onUnauthorized = vi.fn(() => Promise.resolve(false));
    const auth: AuthProvider = { headers: () => ({ cookie: 'c=1' }), onUnauthorized };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_unauthorized');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not crash when refresh throws, returns original 403', async () => {
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, () => HttpResponse.json({}, { status: 403 })),
    );
    const onUnauthorized = vi.fn(() => Promise.reject(new Error('network down')));
    const auth: AuthProvider = { headers: () => ({ cookie: 'c=1' }), onUnauthorized };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('upstream_forbidden');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('refreshes at most once across repeated 401s', async () => {
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, () => HttpResponse.json({}, { status: 401 })),
    );
    const onUnauthorized = vi.fn(() => Promise.resolve(true));
    const auth: AuthProvider = { headers: () => ({ cookie: 'c=1' }), onUnauthorized };
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 2, auth });
    const result = await client.get('/api/ping', PingSchema);

    expect(isErr(result)).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('still supports the legacy authHeader callback', async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}${PREFIX}/api/ping`, ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, name: 'pong' });
      }),
    );
    const client = createHttpClient({ baseUrl: BASE, maxRetries: 0, authHeader: () => 'Basic abc==' });
    const result = await client.get('/api/ping', PingSchema);

    expect(isOk(result)).toBe(true);
    expect(seenAuth).toBe('Basic abc==');
  });
});
