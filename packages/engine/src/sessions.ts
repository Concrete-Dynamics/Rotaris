import { asSessionId, err, ok, type Clocks, type MachineId, type Millis, type Result, type SessionId } from '@rotaris/kernel';
import { APPROVAL_OPTIONS, ApprovalPayloadSchema, resolvePreset, WorktreeBindingSchema, type ApprovalOption, type ControlRequest, type ControlResult, type PermissionPreset, type SessionRecord, type TranscriptRow, type WorktreeBinding } from '@rotaris/contracts';
import { existsSync } from 'node:fs';
import { RELEASE_PAGE_SIZE, type SessionRow, type StoreDal } from '@rotaris/store';
import type { AgentBackend } from '@rotaris/model';
import { ProjectionOwner, type Publisher } from './projection-owner.js';
import { SequenceCounters } from './sequence.js';
import { SessionWriter, toTranscriptRow, type Committed } from './session-writer.js';
import { EventBus } from './run/event-bus.js';
import { parseTokenSamples, Run, type PermissionPosture, type RunConfig, type RunResult } from './run/run.js';
import { SessionLog, type LogLevel } from './session-log.js';
import type { ToolPort } from './run/turn.js';
import { settleStaleChildren } from './children/orchestration.js';
import type { DelegationOps } from './children/delegation.js';
import { DEFAULT_BUDGET, type Budget } from './children/ledger.js';
import { presentationChildState, type AgentRecord, type ChildState } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { SummaryWriter } from './run/summary.js';
import { isActiveStatus } from './run/stop-conditions.js';
import type { HookPort, HookPortContext, RunNotice, ToolHookBridge } from './hooks-port.js';
import type { Preflight, PreflightContext } from './preflight.js';
import { IntentResultSchema, type IntentCategory, type IntentGrant, type IntentStatus } from '@rotaris/contracts';
import { SupervisorRegistry, type LoopClassifier, type SupervisorConfig } from './run/supervisor.js';
import type { TodoDocument } from './run/todo.js';
import type { PersonaResolver } from './children/personas.js';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
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
}

export interface SessionsDeps {
  readonly clocks: Clocks;
  readonly publisher: Publisher;
  readonly pid: number;
  readonly host: MachineId;
  readonly retentionCap: number;
  readonly warn: (message: string) => void;
  readonly mintSessionId: () => string;
  /** Decision 1 of the run-loop plan: null means no model is configured and a run is refused before it starts. */
  readonly model: ModelSetup | null;
  /** Where a session's files live (summary.md), from the store's layout. */
  readonly sessionFilesDir: (dal: StoreDal, sessionId: SessionId) => string;
  /** REQ-SESSION-186: the terminal result, presented once. Reached through the bus, in process (REQ-EVENTS-178). */
  readonly onRunResult?: (sessionId: SessionId, result: RunResult) => void;
  /** REQ-ORCH-085: the run paused at the message limit — the host is told the count and the limit. */
  readonly onRunPaused?: ((sessionId: SessionId, info: { count: number; limit: number | null; tokens: { input: number; output: number } }) => void) | undefined;
  /** The tool surface per session; absent means the model is offered no tool. */
  readonly tools?: (ctx: ToolPortContext) => ToolPort;
  /** REQ-TOOLS-053/069: whether a prompt can be put in front of a person, at the moment asked. */
  readonly attended?: () => boolean;
  readonly runtime?: RuntimePosture;
  /** REQ-SESSION-142: an appender for the session's log file; absent means no file. */
  readonly sessionLogAppender?: (dal: StoreDal, sessionId: SessionId) => (line: string) => void;
  /** REQ-TOOLS-184: background terminal sessions in the running state, for the strip. */
  readonly backgroundSessions?: () => number;
  /** ADR-0015: the session's hook port, built by the root at run start (REQ-HOOKS-131); absent means no hooks. */
  readonly hooks?: (ctx: HookPortContext) => HookPort | null;
  /** The host's notice channel. */
  readonly notice?: (n: RunNotice) => void;
  /** REQ-ORCH-005: the pre-flight, built by the root; absent means the fallback intent and no playbook. */
  readonly preflight?: (ctx: PreflightContext) => Promise<Preflight>;
  /** REQ-ORCH-107: absence means supervision was intentionally disabled and constructs nothing. */
  readonly supervisor?: ((workspaceRoot: string) => { readonly config: SupervisorConfig; readonly classifier: LoopClassifier } | null) | undefined;
  readonly isProcessAlive?: ((pid: number) => boolean) | undefined;
  /**
   * ADR-0036/0037: the run's configuration, resolved at run start from the files with the live state on top
   * (Tier B). Present, it supplies the model and the runtime for that run; absent, `model` and `runtime` stand.
   */
  readonly configure?: ((workspaceRoot: string, ctx: { readonly attended: boolean }) => Result<RunSetup, { readonly reason: string }>) | undefined;
}

