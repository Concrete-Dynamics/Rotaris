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
 * still gets its pause. The same step installs a capture-phase click listener that writes, at the press itself and
 * before the product's own handler has run, how many children were running and whether the bound had run out
 * (`body[data-running-at-press]`); the press needs that step to have run (`body[data-pause-armed]`), so no press goes
 * unread. A second eval step reads the mark back into the log, and `pauseReading` says how many the pause held. Until
 * the reviewer's finding on fin31 the reading was a second eval waiting on the press's own condition, which a pause
 * landing before its next probe left with nothing to read.
 *
 * Nothing here is product code. It runs only from the live run and its test.
 */

/** A delegated agent's row drawn running (`AgentTree`'s `data-state`). */
export const RUNNING = '.agent-row[data-state="running"]';
const PAUSE_BUTTON = 'button[aria-label="Pause the run"]';
/** How long the first running child may run alone before one is enough for the press. */
export const TWO_RUNNING_WAIT_MS = 45_000;
/** The arming step has run: its bound is counting and its click listener is in place. */
const ARMED = 'body[data-pause-armed="1"]';
/** Two children running, or one once the bound has run out (`body[data-pause-alone]`); either way only once armed. */
export const PAUSE = [
  `${ARMED} .workspace:has(${RUNNING} ~ ${RUNNING}) ${PAUSE_BUTTON}`,
  `${ARMED}[data-pause-alone="1"] .workspace:has(${RUNNING}) ${PAUSE_BUTTON}`,
].join(', ');
/** The mark the press leaves: the running children at the press, negative once the bound had run out. */
export const PRESSED = 'body[data-running-at-press]';
/**
 * Armed when the first child runs: marks `<body>` armed, listens for the press in the capture phase, and marks `<body>`
 * once the bound has passed. Answers `true`, not a string, so the paused composer's read stays the scenario's one quoted
 * eval-at result in the log.
 */
export const ARM_ALONE = `(document.body.dataset.pauseArmed = '1', document.addEventListener('click', (event) => { if (document.body.dataset.runningAtPress === undefined && event.target instanceof Element && event.target.closest('${PAUSE_BUTTON}') !== null) document.body.dataset.runningAtPress = String(document.querySelectorAll('${RUNNING}').length * (document.body.dataset.pauseAlone === '1' ? -1 : 1)); }, true), setTimeout(() => { document.body.dataset.pauseAlone = '1'; }, ${TWO_RUNNING_WAIT_MS}), true)`;
/** Read once the press has left its mark: the running children at the press, negative once the bound had run out. */
export const RUNNING_AT_PAUSE = 'Number(document.body.dataset.runningAtPress)';

/**
 * The two eval steps (`ROTARIS_CAPTURE_EVAL_AT`), each in the waiting form bounded by `waitMs`.
 * @param {number} waitMs
 */
export function pauseEvalSteps(waitMs) {
  return [`${ARM_ALONE}>>${RUNNING}@~${waitMs}`, `${RUNNING_AT_PAUSE}>>${PRESSED}@~${waitMs}`];
}

/** The log line of the reading step, whatever its value. */
const READING = new RegExp(`capture: eval-at \\S+ ${RUNNING_AT_PAUSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .*→ (-?\\d+)\\r?$`, 'm');

/**
 * What the press found and what the pause held: `{ atPress, boundRanOut, held, enough, detail }`. `atPress` is null when the
 * log holds no reading (the press's condition never held).
 * @param {string} log
 * @param {number} held the children the timeline records `paused` by the pause
 */
export function pauseReading(log, held) {
  const m = READING.exec(log);
  const raw = m ? Number(m[1]) : null;
  const atPress = raw === null ? null : Math.abs(raw);
  const boundRanOut = raw !== null && (raw < 0 || Object.is(raw, -0));
  const pressed = atPress === null
    ? 'no reading at the press'
    : `${atPress} child(ren) running at the press${boundRanOut ? `, after the first had run alone for ${TWO_RUNNING_WAIT_MS / 1000} s` : ''}`;
  return { atPress, boundRanOut, held, enough: held >= 2, detail: `${held} held; ${pressed}` };
}
