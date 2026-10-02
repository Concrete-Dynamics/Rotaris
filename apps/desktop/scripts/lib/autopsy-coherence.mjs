/**
 * The autopsy reader's "zero cost with tokens" coherence line (`apps/desktop/scripts/autopsy.mjs`), pure so that
 * `autopsy-coherence.test.ts` can pin it.
 *
 * A session's cost is incoherent with its tokens only when a figure exists to be recorded. The `sessions` row records
 * that with the total as `cost_qualifier` (REQ-MONITOR-166, as PD-MONITOR-001 extends it): `unknown` means no request
 * of the run had a figure, so a total of `0` beside real tokens is the correct total, not a missing one; `incomplete`,
 * `reported` and `configured` each say at least one request had a figure, and there a `0` against real tokens is the
 * reading worth a second look. The line used to read `cost === '0' && tokens > 0` and nothing else, so every session on
 * an unpriced endpoint said `true` (live-run finding K2(b), 2026-09-29); the live run conditioned its own check on the
 * endpoint's accounting kind to step around it.
 *
 * A store written before the qualifier existed has no such column. There every figure was a reported one, so the
 * question is asked as it always was.
 */

/** A decimal amount as the store records it (`money.ts`'s exact decimal string) that is zero, in any spelling of zero. */
export function isZeroAmount(cost) {
  return typeof cost === 'string' && /^0+(\.0+)?$/.test(cost.trim());
}

/**
 * `{ zeroCostWithTokens, reason }` for one `sessions` row: `true` only when a figure existed (the qualifier is not
 * `unknown`), the recorded total is zero and tokens were counted.
 */
export function zeroCostCoherence(row) {
  const tokens = Number(row.tokens_input ?? 0) + Number(row.tokens_output ?? 0);
  const qualifier = typeof row.cost_qualifier === 'string' && row.cost_qualifier !== '' ? row.cost_qualifier : null;
  const cost = String(row.cost ?? '');
  const recorded = qualifier === null ? `cost ${cost}, no qualifier recorded` : `cost ${cost} (${qualifier})`;
  if (qualifier === 'unknown') return { zeroCostWithTokens: false, reason: `not a question: cost_qualifier unknown, no request had a figure, so ${cost} is the correct total` };
  if (tokens <= 0) return { zeroCostWithTokens: false, reason: `${recorded}, no tokens counted` };
  if (!isZeroAmount(cost)) return { zeroCostWithTokens: false, reason: `${recorded} against ${tokens} tokens` };
  return { zeroCostWithTokens: true, reason: `${recorded} against ${tokens} tokens${qualifier === null ? '' : ', although a request had a figure'}` };
}

/** The line the autopsy prints under "### coherence"; the live run reads its first `true|false` token. */
export function zeroCostLine(row) {
  const r = zeroCostCoherence(row);
  return `  zero cost with tokens: ${r.zeroCostWithTokens} (${r.reason})`;
}

/**
 * The statuses of a session that has not stopped: the four the reader has always treated so (`idle`, `running`,
 * `background`, `waiting`), which are also the engine autopsy's (`packages/engine/src/autopsy.ts`).
 */
const NOT_STOPPED = new Set(['idle', 'running', 'background', 'waiting']);

/**
 * The "null summary on stopped run" line, answering `unasked` for a session that never stopped. It printed
 * `stopped && summary === ''`, so a session left `running` read `false` and the live run's check passed a question
 * about how a stopped run ends on a run that had not ended (live-run finding H-c, the duress run of 2026-09-29).
 */
export function nullSummaryReading(row) {
  const status = String(row.execution_status ?? '');
  if (NOT_STOPPED.has(status)) return { reading: 'unasked', reason: `execution_status ${status}: the session never stopped` };
  const empty = (row.summary_text ?? '') === '';
  return { reading: empty ? 'true' : 'false', reason: `execution_status ${status}${row.stop_reason ? `, ${row.stop_reason}` : ''}, summary ${empty ? 'empty' : 'recorded'}` };
}

/** The line the autopsy prints; the live run reads its first `true|false|unasked` token. */
export function nullSummaryLine(row) {
  const r = nullSummaryReading(row);
  return `  null summary on stopped run: ${r.reading} (${r.reason})`;
}
