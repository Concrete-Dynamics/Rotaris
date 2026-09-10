/**
 * Part AJ proof — the traceability engine (ADR-0040's first execution; spike 7).
 *
 * Three stages, evidence under `.traceability-proof/`:
 *
 *   1. spike    — `traceability.proof.test.ts` generates spike 7's 1,500-document store and 10^3-file / 10^4-site
 *                 tree under `scale/`, measures the parse (REQ-TRACE-501) and the sweep (REQ-TRACE-088) on one
 *                 thread, warm, plus a half-size tree for the linear-growth clause, and writes `spike-results.json`.
 *   2. fixture  — the same test file drives the engine in-thread over a COPY of `fixtures/requirements-store/`
 *                 (never the fixture itself): the expected records and hashes (recomputed independently from the
 *                 document bytes), `check`'s planted findings in REQ-TRACE-091's order, regenerate twice (the
 *                 tombstone first, byte-stable, "already up to date"), the baselines twice (byte-identical), the
 *                 change comparison against a base the test commits, cancellation mid-pass with nothing written,
 *                 and the busy refusal; `fixture-results.json`.
 *   3. process  — the built workspace-service bundle is forked as a real `utilityProcess` by an Electron driver,
 *                 which sends `traceability.operate` (check, regenerate, regenerate) against a second copy of the
 *                 fixture and a `check` over the scale tree cancelled mid-pass through `traceability.cancel` — so
 *                 the real worker thread, the shared cancel flag and the process protocol execute before merge;
 *                 `process-results.json`.
 *
 * `--skip-build` skips the desktop build. The scale tree and the fixture copies are removed at the end (they are
 * TypeScript the linter would otherwise parse); the numbers and texts stay in the JSON and log files.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.traceability-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
// Windows can refuse a removal for a moment after a child process exits or while an indexer holds a new file; retried.
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };
rmSync(output, RM);
mkdirSync(output, { recursive: true });
const fixture = join(app, 'scripts', 'fixtures', 'requirements-store');
const expect = (condition, message) => { if (!condition) throw new Error(message); };
/**
 * Part AJ2: two files planted into each fixture COPY (never the fixture, which Parts AK and AP reuse) for the checks the
 * syntax-tree parser decides — a re-export-only module that rule 1 of the orphan-module check excuses, and a test whose
 * function was renamed while the orphan-test baseline still names the old one, so the check reports the stale entry and
 * the renamed declaration at its own file and line.
 */
const plant = (copy) => {
  writeFileSync(join(copy, 'src', 'barrel.ts'), [
    '// Planted by the proof (Part AJ2): a re-export-only module — imports, re-exports and assignments naming exported',
    '// symbols, nothing executable — which rule 1 of the orphan-module check excuses without a trace or a marker.',
    "import { traced } from './traced';",
    "export { traced } from './traced';",
    "export * from './untraced';",
    'export const alias = traced;',
    '',
  ].join('\n'));
  writeFileSync(join(copy, 'tests', 'renamed.ts'), [
    '// Planted by the proof (Part AJ2): the test below was renamed from testOriginal, which the orphan-test baseline',
    '// still names; the parser locates the renamed declaration at its own line, and no annotation is in its window.',
    '',
    'export function testRenamed(): void {}',
    '',
  ].join('\n'));
  appendFileSync(join(copy, 'docs', 'requirements', 'orphan-tests.txt'), 'tests/renamed.ts::testOriginal\n');
};
const run = (name, command, args, env = {}, timeout = 600_000) => {
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout, env: { ...process.env, ...env } })
    : spawnSync(command, args, { cwd: repo, encoding: 'utf8', timeout, env: { ...process.env, ...env } });
  writeFileSync(join(output, `${name}.log`), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return r;
};

