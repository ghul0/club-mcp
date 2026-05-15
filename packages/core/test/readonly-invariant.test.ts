import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = join(HERE, '..', 'src');

const FACTORY_WHITELIST: ReadonlyArray<string> = [
  'createHttpClient',
  'createBasicAuthProvider',
  'createAppError',
];

const WRITE_TOOL_NAME_PATTERN = /^(create|update|delete|post|put|patch|edit|add|remove|set)[A-Z_]/;

const EXPORT_DECL_PATTERN =
  /^export\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

const EXPORT_NAMED_PATTERN = /^export\s*\{\s*([^}]+)\s*\}/gm;

const WRITE_VERB_LITERAL_PATTERN = /(['"])(POST|PUT|PATCH|DELETE)\1/;

const NON_GET_METHOD_PATTERN = /method\s*:\s*['"](?!GET['"])([A-Z]+)['"]/;

const collectTsFiles = (dir: string): ReadonlyArray<string> => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (s.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

interface SourceFile {
  readonly path: string;
  readonly rel: string;
  readonly text: string;
}

const loadSources = (): ReadonlyArray<SourceFile> => {
  const files = collectTsFiles(SRC_DIR);
  return files.map((path) => ({
    path,
    rel: relative(SRC_DIR, path),
    text: readFileSync(path, 'utf8'),
  }));
};

const extractExportedNames = (text: string): ReadonlyArray<string> => {
  const names: string[] = [];
  for (const m of text.matchAll(EXPORT_DECL_PATTERN)) {
    const name = m[1];
    if (typeof name === 'string') {
      names.push(name);
    }
  }
  for (const m of text.matchAll(EXPORT_NAMED_PATTERN)) {
    const group = m[1];
    if (typeof group !== 'string') {
      continue;
    }
    for (const raw of group.split(',')) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const aliasMatch = /(?:^|\s+as\s+)([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(trimmed);
      const bare = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
      const picked = aliasMatch?.[1] ?? bare?.[1];
      if (typeof picked === 'string') {
        names.push(picked);
      }
    }
  }
  return names;
};

const sources = loadSources();

describe('read-only invariant (ADR-006)', () => {
  it('finds source files to scan', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('finds whitelisted factory symbols (scanner sanity)', () => {
    const allText = sources.map((s) => s.text).join('\n');
    expect(allText).toContain('createHttpClient');
    expect(allText).toContain('createAppError');
  });

  it('forbids write HTTP verb string literals (POST/PUT/PATCH/DELETE)', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const lines = file.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const m = WRITE_VERB_LITERAL_PATTERN.exec(line);
        if (m) {
          violations.push(`${file.rel}:${String(i + 1)}: contains '${m[2] ?? ''}' literal: ${line.trim()}`);
        }
      }
    }
    expect(violations, `Found write HTTP verb literals:\n${violations.join('\n')}`).toEqual([]);
  });

  it('forbids exported symbols with write-tool name prefixes', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const names = extractExportedNames(file.text);
      for (const name of names) {
        if (FACTORY_WHITELIST.includes(name)) {
          continue;
        }
        if (WRITE_TOOL_NAME_PATTERN.test(name)) {
          violations.push(`${file.rel}: exported symbol '${name}' matches write-tool pattern`);
        }
      }
    }
    expect(violations, `Found write-tool-named exports:\n${violations.join('\n')}`).toEqual([]);
  });

  it('forbids fetch options with non-GET HTTP method', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const lines = file.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const m = NON_GET_METHOD_PATTERN.exec(line);
        if (m) {
          violations.push(`${file.rel}:${String(i + 1)}: method '${m[1] ?? ''}': ${line.trim()}`);
        }
      }
    }
    expect(violations, `Found non-GET method options:\n${violations.join('\n')}`).toEqual([]);
  });

  it("requires redirect: 'manual' in http/client.ts", () => {
    const client = sources.find((s) => s.rel === join('http', 'client.ts'));
    expect(client, 'http/client.ts must exist').toBeDefined();
    if (!client) {
      return;
    }
    expect(client.text).toMatch(/redirect\s*:\s*['"]manual['"]/);
  });
});
