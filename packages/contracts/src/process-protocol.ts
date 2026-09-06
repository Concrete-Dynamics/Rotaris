import { CONFIG_SCOPES, ConfigSnapshotSchema, DesktopSaveSchema } from './config.js';
import { z } from 'zod';
import { HOOK_AGENT_IDS, HooksSummarySchema } from './hooks.js';
import { McpHealthSchema, McpListingSchema, McpSecretsViewSchema } from './mcp.js';
import { PlaybookCatalogueSchema } from './intent.js';
import { CONTRACT_SCHEMA_VERSION } from './version.js';
import { SessionSnapshotSchema, TranscriptIncrementSchema, TranscriptRowSchema } from './channels.js';
import { ControlRequestSchema, ControlResultSchema } from './control.js';
import { ApprovalPayloadSchema } from './tools.js';
import { GitViewStateSchema, RepositoryStateSchema, WorktreeBindingSchema } from './repository.js';
import { SANDBOX_MODE_NAMES } from './config.js';
import { CHECKPOINT_KINDS, CheckpointListSchema, PreviewEntrySchema } from './checkpoints.js';

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
  /**
   * REQ-CHAT-011 / REQ-SESSION-089: create the session, take its lock, open its history, record row 0.
   * REQ-GIT-022 (Part O): an isolated or attached session arrives with its id minted in main, the binding the
   * workspace service already made, and the effective root the run works in; the session row stays anchored to
   * the base workspace (REQ-GIT-019). `sandboxMode` is REQ-SHELL-125's choice, recorded on the row (ADR-0022: not honoured here).
   */
  z.object({ kind: z.literal('session.start'), workspaceId: z.string(), prompt: z.string().min(1), sessionId: z.string().min(1).optional(), effectiveRoot: z.string().optional(), worktree: WorktreeBindingSchema.optional(), sandboxMode: z.enum(SANDBOX_MODE_NAMES).optional() }),
  z.object({ kind: z.literal('circuit_breaker.status'), workspaceId: z.string() }),
  /** ADR-0037 Tier B: the settings store's current values, handed to the run host ahead of the next run start. */
  z.object({ kind: z.literal('config.liveState'), state: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal('session.list'), workspaceId: z.string() }),
  z.object({ kind: z.literal('session.resume'), workspaceId: z.string(), sessionId: z.string().min(1) }),
  /** REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause (continue, double, cancel) or continue a manually paused session. */
  z.object({ kind: z.literal('session.continue'), sessionId: z.string().min(1), action: z.enum(['continue', 'double', 'cancel']) }),
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
  /** ADR-0015: the Hooks tab's reads and writes; the run host holds the hooks package and the store (REQ-HOOKS-136). */
  z.object({ kind: z.literal('hooks.summary'), workspaceId: z.string(), sessionId: z.string().optional() }),
  z.object({ kind: z.literal('hooks.decide'), workspaceId: z.string(), trusted: z.boolean() }),
  z.object({ kind: z.literal('hooks.clearDecision'), workspaceId: z.string() }),
  z.object({ kind: z.literal('hooks.setToggle'), agent: z.enum(HOOK_AGENT_IDS), hookId: z.string().nullable(), on: z.boolean() }),
  z.object({ kind: z.literal('playbooks.catalogue') }),
  z.object({ kind: z.literal('approval.shown'), requestId: z.string().min(1), ok: z.boolean(), error: z.string().optional() }),
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
  z.object({ kind: z.literal('shutdown'), deadlineMs: z.number().int().positive() }),
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
  z.object({ kind: z.literal('circuit_breaker.status'), enabled: z.boolean() }),
  z.object({ kind: z.literal('session.list'), sessions: z.array(SessionListItemSchema) }),
  z.object({ kind: z.literal('session.resumed'), sessionId: z.string(), settledChildren: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('config.snapshot'), snapshot: ConfigSnapshotSchema }),
  z.object({ kind: z.literal('session.continued'), sessionId: z.string(), resumed: z.boolean(), messageLimit: z.number().int().nullable() }),
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
  /** REQ-ORCH-085: the host told the run paused at the message limit, with the count and the limit in force. */
  z.object({ kind: z.literal('run.paused'), sessionId: z.string(), count: z.number().int(), limit: z.number().int().nullable(), tokens: z.object({ input: z.number().int(), output: z.number().int() }) }),
  /** ADR-0019: the gate posts a present-request; main owns the per-window dialog queue and nothing else. */
  z.object({ kind: z.literal('approval.present'), payload: ApprovalPayloadSchema }),
  /** A request answered or cancelled elsewhere closes its open dialog without asking again (REQ-TOOLS-063). */
  z.object({ kind: z.literal('approval.close'), requestId: z.string() }),
  /** ADR-0019's liveness poll, on the channel that carries registration. */
  z.object({ kind: z.literal('presenter.poll'), seq: z.number().int().nonnegative() }),
  /** ADR-0015 / REQ-HOOKS-054/086: the run's notices for the host's channel (ADR-0049 owns the one current notice in main). */
  z.object({ kind: z.literal('notice.publish'), severity: z.enum(['info', 'warning', 'error']), headline: z.string(), detail: z.string(), action: z.string().optional(), key: z.string().optional(), /** REQ-MCP-044: an auto-dismiss after this many milliseconds (main clears the slot if the notice is still current). */ ttlMs: z.number().int().positive().optional() }),
]);
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;
export const ProcessEventEnvelopeSchema = z.object({ v, event: ProcessEventSchema });
export type ProcessEventEnvelope = z.infer<typeof ProcessEventEnvelopeSchema>;

/** Main → child, answering a ServiceAsk. */
export const ServiceAnswerEnvelopeSchema = z.object({ v, ask: id, reply: ProcessReplySchema });
export type ServiceAnswerEnvelope = z.infer<typeof ServiceAnswerEnvelopeSchema>;

export const ProcessMessageSchema = z.union([ProcessReplyEnvelopeSchema, ProcessEventEnvelopeSchema, ServiceAskEnvelopeSchema]);
export type ProcessMessage = z.infer<typeof ProcessMessageSchema>;
