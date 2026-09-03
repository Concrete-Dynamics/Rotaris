import { Budget, millis, toIsoUtc, type Clocks, type MachineId, type Millis, type SessionId } from '@rotaris/kernel';
import type { SessionRow } from '@rotaris/store';
import type { ApprovalOption, PermissionPreset } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelError, ModelRef, ThinkingLevel, TurnReport } from '@rotaris/model';
import type { EventBus } from './event-bus.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { Committed, SessionWriter } from '../session-writer.js';
import { Aggregates } from './aggregates.js';
import { classifyStop, statusForResult, stopCondition, summarise, type StopReason, type TerminalResult } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { Todo } from './todo.js';
import { runTurn, type ToolPort } from './turn.js';
import { IterationChildren } from '../children/orchestration.js';
import type { DelegationOps } from '../children/delegation.js';
import type { Budget as ChildBudget } from '../children/ledger.js';
import type { SummariserDeps } from '../children/report.js';
import type { HookPort, RunNotice } from '../hooks-port.js';
import type { ChildRow, StoreDal } from '@rotaris/store';

/**
 * The run loop, in its first conformant slice: one root agent, one model
 * call per iteration, no tools, and every way a run can end handled
 * (REQ-ORCH-066 to REQ-ORCH-083, REQ-SESSION-087 to REQ-SESSION-096,
 * REQ-EVENTS-020 to REQ-EVENTS-028, REQ-EVENTS-069 to REQ-EVENTS-076,
 * ADR-0013, ADR-0014).
 *
 * Start-up runs in REQ-SESSION-087's order; the loop evaluates REQ-ORCH-069
 * between iterations; teardown is REQ-SESSION-094's pipeline under a guard
 * that runs every step even on an exception. The stop request is sticky and
 * observable (ADR-0014); `interrupted` wins over an apparently completed
 * outcome whenever a stop was requested (REQ-EVENTS-028).
 *
 * Every event is recorded first and forwarded after (REQ-SESSION-147): the
 * writer's commit hand-off queues the wire lines, and the run awaits the bus
 * before proceeding past the operation that raised them (REQ-EVENTS-165).
 */
export interface RunConfig {
  readonly persona: string;
  readonly systemPrompt: string;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly modelTimeoutMs: number;
  readonly modelRetries: number;
  /** REQ-ORCH-070: default 20. */
  readonly iterationLimit: number;
  /** REQ-ORCH-070: optional, no default. */
  readonly timeLimitMs: number | null;
  /** REQ-ORCH-092: default 1. */
  readonly transientRetries: number;
  /** REQ-ORCH-077: default 3. */
  readonly consecutiveRetryLimit: number;
  /** A bound on model steps per turn standing in for the loop supervisor (REQ-ORCH-099..107, not built). */
  readonly maxStepsPerTurn: number;
  readonly resolveCredential: () => Promise<string>;
}

export const RUN_CONFIG_DEFAULTS: Omit<RunConfig, 'model' | 'resolveCredential'> = {
  persona: 'orchestrator',
  systemPrompt: 'You are the orchestrator. Carry out the task you are given and answer plainly.',
  thinking: 'unset',
  modelTimeoutMs: 120_000,
  modelRetries: 5,
  iterationLimit: 20,
  timeLimitMs: null,
  transientRetries: 1,
  consecutiveRetryLimit: 3,
  maxStepsPerTurn: 100,
};

/** REQ-TOOLS-071: what the run announces at start about its permission posture. */
export interface PermissionPosture {
  readonly requested: PermissionPreset;
  readonly effective: PermissionPreset;
  readonly downgraded: boolean;
  readonly reason: string;
  readonly sandboxed: boolean;
  readonly sandboxBackend: string;
}

