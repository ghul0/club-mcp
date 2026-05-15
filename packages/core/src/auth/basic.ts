import { Buffer } from 'node:buffer';
import { err, ok, type Result } from '../result.js';
import { validationError, type AppError } from '../errors.js';

export type BasicAuthProvider = () => string;

export function createBasicAuthProvider(user: string, password: string): BasicAuthProvider {
  if (user.length === 0) {
    throw new Error('basic auth user must be non-empty');
  }
  if (password.length === 0) {
    throw new Error('basic auth password must be non-empty');
  }
  const encoded = Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
  const header = `Basic ${encoded}`;
  return () => header;
}

export function loadBasicAuthFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): Result<BasicAuthProvider, AppError> {
  const user = env['HHC_USER'];
  const password = env['HHC_APP_PASS'];
  if (user === undefined || user === '') {
    return err(validationError('HHC_USER is not set or empty'));
  }
  if (password === undefined || password === '') {
    return err(validationError('HHC_APP_PASS is not set or empty'));
  }
  return ok(createBasicAuthProvider(user, password));
}

export function redactBasicAuth(value: string): string {
  return value.replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [REDACTED]');
}
