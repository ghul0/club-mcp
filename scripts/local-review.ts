import { execa } from 'execa';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const ReviewerSchema = z.object({
  role: z.enum(['a']),
  model: z.string(),
  focus: z.string(),
});

type Reviewer = z.infer<typeof ReviewerSchema>;

const REVIEWERS: ReadonlyArray<Reviewer> = [
  {
    role: 'a',
    model: 'openai-codex/gpt-5.5',
    focus: [
      'TDD discipline (tests committed before production code in the diff history).',
      'Correctness and conformance to AGENTS.md hard rules.',
      'Zod completeness at every external and tool boundary.',
      'ADR-006 read-only invariant; ADR-007 base URL policy; ADR-008 typed errors; ADR-016 error envelope.',
      'Naming consistency: club_* tools, @hhc-mcp/* packages.',
      'Security: no credentials/tokens/secrets/payloads in code, tests, fixtures, or logs.',
      'Package boundaries (ADR-004); no deep cross-package imports.',
      'KISS over SOLID; complexity justified by spec.',
      'Tool surface limited to docs/read-only-tools.md allowlist.',
      'Log redaction per AGENTS.md and SECURITY.md.',
    ].join('\n  - '),
  },
];

const VerdictRegex = /^\s*VERDICT:\s*(APPROVE|REQUEST_CHANGES)/im;

type ReviewResult = {
  role: 'a';
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'UNPARSED';
  body: string;
  error?: string;
};

async function getDiff(): Promise<{ base: string; head: string; diff: string }> {
  const headProc = await execa('git', ['rev-parse', 'HEAD']);
  const head = headProc.stdout.trim();

  const baseRef = await resolveBase();
  const diffProc = await execa('git', ['diff', `${baseRef}..HEAD`], { reject: false });
  if (diffProc.exitCode !== 0) {
    throw new Error(`git diff failed: ${diffProc.stderr}`);
  }
  return { base: baseRef, head, diff: diffProc.stdout };
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

function buildPrompt(reviewer: Reviewer, base: string, head: string): string {
  return [
    `You are Reviewer-${reviewer.role.toUpperCase()} for club-mcp.`,
    `Reviewing local diff: ${base}..${head}`,
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

async function runReviewer(reviewer: Reviewer, diffPath: string, base: string, head: string): Promise<ReviewResult> {
  const prompt = buildPrompt(reviewer, base, head);
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
    process.stderr.write('SKIP_LOCAL_REVIEW=1 — bypassing review (allowed for emergencies, document why)\n');
    return;
  }

  const { base, head, diff } = await getDiff();
  if (diff.trim() === '') {
    process.stderr.write(`No changes between ${base} and ${head} — skipping review\n`);
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), 'hhc-review-'));
  const diffPath = join(dir, 'diff.patch');
  await writeFile(diffPath, diff, 'utf8');

  try {
    process.stderr.write(`Running review on ${base}..${head} (${diff.split('\n').length} diff lines)...\n`);
    const results = await Promise.all(REVIEWERS.map((r) => runReviewer(r, diffPath, base, head)));
    for (const r of results) printResult(r);

    const allApproved = results.every((r) => r.verdict === 'APPROVE');
    if (!allApproved) {
      process.stderr.write('\n' + ansi('31', 'REVIEW BLOCKED PUSH') + '\n');
      process.stderr.write('To override (document reason in PR body): SKIP_LOCAL_REVIEW=1 git push\n');
      process.exit(1);
    }
    process.stderr.write('\n' + ansi('32', 'REVIEWER APPROVED') + '\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`local-review failed: ${message}\n`);
  process.exit(1);
});
