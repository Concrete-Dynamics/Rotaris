import { z } from 'zod';
import { FREE_TEXT_MAX, NAME_MAX } from './limits.js';
import { InboundRunHandleSchema, InboundRunStatusSchema } from './inbound.js';

/**
 * THE LISTENER'S WIRE — what crosses between main and the inbound listener's own `utilityProcess` (REQ-MCP-127,
 * ADR-0002's amendment). The listener is a process of its own, forked from the one shipped binary as the run host is;
 * this module is the one shape set that boundary carries, and it is deliberately small.
 *
 * Two directions, one envelope each, so a message main cannot read is dropped rather than guessed at:
 *
 * - **main → listener** (`InboundListenerRequest`): `enable` (bind loopback ephemeral, with the token main minted for
 *   this exposure), `disable` (unbind and invalidate), `state` (read the current binding). `enable` answers the port the
 *   operating system chose, which is the one fact main could not compute itself.
 * - **listener → main** (`InboundListenerAsk`): `startRun` (the prompt a `rotaris_start_run` call carried) and
 *   `runStatus` (the handle a `rotaris_run_status` call carried). Main answers both, because main is where the trusted
 *   desktop state and the single-run slot live — the listener holds no authority of its own (REQ-MCP-124).
 *
 * The token travels main → listener on `enable` only. It is never a field of a listener → main message, never logged
 * on either side, and never written into a session record (REQ-MCP-121).
 */

/** The listener process's own kind name, as a message names it (distinct from `ProcessKindSchema`'s two). */
export const INBOUND_LISTENER_KIND = 'inbound-listener' as const;

/** main → listener. */
export const InboundListenerRequestSchema = z.discriminatedUnion('kind', [
  /**
   * REQ-MCP-119/121: bind the surface. `token` is the per-exposure bearer main minted; it is required on every request
   * the surface serves and is invalidated by the `disable` that ends this exposure. The listener answers the port the
   * OS chose (`inbound.enabled`), which main shows beside the token.
   */
  z.object({ kind: z.literal('inbound.enable'), token: z.string().min(1).max(NAME_MAX) }),
  /** REQ-MCP-120/121: end the exposure — unbind and invalidate the token with it. */
  z.object({ kind: z.literal('inbound.disable') }),
  /** REQ-MCP-120: the current binding, for a surface that mounts or re-reads while the surface is on or off. */
  z.object({ kind: z.literal('inbound.state') }),
]);
export type InboundListenerRequest = z.infer<typeof InboundListenerRequestSchema>;

/** listener → main. */
export const InboundListenerAskSchema = z.discriminatedUnion('kind', [
  /** REQ-MCP-123/124: a `rotaris_start_run` call, reduced to the prompt it carried. Main owns the workspace. */
  z.object({ kind: z.literal('inbound.startRun'), prompt: z.string().min(1).max(FREE_TEXT_MAX) }),
  /** REQ-MCP-123/130: a `rotaris_run_status` call, reduced to the handle it carried. */
  z.object({ kind: z.literal('inbound.runStatus'), run: InboundRunHandleSchema }),
]);
export type InboundListenerAsk = z.infer<typeof InboundListenerAskSchema>;

/** What an `enable` answers: the port the OS chose (REQ-MCP-119), never a fixed one. */
export const InboundListenerStateSchema = z.object({
  listening: z.boolean(),
  /** The ephemeral port the OS chose; null while the surface is off. */
  port: z.number().int().positive().nullable(),
});
export type InboundListenerState = z.infer<typeof InboundListenerStateSchema>;

/** The listener's answers to main's three requests. */
export const InboundListenerReplySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inbound.state'), state: InboundListenerStateSchema }),
  /** REQ-MCP-127 (R-091): the listener's ready answer, at its fork, as the run host's `hello` is. */
  z.object({ kind: z.literal('inbound.hello'), pid: z.number().int() }),
  /** A refusal the listener could not act on — the bind failed, or no exposure is on to disable. */
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional() }),
  z.object({ kind: z.literal('ack') }),
]);
export type InboundListenerReply = z.infer<typeof InboundListenerReplySchema>;

/** The answer to an `inbound.startRun` ask: the handle the run is named by, or a refusal with its stated reason. */
export const InboundStartRunAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inbound.runStarted'), run: InboundRunHandleSchema, sessionId: z.string().max(NAME_MAX) }),
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type InboundStartRunAnswer = z.infer<typeof InboundStartRunAnswerSchema>;

/** The answer to an `inbound.runStatus` ask. */
export const InboundRunStatusAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inbound.runStatus'), status: InboundRunStatusSchema }),
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type InboundRunStatusAnswer = z.infer<typeof InboundRunStatusAnswerSchema>;

/** The listener's own unsolicited events: its ready answer at the fork, and its log lines (REQ-MCP-127, PD-MONITOR-002). */
export const InboundListenerEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), process: z.literal(INBOUND_LISTENER_KIND), pid: z.number().int() }),
  z.object({ kind: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string() }),
]);
export type InboundListenerEvent = z.infer<typeof InboundListenerEventSchema>;
export const InboundListenerEventEnvelopeSchema = z.object({ v: z.number().int(), event: InboundListenerEventSchema });
export type InboundListenerEventEnvelope = z.infer<typeof InboundListenerEventEnvelopeSchema>;

/**
 * The listener's one handler: an ask in, the answer to that ask out, correlated by the ask's own kind (ADR-0002's
 * discipline, reused for this boundary). A single signature over the union: the answer's own `kind` is what a caller
 * narrows on, and every refusal carries main's words.
 */
export type InboundAskHandler = (ask: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>;

/** main → listener envelopes carry a correlation id, so a reply is matched and every request is bounded (ADR-0002 c.11). */
export const InboundListenerEnvelopeSchema = z.object({ id: z.number().int().nonnegative(), request: InboundListenerRequestSchema });
export type InboundListenerEnvelope = z.infer<typeof InboundListenerEnvelopeSchema>;
export const InboundListenerReplyEnvelopeSchema = z.object({ id: z.number().int().nonnegative(), reply: InboundListenerReplySchema });
export type InboundListenerReplyEnvelope = z.infer<typeof InboundListenerReplyEnvelopeSchema>;
export const InboundAskEnvelopeSchema = z.object({ ask: z.number().int().nonnegative(), request: InboundListenerAskSchema });
export type InboundAskEnvelope = z.infer<typeof InboundAskEnvelopeSchema>;
export const InboundAnswerEnvelopeSchema = z.object({ ask: z.number().int().nonnegative(), answer: z.union([InboundStartRunAnswerSchema, InboundRunStatusAnswerSchema]) });
export type InboundAnswerEnvelope = z.infer<typeof InboundAnswerEnvelopeSchema>;
