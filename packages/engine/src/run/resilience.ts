import type { ModelError, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { ModelPricing } from '@rotaris/config';

/**
 * Part Q — the model resilience paths, in their pure half (REQ-ORCH-091/092, REQ-NOTIFY-081..092,
 * REQ-NOTIFY-094): the classification of a failed model call, the wait computation, the same-tier
 * candidate rule, REQ-NOTIFY-092's one-wording-per-condition table, and the session-wide memory of
 * exhausted pairs and the user's override. Nothing here reads a clock or touches the store; the ladder
 * (`ladder.ts`) drives these against the model port and the wait registry (`waits.ts`).
 */
export type FailureClass = 'rate_limit' | 'quota_exhausted' | 'transient' | 'validation' | 'context_window' | 'fatal';

/** REQ-PROVIDER-082 / REQ-NOTIFY-082: the tier is the recorded role, one of exactly these three. */
export type TierRole = 'small_model' | 'medium_model' | 'large_model';
export const TIER_ROLES: readonly TierRole[] = ['small_model', 'medium_model', 'large_model'];

/** A model as an agent calls it, with the per-model settings of REQ-ORCH-145 when the entry states them. */
export interface ModelChoice {
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  /** REQ-CONFIG-086: the entry's `timeout`, milliseconds; absent means the run's model timeout. */
  readonly timeoutMs?: number | undefined;
  /** REQ-CONFIG-086: the entry's `num_retries`; absent means the run's. */
  readonly retries?: number | undefined;
}

/**
 * One `models:` entry as the ladder sees it. `provider` is the identity REQ-NOTIFY-082 compares — the sign-in
 * provider (`auth_provider`) when the entry names one, else the entry's provider family — which is not the
 * `ModelRef`'s `providerId` (the dispatch family, shared by every openai-compatible endpoint). `roles` are the
 * tier slots recorded for the model: configured (the three tier slots naming it) or discovered (the snapshot's
 * per-provider picks). `usable` is false for a discovered model whose provider was not leased for this run.
 */
export interface CatalogueEntry {
  readonly key: string;
  readonly provider: string;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly roles: readonly TierRole[];
  readonly origin: 'configured' | 'discovered';
  readonly usable: boolean;
  readonly timeoutMs?: number | undefined;
  readonly retries?: number | undefined;
  /** PD-MONITOR-001 revision 2 / REQ-CONFIG-088: the entry's two per-token prices, present only when both are set. */
  readonly pricing?: ModelPricing | undefined;
}

export function sameRef(a: ModelRef, b: ModelRef): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId && (a.baseUrl ?? '') === (b.baseUrl ?? '');
}

/** The catalogue entry a reference came from, when one did. */
export function entryOf(catalogue: readonly CatalogueEntry[], ref: ModelRef): CatalogueEntry | undefined {
  return catalogue.find((e) => sameRef(e.model, ref));
}

/** REQ-NOTIFY-082's provider identity for a reference: the entry's when known, else the dispatch family. */
export function providerIdentity(catalogue: readonly CatalogueEntry[], ref: ModelRef): string {
  return entryOf(catalogue, ref)?.provider ?? ref.providerId;
}

/** `provider|model` — the pair REQ-NOTIFY-088 marks exhausted and REQ-ORCH-091 remembers session-wide. */
export function pairKey(provider: string, modelId: string): string {
  return `${provider}|${modelId}`;
}

/** REQ-ORCH-145: the entry's own timeout and retry count travel with the choice. */
export function withSettings(catalogue: readonly CatalogueEntry[], choice: ModelChoice): ModelChoice {
  const e = entryOf(catalogue, choice.model);
  if (!e) return choice;
  return { ...choice, ...(e.timeoutMs === undefined ? {} : { timeoutMs: e.timeoutMs }), ...(e.retries === undefined ? {} : { retries: e.retries }) };
}

const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ');

