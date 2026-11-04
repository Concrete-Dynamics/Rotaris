// @ts-check
/**
 * Finding a capture step's answer in a launch's log by the text the step echoes, as the application log writes it.
 *
 * The capture seam (`apps/desktop/src/main/capture/probe.ts`, `seams.ts`) echoes each step's selector or expression into
 * the application log ahead of its answer: `capture: probe <selector> → <JSON>`, `capture: inspect-at <ms> <selector> →
 * <JSON>`, `capture: eval-at <ms> <expression> → <JSON>`. Since 2026-11-01 that log runs every line through the one
 * redaction pass (REQ-TOOLS-171; `createAppLog` in `apps/desktop/src/main/app-log.ts`), which masks the value after a
 * name holding a REQ-TOOLS-172 secret segment, `key` among them. So `[data-call-key="call-ok"]` is echoed as
 * `[data-call-key="***"]`, and `key: tr.parentElement.tagName === …` as `key: *** === …`. A reader that looked for the
 * verbatim text found nothing: rows-proof's REQ-CHAT-060 outcomes and git-proof's REQ-GIT-109 cells went unread
 * (docs/archive/defects/rows-and-git-proofs-read-probe-and-eval-text-the-application-logs-redaction-pass-masks.md). The product
 * masks as the requirements say; the readers here accept the masked echo as the step's own.
 *
 * Masking can make two different steps echo alike (`call-failed` and `call-blocked` both read `"***"`), so a reader here
 * never chooses between them by text alone: the end probes are matched in the order the seam logs them, and a timed read
 * that still matches more than one line throws.
 *
 * Nothing here is product code. It runs only from the proofs.
 */

/** The redaction pass's mark (`REDACTION_MARK` in `packages/kernel/src/redaction.ts`). */
const MARK = '***';
/** The separator the seam writes between a step's echo and its answer. */
const ARROW = ' → ';
/**
 * What one mark stands for: one value token, as REQ-TOOLS-171's value extent defines it.
 * @type {Record<string, string>}
 */
const VALUE_OF = {
  [`"${MARK}"`]: '"[^"]*"',
  [`'${MARK}'`]: "'[^']*'",
  [MARK]: '[^\\s"\']+',
};

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `logged` is `text` as the application log writes it: the same text, or the text with value tokens replaced
 * by the mark. A mark stands for exactly one value token, as the pass masks one (REQ-TOOLS-171's value extent): `"***"`
 * for a double-quoted value, `'***'` for a single-quoted one, and a bare `***` for a run with no whitespace or quote. So
 * `({ key: *** })` is the echo of `({ key: a.b })` and not of `({ key: a.b, more: 1 })`.
 * @param {string} logged
 * @param {string} text
 */
export function loggedAs(logged, text) {
  if (logged === text) return true;
  if (!logged.includes(MARK)) return false;
  const parts = logged.split(/("\*\*\*"|'\*\*\*'|\*\*\*)/);
  const pattern = parts.map((part, i) => (i % 2 === 0 ? escape(part) : VALUE_OF[part] ?? escape(part))).join('');
  return new RegExp('^' + pattern + '$').test(text);
}

/**
 * The answer after `text`'s echo in `rest` (`<echo> → <answer>`), or null when `rest` does not begin with its echo. The
 * echo ends at the first arrow it can end at, so an arrow inside the answer does not cut it.
 * @param {string} rest
 * @param {string} text the step's selector or expression, trimmed as the seam trims each step
 * @returns {string | null}
 */
export function answerAfter(rest, text) {
  const t = text.trim();
  if (rest.startsWith(t + ARROW)) return rest.slice(t.length + ARROW.length);
  if (!rest.includes(MARK)) return null;
  for (let i = rest.indexOf(ARROW); i !== -1; i = rest.indexOf(ARROW, i + 1)) {
    if (loggedAs(rest.slice(0, i), t)) return rest.slice(i + ARROW.length);
  }
  return null;
}

/** @param {string} log */
const linesOf = (log) => log.split('\n').map((line) => line.replace(/\r$/, ''));

/** @param {string} raw */
const parsed = (raw) => { try { return JSON.parse(raw); } catch { return undefined; } };

/**
 * The end probes (`capture: probe <selector> → <JSON>`), keyed by the selector the proof gave, not by its echo. The seam
 * runs them in the order given and logs each as it runs, so each logged line is read as the first selector not yet read
 * whose echo it is: two selectors that mask alike are told apart by their order. A probe whose answer is not JSON reads
 * as `[]`, as the reader this replaces read it.
 * @param {string} log
 * @param {readonly string[]} selectors the probes, in the order ROTARIS_CAPTURE_PROBE gave them
 * @returns {Record<string, any[]>}
 */
export function readEndProbes(log, selectors) {
  const pending = selectors.map((s) => s.trim()).filter((s) => s !== '');
  /** @type {Record<string, any[]>} */
  const probes = {};
  for (const line of linesOf(log)) {
    const m = /capture: probe (.*)$/.exec(line);
    if (!m) continue;
    const rest = m[1] ?? '';
    const i = pending.findIndex((s) => answerAfter(rest, s) !== null);
    if (i === -1) continue;
    const [selector] = pending.splice(i, 1);
    if (selector === undefined) continue;
    const answer = parsed((answerAfter(rest, selector) ?? '').trimEnd());
    probes[selector] = Array.isArray(answer) ? answer : [];
  }
  return probes;
}

/**
 * One timed step's answer (`capture: <kind> <at> <echo> → <JSON>`), parsed; null when no such line was logged or its
 * answer is not JSON. A read that matches more than one line throws rather than choosing, since masking can make two
 * steps at one offset echo alike.
 * @param {string} log
 * @param {'inspect-at' | 'probe-at'} kind
 * @param {number | string} at the offset as the seam logs it (`~5000` for a step that waits)
 * @param {string} selector
 */
export function readTimedStep(log, kind, at, selector) {
  const head = `capture: ${kind} ${at} `;
  /** @type {string[]} */
  const found = [];
  for (const line of linesOf(log)) {
    const start = line.indexOf(head);
    if (start === -1) continue;
    const answer = answerAfter(line.slice(start + head.length), selector);
    if (answer !== null) found.push(answer.trimEnd());
  }
  if (found.length > 1) throw new Error(`${found.length} ${kind} lines at ${at} ms echo one selector — the schedule is ambiguous: ${selector.trim().slice(0, 120)}`);
  const [only] = found;
  return only === undefined ? null : parsed(only) ?? null;
}
