import { homedir } from 'node:os';
import { declaredToolsOf, INSTRUCTIONS_CONFIG_DEFAULT, SKILLS_CONFIG_DEFAULT, type ConfigSnapshot, type DesktopSavePayload, type RoleFieldEditsPayload } from '@rotaris/contracts';
import type { Timers } from '@rotaris/kernel';
import { PERSONA_SYNTHETIC_PREFIX, STARTUP_SLOT_PREFIX } from './keys.js';
import { isPlainMap, type PlainMap } from './merge.js';
import { loadConfiguration, scopeFiles, type LoadedConfiguration } from './load.js';
import { rolePreferences, slotPreferences } from './preferences.js';
import { RUNTIME_DEFAULTS } from './sections/runtime.js';
import { DISPLAY_DEFAULTS } from './display-section.js';
import { renderFatal } from './validate.js';
import { discoverInstructionFiles, WORKSPACE_INSTRUCTION_FILE_NAMES } from './instructions.js';
import { saveDesktop, writeConfigFields, type DesktopSave, type RoleEdit, type RoleFieldEdits, type WriteRefusal } from './writers.js';

/**
 * ADR-0037 Tier A, the workspace service's side: read the projection the Settings screen consumes
 * (REQ-CONFIG-279, "the screen never names a file"), commit a save or a per-field write, and load again.
 * The projection also carries the Instructions inventory (REQ-CONFIG-277, narrowed by PD-WORKSPACE-002),
 * which is a presence check over the workspace, the global directory and the home- and machine-wide
 * bases rather than anything the configuration states — it rides here because the screen reads one shape.
 */

/** PD-WORKSPACE-002: the workspace instruction files, in discovery order. Kept for callers naming the workspace vocabulary. */
export const INSTRUCTION_FILE_NAMES = [...WORKSPACE_INSTRUCTION_FILE_NAMES] as const;

export interface InstructionSnapshotEnv {
  /** The Rotaris global configuration directory; absent means the global base is skipped. */
  readonly globalDir?: string | undefined;
  /** The operator's home; defaults to this process's, so unit tests pass an isolated one. */
  readonly home?: string | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  /** The machine-wide base's directory; `/etc/codex` unless a verification seam names another (`InstructionDiscoveryEnv`). */
  readonly machineDir?: string | undefined;
}

/**
 * PD-WORKSPACE-002: the Instructions inventory — every present instruction file in discovery order,
 * each described by its stable identity, file name, source label and absolute path, empty without a
 * workspace. A directory carrying one of the names is not an instruction file and is not listed;
 * anything unreadable reads as absent, which is what the empty state already says in words.
 */
export function instructionFiles(workspaceRoot: string, env: InstructionSnapshotEnv = {}): { id: string; name: string; path: string; source: string }[] {
  if (workspaceRoot.trim() === '') return [];
  return discoverInstructionFiles({
    workspaceRoot,
    globalDir: env.globalDir ?? '',
    home: env.home ?? homedir(),
    platform: env.platform ?? process.platform,
    machineDir: env.machineDir,
  });
}

/** PD-WORKSPACE-002: the on/off state of one inventoried file under the master switch and its policy. */
export function instructionEnabled(master: boolean, overrides: Readonly<Record<string, string>>, id: string): boolean {
  return master && (overrides[id] ?? 'on') === 'on';
}

