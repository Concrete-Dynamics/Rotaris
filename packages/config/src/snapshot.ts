import type { ConfigSnapshot, DesktopSavePayload } from '@rotaris/contracts';
import type { Timers } from '@rotaris/kernel';
import { PERSONA_SYNTHETIC_PREFIX, STARTUP_SLOT_PREFIX } from './keys.js';
import { isPlainMap, type PlainMap } from './merge.js';
import { loadConfiguration, scopeFiles, type LoadedConfiguration } from './load.js';
import { rolePreferences, slotPreferences } from './preferences.js';
import { RUNTIME_DEFAULTS } from './sections/runtime.js';
import { DISPLAY_DEFAULTS } from './display-section.js';
import { renderFatal } from './validate.js';
import { saveDesktop, writeConfigFields, type DesktopSave, type RoleEdit, type WriteRefusal } from './writers.js';

/**
 * ADR-0037 Tier A, the workspace service's side: read the projection the Settings screen consumes
 * (REQ-CONFIG-279, "the screen never names a file"), commit a save or a per-field write, and load again.
 */
export function snapshotOf(cfg: LoadedConfiguration): ConfigSnapshot {
  const rawRuntimeOf = (raw: PlainMap | null): Record<string, unknown> | null => (raw && isPlainMap(raw['runtime']) ? (raw['runtime'] as Record<string, unknown>) : null);
  return {
    workspaceRoot: cfg.workspaceRoot,
    loadOk: true,
    fatal: null,
    slots: slotPreferences(cfg).map((p) => ({ slot: p.slot, value: p.value, origin: p.origin, thinking: p.thinking })),
    models: Object.keys(cfg.models).filter((name) => !name.startsWith(STARTUP_SLOT_PREFIX) && !name.startsWith(PERSONA_SYNTHETIC_PREFIX)).sort(),
    roles: rolePreferences(cfg).map((r) => ({ role: r.role, rawModel: r.rawModel, modelOrigin: r.modelOrigin, effectiveModel: r.effectiveModel, inherited: r.inherited, builtInDefault: r.builtInDefault, rawThinking: r.rawThinking, thinkingOrigin: r.thinkingOrigin, tier: r.tier, tools: [...r.tools] })),
    runtime: {
      max_depth: cfg.runtime.max_depth, max_active_children: cfg.runtime.max_active_children, max_iterations: cfg.runtime.max_iterations,
      allow_outside_workspace: cfg.runtime.allow_outside_workspace, permission_mode: cfg.runtime.permission_mode,
      improvement_collector_enabled: cfg.runtime.improvement_collector_enabled, keep_going: cfg.runtime.keep_going, run_start_mode: cfg.runtime.run_start_mode,
      memory_diagnostics_enabled: cfg.runtime.memory_diagnostics_enabled, sandbox_mode: cfg.runtime.sandbox_mode,
    },
    rawRuntime: { workspace: rawRuntimeOf(cfg.raw.workspace.agents), global: rawRuntimeOf(cfg.raw.global.agents) },
    circuitBreakerEnabled: cfg.circuitBreaker.enabled,
    compressorThresholdPercentage: cfg.compressor.threshold_percentage,
    // REQ-CHAT-166 (Part Z): the transcript reads its caps from the same snapshot the settings screen does.
    display: { ...cfg.display },
    delegationStrategy: cfg.delegationStrategy,
    referential: [...cfg.referential],
    warnings: [...cfg.warnings],
    files: { workspace: cfg.files.workspace.agents, global: cfg.files.global.agents },
  };
}

