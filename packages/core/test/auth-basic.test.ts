import { describe, expect, it } from 'vitest';
import {
  createBasicAuthProvider,
  loadBasicAuthFromEnv,
  redactBasicAuth,
} from '../src/auth/basic.js';
import { isOk, isErr } from '../src/result.js';

describe('basic auth', () => {
  it('createBasicAuthProvider returns Basic base64(user:password)', () => {
    const provider = createBasicAuthProvider('alice', 'secret');
    expect(provider()).toBe(`Basic ${Buffer.from('alice:secret', 'utf8').toString('base64')}`);
  });

  it('createBasicAuthProvider header is stable across calls', () => {
    const provider = createBasicAuthProvider('user', 'pass');
    expect(provider()).toBe(provider());
  });

  it('createBasicAuthProvider rejects empty user', () => {
    expect(() => createBasicAuthProvider('', 'pw')).toThrow();
  });

  it('createBasicAuthProvider rejects empty password', () => {
    expect(() => createBasicAuthProvider('user', '')).toThrow();
  });

  it('loadBasicAuthFromEnv returns ok with provider when env complete', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: 'alice', HHC_APP_PASS: 'xxxx xxxx xxxx' });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value()).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
  });

  it('loadBasicAuthFromEnv returns auth_missing when HHC_USER unset', () => {
    const result = loadBasicAuthFromEnv({ HHC_APP_PASS: 'pw' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_USER');
  });

  it('loadBasicAuthFromEnv returns auth_missing when HHC_APP_PASS unset', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: 'alice' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_APP_PASS');
  });

  it('loadBasicAuthFromEnv returns auth_missing when HHC_USER empty string', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: '', HHC_APP_PASS: 'pw' });
    expect(isErr(result)).toBe(true);
  });

  it('loadBasicAuthFromEnv returns auth_missing when HHC_APP_PASS empty string', () => {
    const result = loadBasicAuthFromEnv({ HHC_USER: 'alice', HHC_APP_PASS: '' });
    expect(isErr(result)).toBe(true);
  });

  it('redactBasicAuth replaces Basic header value with placeholder', () => {
    const before = 'Authorization: Basic ZmFrZS10ZXN0LXBsYWNlaG9sZGVy';
    expect(redactBasicAuth(before)).toBe('Authorization: Basic [REDACTED]');
  });

  it('redactBasicAuth handles multiple Basic occurrences', () => {
    const before = 'one Basic abc== two Basic def==';
    expect(redactBasicAuth(before)).toBe('one Basic [REDACTED] two Basic [REDACTED]');
  });

  it('redactBasicAuth leaves non-Basic strings unchanged', () => {
    expect(redactBasicAuth('Bearer xyz')).toBe('Bearer xyz');
  });
});
