/**
 * Live-run finding D8 of the duress run at `a68f121`
 * (`docs/defects/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`): the renderer threw React
 * error 185 ("Maximum update depth exceeded") seven times while two children streamed, each relayed by the capture as
 * `capture: renderer console: <message> (<source>:<line>)` (`src/main/capture/index.ts`), and the harness read those lines at
 * `info` and passed. The note asked for a count of them in the live run's NOTE lines; this is the reader.
 *
 * `updateDepthErrors` returns every relayed renderer console line naming React error 185 or "Maximum update depth", with its 1-based line
 * number in the log, so the run can say how many there were, and when, against the children's streams.
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
