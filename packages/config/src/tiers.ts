import type { Result } from '@rotaris/kernel';
import { clonePlain, isPlainMap, type PlainMap } from './merge.js';
import { MODEL_SLOTS, REASONING_LEVELS, ROLE_REASONING_LEVELS, thinkingKeyOf, type ModelSlot, type ReasoningLevel, type RoleReasoning } from './keys.js';
import { DELEGATION_STRATEGIES, resolveMerged, type DelegationStrategy, type LoadedConfiguration } from './load.js';
import { validateRuntimeField, type RuntimeSection } from './sections/runtime.js';
import { readCompressorSection } from './sections/compressor.js';
import { readCircuitBreakerSection } from './circuit-breaker-section.js';
import { typeName, type Problem, type ProblemSink } from './sections/field.js';
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
/**
 * PD-CONFIG-003 adds `child_timeout`: the per-agent timeout is a delegation limit and commits as the depth cap and fan-out
 * limit do. Revision 2 adds `improvement_collector_timeout`: the one Runtime control whose on-screen value the next run did not
 * read (REQ-CONFIG-262). The list is the desktop save's runtime keys less the six confinement and egress fields, which
 * REQ-SANDBOX-118 keeps to the file (`writers.test.ts` pins the equality).
 */
export const TIER_B_RUNTIME_KEYS = ['permission_mode', 'max_depth', 'max_active_children', 'child_timeout', 'max_iterations', 'allow_outside_workspace', 'improvement_collector_enabled', 'improvement_collector_timeout', 'keep_going', 'run_start_mode'] as const;
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

/**
 * REQ-CONFIG-111 applied to Tier B: the load's own schema over each value `overlayLiveState` would lay on the merged
 * document, by the dotted path the loader would report it at. The run host refuses a `config.liveState` that has any
 * (`dispatch.ts`) and keeps the state it held, so no value reaches `resolveMerged` below that the load would reject: a
 * fault there is the files', and `statingFile` can only name a file. Until 2026-10-14 the handover installed the state
 * unchecked, and a live `max_depth: 0` was refused at run start in the name of a scope file that held 4
 * (docs/defects/fixed/a-live-setting-the-load-schema-rejects-is-reported-in-a-scope-file-that-does-not-hold-it.md).
 * A runtime key outside Tier B is not overlaid, so it is not checked; a slot's empty string leaves the file's value.
 */
export function liveStateProblems(live: LiveState): readonly Problem[] {
  const problems: Problem[] = [];
  const sink: ProblemSink = { errors: problems, warnings: [] };
  const oneOf = (path: string, value: unknown, accepted: readonly string[], nullable: boolean): void => {
    if (value === undefined || (nullable && value === null)) return;
    if (typeof value === 'string' && accepted.includes(value)) return;
    problems.push({ path, message: `'${typeof value === 'string' ? value : typeName(value)}' is not an accepted value; expected one of: ${accepted.join(', ')}` });
  };
  for (const slot of MODEL_SLOTS) {
    const model = live.slots?.[slot];
    if (model !== undefined && model !== null && typeof model !== 'string') problems.push({ path: slot, message: `must be a string or null, got ${typeName(model)}` });
    oneOf(thinkingKeyOf(slot), live.slotThinking?.[slot], REASONING_LEVELS, true);
  }
  if (live.entryRole !== undefined && typeof live.entryRole !== 'string') problems.push({ path: 'default_persona', message: `must be a string, got ${typeName(live.entryRole)}` });
  // The session override's path names the role the state hands over where it names one (fin46's review, accept1-17); with none,
  // the override lands on the configured default role, which this check does not read, so the path keeps the placeholder.
  const role = typeof live.entryRole === 'string' && live.entryRole !== '' ? live.entryRole : '<entry role>';
  if (live.sessionModel !== undefined && live.sessionModel !== null && typeof live.sessionModel !== 'string') problems.push({ path: `personas.${role}.model`, message: `must be a string, got ${typeName(live.sessionModel)}` });
  oneOf(`personas.${role}.thinking`, live.sessionThinking, ROLE_REASONING_LEVELS, true);
  oneOf('rotaris.delegation_strategy', live.delegationStrategy, DELEGATION_STRATEGIES, false);
  for (const key of TIER_B_RUNTIME_KEYS) {
    const value = live.runtime?.[key];
    if (value !== undefined) problems.push(...validateRuntimeField(key, value));
  }
  if (live.circuitBreakerEnabled !== undefined) readCircuitBreakerSection({ enabled: live.circuitBreakerEnabled }, sink);
  if (live.compressorThresholdPercentage !== undefined) readCompressorSection({ threshold_percentage: live.compressorThresholdPercentage }, sink);
  return problems;
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

  // The load's `raw` scope documents go with the overlaid document, so a fault the passes find names the scope file that
  // stated it (REQ-CONFIG-478, `statingFile`). A fault on a value the overlay supplied would be named the same way, in a
  // file that does not hold it; none reaches here from the product, since the run host installs only a live state
  // `liveStateProblems` passes (REQ-CONFIG-111). A caller that skips that check gets the files' attribution.
  return resolveMerged(top, {
    workspaceRoot: config.workspaceRoot, hooks: config.hooks, files: config.files, raw: config.raw,
    delegationStrategy: live.delegationStrategy ?? config.delegationStrategy, loadMs: config.loadMs, authenticatedProviders: config.authenticatedProviders, discoveredSlots: config.discoveredSlots,
    mcp: config.mcpInputs,
  });
}
