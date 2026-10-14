import { z } from 'zod';
import { IntentStatusSchema } from './intent.js';
import { PlanGateSchema, ResumableSchema } from './control.js';
import { ApprovalPayloadSchema, QuestionPromptSchema } from './tools.js';
import { AgentRecordSchema } from './children.js';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { ConfigSnapshotSchema } from './config.js';
import { AcknowledgementActionSchema, AcknowledgementKindSchema, NoticeSchema } from './notices.js';
import { RequirementsChangedSchema } from './requirements.js'; // Part AK
import { TerminalStreamMetaSchema } from './terminal.js';
import { ReauthPromptPublishSchema } from './reauth.js';
import { ImprovementActivitySchema, RunTypeSchema } from './improvements.js';
import { InitializationStateSchema } from './initialization.js'; // Part AS

/**
 * REQ-SESSION-134's severity vocabulary for a timeline entry, ascending, `info` where an entry names none. It is the
 * same four members REQ-SESSION-135 gives an issue — one vocabulary, which is why REQ-EVENTS-056 calls the three
 * below `error` "the other three members of the severity vocabulary REQ-SESSION-134 fixes". It is NOT the notice
 * severity of REQ-NOTIFY-023, which carries `success` and no `debug`: the two are different vocabularies for
 * different records, and a notice recorded into a timeline is mapped, never passed through (REQ-NOTIFY-268).
 */
export const TIMELINE_SEVERITIES = ['debug', 'info', 'warning', 'error'] as const;
export const TimelineSeveritySchema = z.enum(TIMELINE_SEVERITIES);
export type TimelineSeverity = z.infer<typeof TimelineSeveritySchema>;

/**
 * The named, typed IPC channels of ADR-0044.
 *
 *  1. transcript:increment — session id, SEQUENCE, earliest-changed index, rows, diffs, personas
 *  2. session:snapshot     — session id, SEQUENCE, the whole-session update
 *  3. terminal:frames      — stream id, per-stream sequence (REQ-SHELL-104), kind, payload
 *  4. notice:current       — the single current notice or null (ADR-0049)
 *  5. command              — request/response; see commands.ts
 *  8. acknowledgement:publish — main → ONE window: a transient acknowledgement for that window's stack
 *     (Part V; REQ-NOTIFY-003's transient half of a main-originated or run-host-originated event, REQ-MCP-044)
 *  9. library:changed      — main → every window: a revision counter, bumped for the four things
 *     REQ-LIBRARY-105 closes a "library change" to and for nothing else (Part X)
 * 10. requirements:changed — main → every window: the board's generation moved, with the affected identifiers or
 *     null for a whole pass (Part AK; REQ-TRACE-348/374 — the value is re-read, never carried)
 * 11. improvement:activity — main → every window: app-wide analyst activity and the queued-job count
 *     (REQ-LIBRARY-024/035/131; proposals are re-read through the workspace service)
 * 12. initialization:state — main → every window: the nine values, their labels and the live run report
 *     (Part AS, ADR-0064). Pushed rather than polled: REQ-WORKSPACE-109 wants a step visible "at the
 *     moment that step finishes", and SR-3 withdrew polling wherever two processes CAN talk — these two
 *     can, so a cadence here would be the fossil that ruling names.
 * 13. reauth:prompt        — main → the main windows: the non-modal re-authentication prompt (REQ-NOTIFY-071)
 * 14. display:changed      — main → every window: one transcript display preference main has just stored, so a window
 *     that did not write it (a persona window, a second main window) redraws its rows too (REQ-CHAT-167, REQ-CONFIG-403;
 *     2026-10-14, `docs/defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md`)
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
  libraryChanged: 'library:changed',
  requirementsChanged: 'requirements:changed', // Part AK
  improvementActivity: 'improvement:activity',
  initializationState: 'initialization:state', // Part AS (ADR-0064)
  reauthPrompt: 'reauth:prompt', // the 401 note's part B (REQ-NOTIFY-071, ADR-0048)
  displayChanged: 'display:changed', // REQ-CHAT-167 / REQ-CONFIG-403: a stored display preference, to every window
  command: 'command',
} as const;
export type ChannelName = (typeof CHANNEL)[keyof typeof CHANNEL];

const schemaVersion = z.literal(CONTRACT_SCHEMA_VERSION);
const sessionId = z.string().min(1);
const seq = z.number().int().positive();

/** REQ-CHAT-170/173: validated image bytes cross the command boundary once; transcript rows retain metadata only. */
export const ImageAttachmentInputSchema = z.object({
  name: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  base64: z.string().min(1),
  size: z.number().int().positive(),
});
export type ImageAttachmentInput = z.infer<typeof ImageAttachmentInputSchema>;

