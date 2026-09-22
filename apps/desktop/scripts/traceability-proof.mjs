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
import { proofIsolationEnv } from './lib/harness.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'traceability-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
// Windows can refuse a removal for a moment after a child process exits or while an indexer holds a new file; retried.
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };
rmSync(output, RM);
mkdirSync(output, { recursive: true });
const fixture = join(app, 'scripts', 'fixtures', 'requirements-store');
const expect = (condition, message) => { if (!condition) throw new Error(message); };
/**
 * Part R2 — the linear-growth assertions, made load-tolerant WITHOUT relaxing them (the plan's Reservations,
 * 2026-09-10: "a ratio of two wall-clock measurements is load-sensitive by construction … wave 3 should give it a
 * floor or measure work instead of time"). This proof went red once at 3.06 against a 3.0 threshold on a machine
 * running five build agents, and passed three times consecutively afterwards.
 *
 * Both halves of the plan's advice are taken, and the threshold is NOT moved:
 *  - **Work, asserted always.** The half-size tree must really be about half — the documents parsed, the files swept
 *    or the files parsed on each side. No clock can tell a proof that, and if it is wrong the timing ratio means
 *    nothing whatever it reads. This is the assertion that cannot be bought off by load.
 *  - **Time, taken as the minimum of three readings and floored.** Load can only make a pass slower, never faster,
 *    so the minimum is the least contaminated estimate (`msMin`, in `traceability.proof.test.ts`). Below the floor,
 *    a wall clock cannot tell two passes apart at all, so the ratio is RECORDED and not asserted, and the line says
 *    so rather than passing silently — a proof that cannot fail is not evidence, and neither is one that pretends
 *    a 3 ms reading measured something.
 */
