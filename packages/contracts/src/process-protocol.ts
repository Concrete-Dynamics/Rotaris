import { CONFIG_SCOPES, ConfigSnapshotSchema, DesktopSaveSchema } from './config.js';
import { AcknowledgementKindSchema, NoticeSeveritySchema } from './notices.js';
import { z } from 'zod';
import { HOOK_AGENT_IDS, HooksSummarySchema } from './hooks.js';
import { McpHealthSchema, McpListingSchema, McpSecretsViewSchema, McpSetupStatusSchema } from './mcp.js';
import { ConfinementVerdictSchema } from './confinement.js';
import { PlaybookCatalogueSchema } from './intent.js';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { ImageAttachmentInputSchema, SessionSnapshotSchema, TerminalFrameSchema, TimelineSeveritySchema, TranscriptIncrementSchema, TranscriptRowSchema } from './channels.js';
import { TERMINAL_COMMAND_SCHEMAS, TerminalStreamMetaSchema } from './terminal.js';
import { ControlRequestSchema, ControlResultSchema, PLAN_DECISIONS } from './control.js';
import { ApprovalPayloadSchema } from './tools.js';
import { ArtifactsStateSchema } from './artifacts.js';
import { GitViewStateSchema, RepositoryStateSchema, WorktreeBindingSchema } from './repository.js';
import { SANDBOX_MODE_NAMES } from './config.js';
import { CHECKPOINT_KINDS, CheckpointListSchema, PreviewEntrySchema } from './checkpoints.js';
import { PromptListSchema, PromptStateSchema } from './library.js';
import { ActorSchema, RequirementsCommandSchema } from './requirements.js'; // Part AK
import { PromptsRootsResultSchema } from './slash.js'; // Part AO
import { SkillsStateSchema } from './skills.js'; // ADR-0063
import { ImprovementAnalysisJobSchema, ImprovementArtifactSchema, ImprovementCommandSchema, RunTypeSchema } from './improvements.js';

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
  /**
   * REQ-EVENTS-088 (OQ-42): present only when terminal persistence could not be confirmed, and then always
   * `confirmed: false` with the last durable event ordinal beside it. Absent means the outcome is confirmed —
   * there is no third state, which is why `confirmed` is a literal rather than a boolean.
   *
   * It crosses this boundary because the receiving process must be able to ACT on the uncertainty: main
   * suppresses its own terminal notice for such a run, since REQ-EVENTS-088 allows exactly one failure
   * notification per affected run and the run host has already published it with the ordinal and the recovery
   * action. Recognising the condition from the summary sentence would make that suppression depend on wording.
   */
  persistence: z.object({ confirmed: z.literal(false), last_event_ordinal: z.number().int().nonnegative() }).optional(),
});
export type RunResultPayload = z.infer<typeof RunResultSchema>;
export type ProcessKind = z.infer<typeof ProcessKindSchema>;