export const ImageAttachmentSchema = z.object({
  name: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  size: z.number().int().positive(),
  path: z.string().min(1),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  available: z.boolean(),
  unavailableReason: z.string().optional(),
});
export type ImageAttachment = z.infer<typeof ImageAttachmentSchema>;

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
  /**
   * REQ-CHAT-046's streamed-character count, on reasoning rows — what REQ-CHAT-062 divides by 4 for `~<T> tok`.
   * DERIVED from the row body rather than stored (no store migration in this batch), and derived at both ends of
   * the release boundary, so a paged-in row is identical to the row released (REQ-CHAT-165).
   */
  chars: z.number().int().nonnegative().optional(),
  /**
   * REQ-CHAT-046's live-terminal stream id — what REQ-CHAT-066 (an unsettled live terminal row never folds) and
   * REQ-CHAT-076 (clicking a live preview requests the pop-out) key on. NOT `TerminalFrameSchema.streamId` below,
   * which belongs to a frame; this one belongs to a row. Set by Part AL (ADR-0021's first execution) on a foreground
   * `terminal` tool row while its command runs — `terminalRowStreamId` in terminal.ts is the one rule — and absent
   * once the row settles. Published, never recorded (the writer keeps it out of the `transcript.row` event).
   */
  streamId: z.string().optional(),
  /**
   * REQ-CHAT-164: the instant the provider fell silent on this live row's call, set by the stream-side detector
   * after 10 s with no output and cleared on the next output of any kind. A DISPLAY field — published, never
   * recorded — so "MUST NOT change what the transcript records" holds. The elapsed seconds are counted from it by
   * REQ-CHAT-063's live-row refresh rather than republished each second.
   */
  stalledSince: z.string().optional(),
  /** REQ-CHAT-046/153/173: metadata only; stored image bytes stay in the session files directory. */
  attachments: z.array(ImageAttachmentSchema).optional(),
});
export type TranscriptRow = z.infer<typeof TranscriptRowSchema>;

/** REQ-CHAT-086/088: the normalized task-plan vocabulary published to every surface. */
export const TaskDisplayStateSchema = z.enum(['done', 'active', 'open', 'abandoned']);
export const TaskPlanSchema = z.object({
  source: z.enum(['child', 'agent', 'planner']),
  sourceLabel: z.string().min(1),
  ownerId: z.string().nullable(),
  phases: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    tasks: z.array(z.object({
      id: z.string().min(1),
      text: z.string(),
      state: TaskDisplayStateSchema,
    })),
  })),
});
export type TaskPlan = z.infer<typeof TaskPlanSchema>;

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

/**
 * REQ-MONITOR-166 as PD-MONITOR-001 revision 2 narrows it: the four qualifiers of a run's cost label. `unknown` —
 * no request has a figure; `incomplete` — some do and some do not; `reported` — every one does, and every figure
 * was the provider's; `configured` — every one does, and at least one came from configured rates.
 */
export const COST_QUALIFIERS = ['unknown', 'incomplete', 'configured', 'reported'] as const;
export type CostQualifier = (typeof COST_QUALIFIERS)[number];

/**
 * REQ-MONITOR-060/061 (live-run finding K1, R-067): the run-level agent's tools. The entry role holds no `children` row, so
 * `AgentRecord`'s grant, history and active set never reached the synthetic root; this carries them. `resolved` is the
 * native set the live run's root port resolved — policy narrowing applied, so a coordinator's withheld write, terminal and
 * commit tools are absent (061) — and empty when no run is live, where the persona's declared tools stand in (060).
 * `called` is the root's history from the incremental tracker (first-call order), `active` its calls in flight.
 */
