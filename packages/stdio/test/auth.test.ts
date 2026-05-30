import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '@hhc-mcp/core';
import { createAuthFileStore } from '../src/auth-file.js';
import { createCookieAuthProvider, resolveAuth } from '../src/auth.js';

const BASE = 'https://club.hyperhuman.pl';

const decodeBasic = (header: string): string =>
  Buffer.from(header.replace(/^Basic\s+/, ''), 'base64').toString('utf8');

describe('resolveAuth selection', () => {
  it('auto picks basic when HHC_USER + HHC_APP_PASS present', () => {
    const result = resolveAuth({
      env: { HHC_USER: 'alice', HHC_APP_PASS: 'pw' },
      baseUrl: BASE,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(typeof result.value.authHeader).toBe('function');
    expect(result.value.auth).toBeUndefined();
  });

  it('auto picks cookie when only a cookie is present', () => {
    const result = resolveAuth({ env: { HHC_COOKIE: 'c=1' }, baseUrl: BASE });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.auth).toBeDefined();
    expect(result.value.authHeader).toBeUndefined();
  });

  it('auto prefers basic when both basic and cookie are present', () => {
    const result = resolveAuth({
      env: { HHC_USER: 'alice', HHC_APP_PASS: 'pw', HHC_COOKIE: 'c=1' },
      baseUrl: BASE,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(typeof result.value.authHeader).toBe('function');
    expect(result.value.auth).toBeUndefined();
  });

  it('auto errors when no credentials are present', () => {
    const result = resolveAuth({ env: {}, baseUrl: BASE });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
  });

  it('mode=basic errors without basic credentials', () => {
    const result = resolveAuth({ env: { HHC_AUTH_MODE: 'basic', HHC_COOKIE: 'c=1' }, baseUrl: BASE });
    expect(isErr(result)).toBe(true);
  });

  it('mode=cookie errors without a cookie', () => {
    const result = resolveAuth({
      env: { HHC_AUTH_MODE: 'cookie', HHC_USER: 'a', HHC_APP_PASS: 'b' },
      baseUrl: BASE,
    });
    expect(isErr(result)).toBe(true);
  });

  it('rejects an invalid HHC_AUTH_MODE', () => {
    const result = resolveAuth({ env: { HHC_AUTH_MODE: 'weird' }, baseUrl: BASE });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('HHC_AUTH_MODE');
  });

  it('uses HHC_NONCE when HHC_WP_NONCE is an empty string', async () => {
    const result = resolveAuth({
      env: { HHC_AUTH_MODE: 'cookie', HHC_COOKIE: 'c=1', HHC_WP_NONCE: '', HHC_NONCE: 'aliased' },
      baseUrl: BASE,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.auth === undefined) return;
    expect(await result.value.auth.headers()).toEqual({ cookie: 'c=1', 'x-wp-nonce': 'aliased' });
  });

  it('env credentials take precedence over the auth file', () => {
    const store = {
      read: () => ({ user: 'file-user', app_pass: 'file-pass' }),
      setNonce: () => undefined,
    };
    const result = resolveAuth({
      env: { HHC_USER: 'env-user', HHC_APP_PASS: 'env-pass' },
      baseUrl: BASE,
      store,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.authHeader === undefined) return;
    expect(decodeBasic(result.value.authHeader())).toBe('env-user:env-pass');
  });

  it('falls back to auth-file basic credentials when env is empty', () => {
    const store = {
      read: () => ({ user: 'file-user', app_pass: 'file-pass' }),
      setNonce: () => undefined,
    };
    const result = resolveAuth({ env: {}, baseUrl: BASE, store });
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.authHeader === undefined) return;
    expect(decodeBasic(result.value.authHeader())).toBe('file-user:file-pass');
  });
});

describe('createCookieAuthProvider', () => {
  it('emits cookie + x-wp-nonce headers', async () => {
    const provider = createCookieAuthProvider({ baseUrl: BASE, cookie: 'c=1', nonce: 'n1' });
    expect(await provider.headers()).toEqual({ cookie: 'c=1', 'x-wp-nonce': 'n1' });
  });

  it('omits x-wp-nonce when the nonce is empty', async () => {
    const provider = createCookieAuthProvider({ baseUrl: BASE, cookie: 'c=1', nonce: '' });
    expect(await provider.headers()).toEqual({ cookie: 'c=1' });
  });

  it('refreshes the nonce from site-root HTML and persists it', async () => {
    const setNonce = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response('<script>var fluentComAdmin = {"rest":{"nonce":"abc123def"}};</script>', {
          status: 200,
        }),
      ),
    ) as unknown as typeof globalThis.fetch;
    const provider = createCookieAuthProvider({
      baseUrl: BASE,
      cookie: 'c=1',
      nonce: 'stale',
      store: { read: () => ({}), setNonce },
      fetchImpl,
    });
    const refreshed = await provider.onUnauthorized?.();
    expect(refreshed).toBe(true);
    expect(setNonce).toHaveBeenCalledWith('abc123def');
    expect(await provider.headers()).toEqual({ cookie: 'c=1', 'x-wp-nonce': 'abc123def' });
  });

  it('returns false when no nonce can be parsed', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('<html>nothing here</html>', { status: 200 })),
    ) as unknown as typeof globalThis.fetch;
    const provider = createCookieAuthProvider({ baseUrl: BASE, cookie: 'c=1', nonce: '', fetchImpl });
    expect(await provider.onUnauthorized?.()).toBe(false);
  });
});

