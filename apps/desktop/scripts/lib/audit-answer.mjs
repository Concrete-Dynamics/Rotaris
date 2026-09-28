/**
 * What the driver's `eval` answered for one audit expression, read without dying on it.
 *
 * The audit expressions in `ui-audit.mjs` build their result with `JSON.stringify` inside the renderer, so a
 * healthy answer is a string. The driver's `eval` op (`apps/desktop/src/main/driver.ts`) catches a thrown
 * expression and answers `{ error: String(cause) }` instead — an OBJECT, which `JSON.parse` coerced to
 * "[object Object]" and threw on, so one renderer exception on the first view ended the whole sweep and left no
 * evidence pack (docs/defects/fixed/the-window-controls-contract-is-an-object-and-kills-every-ui-audit.md).
 * Here that answer becomes a value the caller records as a named `AUDIT-ERROR` finding, with the view and the
 * expression, and the sweep moves on to the next view.
 *
 * @param answer whatever `driver.eval` resolved with
 * @returns `{ ok: true, value }` with the parsed audit, or `{ ok: false, error }` saying what came back instead
 */
export function readAuditAnswer(answer) {
  if (answer !== null && typeof answer === 'object' && 'error' in answer) {
    return { ok: false, error: `the renderer threw: ${String(answer.error)}` };
  }
  if (typeof answer !== 'string') {
    return { ok: false, error: `the audit answered ${answer === null ? 'null' : typeof answer} rather than the JSON string it builds` };
  }
  try {
    return { ok: true, value: JSON.parse(answer) };
  } catch (cause) {
    return { ok: false, error: `the audit answered unreadable JSON: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}
