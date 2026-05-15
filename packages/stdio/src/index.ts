#!/usr/bin/env node
import process from 'node:process';
import { createHttpClient, createBasicAuthProvider } from '@hhc-mcp/core';
import { loadStdioConfig } from './env.js';
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
  const authProvider = createBasicAuthProvider(config.user, config.appPass);
  const client = createHttpClient({
    baseUrl: config.baseUrl,
    authHeader: authProvider,
  });

  await runStdioServer({ config, client, logger });
};

const isEntrypoint = (): boolean => {
  const argv1 = process.argv[1];
  if (argv1 === undefined) {
    return false;
  }
  const entryUrl = new URL(`file://${argv1}`).href;
  return import.meta.url === entryUrl;
};

if (isEntrypoint()) {
  main({ env: process.env }).catch((err: unknown) => {
    const logger = createLogger();
    logger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