describe('createAuthFileStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hhc-auth-'));
    path = join(dir, 'auth.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads an existing auth file', () => {
    writeFileSync(path, JSON.stringify({ cookie: 'c=1', nonce: 'n1', user: 'u' }));
    const store = createAuthFileStore(path);
    expect(store.read()).toMatchObject({ cookie: 'c=1', nonce: 'n1', user: 'u' });
  });

  it('returns empty data for a missing file', () => {
    const store = createAuthFileStore(join(dir, 'missing.json'));
    expect(store.read()).toEqual({});
  });

  it('setNonce updates nonce without clobbering other fields', () => {
    writeFileSync(path, JSON.stringify({ cookie: 'c=1', nonce: 'old', user: 'u', app_pass: 'p' }));
    const store = createAuthFileStore(path);
    store.setNonce('new');
    const written = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(written.nonce).toBe('new');
    expect(written.cookie).toBe('c=1');
    expect(written.user).toBe('u');
    expect(written.app_pass).toBe('p');
    expect(typeof written.nonce_refreshed_at).toBe('string');
  });

  it('setNonce preserves unknown fields not in the schema', () => {
    writeFileSync(path, JSON.stringify({ cookie: 'c=1', nonce: 'old', cf_clearance: 'cf', extra: { a: 1 } }));
    const store = createAuthFileStore(path);
    store.setNonce('new');
    const written = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(written.nonce).toBe('new');
    expect(written.cf_clearance).toBe('cf');
    expect(written.extra).toEqual({ a: 1 });
  });

  it('setNonce creates a missing parent directory', () => {
    const nested = join(dir, 'deep', 'nested', 'auth.json');
    const store = createAuthFileStore(nested);
    store.setNonce('n1');
    const written = JSON.parse(readFileSync(nested, 'utf8')) as Record<string, unknown>;
    expect(written.nonce).toBe('n1');
  });

  it('setNonce writes through a symlink and preserves the link', () => {
    const realTarget = join(dir, 'real-auth.json');
    const link = join(dir, 'link-auth.json');
    writeFileSync(realTarget, JSON.stringify({ cookie: 'c=1', nonce: 'old' }));
    symlinkSync(realTarget, link);
    createAuthFileStore(link).setNonce('new');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const written = JSON.parse(readFileSync(realTarget, 'utf8')) as Record<string, unknown>;
    expect(written.nonce).toBe('new');
    expect(written.cookie).toBe('c=1');
  });

  it('does not throw on a dangling symlink and persists the nonce', () => {
    const link = join(dir, 'dangling.json');
    symlinkSync(join(dir, 'no-such-target.json'), link);
    expect(() => createAuthFileStore(link).setNonce('n1')).not.toThrow();
    const written = JSON.parse(readFileSync(link, 'utf8')) as Record<string, unknown>;
    expect(written.nonce).toBe('n1');
  });

  it('leaves no .tmp files behind after setNonce', () => {
    writeFileSync(path, JSON.stringify({ cookie: 'c=1' }));
    createAuthFileStore(path).setNonce('n');
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('read returns {} when a field has the wrong type', () => {
    writeFileSync(path, JSON.stringify({ cookie: 123 }));
    expect(createAuthFileStore(path).read()).toEqual({});
  });

  it('read returns {} when JSON is not an object', () => {
    writeFileSync(path, JSON.stringify([1, 2, 3]));
    expect(createAuthFileStore(path).read()).toEqual({});
  });
});
