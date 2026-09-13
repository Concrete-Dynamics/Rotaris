import { Budget, millis, toIsoUtc, type Clocks, type MachineId, type Millis, type SessionId, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { SessionRow } from '@rotaris/store';
import { DEFAULT_CONTEXT_CAPACITY, isAnswerOnly, type ApprovalOption, type PermissionPreset, type QuestionAnswers, type QuestionPrompt } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ContentPart, ModelError, ModelRef, ThinkingLevel, TurnReport } from '@rotaris/model';
import type { EventBus } from './event-bus.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { Committed, SessionWriter } from '../session-writer.js';
import { Aggregates } from './aggregates.js';
import { classifyStop, statusForResult, stopCondition, summarise, type StopReason, type TerminalResult } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { Todo, type TodoDocument } from './todo.js';
import { runTurn, type ToolPort } from './turn.js';
import { IterationChildren } from '../children/orchestration.js';
import type { DelegationOps } from '../children/delegation.js';
import type { Budget as ChildBudget } from '../children/ledger.js';
import type { SummariserDeps } from '../children/report.js';
import type { HookPort, RunNotice } from '../hooks-port.js';
import type { CheckpointPort } from '../checkpoint-port.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { NO_PREFLIGHT_INTENT, type Preflight } from '../preflight.js';
import { clampBudget } from '../children/ledger.js';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { LoopSupervisor } from './supervisor.js';
import type { Persona, PersonaResolver } from '../children/personas.js';
import { agentCell, type AgentResilienceCell, type TurnResilience } from './ladder.js';
import { pairKey, providerIdentity, ResilienceMemory, sameRef, withSettings, type CatalogueEntry, type ModelChoice } from './resilience.js';
import { WaitRegistry, type WaitState } from './waits.js';
import type { ResolvedTrigger, TurnCompression } from './compression.js';
import { ConversationRegistry, type ManualCompressionReport } from './conversations.js'; // Part AO
import { randomUUID } from 'node:crypto';
import { decodeStoredTodo, editAgentTodo, encodeStoredTodo, isAgentTodoDocument, type AgentTodoDocument } from '../todo-view.js';

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
  /** REQ-ORCH-092: `auto_retries_validation`, default 0. */
  readonly validationRetries: number;
  /** REQ-CONFIG-114 / REQ-ORCH-090: `llm_response_timeout`, default 120 s, floored at 30 s by configuration. */
  readonly llmResponseTimeoutMs: number;
  /** REQ-ORCH-077: default 3. */
  readonly consecutiveRetryLimit: number;
  /** A final belt behind the loop supervisor (REQ-ORCH-099..107). */
  readonly maxStepsPerTurn: number;
  /** ADR-0030: each call resolves the credential of the model it goes to (per-model leases, REQ-PROVIDER-066). */
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
}

export const RUN_CONFIG_DEFAULTS: Omit<RunConfig, 'model' | 'credentialFor'> = {
  persona: 'orchestrator',
  systemPrompt: 'You are the orchestrator. Carry out the task you are given and answer plainly.',
  thinking: 'unset',
  modelTimeoutMs: 120_000,
  modelRetries: 5,
  iterationLimit: 20,
  timeLimitMs: null,
  transientRetries: 1,
  validationRetries: 0,
  llmResponseTimeoutMs: 120_000,
  consecutiveRetryLimit: 3,
  maxStepsPerTurn: 100,
};

/**
 * Part AH (ADR-0060) — what a run needs so any of its agents can compress its own context. The trigger is
 * resolved by the CONFIGURATION for the model the agent calls (`compressionTrigger`, REQ-CONFIG-134), so the
 * capacity ladder has one implementation and the engine never holds a second copy of REQ-MONITOR-080's figures.
 */
export interface RunCompression {
  readonly backend: AgentBackend;
  readonly timers: Timers;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  /** REQ-MONITOR-080: `compressor.model` when configured; null means the agent's own model, reachable by construction. */
  readonly model: { readonly model: ModelRef; readonly thinking: ThinkingLevel } | null;
  /** REQ-CONFIG-132: `compressor.timeout_seconds`, default 120 s. */
  readonly timeoutMs: Millis;
  readonly charsPerToken: number;
  readonly preserveRecentTurns: number;
  readonly triggerFor: (model: ModelRef) => ResolvedTrigger;
}

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
  /** Secret-free configuration captured for this run's launch audit (REQ-SESSION-138). */
  readonly configurationSnapshot?: Readonly<Record<string, unknown>> | undefined;
  readonly sessionId: SessionId;
  /** The base workspace — the record's anchor, named in the launch audit and the timeline (REQ-GIT-019). */
  readonly workspaceRoot: string;
  /** REQ-GIT-019/022: the root the work happens in — the worktree of an isolated run; absent means the base. */
  readonly effectiveRoot?: string | undefined;
  readonly task: string;
  /** REQ-CHAT-171: first-turn content, text followed by the ordered image parts. */
  readonly taskContent?: readonly ContentPart[] | undefined;
  readonly taskId: string;
  readonly taskLabel?: string | undefined;
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
  /** Part Y (REQ-ORCH-149): the session artifact store, shared across iterations; absent means no artifacts exist. */
  readonly artifacts?: ArtifactStore | undefined;
  readonly budget?: ChildBudget | undefined;
  readonly modelCap?: ((modelKey: string) => number | null) | undefined;
  readonly summariser?: SummariserDeps | null | undefined;
  /** Part AH (ADR-0060): what an agent needs to compress its own context; null or absent means neither trigger fires. */
  readonly compression?: RunCompression | null | undefined;
  readonly childTimeoutMs?: Millis | undefined;
  /** REQ-ORCH-080: default 120 s; 0 disables. */
  readonly drainTimeoutMs?: Millis | undefined;
  readonly permission: PermissionPosture;
  /** ADR-0015: the session's hooks; null or absent means none exist and nothing about hooks is observable (REQ-HOOKS-041). */
  readonly hooks?: HookPort | null | undefined;
  /** The host's notice channel (REQ-HOOKS-054/086/087). */
  readonly notice?: ((n: RunNotice) => void) | undefined;
  /** ADR-0039 / REQ-GIT-024/051: the session's checkpoint port; null or absent means no capture at any iteration close. */
  readonly checkpoints?: CheckpointPort | null | undefined;
  /** REQ-ORCH-005: classify, grant, resolve the playbooks — before the coordinator exists. Absent: the fallback intent, no playbook. */
  readonly preflight?: ((signal: AbortSignal) => Promise<Preflight>) | undefined;
  readonly pid: number;
  readonly host: MachineId;
  readonly readSession: () => SessionRow | undefined;
  readonly warn: (message: string) => void;
  /** After every save's commit, off the path (REQ-SESSION-028's one file). */
  readonly onSaved?: (generation: number) => void;
  readonly supervisorFor?: ((conversationId: string) => LoopSupervisor) | undefined;
  readonly resumeTodo?: TodoDocument | undefined;
  readonly continuation?: boolean | undefined;
  /** ADR-0036: the configured personas over the built-in table. */
  readonly personas?: PersonaResolver | undefined;
  /** REQ-ORCH-084: the message limit in force for the session; null = disabled. */
  readonly messageLimit?: number | null | undefined;
  /** REQ-ORCH-085: the host told the run paused at the limit, with the count and the limit. */
  readonly onPaused?: ((info: { count: number; limit: number | null; tokens: { input: number; output: number } }) => void) | undefined;
  /**
   * REQ-ORCH-152/153/154 (ADR-0062): the plan gate as a LAUNCH input. Present means this segment is a plan cycle
   * IF the classified intent is outside REQ-ORCH-021's answer group — the run settles that itself, after the
   * pre-flight and before anything a gate would withhold. Absent means `auto` mode, an answer-group run whose
   * caller already knows it, or a run whose approval has released execution: in all three no gate can hold.
   * `cycle` is the number this segment would open (1 upwards); `changes` is what the user stated when they chose
   * revise into it, '' on the first cycle. `withholds` is the registry predicate the child-admission check reads
   * (REQ-ORCH-153), injected because the tool declarations live outside the engine.
   */
  readonly plan?: { readonly cycle: number; readonly changes: string; readonly withholds: (tool: string) => boolean } | undefined;
  /** REQ-MONITOR-142 / REQ-ORCH-091 (d): a `models:` key resolved for a mid-run switch, or why it cannot be applied. */
  readonly models?: ((key: string) => ModelLookup) | undefined;
  /** Part Q: the session-wide memory, the catalogue the candidate rule reads, the run-level fallback slot. Absent: fresh memory, no candidate, no fallback. */
  readonly resilience?: RunResilience | undefined;
}

