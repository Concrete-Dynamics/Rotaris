import { asSessionId, type Clocks, countNoun, err, formatAmount, type MachineId, millis, type Millis, ok, type Result, type SessionId, toIsoUtc } from '@rotaris/kernel';
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
import { parseTokenSamples, Run, settleClosedIterations, type AgentTerminals, type ModelLookup, type PermissionPosture, type RunConfig, type RunDeps, type RunResult } from './run/run.js';
import { answerOpenCalls, iterationAgents, recordCrash } from './run/crash.js';
import { resumeNoticeOf } from './run/resume.js';
import { offersHeldIn, openOfferIds, openOffersText } from './run/offers.js';
import { cut } from './run/cut.js';
// PD-ORCH-004 revision 4: the offers list lives beside the run, which tells a later iteration's root; kept public here.
export { offersToldIn, openOffersText } from './run/offers.js';
import { planSection } from './run/plan-text.js';
export { planRequestSection, planSection } from './run/plan-text.js';
import { entryOf, excludedModelKeys, overridesInForce, pairKey, providerIdentity, ResilienceMemory, withSettings, type CatalogueEntry, type ModelChoice } from './run/resilience.js';
import type { ResolvedTrigger } from './run/compression.js';
import { SessionLog, type LogLevel } from './session-log.js';
import { UserPresence } from './run/presence.js';
import type { ToolPort } from './run/turn.js';
import { settleStaleChildren } from './children/orchestration.js';
import type { DelegationOps } from './children/delegation.js';
import { DEFAULT_BUDGET, holdsModelSlot, storeChildReport, userCancellation, writeCancelledTeardown, type Budget } from './children/ledger.js';
import { DEFAULT_CONTEXT_CAPACITY, isInterruption, isReadyArtifactStatus, isTerminalChildState, presentationChildState, reconciledState, type AgentRecord, type ChildState, type EntryRoot, type EntryToolsPayload, type SessionArtifactLink } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { SummaryWriter } from './run/summary.js';
import { isActiveStatus } from './run/stop-conditions.js';
import type { HookPort, HookPortContext, RunNotice, ToolHookBridge } from './hooks-port.js';
import { ArtifactStore } from './artifacts/store.js';
import { toArtifactRecord } from './artifacts/record.js';
import { decodeStoredAttachments, persistAttachments, projectAttachments, readAttachmentBody, readBackAttachments, validateAttachmentInputs, type StoredAttachment } from './attachments.js';
import { artifactOps, type ArtifactOps } from './artifacts/port.js';
import type { Preflight, PreflightContext } from './preflight.js';
import { IntentResultSchema, type IntentCategory, type IntentGrant, type IntentStatus } from '@rotaris/contracts';
import type { PlanDecision, PlanGatePayload, ResumablePayload } from '@rotaris/contracts';
import { SupervisorRegistry, type LoopClassifier, type SupervisorConfig } from './run/supervisor.js';
import { meteredBackend, type CountUsage } from './run/metered.js';
import { mintTodoId, taskTitle, Todo, type TodoDocument } from './run/todo.js';
import type { PersonaResolver } from './children/personas.js';
import type { AgentActivity } from './children/activity.js';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
import { decodeStoredTodo, editAgentTodo, encodeStoredTodo, isAgentTodoDocument, projectSessionTodos, sessionTaskTitle, type AgentTodoDocument } from './todo-view.js';
import { randomUUID } from 'node:crypto';
import { ModelSlots, type SlotHolder } from './children/model-slots.js';

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
  /**
   * A line at `info`: the application log (PD-MONITOR-002, whose default threshold keeps it) and the session log at
   * `INFO` (REQ-SESSION-142, whose default `WARNING` threshold drops it). For what the configuration does by design and
   * a requirement obliges the port to log — REQ-TOOLS-006's removal by a narrowing control, which was a warning on every
   * coordinated run until live-run finding L14. Absent means such a line goes through `warn`.
   */
  readonly info?: ((message: string) => void) | undefined;
  /** REQ-TOOLS-065's abort hook: stops this run. */
  readonly abortRun: () => void;
  /** Part B: the agent's delegation identity — its operations, its own id as a parent, and its depth. */
  readonly delegation?: DelegationOps | undefined;
  readonly parentId?: string | undefined;
  readonly depth?: number | undefined;
  /**
   * REQ-TOOLS-006 (4) under OQ-145: the persona of the agent that delegated this one, whose `tool_restrictions` entry
   * naming this agent's persona narrows its grant. Absent for the entry agent, which nobody delegated.
   */
  readonly parentPersona?: string | undefined;
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
  /** `code: 'confinement'` (REQ-NOTIFY-060/061): the refusal is the start-time confinement gate's, kept as its own class. */
  readonly configure?: ((workspaceRoot: string, ctx: { readonly attended: boolean; readonly sessionId: SessionId; readonly executionRoot: string; readonly entryPersona?: string | undefined }) => Result<RunSetup, { readonly reason: string; readonly code?: 'confinement' }>) | undefined;
  /**
   * REQ-CHAT-006 / REQ-SESSION-026: the model catalogue of a workspace's configuration as it stands, for READING a session no
   * run of this process has started — which configured key a session-wide override replaces. A read, never a run start: it
   * must not do what `configure` does for a run (the run host's MCP configuration load, its per-run maps, its log line), so
   * a record read never calls `configure`. `null` where the configuration does not load; absent, a resting session's
   * record names no override.
   */
  readonly restingCatalogue?: ((workspaceRoot: string) => readonly CatalogueEntry[] | null) | undefined;
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
  readonly resilience?: { readonly catalogue: readonly CatalogueEntry[]; readonly fallbackModel: ModelChoice | null; readonly fallbackKey?: string | undefined } | undefined;
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

/** REQ-NOTIFY-070: what `Sessions.restartOnFallback` pinned and restarted on — the pair that failed and the fallback now in use. */
export interface AuthFallbackRestart {
  readonly failed: { readonly provider: string; readonly model: string; readonly key: string | null };
  readonly fallback: { readonly provider: string; readonly model: string; readonly key: string };
  readonly prompt: string;
}

/** REQ-NOTIFY-072/074: a model as the authentication recovery names it — its `models:` key when it has one, its provider identity (REQ-NOTIFY-082's), its model id. */
export interface AuthRecoveryModel {
  readonly key: string | null;
  readonly provider: string;
  readonly model: string;
}

/**
 * REQ-NOTIFY-069/072/074: what the authentication recovery dialog is drawn from, as the session's owner knows it — the model
 * the failed root call was addressed to (null where the run's failure was no root model call's), the model the session's
 * entry agent is on now (what the dialog names where the failed one is unknown), every configured model a restart could pin
 * (resolvable for this session), and whether a last prompt is recorded to restart with.
 */
export interface AuthRecoveryFacts {
  readonly failed: AuthRecoveryModel | null;
  readonly active: AuthRecoveryModel | null;
  /** REQ-MONITOR-194: `excluded` marks a pair the session holds out of quota — listed, annotated, still choosable. */
  readonly models: readonly (AuthRecoveryModel & { readonly key: string; readonly excluded?: true })[];
  readonly lastPrompt: boolean;
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
  /**
   * REQ-CHAT-006 / REQ-SESSION-026: for a session no run of this process has started, the catalogue its record's
   * `modelOverrides` and (since fin10, REQ-MONITOR-194) `excludedModels` are read against — resolved once, the first time its
   * record is read, and only where its timeline holds a `model_override` or `model_exhausted` entry (`null` otherwise, or
   * where the configuration does not resolve). Absent until then.
   * Never re-read for the life of the process: every path that writes a `model_override` or records an exclusion (a wait
   * choice, an authentication pin or its take-back, a quota answer) acts on a run this process started, and `s.run`, once
   * set, is never cleared and is read first, so a `null` cached before an entry existed never hides one written after. The
   * one write at rest, `chooseNextModel`'s clearing, clears `restingMemory` itself where one was built, and needs none where
   * none was (no exclusion was there to clear).
   */
  restingCatalogue?: readonly CatalogueEntry[] | null;
  /**
   * The memory a resting read rehydrated against `restingCatalogue`, kept apart from `memory`: a run that starts later
   * rehydrates its own through its configuration (`memoryOf`), so a read never decides what a run resolves. Read only
   * while `memory` is null; once a run or an at-rest control has rehydrated `memory`, the record reads that.
   */
  restingMemory?: ResilienceMemory | null;
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
  /**
   * REQ-MONITOR-105 with ADR-0024 (residual 2 of `a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`):
   * every run of this process on the session that parked — the plan gate, the message-limit pause — without closing its
   * tool ports. A call of any of them that ignored its abort may still hold its `tool_calls` ring row `running`, so the
   * crash record's ring settle is skipped while one is here (`ownCallsMayRunOf`), not only while the LAST run is parked:
   * a later run that tore down does not re-arm the settle over an earlier one's rows. A run leaves the set once it has
   * closed its ports. Which of a parked run's ports a park or a continue should close is OQ-170's.
   */
  readonly portsOpen: Set<Run>;
  /**
   * REQ-NOTIFY-061's last sentence for a session that already exists: the latest attempt to start a run on it was refused
   * at the confinement gate, so the record it publishes stops describing it as sandboxed (`sandboxed: false`, no backend)
   * until a run of it starts again. Held in memory and not written to the row: the row's `sandboxed`/`sandbox_backend`
   * stay the latest run that started's own fact (REQ-SANDBOX-094, REQ-SANDBOX-121), and a refused run writes no snapshot
   * (REQ-SANDBOX-126). Set by `refusedAtStart`, cleared by `launchContinuation`.
   */
  refusedConfinement?: boolean;
  /**
   * REQ-ORCH-154 with REQ-NOTIFY-070/074/076: the plan decision that launched a run of this session, kept with the run it
   * launched, so an authentication restart of that run relaunches the same decision (`relaunchAfterAuthFailure`). Read
   * only while that run is the session's last: any other launch replaces `run`, and the record no longer matches.
   */
  planLaunch?: PlanDecisionLaunch | undefined;
}

