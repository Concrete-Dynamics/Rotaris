import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './version.js';

/**
 * The message protocols between main and its two utility processes
 * (ADR-0002). Every message carries a correlation id so a reply can be
 * matched and every request can be bounded by the caller (ADR-0002
 * consequence 11: every acknowledgement is bounded, expiry refuses).
 *
 * Main → run host, main → workspace service: `Request`. Reverse: `Reply`
 * or an unsolicited `Event`.
 */
const v = z.literal(CONTRACT_SCHEMA_VERSION);
const id = z.number().int().nonnegative();

export const ProcessKindSchema = z.enum(['run-host', 'workspace-service']);
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
  z.object({ kind: z.literal('ack') }),
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type ProcessReply = z.infer<typeof ProcessReplySchema>;

export const ProcessReplyEnvelopeSchema = z.object({ v, id, reply: ProcessReplySchema });
export type ProcessReplyEnvelope = z.infer<typeof ProcessReplyEnvelopeSchema>;

/** Unsolicited, process → main. */
export const ProcessEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), process: ProcessKindSchema, pid: z.number().int() }),
  z.object({ kind: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string() }),
]);
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;
export const ProcessEventEnvelopeSchema = z.object({ v, event: ProcessEventSchema });
export type ProcessEventEnvelope = z.infer<typeof ProcessEventEnvelopeSchema>;

export const ProcessMessageSchema = z.union([ProcessReplyEnvelopeSchema, ProcessEventEnvelopeSchema]);
export type ProcessMessage = z.infer<typeof ProcessMessageSchema>;
