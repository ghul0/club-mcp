import { describe, expect, it } from 'vitest';
import {
  createBasicAuthProvider,
  loadBasicAuthFromEnv,
  redactBasicAuth,
} from '../src/auth/basic.js';
import { isOk, isErr } from '../src/result.js';

const TEST_USER = 'test-user';
const TEST_PASS = 'test-value';

describe('basic auth', () => {
  it('createBasicAuthProvider returns Basic base64(user:password)', () => {
    const provider = createBasicAuthProvider(TEST_USER, TEST_PASS);
    expect(provider()).toBe(`Basic ${Buffer.from(`${TEST_USER}:${TEST_PASS}`, 'utf8').toString('base64')}`);
  });

  it('createBasicAuthProvider header is stable across calls', () => {
    const provider = createBasicAuthProvider(TEST_USER, TEST_PASS);
    expect(provider()).toBe(provider());
  });

  it('createBasicAuthProvider rejects empty user', () => {
    expect(() => createBasicAuthProvider('', TEST_PASS)).toThrow();
  });

  it('createBasicAuthProvider rejects empty password', () => {
    expect(() => createBasicAuthProvider(TEST_USER, '')).toThrow();
  });

  it('loadBasicAuthFromEnv returns ok with provider when env complete', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: TEST_USER, HHC_APP_PASS: TEST_PASS });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value()).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
  });

  it('loadBasicAuthFromEnv returns validation error when HHC_USER unset', () => {
    const result = loadBasicAuthFromEnv({ HHC_APP_PASS: TEST_PASS });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_USER');
  });

  it('loadBasicAuthFromEnv returns validation error when HHC_APP_PASS unset', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: TEST_USER });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_APP_PASS');
  });

  it('loadBasicAuthFromEnv returns validation error when HHC_USER empty string', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: '', HHC_APP_PASS: TEST_PASS });
    expect(isErr(result)).toBe(true);
  });

  it('loadBasicAuthFromEnv returns validation error when HHC_APP_PASS empty string', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: TEST_USER, HHC_APP_PASS: '' });
    expect(isErr(result)).toBe(true);
  });

  it('redactBasicAuth replaces Basic header value with placeholder', () => {
    const fakeToken = 'AAAAAAAA';
    const before = `Authorization: Basic ${fakeToken}`;
    expect(redactBasicAuth(before)).toBe('Authorization: Basic [REDACTED]');
  });

  it('redactBasicAuth handles multiple Basic occurrences', () => {
    const tokenA = 'AAAA';
    const tokenB = 'BBBB';
    const before = `one Basic ${tokenA} two Basic ${tokenB}`;
    expect(redactBasicAuth(before)).toBe('one Basic [REDACTED] two Basic [REDACTED]');
  });

  it('redactBasicAuth leaves non-Basic strings unchanged', () => {
    expect(redactBasicAuth('Bearer xyz')).toBe('Bearer xyz');
  });
});
