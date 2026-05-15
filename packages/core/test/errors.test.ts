import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';

type AppErrorShape = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly correlation_id?: string;
  readonly cause?: unknown;
};

type ParseResult =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false; readonly error: unknown };

type AppErrorEnvelopeShape = {
  readonly safeParse: (value: unknown) => ParseResult;
};

const exported = core as unknown as Partial<Record<string, unknown>>;

const constructorCases = [
  ['validationError', ['invalid input'], 'validation', false, 'invalid input'],
  ['authMissing', [], 'auth_missing', false, undefined],
  ['authInvalid', ['invalid credentials'], 'auth_invalid', false, 'invalid credentials'],
  ['upstreamUnauthorized', ['upstream unauthorized'], 'upstream_unauthorized', false, 'upstream unauthorized'],
  ['upstreamForbidden', ['upstream forbidden'], 'upstream_forbidden', false, 'upstream forbidden'],
  ['upstreamNotFound', ['missing upstream resource'], 'upstream_not_found', false, 'missing upstream resource'],
  ['rateLimit', ['upstream rate limit'], 'rate_limit', true, 'upstream rate limit'],
  ['externalService', ['upstream unavailable'], 'external_service', true, 'upstream unavailable'],
  ['externalServiceNonRetryable', ['upstream client error'], 'external_service', false, 'upstream client error'],
  ['unsupportedAuth', ['unsupported authentication mode'], 'unsupported_auth', false, 'unsupported authentication mode'],
] as const;

const constructorNames = constructorCases.map(([name]) => name);

const getConstructor = (name: string): ((...args: unknown[]) => AppErrorShape) => {
  const value = exported[name];
  expect(typeof value).toBe('function');
  return value as (...args: unknown[]) => AppErrorShape;
};

const getEnvelope = (): AppErrorEnvelopeShape => {
  const value = exported.AppErrorEnvelope;
  expect(value).toBeDefined();
  expect(typeof value).toBe('object');
  expect(value).not.toBeNull();
  return value as AppErrorEnvelopeShape;
};

describe('error taxonomy', () => {
  it('exports the required constructor and envelope API', () => {
    for (const name of constructorNames) {
      expect(typeof exported[name]).toBe('function');
    }

    expect(exported.AppErrorEnvelope).toBeDefined();
  });

  it.each(constructorCases)('%s returns the expected code and retryable flag', (name, args, code, retryable, message) => {
    const error = getConstructor(name)(...[...args]);

    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(typeof error.message).toBe('string');

    if (message !== undefined) {
      expect(error.message).toBe(message);
    }
  });

  it('preserves optional correlation_id and cause', () => {
    const cause = { status: 503 };
    const error = getConstructor('externalService')('upstream unavailable', {
      correlation_id: 'corr-123',
      cause,
    });

    expect(error).toEqual({
      code: 'external_service',
      message: 'upstream unavailable',
      retryable: true,
      correlation_id: 'corr-123',
      cause,
    });
  });

  it('authMissing accepts options as its first argument', () => {
    const cause = new Error('missing header');
    const error = getConstructor('authMissing')({ correlation_id: 'corr-auth', cause });

    expect(error.code).toBe('auth_missing');
    expect(error.retryable).toBe(false);
    expect(error.correlation_id).toBe('corr-auth');
    expect(error.cause).toBe(cause);
  });

  it('AppErrorEnvelope accepts a valid AppError', () => {
    const envelope = getEnvelope();
    const valid = getConstructor('validationError')('invalid input', { correlation_id: 'corr-valid' });
    const parsed = envelope.safeParse(valid);

    expect(parsed.success).toBe(true);
  });

  it.each([
    { code: 'not_real', message: 'invalid code', retryable: false },
    { code: 'validation', retryable: false },
    { code: 'validation', message: 42, retryable: false },
    { code: 'validation', message: 'invalid retryable', retryable: 'false' },
    { code: 'validation', message: 'invalid correlation', retryable: false, correlation_id: 123 },
    { code: 'validation', message: 'extra field', retryable: false, stack: 'redacted' },
  ])('AppErrorEnvelope rejects malformed payload %#', (malformed) => {
    const envelope = getEnvelope();

    expect(envelope.safeParse(malformed).success).toBe(false);
  });

  it('PublicAppErrorEnvelope is exported and accepts a valid AppError without cause', () => {
    const publicEnvelope = exported.PublicAppErrorEnvelope as AppErrorEnvelopeShape | undefined;
    expect(publicEnvelope).toBeDefined();
    expect(typeof publicEnvelope?.safeParse).toBe('function');
    const valid = getConstructor('validationError')('invalid input', { correlation_id: 'corr-public' });
    const stripped = {
      code: valid.code,
      message: valid.message,
      retryable: valid.retryable,
      correlation_id: valid.correlation_id,
    };
    expect(publicEnvelope?.safeParse(stripped).success).toBe(true);
  });

  it('PublicAppErrorEnvelope rejects payloads that carry a cause field', () => {
    const publicEnvelope = exported.PublicAppErrorEnvelope as AppErrorEnvelopeShape | undefined;
    expect(publicEnvelope).toBeDefined();
    const withCause = {
      code: 'validation',
      message: 'leaky',
      retryable: false,
      cause: new Error('secret internal detail'),
    };
    expect(publicEnvelope?.safeParse(withCause).success).toBe(false);
  });
});
