import { z } from 'zod';

/**
 * What the Settings screen reads and writes for destination 1 — workspace and global configuration
 * (REQ-CONFIG-417). The screen never names a file (REQ-CONFIG-279): it reads this projection and emits
 * a save, a discard, or a per-field write; the workspace service commits (ADR-0037 Tier A).
 */
export const CONFIG_SCOPES = ['workspace', 'global'] as const;
export type ConfigScopeName = (typeof CONFIG_SCOPES)[number];
/** REQ-CONFIG-341: workspace > global > discovered (the snapshot layer) > built-in. */
export const CONFIG_ORIGINS = ['workspace', 'global', 'discovered', 'built-in'] as const;

export const MODEL_SLOT_NAMES = ['default_summary_model', 'improvement_collector_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model'] as const;
export type ModelSlotName = (typeof MODEL_SLOT_NAMES)[number];
/** REQ-CONFIG-256/329: the five slots the screen edits. */
export const EDITABLE_SLOTS = ['large_model', 'medium_model', 'small_model', 'fallback_model', 'default_summary_model'] as const;
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
  tools: z.array(z.string()),
});
/** The runtime keys the screen edits (REQ-CONFIG-256's set plus the diagnostics toggle), resolved. */
export const RuntimeViewSchema = z.object({
  max_depth: z.number().int(),
  max_active_children: z.number().int(),
  max_iterations: z.number().int(),
  allow_outside_workspace: z.boolean(),
  permission_mode: z.string(),
  improvement_collector_enabled: z.boolean(),
  keep_going: z.boolean(),
  run_start_mode: z.enum(RUN_START_MODE_NAMES),
  memory_diagnostics_enabled: z.boolean(),
  /** REQ-SHELL-125: the launch dialog preselects the effective configured value (REQ-TOOLS-114). Read here, not edited here. */
  sandbox_mode: z.enum(SANDBOX_MODE_NAMES),
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

export const ConfigSnapshotSchema = z.object({
  workspaceRoot: z.string(),
  /** False when the files could not be loaded; `fatal` then carries REQ-CONFIG-478's report and every other field is the built-in default. */
  loadOk: z.boolean(),
  fatal: z.string().nullable(),
  slots: z.array(SlotViewSchema),
  /** Configured model keys, synthetic entries excluded. */
  models: z.array(z.string()),
  roles: z.array(RoleViewSchema),
  runtime: RuntimeViewSchema,
  /** REQ-CONFIG-471: each scope's raw `runtime:` mapping as the file states it; null when the file states none. */
  rawRuntime: z.object({ workspace: z.record(z.string(), z.unknown()).nullable(), global: z.record(z.string(), z.unknown()).nullable() }),
  circuitBreakerEnabled: z.boolean(),
  compressorThresholdPercentage: z.number().int(),
  /** REQ-CHAT-166 (Part Z): the transcript's four display caps, resolved. */
  display: DisplayViewSchema,
  delegationStrategy: z.enum(DELEGATION_STRATEGY_NAMES),
  referential: z.array(z.string()),
  warnings: z.array(z.string()),
  files: z.object({ workspace: z.string(), global: z.string() }),
});
export type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;
export type SlotView = z.infer<typeof SlotViewSchema>;
export type RoleView = z.infer<typeof RoleViewSchema>;
export type RuntimeView = z.infer<typeof RuntimeViewSchema>;

/** REQ-CONFIG-259: a role edit carries its own scope. */
export const RoleEditSchema = z.object({
  scope: z.enum(CONFIG_SCOPES),
  model: z.string().nullable().optional(),
  thinking: z.enum(ROLE_REASONING_NAMES).nullable().optional(),
  unsetModel: z.boolean().optional(),
  unsetThinking: z.boolean().optional(),
});
/** REQ-CONFIG-256: the desktop save's enumerable key set. */
export const DesktopSaveSchema = z.object({
  slots: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.string().nullable()).optional(),
  slotThinking: z.partialRecord(z.enum(MODEL_SLOT_NAMES), z.enum(REASONING_LEVEL_NAMES).nullable()).optional(),
  runtime: z.record(z.string(), z.unknown()).optional(),
  circuitBreakerEnabled: z.boolean().optional(),
  compressorThresholdPercentage: z.number().int().optional(),
  delegationStrategy: z.enum(DELEGATION_STRATEGY_NAMES).optional(),
  roles: z.record(z.string(), RoleEditSchema).optional(),
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
