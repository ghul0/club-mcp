import { redactKeys, redactBasicAuth } from '@hhc-mcp/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  readonly debug: (message: string, context?: Readonly<Record<string, unknown>>) => void;
  readonly info: (message: string, context?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, context?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, context?: Readonly<Record<string, unknown>>) => void;
};

export type LoggerOptions = {
  readonly minLevel?: LogLevel;
  readonly writer?: (line: string) => void;
};

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const defaultWriter = (line: string): void => {
  process.stderr.write(line + '\n');
};

const buildEntry = (
  level: LogLevel,
  message: string,
  context: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> => {
  const safeContext =
    context === undefined ? undefined : redactKeys({ ...context });
  const base: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: redactBasicAuth(message),
  };
  if (safeContext !== undefined) {
    for (const [key, value] of Object.entries(safeContext)) {
      if (key !== 'ts' && key !== 'level' && key !== 'msg') {
        base[key] = value;
      }
    }
  }
  return base;
};

export const createLogger = (options?: LoggerOptions): Logger => {
  const minLevel: LogLevel = options?.minLevel ?? 'debug';
  const minRank = LEVEL_ORDER[minLevel];
  const writer = options?.writer ?? defaultWriter;

  const emit = (
    level: LogLevel,
    message: string,
    context: Readonly<Record<string, unknown>> | undefined,
  ): void => {
    if (LEVEL_ORDER[level] < minRank) {
      return;
    }
    const entry = buildEntry(level, message, context);
    writer(JSON.stringify(entry));
  };

  return {
    debug: (message, context) => {
      emit('debug', message, context);
    },
    info: (message, context) => {
      emit('info', message, context);
    },
    warn: (message, context) => {
      emit('warn', message, context);
    },
    error: (message, context) => {
      emit('error', message, context);
    },
  };
};
