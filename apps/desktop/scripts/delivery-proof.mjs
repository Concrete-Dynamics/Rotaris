/**
 * The delivery proof (Part AK; ADR-0041's first execution; REQ-TRACE-382..405, 476; REQ-CONFIG-192).
 *
 * Runs the delivery suites through vitest with the JSON reporter and reads the NINE proof assertions back by their
 * `it` titles from `packages/workspace/src/delivery/proof.test.ts`, which runs them against a real store with the
 * engine faked around the fixture parse (`fixture-store.ts`) — Part AJ's fixture store is not merged yet. Every
 * other delivery suite (the store DAL, the transition, the projection, the gate, the guards, the display mapping,
 * the service, main's relay) must be green too.
 *
 * Evidence under `.delivery-proof/`: `vitest.json`, `results.json`.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = join(repo, '.delivery-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const SUITES = [
  'packages/store/src/delivery/delivery.test.ts',
  'packages/workspace/src/delivery/transition.test.ts',
  'packages/workspace/src/delivery/projection.test.ts',
  'packages/workspace/src/delivery/gate.test.ts',
  'packages/workspace/src/delivery/guard.test.ts',
  'packages/workspace/src/delivery/proof.test.ts',
  'packages/ui-core/src/requirements/display.test.ts',
  'apps/desktop/src/workspace-service/delivery.test.ts',
  'apps/desktop/src/main/requirements.test.ts',
];
/** The plan's nine assertions, verbatim as `it` titles in proof.test.ts. */
const ASSERTIONS = {
  everyCardInBacklog: 'fixture store + empty delivery: every card in backlog',
  releaseWritesOneHistoryOneAudit: 'release moves to ready and writes exactly one history + one audit row in one transaction',
  secondActionRefusedWritesNothing: 'a second action on the same requirement while one is in flight is refused with the stated reason and writes nothing',
  holdResumeRoundTrips: 'hold/resume round-trips to the origin column',
  acceptRefusedOnHashMismatch: 'accept refused when the canonical hash differs from the snapshot',
  readerOffersNoWrite: 'a reader handle offers no write method (structural test over the module graph)',
  projectionIdenticalPerGeneration: 'projection value identical across two reads of one generation',
  reapReportsInterrupted: 'reap after a simulated dead run host reports "interrupted, work retained"',
  refusalEnumeratesWithoutRecursing: 'a refused move carries the engine\'s words and what the source column can reach, without recursing (defect 46)',
};

const jsonPath = join(output, 'vitest.json');
const args = ['exec', 'vitest', 'run', ...SUITES, '--reporter=json', `--outputFile=${jsonPath}`];
const started = Date.now();
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 300_000 });
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
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
// Ruled 2026-09-09: the proof prints each of its nine titles with its verdict, so a red names the assertion, not the run.
for (const [key, title] of Object.entries(ASSERTIONS)) console.log(`  ${results[key] ? 'PASS' : 'FAIL'}  ${title}${titles.has(title) ? '' : '  (title not found in the report)'}`);
console.log(`  ${results.allSuitesGreen ? 'PASS' : 'FAIL'}  every delivery suite green (${results.passedTests}/${results.tests} tests, ${results.failedTests} failed, ${report.numFailedTestSuites} suite(s) failed)`);
if (!results.passed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(`delivery-proof PASSED (${results.tests} tests in ${elapsedMs} ms) ${join(output, 'results.json')}`);
