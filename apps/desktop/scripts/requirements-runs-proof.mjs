/**
 * The requirements-runs proof (Part AP; ADR-0041's second execution; spec 08 §Runs Started from the Board,
 * §Delivery Queue, §Editing and Creating Requirements; REQ-TRACE-369/375, 417..426, 434..454, 463..483, 498).
 *
 * It builds a REAL scratch Git repository from Part AJ's fixture requirement store, then runs the Part AP suites
 * through vitest with the JSON reporter and reads the EIGHT proof assertions back by their `it` titles from
 * `apps/desktop/src/main/requirements-runs.proof.test.ts`. That suite drives the real delivery service, the real
 * traceability engine (in-thread executor) and main's real run coordinator over the real store and the real Git
 * helper; only the run host is scripted, and it records the live configuration state in force at each request so
 * the elevation's confinement is measured rather than asserted (REQ-TRACE-470/471).
 *
 * The suite is skipped in an ordinary `pnpm test` — it needs the repository and the two directories this script
 * makes — so a red here names an assertion, never a missing fixture. Every other Part AP suite must be green too.
 *
 * Evidence under `.proof/requirements-runs-proof/`: `workspace/` (the scratch repository and the worktrees the launches
 * provisioned), `store/`, `config/`, `vitest.json`, `tests.log`, `suite-results.json`, `results.json`.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = join(repo, '.proof', 'requirements-runs-proof');
const workspace = join(output, 'workspace');
const fixture = join(repo, 'apps', 'desktop', 'scripts', 'fixtures', 'requirements-store');

// A proof wipes its own directory on start and never logs into it before that (the worktrees of the previous run
// hold a fresh `.git`, which Windows can keep open for a moment — hence the retries, handoff-aj §"Traps").
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(workspace, { recursive: true });

const GIT_IDENTITY = { GIT_AUTHOR_NAME: 'rotaris-proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.invalid', GIT_COMMITTER_NAME: 'rotaris-proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.invalid' };
const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...GIT_IDENTITY } }).toString().trim();
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('requirements-runs-proof needs git on PATH: a run from the board provisions a worktree (REQ-GIT-137/140).');
  process.exit(1);
}

// The workspace a launch runs against: Part AJ's fixture store, committed, with the worktree directory ignored so a
// provisioned unit never shows as untracked work in the base checkout.
cpSync(fixture, workspace, { recursive: true });
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n');
git('init', '-q', '-b', 'main');
git('add', '.');
git('commit', '-q', '-m', 'the fixture requirement store');

const SUITES = [
  'apps/desktop/src/main/requirements-runs.proof.test.ts',
  'apps/desktop/src/main/requirements-runs.test.ts',
  'packages/workspace/src/delivery/runs.test.ts',
  'packages/config/src/requirements-section.test.ts',
  'packages/ui/src/requirements/panes/panes.test.ts',
  'apps/desktop/src/workspace-service/delivery.test.ts',
  'packages/workspace/src/delivery/transition.test.ts',
  'packages/workspace/src/delivery/guard.test.ts',
  'apps/desktop/src/run-host/launch.test.ts',
  'packages/workspace/src/delivery/proof.test.ts',
];
/** The plan's five assertions for this row, the restart's sixth and seventh, and the reject's eighth, verbatim as `it` titles in requirements-runs.proof.test.ts. */
const ASSERTIONS = {
  runStartsInItsOwnWorktreeElevated: "release → disclosure → accept: the run starts in a new worktree with the permissive preset, and the composer's next run does not",
  runRowCarriesTheSessionId: 'the run row carries the session id while the unit runs',
  interruptedWorkRetained: 'the run host dies mid-run: the restart reports "interrupted, work retained" and the worktree is still there',
  manualNeverStartsOnItsOwn: "automatic scheduling off: a candidate back in the released column is never dispatched on its own, and the queue quotes the scheduler's reason",
  concurrencyHoldsTheThird: "concurrency 2 holds a third release as deferred with the scheduler's reason quoted",
  // Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` (REQ-TRACE-472/482/464).
  restingCardStartsAfterRestart: 'a card resting in ready across a restart is disclosed and started from the queue, on the worktree its release provisioned',
  // The verifier's second finding on that note (REQ-TRACE-472/482): main's standing disclosure travels on its claim.
  suppressedCardPickedUpAfterRestart: 'a card resting in ready is picked up by automatic scheduling after a restart once the disclosure is suppressed permanently, on its recorded tree',
  // Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md` (REQ-TRACE-423/482/464).
  rejectedCardStartsItsNextUnit: "a rejected card back in ready begins its next unit on a fresh worktree, the rejected unit's worktree kept",
};

const jsonPath = join(output, 'vitest.json');
const args = ['exec', 'vitest', 'run', ...SUITES, '--reporter=json', `--outputFile=${jsonPath}`];
const env = { ...process.env, ROTARIS_REQUIREMENTS_RUNS_PROOF: output, ROTARIS_REQUIREMENTS_RUNS_WORKSPACE: workspace };
const started = Date.now();
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 600_000, env })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 600_000, env });
const elapsedMs = Date.now() - started;
writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);

let report;
try { report = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch (e) { console.error(`no vitest report at ${jsonPath}: ${e}`); process.exit(1); }
const titles = new Map();
for (const file of report.testResults ?? []) for (const t of file.assertionResults ?? []) titles.set(t.title, t.status);

const results = { elapsedMs, suites: report.numTotalTestSuites, tests: report.numTotalTests, passedTests: report.numPassedTests, failedTests: report.numFailedTests };
for (const [key, title] of Object.entries(ASSERTIONS)) results[key] = titles.get(title) === 'passed';
results.allSuitesGreen = test.status === 0 && report.numFailedTests === 0 && report.numFailedTestSuites === 0;
results.passed = results.allSuitesGreen && Object.keys(ASSERTIONS).every((k) => results[k]);
try { results.suite = JSON.parse(readFileSync(join(output, 'suite-results.json'), 'utf8')); } catch { results.suite = null; }
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
// A red names the assertion, not the run (the discipline delivery-proof was ruled into on 2026-09-09).
for (const [key, title] of Object.entries(ASSERTIONS)) console.log(`  ${results[key] ? 'PASS' : 'FAIL'}  ${title}${titles.has(title) ? '' : '  (title not found in the report)'}`);
console.log(`  ${results.allSuitesGreen ? 'PASS' : 'FAIL'}  every Part AP suite green (${results.passedTests}/${results.tests} tests, ${results.failedTests} failed, ${report.numFailedTestSuites} suite(s) failed)`);
if (!results.passed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(`requirements-runs-proof PASSED (${results.tests} tests in ${elapsedMs} ms) ${join(output, 'results.json')}`);
