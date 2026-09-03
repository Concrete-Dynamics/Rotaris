import { asSessionId, err, ok, type Clocks, type MachineId, type Millis, type Result, type SessionId } from '@rotaris/kernel';
import { APPROVAL_OPTIONS, ApprovalPayloadSchema, resolvePreset, type ApprovalOption, type ControlRequest, type ControlResult, type PermissionPreset, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { RELEASE_PAGE_SIZE, type SessionRow, type StoreDal } from '@rotaris/store';
import type { AgentBackend } from '@rotaris/model';
import { ProjectionOwner, type Publisher } from './projection-owner.js';
import { SequenceCounters } from './sequence.js';
import { SessionWriter, toTranscriptRow, type Committed } from './session-writer.js';
import { EventBus } from './run/event-bus.js';
import { Run, type PermissionPosture, type RunConfig, type RunResult } from './run/run.js';
import { SessionLog, type LogLevel } from './session-log.js';
import type { ToolPort } from './run/turn.js';
import { settleStaleChildren } from './children/orchestration.js';
import type { DelegationOps } from './children/delegation.js';
import { clampBudget, DEFAULT_BUDGET, NORMAL_CELL, type Budget } from './children/ledger.js';
import { presentationChildState, type AgentRecord, type ChildState } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { SummaryWriter } from './run/summary.js';
import { isActiveStatus } from './run/stop-conditions.js';

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
}

/** What the run-host root hands a session's tool port factory. */
export interface ToolPortContext {
  readonly sessionId: SessionId;
  readonly workspaceRoot: string;
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
  /** REQ-ORCH-046's three limits; REQ-ORCH-024's `normal` cell clamps them until playbooks are built. */
  readonly childBudget?: Budget;
  readonly drainTimeoutMs?: number;
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
  /** The tool surface per session; absent means the model is offered no tool. */
  readonly tools?: (ctx: ToolPortContext) => ToolPort;
  /** REQ-TOOLS-053/069: whether a prompt can be put in front of a person, at the moment asked. */
  readonly attended?: () => boolean;
  readonly runtime?: RuntimePosture;
  /** REQ-SESSION-142: an appender for the session's log file; absent means no file. */
  readonly sessionLogAppender?: (dal: StoreDal, sessionId: SessionId) => (line: string) => void;
  /** REQ-TOOLS-184: background terminal sessions in the running state, for the strip. */
  readonly backgroundSessions?: () => number;
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
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly dal: StoreDal;
  run: Run | null;
  running: Promise<RunResult> | null;
  tools: ToolPort | null;
  log: SessionLog | null;
}

/** REQ-SESSION-082 / REQ-EVENTS-021: a refusal before the run starts is one `result` of status error, marked as such. */
export interface StartRefusal {
  readonly code: string;
  readonly reason: string;
  readonly failedBeforeStart: true;
  readonly result: { status: 'error'; session_id: string; stop_reason: ''; summary: string; error: string };
}

