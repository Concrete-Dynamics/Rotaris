import { z } from 'zod';

/**
 * The control channel (ADR-0010 #1): request/response against a run in
 * another process. Arguments are text, numbers, booleans and simple
 * collections of those (REQ-MONITOR-013). The result is a boolean plus an
 * optional string populated for exactly two operations (REQ-MONITOR-005);
 * a control answers `false` rather than raising (REQ-MONITOR-007).
 *
 * The operations are REQ-MONITOR-004's enumeration, one name each, in its
 * order. The skeleton fixed a different list of twenty-one names (the
 * runtime's own vocabulary — `start`, `resume`, `detach`, `releaseSession`,
 * `requestCheckpoint`, `setDelegationStrategy` …), found against the
 * requirement on the control channel's second execution (2026-09-05,
 * ADR-0010's note): a session command is not a control on a live run, and a
 * live-run operation the requirement names had no name here.
 */
export const CONTROL_OPS = [
  'answerApproval',
  'answerQuestion',
  'cancelQuestions',
  'submitSteeringPrompt',
  'createQueuedPrompt',
  'editQueuedPrompt',
  'removeQueuedPrompt',
  'editTodo',
  'setModel',
  'setReasoning',
  'setPermissionMode',
  'forceCompression',
  'clearTranscript',
  'cancelAgent',
  'skipCheck',
  'pause',
  'cancel',
  'announceShutdown',
  'terminalInput',
  'terminalResize',
  'terminalInterrupt',
  'terminalKill',
] as const;
export type ControlOp = (typeof CONTROL_OPS)[number];

/** Populated string value: exactly these two (REQ-MONITOR-005). */
export const CONTROL_OPS_WITH_VALUE: ReadonlySet<ControlOp> = new Set<ControlOp>(['createQueuedPrompt', 'submitSteeringPrompt']);

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const simple = z.union([scalar, z.array(scalar), z.record(z.string(), scalar)]);

export const ControlRequestSchema = z.object({
  op: z.enum(CONTROL_OPS),
  sessionId: z.string().min(1),
  args: z.record(z.string(), simple).default({}),
});
export type ControlRequest = z.infer<typeof ControlRequestSchema>;

// Part AO
/**
 * Part AO — the result shapes of the two arms this part built (`forceCompression`, `clearTranscript`), beside the
 * boolean. REQ-MONITOR-005 fixes the STRING VALUE: populated for exactly the two prompt-creating operations and
 * never on a `false` outcome — and both arms leave it absent. What they add are two separate, optional fields,
 * because the sentences REQ-CHAT-079/080/084 and REQ-MONITOR-091/094 put in front of the user name facts only the
 * run host holds: how many agents settled, which failed and why (`compression`), and which of the two failure
 * channels a refusal belongs to (`refusal` — a busy transcript is a toast, a failed clear a persistent notice).
 * The renderer-facing `control()` helper that pre-dates these fields passes `ok` and `value` only; carrying
 * `refusal.message` through it is raised in Part AO's handoff as a ruling request rather than done in a file
 * this part does not own.
 */
export const CONTROL_REFUSAL_CODES = ['no_run', 'no_active_conversations', 'transcript_busy', 'clear_failed'] as const;
export type ControlRefusalCode = (typeof CONTROL_REFUSAL_CODES)[number];
export const ControlRefusalSchema = z.object({ code: z.enum(CONTROL_REFUSAL_CODES), message: z.string() });
export type ControlRefusal = z.infer<typeof ControlRefusalSchema>;
/** REQ-CHAT-080 / REQ-MONITOR-094: one settled concurrent pass — how many compressed, how many had nothing between the original request and the preserved turns, and every failure with its agent and reason. */
export const CompressionReportSchema = z.object({
  compressed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  failed: z.array(z.object({ agent: z.string(), reason: z.string() })),
});
export type CompressionReport = z.infer<typeof CompressionReportSchema>;

export const ControlResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.string().optional(), compression: CompressionReportSchema.optional() }),
  z.object({ ok: z.literal(false), refusal: ControlRefusalSchema.optional() }),
]);
export type ControlResult = z.infer<typeof ControlResultSchema>;

/** REQ-SESSION-110 / REQ-ORCH-086: the three resolutions of a pause. */
export const PAUSE_RESOLUTIONS = ['continue', 'double', 'cancel'] as const;
export type PauseResolution = (typeof PAUSE_RESOLUTIONS)[number];

/** REQ-ORCH-086 / REQ-SESSION-109: what the pause dialog shows — the count, the limit in force, the two token figures. */
export const PausePayloadSchema = z.object({
  sessionId: z.string().min(1),
  count: z.number().int().nonnegative(),
  limit: z.number().int().nullable(),
  tokens: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }),
});
export type PausePayload = z.infer<typeof PausePayloadSchema>;

/** REQ-CHAT-038: a queued prompt's status series. */
export const QUEUED_PROMPT_STATUSES = ['QUEUED', 'TRIGGERED', 'COMPLETED'] as const;
export type QueuedPromptStatus = (typeof QUEUED_PROMPT_STATUSES)[number];
