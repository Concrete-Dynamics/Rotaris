import { z } from 'zod';

/**
 * REQ-HOOKS-001: the product's single definition of the hook event vocabulary and its two families.
 * A document that needs to name a hook event, count them, or say which family one belongs to cites
 * this identifier; a surface needing a new lifecycle point extends the list here.
 */
export const TOOL_HOOK_EVENTS = ['pre_tool', 'post_tool'] as const;
export const LIFECYCLE_HOOK_EVENTS = ['session_start', 'session_end', 'iteration_end', 'child_completed', 'verifier_finished'] as const;
export const HOOK_EVENTS = [...TOOL_HOOK_EVENTS, ...LIFECYCLE_HOOK_EVENTS] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];
export type ToolHookEvent = (typeof TOOL_HOOK_EVENTS)[number];
export type LifecycleHookEvent = (typeof LIFECYCLE_HOOK_EVENTS)[number];
const HOOK_EVENT_SET: ReadonlySet<string> = new Set(HOOK_EVENTS);
export function isHookEvent(name: string): name is HookEvent {
  return HOOK_EVENT_SET.has(name);
}
export function isToolHookEvent(name: string): name is ToolHookEvent {
  return name === 'pre_tool' || name === 'post_tool';
}

/** REQ-HOOKS-020: exactly these three scopes are trusted; anything else is withheld by the gate. Imported hooks carry `external:claude-code`. */
export const TRUSTED_HOOK_SCOPES = ['default', 'global', 'workspace'] as const;
export type TrustedHookScope = (typeof TRUSTED_HOOK_SCOPES)[number];
export const EXTERNAL_CLAUDE_CODE_SCOPE = 'external:claude-code' as const;

/** REQ-HOOKS-126: the only defined skip reason. */
export const HOOK_SKIP_REASONS = ['untrusted_workspace'] as const;

/** REQ-HOOKS-123: the identity every `hook.start` and `hook.finish` carries. */
export const HookIdentitySchema = z.object({
  hook_id: z.string().min(1),
  hook_name: z.string().min(1),
  lifecycle_point: z.enum(HOOK_EVENTS),
  scope: z.string(),
  tool_name: z.string(),
});
/** REQ-HOOKS-124: `hook.start` adds the masked command. */
export const HookStartPayloadSchema = HookIdentitySchema.extend({ command: z.string() });
/** REQ-HOOKS-125/126, REQ-EVENTS-047: `hook.finish`; the no-exit-status state is `null` here, never `-1`. */
export const HookFinishPayloadSchema = HookIdentitySchema.extend({
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().nullable(),
  blocked: z.boolean(),
  timed_out: z.boolean(),
  skipped: z.boolean(),
  skip_reason: z.string(),
  output: z.string(),
});
export type HookStartPayload = z.infer<typeof HookStartPayloadSchema>;
export type HookFinishPayload = z.infer<typeof HookFinishPayloadSchema>;

/** REQ-HOOKS-105 / REQ-NOTIFY-227: the closed four-statement hook-trust vocabulary. */
export const HOOK_TRUST_STATUSES = ['none', 'review', 'trusted', 'refused'] as const;
export type HookTrustStatus = (typeof HOOK_TRUST_STATUSES)[number];

/** REQ-HOOKS-103 / REQ-CONFIG-359: the row status vocabulary, in its precedence order. */
export const HOOK_ROW_STATUSES = ['superseded', 'inactive', 'disabled by agent', 'disabled', 'blocked — not reviewed', 'active'] as const;
export type HookRowStatus = (typeof HOOK_ROW_STATUSES)[number];

/** REQ-HOOKS-103/115: the two agent groups of the Hooks tab. */
export const HOOK_AGENT_IDS = ['rotaris', 'claude-code'] as const;
export type HookAgentId = (typeof HOOK_AGENT_IDS)[number];

/** What the Hooks tab renders per row (REQ-HOOKS-103, REQ-CONFIG-358): never the command (REQ-HOOKS-102). */
export const HookRowSchema = z.object({
  agent: z.enum(HOOK_AGENT_IDS),
  id: z.string(),
  name: z.string(),
  event: z.string(),
  matcher: z.string(),
  sourceLabel: z.string(),
  scope: z.string(),
  status: z.enum(HOOK_ROW_STATUSES),
  statusReason: z.string(),
  checkable: z.boolean(),
  checked: z.boolean(),
  hasCommand: z.boolean(),
});
export type HookRow = z.infer<typeof HookRowSchema>;

/** REQ-HOOKS-137: one invocation as the tab lists it; stdout/stderr already masked and limited. */
export const HookInvocationSchema = z.object({
  hookId: z.string(),
  name: z.string(),
  event: z.string(),
  toolName: z.string(),
  exitCode: z.number().int(),
  durationMs: z.number(),
  timedOut: z.boolean(),
  blocked: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  withheld: z.boolean(),
  switchedOff: z.boolean(),
  reason: z.string(),
});
export type HookInvocation = z.infer<typeof HookInvocationSchema>;

/** REQ-HOOKS-106: one entry of the review dialog — the only surface that carries the command. */
export const HookReviewEntrySchema = z.object({
  name: z.string(),
  event: z.string(),
  matcher: z.string(),
  timeoutSeconds: z.number(),
  required: z.boolean(),
  enabled: z.boolean(),
  command: z.string(),
});
export const HooksSummarySchema = z.object({
  workspace: z.string(),
  status: z.enum(HOOK_TRUST_STATUSES),
  fingerprint: z.string(),
  declaredCount: z.number().int().nonnegative(),
  notice: z.string(),
  rows: z.array(HookRowSchema),
  review: z.array(HookReviewEntrySchema),
  invocations: z.array(HookInvocationSchema),
  decisionStored: z.boolean(),
  loadError: z.string(),
});
export type HooksSummary = z.infer<typeof HooksSummarySchema>;
