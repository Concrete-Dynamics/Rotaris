import { z } from 'zod';
import { SKILL_INVOCATION_MODE_NAMES, SKILL_LOAD_MODE_NAMES } from './skills.js'; // ADR-0063

/**
 * What the Settings screen reads and writes for destination 1 — workspace and global configuration
 * (REQ-CONFIG-417). The screen never names a file (REQ-CONFIG-279): it reads this projection and emits
 * a save, a discard, or a per-field write; the workspace service commits (ADR-0037 Tier A).
 */
export const CONFIG_SCOPES = ['workspace', 'global'] as const;
export type ConfigScopeName = (typeof CONFIG_SCOPES)[number];
/**
 * REQ-CONFIG-341: the Scope column's origin vocabulary, exactly these four, in the precedence it reports — workspace >
 * global > discovered (the snapshot layer, REQ-CONFIG-034) > default (a built-in value), REQ-CONFIG-031's layer order.
 */
export const CONFIG_ORIGINS = ['workspace', 'global', 'discovered', 'default'] as const;

export const MODEL_SLOT_NAMES = ['default_summary_model', 'improvement_collector_model', 'retrospective_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model'] as const;
export type ModelSlotName = (typeof MODEL_SLOT_NAMES)[number];
/** REQ-CONFIG-256/329 and REQ-LIBRARY-040: the startup slots the screen edits. */
export const EDITABLE_SLOTS = ['large_model', 'medium_model', 'small_model', 'fallback_model', 'default_summary_model', 'improvement_collector_model', 'retrospective_model'] as const;
export const REASONING_LEVEL_NAMES = ['auto', 'low', 'medium', 'high', 'max'] as const;
export const ROLE_REASONING_NAMES = ['default', 'provider_default', ...REASONING_LEVEL_NAMES] as const;
export const DELEGATION_STRATEGY_NAMES = ['orchestrator', 'swarm', 'single'] as const;
export const RUN_START_MODE_NAMES = ['auto', 'plan'] as const;
/** REQ-SANDBOX-048 / REQ-SHELL-125: the three values, in the order the launch dialog offers them. */
export const SANDBOX_MODE_NAMES = ['off', 'workspace-write', 'read-only'] as const;
export type SandboxModeName = (typeof SANDBOX_MODE_NAMES)[number];

export const SlotViewSchema = z.object({
  slot: z.enum(MODEL_SLOT_NAMES),
  value: z.string().nullable(),
  origin: z.enum(CONFIG_ORIGINS),
  thinking: z.string().nullable(),
});
export const RoleViewSchema = z.object({
  role: z.string(),
  rawModel: z.string().nullable(),
  modelOrigin: z.enum(CONFIG_ORIGINS),
  effectiveModel: z.string(),
  inherited: z.boolean(),
  builtInDefault: z.string().nullable(),
  rawThinking: z.string().nullable(),
  thinkingOrigin: z.enum(CONFIG_ORIGINS),
  tier: z.string().nullable(),
  /** The role's `tools:` as the files state it; empty when neither file states one (Settings shows it as written). */
  tools: z.array(z.string()),
  /**
   * REQ-MONITOR-060 / REQ-TOOLS-002 (live-run finding K1, R-067): the tools the role DECLARES — `tools` when the files state
   * any, else the built-in role's declaration (`declaredToolsOf`), the rule the run host's persona resolver applies. What
   * stands in on an agent surface where no resolved set is known.
   */
  declaredTools: z.array(z.string()),
});
/** The runtime keys the screen edits (REQ-CONFIG-256's set plus the diagnostics toggle), resolved. */
export const RuntimeViewSchema = z.object({
  max_depth: z.number().int(),
  max_active_children: z.number().int(),
  max_iterations: z.number().int(),
  allow_outside_workspace: z.boolean(),
  permission_mode: z.string(),
  improvement_collector_enabled: z.boolean(),
  improvement_collector_timeout: z.number().int().min(1),
  /** PD-LIBRARY-002: the retrospective's own bound, defaulting to 120 seconds. */
  retrospective_timeout: z.number().int().min(1),
  keep_going: z.boolean(),
  run_start_mode: z.enum(RUN_START_MODE_NAMES),
  memory_diagnostics_enabled: z.boolean(),
  /**
   * REQ-SANDBOX-113 (Part AR): all SIX sandbox and egress settings, so that no YAML has to be edited
   * by hand. `sandbox_mode` was carried here alone, read for the launch dialog's preselection
   * (REQ-SHELL-125, REQ-TOOLS-114), while the surface told the user the six were "read from the file
   * and not edited here" (`docs/defects/fixed/settings-surface-refuses-the-six-security-keys.md`).
   * All six round-trip: REQ-SANDBOX-054 requires the configuration loaded after a save be the same
   * effective configuration that was saved, and a further save-and-load change nothing again.
   */
  sandbox_mode: z.enum(SANDBOX_MODE_NAMES),
  sandbox_writable_roots: z.array(z.string()),
  sandbox_allow_network: z.boolean(),
  network_egress_policy: z.enum(['allow', 'ask', 'deny']),
  network_allowed_hosts: z.array(z.string()),
  network_denied_hosts: z.array(z.string()),
});
/**
 * REQ-CHAT-166's four display caps as the transcript reads them — workspace configuration, written to and read back
 * from the `display` section of the workspace `agents.yaml` (REQ-CONFIG-172/175). A line cap of `null` is
 * "unlimited", the last of the offered values 1, 2, 5, 10, 20, 50, unlimited. The Display settings CATEGORY that
 * offers the four controls is REQ-CONFIG-472 and is not built: this is the read path and the cap behaviour only.
 */
