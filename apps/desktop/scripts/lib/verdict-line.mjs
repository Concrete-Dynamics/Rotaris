/**
 * The live run's verdict log line for one check (`live-run.mjs`'s `finish`): `NOTE`, `PASS` or `FAIL`, what was checked, and the
 * detail after a dash when one was given. A verdict pushed with no detail — `lib/crlf-scenario.mjs`'s notes, through `noted` —
 * printed "— undefined" at `ce5f952`, a word that reads like a value the harness lost
 * (`docs/defects/fixed/a-live-run-verdict-with-no-detail-prints-undefined.md`). Absent and null are the same: no detail.
 *
 * Pure, verification only.
 */
export function verdictLine(c) {
  const mark = c.noted ? 'NOTE' : c.passed ? 'PASS' : 'FAIL';
  return `  ${mark}  ${c.what}${c.detail === null || c.detail === undefined ? '' : `  — ${c.detail}`}`;
}