export const EntryToolsSchema = z.object({ resolved: z.array(z.string()), called: z.array(z.string()), active: z.array(z.string()) });
export type EntryToolsPayload = z.infer<typeof EntryToolsSchema>;
/**
 * REQ-MONITOR-044/052/068/069 (live-run finding K1, R-067): one of the session's artifacts as the agent surfaces link it —
 * its name (the slug, with the title beside it), its producer (the creating instance's canonical name, REQ-LIBRARY-093/136),
 * its ready flag (REQ-LIBRARY-136: `succeeded` or `published`) and the instances that consumed it (`consumed_by`, the
 * received side). Superseded artifacts are left out, as the Library's table leaves them out (REQ-LIBRARY-136).
 */
export const SessionArtifactLinkSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), status: z.string(), producer: z.string(), ready: z.boolean(), consumedBy: z.array(z.string()),
});
export type SessionArtifactLink = z.infer<typeof SessionArtifactLinkSchema>;
/**
 * PD-ORCH-005 clause 4 with OQ-97, and REQ-LIBRARY-093: one root agent of the entry role by the two names its record
 * carries — `name`, the one its transcript rows and tool calls carry (the persona its iteration was opened with, kept by a
 * root resumed as the entry role), and `canonical`, its canonical instance name (REQ-ORCH-044), which its publishes and
 * reads record.
 */