export const DisplayViewSchema = z.object({
  show_tool_results: z.boolean(),
  show_tool_inputs: z.boolean(),
  tool_result_lines: z.number().int().nullable(),
  tool_input_lines: z.number().int().nullable(),
});
export type DisplayView = z.infer<typeof DisplayViewSchema>;

/**
 * REQ-CONFIG-172 fixes the `display:` keys **as the file spells them** and REQ-CONFIG-472 the caps the surface
 * offers. The resolved view above keeps its own field names and spells "no cap" `null`; the file spells the same
 * thing `0`. Both spellings are stated here, in one place, because the reader and the settings surface sit in
 * different packages and a disagreement between them is unobservable until a file round-trips.
 */
export const DISPLAY_FILE_KEYS = ['show_tool_results', 'show_tool_inputs', 'tool_result_max_lines', 'tool_input_max_lines'] as const;
export type DisplayFileKey = (typeof DISPLAY_FILE_KEYS)[number];
/** REQ-CONFIG-472: the caps the Display category offers, in the order it offers them; `null` is "unlimited". */
export const DISPLAY_LINE_CAP_CHOICES: readonly (number | null)[] = [1, 2, 5, 10, 20, 50, null];
/** REQ-CONFIG-172: unlimited is stored as `0`. */
export function displayCapToFile(cap: number | null): number {
  return cap ?? 0;
}
/** REQ-CONFIG-172: `0` in the file is no limit, which the view carries as `null`. */
export function displayCapFromFile(stored: number): number | null {
  return stored === 0 ? null : stored;
}

/**
 * REQ-CONFIG-166..169: the `skills:` section as the layered load resolves it. Both maps are keyed by
 * REQ-WORKSPACE-054's normalized skill name and hold only the skills some layer states a policy for —
 * REQ-CONFIG-258 keeps the baselines out of the file, so an absent key means the default.
 */
export const SkillsConfigViewSchema = z.object({
  enabled: z.boolean(),
  overrides: z.record(z.string(), z.enum(SKILL_LOAD_MODE_NAMES)),
  invocation_overrides: z.record(z.string(), z.enum(SKILL_INVOCATION_MODE_NAMES)),
});
export type SkillsConfigView = z.infer<typeof SkillsConfigViewSchema>;
export const SKILLS_CONFIG_DEFAULT: SkillsConfigView = Object.freeze({ enabled: true, overrides: {}, invocation_overrides: {} });

/**
 * PD-WORKSPACE-002: the `instructions:` section as the layered load resolves it. The map is keyed by the
 * instruction file's stable identity (`workspace:AGENTS.md`, `global:CLAUDE.md`, …) and holds only the
 * files some layer states a policy for — absent means `on`, which is what keeps the sparse write
 * computable like REQ-CONFIG-258's.
 */
export const INSTRUCTION_STATE_NAMES = ['on', 'off'] as const;
export type InstructionStateName = (typeof INSTRUCTION_STATE_NAMES)[number];
export const InstructionsConfigViewSchema = z.object({
  overrides: z.record(z.string(), z.enum(INSTRUCTION_STATE_NAMES)),
});
export type InstructionsConfigView = z.infer<typeof InstructionsConfigViewSchema>;
export const INSTRUCTIONS_CONFIG_DEFAULT: InstructionsConfigView = Object.freeze({ overrides: {} });

