import { z } from 'zod';

export type ErrorCode =
  | 'validation'
  | 'auth_missing'
  | 'auth_invalid'
  | 'upstream_unauthorized'
  | 'upstream_forbidden'
  | 'upstream_not_found'
  | 'rate_limit'
  | 'external_service'
  | 'unsupported_auth';

export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly correlation_id?: string;
  readonly cause?: unknown;
}

export interface AppErrorOptions {
  readonly correlation_id?: string;
  readonly cause?: unknown;
}

const errorCodeValues = [
  'validation',
  'auth_missing',
  'auth_invalid',
  'upstream_unauthorized',
  'upstream_forbidden',
  'upstream_not_found',
  'rate_limit',
  'external_service',
  'unsupported_auth',
] as const satisfies readonly [ErrorCode, ...ErrorCode[]];

const ErrorCodeEnvelope = z.enum(errorCodeValues);

export const AppErrorEnvelope = z
  .object({
    code: ErrorCodeEnvelope,
    message: z.string(),
    retryable: z.boolean(),
    correlation_id: z.string().optional(),
    cause: z.unknown().optional(),
  })
  .strict();

const createAppError = (
  code: ErrorCode,
  message: string,
  retryable: boolean,
  opts: AppErrorOptions = {},
): AppError => ({
  code,
  message,
  retryable,
  ...opts,
});

export const validationError = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('validation', message, false, opts);

export const authMissing = (opts?: AppErrorOptions): AppError =>
  createAppError('auth_missing', 'authentication credentials are missing', false, opts);

export const authInvalid = (message = 'authentication credentials are invalid', opts?: AppErrorOptions): AppError =>
  createAppError('auth_invalid', message, false, opts);

export const upstreamUnauthorized = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('upstream_unauthorized', message, false, opts);

export const upstreamForbidden = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('upstream_forbidden', message, false, opts);

export const upstreamNotFound = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('upstream_not_found', message, false, opts);

export const rateLimit = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('rate_limit', message, true, opts);

export const externalService = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('external_service', message, true, opts);

export const unsupportedAuth = (message: string, opts?: AppErrorOptions): AppError =>
  createAppError('unsupported_auth', message, false, opts);