const QUOTA_MARKERS = ['insufficient quota', 'exceeded your current quota', 'check your plan and billing'];
const RATE_LIMIT_MARKERS = ['429', 'rate limit', 'too many requests'];
/** REQ-NOTIFY-094's phrases, plus the provider-signalled overload REQ-ORCH-092 names. */
const TRANSIENT_MARKERS = ['apiconnectionerror', 'connection aborted', 'connection error', 'connection reset', 'incomplete chunked read', 'peer closed connection', 'service unavailable', 'temporarily unavailable', 'timed out', 'timeout', 'transport', 'overloaded'];
const CONTEXT_MARKERS = ['context length', 'context window', 'maximum context', 'context length exceeded', 'prompt is too long', 'too many tokens', 'reduce the length of the messages', 'input is too long'];
const VALIDATION_MARKERS = ['unparseable json', 'invalid json', 'schema violation', 'did not match the schema', 'does not match the schema', 'not a valid enum', 'outside the allowed values'];

function textOf(err: ModelError): string {
  return norm(`${err.headline} ${err.providerMessage ?? ''}`);
}

/**
 * REQ-ORCH-092's classes, REQ-ORCH-091's two limit conditions ahead of them, in this order: quota (REQ-NOTIFY-088,
 * never reported as rate limiting — REQ-NOTIFY-091), rate limit (status 429 or the three substrings, ignoring case),
 * the context-window rejection (routed to REQ-ORCH-093's condense-and-retry, built by Part AH), validation (the port's
 * code or the structured-output phrasings), transient (the port's fact, REQ-NOTIFY-094's phrases, an interrupted
 * stream), else fatal. An abort is fatal: the run is stopping and nothing is retried.
 */
export function classifyFailure(err: ModelError): FailureClass {
  if (err.code === 'aborted') return 'fatal';
  const text = textOf(err);
  if (QUOTA_MARKERS.some((m) => text.includes(m))) return 'quota_exhausted';
  if (err.status === 429 || RATE_LIMIT_MARKERS.some((m) => text.includes(m))) return 'rate_limit';
  if (CONTEXT_MARKERS.some((m) => text.includes(m))) return 'context_window';
  if (err.code === 'validation' || VALIDATION_MARKERS.some((m) => text.includes(m))) return 'validation';
  if (err.transient || err.code === 'connection' || err.code === 'timeout') return 'transient';
  if (TRANSIENT_MARKERS.some((m) => text.includes(m))) return 'transient';
  return 'fatal';
}

const UNIT_MS: Readonly<Record<string, number>> = { ms: 1, millisecond: 1, milliseconds: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000 };
const IN_TEXT = /(?:retry[ -]?after|try again in|resets? in|wait)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)\b/i;

/**
 * REQ-NOTIFY-084: the provider's own resume time — the `retry-after` header as integer seconds or an HTTP date
 * (against `nowMs`, the wall clock the caller reads), a value with an `s`/`m` suffix, or the plain-language
 * `try again in N <unit>` in the message; minutes become seconds; floor 1 s; null when nothing usable exists.
 */
export function retryAfterMs(err: ModelError, nowMs?: number): number | null {
  const floor = (ms: number) => Math.max(1000, Math.round(ms));
  if (typeof err.retryAfterMs === 'number' && Number.isFinite(err.retryAfterMs)) return floor(err.retryAfterMs);
  const raw = err.retryAfter?.trim();
  if (raw) {
    if (/^\d+$/.test(raw)) return floor(Number(raw) * 1000);
    const suffixed = /^(\d+(?:\.\d+)?)\s*(ms|s|m|sec|min)$/i.exec(raw);
    if (suffixed) return floor(Number(suffixed[1]) * (UNIT_MS[suffixed[2]!.toLowerCase()] ?? 1000));
    const date = Date.parse(raw);
    if (!Number.isNaN(date) && nowMs !== undefined) return floor(date - nowMs);
  }
  const m = IN_TEXT.exec(`${err.headline} ${err.providerMessage ?? ''}`);
  if (m) return floor(Number(m[1]) * (UNIT_MS[m[2]!.toLowerCase()] ?? 1000));
  return null;
}