export const EntryRootSchema = z.object({ name: z.string(), canonical: z.string() });
export type EntryRoot = z.infer<typeof EntryRootSchema>;

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
  /**
   * REQ-CHAT-051 / REQ-SESSION-157 / REQ-CHAT-097: the question prompts pending right now, from which the question
   * trailer row is computed. **Widened by Part AC (2026-09-07) from `{requestId, prompt}[]`**, which carried neither
   * the steps nor their titles the trailer must name; the earlier shape forced `trailerRows` to read the LIST as one
   * prompt's steps. It is DERIVED from the live run at every snapshot, like `wait` above and unlike `pendingApprovals`
   * — a wait held in the run host's memory (ADR-0010's fourth note), so a stored record's list is empty.
   * ~~"REQ-SESSION-025's persistence limb is therefore still owed and is recorded as owed."~~ Reconciled 2026-10-13 with
   * PD-ORCH-005 revision 3, which governs REQ-SESSION-025's question half: a question is withdrawn at rest and never
   * restored, so the "come back on reload" limb is moot and this list stays derived. What the limb still owed was
   * durability for two readers, and it is built: the run host mirrors the session's pending prompts to
   * `sessions.pending_questions` (v35), which a crash's record withdraws (clause 9) and the listing's `awaitingInput` reads
   * (REQ-SESSION-031). The mirror is never read back into this field.
   */
  pendingQuestions: z.array(QuestionPromptSchema),
  tokenUsage: z.object({ input: z.number().int(), output: z.number().int() }),
  /** Decimal string (ADR-0031). */
  cost: z.string(),
  /** REQ-SESSION-095 / REQ-ORCH-147: what the run recorded; null before any run ended. */
  stopReason: z.string().nullable(),
  /** REQ-SESSION-021 / REQ-LIBRARY-002/036: immutable persisted run classification and produced artifacts. */
  runType: RunTypeSchema,
  improvementArtifactIds: z.array(z.string()),
  /** REQ-MONITOR-164/171: when the current run started; null before any run. */
  runStartedAt: z.string().nullable(),
  iterationsCompleted: z.number().int().nonnegative(),
  /** REQ-SESSION-074: the end-of-run summarisation, presented exactly once (REQ-SESSION-186). */
  summary: z.object({ status: z.string(), severity: z.string(), message: z.string() }).nullable(),
  /** REQ-TOOLS-071 / REQ-TOOLS-184: the effective mode and the sandbox verdict, as the strip shows them. */
  permissionMode: z.string().nullable(),
  sandboxed: z.boolean(),
  /**
   * REQ-SANDBOX-121: the confinement backend the session's latest run was confined by (`bubblewrap`, `seatbelt`), for the
   * workspace indicator that names it; '' where `sandboxed` is false.
   */
  sandboxBackend: z.string(),
  /** REQ-TOOLS-060 / REQ-CHAT-051: the pending approvals, request id to payload, for the trailer rows. */
  pendingApprovals: z.array(ApprovalPayloadSchema),
  /** REQ-TOOLS-184: background terminal sessions in the running state. */
  backgroundSessions: z.number().int().nonnegative(),
  /** REQ-ORCH-014: the intent status — classifying, then the classified result; null before a run and for a session that never ran. */
  intent: IntentStatusSchema.nullable(),
  /** REQ-CHAT-041 / REQ-MONITOR-141: exactly the QUEUED prompts of this session, on the whole-session update. */
  queuedPrompts: z.array(z.object({ id: z.string(), content: z.string(), createdAt: z.string() })),
  /**
   * REQ-CHAT-085..091: the run-level plan after the child > agent > planner priority has been resolved, plus
   * child-owned plans keyed by the child's stable task id. A surface selects by scope and never decodes backend
   * todo documents or maps their state vocabularies itself.
   */
  todo: TaskPlanSchema.nullable(),
  childTodos: z.record(z.string(), TaskPlanSchema),
  /** REQ-ORCH-084/087: the message limit in force (null = disabled) and, while paused at it, the count reached. */
  messageLimit: z.number().int().nullable(),
  pausedAtCount: z.number().int().nullable(),
  /**
   * REQ-ORCH-153/154: the plan cycle awaiting an answer; null when none is. Read from the STORE and not from a
   * live run — the gate is a park, so the deciding surface must find it after a restart with no process behind it
   * (REQ-ORCH-153's restart clause, on the same terms as `pausedAtCount`).
   */
  planGate: PlanGateSchema.nullable(),
  /**
   * PD-ORCH-003: whether this session already holds an approved release. Read from the same stored row as
   * `planGate`, for the same reason. It is NOT the mode — `runtime.run_start_mode` is configuration and says
   * what the user asked for; this says whether the next run in THIS session will actually be held, which is
   * the fact a surface showing the mode has to state or it offers a gate that will not open.
   */
  planReleased: z.boolean(),
  /** PD-ORCH-005 clause 6: the open iteration the Continue action resumes, and how many agents it resumes; null when none is open. */
  resumable: ResumableSchema.nullable(),
  /** REQ-MONITOR-166: the token history the run sampled — [at, cumulative total], oldest first, at most 120 (named without the word the secret test forbids). */
  usageHistory: z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
  /**
   * REQ-MONITOR-166: the pre-rendered cost label with its qualifier, so no view invents one. The fourth
   * qualifier is PD-MONITOR-001's: a figure the PROVIDER computed and reported, which is none of the
   * first three — it rests on no configured rate, and it is neither unknown nor partial.
   */
  costLabel: z.object({ text: z.string(), qualifier: z.enum(COST_QUALIFIERS) }),
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
    /**
     * REQ-MONITOR-194 / REQ-MONITOR-303: the configured model keys whose pair the session recorded out of quota, in
     * declaration order. The change-model picker lists each annotated with that reason, never hidden; an explicit choice of
     * one is the run's to clear (REQ-MONITOR-194).
     */
    excluded: z.array(z.string()),
    /**
     * OQ-188's ruling (R-071, PD-MONITOR-004 revision 2): the configured model key of the waiting pair — a configured key before a
     * discovered one, the first in declaration order — or null when no key names it. In the wait that never auto-resumes
     * (`resumeAt` null, an out-of-quota pair) the header's keep waiting sends `setModel` with it, marked `keepWaiting` and
     * naming this wait's `agent` and `attempt` (`Run.keepWaiting`): a retry of the agents parked on the waiting pair, which
     * clears its exclusion (REQ-MONITOR-194/303), moves no other agent and persists no override. The timed wait's keep
     * waiting sends nothing; its timer retries. The key is a configured one first, else a discovered one (`keyOfPair`).
     */
    modelKey: z.string().nullable(),
  }).nullable(),
  /**
   * REQ-CHAT-006 / REQ-SESSION-026 / REQ-NOTIFY-089: each configured model key a session-wide override replaces (a model
   * chosen during a provider wait, an authentication fallback or recovery pin), with the key an agent configured on it runs
   * on — so the composer's model chip and the inspector name what the next run starts with rather than the configured key.
   * Derived from the session's memory and catalogue at every snapshot; empty when none is in force.
   */
  modelOverrides: z.array(z.object({ from: z.string(), to: z.string() })),
  /**
   * REQ-MONITOR-194: the configured model keys whose pair the session holds out of quota, in declaration order — outside a
   * wait as inside one (`wait.excluded` is the same list while a wait is shown), from a live run's memory or, for a session at
   * rest, the memory its timeline rehydrates. Every model selector lists these annotated with the reason, still choosable,
   * and a choice of one clears it. Empty when none is excluded.
   */
  excludedModels: z.array(z.string()),
  /**
   * REQ-MONITOR-085 (Part AH, ADR-0060): the compression in flight — the agent whose context is being
   * compressed and when it began — so a surface can state that compression is running without blocking.
   * Derived from the live run at every snapshot, like `wait` above; null while none is running.
   */
  compression: z.object({ agent: z.string(), startedAt: z.string() }).nullable(),
  /**
   * REQ-MONITOR-089 (Part AH): "the run's synthetic root agent exposes the newest such reading so that
   * root-level surfaces have a context figure to show". The entry role holds no `children` row, so its
   * reading reached no surface and every root-level meter drew zero whatever the run had spent — found by
   * the first live run against a real provider. `limit` is the model's own advertised maximum where the
   * configuration states one, else REQ-MONITOR-080's default capacity.
   */
  entryContext: z.object({ used: z.number().int().nonnegative(), limit: z.number().int().nonnegative() }),
  /** REQ-MONITOR-060/061 (live-run finding K1): the run-level agent's resolved tools, history and active calls. */
  entryTools: EntryToolsSchema,
  /** REQ-MONITOR-044/052/068/069 (live-run finding K1): the session's artifacts, for the agent surfaces' links. */
  artifacts: z.array(SessionArtifactLinkSchema),
  /**
   * REQ-MONITOR-071, REQ-CHAT-069, REQ-MONITOR-053 and REQ-MONITOR-044 with PD-ORCH-005 clause 4 (OQ-97) and REQ-LIBRARY-093:
   * the entry role's root agents of this session — each iteration's, each plan cycle's (recorded when it starts, store v30),
   * each root no row records that published (a plan cycle's from before v30, OQ-106), and the live run's — each pair once, in
   * that order. The run-level agent owns the rows and the artifacts
   * they name, not only those of the entry persona a surface knows it by: a root resumed as the entry role keeps its own
   * persona's name on its rows, and a root's publishes and reads record its canonical name.
   */
  entryRoots: z.array(EntryRootSchema),
  /**
   * REQ-MONITOR-057/060 with PD-ORCH-003 (the second repair of
   * `after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`): the persona the live run's
   * root runs as — the persona its rows carry and the one its port resolves `entryTools` for — so a surface names the
   * run-level agent, and draws its stand-in, from the same root whose tools its chips show, from the run's start and before
   * that root has written any row. Null for a record read with no live run; a surface then reads the transcript's latest
   * root row (`entryRole`).
   */
  entryPersona: z.string().nullable(),
  /**
   * REQ-MONITOR-052 / REQ-MONITOR-066 / REQ-MONITOR-069 (the repair of
   * `the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`): the configured model key
   * the live run's root runs on — the key of the pair its ladder cell calls, which a same-tier or unresponsive-model move
   * (REQ-NOTIFY-082, REQ-ORCH-091 b, REQ-ORCH-090), a pre-call move off a pair held out of quota (REQ-MONITOR-194) or an
   * override it follows changes without touching the configuration. The run-level agent's Model (the inspector, a persona
   * window) names it while the run is live; the composer's chip and the strip's model item keep naming what the next run
   * starts with (`modelOverrides`, REQ-MONITOR-146, REQ-SHELL-043). Null for a record read with no live run, before the
   * root's cell exists, or when the pair is no catalogue entry's.
   */
  entryModelKey: z.string().nullable(),
  /**
   * REQ-MONITOR-117/119/120: the entry agent's stall, as `AgentRecord.stalledSeconds` carries a child's — the seconds with
   * no model event or token while its watch finds it stalled, else null. Null for a record read with no live run.
   */
  entryStalledSeconds: z.number().int().nonnegative().nullable(),
  /**
   * REQ-MONITOR-044/052 (the repair of `the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md`, acceptance
   * A20, R-067): the run-level agent's tool-call count — the roots' calls the session's total holds (the total less every
   * child's persisted count), plus the live root's calls that have not joined it yet — its calls in flight, since each call
   * joins the total as it completes (OQ-116 as ruled, R-071, `PD-ORCH-008`; until then a root's calls joined it only when
   * its turn returned, REQ-ORCH-097's cadence). Null for a record read with no projection; a surface then derives it from
   * the total. The agent's own count, not REQ-MONITOR-101's aggregate run count for the synthetic root: OQ-159 as ruled
   * (R-071, `PD-MONITOR-003`), the run-level agent carries its own count.
   */
  entryToolCalls: z.number().int().nonnegative().nullable(),
  /**
   * REQ-MONITOR-086 with REQ-SESSION-139 (the repair of
   * `the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`): the run-wide compression
   * count — the session's maintained aggregate (ADR-0008), raised at the same completion as the compressing agent's own
   * count, the roots' included, so it equals the sum of the per-agent counts. The live run's figure while a run is live
   * (the stored one lags it until the pass's save), else the stored `sessions.compressions`. Under OQ-159's recorded
   * reading the run-level agent carries it as its compression count; until this field the surfaces summed the children's
   * counts, so a root's own compressions were counted nowhere.
   */
  compressions: z.number().int().nonnegative(),
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

