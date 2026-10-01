// @ts-check
/**
 * `part-j-proof`'s steer-rest launch (scenario 3b): a steer still pending when the run comes to rest
 * (REQ-MONITOR-134 with PD-ORCH-005 clause 4). The entry role's second step is held 7 s (`read,wait:7000,read,read`),
 * and both the steer and the pause have to land inside it, the pause AFTER the steer, so that the steer is pending
 * when the run comes to rest.
 *
 * Until 2026-10-01 the Pause step was `@~3400`, the waiting form: it pressed as soon as the control was drawn, which is
 * the moment the run starts, and so raced the Steer press it was meant to follow. Measured twice: on 2026-09-30 the
 * two presses landed a millisecond apart and the Pause went into the opening dialog; on 2026-10-01, at a load average
 * of 3.5, the run started 2.16 s in, the Steer appointment at 1.9 s found no control, and the Pause pressed alone
 * (`docs/defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md`).
 *
 * The schedule now follows the steer instead of guessing at it:
 *  - Steer the run waits (`@~`) for its control AND for the composer's send to have settled (its send pill enabled
 *    again), because the run's start is the app's to choose, and gives up before the text is typed, so the typing
 *    never reaches a dialog that is not open. The second condition was the product's defect, not the proof's: the
 *    composer took focus back when its send settled, and a dialog opened before that lost its focus to the composer
 *    behind it, so the steer's text was typed into the composer and the dialog's Steer refused an empty text. Seen
 *    twice in eight runs on 2026-10-01 and once in the ten after
 *    (`docs/defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`,
 *    repaired the same day; the steer-early launch, `steer-early.mjs`, now opens the dialog inside that window on
 *    purpose). This launch keeps the wait, because what it measures is a steer pending at a rest, not that window;
 *  - the text, then the dialog's Steer, are appointments after that deadline;
 *  - Pause waits (`@from~ms`, the waiting form that starts looking at `from`) from just after the dialog's Steer for the
 *    steer dialog to be gone. The dialog closes only when the steer was accepted (`SteerDialog` in
 *    `packages/ui/src/WorkspaceView.tsx`), so the press follows the steer's delivery, however long that takes, and it
 *    never lands in the dialog. An appointment there (800 ms after the dialog's Steer, the same selector) was tried
 *    first, on 2026-10-01, and found nothing to press on one of the two runs it was tried on.
 * Every step stays inside the held step even when the run starts a few seconds late; a Pause still waiting when the
 * held step ends finds a run past the step it was meant to interrupt, and `steerPendingAtPause` says so.
 *
 * Nothing here is product code. It runs only from the proof and its test.
 */

/** No steer dialog is open: the Pause step's selector starts with this, so it never presses into the dialog. */
export const NO_STEER_DIALOG = 'body:not(:has(.dialog.steer))';

/** The composer's send has settled: its pill is enabled again. The Steer step's selector starts with this. */
export const SEND_SETTLED = 'body:has([data-testid="composer-send"]:not(:disabled))';

/** What the click seam logs for each step (`>>` text, or the selector when there is none), in the order they press. */
export const STEER_REST_WHATS = Object.freeze({
  steer: `${SEND_SETTLED} [data-testid="composer-strip"] [aria-label="Steer the run"]`,
  send: 'Steer',
  pause: `${NO_STEER_DIALOG} [data-testid="composer-strip"] [aria-label="Pause the run"]`,
  continue: '.composer__strip .btn-primary[aria-label="Continue run"]',
});

/** `ROTARIS_CAPTURE_CLICKS` for the launch. */
export const STEER_REST_CLICKS = [
  `${STEER_REST_WHATS.steer}@~3500`,
  `.dialog.steer .dialog-actions .btn-primary>>${STEER_REST_WHATS.send}@4200`,
  `${STEER_REST_WHATS.pause}@4300~8500`,
  `${STEER_REST_WHATS.continue}@~24000`,
].join(';;');

/** `ROTARIS_CAPTURE_TYPE` for the launch: the steer's text, typed into the dialog's focused field, not submitted. */
export const STEER_REST_TYPE = 'go left>>no-enter@3800';

/**
 * Whether the store says the steer was PENDING when the pause was asked for: submitted before `run_pause_requested`,
 * and not injected before it. `null` when it was; otherwise what the timeline shows instead. A launch whose pause came
 * first exercised a pause, not a pending steer at a rest, and is read as that rather than as the product's failure.
 * @param {readonly string[]} names the session's timeline names in ordinal order
 * @returns {string | null}
 */
export function steerPendingAtPause(names) {
  const pause = names.indexOf('run_pause_requested');
  const submitted = names.indexOf('steering_submitted');
  const injected = names.indexOf('steering_injected');
  if (pause < 0) return 'no pause was requested';
  if (submitted < 0) return 'no steer was submitted';
  if (submitted > pause) return 'the pause was requested before the steer was submitted';
  if (injected >= 0 && injected < pause) return 'the steer was injected before the pause was requested, so none was pending at the rest';
  return null;
}
