import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@hhc-mcp/core';
import { loadStdioConfig } from '../src/env.js';

const BASE_URL = 'https://club.hyperhuman.pl';
const USER = 'test-user';
const APP_PASS = 'test-pass';

describe('loadStdioConfig', () => {
  it('returns ok with typed config when all env vars are valid', () => {
    const result = loadStdioConfig({
      HHC_BASE_URL: BASE_URL,
      HHC_USER: USER,
      HHC_APP_PASS: APP_PASS,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ baseUrl: BASE_URL, user: USER, appPass: APP_PASS });
  });

  it('accepts http URLs for local development', () => {
    const result = loadStdioConfig({
      HHC_BASE_URL: 'http://localhost:8080',
      HHC_USER: USER,
      HHC_APP_PASS: APP_PASS,
    });
    expect(isOk(result)).toBe(true);
  });

  it('returns validation error when HHC_BASE_URL is missing', () => {
    const result = loadStdioConfig({ HHC_USER: USER, HHC_APP_PASS: APP_PASS });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns validation error when HHC_BASE_URL is empty string', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: '', HHC_USER: USER, HHC_APP_PASS: APP_PASS });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns validation error when HHC_BASE_URL is not a valid URL', () => {
    const result = loadStdioConfig({
      HHC_BASE_URL: 'not-a-url',
      HHC_USER: USER,
      HHC_APP_PASS: APP_PASS,
    });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns validation error when HHC_USER is missing', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: BASE_URL, HHC_APP_PASS: APP_PASS });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_USER');
  });

  it('returns validation error when HHC_USER is empty string', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: BASE_URL, HHC_USER: '', HHC_APP_PASS: APP_PASS });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_USER');
  });

  it('returns validation error when HHC_APP_PASS is missing', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: BASE_URL, HHC_USER: USER });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_APP_PASS');
  });

  it('returns validation error when HHC_APP_PASS is empty string', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: BASE_URL, HHC_USER: USER, HHC_APP_PASS: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_APP_PASS');
  });

  it('returns first error when multiple env vars are invalid (HHC_BASE_URL first)', () => {
    const result = loadStdioConfig({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns AppError with retryable=false for validation errors', () => {
    const result = loadStdioConfig({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.retryable).toBe(false);
  });
});
