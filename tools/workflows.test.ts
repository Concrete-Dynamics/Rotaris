/**
 * The GitHub workflows' hardening and the security checks they carry (R-091; `docs/architecture/hardening.md` §3.5
 * row 10, bundle G2). Every file in `.github/workflows/` is parsed as YAML and held to the rules its header states:
 * - every action pinned by a full 40-hex commit SHA (`tools/dependabot.test.ts` also holds the version comment beside it);
 * - no `pull_request_target`, no persisted checkout credentials;
 * - a read-only token, with the writes named here and nowhere else: `security-events: write` on CodeQL's one job,
 *   `contents: write` on the release workflow's `draft` job; `release.yml` grants nothing at the top, and its one
 *   secret reaches its `sign` job alone;
 * - `ci.yml`'s gate audits the production tree, blocking, before `pnpm check`, and excepts nothing on its command line;
 * - `codeql.yml` analyses `javascript-typescript` with `security-and-quality`, on push to main, pull requests and a
 *   schedule, a superseded run cancelled;
 * - an audit exception in `pnpm-workspace.yaml` names an advisory a reading in `docs/architecture/dependency-alerts/`
 *   holds;
 * - `release.yml`'s build job writes the CycloneDX SBOM after `pnpm package` and uploads it as a workflow artifact of
 *   its own, outside the release directory, until OQ-487 rules whether a release publishes it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const workflowsDir = join(root, '.github', 'workflows');

type Permissions = Record<string, string> | 'read-all' | 'write-all' | undefined;
type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; 'continue-on-error'?: boolean };
type Job = { permissions?: Permissions; steps?: Step[]; environment?: unknown };
type Workflow = {
  on: Record<string, unknown>;
  permissions?: Permissions;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};

const text = (file: string): string => readFileSync(join(workflowsDir, file), 'utf8');
const workflow = (file: string): Workflow => parse(text(file)) as Workflow;
const files = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort();
const stepsOf = (wf: Workflow): Array<{ job: string; step: Step }> =>
  Object.entries(wf.jobs).flatMap(([job, j]) => (j.steps ?? []).map((step) => ({ job, step })));

/** The writes a workflow's job may hold, by `<file>:<job>`; every other grant is `read` or `none`. */
const ALLOWED_WRITES: Record<string, Record<string, string>> = {
  'codeql.yml:analyze': { 'security-events': 'write' },
  'release.yml:draft': { contents: 'write' },
};
/** The workflows whose every job's grant this test reads. */
const GRANTING = ['ci.yml', 'codeql.yml', 'release.yml'];

describe('.github/workflows', () => {
  it('holds the workflows this test knows', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'codeql.yml', 'release.yml']));
  });

  it.each(files)('%s pins every action by a full commit SHA', (file) => {
    const loose = stepsOf(workflow(file))
      .map(({ job, step }) => ({ job, uses: step.uses }))
      .filter((s): s is { job: string; uses: string } => typeof s.uses === 'string' && !s.uses.startsWith('./'))
      .filter((s) => !/^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/.test(s.uses))
      .map((s) => `${s.job}: ${s.uses}`);
    expect(loose).toEqual([]);
  });

  it.each(files)('%s never runs on pull_request_target and never persists checkout credentials', (file) => {
    const wf = workflow(file);
    expect(Object.keys(wf.on)).not.toContain('pull_request_target');
    const persisted = stepsOf(wf)
      .filter(({ step }) => step.uses?.startsWith('actions/checkout@'))
      .filter(({ step }) => step.with?.['persist-credentials'] !== false)
      .map(({ job }) => job);
    expect(persisted).toEqual([]);
  });

  it('gives ci.yml and codeql.yml a read-only token at the top', () => {
    for (const file of ['ci.yml', 'codeql.yml']) expect(workflow(file).permissions, file).toEqual({ contents: 'read' });
  });

  it('gives release.yml no permission at the top, each job granting only what it uses', () => {
    expect(workflow('release.yml').permissions).toEqual({});
  });

  it('grants no write a job of ci.yml, codeql.yml or release.yml is not listed for', () => {
    const extra: string[] = [];
    for (const file of GRANTING) {
      for (const [job, j] of Object.entries(workflow(file).jobs)) {
        const allowed = ALLOWED_WRITES[`${file}:${job}`] ?? {};
        const granted = j.permissions;
        if (granted === undefined) continue;
        if (typeof granted === 'string') {
          extra.push(`${file}:${job}: ${granted}`);
          continue;
        }
        for (const [scope, level] of Object.entries(granted)) {
          if (level === 'read' || level === 'none' || allowed[scope] === level) continue;
          extra.push(`${file}:${job}: ${scope}: ${level}`);
        }
      }
    }
    expect(extra).toEqual([]);
  });

  it('references no secret in ci.yml or codeql.yml', () => {
    for (const file of ['ci.yml', 'codeql.yml']) expect(text(file), file).not.toMatch(/secrets\./);
  });

  it('lets the release signing secret reach the sign job alone', () => {
    const holding = Object.entries(workflow('release.yml').jobs)
      .filter(([, j]) => /secrets\./.test(JSON.stringify(j)))
      .map(([job]) => job);
    expect(holding).toEqual(['sign']);
  });
});