/**
 * Channel 3, extended in place by Part AL (ADR-0021 first executed). One frame of one stream:
 *  - `delta`  — the VT bytes appended since the previous frame of this stream (REQ-TOOLS-127);
 *  - `screen` — a serialisation of the current screen, emitted on attach and on resync so a late attacher can
 *               never show a line twice (ADR-0021); with `closing: true` it is the CLOSING frame of REQ-TOOLS-127,
 *               whose payload is the observation's final PLAIN text and a literal replacement — a display resets
 *               and writes it verbatim (OQ-5's reading, recorded in ADR-0021's note, closed 2026-09-11 when REQ-TOOLS-127 came to state it);
 *  - `meta`   — carries the whole `TerminalStreamMeta`; applying it twice is applying it once (REQ-SHELL-105).
 * `seq` is per stream and monotonic (REQ-SHELL-104): the run host numbers contiguously; main may MERGE frames of
 * one stream into a larger step under REQ-MONITOR-306's bound (REQ-SHELL-103), so a delivered `seq` may skip
 * numbers but never runs backwards. `sessionId` is on the envelope so main routes to the session's subscribers
 * without holding per-stream state. Nothing here is ever a credential (`contracts.test.ts`).
 */
export const TerminalFrameSchema = z.object({
  v: schemaVersion,
  sessionId,
  streamId: z.string().min(1),
  /** Per-stream sequence, REQ-SHELL-104 — a DIFFERENT counter from the session's. */
  seq: z.number().int().positive(),
  kind: z.enum(['delta', 'screen', 'meta']),
  payload: z.string(),
  meta: TerminalStreamMetaSchema.optional(),
  closing: z.literal(true).optional(),
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
  /** Stage C: at most one action, and only the one `AcknowledgementActionSchema` allows (`PD-WORKSPACE-001`). */
  action: AcknowledgementActionSchema.optional(),
});
export type AcknowledgementPublish = z.infer<typeof AcknowledgementPublishSchema>;

