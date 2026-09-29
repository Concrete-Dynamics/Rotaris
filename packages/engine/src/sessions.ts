import { asSessionId, err, formatAmount, millis, ok, toIsoUtc, type Clocks, type MachineId, type Millis, type Result, type SessionId } from '@rotaris/kernel';
import { APPROVAL_OPTIONS, ApprovalPayloadSchema, CHECKPOINTS_NO_TREE, COST_QUALIFIERS, localCheckpointLabel, resolvePreset, WorktreeBindingSchema, type ApprovalOption, type CheckpointKind, type CheckpointListPayload, type ControlRefusal, type ControlRequest, type ControlResult, type CostQualifier, type ImageAttachmentInput, type PermissionPreset, type QuestionAnswers, type RunType, type SessionLiveness, type SessionRecord, type TranscriptRow, type WorktreeBinding } from '@rotaris/contracts';
import { existsSync, rmSync } from 'node:fs';
import { RELEASE_PAGE_SIZE, type CheckpointRow, type SessionRow, type StoreDal } from '@rotaris/store';
import type { AgentBackend, ChatMessage, ContentPart } from '@rotaris/model';
import { conversationOf } from './run/record.js';
import { ProjectionOwner, type Publisher } from './projection-owner.js';
import { SequenceCounters } from './sequence.js';
import { claimLockReaping, SessionWriter, toTranscriptRow, type CheckpointRecordInput, type Committed, type RestoreRecordInput } from './session-writer.js';
import type { CheckpointPort, CheckpointPortContext } from './checkpoint-port.js';
import { EventBus } from './run/event-bus.js';
import { parseTokenSamples, Run, settleClosedIterations, type AgentTerminals, type ModelLookup, type PermissionPosture, type RunConfig, type RunResult } from './run/run.js';
import { answerOpenCalls, iterationAgents, recordCrash } from './run/crash.js';
import { resumeNoticeOf } from './run/resume.js';
import { offersHeldIn, openOfferIds, openOffersText } from './run/offers.js';
import { cut } from './run/cut.js';
// PD-ORCH-004 revision 4: the offers list lives beside the run, which tells a later iteration's root; kept public here.
export { offersToldIn, openOffersText } from './run/offers.js';
import { planSection } from './run/plan-text.js';
export { planRequestSection, planSection } from './run/plan-text.js';
import { ResilienceMemory, type CatalogueEntry, type ModelChoice } from './run/resilience.js';
import type { ResolvedTrigger } from './run/compression.js';
import { SessionLog, type LogLevel } from './session-log.js';
import { UserPresence } from './run/presence.js';
import type { ToolPort } from './run/turn.js';
import { settleStaleChildren } from './children/orchestration.js';
import type { DelegationOps } from './children/delegation.js';
import { DEFAULT_BUDGET, storeChildReport, userCancellation, type Budget } from './children/ledger.js';
import { DEFAULT_CONTEXT_CAPACITY, isInterruption, isReadyArtifactStatus, isTerminalChildState, presentationChildState, reconciledState, type AgentRecord, type ChildState, type EntryRoot, type EntryToolsPayload, type SessionArtifactLink } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { SummaryWriter } from './run/summary.js';
import { isActiveStatus } from './run/stop-conditions.js';
import type { HookPort, HookPortContext, RunNotice, ToolHookBridge } from './hooks-port.js';
import { ArtifactStore } from './artifacts/store.js';
import { toArtifactRecord } from './artifacts/record.js';
import { persistAttachments, projectAttachments, readAttachmentBody, validateAttachmentInputs } from './attachments.js';
import { artifactOps, type ArtifactOps } from './artifacts/port.js';
import type { Preflight, PreflightContext } from './preflight.js';
import { IntentResultSchema, type IntentCategory, type IntentGrant, type IntentStatus } from '@rotaris/contracts';
import type { PlanDecision, PlanGatePayload, ResumablePayload } from '@rotaris/contracts';
import { SupervisorRegistry, type LoopClassifier, type SupervisorConfig } from './run/supervisor.js';
import { meteredBackend, type CountUsage } from './run/metered.js';
import { Todo, type TodoDocument } from './run/todo.js';
import type { PersonaResolver } from './children/personas.js';
import type { AgentActivity } from './children/activity.js';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
import { decodeStoredTodo, editAgentTodo, encodeStoredTodo, isAgentTodoDocument, projectSessionTodos, type AgentTodoDocument } from './todo-view.js';
import { randomUUID } from 'node:crypto';

/**
 * ADR-0013 — the run host's registry: `Map<sessionId, …>`, the COMPLETE set
 * of live sessions in the product. For each: the writer that holds its lock,
 * the projection owner the writer feeds, and the run (if one is executing).
 * Focus is a shell concept; nothing here knows which window is looking.
 *
 * A prompt with no session starts one and runs it (REQ-CHAT-011,
 * REQ-SESSION-080/084/089). A prompt while a run is active is refused
 * (REQ-CHAT-012, REQ-MONITOR-260). Controls are addressed by session id and
 * answer `false` rather than raise (REQ-MONITOR-007/011). Shutdown asks
 * every run to stop before waiting on any (REQ-MONITOR-255).
 */
export interface ModelSetup {
  readonly backend: AgentBackend;
  readonly config: RunConfig;
  /** REQ-CONFIG-065: the model that summarises child work, when the configuration names one; else the entry model. */
  readonly summariser?: { readonly model: ModelRef; readonly thinking: ThinkingLevel } | null;
  /**
   * Part AH (ADR-0060): the configuration's half of context compression — the compressing model (null means
   * the agent's own, REQ-MONITOR-080), the section's two figures and REQ-CONFIG-134's resolved trigger. The
   * backend, the timers and the credential resolver are the session's and are joined to it at run start.
   */
  readonly compression?: {
    readonly model: { readonly model: ModelRef; readonly thinking: ThinkingLevel } | null;
    readonly timeoutMs: number;
    readonly charsPerToken: number;
    readonly preserveRecentTurns: number;
    readonly triggerFor: (model: ModelRef) => ResolvedTrigger;
  } | undefined;
}

/** What the run-host root hands a session's tool port factory. */
export interface ToolPortContext {
  readonly sessionId: SessionId;
  /** The BASE workspace: the session record's anchor and where configuration is loaded from (REQ-GIT-019). */
  readonly workspaceRoot: string;
  /** REQ-GIT-019/022: where the work happens — the worktree path for an isolated session; absent means the base. */
  readonly effectiveRoot?: string | undefined;
  readonly writer: SessionWriter;
  readonly persona: string;
  readonly agentName: string;
  readonly requestedMode: PermissionPreset;
  /**
   * REQ-TOOLS-048/073: the session-level override a mid-session change recorded — the REQUESTED name, or null
   * when no change has been made in this run. The port selects between it, the persona's `permission_mode` pin
   * and `requestedMode` (which carries `runtime.permission_mode`); PD-TOOLS-002 applies the selection directly.
   */
  readonly modeOverride?: string | null | undefined;
  readonly attended: () => boolean;
  readonly warn: (message: string) => void;
  /** REQ-TOOLS-065's abort hook: stops this run. */
  readonly abortRun: () => void;
  /** Part B: the agent's delegation identity — its operations, its own id as a parent, and its depth. */
  readonly delegation?: DelegationOps | undefined;
  readonly parentId?: string | undefined;
  readonly depth?: number | undefined;
  /** ADR-0015: the session's tool hooks for the gate's two slots; absent means none. */
  readonly hooks?: ToolHookBridge | undefined;
  /** REQ-ORCH-016/018: the entry role's grant for this run, decided by the pre-flight; other roles ignore it. */
  readonly grant?: IntentGrant | undefined;
  readonly intent?: IntentCategory | undefined;
  /**
   * Part Y (REQ-LIBRARY-099/100/101): the artifact operations bound to THIS agent — a publish records its
   * canonical instance name and a read records it as a consumer. Absent means no artifact store, and the
   * registry then removes the three tools with `artifact_store_absent` (REQ-TOOLS-004).
   */
  readonly artifacts?: ArtifactOps | undefined;
  /** REQ-CHAT-088/090: the agent-owned todo for this exact conversation and its write-through. */
  readonly readTodo?: (() => AgentTodoDocument | null) | undefined;
  readonly writeTodo?: ((document: AgentTodoDocument) => boolean) | undefined;
  /**
   * REQ-ORCH-153 (ADR-0062): whether the run this port serves is held at the plan gate. The ONE seam the hold
   * travels through to the tool surface — the port narrows its declared set by it, and the gate reads it again at
   * each dispatch. A live read through the run, on the same late-binding terms as `readTodo` above, so a port
   * built while the gate held stops withholding the moment the run says the hold is over.
   */
  readonly planGateHeld?: (() => boolean) | undefined;
  /**
   * PD-TOOLS-006: the live write-scope claim, if any, that refuses THIS agent a `write_file` or `haet_edit` write to
   * a workspace-relative POSIX path. Bound to the agent's own task id, because the gate knows a caller only by its
   * canonical name; a live read through the run, on the terms of `planGateHeld` above.
   */
  readonly writeClaimFor?: ((rel: string) => WriteClaimHolder | null) | undefined;
  /**
   * PD-TOOLS-005: the run's away state — ONE holder per run, the same object on every agent's context, delegated
   * children included. The gate reads it before it would prompt and marks it when a wait ends by timeout; the
   * session's control arms clear it on the user's next input. Absent means no run holds one (a caller outside a run).
   */
  readonly presence?: UserPresence | undefined;
}

/** PD-TOOLS-006: what a write-scope refusal names — the holding child, its persona and the pattern that matched. */
export interface WriteClaimHolder {
  readonly canonicalName: string;
  readonly persona: string;
  readonly pattern: string;
}

/** Decision 1 of the plan: runtime keys the configuration loader (ADR-0036) will own; read from the environment until then. */
export interface RuntimePosture {
  readonly permissionMode: string;
  readonly allowUnsandboxedAutonomous: boolean;
  /** ADR-0022: on Windows there is no backend, so this is `{ available: false, backend: '' }`. */
  readonly sandbox: { readonly requested: boolean; readonly available: boolean; readonly backend: string };
  readonly sessionLogLevel: LogLevel;
  /** REQ-ORCH-050 / REQ-MONITOR-021: a per-model cap the user set; null = uncapped. */
  readonly modelConcurrencyCap?: number | null;
  /** REQ-CONFIG-094: the cap per `models:` entry, by key; wins over the flat cap when present. */
  readonly modelCapFor?: ((modelKey: string) => number | null) | undefined;
  /** REQ-ORCH-046's three limits; REQ-ORCH-024's `normal` cell clamps them until playbooks are built. */
  readonly childBudget?: Budget;
  readonly drainTimeoutMs?: number;
  /** REQ-ORCH-084: `runtime.message_limit`; null = disabled. */
  readonly messageLimit?: number | null;
  /** REQ-ORCH-088 / REQ-CONFIG-114: `runtime.child_timeout` in milliseconds; absent means the engine's 1,200 s. */
  readonly childTimeoutMs?: number | undefined;
  /** PD-ORCH-004 / REQ-CONFIG-113: `runtime.child_stall_timeout` in milliseconds; absent means the engine's 90 s. */
  readonly childStallTimeoutMs?: number | undefined;
  /** REQ-ORCH-134 / PD-ORCH-005 clause 2: `runtime.graceful_pause_tool_deadline` in milliseconds; absent means 30 s. */
  readonly pauseToolDeadlineMs?: number | undefined;
  /** REQ-ORCH-152 / REQ-CONFIG-476: `runtime.run_start_mode`; absent means `auto` and no gate applies. */
  readonly runStartMode?: 'auto' | 'plan' | undefined;
}

export interface SessionsDeps {
  readonly clocks: Clocks;
  readonly publisher: Publisher;
  readonly pid: number;
  readonly host: MachineId;
  readonly retentionCap: number;
  readonly warn: (message: string) => void;
  /**
   * The application log at `info` (PD-MONITOR-002) — the host's line, which its default threshold keeps; never the
   * per-session log of REQ-SESSION-142. What `HookPortContext.log` and `HookSinks.log` carry ("the application log
   * only": a hook fault that reduces to a log entry, REQ-HOOKS-079/128/129, and the account of a hook set that
   * could not be resolved) is written through this. Absent means those lines go nowhere.
   */
  readonly log?: ((message: string) => void) | undefined;
  readonly mintSessionId: () => string;
  /** Decision 1 of the run-loop plan: null means no model is configured and a run is refused before it starts. */
  readonly model: ModelSetup | null;
  /** Where a session's files live (summary.md), from the store's layout. */
  readonly sessionFilesDir: (dal: StoreDal, sessionId: SessionId) => string;
  /** REQ-SESSION-186: the terminal result, presented once. Reached through the bus, in process (REQ-EVENTS-178). */
  readonly onRunResult?: (sessionId: SessionId, result: RunResult) => void;
  /** REQ-ORCH-085: the run paused at the message limit — the host is told the count and the limit. */
  readonly onRunPaused?: ((sessionId: SessionId, info: { count: number; limit: number | null; tokens: { input: number; output: number } }) => void) | undefined;
  /**
   * REQ-ORCH-153 (ADR-0062): "every tool the public tool-name registry declares as writing workspace files or
   * running commands", as a predicate. Injected because the declarations live in `@rotaris/agent-tools`, which
   * the engine does not import (ADR-0002); absent means the plan gate refuses no delegation on a role's tools.
   */
  readonly planWithholds?: ((tool: string) => boolean) | undefined;
  /** The tool surface per session; absent means the model is offered no tool. */
  readonly tools?: (ctx: ToolPortContext) => ToolPort;
  /** REQ-TOOLS-053/069: whether a prompt can be put in front of a person, at the moment asked. */
  readonly attended?: () => boolean;
  readonly runtime?: RuntimePosture;
  /** REQ-SESSION-142: an appender for the session's log file; absent means no file. */
  readonly sessionLogAppender?: (dal: StoreDal, sessionId: SessionId) => (line: string) => void;
  /** REQ-TOOLS-184: background terminal sessions in the running state, for the strip. */
  readonly backgroundSessions?: () => number;
  /**
   * PD-ORCH-005 clause 10: the background terminal sessions a session's agents started, as the process that holds them
   * sees them, and ending them. Absent means no terminal exists, and a rest has none to leave running or end.
   */
  readonly terminals?: ((sessionId: SessionId) => AgentTerminals) | undefined;
  /**
   * REQ-MONITOR-049: a model's own maximum input tokens by key; absent or null falls back to REQ-MONITOR-080's
   * default. Part R recorded this as unfilled because the run host's setup did not carry `max_input_tokens`;
   * Part AH fills it, because REQ-MONITOR-078's capacity ladder needs the same figure (ADR-0060 decision 8).
   */
  readonly contextLimitFor?: ((modelKey: string) => number | null) | undefined;
  /** ADR-0015: the session's hook port, built by the root at run start (REQ-HOOKS-131); absent means no hooks. */
  readonly hooks?: (ctx: HookPortContext) => HookPort | null;
  /** The host's notice channel. */
  readonly notice?: (n: RunNotice) => void;
  // Part AO
  /**
   * Part AO — the host's TRANSIENT channel (REQ-NOTIFY-003's other half), for what the two control arms of this part
   * report on completion: the count REQ-CHAT-080 toasts, REQ-CHAT-084's "Transcript cleared." and its busy toast. The
   * process that knows the figures reports them; the surface toasts what it knows locally (its own start message,
   * the empty-transcript case) and nothing it would have to guess.
   */
  readonly acknowledge?: ((kind: 'info' | 'ok' | 'warn' | 'fail', title: string, body?: string) => void) | undefined;
  /**
   * Part AO — a PERSISTENT notice with a copyable detail block (REQ-NOTIFY-037/038), for the two failure notices of
   * this part: "Context compression incomplete" listing each failing agent (REQ-MONITOR-094) and "Could not clear
   * transcript" (REQ-CHAT-084). Beside `notice` rather than through it because the run notice's `detail` is the
   * host's MESSAGE body (Part V's mapping) and REQ-MONITOR-094's list must be the selectable detail area.
   */
  readonly report?: ((n: { readonly severity: 'warning' | 'error'; readonly title: string; readonly message: string; readonly detail: string; readonly sessionId: string }) => void) | undefined;
  /** ADR-0039: the session's checkpoint port, built by the root at run start; absent or null means no capture (REQ-GIT-044). */
  readonly checkpoints?: (ctx: CheckpointPortContext) => CheckpointPort | null;
  /** REQ-ORCH-005: the pre-flight, built by the root; absent means the fallback intent and no playbook. */
  readonly preflight?: (ctx: PreflightContext) => Promise<Preflight>;
  /** REQ-ORCH-107: absence means supervision was intentionally disabled and constructs nothing. */
  readonly supervisor?: ((workspaceRoot: string, sessionId: SessionId, countUsage: CountUsage) => { readonly config: SupervisorConfig; readonly classifier: LoopClassifier } | null) | undefined;
  readonly isProcessAlive?: ((pid: number) => boolean) | undefined;
  /**
   * ADR-0036/0037: the run's configuration, resolved at run start from the files with the live state on top
   * (Tier B). Present, it supplies the model and the runtime for that run; absent, `model` and `runtime` stand.
   */
  readonly configure?: ((workspaceRoot: string, ctx: { readonly attended: boolean; readonly sessionId: SessionId; readonly executionRoot: string; readonly entryPersona?: string | undefined }) => Result<RunSetup, { readonly reason: string }>) | undefined;
}

/** What a run starts with once configuration resolves it. */
export interface RunSetup {
  /** Secret-free launch facts captured by the host (REQ-SESSION-138). */
  readonly configurationSnapshot?: Readonly<Record<string, unknown>>;
  readonly model: ModelSetup;
  readonly runtime: RuntimePosture;
  readonly retentionCap?: number | undefined;
  readonly personas?: PersonaResolver | undefined;
  /** REQ-MONITOR-142 / REQ-ORCH-091 (d): a `models:` key resolved for a mid-run switch, or the reason it cannot be applied. */
  readonly models?: ((key: string) => ModelLookup) | undefined;
  /** Warnings the load produced (REQ-CONFIG-233's warn-and-continue and the referential list while attended). */
  readonly warnings?: readonly string[] | undefined;
  /** Part Q: the catalogue the same-tier rule reads (REQ-NOTIFY-082) and the run-level `fallback_model` slot (REQ-CONFIG-065). */
  readonly resilience?: { readonly catalogue: readonly CatalogueEntry[]; readonly fallbackModel: ModelChoice | null } | undefined;
  /** REQ-MONITOR-049 / REQ-CONFIG-085 (Part AH): each configured model's own maximum input tokens, by `models:` key. */
  readonly contextLimits?: Readonly<Record<string, number>> | undefined;
  /**
   * REQ-WORKSPACE-060 (ADR-0063): the always-active context units every agent of this session receives, in
   * that requirement's order — workspace context, the skill catalog, the force-loaded skill bodies, persona
   * memory. A **getter**: it is called at each agent construction, so a skill loaded mid-session reaches the
   * next agent built and never retracts one already running (REQ-CONFIG-166).
   *
   * Two of the four are not built in this release (workspace context, REQ-WORKSPACE-041..050, and persona
   * memory), so the list a host supplies today holds the middle two and the ordering is the seam where the
   * others will sit.
   */
  readonly contextUnits?: (() => readonly string[]) | undefined;
}

/** PD-TOOLS-002: the requested mode always applies — no downgrade. Attendedness, confinement and the opt-in are recorded, never resolved through. */
export function postureAtStart(runtime: RuntimePosture | undefined, attended: boolean): PermissionPosture {
  void attended;
  const requested = resolvePreset(runtime?.permissionMode ?? '').preset;
  const sandboxed = (runtime?.sandbox.requested ?? false) && (runtime?.sandbox.available ?? false);
  return {
    requested, effective: requested, downgraded: false, reason: '',
    sandboxed, sandboxBackend: sandboxed ? runtime?.sandbox.backend ?? '' : '',
  };
}