export const ConfigSnapshotSchema = z.object({
  workspaceRoot: z.string(),
  /** False when the files could not be loaded; `fatal` then carries REQ-CONFIG-478's report and every other field is the built-in default. */
  loadOk: z.boolean(),
  fatal: z.string().nullable(),
  slots: z.array(SlotViewSchema),
  /** Configured model keys, synthetic entries excluded. */
  models: z.array(z.string()),
  /** REQ-CHAT-171/172: model keys whose provider declaration accepts image input. */
  imageInputModels: z.array(z.string()),
  roles: z.array(RoleViewSchema),
  runtime: RuntimeViewSchema,
  /** REQ-CONFIG-471: each scope's raw `runtime:` mapping as the file states it; null when the file states none. */
  rawRuntime: z.object({ workspace: z.record(z.string(), z.unknown()).nullable(), global: z.record(z.string(), z.unknown()).nullable() }),
  circuitBreakerEnabled: z.boolean(),
  compressorThresholdPercentage: z.number().int(),
  /** REQ-CHAT-166 (Part Z): the transcript's four display caps, resolved. */
  display: DisplayViewSchema,
  /**
   * PD-WORKSPACE-002: the Instructions inventory — every present instruction file in discovery order,
   * each described by its stable identity, file name, source label, absolute path and on/off state.
   * Empty with no workspace. A presence check, not a read: this says which files the agent's
   * instructions would come from, never what they say.
   */
  instructions: z.array(z.object({ id: z.string(), name: z.string(), path: z.string(), source: z.string(), enabled: z.boolean() })),
  /**
   * REQ-CONFIG-166..169 (ADR-0063): the `skills:` section as the files resolve it — the master switch and
   * the two override maps keyed by normalized skill name. The DISCOVERED skills are not here: they are the
   * run host's catalog, answered over `skills.read`, because they are read from disk on a different
   * schedule (REQ-WORKSPACE-058) and are not configuration.
   */
  skills: SkillsConfigViewSchema,
  /**
   * PD-WORKSPACE-002: the `instructions:` section as the files resolve it — the per-file override map
   * keyed by stable file identity. The screen holds it pending like the skills maps, so Save can write
   * it sparsely.
   */
  instructionsPolicy: InstructionsConfigViewSchema,
  /**
   * REQ-WORKSPACE-048's master switch `inject_agents_md`, as the files resolve it. It rides here
   * **separately from each row's `enabled`** — which already folds it in — because the Instructions
   * category has to tell two states apart that look identical in a switch: a file the user turned off,
   * and every file being off because injection is off for the whole workspace. The category does not
   * write this key (REQ-CONFIG-256 does not name it); it says so in words instead.
   */
  injectAgentsMd: z.boolean(),
  delegationStrategy: z.enum(DELEGATION_STRATEGY_NAMES),
  referential: z.array(z.string()),
  warnings: z.array(z.string()),
  files: z.object({ workspace: z.string(), global: z.string() }),
});
export type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;
export type SlotView = z.infer<typeof SlotViewSchema>;
export type RoleView = z.infer<typeof RoleViewSchema>;
export type RuntimeView = z.infer<typeof RuntimeViewSchema>;

/** One role's field edits at one scope: a model (null is the baseline, removing the key) or its unset, a reasoning level or its unset. */
export const RoleFieldEditsSchema = z.object({
  model: z.string().nullable().optional(),
  unsetModel: z.boolean().optional(),
  thinking: z.enum(ROLE_REASONING_NAMES).nullable().optional(),
  unsetThinking: z.boolean().optional(),
}).strict();
export type RoleFieldEditsPayload = z.infer<typeof RoleFieldEditsSchema>;
/**
 * REQ-CONFIG-259: "Role edits carry a per-field scope"; REQ-CONFIG-341: an Unset records "a pending unset of (role, field,
 * scope)". A role's edits are held under the scope each was made at, so a model unset at the workspace and a reasoning
 * unset at the global layer land where each was made, and a model unset at the workspace survives a model picked at the
 * global layer (defect note `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`; the edit carried one
 * scope for the whole entry until 2026-10-02). Strict, so an entry in the old one-scope shape is refused rather than read
 * as no edit at all.
 */
