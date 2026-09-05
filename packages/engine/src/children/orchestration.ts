import { millis, toIsoUtc, type Clocks, type Millis, type SessionId } from '@rotaris/kernel';
import { isTerminalChildState, reportStatusToState, TASK_ID_PATTERN } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import { runTurn, type SteeringPrompt, type ToolPort, type TurnOutcome } from '../run/turn.js';
import type { BackgroundOutput, DelegateOutcome, DelegateRequest, DelegationOps, WaitOutcome } from './delegation.js';
import { ChildLedger, type Budget } from './ledger.js';
import { childPayload, completionNotification, parseReport, priorAgentContext, reportBlock, resumeMessage } from './notify.js';
import { BUILT_IN_PERSONAS, type Persona, type PersonaResolver, type RoleName } from './personas.js';
import { produceReport, type SummariserDeps } from './report.js';
import { Scheduler } from './scheduler.js';
import type { HookPort } from '../hooks-port.js';
import { withPlaybook } from '../run/run.js';
import type { LoopSupervisor } from '../run/supervisor.js';

/**
 * One iteration's children (REQ-ORCH-072: a fresh ledger per iteration under the clamped policy): the
 * delegation operations the tools call, the child's execution from `starting` to a terminal state
 * (REQ-ORCH-088's hard timeout, REQ-ORCH-095's assessment with one re-prompt, the report, REQ-ORCH-098's
 * teardown), and the parent's resume loop (REQ-ORCH-055/056/057/059: resumed with the newly terminal
 * children's reports whenever one reaches a terminal state it has not observed; idle otherwise; the same
 * loop serves the root and a child that delegated).
 */
export const CHILD_TIMEOUT_MS: Millis = millis(1_200_000);

export interface ChildrenDeps {
  readonly sessionId: SessionId;
  readonly workspaceRoot: string;
  readonly dal: StoreDal;
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly backend: AgentBackend;
  readonly clocks: Clocks;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly modelTimeoutMs: number;
  readonly modelRetries: number;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly maxStepsPerTurn: number;
  readonly budget: Budget;
  readonly modelCap: (modelKey: string) => number | null;
  /** The tool surface for an agent — the root or a child — with its own delegation identity. */
  readonly toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number) => ToolPort | null;
  readonly summariser: SummariserDeps | null;
  readonly childTimeoutMs?: Millis;
  readonly runSignal: AbortSignal;
  readonly warn: (m: string) => void;
  /** ADR-0015: `child_completed` fires once a child has finished, whatever its final state (REQ-HOOKS-003). */
  readonly hooks?: HookPort | null | undefined;
  /** REQ-ORCH-019: the rendered playbook per role; null or '' means no playbook. */
  readonly playbookFor?: ((role: string) => string) | null | undefined;
  /** REQ-ORCH-015: on the answer route the answered category is accepted at once. */
  readonly route?: 'answer' | 'work' | undefined;
  readonly supervisorFor?: ((conversationId: string) => LoopSupervisor) | undefined;
  /** ADR-0036: the configured personas over the built-in table; absent means the built-in table alone. */
  readonly personas?: PersonaResolver | undefined;
  /** REQ-MONITOR-133: the pending steering prompts per child conversation. */
  readonly steeringFor?: ((conversationId: string) => () => readonly SteeringPrompt[]) | undefined;
  readonly shouldPause?: (() => boolean) | undefined;
}

function personaOf(deps: ChildrenDeps, name: string): Persona | undefined {
  return deps.personas ? deps.personas.resolve(name)?.persona : BUILT_IN_PERSONAS[name as RoleName];
}

export class IterationChildren implements DelegationOps {
  readonly ledger: ChildLedger;
  readonly scheduler: Scheduler;
  private readonly startedAt = new Map<string, Millis>();
  private readonly toolCalls = new Map<string, number>();
  private readonly resumeWaiters = new Map<string, () => void>();

  constructor(private readonly deps: ChildrenDeps, readonly iteration: number) {
    this.ledger = new ChildLedger({ dal: deps.dal, writer: deps.writer, sessionId: deps.sessionId, iteration, budget: deps.budget, modelCap: deps.modelCap, warn: deps.warn , personas: deps.personas });
    this.scheduler = new Scheduler({ ledger: this.ledger, runChild: (row) => this.execute(row), warn: deps.warn });
    this.scheduler.onTerminal((row) => { const w = this.resumeWaiters.get(row.parent_id); if (w) { this.resumeWaiters.delete(row.parent_id); w(); } });
  }

