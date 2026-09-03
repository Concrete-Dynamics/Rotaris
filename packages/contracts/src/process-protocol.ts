import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { SessionSnapshotSchema, TranscriptIncrementSchema, TranscriptRowSchema } from './channels.js';
import { ControlRequestSchema, ControlResultSchema } from './control.js';
import { ApprovalPayloadSchema } from './tools.js';

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
  z.object({ kind: z.literal('runs.active'), workspaceId: z.string() }),
  /** ADR-0019: the presenter is a capability main registers per window and revokes on close; the poll reply carries the windows it holds. */
  z.object({ kind: z.literal('presenter.register'), windowId: z.string().min(1) }),
  z.object({ kind: z.literal('presenter.revoke'), windowId: z.string().min(1) }),
  z.object({ kind: z.literal('presenter.pollReply'), seq: z.number().int().nonnegative(), windows: z.array(z.string()) }),
  /** REQ-TOOLS-063: main reports whether the dialog was put in front of a person; a failure denies with source presenter-error. */
  z.object({ kind: z.literal('approval.shown'), requestId: z.string().min(1), ok: z.boolean(), error: z.string().optional() }),
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
]);
export type RunHostRequest = z.infer<typeof RunHostRequestSchema>;

/** What a restore must convey before anything changes (REQ-SESSION-201), assessed read-only by the workspace service. */
export const RestoreAssessmentSchema = z.object({
  artifact: z.object({
    workspaceId: z.string(), takenAtUtc: z.string(), sessions: z.number().int(), rows: z.number().int(), locks: z.number().int(),
    storeUserVersion: z.number().int(), lastSeenWorkspacePath: z.string().nullable(),
  }),
  /** ADR-0058's three identifier cases, plus the unreadable one REQ-SESSION-197 reports and never repairs. */
  identifier: z.object({ case: z.enum(['same', 'absent', 'different', 'unreadable']), current: z.string().nullable() }),
  /** The store the restore would replace: what is there now, and the lock rows that gate it (D9 as one condition). */
  target: z.object({ exists: z.boolean(), sessions: z.number().int(), foreignLocks: z.array(z.string()), liveLocks: z.array(z.string()) }),
  /** A refusal decided before any confirmation is asked (ADR-0058 gates 1 and 2, REQ-SESSION-197). */
  refusal: z.object({ why: z.enum(['unreadable-artifact', 'corrupt', 'newer-schema', 'unreadable-identifier']), detail: z.string() }).nullable(),
});
export type RestoreAssessment = z.infer<typeof RestoreAssessmentSchema>;

/** What the user chose, having been told (ADR-0058 case (c), ESC-26; D9). */
export const RestoreDecisionsSchema = z.object({
  /** `workspace`: into this workspace's store (case same); `artifact-store`: into the artifact's own store, identifier untouched; `establish`: ESC-26 — write the artifact's identifier over this workspace's, on confirmation, or by exclusive create where none exists. */
  identifier: z.enum(['workspace', 'artifact-store', 'establish']),
  proceedWithForeignLocks: z.boolean(),
});
export type RestoreDecisions = z.infer<typeof RestoreDecisionsSchema>;

export const RestoreRefusalSchema = z.discriminatedUnion('why', [
  z.object({ why: z.literal('ack-timeout'), step: z.number().int(), boundMs: z.number() }),
  z.object({ why: z.literal('sessions-live'), step: z.number().int(), sessions: z.array(z.string()) }),
  z.object({ why: z.literal('foreign-locks'), sessions: z.array(z.string()), risk: z.string() }),
]);
export const RestoreReportSchema = z.object({
  ok: z.boolean(),
  abandoned: z.boolean(),
  refusal: RestoreRefusalSchema.optional(),
  error: z.string().optional(),
  displaced: z.string().optional(),
  leftovers: z.array(z.string()),
  steps: z.array(z.string()),
  restoredInto: z.string(),
  identifierEstablished: z.boolean(),
});
export type RestoreReportPayload = z.infer<typeof RestoreReportSchema>;

