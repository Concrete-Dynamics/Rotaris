/**
 * Live-run finding D8 of the duress run at `a68f121`
 * (`docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`): the renderer threw React
 * error 185 ("Maximum update depth exceeded") seven times while two children streamed, each relayed by the capture as
 * `capture: renderer console: <message> (<source>:<line>)` (`src/main/capture/index.ts`), and the harness read those lines at
 * `info` and passed. The note asked for a count of them in the live run's NOTE lines; this is the reader.
 *
 * `updateDepthErrors` returns every relayed renderer console line naming React error 185 or "Maximum update depth", with its 1-based line
 * number in the log, so the run can say how many there were, and when, against the children's streams. Since OQ-278's ruling
 * (2026-10-13, R-072) any such line fails the launch (`updateDepthVerdict`); it was a NOTE until then.
 */
const RELAYED = /capture: renderer console: (.*)$/;
// React error 185 (the number written after its '#', which the colour check would read as a literal colour).
const UPDATE_DEPTH = /Minified React error [#]185\b|Maximum update depth exceeded/;

/** The relayed renderer console lines of a launch's log that name React's update-depth error, in log order. */
export function updateDepthErrors(log) {
  const out = [];
  const lines = String(log).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const relayed = RELAYED.exec(lines[i]);
    if (relayed !== null && UPDATE_DEPTH.test(relayed[1])) out.push({ line: i + 1, text: lines[i].trim() });
  }
  return out;
}

/**
 * The verdict a live launch's check takes (OQ-278, ruled 2026-10-13 under R-072): a relayed update-depth error in any live
 * launch is a FAILURE, naming each line; none passes. `count` is what `results.json` keeps as `reactUpdateDepthErrors`.
 * @param {string} name the launch
 * @param {string} log its `app.log`
 */
export function updateDepthVerdict(name, log) {
  const errors = updateDepthErrors(log);
  return {
    passed: errors.length === 0,
    count: errors.length,
    what: `${name}: no relayed renderer console line names React's update-depth error (D8, OQ-278)`,
    detail: errors.length === 0 ? undefined : errors.map((e) => `app.log line ${e.line}: ${e.text}`).join(' | '),
  };
}

/**
 * The replica's run-start decline (`packages/ui-core/src/replica.ts`, `onDiagnostic`, relayed by the shell as
 * `console.warn('[replica] …')`): REQ-SESSION-161's own recovery, read from the code and left as a diagnostic on purpose
 * (docs/defects/fixed/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md, "The declined increment at run
 * start"). The replica declines the increment, reconciles from a whole-session read and draws every row; nothing on screen is
 * wrong. Matched whole, numbers and all, so no other `[replica]` line passes for it.
 */
const REPLICA_RUN_START_DECLINE = /\[replica\] declined increment on [^:]+: earliest-changed \d+ precedes oldest held \d+/;

/**
 * The relayed renderer console lines a proof fails on: every one but the replica's run-start decline above, which a launch
 * meets at a run's start under load and which is no fault (docs/defects/fixed/palette-proof-fails-on-the-replicas-documented-run-start-decline.md).
 * `mission-proof` and `palette-proof` share it; `replicaRunStartDeclines` counts what it let through, for a proof's `results.json`.
 * @param {string[]} errors the launch's `renderer console:` lines
 */
export function unexpectedRendererErrors(errors) {
  return errors.filter((l) => !REPLICA_RUN_START_DECLINE.test(l));
}

/** How many of a launch's relayed renderer console lines are the replica's run-start decline. */
export function replicaRunStartDeclines(errors) {
  return errors.length - unexpectedRendererErrors(errors).length;
}
