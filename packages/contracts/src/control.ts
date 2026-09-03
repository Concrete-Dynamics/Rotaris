import { z } from 'zod';

/**
 * The control channel (ADR-0010 #1): request/response against a run in
 * another process. Arguments are text, numbers, booleans and simple
 * collections of those (REQ-MONITOR-013). The result is a boolean plus an
 * optional string populated for exactly two operations (REQ-MONITOR-005);
 * a control answers `false` rather than raising (REQ-MONITOR-007).
 *
 * The 21 operations are REQ-MONITOR-004's. The skeleton fixes the names and
 * the envelope; each operation's arguments land with the engine.
 */
export const CONTROL_OPS = [
  'start',
  'resume',
  'pause',
  'continue',
  'cancel',
  'detach',
  'submitSteeringPrompt',
  'createQueuedPrompt',
  'removeQueuedPrompt',
  'reorderQueuedPrompt',
  'answerApproval',
  'answerQuestion',
  'pauseAgent',
  'cancelAgent',
  'setPermissionMode',
  'setDelegationStrategy',
  'setDelegationDepth',
  'requestCheckpoint',
  'restoreCheckpoint',
  'releaseSession',
  'recheckSandbox',
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

export const ControlResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.string().optional() }),
  z.object({ ok: z.literal(false) }),
]);
export type ControlResult = z.infer<typeof ControlResultSchema>;
