import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@hhc-mcp/core';
import { loadStdioConfig } from '../src/env.js';

const BASE_URL = 'https://club.hyperhuman.pl';

describe('loadStdioConfig', () => {
  it('returns ok with the base URL when HHC_BASE_URL is valid', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: BASE_URL });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ baseUrl: BASE_URL });
  });

  it('ignores auth env vars (auth is resolved separately)', () => {
    const result = loadStdioConfig({
      HHC_BASE_URL: BASE_URL,
      HHC_USER: 'whoever',
      HHC_APP_PASS: 'whatever',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({ baseUrl: BASE_URL });
  });

  it('accepts http URLs for local development', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: 'http://localhost:8080' });
    expect(isOk(result)).toBe(true);
  });

  it('returns validation error when HHC_BASE_URL is missing', () => {
    const result = loadStdioConfig({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns validation error when HHC_BASE_URL is empty string', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: '' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns validation error when HHC_BASE_URL is not a valid URL', () => {
    const result = loadStdioConfig({ HHC_BASE_URL: 'not-a-url' });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.code).toBe('validation');
    expect(result.error.message).toContain('HHC_BASE_URL');
  });

  it('returns AppError with retryable=false for validation errors', () => {
    const result = loadStdioConfig({});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.retryable).toBe(false);
  });
});