export const ThemeChangedSchema = z.object({ v: schemaVersion, name: z.enum(['rotaris-dim', 'nocturne', 'high-contrast']) });
export type ThemeChanged = z.infer<typeof ThemeChangedSchema>;

/**
 * Channel 14 — REQ-CHAT-167 and REQ-CHAT-067 / REQ-CONFIG-403: the three transcript display preferences are global to the
 * transcript, so one stored by any window is announced to every window, and each folds it into its own store. `preference`
 * is the preference's own key (`PREFERENCE_KEYS`) — not named `key`, which ADR-0030's credential-name check refuses on any
 * payload that reaches a renderer — and the value is what main stored.
 */
export const DISPLAY_PREFERENCE_KEYS = ['display/showReasoning', 'display/autoCollapseTools', 'display/groupTools'] as const;
export type DisplayPreferenceKey = (typeof DISPLAY_PREFERENCE_KEYS)[number];
export const DisplayChangedSchema = z.object({ v: schemaVersion, preference: z.enum(DISPLAY_PREFERENCE_KEYS), value: z.boolean() });
export type DisplayChanged = z.infer<typeof DisplayChangedSchema>;

/** ADR-0037: a configuration write happened (a save, a per-field write); every window repopulates from the snapshot. */
export const ConfigChangedSchema = z.object({ v: schemaVersion, snapshot: ConfigSnapshotSchema });
export type ConfigChanged = z.infer<typeof ConfigChangedSchema>;

