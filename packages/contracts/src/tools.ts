import { z } from 'zod';

/**
 * The closed vocabularies of the tools and permissions domain, in ONE place (REQ-TOOLS-001, -012,
 * -028, -041, -047, -051, -056, REQ-MONITOR-105). The engine and agent-tools read them; a surface
 * renders them and never invents a member.
 */

/** REQ-TOOLS-001: exactly nineteen public names. */
export const PUBLIC_TOOL_NAMES = [
  'ask_questions', 'delegate', 'background_output', 'wait_for_tasks', 'haet', 'haet_edit', 'haet_read', 'read_file',
  'write_file', 'terminal', 'git_commit', 'git_read', 'todo', 'fetch', 'grep', 'glob', 'artifact_read', 'artifact_list', 'artifact_write',
] as const;
export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];
export const PUBLIC_TOOL_NAME_SET: ReadonlySet<string> = new Set(PUBLIC_TOOL_NAMES);

/** REQ-TOOLS-001: `haet` resolves to the same tool as `haet_edit`. */
export const TOOL_ALIASES: Readonly<Record<string, PublicToolName>> = Object.freeze({ haet: 'haet_edit' });

/**
 * REQ-TOOLS-006's fourth control, the per-persona `tool_restrictions` map (REQ-CONFIG-103: a name mapped to an
 * allowed-tool list), read as OQ-145 builds it: `tool` survives only when EVERY list that binds the agent names it.
 * A name and its alias are one tool (REQ-TOOLS-001), and a list naming `delegate` names the two tools declaring
 * `delegate` surfaces with it (REQ-TOOLS-005). No list binding the agent leaves every tool standing. The engine's
 * write-scope refusal and the run host's narrowing both read this one predicate, so the two cannot disagree.
 */
export function restrictionsAllow(lists: readonly (readonly string[])[], tool: string): boolean {
  const canonical = (n: string): string => TOOL_ALIASES[n.trim()] ?? n.trim();
  const wanted = canonical(tool);
  const companion = wanted === 'background_output' || wanted === 'wait_for_tasks';
  return lists.every((list) => list.some((n) => { const c = canonical(n); return c === wanted || (companion && c === 'delegate'); }));
}

/**
 * REQ-CONFIG-277 / REQ-TOOLS-165 (Part AG): the runtime target behind each public name, which the Tools
 * inventory renders as the entry's description. It lives here rather than beside the declarations in
 * `@rotaris/agent-tools` because the settings surface may reach `contracts` and nothing below it, and an
 * inventory the surface cannot read is no inventory.
 *
 * `null` means this build registers no executor for the name — the registry then removes it from what an
 * agent is offered (REQ-TOOLS-004), so the inventory says so rather than naming a symbol that does not exist.
 * `git_commit` is the only one: it is a declared public name with no implementation anywhere in the tree, and
 * the Tools inventory is the first surface in the product that makes that visible.
 */
export const TOOL_IMPLEMENTATIONS: Readonly<Record<PublicToolName, string | null>> = Object.freeze({
  ask_questions: 'askQuestionsTool',
  delegate: 'delegateTool',
  background_output: 'backgroundOutputTool',
  wait_for_tasks: 'waitForTasksTool',
  haet: 'haetEditTool',
  haet_edit: 'haetEditTool',
  haet_read: 'haetReadTool',
  read_file: 'readFileTool',
  write_file: 'writeFileTool',
  terminal: 'terminalTool',
  git_commit: null,
  git_read: 'gitReadTool',
  todo: 'todoTool',
  fetch: 'fetchTool',
  grep: 'grepTool',
  glob: 'globTool',
  artifact_read: 'artifactReadTool',
  artifact_list: 'artifactListTool',
  artifact_write: 'artifactWriteTool',
});

/** REQ-TOOLS-012. */
export const DECISIONS = ['allow', 'ask', 'deny'] as const;
export type Decision = (typeof DECISIONS)[number];

/** REQ-TOOLS-028: exactly twelve; persisted and streamed, must round-trip. */
export const DECISION_SOURCES = [
  'rule', 'session-rule', 'preset', 'builtin', 'fail-closed', 'user-once', 'user-session', 'user-deny',
  'headless-policy', 'timeout', 'cancelled', 'presenter-error',
] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

/** REQ-TOOLS-062: the sources that may claim a request id. */
export const APPROVAL_RESOLUTION_SOURCES: ReadonlySet<DecisionSource> = new Set<DecisionSource>([
  'user-once', 'user-session', 'user-deny', 'headless-policy', 'timeout', 'cancelled', 'presenter-error', 'fail-closed',
]);

/** REQ-MONITOR-105 / REQ-CHAT-046: closed to four; `running` never appears on `tool.finish` (REQ-EVENTS-057). */
export const TOOL_STATUSES = ['running', 'ok', 'failed', 'blocked'] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