export const WorkspaceServiceRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello') }),
  z.object({ kind: z.literal('ping') }),
  /** Only the workspace service resolves an identifier (W-18): it opens the store read-write once, migrates, and answers with the resolved path. */
  z.object({ kind: z.literal('workspace.open'), workspaceRoot: z.string() }),
  z.object({ kind: z.literal('workspace.close'), workspaceRoot: z.string() }),
  /** REQ-SESSION-201: the whole-store backup, taken here (ADR-0002); main supplied the destination through the save dialog and nothing else. */
  z.object({ kind: z.literal('workspace.backup'), workspaceRoot: z.string(), destination: z.string() }),
  /** Two phases, so every confirmation is asked before any mutation (REQ-SESSION-201 "before anything is changed"). */
  z.object({ kind: z.literal('workspace.restore.assess'), workspaceRoot: z.string(), artifact: z.string() }),
  z.object({ kind: z.literal('workspace.restore.perform'), workspaceRoot: z.string(), artifact: z.string(), decisions: RestoreDecisionsSchema }),
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
]);
export type WorkspaceServiceRequest = z.infer<typeof WorkspaceServiceRequestSchema>;

/**
 * Child → main: the workspace service's narrow requests back to main (ADR-0002 consequence 7), which
 * main forwards to the run host — the restore's steps 1, 3, 4a and 10 (ADR-0058). Correlated by `ask`.
 */
export const ServiceAskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runHost.refuseRuns'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('runHost.renewLease'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('runHost.closeStore'), workspaceId: z.string() }),
  z.object({ kind: z.literal('runHost.release'), workspaceId: z.string() }),
  z.object({ kind: z.literal('runHost.reopen'), workspaceId: z.string(), storeFile: z.string() }),
]);
export type ServiceAsk = z.infer<typeof ServiceAskSchema>;
export const ServiceAskEnvelopeSchema = z.object({ v, ask: id, request: ServiceAskSchema });
export type ServiceAskEnvelope = z.infer<typeof ServiceAskEnvelopeSchema>;

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
  /** ADR-0013's predicate for a workspace: how many runs this instance is executing there. */
  z.object({ kind: z.literal('runs.count'), workspaceId: z.string(), count: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('workspace.backedUp'), destination: z.string(), bytes: z.number().int(), sessions: z.number().int(), takenAtUtc: z.string() }),
  z.object({ kind: z.literal('workspace.restore.assessment'), assessment: RestoreAssessmentSchema }),
  z.object({ kind: z.literal('workspace.restored'), report: RestoreReportSchema }),
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
  /** ADR-0019: the gate posts a present-request; main owns the per-window dialog queue and nothing else. */
  z.object({ kind: z.literal('approval.present'), payload: ApprovalPayloadSchema }),
  /** A request answered or cancelled elsewhere closes its open dialog without asking again (REQ-TOOLS-063). */
  z.object({ kind: z.literal('approval.close'), requestId: z.string() }),
  /** ADR-0019's liveness poll, on the channel that carries registration. */
  z.object({ kind: z.literal('presenter.poll'), seq: z.number().int().nonnegative() }),
  /** ADR-0015 / REQ-HOOKS-054/086: the run's notices for the host's channel (ADR-0049 owns the one current notice in main). */
  z.object({ kind: z.literal('notice.publish'), severity: z.enum(['info', 'warning', 'error']), headline: z.string(), detail: z.string(), action: z.string().optional(), key: z.string().optional() }),
]);
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;
export const ProcessEventEnvelopeSchema = z.object({ v, event: ProcessEventSchema });
export type ProcessEventEnvelope = z.infer<typeof ProcessEventEnvelopeSchema>;

/** Main → child, answering a ServiceAsk. */
export const ServiceAnswerEnvelopeSchema = z.object({ v, ask: id, reply: ProcessReplySchema });
export type ServiceAnswerEnvelope = z.infer<typeof ServiceAnswerEnvelopeSchema>;

export const ProcessMessageSchema = z.union([ProcessReplyEnvelopeSchema, ProcessEventEnvelopeSchema, ServiceAskEnvelopeSchema]);
export type ProcessMessage = z.infer<typeof ProcessMessageSchema>;
