import { execa } from 'execa';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const ReviewerSchema = z.object({
  role: z.enum(['a', 'b']),
  model: z.string(),
  focus: z.string(),
});

type Reviewer = z.infer<typeof ReviewerSchema>;

type Mode = 'staged' | 'branch';

const REVIEWERS: ReadonlyArray<Reviewer> = [
  {
    role: 'a',
    model: 'openai-codex/gpt-5.5',
    focus: [
      'TDD discipline (in --staged mode: if production code is staged, matching tests must also be staged; reject impl-without-tests).',
      'Correctness and conformance to AGENTS.md hard rules.',
      'Zod completeness at every external and tool boundary.',
      'ADR-006 read-only invariant; ADR-007 base URL policy; ADR-008 typed errors; ADR-016 error envelope.',
      'Naming consistency: club_* tools, @hhc-mcp/* packages.',
    ].join('\n  - '),
  },
  {
    role: 'b',
    model: 'claude-agent-sdk/claude-opus-4-7',
    focus: [
      'Security: no credentials/tokens/secrets/payloads in code, tests, fixtures, or logs.',
      'Error envelope (ADR-016) used for expected failures.',
      'Package boundaries (ADR-004); no deep cross-package imports.',
      'KISS over SOLID; complexity justified by spec.',
      'Tool surface limited to docs/read-only-tools.md allowlist.',
      'Log redaction per AGENTS.md and SECURITY.md.',
    ].join('\n  - '),
  },
];

const VerdictRegex = /^\s*VERDICT:\s*(APPROVE|REQUEST_CHANGES)/im;

type ReviewResult = {
  role: 'a' | 'b';
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'UNPARSED';
  body: string;
  error?: string;
};

type DiffContext = { mode: Mode; label: string; diff: string };

function resolveMode(): Mode {
  return process.argv.includes('--staged') ? 'staged' : 'branch';
}

async function getDiff(mode: Mode): Promise<DiffContext> {
  if (mode === 'staged') {
    const diffProc = await execa('git', ['diff', '--cached'], { reject: false });
    if (diffProc.exitCode !== 0) {
      throw new Error(`git diff --cached failed: ${diffProc.stderr}`);
    }
    return { mode, label: 'staged-for-commit', diff: diffProc.stdout };
  }
  const headProc = await execa('git', ['rev-parse', 'HEAD']);
  const head = headProc.stdout.trim();
  const base = await resolveBase();
  const diffProc = await execa('git', ['diff', `${base}..HEAD`], { reject: false });
  if (diffProc.exitCode !== 0) {
    throw new Error(`git diff failed: ${diffProc.stderr}`);
  }
  return { mode, label: `${base}..${head}`, diff: diffProc.stdout };
}

async function resolveBase(): Promise<string> {
  const upstream = await execa('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    reject: false,
  });
  if (upstream.exitCode === 0 && upstream.stdout.trim() !== '') {
    return upstream.stdout.trim();
  }
  return 'origin/main';
}

function buildPrompt(reviewer: Reviewer, ctx: DiffContext): string {
  const intro = ctx.mode === 'staged'
    ? `Reviewing STAGED changes about to be committed. TDD context: if production code is present without matching tests in the same staged set, REQUEST_CHANGES.`
    : `Reviewing local branch diff: ${ctx.label}`;
  return [
    `You are Reviewer-${reviewer.role.toUpperCase()} for club-mcp.`,
    intro,
    '',
    `Focus axes:`,
    `  - ${reviewer.focus}`,
    '',
    'Output EXACTLY this format and nothing else:',
    '',
    'VERDICT: APPROVE | REQUEST_CHANGES',
    '',
    '<one paragraph summary, max 4 sentences>',
    '',
    'ISSUES (max 8):',
    '- file:line — issue',
    '(omit ISSUES section if APPROVE with zero issues)',
    '',
    'STRENGTHS (max 3, only if APPROVE):',
    '- ...',
    '',
    'The diff is attached as the first @file context. Do not run shell commands, do not modify files.',
  ].join('\n');
}

async function runReviewer(reviewer: Reviewer, diffPath: string, ctx: DiffContext): Promise<ReviewResult> {
  const prompt = buildPrompt(reviewer, ctx);
  const result = await execa('pi', ['-p', '--model', reviewer.model, '--no-session', `@${diffPath}`, prompt], {
    reject: false,
    timeout: 600000,
  });
  if (result.exitCode !== 0) {
    return {
      role: reviewer.role,
      verdict: 'REQUEST_CHANGES',
      body: '',
      error: `pi exited ${result.exitCode}: ${result.stderr || result.stdout}`,
    };
  }
  const verdictMatch = result.stdout.match(VerdictRegex);
  const captured = verdictMatch?.[1];
  const verdict: ReviewResult['verdict'] = captured === undefined
    ? 'UNPARSED'
    : (captured.toUpperCase() as 'APPROVE' | 'REQUEST_CHANGES');
  return { role: reviewer.role, verdict, body: result.stdout.trim() };
}

function ansi(code: string, text: string): string {
  if (process.stdout.isTTY !== true) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function printResult(result: ReviewResult): void {
  const color = result.verdict === 'APPROVE' ? '32' : '31';
  const tag = ansi(color, `[Reviewer-${result.role.toUpperCase()}] ${result.verdict}`);
  process.stderr.write(`\n${tag}\n`);
  if (result.error !== undefined) {
    process.stderr.write(`error: ${result.error}\n`);
  } else if (result.body !== '') {
    process.stderr.write(`${result.body}\n`);
  }
}

async function main(): Promise<void> {
  if (process.env['SKIP_LOCAL_REVIEW'] === '1') {
    process.stderr.write('SKIP_LOCAL_REVIEW=1 — bypassing dual review (allowed for emergencies, document why)\n');
    return;
  }

  const mode = resolveMode();
  const ctx = await getDiff(mode);
  if (ctx.diff.trim() === '') {
    process.stderr.write(`No ${mode === 'staged' ? 'staged' : 'branch'} changes — skipping review\n`);
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), 'hhc-review-'));
  const diffPath = join(dir, 'diff.patch');
  await writeFile(diffPath, ctx.diff, 'utf8');

  try {
    process.stderr.write(`Running dual review on ${ctx.label} (${ctx.diff.split('\n').length} diff lines)...\n`);
    const results = await Promise.all(REVIEWERS.map((r) => runReviewer(r, diffPath, ctx)));
    for (const r of results) printResult(r);

    const allApproved = results.every((r) => r.verdict === 'APPROVE');
    if (!allApproved) {
      const blockTag = mode === 'staged' ? 'DUAL REVIEW BLOCKED COMMIT' : 'DUAL REVIEW BLOCKED PUSH';
      const override = mode === 'staged'
        ? 'To override (document reason in commit body): SKIP_LOCAL_REVIEW=1 git commit'
        : 'To override (document reason in PR body): SKIP_LOCAL_REVIEW=1 git push';
      process.stderr.write('\n' + ansi('31', blockTag) + '\n');
      process.stderr.write(`${override}\n`);
      process.exit(1);
    }
    process.stderr.write('\n' + ansi('32', 'BOTH REVIEWERS APPROVED') + '\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`local-review failed: ${message}\n`);
  process.exit(1);
});