export function toSessionRecord(r: SessionRow): SessionRecord {
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
    iterationsCompleted: r.iterations_completed,
    summary: r.summary_status && r.summary_severity && r.summary_text ? { status: r.summary_status, severity: r.summary_severity, message: r.summary_text } : null,
    permissionMode: r.permission_mode,
    sandboxed: r.sandboxed === 1,
    backgroundSessions: 0,
  };
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

  /** REQ-CHAT-011 with no session: create it, record the prompt as row 0, start the run. */
  start(dal: StoreDal, workspaceRoot: string, prompt: string): Result<SessionId, StartRefusal | { code: string; reason: string }> {
    const model = this.deps.model;
    if (!model) {
      // REQ-EVENTS-021: refused before it starts; no session.start, no session, exactly one result of status error.
      const summary = 'No model is configured, so the run was refused before it started.';
      return err({ code: 'no-model', reason: summary, failedBeforeStart: true, result: { status: 'error', session_id: '', stop_reason: '', summary, error: summary } });
    }
    const sessionId = asSessionId(this.deps.mintSessionId());
    const attendedNow = this.deps.attended?.() ?? false;
    const permission = postureAtStart(this.deps.runtime, attendedNow);
    // REQ-SESSION-142: the session's log, opened before anything else the run says; closed at run end.
    const appender = this.deps.sessionLogAppender?.(dal, sessionId);
    const log = appender ? new SessionLog({ wall: this.deps.clocks.wall, level: this.deps.runtime?.sessionLogLevel ?? 'WARNING', append: appender }) : null;
    const warn = (m: string) => { log?.warn(m); this.deps.warn(m); };
    // session.start and row 0 commit before the run exists; their wire lines are held and replayed into the
    // run's forward queue so a consumer attached ahead of the start sees them too (REQ-EVENTS-069, REQ-SESSION-147).
    const entry: { owner?: ProjectionOwner; run?: Run; held: Committed[] } = { held: [] };
    const created = SessionWriter.create(
      {
        dal, sessionId, wall: this.deps.clocks.wall, retentionCap: this.deps.retentionCap, warn,
        onCommitted: (c) => { entry.owner?.onCommitted(c); if (entry.run) entry.run.onCommitted(c); else entry.held.push(c); },
      },
      {
        workspaceRoot, pid: this.deps.pid, host: this.deps.host, task: prompt, persona: model.config.persona, maxIterations: model.config.iterationLimit,
        permissionMode: permission.effective, sandboxed: permission.sandboxed,
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
      readSession: () => ({ ...toSessionRecord(dal.getSession(sessionId)!), agents: dal.childrenOf(sessionId).map((c) => toAgentRecord(c, this.deps.clocks)), backgroundSessions: this.deps.backgroundSessions?.() ?? 0 }),
      readResident: () => dal.residentRows(sessionId).map(toTranscriptRow),
    });
    entry.owner = owner;
    const live: Live = { writer, owner, dal, run: null, running: null, tools: null, log };
    this.live.set(sessionId, live);
    const row = writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });

    const summary = new SummaryWriter({ file: `${this.deps.sessionFilesDir(dal, sessionId)}/summary.md`, timers: this.deps.clocks.timers, warn });
    const runRef: { run?: Run } = {};
    const baseCtx = { sessionId, workspaceRoot, writer, requestedMode: permission.effective, attended: () => this.deps.attended?.() ?? false, warn, abortRun: () => { runRef.run?.stop.request('agent_session_aborted'); } };
    // With delegation the run creates the root's port itself (its own identity); the base port exists only without it.
    const tools: ToolPort | null = null;
    live.tools = tools;
    // REQ-ORCH-053: a run that has just taken the lock settles every non-terminal child a previous run left, before its first iteration.
    const stale = settleStaleChildren(dal, writer, sessionId, warn);
    if (stale > 0) warn(`${stale} child record(s) from a previous run were settled cancelled before the first iteration (REQ-ORCH-053)`);
    const budget = clampBudget(this.deps.runtime?.childBudget ?? DEFAULT_BUDGET, NORMAL_CELL);
    const cap = this.deps.runtime?.modelConcurrencyCap ?? null;
    const run = new Run({
      sessionId, workspaceRoot, task: prompt, taskId: `${sessionId}:main:1`, writer, owner, bus: this.bus, clocks: this.deps.clocks,
      backend: model.backend, config: model.config, tools, permission, pid: this.deps.pid, host: this.deps.host,
      readSession: () => dal.getSession(sessionId), warn,
      onSaved: (g) => summary.rebuild(g, () => dal.getSession(sessionId)),
      ...(this.deps.tools ? {
        toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number) => this.deps.tools!({ ...baseCtx, persona, agentName, delegation, parentId, depth }),
        dal, budget, modelCap: () => cap,
        summariser: { backend: model.backend, model: model.config.model, thinking: model.config.thinking, timers: this.deps.clocks.timers, resolveCredential: model.config.resolveCredential },
      } : {}),
      ...(this.deps.runtime?.drainTimeoutMs === undefined ? {} : { drainTimeoutMs: this.deps.runtime.drainTimeoutMs as Millis }),
    });
    runRef.run = run;
    for (const c of entry.held.splice(0)) run.onCommitted(c);
    entry.run = run;
    live.run = run;
    if (this.deps.onRunResult) {
      const onRunResult = this.deps.onRunResult;
      this.bus.attach(sessionId, { mode: 'blocking', deliver: (e) => { if (e.event === 'result' && run.outcome) onRunResult(sessionId, run.outcome); } });
    }
    live.running = run.start().finally(() => { log?.info(`run ended ${run.outcome?.status ?? 'unknown'}`); log?.close(); });
    return ok(sessionId);
  }

  /** REQ-CHAT-011 with a loaded session and no active run: append the user row. REQ-CHAT-012: refused while a run is active. */
  prompt(sessionId: SessionId, prompt: string): Result<TranscriptRow, { code: string; reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    if (s.run && !s.run.isEnded) return err({ code: 'run-active', reason: 'A run is already active.' });
    const row = s.writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });
    return ok(row.value);
  }

  /** ADR-0010 channel 1: `{ok, value?}`; `false` when the run cannot honour it (REQ-MONITOR-007/011). */
  control(req: ControlRequest): ControlResult {
    const s = this.live.get(asSessionId(req.sessionId));
    const run = s?.run;
    if (!run || run.isEnded) return { ok: false };
    switch (req.op) {
      case 'cancel': {
        // REQ-SESSION-186: a second activation while the stop is pending forces.
        const force = req.args['force'] === true || run.stop.requested;
        run.stop.request('user_cancelled', force);
        s!.writer.save('cancelling');
        return { ok: true };
      }
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
        return { ok: false };
    }
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
