import { Budget, millis, type Clocks, type MachineId, type Millis, type SessionId } from '@rotaris/kernel';
import type { SessionRow } from '@rotaris/store';
import type { AgentBackend, ModelError, ModelRef, ThinkingLevel, TurnReport } from '@rotaris/model';
import type { EventBus } from './event-bus.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { Committed, SessionWriter } from '../session-writer.js';
import { Aggregates } from './aggregates.js';
import { classifyStop, statusForResult, stopCondition, summarise, type StopReason, type TerminalResult } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { Todo } from './todo.js';

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
};

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

  constructor(private readonly deps: RunDeps) {
    this.sessionId = deps.sessionId;
    this.todo = Todo.fresh(deps.taskId, deps.task, deps.config.consecutiveRetryLimit);
    this.aggregates = Aggregates.rehydrate(deps.readSession());
    // Sticky and observable: a request before the loop exists replays here (REQ-SESSION-092).
    this.stop.onRequested((s) => {
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
        permission_mode: 'default', check_suite: null, resolved_playbooks: {}, hooks: [], config_snapshot: {},
      });
      if (audit.ok && !audit.value) this.deps.warn(`launch audit for ${this.sessionId} already existed and was not rewritten (REQ-SESSION-138)`);
      writer.appendTimeline('run_start', 'rotaris', `A run is starting for session ${this.sessionId}.`, { workspace_root: this.deps.workspaceRoot });
      this.saveRunning({ run_started_at: this.deps.readSession()?.updated_at ?? null });
      await this.drain();

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

  /** One turn, streamed into one `agent` row: first delta appends it unsettled, growth ticks, the end settles it. */
  private async turn(task: string): Promise<TurnReport> {
    const { writer, owner, backend, config } = this.deps;
    let index: number | null = null;
    let text = '';
    const sink = {
      delta: (d: string) => {
        text += d;
        if (index === null) {
          const r = writer.appendRow('agent', text, false, { persona: config.persona, name: config.persona });
          if (r.ok) index = r.value.index;
        } else {
          owner.grow(index, text);
        }
      },
      reasoning: () => undefined,
      usage: () => undefined,
    };
    const report = await backend.runTurn({
      persona: config.persona, systemPrompt: config.systemPrompt, task, history: [], model: config.model, thinking: config.thinking,
      timeoutMs: config.modelTimeoutMs, retries: config.modelRetries, resolveCredential: config.resolveCredential,
    }, sink, this.abort.signal);
    if (index !== null) writer.settleRow(index, report.text || text);
    return report;
  }

  private saveRunning(extra: { run_started_at?: string | null }): void {
    const r = this.deps.writer.save('running', {
      ...this.aggregates.patch(), iterations_completed: this.iterationsCompleted,
      todo: JSON.stringify(this.todo.toDocument()), progress: JSON.stringify(this.progress()),
      ...(extra.run_started_at === undefined ? {} : { run_started_at: extra.run_started_at }),
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
    // (hooks notice: none are built.) Finally, every per-session binding goes (REQ-EVENTS-071).
    step('remove-bindings', () => bus.detachSession(this.sessionId));
    this.ended = true;
    return result;
  }
}

function describe(e: ModelError): string {
  return [e.headline, e.status === undefined ? '' : `HTTP ${e.status}`, e.providerMessage ?? ''].filter(Boolean).join(' — ');
}