export const RoleEditSchema = z.object({
  workspace: RoleFieldEditsSchema.optional(),
  global: RoleFieldEditsSchema.optional(),
}).strict();
/**
 * REQ-CONFIG-256: the four `display:` fields, written per field and spelled as the file spells them
 * (REQ-CONFIG-172), so a `display:` key this screen does not offer is left as the file states it.
 */
export const DisplaySaveSchema = z.object({
  show_tool_results: z.boolean().optional(),
  show_tool_inputs: z.boolean().optional(),
  tool_result_max_lines: z.number().int().min(0).optional(),
  tool_input_max_lines: z.number().int().min(0).optional(),
});
export type DisplaySavePayload = z.infer<typeof DisplaySaveSchema>;

/**
 * REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys the desktop save writes, into the **workspace**
 * file only and with no per-field scope of their own.
 *
 * A map value of `null` **removes** that skill's key. The screen sends one where the chosen mode is the
 * baseline (`name-only` / `default`) and no lower layer states a policy for that skill, which is
 * REQ-CONFIG-258's sparse rule; where a lower layer does state one, it sends the baseline explicitly
 * instead, so returning one skill to the baseline is possible from the screen at all. Because `skills` is
 * section-class and both maps overlay per skill name (REQ-CONFIG-042/048), writing them this way overlays
 * exactly the skills the workspace names and never discards the global scope's policy for any other.
 */
export const SkillsSaveSchema = z.object({
  enabled: z.boolean().optional(),
  overrides: z.record(z.string(), z.enum(SKILL_LOAD_MODE_NAMES).nullable()).optional(),
  invocationOverrides: z.record(z.string(), z.enum(SKILL_INVOCATION_MODE_NAMES).nullable()).optional(),
});
export type SkillsSavePayload = z.infer<typeof SkillsSaveSchema>;

/**
 * PD-WORKSPACE-002: the `instructions.overrides` key the desktop save writes, into the **workspace**
 * file only and with no per-field scope of its own, on REQ-CONFIG-258's sparse terms.
 *
 * A map value of `null` **removes** that file's key. The screen sends one where the chosen state is the
 * baseline (`on`) and no lower layer states a policy for that file; where a lower layer does state one,
 * it sends the baseline explicitly instead, so returning one file to the baseline is possible from the
 * screen at all.
 */
export const InstructionsSaveSchema = z.object({
  overrides: z.record(z.string(), z.enum(INSTRUCTION_STATE_NAMES).nullable()).optional(),
});
export type InstructionsSavePayload = z.infer<typeof InstructionsSaveSchema>;

/** REQ-CONFIG-256: the desktop save's enumerable key set. */
export const DesktopSaveSchema = z.object({
  slots: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.string().nullable()).optional(),
  slotThinking: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.enum(REASONING_LEVEL_NAMES).nullable()).optional(),
  runtime: z.record(z.string(), z.unknown()).optional(),
  circuitBreakerEnabled: z.boolean().optional(),
  compressorThresholdPercentage: z.number().int().optional(),
  delegationStrategy: z.enum(DELEGATION_STRATEGY_NAMES).optional(),
  roles: z.record(z.string(), RoleEditSchema).optional(),
  /** REQ-CONFIG-472 (Part AG): destination 1's four tool-row display fields. */
  display: DisplaySaveSchema.optional(),
  /** REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys. Written SPARSELY — see `SkillsSaveSchema`. */
  skills: SkillsSaveSchema.optional(),
  /** PD-WORKSPACE-002: the `instructions.overrides` key. Written SPARSELY — see `InstructionsSaveSchema`. */
  instructions: InstructionsSaveSchema.optional(),
});
export type DesktopSavePayload = z.infer<typeof DesktopSaveSchema>;

/** ADR-0037 Tier B: the settings store's current values, as the run host applies them at run start. */
export const LiveStateSchema = z.object({
  slots: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.string().nullable()).optional(),
  slotThinking: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.enum(REASONING_LEVEL_NAMES).nullable()).optional(),
  delegationStrategy: z.enum(DELEGATION_STRATEGY_NAMES).optional(),
  runtime: z.record(z.string(), z.unknown()).optional(),
  circuitBreakerEnabled: z.boolean().optional(),
  compressorThresholdPercentage: z.number().int().optional(),
});
export type LiveStatePayload = z.infer<typeof LiveStateSchema>;
