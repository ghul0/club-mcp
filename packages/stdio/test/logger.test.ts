import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger.js';

type CapturedLine = { line: string; parsed: Record<string, unknown> };

const capture = (): { writer: (line: string) => void; lines: CapturedLine[] } => {
  const lines: CapturedLine[] = [];
  const writer = (line: string): void => {
    lines.push({ line, parsed: JSON.parse(line) as Record<string, unknown> });
  };
  return { writer, lines };
};

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a JSON line per entry to the injected writer', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.info('hello');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.line.endsWith('\n')).toBe(false);
    expect(lines[0]?.parsed['msg']).toBe('hello');
  });

  it('includes ts (ISO), level, msg in output', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.info('boot');

    const entry = lines[0]?.parsed;
    expect(entry).toBeDefined();
    expect(typeof entry?.['ts']).toBe('string');
    expect(() => new Date(entry?.['ts'] as string).toISOString()).not.toThrow();
    expect(new Date(entry?.['ts'] as string).toISOString()).toBe(entry?.['ts']);
    expect(entry?.['level']).toBe('info');
    expect(entry?.['msg']).toBe('boot');
  });

  it('redacts context: password field becomes [REDACTED]', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.info('login', { user: 'ada', password: 'super-secret' });

    const entry = lines[0]?.parsed;
    expect(entry?.['user']).toBe('ada');
    expect(entry?.['password']).toBe('[REDACTED]');
  });

  it('redacts nested context keys from default blocklist', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.warn('req', {
      headers: { authorization: 'Basic abcdef', accept: 'application/json' },
      body: { email: 'a@b.c', token: 'xyz' },
    });

    const entry = lines[0]?.parsed;
    const headers = entry?.['headers'] as Record<string, unknown>;
    const body = entry?.['body'] as Record<string, unknown>;
    expect(headers['authorization']).toBe('[REDACTED]');
    expect(headers['accept']).toBe('application/json');
    expect(body['email']).toBe('[REDACTED]');
    expect(body['token']).toBe('[REDACTED]');
  });

  it('redacts authorization header in the message string', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.error('failed with Basic dXNlcjpwYXNz token');

    const entry = lines[0]?.parsed;
    expect(entry?.['msg']).toBe('failed with Basic [REDACTED] token');
  });

  it("suppresses debug and info when minLevel is 'warn'", () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer, minLevel: 'warn' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toHaveLength(2);
    expect(lines[0]?.parsed['level']).toBe('warn');
    expect(lines[1]?.parsed['level']).toBe('error');
  });

  it('emits all levels when minLevel is debug (default)', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines.map((l) => l.parsed['level'])).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('default writer writes to process.stderr (never stdout)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = createLogger();
    logger.info('boot');

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const arg = stderrSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe('string');
    expect((arg as string).endsWith('\n')).toBe(true);
    const payload = (arg as string).slice(0, -1);
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed['msg']).toBe('boot');
    expect(parsed['level']).toBe('info');
  });

  it('omits context fields when no context is provided', () => {
    const { writer, lines } = capture();
    const logger = createLogger({ writer });

    logger.info('plain');

    const entry = lines[0]?.parsed;
    expect(Object.keys(entry ?? {}).sort()).toEqual(['level', 'msg', 'ts']);
  });
});
