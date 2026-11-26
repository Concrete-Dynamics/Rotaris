import type { LeverOrigin, MoneyLevers, MoneyResolution } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { clonePlain, isPlainMap, type PlainMap } from './merge.js';
import { capabilityLevelsForEntry } from './project-settings.js';
import { offeredReasoningLevels } from './sections/models.js';
import { rolePreferences } from './preferences.js';
import type { DelegationStrategy, LoadedConfiguration } from './load.js';
import type { FatalLoadReport } from './validate.js';

/** Where the separate `rotaris.delegation_strategy` comes from: the workspace document states it, or the shipped default stands. */
function strategyOrigin(cfg: LoadedConfiguration): LeverOrigin {
  const section = cfg.raw.workspace.agents?.['rotaris'];
  return isPlainMap(section) && Object.prototype.hasOwnProperty.call(section, 'delegation_strategy') ? 'workspace' : 'default';
}

/** A runtime key's scope: the workspace document over the global one, else the shipped default. */
function runtimeOrigin(cfg: LoadedConfiguration, key: string): LeverOrigin {
  for (const scope of ['workspace', 'global'] as const) {
    const runtime = cfg.raw[scope].agents?.['runtime'];
    if (isPlainMap(runtime) && Object.prototype.hasOwnProperty.call(runtime, key)) return scope;
  }
  return 'default';
}

/**
 * PD-ORCH-021 clause 2: the levers with where each comes from, read once from a loaded configuration — the run host's at a
 * run's start, and the snapshot's the composer preview reads (`snapshotOf`), so the two never read them differently.
 *
 * `files` is the configuration as the files alone state it, before ADR-0037's Tier B overlay. A lever the live state changed
 * (the settings screen's unsaved edits, the composer's session model chip) is a choice the user made for the next run, so it
 * is set: `workspace` for a screen value, `session` for the entry role's session override.
 */
export { readMoneySlider, type MoneySliderSetting } from './money-slider-key.js';

export function moneyLeversOf(cfg: LoadedConfiguration, files?: LoadedConfiguration): MoneyLevers {
  const lever = (key: 'max_active_children' | 'max_depth' | 'max_children'): { value: number; origin: LeverOrigin } => {
    const value = cfg.runtime[key];
    if (files !== undefined && files.runtime[key] !== value) return { value, origin: 'workspace' };
    return { value, origin: runtimeOrigin(cfg, key) };
  };
  const slot = (name: 'small_model' | 'medium_model' | 'large_model'): string | null => cfg.slots[name];
  const offered: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(cfg.models)) offered[key] = [...offeredReasoningLevels(entry, capabilityLevelsForEntry(key, entry, cfg.snapshotCapabilities))];
  const overridden = (role: string): boolean => files !== undefined && JSON.stringify(files.personas[role] ?? null) !== JSON.stringify(cfg.personas[role] ?? null);
  return {
    strategy: { value: cfg.delegationStrategy, origin: files !== undefined && files.delegationStrategy !== cfg.delegationStrategy ? 'workspace' : strategyOrigin(cfg) },
    maxActive: lever('max_active_children'),
    maxDepth: lever('max_depth'),
    maxTotal: lever('max_children'),
    entryRole: cfg.defaultPersona,
    roles: rolePreferences(cfg).map((r) => {
      const session = r.role === cfg.defaultPersona && overridden(r.role);
      return {
        role: r.role,
        // As configured: what a scope states, else the built-in role's tier alias, else what the loader resolved.
        model: session ? { value: r.effectiveModel, origin: 'session' } : { value: r.rawModel ?? r.builtInDefault ?? r.effectiveModel, origin: r.modelOrigin },
        thinking: { value: r.rawThinking, origin: session ? 'session' : r.thinkingOrigin },
      };
    }),
    slots: { small_model: slot('small_model'), medium_model: slot('medium_model'), large_model: slot('large_model') },
    offered,
  };
}

/**
 * Clause 3 laid over the configuration as ADR-0037's Tier B lays the live state: the merged document is copied, every lever
 * the resolution moved is written where the files would state it, and the loader's own passes run again (`resolve`), so a
 * tier alias is substituted, a role's level becomes its synthetic copy and the referential stage reads the result exactly as
 * it reads a file. A lever the resolution did not move is not touched. Nothing is written to any file.
 */
export function applyMoneyResolution(
  cfg: LoadedConfiguration,
  resolution: MoneyResolution,
  resolve: (top: PlainMap, delegationStrategy: DelegationStrategy) => Result<LoadedConfiguration, FatalLoadReport>,
): Result<LoadedConfiguration, FatalLoadReport> {
  const moved = resolution.roles.some((r) => r.model.mark?.kind === 'moved' || r.thinking.mark?.kind === 'moved')
    || resolution.strategy.mark?.kind === 'moved'
    || (resolution.limits !== null && [resolution.limits.maxActive, resolution.limits.maxDepth, resolution.limits.maxTotal].some((l) => l.mark?.kind === 'moved'));
  if (!moved) return ok(cfg);
  const top: PlainMap = clonePlain(cfg.merged);
  const personas = isPlainMap(top['personas']) ? top['personas'] : (top['personas'] = {});
  for (const r of resolution.roles) {
    const modelMoved = r.model.mark?.kind === 'moved';
    const thinkingMoved = r.thinking.mark?.kind === 'moved';
    if (!modelMoved && !thinkingMoved) continue;
    const entry: PlainMap = isPlainMap(personas[r.role]) ? (personas[r.role] as PlainMap) : ((personas[r.role] = {}));
    if (modelMoved) entry['model'] = r.model.value;
    if (thinkingMoved) entry['thinking'] = r.thinking.value;
  }
  if (resolution.limits !== null) {
    const runtime: PlainMap = isPlainMap(top['runtime']) ? top['runtime'] : (top['runtime'] = {});
    if (resolution.limits.maxActive.mark?.kind === 'moved') runtime['max_active_children'] = resolution.limits.maxActive.value;
    if (resolution.limits.maxDepth.mark?.kind === 'moved') runtime['max_depth'] = resolution.limits.maxDepth.value;
    if (resolution.limits.maxTotal.mark?.kind === 'moved') runtime['max_children'] = resolution.limits.maxTotal.value;
  }
  const applied = resolve(top, resolution.strategy.value);
  return applied.ok ? ok(applied.value) : err(applied.error);
}
