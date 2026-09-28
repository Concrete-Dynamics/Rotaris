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
/**
 * `run_coming_to_rest`: PD-ORCH-005 clause 2 — a pause or a stop was accepted, and no model call follows it.
 * `store_failed` and `session_locked`: PD-ORCH-005 clause 16's cancel of a paused child while its session rests is
 * refused because the workspace store failed — it requires recovery (OQ-76), it could not be read or written to take
 * the session's lock, or the chosen child's move could not be written — or because another live process holds the
 * session's lock (OQ-74). Refusals that say nothing of the agent, so the renderer states them rather than "not
 * cancellable".
 */
export const CONTROL_REFUSAL_CODES = ['no_run', 'no_active_conversations', 'transcript_busy', 'clear_failed', 'run_coming_to_rest', 'store_failed', 'session_locked'] as const;
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

/**
 * REQ-ORCH-153: the three answers offered at the plan gate, exactly — approve releases execution, revise starts
 * another plan cycle, cancel stops the run with `user_cancelled`. They are session COMMANDS and not control
 * operations: `CONTROL_OPS` above is REQ-MONITOR-004's closed enumeration over a LIVE run, and a run held at the
 * gate is parked with no process executing it — the answer must reach it whether or not the process that hosted
 * the hold outlived it (REQ-ORCH-153's closing sentence). Recorded as the reading taken, in ADR-0062.
 */
export const PLAN_DECISIONS = ['approve', 'revise', 'cancel'] as const;
export type PlanDecision = (typeof PLAN_DECISIONS)[number];

/**
 * REQ-ORCH-153/154: what the gate surface is given — the plan VERBATIM as the producing role wrote it, the user's
 * edit while one stands (null until they edit), the classified intent and the todo state the plan implies. `plan`
 * is never rewritten: the edit is a separate field so that "editing alone never approves it" is structural, and so
 * that a window closed mid-edit loses neither the edit nor the text the role produced.
 */
export const PlanGateSchema = z.object({
  cycle: z.number().int().positive(),
  openedAt: z.string(),
  plan: z.string(),
  edited: z.string().nullable(),
  intent: z.string(),
  todo: z.string(),
  /** The changes the user stated when they chose revise into this cycle; '' on the first. */
  changes: z.string(),
});
export type PlanGatePayload = z.infer<typeof PlanGateSchema>;

/**
 * PD-ORCH-005 clause 6: what the Continue action resumes — the iteration a rest or a crash left open, and how many of its
 * agents resume with it: its root and every agent of it not in a terminal state. It is read from the store, as the plan
 * gate is, because a session at rest has no process behind it; a live run's session carries it too, and no surface
 * states it there.
 */
export const ResumableSchema = z.object({
  iteration: z.number().int().positive(),
  agents: z.number().int().positive(),
});
export type ResumablePayload = z.infer<typeof ResumableSchema>;

/** REQ-CHAT-038: a queued prompt's status series. */
export const QUEUED_PROMPT_STATUSES = ['QUEUED', 'TRIGGERED', 'COMPLETED'] as const;
export type QueuedPromptStatus = (typeof QUEUED_PROMPT_STATUSES)[number];
