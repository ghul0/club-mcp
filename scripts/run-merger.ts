import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { z } from 'zod';

const ArgsSchema = z.object({
  pr: z.coerce.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

type Args = z.infer<typeof ArgsSchema>;

const REQUIRED_BOT_LOGINS = ['club-mcp-rev-a-bot[bot]', 'club-mcp-rev-b-bot[bot]'] as const;
const DO_NOT_MERGE_LABEL = 'do-not-merge';

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
  const appId = process.env['MERGER_APP_ID'] ?? process.env['REV_A_BOT_APP_ID'];
  const privateKey = process.env['MERGER_PRIVATE_KEY'] ?? process.env['REV_A_BOT_PRIVATE_KEY'];
  if (appId === undefined || appId === '' || privateKey === undefined || privateKey === '') {
    throw new Error('Missing MERGER_APP_ID/PRIVATE_KEY (or REV_A_BOT_* fallback)');
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

async function bothBotsApproved(octokit: Octokit, args: Args, headSha: string): Promise<boolean> {
  const reviews = await octokit.paginate(octokit.pulls.listReviews, {
    owner: args.owner,
    repo: args.repo,
    pull_number: args.pr,
    per_page: 100,
  });
  const latestByLogin = new Map<string, { state: string; sha: string }>();
  for (const r of reviews) {
    const login = r.user?.login;
    if (login === undefined || login === null) continue;
    latestByLogin.set(login, { state: r.state ?? '', sha: r.commit_id ?? '' });
  }
  return REQUIRED_BOT_LOGINS.every((login) => {
    const review = latestByLogin.get(login);
    return review !== undefined && review.state === 'APPROVED' && review.sha === headSha;
  });
}

async function ciGreen(octokit: Octokit, args: Args, headSha: string): Promise<boolean> {
  const checks = await octokit.checks.listForRef({
    owner: args.owner,
    repo: args.repo,
    ref: headSha,
    per_page: 100,
  });
  const required = checks.data.check_runs.filter((c) => c.name === 'verify');
  if (required.length === 0) return false;
  return required.every((c) => c.status === 'completed' && c.conclusion === 'success');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const octokit = await getInstallationOctokit(args);
  const pr = await octokit.pulls.get({ owner: args.owner, repo: args.repo, pull_number: args.pr });

  if (pr.data.draft) {
    process.stderr.write(`PR #${args.pr} is draft — skipping merge\n`);
    return;
  }
  if (pr.data.labels.some((l) => l.name === DO_NOT_MERGE_LABEL)) {
    process.stderr.write(`PR #${args.pr} has ${DO_NOT_MERGE_LABEL} — skipping merge\n`);
    return;
  }
  if (pr.data.merged) {
    process.stderr.write(`PR #${args.pr} already merged\n`);
    return;
  }
  if (pr.data.mergeable === false) {
    process.stderr.write(`PR #${args.pr} has merge conflicts — skipping\n`);
    return;
  }

  const headSha = pr.data.head.sha;
  if (!(await bothBotsApproved(octokit, args, headSha))) {
    process.stderr.write(`PR #${args.pr} missing required bot approvals on ${headSha}\n`);
    return;
  }
  if (!(await ciGreen(octokit, args, headSha))) {
    process.stderr.write(`PR #${args.pr} CI not green on ${headSha}\n`);
    return;
  }

  const titleMatch = pr.data.title.match(/^(\w+)(?:\([^)]+\))?:/);
  const commitTitle = titleMatch !== null ? pr.data.title : `chore: ${pr.data.title}`;
  await octokit.pulls.merge({
    owner: args.owner,
    repo: args.repo,
    pull_number: args.pr,
    merge_method: 'squash',
    commit_title: commitTitle,
  });
  process.stderr.write(`PR #${args.pr} squash-merged\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`run-merger failed: ${message}\n`);
  process.exit(1);
});
