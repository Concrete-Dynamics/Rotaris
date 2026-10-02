import { millis, type Clocks } from '@rotaris/kernel';
import type { ModelError, TurnReport } from '@rotaris/model';
import type { SessionWriter } from '../session-writer.js';
import { classifyFailure, describeCondition, describeError, entryOf, localBackoffMs, pairKey, providerIdentity, retryAfterMs, sameRef, sameTierCandidates, withSettings, type CatalogueEntry, type ModelChoice, type ResilienceMemory } from './resilience.js';
import type { WaitRegistry } from './waits.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import { duringImposedWait, type ImposedWaitPort } from '../children/stall.js';

/**
 * The ladder over one model step (REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..090/094/096/099). It sits at the
 * STEP, not the turn: a retry re-issues the model call over the conversation as it stands, so a tool call the
 * failed turn already executed is never replayed. (The transient retry used to wrap the whole turn — moved here
 * on Part Q's first execution; the reason is kept in ADR-0027's note.)
 *
 * Order on a failed step: transient → the transient budget after min(2, n) s, `transient_llm_error` recorded;
 * validation → the validation budget the same way; rate limit or quota → never the transient budget: the pair
 * marked exhausted on a quota response (session-wide, persisted), at most one same-tier fallback per agent, else
 * the suspended wait — the provider's retry-after or the local backoff, indefinite for an exhausted provider —
 * resolved by the timer, a cancel or a model chosen by the user; context-window rejection → Part AH's
 * condense-and-retry, at most twice for one call, the original rejection surfaced when the condensation itself
 * fails (REQ-ORCH-093); every other failure → the step fails as it did. An unresponsive model — no event within
 * `llm_response_timeout`, armed only while a fallback is available and the threshold sits below the agent's
 * bound — closes the conversation and re-runs the step once on the role's fallback.
 */
export interface AgentResilienceCell {
  model: ModelChoice;
  /** REQ-ORCH-088/090/144: the role's fallback for this agent; null when none, or when it is the agent's own model. */
  readonly fallback: ModelChoice | null;
  /** One fallback per child across both routes (the unresponsive model and the hard timeout). */
  fallbackAttempted: boolean;
  /** REQ-ORCH-091 (b): at most one same-tier fallback per agent. */
  sameTierAttempted: boolean;
  waitAttempt: number;
  /** The pairs this agent has already run on, for the candidate rule. */
  readonly attempted: Set<string>;
}

export function agentCell(model: ModelChoice, fallback: ModelChoice | null): AgentResilienceCell {
  return { model, fallback, fallbackAttempted: false, sameTierAttempted: false, waitAttempt: 0, attempted: new Set() };
}

export interface TurnResilience {
  readonly cell: AgentResilienceCell;
  readonly memory: ResilienceMemory;
  readonly catalogue: readonly CatalogueEntry[];
  readonly waits: WaitRegistry;
  readonly transientRetries: number;
  readonly validationRetries: number;
  /** REQ-CONFIG-114: already floored at 30 s by configuration. */
  readonly llmResponseTimeoutMs: number;
  /** REQ-ORCH-090: the threshold applies only below this — the child timeout, or the model timeout for the root. */
  readonly unresponsiveBoundMs: number;
  /**
   * Part AH (ADR-0060) — REQ-ORCH-093: condense the conversation this step calls over, and say whether it
   * happened. The ladder holds no conversation of its own; the turn supplies this closing over one. Absent
   * means no condensation exists and a context-window rejection fails the step, as it did before Part AH.
   */
  readonly condense?: (() => Promise<boolean>) | undefined;
  /** REQ-ORCH-093: this call resumes a parent, so its rejection is recorded as `parent_resume_bad_request`. */
  readonly resumeIssue?: boolean | undefined;
  /**
   * PD-ORCH-005 clause 2: the run is coming to rest, so no further model call is made — the report the step already has
   * stands, and no retry, fallback re-run, condensation or wait follows it (found by phase 3's review). Absent means never.
   */
  readonly resting?: (() => boolean) | undefined;
  /**
   * REQ-MONITOR-142: the root's alone — whether an entry-model switch is recorded that its cell has not applied yet (it
   * applies at the root's next turn). Each ladder move of the root records it (`switch_pending`), so the autopsy reader
   * places the move before or after that switch; the record holds nothing else that says so
   * (the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback). Absent for a child.
   */
  readonly switchPending?: (() => boolean) | undefined;
}