interface Live {
  writer: SessionWriter;
  owner: ProjectionOwner;
  readonly dal: StoreDal;
  run: Run | null;
  running: Promise<RunResult> | null;
  tools: ToolPort | null;
  log: SessionLog | null;
  commitTarget?: { owner?: ProjectionOwner; run?: Run } | undefined;
  /** Part Q: the session-wide memory (REQ-ORCH-091 a/d) — fresh for a new session, rehydrated from the timeline for a loaded one. */
  memory: ResilienceMemory | null;
  /** Part Y (REQ-ORCH-149): the session's artifact store, one per live session, shared across iterations and continuations. */
  artifacts: ArtifactStore | null;
  /**
   * REQ-TOOLS-073's second half / REQ-TOOLS-075: the session-level mode override — the REQUESTED name a
   * mid-session change recorded, read at EVERY agent construction (PD-TOOLS-002: applied directly, with no
   * re-resolution). One holder per RUN: `start` and `prompt` each install a fresh one, which is what discards
   * the override at run end so a resumed session does not inherit a previous run's switch.
   */
  modeOverride: { value: string | null };
  /** PD-TOOLS-005: the run's away state, on the same one-holder-per-run terms as `modeOverride`; the control arms clear it. */
  presence: UserPresence;
}

export interface SessionListItem {
  readonly sessionId: string;
  readonly label: string;
  readonly status: string;
  readonly branch: string;
  readonly relativeTime: string;
  readonly detail: string;
  readonly awaitingInput: boolean;
  readonly stale: boolean;
  // REQ-MONITOR-171: what the Overview's sessions card shows per row.
  readonly tokens: number;
  readonly durationLabel: string;
  readonly busy: boolean;
  /** REQ-MONITOR-172: null when no requirement is attached, and then no tag at all. */
  readonly requirementId: string | null;
  /** REQ-GIT-018: the binding in full or null, and the checkpoint count — a count over the session's rows, no Git (ADR-0039). */
  readonly worktree: WorktreeBinding | null;
  readonly checkpointCount: number;
  /** Part U / REQ-SESSION-041: the parse detail of a session whose stored state cannot be decoded; null when it can. */
  readonly unreadable: string | null;
}

/** Part U / REQ-SESSION-059/060: one repair as the browser reports it. */
export interface RepairedSession {
  readonly sessionId: string;
  readonly from: string;
  readonly to: 'interrupted';
  readonly reason: string;
}
export interface RepairReport {
  readonly repaired: RepairedSession[];
  readonly skipped: { sessionId: string; reason: string }[];
  readonly nothingStale: boolean;
}

/** Part U / REQ-SESSION-166: what the run host learns before it asks for the refs. */
export type DeletePreparation =
  | { readonly kind: 'missing' }
  | { readonly kind: 'live'; readonly reason: string }
  | { readonly kind: 'ready'; readonly treeRoot: string; readonly unreadable: string | null; readonly checkpoints: number };

/** REQ-GIT-092's two sentences, for the delete (the same liveness the restore uses; REQ-GIT-151 keeps them distinct). */
export const DELETE_LIVE_REFUSAL = "This session is still running. Deleting it would destroy the run's own record, so wait for it to finish or stop it first.";
export const DELETE_LIVENESS_UNKNOWN_REFUSAL = 'Rotaris could not confirm whether this session is still running, and will not delete a session that may be live. Try again in a moment.';

/** REQ-GIT-016 as the card sees it: the label pre-formatted here in local time (REQ-GIT-090), the file COUNT, the kind. */
export function toCheckpointPayload(c: CheckpointRow): CheckpointListPayload['rows'][number] {
  let files = 0;
  try { const v = JSON.parse(c.files) as unknown; files = Array.isArray(v) ? v.length : 0; } catch { files = 0; }
  const kind: CheckpointKind = c.kind === 'pre_restore' || c.kind === 'manual' ? c.kind : 'iteration';
  return { sequence: c.sequence, ref: c.ref, commit: c.commit_id, createdAt: c.created_at, createdLabel: localCheckpointLabel(c.created_at), iteration: c.iteration, childName: c.child_name, files, kind };
}

/** REQ-GIT-017: a missing or unreadable binding loads as "no worktree" — an absence, nothing invented. */
export function parseBinding(json: string | null): WorktreeBinding | null {
  if (json === null) return null;
  try { const r = WorktreeBindingSchema.safeParse(JSON.parse(json)); return r.success ? r.data : null; } catch { return null; }
}

/**
 * OQ-42, and OQ-103's "the same state the same way": why the workspace store refuses to record for this session — the
 * store's own failure or the writer's — or null when it records. Every entry point that would write (the continue by
 * message, the Continue action and the decline, the plan decision, the at-rest cancel) and the projection that states
 * what a continue would resume ask this one question.
 */
function storeFailureOf(dal: StoreDal, writer: SessionWriter): string | null {
  return SessionWriter.storeFailure(dal) ?? writer.failed ?? null;
}

/** REQ-GIT-019/022: the run's effective root is the worktree while the record stays anchored to the base. */
function effectiveRootOf(row: SessionRow): { readonly root: string; readonly binding: WorktreeBinding | null } {
  const binding = parseBinding(row.worktree);
  return { root: binding?.worktree_path ?? row.workspace_root, binding };
}

/** A bound session whose tree is gone cannot be continued in it; the refusal states which path (REQ-GIT-157: after-acceptance, nothing changed). */
/** Where a continue leaves the release of a lock it took, for its public entry to call when no run was launched (ADR-0005). */
interface HoldSlot { release?: () => void }

/**
 * REQ-SESSION-048's refusal for a session whose lock another process holds, as a load (`Sessions.resume`) and a continue
 * (`Sessions.holdForContinue`) state it: a holder on this machine is named by its pid, one on another machine by the
 * machine and when it took the lock, with what this instance cannot establish.
 */
function lockHeldRefusal(sessionId: SessionId, thisHost: MachineId, holder: { readonly pid: number; readonly host: string; readonly acquiredAt: string }): { readonly code: string; readonly reason: string } {
  return holder.host === thisHost
    ? { code: 'lock-held-local', reason: `Session ${sessionId} is held by another run in this application (pid ${holder.pid}). Finish or stop that run first.` }
    : { code: 'lock-held-foreign', reason: `Session ${sessionId} is held by a different machine (${holder.host}) since ${holder.acquiredAt}. This instance cannot establish whether that run is still going; explicitly release the lock after resolving why this machine-local store is reachable there.` };
}

function missingWorktree(row: SessionRow): { readonly code: string; readonly reason: string } | null {
  const binding = parseBinding(row.worktree);
  if (binding && !existsSync(binding.worktree_path)) return { code: 'worktree-missing', reason: `Session ${row.session_id} is bound to the worktree at ${binding.worktree_path}, which no longer exists. Recreate or re-attach the worktree before continuing this session.` };
  return null;
}

/**
 * What loading a session answers. PD-ORCH-005 clause 8: loading changes no agent record, so it settles nothing — the
 * stale-child settle and the crash record happen when a run of the session is about to start.
 */
/** PD-ORCH-005 clauses 4 and 6: resume the open iteration, with the message delivered to its root, or decline it. */
type OpenIterationChoice = { readonly message: readonly ContentPart[] | null } | 'decline';

export interface ResumeSuccess {
  readonly sessionId: SessionId;
}

type ResumeFailure = { readonly code: string; readonly reason: string };

function parseTodoDocument(row: SessionRow): Result<TodoDocument | undefined, ResumeFailure> {
  if (row.todo === null) return ok(undefined);
  try {
    const decoded = decodeStoredTodo(row.todo);
    if (decoded.planner === null && decoded.agent === null) throw new Error('todo must be a schema_version 1 document or a schema_version 2 planner/agent envelope');
    return ok(decoded.planner ?? undefined);
  } catch (cause) {
    return err({ code: 'state-unreadable', reason: `session ${row.session_id} has unreadable stored state: ${String(cause instanceof Error ? cause.message : cause)}` });
  }
}

/** REQ-SESSION-041: the parse detail when the stored state (the todo document, the progress record) cannot be decoded; read from the listing row itself. */
export function stateUnreadable(row: SessionRow): string | null {
  const todo = parseTodoDocument(row);
  if (!todo.ok) return todo.error.reason;
  if (row.progress !== null) {
    try { JSON.parse(row.progress); }
    catch (cause) { return `session ${row.session_id} has unreadable stored state: ${String(cause instanceof Error ? cause.message : cause)}`; }
  }
  return null;
}

function previousIntent(dal: StoreDal, sessionId: SessionId): IntentCategory | null {
  const payload = dal.getLaunchAudit(sessionId)?.payload;
  if (!payload) return null;
  try {
    const result = IntentResultSchema.safeParse((JSON.parse(payload) as { run_intent?: unknown }).run_intent);
    return result.success ? result.data.category : null;
  } catch { return null; }
}

/**
 * REQ-ORCH-004's appended task, and the repair of a-crashed-iteration-number-is-reused-by-the-next-run (PD-ORCH-005): the
 * id a continuation gives the task it appends. A run host that died mid-iteration leaves the stored count behind the
 * iteration rows, so the number is taken past both; and since the dead iteration's task goes back to `pending` and is
 * selected again, the id also steps past every id the todo already holds, so the new prompt never shares one with it.
 */
function continuedTaskId(dal: StoreDal, sessionId: SessionId, todo: TodoDocument | undefined): string {
  const taken = new Set((todo?.phases ?? []).flatMap((phase) => phase.tasks.map((task) => task.id)));
  const rows = dal.iterationsOf(sessionId);
  let n = Math.max(dal.getSession(sessionId)?.iterations_completed ?? 0, rows.at(-1)?.iteration ?? 0) + 1;
  while (taken.has(`${sessionId}:continued:${n}`)) n += 1;
  return `${sessionId}:continued:${n}`;
}

/**
 * REQ-SESSION-115's artifact, as PD-ORCH-005 clause 20 (revision 4) decides it: the latest artifact the iteration's
 * root published that nothing supersedes and, when the root published none, the latest artifact of any kind that
 * nothing supersedes — the child reports and the documents its agents published are where a run's work is recorded —
 * cut to the requirement's 6,000 characters. The iteration is the session's most recent recorded one, the iteration the
 * new one follows (OQ-106). Its root is known by the task id its publishes carry as their conversation, which only its
 * own tool port writes (a child's report carries the child's), never by `created_by`, which every root shares. A plan
 * cycle's root is not an iteration's (REQ-ORCH-153), so its publishes count only as "of any kind"; and when a plan
 * cycle opened its gate after the latest iteration opened (the plan gate's approve and revise, a prompt after a
 * declined plan), the new work follows that plan cycle, not the iteration, so no iteration's root is preferred and the
 * handoff takes the latest of any kind — an earlier piece of work's document never outranks what the plan cycle
 * produced (OQ-106). The plan cycle PD-ORCH-003 revision 2 holds after a resumed iteration is taken the same way,
 * although that iteration is of the same run: a resume never rewrites `opened_at`, so the resumed root's document
 * counts only as "of any kind" on the approve and revise (OQ-106). The two times are the writer's own ISO instants, so
 * they compare as text. Its id leads, so no cut reaches it (REQ-SESSION-194). A published document's summary is its
 * body's first line and its key findings its body (REQ-LIBRARY-093), so it is stated once, as its body. The repair of
 * `the-continuation-payload-says-no-artifact-is-recorded.md` (OQ-99).
 */
export function latestArtifactText(dal: StoreDal, sessionId: SessionId): string {
  const records = dal.artifactsOf(sessionId).flatMap((r) => { const a = toArtifactRecord(r); return a && a.supersededBy === null ? [a] : []; });
  const iteration = dal.iterationsOf(sessionId).at(-1);
  const cycle = dal.planCyclesOf(sessionId).at(-1);
  const root = cycle !== undefined && iteration !== undefined && cycle.opened_at > iteration.opened_at ? undefined : iteration?.root_task_id;
  const latest = records.findLast((a) => a.conversationId === root) ?? records.at(-1);
  if (!latest) return 'Artifact: (none recorded in this session)';
  const header = `Artifact: ${latest.id} — ${cut(latest.title, 80)} (${latest.kind}, ${latest.status})`;
  const findings = latest.keyFindings.trim();
  const body = latest.kind === 'agent_published' ? findings : `${latest.summary}${findings === '' ? '' : `\nKey findings:\n${findings}`}`;
  return cut(`${header}\n${body}`, 6_000);
}

/** The text of a message, its text parts joined. */
function textOfMessage(m: ChatMessage): string {
  return m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
}

/** The texts of the user messages a conversation holds after its last assistant message — what it has not yet answered. */
function toldSinceLastAnswer(messages: readonly ChatMessage[]): ReadonlySet<string> {
  const lastAnswer = messages.map((m) => m.role).lastIndexOf('assistant');
  return new Set(messages.slice(lastAnswer + 1).filter((m) => m.role === 'user').map(textOfMessage));
}

export function buildContinuationPayload(dal: StoreDal, row: SessionRow, prompt: string, todo: TodoDocument | undefined): string {
  const recentRows = dal.residentRows(row.session_id as SessionId)
    .filter((event) => (event.kind === 'user' || event.kind === 'agent') && event.body.trim() !== '')
    .slice(-6);
  const perEvent = Math.min(700, Math.floor((3_200 - Math.max(0, recentRows.length - 1)) / Math.max(1, recentRows.length)));
  const recent = recentRows.map((event) => `${event.kind}: ${cut(event.body, Math.max(3, perEvent - event.kind.length - 2))}`);
  const history = recent.join('\n');
  const tasks = (todo?.phases ?? []).flatMap((phase) => phase.tasks.map((task) => `- [${task.state}] ${cut(task.text, 80)}`));
  const shownTasks = tasks.slice(0, 20);
  if (tasks.length > 20) shownTasks.push('- [... additional todo tasks elided]');
  const iterations = dal.timelineOf(row.session_id as SessionId).filter((entry) => entry.name === 'iteration_end').slice(-5).map((entry) => cut(entry.message, 700));
  return [
    'This is a follow-up within an existing session. Prior session context is authoritative; continue from its recorded state.',
    '', 'Latest user request:', prompt,
    '', 'Authoritative session handoff:',
    latestArtifactText(dal, row.session_id as SessionId),
    `Todo:\n${shownTasks.join('\n') || '- (empty)'}`,
    `Progress: ${cut(row.progress ?? '(none recorded)', 700)}`,
    ...[openOffersText(dal, row.session_id as SessionId)].filter((t) => t !== ''),
    `Recent iterations:\n${iterations.map((item) => `- ${item}`).join('\n') || '- (none recorded)'}`,
    '', 'Recent session context:', history || '(none recorded)',
  ].join('\n');
}


