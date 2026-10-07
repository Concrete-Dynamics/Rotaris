// @ts-check
/**
 * The live run's resume scenario (3b, PD-ORCH-005 clauses 3, 4 and 13): when the composer's Pause is pressed, and what
 * the press found.
 *
 * Until 2026-10-07 the Pause was pressed at the first running agent row. In the final default live run at `a68f121`
 * (session `be52b2b7`) that was 86 ms after OQ-213 refused the second delegation, so the pause held one child where
 * `c2a9444`'s held two, and the clauses the scenario exists for were measured on one (live-run finding P7;
 * `docs/defects/fixed/the-resume-scenarios-pause-can-land-on-one-running-child.md`).
 *
 * The press now waits for TWO running children, bounded: an eval step armed when the first child starts marks `<body>`
 * `TWO_RUNNING_WAIT_MS` later, and from then one running child is enough, so a coordinator that never runs two at once
 * still gets its pause. A second eval step, waiting on the same condition as the press, reads how many were running and
 * whether the bound had run out; `pauseReading` reads it back from the log and says how many the pause held.
 *
 * Nothing here is product code. It runs only from the live run and its test.
 */

/** A delegated agent's row drawn running (`AgentTree`'s `data-state`). */
export const RUNNING = '.agent-row[data-state="running"]';
const PAUSE_BUTTON = 'button[aria-label="Pause the run"]';
/** How long the first running child may run alone before one is enough for the press. */
export const TWO_RUNNING_WAIT_MS = 45_000;
/** Two children running, or one once the bound has run out (`body[data-pause-alone]`). */
export const PAUSE = [
  `.workspace:has(${RUNNING} ~ ${RUNNING}) ${PAUSE_BUTTON}`,
  `body[data-pause-alone="1"] .workspace:has(${RUNNING}) ${PAUSE_BUTTON}`,
].join(', ');
/**
 * Armed when the first child runs: marks `<body>` once the bound has passed. Answers `true`, not a string, so the paused
 * composer's read stays the scenario's one quoted eval-at result in the log.
 */
export const ARM_ALONE = `(setTimeout(() => { document.body.dataset.pauseAlone = '1'; }, ${TWO_RUNNING_WAIT_MS}), true)`;
/** Read when the press's condition holds: the running children, negative once the bound had run out. */
export const RUNNING_AT_PAUSE = `document.querySelectorAll('${RUNNING}').length * (document.body.dataset.pauseAlone === '1' ? -1 : 1)`;

/**
 * The two eval steps (`ROTARIS_CAPTURE_EVAL_AT`), each in the waiting form bounded by `waitMs`.
 * @param {number} waitMs
 */
export function pauseEvalSteps(waitMs) {
  return [`${ARM_ALONE}>>${RUNNING}@~${waitMs}`, `${RUNNING_AT_PAUSE}>>${PAUSE}@~${waitMs}`];
}

/**
 * What the press found and what the pause held: `{ atPress, boundRanOut, held, enough, detail }`. `atPress` is null when the
 * log holds no reading (the press's condition never held).
 * @param {string} log
 * @param {number} held the children the timeline records `paused` by the pause
 */
export function pauseReading(log, held) {
  const m = /capture: eval-at \S+ document\.querySelectorAll\('\.agent-row\[data-state="running"\]'\)\.length .* → (-?\d+)\r?$/m.exec(log);
  const raw = m ? Number(m[1]) : null;
  const atPress = raw === null ? null : Math.abs(raw);
  const boundRanOut = raw !== null && (raw < 0 || Object.is(raw, -0));
  const pressed = atPress === null
    ? 'no reading at the press'
    : `${atPress} child(ren) running at the press${boundRanOut ? `, after the first had run alone for ${TWO_RUNNING_WAIT_MS / 1000} s` : ''}`;
  return { atPress, boundRanOut, held, enough: held >= 2, detail: `${held} held; ${pressed}` };
}