/** REQ-TOOLS-041/047: exactly three presets, totally ordered by restrictiveness. */
export const PERMISSION_PRESETS = ['restricted', 'ask', 'autonomous'] as const;
export type PermissionPreset = (typeof PERMISSION_PRESETS)[number];
export const PRESET_RANK: Readonly<Record<PermissionPreset, number>> = Object.freeze({ restricted: 0, ask: 1, autonomous: 2 });
/** REQ-TOOLS-046: the shipped default. */
export const DEFAULT_PRESET: PermissionPreset = 'ask';

/** REQ-TOOLS-046: empty → default, unknown → strictest with `warned: true`. Never raises. */
export function resolvePreset(name: string | undefined | null): { preset: PermissionPreset; warned: boolean } {
  const n = (name ?? '').trim();
  if (n === '') return { preset: DEFAULT_PRESET, warned: false };
  if ((PERMISSION_PRESETS as readonly string[]).includes(n)) return { preset: n as PermissionPreset, warned: false };
  return { preset: 'restricted', warned: true };
}

/** REQ-TOOLS-047: rank lookup resolves like preset resolution, silently. */
export function presetRank(name: string | undefined | null): number {
  return PRESET_RANK[resolvePreset(name).preset];
}

/** REQ-TOOLS-051: exactly three options. */
export const APPROVAL_OPTIONS = ['once', 'session', 'deny'] as const;
export type ApprovalOption = (typeof APPROVAL_OPTIONS)[number];

/** REQ-TOOLS-065. */
export const HEADLESS_POLICIES = ['deny', 'abort'] as const;
export type HeadlessPolicy = (typeof HEADLESS_POLICIES)[number];

/** REQ-TOOLS-056: the nine fields, JSON-serialisable in full; `sequence` orders presentation across windows (ADR-0019). */
export const ApprovalPayloadSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  agent_id: z.string(),
  persona: z.string(),
  tool_name: z.string(),
  /** Secret-redacted command facet; empty when the request has none. */
  command: z.string(),
  /** REQ-TOOLS-057: empty when the request carries a command. */
  argument_summary: z.string(),
  rule_id: z.string(),
  reason: z.string(),
  sequence: z.number().int().nonnegative(),
});
export type ApprovalPayload = z.infer<typeof ApprovalPayloadSchema>;

export const ApprovalAnswerSchema = z.object({
  request_id: z.string().min(1),
  option: z.enum(APPROVAL_OPTIONS),
});
export type ApprovalAnswer = z.infer<typeof ApprovalAnswerSchema>;

/**
 * REQ-TOOLS-157 / REQ-CHAT-092: the structured-questions vocabulary — 1 to 10 ordered steps, at most 8 options a
 * step, `allow_freeform` defaulting to true. The field spellings are the ACTION's own (snake_case), and the same
 * value is what the session record publishes as a pending prompt, exactly as `ApprovalPayloadSchema` is: one shape
 * from the model's arguments to the trailer row, so nothing translates it on the way and nothing can translate it
 * wrongly. The **bounds are not enforced by this schema** — REQ-TOOLS-157 requires every violation reported as a
 * validation error naming it, and a zod `.max(10)` refusal names one and stops. `validateQuestionSteps` in
 * `@rotaris/agent-tools` is the single enforcement point and it reports all of them.
 */
export const QUESTION_STEPS_MAX = 10;
export const QUESTION_OPTIONS_MAX = 8;
export const QuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string().default(''),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export const QuestionStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  options: z.array(QuestionOptionSchema).default([]),
  allow_freeform: z.boolean().default(true),
});
export type QuestionStep = z.infer<typeof QuestionStepSchema>;

/** REQ-CHAT-096: routing targets the exact (conversation, prompt id) pair, so the prompt carries both. */
export const QuestionPromptSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  /** REQ-CHAT-094: at most one prompt pending per conversation; this is that conversation. */
  conversation_id: z.string().min(1),
  agent_id: z.string(),
  persona: z.string(),
  steps: z.array(QuestionStepSchema),
});
export type QuestionPrompt = z.infer<typeof QuestionPromptSchema>;

/** REQ-CHAT-095: `{step_id: {selected_option, freeform_text}}`; either may be null and both null is "(no answer)". */
export const QuestionAnswerSchema = z.object({
  selected_option: z.string().nullable(),
  freeform_text: z.string().nullable(),
});
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;
export const QuestionAnswersSchema = z.record(z.string(), QuestionAnswerSchema);
export type QuestionAnswers = z.infer<typeof QuestionAnswersSchema>;

/**
 * REQ-CHAT-168: a count is written for the count it carries — zero, one and many all read correctly. Used for
 * REQ-CHAT-051's "N step(s) — <first title>" trailer and REQ-CHAT-095's "Received answers for N step(s).",
 * so the two can never disagree about the grammar.
 */
export function stepsPhrase(n: number): string {
  return `${n} ${n === 1 ? 'step' : 'steps'}`;
}

/** REQ-TOOLS-013: the exact refusal text. */
export function denialText(ruleId: string, reason: string, toolName: string): string {
  return `Permission denied by rule '${ruleId}'. ${reason} The '${toolName}' call was not executed. Choose a different approach or ask the user to adjust the permission policy.`;
}