/** REQ-MONITOR-171: the run's duration as `m:ss` / `h:mm:ss`; empty before any run. */
export function durationLabel(startedAt: string | null, until: string): string {
  if (!startedAt) return '';
  const ms = Math.max(0, new Date(until).getTime() - new Date(startedAt).getTime());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** One relative-time wording for every listing: the session browser's rows and, since Part Y, REQ-LIBRARY-136's created label. */
export function relativeTime(updatedAt: string, now: number): string {
  const elapsed = Math.max(0, now - new Date(updatedAt).getTime());
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

/** REQ-GIT-022 / REQ-SHELL-125: what the host settled before asking for the session — the id, the binding, the sandbox mode. */
export interface StartOptions {
  /** Captured by the host before credential preparation (REQ-TRACE-470/471). */
  readonly setup?: RunSetup;
  readonly sessionId?: string | undefined;
  readonly worktree?: WorktreeBinding | undefined;
  readonly sandboxMode?: string | undefined;
  readonly attachments?: readonly ImageAttachmentInput[] | undefined;
  readonly runType?: RunType | undefined;
  /** REQ-LIBRARY-059/060: a reviewed run may arrive with its approved proposal tasks already shaped as the todo. */
  readonly initialTodo?: TodoDocument | undefined;
}

/** REQ-SESSION-082 / REQ-EVENTS-021: a refusal before the run starts is one `result` of status error, marked as such. */
export interface StartRefusal {
  readonly code: string;
  readonly reason: string;
  readonly failedBeforeStart: true;
  readonly result: { status: 'error'; session_id: string; stop_reason: ''; summary: string; error: string };
}

/**
 * REQ-MONITOR-166: the cost label carries its own qualifier, so no view has to invent a description for a
 * run whose price could not be established.
 *
 * PD-MONITOR-001 revision 2 fixes four qualifiers and their labels, and the qualifier is the one the run EARNED
 * and recorded with its total (`sessions.cost_qualifier`, v21) — read back, never re-derived from the amount,
 * because since configured rates price requests a non-zero total no longer says how it was reached. The amount is
 * rendered under REQ-PROVIDER-121's rule: half-up, two decimal places, four below one hundredth, and **no
 * currency symbol**, because no figure here names a currency and the product does not pick one (the narrowing).
 *
 * Two falsified readings, kept beside their replacement: "no rate is configured in this build, so the price is
 * unknown" (revision 0), and "a total that is not zero is a reported price" (revision 1, when a provider's report
 * was the only route to a figure).
 */
export function costLabelOf(cost: string, qualifier: string): SessionRecord['costLabel'] {
  const unknown = { text: 'price not established', qualifier: 'unknown' } as const;
  if (qualifier === 'unknown' || !(COST_QUALIFIERS as readonly string[]).includes(qualifier)) return unknown;
  const amount = formatAmount(cost);
  if (amount === null) return { text: `${cost} (price not established)`, qualifier: 'unknown' };
  switch (qualifier as Exclude<CostQualifier, 'unknown'>) {
    case 'incomplete': return { text: `at least ${amount}; some requests have no price`, qualifier: 'incomplete' };
    case 'configured': return { text: `${amount} at configured rates`, qualifier: 'configured' };
    case 'reported': return { text: `${amount} reported by the provider`, qualifier: 'reported' };
  }
}

/**
 * REQ-ORCH-153/154: the plan cycle awaiting an answer, as the surface is given it. Read from the STORE — the run
 * that produced it has parked and its process may be gone, and the decision must still be there when the session
 * is opened again. `edited` stays separate from `plan`: the surface shows the user's own text where one exists and
 * the role's verbatim otherwise, and neither overwrites the other.
 */
/**
 * PD-ORCH-005 clause 4: the entry persona a continue's run is set up for. A continue that resumes an open iteration
 * restores its root with its identity, persona included, so the run is set up as the persona that root ran as, whatever
 * the entry role is now (found by phase 4's review); any other continue takes the configured entry role (undefined).
 */
function resumedPersona(dal: StoreDal, sessionId: SessionId, declines: boolean): string | undefined {
  const open = dal.openIterationOf(sessionId);
  // OQ-103 (R-067): an iteration whose explicit cancel was accepted is closed by the continue's record, never resumed.
  return declines || open?.cancel_accepted_at != null ? undefined : open?.root_persona;
}

export function planGateOf(dal: StoreDal, r: SessionRow): PlanGatePayload | null {
  if (r.execution_status !== 'awaiting_plan_decision' || r.plan_cycle === null) return null;
  const row = dal.planCycle(asSessionId(r.session_id), r.plan_cycle);
  if (!row || row.decision !== null) return null;
  return { cycle: row.cycle, openedAt: row.opened_at, plan: row.plan, edited: row.edited, intent: row.intent, todo: row.todo, changes: row.changes };
}

/**
 * PD-ORCH-005 clause 6: what the Continue action would resume — the open iteration, with its root and every agent of it
 * not in a terminal state. After a rest those are the agents it left `paused`; after a crash not yet recorded (clause 8:
 * reading records nothing) they are the agents the crash record will pause, so the count is the same either way. Read
 * from the store, so a session at rest states it with no process behind it.
 *
 * An open iteration whose explicit cancel was accepted (its mark, OQ-103's last question ruled under R-067) resumes
 * nothing: clause 3's "those are never resumed" governs it, and the next repair or continue closes it `cancelled`
 * (`recordCrash`), so the Continue action counts none of its agents — nothing is open to resume.
 */
export function resumableOf(dal: StoreDal, r: SessionRow): ResumablePayload | null {
  const open = dal.openIterationOf(asSessionId(r.session_id));
  if (!open || open.cancel_accepted_at !== null) return null;
  const unfinished = iterationAgents(dal, asSessionId(r.session_id), open).filter((c) => !isTerminalChildState(c.state)).length;
  return { iteration: open.iteration, agents: 1 + unfinished };
}

export function toSessionRecord(r: SessionRow, queued: readonly { id: string; content: string; createdAt: string }[] = [], toolCalls: readonly { tool_name: string; count: number; agents: number }[] = [], planGate: PlanGatePayload | null = null, resumable: ResumablePayload | null = null): SessionRecord {
  return {
    // REQ-MONITOR-085: derived from the live run at every snapshot; a record read from the store alone carries none.
    compression: null,
    // REQ-MONITOR-089: likewise the entry role's own reading; a stored record carries no live tracker.
    entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY },
    // Live-run finding K1: likewise the entry role's tools and the session's artifact links (`entryToolsOf`, `artifactLinksOf`).
    entryTools: { resolved: [], called: [], active: [] },
    artifacts: [],
    // PD-ORCH-005 clause 4 with OQ-97: likewise the roots the run-level agent owns rows and artifacts under (`entryRootsOf`).
    entryRoots: [],
    id: r.session_id,
    executionStatus: r.execution_status,
    workspaceRoot: r.workspace_root,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    historyOpen: r.history_open === 1,
    truncation: { truncated: r.truncated === 1, droppedCount: r.dropped_count, cap: r.trim_cap, lastTrimAt: r.last_trim_at },
    agents: [],
    pendingApprovals: parsePending(r.pending_approvals),
    pendingQuestions: [],
    tokenUsage: { input: r.tokens_input, output: r.tokens_output },
    cost: r.cost,
    stopReason: r.stop_reason,
    runType: r.run_type,
    improvementArtifactIds: parseList(r.improvement_artifact_ids),
    runStartedAt: r.run_started_at,
    iterationsCompleted: r.iterations_completed,
    summary: r.summary_status && r.summary_severity && r.summary_text ? { status: r.summary_status, severity: r.summary_severity, message: r.summary_text } : null,
    permissionMode: r.permission_mode,
    sandboxed: r.sandboxed === 1,
    backgroundSessions: 0,
    intent: null,
    queuedPrompts: [...queued],
    todo: null,
    childTodos: {},
    messageLimit: r.message_limit,
    pausedAtCount: r.paused_at_count,
    planGate,
    // PD-ORCH-003: the release outlives the run that took it, so a surface showing the mode reads this to tell
    // an armed `plan` from a released one rather than promising a gate that will not open.
    planReleased: r.plan_released === 1,
    resumable,
    usageHistory: parseTokenSamples(r.token_samples),
    costLabel: costLabelOf(r.cost, r.cost_qualifier),
    toolCalls: { total: r.tool_calls, agents: Math.max(0, ...toolCalls.map((t) => t.agents)), byTool: toolCalls.map((t) => ({ tool: t.tool_name, count: t.count })) },
    worktreeBranch: parseBinding(r.worktree)?.branch ?? null,
    wait: null,
  };
}

/**
 * REQ-MONITOR-060/061 (live-run finding K1, R-067): the run-level agent's tools. A live run reports its root port's resolution
 * and the tracker's history (`Run.entryTools`). With none, nothing is resolved — the persona's declared tools stand in on the
 * surface (REQ-MONITOR-060) — and the history is the tracker's, seeded from the tool-call ring when the session was opened,
 * under the persona the latest iteration's root ran as (the name the root dispatches under).
 */
export function entryToolsOf(dal: StoreDal, sessionId: SessionId, run: { readonly entryTools: EntryToolsPayload } | null | undefined, activity: AgentActivity): EntryToolsPayload {
  if (run) return run.entryTools;
  const persona = dal.iterationsOf(sessionId).at(-1)?.root_persona;
  return { resolved: [], called: persona ? activity.calledTools(persona) : [], active: [] };
}

/**
 * REQ-MONITOR-044/052/068/069 (live-run finding K1, R-067): the session's artifacts, not superseded, as the agent surfaces link
 * them — the producer is the creating instance (`created_by`, else the record's canonical name, as the Library's row reads
 * it, REQ-LIBRARY-136), `ready` is REQ-LIBRARY-136's, and `consumedBy` the instances that read it (the received side).
 */
export function artifactLinksOf(dal: StoreDal, sessionId: SessionId): SessionArtifactLink[] {
  return dal.artifactLinksOf(sessionId).map((r) => ({
    id: r.id, slug: r.slug, title: r.title, status: r.status, producer: r.created_by || r.canonical_name || '', ready: isReadyArtifactStatus(r.status), consumedBy: parseList(r.consumed_by),
  }));
}

/**
 * PD-ORCH-005 clause 4 with OQ-97, and REQ-LIBRARY-093 (the repair of the-run-level-agent-is-known-by-its-entry-persona-alone.md):
 * the entry role's root agents of the session, each (name, canonical name) pair once — what the run-level agent owns rows and
 * artifacts under (REQ-MONITOR-071, REQ-CHAT-069, REQ-MONITOR-044). First every iteration's root, by the persona it was
 * opened with (`root_persona`, the name its rows and calls carry, which a root resumed as the entry role keeps) and its
 * `root_canonical_name` (which its publishes and reads record). Then each root no iteration row records — a plan cycle's
 * (REQ-ORCH-153) — that published, by its publish (`StoreDal.rootPublishersOf`): a root publishes under its task id as its
 * conversation (OQ-106), always as a fresh root, so the publish's persona is the name its rows carry and `created_by` its
 * canonical name. Its run is gone once it parks at the gate or ends, and with it `Run.currentRoot`, so without this a
 * session at the gate named no root and the plan cycle root's publish was no agent's (found by the fifth review of that
 * repair). Last the live run's current root. A plan cycle's root that published nothing is named only while its run is
 * live (`docs/defects/a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`).
 */
export function entryRootsOf(dal: StoreDal, sessionId: SessionId, run: { readonly currentRoot: EntryRoot | null } | null | undefined): EntryRoot[] {
  const out: EntryRoot[] = [];
  const add = (root: EntryRoot): void => { if (!out.some((r) => r.name === root.name && r.canonical === root.canonical)) out.push(root); };
  for (const r of dal.iterationsOf(sessionId)) add({ name: r.root_persona, canonical: r.root_canonical_name });
  for (const p of dal.rootPublishersOf(sessionId)) if (p.source_persona && p.created_by) add({ name: p.source_persona, canonical: p.created_by });
  if (run?.currentRoot) add(run.currentRoot);
  return out;
}

/**
 * REQ-CHAT-041: exactly the QUEUED prompts of the session, in queue order.
 *
 * REQ-CHAT-039's visibility half is this one line: the listing is a query over ONE session's rows, so a prompt
 * scoped to a session is visible to that session's surfaces and to no other, and the panel of REQ-CHAT-036 shows
 * "exactly the prompts in QUEUED status belonging to the focused run's session" because it is handed this.
 * The context snapshot is deliberately NOT published: it is the queue's own bookkeeping, the panel never shows it,
 * and REQ-CHAT-153 keeps the panel's own content out of anything a model reads.
 */
function queuedOf(dal: StoreDal, sessionId: SessionId): { id: string; content: string; createdAt: string }[] {
  return dal.queuedPromptsOf(sessionId).filter((p) => p.status === 'QUEUED').map((p) => ({ id: p.prompt_id, content: p.content, createdAt: p.created_at }));
}

/**
 * REQ-CHAT-039's ownership rule, as a value (Part AB).
 *
 * "Ownership may come from an explicit session id or from a `session_id` key in the context snapshot." The
 * control channel addresses a session, and that addressing IS the explicit session id — a queued prompt is
 * created through `Sessions.control({op:'createQueuedPrompt', sessionId, …})` and the writer it reaches belongs
 * to that session. So the snapshot is the SECOND route, and the only thing it can do here is agree or disagree:
 * a snapshot naming another session is refused with the disagreement named, because writing it under the
 * addressed session would silently mis-scope a prompt and writing it under the named one would cross a session
 * boundary the store's foreign key owns.
 *
 * **The unscoped case is not decided here.** REQ-CHAT-038 admits "empty = unscoped" and REQ-CHAT-039 gives an
 * unscoped prompt a behaviour of its own; `queued_prompts.session_id` is NOT NULL by construction and the owner's
 * 2026-09-07 amendment to REQ-CHAT-041 reads "one session-scoped queue" per instance without amending 039. That
 * is OQ-51, raised against REQ-CHAT-039. Every route in this build supplies the addressed session, so `unscoped`
 * is unreachable through the product and is returned rather than thrown, so a future route meets a refusal that
 * names the open question instead of a foreign-key error.
 */
/**
 * The control channel's arguments are scalars, arrays of scalars and one-level records of scalars
 * (`ControlRequestSchema`), so a context snapshot travels either as such a record or, for a caller with a
 * deeper one, as its JSON text. An unreadable text is no snapshot rather than an error: REQ-CHAT-038 makes the
 * snapshot optional, and a caller who sent nothing readable supplied nothing.
 */
function readContextSnapshot(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return null;
    try { const parsed: unknown = JSON.parse(raw); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null; }
    catch { return null; }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

export type QueueOwnership =
  | { readonly kind: 'scoped'; readonly sessionId: string }
  | { readonly kind: 'conflict'; readonly reason: string }
  | { readonly kind: 'unscoped' };
export function resolveQueueOwnership(addressedSessionId: string | null, snapshot: unknown): QueueOwnership {
  const named = snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot) && typeof (snapshot as Record<string, unknown>)['session_id'] === 'string'
    ? ((snapshot as Record<string, string>)['session_id'] ?? '').trim()
    : '';
  if (addressedSessionId === null || addressedSessionId === '') return named === '' ? { kind: 'unscoped' } : { kind: 'scoped', sessionId: named };
  if (named !== '' && named !== addressedSessionId) return { kind: 'conflict', reason: `the context snapshot scopes this prompt to session ${named}, which is not the session it was submitted to (${addressedSessionId})` };
  return { kind: 'scoped', sessionId: addressedSessionId };
}

/** REQ-ORCH-014: derived, not stored — `classifying` while the run is starting and no audit exists, then the audit's `run_intent`. */
export function intentStatusOf(r: SessionRow, auditPayload: string | null): IntentStatus | null {
  if (auditPayload !== null) {
    try {
      const p = JSON.parse(auditPayload) as { run_intent?: unknown };
      const parsed = IntentResultSchema.safeParse(p.run_intent);
      if (parsed.success) return { phase: 'classified', ...parsed.data };
    } catch { /* an unreadable audit reads as no status */ }
  }
  return r.execution_status === 'starting' ? { phase: 'classifying' } : null;
}

/**
 * REQ-MONITOR-044/046/047/048/049: a child row as a surface sees it. Part R: the called and active tools and the latest
 * prompt reading come from the writer's incremental tracker (never from the transcript, REQ-MONITOR-038); the reasoning
 * level from the run's persona resolution, `medium` when none; the limit from `contextLimitFor` when the caller can
 * name the model's own maximum, else REQ-MONITOR-080's default. The tool-call count is the larger of the row's
 * settled figure (written once at the child's end) and the tracker's live count, so a running child counts up.
 */
export interface AgentFacts {
  readonly activity?: AgentActivity | undefined;
  readonly reasoningFor?: ((persona: string) => string | null) | undefined;
  readonly contextLimitFor?: ((modelKey: string) => number | null) | undefined;
  /**
   * REQ-MONITOR-211/213 (Part R's reading, ADR-0043 note): the session's execution status and its last update. A
   * non-terminal child of a session whose status neither claims a live run nor is `idle` is PRESENTED settled to the
   * run's own outcome — its activity replaced, its active chips cleared — by this one projection, so no surface applies
   * a settling rule of its own; the ledger's own settling (REQ-ORCH-053) writes the row at the next run start. A
   * `paused` child is the exception: PD-ORCH-005 clause 13 (revision 4) narrows REQ-MONITOR-211/213 and
   * REQ-SESSION-078/180 for it, since it waits in its open iteration to be resumed.
   */
  readonly session?: { readonly executionStatus: string; readonly updatedAt: string } | undefined;
  /**
   * PD-ORCH-005 clauses 13 and 18 (OQ-100): the task ids of the agents a crash left unfinished in the open iteration, before
   * the crash is recorded (`crashLeftOf`). Each is presented as the crash record will leave it — `paused`, by `crash` —
   * so every agent surface agrees with the Continue action's count (`resumableOf`); reading the session records
   * nothing (clause 8).
   */
  readonly crashLeft?: ReadonlySet<string> | undefined;
  /**
   * PD-ORCH-005 clause 3 (OQ-103's last question, ruled under R-067): the task ids of the agents an explicit cancel that
   * was accepted and never carried out left unfinished, before the next repair or continue ends them (`cancelLeftOf`).
   * Each is presented as that record will leave it — `cancelled`, ended with the run — and never `paused`.
   */
  readonly cancelLeft?: ReadonlySet<string> | undefined;
}
export const ENDED_WITH_RUN = 'Ended with the run.';
const parseList = (json: string): string[] => { try { const v: unknown = JSON.parse(json); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
export function toAgentRecord(c: ChildRow, clocks: Clocks, facts: AgentFacts = {}): AgentRecord {
  const state = c.state as ChildState;
  const ps = presentationChildState(state);
  void clocks;
  const activity = facts.activity;
  const status = facts.session?.executionStatus ?? null;
  // PD-ORCH-005 clause 13 (revision 4, narrowing REQ-MONITOR-046/211/213 and REQ-SESSION-078/180): a `paused` agent is
  // not a leftover of a run that ended — it waits in its open iteration to be resumed, so it presents as `paused`, keeps
  // its last activity, and is never settled to the run's outcome. Nothing runs for it, so it shows no active tool (a
  // crash can leave one). An agent a crash left unfinished, the crash not yet recorded, presents the same (OQ-100).
  // OQ-103 (R-067): an agent an accepted cancel left unfinished is not paused, whatever its row says — it presents as the
  // cancel's record will leave it, `cancelled` and ended with the run.
  const cancelLeft = !isTerminalChildState(state) && facts.cancelLeft?.has(c.task_id) === true;
  const crashLeft = !cancelLeft && !isTerminalChildState(state) && state !== 'paused' && facts.crashLeft?.has(c.task_id) === true;
  const paused = !cancelLeft && (state === 'paused' || crashLeft);
  const reconcile = cancelLeft || (status !== null && status !== 'idle' && !isActiveStatus(status) && !isTerminalChildState(state) && !paused);
  const shownState: ChildState = cancelLeft ? 'cancelled' : reconcile ? reconciledState(status!) : crashLeft ? 'paused' : state;
  const shownPs = reconcile || crashLeft ? presentationChildState(shownState) : ps;
  const terminal = c.completed_at !== null || reconcile;
  return {
    id: c.task_id, name: c.canonical_name, givenName: c.given_name, persona: c.persona, state: shownState, presentationState: shownPs, parentId: c.parent_id,
    dependencies: parseList(c.depends_on),
    activity: reconcile ? ENDED_WITH_RUN : c.task.slice(0, 180), model: c.model_key, depth: c.depth, background: c.background === 1, category: c.category,
    spawnedAt: c.spawned_at, completedAt: c.completed_at ?? (reconcile ? facts.session?.updatedAt ?? null : null), toolCalls: Math.max(c.tool_calls, activity?.callCount(c.canonical_name) ?? 0), delegationTask: c.task,
    reasoning: facts.reasoningFor?.(c.persona) ?? 'medium',
    contextUsed: activity?.contextUsed(c.canonical_name) ?? 0,
    contextLimit: facts.contextLimitFor?.(c.model_key) ?? DEFAULT_CONTEXT_CAPACITY,
    // REQ-MONITOR-281 (Part AH): the per-agent compression count, live from the tracker and seeded from the timeline on open.
    compressions: activity?.compressions(c.canonical_name) ?? 0,
    grantedTools: parseList(c.granted_tools),
    calledTools: activity?.calledTools(c.canonical_name) ?? [],
    // REQ-MONITOR-211/213: a settled agent presents no active tool, whatever a crash left in the ring; nor does a paused one.
    activeTools: terminal || paused ? [] : activity?.activeTools(c.canonical_name) ?? [],
    delegationSessionId: null,
    inheritedContext: parseList(c.inherited_context).join(String.fromCharCode(10)),
    live: shownPs === 'running',
    ...mcpEvidenceOf(c.granted_mcp),
    interruption: crashLeft ? 'crash' : paused && isInterruption(c.interruption) ? c.interruption : null,
  };
}

/**
 * PD-ORCH-005 clauses 13 and 18 (OQ-100): the agents a crash left unfinished in the open iteration, the crash not yet
 * recorded — every agent of that iteration neither terminal nor `paused`, which is exactly what `recordCrash` will pause.
 * A crash left them where no rest records an interruption, so the open iteration's is still NULL, and the session is
 * either `interrupted` by a repair that recorded no crash (a checkpoint listing's, OQ-96) or still claims a run no
 * process is behind — REQ-CHAT-008's recovery state, which `notLive` confirms by the one liveness predicate
 * (REQ-SESSION-171), asked only then. Empty for every other session, a live run above all. Reads the store and
 * records nothing (clause 8).
 *
 * `storeFailed` (OQ-103): a session the store's failure left busy (OQ-42) reads `not-live` too — its run ended in this
 * process — but it did not crash, and nothing can be recorded of it, so it names none: its agents present as before,
 * and none of them is offered the at-rest cancel (OQ-100, OQ-101).
 */
export function crashLeftOf(dal: StoreDal, r: SessionRow, notLive: () => boolean, storeFailed = false): ReadonlySet<string> {
  const status = r.execution_status;
  if (status !== 'interrupted' && !isActiveStatus(status)) return NONE_CRASH_LEFT;
  if (storeFailed && isActiveStatus(status)) return NONE_CRASH_LEFT;
  const open = dal.openIterationOf(asSessionId(r.session_id));
  // OQ-103 (R-067): an iteration whose explicit cancel was accepted is that cancel's, not a crash's (`cancelLeftOf`).
  if (!open || open.interruption !== null || open.cancel_accepted_at !== null) return NONE_CRASH_LEFT;
  if (isActiveStatus(status) && !notLive()) return NONE_CRASH_LEFT;
  return new Set(iterationAgents(dal, asSessionId(r.session_id), open).filter((c) => !isTerminalChildState(c.state) && c.state !== 'paused').map((c) => c.task_id));
}
const NONE_CRASH_LEFT: ReadonlySet<string> = new Set();

/**
 * PD-ORCH-005 clause 3 with REQ-MONITOR-126 (OQ-103's last question, ruled under R-067; the repair of
 * `a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`): the agents an explicit cancel that was
 * accepted and never carried out left unfinished — every agent of the open iteration carrying the cancel's mark that is
 * not in a terminal state, `paused` ones included, which is exactly what `recordCrash` will end `cancelled`. Named only
 * while no run carries the cancel out: the status claims no run, or claims one the liveness predicate calls `not-live`
 * (REQ-SESSION-171), asked only then. A session the store's failure left busy names none, as `crashLeftOf` does. Reads the
 * store and records nothing (clause 8).
 */
export function cancelLeftOf(dal: StoreDal, r: SessionRow, notLive: () => boolean, storeFailed = false): ReadonlySet<string> {
  const status = r.execution_status;
  if (storeFailed && isActiveStatus(status)) return NONE_CRASH_LEFT;
  const open = dal.openIterationOf(asSessionId(r.session_id));
  if (!open || open.cancel_accepted_at === null) return NONE_CRASH_LEFT;
  if (isActiveStatus(status) && !notLive()) return NONE_CRASH_LEFT;
  return new Set(iterationAgents(dal, asSessionId(r.session_id), open).filter((c) => !isTerminalChildState(c.state)).map((c) => c.task_id));
}

/** REQ-MCP-065 / REQ-MCP-114 (Part S): the row's recorded evidence as the record's two fields; an unreadable or pre-Part-S `{}` value reads as none. */
function mcpEvidenceOf(json: string): Pick<AgentRecord, 'grantedMcp' | 'mcpServers'> {
  try {
    const v = JSON.parse(json) as { granted?: Record<string, string[]>; servers?: AgentRecord['mcpServers'] };
    return { grantedMcp: v && typeof v.granted === 'object' && v.granted !== null ? v.granted : {}, mcpServers: Array.isArray(v?.servers) ? v.servers : [] };
  } catch {
    return { grantedMcp: {}, mcpServers: [] };
  }
}

/** REQ-TOOLS-060: the mirror is a JSON array of payloads; an unreadable mirror reads as empty rather than failing the record. */
function parsePending(json: string): SessionRecord['pendingApprovals'] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.flatMap((x) => { const r = ApprovalPayloadSchema.safeParse(x); return r.success ? [r.data] : []; });
  } catch {
    return [];
  }
}

export class Sessions {
  private readonly live = new Map<SessionId, Live>();
  readonly seq = new SequenceCounters();
  readonly bus: EventBus;

  constructor(private readonly deps: SessionsDeps) {
    this.bus = new EventBus({ timers: deps.clocks.timers, warn: deps.warn });
  }

  /** REQ-SESSION-042/154/182: read-only workspace listing with shared stale semantics. */
  list(dal: StoreDal, workspaceRoot: string): SessionListItem[] {
    const now = Number(this.deps.clocks.wall.instant());
    return dal.listSessions().filter((row) => row.workspace_root === workspaceRoot).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((row) => {
      const firstPrompt = dal.residentRows(asSessionId(row.session_id)).find((event) => event.kind === 'user' && event.body.trim() !== '');
      // Found on Part U's first execution (ADR-0005 note, defect 40): this listing carried its OWN liveness predicate —
      // `lock present && (foreign host || pid <= 0 || probe alive)` — beside `liveness()` below, and the two disagreed on
      // one case: a lock this process holds with no run behind it (a loaded, idle session). The listing called it live
      // (its own pid probes alive), `liveness()` and the checkpoint listing's repair called it not live and repaired it;
      // REQ-SESSION-171 forbids two verdicts for one pid at one moment and ADR-0005 names a second implementation a
      // defect. The one predicate is used; `unknown` (no probe) resolves toward running (REQ-SESSION-172).
      const live = this.liveness(dal, asSessionId(row.session_id)) !== 'not-live';
      // REQ-GIT-018/121: the branch is the binding's; `—` is the placeholder for a session with none (REQ-GIT-120's test).
      const binding = parseBinding(row.worktree);
      return {
        sessionId: row.session_id,
        label: cut(firstPrompt?.body.trim() || row.session_id, 80),
        status: row.execution_status || 'idle',
        branch: binding?.branch ?? '—',
        worktree: binding,
        checkpointCount: dal.checkpointCount(asSessionId(row.session_id)),
        relativeTime: relativeTime(row.updated_at, now),
        detail: row.workspace_root,
        awaitingInput: parsePending(row.pending_approvals).length > 0,
        stale: isActiveStatus(row.execution_status) && !live,
        tokens: row.tokens_input + row.tokens_output,
        durationLabel: durationLabel(row.run_started_at, isActiveStatus(row.execution_status) && live ? new Date(now).toISOString() : row.updated_at),
        busy: isActiveStatus(row.execution_status) && live,
        requirementId: null,
        unreadable: stateUnreadable(row),
      };
    });
  }

  /** REQ-SESSION-083/112/118: load, validate, claim, sweep, then expose the projection. */
  resume(dal: StoreDal, workspaceRoot: string, sessionId: SessionId): Result<ResumeSuccess, ResumeFailure> {
    if (SessionWriter.storeFailure(dal)) {
      const active = [...this.live.values()].some((s) => s.dal.db === dal.db && s.run && !s.run.isEnded);
      if (active) return err({ code: 'store', reason: 'Store recovery is waiting for affected runs to finish cancellation.' });
      const recovered = SessionWriter.recoverStore(dal);
      if (!recovered.ok) return recovered;
    }
    const row = dal.getSession(sessionId);
    if (!row || row.workspace_root !== workspaceRoot) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const todo = parseTodoDocument(row);
    if (!todo.ok) return todo;
    if (row.progress !== null) {
      try { JSON.parse(row.progress); }
      catch (cause) { return err({ code: 'state-unreadable', reason: `session ${sessionId} has unreadable stored state: ${String(cause instanceof Error ? cause.message : cause)}` }); }
    }
    let existing = this.live.get(sessionId);
    if (existing?.writer.failed) {
      existing.log?.close();
      this.bus.detachSession(sessionId);
      this.live.delete(sessionId);
      existing = undefined;
    }
    if (existing && this.isRunActive(sessionId)) return err({ code: 'run-active', reason: `Session ${sessionId} is already active in this application.` });
    if (existing) return ok({ sessionId });
    // REQ-GIT-019: a bound session continues in its tree, or refuses with the path stated when the tree is gone.
    const gone = missingWorktree(row);
    if (gone) return err(gone);

    const appender = this.deps.sessionLogAppender?.(dal, sessionId);
    const log = appender ? new SessionLog({ wall: this.deps.clocks.wall, level: this.deps.runtime?.sessionLogLevel ?? 'WARNING', append: appender }) : null;
    const warn = (m: string) => { log?.warn(m); this.deps.warn(m); };
    const entry: { owner?: ProjectionOwner; run?: Run } = {};
    const opened = SessionWriter.open({
      dal, sessionId, wall: this.deps.clocks.wall, retentionCap: this.deps.retentionCap, warn,
      // Found on Part Q's first execution: this hand-off reached the projection owner only, so a continuation run on a LOADED
      // session never received its commits — nothing reached the bus, `run.result` never reached main and the terminal notice
      // never appeared (every earlier resume proof read the store, not the notice). The run is fed as `start` feeds it.
      // (Part P's first execution found the same fault independently, by the same route: a continuation that never reported.)
      onCommitted: (c) => { entry.owner?.onCommitted(c); entry.run?.onCommitted(c); },
    }, { pid: this.deps.pid, host: this.deps.host, isProcessAlive: this.deps.isProcessAlive ?? (() => true) });
    if (!opened.ok) {
      log?.close();
      if (opened.error.code === 'no-session') return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
      if (opened.error.code === 'store') return err({ code: 'store', reason: `Session ${sessionId} could not be loaded: ${opened.error.reason}` });
      return err(lockHeldRefusal(sessionId, this.deps.host, opened.error.holder));
    }
    const writer = opened.value;
    const owner = new ProjectionOwner({
      sessionId, seq: this.seq, timers: this.deps.clocks.timers, publisher: this.deps.publisher,
      readSession: () => { const current = dal.getSession(sessionId)!; const children = dal.childrenOf(sessionId); const { crashLeft, cancelLeft, resumable } = this.restingOf(dal, current, writer); return { ...toSessionRecord(current, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId), planGateOf(dal, current), resumable), ...projectSessionTodos(current, children), agents: children.map((c) => toAgentRecord(c, this.deps.clocks, { activity: writer.activity, reasoningFor: (p) => entry.run?.reasoningFor(p) ?? null, contextLimitFor: this.deps.contextLimitFor, session: { executionStatus: current.execution_status, updatedAt: current.updated_at }, crashLeft, cancelLeft })), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(current, dal.getLaunchAudit(sessionId)?.payload ?? null), wait: entry.run?.currentWait ?? null, compression: entry.run?.currentCompression ?? null, entryContext: entry.run?.entryContext ?? { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: entryToolsOf(dal, sessionId, entry.run, writer.activity), artifacts: artifactLinksOf(dal, sessionId), entryRoots: entryRootsOf(dal, sessionId, entry.run), pendingQuestions: entry.run?.pendingQuestions() ?? [] }; },
      readResident: () => dal.residentRows(sessionId).map((r) => ({ ...toTranscriptRow(r), ...(r.attachments === '[]' ? {} : { attachments: projectAttachments(this.deps.sessionFilesDir(dal, sessionId), r.attachments) }) })),
    });
    entry.owner = owner;
    // Part Q: the memory is rehydrated at the first continuation, when the run's model resolver exists (REQ-SESSION-196's override).
    this.live.set(sessionId, { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry, memory: null, artifacts: this.newArtifactStore(dal, sessionId, () => writer, warn), modeOverride: { value: null }, presence: new UserPresence({ record: warn }) });
    return ok({ sessionId });
  }

  /**
   * REQ-CHAT-011 with no session: create it, record the prompt as row 0, start the run.
   * REQ-GIT-019/022 (Part O): an isolated or attached session arrives with its binding already made and its id minted
   * by the host; the row records the binding and stays anchored to the base workspace (configuration is loaded from
   * the base), while the run's EFFECTIVE root — the tool fence, the terminal's cwd, the hooks' cwd, the child payload's
   * "workspace root" — is the worktree path. That is the reading of "re-rooted" taken here: the files live in the base
   * `.rotaris/`, the work happens in the tree.
   */
  start(dal: StoreDal, workspaceRoot: string, prompt: string, opts: StartOptions = {}): Result<SessionId, StartRefusal | { code: string; reason: string }> {
    const storeFailure = SessionWriter.storeFailure(dal);
    if (storeFailure) return err({ code: 'store-failed', reason: `The workspace store requires recovery before starting work: ${storeFailure}` });
    const attendedNow = this.deps.attended?.() ?? false;
    const sessionId = asSessionId(opts.sessionId ?? this.deps.mintSessionId());
    const setup = opts.setup ? ok(opts.setup) : this.setupFor(workspaceRoot, attendedNow, sessionId, opts.worktree?.worktree_path ?? workspaceRoot);
    if (!setup.ok) return err(setup.error);
    const { model, runtime } = setup.value;
    const inputs = opts.attachments ?? [];
    if (inputs.length > 0 && model.config.model.acceptsImageInput !== true) return err({ code: 'image-input-unsupported', reason: 'The selected model does not declare image input support.' });
    const checkedAttachments = validateAttachmentInputs(inputs);
    if (!checkedAttachments.ok) return err({ code: 'attachment-invalid', reason: checkedAttachments.reason });
    const effectiveRoot = opts.worktree?.worktree_path ?? workspaceRoot;
    const permission = postureAtStart(runtime, attendedNow);
    // REQ-SESSION-142: the session's log, opened before anything else the run says; closed at run end.
    const appender = this.deps.sessionLogAppender?.(dal, sessionId);
    const log = appender ? new SessionLog({ wall: this.deps.clocks.wall, level: runtime?.sessionLogLevel ?? 'WARNING', append: appender }) : null;
    const warn = (m: string) => { log?.warn(m); this.deps.warn(m); };
    for (const w of setup.value.warnings ?? []) warn(w);
    // session.start and row 0 commit before the run exists; their wire lines are held and replayed into the
    // run's forward queue so a consumer attached ahead of the start sees them too (REQ-EVENTS-069, REQ-SESSION-147).
    const entry: { owner?: ProjectionOwner; run?: Run; held: Committed[] } = { held: [] };
    const created = SessionWriter.create(
      {
        dal, sessionId, wall: this.deps.clocks.wall, retentionCap: setup.value.retentionCap ?? this.deps.retentionCap, warn,
        onCommitted: (c) => { entry.owner?.onCommitted(c); if (entry.run) entry.run.onCommitted(c); else entry.held.push(c); },
      },
      {
        workspaceRoot, pid: this.deps.pid, host: this.deps.host, task: prompt, persona: model.config.persona, maxIterations: model.config.iterationLimit,
        permissionMode: permission.effective, sandboxed: permission.sandboxed, sandboxBackend: permission.sandboxBackend,
        worktree: opts.worktree ? JSON.stringify(opts.worktree) : null, runType: opts.runType ?? 'task_run', ...(opts.sandboxMode ? { sandboxMode: opts.sandboxMode } : {}),
      },
    );
    if (!created.ok) {
      return err(created.error.code === 'lock-held'
        ? { code: 'lock-held', reason: `held by pid ${created.error.holder.pid} on ${created.error.holder.host}` }
        : { code: 'store', reason: created.error.reason });
    }
    const writer = created.value;
    const storedAttachments = persistAttachments(this.deps.sessionFilesDir(dal, sessionId), inputs);
    if (!storedAttachments.ok) return err({ code: 'attachment-invalid', reason: storedAttachments.reason });
    const owner = new ProjectionOwner({
      sessionId, seq: this.seq, timers: this.deps.clocks.timers, publisher: this.deps.publisher,
      readSession: () => { const row = dal.getSession(sessionId)!; const children = dal.childrenOf(sessionId); const { crashLeft, cancelLeft, resumable } = this.restingOf(dal, row, writer); return { ...toSessionRecord(row, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId), planGateOf(dal, row), resumable), ...projectSessionTodos(row, children), agents: children.map((c) => toAgentRecord(c, this.deps.clocks, { activity: writer.activity, reasoningFor: (p) => entry.run?.reasoningFor(p) ?? null, contextLimitFor: this.deps.contextLimitFor, session: { executionStatus: row.execution_status, updatedAt: row.updated_at }, crashLeft, cancelLeft })), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(row, dal.getLaunchAudit(sessionId)?.payload ?? null), wait: entry.run?.currentWait ?? null, compression: entry.run?.currentCompression ?? null, entryContext: entry.run?.entryContext ?? { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: entryToolsOf(dal, sessionId, entry.run, writer.activity), artifacts: artifactLinksOf(dal, sessionId), entryRoots: entryRootsOf(dal, sessionId, entry.run), pendingQuestions: entry.run?.pendingQuestions() ?? [] }; },
      readResident: () => dal.residentRows(sessionId).map((r) => ({ ...toTranscriptRow(r), ...(r.attachments === '[]' ? {} : { attachments: projectAttachments(this.deps.sessionFilesDir(dal, sessionId), r.attachments) }) })),
    });
    entry.owner = owner;
    const live: Live = { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry, memory: new ResilienceMemory(), artifacts: this.newArtifactStore(dal, sessionId, () => writer, warn), modeOverride: { value: null }, presence: new UserPresence({ record: warn }) };
    this.live.set(sessionId, live);
    const row = writer.appendRow('user', prompt, true, { attachments: storedAttachments.attachments });
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });

    const summary = new SummaryWriter({ file: `${this.deps.sessionFilesDir(dal, sessionId)}/summary.md`, timers: this.deps.clocks.timers, warn });
    const runRef: { run?: Run } = {};
    // REQ-EVENTS-053, PD-MONITOR-001: the run's model calls that are no agent's turn count against the run itself.
    const countUsage: CountUsage = (usage, ref) => { runRef.run?.countUsage(usage, ref); };
    const supervisorSetup = this.deps.supervisor?.(workspaceRoot, sessionId, countUsage) ?? null;
    const supervisors = supervisorSetup
      ? new SupervisorRegistry(sessionId, supervisorSetup.config, supervisorSetup.classifier, this.deps.clocks.timers)
      : null;
    // ADR-0015: the hook set is resolved once here, before the run exists, and is fixed for the run (REQ-HOOKS-131).
    // REQ-HOOKS-138 / PD-MONITOR-002: the port's `log` is the application log, not the session's own.
    let hooks: HookPort | null = null;
    if (this.deps.hooks) {
      try { hooks = this.deps.hooks({ sessionId, workspaceRoot, effectiveRoot, writer, warn, log: (m) => { this.deps.log?.(m); }, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false }); } catch (cause) { warn(`Could not resolve this run's hooks; continuing without them. (${String(cause)})`); }
    }
    const checkpoints = this.checkpointPortFor({ sessionId, workspaceRoot, effectiveRoot, isolated: opts.worktree !== undefined, dal, writer, warn, log: (m) => { log?.info(m); } });
    // REQ-ORCH-005/016: the pre-flight's grant reaches the entry role's tool port; the ports are created after the pre-flight ran.
    const decided: { grant: IntentGrant; intent: IntentCategory | undefined } = { grant: 'none', intent: undefined };
    const artifacts = live.artifacts!;
    // REQ-TOOLS-075: one override holder per RUN — installed here, read at every agent construction below.
    const modeOverride: { value: string | null } = { value: null };
    live.modeOverride = modeOverride;
    // PD-TOOLS-005: one away holder per RUN, on the same terms — reached by every agent through `baseCtx`, discarded with the run.
    const presence = new UserPresence({ record: warn });
    live.presence = presence;
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, presence, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    // With delegation the run creates the root's port itself (its own identity); the base port exists only without it.
    const tools: ToolPort | null = null;
    live.tools = tools;
    // REQ-ORCH-053: a run that has just taken the lock settles every non-terminal child a previous run left, before its first iteration.
    const stale = settleStaleChildren(dal, writer, sessionId, warn, artifacts);
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first iteration (REQ-ORCH-053)`);
    // REQ-ORCH-024: the configured policy; the run clamps it by the pre-flight's BUDGET cell (the `normal` cell stood in until playbooks existed).
    const budget = runtime?.childBudget ?? DEFAULT_BUDGET;
    const cap = runtime?.modelConcurrencyCap ?? null;
    const capFor = runtime?.modelCapFor ?? (() => cap);
    const preflight = this.deps.preflight;
    const run = new Run({
      sessionId, workspaceRoot, effectiveRoot, task: prompt, taskContent: [...(prompt === '' ? [] : [{ kind: 'text' as const, text: prompt }]), ...storedAttachments.content], taskId: `${sessionId}:main:1`, writer, owner, bus: this.bus, clocks: this.deps.clocks,
      ...(setup.value.personas ? { personas: setup.value.personas } : {}),
      ...(setup.value.models ? { models: setup.value.models } : {}),
      // REQ-WORKSPACE-060 (ADR-0063): the session's always-active context units, as a getter the run calls at
      // every agent construction (REQ-CONFIG-166 reads the policy at creation, never mid-agent).
      ...(setup.value.contextUnits ? { contextUnits: setup.value.contextUnits } : {}),
      resilience: { memory: live.memory!, catalogue: setup.value.resilience?.catalogue ?? [], fallbackModel: setup.value.resilience?.fallbackModel ?? null },
      ...(runtime?.childTimeoutMs === undefined ? {} : { childTimeoutMs: runtime.childTimeoutMs as Millis }),
      ...(runtime?.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: runtime.childStallTimeoutMs as Millis }),
      ...(runtime?.pauseToolDeadlineMs === undefined ? {} : { pauseToolDeadlineMs: runtime.pauseToolDeadlineMs as Millis }),
      ...(this.deps.terminals ? { terminals: this.deps.terminals(sessionId) } : {}),
      messageLimit: runtime?.messageLimit ?? null, onPaused: (info) => this.deps.onRunPaused?.(sessionId, info),
      // REQ-ORCH-152/153: the plan gate as a launch input; the run settles the hold itself once the intent is known.
      ...(this.planLaunchFor(dal, sessionId, runtime) ?? {}),
      backend: model.backend, config: model.config, tools, permission, configurationSnapshot: setup.value.configurationSnapshot, pid: this.deps.pid, host: this.deps.host,
      // Part AH (ADR-0060): the configuration's half joined to the session's backend, timers and credentials. It sits
      // at the top level and NOT inside the tools block: an agent with no tool port still holds a conversation.
      ...(model.compression ? { compression: { backend: meteredBackend(model.backend, countUsage), timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor, model: model.compression.model, timeoutMs: millis(model.compression.timeoutMs), charsPerToken: model.compression.charsPerToken, preserveRecentTurns: model.compression.preserveRecentTurns, triggerFor: model.compression.triggerFor } } : {}),
      // PD-ORCH-005: every run's store for the conversation and iteration records, with or without a tool port.
      dal, readSession: () => dal.getSession(sessionId), warn, hooks, checkpoints, ...(this.deps.notice ? { notice: this.deps.notice } : {}),
      onSaved: (g) => summary.rebuild(g, () => dal.getSession(sessionId)),
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn, countUsage }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        // REQ-LIBRARY-093: a publish records the instance's canonical name — the root's comes apart from its agent name, its persona.
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, modeOverride: modeOverride.value, grant: decided.grant, intent: decided.intent, artifacts: artifactOps(artifacts, { canonicalName: canonicalName ?? agentName, persona, conversationId: parentId }), readTodo: () => runRef.run?.agentTodoFor(parentId, depth === 0) ?? null, writeTodo: (document) => runRef.run?.replaceAgentTodo(parentId, depth === 0, document) ?? false, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false, writeClaimFor: (rel) => runRef.run?.writeClaimFor(parentId, rel) ?? null }),
        artifacts, budget, modelCap: capFor,
        summariser: { backend: meteredBackend(model.backend, countUsage), model: model.summariser?.model ?? model.config.model, thinking: model.summariser?.thinking ?? model.config.thinking, timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor },
      } : {}),
      ...(runtime?.drainTimeoutMs === undefined ? {} : { drainTimeoutMs: runtime.drainTimeoutMs as Millis }),
      ...(opts.initialTodo === undefined ? {} : { initialTodo: opts.initialTodo }),
    });
    runRef.run = run;
    for (const c of entry.held.splice(0)) run.onCommitted(c);
    entry.run = run;
    live.run = run;
    if (this.deps.onRunResult) {
      const onRunResult = this.deps.onRunResult;
      this.bus.attach(sessionId, { mode: 'blocking', deliver: (e) => { if (e.event === 'result' && run.outcome) onRunResult(sessionId, run.outcome); } });
    }
    live.running = run.start().finally(() => { delete entry.run; log?.info(`run ended ${run.outcome?.status ?? 'unknown'}`); log?.close(); });
    return ok(sessionId);
  }

  /** REQ-SESSION-114..116: append first, then continue through the ordinary Run lifecycle. */
  prompt(sessionId: SessionId, prompt: string, inputs: readonly ImageAttachmentInput[] = []): Result<TranscriptRow, { code: string; reason: string }> {
    // ADR-0005: a lock the continue took is given back when it launches no run; a launched run's teardown releases it.
    const hold: HoldSlot = {};
    const r = this.promptHeld(sessionId, prompt, inputs, hold);
    if (!r.ok) hold.release?.();
    return r;
  }

  private promptHeld(sessionId: SessionId, prompt: string, inputs: readonly ImageAttachmentInput[], hold: HoldSlot): Result<TranscriptRow, { code: string; reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery before continuing work: ${storeFailure}` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const storedForSetup = s.dal.getSession(sessionId);
    const setup = this.setupFor(storedForSetup?.workspace_root ?? '', this.deps.attended?.() ?? false, sessionId, storedForSetup ? effectiveRootOf(storedForSetup).root : '', resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    if (inputs.length > 0 && setup.value.model.config.model.acceptsImageInput !== true) return err({ code: 'image-input-unsupported', reason: 'The selected model does not declare image input support.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    // ADR-0005: the lock is taken back before the first write, and the run launched below holds it (`holdForContinue`).
    // This replaces a re-claim through `resume`, which returns at once for a session live here and so claimed nothing.
    const held = this.holdForContinue(s);
    if (!held.ok) return held;
    hold.release = held.value.release;
    const payload = buildContinuationPayload(s.dal, stored, prompt, todo.value);
    const attachments = persistAttachments(this.deps.sessionFilesDir(s.dal, sessionId), inputs);
    if (!attachments.ok) return err({ code: 'attachment-invalid', reason: attachments.reason });
    const row = s.writer.appendRow('user', prompt, true, { attachments: attachments.attachments });
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });
    // PD-ORCH-003: a fresh prompt does NOT clear the release. REQ-ORCH-154's "one-way for the run that received
    // it" is widened to one-way for the SESSION, because the unit a user plans is the piece of work and not the
    // run — re-planning a follow-up to a plan they just approved is the ceremony the directive was raised against.
    // What re-arms is explicit and never inferred: a new session (the column defaults to 0), or `planRearm`.
    // PD-ORCH-005 clause 4: where an iteration is open, the new message is the resumed root's next message.
    this.launchContinuation(s, prompt, payload, todo.value, previousIntent(s.dal, sessionId), setup.value, attachments.content, undefined, { message: [{ kind: 'text', text: prompt }, ...attachments.content] });
    return ok(row.value);
  }

  /**
   * The run's setup: the root's `configure` (files + live state, ADR-0037 Tier B) or the process-wide model and runtime.
   *
   * REQ-WORKSPACE-050: `executionRoot` is the root the run WORKS in — the worktree of an isolated session, the
   * base workspace otherwise. Configuration itself is loaded from the base (REQ-GIT-019); the execution root is
   * carried because the workspace CONTEXT FILES are read from it, which is the half of that requirement the
   * recorded defect found unbuilt. A caller that has no binding passes the base root.
   */
  private setupFor(workspaceRoot: string, attended: boolean, sessionId: SessionId, executionRoot: string, entryPersona?: string): Result<RunSetup, StartRefusal> {
    const refused = (code: string, summary: string): StartRefusal => ({ code, reason: summary, failedBeforeStart: true, result: { status: 'error', session_id: '', stop_reason: '', summary, error: summary } });
    if (this.deps.configure) {
      const r = this.deps.configure(workspaceRoot, { attended, sessionId, executionRoot, ...(entryPersona === undefined ? {} : { entryPersona }) });
      // REQ-EVENTS-021 / REQ-CONFIG-478: refused before it starts, carrying the report.
      return r.ok ? ok(r.value) : err(refused('configuration', r.error.reason));
    }
    if (!this.deps.model) return err(refused('no-model', 'No model is configured, so the run was refused before it started.'));
    return ok({ model: this.deps.model, ...(this.deps.runtime ? { runtime: this.deps.runtime } : { runtime: { permissionMode: '', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' } }) });
  }

  /**
   * `openIteration` is PD-ORCH-005 clauses 4 and 6 for a session whose last run left an iteration open: resume it — with
   * the message a continue by message delivers to its root, which clause 17 also appends as a task the resumed iteration
   * holds — or decline it. Every route resumes unless told to decline.
   */
  private launchContinuation(s: Live, prompt: string, payload: string, todo: TodoDocument | undefined, priorIntent: IntentCategory | null, setupIn: RunSetup, attachmentContent: readonly ContentPart[] = [], plan?: { readonly cycle: number; readonly changes: string }, openIteration: OpenIterationChoice = { message: null }, appendsTask = true): void {
    const { model, runtime } = setupIn;
    const sessionId = s.writer.sessionId;
    const storedRow = s.dal.getSession(sessionId)!;
    const workspaceRoot = storedRow.workspace_root;
    // REQ-GIT-019: a continuation of a bound session works in its tree (the caller already refused a missing one).
    const effectiveRoot = effectiveRootOf(storedRow).root;
    const permission = postureAtStart(runtime, this.deps.attended?.() ?? false);
    // REQ-SESSION-142: one log per run — the one `resume` opened closes when the first continuation ends, so
    // every continuation opens its own rather than writing into a closed one.
    s.log?.close();
    const appender = this.deps.sessionLogAppender?.(s.dal, sessionId);
    s.log = appender ? new SessionLog({ wall: this.deps.clocks.wall, level: runtime?.sessionLogLevel ?? 'WARNING', append: appender }) : null;
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    for (const w of setupIn.warnings ?? []) warn(w);
    const summary = new SummaryWriter({ file: `${this.deps.sessionFilesDir(s.dal, sessionId)}/summary.md`, timers: this.deps.clocks.timers, warn });
    const runRef: { run?: Run } = {};
    let hooks: HookPort | null = null;
    if (this.deps.hooks) {
      // REQ-HOOKS-138 / PD-MONITOR-002: the port's `log` is the application log, not the session's own.
      try { hooks = this.deps.hooks({ sessionId, workspaceRoot, effectiveRoot, writer: s.writer, warn, log: (m) => { this.deps.log?.(m); }, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false }); } catch (cause) { warn(`Could not resolve this continuation's hooks; continuing without them. (${String(cause)})`); }
    }
    // REQ-GIT-051: numbering continues across a resume — the port reads the rows and the refs at each capture.
    const checkpoints = this.checkpointPortFor({ sessionId, workspaceRoot, effectiveRoot, isolated: effectiveRootOf(storedRow).binding !== null, dal: s.dal, writer: s.writer, warn, log: (m) => { s.log?.info(m); } });
    const decided: { grant: IntentGrant; intent: IntentCategory | undefined } = { grant: 'none', intent: undefined };
    // Part Y (REQ-ORCH-149): the store outlives the run — a continuation reads the artifacts earlier iterations published.
    const artifacts = s.artifacts ?? this.newArtifactStore(s.dal, sessionId, () => s.writer, warn);
    s.artifacts = artifacts;
    // REQ-TOOLS-075: a continuation is a new run, so it starts with no override — a previous run's switch is not inherited.
    const modeOverride: { value: string | null } = { value: null };
    s.modeOverride = modeOverride;
    // PD-TOOLS-005: a continuation is a new run, so it starts with the user present — a previous run's away stretch is not inherited.
    const presence = new UserPresence({ record: warn });
    s.presence = presence;
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer: s.writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, presence, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    s.tools = null;
    // PD-ORCH-005 clause 3: what a crash left is recorded before the settle, which leaves every `paused` agent as it is.
    this.recordCrashOf(s.dal, s.writer, sessionId, warn, artifacts);
    const stale = settleStaleChildren(s.dal, s.writer, sessionId, warn, artifacts);
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first continuation iteration (REQ-ORCH-053)`);
    const open = s.dal.openIterationOf(sessionId);
    /*
     * PD-ORCH-005 clauses 4 and 10: what the resumed root is told — the notice of its background sessions, then the new
     * message a continue by message delivers as the user's next message in its conversation, so the user's message is
     * the last it reads — recorded here, at the continue, so a rest, a quit or the explicit cancel that lands before the
     * resumed iteration's first turn never loses it (found by phase 4's review: the message lived in memory until that
     * turn, and the notice followed it).
     */
    if (open && openIteration !== 'decline') {
      const tell = (m: ChatMessage): void => { s.writer.recordAgentMessage(open.root_task_id, open.iteration, 'message', m); };
      // A continue whose run came to rest before the resumed root took a step has told it already: a notice or an offer
      // list it has not yet answered is not repeated (found by phase 4's third review).
      const recorded = s.dal.agentConversation(sessionId, open.root_task_id);
      const conversation = conversationOf(recorded);
      const unanswered = toldSinceLastAnswer(conversation);
      const notice = resumeNoticeOf(s.dal, sessionId, open.root_task_id, this.deps.terminals?.(sessionId));
      if (notice !== null && !unanswered.has(textOfMessage(notice))) tell(notice);
      /*
       * PD-ORCH-004 revision 3: a resumed root is told the offers it may take up, as a new iteration's reads them in the
       * handoff it is not sent (found by phase 6's second review) — only those its conversation does not already hold:
       * its own children's reports carry theirs, and an offer told once is not told again, so a root that had answered
       * and waits takes no step for a list it has read (found by phase 6's third and fourth reviews). PD-ORCH-004 revision
       * 4: an offer a list it holds left out as earlier is held too, so it is not named in a second list (OQ-107).
       */
      const told = offersHeldIn(s.dal, sessionId, recorded);
      const offers = openOffersText(s.dal, sessionId, (taskId) => !told.has(taskId));
      if (offers !== '') tell({ role: 'user', content: [{ kind: 'text', text: offers }] });
      if (openIteration.message !== null && openIteration.message.length > 0) tell({ role: 'user', content: [...openIteration.message] });
    }
    /*
     * OQ-102's reading beside PD-ORCH-005 clause 17, which governs only a continue that delivers a message, and the repair
     * of `the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md` (departing from REQ-ORCH-004,
     * which no directive governs for these continues): a continue that delivers no
     * message — the Continue action, "continue without them", and the message-limit resolution's 'continue' and
     * 'double' (REQ-SESSION-110, REQ-ORCH-086/087), which `continueSession` launches the same way — restates the last
     * request, so it appends no task while the
     * todo still holds that request unfinished: a continue's message a resumed iteration left pending or holds, or any
     * request whose task a rest put back. Its task is then taken up as it stands. The todo is judged as the run will read
     * it: a message a closed iteration still holds — a process that died between that iteration's close and the save of
     * its release — is settled first, as the run's constructor settles it (`settleClosedIterations`), so a message it
     * returns to pending is not appended a second time (found by the iteration lane review); and so is an iteration's own
     * task such a death left in progress, so a request its closed iteration put back is taken up and not appended again.
     */
    const judged = todo === undefined ? null : Todo.fromDocument(todo);
    if (judged) settleClosedIterations(judged, s.dal, sessionId, open);
    const restatesUnfinished = (openIteration === 'decline' || openIteration.message === null) && judged !== null && judged.holdsUnfinished(prompt, open ? { iteration: open.iteration, taskId: open.todo_task_id } : null);
    // REQ-EVENTS-053, PD-MONITOR-001: the run's model calls that are no agent's turn count against the run itself.
    const countUsage: CountUsage = (usage, ref) => { runRef.run?.countUsage(usage, ref); };
    const supervisorSetup = this.deps.supervisor?.(workspaceRoot, sessionId, countUsage) ?? null;
    const supervisors = supervisorSetup ? new SupervisorRegistry(sessionId, supervisorSetup.config, supervisorSetup.classifier, this.deps.clocks.timers) : null;
    const budget = runtime?.childBudget ?? DEFAULT_BUDGET;
    const cap = runtime?.modelConcurrencyCap ?? null;
    const capFor = runtime?.modelCapFor ?? (() => cap);
    const preflight = this.deps.preflight;
    // Part Q / REQ-SESSION-196: a loaded session's exhausted pairs and model override come back from its timeline, once.
    if (s.memory === null) {
      const resolve = (key: string): ModelChoice | null => { const r = setupIn.models?.(key); return r && r.ok ? r.choice : null; };
      s.memory = ResilienceMemory.rehydrate(s.dal.timelineOf(sessionId), resolve, warn);
      if (s.memory.exhausted.size > 0 || s.memory.overrideCount > 0) s.log?.info(`resilience memory rehydrated: ${s.memory.exhausted.size} exhausted pair(s), ${s.memory.overrideCount} override(s)`);
    }
    const run = new Run({
      sessionId, workspaceRoot, effectiveRoot, task: payload, taskContent: [{ kind: 'text', text: payload }, ...attachmentContent], taskLabel: prompt, taskId: continuedTaskId(s.dal, sessionId, todo),
      ...(setupIn.personas ? { personas: setupIn.personas } : {}),
      ...(setupIn.models ? { models: setupIn.models } : {}),
      // REQ-WORKSPACE-073 (ADR-0063): a continuation is where an invoked skill first reaches a model — the
      // command is typed between prompts, so the units MUST be re-read here and not carried from the launch.
      ...(setupIn.contextUnits ? { contextUnits: setupIn.contextUnits } : {}),
      resilience: { memory: s.memory, catalogue: setupIn.resilience?.catalogue ?? [], fallbackModel: setupIn.resilience?.fallbackModel ?? null },
      ...(runtime?.childTimeoutMs === undefined ? {} : { childTimeoutMs: runtime.childTimeoutMs as Millis }),
      ...(runtime?.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: runtime.childStallTimeoutMs as Millis }),
      ...(runtime?.pauseToolDeadlineMs === undefined ? {} : { pauseToolDeadlineMs: runtime.pauseToolDeadlineMs as Millis }),
      ...(this.deps.terminals ? { terminals: this.deps.terminals(sessionId) } : {}),
      messageLimit: runtime?.messageLimit ?? null, onPaused: (info) => this.deps.onRunPaused?.(sessionId, info),
      // REQ-ORCH-152/153/154: a continuation holds again unless approval already released this run, and a revise
      // cycle passes its own number and the changes the user stated.
      ...(this.planLaunchFor(s.dal, sessionId, runtime, plan) ?? {}),
      writer: s.writer, owner: s.owner, bus: this.bus, clocks: this.deps.clocks, backend: model.backend, config: model.config, configurationSnapshot: setupIn.configurationSnapshot,
      // Part AH (ADR-0060): the configuration's half joined to the session's backend, timers and credentials. It sits
      // at the top level and NOT inside the tools block: an agent with no tool port still holds a conversation.
      ...(model.compression ? { compression: { backend: meteredBackend(model.backend, countUsage), timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor, model: model.compression.model, timeoutMs: millis(model.compression.timeoutMs), charsPerToken: model.compression.charsPerToken, preserveRecentTurns: model.compression.preserveRecentTurns, triggerFor: model.compression.triggerFor } } : {}),
      // PD-ORCH-005: the store the conversation record, the iteration record and a left-open iteration are read from —
      // every run's, with or without a tool port.
      dal: s.dal,
      // PD-ORCH-005 clause 17: a message this continue delivered to the resumed root is also a task that closes with it.
      ...(open ? { openIteration: { resume: openIteration !== 'decline', delivered: openIteration !== 'decline' && openIteration.message !== null } } : {}),
      // PD-ORCH-004 revision 4: the offers the payload's handoff covers, named or left out, told no later root again.
      handoffOffers: openOfferIds(s.dal, sessionId),
      tools: null, permission, pid: this.deps.pid, host: this.deps.host, readSession: () => s.dal.getSession(sessionId), warn,
      continuation: true, ...(todo ? { resumeTodo: todo } : {}), ...(appendsTask && !restatesUnfinished ? {} : { appendsTask: false }), ...(hooks ? { hooks } : {}), checkpoints,
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      onSaved: (generation) => summary.rebuild(generation, () => s.dal.getSession(sessionId)),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn, countUsage, previousIntent: priorIntent, hasUnfinishedWork: true }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        // REQ-LIBRARY-093: a publish records the instance's canonical name — the root's comes apart from its agent name, its persona.
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, modeOverride: modeOverride.value, grant: decided.grant, intent: decided.intent, artifacts: artifactOps(artifacts, { canonicalName: canonicalName ?? agentName, persona, conversationId: parentId }), readTodo: () => runRef.run?.agentTodoFor(parentId, depth === 0) ?? null, writeTodo: (document) => runRef.run?.replaceAgentTodo(parentId, depth === 0, document) ?? false, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false, writeClaimFor: (rel) => runRef.run?.writeClaimFor(parentId, rel) ?? null }),
        artifacts, budget, modelCap: capFor,
        summariser: { backend: meteredBackend(model.backend, countUsage), model: model.summariser?.model ?? model.config.model, thinking: model.summariser?.thinking ?? model.config.thinking, timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor },
      } : {}),
      ...(runtime?.drainTimeoutMs === undefined ? {} : { drainTimeoutMs: runtime.drainTimeoutMs as Millis }),
    });
    runRef.run = run;
    s.commitTarget!.run = run;
    s.run = run;
    if (this.deps.onRunResult) {
      const onRunResult = this.deps.onRunResult;
      this.bus.attach(sessionId, { mode: 'blocking', deliver: (event) => { if (event.event === 'result' && run.outcome) onRunResult(sessionId, run.outcome); } });
    }
    s.running = run.start().finally(() => { if (s.commitTarget) delete s.commitTarget.run; s.log?.info(`continued run ended ${run.outcome?.status ?? 'unknown'}`); s.log?.close(); });
  }

  // Part AO
  /**
   * Part AO — the asynchronous entry the run host awaits. `forceCompression` settles only once every live conversation
   * has (REQ-MONITOR-092), which no synchronous answer can express; every other operation is `control` below, answered
   * at once. One entry rather than an async `control` so the forty-odd synchronous callers keep their shape.
   */
  async controlAsync(req: ControlRequest): Promise<ControlResult> {
    // PD-TOOLS-005: the one control that does not pass through `control` is still the user's input to the run.
    if (req.op === 'forceCompression') { this.live.get(asSessionId(req.sessionId))?.presence.returned(); return this.forceCompression(req); }
    return this.control(req);
  }

  /**
   * REQ-CHAT-078..081, REQ-MONITOR-090..096 (Part AO): the manual pass over every live conversation. Refused with
   * `no_run` when no run is executing (REQ-MONITOR-090/271's reason), with `no_active_conversations` when the run
   * holds none (REQ-MONITOR-091, REQ-CHAT-079 — also the shape of a run configured without a compressor). Otherwise
   * every live conversation compresses concurrently and the report carries the count and the per-agent failures
   * (REQ-CHAT-080, REQ-MONITOR-094); the completion toast or the persistent incomplete notice is raised HERE, from the
   * process that holds the figures, through the host's two channels. Threshold configuration is never read
   * (REQ-CHAT-081, REQ-MONITOR-096) — the registry's pass calls the runner's `manual`, which does not consult it.
   */
  private async forceCompression(req: ControlRequest): Promise<ControlResult> {
    const sessionId = asSessionId(req.sessionId);
    const s = this.live.get(sessionId);
    const run = s?.run;
    if (!s || !run || run.isEnded) return { ok: false, refusal: { code: 'no_run', message: 'No run is active.' } };
    // PD-ORCH-005 clause 2: a compression is a model call, and none is made once the run is coming to rest.
    if (run.comingToRest) return { ok: false, refusal: { code: 'run_coming_to_rest', message: 'The run is coming to rest; nothing is compressed until it is continued.' } };
    const report = await run.forceCompression();
    if (report === null) return { ok: false, refusal: { code: 'no_active_conversations', message: 'No active agent contexts are available to compress.' } };
    const total = report.compressed + report.unchanged + report.failed.length;
    if (report.failed.length > 0) {
      // REQ-CHAT-080 / REQ-MONITOR-094: each failing agent with its reason, in the copyable detail block (REQ-NOTIFY-037/038).
      this.deps.report?.({
        severity: 'error', title: 'Context compression incomplete',
        message: `${report.compressed} of ${total} active agent context(s) compressed; ${report.failed.length} failed.`,
        detail: report.failed.map((f) => `${f.agent}: ${f.reason}`).join('\n'),
        sessionId,
      });
    } else {
      this.deps.acknowledge?.('ok', `Compressed context for ${report.compressed} active agent(s).`, report.unchanged > 0 ? `${report.unchanged} agent context(s) had nothing between the original request and the preserved turns and were left as they were.` : undefined);
    }
    s.log?.info(`manual compression: ${report.compressed} compressed, ${report.unchanged} unchanged, ${report.failed.length} failed${report.failed.length > 0 ? ` (${report.failed.map((f) => `${f.agent}: ${f.reason}`).join('; ')})` : ''}`);
    return { ok: true, compression: { compressed: report.compressed, unchanged: report.unchanged, failed: [...report.failed] } };
  }

  /**
   * REQ-CHAT-082..084 (Part AO): the confirmed clear, by run state. Both routes reach the writer's one transaction —
   * with an active local run it is the run's own writer, so the run's next write lands on an emptied record; with a
   * loaded idle session it is the same writer held for the session, and the owner re-projects the view. A session
   * that is not loaded cannot be addressed by a control at all (REQ-MONITOR-007's `false`). The failure sentences
   * are raised here, by the process that knows which of the two applies: a store failure is the persistent notice
   * "Could not clear transcript"; a clear arriving while one is already in progress is the busy toast — which the
   * store's synchronous transactions make unreachable in this build, stated rather than hidden.
   */
  private readonly clearing = new Set<SessionId>();
  private clearTranscript(s: Live | undefined, req: ControlRequest): ControlResult {
    if (!s) return { ok: false };
    const sessionId = asSessionId(req.sessionId);
    if (this.clearing.has(sessionId)) {
      this.deps.acknowledge?.('warn', 'Transcript is busy and could not be cleared.');
      return { ok: false, refusal: { code: 'transcript_busy', message: 'Transcript is busy and could not be cleared.' } };
    }
    this.clearing.add(sessionId);
    try {
      const r = s.writer.clearTranscript();
      if (!r.ok) {
        const reason = r.error.code === 'history-failed' ? r.error.reason : r.error.code;
        this.deps.report?.({ severity: 'error', title: 'Could not clear transcript', message: 'The transcript rows were left as they were.', detail: reason, sessionId });
        return { ok: false, refusal: { code: 'clear_failed', message: `Could not clear transcript: ${reason}` } };
      }
      s.log?.info(`transcript cleared: ${r.value.removed} row(s) removed${s.run && !s.run.isEnded ? ' during a live run' : ''}`);
      this.deps.acknowledge?.('ok', 'Transcript cleared. Session artifacts and agent state were kept.');
      return { ok: true };
    } finally {
      this.clearing.delete(sessionId);
    }
  }

  /** ADR-0010 channel 1: `{ok, value?}`; `false` when the run cannot honour it (REQ-MONITOR-007/011). */
  control(req: ControlRequest): ControlResult {
    const s = this.live.get(asSessionId(req.sessionId));
    const run = s?.run;
    if (req.op === 'editTodo' && (!run || run.isEnded)) return this.editStoredTodo(s, req);
    // Part AO: the clear reaches a loaded session with or without a run (REQ-CHAT-084's two routes); the compression
    // pass is asynchronous and answered by `controlAsync` — a synchronous caller gets the refusal it would get with no run.
    // PD-TOOLS-005: a confirmed clear on a live run is the user's input to it too (REQ-MONITOR-004, REQ-CHAT-084).
    if (req.op === 'clearTranscript') { if (run && !run.isEnded) s!.presence.returned(); return this.clearTranscript(s, req); }
    if (req.op === 'forceCompression') return { ok: false, refusal: { code: 'no_run', message: 'No run is active.' } };
    // PD-ORCH-005 clause 16: one paused child is cancellable while its session rests, with no run behind it.
    if (req.op === 'cancelAgent' && (!run || run.isEnded)) return this.cancelPausedAtRest(s, req);
    if (!run || run.isEnded) return { ok: false };
    // PD-TOOLS-005: input the user sends to a live run's session — an answer, a message, a run control, a mode change —
    // ends the run's away stretch, before the operation is judged. A shutdown announcement is the application's, not the user's.
    if (req.op !== 'announceShutdown') s!.presence.returned();
    const text = (key: string): string | null => { const v = req.args[key]; return typeof v === 'string' && v.trim() !== '' ? v : null; };
    switch (req.op) {
      case 'cancel': {
        // REQ-SESSION-186: a second activation while the stop is pending forces.
        const force = req.args['force'] === true || run.stop.requested;
        run.stop.request('user_cancelled', force);
        s!.writer.save('cancelling');
        return { ok: true };
      }
      case 'pause':
        // REQ-MONITOR-123: whole-run only; `pausing` is written only after the run accepted (REQ-MONITOR-296).
        return run.pause() ? { ok: true } : { ok: false };
      case 'submitSteeringPrompt': {
        // REQ-MONITOR-008/133: both arguments required; the new prompt's id is the string value (REQ-MONITOR-005).
        const agentId = text('agentId');
        const content = text('text');
        if (agentId === null || content === null) return { ok: false };
        const id = run.steer(agentId, content);
        return id === null ? { ok: false } : { ok: true, value: id };
      }
      case 'createQueuedPrompt': {
        const content = text('text');
        // REQ-CHAT-038: empty content is an invalid value and is rejected before anything is written; `text` already
        // refuses an absent or blank argument (REQ-MONITOR-008), so the two rules meet at one check.
        if (content === null) return { ok: false };
        /**
         * REQ-CHAT-039 (Part AB): the optional context snapshot travels as one JSON object, and ownership is resolved
         * from it and from the addressed session before the row exists. A snapshot that names another session is a
         * refusal, not a silent re-scoping; an unscoped prompt cannot be represented and is refused with OQ-51 as the
         * reason rather than guessed at.
         */
        const snapshot = readContextSnapshot(req.args['context']);
        const ownership = resolveQueueOwnership(req.sessionId, snapshot);
        if (ownership.kind !== 'scoped') return { ok: false };
        const r = s!.writer.queuePrompt(randomUUID(), content, snapshot === null || snapshot === undefined ? null : JSON.stringify(snapshot));
        if (!r.ok) return { ok: false };
        s!.owner.reconcile();
        return { ok: true, value: r.value.prompt_id };
      }
      case 'editQueuedPrompt': {
        const promptId = text('promptId');
        const content = text('text');
        if (promptId === null || content === null) return { ok: false };
        const r = s!.writer.editQueuedPrompt(promptId, content);
        if (r.ok && r.value) s!.owner.reconcile();
        return r.ok && r.value ? { ok: true } : { ok: false };
      }
      case 'removeQueuedPrompt': {
        const promptId = text('promptId');
        if (promptId === null) return { ok: false };
        const r = s!.writer.removeQueuedPrompt(promptId);
        if (r.ok && r.value) s!.owner.reconcile();
        return r.ok && r.value ? { ok: true } : { ok: false };
      }
      case 'editTodo': {
        const op = text('op');
        const id = text('id') ?? '';
        const body = typeof req.args['text'] === 'string' ? (req.args['text'] as string) : '';
        const requestedSource = req.args['source'];
        const source = requestedSource === 'child' || requestedSource === 'agent' || requestedSource === 'planner' ? requestedSource : 'planner';
        const ownerId = typeof req.args['ownerId'] === 'string' && req.args['ownerId'] !== '' ? req.args['ownerId'] : null;
        const phaseId = typeof req.args['phaseId'] === 'string' ? req.args['phaseId'] : 'main';
        if ((op !== 'add' && op !== 'update' && op !== 'remove') || (op !== 'add' && id === '') || (op !== 'remove' && body.trim() === '')) return { ok: false };
        const edited = run.editTodo(op, id, body, source, ownerId, phaseId);
        return edited.changed ? { ok: true, ...(requestedSource === undefined || edited.id === undefined ? {} : { value: edited.id }) } : { ok: false };
      }
      case 'setModel': {
        const key = text('model');
        return key !== null && run.setEntryModel(key) ? { ok: true } : { ok: false };
      }
      case 'setReasoning': {
        const level = text('level');
        return level !== null && ['low', 'medium', 'high', 'max', 'unset'].includes(level) && run.setEntryReasoning(level as ThinkingLevel) ? { ok: true } : { ok: false };
      }
      case 'announceShutdown':
        // REQ-MONITOR-131: the run is asked to stop for shutdown; anything blocked on a person is released first (the stop's own rule).
        run.stop.request('application_shutdown');
        return { ok: true };
      case 'setPermissionMode': {
        // REQ-MONITOR-008: an empty required argument is refused before it reaches the run.
        const mode = req.args['mode'];
        if (typeof mode !== 'string' || mode.trim() === '') return { ok: false };
        const r = run.setPermissionMode(mode, 'user');
        // REQ-TOOLS-073's second half: the change reaches the live agents through the run, and the session-level
        // override is what carries it to the agents this run builds afterwards — every delegated child included.
        if (r.ok) s!.modeOverride.value = r.effective;
        return r.ok ? { ok: true } : { ok: false };
      }
      case 'cancelAgent': {
        // REQ-MONITOR-008/009: an empty id is refused; the reserved run id cancels the run.
        const agentId = req.args['agentId'];
        if (typeof agentId !== 'string' || agentId.trim() === '') return { ok: false };
        return run.cancelAgent(agentId) ? { ok: true } : { ok: false };
      }
      case 'answerApproval': {
        // REQ-MONITOR-010: an unrecognised option is refused; REQ-MONITOR-254: routed by request id, undeliverable → false.
        const requestId = req.args['requestId'];
        const option = req.args['option'];
        if (typeof requestId !== 'string' || requestId === '' || typeof option !== 'string' || !(APPROVAL_OPTIONS as readonly string[]).includes(option)) return { ok: false };
        return this.answerApproval(requestId, option as ApprovalOption) ? { ok: true } : { ok: false };
      }
      case 'answerQuestion': {
        /*
         * Part AC — REQ-CHAT-101's "Submit delivers every step's answer in one payload", carried across
         * REQ-MONITOR-013's boundary. The answers map REQ-CHAT-095 fixes is `{step_id: {selected_option,
         * freeform_text}}` — a record of RECORDS, which `ControlRequestSchema`'s argument value space (a scalar, an
         * array of scalars, or a record of scalars) cannot express. Rather than widen that space, the payload is two
         * flat maps keyed by step id, each a record of scalars the schema already admits, recombined here into the
         * one map the tool receives. The operation is still one request carrying every step's answer.
         * REQ-CHAT-102 rests on the return: `false` here is what keeps the modal open and refuses to report success.
         */
        const requestId = req.args['requestId'];
        if (typeof requestId !== 'string' || requestId === '') return { ok: false };
        const selected = req.args['selected'];
        const freeform = req.args['freeform'];
        const answers: QuestionAnswers = {};
        const scalarMap = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});
        const sel = scalarMap(selected);
        const free = scalarMap(freeform);
        for (const id of new Set([...Object.keys(sel), ...Object.keys(free)])) {
          answers[id] = {
            selected_option: typeof sel[id] === 'string' && sel[id] !== '' ? sel[id] : null,
            freeform_text: typeof free[id] === 'string' && free[id] !== '' ? free[id] : null,
          };
        }
        return this.answerQuestions(requestId, answers) ? { ok: true } : { ok: false };
      }
      case 'cancelQuestions': {
        // REQ-CHAT-101: closing the stepper cancels the whole prompt and releases the waiting call at once.
        const requestId = req.args['requestId'];
        if (typeof requestId !== 'string' || requestId === '') return { ok: false };
        return this.cancelQuestions(requestId) ? { ok: true } : { ok: false };
      }
      default:
        // REQ-MONITOR-004's remaining operations have no mechanism behind them in this build (decision 9 of the plan) and answer false.
        return { ok: false };
    }
  }

  /** REQ-CHAT-090: a paused or completed session edits the validated stored source and republishes it. */
  private editStoredTodo(s: Live | undefined, req: ControlRequest): ControlResult {
    if (!s) return { ok: false };
    const stored = s.dal.getSession(s.writer.sessionId);
    if (!stored) return { ok: false };
    const op = req.args['op'];
    const requestedSource = req.args['source'];
    const source = requestedSource === 'child' || requestedSource === 'agent' || requestedSource === 'planner' ? requestedSource : 'planner';
    const id = typeof req.args['id'] === 'string' ? req.args['id'] : '';
    const body = typeof req.args['text'] === 'string' ? req.args['text'] : '';
    const ownerId = typeof req.args['ownerId'] === 'string' && req.args['ownerId'] !== '' ? req.args['ownerId'] : null;
    const phaseId = typeof req.args['phaseId'] === 'string' ? req.args['phaseId'] : 'main';
    if ((op !== 'add' && op !== 'update' && op !== 'remove') || (op !== 'add' && id === '') || (op !== 'remove' && body.trim() === '')) return { ok: false };
    const mint = () => randomUUID().replaceAll('-', '').slice(0, 8);
    let assigned: string | undefined;
    if (source === 'child') {
      const child = ownerId === null ? undefined : s.dal.childrenOf(s.writer.sessionId).find((candidate) => candidate.task_id === ownerId);
      if (!child?.todo) return { ok: false };
      try {
        const current: unknown = JSON.parse(child.todo);
        if (!isAgentTodoDocument(current)) return { ok: false };
        const edited = editAgentTodo(current, op, id, body, phaseId, mint);
        if (!edited.changed) return { ok: false };
        s.dal.setChildTodo(s.writer.sessionId, child.task_id, JSON.stringify(edited.document), child.tool_calls);
        assigned = edited.id;
      } catch { return { ok: false }; }
    } else {
      const decoded = decodeStoredTodo(stored.todo);
      if (source === 'agent') {
        if (decoded.agent === null) return { ok: false };
        const edited = editAgentTodo(decoded.agent, op, id, body, phaseId, mint);
        if (!edited.changed) return { ok: false };
        assigned = edited.id;
        if (!s.writer.save(stored.execution_status, { todo: encodeStoredTodo({ ...decoded, agent: edited.document }) }).ok) return { ok: false };
      } else {
        if (decoded.planner === null) return { ok: false };
        const planner = Todo.fromDocument(decoded.planner);
        const nextId = op === 'add' ? mint() : id;
        if (!planner.editTask(op, nextId, body, phaseId)) return { ok: false };
        assigned = op === 'add' ? nextId : undefined;
        if (!s.writer.save(stored.execution_status, { todo: encodeStoredTodo({ ...decoded, planner: planner.toDocument() }) }).ok) return { ok: false };
      }
    }
    s.owner.reconcile();
    return { ok: true, ...(assigned === undefined ? {} : { value: assigned }) };
  }

  /**
   * PD-ORCH-005 clause 16 (revision 4, narrowing REQ-MONITOR-063; OQ-101): the user cancels one `paused` child while its
   * session rests. It and each of its `paused` descendants end `cancelled` — final, as clause 3 says — each with the
   * report, the timeline entry and the artifact a live cancel writes (REQ-ORCH-133, REQ-LIBRARY-092). Nothing else moves:
   * the open iteration stays open, the rest of its agents resume with it, and `resumableOf` counts as many fewer. A
   * parent learns of it when it resumes, as of any child that ended unobserved (REQ-ORCH-054). Unlike the live cancel,
   * it runs no scheduler pass, so an agent whose `depends_on` names a cancelled child is left where it stood, counted,
   * and blocked by the resumed run's first pass (REQ-ORCH-048; OQ-101's "A dependent of the cancelled child").
   *
   * Refused — `{ok: false}`, which the renderer states as "not cancellable" (REQ-MONITOR-128) — for the run itself (a
   * rest's whole-iteration equivalent is clause 6's "Continue without them"), an id that is no agent of the open
   * iteration, one neither `paused` nor left unfinished by a crash, and a chosen child whose move is illegal. The refusals
   * that say nothing of the agent carry the engine's words instead (OQ-101): `session_locked` while another live process
   * holds the session's lock, and `store_failed` under a store failure, as every continue is refused (`store-failed`,
   * OQ-103: nothing can be recorded of the session until the reopen rebuilds the writer), when the store could not be read
   * or written to take the lock (`lockForWrite`), and when the chosen child's own move fails to be written. A paused
   * descendant whose move fails is warned of and left paused, and the cancel of the chosen child still stands (OQ-101).
   *
   * A child a crash not yet recorded left unfinished (`crashLeftOf`), which presents `paused` (OQ-100), is cancelled from
   * the state it is stored in, as clause 3's cancellation of one agent ends its agents `cancelled`; so is each such
   * descendant. The crash is not recorded here: clause 3 records it "when the session is next repaired or continued" and
   * clause 8 records interruptions "only when a run of the session is about to start", so the iteration's interruption,
   * the other agents the crash left, the stored pending approvals and the background sessions still marked running are
   * left for the next repair or continue to record. The one thing written of the crash is what no later record reaches: a
   * cancelled agent is terminal, so a crash record never answers its calls the crash cut off, and they are answered here
   * as interrupted, their rows settling (`answerOpenCalls`, REQ-SESSION-129: no row is left `running`). The background
   * sessions the cancelled agents started are left as a live cancel leaves them, for the next stop, quit or crash to end
   * (clause 10).
   */
  private cancelPausedAtRest(s: Live | undefined, req: ControlRequest): ControlResult {
    if (!s) return { ok: false };
    // PD-ORCH-005 clause 16: the two refusals that say nothing of the agent carry the engine's words, so the renderer
    // does not tell the user a paused child is "not cancellable" when the store or another process stood in the way.
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return { ok: false, refusal: { code: 'store_failed', message: `The workspace store requires recovery before an agent can be cancelled: ${storeFailure}` } };
    const sid = s.writer.sessionId;
    const agentId = typeof req.args['agentId'] === 'string' ? req.args['agentId'] : '';
    const row = s.dal.getSession(sid);
    const open = s.dal.openIterationOf(sid);
    // The run's id and the root's are no child of the iteration, so the lookup below refuses them.
    if (!row || !open) return { ok: false };
    // A refusal writes nothing, the lock included: the target is judged before the lock is taken, so the run's id, the
    // root's, an unknown id and an agent neither paused nor crash-left never reap or claim it (OQ-101). The judgement is
    // made again under the lock, which is what the write rests on.
    if (!this.cancellableAtRest(s.dal, sid, agentId, row, open, () => this.liveness(s.dal, sid) === 'not-live')) return { ok: false };
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    // ADR-0005: the write is made under the session's lock. A run releases the lock at its teardown, so a session paused
    // in this process holds none; the cancel takes it for the write and gives it back after, keeps it when this process
    // already holds it (a loaded session), reaps a dead local holder as `SessionWriter.open` does (`claimLockReaping`, the
    // one copy of that rule), and refuses while another live process holds it — one that has loaded or is resuming the
    // session (OQ-101).
    const lock = this.lockForWrite(s.dal, sid, warn);
    if ('refusal' in lock) return { ok: false, refusal: lock.refusal };
    try { return this.cancelPausedUnderLock(s, sid, agentId, row, open, warn); }
    finally { lock.release(); }
  }

  /** Whether `agentId` is a child of the open iteration that is `paused`, or that a crash not yet recorded left unfinished. */
  private cancellableAtRest(dal: StoreDal, sid: SessionId, agentId: string, row: SessionRow, open: NonNullable<ReturnType<StoreDal['openIterationOf']>>, notLive: () => boolean): { readonly crashLeft: ReadonlySet<string> } | null {
    const crashLeft = crashLeftOf(dal, row, notLive);
    const target = iterationAgents(dal, sid, open).find((c) => c.task_id === agentId);
    return target && (target.state === 'paused' || crashLeft.has(agentId)) ? { crashLeft } : null;
  }

  /**
   * The lock `cancelPausedAtRest` writes under: taken (and given back), already this process's (kept), or refused with
   * the words that say why (PD-ORCH-005 clause 16, OQ-101) — `session_locked` only while another live process holds it,
   * and `store_failed` when the store could not be read or written to take it, where no other process is involved.
   */
  private lockForWrite(dal: StoreDal, sid: SessionId, warn: (m: string) => void): { readonly release: () => void } | { readonly refusal: ControlRefusal } {
    const hold = this.claimHold(dal, sid, warn);
    if ('release' in hold) return hold;
    if ('holder' in hold) return { refusal: { code: 'session_locked', message: 'Another process holds this session, so the agent was not cancelled.' } };
    warn(`taking the lock of ${sid} for a cancel failed: ${hold.failure}`);
    return { refusal: { code: 'store_failed', message: `The workspace store could not take this session's lock, so the agent was not cancelled: ${hold.failure}` } };
  }

  /**
   * ADR-0005, REQ-SESSION-047/048/083: the lock a continue writes and runs under. Every run releases the session's lock at
   * its teardown while the session stays live in this process, so a continue by message (`prompt`), the Continue action
   * and the message-limit resolution (`continueSession`) and a plan decision (`planDecision`) each take it back before
   * their first write — reaping a dead local holder once, as a load does — and the run they launch holds it until its own
   * teardown releases it. A lock this process already holds (a session loaded here, or held at the plan gate) is kept. A
   * lock another live process holds refuses the continue with REQ-SESSION-048's words and nothing written; a store that
   * could not be read or written to take it refuses as the load does (`store`). `release` gives back only a lock this
   * call took, for a continue that ends without launching a run (the repair of
   * `a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md` and
   * `a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`, R-067).
   */
  private holdForContinue(s: Live): Result<{ readonly release: () => void }, { readonly code: string; readonly reason: string }> {
    const sid = s.writer.sessionId;
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    const hold = this.claimHold(s.dal, sid, warn);
    if ('release' in hold) return ok(hold);
    if ('holder' in hold) return err(lockHeldRefusal(sid, this.deps.host, hold.holder));
    return err({ code: 'store', reason: `Session ${sid} could not be continued: its lock could not be taken (${hold.failure})` });
  }

  /**
   * The one claim of a live session's lock outside a load (ADR-0005): kept when this process already holds it, taken
   * through `claimLockReaping` (the one copy of REQ-SESSION-047's reap) otherwise, with a `release` that gives back only
   * what this call took; the holder when another process keeps it; the store's failure when it could not be read or
   * written.
   */
  private claimHold(dal: StoreDal, sid: SessionId, warn: (m: string) => void): { readonly release: () => void } | { readonly holder: { readonly pid: number; readonly host: string; readonly acquiredAt: string } } | { readonly failure: string } {
    const { pid, host } = this.deps;
    try {
      const held = dal.getLock(sid);
      if (held && held.pid === pid && held.host === host) return { release: () => undefined };
      const claimed = claimLockReaping(dal, sid, pid, host, toIsoUtc(this.deps.clocks.wall.instant()), this.deps.isProcessAlive ?? (() => true));
      if (!claimed.claimed) return { holder: { pid: claimed.holder.pid, host: claimed.holder.host, acquiredAt: claimed.holder.acquired_at } };
      return { release: () => { try { dal.releaseLock(sid, pid, host); } catch (cause) { warn(`releasing the lock of ${sid} failed: ${String(cause)}`); } } };
    } catch (cause) {
      return { failure: String(cause) };
    }
  }

  private cancelPausedUnderLock(s: Live, sid: SessionId, agentId: string, row: SessionRow, open: NonNullable<ReturnType<StoreDal['openIterationOf']>>, warn: (m: string) => void): ControlResult {
    // Under the lock this process holds and with no run of its own behind the session, the liveness predicate can only
    // answer not-live (`liveness`: a lock this process holds with no run behind it), so it is not asked again.
    // The row is read again under the lock, which is what the write rests on.
    const judged = this.cancellableAtRest(s.dal, sid, agentId, s.dal.getSession(sid) ?? row, open, () => true);
    if (!judged) return { ok: false };
    const { crashLeft } = judged;
    const resting = (c: ChildRow): boolean => c.state === 'paused' || crashLeft.has(c.task_id);
    const agents = iterationAgents(s.dal, sid, open);
    const byParent = new Map<string, ChildRow[]>();
    for (const c of agents) byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
    const targets: ChildRow[] = [];
    const walk = (c: ChildRow) => { if (resting(c)) targets.push(c); for (const d of byParent.get(c.task_id) ?? []) walk(d); };
    const self = agents.find((c) => c.task_id === agentId);
    if (!self || !resting(self)) return { ok: false };
    walk(self);
    const artifacts = s.artifacts ?? this.newArtifactStore(s.dal, sid, () => s.writer, warn);
    s.artifacts = artifacts;
    for (const t of targets) {
      const own = t.task_id === agentId;
      const r = s.writer.transitionChild(t.task_id, 'cancelled', 'cancellation');
      if (!r.ok) {
        warn(r.error.code === 'illegal-move' ? r.error.reason : `cancelling ${t.task_id} at rest failed: ${r.error.code}`);
        // The chosen child is first; a failed move of it leaves it where it stood and cancels nothing below it, and the
        // renderer is answered rather than shown a cancel that did not happen. Nothing was written before it, so nothing
        // needs republishing. An illegal move is REQ-MONITOR-128's "no longer cancellable"; a failed write says nothing of
        // the agent, so it is refused `store_failed` in the engine's words, as a store failure found first is (OQ-101).
        if (own) return r.error.code === 'illegal-move' ? { ok: false } : { ok: false, refusal: { code: 'store_failed', message: `The workspace store requires recovery before an agent can be cancelled: ${'reason' in r.error ? r.error.reason : r.error.code}` } };
        // A descendant whose move fails is left where it stood — paused, or left by the crash for its record to pause — and
        // resumes; the chosen child's cancel stands (OQ-101).
        continue;
      }
      // A crash-left agent's calls the crash cut off: no crash record reaches a cancelled agent, so they are answered now.
      if (crashLeft.has(t.task_id)) answerOpenCalls(s.dal, s.writer, sid, { taskId: t.task_id, name: t.canonical_name }, open.iteration, 'crash');
      const written = userCancellation(t, self, true);
      storeChildReport({ writer: s.writer, artifacts, warn }, t.task_id, t, written.report);
      s.writer.appendTimeline('child_user_cancelled', 'user', written.message, written.metadata);
    }
    s.owner.reconcile();
    return { ok: true };
  }

  /**
   * REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause. At the message limit: continue → idle then a continuation run;
   * double → the limit doubled for this session (null stays null), then continue; cancel → `paused` with stop reason
   * `message_limit_reached`. A manually paused session continues the same way. Nothing here appends a user row.
   */
  /**
   * `withoutPaused` is PD-ORCH-005 clause 6's "continue without them": the agents the last run left paused end
   * `cancelled`, the open iteration closes as cancelled, and the session continues as a new iteration. Otherwise the
   * Continue action resumes them (the default).
   *
   * PD-ORCH-005 clause 18 (extending REQ-MONITOR-125): a session a crash left offers the same choice as a `paused` one —
   * `interrupted` after a repair (REQ-SESSION-060, REQ-GIT-094), or persisted busy with no process behind it,
   * REQ-CHAT-008's recovery state, which REQ-GIT-093's one liveness predicate decides (`not-live`). A busy session whose
   * process is live, or whose liveness is unknown, is refused: another process may still be running it. Either choice
   * records the crash first, as any continue does (clause 8), because `launchContinuation` records it before it resumes
   * or declines the open iteration. Readings in OQ-103.
   *
   * A session the store's failure left busy (OQ-42) reads `not-live` too — its run ended in this process — but it did not
   * crash, and nothing can be recorded of it: every continue is refused `store-failed` until the reopen rebuilds the
   * writer, as the continue by message (`prompt`) and the plan decision are (OQ-103).
   */
  continueSession(sessionId: SessionId, action: 'continue' | 'double' | 'cancel', opts: { readonly withoutPaused?: boolean } = {}): Result<{ readonly resumed: boolean; readonly messageLimit: number | null }, { readonly code: string; readonly reason: string }> {
    // ADR-0005: a lock the continue took is given back when it launches no run; a launched run's teardown releases it.
    const hold: HoldSlot = {};
    const r = this.continueSessionHeld(sessionId, action, opts, hold);
    if (!(r.ok && r.value.resumed)) hold.release?.();
    return r;
  }

  private continueSessionHeld(sessionId: SessionId, action: 'continue' | 'double' | 'cancel', opts: { readonly withoutPaused?: boolean }, hold: HoldSlot): Result<{ readonly resumed: boolean; readonly messageLimit: number | null }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery before continuing work: ${storeFailure}` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const atLimit = stored.execution_status === 'paused_message_limit';
    const busyLeft = isActiveStatus(stored.execution_status);
    if (busyLeft && this.liveness(s.dal, sessionId) !== 'not-live') return err({ code: 'run-active', reason: `Session ${sessionId} is still marked ${stored.execution_status}, and the process that ran it may still be running it.` });
    const crashLeft = busyLeft || stored.execution_status === 'interrupted';
    if (!atLimit && !crashLeft && stored.execution_status !== 'paused') return err({ code: 'not-paused', reason: `Session ${sessionId} is not paused (${stored.execution_status}).` });
    // ADR-0005: the lock is taken back before the first write — the resolution's own, or the run's (`holdForContinue`).
    const held = this.holdForContinue(s);
    if (!held.ok) return held;
    hold.release = held.value.release;
    let limit = stored.message_limit;
    if (atLimit) {
      if (action === 'cancel') {
        const r = s.writer.resolvePause('paused', limit, 'cancel');
        if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
        s.owner.reconcile();
        return ok({ resumed: false, messageLimit: limit });
      }
      if (limit === null) {
        // REQ-SESSION-110: a session paused at a null limit cannot resume the prompt; it is set paused and the host warned.
        const r = s.writer.resolvePause('paused', null, action);
        if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
        s.owner.reconcile();
        this.deps.notice?.({ severity: 'warning', headline: 'The paused session carries no message limit to resume from', detail: `Session ${sessionId} was paused at a message limit that is no longer recorded; it is now paused and can be continued from the composer.`, sessionId });
        return ok({ resumed: false, messageLimit: null });
      }
      if (action === 'double') limit = limit * 2;
      const r = s.writer.resolvePause('idle', limit, action);
      if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
    } else if (action === 'cancel') {
      return ok({ resumed: false, messageLimit: limit });
    }
    // The continuation: the last user request stands and no user row is appended (REQ-MONITOR-125's "resumed from the composer").
    // A session with nothing open and that request finished — crash-left (clause 18), `paused` by a pause, a stop or
    // the application's quit accepted after its iteration closed, `paused` by a plan Cancel, a stop or a quit of the
    // plan cycle held after a resumed iteration that carried out the continue's message (PD-ORCH-003 revision 2,
    // OQ-104), or `paused_message_limit` by a limit reached as the iteration that finished it closed (this resolution's
    // 'continue' and 'double') — appends it to the todo again (REQ-ORCH-004; OQ-102's no-append covers only a request
    // held unfinished): the undecided case of OQ-103's "Nothing open to resume".
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, opts.withoutPaused === true));
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    const lastPrompt = [...s.dal.residentRows(sessionId)].reverse().find((row) => row.kind === 'user')?.body ?? stored.session_id;
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const payload = buildContinuationPayload(s.dal, stored, lastPrompt, todo.value);
    const runtimeWithLimit: RunSetup = { ...setup.value, runtime: { ...setup.value.runtime, messageLimit: limit } };
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), runtimeWithLimit, [], undefined, opts.withoutPaused === true ? 'decline' : { message: null });
    return ok({ resumed: true, messageLimit: limit });
  }

  /**
   * REQ-ORCH-152/153/154 (ADR-0062): whether THIS launch is a plan cycle, and which.
   *
   * The mode is read at the launch and never again while the segment runs, which is REQ-ORCH-154's "a change to
   * the mode setting made while a run is in flight takes effect only for the next run" expressed as the place the
   * value is read. `plan_released` is approval's one-way flag: once execution has been released the run no longer
   * holds, whatever the mode says and whichever process is asking — that is what makes "a plan produced later in
   * the same run MUST NOT block execution" survive the process boundary the park introduces. **PD-ORCH-003 widens
   * that flag from the run to the session**: it is no longer cleared by the next prompt, so every later run of an
   * approved session reads it too, and only `planRearm` or a new session sets the gate again. `override` is a
   * revise cycle, which carries its own number and the changes the user stated and is not subject to the mode
   * read: the user asked for that cycle explicitly.
   *
   * `withholds` falls back to a predicate that withholds nothing where the host injected none — the dispatch
   * check in the tool gate is the authoritative enforcement point, and a build with no registry predicate is a test.
   */
  private planLaunchFor(dal: StoreDal, sessionId: SessionId, runtime: RuntimePosture | undefined, override?: { readonly cycle: number; readonly changes: string }): { readonly plan: { cycle: number; changes: string; withholds: (tool: string) => boolean } } | undefined {
    const withholds = this.deps.planWithholds ?? (() => false);
    if (override) return { plan: { ...override, withholds } };
    if ((runtime?.runStartMode ?? 'auto') !== 'plan') return undefined;
    const row = dal.getSession(sessionId);
    if (!row || row.plan_released === 1) return undefined;
    const cycles = dal.planCyclesOf(sessionId);
    return { plan: { cycle: (cycles[cycles.length - 1]?.cycle ?? 0) + 1, changes: '', withholds } };
  }

  /**
   * PD-ORCH-003: re-arm the gate a previous approval released. It starts nothing and stops nothing — the next
   * prompt in this session is held, exactly as the first one was.
   *
   * It refuses while a run is active, for the reason REQ-ORCH-154 gives for the mode itself: what a launch
   * already read cannot be changed under it. Re-arming an already-armed session succeeds and does nothing, so
   * a surface may send it without first reading the flag it is about to set.
   */
  planRearm(sessionId: SessionId): Result<boolean, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active; the plan gate re-arms for the next run.' });
    if (stored.plan_released !== 1) return ok(false);
    s.writer.clearPlanRelease();
    s.owner.reconcile();
    return ok(true);
  }

  /**
   * REQ-ORCH-154: the user's own text over the plan awaiting a decision. It approves nothing and starts nothing —
   * the session stays at `awaiting_plan_decision` and the same cycle stays pending.
   */
  planEdit(sessionId: SessionId, text: string): Result<boolean, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    if (stored.execution_status !== 'awaiting_plan_decision' || stored.plan_cycle === null) {
      return err({ code: 'not-at-gate', reason: `Session ${sessionId} is not waiting at the plan gate (${stored.execution_status}).` });
    }
    const r = s.writer.recordPlanEdit(stored.plan_cycle, text);
    if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
    s.owner.reconcile();
    return ok(r.value);
  }

  /**
   * REQ-ORCH-153/154: the answer, exactly one of three.
   *
   *  - **approve** releases execution for the remainder of the run: `plan_released` is set, the gate is cleared,
   *    and a continuation launches carrying the plan the user approved — edited where they edited it, verbatim
   *    otherwise. The launch reads the released flag, so nothing later in that run can return to the gate.
   *  - **revise** starts a further plan cycle with the plan as it currently stands and the changes stated. This
   *    document places no limit on how many.
   *  - **cancel** stops the run with stop reason `user_cancelled` and launches nothing.
   *
   * Every answer is recorded with a `plan_gate_resolved` timeline entry naming it, in the same durable act that
   * clears the gate — so a process that dies between the two cannot leave a session claiming to wait on a cycle
   * that was settled.
   */
  planDecision(sessionId: SessionId, decision: PlanDecision, changes = ''): Result<{ readonly relaunched: boolean; readonly cycle: number }, { readonly code: string; readonly reason: string }> {
    // ADR-0005: a lock the decision took is given back when it launches no run; a launched run's teardown releases it.
    const hold: HoldSlot = {};
    const r = this.planDecisionHeld(sessionId, decision, changes, hold);
    if (!(r.ok && r.value.relaunched)) hold.release?.();
    return r;
  }

  private planDecisionHeld(sessionId: SessionId, decision: PlanDecision, changes: string, hold: HoldSlot): Result<{ readonly relaunched: boolean; readonly cycle: number }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery before continuing work: ${storeFailure}` });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    if (stored.execution_status !== 'awaiting_plan_decision' || stored.plan_cycle === null) {
      return err({ code: 'not-at-gate', reason: `Session ${sessionId} is not waiting at the plan gate (${stored.execution_status}).` });
    }
    const cycle = stored.plan_cycle;
    const row = s.dal.planCycle(sessionId, cycle);
    if (!row) return err({ code: 'no-cycle', reason: `Session ${sessionId} has no record of plan cycle ${cycle}.` });
    // ADR-0005: the lock is taken back before the first write — the gate's resolution, or the relaunched run's.
    const held = this.holdForContinue(s);
    if (!held.ok) return held;
    hold.release = held.value.release;
    // REQ-ORCH-154: "the edited text is the plan the run carries out".
    const text = row.edited ?? row.plan;
    if (decision === 'cancel') {
      const r = s.writer.resolvePlanGate(cycle, decision, 'paused', false, 'user_cancelled');
      if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
      s.owner.reconcile();
      return ok({ relaunched: false, cycle });
    }
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const resolved = s.writer.resolvePlanGate(cycle, decision, 'idle', decision === 'approve', null);
    if (!resolved.ok) return err({ code: resolved.error.code, reason: 'reason' in resolved.error ? resolved.error.reason : resolved.error.code });
    const lastPrompt = [...s.dal.residentRows(sessionId)].reverse().find((r) => r.kind === 'user')?.body ?? stored.session_id;
    const payload = `${buildContinuationPayload(s.dal, s.dal.getSession(sessionId)!, lastPrompt, todo.value)}\n\n${planSection(decision, text, changes)}`;
    // REQ-ORCH-004 / REQ-ORCH-154 (OQ-104): a plan decision states no new top-level task — the held run's todo already
    // carries the gated work — so the relaunch appends none; appending the last request again would duplicate it. After
    // a hold that followed a resumed iteration (PD-ORCH-003 revision 2) that todo also carries the continue's message,
    // complete, or pending and taken up first.
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), setup.value, [], decision === 'revise' ? { cycle: cycle + 1, changes } : undefined, { message: null }, false);
    return ok({ relaunched: true, cycle });
  }

  /** ADR-0039: the port is built by the root; a root that raises leaves the run with no checkpoints and one warning (REQ-GIT-045: never aborts). */
  private checkpointPortFor(ctx: CheckpointPortContext): CheckpointPort | null {
    if (!this.deps.checkpoints) return null;
    try { return this.deps.checkpoints(ctx); } catch (cause) { ctx.warn(`Could not set up checkpoints for this run; continuing without them. (${String(cause)})`); return null; }
  }

  /**
   * PD-ORCH-005 clauses 6, 13 and 18 (OQ-100, OQ-103): what a projection states of a session at rest — the agents a crash
   * left, the crash not yet recorded (`crashLeftOf`), and what the Continue action would resume (`resumableOf`). A
   * session the store's failure left busy (OQ-42) is not one a crash left, and every continue on it is refused
   * `store-failed` (`continueSession`): it names no crash-left agent and states nothing to resume, so the tree, the
   * run-level agent (`runLevelResting`) and the composer's count and decline present it as before, and none of its agents
   * is offered the at-rest cancel. Reads the store and records nothing (clause 8).
   */
  private restingOf(dal: StoreDal, row: SessionRow, writer: SessionWriter): { readonly crashLeft: ReadonlySet<string>; readonly cancelLeft: ReadonlySet<string>; readonly resumable: ResumablePayload | null } {
    const sessionId = asSessionId(row.session_id);
    const storeLeftBusy = isActiveStatus(row.execution_status) && storeFailureOf(dal, writer) !== null;
    return {
      crashLeft: crashLeftOf(dal, row, () => this.liveness(dal, sessionId) === 'not-live', storeLeftBusy),
      // OQ-103 (R-067): the agents an accepted cancel its run never carried out left, presented `cancelled`.
      cancelLeft: cancelLeftOf(dal, row, () => this.liveness(dal, sessionId) === 'not-live', storeLeftBusy),
      resumable: storeLeftBusy ? null : resumableOf(dal, row),
    };
  }

  /**
   * REQ-GIT-093: live exactly when a run for the session is under way here, or its persisted status is active AND the
   * process its lock names is alive, or liveness cannot be established. A persisted active status on its own is not
   * live. The probe asks one question — does a process bearing the pid exist — and every residual resolves to live;
   * the one reading taken: a lock this process itself holds with no run behind it (a resumed session) is not live,
   * because the process that would race a restore is this one and it is running nothing for the session.
   */
  liveness(dal: StoreDal, sessionId: SessionId): SessionLiveness {
    const s = this.live.get(sessionId);
    if (s?.run && !s.run.isEnded) return 'live';
    const row = dal.getSession(sessionId);
    if (!row) return 'unknown';
    if (!isActiveStatus(row.execution_status)) return 'not-live';
    const lock = dal.getLock(sessionId);
    if (!lock) return 'not-live';
    if (lock.host !== this.deps.host) return 'live';
    if (lock.pid === this.deps.pid) return 'not-live';
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return 'live';
    if (!this.deps.isProcessAlive) return 'unknown';
    try { return this.deps.isProcessAlive(lock.pid) ? 'live' : 'not-live'; } catch { return 'unknown'; }
  }

  /**
   * REQ-GIT-050/092/094/095: one session's checkpoints from the rows alone (no Git), the liveness verdict stamped on,
   * the tree root of REQ-GIT-053, and REQ-GIT-094's repair — a persisted-busy session whose process is dead (a lock
   * naming this host with a dead pid, no lock at all, or this process's own lock with no run behind it) is set
   * `interrupted` with its lock released and a timeline entry filed, so its checkpoints can be restored again.
   */
  checkpointListing(dal: StoreDal, workspaceRoot: string, sessionId: SessionId): Result<CheckpointListPayload, { readonly code: string; readonly reason: string }> {
    const row = dal.getSession(sessionId);
    if (!row || row.workspace_root !== workspaceRoot) return err({ code: 'no-session', reason: `The session store holds no session under ${sessionId}, so nothing can be previewed or restored for it.` });
    const { root, binding } = effectiveRootOf(row);
    // Part U: the repair is the one unit REQ-SESSION-060 fixes, shared with the browser's explicit Repair. PD-ORCH-005
    // clause 8: opening a session's checkpoints is viewing it, so this repair records no crash on its agents (OQ-96).
    const r = this.repairOne(dal, sessionId, false);
    const repaired: CheckpointListPayload['repaired'] = r.repaired ? { previous: r.repaired.from, reason: r.repaired.reason } : null;
    const rows = dal.listCheckpoints(sessionId).map(toCheckpointPayload);
    const unavailable = binding !== null && !existsSync(binding.worktree_path) ? CHECKPOINTS_NO_TREE : null;
    return ok({ sessionId, rows, lastRestoredSequence: dal.getSession(sessionId)?.last_restored_sequence ?? null, liveness: repaired ? 'not-live' : this.liveness(dal, sessionId), treeRoot: root, unavailable, repaired, includeUntracked: true });
  }

  /**
   * REQ-SESSION-060's explicit repair as ONE unit (Part U), shared by the browser's Repair and REQ-GIT-094's open-time
   * repair in `checkpointListing`: re-check liveness through the one predicate; read the state (unreadable state is
   * "nothing to do", REQ-SESSION-041); require an active status; write `interrupted` durably first (a terminal save
   * takes the stronger setting); then the diagnostics timeline entry; then release the orphaned lock. The entry is
   * written BEFORE the release rather than after it — the reading recorded on ADR-0005: the lock is the capability
   * that authorises writing the session's rows, so the entry must be written while it is held; what REQ-SESSION-060's
   * ordering forbids is the release preceding the status, and that holds. The reason names which of REQ-SESSION-059's
   * two conditions applied (no lock at all; this machine's lock with a dead pid — naming it), plus the one this
   * process produces itself (its own lock with no run behind it). Never raises; a failed save leaves everything as it was.
   */
  /**
   * PD-ORCH-005 clause 3: a crash is recorded when the session is next repaired or continued (`run/crash.ts`). The
   * background sessions this process still holds are alive, so the crash ended none of them.
   */
  private recordCrashOf(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, warn: (m: string) => void, artifacts: ArtifactStore): void {
    const live = new Set((this.deps.terminals?.(sessionId).list() ?? []).filter((t) => t.status === 'running').map((t) => t.id));
    const r = recordCrash(dal, writer, sessionId, live, warn, artifacts);
    // OQ-103 (R-067): an iteration whose explicit cancel was accepted is closed as that cancel, its agents never paused.
    const cancelledIteration = r.iteration !== null && dal.getIteration(sessionId, r.iteration)?.state === 'closed';
    if (cancelledIteration) warn(`iteration ${r.iteration} of ${sessionId} was closed cancelled: its run's cancel had been accepted before the process ended; ${r.cancelled} agent(s) recorded cancelled (PD-ORCH-005 clause 3)`);
    else if (r.iteration !== null) warn(`iteration ${r.iteration} of ${sessionId} was left open by a crash: ${r.paused} agent(s) recorded paused (PD-ORCH-005)`);
  }

  private repairOne(dal: StoreDal, sessionId: SessionId, recordsCrash = true): { repaired: RepairedSession | null; skipped: string | null } {
    const row = dal.getSession(sessionId);
    if (!row) return { repaired: null, skipped: 'no session exists under that id' };
    if (!isActiveStatus(row.execution_status)) return { repaired: null, skipped: `its status is '${row.execution_status || 'idle'}', which asserts no run in progress` };
    const verdict = this.liveness(dal, sessionId);
    if (verdict === 'live') return { repaired: null, skipped: 'a process still holds its lock (or a run for it is under way here)' };
    if (verdict === 'unknown') return { repaired: null, skipped: 'its liveness could not be established, and an uncertain session is treated as running' };
    const unreadable = stateUnreadable(row);
    if (unreadable !== null) return { repaired: null, skipped: `its stored state cannot be read (${unreadable}); nothing to do` };
    const lock = dal.getLock(sessionId);
    const reason = !lock ? 'no process holds a lock for it' : lock.pid === this.deps.pid ? 'this application holds its lock but runs nothing for it' : `the lock names this machine and its process (pid ${lock.pid}) is gone`;
    const previous = row.execution_status;
    const r = this.withWriter(dal, sessionId, (writer) => {
      const saved = writer.save('interrupted');
      if (!saved.ok) throw new Error('reason' in saved.error ? saved.error.reason : saved.error.code);
      /**
       * REQ-SESSION-062 fixes this entry exactly — type, severity, actor, message and metadata keys — and this
       * implementation had invented all of them but the actor: `session_marked_interrupted` for the type, the
       * default `info` for the severity, a two-sentence message, and `previous_status` for a key the requirement
       * calls `previous_execution_status`, with `execution_status` missing beside it. Found by OQ-46's audit of
       * the same requirement. A reader of the exported timeline (REQ-SESSION-199) could not have found the entry
       * the specification promises, under the name it promises, carrying the fields it promises.
       */
      writer.appendTimeline('session.interrupted_recovered', 'rotaris', `Session was still marked '${previous}' but ${reason}; status set to 'interrupted'.`, { previous_execution_status: previous, execution_status: 'interrupted', reason }, 'warning');
      // PD-ORCH-005 clause 3: the repair is one of the two moments a crash is recorded.
      if (recordsCrash) {
        const warn = (m: string) => this.deps.warn(m);
        // REQ-LIBRARY-092: the reports of the agents an accepted cancel ends are materialised (OQ-103, R-067).
        this.recordCrashOf(dal, writer, sessionId, warn, this.live.get(sessionId)?.artifacts ?? this.newArtifactStore(dal, sessionId, () => writer, warn));
      }
    });
    if (!r.ok) { this.deps.warn(`session ${sessionId} could not be marked interrupted: ${r.error.reason}`); return { repaired: null, skipped: `the correction could not be made durable (${r.error.reason}); nothing was changed` }; }
    this.live.get(sessionId)?.owner.reconcile();
    return { repaired: { sessionId, from: previous, to: 'interrupted', reason }, skipped: null };
  }

  /** REQ-SESSION-060/182 (Part U): one session, or every stale session of the workspace; "nothing was stale" is an answer, never an empty one. */
  repair(dal: StoreDal, workspaceRoot: string, target: { readonly sessionId: string } | { readonly all: true }): RepairReport {
    const report: RepairReport = { repaired: [], skipped: [], nothingStale: false };
    if ('sessionId' in target) {
      const row = dal.getSession(asSessionId(target.sessionId));
      if (!row || row.workspace_root !== workspaceRoot) report.skipped.push({ sessionId: target.sessionId, reason: 'no session exists under that id in this workspace' });
      else {
        const r = this.repairOne(dal, asSessionId(target.sessionId));
        if (r.repaired) report.repaired.push(r.repaired); else report.skipped.push({ sessionId: target.sessionId, reason: r.skipped ?? 'nothing to do' });
      }
    } else {
      // REQ-SESSION-058: detection reads the listing record (internal sessions included) and the lock, nothing else.
      for (const row of dal.listSessions()) {
        if (row.workspace_root !== workspaceRoot || !isActiveStatus(row.execution_status)) continue;
        const sid = asSessionId(row.session_id);
        if (this.liveness(dal, sid) !== 'not-live') continue;
        const r = this.repairOne(dal, sid);
        if (r.repaired) report.repaired.push(r.repaired); else report.skipped.push({ sessionId: row.session_id, reason: r.skipped ?? 'nothing to do' });
      }
    }
    return { ...report, nothingStale: report.repaired.length === 0 };
  }

  /**
   * REQ-SESSION-166 step 1 (Part U): the state is loaded to find the tree the refs live in — the worktree binding's
   * path, else the workspace root — and the liveness refusal is decided BEFORE any ref is touched. A live session (a
   * run here, or a live lock) and one whose liveness cannot be established are refused with distinct sentences; an
   * unreadable session still deletes (REQ-SESSION-041); a missing one is the caller's no-op.
   */
  prepareDelete(dal: StoreDal, workspaceRoot: string, sessionId: SessionId): DeletePreparation {
    const row = dal.getSession(sessionId);
    if (!row || row.workspace_root !== workspaceRoot) return { kind: 'missing' };
    if (this.isRunActive(sessionId)) return { kind: 'live', reason: DELETE_LIVE_REFUSAL };
    const verdict = this.liveness(dal, sessionId);
    if (verdict === 'live') return { kind: 'live', reason: DELETE_LIVE_REFUSAL };
    if (verdict === 'unknown') return { kind: 'live', reason: DELETE_LIVENESS_UNKNOWN_REFUSAL };
    return { kind: 'ready', treeRoot: effectiveRootOf(row).root, unreadable: stateUnreadable(row), checkpoints: dal.checkpointCount(sessionId) };
  }

  /**
   * REQ-SESSION-166 step 3: ONE durable transaction removes the session row and, through the schema's cascades on a
   * connection that enforces them (store `open.ts`), every row keyed by it — then the per-session files of
   * REQ-SESSION-002, errors ignored, so no listed session is left without a record and no files without a session. A
   * session loaded here but idle (its writer and projection held in this registry) is evicted first; its lock row goes
   * with the cascade. The improvement library is not touched — it does not exist in this build (REQ-SESSION-007).
   */
  completeDelete(dal: StoreDal, sessionId: SessionId): { existed: boolean; filesRemoved: boolean; filesDetail: string | null } {
    const loaded = this.live.get(sessionId);
    if (loaded) {
      loaded.owner.flushPending();
      loaded.log?.close();
      this.seq.forget(sessionId);
      this.live.delete(sessionId);
    }
    const existed = dal.durableTransaction(() => dal.deleteSession(sessionId));
    const dir = this.deps.sessionFilesDir(dal, sessionId);
    let filesRemoved = false; let filesDetail: string | null = null;
    if (existsSync(dir)) {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); filesRemoved = !existsSync(dir); if (!filesRemoved) filesDetail = `${dir} could not be removed`; }
      catch (cause) { filesDetail = `${dir} could not be removed: ${String(cause instanceof Error ? cause.message : cause)}`; }
    }
    return { existed, filesRemoved, filesDetail };
  }

  /** REQ-SESSION-002/191: where a session's files live — the caller decides which exist. */
  filesDir(dal: StoreDal, sessionId: SessionId): string {
    return this.deps.sessionFilesDir(dal, sessionId);
  }

  /** REQ-CHAT-173: verified bytes for an on-demand thumbnail; the transcript channel remains metadata-only. */
  readAttachment(sessionId: SessionId, path: string, digest: string): { ok: true; base64: string } | { ok: false; reason: string } {
    const live = this.live.get(sessionId);
    if (!live) return { ok: false, reason: 'The attachment session is not loaded.' };
    return readAttachmentBody(this.deps.sessionFilesDir(live.dal, sessionId), path, digest);
  }

  /**
   * Part Y (REQ-ORCH-149) — the session's artifact store. One per live session, shared across iterations and
   * continuations, holding no state of its own so every read is the stored state (REQ-LIBRARY-105's freshness
   * follows from that rather than from a cache the surfaces have to invalidate).
   */
  private newArtifactStore(dal: StoreDal, sessionId: SessionId, writer: () => SessionWriter, warn: (m: string) => void): ArtifactStore {
    return new ArtifactStore({
      dal, sessionId, directory: () => this.deps.sessionFilesDir(dal, sessionId), wall: this.deps.clocks.wall, warn,
      // REQ-LIBRARY-092: the `artifact_published` entry, through the live writer's ordinal counter, with its minted id.
      timeline: (name, message, metadata) => { const r = writer().appendTimelineEntry(name, 'rotaris', message, metadata); return r.ok ? r.value : null; },
    });
  }

  /**
   * REQ-LIBRARY-136 / REQ-LIBRARY-102: the Library reads the LOADED session's artifacts. A session that is not
   * loaded has no store here, and the surface answers "Artifact not found in the loaded session." rather than
   * opening a second store behind the one this process holds (REQ-LIBRARY-158).
   */
  artifactsOf(sessionId: SessionId): ArtifactStore | null {
    return this.live.get(sessionId)?.artifacts ?? null;
  }

  /** The session currently loaded in this host, if any — what the Library's artifacts tab reads. */
  loadedSessionId(): SessionId | null {
    for (const [id] of this.live) return id;
    return null;
  }

  /** REQ-GIT-058 gate 5 / REQ-GIT-059: the safety row through the one transaction; the trimmed rows' refs come back for the prune. */
  recordSafetyCheckpoint(dal: StoreDal, sessionId: SessionId, input: CheckpointRecordInput, keep: number): Result<{ readonly trimmed: readonly { ref: string; commit: string }[]; readonly publish: () => void }, { readonly code: string; readonly reason: string }> {
    return this.withWriter(dal, sessionId, (writer) => {
      const r = writer.recordCheckpoint(input, keep);
      if (!r.ok) throw new Error('reason' in r.error ? r.error.reason : r.error.code);
      return { trimmed: r.value.trimmed.map((t) => ({ ref: t.ref, commit: t.commit_id })), publish: r.value.publish };
    });
  }

  /** REQ-GIT-062/068/155: the attempt's outcome through the one transaction; a live projection is republished. */
  recordRestore(dal: StoreDal, sessionId: SessionId, input: RestoreRecordInput): Result<void, { readonly code: string; readonly reason: string }> {
    const r = this.withWriter(dal, sessionId, (writer) => {
      const w = writer.recordRestore(input);
      if (!w.ok) throw new Error('reason' in w.error ? w.error.reason : w.error.code);
    });
    if (r.ok) this.live.get(sessionId)?.owner.reconcile();
    return r;
  }

  /**
   * A write against a session's record from outside a run: the live session's writer when this registry holds one,
   * else a writer opened for the call (taking the lock with ADR-0005's one reap) and released after it. Anything
   * `fn` throws is the refusal's reason.
   */
  private withWriter<T>(dal: StoreDal, sessionId: SessionId, fn: (writer: SessionWriter) => T): Result<T, { readonly code: string; readonly reason: string }> {
    const live = this.live.get(sessionId);
    if (live) {
      try { return ok(fn(live.writer)); } catch (cause) { return err({ code: 'write', reason: String(cause instanceof Error ? cause.message : cause) }); }
    }
    const opened = SessionWriter.open({ dal, sessionId, wall: this.deps.clocks.wall, retentionCap: this.deps.retentionCap, warn: this.deps.warn, onCommitted: () => undefined }, { pid: this.deps.pid, host: this.deps.host, isProcessAlive: this.deps.isProcessAlive ?? (() => true) });
    if (!opened.ok) {
      if (opened.error.code === 'no-session') return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
      if (opened.error.code === 'store') return err({ code: 'store', reason: opened.error.reason });
      return err({ code: 'lock-held', reason: `Session ${sessionId} is held by pid ${opened.error.holder.pid} on ${opened.error.holder.host}.` });
    }
    try { return ok(fn(opened.value)); } catch (cause) { return err({ code: 'write', reason: String(cause instanceof Error ? cause.message : cause) }); } finally { opened.value.release(this.deps.pid, this.deps.host); }
  }

  /** ADR-0019: a lapse or a teardown releases every waiting approval in every live session (REQ-TOOLS-054's bulk cancel). */
  cancelAllPending(): number {
    let n = 0;
    for (const s of this.live.values()) n += s.run && !s.run.isEnded ? s.run.cancelPending() : s.tools?.cancelPending() ?? 0;
    return n;
  }

  /** ADR-0013: an answer is routed by looking the request id up across every live session. */
  answerApproval(requestId: string, option: ApprovalOption): boolean {
    for (const s of this.live.values()) {
      // PD-TOOLS-005: an answer is the user's input to the session that held the request, whichever session was addressed.
      if (s.run && s.run.answerApproval(requestId, option)) { s.presence.returned(); return true; }
      if (s.tools?.answerApproval(requestId, option)) { s.presence.returned(); return true; }
    }
    return false;
  }

  /** Part AC — REQ-CHAT-096: the same lookup for a question set; a stale prompt id resolves nothing anywhere. */
  answerQuestions(requestId: string, answers: QuestionAnswers): boolean {
    for (const s of this.live.values()) {
      if (s.run && s.run.answerQuestions(requestId, answers)) { s.presence.returned(); return true; }
      if (s.tools?.answerQuestions?.(requestId, answers) === true) { s.presence.returned(); return true; }
    }
    return false;
  }
  cancelQuestions(requestId: string): boolean {
    for (const s of this.live.values()) {
      if (s.run && s.run.cancelQuestions(requestId)) { s.presence.returned(); return true; }
      if (s.tools?.cancelQuestions?.(requestId) === true) { s.presence.returned(); return true; }
    }
    return false;
  }

  /** ADR-0013 / REQ-NOTIFY-050: the registry's predicate — is a run active for this session. */
  isRunActive(sessionId: SessionId): boolean {
    const s = this.live.get(sessionId);
    if (!s) return false;
    if (s.run && !s.run.isEnded) return true;
    return isActiveStatus(s.writer.currentStatus);
  }

  activeRunCount(): number {
    return [...this.live.keys()].filter((id) => this.isRunActive(id)).length;
  }

  attach(sessionId: SessionId): boolean {
    const s = this.live.get(sessionId);
    if (!s) return false;
    s.owner.attach();
    return true;
  }

  reconcile(sessionId: SessionId): boolean {
    const s = this.live.get(sessionId);
    if (!s) return false;
    s.owner.reconcile();
    return true;
  }

  /** REQ-SESSION-192 / REQ-CHAT-165: a span older than `beforeIndex`, served from any page, oldest first. */
  pageOlder(sessionId: SessionId, beforeIndex: number): { rows: TranscriptRow[]; oldest: boolean } | undefined {
    const s = this.live.get(sessionId);
    if (!s) return undefined;
    const rows = s.dal.rowsBefore(sessionId, beforeIndex, RELEASE_PAGE_SIZE).map((r) => ({ ...toTranscriptRow(r), ...(r.attachments === '[]' ? {} : { attachments: projectAttachments(this.deps.sessionFilesDir(s.dal, sessionId), r.attachments) }) })).reverse();
    const oldestIndex = s.dal.oldestRowIndex(sessionId);
    const oldest = rows.length === 0 || (oldestIndex !== null && rows[0]!.index <= oldestIndex);
    return { rows, oldest };
  }

  owner(sessionId: SessionId): ProjectionOwner | undefined {
    return this.live.get(sessionId)?.owner;
  }
  writer(sessionId: SessionId): SessionWriter | undefined {
    return this.live.get(sessionId)?.writer;
  }
  run(sessionId: SessionId): Run | undefined {
    return this.live.get(sessionId)?.run ?? undefined;
  }
  /** The run's promise, for a caller that must wait on it (tests, shutdown). */
  running(sessionId: SessionId): Promise<RunResult> | null {
    return this.live.get(sessionId)?.running ?? null;
  }

  /**
   * ADR-0014 / REQ-MONITOR-255 / REQ-MONITOR-131: every run is asked to stop BEFORE any is waited
   * on; the caller bounds the wait (the one 30 s allowance). Then every pending publication is
   * flushed and every lock a finished session still holds is released.
   */
  async closeAll(): Promise<void> {
    const waits: Promise<unknown>[] = [];
    for (const s of this.live.values()) {
      if (s.run && !s.run.isEnded) { s.run.stop.request('application_shutdown'); if (s.running) waits.push(s.running.catch(() => undefined)); }
    }
    await Promise.all(waits);
    for (const [id, s] of this.live) {
      // PD-ORCH-005 clause 10: a quit ends every background session this process holds; one a session at rest had left
      // running (a pause leaves them) is recorded as ended by the quit. A run that was live recorded its own at its rest,
      // and one a dead process left is the crash's, recorded when the session is next repaired or continued.
      const held = new Map((this.deps.terminals?.(id).list() ?? []).filter((t) => t.status === 'running').map((t) => [t.id, t]));
      for (const t of s.dal.agentTerminalsOf(id)) {
        const live = held.get(t.terminal_id);
        if (t.state === 'running' && live) s.writer.recordAgentTerminal({ terminal_id: t.terminal_id, task_id: t.task_id, command: t.command, started_at: t.started_at, state: 'quit', exit_code: live.exitCode, output_tail: live.tail });
      }
      s.tools?.cancelPending();
      s.owner.flushPending();
      s.writer.release(this.deps.pid, this.deps.host);
      this.seq.forget(id);
    }
    this.live.clear();
  }
}
