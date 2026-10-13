/**
 * What a live run that cut a child off at its per-agent timeout shows, read from the store and the recorded traffic — the
 * `cutoff` scenario of `live-run.mjs` (fin42; the 2026-10-13 survey's N50). Three things no live run had measured since
 * the fin32 and fin33 repairs, because no child had been cut off in one:
 *
 *   - PD-CONFIG-003 revisions 3 and 4 (CN1, OQ-234): the timed-out tag's line in the minutes form — `timeoutLine` mirrors
 *     `packages/ui/src/agents.ts`'s `timeoutLine` and `timeoutLimitText`, as `mission-proof`'s item 1d does for seconds;
 *   - OQ-217 as repaired for D9: the summarising request's facts open "Outcome of this agent, not of the session: failed —
 *     Child timed out after <N>s." (`OUTCOME_HEAD`, `packages/engine/src/children/report.ts`), the stored summary's first
 *     sentence states the agent's own outcome and never opens "The run failed", and no `child_result` entry of a session
 *     that completed relays "The run failed";
 *   - PD-ORCH-004 revisions 3 and 4: a later run's root taking the offer up (`offerTaken`).
 *
 * Pure: the caller reads the rows. Verification only.
 */

/** PD-CONFIG-003's control path, as `perAgentTimeoutPath()` builds it from the labels Settings renders. */
export const PER_AGENT_TIMEOUT_PATH = 'Settings › Runtime › Per-agent timeout';
/** OQ-217's head of the summariser's facts for a child that did not succeed. */
export const OUTCOME_HEAD = 'Outcome of this agent, not of the session:';

const countNoun = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
/** "1 minute", "<m> minutes" for a whole number of minutes, else "<N> seconds" ("1 second"). */
export function timeoutLimitText(seconds) {
  if (seconds >= 60 && Number.isInteger(seconds / 60)) return countNoun(seconds / 60, 'minute');
  return countNoun(seconds, 'second');
}
/** The timed-out tag's title and the inspector's line (REQ-MONITOR-286, PD-CONFIG-003 revision 3). */
export function timeoutLine(limitSeconds, makingProgress) {
  return `Cut off at its per-agent timeout of ${timeoutLimitText(limitSeconds)}${makingProgress ? ' while making progress' : ''}. ${PER_AGENT_TIMEOUT_PATH} sets this limit for runs started from now.`;
}

/**
 * The capture evaluation that reads the Workspace sidebar's timed-out tag as it appears
 * (`ROTARIS_CAPTURE_EVAL_AT: \`${TAG_EVAL}>>${TAG_SELECTOR}@~<ms>\``), and `tagReading`, which finds its answer in the log.
 * `continuation-proof`'s later-run scenario runs it against the scripted provider, the live `cutoff` scenario against a model.
 */
export const TAG_SELECTOR = '.agent-row [data-testid="agent-timed-out"]';
export const TAG_EVAL = `(() => { const t = document.querySelector(${JSON.stringify(TAG_SELECTOR)}); return { kind: 'cutoff-tag', text: t?.textContent ?? null, title: t?.getAttribute('title') ?? null, description: t?.getAttribute('aria-description') ?? null }; })()`;
export function tagReading(log) {
  for (const m of String(log).matchAll(/capture: eval-at \d+ .*? → (\{.*\})\s*$/gm)) {
    try { const e = JSON.parse(m[1]); if (e?.kind === 'cutoff-tag') return e; } catch { /* another evaluation's answer */ }
  }
  return null;
}

const reportOf = (child) => {
  if (child?.report !== null && typeof child?.report === 'object') return child.report;
  try { return JSON.parse(child?.report ?? '{}'); } catch { return {}; }
};
/** The first sentence of a summary: up to the first full stop, question or exclamation mark followed by a space or the end. */
export function firstSentence(text) {
  const t = String(text ?? '').trim();
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t);
  return (m ? m[0] : t).trim();
}
const RUN_FAILED = /^\s*(?:the\s+)?(?:run|session)\s+(?:has\s+)?failed\b/i;
const STATES_LIMIT = /time limit|timed out|timeout|cut off/i;

/**
 * Every child the limit cut off (`Child timed out after <limitS>s` among its report's errors), with what the record says of
 * it: whether it was making progress (PD-ORCH-004's statement), its offer, its summary's opening, whether that opening
 * states the limit and whether it opens as the run failing, and whether a summarising request for it carried OQ-217's
 * head (`requestBodies`: the recorded requests' bodies, as text). `children` rows carry `canonical_name`, `task_id`,
 * `state` and `report` (JSON text or parsed).
 */
export function cutOffChildren(children, limitS, requestBodies = []) {
  const error = `Child timed out after ${limitS}s`;
  // `outcomeLine` (packages/engine/src/children/report.ts) closes the error with a full stop only when PD-ORCH-004's statement
  // follows it, so a child cut off with no progress has "… after <N>s" and then the next fact; the head is matched without the
  // stop. "after 60s" is no substring of "after 600s", so the limit still matches exactly.
  const head = `${OUTCOME_HEAD} failed — ${error}`;
  return children.flatMap((child) => {
    const report = reportOf(child);
    if (!(report.errors ?? []).some((e) => e?.type === 'timeout' && e?.message === error)) return [];
    const opening = firstSentence(report.summary);
    return [{
      name: child.canonical_name, taskId: child.task_id, state: child.state,
      makingProgress: typeof report.cut_off?.statement === 'string',
      offer: typeof report.cut_off?.continuation_offer === 'string' ? report.cut_off.continuation_offer : null,
      opening, statesLimit: STATES_LIMIT.test(opening), opensAsRunFailed: RUN_FAILED.test(opening),
      factsHead: requestBodies.some((body) => body.includes(head) && body.includes(`(${child.canonical_name})`)),
    }];
  });
}

/** OQ-217 (D9): the `child_result` entries that relay a child's summary as the run failing — wrong on a session that completed. */
export function runFailedRelays(timeline) {
  return timeline.filter((e) => e.name === 'child_result' && /reported failed: (?:the )?(?:run|session) (?:has )?failed/i.test(e.message ?? ''));
}

/**
 * PD-ORCH-004 revisions 3 and 4: whether a child continues `cutTaskId`, and whether the agent that delegated it is a root the
 * cut-off child's own parent is not — a later iteration's or a later run's. `roots` are the task ids of the session's roots.
 */
export function offerTaken(children, cutTaskId, roots) {
  const cut = children.find((c) => c.task_id === cutTaskId);
  const continuation = children.find((c) => c.continuation_of === cutTaskId) ?? null;
  if (continuation === null) return { taken: false, continuation: null, byLaterRoot: false };
  const byLaterRoot = roots.includes(continuation.parent_id) && continuation.parent_id !== cut?.parent_id;
  return { taken: true, continuation: { name: continuation.canonical_name, taskId: continuation.task_id, state: continuation.state, parent: continuation.parent_id }, byLaterRoot };
}