export interface RunDeps {
  readonly sessionId: SessionId;
  readonly workspaceRoot: string;
  readonly task: string;
  readonly taskId: string;
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly bus: EventBus;
  readonly clocks: Clocks;
  readonly backend: AgentBackend;
  readonly config: RunConfig;
  /** Null: no tool surface — the model is offered no tool and a requested call ends the turn. */
  readonly tools: ToolPort | null;
  /** Part B: the tool surface for an agent with a delegation identity (the root and every child). Absent: no delegation. */
  readonly toolsFor?: ((persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number) => ToolPort | null) | undefined;
  readonly dal?: StoreDal | undefined;
  readonly budget?: ChildBudget | undefined;
  readonly modelCap?: ((modelKey: string) => number | null) | undefined;
  readonly summariser?: SummariserDeps | null | undefined;
  readonly childTimeoutMs?: Millis | undefined;
  /** REQ-ORCH-080: default 120 s; 0 disables. */
  readonly drainTimeoutMs?: Millis | undefined;
  readonly permission: PermissionPosture;
  /** ADR-0015: the session's hooks; null or absent means none exist and nothing about hooks is observable (REQ-HOOKS-041). */
  readonly hooks?: HookPort | null | undefined;
  /** The host's notice channel (REQ-HOOKS-054/086/087). */
  readonly notice?: ((n: RunNotice) => void) | undefined;
  readonly pid: number;
  readonly host: MachineId;
  readonly readSession: () => SessionRow | undefined;
  readonly warn: (message: string) => void;
  /** After every save's commit, off the path (REQ-SESSION-028's one file). */
  readonly onSaved?: (generation: number) => void;
}

/** REQ-SESSION-095 / REQ-EVENTS-026: the one terminal result, computed once and used everywhere. */
export interface RunResult {
  readonly status: TerminalResult;
  readonly session_id: string;
  readonly stop_reason: string;
  readonly summary: string;
  readonly iterations_completed: number;
  readonly report: null;
  readonly tokens: { input: number; output: number; total: number };
  readonly cost: { total: string };
  readonly error: string | null;
  readonly execution_status: string;
  readonly severity: 'information' | 'warning' | 'error';
}

/** ADR-0014 rule 1: the one 30 s allowance, shared by the cancellation grace and the force-exit backstop. */
export const STOP_GRACE: Millis = millis(30_000);

export class Run {
  readonly stop = new StopRequest();
  readonly sessionId: SessionId;
  private readonly abort = new AbortController();
  private pendingForward: Promise<void> = Promise.resolve();
  private started = false;
  private ended = false;
  private startedAt: Millis | null = null;
  private hardCancel: Budget | null = null;
  private iterationsCompleted = 0;
  private lastFailure: string | null = null;
  private todo: Todo;
  private aggregates: Aggregates;
  private result: RunResult | null = null;
  private readonly dispatched = new Map<string, string>();
  private children: IterationChildren | null = null;
  /** REQ-ORCH-072: the root agent's own child identity for this iteration. */
  private rootId = 'root';
  /** Every tool port this run created — the root's and each child's — so an answer, a cancel or a mode change reaches all of them (REQ-TOOLS-030). */
  private readonly ports = new Set<ToolPort>();
  /** REQ-HOOKS-087: the session's hook attachment, removed at the end of the run. */
  private hooks: HookPort | null;

  constructor(private readonly deps: RunDeps) {
    this.sessionId = deps.sessionId;
    this.hooks = deps.hooks ?? null;
    this.todo = Todo.fresh(deps.taskId, deps.task, deps.config.consecutiveRetryLimit);
    this.aggregates = Aggregates.rehydrate(deps.readSession());
    // Sticky and observable: a request before the loop exists replays here (REQ-SESSION-092).
    this.stop.onRequested((s) => {
      // REQ-MONITOR-012: whatever is blocked on a person is released first, then the run stops.
      try { this.cancelPending(); } catch (cause) { this.deps.warn(`releasing pending approvals on ${this.sessionId} failed: ${String(cause)}`); }
      this.abort.abort();
      if (s.forced || this.hardCancel) return;
      // REQ-SESSION-092 / REQ-MONITOR-129: graceful first; the 30 s deadline hard-cancels and sweeps again.
      this.hardCancel = Budget.begin(this.deps.clocks.monotonic.now(), STOP_GRACE);
      this.deps.clocks.timers.after(STOP_GRACE, () => { if (!this.ended) this.stop.request(s.reason ?? 'user_cancelled', true); });
    });
  }

