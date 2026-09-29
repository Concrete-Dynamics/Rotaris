// @ts-check
/**
 * Reading `ROTARIS_CAPTURE_CLICKS` steps back out of a launch's log.
 *
 * The click seam (`apps/desktop/src/main/capture/seams.ts`) logs `capture: clicked "<what>"` for a press, where
 * `<what>` is the step's `>>` text when it has one and its selector otherwise. It logs `capture: no "<what>" control
 * on screen` when nothing matched, and `capture: "<what>" is not under the pointer …` when another element covers
 * the point it pressed. The launch carries on in all three cases. A proof that asserts only on what the press should
 * have caused can therefore pass or fail for a gesture nobody made. `config-proof`'s Discard scenario did that on the
 * Linux sweep of 2026-09-28: Settings stayed on Models, both steps logged `no … control on screen`, and nothing read
 * those lines
 * (`docs/defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md`).
 *
 * Nothing here is product code. It runs only from the proofs.
 */

/**
 * The steps among `whats` that the log does not show pressed, or shows pressed on a covered point, each with the reason.
 * An empty answer means every step was pressed on its own control.
 * @param {string} log
 * @param {readonly string[]} whats each step's `>>` text, or its selector when it has none — exactly as the seam logs it
 * @returns {{ what: string, reason: 'never pressed' | 'covered' }[]}
 */
export function unpressedClicks(log, whats) {
  const text = log.replace(/\r\n/g, '\n');
  const out = [];
  for (const what of whats) {
    if (!text.includes(`capture: clicked "${what}"`)) out.push({ what, reason: /** @type {const} */ ('never pressed') });
    else if (text.includes(`capture: "${what}" is not under the pointer`)) out.push({ what, reason: /** @type {const} */ ('covered') });
  }
  return out;
}
