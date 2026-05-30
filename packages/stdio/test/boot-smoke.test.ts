import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const SRC_INDEX = resolve(PACKAGE_ROOT, 'src/index.ts');
const DIST_INDEX = resolve(PACKAGE_ROOT, 'dist/index.js');

describe('bin entrypoint', () => {
  it('has the node shebang on the very first line of src/index.ts', () => {
    const content = readFileSync(SRC_INDEX, 'utf8');
    const firstLine = content.split('\n', 1)[0] ?? '';
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('emits an executable dist/index.js after build', () => {
    if (!existsSync(DIST_INDEX)) {
      return;
    }
    const stat = statSync(DIST_INDEX);
    const isExecutable = (stat.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
    const content = readFileSync(DIST_INDEX, 'utf8');
    expect(content.split('\n', 1)[0]).toBe('#!/usr/bin/env node');
  });
});

describe('main()', () => {
  it('exits 1 with logged config error when required env vars are missing', async () => {
    const { main } = await import('../src/index.js');
    const exitCodes: number[] = [];
    const errors: { msg: string; ctx?: Record<string, unknown> }[] = [];
    const logger = createLogger({ writer: () => undefined });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(
      (msg: string, ctx?: Readonly<Record<string, unknown>>) => {
        errors.push({ msg, ctx: ctx as Record<string, unknown> | undefined });
      },
    );
    await main({
      env: {},
      logger,
      exit: (code) => {
        exitCodes.push(code);
      },
    });
    expect(exitCodes).toContain(1);
    expect(errorSpy).toHaveBeenCalled();
    const codes = errors.map((e) => (e.ctx as { code?: string } | undefined)?.code);
    expect(codes).toContain('validation');
  });

  it('does not throw and does not call exit when env is valid (transport short-circuited)', async () => {
    const { main } = await import('../src/index.js');
    const exitCodes: number[] = [];
    const logger = createLogger({ writer: () => undefined });

    const serverModule = await import('../src/server.js');
    const runSpy = vi
      .spyOn(serverModule, 'runStdioServer')
      .mockImplementation(() => Promise.resolve());

    await main({
      env: {
        HHC_BASE_URL: 'https://example.test',
        HHC_USER: 'user',
        HHC_APP_PASS: 'pass',
      },
      logger,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    expect(exitCodes).toHaveLength(0);
    expect(runSpy).toHaveBeenCalledTimes(1);
    runSpy.mockRestore();
  });
});

describe('bin via .bin symlink (npx scenario)', () => {
  it('starts main() and lists tools when launched through a symlink', () => {
    if (!existsSync(DIST_INDEX)) {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'hhc-bin-'));
    const link = join(dir, 'hhc-mcp');
    symlinkSync(DIST_INDEX, link);
    const request =
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`;
    const result = spawnSync('node', [link], {
      input: request,
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        HHC_BASE_URL: 'https://club.hyperhuman.pl',
        HHC_AUTH_MODE: 'cookie',
        HHC_COOKIE: 'c=1',
      },
    });
    rmSync(dir, { recursive: true, force: true });
    expect(result.stdout).toContain('"tools"');
  });
});