export function snapshotOf(cfg: LoadedConfiguration, env: InstructionSnapshotEnv = {}): ConfigSnapshot {
  const rawRuntimeOf = (raw: PlainMap | null): Record<string, unknown> | null => (raw && isPlainMap(raw['runtime']) ? (raw['runtime'] as Record<string, unknown>) : null);
  const discovered = instructionFiles(cfg.workspaceRoot, { ...env, globalDir: env.globalDir ?? cfg.files.global.dir });
  return {
    workspaceRoot: cfg.workspaceRoot,
    loadOk: true,
    fatal: null,
    slots: slotPreferences(cfg).map((p) => ({ slot: p.slot, value: p.value, origin: p.origin, thinking: p.thinking })),
    models: Object.keys(cfg.models).filter((name) => !name.startsWith(STARTUP_SLOT_PREFIX) && !name.startsWith(PERSONA_SYNTHETIC_PREFIX)).sort(),
    imageInputModels: Object.keys(cfg.models).filter((name) => cfg.models[name]!.accepts_image_input && !name.startsWith(STARTUP_SLOT_PREFIX) && !name.startsWith(PERSONA_SYNTHETIC_PREFIX)).sort(),
    roles: rolePreferences(cfg).map((r) => ({ role: r.role, rawModel: r.rawModel, modelOrigin: r.modelOrigin, effectiveModel: r.effectiveModel, inherited: r.inherited, builtInDefault: r.builtInDefault, rawThinking: r.rawThinking, thinkingOrigin: r.thinkingOrigin, tier: r.tier, tools: [...r.tools], declaredTools: [...declaredToolsOf(r.role, r.tools)] })),
    runtime: {
      max_depth: cfg.runtime.max_depth, max_active_children: cfg.runtime.max_active_children, child_timeout: cfg.runtime.child_timeout, max_iterations: cfg.runtime.max_iterations,
      allow_outside_workspace: cfg.runtime.allow_outside_workspace, permission_mode: cfg.runtime.permission_mode,
      improvement_collector_enabled: cfg.runtime.improvement_collector_enabled, improvement_collector_timeout: cfg.runtime.improvement_collector_timeout, retrospective_timeout: cfg.runtime.retrospective_timeout, keep_going: cfg.runtime.keep_going, run_start_mode: cfg.runtime.run_start_mode,
      memory_diagnostics_enabled: cfg.runtime.memory_diagnostics_enabled,
      // REQ-SANDBOX-113 (Part AR): all six, so the runtime section can edit them.
      sandbox_mode: cfg.runtime.sandbox_mode, sandbox_writable_roots: [...cfg.runtime.sandbox_writable_roots],
      sandbox_allow_network: cfg.runtime.sandbox_allow_network, network_egress_policy: cfg.runtime.network_egress_policy,
      network_allowed_hosts: [...cfg.runtime.network_allowed_hosts], network_denied_hosts: [...cfg.runtime.network_denied_hosts],
    },
    rawRuntime: { workspace: rawRuntimeOf(cfg.raw.workspace.agents), global: rawRuntimeOf(cfg.raw.global.agents) },
    circuitBreakerEnabled: cfg.circuitBreaker.enabled,
    compressorThresholdPercentage: cfg.compressor.threshold_percentage,
    // REQ-CHAT-166 (Part Z): the transcript reads its caps from the same snapshot the settings screen does.
    display: { ...cfg.display },
    // PD-WORKSPACE-002: every present file with its on/off state under the master switch and its policy.
    instructions: discovered.map((f) => ({ ...f, enabled: instructionEnabled(cfg.injectAgentsMd, cfg.instructions.overrides as Readonly<Record<string, string>>, f.id) })),
    // REQ-CONFIG-166..169 (ADR-0063): the policy the Settings selectors edit. The discovered skills ride a
    // different answer (`skills.read`), because they are read from disk on a different schedule.
    skills: { enabled: cfg.skills.enabled, overrides: { ...cfg.skills.overrides }, invocation_overrides: { ...cfg.skills.invocation_overrides } },
    // PD-WORKSPACE-002: the per-file policy the Instructions switches edit, and REQ-WORKSPACE-048's
    // master switch beside it, so the screen can tell "this file is off" from "injection is off".
    instructionsPolicy: { overrides: { ...cfg.instructions.overrides } },
    injectAgentsMd: cfg.injectAgentsMd,
    delegationStrategy: cfg.delegationStrategy,
    referential: [...cfg.referential],
    warnings: [...cfg.warnings],
    files: { workspace: cfg.files.workspace.agents, global: cfg.files.global.agents },
  };
}

/** REQ-CONFIG-478: a snapshot that carries the fatal report so the screen can say what to change. */
export function fatalSnapshot(globalDir: string, workspaceRoot: string, report: string, env: InstructionSnapshotEnv = {}): ConfigSnapshot {
  const files = scopeFiles(globalDir, workspaceRoot);
  return {
    workspaceRoot, loadOk: false, fatal: report, slots: [], models: [], imageInputModels: [], roles: [],
    runtime: {
      max_depth: RUNTIME_DEFAULTS.max_depth, max_active_children: RUNTIME_DEFAULTS.max_active_children, child_timeout: RUNTIME_DEFAULTS.child_timeout, max_iterations: RUNTIME_DEFAULTS.max_iterations,
      allow_outside_workspace: RUNTIME_DEFAULTS.allow_outside_workspace, permission_mode: RUNTIME_DEFAULTS.permission_mode,
      improvement_collector_enabled: RUNTIME_DEFAULTS.improvement_collector_enabled, improvement_collector_timeout: RUNTIME_DEFAULTS.improvement_collector_timeout, retrospective_timeout: RUNTIME_DEFAULTS.retrospective_timeout, keep_going: RUNTIME_DEFAULTS.keep_going, run_start_mode: RUNTIME_DEFAULTS.run_start_mode,
      memory_diagnostics_enabled: RUNTIME_DEFAULTS.memory_diagnostics_enabled,
      sandbox_mode: RUNTIME_DEFAULTS.sandbox_mode, sandbox_writable_roots: [...RUNTIME_DEFAULTS.sandbox_writable_roots],
      sandbox_allow_network: RUNTIME_DEFAULTS.sandbox_allow_network, network_egress_policy: RUNTIME_DEFAULTS.network_egress_policy,
      network_allowed_hosts: [...RUNTIME_DEFAULTS.network_allowed_hosts], network_denied_hosts: [...RUNTIME_DEFAULTS.network_denied_hosts],
    },
    rawRuntime: { workspace: null, global: null },
    circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { ...DISPLAY_DEFAULTS }, skills: { ...SKILLS_CONFIG_DEFAULT }, instructionsPolicy: { ...INSTRUCTIONS_CONFIG_DEFAULT }, injectAgentsMd: true, delegationStrategy: 'orchestrator', referential: [], warnings: [],
    // The instruction files exist or do not whatever the configuration says, so the inventory stands in a fatal snapshot too.
    instructions: instructionFiles(workspaceRoot, { ...env, globalDir: env.globalDir ?? globalDir }).map((f) => ({ ...f, enabled: true })),
    files: { workspace: files.workspace.agents, global: files.global.agents },
  };
}