const GROWTH_FLOOR_MS = 25;
const GROWTH_CEILING = 3.0;
const linear = (label, pair, lower) => {
  const workRatio = Math.round((pair.work.full / Math.max(pair.work.half, 1)) * 100) / 100;
  expect(workRatio > 1.5 && workRatio < 2.6, `${label}: the half-size tree is not about half the work (${pair.work.full} against ${pair.work.half}, ratio ${workRatio})`);
  if (pair.fullMinMs < GROWTH_FLOOR_MS || pair.halfMinMs < GROWTH_FLOOR_MS) {
    console.log(`  NOTE  ${label} growth ratio ${pair.ratio} recorded, NOT asserted: ${pair.fullMinMs} ms against ${pair.halfMinMs} ms is below the ${GROWTH_FLOOR_MS} ms floor at which a wall clock can tell two passes apart (work ratio ${workRatio} asserted instead)`);
    return;
  }
  expect(pair.ratio > lower && pair.ratio < GROWTH_CEILING, `${label} growth ratio ${pair.ratio} is not linear — minimum of the readings ${JSON.stringify(pair.warmRunsMs ?? [])} full against ${JSON.stringify(pair.halfWarmRunsMs ?? pair.warmRunsMs ?? [])} half, work ratio ${workRatio}`);
};

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
  expect(test.status === 0, `the proof test file failed (see .proof/traceability-proof/vitest.log):\n${(test.stdout ?? '').split('\n').filter((l) => /×|Error|expected/.test(l)).slice(0, 30).join('\n')}`);
  const spike = JSON.parse(readFileSync(join(output, 'spike-results.json'), 'utf8'));
  const fixtureResults = JSON.parse(readFileSync(join(output, 'fixture-results.json'), 'utf8'));
  results.spike = spike;
  results.fixture = fixtureResults;
  // REQ-TRACE-501 / REQ-TRACE-088: about one second each at the stated scale; the linear clause is the binding one.
  expect(spike.parse.documents >= 1500 && spike.parse.warmMs < 1500, `parse of ${spike.parse.documents} documents took ${spike.parse.warmMs} ms`);
  expect(spike.sweep.files >= 1000 && spike.sweep.sites >= 10_000 && spike.sweep.warmMs < 1500, `sweep of ${spike.sweep.files} files / ${spike.sweep.sites} sites took ${spike.sweep.warmMs} ms`);
  linear('parse', spike.parseHalf, 1.4);
  linear('sweep', spike.sweepHalf, 1.3);
  // Part AJ2 / OQ-24: the parse-requiring checks are timed over the same tree and recorded; no requirement fixes a budget
  // for them, so the assertions are shape (every file parsed, every test function found) and linear growth, never a bound.
  expect(spike.parser && spike.parser.files >= 1000 && spike.parser.functions === 2000, `the parser did not cover the tree: ${JSON.stringify(spike.parser)}`);
  linear('parser', spike.parser, 1.3);
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
  // No preference root: the loop below strips every `ROTARIS_` key, so this launch deliberately runs
  // without one. `proofIsolationEnv` omits the key rather than naming it undefined.
  const env = { ...process.env, ...proofIsolationEnv({ profileRoot: local, local }), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  const drove = spawnSync(electron, [driver, join(app, 'out', 'main', 'workspace-service.js'), processFixture, scale, processOut], { cwd: app, encoding: 'utf8', timeout: 180_000, windowsHide: true, env });
  writeFileSync(join(output, 'process.log'), `${drove.stdout ?? ''}\n${drove.stderr ?? ''}`);
  expect(drove.status === 0, `the Electron driver exited ${drove.status ?? drove.signal ?? 'unknown'} (see .proof/traceability-proof/process.log)`);
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
  // Part AJ2: the operations through the board's command family answer in the operation reply's one shape (REQ-TRACE-508..512).
  const viaBoard = (r) => (r && r.kind === 'requirements.result' && r.value && r.value.kind === 'traceability.result' ? r.value : null);
  const bc = viaBoard(proc.boardCheck);
  expect(bc !== null && bc.result.ok === true, `check through requirements.operation: ${JSON.stringify(proc.boardCheck).slice(0, 300)}`);
  const boardCodes = bc.result.value.report.findings.map((f) => f.code);
  expect(JSON.stringify(boardCodes) === JSON.stringify(codes.filter((c) => c !== 'artifact')), `the board-path check differs from the direct path after the regeneration:\n${boardCodes.join(',')}`);
  expect(proc.boardCheck.changed && typeof proc.boardCheck.changed.generation === 'number', 'a check through the board did not move the generation');
  expect(proc.boardCancelNothing.value && proc.boardCancelNothing.value.kind === 'traceability.cancelled' && proc.boardCancelNothing.value.cancelled === false, 'a board cancel with nothing in flight did not answer false');
  const br = viaBoard(proc.boardRegenerate);
  expect(br !== null && br.result.ok && br.result.value.outcome === 'already up to date' && proc.boardRegenerate.changed, 'regenerate through the board was not "already up to date" with the generation moved');
  const bb = viaBoard(proc.boardBaselines);
  expect(bb !== null && bb.result.ok && bb.result.value.length === 3 && proc.boardBaselines.changed, 'the baseline update through the board did not write three baselines with the generation moved');
  expect(viaBoard(proc.boardCompare) !== null && proc.boardCompare.changed === undefined, 'compare through the board did not answer in the operation reply shape, or moved the generation');
  const busy = proc.boardBusy.map(viaBoard);
  expect(busy.filter((b) => b && b.result.ok === false && b.result.error.kind === 'busy').length === 1 && busy.filter((b) => b && b.result.ok === true).length === 1, `two concurrent checks did not yield exactly one busy refusal (REQ-TRACE-512): ${JSON.stringify(busy.map((b) => b && b.result.ok))}`);
  const boardValue = proc.board.value;
  expect(boardValue && boardValue.source.kind === 'store' && boardValue.cards.length === fixtureResults.records.length, `the board after the operations: ${JSON.stringify(boardValue).slice(0, 200)}`);
  // REQ-TRACE-258/270: the projection joins the verification state the pass now supplies — no card without one.
  expect(boardValue.cards.every((c) => ['satisfied', 'stale', 'failed'].includes(c.evidence.verification)), `a card lacks its verification evidence state: ${JSON.stringify(boardValue.cards.map((c) => [c.id, c.evidence.verification]))}`);
  results.boardPath = { checkMs: bc.elapsedMs, regenerateMs: br.elapsedMs, baselinesMs: bb.elapsedMs, generation: proc.boardCheck.changed.generation, verification: Object.fromEntries(boardValue.cards.map((c) => [c.id, c.evidence.verification])) };

  // 4: the Settings card's sentences (§1481) over those real replies — the same pure mapping the card renders.
  const ui = run('vitest-ui', 'pnpm', ['exec', 'vitest', 'run', 'packages/ui/src/settings/ProjectSettings.test.ts'], { ROTARIS_TRACEABILITY_PROCESS_RESULTS: processOut });
  expect(ui.status === 0, `the card's sentence test failed over the real replies (see .proof/traceability-proof/vitest-ui.log):\n${(ui.stdout ?? '').split('\n').filter((l) => /×|Error|expected/.test(l)).slice(0, 30).join('\n')}`);
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
console.log(`  board path (requirements.operation): check ${results.boardPath.checkMs} ms, regenerate ${results.boardPath.regenerateMs} ms, baselines ${results.boardPath.baselinesMs} ms; generation ${results.boardPath.generation}; the card's sentences asserted over the real replies`);

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
    // Part AJ2: the same four operations and the cancel through the board's command family, which is how the Settings
    // card reaches them (REQ-TRACE-508..512) — against an OPEN workspace, since the delivery service serves that case.
    results.opened = await request({ kind: 'workspace.open', workspaceRoot: fixtureRoot });
    const board = (command) => request({ kind: 'requirements.command', workspaceRoot: fixtureRoot, command: { workspace: fixtureRoot, ...command }, actor: { kind: 'system' } });
    results.boardCheck = await board({ name: 'requirements.operation', operation: 'check' });
    results.boardCancelNothing = await board({ name: 'requirements.cancel', operation: 'check' });
    results.boardRegenerate = await board({ name: 'requirements.operation', operation: 'regenerate' });
    results.boardBaselines = await board({ name: 'requirements.operation', operation: 'baselines' });
    results.boardCompare = await board({ name: 'requirements.operation', operation: 'compare' });
    results.boardBusy = await Promise.all([board({ name: 'requirements.operation', operation: 'check' }), board({ name: 'requirements.operation', operation: 'check' })]);
    results.board = await board({ name: 'requirements.board' });
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