  children(): readonly ChildRow[] {
    return this.ledger.all();
  }

  // ---- DelegationOps -----------------------------------------------------------------------

  async delegate(parentId: string, req: DelegateRequest): Promise<DelegateOutcome> {
    const parent = this.ledger.get(parentId);
    const parentDepth = parent ? parent.depth : 0;
    const persona = personaOf(this.deps, req.persona);
    const r = this.ledger.spawn({
      parentId, parentDepth, persona: req.persona, taskName: req.taskName, task: req.task, dependsOn: req.dependsOn, inheritedContext: req.inheritedContext,
      category: req.category, background: req.runInBackground, modelKey: persona?.modelRef?.modelId ?? this.deps.model.modelId, grantedTools: persona?.tools ?? [],
    });
    if (!r.ok) return { status: 'rejected', canonicalName: req.taskName, message: r.error.reason };
    const { row, held, aliasResolved } = r.value;
    const alias = aliasResolved ? ` Alias '${aliasResolved}' resolved to '${row.persona}'.` : '';
    // REQ-ORCH-056/058: a state change triggers a pass; the delegate observation returns at once.
    this.scheduler.pass();
    const now = this.ledger.get(row.task_id) ?? row;
    if (held || now.state === 'waiting_on_model_slot') {
      const cap = this.deps.modelCap(row.model_key) ?? 0;
      return { status: 'waiting_on_model_slot', canonicalName: row.canonical_name, taskId: row.task_id, message: `Queued behind model '${row.model_key}''s slot cap: ${this.ledger.slotsInUse(row.model_key)} of ${cap} slots in use; the task starts by itself once a slot opens.${alias}` };
    }
    if (now.state === 'waiting_on_dependencies') return { status: 'waiting_on_dependencies', canonicalName: row.canonical_name, taskId: row.task_id, message: `Waiting on ${req.dependsOn.join(', ')}.${alias}` };
    return { status: 'queued', canonicalName: row.canonical_name, taskId: row.task_id, message: `Accepted; the child runs in the ${req.runInBackground ? 'background' : 'foreground'}.${alias}` };
  }

  backgroundOutput(parentId: string, taskId: string, detail: 'summary' | 'verbatim'): BackgroundOutput {
    const row = this.ledger.get(taskId);
    // REQ-TOOLS-155: parent-scoped — another parent's child reads as not_found.
    if (!row || row.parent_id !== parentId) return { status: 'not_found', state: '', text: '' };
    if (!isTerminalChildState(row.state)) return { status: 'still_running', state: row.state, text: '' };
    const r = parseReport(row);
    const lines = [`agent: ${row.canonical_name} (${row.persona})`, `status: ${r?.status ?? row.state}`, `summary: ${r?.summary ?? ''}`, `key findings:\n${(r?.key_findings ?? []).map((k) => `- ${k}`).join('\n') || '(none)'}`, `last reply: ${r?.last_response ?? ''}`];
    if (detail === 'verbatim') lines.push(`final reply (verbatim): ${r?.final_response ?? ''}`);
    return { status: 'ok', state: row.state, text: lines.join('\n') };
  }

  /** REQ-TOOLS-156: only direct children, never the caller's own task, no deadline; N = 0 is valid. */
  async waitForTasks(parentId: string, taskIds: readonly string[]): Promise<WaitOutcome | { readonly refused: string }> {
    if (taskIds.includes(parentId)) return { refused: 'An agent cannot wait for its own task.' };
    const mine = this.ledger.childrenOf(parentId);
    for (const id of taskIds) {
      if (!TASK_ID_PATTERN.test(id)) return { refused: `'${id}' is not a task id.` };
      if (!mine.some((c) => c.task_id === id)) return { refused: 'An agent can wait only for its direct child tasks.' };
    }
    const set = taskIds.length > 0 ? taskIds : mine.filter((c) => c.background === 1 && !isTerminalChildState(c.state)).map((c) => c.task_id);
    const already = set.every((id) => { const r = this.ledger.get(id); return !r || isTerminalChildState(r.state); });
    if (already) {
      const rows = set.map((id) => this.ledger.get(id)).filter((r): r is ChildRow => r !== undefined);
      for (const r of rows) this.ledger.markObserved(r.task_id);
      return { immediate: true, requested: set.length, text: set.length === 0 ? 'There was nothing to wait for: no task ids were given and no background children are active.' : `All ${set.length} requested task(s) were already complete.\n\n${rows.map(reportBlock).join('\n\n')}` };
    }
    await this.scheduler.waitFor(set);
    const rows = set.map((id) => this.ledger.get(id)).filter((r): r is ChildRow => r !== undefined);
    for (const r of rows) this.ledger.markObserved(r.task_id);
    return { immediate: false, requested: set.length, text: `The waited-for background tasks completed (${set.length}).\n\n${rows.map(reportBlock).join('\n\n')}` };
  }