export function readSnapshot(globalDir: string, workspaceRoot: string, now?: () => number, env: InstructionSnapshotEnv = {}): ConfigSnapshot {
  const loaded = loadConfiguration({ globalDir, workspaceRoot, ...(now ? { now } : {}) });
  return loaded.ok ? snapshotOf(loaded.value, env) : fatalSnapshot(globalDir, workspaceRoot, renderFatal(loaded.error), env);
}

/** The contract's save payload as the writer's argument (the two are one shape; the cast is over the runtime record). */
function toDesktopSave(save: DesktopSavePayload): DesktopSave {
  const roles: Record<string, RoleEdit> = {};
  // REQ-CONFIG-259/341: each field's edit keeps the scope it was made at through to the writer.
  const fields = (f: RoleFieldEditsPayload | undefined): RoleFieldEdits | undefined => (f === undefined ? undefined : { ...(f.model !== undefined ? { model: f.model } : {}), ...(f.unsetModel ? { unsetModel: true } : {}), ...(f.thinking !== undefined ? { thinking: f.thinking } : {}), ...(f.unsetThinking ? { unsetThinking: true } : {}) });
  for (const [role, edit] of Object.entries(save.roles ?? {})) { const w = fields(edit.workspace); const g = fields(edit.global); roles[role] = { ...(w === undefined ? {} : { workspace: w }), ...(g === undefined ? {} : { global: g }) }; }
  return {
    ...(save.slots ? { slots: save.slots } : {}),
    ...(save.slotThinking ? { slotThinking: save.slotThinking } : {}),
    ...(save.runtime ? { runtime: save.runtime as NonNullable<DesktopSave['runtime']> } : {}),
    ...(save.circuitBreakerEnabled !== undefined ? { circuitBreakerEnabled: save.circuitBreakerEnabled } : {}),
    ...(save.compressorThresholdPercentage !== undefined ? { compressorThresholdPercentage: save.compressorThresholdPercentage } : {}),
    ...(save.delegationStrategy !== undefined ? { delegationStrategy: save.delegationStrategy } : {}),
    // REQ-CONFIG-256/472: the four `display:` fields, already spelled as the file spells them (REQ-CONFIG-172).
    ...(save.display && Object.keys(save.display).length > 0 ? { display: save.display } : {}),
    // REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys, already sparse — a null value removes a key.
    ...(save.skills && Object.keys(save.skills).length > 0 ? { skills: save.skills } : {}),
    // PD-WORKSPACE-002: the `instructions.overrides` key, already sparse — a null value removes a key.
    ...(save.instructions && Object.keys(save.instructions).length > 0 ? { instructions: save.instructions } : {}),
    ...(Object.keys(roles).length > 0 ? { roles } : {}),
  };
}

export type CommitResult = { readonly ok: true; readonly snapshot: ConfigSnapshot } | { readonly ok: false; readonly refusal: WriteRefusal };

/** REQ-CONFIG-256..261: the desktop save, then the load again within the same action. */
export async function commitDesktopSave(globalDir: string, workspaceRoot: string, save: DesktopSavePayload, timers: Timers, env: InstructionSnapshotEnv = {}): Promise<CommitResult> {
  const files = scopeFiles(globalDir, workspaceRoot);
  const r = await saveDesktop({ workspace: files.workspace.agents, global: files.global.agents }, toDesktopSave(save), { timers });
  if (!r.ok) return { ok: false, refusal: r.error };
  return { ok: true, snapshot: readSnapshot(globalDir, workspaceRoot, undefined, env) };
}

/** REQ-CONFIG-441/463: the scoped per-field write into the chosen scope (workspace when none), then the load again. */
export async function commitConfigFields(globalDir: string, workspaceRoot: string, scope: 'workspace' | 'global' | undefined, patch: Record<string, unknown>, timers: Timers, env: InstructionSnapshotEnv = {}): Promise<CommitResult> {
  const files = scopeFiles(globalDir, workspaceRoot);
  const r = await writeConfigFields(scope === 'global' ? files.global.agents : files.workspace.agents, patch, { timers });
  if (!r.ok) return { ok: false, refusal: r.error };
  return { ok: true, snapshot: readSnapshot(globalDir, workspaceRoot, undefined, env) };
}
