import { millis, type Clocks } from '@rotaris/kernel';
import type { TurnReport } from '@rotaris/model';
import type { SessionWriter } from '../session-writer.js';
import { classifyFailure, describeCondition, describeError, entryOf, localBackoffMs, pairKey, providerIdentity, retryAfterMs, sameTierCandidates, withSettings, type CatalogueEntry, type ModelChoice, type ResilienceMemory } from './resilience.js';
import type { WaitRegistry } from './waits.js';

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
}

function pause(clocks: Clocks, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = clocks.timers.after(millis(ms), () => { signal.removeEventListener('abort', onAbort); resolve(); });
    const onAbort = () => { t.cancel(); resolve(); };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** REQ-ORCH-090: the threshold to arm for this call, or null when the fallback route is closed. */
export function unresponsiveThreshold(r: TurnResilience): number | null {
  const { cell } = r;
  if (cell.fallback === null || cell.fallbackAttempted) return null;
  return r.llmResponseTimeoutMs < r.unresponsiveBoundMs ? r.llmResponseTimeoutMs : null;
}

export async function resilientStep(deps: LadderDeps, r: TurnResilience, call: (choice: ModelChoice, unresponsiveMs: number | null) => Promise<StepOutcome>, signal: AbortSignal): Promise<TurnReport> {
  const { writer, clocks, agent } = deps;
  const { cell, memory, catalogue, waits } = r;
  let transient = 0;
  let validation = 0;
  let condensations = 0;
  for (;;) {
    const { report, unresponsive } = await call(cell.model, unresponsiveThreshold(r));
    const provider = providerIdentity(catalogue, cell.model.model);
    const modelId = cell.model.model.modelId;
    if (unresponsive && !signal.aborted && cell.fallback !== null && !cell.fallbackAttempted) {
      // REQ-ORCH-090 / REQ-CONFIG-114 / REQ-NOTIFY-099: closed and re-run once on the role's fallback; the agent keeps running.
      const fb = cell.fallback;
      const fbProvider = providerIdentity(catalogue, fb.model);
      cell.fallbackAttempted = true;
      const seconds = r.llmResponseTimeoutMs / 1000;
      const message = `${agent} received no model event from ${provider}/${modelId} within ${seconds} s; the call was closed and re-run on the fallback model ${fbProvider}/${fb.model.modelId}.`;
      writer.appendTimeline('unresponsive_model_fallback', 'rotaris', message, { agent, from_provider: provider, from_model: modelId, to_provider: fbProvider, to_model: fb.model.modelId, threshold_seconds: seconds });
      writer.recordIssue({ kind: 'unresponsive_model', severity: 'warning', actor: agent, message, metadata: { requested_model: `${provider}/${modelId}`, fallback_model: `${fbProvider}/${fb.model.modelId}`, threshold_seconds: seconds } });
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
      await pause(clocks, delayS * 1000, signal);
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
    const exhausted = memory.isExhausted(provider, modelId);
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
        const message = `${agent} moved from ${provider}/${modelId} to ${candidate.provider}/${candidate.model.modelId} after a ${condition} response (same tier, different provider${exhausted ? '; the provider is marked exhausted' : ''}).`;
        writer.appendTimeline('model_fallback', 'rotaris', message, { agent, from_provider: provider, from_model: modelId, to_provider: candidate.provider, to_model: candidate.model.modelId, to_key: candidate.key, condition: cls, provider_exhausted: exhausted });
        writer.recordIssue({ kind: 'model_fallback', severity: 'warning', actor: agent, message, metadata: { requested_model: `${provider}/${modelId}`, fallback_model: `${candidate.provider}/${candidate.model.modelId}`, provider_exhausted: exhausted, condition: cls } });
        deps.warn(message);
        cell.model = withSettings(catalogue, { model: candidate.model, thinking: candidate.thinking });
        continue;
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
    const message = `${agent} is waiting on provider ${provider} (model ${modelId}), attempt ${cell.waitAttempt}: ${seconds === null ? 'no automatic resume; the wait continues until the user decides' : `${seconds} s, then an automatic retry`}${exhausted ? '; the provider is marked exhausted' : ''}.`;
    writer.recordIssue({ kind: 'model_wait', severity: 'warning', actor: agent, message, metadata: { attempt: cell.waitAttempt, model: modelId, provider, wait_seconds: seconds, auto_resume: seconds !== null, provider_exhausted: exhausted } });
    writer.appendRow('system', `Waiting on a provider limit — ${reason}`, true);
    deps.warn(message);
    const decision = await waits.enter({ agent, provider, model: modelId, exhausted, attempt: cell.waitAttempt, reason }, waitMs, signal);
    if (decision.kind === 'cancelled') return { ...report, error: { ...err, headline: reason } };
    if (decision.kind === 'model') {
      cell.attempted.add(pairKey(provider, modelId));
      cell.model = withSettings(catalogue, decision.choice);
      continue;
    }
    // Auto-resume: retry the same model.
  }
}
