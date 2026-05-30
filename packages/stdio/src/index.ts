#!/usr/bin/env node
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHttpClient } from '@hhc-mcp/core';
import { loadStdioConfig } from './env.js';
import { resolveAuth } from './auth.js';
import { createAuthFileStore, type AuthFileStore } from './auth-file.js';
import { createLogger, type Logger } from './logger.js';
import { runStdioServer } from './server.js';

export const packageName = '@hhc-mcp/stdio';

export type MainDeps = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly logger?: Logger;
  readonly exit?: (code: number) => void;
};

export const main = async (deps: MainDeps): Promise<void> => {
  const logger = deps.logger ?? createLogger();
  const exit = deps.exit ?? ((code: number) => {
    process.exit(code);
  });

  const configResult = loadStdioConfig(deps.env);
  if (!configResult.ok) {
    logger.error('config error', {
      code: configResult.error.code,
      message: configResult.error.message,
    });
    exit(1);
    return;
  }

  const config = configResult.value;

  const authFile = deps.env['HHC_AUTH_FILE'];
  const store: AuthFileStore | undefined =
    authFile !== undefined && authFile !== '' ? createAuthFileStore(authFile) : undefined;

  const authResult = resolveAuth({ env: deps.env, baseUrl: config.baseUrl, store });
  if (!authResult.ok) {
    logger.error('config error', {
      code: authResult.error.code,
      message: authResult.error.message,
    });
    exit(1);
    return;
  }
  const client = createHttpClient({
    baseUrl: config.baseUrl,
    ...authResult.value,
  });

  await runStdioServer({ config, client, logger });
};

const isEntrypoint = (): boolean => {
  const argv1 = process.argv[1];
  if (argv1 === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return false;
  }
};

if (isEntrypoint()) {
  main({ env: process.env }).catch((err: unknown) => {
    const logger = createLogger();
    logger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