/** What a run starts with once configuration resolves it. */
export interface RunSetup {
  readonly model: ModelSetup;
  readonly runtime: RuntimePosture;
  readonly retentionCap?: number | undefined;
  readonly personas?: PersonaResolver | undefined;
  /** REQ-MONITOR-142: a `models:` key resolved for a mid-run switch. */
  readonly models?: ((key: string) => { model: ModelRef; thinking: ThinkingLevel } | null) | undefined;
  /** Warnings the load produced (REQ-CONFIG-233's warn-and-continue and the referential list while attended). */
  readonly warnings?: readonly string[] | undefined;
}

/** REQ-TOOLS-067/070: the posture at run start; attendedness is taken once here (REQ-SANDBOX-101's "at the moment its mode is resolved"). */
export function postureAtStart(runtime: RuntimePosture | undefined, attended: boolean): PermissionPosture {
  const requested = resolvePreset(runtime?.permissionMode ?? '').preset;
  const sandboxed = (runtime?.sandbox.requested ?? false) && (runtime?.sandbox.available ?? false);
  const permissive = requested === 'autonomous';
  const downgraded = permissive && !attended && !sandboxed && !(runtime?.allowUnsandboxedAutonomous ?? false);
  return {
    requested, effective: downgraded ? 'ask' : requested, downgraded,
    reason: downgraded ? `Permission mode '${requested}' was downgraded to 'ask' for this run: it is unattended (no interactive approval available) and runs without the OS-level sandbox. Set runtime.allow_unsandboxed_autonomous: true in the workspace config to run unattended in '${requested}' mode anyway.` : '',
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
  /** REQ-GIT-018: the binding in full or null, and the checkpoint count (0 until ADR-0039 records one). */
  readonly worktree: WorktreeBinding | null;
  readonly checkpointCount: number;
}

/** REQ-GIT-017: a missing or unreadable binding loads as "no worktree" — an absence, nothing invented. */
export function parseBinding(json: string | null): WorktreeBinding | null {
  if (json === null) return null;
  try { const r = WorktreeBindingSchema.safeParse(JSON.parse(json)); return r.success ? r.data : null; } catch { return null; }
}

/** REQ-GIT-019/022: the run's effective root is the worktree while the record stays anchored to the base. */
function effectiveRootOf(row: SessionRow): { readonly root: string; readonly binding: WorktreeBinding | null } {
  const binding = parseBinding(row.worktree);
  return { root: binding?.worktree_path ?? row.workspace_root, binding };
}

/** A bound session whose tree is gone cannot be continued in it; the refusal states which path (REQ-GIT-157: after-acceptance, nothing changed). */
function missingWorktree(row: SessionRow): { readonly code: string; readonly reason: string } | null {
  const binding = parseBinding(row.worktree);
  if (binding && !existsSync(binding.worktree_path)) return { code: 'worktree-missing', reason: `Session ${row.session_id} is bound to the worktree at ${binding.worktree_path}, which no longer exists. Recreate or re-attach the worktree before continuing this session.` };
  return null;
}

export interface ResumeSuccess {
  readonly sessionId: SessionId;
  readonly settledChildren: number;
}

type ResumeFailure = { readonly code: string; readonly reason: string };

const cut = (text: string, cap: number): string => text.length <= cap ? text : `${text.slice(0, Math.max(0, cap - 3))}...`;

function parseTodoDocument(row: SessionRow): Result<TodoDocument | undefined, ResumeFailure> {
  if (row.todo === null) return ok(undefined);
  try {
    const value = JSON.parse(row.todo) as Partial<TodoDocument>;
    if (value.schema_version !== 1 || !Array.isArray(value.phases) || value.phases.some((phase) => typeof phase !== 'object' || phase === null || !Array.isArray(phase.tasks))) throw new Error('todo must be a schema_version 1 document with phase task lists');
    return ok(value as TodoDocument);
  } catch (cause) {
    return err({ code: 'state-unreadable', reason: `session ${row.session_id} has unreadable stored state: ${String(cause instanceof Error ? cause.message : cause)}` });
  }
}

function previousIntent(dal: StoreDal, sessionId: SessionId): IntentCategory | null {
  const payload = dal.getLaunchAudit(sessionId)?.payload;
  if (!payload) return null;
  try {
    const result = IntentResultSchema.safeParse((JSON.parse(payload) as { run_intent?: unknown }).run_intent);
    return result.success ? result.data.category : null;
  } catch { return null; }
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
    'Artifacts: (no orchestrator artifact is recorded in this build)',
    `Todo:\n${shownTasks.join('\n') || '- (empty)'}`,
    `Progress: ${cut(row.progress ?? '(none recorded)', 700)}`,
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

function relativeTime(updatedAt: string, now: number): string {
  const elapsed = Math.max(0, now - new Date(updatedAt).getTime());
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

/** REQ-GIT-022 / REQ-SHELL-125: what the host settled before asking for the session — the id, the binding, the sandbox mode. */
export interface StartOptions {
  readonly sessionId?: string | undefined;
  readonly worktree?: WorktreeBinding | undefined;
  readonly sandboxMode?: string | undefined;
}

/** REQ-SESSION-082 / REQ-EVENTS-021: a refusal before the run starts is one `result` of status error, marked as such. */
export interface StartRefusal {
  readonly code: string;
  readonly reason: string;
  readonly failedBeforeStart: true;
  readonly result: { status: 'error'; session_id: string; stop_reason: ''; summary: string; error: string };
}

/** REQ-MONITOR-166: the cost label carries its own qualifier; no rate is configured in this build, so the price is unknown. */
export function costLabelOf(cost: string): SessionRecord['costLabel'] {
  return { text: cost === '0' || cost === '' ? 'price not established' : `${cost} (price not established)`, qualifier: 'unknown' };
}

export function toSessionRecord(r: SessionRow, queued: readonly { id: string; content: string; createdAt: string }[] = [], toolCalls: readonly { tool_name: string; count: number; agents: number }[] = []): SessionRecord {
  return {
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
    runStartedAt: r.run_started_at,
    iterationsCompleted: r.iterations_completed,
    summary: r.summary_status && r.summary_severity && r.summary_text ? { status: r.summary_status, severity: r.summary_severity, message: r.summary_text } : null,
    permissionMode: r.permission_mode,
    sandboxed: r.sandboxed === 1,
    backgroundSessions: 0,
    intent: null,
    queuedPrompts: [...queued],
    messageLimit: r.message_limit,
    pausedAtCount: r.paused_at_count,
    usageHistory: parseTokenSamples(r.token_samples),
    costLabel: costLabelOf(r.cost),
    toolCalls: { total: r.tool_calls, agents: Math.max(0, ...toolCalls.map((t) => t.agents)), byTool: toolCalls.map((t) => ({ tool: t.tool_name, count: t.count })) },
    worktreeBranch: parseBinding(r.worktree)?.branch ?? null,
  };
}

/** REQ-CHAT-041: exactly the QUEUED prompts of the session, in queue order. */
function queuedOf(dal: StoreDal, sessionId: SessionId): { id: string; content: string; createdAt: string }[] {
  return dal.queuedPromptsOf(sessionId).filter((p) => p.status === 'QUEUED').map((p) => ({ id: p.prompt_id, content: p.content, createdAt: p.created_at }));
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

/** REQ-MONITOR-044/046/047: a child row as a surface sees it. */
export function toAgentRecord(c: ChildRow, clocks: Clocks): AgentRecord {
  const state = c.state as ChildState;
  const ps = presentationChildState(state);
  void clocks;
  return {
    id: c.task_id, name: c.canonical_name, givenName: c.given_name, persona: c.persona, state, presentationState: ps, parentId: c.parent_id,
    dependencies: (() => { try { return JSON.parse(c.depends_on) as string[]; } catch { return []; } })(),
    activity: c.task.slice(0, 180), model: c.model_key, depth: c.depth, background: c.background === 1, category: c.category,
    spawnedAt: c.spawned_at, completedAt: c.completed_at, toolCalls: c.tool_calls, delegationTask: c.task, live: ps === 'running',
  };
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
      const lock = dal.getLock(asSessionId(row.session_id));
      const live = lock !== undefined && (lock.host !== this.deps.host || lock.pid <= 0 || (this.deps.isProcessAlive?.(lock.pid) ?? true));
      // REQ-GIT-018/121: the branch is the binding's; `—` is the placeholder for a session with none (REQ-GIT-120's test).
      const binding = parseBinding(row.worktree);
      return {
        sessionId: row.session_id,
        label: cut(firstPrompt?.body.trim() || row.session_id, 80),
        status: row.execution_status || 'idle',
        branch: binding?.branch ?? '—',
        worktree: binding,
        checkpointCount: 0,
        relativeTime: relativeTime(row.updated_at, now),
        detail: row.workspace_root,
        awaitingInput: parsePending(row.pending_approvals).length > 0,
        stale: isActiveStatus(row.execution_status) && !live,
        tokens: row.tokens_input + row.tokens_output,
        durationLabel: durationLabel(row.run_started_at, isActiveStatus(row.execution_status) && live ? new Date(now).toISOString() : row.updated_at),
        busy: isActiveStatus(row.execution_status) && live,
        requirementId: null,
      };
    });
  }

  /** REQ-SESSION-083/112/118: load, validate, claim, sweep, then expose the projection. */
  resume(dal: StoreDal, workspaceRoot: string, sessionId: SessionId): Result<ResumeSuccess, ResumeFailure> {
    const row = dal.getSession(sessionId);
    if (!row || row.workspace_root !== workspaceRoot) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const todo = parseTodoDocument(row);
    if (!todo.ok) return todo;
    if (row.progress !== null) {
      try { JSON.parse(row.progress); }
      catch (cause) { return err({ code: 'state-unreadable', reason: `session ${sessionId} has unreadable stored state: ${String(cause instanceof Error ? cause.message : cause)}` }); }
    }
    const existing = this.live.get(sessionId);
    if (existing && this.isRunActive(sessionId)) return err({ code: 'run-active', reason: `Session ${sessionId} is already active in this application.` });
    if (existing) return ok({ sessionId, settledChildren: 0 });
    // REQ-GIT-019: a bound session continues in its tree, or refuses with the path stated when the tree is gone.
    const gone = missingWorktree(row);
    if (gone) return err(gone);

    const appender = this.deps.sessionLogAppender?.(dal, sessionId);
    const log = appender ? new SessionLog({ wall: this.deps.clocks.wall, level: this.deps.runtime?.sessionLogLevel ?? 'WARNING', append: appender }) : null;
    const warn = (m: string) => { log?.warn(m); this.deps.warn(m); };
    const entry: { owner?: ProjectionOwner } = {};
    const opened = SessionWriter.open({
      dal, sessionId, wall: this.deps.clocks.wall, retentionCap: this.deps.retentionCap, warn,
      onCommitted: (c) => entry.owner?.onCommitted(c),
    }, { pid: this.deps.pid, host: this.deps.host, isProcessAlive: this.deps.isProcessAlive ?? (() => true) });
    if (!opened.ok) {
      log?.close();
      if (opened.error.code === 'no-session') return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
      if (opened.error.code === 'store') return err({ code: 'store', reason: `Session ${sessionId} could not be loaded: ${opened.error.reason}` });
      const h = opened.error.holder;
      return err(h.host === this.deps.host
        ? { code: 'lock-held-local', reason: `Session ${sessionId} is held by another run in this application (pid ${h.pid}). Finish or stop that run first.` }
        : { code: 'lock-held-foreign', reason: `Session ${sessionId} is held by a different machine (${h.host}) since ${h.acquiredAt}. This instance cannot establish whether that run is still going; explicitly release the lock after resolving why this machine-local store is reachable there.` });
    }
    const writer = opened.value;
    const owner = new ProjectionOwner({
      sessionId, seq: this.seq, timers: this.deps.clocks.timers, publisher: this.deps.publisher,
      readSession: () => { const current = dal.getSession(sessionId)!; return { ...toSessionRecord(current, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId)), agents: dal.childrenOf(sessionId).map((c) => toAgentRecord(c, this.deps.clocks)), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(current, dal.getLaunchAudit(sessionId)?.payload ?? null) }; },
      readResident: () => dal.residentRows(sessionId).map(toTranscriptRow),
    });
    entry.owner = owner;
    const settled = settleStaleChildren(dal, writer, sessionId, warn);
    if (settled > 0) warn(`${settled} child record(s) from a previous run were settled cancelled before continuation (REQ-ORCH-053)`);
    this.live.set(sessionId, { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry });
    return ok({ sessionId, settledChildren: settled });
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
    const attendedNow = this.deps.attended?.() ?? false;
    const setup = this.setupFor(workspaceRoot, attendedNow);
    if (!setup.ok) return err(setup.error);
    const { model, runtime } = setup.value;
    const sessionId = asSessionId(opts.sessionId ?? this.deps.mintSessionId());
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
        permissionMode: permission.effective, sandboxed: permission.sandboxed,
        worktree: opts.worktree ? JSON.stringify(opts.worktree) : null, ...(opts.sandboxMode ? { sandboxMode: opts.sandboxMode } : {}),
      },
    );
    if (!created.ok) {
      return err(created.error.code === 'lock-held'
        ? { code: 'lock-held', reason: `held by pid ${created.error.holder.pid} on ${created.error.holder.host}` }
        : { code: 'store', reason: created.error.reason });
    }
    const writer = created.value;
    const owner = new ProjectionOwner({
      sessionId, seq: this.seq, timers: this.deps.clocks.timers, publisher: this.deps.publisher,
      readSession: () => { const row = dal.getSession(sessionId)!; return { ...toSessionRecord(row, queuedOf(dal, sessionId), dal.toolCallCounts(sessionId)), agents: dal.childrenOf(sessionId).map((c) => toAgentRecord(c, this.deps.clocks)), backgroundSessions: this.deps.backgroundSessions?.() ?? 0, intent: intentStatusOf(row, dal.getLaunchAudit(sessionId)?.payload ?? null) }; },
      readResident: () => dal.residentRows(sessionId).map(toTranscriptRow),
    });
    entry.owner = owner;
    const live: Live = { writer, owner, dal, run: null, running: null, tools: null, log, commitTarget: entry };
    this.live.set(sessionId, live);
    const row = writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });

    const summary = new SummaryWriter({ file: `${this.deps.sessionFilesDir(dal, sessionId)}/summary.md`, timers: this.deps.clocks.timers, warn });
    const supervisorSetup = this.deps.supervisor?.(workspaceRoot) ?? null;
    const supervisors = supervisorSetup
      ? new SupervisorRegistry(sessionId, supervisorSetup.config, supervisorSetup.classifier, this.deps.clocks.timers)
      : null;
    const runRef: { run?: Run } = {};
    // ADR-0015: the hook set is resolved once here, before the run exists, and is fixed for the run (REQ-HOOKS-131).
    let hooks: HookPort | null = null;
    if (this.deps.hooks) {
      try { hooks = this.deps.hooks({ sessionId, workspaceRoot, effectiveRoot, writer, warn, log: (m) => { log?.info(m); } }); } catch (cause) { warn(`Could not resolve this run's hooks; continuing without them. (${String(cause)})`); }
    }
    // REQ-ORCH-005/016: the pre-flight's grant reaches the entry role's tool port; the ports are created after the pre-flight ran.
    const decided: { grant: IntentGrant; intent: IntentCategory | undefined } = { grant: 'none', intent: undefined };
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    // With delegation the run creates the root's port itself (its own identity); the base port exists only without it.
    const tools: ToolPort | null = null;
    live.tools = tools;
    // REQ-ORCH-053: a run that has just taken the lock settles every non-terminal child a previous run left, before its first iteration.
    const stale = settleStaleChildren(dal, writer, sessionId, warn);
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first iteration (REQ-ORCH-053)`);
    // REQ-ORCH-024: the configured policy; the run clamps it by the pre-flight's BUDGET cell (the `normal` cell stood in until playbooks existed).
    const budget = runtime?.childBudget ?? DEFAULT_BUDGET;
    const cap = runtime?.modelConcurrencyCap ?? null;
    const capFor = runtime?.modelCapFor ?? (() => cap);
    const preflight = this.deps.preflight;
    const run = new Run({
      sessionId, workspaceRoot, effectiveRoot, task: prompt, taskId: `${sessionId}:main:1`, writer, owner, bus: this.bus, clocks: this.deps.clocks,
      ...(setup.value.personas ? { personas: setup.value.personas } : {}),
      ...(setup.value.models ? { models: setup.value.models } : {}),
      messageLimit: runtime?.messageLimit ?? null, onPaused: (info) => this.deps.onRunPaused?.(sessionId, info),
      backend: model.backend, config: model.config, tools, permission, pid: this.deps.pid, host: this.deps.host,
      readSession: () => dal.getSession(sessionId), warn, hooks, ...(this.deps.notice ? { notice: this.deps.notice } : {}),
      onSaved: (g) => summary.rebuild(g, () => dal.getSession(sessionId)),
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, grant: decided.grant, intent: decided.intent }),
        dal, budget, modelCap: capFor,
        summariser: { backend: model.backend, model: model.summariser?.model ?? model.config.model, thinking: model.summariser?.thinking ?? model.config.thinking, timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor },
      } : {}),
      ...(runtime?.drainTimeoutMs === undefined ? {} : { drainTimeoutMs: runtime.drainTimeoutMs as Millis }),
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
  prompt(sessionId: SessionId, prompt: string): Result<TranscriptRow, { code: string; reason: string }> {
    let s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const setup = this.setupFor(s.dal.getSession(sessionId)?.workspace_root ?? '', this.deps.attended?.() ?? false);
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const lock = s.dal.getLock(sessionId);
    if (!lock || lock.pid !== this.deps.pid || lock.host !== this.deps.host) {
      const reopened = this.resume(s.dal, stored.workspace_root, sessionId);
      if (!reopened.ok) return reopened;
      s = this.live.get(sessionId)!;
    }
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const payload = buildContinuationPayload(s.dal, stored, prompt, todo.value);
    const row = s.writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });
    this.launchContinuation(s, prompt, payload, todo.value, previousIntent(s.dal, sessionId), setup.value);
    return ok(row.value);
  }

  /** The run's setup: the root's `configure` (files + live state, ADR-0037 Tier B) or the process-wide model and runtime. */
  private setupFor(workspaceRoot: string, attended: boolean): Result<RunSetup, StartRefusal> {
    const refused = (code: string, summary: string): StartRefusal => ({ code, reason: summary, failedBeforeStart: true, result: { status: 'error', session_id: '', stop_reason: '', summary, error: summary } });
    if (this.deps.configure) {
      const r = this.deps.configure(workspaceRoot, { attended });
      // REQ-EVENTS-021 / REQ-CONFIG-478: refused before it starts, carrying the report.
      return r.ok ? ok(r.value) : err(refused('configuration', r.error.reason));
    }
    if (!this.deps.model) return err(refused('no-model', 'No model is configured, so the run was refused before it started.'));
    return ok({ model: this.deps.model, ...(this.deps.runtime ? { runtime: this.deps.runtime } : { runtime: { permissionMode: '', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' } }) });
  }

  private launchContinuation(s: Live, prompt: string, payload: string, todo: TodoDocument | undefined, priorIntent: IntentCategory | null, setupIn: RunSetup): void {
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
      try { hooks = this.deps.hooks({ sessionId, workspaceRoot, effectiveRoot, writer: s.writer, warn, log: (m) => { s.log?.info(m); } }); } catch (cause) { warn(`Could not resolve this continuation's hooks; continuing without them. (${String(cause)})`); }
    }
    const decided: { grant: IntentGrant; intent: IntentCategory | undefined } = { grant: 'none', intent: undefined };
    const baseCtx = { sessionId, workspaceRoot, effectiveRoot, writer: s.writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); }, ...(hooks ? { hooks: hooks.toolHooks } : {}) };
    s.tools = null;
    const stale = settleStaleChildren(s.dal, s.writer, sessionId, warn);
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first continuation iteration (REQ-ORCH-053)`);
    const supervisorSetup = this.deps.supervisor?.(workspaceRoot) ?? null;
    const supervisors = supervisorSetup ? new SupervisorRegistry(sessionId, supervisorSetup.config, supervisorSetup.classifier, this.deps.clocks.timers) : null;
    const budget = runtime?.childBudget ?? DEFAULT_BUDGET;
    const cap = runtime?.modelConcurrencyCap ?? null;
    const capFor = runtime?.modelCapFor ?? (() => cap);
    const preflight = this.deps.preflight;
    const run = new Run({
      sessionId, workspaceRoot, effectiveRoot, task: payload, taskLabel: prompt, taskId: `${sessionId}:continued:${s.dal.getSession(sessionId)!.iterations_completed + 1}`,
      ...(setupIn.personas ? { personas: setupIn.personas } : {}),
      ...(setupIn.models ? { models: setupIn.models } : {}),
      messageLimit: runtime?.messageLimit ?? null, onPaused: (info) => this.deps.onRunPaused?.(sessionId, info),
      writer: s.writer, owner: s.owner, bus: this.bus, clocks: this.deps.clocks, backend: model.backend, config: model.config,
      tools: null, permission, pid: this.deps.pid, host: this.deps.host, readSession: () => s.dal.getSession(sessionId), warn,
      continuation: true, ...(todo ? { resumeTodo: todo } : {}), ...(hooks ? { hooks } : {}),
      ...(supervisors ? { supervisorFor: (conversationId: string) => supervisors.forConversation(conversationId) } : {}),
      onSaved: (generation) => summary.rebuild(generation, () => s.dal.getSession(sessionId)),
      ...(preflight ? { preflight: async (signal: AbortSignal) => { const p = await preflight({ sessionId, workspaceRoot, prompt, signal, warn, previousIntent: priorIntent, hasUnfinishedWork: true }); decided.grant = p.grant; decided.intent = p.intent.category; return p; } } : {}),
      ...(this.deps.tools ? {
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth, grant: decided.grant, intent: decided.intent }),
        dal: s.dal, budget, modelCap: capFor,
        summariser: { backend: model.backend, model: model.summariser?.model ?? model.config.model, thinking: model.summariser?.thinking ?? model.config.thinking, timers: this.deps.clocks.timers, credentialFor: model.config.credentialFor },
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

  /** ADR-0010 channel 1: `{ok, value?}`; `false` when the run cannot honour it (REQ-MONITOR-007/011). */
  control(req: ControlRequest): ControlResult {
    const s = this.live.get(asSessionId(req.sessionId));
    const run = s?.run;
    if (!run || run.isEnded) return { ok: false };
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
        if (content === null) return { ok: false };
        const r = s!.writer.queuePrompt(randomUUID(), content);
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
        const id = text('id');
        const body = typeof req.args['text'] === 'string' ? (req.args['text'] as string) : '';
        if (id === null || (op !== 'add' && op !== 'update' && op !== 'remove') || (op !== 'remove' && body.trim() === '')) return { ok: false };
        return run.editTodo(op, id, body) ? { ok: true } : { ok: false };
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
      default:
        // REQ-MONITOR-004's remaining operations have no mechanism behind them in this build (decision 9 of the plan) and answer false.
        return { ok: false };
    }
  }

  /**
   * REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause. At the message limit: continue → idle then a continuation run;
   * double → the limit doubled for this session (null stays null), then continue; cancel → `paused` with stop reason
   * `message_limit_reached`. A manually paused session continues the same way. Nothing here appends a user row.
   */
  continueSession(sessionId: SessionId, action: 'continue' | 'double' | 'cancel'): Result<{ readonly resumed: boolean; readonly messageLimit: number | null }, { readonly code: string; readonly reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const stored = s.dal.getSession(sessionId);
    if (!stored) return err({ code: 'no-session', reason: `No session exists under id ${sessionId}.` });
    const gone = missingWorktree(stored);
    if (gone) return err(gone);
    const atLimit = stored.execution_status === 'paused_message_limit';
    if (!atLimit && stored.execution_status !== 'paused') return err({ code: 'not-paused', reason: `Session ${sessionId} is not paused (${stored.execution_status}).` });
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
        this.deps.notice?.({ severity: 'warning', headline: 'The paused session carries no message limit to resume from', detail: `Session ${sessionId} was paused at a message limit that is no longer recorded; it is now paused and can be continued from the composer.` });
        return ok({ resumed: false, messageLimit: null });
      }
      if (action === 'double') limit = limit * 2;
      const r = s.writer.resolvePause('idle', limit, action);
      if (!r.ok) return err({ code: r.error.code, reason: 'reason' in r.error ? r.error.reason : r.error.code });
    } else if (action === 'cancel') {
      return ok({ resumed: false, messageLimit: limit });
    }
    // The continuation: the last user request stands, nothing new is appended (REQ-MONITOR-125's "resumed from the composer").
    const setup = this.setupFor(stored.workspace_root, this.deps.attended?.() ?? false);
    if (!setup.ok) return err({ code: setup.error.code, reason: setup.error.reason });
    const lastPrompt = [...s.dal.residentRows(sessionId)].reverse().find((row) => row.kind === 'user')?.body ?? stored.session_id;
    const todo = parseTodoDocument(stored);
    if (!todo.ok) return todo;
    const payload = buildContinuationPayload(s.dal, stored, lastPrompt, todo.value);
    const runtimeWithLimit: RunSetup = { ...setup.value, runtime: { ...setup.value.runtime, messageLimit: limit } };
    this.launchContinuation(s, lastPrompt, payload, todo.value, previousIntent(s.dal, sessionId), runtimeWithLimit);
    return ok({ resumed: true, messageLimit: limit });
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
      if (s.run && s.run.answerApproval(requestId, option)) return true;
      if (s.tools?.answerApproval(requestId, option)) return true;
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
    const rows = s.dal.rowsBefore(sessionId, beforeIndex, RELEASE_PAGE_SIZE).map(toTranscriptRow).reverse();
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
      s.tools?.cancelPending();
      s.owner.flushPending();
      s.writer.release(this.deps.pid, this.deps.host);
      this.seq.forget(id);
    }
    this.live.clear();
  }
}