/**
 * Part X (REQ-LIBRARY-105): a library change landed. The payload is a REVISION and not the changed data —
 * "once a burst of changes has settled, all three tabs MUST show the stored state including the last change of
 * that burst; no change may be lost because a later one overtook it". A counter cannot be overtaken: a surface
 * that sees the number move re-reads the store and gets whatever is there now, so two writes racing to publish
 * still end with the later state on screen. Carrying the data instead would make the last message win, which is
 * the failure the requirement names. It is bumped for exactly the four things `LIBRARY_CHANGES` lists, and a
 * settings change that touches none of them is not one of them.
 */
export const LibraryChangedSchema = z.object({ v: schemaVersion, revision: z.number().int().nonnegative() });
export type LibraryChanged = z.infer<typeof LibraryChangedSchema>;

export const ImprovementActivityPublishSchema = ImprovementActivitySchema.extend({ v: schemaVersion });
export type ImprovementActivityPublish = z.infer<typeof ImprovementActivityPublishSchema>;

/** Channel 12 (Part AS, ADR-0064): the whole initialization state, whichever view a window is showing. */
export const InitializationStatePublishSchema = InitializationStateSchema.extend({ v: schemaVersion });
export type InitializationStatePublish = z.infer<typeof InitializationStatePublishSchema>;

export const CHANNEL_SCHEMAS = {
  [CHANNEL.transcriptIncrement]: TranscriptIncrementSchema,
  [CHANNEL.sessionSnapshot]: SessionSnapshotSchema,
  [CHANNEL.terminalFrames]: TerminalFrameSchema,
  [CHANNEL.noticeCurrent]: NoticeCurrentSchema,
  [CHANNEL.themeChanged]: ThemeChangedSchema,
  [CHANNEL.configChanged]: ConfigChangedSchema,
  [CHANNEL.acknowledgementPublish]: AcknowledgementPublishSchema,
  [CHANNEL.libraryChanged]: LibraryChangedSchema,
  [CHANNEL.requirementsChanged]: RequirementsChangedSchema, // Part AK
  [CHANNEL.improvementActivity]: ImprovementActivityPublishSchema,
  [CHANNEL.initializationState]: InitializationStatePublishSchema, // Part AS
  [CHANNEL.reauthPrompt]: ReauthPromptPublishSchema, // REQ-NOTIFY-071
  [CHANNEL.displayChanged]: DisplayChangedSchema, // REQ-CHAT-167, REQ-CONFIG-403
} as const;

/** The two channels that share one per-session counter. Order across BOTH must be preserved by the relay. */
export const SEQUENCED_CHANNELS = [CHANNEL.transcriptIncrement, CHANNEL.sessionSnapshot] as const;
export type SequencedChannel = (typeof SEQUENCED_CHANNELS)[number];