  /** Whether the 30 s hard-cancel budget is armed (ADR-0014). */
  get hardCancelArmed(): boolean {
    return this.hardCancel !== null;
  }
  get isEnded(): boolean {
    return this.ended;
  }
  get outcome(): RunResult | null {
    return this.result;
  }

  /** The writer's commit hand-off: the wire lines are queued for the bus in commit order. */
  onCommitted(c: Committed): void {
    if (!c.events || c.events.length === 0) return;
    for (const e of c.events) {
      this.pendingForward = this.pendingForward.then(() => this.deps.bus.forward(this.sessionId, e.event, e.line));
    }
  }

  /** REQ-EVENTS-165: nothing proceeds past the operation until every blocking consumer has taken its events. */
  private drain(): Promise<void> {
    return this.pendingForward;
  }

  async start(): Promise<RunResult> {
    if (this.started) throw new Error('a run starts once (REQ-MONITOR-260)');
    this.started = true;
    const { writer, config, clocks } = this.deps;
    let stopReason: StopReason | null = null;
    try {
      // REQ-SESSION-091: a cancellation already requested skips the agent runtime entirely.
      if (this.stop.requested) return await this.teardown(this.stop.reason ?? 'user_cancelled');

      // REQ-SESSION-087, in order and observably.
      writer.save('starting');
      this.startedAt = clocks.monotonic.now();
      const audit = writer.recordLaunchAudit({
        session_id: this.sessionId, workspace_root: this.deps.workspaceRoot, created_at: this.deps.readSession()?.created_at ?? null,
        run_intent: { category: 'moderate_feature', confidence: null, reason: 'intent classification is not built; fallback', fallback: true, carried_over: false },
        permission_mode: 'default', check_suite: null, resolved_playbooks: {}, hooks: this.hooks?.auditSnapshot() ?? [], config_snapshot: {},
      });
      if (audit.ok && !audit.value) this.deps.warn(`launch audit for ${this.sessionId} already existed and was not rewritten (REQ-SESSION-138)`);
      writer.appendTimeline('run_start', 'rotaris', `A run is starting for session ${this.sessionId}.`, { workspace_root: this.deps.workspaceRoot });
      // ADR-0015 / REQ-HOOKS-085/086/127: the trust outcome announced once, ahead of the first hook-related event.
      if (this.hooks) {
        const trust = this.hooks.trust();
        if (trust.loadWarning !== '') this.deps.warn(trust.loadWarning);
        this.hooks.announceWithheld();
        if (trust.withheld > 0) {
          writer.recordIssue({ kind: 'hook_trust', severity: 'warning', actor: 'hooks', message: trust.notice, metadata: { blocked: trust.withheld, restored: trust.reinstated, workspace: trust.workspace } });
          this.deps.notice?.({ severity: 'warning', headline: 'Workspace hooks need review', detail: trust.notice, action: 'hooks.review', key: `hooks.review:${trust.workspace}:${trust.fingerprint}` });
        }
      }
      // REQ-TOOLS-071: the effective mode announced — session state, and on a downgrade the transcript, the timeline and the log.
      const perm = this.deps.permission;
      if (perm.downgraded) {
        writer.appendRow('system', perm.reason, true);
        writer.appendTimeline('permission_mode_downgraded', 'rotaris', perm.reason, { requested_mode: perm.requested, effective_mode: perm.effective });
        this.deps.warn(perm.reason);
      }
      this.saveRunning({ run_started_at: this.deps.readSession()?.updated_at ?? null, permission_mode: perm.effective, sandboxed: perm.sandboxed ? 1 : 0 });
      await this.drain();
      // REQ-HOOKS-003/081: session_start once, ahead of the first iteration, in line with the loop (REQ-HOOKS-080).
      if (this.hooks) await this.hooks.fireLifecycle('session_start', { task: this.deps.task });

      // REQ-ORCH-069: stop conditions between iterations, first match wins; the stop request wins over all.
      for (;;) {
        if (this.stop.requested) { stopReason = this.stop.reason ?? 'user_cancelled'; break; }
        stopReason = stopCondition({
          allTasksComplete: this.todo.allTasksComplete, pendingTasks: this.todo.pendingCount,
          iterationsCompleted: this.iterationsCompleted, iterationLimit: config.iterationLimit,
          elapsedMs: clocks.monotonic.now() - (this.startedAt ?? clocks.monotonic.now()), timeLimitMs: config.timeLimitMs,
        });
        if (stopReason) break;
        const escalated = await this.iterate();
        if (escalated) { stopReason = 'agent_session_aborted'; break; }
      }
      return await this.teardown(stopReason ?? 'no_pending_tasks');
    } catch (cause) {
      // REQ-SESSION-094: teardown runs even on any exception; REQ-SESSION-093: a runtime exception persists failed.
      this.lastFailure = this.lastFailure ?? String(cause);
      this.deps.warn(`run ${this.sessionId} raised outside an iteration: ${String(cause)}`);
      return await this.teardown('agent_session_aborted');
    }
  }

