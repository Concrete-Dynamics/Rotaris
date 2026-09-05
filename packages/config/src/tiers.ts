import type { Result } from '@rotaris/kernel';
import { clonePlain, isPlainMap, type PlainMap } from './merge.js';
import { MODEL_SLOTS, thinkingKeyOf, type ModelSlot, type ReasoningLevel, type RoleReasoning } from './keys.js';
import { resolveMerged, type DelegationStrategy, type LoadedConfiguration } from './load.js';
import type { RuntimeSection } from './sections/runtime.js';
import type { FatalLoadReport } from './validate.js';

/**
 * ADR-0037 — when a configuration change takes effect.
 *
 * Tier A is a call: a writer, then the load again (the workspace service's).
 * Tier B is THIS pure function, applied at run start in the run host: the loaded configuration's merged
 * document is copied, the settings store's current values are laid on top, and the loader's own passes
 * run over the result (`resolveMerged`) — REQ-CONFIG-262/263 "exactly as the loader does".
 * Tier C is the absence of a mechanism: everything outside A and B is read at the next load
 * (REQ-CONFIG-265), and nothing here watches a file.
 */
export const TIER_B_RUNTIME_KEYS = ['permission_mode', 'max_depth', 'max_active_children', 'max_iterations', 'allow_outside_workspace', 'improvement_collector_enabled', 'keep_going', 'run_start_mode'] as const;
export type TierBRuntimeKey = (typeof TIER_B_RUNTIME_KEYS)[number];

export interface LiveState {
  /** The five slots as the screen holds them; a slot the store holds empty leaves the file's value (REQ-CONFIG-256's rule, applied live too). */
  readonly slots?: Partial<Record<ModelSlot, string | null>>;
  readonly slotThinking?: Partial<Record<ModelSlot, ReasoningLevel | null>>;
  /** The composer's role selector: the run's default role, only when that role exists (REQ-CONFIG-263). */
  readonly entryRole?: string;
  /** A session-wide model override for the entry role only; children keep their own models. */
  readonly sessionModel?: string | null;
  readonly sessionThinking?: RoleReasoning | null;
  readonly delegationStrategy?: DelegationStrategy;
  readonly runtime?: Partial<Pick<RuntimeSection, TierBRuntimeKey>>;
  readonly circuitBreakerEnabled?: boolean;
  readonly compressorThresholdPercentage?: number;
}

export function overlayLiveState(config: LoadedConfiguration, live: LiveState): Result<LoadedConfiguration, FatalLoadReport> {
  const top: PlainMap = clonePlain(config.merged);
  const personas = isPlainMap(top['personas']) ? (top['personas'] as Record<string, unknown>) : {};

  for (const slot of MODEL_SLOTS) {
    const wanted = live.slots?.[slot];
    if (wanted === undefined || wanted === '') continue;
    const previous = typeof top[slot] === 'string' ? (top[slot] as string) : null;
    top[slot] = wanted;
    // REQ-CONFIG-263: a role whose model equals the slot name or the slot's previous value follows the new value (first match wins).
    if (wanted !== null) {
      for (const role of Object.values(personas)) {
        if (!isPlainMap(role)) continue;
        if (role['model'] === slot) continue; // an alias follows the slot through substitution
        if (previous !== null && role['model'] === previous) role['model'] = wanted;
      }
    }
    const thinking = live.slotThinking?.[slot];
    if (thinking !== undefined) top[thinkingKeyOf(slot)] = thinking;
  }
  for (const slot of MODEL_SLOTS) {
    const thinking = live.slotThinking?.[slot];
    if (thinking !== undefined && live.slots?.[slot] === undefined) top[thinkingKeyOf(slot)] = thinking;
  }

  let defaultPersona = typeof top['default_persona'] === 'string' ? (top['default_persona'] as string) : config.defaultPersona;
  if (live.entryRole !== undefined && isPlainMap(personas[live.entryRole])) { defaultPersona = live.entryRole; top['default_persona'] = live.entryRole; }
  const entry = personas[defaultPersona];
  if (isPlainMap(entry)) {
    if (live.sessionModel !== undefined && live.sessionModel !== null && live.sessionModel !== '') entry['model'] = live.sessionModel;
    if (live.sessionThinking !== undefined) entry['thinking'] = live.sessionThinking;
  }

  if (live.runtime) {
    const runtime = isPlainMap(top['runtime']) ? (top['runtime'] as PlainMap) : {};
    for (const key of TIER_B_RUNTIME_KEYS) if (live.runtime[key] !== undefined) runtime[key] = live.runtime[key];
    top['runtime'] = runtime;
  }
  if (live.circuitBreakerEnabled !== undefined) {
    const cb = isPlainMap(top['circuit_breaker']) ? (top['circuit_breaker'] as PlainMap) : {};
    cb['enabled'] = live.circuitBreakerEnabled;
    top['circuit_breaker'] = cb;
  }
  if (live.compressorThresholdPercentage !== undefined) {
    const c = isPlainMap(top['compressor']) ? (top['compressor'] as PlainMap) : {};
    c['threshold_percentage'] = live.compressorThresholdPercentage;
    top['compressor'] = c;
  }

  return resolveMerged(top, {
    workspaceRoot: config.workspaceRoot, hooks: config.hooks, files: config.files, raw: config.raw,
    delegationStrategy: live.delegationStrategy ?? config.delegationStrategy, loadMs: config.loadMs, authenticatedProviders: config.authenticatedProviders,
  });
}
