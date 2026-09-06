import { z } from 'zod';
import { IntentStatusSchema } from './intent.js';
import { ApprovalPayloadSchema } from './tools.js';
import { AgentRecordSchema } from './children.js';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { ConfigSnapshotSchema } from './config.js';
import { AcknowledgementKindSchema, NoticeSchema } from './notices.js';

/**
 * The five named, typed IPC channels of ADR-0044.
 *
 *  1. transcript:increment — session id, SEQUENCE, earliest-changed index, rows, diffs, personas
 *  2. session:snapshot     — session id, SEQUENCE, the whole-session update
 *  3. terminal:frames      — stream id, per-stream sequence (REQ-SHELL-104), kind, payload
 *  4. notice:current       — the single current notice or null (ADR-0049)
 *  5. command              — request/response; see commands.ts
 *  8. acknowledgement:publish — main → ONE window: a transient acknowledgement for that window's stack
 *     (Part V; REQ-NOTIFY-003's transient half of a main-originated or run-host-originated event, REQ-MCP-044)
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
  themeChanged: 'theme:changed',
  configChanged: 'config:changed',
  acknowledgementPublish: 'acknowledgement:publish',
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
  /** REQ-CHAT-046: the tool-row fields — status from REQ-MONITOR-105's four; input/output untruncated in the record. */
  toolName: z.string().optional(),
  toolStatus: z.string().optional(),
  callKey: z.string().optional(),
  durationMs: z.number().optional(),
  startedAt: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  /** REQ-CHAT-050: the structured diff, on edit-diff rows only. */
  diff: z.string().optional(),
  /** REQ-CHAT-060: reachable from a blocked row. */
  blockedReason: z.string().optional(),
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
  /** REQ-MONITOR-044/036: the delegated children as presented; the tree is derived from parentId. */
  agents: z.array(AgentRecordSchema),
  pendingQuestions: z.array(z.object({ requestId: z.string(), prompt: z.string() })),
  tokenUsage: z.object({ input: z.number().int(), output: z.number().int() }),
  /** Decimal string (ADR-0031). */
  cost: z.string(),
  /** REQ-SESSION-095 / REQ-ORCH-147: what the run recorded; null before any run ended. */
  stopReason: z.string().nullable(),
  /** REQ-MONITOR-164/171: when the current run started; null before any run. */
  runStartedAt: z.string().nullable(),
  iterationsCompleted: z.number().int().nonnegative(),
  /** REQ-SESSION-074: the end-of-run summarisation, presented exactly once (REQ-SESSION-186). */
  summary: z.object({ status: z.string(), severity: z.string(), message: z.string() }).nullable(),
  /** REQ-TOOLS-071 / REQ-TOOLS-184: the effective mode and the sandbox verdict, as the strip shows them. */
  permissionMode: z.string().nullable(),
  sandboxed: z.boolean(),
  /** REQ-TOOLS-060 / REQ-CHAT-051: the pending approvals, request id to payload, for the trailer rows. */
  pendingApprovals: z.array(ApprovalPayloadSchema),
  /** REQ-TOOLS-184: background terminal sessions in the running state. */
  backgroundSessions: z.number().int().nonnegative(),
  /** REQ-ORCH-014: the intent status — classifying, then the classified result; null before a run and for a session that never ran. */
  intent: IntentStatusSchema.nullable(),
  /** REQ-CHAT-041 / REQ-MONITOR-141: exactly the QUEUED prompts of this session, on the whole-session update. */
  queuedPrompts: z.array(z.object({ id: z.string(), content: z.string(), createdAt: z.string() })),
  /** REQ-ORCH-084/087: the message limit in force (null = disabled) and, while paused at it, the count reached. */
  messageLimit: z.number().int().nullable(),
  pausedAtCount: z.number().int().nullable(),
  /** REQ-MONITOR-166: the token history the run sampled — [at, cumulative total], oldest first, at most 120 (named without the word the secret test forbids). */
  usageHistory: z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
  /** REQ-MONITOR-166: the pre-rendered cost label with its qualifier, so no view invents one. */
  costLabel: z.object({ text: z.string(), qualifier: z.enum(['unknown', 'incomplete', 'configured']) }),
  /** REQ-MONITOR-167: the session-wide tool-call total, the agents it spans, and per-tool counts most-called first. */
  toolCalls: z.object({ total: z.number().int().nonnegative(), agents: z.number().int().nonnegative(), byTool: z.array(z.object({ tool: z.string(), count: z.number().int().nonnegative() })) }),
  /** REQ-GIT-122/161: the session's worktree branch (from its binding, REQ-GIT-015) for the status strip; null without a binding. */
  worktreeBranch: z.string().nullable(),
  /**
   * REQ-NOTIFY-263 / REQ-ORCH-091: the wait an agent of the run is parked on — the provider and model whose limit was
   * reached, whether the provider is marked exhausted (REQ-NOTIFY-088), the instant auto-resume fires (null = only when
   * the user decides), the attempt, REQ-NOTIFY-092's wording, the agent, and the reason the last change-model choice
   * was refused (REQ-ORCH-091 d). Null while no agent waits. Published with the snapshot when a wait begins, changes or ends.
   */
  wait: z.object({
    provider: z.string(),
    model: z.string(),
    exhausted: z.boolean(),
    resumeAt: z.string().nullable(),
    attempt: z.number().int().nonnegative(),
    reason: z.string(),
    agent: z.string(),
    rejection: z.string().nullable(),
  }).nullable(),
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

