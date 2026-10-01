// @ts-check
/**
 * `part-j-proof`'s steer-early launch (scenario 2b): the steer dialog opened while the composer's send is still
 * settling (REQ-MONITOR-137). A start's send settles in the renderer only on the `session.subscribe` reply, and the
 * attach's snapshot and the run's events draw "Steer the run" before that reply arrives. Until 2026-10-01 the composer
 * took the focus back when the reply landed, from under a dialog opened in between: the steer's text went into the
 * composer behind the modal, and the dialog's Steer refused an empty text
 * (`docs/defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`).
 *
 * Left to itself the window is the app's and a few milliseconds wide: measured on 2026-10-01 at a load average of about
 * 12, a press as soon as the control was drawn landed after the send had settled in 3 of 3 runs, a press that waited
 * for the control while the send pill was still disabled found it in 2 of 5, and a schedule that tried that first and
 * fell back found it in 0 of 8. So the launch holds the reply (`ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS`, main's seam in
 * `apps/desktop/src/main/commands/session.ts`) and the schedule is:
 *  - Steer the run, pressed only while the send pill is still disabled (`SEND_UNSETTLED`), as soon as it is drawn;
 *  - the text, an appointment after the hold has let the reply go, so the composer has settled before a key is typed;
 *  - the dialog's Steer, after the text.
 * `steerEarlyReading` reads the order back from the log, so a launch that did not open the dialog inside the window,
 * or typed before the reply was released, is the proof's red by name and never a pass that exercised nothing.
 *
 * Nothing here is product code. It runs only from the proof and its test.
 */

/** The composer's send has NOT settled: its pill is still disabled. */
export const SEND_UNSETTLED = 'body:has([data-testid="composer-send"]:disabled)';

/** How long main holds the `session.subscribe` reply after the attach, in ms (`ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS`). */
export const SUBSCRIBE_HOLD_MS = 1500;

/** What the click seam logs for each step, in the order they press. */
export const STEER_EARLY_WHATS = Object.freeze({
  steer: `${SEND_UNSETTLED} [data-testid="composer-strip"] [aria-label="Steer the run"]`,
  send: 'Steer',
});

/** `ROTARIS_CAPTURE_CLICKS` for the launch. */
export const STEER_EARLY_CLICKS = [
  `${STEER_EARLY_WHATS.steer}@~2900`,
  `.dialog.steer .dialog-actions .btn-primary>>${STEER_EARLY_WHATS.send}@5000`,
].join(';;');

/** `ROTARIS_CAPTURE_TYPE` for the launch: the steer's text, typed into whatever holds focus, not submitted. */
export const STEER_EARLY_TYPE = 'go left>>no-enter@4500';

/** The log lines the reading orders. */
const HELD = 'capture: session.subscribe reply held';
const RELEASED = 'capture: session.subscribe reply released';
const TYPED = 'capture: typed "go left"';

/**
 * Whether the launch did what it is for: Steer the run pressed before the held reply was released (so the dialog opened
 * before the send settled), the reply released before the text was typed (so the composer's settling had happened by then),
 * and the dialog's Steer pressed. `null` when it did; otherwise what went otherwise — the proof's red, not the product's.
 * @param {string} log
 * @param {(log: string, whats: readonly string[]) => { what: string, reason: string }[]} unpressed `unpressedClicks`
 * @returns {string | null}
 */
export function steerEarlyReading(log, unpressed) {
  const missed = unpressed(log, Object.values(STEER_EARLY_WHATS));
  if (missed.length > 0) return `${missed.map((m) => `"${m.what}" ${m.reason}`).join('; ')}`;
  const at = (line) => log.indexOf(line);
  const held = at(HELD);
  const released = at(RELEASED);
  const steer = at(`capture: clicked "${STEER_EARLY_WHATS.steer}"`);
  const typed = at(TYPED);
  if (held < 0 || released < 0) return 'the session.subscribe reply was not held';
  // The press may land before the hold begins (the attach not yet acknowledged): the send is unsettled then too.
  if (!(steer < released)) return 'Steer the run was not pressed before the reply was released';
  if (typed < 0 || typed < released) return 'the text was typed before the reply was released';
  return null;
}