describe('ci.yml — the dependency audit', () => {
  const ci = workflow('ci.yml');
  const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

  it('defines deps:audit as the production audit at high and above', () => {
    expect(scripts['deps:audit']).toBe('pnpm audit --prod --audit-level=high');
  });

  it('runs it in the gate job, blocking, after the install and before pnpm check', () => {
    const runs = (ci.jobs['gate']?.steps ?? []).map((s) => ({ run: s.run?.trim(), soft: s['continue-on-error'] === true }));
    const install = runs.findIndex((s) => s.run === 'pnpm install --frozen-lockfile');
    const audit = runs.findIndex((s) => s.run === 'pnpm deps:audit');
    const check = runs.findIndex((s) => s.run === 'pnpm check');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(install);
    expect(check).toBeGreaterThan(audit);
    expect(runs[audit]?.soft).toBe(false);
  });

  it('audits the whole tree beside it, reporting to the run summary and never failing the job', () => {
    const whole = (ci.jobs['gate']?.steps ?? []).filter(
      (s) => /pnpm audit --audit-level=high/.test(s.run ?? '') && !/--prod/.test(s.run ?? ''),
    );
    expect(whole).toHaveLength(1);
    expect(whole[0]?.['continue-on-error']).toBe(true);
    expect(whole[0]?.run).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(whole[0]?.run).toMatch(/exit \$code/);
  });

  it('excepts no advisory on an audit command line in any workflow', () => {
    const ignoring = files.flatMap((file) =>
      stepsOf(workflow(file))
        .map(({ step }) => step.run ?? '')
        .filter((run) => /pnpm audit/.test(run) && /--ignore/.test(run))
        .map((run) => `${file}: ${run}`),
    );
    expect(ignoring).toEqual([]);
  });

  it('excepts in pnpm-workspace.yaml only an advisory a dependency-alerts reading holds', () => {
    const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
      auditConfig?: { ignoreGhsas?: string[]; ignoreCves?: string[] };
    };
    const alertsDir = join(root, 'docs', 'architecture', 'dependency-alerts');
    const readings = readdirSync(alertsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(join(alertsDir, f), 'utf8'))
      .join('\n');
    const ids = [...(workspace.auditConfig?.ignoreGhsas ?? []), ...(workspace.auditConfig?.ignoreCves ?? [])];
    expect(ids.filter((id) => !readings.includes(id))).toEqual([]);
  });
});

describe('codeql.yml', () => {
  const codeql = workflow('codeql.yml');
  const steps = codeql.jobs['analyze']?.steps ?? [];
  const action = (name: string): number => steps.findIndex((s) => s.uses?.startsWith(`github/codeql-action/${name}@`));

  it('runs on push to main, pull requests and a weekly schedule', () => {
    expect(codeql.on['push']).toEqual({ branches: ['main'] });
    expect(Object.keys(codeql.on)).toEqual(expect.arrayContaining(['pull_request', 'schedule']));
    const schedule = codeql.on['schedule'] as Array<{ cron: string }>;
    expect(schedule).toHaveLength(1);
    expect(schedule[0]?.cron.split(/\s+/)[4]).toMatch(/^[0-6]$/);
  });

  it('cancels a superseded run', () => {
    expect(codeql.concurrency?.['cancel-in-progress']).toBe(true);
  });

  it('has one job, granted exactly contents read, security-events write and actions read', () => {
    expect(Object.keys(codeql.jobs)).toEqual(['analyze']);
    expect(codeql.jobs['analyze']?.permissions).toEqual({ contents: 'read', 'security-events': 'write', actions: 'read' });
  });

  it('initialises javascript-typescript with security-and-quality, then analyses', () => {
    expect(action('init')).toBeGreaterThanOrEqual(0);
    expect(action('analyze')).toBeGreaterThan(action('init'));
    expect(steps[action('init')]?.with).toMatchObject({ languages: 'javascript-typescript', queries: 'security-and-quality' });
    expect(steps[action('init')]?.uses?.split('@')[1]).toBe(steps[action('analyze')]?.uses?.split('@')[1]);
  });
});

describe('release.yml — the SBOM (R-091; OQ-487)', () => {
  const build = workflow('release.yml').jobs['build']?.steps ?? [];
  const at = (match: (s: Step) => boolean): number => build.findIndex(match);
  const writes = (s: Step): boolean => /^pnpm sbom:write "\$env:TAG" apps\/desktop\/release$/.test(s.run?.trim() ?? '');
  const uploadsSbom = (s: Step): boolean =>
    s.uses?.startsWith('actions/upload-artifact@') === true && /-sbom\.cdx\.json$/.test(String(s.with?.['path']));
  const said = (s: Step): string => `${s.run ?? ''} ${JSON.stringify(s.with ?? {})}`;

  it('writes the SBOM in the build job, after pnpm package, for the tag', () => {
    const pkg = at((s) => s.run?.trim() === 'pnpm package');
    expect(pkg).toBeGreaterThanOrEqual(0);
    expect(at(writes)).toBeGreaterThan(pkg);
  });

  it('uploads it as a workflow artifact of its own, failing when it is missing', () => {
    const uploads = build.filter(uploadsSbom);
    expect(uploads).toHaveLength(1);
    expect(String(uploads[0]?.with?.['name'])).toMatch(/^sbom-/);
    expect(uploads[0]?.with?.['if-no-files-found']).toBe('error');
    expect(at(uploadsSbom)).toBeGreaterThan(at(writes));
  });

  it('keeps it out of the release directory, its manifest and the draft until OQ-487 is ruled', () => {
    const intoRelease = stepsOf(workflow('release.yml'))
      .filter(({ step }) => /sbom/i.test(said(step)) && /release-assets/.test(said(step)))
      .map(({ job, step }) => `${job}: ${step.name ?? step.uses ?? ''}`);
    expect(intoRelease).toEqual([]);
    expect(text('release.yml')).toMatch(/OQ-487/);
  });
});