/** REQ-ORCH-091 (d): a change-model choice resolves to a model, or to the reason it cannot be applied (the user is told). */
export type ModelLookup = { readonly ok: true; readonly key: string; readonly choice: ModelChoice } | { readonly ok: false; readonly reason: string };

export interface RunResilience {
  readonly memory: ResilienceMemory;
  readonly catalogue: readonly CatalogueEntry[];
  /** REQ-CONFIG-065/067: the run-level `fallback_model` slot — the fallback of a role that states none of its own. */
  readonly fallbackModel: ModelChoice | null;
}

export interface SteeringSubmission {
  readonly id: string;
  readonly agentId: string;
  readonly text: string;
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
  /**
   * REQ-EVENTS-088 (OQ-42): present for the in-memory outcome when terminal persistence could not be confirmed,
   * and absent otherwise. It is snake-cased like every other field here because this value crosses the process
   * boundary as it stands (ADR-0044's `run.result`): a caller must be able to READ the uncertainty rather than
   * recognise a sentence, which is what "caller outcomes disclose that uncertainty" asks for.
   */
  readonly persistence?: { readonly confirmed: false; readonly last_event_ordinal: number };
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
  private initialIterations = 0;
  private lastFailure: string | null = null;
  private todo: Todo;
  /** REQ-CHAT-088: the root agent's tool-owned plan, kept alongside the loop planner in one stored envelope. */
  private agentTodo: AgentTodoDocument | null;
  private aggregates: Aggregates;
  /** REQ-MONITOR-166: the token history, sampled every 10 s while live and once at the end; 120 kept, persisted with the session. */
  private tokenSamples: [string, number][];
  private sampler: TimerHandle | null = null;
  private result: RunResult | null = null;
  /**
   * OQ-8 (REQ-EVENTS-053): the cumulative totals the last `usage.update` carried, so identical totals are not
   * re-emitted. Seeded from the rehydrated aggregates, so a request that reports nothing raises nothing and a
   * resumed run does not republish the totals it opened with.
   */
  private lastUsageEmitted: string;
  private recordingFailure: { reason: string; lastEventOrdinal: number } | null = null;
  private readonly unsubscribeRecordingFailure: () => void;
  private readonly dispatched = new Map<string, string>();
  private children: IterationChildren | null = null;
  /** REQ-ORCH-072: the root agent's own child identity for this iteration. */
  private rootId = 'root';
  /** Every tool port this run created — the root's and each child's — so an answer, a cancel or a mode change reaches all of them (REQ-TOOLS-030). */
  private readonly ports = new Set<ToolPort>();
  /** REQ-HOOKS-087: the session's hook attachment, removed at the end of the run. */
  private hooks: HookPort | null;
  private preflight: Preflight | null = null;
  /** REQ-MONITOR-123: a graceful pause requested; honoured at the next model step and at the iteration boundary. */
  private pauseRequested = false;
  private pausedAtLimit: { count: number; limit: number | null } | null = null;
  /**
   * REQ-ORCH-153: whether this run is held at the plan gate. Settled once, after the pre-flight and before the
   * first thing the gate withholds; never cleared in place, because approval releases execution by launching the
   * next segment (ADR-0062) rather than by flipping a flag under a running turn.
   */
  private planHeld = false;
  /** REQ-MONITOR-133/134: pending steering per conversation (`root` for the entry role, the task id for a child). */
  private readonly steering = new Map<string, { id: string; text: string }[]>();
  /** REQ-MONITOR-142: the entry model/reasoning switched mid-run; applied from the next iteration. */
  private entryOverride: { model?: ModelRef; thinking?: ThinkingLevel } = {};
  /** Part Q: the waits parked on a provider limit (REQ-NOTIFY-263 reads `current()`), the memory, the catalogue. */
  private readonly waits: WaitRegistry;
  private readonly memory: ResilienceMemory;
  private readonly catalogue: readonly CatalogueEntry[];
  /** The root agent's ladder state for this run (one same-tier fallback, one role fallback — REQ-ORCH-091 b / REQ-ORCH-144). */
  private rootCell: AgentResilienceCell | null = null;
  /**
   * REQ-MONITOR-085 (Part AH): the agents whose context is being compressed right now, by name, with the instant each
   * began. Part AO made this a map: a manual pass compresses every live conversation CONCURRENTLY (REQ-MONITOR-092),
   * and one agent name with one instant could not say so — the record's field names them all, comma-joined, from the
   * earliest start.
   */
  private readonly compressing = new Map<string, string>();
  // Part AO
  /** ADR-0060 decision 1's registry (Part AO): every conversation live in this run, for the `forceCompression` arm. */
  readonly conversations = new ConversationRegistry();
  private appliedEntryModel: ModelRef | null = null;

