import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './version.js';

/**
 * The five named, typed IPC channels of ADR-0044.
 *
 *  1. transcript:increment — session id, SEQUENCE, earliest-changed index, rows, diffs, personas
 *  2. session:snapshot     — session id, SEQUENCE, the whole-session update
 *  3. terminal:frames      — stream id, per-stream sequence (REQ-SHELL-104), kind, payload
 *  4. notice:current       — the single current notice or null, plus acknowledgements
 *  5. command              — request/response; see commands.ts
 *
 * Channels 1 and 2 share ONE per-session counter (REQ-MONITOR-214), stamped in
 * the run host by the projection owner at publication. Main relays it
 * unchanged; nothing downstream may renumber, reorder, coalesce or drop.
 *
 * Structured clone, not JSON strings: rows are plain objects, no class
 * instances, no functions. Nothing here may carry a credential value or any
 * session content bound for a diagnostics file (ADR-0030, REQ-STARTUP-134);
 * `contracts.test.ts` asserts that over every schema.
 */

export const CHANNEL = {
  transcriptIncrement: 'transcript:increment',
  sessionSnapshot: 'session:snapshot',
  terminalFrames: 'terminal:frames',
  noticeCurrent: 'notice:current',
  command: 'command',
} as const;
export type ChannelName = (typeof CHANNEL)[keyof typeof CHANNEL];

const schemaVersion = z.literal(CONTRACT_SCHEMA_VERSION);
const sessionId = z.string().min(1);
const seq = z.number().int().positive();

/** A transcript row as it travels. The full row vocabulary is domain 03's; this fixes the envelope. */
export const TranscriptRowSchema = z.object({
  index: z.number().int().nonnegative(),
  /** `user` for the row REQ-CHAT-011 appends on submission; the rest of the vocabulary lands with the run loop. */
  kind: z.string().min(1),
  settled: z.boolean(),
  body: z.string(),
  /** ISO-8601 UTC instant the row was recorded (REQ-CHAT-011 formats it HH:MM:SS). */
  at: z.string(),
  /** REQ-SESSION-121: local wall-clock HH:MM:SS stamped at append. */
  ts: z.string(),
  /** REQ-SESSION-121: agent, thinking and tool rows name their agent and persona. */
  persona: z.string().optional(),
  name: z.string().optional(),
});
export type TranscriptRow = z.infer<typeof TranscriptRowSchema>;

export const TranscriptIncrementSchema = z.object({
  v: schemaVersion,
  sessionId,
  seq,
  /** The lowest row index whose content may still change (REQ-MONITOR-214). 0 only for a genuine reset. */
  earliestChanged: z.number().int().nonnegative(),
  rows: z.array(TranscriptRowSchema),
  diffs: z.array(z.object({ path: z.string(), patch: z.string() })),
  personas: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type TranscriptIncrement = z.infer<typeof TranscriptIncrementSchema>;

/**
 * The session record as a surface may display it. The whole-session update's payload is
 * DERIVED from this type (ADR-0010, ADR-0043 consequence 4) so that adding a field to the
 * record is adding it to the payload by definition (REQ-MONITOR-217).
 */
export const SessionRecordSchema = z.object({
  id: sessionId,
  executionStatus: z.string(),
  workspaceRoot: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** REQ-EVENTS-087: whether the history has been brought into existence. */
  historyOpen: z.boolean(),
  /** REQ-EVENTS-092: the four facts; absence reads as not truncated with zero drops. */
  truncation: z.object({
    truncated: z.boolean(),
    droppedCount: z.number().int().nonnegative(),
    cap: z.number().int().nullable(),
    lastTrimAt: z.string().nullable(),
  }),
  agents: z.array(z.object({ id: z.string(), state: z.string(), depth: z.number().int() })),
  pendingApprovals: z.array(z.object({ requestId: z.string(), tool: z.string() })),
  pendingQuestions: z.array(z.object({ requestId: z.string(), prompt: z.string() })),
  tokenUsage: z.object({ input: z.number().int(), output: z.number().int() }),
  /** Decimal string (ADR-0031). */
  cost: z.string(),
  /** REQ-SESSION-095 / REQ-ORCH-147: what the run recorded; null before any run ended. */
  stopReason: z.string().nullable(),
  iterationsCompleted: z.number().int().nonnegative(),
  /** REQ-SESSION-074: the end-of-run summarisation, presented exactly once (REQ-SESSION-186). */
  summary: z.object({ status: z.string(), severity: z.string(), message: z.string() }).nullable(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

/** The whole-session update: every displayable field, bounded collections in full (REQ-MONITOR-216/217). */
export const SessionSnapshotSchema = z.object({
  v: schemaVersion,
  sessionId,
  seq,
  session: SessionRecordSchema,
});
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

export const TerminalFrameSchema = z.object({
  v: schemaVersion,
  streamId: z.string().min(1),
  /** Per-stream sequence, REQ-SHELL-104 — a DIFFERENT counter from the session's. */
  streamSeq: z.number().int().positive(),
  kind: z.enum(['delta', 'screen', 'meta']),
  payload: z.string(),
});
export type TerminalFrame = z.infer<typeof TerminalFrameSchema>;

export const NoticeSchema = z.object({
  id: z.number().int().positive(),
  severity: z.enum(['info', 'warning', 'error']),
  headline: z.string(),
  detail: z.string().optional(),
  recovery: z.array(z.object({ label: z.string(), command: z.string() })).optional(),
});
export const NoticeCurrentSchema = z.object({
  v: schemaVersion,
  current: NoticeSchema.nullable(),
});
export type NoticeCurrent = z.infer<typeof NoticeCurrentSchema>;

export const CHANNEL_SCHEMAS = {
  [CHANNEL.transcriptIncrement]: TranscriptIncrementSchema,
  [CHANNEL.sessionSnapshot]: SessionSnapshotSchema,
  [CHANNEL.terminalFrames]: TerminalFrameSchema,
  [CHANNEL.noticeCurrent]: NoticeCurrentSchema,
} as const;

/** The two channels that share one per-session counter. Order across BOTH must be preserved by the relay. */
export const SEQUENCED_CHANNELS = [CHANNEL.transcriptIncrement, CHANNEL.sessionSnapshot] as const;
export type SequencedChannel = (typeof SEQUENCED_CHANNELS)[number];
