import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PackageJson {
  name: string;
  type: string;
  bin: Record<string, string>;
  exports: Record<string, { types: string; import: string }>;
  files: string[];
  dependencies: Record<string, string>;
}

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
) as PackageJson;

describe('@hhc-mcp/stdio package.json shape', () => {
  it('has correct name', () => {
    expect(pkg.name).toBe('@hhc-mcp/stdio');
  });

  it('declares ESM type', () => {
    expect(pkg.type).toBe('module');
  });

  it('exposes hhc-mcp bin pointing to dist', () => {
    expect(pkg.bin).toBeDefined();
    expect(Object.values(pkg.bin)).toContain('./dist/index.js');
  });

  it('exports types and import for ".", pointing to dist', () => {
    expect(pkg.exports['.']?.types).toMatch(/dist/);
    expect(pkg.exports['.']?.import).toMatch(/dist/);
  });

  it('whitelists dist/ via files array to prevent src/ and test/ leaks', () => {
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('README.md');
  });

  it('depends on @hhc-mcp/core and the MCP SDK', () => {
    expect(pkg.dependencies['@hhc-mcp/core']).toBeDefined();
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
  });
});
