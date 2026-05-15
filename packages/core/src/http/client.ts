import type { z } from 'zod';
import type { Result } from '../result.js';
import { err, ok } from '../result.js';
import type { AppError } from '../errors.js';
import {
  externalService,
  externalServiceNonRetryable,
  rateLimit,
  upstreamForbidden,
  upstreamNotFound,
  upstreamUnauthorized,
} from '../errors.js';

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly allowedBaseUrls?: ReadonlyArray<string>;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly authHeader?: () => string;
  readonly userAgent?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export interface GetClient {
  get: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    query?: Record<string, string | number | boolean | undefined>,
  ) => Promise<Result<z.infer<TSchema>, AppError>>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_USER_AGENT = 'hhc-mcp/0.0.0 (+https://github.com/ghul0/club-mcp)';
const BACKOFF_BASE_MS: ReadonlyArray<number> = [250, 1000, 2500];

export const FLUENT_COMMUNITY_API_PREFIX = '/wp-json/fluent-community/v2';

const normalizeBaseUrl = (raw: string): string => {
  const trimmed = raw.replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  return `${parsed.protocol}//${parsed.host}`;
};

const requireHttps = (raw: string): void => {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error(`baseUrl must use https: received ${parsed.protocol}`);
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const jitter = (ms: number): number => {
  const span = ms * 0.2;
  const delta = (Math.random() * 2 - 1) * span;
  return Math.max(0, Math.round(ms + delta));
};

const backoffMs = (attempt: number): number => {
  const index = attempt < BACKOFF_BASE_MS.length ? attempt : BACKOFF_BASE_MS.length - 1;
  const base = BACKOFF_BASE_MS[index] ?? 2500;
  return jitter(base);
};

const isTransientStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status <= 599);

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string => {
  const url = new URL(`${baseUrl}${FLUENT_COMMUNITY_API_PREFIX}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const mapStatusToError = (status: number): AppError => {
  if (status === 401) {
    return upstreamUnauthorized('upstream returned 401');
  }
  if (status === 403) {
    return upstreamForbidden('upstream returned 403');
  }
  if (status === 404) {
    return upstreamNotFound('upstream returned 404');
  }
  if (status === 429) {
    return rateLimit('upstream rate limit (429)');
  }
  if (status >= 500 && status <= 599) {
    return externalService(`upstream server error (${String(status)})`);
  }
  return externalServiceNonRetryable(`upstream client error (${String(status)})`);
};

const isAbortError = (e: unknown): boolean => {
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return true;
    }
  }
  return false;
};

const formatZodIssues = (error: z.ZodError): string => {
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length === 0 ? '<root>' : i.path.join('.');
    return `${path}: ${i.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
  return `response schema validation failed: ${issues.join('; ')}${suffix}`;
};

export function createHttpClient(options: HttpClientOptions): GetClient {
  requireHttps(options.baseUrl);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const allowlist = (options.allowedBaseUrls ?? [options.baseUrl]).map(normalizeBaseUrl);
  if (!allowlist.includes(baseUrl)) {
    throw new Error(`baseUrl ${baseUrl} not in allowedBaseUrls`);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetchImpl: typeof globalThis.fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const authHeader = options.authHeader;

  const performOnce = async (url: string): Promise<Response | AppError> => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': userAgent,
    };
    if (authHeader) {
      headers.authorization = authHeader();
    }
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response;
    } catch (e: unknown) {
      if (isAbortError(e)) {
        return externalService(`upstream request timed out after ${String(timeoutMs)}ms`, { cause: e });
      }
      return externalService('upstream network error', { cause: e });
    }
  };

  const run = async <TSchema extends z.ZodTypeAny>(
    url: string,
    schema: TSchema,
  ): Promise<Result<z.infer<TSchema>, AppError>> => {
    let lastError: AppError = externalService('no attempts performed');
    const totalAttempts = maxRetries + 1;
    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      const outcome = await performOnce(url);

      if (!(outcome instanceof Response)) {
        lastError = outcome;
        if (attempt < totalAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return err(lastError);
      }

      const response = outcome;
      const status = response.status;

      if (status >= 300 && status <= 399) {
        return err(externalService(`upstream redirect not allowed (${String(status)})`));
      }

      if (status >= 200 && status <= 299) {
        let body: unknown;
        try {
          body = await response.json();
        } catch (e: unknown) {
          return err(externalServiceNonRetryable('failed to parse upstream JSON', { cause: e }));
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return err(externalServiceNonRetryable(formatZodIssues(parsed.error)));
        }
        return ok(parsed.data as z.infer<TSchema>);
      }

      lastError = mapStatusToError(status);

      if (isTransientStatus(status) && attempt < totalAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }

      return err(lastError);
    }

    return err(lastError);
  };

  return {
    get: <TSchema extends z.ZodTypeAny>(
      path: string,
      schema: TSchema,
      query?: Record<string, string | number | boolean | undefined>,
    ): Promise<Result<z.infer<TSchema>, AppError>> => {
      if (!path.startsWith('/')) {
        throw new Error(`path must start with '/': received ${path}`);
      }
      const url = buildUrl(baseUrl, path, query);
      return run(url, schema);
    },
  };
}