/** REQ-ORCH-093: at most twice for one call. */
export const CONTEXT_CONDENSE_ATTEMPTS = 2;

export interface StepOutcome {
  readonly report: TurnReport;
  /** The unresponsive-model timer aborted the call before any event arrived. */
  readonly unresponsive: boolean;
}

export interface LadderDeps {
  readonly writer: SessionWriter;
  readonly clocks: Clocks;
  readonly warn: (m: string) => void;
  readonly agent: string;
  /**
   * OQ-8 (REQ-EVENTS-053): every COMPLETED provider request is observed here, once, whatever the ladder then does
   * with it. A request the ladder discards — a transient failure it retries, a context rejection it condenses past,
   * an attempt superseded by a fallback — still reported whatever usage the provider reported, and that usage is
   * spent. Reading the usage off the ladder's return value alone loses it.
   *
   * PD-MONITOR-001 revision 2: the request arrives PRICED — here is where the model it was sent to is known.
   */
  readonly onRequestUsage?: ((usage: PricedUsage) => void) | undefined;
  /**
   * OQ-173: the agent's stall watch is told of each wait this ladder holds the agent in between its model steps — a
   * retry's backoff and the suspended wait on a provider limit — so it reports a wait and not a stall; the returned
   * release ends it. Absent means nobody is watching.
   */
  readonly imposedWait?: ImposedWaitPort | undefined;
}