  // ---- the resume loop ---------------------------------------------------------------------

  /** Resolves when a direct child of `parentId` reaches a terminal state the parent has not observed, or when none remains. */
  private awaitTerminal(parentId: string): Promise<void> {
    const mine = this.ledger.childrenOf(parentId);
    if (mine.some((c) => isTerminalChildState(c.state) && c.observed === 0)) return Promise.resolve();
    if (!mine.some((c) => !isTerminalChildState(c.state))) return Promise.resolve();
    return new Promise<void>((resolve) => { this.resumeWaiters.set(parentId, resolve); if (this.deps.runSignal.aborted) resolve(); });
  }

  /**
   * REQ-ORCH-055/056/057/059/063: one turn, then — while this parent has children not yet terminal, or
   * terminal and unobserved — wait, collect the newly terminal ones, and resume the parent with their reports.
   * The parent is left idle once nothing of its can change without a child changing state.
   */
  async runWithChildren(agentId: string, turn: (task: string, history: readonly ChatMessage[]) => Promise<TurnOutcome>, task: string, signal: AbortSignal): Promise<TurnOutcome> {
    let outcome = await turn(task, []);
    let history = outcome.messages;
    let toolCalls = outcome.toolCallCount;
    for (;;) {
      if (signal.aborted || outcome.report.status === 'failed') break;
      this.scheduler.pass();
      const mine = this.ledger.childrenOf(agentId);
      const pending = mine.filter((c) => !isTerminalChildState(c.state));
      const unobserved = mine.filter((c) => isTerminalChildState(c.state) && c.observed === 0);
      if (pending.length === 0 && unobserved.length === 0) break;
      if (unobserved.length === 0) await this.awaitTerminal(agentId);
      if (signal.aborted) break;
      const newly = this.ledger.takeNewlyTerminal(agentId);
      if (newly.length === 0) continue;
      const stillRunning = this.ledger.childrenOf(agentId).filter((c) => !isTerminalChildState(c.state)).length;
      const notices = newly.filter((c) => c.background === 1).map((c) => completionNotification(c, stillRunning, this.durationS(c)));
      const message = [...notices, resumeMessage(newly, stillRunning)].join('\n\n');
      outcome = await turn(message, history);
      history = outcome.messages;
      toolCalls += outcome.toolCallCount;
    }
    return { ...outcome, messages: history, toolCallCount: toolCalls };
  }

  private durationS(c: ChildRow): number {
    const started = this.startedAt.get(c.task_id);
    return started === undefined ? 0 : (this.deps.clocks.monotonic.now() - started) / 1000;
  }

  // ---- a child's execution -----------------------------------------------------------------

