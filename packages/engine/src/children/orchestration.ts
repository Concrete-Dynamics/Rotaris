import { millis, toIsoUtc, type Clocks, type Millis, type SessionId } from '@rotaris/kernel';
import { isTerminalChildState, reportStatusToState, TASK_ID_PATTERN } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import { runTurn, type SteeringPrompt, type ToolPort, type TurnOutcome } from '../run/turn.js';
import type { AttachmentOutcome, BackgroundOutput, DelegateOutcome, DelegateRequest, DelegationOps, WaitOutcome } from './delegation.js';
import { fullContextBlock, siblingIndexBlock, type AttachedResolution } from '../artifacts/context.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { ChildLedger, type Budget } from './ledger.js';
import { childPayload, completionNotification, parseReport, priorAgentContext, reportBlock, resumeMessage } from './notify.js';
import { BUILT_IN_PERSONAS, type Persona, type PersonaResolver, type RoleName } from './personas.js';
import { produceReport, type SummariserDeps } from './report.js';
import { Scheduler } from './scheduler.js';
import type { HookPort } from '../hooks-port.js';
import { withPlaybook } from '../run/run.js';
import type { LoopSupervisor } from '../run/supervisor.js';
import type { TurnResilience } from '../run/ladder.js';
import { providerIdentity, type ModelChoice } from '../run/resilience.js';
import type { TurnCompression } from '../run/compression.js';
import { todoLinesFromStored } from '../todo-view.js';

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
  /**
   * REQ-MONITOR-102: the persisted total is SESSION-wide, so a child's calls reach the run's aggregates as the
   * child settles — once per child, from the one place its count is known. Without it the total is the entry
   * agent's own calls, and a surface that subtracts the per-agent counts from it (the synthetic run row) reads
   * zero on any run that delegated. Found by the live run's first execution, 2026-09-11.
   */
  readonly countToolCalls?: ((n: number) => void) | undefined;
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
  /** Part Q: the ladder for a child — its own cell (one fallback across both routes, REQ-ORCH-144) over the run's memory and waits. */
  readonly resilience?: { readonly forChild: (persona: Persona | undefined, current: ModelChoice, unresponsiveBoundMs: number) => TurnResilience } | undefined;
  /**
   * Part AH (ADR-0060): compression for a child — the trigger resolved against the model THIS child calls, and
   * the child's OWN task plan carried across (REQ-MONITOR-078, REQ-MONITOR-084 (4)).
   */
  readonly compressionFor?: ((current: ModelChoice, todoLines: () => readonly string[]) => TurnCompression | undefined) | undefined;
  /** Part Y (REQ-LIBRARY-092/097/098): the session artifact store — child reports land in it and its two context blocks reach every child. */
  readonly artifacts?: ArtifactStore | undefined;
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
  /** REQ-LIBRARY-098: the artifacts each launch attached explicitly, by reference, for as long as the run lives. */
  private readonly attached = new Map<string, readonly string[]>();

  constructor(private readonly deps: ChildrenDeps, readonly iteration: number) {
    this.ledger = new ChildLedger({ dal: deps.dal, writer: deps.writer, sessionId: deps.sessionId, iteration, budget: deps.budget, modelCap: deps.modelCap, warn: deps.warn , personas: deps.personas, ...(deps.artifacts ? { artifacts: deps.artifacts } : {}) });
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
    // REQ-LIBRARY-098: the attachment list belongs to THIS launch, not to the record — a child does not outlive
    // the run that spawned it, so it is remembered here for the moment the child's payload is assembled.
    const attachments = this.rememberAttachments(row.task_id, req.attachArtifacts ?? []);
    const alias = aliasResolved ? ` Alias '${aliasResolved}' resolved to '${row.persona}'.` : '';
    // REQ-ORCH-056/058: a state change triggers a pass; the delegate observation returns at once.
    this.scheduler.pass();
    const now = this.ledger.get(row.task_id) ?? row;
    if (held || now.state === 'waiting_on_model_slot') {
      const cap = this.deps.modelCap(row.model_key) ?? 0;
      return { status: 'waiting_on_model_slot', canonicalName: row.canonical_name, taskId: row.task_id, message: `Queued behind model '${row.model_key}''s slot cap: ${this.ledger.slotsInUse(row.model_key)} of ${cap} slots in use; the task starts by itself once a slot opens.${alias}`, attachments };
    }
    if (now.state === 'waiting_on_dependencies') return { status: 'waiting_on_dependencies', canonicalName: row.canonical_name, taskId: row.task_id, message: `Waiting on ${req.dependsOn.join(', ')}.${alias}`, attachments };
    return { status: 'queued', canonicalName: row.canonical_name, taskId: row.task_id, message: `Accepted; the child runs in the ${req.runInBackground ? 'background' : 'foreground'}.${alias}`, attachments };
  }

  /**
   * REQ-LIBRARY-098: the references are resolved AT DELEGATION so the caller is told at once what could not
   * be resolved; the block itself is assembled when the child's payload is built, from the store as it stands
   * then. Where no artifact store exists every reference is reported unresolved rather than silently dropped.
   */
  private rememberAttachments(taskId: string, references: readonly string[]): AttachmentOutcome | undefined {
    if (references.length === 0) return undefined;
    const store = this.deps.artifacts;
    if (!store) return { attached: 0, unresolved: [...references] };
    this.attached.set(taskId, references);
    const unresolved = references.filter((ref) => store.lookup(ref) === null);
    return { attached: references.length - unresolved.length, unresolved };
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
    const childTimeoutMs = deps.childTimeoutMs ?? CHILD_TIMEOUT_MS;
    // Part Q: the child's own cell — its model (an override of the session applied), its role's fallback, one fallback across both routes.
    const resilience = deps.resilience?.forChild(persona, { model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking }, childTimeoutMs) ?? null;
    // Part AH: this child's own capacity and its own plan — the ledger row is where a child's task plan lives.
    const compression = deps.compressionFor?.({ model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking }, () => todoLinesFromStored(this.ledger.get(row.task_id)?.todo ?? null));
    const tools = deps.toolsFor(row.persona, row.canonical_name, this, row.task_id, row.depth);
    const dispatched = new Map<string, string>();
    // REQ-ORCH-047 / REQ-TOOLS-154: the prior-agent-context block, exactly once, ahead of everything.
    let prior = '';
    if (row.context_injected === 0) {
      const depRows = (JSON.parse(row.depends_on) as string[]).map((d) => this.ledger.get(d)).filter((d): d is ChildRow => d !== undefined);
      prior = priorAgentContext(depRows);
      if (prior) this.ledger.markContextInjected(row.task_id);
    }
    // REQ-LIBRARY-097/098: the automatic sibling index and the explicitly attached artifacts, assembled from the
    // store as it stands at launch — a newly created agent is given them, so they are built here and not at spawn.
    const artifactBlocks = this.artifactContext(row);
    let outcome: TurnOutcome | null = null;
    let error: { type: string; message: string } | null = null;
    let timedOut = false;
    let childSignal: AbortSignal = deps.runSignal;
    // REQ-ORCH-088: the child runs under the hard timeout; on expiry, once, it is retried on the role's fallback when one is untried.
    for (;;) {
      const controller = new AbortController();
      childSignal = controller.signal;
      const onRunAbort = () => controller.abort();
      deps.runSignal.addEventListener('abort', onRunAbort, { once: true });
      timedOut = false;
      const timer = deps.clocks.timers.after(childTimeoutMs, () => { timedOut = true; controller.abort(); });
      let firstCall = true;
      const turn = (task: string, history: readonly ChatMessage[]) => { const wasFirst = firstCall; firstCall = false; return runTurn({
        writer: deps.writer, owner: deps.owner, backend: deps.backend, tools, clocks: deps.clocks, persona: row.persona, agentName: row.canonical_name,
        systemPrompt: withPlaybook(persona?.systemPrompt ?? '', deps.playbookFor?.(row.persona) ?? ''), model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking, modelTimeoutMs: deps.modelTimeoutMs, modelRetries: deps.modelRetries,
        credentialFor: deps.credentialFor, maxStepsPerTurn: deps.maxStepsPerTurn, warn: deps.warn, dispatched,
        ...(deps.supervisorFor ? { supervisor: deps.supervisorFor(row.task_id) } : {}),
        ...(deps.steeringFor ? { steering: deps.steeringFor(row.task_id) } : {}),
        ...(deps.shouldPause ? { shouldPause: deps.shouldPause } : {}),
        ...(resilience ? { resilience } : {}),
        ...(compression ? { compression } : {}),
        // REQ-ORCH-093: the resume limb — a child's turn after its first is a parent being resumed with reports.
        parentResume: !wasFirst,
      }, task, history, controller.signal); };
      try {
        outcome = await this.runWithChildren(row.task_id, turn, childPayload(deps.workspaceRoot, row.task, prior, artifactBlocks), controller.signal);
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
      const fb = resilience?.cell.fallback ?? null;
      if (timedOut && !deps.runSignal.aborted && resilience && fb !== null && !resilience.cell.fallbackAttempted) {
        const cell = resilience.cell;
        const from = cell.model;
        cell.fallbackAttempted = true;
        cell.model = fb;
        const seconds = childTimeoutMs / 1000;
        const message = `Child ${row.canonical_name} timed out after ${seconds}s on ${providerIdentity(resilience.catalogue, from.model)}/${from.model.modelId}; retried once on the fallback model ${providerIdentity(resilience.catalogue, cell.model.model)}/${cell.model.model.modelId} (REQ-ORCH-088).`;
        deps.writer.appendTimeline('child_timeout_fallback', 'rotaris', message, { task_id: row.task_id, from_provider: providerIdentity(resilience.catalogue, from.model), from_model: from.model.modelId, to_provider: providerIdentity(resilience.catalogue, cell.model.model), to_model: cell.model.model.modelId, timeout_seconds: seconds });
        deps.writer.recordIssue({ kind: 'child_timeout_fallback', severity: 'warning', actor: row.canonical_name, message, metadata: { task_id: row.task_id, requested_model: `${providerIdentity(resilience.catalogue, from.model)}/${from.model.modelId}`, fallback_model: `${providerIdentity(resilience.catalogue, cell.model.model)}/${cell.model.model.modelId}`, timeout_seconds: seconds } });
        deps.warn(message);
        outcome = null;
        error = null;
        continue;
      }
      break;
    }
    const cancelled = deps.runSignal.aborted;
    const toolCalls = outcome?.toolCallCount ?? 0;
    this.toolCalls.set(row.task_id, toolCalls);
    // REQ-MONITOR-102: this child's calls join the session-wide total, counted once, here, whatever it ended as.
    deps.countToolCalls?.(toolCalls);
    // REQ-CHAT-088: the tool port may have persisted this child's own plan while it ran; settling updates the
    // call count while preserving that document for the scoped transcript and later session refreshes.
    const persistedTodo = deps.dal.childrenOf(deps.sessionId).find((child) => child.task_id === row.task_id)?.todo ?? null;
    deps.dal.setChildTodo(deps.sessionId, row.task_id, persistedTodo, toolCalls);
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
    const report = await produceReport({ agentName: row.canonical_name, role: row.persona, status, messages, toolCallCount: toolCalls, toolsUsed: [...new Set(messages.flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-call' ? [p.name] : []))))], lastText, finalTextIsFinal: finalIsFinal, errors }, cancelled ? null : deps.summariser, childSignal);
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

  /**
   * REQ-LIBRARY-097 / REQ-LIBRARY-098 — the two blocks, and the context-selection diagnostic both injection
   * paths record. The index lists the session's artifacts (superseded ones excluded, unsuccessful ones
   * first); the full block carries the bodies of what this launch attached. Neither raises: an unreadable
   * document leaves its record listed and is reported inside the block (REQ-LIBRARY-091).
   */
  private artifactContext(row: ChildRow): readonly string[] {
    const store = this.deps.artifacts;
    if (!store) return [];
    const blocks: string[] = [];
    const index = siblingIndexBlock(store.hydrate().records);
    if (index.text !== '') blocks.push(index.text);
    const references = this.attached.get(row.task_id) ?? [];
    let full: ReturnType<typeof fullContextBlock> | null = null;
    if (references.length > 0) {
      const resolved: AttachedResolution[] = references.map((reference) => {
        const record = store.lookup(reference);
        if (!record) return { reference, record: null, body: null, failure: 'the reference names no artifact in this session' };
        const body = store.body(record.id);
        return body.ok ? { reference, record, body: body.value.text, failure: null } : { reference, record, body: null, failure: body.error.reason };
      });
      full = fullContextBlock(resolved);
      if (full.text !== '') blocks.push(full.text);
    }
    if (blocks.length > 0) {
      this.deps.writer.appendTimeline('context_selection', 'rotaris', `${row.canonical_name} was given ${index.included} sibling artifact(s)${full ? ` and ${full.included} attached artifact(s)` : ''}.`, {
        task_id: row.task_id, canonical_name: row.canonical_name,
        sibling_index_included: index.included, sibling_index_elided: index.elided,
        attached_included: full?.included ?? 0, attached_elided: full?.elided ?? [], attached_unresolved: full?.unresolved ?? [],
      });
    }
    return blocks;
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