/** REQ-CONFIG-478: a snapshot that carries the fatal report so the screen can say what to change. */
export function fatalSnapshot(globalDir: string, workspaceRoot: string, report: string): ConfigSnapshot {
  const files = scopeFiles(globalDir, workspaceRoot);
  return {
    workspaceRoot, loadOk: false, fatal: report, slots: [], models: [], roles: [],
    runtime: {
      max_depth: RUNTIME_DEFAULTS.max_depth, max_active_children: RUNTIME_DEFAULTS.max_active_children, max_iterations: RUNTIME_DEFAULTS.max_iterations,
      allow_outside_workspace: RUNTIME_DEFAULTS.allow_outside_workspace, permission_mode: RUNTIME_DEFAULTS.permission_mode,
      improvement_collector_enabled: RUNTIME_DEFAULTS.improvement_collector_enabled, keep_going: RUNTIME_DEFAULTS.keep_going, run_start_mode: RUNTIME_DEFAULTS.run_start_mode,
      memory_diagnostics_enabled: RUNTIME_DEFAULTS.memory_diagnostics_enabled, sandbox_mode: RUNTIME_DEFAULTS.sandbox_mode,
    },
    rawRuntime: { workspace: null, global: null },
    circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { ...DISPLAY_DEFAULTS }, delegationStrategy: 'orchestrator', referential: [], warnings: [],
    files: { workspace: files.workspace.agents, global: files.global.agents },
  };
}

export function readSnapshot(globalDir: string, workspaceRoot: string, now?: () => number): ConfigSnapshot {
  const loaded = loadConfiguration({ globalDir, workspaceRoot, ...(now ? { now } : {}) });
  return loaded.ok ? snapshotOf(loaded.value) : fatalSnapshot(globalDir, workspaceRoot, renderFatal(loaded.error));
}

/** The contract's save payload as the writer's argument (the two are one shape; the cast is over the runtime record). */
function toDesktopSave(save: DesktopSavePayload): DesktopSave {
  const roles: Record<string, RoleEdit> = {};
  for (const [role, edit] of Object.entries(save.roles ?? {})) roles[role] = { scope: edit.scope, ...(edit.model !== undefined ? { model: edit.model } : {}), ...(edit.thinking !== undefined ? { thinking: edit.thinking } : {}), ...(edit.unsetModel ? { unsetModel: true } : {}), ...(edit.unsetThinking ? { unsetThinking: true } : {}) };
  return {
    ...(save.slots ? { slots: save.slots } : {}),
    ...(save.slotThinking ? { slotThinking: save.slotThinking } : {}),
    ...(save.runtime ? { runtime: save.runtime as NonNullable<DesktopSave['runtime']> } : {}),
    ...(save.circuitBreakerEnabled !== undefined ? { circuitBreakerEnabled: save.circuitBreakerEnabled } : {}),
    ...(save.compressorThresholdPercentage !== undefined ? { compressorThresholdPercentage: save.compressorThresholdPercentage } : {}),
    ...(save.delegationStrategy !== undefined ? { delegationStrategy: save.delegationStrategy } : {}),
    ...(Object.keys(roles).length > 0 ? { roles } : {}),
  };
}

export type CommitResult = { readonly ok: true; readonly snapshot: ConfigSnapshot } | { readonly ok: false; readonly refusal: WriteRefusal };

/** REQ-CONFIG-256..261: the desktop save, then the load again within the same action. */
export async function commitDesktopSave(globalDir: string, workspaceRoot: string, save: DesktopSavePayload, timers: Timers): Promise<CommitResult> {
  const files = scopeFiles(globalDir, workspaceRoot);
  const r = await saveDesktop({ workspace: files.workspace.agents, global: files.global.agents }, toDesktopSave(save), { timers });
  if (!r.ok) return { ok: false, refusal: r.error };
  return { ok: true, snapshot: readSnapshot(globalDir, workspaceRoot) };
}

/** REQ-CONFIG-441/463: the scoped per-field write into the chosen scope (workspace when none), then the load again. */
export async function commitConfigFields(globalDir: string, workspaceRoot: string, scope: 'workspace' | 'global' | undefined, patch: Record<string, unknown>, timers: Timers): Promise<CommitResult> {
  const files = scopeFiles(globalDir, workspaceRoot);
  const r = await writeConfigFields(scope === 'global' ? files.global.agents : files.workspace.agents, patch, { timers });
  if (!r.ok) return { ok: false, refusal: r.error };
  return { ok: true, snapshot: readSnapshot(globalDir, workspaceRoot) };
}