  /** One iteration (REQ-ORCH-067/068/072/073/074/135). Returns true when the run must end as agent_session_aborted. */
  private async iterate(): Promise<boolean> {
    const { writer } = this.deps;
    const task = this.todo.selectNext();
    if (!task) return false;
    this.todo.begin(task);
    const iteration = this.iterationsCompleted + 1;
    writer.recordEvent('iteration.start', { task: task.text }, iteration);
    await this.drain();

    let outcome: 'succeeded' | 'failed' | 'partial' | 'cancelled' | 'abandoned' = 'failed';
    let summary = '';
    let escalate = false;
    try {
      const report = await this.turnWithRetry(task.text);
      summary = report.text.slice(0, 200);
      if (report.usage.input + report.usage.output > 0) {
        this.aggregates.addTurnUsage(report.usage);
        // REQ-EVENTS-053: never empty; cumulative, the newest supersedes.
        writer.recordEvent('usage.update', this.aggregates.usagePayload(), iteration);
      }
      if (this.stop.requested) {
        // REQ-ORCH-135: an iteration cancelled mid-run closes as cancelled; the task stays anchored.
        outcome = 'cancelled';
        task.state = 'pending';
        summary = 'the run was cancelled before the agent finished';
      } else if (report.status === 'succeeded') {
        outcome = 'succeeded';
        this.todo.complete(task);
      } else if (report.status === 'partial') {
        outcome = this.todo.requeue(task) === 'abandoned' ? 'abandoned' : 'partial';
      } else {
        // REQ-ORCH-074: failed → the task is abandoned; for the root agent the run ends agent_session_aborted.
        outcome = 'failed';
        this.lastFailure = describe(report.error);
        summary = this.lastFailure;
        this.todo.abandon(task);
        escalate = true;
      }
    } catch (cause) {
      // REQ-ORCH-073 / REQ-ORCH-135: an iteration that raises closes as failed, the task abandoned.
      this.lastFailure = String(cause);
      summary = `the iteration ended with an unhandled error: ${String(cause)}`;
      this.todo.abandon(task);
      escalate = true;
    }
    writer.recordEvent('iteration.end', { task: task.text, outcome, summary }, iteration);
    // REQ-HOOKS-075/077/080/082: iteration_end for N finishes before N+1 begins; the iteration's own state beside the dispatched outcome.
    if (this.hooks) {
      const iterationState = outcome === 'cancelled' ? 'cancelled' : outcome === 'failed' || outcome === 'abandoned' ? 'failed' : 'succeeded';
      await this.hooks.fireLifecycle('iteration_end', { iteration, outcome, child_name: this.rootId, status: iterationState, summary });
    }
    this.iterationsCompleted += 1;
    this.saveRunning({});
    await this.drain();
    return escalate;
  }

  /** REQ-ORCH-092: a transient failure is retried up to `transientRetries` times after min(2, n) s. */
  private async turnWithRetry(task: string): Promise<TurnReport> {
    const { config, clocks } = this.deps;
    let attempt = 0;
    for (;;) {
      const report = await this.turn(task);
      if (report.status !== 'failed' || !report.error.transient || this.stop.requested || attempt >= config.transientRetries) return report;
      attempt += 1;
      this.deps.warn(`transient model failure on ${this.sessionId} (transient_llm_error): ${describe(report.error)}; retry ${attempt} after ${Math.min(2, attempt)} s`);
      await new Promise<void>((resolve) => clocks.timers.after(millis(Math.min(2, attempt) * 1000), resolve));
    }
  }

