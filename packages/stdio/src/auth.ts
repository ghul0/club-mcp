import {
  createBasicAuthProvider,
  err,
  ok,
  validationError,
  type AppError,
  type AuthProvider,
  type Result,
} from '@hhc-mcp/core';
import type { AuthFileData, AuthFileStore } from './auth-file.js';

export type AuthMode = 'auto' | 'basic' | 'cookie';

const REFRESH_TIMEOUT_MS = 20_000;

const parseNonce = (html: string): string | null => {
  const scoped = /fluentComAdmin[\s\S]{0,4000}?"nonce"\s*:\s*"([A-Za-z0-9_-]{6,})"/.exec(html);
  if (scoped?.[1] !== undefined) {
    return scoped[1];
  }
  const any = /"nonce"\s*:\s*"([A-Za-z0-9_-]{6,})"/.exec(html);
  return any?.[1] ?? null;
};

export interface CookieAuthDeps {
  readonly baseUrl: string;
  readonly cookie: string;
  readonly nonce: string;
  readonly store?: AuthFileStore | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

export const createCookieAuthProvider = (deps: CookieAuthDeps): AuthProvider => {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = deps.timeoutMs ?? REFRESH_TIMEOUT_MS;
  const cookie = deps.cookie;
  let nonce = deps.nonce;

  const headers = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (cookie !== '') {
      out.cookie = cookie;
    }
    if (nonce !== '') {
      out['x-wp-nonce'] = nonce;
    }
    return out;
  };

  const onUnauthorized = async (): Promise<boolean> => {
    if (cookie === '') {
      return false;
    }
    const root = new URL('/', deps.baseUrl).toString();
    const res = await fetchImpl(root, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'text/html', cookie },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status < 200 || res.status > 299) {
      return false;
    }
    const next = parseNonce(await res.text());
    if (next === null) {
      return false;
    }
    nonce = next;
    deps.store?.setNonce(next);
    return true;
  };

  return { headers, onUnauthorized };
};

export interface ResolvedAuth {
  readonly authHeader?: () => string;
  readonly auth?: AuthProvider;
}

export interface ResolveAuthDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly baseUrl: string;
  readonly store?: AuthFileStore | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
}

const pick = (primary: string | undefined, fallback: string | undefined): string => {
  if (primary !== undefined && primary !== '') {
    return primary;
  }
  if (fallback !== undefined && fallback !== '') {
    return fallback;
  }
  return '';
};

export const resolveAuth = (deps: ResolveAuthDeps): Result<ResolvedAuth, AppError> => {
  const { env } = deps;
  const fileData: AuthFileData = deps.store ? deps.store.read() : {};

  const modeRaw = env['HHC_AUTH_MODE'] ?? 'auto';
  if (modeRaw !== 'auto' && modeRaw !== 'basic' && modeRaw !== 'cookie') {
    return err(validationError(`HHC_AUTH_MODE must be one of auto|basic|cookie, received "${modeRaw}"`));
  }
  const mode: AuthMode = modeRaw;

  const user = pick(env['HHC_USER'], fileData.user);
  const appPass = pick(env['HHC_APP_PASS'], fileData.app_pass);
  const cookie = pick(env['HHC_COOKIE'], fileData.cookie);
  const envNonce = pick(env['HHC_WP_NONCE'], env['HHC_NONCE']);
  const nonce = pick(envNonce, fileData.nonce);

  const hasBasic = user !== '' && appPass !== '';
  const hasCookie = cookie !== '';

  const useBasic = (): Result<ResolvedAuth, AppError> => {
    if (!hasBasic) {
      return err(
        validationError(
          'basic auth requires HHC_USER and HHC_APP_PASS (or user/app_pass in the auth file)',
        ),
      );
    }
    return ok({ authHeader: createBasicAuthProvider(user, appPass) });
  };

  const useCookie = (): Result<ResolvedAuth, AppError> => {
    if (!hasCookie) {
      return err(
        validationError(
          'cookie auth requires HHC_COOKIE or an auth file with a cookie (set HHC_AUTH_FILE)',
        ),
      );
    }
    return ok({
      auth: createCookieAuthProvider({
        baseUrl: deps.baseUrl,
        cookie,
        nonce,
        store: deps.store,
        fetchImpl: deps.fetchImpl,
      }),
    });
  };

  if (mode === 'basic') {
    return useBasic();
  }
  if (mode === 'cookie') {
    return useCookie();
  }
  if (hasBasic) {
    return useBasic();
  }
  if (hasCookie) {
    return useCookie();
  }
  return err(
    validationError(
      'no usable credentials: set HHC_USER+HHC_APP_PASS, or HHC_COOKIE / an HHC_AUTH_FILE containing a cookie',
    ),
  );
};
