import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { SessionSnapshotSchema, TranscriptIncrementSchema, TranscriptRowSchema } from './channels.js';
import { ControlRequestSchema, ControlResultSchema } from './control.js';

/**
 * The message protocols between main and its two utility processes
 * (ADR-0002). Every message carries a correlation id so a reply can be
 * matched and every request can be bounded by the caller (ADR-0002
 * consequence 11: every acknowledgement is bounded, expiry refuses).
 *
 * Main → run host, main → workspace service: `Request`. Reverse: `Reply`
 * or an unsolicited `Event`. A publication on either update channel is an
 * unsolicited event from the run host, which main RELAYS unchanged
 * (ADR-0044): the sequence number is already on it.
 */
const v = z.literal(CONTRACT_SCHEMA_VERSION);
const id = z.number().int().nonnegative();

export const ProcessKindSchema = z.enum(['run-host', 'workspace-service']);

/** REQ-SESSION-095 / REQ-EVENTS-026: the one terminal result, as main presents it. */
export const RunResultSchema = z.object({
  status: z.string(),
  session_id: z.string(),
  stop_reason: z.string(),
  summary: z.string(),
  iterations_completed: z.number().int().nonnegative(),
  tokens: z.object({ input: z.number().int(), output: z.number().int(), total: z.number().int() }),
  cost: z.object({ total: z.string() }),
  error: z.string().nullable(),
  execution_status: z.string(),
  severity: z.enum(['information', 'warning', 'error']),
});
export type RunResultPayload = z.infer<typeof RunResultSchema>;
export type ProcessKind = z.infer<typeof ProcessKindSchema>;

export const RunHostRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello') }),
  z.object({ kind: z.literal('ping') }),
  /** ADR-0058 / W-18: the run host is HANDED a resolved store path; it never reads the identifier file. */
  z.object({ kind: z.literal('workspace.opened'), workspaceId: z.string(), storeFile: z.string(), workspaceRoot: z.string() }),
  z.object({ kind: z.literal('workspace.closing'), workspaceId: z.string() }),
  /** ADR-0058 step 1 / 3b: refuse new runs for this workspace; the refusal is a lease the run host expires itself. */
  z.object({ kind: z.literal('workspace.refuseRuns'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('workspace.renewLease'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('workspace.closeStore'), workspaceId: z.string() }),
  z.object({ kind: z.literal('workspace.release'), workspaceId: z.string() }),
  /** REQ-CHAT-011 / REQ-SESSION-089: create the session, take its lock, open its history, record row 0. */
  z.object({ kind: z.literal('session.start'), workspaceId: z.string(), prompt: z.string().min(1) }),
  z.object({ kind: z.literal('session.prompt'), sessionId: z.string(), prompt: z.string().min(1) }),
  /** A surface begins following: snapshot first, then the resident transcript (REQ-MONITOR-214, REQ-SESSION-161). */
  z.object({ kind: z.literal('session.attach'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.detach'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.reconcile'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.pageOlder'), sessionId: z.string(), beforeIndex: z.number().int() }),
  /** ADR-0010 channel 1: a control against a live run, answered `{ok, value?}` and never raised (REQ-MONITOR-005/007). */
  z.object({ kind: z.literal('session.control'), request: ControlRequestSchema }),
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
]);
export type RunHostRequest = z.infer<typeof RunHostRequestSchema>;

export const WorkspaceServiceRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello') }),
  z.object({ kind: z.literal('ping') }),
  /** Only the workspace service resolves an identifier (W-18): it opens the store read-write once, migrates, and answers with the resolved path. */
  z.object({ kind: z.literal('workspace.open'), workspaceRoot: z.string() }),
  z.object({ kind: z.literal('workspace.close'), workspaceRoot: z.string() }),
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
]);
export type WorkspaceServiceRequest = z.infer<typeof WorkspaceServiceRequestSchema>;

export const ProcessRequestEnvelopeSchema = z.object({
  v,
  id,
  request: z.union([RunHostRequestSchema, WorkspaceServiceRequestSchema]),
});
export type ProcessRequestEnvelope = z.infer<typeof ProcessRequestEnvelopeSchema>;

export const ProcessReplySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello'), process: ProcessKindSchema, pid: z.number().int() }),
  z.object({ kind: z.literal('pong') }),
  z.object({ kind: z.literal('workspace.opened'), workspaceId: z.string(), storeFile: z.string(), schemaVersion: z.number().int() }),
  z.object({ kind: z.literal('workspace.ack'), workspaceId: z.string() }),
  z.object({ kind: z.literal('session.started'), sessionId: z.string() }),
  /** REQ-CHAT-165: a span older than `beforeIndex`, oldest first; `oldest` says the first recorded row is in it. */
  z.object({ kind: z.literal('session.page'), sessionId: z.string(), rows: z.array(TranscriptRowSchema), oldest: z.boolean() }),
  z.object({ kind: z.literal('ack') }),
  z.object({ kind: z.literal('control.result'), result: ControlResultSchema }),
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type ProcessReply = z.infer<typeof ProcessReplySchema>;

export const ProcessReplyEnvelopeSchema = z.object({ v, id, reply: ProcessReplySchema });
export type ProcessReplyEnvelope = z.infer<typeof ProcessReplyEnvelopeSchema>;

/** Unsolicited, process → main. */
export const ProcessEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), process: ProcessKindSchema, pid: z.number().int() }),
  z.object({ kind: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string() }),
  /** A publication, already stamped by the projection owner. Main relays; it adds nothing (ADR-0043 #2). */
  z.object({ kind: z.literal('publish.increment'), payload: TranscriptIncrementSchema }),
  z.object({ kind: z.literal('publish.snapshot'), payload: SessionSnapshotSchema }),
  /** REQ-SESSION-186: the terminal result, presented once. Carried from the bus's in-process consumer (REQ-EVENTS-178). */
  z.object({ kind: z.literal('run.result'), sessionId: z.string(), result: RunResultSchema }),
]);
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;
export const ProcessEventEnvelopeSchema = z.object({ v, event: ProcessEventSchema });
export type ProcessEventEnvelope = z.infer<typeof ProcessEventEnvelopeSchema>;

export const ProcessMessageSchema = z.union([ProcessReplyEnvelopeSchema, ProcessEventEnvelopeSchema]);
export type ProcessMessage = z.infer<typeof ProcessMessageSchema>;