/** REQ-LIBRARY-059/060: an approved improvement plan enters the ordinary run as its initial todo. */
export const InitialTodoSchema = z.object({
  schema_version: z.literal(1),
  phases: z.array(z.object({
    name: z.string().min(1),
    tasks: z.array(z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      state: z.literal('pending'),
      consecutiveRetries: z.literal(0),
    })).min(1),
  })).min(1),
});
export type InitialTodo = z.infer<typeof InitialTodoSchema>;

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
  /**
   * REQ-CHAT-011 / REQ-SESSION-089: create the session, take its lock, open its history, record row 0.
   * REQ-GIT-022 (Part O): an isolated or attached session arrives with its id minted in main, the binding the
   * workspace service already made, and the effective root the run works in; the session row stays anchored to
   * the base workspace (REQ-GIT-019). `sandboxMode` is REQ-SHELL-125's choice, recorded on the row (ADR-0022: not honoured here).
   * REQ-TRACE-470/471: boardPermissions carries the authorized board grant for this launch.
   */
  z.object({ kind: z.literal('session.start'), workspaceId: z.string(), prompt: z.string(), attachments: z.array(ImageAttachmentInputSchema).max(10).optional(), sessionId: z.string().min(1).optional(), effectiveRoot: z.string().optional(), worktree: WorktreeBindingSchema.optional(), boardPermissions: z.literal('permissive').optional(), sandboxMode: z.enum(SANDBOX_MODE_NAMES).optional(), runType: RunTypeSchema.optional(), initialTodo: InitialTodoSchema.optional() }).refine((v) => v.prompt.trim() !== '' || (v.attachments?.length ?? 0) > 0, { message: 'A prompt or attachment is required.' }),
  z.object({ kind: z.literal('circuit_breaker.status'), workspaceId: z.string() }),
  /** ADR-0037 Tier B: the settings store's current values, handed to the run host ahead of the next run start. */
  z.object({ kind: z.literal('config.liveState'), state: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal('session.list'), workspaceId: z.string() }),
  z.object({ kind: z.literal('session.resume'), workspaceId: z.string(), sessionId: z.string().min(1) }),
  /** REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause (continue, double, cancel) or continue a manually paused session or one a crash left (PD-ORCH-005 clause 18); clause 6's `withoutPaused` declines the open iteration. */
  z.object({ kind: z.literal('session.continue'), sessionId: z.string().min(1), action: z.enum(['continue', 'double', 'cancel']), withoutPaused: z.boolean().optional() }),
  /**
   * REQ-NOTIFY-070 / REQ-MONITOR-147: a first authentication failure's recovery — pin the configured fallback as the
   * session's model override, keyed by the pair that failed, and restart the run with the same prompt
   * (`Sessions.restartOnFallback`). Main sends it after classifying the run's failure (REQ-NOTIFY-060/067).
   */
  z.object({ kind: z.literal('session.restartOnFallback'), sessionId: z.string().min(1) }),
  /** REQ-ORCH-153/154 (ADR-0062) and PD-ORCH-003: the plan gate's three entries, forwarded to the run host that owns the session. */
  z.object({ kind: z.literal('session.planEdit'), sessionId: z.string().min(1), text: z.string() }),
  z.object({ kind: z.literal('session.planDecision'), sessionId: z.string().min(1), decision: z.enum(PLAN_DECISIONS), changes: z.string().optional() }),
  z.object({ kind: z.literal('session.planRearm'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('session.prompt'), sessionId: z.string(), prompt: z.string(), attachments: z.array(ImageAttachmentInputSchema).max(10).optional() }).refine((v) => v.prompt.trim() !== '' || (v.attachments?.length ?? 0) > 0, { message: 'A prompt or attachment is required.' }),
  z.object({ kind: z.literal('session.readAttachment'), sessionId: z.string().min(1), path: z.string().min(1), digest: z.string().regex(/^[0-9a-f]{64}$/) }),
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
  /**
   * PD-ORCH-005 clause 9: `quitting` is set when the application's quit closed the window (main's `QuitState`), so an
   * approval or a question asked after the last one closes waits for the quit to withdraw it rather than being denied.
   */
  z.object({ kind: z.literal('presenter.revoke'), windowId: z.string().min(1), quitting: z.boolean().optional() }),
  z.object({ kind: z.literal('presenter.pollReply'), seq: z.number().int().nonnegative(), windows: z.array(z.string()) }),
  /** REQ-TOOLS-063: main reports whether the dialog was put in front of a person; a failure denies with source presenter-error. */
  /** ADR-0015: the Hooks tab's reads and writes; the run host holds the hooks package and the store (REQ-HOOKS-136). */
  z.object({ kind: z.literal('hooks.summary'), workspaceId: z.string(), sessionId: z.string().optional() }),
  z.object({ kind: z.literal('hooks.decide'), workspaceId: z.string(), trusted: z.boolean() }),
  z.object({ kind: z.literal('hooks.clearDecision'), workspaceId: z.string() }),
  z.object({ kind: z.literal('hooks.setToggle'), agent: z.enum(HOOK_AGENT_IDS), hookId: z.string().nullable(), on: z.boolean() }),
  z.object({ kind: z.literal('playbooks.catalogue') }),
  z.object({ kind: z.literal('approval.shown'), requestId: z.string().min(1), ok: z.boolean(), error: z.string().optional() }),
  /**
   * REQ-TOOLS-063: main has queued the request behind the dialog already open in its window. It is shown as soon as
   * that dialog closes, so the run host stops bounding the wait for `approval.shown`; only a timeout or a cancellation
   * drops it unshown.
   */
  z.object({ kind: z.literal('approval.queued'), requestId: z.string().min(1) }),
  /**
   * ADR-0039 (Part P): the rows live in the run host. `checkpoint.list` reads them with no Git (REQ-GIT-050), stamps
   * REQ-GIT-093's liveness verdict and runs REQ-GIT-094's stale-session repair; `checkpoint.recordSafety` writes the
   * pre-restore row through the writer's one transaction (REQ-GIT-058 gate 5); `checkpoint.recordRestore` writes the
   * attempt's outcome (REQ-GIT-062/068/155).
   */
  z.object({ kind: z.literal('checkpoint.list'), workspaceId: z.string(), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoint.recordSafety'), workspaceId: z.string(), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), ref: z.string(), commit: z.string(), files: z.array(z.string()) }),
  z.object({
    kind: z.literal('checkpoint.recordRestore'), workspaceId: z.string(), sessionId: z.string().min(1), sequence: z.number().int(), restored: z.boolean(), safetySequence: z.number().int().nullable(),
    changedPaths: z.number().int().nonnegative(), blockedReason: z.string(), forced: z.boolean(), treeRoot: z.string(), dirtyPaths: z.array(z.string()), ref: z.string().nullable(), commit: z.string().nullable(),
  }),
  /** ADR-0034 (Part S): the MCP category's reads and the session override; the run host answers from its pipeline and its override map. */
  z.object({ kind: z.literal('mcp.list'), workspaceId: z.string() }),
  z.object({ kind: z.literal('mcp.probe'), workspaceId: z.string(), name: z.string().min(1).optional() }),
  z.object({ kind: z.literal('mcp.setEnabled'), name: z.string().min(1), enabled: z.boolean() }),
  z.object({ kind: z.literal('mcp.secrets'), workspaceId: z.string(), server: z.string().optional() }),
  /**
   * ADR-0022 (Part AR): the confinement availability verdict, and REQ-SANDBOX-129's explicit re-check.
   * The run host answers because it owns the one `ConfinementService` (REQ-SANDBOX-067) — the verdict a
   * surface shows and the verdict that gates a session are then the same reading (REQ-SANDBOX-094).
   * `recheck` discards the cached verdict and probes afresh; the probe is bounded at 5.0 s and runs off
   * every interface thread, so no surface waits on it (REQ-SANDBOX-069, REQ-SANDBOX-129).
   */
  z.object({ kind: z.literal('confinement.status'), recheck: z.boolean().optional() }),
  /**
   * Part U — the session browser's actions, answered by the run host because the rows and the lock are its (ADR-0005,
   * ADR-0058). `session.repair` without an id repairs every stale session; `session.delete` runs REQ-SESSION-166's order
   * (state → refs through the `checkpoint.deleteNamespace` ask → one transaction → files); the two exports READ in one
   * transaction and write the chosen destination through ADR-0004's primitive; `session.files` answers where the
   * per-session files of REQ-SESSION-002 are and which exist (REQ-SESSION-191).
   */
  z.object({ kind: z.literal('session.repair'), workspaceId: z.string(), sessionId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('session.delete'), workspaceId: z.string(), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('session.export'), workspaceId: z.string(), sessionId: z.string().min(1), destination: z.string().min(1) }),
  z.object({ kind: z.literal('session.exportTrajectory'), workspaceId: z.string(), sessionIds: z.array(z.string().min(1)).min(1), destination: z.string().min(1) }),
  z.object({ kind: z.literal('session.files'), workspaceId: z.string(), sessionId: z.string().min(1) }),
  /** ADR-0035 (Part T) / REQ-MCP-099/112: the code-intelligence project setup of one workspace — start, cancel, status. */
  z.object({ kind: z.literal('mcp.setup'), workspaceId: z.string(), action: z.enum(['start', 'cancel', 'status']) }),
  /**
   * Part V / REQ-NOTIFY-268: main records a warning or error notice into a session's timeline BEFORE rendering it. The
   * run host appends through the live session writer where the session is live, else directly under the workspace store
   * (the session row must exist); answered `timeline.appended {ordinal}` or `refused`.
   *
   * REQ-SESSION-134 fixes the entry's severity vocabulary; `severity` is optional here and absent means the
   * requirement's own default, `info`. The entry's `id` is not carried: it is minted by the writer that records the
   * entry, never by the process asking for one (schema v10 repaired the table that held neither).
   */
  z.object({ kind: z.literal('timeline.append'), workspaceId: z.string(), sessionId: z.string().min(1), name: z.string().min(1), actor: z.string().min(1), message: z.string(), metadata: z.record(z.string(), z.unknown()), severity: TimelineSeveritySchema.optional() }),
  /**
   * Part X — the saved prompts (REQ-LIBRARY-137/138/139). Session-LESS, like `session.list` and `mcp.list`:
   * the lists belong to the workspace and outlive every session, so no session id appears and none is implied.
   *
   * `remove` is a REQUIRED boolean rather than a defaulted one. REQ-LIBRARY-107 makes keeping and removing
   * two deliberate acts ("Whether the entry survives that MUST never be implicit"), and a default would let a
   * call site take that choice silently. `index` is the entry's index in the WHOLE list, newest first, so a
   * filtered view (REQ-LIBRARY-104) removes the row the user chose rather than the row at that screen position.
   */
  z.object({ kind: z.literal('prompts.read'), workspaceId: z.string() }),
  z.object({ kind: z.literal('prompts.push'), workspaceId: z.string(), list: PromptListSchema, text: z.string() }),
  z.object({ kind: z.literal('prompts.take'), workspaceId: z.string(), list: PromptListSchema, index: z.number().int().nonnegative(), remove: z.boolean() }),
  /**
   * Part Y — the Library's Artifacts tab (REQ-LIBRARY-108/131..136). The run host answers because the store and
   * the session's files are its (ADR-0002, ADR-0058); the renderer never touches either. `artifacts.list`
   * carries no session id: REQ-LIBRARY-136 scopes the tab to the LOADED session, so the host answers for the
   * session it holds and reports none when it holds none — a renderer that named a session could ask for one
   * that is not loaded and would then need the refusal REQ-LIBRARY-136 already words for the inspector.
   */
  z.object({ kind: z.literal('artifacts.list'), workspaceId: z.string() }),
  z.object({ kind: z.literal('artifacts.body'), workspaceId: z.string(), ref: z.string().min(1) }),
  z.object({ kind: z.literal('artifacts.save'), workspaceId: z.string(), ref: z.string().min(1), body: z.string() }),
  /** REQ-LIBRARY-024/035: main schedules a captured job back onto the run host's analyst. */
  z.object({ kind: z.literal('improvement.analyze'), job: ImprovementAnalysisJobSchema }),
  /**
   * PD-LIBRARY-002 (ADR-0065 decisions 4 and 5): the user's gesture asks the host to capture a retrospective
   * over the workspace's own record. The host is where the store is open and where a model resolves; a pass
   * with no run therefore configures the workspace and leases its credentials the way a continuation does.
   */
  z.object({ kind: z.literal('retrospective.capture'), workspaceId: z.string().min(1), workspaceRoot: z.string().min(1) }),
  z.object({ kind: z.literal('improvement.cancel'), artifactId: z.string().regex(/^impart_[0-9A-Za-z]{8}$/) }),
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
  /**
   * Part AL — the live terminal (ADR-0021): main relays the seven `terminal.*` commands as they arrive, shape for shape,
   * to the run host, which holds every stream's emulator and PTY (`run-host/terminal.ts`). `terminal.streams` is
   * answered `terminal.streams {streams}` below and, for a late attacher, followed by one `screen` frame per stream on
   * `publish.terminal`; the controls answer `ack` or `refused terminal.<TerminalRefusal>`; `terminal.audit` writes
   * REQ-SHELL-107's entry through the live session writer, redacted, and answers `ack`.
   */
  ...TERMINAL_COMMAND_SCHEMAS,
  /**
   * ADR-0063 — portable skills. The run host answers because it owns the catalog: it is cached per
   * workspace root and cleared at SESSION CREATION (REQ-WORKSPACE-058), which is a lifetime only the
   * process that creates sessions can honour, and the units it feeds are composed at agent construction.
   *
   * `sessionId` is optional on the three that touch session state: a gesture made from a window showing
   * no session lands in that root's pending bucket and is adopted by the next session created for it
   * (OQ-58 — "the current session" has no referent while a workspace has several).
   */
  z.object({ kind: z.literal('skills.read'), workspaceRoot: z.string(), sessionId: z.string().optional() }),
  z.object({ kind: z.literal('skills.rescan'), workspaceRoot: z.string(), sessionId: z.string().optional() }),
  z.object({ kind: z.literal('skills.forceLoad'), workspaceRoot: z.string(), sessionId: z.string().optional(), name: z.string().min(1) }),
  z.object({ kind: z.literal('skills.loadFile'), workspaceRoot: z.string(), sessionId: z.string().optional(), path: z.string().min(1) }),
  /**
   * REQ-CHAT-162 — `/skills`: the listing written into the session's transcript as one saved system row. The
   * session is REQUIRED here, unlike the three above: a row has to be saved with a session, so there is no pending
   * bucket to fall back to (OQ-67), and main refuses before it asks when the window follows none.
   */
  z.object({ kind: z.literal('skills.list'), workspaceRoot: z.string(), sessionId: z.string().min(1) }),
]);
export type RunHostRequest = z.infer<typeof RunHostRequestSchema>;

export const SessionListItemSchema = z.object({
  sessionId: z.string(), label: z.string(), status: z.string(), branch: z.string(), relativeTime: z.string(), detail: z.string(),
  awaitingInput: z.boolean(), stale: z.boolean(),
  /** REQ-MONITOR-171/172: the sessions card's token and duration labels, the busy flag, and a requirement id or none. */
  tokens: z.number().int().nonnegative(), durationLabel: z.string(), busy: z.boolean(), requirementId: z.string().nullable(),
  /** REQ-GIT-018: the binding in full or null, and the checkpoint count — read from the listing record and nothing else. */
  worktree: WorktreeBindingSchema.nullable(), checkpointCount: z.number().int().nonnegative(),
  /** Part U / REQ-SESSION-041: the parse detail when the session's stored state cannot be decoded (Open refused, Delete offered); null when readable. */
  unreadable: z.string().nullable(),
});
export type SessionListItemPayload = z.infer<typeof SessionListItemSchema>;

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

/** Part U / REQ-SESSION-059/060/182: one repaired session as the browser reports it, and the whole report. */
export const RepairedSessionSchema = z.object({ sessionId: z.string(), from: z.string(), to: z.literal('interrupted'), reason: z.string() });
export const RepairReportSchema = z.object({
  repaired: z.array(RepairedSessionSchema),
  /** A session asked for that was not stale, with why — live, terminal, unreadable, missing (REQ-SESSION-041/060: never an error). */
  skipped: z.array(z.object({ sessionId: z.string(), reason: z.string() })),
  /** REQ-SESSION-182: "nothing was stale" is said, never an empty answer. */
  nothingStale: z.boolean(),
});
export type RepairReportPayload = z.infer<typeof RepairReportSchema>;
/** Part U / REQ-SESSION-002/191: the per-session files that exist; null names one never written. */
export const SessionFilesSchema = z.object({ directory: z.string(), log: z.string().nullable(), summary: z.string().nullable(), artifacts: z.string().nullable() });
export type SessionFilesPayload = z.infer<typeof SessionFilesSchema>;

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
  /** ADR-0037 Tier A: the configuration read, the desktop save, the scoped per-field write — each followed by the load again. */
  z.object({ kind: z.literal('config.read'), workspaceRoot: z.string() }),
  z.object({ kind: z.literal('config.save'), workspaceRoot: z.string(), save: DesktopSaveSchema }),
  z.object({ kind: z.literal('config.setField'), workspaceRoot: z.string(), scope: z.enum(CONFIG_SCOPES).optional(), patch: z.record(z.string(), z.unknown()) }),
  /** REQ-WORKSPACE-038 / REQ-PROVIDER-099: the minimal agents.yaml written only when none exists, then the load again. */
  z.object({ kind: z.literal('config.bootstrap'), workspaceRoot: z.string() }),
  /** ADR-0038 / REQ-MONITOR-168: the repository card's reads, made by the one helper the workspace service owns. */
  z.object({ kind: z.literal('repository.read'), workspaceRoot: z.string() }),
  /** ADR-0038 second execution (Part O): the Git view's reads (REQ-GIT-105), every one bounded at 15 s (REQ-GIT-102). */
  z.object({ kind: z.literal('git.view'), workspaceRoot: z.string() }),
  /**
   * REQ-GIT-005..012: create a linked worktree. A `session` target is placed under `<workspace>/.rotaris/<subpath>/<sessionId>`
   * (REQ-GIT-005) and takes REQ-GIT-008's refusal; a `path` target is the user's own location (REQ-GIT-115) and takes REQ-GIT-110's.
   */
  z.object({
    kind: z.literal('worktree.create'), workspaceRoot: z.string(), branch: z.string().min(1), collisionSafe: z.boolean(), baseRevision: z.string().optional(),
    target: z.discriminatedUnion('kind', [z.object({ kind: z.literal('path'), path: z.string().min(1) }), z.object({ kind: z.literal('session'), sessionId: z.string().min(1), subpath: z.string().optional() })]),
  }),
  /** REQ-GIT-111: remove the registration and the directory; `force` only from the second confirmation of REQ-GIT-117. */
  z.object({ kind: z.literal('worktree.remove'), workspaceRoot: z.string(), path: z.string().min(1), force: z.boolean() }),
  /** REQ-GIT-011: an attach candidate validated before any session exists (REQ-GIT-158). */
  z.object({ kind: z.literal('worktree.checkAttach'), workspaceRoot: z.string(), path: z.string().min(1) }),
  /**
   * ADR-0039 (Part P): the Git side of checkpoints, in the one process that spawns Git (ADR-0038 c.4). `treeRoot` is
   * the session's own tree (REQ-GIT-053); `workspaceRoot` names the service. A capture (REQ-GIT-034) creates the ref
   * or reports nothing to record; the refs listing feeds REQ-GIT-046's numbering; the preview and the restore are
   * REQ-GIT-052's two steps; the prune deletes named refs by compare-and-swap (REQ-GIT-041).
   */
  z.object({ kind: z.literal('checkpoint.capture'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), iteration: z.number().int().nonnegative(), childName: z.string(), checkpointKind: z.enum(CHECKPOINT_KINDS), includeUntracked: z.boolean(), message: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoint.refs'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoint.preview'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), commit: z.string(), candidates: z.array(z.object({ sequence: z.number().int(), commit: z.string() })), includeUntracked: z.boolean() }),
  z.object({ kind: z.literal('checkpoint.restore'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), commit: z.string(), entries: z.array(PreviewEntrySchema) }),
  z.object({ kind: z.literal('checkpoint.prune'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), refs: z.array(z.object({ ref: z.string(), commit: z.string() })) }),
  /** Part U / REQ-GIT-069: every ref under `refs/rotaris/checkpoints/<sid>/` in the tree, best-effort; a missing tree is a detail, never a failure. */
  z.object({ kind: z.literal('checkpoint.deleteNamespace'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1) }),
  // Part AK — ADR-0041: the requirements command family, relayed whole; the ACTOR is stamped by main at the boundary
  // the action arrived through (REQ-CONFIG-198) and is the one field a renderer never sends.
  z.object({ kind: z.literal('requirements.command'), workspaceRoot: z.string(), command: RequirementsCommandSchema, actor: ActorSchema }),
  // Part AJ
  /**
   * ADR-0040 (Part AJ): the four toolchain operations of REQ-TRACE-508..511 against the open workspace's root
   * (REQ-TRACE-512 — resolved by the service, never nominated by a user), and the cancel of REQ-TRACE-220/226.
   * The outcome is the seam's TypeScript value (`contracts/src/requirements.ts`), carried opaque here.
   */
  z.object({ kind: z.literal('traceability.operate'), workspaceRoot: z.string(), operation: z.enum(['check', 'regenerate', 'baselines', 'compare']), base: z.string().optional() }),
  z.object({ kind: z.literal('traceability.cancel'), workspaceRoot: z.string(), operation: z.enum(['check', 'regenerate', 'baselines', 'compare']) }),
  // Part AO
  /**
   * REQ-CHAT-160 (Part AO): read the three prompt roots, in their order, for the prompt-file slash commands. The service
   * reads the files and answers their bodies; the naming, the collision rule and REQ-CHAT-161's expansion are the
   * renderer's. The home and the user-global configuration directory are the service's own resolution of them.
   */
  z.object({ kind: z.literal('prompts.roots.read'), workspaceRoot: z.string() }),
  /** ADR-0061: workspace-scoped improvement rows are served by the one writable store owner. */
  z.object({ kind: z.literal('improvements.command'), workspaceRoot: z.string(), command: ImprovementCommandSchema }),
]);
export type WorkspaceServiceRequest = z.infer<typeof WorkspaceServiceRequestSchema>;