/**
 * REQ-ORCH-154: what a plan decision launched a run to do — approve carrying the plan as the user left it (their edit
 * where they edited it), revise starting a further cycle with the plan as it stood and the changes they stated — and the
 * run it launched. In memory with that run: a restart is only ever asked of the process that ran it, since main's focus
 * gate and the run host's `failedEntryModel` both live there too.
 */
interface PlanDecisionLaunch {
  readonly run: Run;
  readonly decision: 'approve' | 'revise';
  /** The cycle the decision settled. */
  readonly cycle: number;
  /** The plan as it stood when the decision was taken: the user's edit where they edited it, else the verbatim plan. */
  readonly plan: string;
  readonly changes: string;
}

/**
 * REQ-MONITOR-105 with ADR-0024: whether a call of a run of this process on the session may still be under way — some
 * run that parked without closing its tool ports. The current run joins the set (it is not running when a continue
 * launches, so it either tore down or parked) and every run that has closed its ports since leaves it.
 */
function ownCallsMayRunOf(s: Live): boolean {
  if (s.run !== null) s.portsOpen.add(s.run);
  for (const r of s.portsOpen) if (r.closedItsPorts) s.portsOpen.delete(r);
  return s.portsOpen.size > 0;
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
 * id a continuation gives the task it appends. REQ-CHAT-089: 8 lowercase hexadecimal characters (the repair of
 * a-queued-prompts-task-id-is-not-eight-hex-characters.md; this was `<session>:continued:<n>`). A run host that
 * died mid-iteration leaves the dead iteration's task to go back to `pending` and be selected again, so the id is unique
 * among every id the todo already holds and every task id an iteration recorded, and the new prompt never shares one
 * with it. A record written under the old form reads back unchanged: an id is compared, never parsed.
 */
function continuedTaskId(dal: StoreDal, sessionId: SessionId, todo: TodoDocument | undefined): string {
  const taken = new Set((todo?.phases ?? []).flatMap((phase) => [...(phase.id === undefined ? [] : [phase.id]), ...phase.tasks.map((task) => task.id)]));
  for (const r of dal.iterationsOf(sessionId)) taken.add(r.todo_task_id);
  return mintTodoId(taken);
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
  // REQ-SESSION-115: "task display titles cut to 80 characters" — the title the Todo pane draws (`taskTitle`), so a queued
  // prompt's task is its name "Queued Prompt: <id>" (REQ-CHAT-040), not its name and its content.
  const tasks = (todo?.phases ?? []).flatMap((phase) => phase.tasks.map((task) => `- [${task.state}] ${cut(taskTitle(task), 80)}`));
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


/** REQ-NOTIFY-045 / REQ-NOTIFY-069: a session's last submitted prompt — its row, its text and the images sent with it. */
export interface LastPrompt {
  readonly index: number;
  readonly text: string;
  readonly attachments: readonly StoredAttachment[];
}

/**
 * REQ-NOTIFY-045 / REQ-NOTIFY-069 / REQ-SESSION-192: the session's last submitted prompt, read over EVERY row — resident or
 * released to a page — so a prompt more than `RESIDENT_ROW_CAP` rows back is still the session's. The one reading the
 * retry (`Sessions.retry`), the continue, the plan decision and the authentication restarts share; null only where no
 * prompt was ever submitted. Until 2026-10-02 each of them searched `residentRows` and, once the prompt had been released,
 * fell back to the session id as the prompt's text (the continue, the plan decision) or to '' (the restarts), and the
 * renderer's retry searched its replica's window (`docs/defects/fixed/the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md`).
 */
export function lastSubmittedPrompt(dal: StoreDal, sessionId: SessionId): LastPrompt | null {
  const row = dal.lastPromptRow(sessionId);
  return row === undefined ? null : { index: row.row_index, text: row.body, attachments: decodeStoredAttachments(row.attachments) };
}

/**
 * REQ-ORCH-004: the request a continuation, a plan decision or a relaunched decision carries as its "Latest user request"
 * and labels its task with — the last submitted prompt's text. The session id stands in only for a session with no
 * submitted prompt at all (a transcript cleared under REQ-CHAT-084), never for one whose prompt has been released.
 */
function latestRequestOf(dal: StoreDal, stored: SessionRow): string {
  return lastSubmittedPrompt(dal, stored.session_id as SessionId)?.text ?? stored.session_id;
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
    // REQ-MONITOR-057/060: likewise the persona the live run's root runs as, which only a live run knows.
    entryPersona: null,
    // REQ-MONITOR-117/119: likewise the entry agent's stall, which only a live run's watch knows.
    entryStalledSeconds: null,
    // REQ-MONITOR-044/052: likewise the run-level agent's own count (`entryToolCallsOf`), which reads the children's rows.
    entryToolCalls: null,
    // REQ-MONITOR-086: the stored run-wide aggregate; a live run's leads it (`runCompressionsOf`).
    compressions: r.compressions,
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
    sandboxBackend: r.sandboxed === 1 ? r.sandbox_backend : '',
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
    modelOverrides: [],
    excludedModels: [],
  };
}

/**
 * REQ-MONITOR-060/061 (live-run finding K1, R-067): the run-level agent's tools. A live run reports its root port's resolution
 * and the tracker's history (`Run.entryTools`). With none, nothing is resolved — the persona's declared tools stand in on the
 * surface (REQ-MONITOR-060) — and the history is the tracker's, seeded from the tool-call ring when the session was opened,
 * under the persona the latest iteration's root ran as (the name the root dispatches under).
 *
 * With no iteration recorded, every root the session has run was a plan cycle's (REQ-ORCH-153: a plan cycle is not an
 * iteration), and no row names it. Only a root or a child dispatches a call, and a child under its canonical name, so the
 * tracker's names that are no child's are those roots', and their calls are the run-level agent's history. Before this the
 * history was read under no name, and in a session whose first run parked at the gate every chip read `not used` while the
 * user reviewed the plan (the repair of
 * `the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`, acceptance A21, R-067).
 *
 * With an iteration recorded, the root that ran last may still be a plan cycle's: PD-ORCH-003 lets the user re-arm `plan`
 * after an iteration, and the cycle's root runs fresh under the run's persona, which may have been switched in between.
 * Every plan cycle's root is recorded in `plan_roots` with the name it dispatches under and when its turn started (store
 * v30), so the history is read under whichever root opened last — the latest plan cycle's root when it opened after the
 * latest iteration, that iteration's root otherwise (a tie goes to the iteration: an approved plan's iteration opens after
 * its cycle). Before this the latest iteration's root was read whenever one existed, and a plan cycle under a switched
 * persona was marked from the earlier iteration root's calls (the repair of
 * `a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`).
 */
export function entryToolsOf(dal: StoreDal, sessionId: SessionId, run: { readonly entryTools: EntryToolsPayload } | null | undefined, activity: AgentActivity): EntryToolsPayload {
  if (run) return run.entryTools;
  const iteration = dal.iterationsOf(sessionId).at(-1);
  if (iteration) {
    const plan = dal.planRootsOf(sessionId).at(-1);
    const persona = plan && plan.opened_at > iteration.opened_at ? plan.root_persona : iteration.root_persona;
    return { resolved: [], called: activity.calledTools(persona), active: [] };
  }
  const children = new Set(dal.childrenOf(sessionId).map((c) => c.canonical_name));
  return { resolved: [], called: activity.calledToolsWhere((agent) => !children.has(agent)), active: [] };
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
 * `root_canonical_name` (which its publishes and reads record). Then every plan cycle's root (REQ-ORCH-153: a plan cycle is
 * not an iteration and has no row there), recorded when its turn started (`StoreDal.planRootsOf`, store v30) by the same
 * pair, so it is named once its run has parked at the gate or ended whether or not it published — before v30 a plan
 * cycle's root that only READ an artifact was named only while its run was live, and what it read, which records it by
 * its canonical name (REQ-LIBRARY-099), was no agent's received link at the gate (the repair of
 * `a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`, acceptance A22, R-067). Then each root
 * no row records that published, by its publish (`StoreDal.rootPublishersOf`) — a plan cycle's from before v30: a root
 * publishes under its task id as its conversation (OQ-106), always as a fresh root, so the publish's persona is the name
 * its rows carry and `created_by` its canonical name (found by the fifth review of that repair). Last the live run's
 * current root.
 */
export function entryRootsOf(dal: StoreDal, sessionId: SessionId, run: { readonly currentRoot: EntryRoot | null } | null | undefined): EntryRoot[] {
  const out: EntryRoot[] = [];
  const add = (root: EntryRoot): void => { if (!out.some((r) => r.name === root.name && r.canonical === root.canonical)) out.push(root); };
  for (const r of dal.iterationsOf(sessionId)) add({ name: r.root_persona, canonical: r.root_canonical_name });
  for (const r of dal.planRootsOf(sessionId)) add({ name: r.root_persona, canonical: r.root_canonical_name });
  for (const p of dal.rootPublishersOf(sessionId)) if (p.source_persona && p.created_by) add({ name: p.source_persona, canonical: p.created_by });
  if (run?.currentRoot) add(run.currentRoot);
  return out;
}

/**
 * REQ-MONITOR-044/052 (the repair of `the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md`, acceptance A20,
 * R-067): the run-level agent's tool-call count. The session's total holds every root's calls and every child's, each
 * child's share persisted on its row with it (`SessionWriter.countToolCalls`), so the roots' share is the total less the
 * children's persisted counts. A root's calls join the total only when its turn returns (REQ-ORCH-097's cadence, OQ-116),
 * so the live run adds the calls its current root has made and the total does not hold yet (`Run.entryUncountedToolCalls`).
 * Before this the surfaces read the total less the children's displayed counts, and while the root's turn ran its meta
 * line read `0 tool calls` beside the tools it had used.
 */
