/**
 * A live run's launch that overruns or throws still leaves `results.json`, the manifest and the failed scenario's session in
 * the pack (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`, parts a and b).
 * At `8080fbda` the `crlf` launch threw into the fatal handler, which deleted the sandbox and exited: the three earlier
 * scenarios' checks, computed in memory, were never written, and the failed scenario kept no autopsy or transcript. The
 * readings below drive the ending with a stub launch that throws, and hold `live-run.mjs` to routing every exit path
 * through it. No product code runs here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { LaunchFailure, createRunEnding, launchFailure, sessionOfFailedLaunch } from './run-ending.mjs';

type Check = { passed: boolean; what: string; detail: string | null };

/** A miniature run: its checks, its results, and a log of the ending's steps in the order they ran. */
function miniRun({ throwing = {} as Record<string, boolean> } = {}) {
  const checks: Check[] = [];
  const steps: string[] = [];
  const warnings: string[] = [];
  const results: { scenarios: Record<string, unknown>; checks?: Check[] } = { scenarios: {} };
  let written: Record<string, unknown> | null = null;
  let exitCode: number | null = null;
  const check = (passed: boolean, what: string, detail?: string) => { checks.push({ passed: Boolean(passed), what, detail: detail ?? null }); return Boolean(passed); };
  const maybeThrow = (what: string) => { steps.push(what); if (throwing[what]) throw new Error(`${what} broke`); };
  const preserved: Array<[string, string]> = [];
  const preserve = (name: string, sessionId: string) => { steps.push(`preserve ${name} ${sessionId}`); preserved.push([name, sessionId]); };
  function checkToolRecord() { maybeThrow('reading'); }
  const end = createRunEnding({
    readings: [checkToolRecord],
    check,
    allPassed: () => checks.every((c) => c.passed),
    collect: () => maybeThrow('collect'),
    write: ({ passed, ended }: { passed: boolean; ended: unknown }) => { maybeThrow('write'); results.checks = checks; written = JSON.parse(JSON.stringify({ ...results, passed, ended })); },
    manifest: () => maybeThrow('manifest'),
    report: () => maybeThrow('report'),
    cleanup: () => maybeThrow('cleanup'),
    exit: (code: number) => { steps.push(`exit ${code}`); exitCode = code; },
    warn: (line: string) => { warnings.push(line); },
  });
  return { checks, steps, warnings, results, preserved, preserve, check, end, written: () => written as Record<string, any> | null, exitCode: () => exitCode };
}

/** The stub launch: the harness's own `launch` past its wait, for a launch the bound ended (SIGKILL, null status). */
async function stubLaunch(run: ReturnType<typeof miniRun>, name: string): Promise<string> {
  const result = { status: null, signal: 'SIGKILL', timedOut: true };
  if (result.status !== 0) {
    throw launchFailure({ name, message: `${name} exited ${result.signal} (the harness's limit of 522320 ms)`, before: ['s1', 's2', 's3'], sessionsAfter: () => ['s1', 's2', 's3', 's4'], check: run.check, preserve: run.preserve, results: run.results, warn: () => {} });
  }
  return '';
}