/**
 * Child → main: a child's narrow requests back to main (ADR-0002 consequence 7), correlated by `ask`. The
 * workspace service's five are forwarded to the run host — the restore's steps 1, 3, 4a and 10 (ADR-0058).
 * The run host's one is answered by main itself: `credentials.lease` (ADR-0030) — the bearers for the
 * sign-in providers a run's configuration names, resolved from the credential store main owns.
 */
export const ServiceAskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runHost.refuseRuns'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('runHost.renewLease'), workspaceId: z.string(), leaseMs: z.number().int().positive() }),
  z.object({ kind: z.literal('runHost.closeStore'), workspaceId: z.string() }),
  z.object({ kind: z.literal('runHost.release'), workspaceId: z.string() }),
  z.object({ kind: z.literal('runHost.reopen'), workspaceId: z.string(), storeFile: z.string() }),
  z.object({ kind: z.literal('credentials.lease'), providerIds: z.array(z.string()) }),
  /**
   * ADR-0039 / ADR-0002 c.4 (Part P): the run host reaches Git ONLY through the workspace service, and the two never
   * talk directly — so the run loop's capture at iteration close, the refs it numbers from (REQ-GIT-046) and the
   * retention prune (REQ-GIT-049) are asks main relays to the service of that workspace and answers back.
   */
  z.object({ kind: z.literal('checkpoint.capture'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), sequence: z.number().int().nonnegative(), iteration: z.number().int().nonnegative(), childName: z.string(), checkpointKind: z.enum(CHECKPOINT_KINDS), includeUntracked: z.boolean(), message: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoint.refs'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('checkpoint.prune'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1), refs: z.array(z.object({ ref: z.string(), commit: z.string() })) }),
  /** Part U / REQ-SESSION-166 step 2: the delete's ref cleanup, relayed like the other three (ADR-0002 c.4). */
  z.object({ kind: z.literal('checkpoint.deleteNamespace'), workspaceRoot: z.string(), treeRoot: z.string(), sessionId: z.string().min(1) }),
  /** REQ-LIBRARY-034: run host freezes bounded workspace history before publishing a job. */
  z.object({ kind: z.literal('improvements.command'), workspaceRoot: z.string(), command: ImprovementCommandSchema }),
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
  z.object({ kind: z.literal('session.attachment'), base64: z.string().min(1) }),
  z.object({ kind: z.literal('circuit_breaker.status'), enabled: z.boolean() }),
  z.object({ kind: z.literal('session.list'), sessions: z.array(SessionListItemSchema) }),
  z.object({ kind: z.literal('session.resumed'), sessionId: z.string() }),
  z.object({ kind: z.literal('config.snapshot'), snapshot: ConfigSnapshotSchema }),
  z.object({ kind: z.literal('session.continued'), sessionId: z.string(), resumed: z.boolean(), messageLimit: z.number().int().nullable() }),
  /** REQ-NOTIFY-070: the pair that failed and the fallback now pinned; the restart has begun. */
  z.object({ kind: z.literal('session.fallbackRestarted'), sessionId: z.string(), failed: z.object({ provider: z.string(), model: z.string(), key: z.string().nullable() }), fallback: z.object({ provider: z.string(), model: z.string(), key: z.string() }) }),
  /** REQ-ORCH-154: the cycle the answer settled, and whether a further segment launched (approve and revise) or not (cancel). */
  z.object({ kind: z.literal('session.planResolved'), sessionId: z.string(), cycle: z.number().int().positive(), relaunched: z.boolean() }),
  /** REQ-CHAT-165: a span older than `beforeIndex`, oldest first; `oldest` says the first recorded row is in it. */
  z.object({ kind: z.literal('session.page'), sessionId: z.string(), rows: z.array(TranscriptRowSchema), oldest: z.boolean() }),
  z.object({ kind: z.literal('ack') }),
  z.object({ kind: z.literal('control.result'), result: ControlResultSchema }),
  /** ADR-0013's predicate for a workspace: how many runs this instance is executing there. */
  z.object({ kind: z.literal('runs.count'), workspaceId: z.string(), count: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('workspace.backedUp'), destination: z.string(), bytes: z.number().int(), sessions: z.number().int(), takenAtUtc: z.string() }),
  z.object({ kind: z.literal('workspace.restore.assessment'), assessment: RestoreAssessmentSchema }),
  z.object({ kind: z.literal('workspace.restored'), report: RestoreReportSchema }),
  z.object({ kind: z.literal('repository.state'), state: RepositoryStateSchema }),
  z.object({ kind: z.literal('git.state'), state: GitViewStateSchema }),
  /** REQ-GIT-008: the tree exists at the path on the (possibly suffixed, REQ-GIT-010) branch; the base facts feed the binding. */
  z.object({ kind: z.literal('worktree.created'), path: z.string(), branch: z.string(), baseBranch: z.string(), baseRevision: z.string() }),
  z.object({ kind: z.literal('worktree.removed'), path: z.string() }),
  /** REQ-GIT-011: what an attach binding records — the attached tree's branch, the base checkout's branch and commit. */
  z.object({ kind: z.literal('worktree.attachable'), path: z.string(), branch: z.string(), baseBranch: z.string(), baseRevision: z.string() }),
  /** `needsForce` (REQ-GIT-111/117): Git refused a removal because the tree holds modified or untracked files. */
  z.object({ kind: z.literal('refused'), code: z.string(), headline: z.string(), detail: z.string().optional(), needsForce: z.boolean().optional() }),
  z.object({ kind: z.literal('hooks.summary'), summary: HooksSummarySchema }),
  z.object({ kind: z.literal('playbooks.catalogue'), catalogue: PlaybookCatalogueSchema }),
  z.object({ kind: z.literal('mcp.list'), listing: McpListingSchema }),
  z.object({ kind: z.literal('mcp.probe'), results: z.array(z.object({ name: z.string(), health: McpHealthSchema })) }),
  z.object({ kind: z.literal('mcp.secrets'), view: McpSecretsViewSchema }),
  /** REQ-SANDBOX-071: the four fields are the complete answer, and every surface presents this same text. */
  z.object({ kind: z.literal('confinement.status'), verdict: ConfinementVerdictSchema }),
  /** ADR-0035 (Part T): the setup's status after the action was applied. */
  z.object({ kind: z.literal('mcp.setup'), status: McpSetupStatusSchema }),
  /**
   * ADR-0030: the bearers leased to the run host for one run, with REQ-PROVIDER-067's priming report. This is the
   * one message in the product that carries a credential value; it travels main → utility process only and no
   * renderer schema (commands, channels) has a field for it (ADR-0030 c.2).
   */
  z.object({ kind: z.literal('credentials.leased'), bearers: z.record(z.string(), z.string()), report: z.object({ authenticated: z.array(z.string()), renewed: z.array(z.string()), unresolved: z.record(z.string(), z.string()) }) }),
  /** ADR-0039 (Part P): the workspace service's five answers and the run host's three. `invocations` and `elapsedMs` are what the proof measures. */
  z.object({ kind: z.literal('checkpoint.captured'), outcome: z.enum(['recorded', 'nothing-to-record', 'unavailable', 'failed']), ref: z.string().optional(), commit: z.string().optional(), files: z.array(z.string()).optional(), detail: z.string().optional(), invocations: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative() }),
  z.object({ kind: z.literal('checkpoint.refs'), ok: z.boolean(), entries: z.array(z.object({ sequence: z.number().int(), commit: z.string(), ref: z.string() })), detail: z.string().optional() }),
  z.object({ kind: z.literal('checkpoint.previewed'), treeState: z.enum(['ok', 'unmanaged', 'ref-gone', 'inspect-failed']), entries: z.array(PreviewEntrySchema), dirty: z.array(z.string()), blockedReason: z.string(), text: z.string(), invocations: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative() }),
  z.object({ kind: z.literal('checkpoint.restored'), ok: z.boolean(), touched: z.array(z.string()), detail: z.string().optional(), invocations: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative() }),
  z.object({ kind: z.literal('checkpoint.pruned'), deleted: z.number().int().nonnegative(), failed: z.array(z.object({ ref: z.string(), detail: z.string() })) }),
  z.object({ kind: z.literal('checkpoint.list'), listing: CheckpointListSchema }),
  /** The safety row is recorded (its trimmed refs for the prune), or the reason it could not be persisted. */
  z.object({ kind: z.literal('checkpoint.recorded'), sequence: z.number().int(), trimmed: z.array(z.object({ ref: z.string(), commit: z.string() })) }),
  /** Part U: the workspace service's namespace deletion and the run host's four answers. */
  z.object({ kind: z.literal('checkpoint.namespaceDeleted'), deleted: z.number().int().nonnegative(), detail: z.string().optional() }),
  z.object({ kind: z.literal('session.repaired'), report: RepairReportSchema }),
  z.object({
    kind: z.literal('session.deleted'), sessionId: z.string(),
    /** False for a missing session — the no-op success of REQ-SESSION-166. */
    existed: z.boolean(),
    /** REQ-GIT-069: how many refs went, and the leftover location when any could not (logged as a warning, never a failure). */
    refsDeleted: z.number().int().nonnegative(), refsLeft: z.string().nullable(),
    /** REQ-SESSION-002: whether the per-session directory was removed (false when there was none, or when the removal failed and was ignored). */
    filesRemoved: z.boolean(), unreadable: z.boolean(),
    elapsedMs: z.number().nonnegative(),
  }),
  z.object({ kind: z.literal('session.exported'), destination: z.string(), bytes: z.number().int().nonnegative(), documents: z.number().int().positive(), warnings: z.array(z.string()), elapsedMs: z.number().nonnegative() }),
  z.object({ kind: z.literal('session.files'), files: SessionFilesSchema }),
  z.object({ kind: z.literal('timeline.appended'), sessionId: z.string(), ordinal: z.number().int().nonnegative() }),
  /** Part X: both saved-prompt lists as stored, newest first (REQ-LIBRARY-138); `prompts.taken` also carries the text the caller asked for. */
  z.object({ kind: z.literal('prompts.state'), state: PromptStateSchema }),
  z.object({ kind: z.literal('prompts.taken'), text: z.string(), state: PromptStateSchema }),
  /** Part Y: the Artifacts tab's three answers (REQ-LIBRARY-108/133/134/136). */
  z.object({ kind: z.literal('artifacts.state'), state: ArtifactsStateSchema }),
  z.object({ kind: z.literal('artifacts.body'), id: z.string(), slug: z.string(), title: z.string(), kind_: z.string(), status: z.string(), producer: z.string(), persona: z.string(), edited: z.boolean(), body: z.string(), fallback: z.boolean() }),
  z.object({ kind: z.literal('artifacts.saved'), id: z.string(), editedAt: z.string() }),
  // Part AK — the requirements command's answer: the value the command names (a board, a detail, a reachability, a
  // transition result) and, after a write, the generation it moved to and the identifiers it touched, which main
  // publishes on channel 10 AFTER the reply (persist before publish, ADR-0041).
  z.object({ kind: z.literal('requirements.result'), value: z.unknown(), changed: z.object({ generation: z.number().int().nonnegative(), affected: z.array(z.string()).nullable() }).optional() }),
  z.object({ kind: z.literal('improvements.result'), value: z.unknown(), changed: z.boolean().optional() }),
  z.object({ kind: z.literal('improvement.analyzed'), artifact: ImprovementArtifactSchema }),
  /** PD-LIBRARY-002: the captured retrospective, handed straight to the coordinator main already owns. */
  z.object({ kind: z.literal('retrospective.captured'), job: ImprovementAnalysisJobSchema }),
  // Part AJ
  /** ADR-0040 (Part AJ): one operation's `Result<…, TraceabilityFailure>` as the seam types it; `cancelled` is REQ-TRACE-226's boolean. */
  z.object({ kind: z.literal('traceability.result'), operation: z.enum(['check', 'regenerate', 'baselines', 'compare']), root: z.string(), elapsedMs: z.number().nonnegative(), result: z.object({ ok: z.boolean(), value: z.unknown().optional(), error: z.unknown().optional() }) }),
  z.object({ kind: z.literal('traceability.cancelled'), cancelled: z.boolean() }),
  /** Part AL: the streams of one session, live and retained (REQ-SHELL-082/085); an emptied list when streaming is off. */
  z.object({ kind: z.literal('terminal.streams'), streams: z.array(TerminalStreamMetaSchema) }),
  // Part AO
  /** REQ-CHAT-160 (Part AO): the files of the three prompt roots and the ones skipped with their reasons. */
  z.object({ kind: z.literal('prompts.roots'), result: PromptsRootsResultSchema }),
  /**
   * ADR-0063: the skill catalog as a surface reads it. One shape for all four commands — a force-load and
   * a manual load answer with the state they produced, so no caller has to ask again to redraw, and
   * `loaded` names the skill for the toast (REQ-WORKSPACE-073/151).
   */
  z.object({ kind: z.literal('skills.state'), state: SkillsStateSchema, loaded: z.string().optional() }),
  /** REQ-CHAT-162: the listing row was committed — how many skills it lists and the transcript index it took. */
  z.object({ kind: z.literal('skills.listed'), count: z.number().int().nonnegative(), index: z.number().int().nonnegative() }),
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
  /** REQ-ORCH-137: emitted after run.result, already detached from the terminal path. */
  z.object({ kind: z.literal('improvement.job'), job: ImprovementAnalysisJobSchema }),
  /** REQ-ORCH-085: the host told the run paused at the message limit, with the count and the limit in force. */
  z.object({ kind: z.literal('run.paused'), sessionId: z.string(), count: z.number().int(), limit: z.number().int().nullable(), tokens: z.object({ input: z.number().int(), output: z.number().int() }) }),
  /** ADR-0019: the gate posts a present-request; main owns the per-window dialog queue and nothing else. */
  z.object({ kind: z.literal('approval.present'), payload: ApprovalPayloadSchema }),
  /** A request answered or cancelled elsewhere closes its open dialog without asking again (REQ-TOOLS-063). */
  z.object({ kind: z.literal('approval.close'), requestId: z.string() }),
  /** ADR-0019's liveness poll, on the channel that carries registration. */
  z.object({ kind: z.literal('presenter.poll'), seq: z.number().int().nonnegative() }),
  /** ADR-0015 / REQ-HOOKS-054/086: the run's notices for the host's channel (ADR-0049 owns the one current notice in main). */
  /**
   * Part V: the persistent notice's fields as REQ-NOTIFY-023 lists them — `sessionId` empty means the focused run
   * (REQ-NOTIFY-028); `persistent` decides the dismiss control (REQ-NOTIFY-040). The `ttlMs` this event carried since Part S
   * (REQ-MCP-044's 8 s auto-dismiss on the one slot) is gone: REQ-NOTIFY-040 says no notice leaves on a timer, so that
   * warning now rides `acknowledgement.publish` below. The disagreement this part raised — REQ-MCP-044's 8 s against
   * REQ-NOTIFY-011's single lifetime — was ruled on 2026-09-06 as ESC-33: REQ-MCP-044 was amended to cite the
   * lifetime rather than restate it, so what the build already did is now what the corpus says.
   */
  z.object({ kind: z.literal('notice.publish'), severity: NoticeSeveritySchema, title: z.string(), message: z.string(), detail: z.string(), action: z.string().optional(), key: z.string().optional(), sessionId: z.string(), persistent: z.boolean() }),
  /** Part V / REQ-NOTIFY-003: a transient the run host raises on its own — main pushes it to the main window's stack. */
  z.object({ kind: z.literal('acknowledgement.publish'), kindOf: AcknowledgementKindSchema, title: z.string().min(1), body: z.string().optional() }),
  /**
   * Part AL / ADR-0021: one terminal frame, numbered per stream in the run host. Main does NOT relay it unchanged the
   * way it relays channels 1 and 2: REQ-MONITOR-306 bounds delivery per window, and main honours the bound by merging a
   * stream's frames into a larger step (REQ-SHELL-103) — never by dropping one (`main/terminal.ts`).
   */
  z.object({ kind: z.literal('publish.terminal'), payload: TerminalFrameSchema }),
  /**
   * Part AS / ADR-0064: the code-intelligence setup's status, pushed on every step and at the end.
   * ADR-0064's task runner follows the setup through this rather than on a cadence — the run host and
   * main can talk, and SR-3 withdrew polling exactly where they can. REQ-WORKSPACE-109 is what needs
   * it: a step must be visible "at the moment that step finishes", which a poll can only approximate.
   */
  z.object({ kind: z.literal('mcp.setupStatus'), status: McpSetupStatusSchema }),
]);
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;
export const ProcessEventEnvelopeSchema = z.object({ v, event: ProcessEventSchema });
export type ProcessEventEnvelope = z.infer<typeof ProcessEventEnvelopeSchema>;

/** Main → child, answering a ServiceAsk. */
export const ServiceAnswerEnvelopeSchema = z.object({ v, ask: id, reply: ProcessReplySchema });
export type ServiceAnswerEnvelope = z.infer<typeof ServiceAnswerEnvelopeSchema>;

export const ProcessMessageSchema = z.union([ProcessReplyEnvelopeSchema, ProcessEventEnvelopeSchema, ServiceAskEnvelopeSchema]);
export type ProcessMessage = z.infer<typeof ProcessMessageSchema>;