  constructor(private readonly deps: RunDeps) {
    this.sessionId = deps.sessionId;
    this.hooks = deps.hooks ?? null;
    this.memory = deps.resilience?.memory ?? new ResilienceMemory();
    this.catalogue = deps.resilience?.catalogue ?? [];
    this.waits = new WaitRegistry({ clocks: deps.clocks, onChange: () => this.publishWait() });
    const stored = deps.readSession();
    this.agentTodo = decodeStoredTodo(stored?.todo ?? null).agent;
    this.todo = deps.resumeTodo ? Todo.fromDocument(deps.resumeTodo, deps.config.consecutiveRetryLimit) : Todo.fresh(deps.taskId, deps.taskLabel ?? deps.task, deps.config.consecutiveRetryLimit);
    if (deps.resumeTodo) this.todo.appendTask('Continued Prompts', deps.taskId, deps.taskLabel ?? deps.task);
    this.aggregates = Aggregates.rehydrate(stored);
    this.lastUsageEmitted = usageTotals(this.aggregates.usagePayload());
    this.tokenSamples = parseTokenSamples(stored?.token_samples ?? '[]');
    this.iterationsCompleted = stored?.iterations_completed ?? 0;
    this.initialIterations = this.iterationsCompleted;
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
    this.unsubscribeRecordingFailure = deps.writer.onFailed((reason, lastEventOrdinal) => {
      this.recordingFailure = { reason, lastEventOrdinal };
      this.lastFailure = `Durable recording failed: ${reason}`;
      this.stop.request('agent_session_aborted');
      this.deps.owner.freezeAtDurableBoundary();
      this.deps.notice?.({
        severity: 'error', headline: 'Run recording failed; completion is unconfirmed',
        detail: `In-memory status: cancellation requested. Last durable event ordinal: ${lastEventOrdinal}. ${reason}. Restore writable storage, then reopen the session to inspect its saved boundary before continuing.`,
        /**
         * OQ-42: the recovery is an ACTION and not only a sentence. Reopening the session is the product's own
         * recovery path — it waits for every affected run to settle, runs the rolled-back write probe, and
         * rebuilds this session's writer and projection (`Sessions.resume`) — so the notice offers exactly that,
         * against exactly this session. The identifier is REQ-NOTIFY-223's; main maps it to the member of
         * REQ-NOTIFY-044's closed vocabulary that focuses a named session, and adds nothing to that vocabulary.
         */
        action: 'session.reopen',
        sessionId: this.sessionId, key: `recording-failure:${this.sessionId}`,
      });
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
  /**
   * REQ-ORCH-153: the one live read of the hold, for the three places that enforce it — the tool port's narrowing,
   * the gate's dispatch check and child admission. Read through a closure rather than copied, so a port built
   * before the answer can never keep refusing after it.
   */
  get isPlanGateHeld(): boolean {
    return this.planHeld;
  }
  /** REQ-NOTIFY-263: the wait the record carries; null while no agent is parked on a provider limit. */
  get currentWait(): WaitState | null {
    return this.waits.current();
  }
  /**
   * REQ-MONITOR-085 (Part AH): the compression in flight, published with the snapshot exactly as `wait` is —
   * derived from the live run and mirrored by no column, so a process that died holds none.
   */
  get currentCompression(): { readonly agent: string; readonly startedAt: string } | null {
    if (this.compressing.size === 0) return null;
    const startedAt = [...this.compressing.values()].sort()[0]!;
    return { agent: [...this.compressing.keys()].join(', '), startedAt };
  }

  // Part AO
  /**
   * REQ-CHAT-080/081, REQ-MONITOR-090..096 (Part AO): the manual pass — every live conversation, concurrently,
   * settling once all have, unconditionally. `null` is REQ-MONITOR-091's refusal: no agent conversation is active,
   * which is also what a run whose configuration offers no compressor reports (no turn could register). The run's
   * own abort signal bounds it, so a cancel during the pass ends it as it ends any model call.
   */
  async forceCompression(): Promise<ManualCompressionReport | null> {
    if (this.ended || this.conversations.size === 0) return null;
    return this.conversations.compressAll(this.abort.signal);
  }
  /**
   * REQ-MONITOR-089 (Part AH): the entry role's newest prompt-token reading and the limit it is measured
   * against. The entry role has no `children` row, so `toAgentRecord` never projects it and the surface's
   * synthetic root agent had nothing to read; the tracker has held the figure since Part R.
   */
  get entryContext(): { readonly used: number; readonly limit: number } {
    const model = this.entryOverride.model ?? this.deps.config.model;
    const advertised = this.deps.compression?.triggerFor(model).advertisedInputLimit ?? null;
    return { used: this.deps.writer.activity.contextUsed(this.deps.config.persona), limit: advertised !== null && advertised > 0 ? advertised : DEFAULT_CONTEXT_CAPACITY };
  }
  /** REQ-MONITOR-048 (Part R): the persona's configured thinking level as this run resolved it; null when the persona is unknown or states none. */
  reasoningFor(persona: string): string | null {
    const resolved = this.deps.personas?.resolve(persona) ?? null;
    const level = resolved?.persona.thinking ?? null;
    return level === null || level === 'unset' ? null : level;
  }

  /**
   * The wait began, changed or ended: the session's status follows (`waiting` while parked — REQ-SESSION-073's
   * own arm, presented as `running`, REQ-NOTIFY-049/263) and the save publishes the snapshot with the wait state.
   */
  private publishWait(): void {
    if (this.ended) return;
    this.saveRunning({}, this.waits.size > 0 ? 'waiting' : 'running');
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
      // REQ-ORCH-005: the intent is in effect before the first iteration; while it is being decided the session reads `classifying`.
      if (this.deps.preflight) {
        try { this.preflight = await this.deps.preflight(this.abort.signal); } catch (cause) { this.deps.warn(`the pre-flight raised and the run continues on the fallback intent: ${String(cause)}`); }
      }
      if (this.deps.continuation) {
        const intent = this.preflight?.intent ?? NO_PREFLIGHT_INTENT;
        writer.appendRow('system', `Intent classified: ${intent.category}${intent.carried_over ? ' (continued from previous run)' : ''}`, true);
      }
      /*
       * REQ-ORCH-153: the hold is settled HERE — after the pre-flight, so the answer group is known, and ahead of
       * everything the gate withholds: the tool ports the first turn builds, the first hook command (`session_start`
       * below) and any child. "Where the classified intent is not a member of the answer group of REQ-ORCH-021" is
       * the one exemption; a run with no pre-flight falls back to `moderate_feature`, which is outside it, so a
       * plan-mode run with no classifier still holds rather than silently proceeding.
       */
      this.planHeld = this.deps.plan !== undefined && !isAnswerOnly((this.preflight?.intent ?? NO_PREFLIGHT_INTENT).category);
      if (this.stop.requested) return await this.teardown(this.stop.reason ?? 'user_cancelled');
      const auditPayload = {
        session_id: this.sessionId, workspace_root: this.deps.workspaceRoot, created_at: this.deps.readSession()?.created_at ?? null,
        run_intent: this.preflight?.intent ?? NO_PREFLIGHT_INTENT, intent_grant: this.preflight?.grant ?? 'none',
        permission_mode: this.deps.permission.effective, check_suite: null, resolved_playbooks: this.preflight?.resolvedPlaybooks ?? {}, hooks: this.hooks?.auditSnapshot() ?? [], config_snapshot: this.deps.configurationSnapshot ?? {},
      };
      if (this.deps.continuation) writer.appendTimeline('run_continuation_intent', 'rotaris', `Continuation intent: ${auditPayload.run_intent.category}.`, auditPayload);
      else {
        const audit = writer.recordLaunchAudit(auditPayload);
        if (audit.ok && !audit.value) this.deps.warn(`launch audit for ${this.sessionId} already existed and was not rewritten (REQ-SESSION-138)`);
      }
      writer.appendTimeline('run_start', 'rotaris', `A run is starting for session ${this.sessionId}.`, { workspace_root: this.deps.workspaceRoot });
      // ADR-0015 / REQ-HOOKS-085/086/127: the trust outcome announced once, ahead of the first hook-related event.
      if (this.hooks) {
        const trust = this.hooks.trust();
        if (trust.loadWarning !== '') this.deps.warn(trust.loadWarning);
        this.hooks.announceWithheld();
        if (trust.withheld > 0) {
          writer.recordIssue({ kind: 'hook_trust', severity: 'warning', actor: 'hooks', message: trust.notice, metadata: { blocked: trust.withheld, restored: trust.reinstated, workspace: trust.workspace } });
          this.deps.notice?.({ severity: 'warning', headline: 'Workspace hooks need review', detail: trust.notice, action: 'hooks.review', key: `hooks.review:${trust.workspace}:${trust.fingerprint}`, sessionId: this.sessionId });
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
      // REQ-MONITOR-166: sampled by the run, not by a view — the cadence from the clock port, never a bare timer.
      this.sampler = clocks.timers.every(TOKEN_SAMPLE_PERIOD, () => this.sampleTokens(true));
      await this.drain();
      // REQ-HOOKS-003/081: session_start once, ahead of the first iteration, in line with the loop (REQ-HOOKS-080).
      if (this.hooks) await this.hooks.fireLifecycle('session_start', { task: this.deps.task });

      // REQ-ORCH-153: a held run produces its plan and parks; it never enters the iteration loop, so it selects no
      // task, judges no completion and runs no check suite — the prohibition is structural rather than a branch.
      if (this.planHeld) return await this.parkAtPlanGate();

      // REQ-ORCH-069: stop conditions between iterations, first match wins; the stop request wins over all.
      for (;;) {
        if (this.stop.requested) { stopReason = this.stop.reason ?? 'user_cancelled'; break; }
        if (this.pauseRequested) { stopReason = 'user_cancelled'; break; }
        // REQ-CHAT-040: every QUEUED prompt becomes a task before completion is judged, so a run never reports done while prompts wait.
        this.consumeQueued();
        stopReason = stopCondition({
          allTasksComplete: this.todo.allTasksComplete, pendingTasks: this.todo.pendingCount,
          iterationsCompleted: this.iterationsCompleted - this.initialIterations, iterationLimit: config.iterationLimit,
          elapsedMs: clocks.monotonic.now() - (this.startedAt ?? clocks.monotonic.now()), timeLimitMs: config.timeLimitMs,
        });
        if (stopReason) break;
        const escalated = await this.iterate();
        if (escalated) { stopReason = 'agent_session_aborted'; break; }
        // REQ-ORCH-085/087: the limit in force is checked at the boundary; the pause is recorded durably before the loop stops.
        const limit = this.deps.messageLimit ?? null;
        if (limit !== null && this.iterationsCompleted >= limit && !this.stop.requested) return await this.pauseAtLimit(limit);
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
      const modelTask = this.deps.continuation && task.id === this.deps.taskId ? this.deps.task : task.text;
      const report = await this.turnWithRetry(modelTask);
      summary = report.text.slice(0, 200);
      if (this.stop.requested) {
        // REQ-ORCH-135: an iteration cancelled mid-run closes as cancelled; the task stays anchored.
        outcome = 'cancelled';
        task.state = 'pending';
        summary = 'the run was cancelled before the agent finished';
      } else if (this.pauseRequested) {
        // REQ-MONITOR-123: the current step finished; the task stays pending for the continuation.
        outcome = 'cancelled';
        task.state = 'pending';
        summary = 'the run paused at the user\'s request before the agent finished';
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
    // ADR-0039 / REQ-GIT-051: exactly one capture per iteration that closes, at the moment it closes — after
    // `iteration.end` is recorded and BEFORE the hooks' `iteration_end`: the checkpoint records the iteration's work as
    // the agent left it, and a hook that later carries the checkpoint (REQ-HOOKS-082 with checkpoints, owed) can only
    // do so if the capture precedes it. Awaited, so it finishes before the next iteration and before teardown.
    if (this.deps.checkpoints?.enabled) {
      try {
        const r = await this.deps.checkpoints.capture({ iteration, childName: this.creditedChild() });
        if (r.outcome === 'failed') this.deps.warn(`checkpoint after iteration ${iteration} was not recorded: ${r.detail}`);
      } catch (cause) {
        // REQ-GIT-045: never raises, never aborts the run — the port promises that; this is the belt behind it.
        this.deps.warn(`the checkpoint port raised after iteration ${iteration}: ${String(cause)}`);
      }
    }
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

  /**
   * REQ-ORCH-092 / REQ-ORCH-091: every retry — transient, validation, the limit ladder, the unresponsive fallback —
   * happens at the model STEP inside the turn (`ladder.ts`), so a retried call never replays a tool call the turn
   * already executed. (First execution of Part Q: the turn-level transient retry this method used to be would have
   * re-run executed tool calls with fresh ids; the reason is kept in ADR-0027's note.)
   */
  private async turnWithRetry(task: string): Promise<TurnReport> {
    return this.turn(task);
  }

  /** REQ-ORCH-088/090/144, REQ-CONFIG-065/067/110: the role's own `fallback_model`, else the run-level slot; never the agent's own model. */
  private fallbackFor(persona: Persona | undefined, current: ModelChoice): ModelChoice | null {
    const own = persona?.fallbackModel ? { model: persona.fallbackModel, thinking: persona.fallbackThinking ?? 'unset' as ThinkingLevel } : null;
    const chosen = own ?? this.deps.resilience?.fallbackModel ?? null;
    if (!chosen || sameRef(chosen.model, current.model)) return null;
    return withSettings(this.catalogue, chosen);
  }

  /**
   * Part AH (ADR-0060): the per-agent compression services. The trigger is resolved for the model THIS agent
   * calls, so a child on a small model compresses at its own capacity and not the run's (REQ-MONITOR-078).
   * `onState` is REQ-MONITOR-085's visible status, published with the session snapshot like `wait`.
   */
  private readonly compressionFor = (choice: ModelChoice, todoLines: () => readonly string[]): TurnCompression | undefined => {
    const c = this.deps.compression;
    if (!c) return undefined;
    const chosen = c.model ?? { model: choice.model, thinking: choice.thinking };
    return {
      compressor: { backend: c.backend, model: chosen.model, thinking: chosen.thinking, timers: c.timers, credentialFor: c.credentialFor, timeoutMs: c.timeoutMs },
      trigger: c.triggerFor(choice.model), charsPerToken: c.charsPerToken, preserveRecentTurns: c.preserveRecentTurns, todoLines,
      // Part AO: every turn of this run — the root's and each child's — registers its conversation for the manual pass.
      registry: this.conversations,
      /**
       * REQ-MONITOR-085: the status must be VISIBLE while the pass runs. A field derived from the live run is
       * only as visible as the next publication, and a compressing pass writes nothing for as long as it lasts —
       * so the change is published here rather than waiting for a commit that will not come until it is over.
       */
      onState: (agent, name) => {
        // Part AO: the map holds every agent compressing at once; the null edge names the agent it clears.
        if (agent === null) this.compressing.delete(name);
        else this.compressing.set(agent, toIsoUtc(this.deps.clocks.wall.instant()));
        this.deps.owner.reconcile();
      },
      /**
       * REQ-SESSION-139 (ADR-0008): the run's compression aggregate, maintained in process and copied into every
       * save like the other three. Every agent's compressor — the root's and each child's — reaches the one
       * `Aggregates`, because REQ-SESSION-139's figure is the SESSION's and not an agent's.
       */
      onCompressed: () => this.aggregates.addCompression(),
    };
  };

  /**
   * OQ-8 (REQ-EVENTS-053): the emission trigger. One `usage.update` per COMPLETED provider request that
   * contributes new usage — the successful ones and the failed or partial ones the ladder retried past, whose
   * reported tokens are spent whatever became of the response. Identical cumulative totals are skipped, so a
   * request the provider reported no figures for raises nothing. REQ-MONITOR-166's sparkline sampling is a
   * separate cadence and is not driven from here; REQ-SESSION-094's terminal `session.end` carries the final
   * cumulative totals whether or not the last request moved them.
   *
   * The falsified reading, kept beside its replacement: this was one event per ITERATION, computed from the
   * turn's returned report. That report carries only the usage of the attempts that survived — `resilientStep`
   * discards the report of every attempt it retries past, and `runWithChildren` returns the LAST parent turn —
   * so a run that retried a transient failure or resumed its parent spent tokens the session's own totals never
   * counted.
   */
  private readonly onRequestUsage = (u: { readonly input: number; readonly output: number }): void => {
    this.aggregates.addTurnUsage(u);
    const payload = this.aggregates.usagePayload();
    const totals = usageTotals(payload);
    if (totals === this.lastUsageEmitted) return;
    this.lastUsageEmitted = totals;
    this.deps.writer.recordEvent('usage.update', payload, this.iterationsCompleted + 1);
  };

  /** REQ-MONITOR-084 (4): the run-level plan as lines, for the entry agent's own compression. */
  private plannerTodoLines(): readonly string[] {
    return this.todo.toDocument().phases.flatMap((phase) => phase.tasks.map((task) => `[${task.state}] ${phase.name} — ${task.text}`));
  }

  /** The per-agent ladder deps shared by the root and every child (the cell is the agent's own). */
  private resilienceFor(cell: AgentResilienceCell, unresponsiveBoundMs: number): TurnResilience {
    const { config } = this.deps;
    return { cell, memory: this.memory, catalogue: this.catalogue, waits: this.waits, transientRetries: config.transientRetries, validationRetries: config.validationRetries, llmResponseTimeoutMs: config.llmResponseTimeoutMs, unresponsiveBoundMs };
  }

  /** The root's cell lives for the run; the entry model (and a mid-run switch of it) enters through the session memory. */
  private rootResilience(): TurnResilience {
    const { config } = this.deps;
    const entryModel = this.entryOverride.model ?? config.model;
    if (this.rootCell === null || this.appliedEntryModel === null || !sameRef(this.appliedEntryModel, entryModel)) {
      const base = withSettings(this.catalogue, { model: entryModel, thinking: this.entryOverride.thinking ?? config.thinking });
      const current = this.memory.effective(base, this.catalogue);
      const persona = this.deps.personas?.resolve(config.persona)?.persona;
      const previous = this.rootCell;
      this.rootCell = agentCell(current, this.fallbackFor(persona, current));
      if (previous) { this.rootCell.fallbackAttempted = previous.fallbackAttempted; this.rootCell.sameTierAttempted = previous.sameTierAttempted; for (const p of previous.attempted) this.rootCell.attempted.add(p); }
      this.appliedEntryModel = entryModel;
    }
    return this.resilienceFor(this.rootCell, config.modelTimeoutMs);
  }

  /**
   * One turn: the tool loop of `turn.ts`, every model step streamed into its own `agent` row; with children, the
   * resume loop. `iterationOverride` is the plan cycle's 0 (ADR-0062): a plan cycle is NOT an iteration
   * (REQ-ORCH-153's owner ruling), so it numbers itself 0 and leaves `root:1` upwards to the execution segment —
   * `isEntryPort` reads `root:0` as the entry by depth and by spelling alike.
   */
  private async turn(task: string, iterationOverride?: number): Promise<TurnReport> {
    const { writer, owner, backend, config } = this.deps;
    const iteration = iterationOverride ?? this.iterationsCompleted + 1;
    this.rootId = `root:${iteration}`;
    const children = this.deps.toolsFor && this.deps.dal
      ? new IterationChildren({
        // REQ-GIT-019: the children are told the root they work in — the worktree for an isolated run.
        sessionId: this.sessionId, workspaceRoot: this.deps.effectiveRoot ?? this.deps.workspaceRoot, dal: this.deps.dal, writer, owner, backend, clocks: this.deps.clocks, model: config.model, thinking: config.thinking,
        modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries, credentialFor: config.credentialFor, maxStepsPerTurn: config.maxStepsPerTurn,
        // Part Q: each child gets its own cell over the shared memory, catalogue and wait registry.
        resilience: { forChild: (persona, current, bound) => { const effective = this.memory.effective(withSettings(this.catalogue, current), this.catalogue); return this.resilienceFor(agentCell(effective, this.fallbackFor(persona, effective)), bound); } },
        // Part AH (ADR-0060): each child compresses against its own model's capacity, with its own task plan.
        compressionFor: this.compressionFor,
        // REQ-ORCH-024: the BUDGET cell only narrows; with no pre-flight the configured policy stands unchanged.
        budget: clampBudget(this.deps.budget ?? { maxDepth: 3, maxTotal: 20, maxActive: 6 }, this.preflight?.budgetCell ?? null), modelCap: this.deps.modelCap ?? (() => null), toolsFor: this.portFor,
        // REQ-MONITOR-102: a child's tool calls are the session's too; the entry agent's own are added at the turn below.
        countToolCalls: (n) => this.aggregates.addToolCalls(n),
        summariser: this.deps.summariser ?? null, hooks: this.hooks, playbookFor: this.preflight?.playbookFor ?? null, route: this.preflight?.route ?? 'work', ...(this.deps.childTimeoutMs === undefined ? {} : { childTimeoutMs: this.deps.childTimeoutMs }), runSignal: this.abort.signal, warn: this.deps.warn,
        ...(this.deps.supervisorFor ? { supervisorFor: this.deps.supervisorFor } : {}),
        ...(this.deps.personas ? { personas: this.deps.personas } : {}),
        steeringFor: (id: string) => this.steeringFor(id), shouldPause: () => this.pauseRequested,
        // Part Y (REQ-LIBRARY-092/097/098): the session artifact store — child reports materialise into it and its
        // two context blocks reach every child the iteration launches.
        ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
        // REQ-ORCH-153: the live hold and the registry predicate, for the child-admission refusal.
        ...(this.deps.plan ? { planGate: { held: () => this.planHeld, withholds: this.deps.plan.withholds } } : {}),
      }, iteration)
      : null;
    this.children = children;
    const tools = children && this.deps.toolsFor ? this.portFor(config.persona, config.persona, children, this.rootId, 0) : this.register(this.deps.tools);
    let initial = true;
    const compression = this.compressionFor(this.rootResilience().cell.model, () => this.plannerTodoLines());
    const turnFn = (text: string, history: readonly ChatMessage[]) => {
      const content = initial ? this.deps.taskContent : undefined;
      const initialCall = initial;
      initial = false;
      return runTurn({
      writer, owner, backend, tools, clocks: this.deps.clocks, persona: config.persona, agentName: config.persona,
      // REQ-ORCH-019: the rendered playbook is part of the instructions the role is given.
      systemPrompt: withPlaybook(config.systemPrompt, this.preflight?.playbookFor(config.persona) ?? ''), model: this.entryOverride.model ?? config.model, thinking: this.entryOverride.thinking ?? config.thinking, modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries,
      credentialFor: config.credentialFor, maxStepsPerTurn: config.maxStepsPerTurn, warn: this.deps.warn, dispatched: this.dispatched,
      ...(this.deps.supervisorFor ? { supervisor: this.deps.supervisorFor(this.rootId) } : {}),
      steering: this.steeringFor('root'), shouldPause: () => this.pauseRequested,
      resilience: this.rootResilience(),
      // Part AH: the entry agent compresses against its own model's capacity, carrying the run-level plan.
      ...(compression ? { compression } : {}),
      // REQ-ORCH-093: after the first call this turn resumes the parent with its children's reports.
      parentResume: !initialCall,
      // OQ-8: the entry agent's provider requests, each counted and published as it completes.
      onRequestUsage: this.onRequestUsage,
      }, text, history, this.abort.signal, content);
    };
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

  /** REQ-MONITOR-133: a steer is pending until its conversation's next step; the id is the control's string value. */
  steer(agentId: string, text: string): string | null {
    if (this.ended || text.trim() === '' || agentId.trim() === '') return null;
    const key = agentId === 'run' || agentId === 'root' || agentId === this.rootId ? 'root' : agentId;
    if (key !== 'root' && !this.children?.ledger.get(key)) return null;
    const id = randomUUID();
    const list = this.steering.get(key) ?? [];
    list.push({ id, text });
    this.steering.set(key, list);
    this.deps.writer.appendTimeline('steering_submitted', 'user', `A steering prompt was submitted for ${key === 'root' ? this.deps.config.persona : key} (${id.slice(0, 8)}).`, { prompt_id: id, agent: key });
    return id;
  }
  private steeringFor(conversationId: string): () => readonly { id: string; text: string }[] {
    const key = conversationId === this.rootId || conversationId === 'run' ? 'root' : conversationId;
    return () => { const list = this.steering.get(key) ?? []; this.steering.delete(key); return list; };
  }

  /** REQ-MONITOR-123/124: graceful, whole-run only; the status reads `pausing` until the current step finishes. */
  pause(): boolean {
    if (this.ended || this.stop.requested || this.pauseRequested) return false;
    this.pauseRequested = true;
    this.deps.writer.save('pausing');
    this.deps.writer.appendTimeline('run_pause_requested', 'user', 'The user asked the run to pause; the current step finishes first.', {});
    return true;
  }
  get isPausedByUser(): boolean {
    return this.pauseRequested;
  }

  /** REQ-CHAT-040: every QUEUED prompt becomes a task in phase "Queued Prompts"; the supervisor sees a user instruction. */
  private consumeQueued(): void {
    const r = this.deps.writer.triggerQueuedPrompts();
    if (!r.ok || r.value.length === 0) return;
    for (const p of r.value) this.todo.appendTask('Queued Prompts', p.prompt_id, p.content);
    this.deps.supervisorFor?.(this.rootId).noteUserInstruction();
    this.saveRunning({});
  }

  /** REQ-CHAT-088/090/091: edits follow the source the visible plan names. */
  editTodo(op: 'add' | 'update' | 'remove', id: string, text: string, source: 'child' | 'agent' | 'planner' = 'planner', ownerId: string | null = null, phaseId = 'main'): { changed: boolean; id?: string } {
    if (this.ended) return { changed: false };
    let result: { changed: boolean; id?: string } = { changed: false };
    if (source === 'planner') {
      const assigned = op === 'add' ? (id || randomUUID().replaceAll('-', '').slice(0, 8)) : id;
      result = this.todo.editTask(op, assigned, text, phaseId) ? { changed: true, ...(op === 'add' ? { id: assigned } : {}) } : { changed: false };
    } else {
      const current = source === 'agent' ? this.agentTodo : this.agentTodoFor(ownerId, false);
      if (current !== null) {
        const edited = editAgentTodo(current, op, id, text, phaseId, () => randomUUID().replaceAll('-', '').slice(0, 8));
        if (edited.changed) {
          result = { changed: true, ...(edited.id === undefined ? {} : { id: edited.id }) };
          if (source === 'agent') this.agentTodo = edited.document;
          else this.storeChildTodo(ownerId, edited.document);
        }
      }
    }
    if (!result.changed) return result;
    this.deps.writer.appendTimeline('todo_edited', 'user', `The user ${op === 'add' ? 'added' : op === 'update' ? 'updated' : 'removed'} todo item ${id}.`, { op, id });
    this.deps.supervisorFor?.(this.rootId).noteUserInstruction();
    this.saveRunning({});
    return result;
  }

  /** The tool port calls these for the exact root or child conversation it belongs to. */
  agentTodoFor(ownerId: string | null, root: boolean): AgentTodoDocument | null {
    if (root) return this.agentTodo;
    if (!ownerId || !this.deps.dal) return null;
    const raw = this.deps.dal.childrenOf(this.sessionId).find((child) => child.task_id === ownerId)?.todo;
    if (!raw) return null;
    try { const value: unknown = JSON.parse(raw); return isAgentTodoDocument(value) ? value : null; } catch { return null; }
  }

  replaceAgentTodo(ownerId: string | null, root: boolean, document: AgentTodoDocument): boolean {
    if (this.ended) return false;
    if (root) this.agentTodo = document;
    else if (!this.storeChildTodo(ownerId, document)) return false;
    this.saveRunning({});
    return true;
  }

  private storeChildTodo(ownerId: string | null, document: AgentTodoDocument): boolean {
    if (!ownerId || !this.deps.dal) return false;
    const child = this.deps.dal.childrenOf(this.sessionId).find((candidate) => candidate.task_id === ownerId);
    if (!child) return false;
    this.deps.dal.setChildTodo(this.sessionId, ownerId, JSON.stringify(document), child.tool_calls);
    return true;
  }

  private todoJson(): string {
    return encodeStoredTodo({ planner: this.todo.toDocument(), agent: this.agentTodo })!;
  }

  /**
   * REQ-MONITOR-142: applies from the next iteration; a system row states the switch. During a wait (REQ-ORCH-091 d,
   * REQ-NOTIFY-089/263) it is the change-model resolution: the parked agent rebuilds and re-runs at once, and the
   * override is persisted (`model_override` timeline entry) so later calls of the session never return to the
   * exhausted pair. A choice that cannot be applied is never discarded silently: `model_override_rejected` is
   * recorded, the wait continues on the model it had, and the header names the reason.
   */
  setEntryModel(key: string): boolean {
    if (this.ended) return false;
    const { writer } = this.deps;
    const waiting = this.waits.current();
    const resolved: ModelLookup = this.deps.models ? this.deps.models(key) : { ok: false, reason: 'this run resolves no model keys' };
    if (!resolved.ok) {
      if (waiting) this.rejectOverride(waiting, key, resolved.reason);
      return false;
    }
    if (waiting) {
      const provider = providerIdentity(this.catalogue, resolved.choice.model);
      if (pairKey(provider, resolved.choice.model.modelId) === pairKey(waiting.provider, waiting.model)) {
        this.rejectOverride(waiting, key, `${key} is the model that is waiting (${waiting.provider}/${waiting.model}); choose a different one`);
        return false;
      }
      const choice = withSettings(this.catalogue, resolved.choice);
      for (const w of this.waits.all()) this.memory.setOverride(w.provider, w.model, { key, choice });
      writer.appendTimeline('model_override', 'user', `The user chose ${key} (${provider}/${choice.model.modelId}) during the wait on ${waiting.provider}/${waiting.model}; it stands for the rest of the session.`, { provider: waiting.provider, model: waiting.model, model_key: key, to_provider: provider, to_model: choice.model.modelId });
      writer.appendRow('system', `Model changed to ${key} during the wait; the run resumes on it now and keeps it for the rest of the session.`, true);
      if (waiting.agent === this.deps.config.persona) this.entryOverride = { ...this.entryOverride, model: choice.model };
      this.waits.resolveWithModel(key, choice);
      return true;
    }
    this.entryOverride = { ...this.entryOverride, model: resolved.choice.model };
    writer.appendRow('system', `Entry model switched to ${key}; it applies from the next iteration.`, true);
    writer.appendTimeline('entry_model_switched', 'user', `The entry model switched to ${key}.`, { model: key });
    return true;
  }
  private rejectOverride(waiting: WaitState, key: string, reason: string): void {
    const message = `The model was not changed: ${key} could not be applied (${reason}). The wait on ${waiting.provider}/${waiting.model} is still outstanding; choose again or cancel the run.`;
    this.deps.writer.recordIssue({ kind: 'model_override_rejected', severity: 'warning', actor: 'user', message, metadata: { requested_model: key, reason, waiting_provider: waiting.provider, waiting_model: waiting.model } });
    this.deps.warn(message);
    this.waits.reject(message);
  }
  setEntryReasoning(level: ThinkingLevel): boolean {
    if (this.ended) return false;
    this.entryOverride = { ...this.entryOverride, thinking: level };
    this.deps.writer.appendRow('system', `Entry reasoning level switched to ${level}; it applies from the next iteration.`, true);
    this.deps.writer.appendTimeline('entry_reasoning_switched', 'user', `The entry reasoning level switched to ${level}.`, { level });
    return true;
  }

  /**
   * REQ-ORCH-085/087: the pause at the limit — recorded durably (status `paused_message_limit`, the count, the limit)
   * before the loop stops, the host told, no terminal result: the session is paused, not ended. Every binding goes.
   */
  private async pauseAtLimit(limit: number): Promise<RunResult> {
    const { writer, owner, bus } = this.deps;
    const count = this.iterationsCompleted;
    this.pausedAtLimit = { count, limit };
    writer.appendRow('system', `Paused: ${count} message${count === 1 ? '' : 's'} reached the limit of ${limit}. Continue, double the limit, or cancel the run.`, true);
    this.sampler?.cancel();
    this.sampleTokens(false);
    writer.pauseAtLimit(count, limit, { ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), iterations_completed: count, todo: this.todoJson(), progress: JSON.stringify(this.progress()) });
    if (writer.failed) return this.teardown('agent_session_aborted');
    owner.flushPending();
    try { await this.drain(); } catch (cause) { this.deps.warn(`forwarding the pause failed on ${this.sessionId}: ${String(cause)}`); }
    const usage = this.aggregates.usagePayload();
    this.deps.onPaused?.({ count, limit, tokens: usage.tokens });
    if (this.hooks) { try { await this.hooks.fireLifecycle('session_end', { status: 'interrupted' }); } catch { /* recorded elsewhere */ } this.hooks = null; }
    bus.detachSession(this.sessionId);
    this.unsubscribeRecordingFailure();
    this.ended = true;
    const result: RunResult = {
      status: 'interrupted', session_id: this.sessionId, stop_reason: 'message_limit_reached', summary: `The run paused at the message limit (${count} of ${limit}).`,
      iterations_completed: count, report: null, tokens: usage.tokens, cost: usage.cost, error: null, execution_status: 'paused_message_limit', severity: 'warning',
    };
    this.result = result;
    return result;
  }
  get pausedAtMessageLimit(): { count: number; limit: number | null } | null {
    return this.pausedAtLimit;
  }

  /**
   * REQ-ORCH-153/154 (ADR-0062): one plan cycle, then the park.
   *
   * The cycle is ONE turn of the entry role under planning grants, taken through the ordinary turn path so the
   * role holds the surface it would otherwise hold less what the gate withholds — the root execution record is
   * therefore "created with the entry role exactly as REQ-ORCH-072 requires" rather than by a second code path
   * that would drift from it. The report's text IS the plan: no separate tool announces one, because the public
   * tool-name vocabulary is closed (REQ-TOOLS-002) and the requirement asks for the text the producing role
   * wrote, verbatim.
   *
   * The park mirrors `pauseAtLimit` above, and for the same reason: the hold "is not a termination — it MUST
   * raise no terminal run status and no terminal result", so nothing here records a `result` event, appends a
   * run_end, releases the lock or writes a terminal status. The returned value is the in-process outcome of
   * `start()` and reaches no user surface. Its `stop_reason` is EMPTY: `STOP_REASONS` (REQ-MONITOR-301) is closed
   * and nothing in it names a hold, and the run did not stop, so no reason is claimed.
   */
  private async parkAtPlanGate(): Promise<RunResult> {
    const { writer, owner, bus } = this.deps;
    const cycle = this.deps.plan?.cycle ?? 1;
    const intent = (this.preflight?.intent ?? NO_PREFLIGHT_INTENT).category;
    let plan = '';
    try {
      const report = await this.turn(this.deps.task, 0);
      plan = report.status === 'failed' ? '' : report.text.trim();
      if (report.status === 'failed') this.lastFailure = describe(report.error);
    } catch (cause) {
      this.lastFailure = String(cause);
    }
    if (this.stop.requested) return await this.teardown(this.stop.reason ?? 'user_cancelled');
    if (plan === '') {
      // Nothing to put a decision on. A gate with no plan would offer three answers over an empty surface, so the
      // run ends the way a failed root iteration does (REQ-ORCH-074) and the reason is the role's own.
      this.lastFailure = this.lastFailure ?? 'the entry role produced no plan text while the run was held at the plan gate';
      return await this.teardown('agent_session_aborted');
    }
    writer.appendRow('system', `A plan is ready for your decision (cycle ${cycle}). Approve to release execution, revise to ask for another plan, or cancel the run.`, true);
    this.sampler?.cancel();
    this.sampleTokens(false);
    const opened = writer.openPlanGate(cycle, plan, intent, this.todoJson(), this.deps.plan?.changes ?? '', {
      ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), todo: this.todoJson(), progress: JSON.stringify(this.progress()),
    });
    if (!opened.ok || writer.failed) return this.teardown('agent_session_aborted');
    owner.flushPending();
    try { await this.drain(); } catch (cause) { this.deps.warn(`forwarding the plan gate failed on ${this.sessionId}: ${String(cause)}`); }
    // REQ-HOOKS-126: the attachment goes the way it does at a pause; the hook engine withheld every command this
    // segment would have run and announced each withholding on the stream.
    if (this.hooks) { try { await this.hooks.fireLifecycle('session_end', { status: 'interrupted' }); } catch { /* recorded elsewhere */ } this.hooks = null; }
    bus.detachSession(this.sessionId);
    this.unsubscribeRecordingFailure();
    this.ended = true;
    const usage = this.aggregates.usagePayload();
    const result: RunResult = {
      status: 'interrupted', session_id: this.sessionId, stop_reason: '', summary: `The run is waiting for a decision on its plan (cycle ${cycle}).`,
      iterations_completed: this.iterationsCompleted, report: null, tokens: usage.tokens, cost: usage.cost, error: null,
      execution_status: 'awaiting_plan_decision', severity: 'information',
    };
    this.result = result;
    return result;
  }

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

  /**
   * Part AC — REQ-CHAT-096: the same routing for a question set. The (conversation, prompt id) pair is targeted by
   * the id alone here because a port IS a conversation and a request id is minted per prompt: the port that holds
   * the id is the conversation the prompt belongs to, and no other port can claim it.
   */
  answerQuestions(requestId: string, answers: QuestionAnswers): boolean {
    for (const p of this.ports) if (p.answerQuestions?.(requestId, answers) === true) return true;
    return this.deps.tools?.answerQuestions?.(requestId, answers) ?? false;
  }
  cancelQuestions(requestId: string): boolean {
    for (const p of this.ports) if (p.cancelQuestions?.(requestId) === true) return true;
    return this.deps.tools?.cancelQuestions?.(requestId) ?? false;
  }
  /** REQ-CHAT-097: every conversation's pending prompt, for the whole-session update. */
  pendingQuestions(): QuestionPrompt[] {
    const out: QuestionPrompt[] = [];
    for (const p of this.ports) out.push(...(p.pendingQuestions?.() ?? []));
    if (this.deps.tools && !this.ports.has(this.deps.tools)) out.push(...(this.deps.tools.pendingQuestions?.() ?? []));
    return out;
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

  /** REQ-GIT-051: the one child that succeeded in the closing iteration; '' when none or more than one (no joining format, no winner). */
  private creditedChild(): string {
    const succeeded = (this.children?.children() ?? []).filter((c) => c.state === 'succeeded');
    return succeeded.length === 1 ? succeeded[0]!.canonical_name : '';
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

  /** REQ-MONITOR-166: one sample of the cumulative total; the oldest of 120 discarded; a save publishes it. */
  private sampleTokens(save: boolean): void {
    if (this.ended) return;
    this.tokenSamples.push([toIsoUtc(this.deps.clocks.wall.instant()), this.aggregates.totalTokens]);
    if (this.tokenSamples.length > TOKEN_SAMPLE_CAP) this.tokenSamples.splice(0, this.tokenSamples.length - TOKEN_SAMPLE_CAP);
    if (save) this.saveRunning({});
  }

  private saveRunning(extra: { run_started_at?: string | null; permission_mode?: string; sandboxed?: number }, status: 'running' | 'waiting' = this.waits.size > 0 ? 'waiting' : 'running'): void {
    const r = this.deps.writer.save(status, {
      ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), iterations_completed: this.iterationsCompleted,
      todo: this.todoJson(), progress: JSON.stringify(this.progress()),
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
    // REQ-NOTIFY-093: a wait the user cancelled ends the run with the limit condition as its error, so main classifies it (REQ-NOTIFY-063).
    const error = this.lastFailure ?? this.waits.cancelledReason;
    const result: RunResult = {
      status: classified.result, session_id: this.sessionId, stop_reason: stopReason, summary: summary.message,
      iterations_completed: this.iterationsCompleted, report: null, tokens: this.aggregates.usagePayload().tokens, cost: this.aggregates.usagePayload().cost,
      error, execution_status: status, severity: summary.severity,
    };
    this.result = result;
    try {
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
      // REQ-SESSION-093's row, session.end then result (REQ-SESSION-095), and the terminal save under the held lock.
      // REQ-MONITOR-166: once more at the terminal state, then the sampler goes.
      this.sampler?.cancel();
      this.sampleTokens(false);
      const systemRow = classified.result === 'interrupted' ? (this.pauseRequested ? 'Run paused at the user\'s request; continue it from the composer.' : 'Run paused: interrupted by user.')
        : classified.result === 'failed' || classified.result === 'error' || status === 'failed' ? `Run failed: ${this.lastFailure ?? stopReason}`
          : summary.message;
      const r = writer.endRun({
        status, pid: this.deps.pid, host: this.deps.host, systemRow,
        patch: {
          ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), stop_reason: stopReason, iterations_completed: this.iterationsCompleted,
          summary_status: summary.status, summary_severity: summary.severity, summary_text: summary.message,
          todo: this.todoJson(), progress: JSON.stringify(this.progress()),
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
      if (adv !== '') this.deps.notice?.({ severity: 'warning', headline: 'Hooks need attention', detail: adv, action: 'hooks.settings', sessionId: this.sessionId });
      this.hooks = null;
    });
    } finally {
      // Cleanup preserves ownership until the last session binding has been removed.
      this.hooks = null;
      try { bus.detachSession(this.sessionId); }
      finally {
        try { writer.release(this.deps.pid, this.deps.host); }
        catch (cause) { this.deps.warn(`teardown lock release failed on ${this.sessionId}: ${String(cause)}`); }
        finally { this.unsubscribeRecordingFailure(); this.ended = true; }
      }
    }
    if (this.recordingFailure) {
      const failure = this.recordingFailure;
      this.result = {
        ...result, status: 'error', execution_status: 'unknown', severity: 'error',
        stop_reason: 'agent_session_aborted', summary: 'Run completion is unconfirmed because durable recording failed.',
        error: failure.reason, persistence: { confirmed: false, last_event_ordinal: failure.lastEventOrdinal },
      };
      return this.result;
    }
    return result;
  }
}

/** OQ-8: the comparable form of a cumulative usage payload — two requests whose totals agree raise one event. */
function usageTotals(p: { tokens: { input: number; output: number }; cost: { total: string } }): string {
  return `${p.tokens.input}/${p.tokens.output}/${p.cost.total}`;
}

/** REQ-MONITOR-166: every 10 s while the session's status claims a live run; the most recent 120 samples kept. */
export const TOKEN_SAMPLE_PERIOD = millis(10_000);
export const TOKEN_SAMPLE_CAP = 120;
export function parseTokenSamples(json: string): [string, number][] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is [string, number] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number').slice(-TOKEN_SAMPLE_CAP) : [];
  } catch { return []; }
}

/** REQ-ORCH-019/020: the playbook after the role's own instructions, once. */
export function withPlaybook(systemPrompt: string, playbook: string): string {
  return playbook === '' ? systemPrompt : `${systemPrompt}\n\n${playbook}`;
}

function describe(e: ModelError): string {
  return [e.headline, e.status === undefined ? '' : `HTTP ${e.status}`, e.providerMessage ?? ''].filter(Boolean).join(' — ');
}