/** REQ-NOTIFY-085: 60·2^(attempt−1) s, capped at 300 s, no randomisation; attempt counts from 1. */
export function localBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(300, 60 * 2 ** (n - 1)) * 1000;
}

/**
 * REQ-ORCH-091 (b) / REQ-NOTIFY-082: candidates share a recorded role with the failing model and sit on a
 * different provider; configured first, then discovered; each pair once; exhausted and already-attempted pairs
 * excluded; an unusable (unleased) discovered model excluded. No role → no candidate, and no role is guessed.
 */
export function sameTierCandidates(failing: { readonly provider: string; readonly modelId: string; readonly roles: readonly TierRole[] }, catalogue: readonly CatalogueEntry[], exhausted: ReadonlySet<string>, attempted: ReadonlySet<string>): CatalogueEntry[] {
  if (failing.roles.length === 0) return [];
  const seen = new Set<string>();
  const out: CatalogueEntry[] = [];
  for (const origin of ['configured', 'discovered'] as const) {
    for (const e of catalogue) {
      if (e.origin !== origin || !e.usable) continue;
      if (e.provider === failing.provider) continue;
      if (!e.roles.some((r) => failing.roles.includes(r))) continue;
      const key = pairKey(e.provider, e.model.modelId);
      if (seen.has(key) || exhausted.has(key) || attempted.has(key)) continue;
      if (e.provider === failing.provider && e.model.modelId === failing.modelId) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/** REQ-NOTIFY-092's conditions: one condition, one wording; only the substituted values differ between two occurrences. */
export type Condition =
  | { readonly kind: 'quota_exhausted'; readonly provider: string; readonly model: string }
  | { readonly kind: 'rate_limit'; readonly provider: string; readonly model: string; readonly intervalS: number | null }
  | { readonly kind: 'provider_unavailable'; readonly provider: string }
  | { readonly kind: 'non_ascii_credential'; readonly provider: string }
  | { readonly kind: 'rejected_parameter'; readonly parameter: string; readonly reducedSet: boolean };

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'quota_exhausted':
      return c.model === ''
        ? `Provider ${c.provider} reports its quota exhausted. Retrying the same provider and model will keep failing; switch to another model or add credit to the provider account.`
        : `Provider ${c.provider} reports its quota exhausted for model ${c.model}. Retrying the same provider and model will keep failing; switch to another model or add credit to the provider account.`;
    case 'rate_limit':
      return c.intervalS === null
        ? `Provider ${c.provider} is rate limiting model ${c.model}. Wait before retrying.`
        : `Provider ${c.provider} is rate limiting model ${c.model}. Wait ${c.intervalS} s before retrying.`;
    case 'provider_unavailable':
      return `Provider ${c.provider} is temporarily unreachable. Retry.`;
    case 'non_ascii_credential':
      return `The key for provider ${c.provider} contains a non-ASCII character. Enter the provider key again using its exact ASCII value.`;
    case 'rejected_parameter':
      return `The provider rejected the request parameter ${c.parameter}.${c.reducedSet ? ' This backend accepts only a reduced parameter set.' : ''}`;
  }
}

/** The formatted error REQ-ORCH-092's report carries. */
export function describeError(e: ModelError): string {
  return [e.headline, e.status === undefined ? '' : `HTTP ${e.status}`, e.providerMessage ?? ''].filter(Boolean).join(' — ');
}

/** What an override records: the pair it replaces and the choice, by its `models:` key so a resume can resolve it again. */
export interface Override {
  readonly key: string;
  readonly choice: ModelChoice;
}

/**
 * REQ-ORCH-091 (a) / REQ-NOTIFY-088/089 / REQ-SESSION-196: the session-wide memory — pairs marked exhausted and
 * the user's overrides, keyed by the pair they replace. Persisted by the run as the timeline entries
 * `model_exhausted` and `model_override` (the wire-event catalogue is closed at 23 kinds, REQ-EVENTS-041, so no
 * event kind carries them) and rehydrated from the timeline on resume, so a later run of the session never
 * returns to an exhausted model and keeps the chosen one.
 */
export class ResilienceMemory {
  readonly exhausted = new Set<string>();
  private readonly overrides = new Map<string, Override>();

  /** True when the pair was not yet known exhausted. */
  markExhausted(provider: string, modelId: string): boolean {
    const key = pairKey(provider, modelId);
    if (this.exhausted.has(key)) return false;
    this.exhausted.add(key);
    return true;
  }
  isExhausted(provider: string, modelId: string): boolean {
    return this.exhausted.has(pairKey(provider, modelId));
  }
  setOverride(fromProvider: string, fromModelId: string, override: Override): void {
    this.overrides.set(pairKey(fromProvider, fromModelId), override);
  }
  /**
   * REQ-NOTIFY-070 / REQ-NOTIFY-078: the pin on a pair taken back — an authentication fallback whose restart could not
   * begin, or a re-authentication that re-pins the primary. Persisted as a `model_override` entry carrying
   * `cleared: true`, which `rehydrate` replays the same way.
   */
  clearOverride(provider: string, modelId: string): boolean {
    return this.overrides.delete(pairKey(provider, modelId));
  }
  overrideFor(provider: string, modelId: string): Override | undefined {
    return this.overrides.get(pairKey(provider, modelId));
  }
  get overrideCount(): number {
    return this.overrides.size;
  }

  /** The choice an agent actually calls: the override chain followed from the pair, bounded, else the choice itself. */
  effective(choice: ModelChoice, catalogue: readonly CatalogueEntry[]): ModelChoice {
    return this.follow(choice, catalogue).choice;
  }

  /**
   * REQ-MONITOR-142 with REQ-ORCH-091 (d) (OQ-177): the override `effective` ends on for this choice — the last hop of
   * its chain — or null when none moves it, so a switch onto an overridden pair can say where the agent really runs.
   */
  overrideReaching(choice: ModelChoice, catalogue: readonly CatalogueEntry[]): Override | null {
    return this.follow(choice, catalogue).last;
  }

  private follow(choice: ModelChoice, catalogue: readonly CatalogueEntry[]): { readonly choice: ModelChoice; readonly last: Override | null } {
    let current = choice;
    let last: Override | null = null;
    for (let hops = 0; hops < 8; hops++) {
      const o = this.overrides.get(pairKey(providerIdentity(catalogue, current.model), current.model.modelId));
      if (!o || sameRef(o.choice.model, current.model)) break;
      current = o.choice;
      last = o;
    }
    return { choice: current, last };
  }

  /**
   * Rehydrate from the session's timeline; an override whose key no longer resolves is dropped with a warning. An entry
   * carrying `cleared: true` takes back the pin on its pair (REQ-NOTIFY-070's restart that could not begin,
   * REQ-NOTIFY-078's re-pinned primary), so the entries replay in order to the memory the session last held.
   */
  static rehydrate(timeline: readonly { readonly name: string; readonly metadata: string }[], resolve: (key: string) => ModelChoice | null, warn: (m: string) => void = () => undefined): ResilienceMemory {
    const memory = new ResilienceMemory();
    for (const t of timeline) {
      if (t.name !== 'model_exhausted' && t.name !== 'model_override') continue;
      let meta: Record<string, unknown>;
      try { meta = JSON.parse(t.metadata) as Record<string, unknown>; } catch { continue; }
      const provider = typeof meta['provider'] === 'string' ? meta['provider'] : null;
      const model = typeof meta['model'] === 'string' ? meta['model'] : null;
      if (provider === null || model === null) continue;
      if (t.name === 'model_exhausted') { memory.exhausted.add(pairKey(provider, model)); continue; }
      if (meta['cleared'] === true) { memory.clearOverride(provider, model); continue; }
      const key = typeof meta['model_key'] === 'string' ? meta['model_key'] : null;
      if (key === null) continue;
      const choice = resolve(key);
      if (!choice) { warn(`the session's model override '${key}' names no model this run can reach and is not applied`); continue; }
      memory.setOverride(provider, model, { key, choice });
    }
    return memory;
  }
}
