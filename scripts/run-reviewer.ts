import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { execa } from 'execa';
import { z } from 'zod';

const ArgsSchema = z.object({
  role: z.enum(['a', 'b']),
  pr: z.coerce.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

type Args = z.infer<typeof ArgsSchema>;

const RoleConfig = {
  a: {
    model: 'openai-codex/gpt-5.5:high',
    appIdEnv: 'REV_A_BOT_APP_ID',
    privateKeyEnv: 'REV_A_BOT_PRIVATE_KEY',
    focus: [
      'TDD discipline (tests committed before production code).',
      'Correctness against acceptance criteria.',
      'Zod completeness at every external and tool boundary.',
      'ADR-006 read-only invariant; ADR-007 base URL policy; ADR-008 error model; ADR-016 error envelope.',
      'Naming consistency (club_* tools, @hhc-mcp/* packages).',
      'Coverage thresholds met (80/80/75/80).',
    ].join('\n  - '),
  },
  b: {
    model: 'claude-agent-sdk/claude-opus-4-7:high',
    appIdEnv: 'REV_B_BOT_APP_ID',
    privateKeyEnv: 'REV_B_BOT_PRIVATE_KEY',
    focus: [
      'Security: no credentials, tokens, payloads in code, tests, fixtures, or logs.',
      'Error envelope (ADR-016) used for expected failures.',
      'Package boundaries (ADR-004) respected; no deep cross-package imports.',
      'KISS over SOLID; complexity justified by spec.',
      'Tool surface limited to docs/read-only-tools.md allowlist.',
      'Log redaction per AGENTS.md.',
    ].join('\n  - '),
  },
} as const;

const VerdictSchema = z.enum(['APPROVE', 'REQUEST_CHANGES']);

const ReviewOutputSchema = z.object({
  verdict: VerdictSchema,
  body: z.string().min(1).max(60000),
});

function parseArgs(argv: ReadonlyArray<string>): Args {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (key !== undefined && value !== undefined) {
      flags[key] = value;
    }
  }
  return ArgsSchema.parse(flags);
}

async function getInstallationOctokit(args: Args): Promise<Octokit> {
  const role = RoleConfig[args.role];
  const appId = process.env[role.appIdEnv];
  const privateKey = process.env[role.privateKeyEnv];
  if (appId === undefined || appId === '' || privateKey === undefined || privateKey === '') {
    throw new Error(`Missing ${role.appIdEnv} or ${role.privateKeyEnv}`);
  }

  const appAuth = createAppAuth({ appId, privateKey });
  const appToken = await appAuth({ type: 'app' });
  const appOctokit = new Octokit({ auth: appToken.token });
  const installations = await appOctokit.request('GET /app/installations');
  const installation = installations.data.find(
    (i) => i.account !== null && 'login' in i.account && i.account.login === args.owner,
  );
  if (installation === undefined) {
    throw new Error(`No installation for owner ${args.owner}`);
  }
  const installToken = await appAuth({ type: 'installation', installationId: installation.id });
  return new Octokit({ auth: installToken.token });
}

async function fetchDiff(octokit: Octokit, args: Args): Promise<string> {
  const resp = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: args.owner,
    repo: args.repo,
    pull_number: args.pr,
    mediaType: { format: 'diff' },
  });
  return resp.data as unknown as string;
}

function buildPrompt(args: Args, diff: string): string {
  const role = RoleConfig[args.role];
  return [
    `You are Reviewer-${args.role.toUpperCase()} for ghul0/club-mcp PR #${args.pr}.`,
    '',
    `Focus axes:`,
    `  - ${role.focus}`,
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
    'PR DIFF:',
    diff,
  ].join('\n');
}

async function runPi(model: string, prompt: string): Promise<string> {
  const result = await execa('pi', ['-p', '--model', model], {
    input: prompt,
    reject: false,
    timeout: 600000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`pi exited ${result.exitCode}: ${result.stderr}`);
  }
  return result.stdout;
}

function parseReview(output: string): { verdict: 'APPROVE' | 'REQUEST_CHANGES'; body: string } {
  const verdictMatch = output.match(/^\s*VERDICT:\s*(APPROVE|REQUEST_CHANGES)/im);
  const verdict = verdictMatch === null ? 'REQUEST_CHANGES' : (verdictMatch[1] as 'APPROVE' | 'REQUEST_CHANGES');
  const body = output.trim().slice(0, 60000);
  return ReviewOutputSchema.parse({ verdict, body });
}

async function postReview(
  octokit: Octokit,
  args: Args,
  verdict: 'APPROVE' | 'REQUEST_CHANGES',
  body: string,
): Promise<void> {
  await octokit.pulls.createReview({
    owner: args.owner,
    repo: args.repo,
    pull_number: args.pr,
    event: verdict,
    body,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const octokit = await getInstallationOctokit(args);
  const diff = await fetchDiff(octokit, args);
  const role = RoleConfig[args.role];
  const prompt = buildPrompt(args, diff);
  const piOutput = await runPi(role.model, prompt);
  const { verdict, body } = parseReview(piOutput);
  await postReview(octokit, args, verdict, body);
  process.stderr.write(`Review-${args.role.toUpperCase()} posted: ${verdict} on PR #${args.pr}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`run-reviewer failed: ${message}\n`);
  process.exit(1);
});