describe('a live run ended by a launch that overran or threw (defect parts a and b)', () => {
  it('a stub launch that throws ends the run with every earlier check, a failed check of its scenario, results.json and the manifest written', async () => {
    const run = miniRun();
    // The three scenarios before it, each with its checks computed in memory, as `terminal`, `frictions` and `frictions-cut` had.
    run.check(true, 'terminal: the run completed');
    run.check(true, 'frictions: the run completed');
    run.check(true, 'frictions-cut: the run completed');
    // The throw reaches the fatal handler, which ends the run through the one ending.
    await stubLaunch(run, 'crlf').catch((error: unknown) => run.end(1, error));
    const written = run.written();
    expect(written).not.toBeNull();
    expect(written!.checks.map((c: Check) => c.what)).toEqual([
      'terminal: the run completed', 'frictions: the run completed', 'frictions-cut: the run completed',
      'crlf: the launch ended by itself inside its bound, with status 0',
    ]);
    expect(written!.checks.at(-1)).toMatchObject({ passed: false, detail: expect.stringMatching(/crlf exited SIGKILL/) });
    expect(written!.passed).toBe(false);
    expect(written!.ended).toEqual({ by: 'launch-failure', scenario: 'crlf', message: expect.stringMatching(/522320 ms/) });
    expect(written!.scenarios.crlf).toMatchObject({ launch: 'failed', sessionId: 's4' });
    // The session it left is preserved first, the store read and results written next, the manifest after results.json
    // (so it covers it), and the sandbox removed only then.
    expect(run.steps).toEqual(['preserve crlf s4', 'reading', 'collect', 'write', 'manifest', 'report', 'cleanup', 'exit 1']);
    expect(run.exitCode()).toBe(1);
  });

  it('an error that is not a launch failure is recorded as a failed check of the run, and the ending still writes the pack', () => {
    const run = miniRun();
    run.check(true, 'sign-in: the provider was added');
    run.end(1, new TypeError("Cannot read properties of undefined (reading 'session_id')"));
    expect(run.written()!.checks.map((c: Check) => [c.passed, c.what])).toEqual([[true, 'sign-in: the provider was added'], [false, 'the run reached its end without an error']]);
    expect(run.written()!.checks[1].detail).toMatch(/TypeError: Cannot read properties of undefined/);
    expect(run.written()!.ended).toMatchObject({ by: 'error' });
    expect(run.exitCode()).toBe(1);
  });

  it('a reading that throws is a failed check naming it, and a step that throws is reported while every later step still runs', () => {
    const run = miniRun({ throwing: { reading: true, collect: true, manifest: true } });
    run.end(0);
    expect(run.written()!.checks).toEqual([{ passed: false, what: 'the end-of-run reading checkToolRecord ran', detail: 'reading broke' }]);
    expect(run.written()!.passed).toBe(false);
    expect(run.steps).toEqual(['reading', 'collect', 'write', 'manifest', 'report', 'cleanup', 'exit 1']);
    expect(run.warnings.join('\n')).toMatch(/could not collect the results \(collect broke\)/);
    expect(run.warnings.join('\n')).toMatch(/could not write the evidence manifest \(manifest broke\)/);
  });

  it('a write that throws still removes the sandbox and exits, so the key never outlives the run', () => {
    const run = miniRun({ throwing: { write: true } });
    run.end(0);
    expect(run.steps.slice(-2)).toEqual(['cleanup', 'exit 1']);
  });

  it('a run that reached its end passes and exits 0; a ceiling\'s stop is a stop, never a pass', () => {
    const done = miniRun();
    done.check(true, 'a');
    done.end(0);
    expect(done.written()).toMatchObject({ passed: true, ended: { by: 'completion' } });
    expect(done.exitCode()).toBe(0);
    const stopped = miniRun();
    stopped.check(false, 'the spend stayed under the 1.00 USD ceiling');
    stopped.end(1);
    expect(stopped.written()).toMatchObject({ passed: false, ended: { by: 'stop' } });
  });

  it('a signal ends with its own exit code, and a second ending while one is in progress is ignored', () => {
    const run = miniRun();
    run.end(130, Object.assign(new Error('SIGINT: the run was interrupted'), { exitCode: 130 }));
    run.end(1, new Error('a late rejection'));
    expect(run.steps.filter((s) => s === 'write')).toHaveLength(1);
    expect(run.exitCode()).toBe(130);
    expect(run.warnings.join('\n')).toMatch(/ended again while it was ending \(a late rejection\)/);
  });

  it('the failed launch\'s session is the newest it created, else the newest the store holds, else none', () => {
    expect(sessionOfFailedLaunch(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe('d');
    // A follow-up launch continues a session and creates none.
    expect(sessionOfFailedLaunch(['a', 'b'], ['a', 'b'])).toBe('b');
    // A sign-in that failed before the store existed.
    expect(sessionOfFailedLaunch([], [])).toBeNull();
  });

  it('a launch failure whose preservation throws is still a failed check and still the error launch throws', () => {
    const checks: Check[] = [];
    const warnings: string[] = [];
    const results = { scenarios: { crlf: { status: 'running' } } as Record<string, unknown> };
    const error = launchFailure({
      name: 'crlf', message: 'crlf produced no screenshot', before: [], sessionsAfter: () => ['s1'],
      check: (passed: boolean, what: string, detail?: string) => checks.push({ passed, what, detail: detail ?? null }),
      preserve: () => { throw new Error('SQLITE_BUSY'); }, results, warn: (l: string) => warnings.push(l),
    });
    expect(error).toBeInstanceOf(LaunchFailure);
    expect(error.scenario).toBe('crlf');
    expect(checks).toEqual([{ passed: false, what: 'crlf: the launch ended by itself inside its bound, with status 0', detail: 'crlf produced no screenshot' }]);
    expect(warnings.join('\n')).toMatch(/s1 could not be preserved \(SQLITE_BUSY\)/);
    // A scenario that recorded its own entry keeps it.
    expect(results.scenarios.crlf).toEqual({ status: 'running' });
  });
});

describe("live-run.mjs routes every exit path through the one ending (defect parts a and b)", () => {
  const script = readFileSync(join(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');

  it('the fatal and signal handlers end the run through runEnding once it exists, never by deleting the sandbox alone', () => {
    const fatal = /process\.on\(fatal, \(error\) => \{[^\n]*\}\);/.exec(script)?.[0] ?? '';
    expect(fatal).toMatch(/endOnFatal\(1, error\)/);
    expect(fatal).not.toMatch(/cleanup\(false\)/);
    expect(script).toMatch(/if \(runEnding !== null\) \{ runEnding\(code, error\); return; \}/);
    expect(script).toMatch(/endOnFatal\(130, /);
    expect(script).toMatch(/\nrunEnding = createRunEnding\(\{/);
    // `finish` is the same ending, so the budget gate's stop and the last scenario's end write the pack the same way.
    expect(script).toMatch(/function finish\(code\) \{\n {2}runEnding\(code\);\n\}/);
  });

  it('launch throws launchFailure for an overrun, a non-zero exit and a missing screenshot, with the sessions read before it', () => {
    const launch = script.slice(script.indexOf('async function launch('), script.indexOf('\n}\n', script.indexOf('async function launch(')));
    expect(launch).toMatch(/const sessionsBefore = sessionIds\(\);\n {2}const result = await runElectron\(/);
    expect(launch).toMatch(/launchFailure\(\{ name, message, before: sessionsBefore, sessionsAfter: sessionIds, check, preserve: preserveRun, results \}\)/);
    expect(launch).toMatch(/throw failure\(`\$\{name\} exited /);
    expect(launch).toMatch(/throw failure\(`\$\{name\} produced no screenshot`\)/);
    expect(launch).not.toMatch(/throw new Error\(`\$\{name\} exited/);
  });

  it('the end-of-run readings are the ending\'s, read before the store is copied and the sandbox removed', () => {
    const ending = script.slice(script.indexOf('\nrunEnding = createRunEnding({'), script.indexOf('\nfunction finish(code) {'));
    expect(ending).toMatch(/readings: \[checkToolRecord, checkCoordinatorTodo, checkIntentClassification, checkRoutingMisses, checkHandOffCuts, checkNearMissEdits\]/);
    expect(ending).toMatch(/results\.store = preserveStore\(\);/);
    expect(ending).toMatch(/cleanup: \(\) => cleanup\(has\('keep'\)\)/);
  });
});