const results = { passed: false };
try {
  if (!process.argv.includes('--skip-build')) {
    const built = run('build', 'pnpm', ['--filter', '@rotaris/desktop', 'build']);
    expect(built.status === 0, `desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
  }
  expect(existsSync(electron), `Electron executable is absent: ${electron}`);

  // 1 + 2: the spike and the in-thread fixture drive, in one vitest invocation (one file, one thread).
  // The two fixture copies live under the system temp directory: they gain a .git and a regenerated artifact, and on
  // Windows an indexer can hold a freshly written tree for seconds after the last process using it has exited — a
  // removal that fails there is a warning, while a leftover under the repository would be TypeScript the linter parses.
  const scratch = mkdtempSync(join(tmpdir(), 'rotaris-traceability-proof-'));
  const fixtureCopy = join(scratch, 'fixture');
  cpSync(fixture, fixtureCopy, { recursive: true });
  plant(fixtureCopy);
  results.scratch = scratch;
  const test = run('vitest', 'pnpm', ['exec', 'vitest', 'run', 'packages/workspace/src/traceability/traceability.proof.test.ts'], { ROTARIS_TRACEABILITY_PROOF: output, ROTARIS_TRACEABILITY_FIXTURE: fixtureCopy });
  expect(test.status === 0, `the proof test file failed (see .traceability-proof/vitest.log):\n${(test.stdout ?? '').split('\n').filter((l) => /×|Error|expected/.test(l)).slice(0, 30).join('\n')}`);
  const spike = JSON.parse(readFileSync(join(output, 'spike-results.json'), 'utf8'));
  const fixtureResults = JSON.parse(readFileSync(join(output, 'fixture-results.json'), 'utf8'));
  results.spike = spike;
  results.fixture = fixtureResults;
  // REQ-TRACE-501 / REQ-TRACE-088: about one second each at the stated scale; the linear clause is the binding one.
  expect(spike.parse.documents >= 1500 && spike.parse.warmMs < 1500, `parse of ${spike.parse.documents} documents took ${spike.parse.warmMs} ms`);
  expect(spike.sweep.files >= 1000 && spike.sweep.sites >= 10_000 && spike.sweep.warmMs < 1500, `sweep of ${spike.sweep.files} files / ${spike.sweep.sites} sites took ${spike.sweep.warmMs} ms`);
  expect(spike.parseHalf.ratio > 1.4 && spike.parseHalf.ratio < 3.0, `parse growth ratio ${spike.parseHalf.ratio} is not linear`);
  expect(spike.sweepHalf.ratio > 1.3 && spike.sweepHalf.ratio < 3.0, `sweep growth ratio ${spike.sweepHalf.ratio} is not linear`);
  // Part AJ2 / OQ-24: the parse-requiring checks are timed over the same tree and recorded; no requirement fixes a budget
  // for them, so the assertions are shape (every file parsed, every test function found) and linear growth, never a bound.
  expect(spike.parser && spike.parser.files >= 1000 && spike.parser.functions === 2000, `the parser did not cover the tree: ${JSON.stringify(spike.parser)}`);
  expect(spike.parser.ratio > 1.3 && spike.parser.ratio < 3.0, `parser growth ratio ${spike.parser.ratio} is not linear`);
  expect(fixtureResults.passed === true, 'the fixture drive did not pass');
  expect(fixtureResults.checkCodes.every((c) => c !== 'requires-parse') && fixtureResults.exemptModules.includes('src/barrel.ts'), 'the parser did not decide the two checks over the fixture');

  // 3: the real process and the real worker thread.
  const processFixture = join(scratch, 'fixture-process');
  cpSync(fixture, processFixture, { recursive: true });
  plant(processFixture);
  const local = join(output, 'local');
  mkdirSync(join(local, 'roaming'), { recursive: true });
  const driver = join(scratch, 'driver.cjs');
  writeFileSync(driver, driverSource());
  const processOut = join(output, 'process-results.json');
  const scale = join(output, 'scale');
  const env = { ...process.env, LOCALAPPDATA: local, APPDATA: join(local, 'roaming'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  const drove = spawnSync(electron, [driver, join(app, 'out', 'main', 'workspace-service.js'), processFixture, scale, processOut], { cwd: app, encoding: 'utf8', timeout: 180_000, windowsHide: true, env });
  writeFileSync(join(output, 'process.log'), `${drove.stdout ?? ''}\n${drove.stderr ?? ''}`);
  expect(drove.status === 0, `the Electron driver exited ${drove.status ?? drove.signal ?? 'unknown'} (see .traceability-proof/process.log)`);
  const proc = JSON.parse(readFileSync(processOut, 'utf8'));
  results.process = proc;
  expect(proc.hello.kind === 'hello' && proc.hello.process === 'workspace-service', 'the service did not answer hello');
  expect(proc.check.kind === 'traceability.result' && proc.check.result.ok === true, `check over the process: ${JSON.stringify(proc.check).slice(0, 300)}`);
  const codes = proc.check.result.value.report.findings.map((f) => f.code);
  expect(JSON.stringify(codes) === JSON.stringify(fixtureResults.checkCodes), `the process path's finding codes differ from the in-thread path's:\n${codes.join(',')}\nvs\n${fixtureResults.checkCodes.join(',')}`);
  expect(proc.regenerate1.result.ok && proc.regenerate1.result.value.outcome === 'regenerated' && proc.regenerate1.result.value.count === fixtureResults.records.length, 'the first regenerate over the process did not regenerate');
  expect(proc.regenerate2.result.ok && proc.regenerate2.result.value.outcome === 'already up to date', 'the second regenerate over the process was not "already up to date"');
  expect(readFileSync(join(processFixture, 'src', 'requirement_ids.ts'), 'utf8') === readFileSync(join(fixtureCopy, 'src', 'requirement_ids.ts'), 'utf8'), 'the artifact written by the process differs from the in-thread one');
  expect(proc.cancel.kind === 'traceability.cancelled' && proc.cancel.cancelled === true, 'the cancel found nothing in flight');
  expect(proc.cancelledCheck.result.ok === false && proc.cancelledCheck.result.error.kind === 'cancelled', `the cancelled check answered ${JSON.stringify(proc.cancelledCheck.result).slice(0, 200)}`);
  expect(proc.cancelNothing.cancelled === false, 'a cancel with nothing in flight did not answer false');
  expect(proc.checkAfterCancel.result.ok === true, 'the worker did not run a job after the cancellation');
  results.passed = true;
} finally {
  // The generated trees and the two fixture copies hold TypeScript the linter would otherwise parse; the numbers,
  // the finding texts, the hashes and the logs stay in the JSON and log files beside this line.
  for (const dir of ['scale', 'scale-half', 'local']) rmSync(join(output, dir), RM);
  if (results.scratch) { try { rmSync(results.scratch, RM); } catch (e) { results.scratchLeftover = String(e); console.warn(`warning: the scratch copies could not be removed (${e.code ?? e}); they are under ${results.scratch}`); } }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
}
if (!results.passed) { console.error(JSON.stringify(results, null, 2)); process.exit(1); }
console.log(`traceability-proof PASSED ${join(output, 'results.json')}`);
console.log(`  parse ${results.spike.parse.documents} documents: ${results.spike.parse.warmMs} ms warm (${results.spike.parse.coldMs} ms cold); half-size ratio ${results.spike.parseHalf.ratio}`);
console.log(`  sweep ${results.spike.sweep.files} files / ${results.spike.sweep.sites} sites: ${results.spike.sweep.warmMs} ms warm (${results.spike.sweep.coldMs} ms cold); half-size ratio ${results.spike.sweepHalf.ratio}`);
console.log(`  parser (TypeScript ${results.spike.parser.version}) over ${results.spike.parser.files} files: ${results.spike.parser.warmMs} ms warm (${results.spike.parser.coldMs} ms cold), ${results.spike.parser.perFileMs} ms/file, load ${results.spike.parser.loadMs} ms; inside the sweep ${results.spike.parser.sweepParsedFiles} files in ${results.spike.parser.sweepParseMs} ms; half-size ratio ${results.spike.parser.ratio}`);
console.log(`  process path: check ${results.process.check.elapsedMs} ms, regenerate ${results.process.regenerate1.elapsedMs} ms, cancelled check ${results.process.cancelledCheck.elapsedMs} ms`);

/** The Electron driver: fork the built workspace service as a utilityProcess and speak the process protocol to it. */
function driverSource() {
  return String.raw`
const { app, utilityProcess } = require('electron');
const fs = require('node:fs');
const [serviceBundle, fixtureRoot, scaleRoot, outFile] = process.argv.slice(2);
const V = 1;
app.whenReady().then(async () => {
  const child = utilityProcess.fork(serviceBundle, [], { stdio: 'pipe', env: process.env });
  child.stdout?.on('data', (b) => process.stdout.write(b));
  child.stderr?.on('data', (b) => process.stderr.write(b));
  let next = 1;
  const pending = new Map();
  let ready;
  const isReady = new Promise((r) => { ready = r; });
  child.on('message', (m) => {
    if (m && m.event && m.event.kind === 'ready') ready();
    if (m && m.event && m.event.kind === 'log') console.log('[service ' + m.event.level + '] ' + m.event.message);
    if (m && typeof m.id === 'number' && m.reply && pending.has(m.id)) { pending.get(m.id)(m.reply); pending.delete(m.id); }
  });
  const request = (request, timeoutMs = 120000) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, resolve);
    child.postMessage({ v: V, id, request });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('no answer to ' + request.kind + ' within ' + timeoutMs + ' ms')); } }, timeoutMs);
  });
  const results = {};
  // Part AJ2: a service that exits before it is asked to fails the drive at once, instead of leaving the driver to wait
  // out the harness's timeout (the first run in a never-built worktree found the bundle absent and stalled 180 s).
  let shuttingDown = false;
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error('the workspace service exited with ' + code + ' before the drive finished');
    fs.writeFileSync(outFile, JSON.stringify({ ...results, failed: 'service exited ' + code }, null, 2));
    app.exit(1);
  });
  try {
    await isReady;
    results.hello = await request({ kind: 'hello' });
    results.check = await request({ kind: 'traceability.operate', workspaceRoot: fixtureRoot, operation: 'check' });
    results.regenerate1 = await request({ kind: 'traceability.operate', workspaceRoot: fixtureRoot, operation: 'regenerate' });
    results.regenerate2 = await request({ kind: 'traceability.operate', workspaceRoot: fixtureRoot, operation: 'regenerate' });
    // a check over the scale tree, cancelled while the worker is inside it: the service's own loop answers the cancel
    const inFlight = request({ kind: 'traceability.operate', workspaceRoot: scaleRoot, operation: 'check' });
    await new Promise((r) => setTimeout(r, 40));
    results.cancel = await request({ kind: 'traceability.cancel', workspaceRoot: scaleRoot, operation: 'check' });
    results.cancelledCheck = await inFlight;
    results.cancelNothing = await request({ kind: 'traceability.cancel', workspaceRoot: scaleRoot, operation: 'check' });
    results.checkAfterCancel = await request({ kind: 'traceability.operate', workspaceRoot: fixtureRoot, operation: 'check' });
    shuttingDown = true;
    await request({ kind: 'shutdown', deadlineMs: 5000 }, 10000);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
    app.exit(0);
  } catch (e) {
    console.error('driver failed: ' + (e && e.stack ? e.stack : e));
    fs.writeFileSync(outFile, JSON.stringify({ ...results, failed: String(e) }, null, 2));
    try { child.kill(); } catch {}
    app.exit(1);
  }
});
`;
}
