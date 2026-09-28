// @ts-check
/**
 * Reading ROTARIS_CAPTURE_EVAL_AT's answers back out of a launch's log, one probe at a time.
 *
 * The capture seam (`apps/desktop/src/main/capture/seams.ts`) evaluates every scheduled expression at its offset and logs
 * `capture: eval-at <ms> <expression> → <JSON>`, with the expression exactly as the step list carried it (trimmed, as
 * `parseSteps` trims each step). Two probes scheduled at one offset both fire and both log, so the offset alone does not
 * name a probe: `slash-proof` read the model chip's answer at 5,900 ms and got the usage notice's
 * (`docs/defects/fixed/slash-proofs-model-chip-eval-shares-its-offset-with-the-usage-notice-read.md`). A read here names
 * the offset AND the expression, and a read that still matches more than one logged eval throws rather than choosing.
 *
 * Nothing here is product code. It runs only from the proofs.
 */

/**
 * Every eval the log carries, in the order logged: its offset and the text after it (`<expression> → <JSON>`).
 * @param {string} log
 * @returns {{ at: number, text: string }[]}
 */
export function parseEvals(log) {
  const evals = [];
  // Split on LF and drop a CR: `.` does not match a CR, so a Windows pipe's line would otherwise not match at all.
  for (const line of log.split('\n')) {
    const m = /capture: eval-at (\d+) (.*)$/.exec(line.replace(/\r$/, ''));
    if (m) evals.push({ at: Number(m[1]), text: m[2] });
  }
  return evals;
}

/**
 * The answer of the eval scheduled at `at` with `expression` — parsed as JSON, or the raw text when it is not JSON;
 * `undefined` when no such eval was logged (the launch ended first, or the probe never ran).
 * @param {{ at: number, text: string }[]} evals
 * @param {number} at
 * @param {string} expression the exact text given to ROTARIS_CAPTURE_EVAL_AT before the `@`
 */
export function readEval(evals, at, expression) {
  if (typeof expression !== 'string' || expression.trim() === '') throw new Error(`the eval at ${at} ms needs the expression it reads: the offset alone does not name a probe`);
  const head = `${expression.trim()} → `;
  const found = evals.filter((e) => e.at === at && e.text.startsWith(head));
  if (found.length > 1) throw new Error(`${found.length} evals of one expression logged at ${at} ms — the schedule is ambiguous: ${expression.trim().slice(0, 120)}`);
  if (found.length === 0) return undefined;
  const raw = found[0].text.slice(head.length);
  try { return JSON.parse(raw); } catch { return raw; }
}