function pause(clocks: Clocks, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = clocks.timers.after(millis(ms), () => { signal.removeEventListener('abort', onAbort); resolve(); });
    const onAbort = () => { t.cancel(); resolve(); };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** `switch_pending` for a ladder move of the root (`TurnResilience.switchPending`); nothing for a child. */
const switchPendingOf = (r: TurnResilience): { readonly switch_pending?: boolean } => (r.switchPending ? { switch_pending: r.switchPending() } : {});

/** REQ-ORCH-090: the threshold to arm for this call, or null when the fallback route is closed. */
export function unresponsiveThreshold(r: TurnResilience): number | null {
  const { cell } = r;
  if (cell.fallback === null || cell.fallbackAttempted) return null;
  return r.llmResponseTimeoutMs < r.unresponsiveBoundMs ? r.llmResponseTimeoutMs : null;
}

/**
 * REQ-ORCH-091 (a)/(d) with REQ-MONITOR-194: before every call the cell follows an override the session holds for the
 * pair it is on — a wait's "change model now" (whichever agent was waiting), or an authentication pin (REQ-NOTIFY-070,
 * OQ-182's pair-keyed reading) — so no agent's next call returns to a pair the session replaced "for the rest of the
 * session". Until 2026-10-02 the overrides were read only where a cell was built (`forChild`, and `rootResilience` on a
 * rebuild), so a root already on the replaced pair kept calling it, its resume after the waiting child's report included
 * (a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced). The move needs no record of its own: the
 * `model_override` entry already says the pair is replaced, and the autopsy reader reads it as moving every agent on it.
 * The pair left is one this agent ran on, so the same-tier rule never offers it back (REQ-ORCH-091 b).
 */
function followOverride(r: TurnResilience): void {
  const { cell, memory, catalogue } = r;
  const followed = memory.effective(cell.model, catalogue);
  if (sameRef(followed.model, cell.model.model)) return;
  cell.attempted.add(pairKey(providerIdentity(catalogue, cell.model.model), cell.model.model.modelId));
  cell.model = withSettings(catalogue, followed);
}

export async function resilientStep(deps: LadderDeps, r: TurnResilience, call: (choice: ModelChoice, unresponsiveMs: number | null) => Promise<StepOutcome>, signal: AbortSignal): Promise<TurnReport> {
  const { writer, clocks, agent } = deps;
  const { cell, memory, catalogue, waits } = r;
  let transient = 0;
  let validation = 0;
  let condensations = 0;
  let last: TurnReport | null = null;
  for (;;) {
    // PD-ORCH-005 clause 2: a rest accepted during a backoff, a condensation or a wait ends the step on what it has.
    if (last !== null && r.resting?.() === true) return last;
    followOverride(r);
    // REQ-MONITOR-194 / REQ-ORCH-091 (a): the exclusion is read BEFORE every call. A cell on a pair the session recorded out
    // of quota — by another agent's quota answer, or a run before this one (the memory is rehydrated) — is not called: it
    // takes the path an insufficient-quota answer takes, its one same-tier fallback (b) else the wait that never
    // auto-resumes (c), and records no second `model_exhausted`. An explicit choice of the pair clears the exclusion first
    // (`Run.clearChosenExclusion`), so the choice is called. (Until 2026-10-02 the exclusion was read only after a failed
    // call: an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.)
    const excludedProvider = providerIdentity(catalogue, cell.model.model);
    if (memory.isExhausted(excludedProvider, cell.model.model.modelId)) {
      const report = excludedReport(excludedProvider, cell.model.model.modelId);
      last = report;
      const outcome = await limitPath(report, report.error, 'quota_exhausted', true);
      if (outcome !== null) return outcome;
      continue;
    }
    const { report, unresponsive } = await call(cell.model, unresponsiveThreshold(r));
    last = report;
    // OQ-8: one observation per completed provider request, before the ladder decides what to do with it — priced at
    // the rates of the model this attempt was sent to, which after a fallback is not the model the agent started on.
    deps.onRequestUsage?.(priceRequest(report.usage, entryOf(catalogue, cell.model.model)?.pricing));
    // PD-ORCH-005 clause 2: the step in flight when the run came to rest is the last call; its report stands as it is.
    if (r.resting?.() === true) return report;
    const provider = providerIdentity(catalogue, cell.model.model);
    const modelId = cell.model.model.modelId;
    if (unresponsive && !signal.aborted && cell.fallback !== null && !cell.fallbackAttempted) {
      // REQ-ORCH-090 / REQ-CONFIG-114 / REQ-NOTIFY-099: closed and re-run once on the role's fallback; the agent keeps running.
      const fb = cell.fallback;
      const fbProvider = providerIdentity(catalogue, fb.model);
      cell.fallbackAttempted = true;
      const seconds = r.llmResponseTimeoutMs / 1000;
      const message = `${agent} received no model event from ${provider}/${modelId} within ${seconds} s; the call was closed and re-run on the fallback model ${fbProvider}/${fb.model.modelId}.`;
      // REQ-ORCH-139: the vocabulary's `llm_unresponsive` names both the entry and the issue (A29; formerly
      // `unresponsive_model_fallback` and `unresponsive_model`, names no list has).
      writer.appendTimeline('llm_unresponsive', 'rotaris', message, { agent, from_provider: provider, from_model: modelId, to_provider: fbProvider, to_model: fb.model.modelId, threshold_seconds: seconds, ...switchPendingOf(r) });
      writer.recordIssue({ kind: 'llm_unresponsive', severity: 'warning', actor: agent, message, metadata: { requested_model: `${provider}/${modelId}`, fallback_model: `${fbProvider}/${fb.model.modelId}`, threshold_seconds: seconds } });
      deps.warn(message);
      cell.attempted.add(pairKey(provider, modelId));
      cell.model = withSettings(catalogue, fb);
      continue;
    }
    if (report.status !== 'failed' || signal.aborted) return report;
    const err = report.error;
    const cls = classifyFailure(err);
    if (cls === 'transient' || cls === 'validation') {
      // REQ-ORCH-092 / REQ-NOTIFY-096: the class's own budget, the delay min(2, n) s, the issue naming the attempt and the limit.
      const limit = cls === 'transient' ? r.transientRetries : r.validationRetries;
      const used = cls === 'transient' ? transient : validation;
      if (used >= limit) return report;
      const attempt = used + 1;
      if (cls === 'transient') transient = attempt; else validation = attempt;
      const delayS = Math.min(2, attempt);
      const message = `${cls === 'transient' ? 'Transient' : 'Validation'} model failure for ${agent} on ${provider}/${modelId} (retry ${attempt} of ${limit}): ${describeError(err)}; retrying after ${delayS} s.`;
      writer.recordIssue({ kind: cls === 'transient' ? 'transient_llm_error' : 'validation_llm_error', severity: 'warning', actor: agent, message, metadata: { attempt, limit, delay_seconds: delayS, provider, model: modelId } });
      deps.warn(message);
      await duringImposedWait(deps.imposedWait, 'backoff', () => pause(clocks, delayS * 1000, signal));
      if (signal.aborted) return report;
      continue;
    }
    if (cls === 'context_window') {
      /**
       * REQ-ORCH-093 / REQ-MONITOR-077 (Part AH): condense the conversation and retry the call, at most twice
       * for ONE call. Where the condensation itself fails — no compressor, nothing left to compress, the
       * compressing model failing — the ORIGINAL rejection is surfaced unchanged and the call fails; nothing
       * here rewrites the error, because the requirement says what the user must see and it is this one.
       */
      const kind = r.resumeIssue === true ? 'parent_resume_bad_request' : 'llm_bad_request';
      const attempt = condensations + 1;
      const message = `${agent}'s model call was rejected for context on ${provider}/${modelId} (condensation ${attempt} of ${CONTEXT_CONDENSE_ATTEMPTS}): ${describeError(err)}`;
      writer.recordIssue({ kind, severity: 'warning', actor: agent, message, metadata: { attempt, limit: CONTEXT_CONDENSE_ATTEMPTS, provider, model: modelId, parent_resume: r.resumeIssue === true } });
      deps.warn(message);
      if (!r.condense || condensations >= CONTEXT_CONDENSE_ATTEMPTS) return report;
      condensations = attempt;
      if (!(await r.condense())) return report;
      if (signal.aborted) return report;
      continue;
    }
    if (cls !== 'rate_limit' && cls !== 'quota_exhausted') return report;

    // REQ-ORCH-091 (a): a quota response marks the pair exhausted for the rest of the session — in memory and in the timeline.
    if (cls === 'quota_exhausted' && memory.markExhausted(provider, modelId)) {
      writer.appendTimeline('model_exhausted', 'rotaris', `Provider ${provider} reports its quota exhausted for model ${modelId}; the pair is excluded for the rest of the session.`, { provider, model: modelId, agent });
    }
    const outcome = await limitPath(report, err, cls, false);
    if (outcome !== null) return outcome;
  }

  /**
   * REQ-ORCH-091 (b) then (c) for the pair the cell is on: after a rate-limit or quota answer, or — `preCall` — before any
   * call, on a pair the session already holds out of quota. Null means the loop goes on (a move, a model chosen, a resume);
   * a report ends the step.
   */
  async function limitPath(report: TurnReport & { readonly status: 'failed' }, err: ModelError, cls: 'rate_limit' | 'quota_exhausted', preCall: boolean): Promise<TurnReport | null> {
    const provider = providerIdentity(catalogue, cell.model.model);
    const modelId = cell.model.model.modelId;
    const exhausted = memory.isExhausted(provider, modelId);
    const before = preCall ? ' before calling it, the session having recorded the pair out of quota' : '';
    const preCallMeta = preCall ? { pre_call: true } : {};
    // REQ-ORCH-091 (b) / REQ-NOTIFY-082: one same-tier fallback per agent, transparent.
    if (!cell.sameTierAttempted) {
      const roles = entryOf(catalogue, cell.model.model)?.roles ?? [];
      const attempted = new Set(cell.attempted);
      attempted.add(pairKey(provider, modelId));
      const [candidate] = sameTierCandidates({ provider, modelId, roles }, catalogue, memory.exhausted, attempted);
      if (candidate) {
        cell.sameTierAttempted = true;
        cell.attempted.add(pairKey(provider, modelId));
        cell.attempted.add(pairKey(candidate.provider, candidate.model.modelId));
        const condition = cls === 'quota_exhausted' ? 'quota exhaustion' : 'rate limit';
        const message = preCall
          ? `${agent} moved from ${provider}/${modelId} to ${candidate.provider}/${candidate.model.modelId}${before} (same tier, different provider; the provider is marked exhausted).`
          : `${agent} moved from ${provider}/${modelId} to ${candidate.provider}/${candidate.model.modelId} after a ${condition} response (same tier, different provider${exhausted ? '; the provider is marked exhausted' : ''}).`;
        // REQ-ORCH-139 / REQ-NOTIFY-090: the vocabulary's words for the same-tier change — the `quota_fallback_model` entry and
        // the `quota_fallback` issue, under a rate limit as under exhaustion (REQ-NOTIFY-082's "usage limit"); A29, formerly
        // `model_fallback` for both, a name no list has. `condition` in the metadata still says which it was.
        writer.appendTimeline('quota_fallback_model', 'rotaris', message, { agent, from_provider: provider, from_model: modelId, to_provider: candidate.provider, to_model: candidate.model.modelId, to_key: candidate.key, condition: cls, provider_exhausted: exhausted, ...preCallMeta, ...switchPendingOf(r) });
        writer.recordIssue({ kind: 'quota_fallback', severity: 'warning', actor: agent, message, metadata: { requested_model: `${provider}/${modelId}`, fallback_model: `${candidate.provider}/${candidate.model.modelId}`, provider_exhausted: exhausted, condition: cls, ...preCallMeta } });
        deps.warn(message);
        cell.model = withSettings(catalogue, { model: candidate.model, thinking: candidate.thinking });
        return null;
      }
    }
    // REQ-ORCH-091 (c) / REQ-NOTIFY-083..087: the suspended wait; an exhausted provider never auto-resumes.
    cell.waitAttempt += 1;
    const providerInterval = exhausted ? null : retryAfterMs(err, Number(clocks.wall.instant()));
    const waitMs = exhausted ? null : providerInterval ?? localBackoffMs(cell.waitAttempt);
    const reason = exhausted
      ? describeCondition({ kind: 'quota_exhausted', provider, model: modelId })
      : describeCondition({ kind: 'rate_limit', provider, model: modelId, intervalS: providerInterval === null ? null : Math.round(providerInterval / 1000) });
    const seconds = waitMs === null ? null : waitMs / 1000;
    const message = `${agent} is waiting on provider ${provider} (model ${modelId}), attempt ${cell.waitAttempt}: ${seconds === null ? 'no automatic resume; the wait continues until the user decides' : `${seconds} s, then an automatic retry`}${exhausted ? '; the provider is marked exhausted' : ''}${preCall ? '; no call was made, the session having recorded the pair out of quota' : ''}.`;
    writer.recordIssue({ kind: 'model_wait', severity: 'warning', actor: agent, message, metadata: { attempt: cell.waitAttempt, model: modelId, provider, wait_seconds: seconds, auto_resume: seconds !== null, provider_exhausted: exhausted, ...preCallMeta } });
    writer.appendRow('system', `Waiting on a provider limit — ${reason}`, true);
    deps.warn(message);
    const decision = await duringImposedWait(deps.imposedWait, 'provider_limit', () => waits.enter({ agent, provider, model: modelId, exhausted, attempt: cell.waitAttempt, reason }, waitMs, signal));
    if (decision.kind === 'cancelled') return { ...report, error: { ...err, headline: reason } };
    if (decision.kind === 'model') {
      cell.attempted.add(pairKey(provider, modelId));
      cell.model = withSettings(catalogue, decision.choice);
      return null;
    }
    // Auto-resume: retry the same model — unless a pause released the wait, which the loop's top ends the step on.
    return null;
  }
}

/**
 * The report of a call the ladder did not make (REQ-MONITOR-194): the pair's recorded exclusion stands in for the provider's
 * insufficient-quota answer, so a wait cancelled or released on it ends the step as one on that answer does. No usage.
 */
function excludedReport(provider: string, modelId: string): TurnReport & { readonly status: 'failed' } {
  const headline = describeCondition({ kind: 'quota_exhausted', provider, model: modelId });
  return { status: 'failed', text: '', usage: { input: 0, output: 0 }, error: { code: 'http', status: 429, headline, providerMessage: 'insufficient quota, recorded earlier in this session; no call was made', transient: false } };
}
