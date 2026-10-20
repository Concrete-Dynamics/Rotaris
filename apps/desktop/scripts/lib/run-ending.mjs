/**
 * How a live run ends, whatever ends it: the last scenario, a ceiling, a launch that overran or exited non-zero, an error
 * the harness itself threw, or a signal.
 *
 * At `8080fbda` the `crlf` launch overran its bound and `launch` threw. The throw reached the process's fatal handler,
 * which deleted the sandbox and exited: no `results.json` was written, so the checks the three earlier scenarios had
 * computed in memory were lost with it, and the failed scenario kept its application logs and nothing it had left in the
 * store — no autopsy, transcript, session log or summary
 * (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`). Two parts repair it:
 *
 *   - `launchFailure` makes a launch that overran or exited non-zero a FAILED check of its scenario, preserves the session
 *     it left (the newest it created, else the newest the store holds, which a follow-up launch continued) the way a
 *     completed scenario's is preserved, and returns the error `launch` throws;
 *   - `createRunEnding` is the one ending every exit path goes through — `finish`, the fatal handlers and the signal
 *     handlers alike: the end-of-run readings, the store copied into the pack, `results.json` with every check computed
 *     so far, the evidence manifest, the verdict lines, and only then the sandbox's removal and the exit. Each step that
 *     throws is reported and the next one still runs, so no step's failure costs the pack its results.
 *
 * Nothing here is product code; `run-ending.test.ts` pins it, a stub launch that throws among it.
 */

/** The error `launch` throws for a launch that overran or exited non-zero, after `launchFailure` recorded it. */
export class LaunchFailure extends Error {
  constructor(scenario, message) {
    super(message);
    this.name = 'LaunchFailure';
    this.scenario = scenario;
  }
}

const describe = (error) => (error instanceof Error ? error.stack ?? error.message : String(error));
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The session a failed launch left: the newest of `after` that `before` did not hold (both are session ids in the store's
 * creation order), else the newest of `after` (a launch that continued a session creates none), else null (no store yet).
 */
export function sessionOfFailedLaunch(before, after) {
  const known = new Set(before ?? []);
  const all = Array.isArray(after) ? after : [];
  const created = all.filter((id) => !known.has(id));
  return created.at(-1) ?? all.at(-1) ?? null;
}

/**
 * Record a launch that overran its bound or exited non-zero: a FAILED check of its scenario naming why, the session it
 * left preserved through `preserve(name, sessionId)` (a preservation that throws is reported, never thrown), and the
 * scenario's entry in `results.scenarios` when the scenario wrote none. Returns the `LaunchFailure` for `launch` to throw.
 * `sessionsAfter` is read only here, so a launch that passed costs no store read.
 */
export function launchFailure({ name, message, before, sessionsAfter, check, preserve, results, warn = console.error }) {
  check(false, `${name}: the launch ended by itself inside its bound, with status 0`, message);
  let sessionId = null;
  try { sessionId = sessionOfFailedLaunch(before, sessionsAfter()); } catch (cause) { warn(`warning: ${name}'s sessions could not be read after its failed launch (${messageOf(cause)})`); }
  if (sessionId !== null) {
    try { preserve(name, sessionId); } catch (cause) { warn(`warning: ${name}'s session ${sessionId} could not be preserved (${messageOf(cause)})`); }
  }
  if (results.scenarios[name] === undefined) results.scenarios[name] = { launch: 'failed', message, sessionId };
  return new LaunchFailure(name, message);
}

/**
 * The run's one ending. `parts`:
 *   `readings`  the end-of-run readings over the store, in order; one that throws is a failed check naming it;
 *   `check`     the run's own `check(passed, what, detail)`;
 *   `allPassed` whether every check recorded so far passed;
 *   `collect`   gathers what goes into `results` before it is written (the store copied into the pack, the evidence, the
 *               traffic), called once;
 *   `write`     writes `results.json`, with every check recorded, from `{ passed, ended }`; one that throws makes the exit 1;
 *   `manifest`  writes the evidence manifest, after `results.json`, so it covers it;
 *   `report`    the verdict lines;
 *   `cleanup`   removes the sandbox — after everything above, since the store and the session files live in it;
 *   `exit`      ends the process with the code;
 *   `warn`      where a step that threw is reported.
 * Returns `end(code, error = null)`: `code` 0 for a run that reached its end, non-zero for a stop; `error` what ended it
 * otherwise (a `LaunchFailure`, which recorded its own check, or any other error, recorded here as a failed check). An
 * error carrying `exitCode` (a signal's) exits with it. A second `end` while one is in progress is reported and ignored.
 */
export function createRunEnding(parts) {
  const warn = parts.warn ?? console.error;
  let ending = false;
  const step = (what, fn) => {
    try { fn(); return true; } catch (cause) { warn(`warning: the run's ending could not ${what} (${messageOf(cause)})`); return false; }
  };
  return function end(code, error = null) {
    if (ending) { warn(`warning: the run was ended again while it was ending (${error === null ? `code ${code}` : messageOf(error)}); the first ending stands`); return; }
    ending = true;
    if (error !== null && !(error instanceof LaunchFailure)) {
      step('record the error that ended it', () => parts.check(false, 'the run reached its end without an error', describe(error)));
    }
    for (const reading of parts.readings ?? []) {
      try { reading(); } catch (cause) {
        step('record a reading that threw', () => parts.check(false, `the end-of-run reading ${reading.name || '(unnamed)'} ran`, messageOf(cause)));
      }
    }
    step('collect the results', () => parts.collect());
    let passed = false;
    step('read the verdict', () => { passed = code === 0 && error === null && parts.allPassed(); });
    const ended = error === null
      ? { by: code === 0 ? 'completion' : 'stop' }
      : { by: error instanceof LaunchFailure ? 'launch-failure' : 'error', ...(error instanceof LaunchFailure ? { scenario: error.scenario } : {}), message: messageOf(error) };
    // A run whose results.json could not be written left no verdict to read, so it does not exit as a pass.
    if (!step('write results.json', () => parts.write({ passed, ended }))) passed = false;
    step('write the evidence manifest', () => parts.manifest());
    step('print the verdicts', () => parts.report({ passed, ended }));
    step('remove the sandbox', () => parts.cleanup());
    parts.exit(typeof error?.exitCode === 'number' ? error.exitCode : passed ? 0 : 1);
  };
}