  /** One turn: the tool loop of `turn.ts`, every model step streamed into its own `agent` row; with children, the resume loop. */
  private async turn(task: string): Promise<TurnReport> {
    const { writer, owner, backend, config } = this.deps;
    const iteration = this.iterationsCompleted + 1;
    this.rootId = `root:${iteration}`;
    const children = this.deps.toolsFor && this.deps.dal
      ? new IterationChildren({
        sessionId: this.sessionId, workspaceRoot: this.deps.workspaceRoot, dal: this.deps.dal, writer, owner, backend, clocks: this.deps.clocks, model: config.model, thinking: config.thinking,
        modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries, resolveCredential: config.resolveCredential, maxStepsPerTurn: config.maxStepsPerTurn,
        budget: this.deps.budget ?? { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: this.deps.modelCap ?? (() => null), toolsFor: this.portFor,
        summariser: this.deps.summariser ?? null, hooks: this.hooks, ...(this.deps.childTimeoutMs === undefined ? {} : { childTimeoutMs: this.deps.childTimeoutMs }), runSignal: this.abort.signal, warn: this.deps.warn,
      }, iteration)
      : null;
    this.children = children;
    const tools = children && this.deps.toolsFor ? this.portFor(config.persona, config.persona, children, this.rootId, 0) : this.register(this.deps.tools);
    const turnFn = (text: string, history: readonly ChatMessage[]) => runTurn({
      writer, owner, backend, tools, clocks: this.deps.clocks, persona: config.persona, agentName: config.persona,
      systemPrompt: config.systemPrompt, model: config.model, thinking: config.thinking, modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries,
      resolveCredential: config.resolveCredential, maxStepsPerTurn: config.maxStepsPerTurn, warn: this.deps.warn, dispatched: this.dispatched,
    }, text, history, this.abort.signal);
    try {
      const outcome = children ? await children.runWithChildren(this.rootId, turnFn, task, this.abort.signal) : await turnFn(task, []);
      this.aggregates.addToolCalls(outcome.toolCallCount);
      // REQ-ORCH-080: a stop with active background children drains before anything is cancelled.
      if (children && this.stop.requested && children.scheduler.hasNonTerminal) await children.drain(this.deps.drainTimeoutMs ?? millis(120_000));
      return outcome.report;
    } finally {
      // REQ-ORCH-052: every exit path from an iteration leaves every child record terminal.
      if (children) { const n = children.finalize(this.stop.requested ? 'cancelled: the run was stopped while this child was in flight' : 'cancelled during iteration cleanup'); if (n > 0) this.deps.warn(`iteration ${iteration}: ${n} child(ren) settled cancelled at exit (REQ-ORCH-052)`); }
    }
  }

  private register(port: ToolPort | null): ToolPort | null {
    if (port) this.ports.add(port);
    return port;
  }
  private readonly portFor = (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number): ToolPort | null => {
    const p = this.deps.toolsFor ? this.deps.toolsFor(persona, agentName, delegation, parentId, depth) : null;
    return this.register(p);
  };

  /** REQ-MONITOR-012 / REQ-TOOLS-177: every waiting approval of every agent in this run. */
  cancelPending(): number {
    let n = 0;
    for (const p of this.ports) n += p.cancelPending();
    if (this.deps.tools && !this.ports.has(this.deps.tools)) n += this.deps.tools.cancelPending();
    return n;
  }
  /** ADR-0013: an answer is routed by request id to whichever agent's registry holds it. */
  answerApproval(requestId: string, option: ApprovalOption): boolean {
    for (const p of this.ports) if (p.answerApproval(requestId, option)) return true;
    return this.deps.tools?.answerApproval(requestId, option) ?? false;
  }

  /** REQ-MONITOR-009 / REQ-ORCH-133: cancel one child; the reserved run id is a full cancellation. */
  cancelAgent(taskId: string): boolean {
    if (this.ended) return false;
    if (taskId === 'run' || taskId === this.rootId) { this.stop.request('user_cancelled'); return true; }
    const ch = this.children;
    if (!ch) return false;
    const row = ch.ledger.get(taskId);
    if (!row || ['succeeded', 'failed', 'cancelled', 'blocked'].includes(row.state)) return false;
    const r = ch.ledger.transition(taskId, 'cancelled', 'cancellation');
    if (!r.ok) return false;
    ch.ledger.storeReport(taskId, { agent_name: row.canonical_name, role: row.persona, status: 'cancelled', summary: 'The user cancelled this child.', key_findings: [], last_response: '', final_response: '', errors: [] });
    this.deps.writer.appendTimeline('child_user_cancelled', 'user', `The user cancelled child ${row.canonical_name} (${taskId}).`, { task_id: taskId });
    ch.scheduler.settled(r.row);
    return true;
  }

  /** For the projection: this iteration's children. */
  currentChildren(): readonly ChildRow[] {
    return this.children?.children() ?? [];
  }

  /**
   * REQ-TOOLS-073/074/076/082, REQ-MONITOR-150..153: the mode change applies to the next tool call; it is
   * audited in the same series as the decisions; the transcript row states what actually happened.
   */
  setPermissionMode(mode: string, source = 'user'): { ok: true; effective: PermissionPreset } | { ok: false } {
    const all = [...this.ports, ...(this.deps.tools && !this.ports.has(this.deps.tools) ? [this.deps.tools] : [])];
    if (all.length === 0 || this.ended) return { ok: false };
    // REQ-TOOLS-030/073: every live agent of the session receives the new preset; the first port's change is reported.
    const changes = all.map((p) => p.setMode(mode, source));
    const change = changes[0]!;
    const { writer } = this.deps;
    writer.recordModeChange({
      timestamp: toIsoUtc(this.deps.clocks.wall.instant()), event: 'permission_mode_change', session_id: this.sessionId, agent_id: source,
      requested_mode: change.requested, effective_mode: change.effective, previous_mode: change.previous, source, reason: change.reason, skipped_personas: [],
    });
    writer.appendTimeline('permission_mode_changed', source, `Permission mode changed from '${change.previous}' to '${change.effective}'${change.reason ? ` — ${change.reason}` : ''}`, { requested_mode: change.requested, effective_mode: change.effective, previous_mode: change.previous });
    const row = change.downgraded
      ? change.reason
      : `Permission mode is now '${change.effective}'; it applies from the next tool call.`;
    writer.appendRow('system', row, true);
    this.saveRunning({ permission_mode: change.effective });
    return { ok: true, effective: change.effective };
  }

  private saveRunning(extra: { run_started_at?: string | null; permission_mode?: string; sandboxed?: number }): void {
    const r = this.deps.writer.save('running', {
      ...this.aggregates.patch(), iterations_completed: this.iterationsCompleted,
      todo: JSON.stringify(this.todo.toDocument()), progress: JSON.stringify(this.progress()),
      ...(extra.run_started_at === undefined ? {} : { run_started_at: extra.run_started_at }),
      ...(extra.permission_mode === undefined ? {} : { permission_mode: extra.permission_mode }),
      ...(extra.sandboxed === undefined ? {} : { sandboxed: extra.sandboxed }),
    });
    if (r.ok) this.deps.onSaved?.(r.value);
  }

  private progress(): Record<string, unknown> {
    return { schema_version: 1, iterations_completed: this.iterationsCompleted, completed: this.todo.completedCount, abandoned: this.todo.abandonedCount, last_failure: this.lastFailure };
  }

  /** REQ-SESSION-094: the ordered pipeline, each step guarded, the whole of it run even on exception. */
  private async teardown(reasonIn: StopReason): Promise<RunResult> {
    const { writer, owner, bus, clocks } = this.deps;
    // REQ-EVENTS-028 / REQ-SESSION-092: a requested cancellation wins over any other outcome.
    const stopReason: StopReason = this.stop.requested ? (this.stop.reason ?? 'user_cancelled') : reasonIn;
    const classified = classifyStop(stopReason);
    if (classified.diagnostic) this.deps.warn(classified.diagnostic);
    const summary = summarise({ stopReason, completed: this.todo.completedCount, abandoned: this.todo.abandonedCount, lastFailure: this.lastFailure });
    // REQ-SESSION-093: on normal completion the persisted status comes from the summarisation (a run that
    // abandoned its only task persists `failed` even though REQ-MONITOR-301 classifies its stop as
    // completed); every other outcome takes REQ-MONITOR-029's mapping.
    const status = classified.result === 'completed' ? summary.status : statusForResult(classified.result);
    const elapsed = this.startedAt === null ? null : (clocks.monotonic.now() - this.startedAt) / 1000;
    const result: RunResult = {
      status: classified.result, session_id: this.sessionId, stop_reason: stopReason, summary: summary.message,
      iterations_completed: this.iterationsCompleted, report: null, tokens: this.aggregates.usagePayload().tokens, cost: this.aggregates.usagePayload().cost,
      error: this.lastFailure, execution_status: status, severity: summary.severity,
    };
    this.result = result;
    const step = (name: string, fn: () => void) => { try { fn(); } catch (cause) { this.deps.warn(`teardown step ${name} failed on ${this.sessionId}: ${String(cause)}`); } };
    // REQ-HOOKS-003/081: session_end on every exit path, after the status is decided and before shutdown; `result.status` is
    // the one string the payload and the session.end event below both carry.
    if (this.hooks) {
      try { await this.hooks.fireLifecycle('session_end', { status: result.status }); } catch (cause) { this.deps.warn(`the session_end hooks raised on ${this.sessionId}: ${String(cause)}`); }
    }

    step('run_end', () => { writer.appendTimeline('run_end', 'rotaris', `The run ended ${status}.`, { execution_status: status, stop_reason: stopReason }); });
    step('flush-publications', () => owner.flushPending());
    // (logging cleanup: the session log is not built — REQ-SESSION-142 lands with its own mechanism.)
    step('terminal-transaction', () => {
      // REQ-SESSION-093's row, REQ-SESSION-094's lock release, session.end then result (REQ-SESSION-095), the terminal save.
      const systemRow = classified.result === 'interrupted' ? 'Run paused: interrupted by user.'
        : classified.result === 'failed' || classified.result === 'error' || status === 'failed' ? `Run failed: ${this.lastFailure ?? stopReason}`
          : summary.message;
      const r = writer.endRun({
        status, pid: this.deps.pid, host: this.deps.host, systemRow,
        patch: {
          ...this.aggregates.patch(), stop_reason: stopReason, iterations_completed: this.iterationsCompleted,
          summary_status: summary.status, summary_severity: summary.severity, summary_text: summary.message,
          todo: JSON.stringify(this.todo.toDocument()), progress: JSON.stringify(this.progress()),
        },
        events: [
          { kind: 'session.end', payload: { status: result.status, stop_reason: stopReason, iterations_completed: this.iterationsCompleted, duration_seconds: elapsed, tokens: result.tokens, cost: result.cost } },
          { kind: 'result', payload: { result: { status: result.status, session_id: result.session_id, stop_reason: result.stop_reason, summary: result.summary, iterations_completed: result.iterations_completed, report: null, tokens: result.tokens, cost: result.cost, error: result.error } } },
        ],
      });
      if (r.ok) this.deps.onSaved?.(writer.lastGeneration);
    });
    try { await this.drain(); } catch (cause) { this.deps.warn(`forwarding the terminal pair failed on ${this.sessionId}: ${String(cause)}`); }
    // REQ-HOOKS-054/087/088: the switched-off advisory to the notice channel, then the attachment removed — nothing when nothing happened.
    step('hooks-advisory', () => {
      const adv = this.hooks?.advisory() ?? '';
      if (adv !== '') this.deps.notice?.({ severity: 'warning', headline: 'Hooks need attention', detail: adv, action: 'hooks.settings' });
      this.hooks = null;
    });
    // Finally, every per-session binding goes (REQ-EVENTS-071).
    step('remove-bindings', () => bus.detachSession(this.sessionId));
    this.ended = true;
    return result;
  }
}

function describe(e: ModelError): string {
  return [e.headline, e.status === undefined ? '' : `HTTP ${e.status}`, e.providerMessage ?? ''].filter(Boolean).join(' — ');
}