  private async execute(row: ChildRow): Promise<void> {
    const { deps } = this;
    const started = deps.clocks.monotonic.now();
    this.startedAt.set(row.task_id, started);
    const moved = this.ledger.transition(row.task_id, 'running');
    if (!moved.ok) { deps.warn(moved.reason); return; }
    const persona = personaOf(deps, row.persona);
    const controller = new AbortController();
    const onRunAbort = () => controller.abort();
    deps.runSignal.addEventListener('abort', onRunAbort, { once: true });
    let timedOut = false;
    const timer = deps.clocks.timers.after(deps.childTimeoutMs ?? CHILD_TIMEOUT_MS, () => { timedOut = true; controller.abort(); });
    const tools = deps.toolsFor(row.persona, row.canonical_name, this, row.task_id, row.depth);
    const dispatched = new Map<string, string>();
    const turn = (task: string, history: readonly ChatMessage[]) => runTurn({
      writer: deps.writer, owner: deps.owner, backend: deps.backend, tools, clocks: deps.clocks, persona: row.persona, agentName: row.canonical_name,
      systemPrompt: withPlaybook(persona?.systemPrompt ?? '', deps.playbookFor?.(row.persona) ?? ''), model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking, modelTimeoutMs: deps.modelTimeoutMs, modelRetries: deps.modelRetries,
      credentialFor: deps.credentialFor, maxStepsPerTurn: deps.maxStepsPerTurn, warn: deps.warn, dispatched,
      ...(deps.supervisorFor ? { supervisor: deps.supervisorFor(row.task_id) } : {}),
      ...(deps.steeringFor ? { steering: deps.steeringFor(row.task_id) } : {}),
      ...(deps.shouldPause ? { shouldPause: deps.shouldPause } : {}),
    }, task, history, controller.signal);
    // REQ-ORCH-047 / REQ-TOOLS-154: the prior-agent-context block, exactly once, ahead of everything.
    let prior = '';
    if (row.context_injected === 0) {
      const depRows = (JSON.parse(row.depends_on) as string[]).map((d) => this.ledger.get(d)).filter((d): d is ChildRow => d !== undefined);
      prior = priorAgentContext(depRows);
      if (prior) this.ledger.markContextInjected(row.task_id);
    }
    let outcome: TurnOutcome | null = null;
    let error: { type: string; message: string } | null = null;
    try {
      outcome = await this.runWithChildren(row.task_id, turn, childPayload(deps.workspaceRoot, row.task, prior), controller.signal);
      // REQ-ORCH-095: one re-prompt for a child that neither worked nor answered — and, on a work route, for an implementer
      // that produced text and acted on nothing; on the answer route the answered category is accepted at once (REQ-ORCH-015).
      const textOnly = outcome.toolCallCount === 0 && outcome.report.text.trim() !== '';
      const rePrompt = outcome.toolCallCount === 0 && outcome.report.text.trim() === '' || ((deps.route ?? 'work') === 'work' && textOnly && persona?.implementer === true);
      if (!controller.signal.aborted && outcome.report.status !== 'failed' && rePrompt) {
        const again = await turn('Carry out the task now, using your tools where the task needs them, then answer with what you did.', outcome.messages);
        outcome = { ...again, toolCallCount: outcome.toolCallCount + again.toolCallCount };
      }
    } catch (cause) {
      error = { type: 'child_exception', message: String(cause instanceof Error ? cause.message : cause) };
      deps.writer.recordIssue({ kind: 'child_exception', severity: 'error', actor: row.canonical_name, message: `Child ${row.canonical_name} raised: ${error.message}` });
    } finally {
      timer.cancel();
      deps.runSignal.removeEventListener('abort', onRunAbort);
    }
    const cancelled = deps.runSignal.aborted;
    const toolCalls = outcome?.toolCallCount ?? 0;
    this.toolCalls.set(row.task_id, toolCalls);
    deps.dal.setChildTodo(deps.sessionId, row.task_id, null, toolCalls);
    const messages = outcome?.messages ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastText = lastAssistant ? lastAssistant.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') : '';
    const finalIsFinal = lastAssistant !== undefined && messages[messages.length - 1] === lastAssistant;
    let status: 'succeeded' | 'failed' | 'cancelled';
    const errors: { type: string; message: string }[] = [];
    if (cancelled) status = 'cancelled';
    else if (timedOut) { status = 'failed'; errors.push({ type: 'timeout', message: `Child timed out after ${(deps.childTimeoutMs ?? CHILD_TIMEOUT_MS) / 1000}s` }); deps.writer.recordIssue({ kind: 'timeout', severity: 'error', actor: row.canonical_name, message: `Child ${row.canonical_name} timed out after ${(deps.childTimeoutMs ?? CHILD_TIMEOUT_MS) / 1000}s.` }); }
    else if (error) { status = 'failed'; errors.push(error); }
    else if (!outcome || outcome.report.status === 'failed') { status = 'failed'; if (outcome && outcome.report.status === 'failed') errors.push({ type: outcome.escalation ? 'circuit_breaker_escalation' : 'model', message: outcome.report.error.headline }); }
    else if (toolCalls === 0 && lastText.trim() === '') { status = 'failed'; errors.push({ type: 'incomplete_execution', message: 'no_activity' }); deps.writer.recordIssue({ kind: 'incomplete_execution', severity: 'warning', actor: row.canonical_name, message: `Child ${row.canonical_name} ended with no activity after one re-prompt (category no_activity).` }); }
    else status = 'succeeded';

    // REQ-MONITOR-018: summarizing until the report exists, then terminal; cancellation settles from anywhere.
    if (!cancelled) { const s = this.ledger.transition(row.task_id, 'summarizing'); if (!s.ok) deps.warn(s.reason); }
    const report = await produceReport({ agentName: row.canonical_name, role: row.persona, status, messages, toolCallCount: toolCalls, toolsUsed: [...new Set(messages.flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-call' ? [p.name] : []))))], lastText, finalTextIsFinal: finalIsFinal, errors }, cancelled ? null : deps.summariser, controller.signal);
    this.ledger.storeReport(row.task_id, report as unknown as Record<string, unknown>);
    const terminal = cancelled ? 'cancelled' : status === 'failed' ? 'failed' : reportStatusToState(report.status);
    const t = cancelled ? this.ledger.transition(row.task_id, 'cancelled', 'cancellation') : this.ledger.transition(row.task_id, terminal);
    if (!t.ok) deps.warn(t.reason);
    // REQ-ORCH-098: teardown, whatever the terminal state.
    const at = toIsoUtc(deps.clocks.wall.instant());
    deps.writer.appendTimeline('child_end', 'rotaris', `Child ${row.canonical_name} (${row.task_id}) ended ${terminal}.`, { task_id: row.task_id, state: terminal, at });
    deps.writer.appendTimeline('child_result', 'rotaris', `Child ${row.canonical_name} reported ${report.status}: ${report.summary.slice(0, 120)}`, { task_id: row.task_id, status: report.status });
    deps.writer.appendTimeline('child_conversation_closed', 'rotaris', `Child ${row.canonical_name}'s conversation closed.`, { task_id: row.task_id });
    // REQ-HOOKS-075: child_completed with the child's terminal state and its report status side by side.
    if (deps.hooks) await deps.hooks.fireLifecycle('child_completed', { child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state: terminal, status: report.status, summary: report.summary });
    const settledRow = this.ledger.get(row.task_id);
    if (settledRow) this.scheduler.settled(settledRow);
  }

  /** REQ-ORCH-080: on stop with active background children, wait up to the drain timeout without cancelling them. */
  async drain(timeoutMs: Millis): Promise<number> {
    const active = this.ledger.all().filter((c) => c.background === 1 && !isTerminalChildState(c.state)).map((c) => c.task_id);
    if (active.length === 0 || timeoutMs <= 0) return this.ledger.all().filter((c) => !isTerminalChildState(c.state)).length;
    await Promise.race([this.scheduler.waitFor(active), new Promise<void>((r) => this.deps.clocks.timers.after(timeoutMs, r))]);
    const left = this.ledger.all().filter((c) => !isTerminalChildState(c.state));
    if (left.length > 0) this.deps.writer.recordIssue({ kind: 'background_child_drain_timeout', severity: 'warning', actor: 'rotaris', message: `${left.length} background child(ren) still running after the ${timeoutMs / 1000} s drain: ${left.map((c) => c.canonical_name).join(', ')}.` });
    return left.length;
  }

  /** REQ-ORCH-052: every exit path leaves every record terminal. */
  finalize(reason: string): number {
    return this.scheduler.finalizeIncomplete(reason);
  }
}

/** REQ-ORCH-053: on a later run of the same session, settle every non-terminal child of any previous iteration before the first iteration. */
export function settleStaleChildren(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, warn: (m: string) => void): number {
  let n = 0;
  for (const c of dal.childrenOf(sessionId)) {
    if (isTerminalChildState(c.state)) continue;
    const r = writer.transitionChild(c.task_id, 'cancelled', 'cancellation');
    if (r.ok) { n += 1; writer.storeChildReport(c.task_id, { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: 'Cancelled: the run that owned this child ended (killed host or hard cancel) before it settled.', key_findings: [], last_response: '', final_response: '', errors: [{ type: 'cancelled', message: 'settled on continue (REQ-ORCH-053)' }] }); }
    else warn(r.error.code === 'illegal-move' ? r.error.reason : r.error.code);
  }
  return n;
}