/** ADR-0049 / REQ-NOTIFY-023: the one persistent notice; its shape lives in `notices.ts` beside the action vocabulary. */
export { NoticeSchema };
export const NoticeCurrentSchema = z.object({
  v: schemaVersion,
  current: NoticeSchema.nullable(),
});
export type NoticeCurrent = z.infer<typeof NoticeCurrentSchema>;

/**
 * Channel 8 (Part V): a transient acknowledgement main pushes to one window's stack (REQ-NOTIFY-013 — the stack is per
 * window and is not the notice store). `timeoutMs` absent means the lifetime of REQ-NOTIFY-011, which the renderer's
 * store holds once; zero or less never expires (REQ-NOTIFY-020).
 */
export const AcknowledgementPublishSchema = z.object({
  v: schemaVersion,
  kind: AcknowledgementKindSchema,
  title: z.string().min(1),
  body: z.string().optional(),
  timeoutMs: z.number().int().optional(),
});
export type AcknowledgementPublish = z.infer<typeof AcknowledgementPublishSchema>;

export const ThemeChangedSchema = z.object({ v: schemaVersion, name: z.enum(['rotaris-dim', 'nocturne', 'high-contrast']) });
export type ThemeChanged = z.infer<typeof ThemeChangedSchema>;

/** ADR-0037: a configuration write happened (a save, a per-field write); every window repopulates from the snapshot. */
export const ConfigChangedSchema = z.object({ v: schemaVersion, snapshot: ConfigSnapshotSchema });
export type ConfigChanged = z.infer<typeof ConfigChangedSchema>;

export const CHANNEL_SCHEMAS = {
  [CHANNEL.transcriptIncrement]: TranscriptIncrementSchema,
  [CHANNEL.sessionSnapshot]: SessionSnapshotSchema,
  [CHANNEL.terminalFrames]: TerminalFrameSchema,
  [CHANNEL.noticeCurrent]: NoticeCurrentSchema,
  [CHANNEL.themeChanged]: ThemeChangedSchema,
  [CHANNEL.configChanged]: ConfigChangedSchema,
  [CHANNEL.acknowledgementPublish]: AcknowledgementPublishSchema,
} as const;

/** The two channels that share one per-session counter. Order across BOTH must be preserved by the relay. */
export const SEQUENCED_CHANNELS = [CHANNEL.transcriptIncrement, CHANNEL.sessionSnapshot] as const;
export type SequencedChannel = (typeof SEQUENCED_CHANNELS)[number];