/**
 * REQ-MONITOR-086 with REQ-SESSION-139 (the repair of
 * `the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`): the run-wide compression
 * count `SessionRecord.compressions` carries — the live run's maintained aggregate while one is live, which the stored
 * `sessions.compressions` lags until the pass's save, else the stored one. Both are raised at the same completion as the
 * compressing agent's own count (`run/compression.ts`), the roots' included, so the figure is the sum of the per-agent
 * counts; until this the surfaces summed the children's alone and a root's compressions were counted nowhere.
 */
export function runCompressionsOf(row: Pick<SessionRow, 'compressions'>, run: { readonly compressions: number } | null | undefined): number {
  return run ? Math.max(row.compressions, run.compressions) : row.compressions;
}

export function entryToolCallsOf(row: Pick<SessionRow, 'tool_calls'>, children: readonly Pick<ChildRow, 'tool_calls'>[], run: { readonly entryUncountedToolCalls: number } | null | undefined): number {
  const childCalls = children.reduce((n, c) => n + c.tool_calls, 0);
  return Math.max(0, row.tool_calls - childCalls) + (run?.entryUncountedToolCalls ?? 0);
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

/**
 * REQ-ORCH-014: the audit payload whose `run_intent` is the intent in effect — the newest continuation's
 * (`run_continuation_intent`, written by every continue's pre-flight, OQ-162), else the launch audit's, else null. The
 * repair of the header half of `continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md`:
 * the status read the launch audit alone, so after a continue it went on showing an intent the resumed run no longer used.
 */
export function intentPayloadOf(dal: Pick<StoreDal, 'getLaunchAudit' | 'latestTimelineEntry'>, sessionId: SessionId): string | null {
  return dal.latestTimelineEntry(sessionId, 'run_continuation_intent')?.metadata ?? dal.getLaunchAudit(sessionId)?.payload ?? null;
}

/**
 * REQ-ORCH-014: derived, not stored — `classifying` while the live run's pre-flight classification is in flight
 * (`classifying`, from `Run.intentClassifying`: a continuation classifies with the previous run's intent already on the
 * record, OQ-162), or while the run is starting and no audit exists; else the audit's `run_intent`.
 */
export function intentStatusOf(r: SessionRow, auditPayload: string | null, classifying = false): IntentStatus | null {
  if (classifying) return { phase: 'classifying' };
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
    grantRecorded: grantRecordedOf(c),
    calledTools: activity?.calledTools(c.canonical_name) ?? [],
    // REQ-MONITOR-211/213: a settled agent presents no active tool, whatever a crash left in the ring; nor does a paused one.
    activeTools: terminal || paused ? [] : activity?.activeTools(c.canonical_name) ?? [],
    delegationSessionId: null,
    inheritedContext: parseList(c.inherited_context).join(String.fromCharCode(10)),
    live: shownPs === 'running',
    ...mcpEvidenceOf(c.granted_mcp),
    interruption: crashLeft ? 'crash' : paused && isInterruption(c.interruption) ? c.interruption : null,
    // REQ-ORCH-089 / REQ-MONITOR-119: the stall watch's latest figure, live from the tracker; an agent settled or paused has none.
    stalledSeconds: terminal || paused ? null : activity?.stalledSeconds(c.canonical_name) ?? null,
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

/**
 * REQ-MONITOR-049/060 with REQ-MCP-065: whether the row holds a recorded grant. `recordChildGrant` marks the evidence it
 * writes `recorded: true`, so a grant REQ-TOOLS-006's controls left empty of native tools reads as recorded. A row written
 * before the marker (2026-10-01) keeps the reading it had: an empty native list is no grant recorded, and the persona's
 * declared tools stand in; a non-empty one is the grant (a pre-2026-10-01 spawn wrote the declared set there).
 */
function grantRecordedOf(c: Pick<ChildRow, 'granted_tools' | 'granted_mcp'>): boolean {
  try {
    const v = JSON.parse(c.granted_mcp) as { recorded?: unknown } | null;
    if (v !== null && typeof v === 'object' && v.recorded === true) return true;
  } catch { /* an unreadable value carries no marker */ }
  return parseList(c.granted_tools).length > 0;
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
  /** REQ-CONFIG-094: every session with a place on a model, counted together against each model's cap (acceptance A13). */
  private readonly modelSlots: ModelSlots;
  /**
   * Each session's one place in `modelSlots`, while it runs or rests holding a slot (PD-ORCH-005 clause 4), with the run
   * a freed slot elsewhere wakes — none while it rests.
   */
  private readonly slotHolders = new Map<SessionId, { readonly holder: SlotHolder; readonly leave: () => void; target: { run?: Run } | null }>();
  readonly seq = new SequenceCounters();
  readonly bus: EventBus;

  constructor(private readonly deps: SessionsDeps) {
    this.bus = new EventBus({ timers: deps.clocks.timers, warn: deps.warn });
    this.modelSlots = new ModelSlots(deps.warn);
  }

  /**
   * REQ-CONFIG-094: a session's place in the process-wide per-model count — what it answers for its children (read from
   * its store: every child of the session that holds a slot, `holdsModelSlot`), the wake that promotes a child its run
   * holds when a slot frees elsewhere, and what its run asks of the others. The session joins when a run of it starts
   * and stays joined for as long as it runs, or rests with a paused child keeping its place (PD-ORCH-005 clause 4,
   * OQ-149); `settleModelSlots` lets it go.
   */
  private modelSlotsFor(sessionId: SessionId, dal: StoreDal, runRef: { run?: Run }): NonNullable<RunDeps['modelSlots']> {
    let entry = this.slotHolders.get(sessionId);
    if (!entry) {
      const holder: SlotHolder = {
        // A store that cannot be read answers nothing for this session rather than raising into another session's pass.
        inUse: (modelKey) => { try { return dal.childrenOf(sessionId).filter((c) => c.model_key === modelKey && holdsModelSlot(c)).length; } catch (cause) { this.deps.warn(`the model slots of ${sessionId} could not be read: ${String(cause)}`); return 0; } },
        wake: () => { this.slotHolders.get(sessionId)?.target?.run?.wakeForFreedSlot(); },
      };
      entry = { holder, leave: this.modelSlots.join(holder), target: null };
      this.slotHolders.set(sessionId, entry);
    }
    entry.target = runRef;
    const holder = entry.holder;
    return { heldElsewhere: (modelKey) => this.modelSlots.heldElsewhere(modelKey, holder), freed: () => { this.modelSlots.freed(holder); } };
  }

  /**
   * REQ-MONITOR-020: what a session holds may have dropped outside its run's scheduler — its run ended (`runRef`), or a
   * paused child was cancelled at rest. Every other run passes again; a session with no run and no place left leaves.
   */
  private settleModelSlots(sessionId: SessionId, dal: StoreDal, runRef?: { run?: Run }): void {
    const entry = this.slotHolders.get(sessionId);
    if (!entry) return;
    if (runRef !== undefined && entry.target === runRef) entry.target = null;
    let holds = true;
    try { holds = entry.target !== null || dal.childrenOf(sessionId).some(holdsModelSlot); } catch (cause) { this.deps.warn(`the model slots of ${sessionId} could not be read: ${String(cause)}`); }
    if (holds) { this.modelSlots.freed(entry.holder); return; }
    this.slotHolders.delete(sessionId);
    entry.leave();
  }

  /** A session evicted or deleted from this process holds no place any more. */
  private dropModelSlots(sessionId: SessionId): void {
    const entry = this.slotHolders.get(sessionId);
    if (!entry) return;
    this.slotHolders.delete(sessionId);
    entry.leave();
  }

  /**
   * REQ-SESSION-042/154/182: read-only workspace listing with shared stale semantics. Each row's label is its listing
   * record's task title (REQ-SESSION-030/032: the newest top-level task, derived from the row's own persisted todo), else
   * the session id (REQ-SESSION-030's reader default). Until 2026-10-02 it was the oldest resident `user` row, read from
   * every listed session's transcript, so the cost grew with the transcripts and a session whose first prompt was released
   * past the resident window was listed under another name
   * (docs/defects/fixed/the-session-list-reads-each-sessions-transcript-for-its-label.md).
   */
  list(dal: StoreDal, workspaceRoot: string): SessionListItem[] {
    const now = Number(this.deps.clocks.wall.instant());
    return dal.listSessions().filter((row) => row.workspace_root === workspaceRoot).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((row) => {
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
        label: cut(sessionTaskTitle(row.todo) || row.session_id, 80),
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
      this.dropModelSlots(sessionId);
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
      readSession: () => { const current = dal.getSession(sessionId)!; const children = dal.childrenOf(sessionId); const { crashLeft, cancelLeft, resumable } = this.restingOf(dal, current, writer); return { ...toSessionRecord(current, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId), planGateOf(dal, current), resumable), ...projectSessionTodos(current, children), agents: children.map((c) => toAgentRecord(c, this.deps.clocks, { activity: writer.activity, reasoningFor: (p) => entry.run?.reasoningFor(p) ?? null, contextLimitFor: this.deps.contextLimitFor, session: { executionStatus: current.execution_status, updatedAt: current.updated_at }, crashLeft, cancelLeft })), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(current, intentPayloadOf(dal, sessionId), entry.run?.intentClassifying ?? false), wait: entry.run?.currentWait ?? null, modelOverrides: this.modelOverridesFor(sessionId), excludedModels: this.excludedModelsFor(sessionId), compression: entry.run?.currentCompression ?? null, entryContext: entry.run?.entryContext ?? { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: entryToolsOf(dal, sessionId, entry.run, writer.activity), artifacts: artifactLinksOf(dal, sessionId), entryRoots: entryRootsOf(dal, sessionId, entry.run), entryPersona: entry.run?.entryPersona ?? null, entryStalledSeconds: entry.run?.entryStalledSeconds ?? null, entryToolCalls: entryToolCallsOf(current, children, entry.run), compressions: runCompressionsOf(current, entry.run), pendingQuestions: entry.run?.pendingQuestions() ?? [], ...this.confinementShown(sessionId) }; },
      readResident: () => dal.residentRows(sessionId).map((r) => ({ ...toTranscriptRow(r), ...(r.attachments === '[]' ? {} : { attachments: projectAttachments(this.deps.sessionFilesDir(dal, sessionId), r.attachments) }) })),
    });
    entry.owner = owner;
    // Part Q: the memory is rehydrated at the first continuation, when the run's model resolver exists (REQ-SESSION-196's override).
    this.live.set(sessionId, { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry, memory: null, artifacts: this.newArtifactStore(dal, sessionId, () => writer, warn), modeOverride: { value: null }, presence: new UserPresence({ record: warn }), portsOpen: new Set() });
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
      readSession: () => { const row = dal.getSession(sessionId)!; const children = dal.childrenOf(sessionId); const { crashLeft, cancelLeft, resumable } = this.restingOf(dal, row, writer); return { ...toSessionRecord(row, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId), planGateOf(dal, row), resumable), ...projectSessionTodos(row, children), agents: children.map((c) => toAgentRecord(c, this.deps.clocks, { activity: writer.activity, reasoningFor: (p) => entry.run?.reasoningFor(p) ?? null, contextLimitFor: this.deps.contextLimitFor, session: { executionStatus: row.execution_status, updatedAt: row.updated_at }, crashLeft, cancelLeft })), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(row, intentPayloadOf(dal, sessionId), entry.run?.intentClassifying ?? false), wait: entry.run?.currentWait ?? null, modelOverrides: this.modelOverridesFor(sessionId), excludedModels: this.excludedModelsFor(sessionId), compression: entry.run?.currentCompression ?? null, entryContext: entry.run?.entryContext ?? { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: entryToolsOf(dal, sessionId, entry.run, writer.activity), artifacts: artifactLinksOf(dal, sessionId), entryRoots: entryRootsOf(dal, sessionId, entry.run), entryPersona: entry.run?.entryPersona ?? null, entryStalledSeconds: entry.run?.entryStalledSeconds ?? null, entryToolCalls: entryToolCallsOf(row, children, entry.run), compressions: runCompressionsOf(row, entry.run), pendingQuestions: entry.run?.pendingQuestions() ?? [], ...this.confinementShown(sessionId) }; },
      readResident: () => dal.residentRows(sessionId).map((r) => ({ ...toTranscriptRow(r), ...(r.attachments === '[]' ? {} : { attachments: projectAttachments(this.deps.sessionFilesDir(dal, sessionId), r.attachments) }) })),
    });
    entry.owner = owner;
    const live: Live = { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry, memory: new ResilienceMemory(), artifacts: this.newArtifactStore(dal, sessionId, () => writer, warn), modeOverride: { value: null }, presence: new UserPresence({ record: warn }), portsOpen: new Set() };
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
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, info: (m: string) => { log?.info(m); this.deps.log?.(m); }, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, presence, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    // With delegation the run creates the root's port itself (its own identity); the base port exists only without it.
    const tools: ToolPort | null = null;
    live.tools = tools;
    // REQ-ORCH-053: a run that has just taken the lock settles every non-terminal child a previous run left, before its first iteration.
    // REQ-HOOKS-003: each settled child's `child_completed` is the run's, fired once its `session_start` has.
    const settledBeforeStart: Readonly<Record<string, unknown>>[] = [];
    const stale = settleStaleChildren(dal, writer, sessionId, warn, artifacts, (fields) => { settledBeforeStart.push(fields); });
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first iteration (REQ-ORCH-053)`);
    // REQ-ORCH-024: the configured policy; the run clamps it by the pre-flight's BUDGET cell (the `normal` cell stood in until playbooks existed).
    const budget = runtime?.childBudget ?? DEFAULT_BUDGET;
    const cap = runtime?.modelConcurrencyCap ?? null;
    const capFor = runtime?.modelCapFor ?? (() => cap);
    const preflight = this.deps.preflight;
    const slots = this.modelSlotsFor(sessionId, dal, runRef);
    const run = new Run({
      sessionId, workspaceRoot, effectiveRoot, task: prompt, taskContent: [...(prompt === '' ? [] : [{ kind: 'text' as const, text: prompt }]), ...storedAttachments.content], taskId: mintTodoId(new Set()), writer, owner, bus: this.bus, clocks: this.deps.clocks,
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
      dal, readSession: () => dal.getSession(sessionId), warn, hooks, settledBeforeStart, checkpoints, ...(this.deps.notice ? { notice: this.deps.notice } : {}),
      onSaved: (g) => summary.rebuild(g, () => dal.getSession(sessionId)),
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn, countUsage }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        // REQ-LIBRARY-093: a publish records the instance's canonical name — the root's comes apart from its agent name, its persona.
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string, parentPersona?: string) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, ...(parentPersona === undefined ? {} : { parentPersona }), modeOverride: modeOverride.value, grant: decided.grant, intent: decided.intent, artifacts: artifactOps(artifacts, { canonicalName: canonicalName ?? agentName, persona, conversationId: parentId }), readTodo: () => runRef.run?.agentTodoFor(parentId, depth === 0) ?? null, writeTodo: (document) => runRef.run?.replaceAgentTodo(parentId, depth === 0, document) ?? false, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false, writeClaimFor: (rel) => runRef.run?.writeClaimFor(parentId, rel) ?? null }),
        artifacts, budget, modelCap: capFor, modelSlots: slots,
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
    // REQ-CONFIG-094: counted with every other session in this process (`modelSlotsFor`); its end settles what it held.
    live.running = run.start().finally(() => { this.settleModelSlots(sessionId, dal, runRef); delete entry.run; log?.info(`run ended ${run.outcome?.status ?? 'unknown'}`); log?.close(); });
    return ok(sessionId);
  }

  /**
   * REQ-NOTIFY-045 with REQ-NOTIFY-030 and REQ-CHAT-173 (OQ-178): a notice's retry where the composer's draft is blank —
   * the session's last submitted prompt (`lastSubmittedPrompt`, released rows included) resubmitted as `prompt` submits
   * one, with the images it was sent with read back from the session's directory by path and verified by digest
   * (`readBackAttachments`), so they never cross the command boundary a second time. A missing or altered image refuses
   * the retry, naming it, rather than resubmitting less than was sent; REQ-CHAT-171's gate, the live-run refusal and the
   * rest are `prompt`'s, against the model the retry runs on. Refused as having nothing to retry only where no prompt was
   * ever submitted. Until 2026-10-02 the retry was the renderer's: it searched its replica's resident window and re-sent
   * the text alone (`docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md`,
   * `docs/defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md`).
   */
  retry(sessionId: SessionId): Result<TranscriptRow, { code: string; reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const last = lastSubmittedPrompt(s.dal, sessionId);
    if (last === null) return err({ code: 'no-prompt', reason: 'No prompt has been submitted in this session, so there is nothing to retry.' });
    const images = readBackAttachments(this.deps.sessionFilesDir(s.dal, sessionId), last.attachments);
    if (!images.ok) return err({ code: 'attachment-unavailable', reason: `The last prompt was not retried, because its image ${images.name} could not be read back: ${images.reason}` });
    return this.prompt(sessionId, last.text, images.inputs);
  }

  /** REQ-SESSION-114..116: append first, then continue through the ordinary Run lifecycle. */
  prompt(sessionId: SessionId, prompt: string, inputs: readonly ImageAttachmentInput[] = []): Result<TranscriptRow, { code: string; reason: string }> {
    // ADR-0005: a lock the continue took is given back when it launches no run; a launched run's teardown releases it.
    const hold: HoldSlot = {};
    const r = this.promptHeld(sessionId, prompt, inputs, hold);
    if (!r.ok) hold.release?.();
    return r;
  }

  /**
   * `beginning` (an authentication restart — REQ-NOTIFY-070's, REQ-NOTIFY-074/076's): called once every refusal has passed,
   * just before the prompt's user row, so a row announcing the restart is written only when the run begins — never beside
   * a refusal.
   */
  private promptHeld(sessionId: SessionId, prompt: string, inputs: readonly ImageAttachmentInput[], hold: HoldSlot, beginning?: () => void): Result<TranscriptRow, { code: string; reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery before continuing work: ${storeFailure}` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const storedForSetup = s.dal.getSession(sessionId);
    const setup = this.setupFor(storedForSetup?.workspace_root ?? '', this.deps.attended?.() ?? false, sessionId, storedForSetup ? effectiveRootOf(storedForSetup).root : '', resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
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
    beginning?.();
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
   * A run of an existing session refused before it started (REQ-NOTIFY-061): at the confinement gate, the record stops
   * describing the session as sandboxed and is published again, so the workspace indicator (REQ-SANDBOX-121) is gone
   * beside the refusal notice. Every other refusal leaves the record as it was. Called by every path that would start a
   * run of a live session: the prompt (and through it the retry and the authentication restarts), the continue, the
   * plan decision and the restart on the fallback. Before 2026-10-02 nothing was written or published, and a confined
   * session refused at the gate kept reading `sandbox: <backend>` (fin8's verifier, round 1).
   */
  private refusedAtStart(s: Live, refusal: StartRefusal): { readonly code: string; readonly reason: string } {
    if (refusal.code === 'confinement') {
      s.refusedConfinement = true;
      s.owner.reconcile();
    }
    return { code: refusal.code, reason: refusal.reason };
  }

  /** The record's confinement fields while `refusedConfinement` holds (see `Live.refusedConfinement`); nothing otherwise. */
  private confinementShown(sessionId: SessionId): { readonly sandboxed?: false; readonly sandboxBackend?: '' } {
    return this.live.get(sessionId)?.refusedConfinement === true ? { sandboxed: false, sandboxBackend: '' } : {};
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
      return r.ok ? ok(r.value) : err(refused(r.error.code === 'confinement' ? 'confinement' : 'configuration', r.error.reason));
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
    // REQ-NOTIFY-061: a run of the session starts, so its own confinement fact is the record's again (`refusedAtStart`).
    s.refusedConfinement = false;
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
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer: s.writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, info: (m: string) => { s.log?.info(m); this.deps.log?.(m); }, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, presence, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    s.tools = null;
    // PD-ORCH-005 clause 3: what a crash left is recorded before the settle, which leaves every `paused` agent as it is.
    // A run of this process that parked closed no tool port: a ring row still `running` may be its call still under way —
    // any such run's, not only the last one's.
    this.recordCrashOf(s.dal, s.writer, sessionId, warn, artifacts, ownCallsMayRunOf(s));
    // REQ-HOOKS-003: each settled child's `child_completed` is the run's, fired once its `session_start` has.
    const settledBeforeStart: Readonly<Record<string, unknown>>[] = [];
    const stale = settleStaleChildren(s.dal, s.writer, sessionId, warn, artifacts, (fields) => { settledBeforeStart.push(fields); });
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
    const slots = this.modelSlotsFor(sessionId, s.dal, runRef);
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
      continuation: true, ...(todo ? { resumeTodo: todo } : {}), ...(appendsTask && !restatesUnfinished ? {} : { appendsTask: false }), ...(hooks ? { hooks } : {}), settledBeforeStart, checkpoints,
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      onSaved: (generation) => summary.rebuild(generation, () => s.dal.getSession(sessionId)),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn, countUsage, previousIntent: priorIntent, hasUnfinishedWork: true }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        // REQ-LIBRARY-093: a publish records the instance's canonical name — the root's comes apart from its agent name, its persona.
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string, parentPersona?: string) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, ...(parentPersona === undefined ? {} : { parentPersona }), modeOverride: modeOverride.value, grant: decided.grant, intent: decided.intent, artifacts: artifactOps(artifacts, { canonicalName: canonicalName ?? agentName, persona, conversationId: parentId }), readTodo: () => runRef.run?.agentTodoFor(parentId, depth === 0) ?? null, writeTodo: (document) => runRef.run?.replaceAgentTodo(parentId, depth === 0, document) ?? false, planGateHeld: () => runRef.run?.isPlanGateHeld ?? false, writeClaimFor: (rel) => runRef.run?.writeClaimFor(parentId, rel) ?? null }),
        artifacts, budget, modelCap: capFor, modelSlots: slots,
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
    // REQ-CONFIG-094: counted with every other session in this process (`modelSlotsFor`); its end settles what it held.
    s.running = run.start().finally(() => { this.settleModelSlots(sessionId, s.dal, runRef); if (s.commitTarget) delete s.commitTarget.run; s.log?.info(`continued run ended ${run.outcome?.status ?? 'unknown'}`); s.log?.close(); });
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
        message: `${report.compressed} of ${countNoun(total, 'active agent context')} compressed; ${report.failed.length} failed.`,
        detail: report.failed.map((f) => `${f.agent}: ${f.reason}`).join('\n'),
        sessionId,
      });
    } else {
      this.deps.acknowledge?.('ok', `Compressed context for ${countNoun(report.compressed, 'active agent')}.`, report.unchanged > 0 ? `${countNoun(report.unchanged, 'agent context')} had nothing between the original request and the preserved turns and ${report.unchanged === 1 ? 'was' : 'were'} left as ${report.unchanged === 1 ? 'it was' : 'they were'}.` : undefined);
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

  /**
   * REQ-CHAT-090: a paused or completed session edits the validated stored source and republishes it.
   *
   * ADR-0005, REQ-EVENTS-098: the edit is written under the session's lock. A run's teardown releases it while the session
   * stays loaded here, so the edit claims it the way every other write from outside a run does (`claimHold`): kept when
   * this process holds it, taken for the write and given back otherwise, and refused with nothing written while another
   * live process holds it — in REQ-SESSION-048's words (`lockHeldRefusal`, `session_locked`), or `store_failed` when the
   * store could not be read or written to take it. A malformed request is refused before the lock is touched (the repair
   * of `a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`).
   */
  private editStoredTodo(s: Live | undefined, req: ControlRequest): ControlResult {
    if (!s) return { ok: false };
    const op = req.args['op'];
    const id = typeof req.args['id'] === 'string' ? req.args['id'] : '';
    const body = typeof req.args['text'] === 'string' ? req.args['text'] : '';
    if ((op !== 'add' && op !== 'update' && op !== 'remove') || (op !== 'add' && id === '') || (op !== 'remove' && body.trim() === '')) return { ok: false };
    const sid = s.writer.sessionId;
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    const hold = this.claimHold(s.dal, sid, warn);
    if ('holder' in hold) return { ok: false, refusal: { code: 'session_locked', message: lockHeldRefusal(sid, this.deps.host, hold.holder).reason } };
    if ('failure' in hold) {
      warn(`taking the lock of ${sid} for a todo edit failed: ${hold.failure}`);
      return { ok: false, refusal: { code: 'store_failed', message: `The workspace store could not take this session's lock, so the todo was not edited: ${hold.failure}` } };
    }
    try { return this.editStoredTodoUnderLock(s, req, op, id, body); }
    finally { hold.release(); }
  }

  private editStoredTodoUnderLock(s: Live, req: ControlRequest, op: 'add' | 'update' | 'remove', id: string, body: string): ControlResult {
    const stored = s.dal.getSession(s.writer.sessionId);
    if (!stored) return { ok: false };
    const requestedSource = req.args['source'];
    const source = requestedSource === 'child' || requestedSource === 'agent' || requestedSource === 'planner' ? requestedSource : 'planner';
    const ownerId = typeof req.args['ownerId'] === 'string' && req.args['ownerId'] !== '' ? req.args['ownerId'] : null;
    const phaseId = typeof req.args['phaseId'] === 'string' ? req.args['phaseId'] : 'main';
    let assigned: string | undefined;
    if (source === 'child') {
      const child = ownerId === null ? undefined : s.dal.childrenOf(s.writer.sessionId).find((candidate) => candidate.task_id === ownerId);
      if (!child?.todo) return { ok: false };
      try {
        const current: unknown = JSON.parse(child.todo);
        if (!isAgentTodoDocument(current)) return { ok: false };
        const edited = editAgentTodo(current, op, id, body, phaseId);
        if (!edited.changed) return { ok: false };
        s.dal.setChildTodo(s.writer.sessionId, child.task_id, JSON.stringify(edited.document), child.tool_calls);
        assigned = edited.id;
      } catch { return { ok: false }; }
    } else {
      const decoded = decodeStoredTodo(stored.todo);
      if (source === 'agent') {
        if (decoded.agent === null) return { ok: false };
        const edited = editAgentTodo(decoded.agent, op, id, body, phaseId);
        if (!edited.changed) return { ok: false };
        assigned = edited.id;
        if (!s.writer.save(stored.execution_status, { todo: encodeStoredTodo({ ...decoded, agent: edited.document }) }).ok) return { ok: false };
      } else {
        if (decoded.planner === null) return { ok: false };
        const planner = Todo.fromDocument(decoded.planner);
        // REQ-CHAT-089: an added task takes the backend's id, unique within the todo and the iterations' records.
        const nextId = op === 'add' ? mintTodoId(new Set([...planner.ids(), ...s.dal.iterationsOf(s.writer.sessionId).map((r) => r.todo_task_id)])) : id;
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
      // REQ-ORCH-098: torn down as the live cancel tears it down, after its entry.
      writeCancelledTeardown(s.writer, t, written.report);
    }
    // PD-ORCH-005 clause 16 with REQ-CONFIG-094: a cancelled paused child gives up the place it kept (OQ-149).
    this.settleModelSlots(sid, s.dal);
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
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
    const lastPrompt = latestRequestOf(s.dal, stored);
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const payload = buildContinuationPayload(s.dal, stored, lastPrompt, todo.value);
    const runtimeWithLimit: RunSetup = { ...setup.value, runtime: { ...setup.value.runtime, messageLimit: limit } };
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), runtimeWithLimit, [], undefined, opts.withoutPaused === true ? 'decline' : { message: null });
    return ok({ resumed: true, messageLimit: limit });
  }

  /**
   * REQ-NOTIFY-070 / REQ-NOTIFY-074 / REQ-NOTIFY-076 with REQ-ORCH-154 — an authentication restart relaunches what the failed
   * run was launched to do, on the model the caller has just pinned (or, after a re-authentication, on the same one). A run
   * a plan decision launched is relaunched as that decision (`relaunchPlanDecision`): approve carries the plan as the user
   * left it again, and revise starts the same further cycle — its number, the changes stated, the plan as it stood — and
   * nothing is re-submitted, since a decision is no prompt. Any other run re-submits the session's last prompt
   * (`promptHeld`, OQ-182's reading). `beginning` runs once every refusal has passed, just before the launch.
   *
   * Until 2026-10-02's fourth repair round every restart took the second path, so a revise cycle that failed on a first 401
   * came back as a fresh cycle from the original prompt, the changes stated and the plan they revised dropped (and an
   * approved plan's edit with them).
   */
  private relaunchAfterAuthFailure(s: Live, sessionId: SessionId, lastPrompt: string, hold: HoldSlot, beginning: () => void): Result<void, { code: string; reason: string }> {
    const decided = s.planLaunch;
    if (decided !== undefined && s.run !== null && decided.run === s.run) return this.relaunchPlanDecision(s, sessionId, decided, hold, beginning);
    const restarted = this.promptHeld(sessionId, lastPrompt, [], hold, beginning);
    return restarted.ok ? ok(undefined) : err(restarted.error);
  }

  /**
   * REQ-ORCH-154: the decision `decided` launched again — `planDecisionHeld`'s launch with the same payload section and the
   * same cycle override, and the gate it settled left settled (approve's release stands). Refused, writing nothing, on the
   * refusals that launch shares with a prompt's.
   */
  private relaunchPlanDecision(s: Live, sessionId: SessionId, decided: PlanDecisionLaunch, hold: HoldSlot, beginning: () => void): Result<void, { code: string; reason: string }> {
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery before continuing work: ${storeFailure}` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return err(todo.error);
    // ADR-0005: the lock is taken back before the first write, and the run launched below holds it.
    const held = this.holdForContinue(s);
    if (!held.ok) return err(held.error);
    hold.release = held.value.release;
    const lastPrompt = latestRequestOf(s.dal, stored);
    const payload = `${buildContinuationPayload(s.dal, stored, lastPrompt, todo.value)}\n\n${planSection(decided.decision, decided.plan, decided.changes)}`;
    beginning();
    /*
     * The decision's own launch appends no task: the held run's todo carries the gated work (REQ-ORCH-004 / OQ-104). Its
     * relaunch lets the todo decide (`restatesUnfinished`): after a failed revise cycle — which takes up no task — the work
     * is still pending and nothing is appended; after a failed approved run, whose iteration abandoned the task
     * (REQ-ORCH-074), the request is appended again so the plan is carried out, as a re-submitted prompt's is (OQ-182).
     */
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), setup.value, [], decided.decision === 'revise' ? { cycle: decided.cycle + 1, changes: decided.changes } : undefined, { message: null }, true);
    // The relaunched run is the decision's now: a further authentication restart of it relaunches the same decision again.
    if (s.run !== null) s.planLaunch = { ...decided, run: s.run };
    return ok(undefined);
  }

  /**
   * REQ-NOTIFY-070 / REQ-MONITOR-147 / REQ-SESSION-026: the authentication recovery's automatic half. The session's last
   * run ended on its root's model call failing authentication; main classified the failure (REQ-NOTIFY-060/067) and asks
   * for this. The configured `fallback_model` (REQ-CONFIG-067) is pinned as the session's model override, keyed by the
   * pair that failed — the `model_override` entry `ResilienceMemory.rehydrate` replays, so the pin outlives the failed run
   * and a reload of the session, as a wait's choice does — and the run restarts with the same prompt (REQ-NOTIFY-068: the
   * failing pair is not tried again; the model changes).
   *
   * Refused, with nothing written, where the run is still active, its last failure was no model call's, no prompt is
   * recorded (REQ-NOTIFY-069), or no fallback is configured or the fallback is the model that failed (REQ-NOTIFY-072's
   * "no usable fallback"). Where the restart itself cannot begin, the pin is taken back (`cleared: true`) before the
   * refusal is returned, so the session is left on the model it had (REQ-NOTIFY-070's last sentence).
   *
   * Main keeps the "first failure of the session" bookkeeping (`apps/desktop/src/main/auth-fallback.ts`); this answers for one restart.
   * The restart re-submits the prompt as `prompt` does, so the transcript shows it sent again; the last prompt's
   * attachments are not re-sent (OQ-182's reading), though `lastSubmittedPrompt` — the reading it shares with the retry,
   * over released rows too — returns them, and the retry (`retry`) does re-send them.
   */
  restartOnFallback(sessionId: SessionId): Result<AuthFallbackRestart, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const failed = s.run?.failedEntryModel ?? null;
    if (failed === null) return err({ code: 'no-model-failure', reason: 'The session\'s last run did not end on a model call failing.' });
    const promptRead = this.lastPromptOf(s, sessionId);
    if (!promptRead.ok) return err(promptRead.error);
    const lastPrompt = promptRead.value;
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
    const catalogue = setup.value.resilience?.catalogue ?? [];
    const fallback = setup.value.resilience?.fallbackModel ?? null;
    if (fallback === null) return err({ code: 'no-fallback', reason: 'No fallback model is configured.' });
    const fallbackKey = setup.value.resilience?.fallbackKey ?? entryOf(catalogue, fallback.model)?.key ?? null;
    if (fallbackKey === null) return err({ code: 'no-fallback', reason: `The fallback model ${fallback.model.providerId}/${fallback.model.modelId} has no configured key to pin.` });
    const from = { provider: providerIdentity(catalogue, failed), model: failed.modelId, key: entryOf(catalogue, failed)?.key ?? null };
    const to = { provider: providerIdentity(catalogue, fallback.model), model: fallback.model.modelId, key: fallbackKey };
    if (pairKey(from.provider, from.model) === pairKey(to.provider, to.model)) return err({ code: 'fallback-failed', reason: `The fallback model ${to.provider}/${to.model} is the model that failed.` });
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    if (s.memory === null) {
      const resolve = (key: string): ModelChoice | null => { const r = setup.value.models?.(key); return r && r.ok ? r.choice : null; };
      s.memory = ResilienceMemory.rehydrate(s.dal.timelineOf(sessionId), resolve, warn);
    }
    const memory = s.memory;
    memory.setOverride(from.provider, from.model, { key: fallbackKey, choice: withSettings(catalogue, fallback) });
    s.writer.appendTimeline('model_override', 'rotaris', `Authentication failed on ${from.provider}/${from.model}; the fallback ${fallbackKey} (${to.provider}/${to.model}) is pinned for the rest of the session and the run restarts with the same prompt.`, { provider: from.provider, model: from.model, model_key: fallbackKey, to_provider: to.provider, to_model: to.model, cause: 'authentication' });
    // The transcript row is written only once the restart begins (every refusal passed), so a restart that cannot begin
    // leaves no row claiming one; where the restart fails after it (the user row's own write), a row says so.
    let announced = false;
    const hold: HoldSlot = {};
    const restarted = this.relaunchAfterAuthFailure(s, sessionId, lastPrompt, hold, () => {
      announced = s.writer.appendRow('system', `Authentication failed on ${from.provider}/${from.model}. The run restarts on the fallback model ${fallbackKey} (${to.provider}/${to.model}), which stays in use for this session.`, true).ok;
    });
    if (!restarted.ok) {
      hold.release?.();
      memory.clearOverride(from.provider, from.model);
      s.writer.appendTimeline('model_override', 'rotaris', `The run could not restart on the fallback ${fallbackKey} (${restarted.error.reason}); the pin on ${from.provider}/${from.model} is taken back.`, { provider: from.provider, model: from.model, cleared: true, cause: 'authentication' });
      if (announced) s.writer.appendRow('system', `The run could not restart on the fallback model ${fallbackKey} (${restarted.error.reason}); the session stays on ${from.provider}/${from.model}.`, true);
      return err({ code: 'restart-failed', reason: restarted.error.reason });
    }
    return ok({ failed: from, fallback: to, prompt: lastPrompt });
  }

  /**
   * REQ-NOTIFY-078: re-authentication of the provider that failed re-pins the primary model. The authentication pin on the
   * pair (`restartOnFallback`) is taken back — in the session's memory and as a `model_override` entry carrying
   * `cleared: true`, so a reload replays it — and a system row says so. Where a run of the session is live it switches from
   * its next iteration (`Run.rebuildEntryFromMemory`: the root's cell is rebuilt from the memory, the turn in flight
   * finishing on the fallback); otherwise the primary is used for the next run. Which of the two is the answer, for the
   * acknowledgement REQ-NOTIFY-078 asks for.
   */
  repinPrimary(sessionId: SessionId, primary: { readonly provider: string; readonly model: string }): Result<{ readonly applies: 'next-iteration' | 'next-run' }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const storeFailure = storeFailureOf(s.dal, s.writer);
    if (storeFailure !== null) return err({ code: 'store-failed', reason: `The workspace store requires recovery: ${storeFailure}` });
    if (s.memory === null) {
      const stored = s.dal.getSession(sessionId);
      const setup = stored ? this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false)) : null;
      const resolve = (key: string): ModelChoice | null => { const r = setup?.ok ? setup.value.models?.(key) : undefined; return r && r.ok ? r.choice : null; };
      s.memory = ResilienceMemory.rehydrate(s.dal.timelineOf(sessionId), resolve, (m) => { s.log?.warn(m); this.deps.warn(m); });
    }
    s.memory.clearOverride(primary.provider, primary.model);
    s.writer.appendTimeline('model_override', 'user', `The provider of ${primary.provider}/${primary.model} was re-authenticated; the fallback pinned in its place is taken back.`, { provider: primary.provider, model: primary.model, cleared: true, cause: 'reauthentication' });
    const live = s.run !== null && !s.run.isEnded && s.run.rebuildEntryFromMemory();
    s.writer.appendRow('system', live ? `Re-authenticated: the run switches back to ${primary.provider}/${primary.model} from the next iteration.` : `Re-authenticated: ${primary.provider}/${primary.model} will be used for the next run.`, true);
    return ok({ applies: live ? 'next-iteration' : 'next-run' });
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
   * REQ-CHAT-006 / REQ-SESSION-026 / REQ-NOTIFY-089: the session-wide overrides in force, by model key, for the record. A
   * session a run of this process has started reads its run's catalogue and the session's memory; one opened from the store
   * with no run here reads its workspace's catalogue once through the side-effect-free `restingCatalogue` port — only where
   * its timeline holds an override — and rehydrates a memory of its own against it (`restingMemory`, never the session's
   * `memory`, which the next run rehydrates through its configuration), so the chips name the override after a restart too.
   */
  private modelOverridesFor(sessionId: SessionId): { from: string; to: string }[] {
    const s = this.live.get(sessionId);
    return s ? this.modelOverridesOf(s, sessionId) : [];
  }
  private modelOverridesOf(s: Live, sessionId: SessionId): { from: string; to: string }[] {
    if (s.run) return s.run.modelOverridesInForce;
    const resting = this.restingReadOf(s, sessionId);
    return resting ? overridesInForce(resting.catalogue, resting.memory) : [];
  }

  /**
   * REQ-MONITOR-194: the configured model keys the session holds out of quota, for the record's `excludedModels` — the run's
   * own reading while one of this process exists, else the resting read's (`restingReadOf`), so a selector annotates them
   * after a restart too. Until 2026-10-02 (fin10) they reached the record only inside `wait`
   * (`docs/defects/fixed/the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md`).
   */
  private excludedModelsFor(sessionId: SessionId): string[] {
    const s = this.live.get(sessionId);
    if (!s) return [];
    if (s.run) return s.run.excludedModelKeys;
    const resting = this.restingReadOf(s, sessionId);
    return resting ? excludedModelKeys(resting.catalogue, resting.memory.exhausted) : [];
  }

  /**
   * The catalogue and memory a record of a session no run of this process has started is read against: the catalogue once,
   * through the side-effect-free `restingCatalogue` port, and only where the timeline holds a `model_override` or a
   * `model_exhausted` entry (since fin10 the latter too, for `excludedModels`); the memory the session's own where a control
   * at rest has rehydrated it, else one of the read's own. Null where there is nothing to read or the configuration does not
   * resolve.
   */
  private restingReadOf(s: Live, sessionId: SessionId): { readonly catalogue: readonly CatalogueEntry[]; readonly memory: ResilienceMemory } | null {
    if (s.restingCatalogue === undefined) {
      s.restingCatalogue = null;
      s.restingMemory = null;
      const stored = s.dal.getSession(sessionId);
      const timeline = stored && this.deps.restingCatalogue ? s.dal.timelineOf(sessionId) : [];
      if (stored && timeline.some((t) => t.name === 'model_override' || t.name === 'model_exhausted')) {
        // A read: the side-effect-free catalogue port, never `setupFor`/`configure`, which is a run start's (the verifier's
        // finding: it re-loaded the run host's MCP configuration and wrote its per-run maps for a session with no run).
        const catalogue = this.deps.restingCatalogue!(stored.workspace_root);
        if (catalogue) {
          s.restingCatalogue = catalogue;
          const resolve = (key: string): ModelChoice | null => { const e = catalogue.find((c) => c.key === key); return e ? { model: e.model, thinking: e.thinking } : null; };
          // Silent: a key this catalogue cannot resolve is the run's to warn about when one starts, not a read's.
          s.restingMemory = ResilienceMemory.rehydrate(timeline, resolve);
        }
      }
    }
    const memory = s.memory ?? s.restingMemory ?? null;
    return s.restingCatalogue && memory ? { catalogue: s.restingCatalogue, memory } : null;
  }

  /** The session's memory (REQ-ORCH-091 a/d, REQ-SESSION-026), rehydrated from its timeline once, as a continuation does. */
  private memoryOf(s: Live, sessionId: SessionId, setup: RunSetup): ResilienceMemory {
    if (s.memory === null) {
      const resolve = (key: string): ModelChoice | null => { const r = setup.models?.(key); return r && r.ok ? r.choice : null; };
      s.memory = ResilienceMemory.rehydrate(s.dal.timelineOf(sessionId), resolve, (m) => { s.log?.warn(m); this.deps.warn(m); });
    }
    return s.memory;
  }

  /**
   * The text of the session's last submitted prompt — the one a restart re-submits (REQ-NOTIFY-070/074/076) — read by
   * `lastSubmittedPrompt`, over released rows too; refused as `no-prompt` where there is no text to re-send. The restarts
   * re-send the text alone (OQ-182's reading), so a last prompt of images alone is refused rather than sent empty, and the
   * refusal says so: a prompt IS recorded, the restart does not re-send what it carries (an optional finding of fin8's
   * verifier — it had read "No prompt is recorded for this session.").
   */
  private lastPromptOf(s: Live, sessionId: SessionId): Result<string, { readonly code: string; readonly reason: string }> {
    const last = lastSubmittedPrompt(s.dal, sessionId);
    if (last !== null && last.text.trim() !== '') return ok(last.text);
    if (last !== null && last.attachments.length > 0) return err({ code: 'no-prompt', reason: 'The last prompt carries images only, which the restart does not re-send (OQ-182), so there is no text to restart with.' });
    return err({ code: 'no-prompt', reason: 'No prompt is recorded for this session.' });
  }

  /**
   * REQ-NOTIFY-069/072/074 (the 401 note's part C): the facts the authentication recovery dialog is drawn from. Refused where
   * the session is not live here, a run of it is active, or its configuration does not resolve — REQ-NOTIFY-069's "a
   * configuration service" — and main then takes the generic failure path.
   */
  authRecoveryFacts(sessionId: SessionId): Result<AuthRecoveryFacts, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    const catalogue = setup.value.resilience?.catalogue ?? [];
    const named = (ref: ModelRef): AuthRecoveryModel => ({ key: entryOf(catalogue, ref)?.key ?? null, provider: providerIdentity(catalogue, ref), model: ref.modelId });
    const failed = s.run?.failedEntryModel ?? null;
    const memory = this.memoryOf(s, sessionId, setup.value);
    const config = setup.value.model.config;
    const active = memory.effective(withSettings(catalogue, { model: config.model, thinking: config.thinking }), catalogue).model;
    const seen = new Set<string>();
    const models: (AuthRecoveryModel & { readonly key: string; readonly excluded?: true })[] = [];
    for (const e of catalogue) {
      if (!e.usable || seen.has(e.key)) continue;
      const resolved = setup.value.models?.(e.key);
      if (!resolved?.ok) continue;
      seen.add(e.key);
      // REQ-MONITOR-194: the dialog is a model selector — a pair the session holds out of quota is listed with the reason.
      models.push({ key: e.key, provider: e.provider, model: e.model.modelId, ...(memory.isExhausted(e.provider, e.model.modelId) ? { excluded: true as const } : {}) });
    }
    return ok({ failed: failed === null ? null : named(failed), active: named(active), models, lastPrompt: this.lastPromptOf(s, sessionId).ok });
  }

  /**
   * REQ-NOTIFY-074 / REQ-NOTIFY-076 / REQ-MONITOR-147 / REQ-SESSION-026 (the 401 note's parts C and D): the recovery dialog's
   * restart. With `modelKey`, the model chosen in the dialog is pinned as the session's model override, keyed by the pair
   * that failed — the `model_override` entry `ResilienceMemory.rehydrate` replays, so the pin outlives the failed run and a
   * reload — and the run restarts with the same prompt (REQ-NOTIFY-068: the model changes). With none, the provider was just
   * re-authenticated: the run restarts with the same prompt on the same model, its new credential read by the continuation
   * lease the caller took (REQ-NOTIFY-068: the credentials change).
   *
   * Refused, with nothing written, where the run is still active, no prompt is recorded (REQ-NOTIFY-069), the key does not
   * resolve, or it names the model that failed. Where the restart itself cannot begin, a pin just written is taken back
   * (`cleared: true`) before the refusal is returned, so the session is left on the model it had. A failed model the run did
   * not record is taken to be the active entry model — the one REQ-NOTIFY-072's dialog then names.
   */
  restartAfterAuthFailure(sessionId: SessionId, modelKey: string | null): Result<{ readonly pinned: { readonly from: AuthRecoveryModel; readonly to: AuthRecoveryModel & { readonly key: string } } | null }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const promptRead = this.lastPromptOf(s, sessionId);
    if (!promptRead.ok) return err(promptRead.error);
    const lastPrompt = promptRead.value;
    const hold: HoldSlot = {};
    if (modelKey === null) {
      const restarted = this.relaunchAfterAuthFailure(s, sessionId, lastPrompt, hold, () => {
        s.writer.appendRow('system', 'Re-authenticated after the authentication failure; the run restarts with the same prompt.', true);
      });
      if (!restarted.ok) { hold.release?.(); return err({ code: 'restart-failed', reason: restarted.error.reason }); }
      return ok({ pinned: null });
    }
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false, sessionId, effectiveRootOf(stored).root, resumedPersona(s.dal, sessionId, false));
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
    const resolved = setup.value.models?.(modelKey);
    if (!resolved?.ok) return err({ code: 'unknown-model', reason: resolved?.reason ?? `'${modelKey}' is not a configured model` });
    const catalogue = setup.value.resilience?.catalogue ?? [];
    const memory = this.memoryOf(s, sessionId, setup.value);
    const config = setup.value.model.config;
    const failedRef = s.run?.failedEntryModel ?? memory.effective(withSettings(catalogue, { model: config.model, thinking: config.thinking }), catalogue).model;
    const from: AuthRecoveryModel = { key: entryOf(catalogue, failedRef)?.key ?? null, provider: providerIdentity(catalogue, failedRef), model: failedRef.modelId };
    const to = { key: modelKey, provider: providerIdentity(catalogue, resolved.choice.model), model: resolved.choice.model.modelId };
    if (pairKey(from.provider, from.model) === pairKey(to.provider, to.model)) return err({ code: 'same-model', reason: `${modelKey} is the model that failed authentication (${to.provider}/${to.model}); choose a different one.` });
    // A model chosen by hand is the one to use: a pin that moved it away (an earlier choice in this dialog, REQ-NOTIFY-075) is
    // taken back first, so the override chain cannot lead off it again — or back and forth between the two.
    if (memory.clearOverride(to.provider, to.model)) s.writer.appendTimeline('model_override', 'user', `${modelKey} (${to.provider}/${to.model}) was chosen in the recovery dialog; the pin that replaced it is taken back.`, { provider: to.provider, model: to.model, cleared: true, cause: 'authentication' });
    // REQ-MONITOR-194: the dialog is a model selector, so choosing a pair the session holds out of quota clears its exclusion,
    // as the run's own selectors do (`Run.clearChosenExclusion`); until 2026-10-02 (fin10) the restart's first call on it was
    // refused by the ladder's pre-call read and went to its same-tier candidate or a wait.
    const exclusionCleared = this.clearChosenExclusion(s, sessionId, modelKey, to.provider, to.model, 'in the recovery dialog');
    memory.setOverride(from.provider, from.model, { key: modelKey, choice: withSettings(catalogue, resolved.choice) });
    s.writer.appendTimeline('model_override', 'user', `Authentication failed on ${from.provider}/${from.model}; ${modelKey} (${to.provider}/${to.model}), chosen in the recovery dialog, is pinned for the rest of the session and the run restarts with the same prompt.`, { provider: from.provider, model: from.model, model_key: modelKey, to_provider: to.provider, to_model: to.model, cause: 'authentication' });
    const restarted = this.relaunchAfterAuthFailure(s, sessionId, lastPrompt, hold, () => {
      s.writer.appendRow('system', `Authentication failed on ${from.provider}/${from.model}. The run restarts on ${modelKey} (${to.provider}/${to.model}), which stays in use for this session.`, true);
    });
    if (!restarted.ok) {
      hold.release?.();
      memory.clearOverride(from.provider, from.model);
      s.writer.appendTimeline('model_override', 'rotaris', `The run could not restart on ${modelKey} (${restarted.error.reason}); the pin on ${from.provider}/${from.model} is taken back.`, { provider: from.provider, model: from.model, cleared: true, cause: 'authentication' });
      // The choice did not take: the exclusion it cleared stands again, so the session is left as it was.
      if (exclusionCleared) {
        memory.markExhausted(to.provider, to.model);
        s.restingMemory?.markExhausted(to.provider, to.model);
        s.writer.appendTimeline('model_exhausted', 'rotaris', `The run could not restart on ${modelKey}; ${to.provider}/${to.model} is excluded as out of quota again, as it was before the choice.`, { provider: to.provider, model: to.model, model_key: modelKey, restored: true });
      }
      return err({ code: 'restart-failed', reason: restarted.error.reason });
    }
    return ok({ pinned: { from, to } });
  }

  /**
   * REQ-MONITOR-194 / REQ-MONITOR-146: the composer's "Model for the next run" — a model selector — chose `modelKey` for this
   * session. The choice itself is configuration (`personas.<entry>.model`, written by the renderer first); what reaches the
   * engine here is that it was chosen explicitly, which clears the exclusion of its pair if the session holds it out of
   * quota — in the memory a run reads and in a resting read's — and writes the `model_exhausted` entry carrying `cleared: true`
   * that `ResilienceMemory.rehydrate` replays. The key is resolved against the workspace's catalogue through the
   * side-effect-free `restingCatalogue` port, never a run start's `configure`. Until 2026-10-02 (fin10) the chip wrote the
   * configuration alone and the exclusion stood
   * (`docs/defects/fixed/a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md`).
   */
  chooseNextModel(sessionId: SessionId, modelKey: string): Result<{ readonly cleared: boolean }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const catalogue = this.deps.restingCatalogue?.(stored.workspace_root) ?? null;
    if (catalogue === null) return err({ code: 'no-catalogue', reason: 'The workspace\'s model configuration does not load, so the model chosen for the next run cannot be resolved.' });
    const e = catalogue.find((c) => c.key === modelKey);
    if (!e) return err({ code: 'unknown-model', reason: `'${modelKey}' is not a configured model` });
    return ok({ cleared: this.clearChosenExclusion(s, sessionId, modelKey, e.provider, e.model.modelId, 'as the model for the next run') });
  }

  /**
   * REQ-MONITOR-194: an explicit choice of a pair the session holds out of quota clears its exclusion — in the session's memory
   * (`s.memory`, the one every run of it reads) and a resting read's (`s.restingMemory`), and as a `model_exhausted` entry
   * carrying `cleared: true`, the shape `Run.clearChosenExclusion` writes. Where no memory is built yet the timeline says
   * whether the pair is excluded. True when it was.
   */
  private clearChosenExclusion(s: Live, sessionId: SessionId, key: string, provider: string, modelId: string, where: string): boolean {
    const memories = [s.memory, s.restingMemory].filter((m): m is ResilienceMemory => m !== null && m !== undefined);
    const excluded = s.memory !== null ? s.memory.isExhausted(provider, modelId) : memories.some((m) => m.isExhausted(provider, modelId)) || ResilienceMemory.rehydrate(s.dal.timelineOf(sessionId), () => null).isExhausted(provider, modelId);
    if (!excluded) return false;
    for (const m of memories) m.clearExhausted(provider, modelId);
    s.writer.appendTimeline('model_exhausted', 'user', `The user chose ${key} (${provider}/${modelId}) explicitly ${where}; the pair is no longer excluded as out of quota and is eligible again until a further insufficient-quota response.`, { provider, model: modelId, model_key: key, cleared: true });
    return true;
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
    if (!setup.ok) return err(this.refusedAtStart(s, setup.error));
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const resolved = s.writer.resolvePlanGate(cycle, decision, 'idle', decision === 'approve', null);
    if (!resolved.ok) return err({ code: resolved.error.code, reason: 'reason' in resolved.error ? resolved.error.reason : resolved.error.code });
    const lastPrompt = latestRequestOf(s.dal, stored);
    const payload = `${buildContinuationPayload(s.dal, s.dal.getSession(sessionId)!, lastPrompt, todo.value)}\n\n${planSection(decision, text, changes)}`;
    // REQ-ORCH-004 / REQ-ORCH-154 (OQ-104): a plan decision states no new top-level task — the held run's todo already
    // carries the gated work — so the relaunch appends none; appending the last request again would duplicate it. After
    // a hold that followed a resumed iteration (PD-ORCH-003 revision 2) that todo also carries the continue's message,
    // complete, or pending and taken up first.
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), setup.value, [], decision === 'revise' ? { cycle: cycle + 1, changes } : undefined, { message: null }, false);
    // REQ-ORCH-154 with REQ-NOTIFY-070/074/076: what this run was launched to do, for an authentication restart of it.
    if (s.run !== null) s.planLaunch = { run: s.run, decision, cycle, plan: text, changes };
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
  private recordCrashOf(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, warn: (m: string) => void, artifacts: ArtifactStore, ownCallsMayRun = false): void {
    const live = new Set((this.deps.terminals?.(sessionId).list() ?? []).filter((t) => t.status === 'running').map((t) => t.id));
    const r = recordCrash(dal, writer, sessionId, live, warn, artifacts, ownCallsMayRun);
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
    this.dropModelSlots(sessionId);
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
   *
   * ADR-0005, REQ-EVENTS-098: a run's teardown releases the lock while the session stays live here, so the live writer is
   * written through only under the lock `claimHold` gives — kept when this process holds it (a loaded session, a run
   * under way), taken with the one reap and given back after the write otherwise, and refused with nothing written while
   * another live process holds it (the repair of `a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`,
   * R-067).
   */
  private withWriter<T>(dal: StoreDal, sessionId: SessionId, fn: (writer: SessionWriter) => T): Result<T, { readonly code: string; readonly reason: string }> {
    const live = this.live.get(sessionId);
    if (live) {
      const hold = this.claimHold(live.dal, sessionId, (m) => { live.log?.warn(m); this.deps.warn(m); });
      if ('holder' in hold) return err({ code: 'lock-held', reason: `Session ${sessionId} is held by pid ${hold.holder.pid} on ${hold.holder.host}.` });
      if ('failure' in hold) return err({ code: 'store', reason: hold.failure });
      try { return ok(fn(live.writer)); } catch (cause) { return err({ code: 'write', reason: String(cause instanceof Error ? cause.message : cause) }); } finally { hold.release(); }
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
      const quit = s.dal.agentTerminalsOf(id).flatMap((t) => { const live = held.get(t.terminal_id); return t.state === 'running' && live ? [{ row: t, live }] : []; });
      if (quit.length > 0) this.recordQuitTerminals(id, s, quit);
      s.tools?.cancelPending();
      s.owner.flushPending();
      s.writer.release(this.deps.pid, this.deps.host);
      this.seq.forget(id);
    }
    this.live.clear();
    for (const id of [...this.slotHolders.keys()]) this.dropModelSlots(id);
  }

  /**
   * PD-ORCH-005 clause 10's quit record, made under the session's lock (ADR-0005, REQ-EVENTS-098). A pause's teardown
   * released the lock while the session stayed loaded, so the record claims it as every other write from outside a run
   * does (`claimHold`) and gives back what it took. A session another live process holds — or whose lock the store could
   * not be read or written to take — gets no record from this process, and the skip is warned of: its rows are that
   * holder's to write, and a background session this process ended stays `running` in the record for the next repair or
   * continue to settle (the repair of `a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`).
   */
  private recordQuitTerminals(id: SessionId, s: Live, quit: readonly { readonly row: ReturnType<StoreDal['agentTerminalsOf']>[number]; readonly live: { readonly exitCode: number | null; readonly tail: string } }[]): void {
    const warn = (m: string) => { s.log?.warn(m); this.deps.warn(m); };
    const hold = this.claimHold(s.dal, id, warn);
    const terminalIds = quit.map((q) => q.row.terminal_id).join(', ');
    if ('holder' in hold) { warn(`the quit ended background session(s) ${terminalIds} of ${id} but recorded nothing: the session is held by pid ${hold.holder.pid} on ${hold.holder.host}`); return; }
    if ('failure' in hold) { warn(`the quit ended background session(s) ${terminalIds} of ${id} but recorded nothing: its lock could not be taken (${hold.failure})`); return; }
    try {
      for (const { row: t, live } of quit) s.writer.recordAgentTerminal({ terminal_id: t.terminal_id, task_id: t.task_id, command: t.command, started_at: t.started_at, state: 'quit', exit_code: live.exitCode, output_tail: live.tail });
    } finally { hold.release(); }
  }
}
