import { Budget, millis, toIsoUtc, type Clocks, type MachineId, type Millis, type SessionId, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { IterationRow, SessionRow } from '@rotaris/store';
import { DEFAULT_CONTEXT_CAPACITY, interruptionPhrase, isAnswerOnly, type ApprovalOption, type Interruption, type PermissionPreset, type QuestionAnswers, type QuestionPrompt, type RootExecutionRecord } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ContentPart, ModelError, ModelRef, ThinkingLevel, TurnReport } from '@rotaris/model';
import type { EventBus } from './event-bus.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { Committed, SessionWriter } from '../session-writer.js';
import { Aggregates } from './aggregates.js';
import { classifyStop, statusForResult, stopCondition, summarise, type StopReason, type TerminalResult } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { Todo, type Task, type TodoDocument } from './todo.js';
import { planRequestSection } from './plan-text.js';
import { runTurn, type ToolPort, type TurnOutcome } from './turn.js';
import { IterationChildren } from '../children/orchestration.js';
import type { DelegationOps } from '../children/delegation.js';
import type { Budget as ChildBudget } from '../children/ledger.js';
import { canonicaliseName, mintTaskId, takenTaskIds } from '../children/naming.js';
import type { SummariserDeps } from '../children/report.js';
import type { ClaimHit } from '../children/write-scope.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import type { CountUsage } from './metered.js';
import type { HookPort, RunNotice } from '../hooks-port.js';
import type { CheckpointPort } from '../checkpoint-port.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { NO_PREFLIGHT_INTENT, type Preflight } from '../preflight.js';
import { clampBudget, storeChildReport } from '../children/ledger.js';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { LoopSupervisor } from './supervisor.js';
import type { Persona, PersonaResolver } from '../children/personas.js';
import { agentCell, type AgentResilienceCell, type TurnResilience } from './ladder.js';
import { entryOf, pairKey, providerIdentity, ResilienceMemory, sameRef, withSettings, type CatalogueEntry, type ModelChoice } from './resilience.js';
import { WaitRegistry, type WaitState } from './waits.js';
import type { ResolvedTrigger, TurnCompression } from './compression.js';
import { ConversationRegistry, type ManualCompressionReport } from './conversations.js'; // Part AO
import { ConversationRecord } from './record.js';
import { answerOpenCalls, iterationAgents } from './crash.js';
import { firstTurn, resumedStart, resumeNoticeOf, type TurnStart } from './resume.js';
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
  /** PD-ORCH-004 / REQ-CONFIG-113: `runtime.child_stall_timeout`, the window of the progress rule; absent means 90 s. */
  readonly childStallTimeoutMs?: Millis | undefined;
  /** REQ-ORCH-080: default 120 s; 0 disables. */
  readonly drainTimeoutMs?: Millis | undefined;
  /**
   * REQ-ORCH-134 / REQ-CONFIG (`runtime.graceful_pause_tool_deadline`, 5–120 s, default 30 s): how long a pause lets the
   * tool calls in flight finish before it cuts them (PD-ORCH-005 clause 2). Absent means 30 s.
   */
  readonly pauseToolDeadlineMs?: Millis | undefined;
  /**
   * PD-ORCH-005 clause 10: the background terminal sessions this session's agents started, as the process that holds
   * them sees them, and the one act a stop and a quit take on them. Absent means the run has no terminal.
   */
  readonly terminals?: AgentTerminals | undefined;
  /**
   * PD-ORCH-005 clauses 4 and 6: what this run does with the iteration a rest left open — resume it, the default of every
   * continue (the new message a continue by message delivers is already in its root's record); or decline it, clause 6's
   * "continue without them". Absent means decline; a run with no open iteration ignores it.
   */
  readonly openIteration?: { readonly resume: boolean } | undefined;
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
  readonly initialTodo?: TodoDocument | undefined;
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
  /**
   * REQ-WORKSPACE-060 (ADR-0063): the session's always-active context units, in that requirement's order.
   * A **getter**, not a value — it is called at every agent construction, so a skill force-loaded mid-session
   * reaches the next agent built while an agent already running keeps the context it was built with, which is
   * REQ-CONFIG-166's rule and the reason the seam is not a captured array.
   *
   * Absent means no unit, which is what a run with no skills, no workspace context and no persona memory gets.
   */
  readonly contextUnits?: (() => readonly string[]) | undefined;
}

/** PD-ORCH-005 clause 10: one background terminal session an agent of the session started, as its process holds it. */
export interface LiveTerminal {
  readonly id: string;
  /** The task id of the agent that started it. */
  readonly taskId: string;
  readonly command: string;
  readonly startedAt: string;
  /** REQ-TOOLS-109's status vocabulary. */
  readonly status: 'running' | 'completed' | 'failed' | 'killed' | 'timeout';
  readonly exitCode: number | null;
  /** The last output it produced, bounded. */
  readonly tail: string;
}
/** PD-ORCH-005 clause 10: the session's background terminal sessions, and ending the named ones (REQ-TOOLS-111's act). */
export interface AgentTerminals {
  list(): readonly LiveTerminal[];
  end(ids: readonly string[]): Promise<void>;
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

/** ADR-0014 rule 1: the one 30 s allowance. Declared in `grace.ts` and re-exported here, where its two
 * oldest readers look for it; `grace.ts` says why it may not be declared in this file. */
export { STOP_GRACE } from './grace.js';
import { STOP_GRACE } from './grace.js';
/** REQ-ORCH-134 / REQ-ORCH-143: the graceful pause's tool deadline when the run is given none — 30 s, bounded 5–120 by configuration. */
export const PAUSE_TOOL_DEADLINE = millis(30_000);

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
  private rootIterationId = 'root:1';
  private rootRecord: RootExecutionRecord | null = null;

  /** REQ-ORCH-072: the current iteration's root execution record. */
  get rootExecutionRecord(): RootExecutionRecord | null {
    return this.rootRecord;
  }

  private isRootAgent(id: string): boolean {
    return (
      id === 'run' ||
      id === 'root' ||
      id === this.rootId ||
      id === this.rootIterationId ||
      (this.rootRecord !== null && (id === this.rootRecord.taskId || id === this.rootRecord.canonicalName))
    );
  }
  /** Every tool port this run created — the root's and each child's — so an answer, a cancel or a mode change reaches all of them (REQ-TOOLS-030). */
  private readonly ports = new Set<ToolPort>();
  /** REQ-HOOKS-087: the session's hook attachment, removed at the end of the run. */
  private hooks: HookPort | null;
  private preflight: Preflight | null = null;
  /** REQ-MONITOR-123: a graceful pause requested; honoured at the next model step and at the iteration boundary. */
  private pauseRequested = false;
  /**
   * PD-ORCH-005 clause 2 / REQ-ORCH-134: aborted when the pause's tool deadline passes, cutting every tool call still in
   * flight in every agent; the timer that aborts it is armed when the pause is accepted.
   */
  private toolCut = new AbortController();
  private toolDeadline: TimerHandle | null = null;
  /** PD-ORCH-005 clause 2: the interruption the current iteration came to rest by, leaving it open; null while it has not. */
  private iterationRest: Interruption | null = null;
  /** PD-ORCH-005 clause 4: the open iteration this run resumes before anything else, or null. */
  private readonly resumeFrom: IterationRow | null;
  /**
   * PD-ORCH-005 clause 3: the open iteration this run holds — from construction the one a rest left open, which it
   * resumes or declines, and later the one it left open at its own rest — which a later explicit cancel closes. The
   * continuing run owns that iteration before its loop reaches it, so a cancel during the pre-flight still ends what it
   * would have resumed (found by phase 4's review).
   */
  private restedIteration: number | null;
  /** PD-ORCH-005 clause 3: teardown has passed the point where the explicit cancel can still close anything. */
  private cancelWindowClosed = false;
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
  /** PD-ORCH-005 clause 1: every agent's conversation of this run, recorded as it happens. */
  private readonly record: ConversationRecord;
  /** PD-ORCH-005 clause 1: the todo task the current iteration works on, recorded with the iteration and its root. */
  private iterationTask: { readonly id: string; readonly text: string } | null = null;
  private appliedEntryModel: ModelRef | null = null;

  constructor(private readonly deps: RunDeps) {
    this.sessionId = deps.sessionId;
    this.hooks = deps.hooks ?? null;
    this.record = new ConversationRecord(deps.writer, deps.dal, deps.sessionId);
    this.memory = deps.resilience?.memory ?? new ResilienceMemory();
    this.catalogue = deps.resilience?.catalogue ?? [];
    this.waits = new WaitRegistry({ clocks: deps.clocks, onChange: () => this.publishWait() });
    const stored = deps.readSession();
    this.agentTodo = decodeStoredTodo(stored?.todo ?? null).agent;
    this.todo = deps.initialTodo
      ? Todo.fromDocument(deps.initialTodo, deps.config.consecutiveRetryLimit)
      : deps.resumeTodo
        ? Todo.fromDocument(deps.resumeTodo, deps.config.consecutiveRetryLimit)
        : Todo.fresh(deps.taskId, deps.taskLabel ?? deps.task, deps.config.consecutiveRetryLimit);
    // PD-ORCH-005 clause 4: a continue that resumes an open iteration adds no task — a new message goes to the resumed root.
    const open = deps.openIteration === undefined ? null : deps.dal?.openIterationOf(deps.sessionId) ?? null;
    this.resumeFrom = deps.openIteration?.resume === true ? open : null;
    this.restedIteration = open?.iteration ?? null;
    if (deps.resumeTodo && this.resumeFrom === null) this.todo.appendTask('Continued Prompts', deps.taskId, deps.taskLabel ?? deps.task);
    this.aggregates = Aggregates.rehydrate(stored);
    this.lastUsageEmitted = usageTotals(this.aggregates.usagePayload());
    this.tokenSamples = parseTokenSamples(stored?.token_samples ?? '[]');
    // PD-ORCH-005: the count is never below the highest iteration recorded closed, so the next iteration's number is
    // always free even where a process death landed between an iteration's close and the save that counts it.
    const closedIterations = deps.dal?.iterationsOf(deps.sessionId).filter((i) => i.state === 'closed').map((i) => i.iteration) ?? [];
    this.iterationsCompleted = Math.max(stored?.iterations_completed ?? 0, ...closedIterations);
    this.initialIterations = this.iterationsCompleted;
    // Sticky and observable: a request before the loop exists replays here (REQ-SESSION-092).
    this.stop.onRequested((s) => {
      // REQ-MONITOR-012: whatever is blocked on a person is released first, then the run stops. PD-ORCH-005 clause 9: a
      // stop or a quit brings the run to rest, so the waits are WITHDRAWN (the calls interrupted, never denied) and every
      // agent is left paused; only the explicit cancel releases them as REQ-TOOLS-052's cancellation, as before.
      const rest = this.restCause;
      try { if (rest !== null) this.withdrawPending(rest); else this.cancelPending(); } catch (cause) { this.deps.warn(`releasing pending approvals on ${this.sessionId} failed: ${String(cause)}`); }
      if (rest !== null) this.children?.beginRest();
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

  /**
   * PD-ORCH-005: the interruption this run is coming to rest by — `stop` or `quit` for a stop request that is not the
   * explicit cancel, `pause` for an accepted pause — or null when it is not coming to rest: running, cancelled (clause 3:
   * "an explicit cancel is final"), aborted on its own account (`agent_session_aborted`: a recording failure, the headless
   * abort hook, an escalation), or held at the plan gate (clause 11: a durable hold leaves no agent unfinished, so a stop
   * or a quit during a plan cycle ends its agents as before — OQ-69).
   */
  get restCause(): Interruption | null {
    if (this.planHeld) return null;
    if (this.stop.requested) {
      if (this.stop.final) return null;
      if (this.stop.reason === 'user_cancelled') return 'stop';
      if (this.stop.reason === 'application_shutdown') return 'quit';
      return null;
    }
    return this.pauseRequested ? 'pause' : null;
  }

  /**
   * PD-ORCH-005 clause 10: what the run's end does to its agents' background sessions — `pause` leaves them running, `stop`
   * and `quit` end them — or null, for a run that ended on its own account or at a durable hold, which leaves them as
   * before. The explicit cancel is a stop here.
   */
  private terminalsEndedBy(): Interruption | null {
    if (this.restCause !== null) return this.restCause;
    if (!this.stop.requested || this.planHeld) return null;
    if (this.stop.reason === 'application_shutdown') return 'quit';
    return this.stop.reason === 'user_cancelled' ? 'stop' : null;
  }

  /** PD-ORCH-005 clause 2: the run is coming to rest, so it makes no further model call — a manual compression among them. */
  get comingToRest(): boolean {
    return this.restCause !== null;
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
  /**
   * PD-TOOLS-006: the live write-scope claim that refuses the agent `callerId` a write to the workspace-relative
   * `rel`, or null. Read through the iteration's children on every call, so a claim lapses the moment its child
   * settles and a port built before a child was accepted still sees that child's scope.
   */
  writeClaimFor(callerId: string, rel: string): ClaimHit | null {
    return this.children?.writeClaimFor(callerId, rel) ?? null;
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
      // PD-ORCH-005: a run that resumes an open iteration is not held — the work it resumes was released already (OQ-70).
      this.planHeld = this.deps.plan !== undefined && !isAnswerOnly((this.preflight?.intent ?? NO_PREFLIGHT_INTENT).category) && this.resumeFrom === null;
      // PD-ORCH-005 clause 11: a pause accepted before the hold was settled is refused now that it is — a plan cycle leaves
      // no agent unfinished, so there is nothing for it to hold (found by phase 3's review).
      if (this.planHeld && this.pauseRequested) {
        this.pauseRequested = false;
        this.toolDeadline?.cancel();
        // A deadline that already passed cut nothing yet — no turn has run — and cuts nothing of the plan cycle's.
        this.toolCut = new AbortController();
        writer.appendTimeline('run_pause_refused', 'rotaris', 'The pause was not applied: this run is held at the plan gate, which leaves no agent unfinished (PD-ORCH-005 clause 11).', {});
        writer.save('starting');
      }
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
      // PD-TOOLS-002: the requested mode always applies — no downgrade row, timeline event or log warning. The announcement records the requested (= effective) mode.
      const perm = this.deps.permission;
      this.saveRunning({ run_started_at: this.deps.readSession()?.updated_at ?? null, permission_mode: perm.effective, sandboxed: perm.sandboxed ? 1 : 0 });
      // REQ-MONITOR-166: sampled by the run, not by a view — the cadence from the clock port, never a bare timer.
      this.sampler = clocks.timers.every(TOKEN_SAMPLE_PERIOD, () => this.sampleTokens(true));
      await this.drain();
      // REQ-HOOKS-003/081: session_start once, ahead of the first iteration, in line with the loop (REQ-HOOKS-080).
      if (this.hooks) await this.hooks.fireLifecycle('session_start', { task: this.deps.task });

      // PD-ORCH-005 clauses 4 and 6: an iteration a previous run left open resumes before anything else runs, as the
      // loop's first iteration below; declined, it closes here.
      if (this.resumeFrom === null) await this.closeLeftOpenIteration();
      // REQ-ORCH-153: a held run produces its plan and parks; it never enters the iteration loop, so it selects no
      // task, judges no completion and runs no check suite — the prohibition is structural rather than a branch.
      if (this.planHeld) return await this.parkAtPlanGate();

      // REQ-ORCH-069: stop conditions between iterations, first match wins; the stop request wins over all.
      let resuming = this.resumeFrom;
      for (;;) {
        if (this.stop.requested) { stopReason = this.stop.reason ?? 'user_cancelled'; break; }
        if (this.pauseRequested) { stopReason = 'user_cancelled'; break; }
        // REQ-CHAT-040: every QUEUED prompt becomes a task before completion is judged, so a run never reports done while prompts wait.
        this.consumeQueued();
        // PD-ORCH-005 clause 4: the resumed iteration runs whatever the stop conditions say — its task is already held.
        if (resuming === null) {
          stopReason = stopCondition({
            allTasksComplete: this.todo.allTasksComplete, pendingTasks: this.todo.pendingCount,
            iterationsCompleted: this.iterationsCompleted - this.initialIterations, iterationLimit: config.iterationLimit,
            elapsedMs: clocks.monotonic.now() - (this.startedAt ?? clocks.monotonic.now()), timeLimitMs: config.timeLimitMs,
          });
          if (stopReason) break;
        }
        const escalated = await this.iterate(resuming);
        resuming = null;
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
    } finally {
      // The pause's tool deadline outlives no run, whichever way it ended.
      this.toolDeadline?.cancel();
    }
  }

  /**
   * One iteration (REQ-ORCH-067/068/072/073/074/135). Returns true when the run must end as agent_session_aborted.
   * `resume` is PD-ORCH-005 clause 4: the open iteration a rest left, carried on where it stood — its number, its root
   * and its task — with no second `iteration.start`; it closes like any other iteration.
   */
  private async iterate(resume: IterationRow | null = null): Promise<boolean> {
    const { writer } = this.deps;
    const task = resume ? this.resumedTask(resume) : this.todo.selectNext();
    if (!task) return false;
    this.todo.begin(task);
    const iteration = resume?.iteration ?? this.iterationsCompleted + 1;
    this.iterationTask = { id: task.id, text: task.text };
    if (resume) {
      writer.recordIterationInterruption(iteration, null);
      writer.appendTimeline('iteration_resumed', 'rotaris', `Iteration ${iteration}, left open by ${interruptionPhrase(resume.interruption ?? '')}, resumed.`, { iteration, interruption: resume.interruption, root_task_id: resume.root_task_id });
    } else {
      writer.recordEvent('iteration.start', { task: task.text }, iteration);
    }
    await this.drain();

    let outcome: 'succeeded' | 'failed' | 'partial' | 'cancelled' | 'abandoned' = 'failed';
    let summary = '';
    let escalate = false;
    try {
      const modelTask = this.deps.continuation && task.id === this.deps.taskId ? this.deps.task : task.text;
      const report = resume
        ? await this.turn(resume.task, undefined, undefined, resume)
        : await this.turnWithRetry(modelTask);
      summary = report.text.slice(0, 200);
      if (this.iterationRest !== null) {
        // PD-ORCH-005 clause 2 (narrowing REQ-MONITOR-123 and REQ-ORCH-135): the iteration came to rest with work
        // unfinished, so it is neither closed nor re-queued — it is left open below, its task still held. A rest that
        // found nothing unfinished closes the iteration as the two branches below always have.
      } else if (this.stop.requested) {
        // REQ-ORCH-135: an iteration cancelled mid-run closes as cancelled; the task stays anchored.
        outcome = 'cancelled';
        task.state = 'pending';
        summary = 'the run was cancelled before the agent finished';
        if (this.rootRecord) this.rootRecord.state = 'cancelled';
      } else if (this.pauseRequested) {
        // REQ-MONITOR-123: the current step finished; the task stays pending for the continuation.
        outcome = 'cancelled';
        task.state = 'pending';
        summary = 'the run paused at the user\'s request before the agent finished';
        if (this.rootRecord) this.rootRecord.state = 'cancelled';
      } else if (report.status === 'succeeded') {
        outcome = 'succeeded';
        this.todo.complete(task);
        if (this.rootRecord) this.rootRecord.state = 'succeeded';
      } else if (report.status === 'partial') {
        outcome = this.todo.requeue(task) === 'abandoned' ? 'abandoned' : 'partial';
        if (this.rootRecord) this.rootRecord.state = outcome === 'abandoned' ? 'failed' : 'succeeded';
      } else {
        // REQ-ORCH-074: failed → the task is abandoned; for the root agent the run ends agent_session_aborted.
        outcome = 'failed';
        this.lastFailure = describe(report.error);
        summary = this.lastFailure;
        this.todo.abandon(task);
        escalate = true;
        if (this.rootRecord) this.rootRecord.state = 'failed';
      }
    } catch (cause) {
      if (this.iterationRest === null) {
        // REQ-ORCH-073 / REQ-ORCH-135: an iteration that raises closes as failed, the task abandoned.
        this.lastFailure = String(cause);
        summary = `the iteration ended with an unhandled error: ${String(cause)}`;
        this.todo.abandon(task);
        escalate = true;
        if (this.rootRecord) this.rootRecord.state = 'failed';
      } else {
        this.deps.warn(`iteration ${iteration} raised while coming to rest, and is left open to be resumed: ${String(cause)}`);
      }
    }
    if (this.iterationRest !== null) return await this.leaveIterationOpen(iteration, this.iterationRest);
    // PD-ORCH-005 clause 1: `iteration.end` and the iteration's record closing with its outcome, in one transaction.
    writer.endIteration(iteration, { task: task.text, outcome, summary }, outcome);
    this.iterationTask = null;
    // ADR-0039 / REQ-GIT-051: exactly one capture per iteration that closes, at the moment it closes — after
    // `iteration.end` is recorded and BEFORE the hooks' `iteration_end`: the checkpoint records the iteration's work as
    // the agent left it, and a hook that later carries the checkpoint (REQ-HOOKS-082 with checkpoints, owed) can only
    // do so if the capture precedes it. Awaited, so it finishes before the next iteration and before teardown.
    await this.captureCheckpoint(iteration, this.creditedChild());
    // REQ-HOOKS-075/077/080/082: iteration_end for N finishes before N+1 begins; the iteration's own state beside the dispatched outcome.
    if (this.hooks) {
      const iterationState = outcome === 'cancelled' ? 'cancelled' : outcome === 'failed' || outcome === 'abandoned' ? 'failed' : 'succeeded';
      await this.hooks.fireLifecycle('iteration_end', { iteration, outcome, child_name: this.rootIterationId, status: iterationState, summary });
    }
    this.iterationsCompleted += 1;
    this.saveRunning({});
    await this.drain();
    return escalate;
  }

  /** PD-ORCH-005 clause 4: the todo task the open iteration holds — a stand-in carrying its text when the todo lost it. */
  private resumedTask(row: IterationRow): Task {
    return this.todo.task(row.todo_task_id) ?? { id: row.todo_task_id, text: row.task, state: 'in_progress', consecutiveRetries: 0 };
  }

  /**
   * PD-ORCH-005 clauses 4 and 10: the resumed root's conversation — its record, which already holds what the continue
   * told it: the notice of its background sessions, then the new message a continue by message delivers, so the user's
   * message is the last it reads (`Sessions.launchContinuation` records both at the continue).
   */
  private resumedRootStart(rootTaskId: string): TurnStart {
    return resumedStart(this.record.load(rootTaskId));
  }

  /** PD-ORCH-005 clause 10: what the agent `taskId` is told, when it resumes, of the background sessions it had started. */
  private resumeNotice(taskId: string): ChatMessage | null {
    return this.deps.dal ? resumeNoticeOf(this.deps.dal, this.sessionId, taskId, this.deps.terminals) : null;
  }

  /**
   * PD-ORCH-005 clause 2: the iteration came to rest with work unfinished — its root and every unfinished child are
   * `paused` (the turn's rest did that) — so it stays OPEN: no `iteration.end`, no checkpoint (REQ-GIT-051 captures at a
   * close), no `iteration_end` hook, the count not moved and its todo task still held. What left it open is recorded
   * on its row. Never an escalation: the loop then finds the stop or the pause and ends the run.
   */
  private async leaveIterationOpen(iteration: number, rest: Interruption): Promise<boolean> {
    const { writer } = this.deps;
    this.iterationRest = null;
    this.restedIteration = iteration;
    writer.recordIterationInterruption(iteration, rest);
    // The root and every paused child.
    const paused = 1 + (this.children?.ledger.all().filter((c) => c.state === 'paused').length ?? 0);
    writer.appendTimeline('iteration_paused', 'rotaris', `Iteration ${iteration} was left open by ${interruptionPhrase(rest)}; its unfinished agents are paused and resume when the session is continued.`, { iteration, interruption: rest, paused_agents: paused });
    this.iterationTask = null;
    this.saveRunning({});
    await this.drain();
    return false;
  }

  /**
   * PD-ORCH-005, and the repair of `a-crashed-iteration-number-is-reused-by-the-next-run.md`: an iteration a previous
   * run left open — a run host that died mid-iteration leaves its row open, since nothing ran to close it — closes as
   * cancelled before this run's first iteration (REQ-ORCH-135): `iteration.end` and the row's close in one transaction,
   * its todo task back to `pending` so it is selected again ("the task stays anchored"), and the count moved past it, so
   * this run's first iteration takes the next number rather than the dead one's. It counts toward no limit of this run.
   */
  private async closeLeftOpenIteration(): Promise<void> {
    const closed = await this.closeOpenIteration((open) => (open.interruption === null || open.interruption === 'crash'
      ? 'the run that owned this iteration ended before it closed'
      : `the session was continued without the agents ${interruptionPhrase(open.interruption)} had left paused`),
    (c) => `Cancelled: the session was continued without this agent, which ${interruptionPhrase(c.interruption ?? '')} had left paused.`);
    if (!closed) return;
    this.initialIterations = this.iterationsCompleted;
    this.saveRunning({});
  }

  /**
   * The open iteration closes `cancelled` with every agent it left paused, each with `agentReport`'s words: `iteration.end`
   * and the row's close in one transaction, its capture, its todo task back to `pending`, and the count moved past it.
   * `only` names the one iteration the caller may close. False when none is open, or the open one is not that one.
   */
  private async closeOpenIteration(summary: (open: IterationRow) => string, agentReport: (c: ChildRow) => string, only?: number | null): Promise<boolean> {
    const dal = this.deps.dal;
    const open = dal?.openIterationOf(this.sessionId);
    if (!dal || !open || (only !== undefined && open.iteration !== only)) return false;
    this.cancelPausedAgents(dal, open, agentReport);
    this.deps.writer.endIteration(open.iteration, { task: this.todo.textOf(open.todo_task_id) ?? open.task, outcome: 'cancelled', summary: summary(open) }, 'cancelled');
    // REQ-GIT-051: the iteration closes here, so its one capture is attempted here — it records the work done in it. No
    // child is credited: none finished the iteration. Its hooks' `iteration_end` is not fired: an iteration left open by
    // an earlier run began under that run's hooks, and one this run left open ends with the run.
    await this.captureCheckpoint(open.iteration, '');
    this.todo.reopen(open.todo_task_id);
    this.iterationsCompleted = Math.max(this.iterationsCompleted, open.iteration);
    return true;
  }

  /**
   * PD-ORCH-005 clause 6's "continue without them": every `paused` agent of the open iteration ends `cancelled`, with a
   * report saying so, before the iteration closes as cancelled. Until the resume is built this is what every continue
   * does with an iteration a rest left open; once it is, only the user's declining does.
   */
  private cancelPausedAgents(dal: StoreDal, open: IterationRow, report: (c: ChildRow) => string): void {
    for (const c of iterationAgents(dal, this.sessionId, open)) {
      if (c.state !== 'paused') continue;
      const r = this.deps.writer.transitionChild(c.task_id, 'cancelled', 'cancellation');
      if (!r.ok) { this.deps.warn(r.error.code === 'illegal-move' ? r.error.reason : `cancelling paused ${c.task_id} failed: ${r.error.code}`); continue; }
      // REQ-LIBRARY-092: the report is materialised as every terminal child's is.
      storeChildReport({ writer: this.deps.writer, artifacts: this.deps.artifacts, warn: this.deps.warn }, c.task_id, c, { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: report(c), key_findings: [], last_response: '', final_response: '', errors: [] });
    }
  }

  /** REQ-GIT-051 / REQ-GIT-045: the one capture an iteration that closes is owed, which never raises and never aborts the run. */
  private async captureCheckpoint(iteration: number, childName: string): Promise<void> {
    if (!this.deps.checkpoints?.enabled) return;
    try {
      const r = await this.deps.checkpoints.capture({ iteration, childName });
      if (r.outcome === 'failed') this.deps.warn(`checkpoint after iteration ${iteration} was not recorded: ${r.detail}`);
    } catch (cause) {
      // REQ-GIT-045: never raises, never aborts the run — the port promises that; this is the belt behind it.
      this.deps.warn(`the checkpoint port raised after iteration ${iteration}: ${String(cause)}`);
    }
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
  private readonly onRequestUsage = (u: PricedUsage): void => {
    // PD-MONITOR-001: the request's figure — reported, or priced at configured rates by the ladder — joins the run's
    // total here, beside the tokens of the same request, so the figure the event carries and the one persisted are one.
    this.aggregates.addRequest(u);
    const payload = this.aggregates.usagePayload();
    const totals = usageTotals(payload);
    if (totals === this.lastUsageEmitted) return;
    this.lastUsageEmitted = totals;
    this.deps.writer.recordEvent('usage.update', payload, this.iterationsCompleted + 1);
  };

  /**
   * REQ-EVENTS-053, PD-MONITOR-001: a request the run made outside any agent's turn (`meteredBackend`), priced at the
   * rates of the model it was sent to and counted exactly as an agent's own request is.
   */
  readonly countUsage: CountUsage = (usage, model) => {
    this.onRequestUsage(priceRequest(usage, entryOf(this.catalogue, model)?.pricing));
  };

  /** REQ-MONITOR-084 (4): the run-level plan as lines, for the entry agent's own compression. */
  private plannerTodoLines(): readonly string[] {
    return this.todo.toDocument().phases.flatMap((phase) => phase.tasks.map((task) => `[${task.state}] ${phase.name} — ${task.text}`));
  }

  /** The per-agent ladder deps shared by the root and every child (the cell is the agent's own). */
  private resilienceFor(cell: AgentResilienceCell, unresponsiveBoundMs: number): TurnResilience {
    const { config } = this.deps;
    return { cell, memory: this.memory, catalogue: this.catalogue, waits: this.waits, transientRetries: config.transientRetries, validationRetries: config.validationRetries, llmResponseTimeoutMs: config.llmResponseTimeoutMs, unresponsiveBoundMs, resting: () => this.restCause !== null };
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
  private async turn(task: string, iterationOverride?: number, contentOverride?: readonly ContentPart[], resume?: IterationRow): Promise<TurnReport> {
    const { writer, owner, backend, config } = this.deps;
    const iteration = resume?.iteration ?? iterationOverride ?? this.iterationsCompleted + 1;
    this.rootIterationId = `root:${iteration}`;
    // REQ-ORCH-072: the iteration's root execution record with the entry role and task payload, in the children namespace.
    // PD-ORCH-005: every earlier root's id is taken too — roots are recorded now, and the conversation record is keyed by
    // task id across the whole session, so a root minted over an earlier one would merge two agents' records.
    // PD-ORCH-005 clause 4: a resumed iteration's root is restored with its identity — its task id and canonical name.
    const rootTaskId = resume?.root_task_id ?? mintTaskId(takenTaskIds(this.deps.dal, this.sessionId));
    const rootCanonical = resume?.root_canonical_name ?? canonicaliseName(config.persona);
    const rootRecord: RootExecutionRecord = {
      taskId: rootTaskId,
      canonicalName: rootCanonical,
      persona: config.persona,
      task,
      iteration,
      depth: 0,
      state: 'running',
    };
    this.rootRecord = rootRecord;
    this.rootId = rootTaskId;
    // PD-ORCH-005 clause 1: "The root's task id is recorded with its iteration." A plan cycle (0) is not an iteration.
    if (iterationOverride === undefined && resume === undefined) {
      const opened = writer.openIteration({ iteration, root_task_id: rootTaskId, root_canonical_name: rootCanonical, root_persona: config.persona, todo_task_id: this.iterationTask?.id ?? '', task });
      if (opened.ok && !opened.value) this.deps.warn(`iteration ${iteration} of ${this.sessionId} was not recorded open: its number is taken or another iteration is open`);
    }
    const children = this.deps.toolsFor && this.deps.dal
      ? new IterationChildren({
        rootRecord,
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
        // REQ-EVENTS-053, PD-MONITOR-001: a child's provider requests are the run's, counted where the entry agent's are.
        onRequestUsage: this.onRequestUsage,
        summariser: this.deps.summariser ?? null, hooks: this.hooks, playbookFor: this.preflight?.playbookFor ?? null, route: this.preflight?.route ?? 'work', ...(this.deps.childTimeoutMs === undefined ? {} : { childTimeoutMs: this.deps.childTimeoutMs }), ...(this.deps.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: this.deps.childStallTimeoutMs }), runSignal: this.abort.signal, warn: this.deps.warn,
        // REQ-WORKSPACE-060/065 (ADR-0063): a child is an agent, so it receives the SAME units the entry agent
        // does — the getter is passed through, not a copy, which is what makes "a skill can never be visible to
        // one persona and hidden from another" true by construction rather than by two call sites agreeing.
        ...(this.deps.contextUnits ? { contextUnits: this.deps.contextUnits } : {}),
        ...(this.deps.supervisorFor ? { supervisorFor: this.deps.supervisorFor } : {}),
        ...(this.deps.personas ? { personas: this.deps.personas } : {}),
        steeringFor: (id: string) => this.steeringFor(id), shouldPause: () => this.pauseRequested,
        // PD-ORCH-005: the rest the run is coming to, and the pause's tool deadline every child's calls run under.
        restCause: () => this.restCause, cutCalls: this.toolCut.signal, resumeNotice: (taskId: string) => this.resumeNotice(taskId),
        // PD-ORCH-005 clause 1: every child's conversation is recorded under its task id.
        record: this.record,
        // Part Y (REQ-LIBRARY-092/097/098): the session artifact store — child reports materialise into it and its
        // two context blocks reach every child the iteration launches.
        ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
        // REQ-ORCH-153: the live hold and the registry predicate, for the child-admission refusal.
        ...(this.deps.plan ? { planGate: { held: () => this.planHeld, withholds: this.deps.plan.withholds } } : {}),
      }, iteration)
      : null;
    this.children = children;
    const tools = children && this.deps.toolsFor ? this.portFor(config.persona, config.persona, children, this.rootId, 0) : this.register(this.deps.tools);
    // PD-ORCH-005 clause 4: a resumed iteration's agents are restored first, so the root resumes among them.
    // The timeline records each agent resumed (`child_resumed`), so a resume is not a warning (phase 4's review).
    if (resume && children) children.resumePaused();
    // The launch content goes to a fresh root's first call only; a resumed root carries on from its record.
    let launching = resume === undefined;
    let initial = true;
    const compression = this.compressionFor(this.rootResilience().cell.model, () => this.plannerTodoLines());
    // PD-ORCH-005 revision 4 clause 14: one check per execution of the root, at its first model step.
    const fingerprint = this.record.fingerprint(rootTaskId, rootCanonical, iteration);
    const turnFn = (text: string | null, history: readonly ChatMessage[]) => {
      const content = launching ? (contentOverride ?? this.deps.taskContent) : undefined;
      const initialCall = initial;
      launching = false;
      initial = false;
      return runTurn({
      writer, owner, backend, tools, clocks: this.deps.clocks, persona: config.persona, agentName: config.persona,
      // REQ-ORCH-019: the rendered playbook is part of the instructions the role is given.
      // REQ-WORKSPACE-060 (ADR-0063): then the session's always-active context units, read at THIS construction
      // so a skill force-loaded since the last turn reaches this agent (REQ-CONFIG-166).
      systemPrompt: withContextUnits(withPlaybook(config.systemPrompt, this.preflight?.playbookFor(config.persona) ?? ''), this.deps.contextUnits?.() ?? []), model: this.entryOverride.model ?? config.model, thinking: this.entryOverride.thinking ?? config.thinking, modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries,
      credentialFor: config.credentialFor, maxStepsPerTurn: config.maxStepsPerTurn, warn: this.deps.warn, dispatched: this.dispatched,
      // PD-ORCH-001: no supervision while the plan gate holds the run. The hold withholds every writing tool,
      // so the only work left is reading the same region repeatedly — REQ-ORCH-101's first trigger, fired by the
      // gate's own side effect — and the corrective message goes in as the user, to a run that is waiting for
      // the user. Read here rather than captured once because `turnFn` is built once per segment and called per
      // turn; the hold itself is settled once and never cleared in place (REQ-ORCH-153), so the two agree.
      ...(this.deps.supervisorFor && !this.planHeld ? { supervisor: this.deps.supervisorFor(this.rootId) } : {}),
      steering: this.steeringFor('root'), shouldPause: () => this.pauseRequested,
      // PD-ORCH-005: the pause's tool deadline, and what the root's interrupted calls are recorded as interrupted by.
      cutCalls: this.toolCut.signal, interruption: () => this.restCause,
      resilience: this.rootResilience(),
      // Part AH: the entry agent compresses against its own model's capacity, carrying the run-level plan.
      ...(compression ? { compression } : {}),
      // REQ-ORCH-093: after the first call this turn resumes the parent with its children's reports. A resumed root's
      // first call carries on from its record, as a resumed child's does, and is not flagged either (phase 4's review).
      parentResume: !initialCall,
      // OQ-8: the entry agent's provider requests, each counted and published as it completes.
      onRequestUsage: this.onRequestUsage,
      // PD-ORCH-005 clause 1: the root's conversation is recorded under its task id, with its iteration.
      recorder: this.record.recorder(rootTaskId, iteration),
      // PD-ORCH-005 revision 4 clause 14: the fingerprint of the instructions and tools the root started with.
      fingerprint,
      }, text, history, this.abort.signal, content);
    };
    let outcome: TurnOutcome | null = null;
    try {
      const start: TurnStart = resume ? this.resumedRootStart(rootTaskId) : { kind: 'fresh', task };
      outcome = children ? await children.runWithChildren(this.rootId, turnFn, start, this.abort.signal) : await firstTurn(turnFn, start);
      this.aggregates.addToolCalls(outcome.toolCallCount);
      // REQ-ORCH-080: a stop with active background children drains before anything is cancelled — only a stop that
      // cancels them (the explicit cancel); a stop that brings the run to rest leaves them paused (PD-ORCH-005).
      if (children && this.stop.requested && this.restCause === null && children.scheduler.hasNonTerminal) await children.drain(this.deps.drainTimeoutMs ?? millis(120_000));
      return outcome.report;
    } finally {
      /*
       * PD-ORCH-005 clause 2 (narrowing REQ-ORCH-052): an iteration that comes to rest with work unfinished — the root
       * stopped where it stood, or a child is not terminal — leaves every unfinished agent `paused` and the iteration
       * open. Every other exit, a plan cycle's among them, still leaves every child record terminal.
       */
      const rest = iterationOverride === undefined ? this.restCause : null;
      const rootFinished = outcome !== null && outcome.paused !== true && !this.abort.signal.aborted && outcome.report.status !== 'failed';
      if (rest !== null && (!rootFinished || (children?.scheduler.hasNonTerminal ?? false))) {
        if (children) { const n = await children.rest(rest); if (n > 0) this.deps.warn(`iteration ${iteration}: ${n} child(ren) left paused by ${rest} (PD-ORCH-005)`); }
        /*
         * Clause 3: the explicit cancel is final even when it arrives while the run is coming to rest — the rest waits on
         * every execution, which can take the pause's whole tool deadline. Read again once the rest is done: cancelled
         * meanwhile, every agent it paused ends `cancelled` and the iteration closes (found by phase 3's review).
         */
        if (this.restCause === null) {
          rootRecord.state = 'cancelled';
          if (children) children.finalize('cancelled: the run was cancelled while it was coming to rest');
        } else {
          this.iterationRest = this.restCause;
          rootRecord.state = 'paused';
          // Clauses 3 and 4: a root that raised out of a call has that call answered as interrupted, as a child's is.
          if (this.deps.dal) answerOpenCalls(this.deps.dal, writer, this.sessionId, { taskId: rootTaskId, name: config.persona }, iteration, this.restCause);
        }
      } else if (children) {
        // REQ-ORCH-052: every exit path from an iteration leaves every child record terminal.
        const n = children.finalize(this.stop.requested ? 'cancelled: the run was stopped while this child was in flight' : 'cancelled during iteration cleanup');
        if (n > 0) this.deps.warn(`iteration ${iteration}: ${n} child(ren) settled cancelled at exit (REQ-ORCH-052)`);
      }
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
    const key = this.isRootAgent(agentId) ? 'root' : agentId;
    if (key !== 'root' && !this.children?.ledger.get(key)) return null;
    const id = randomUUID();
    const list = this.steering.get(key) ?? [];
    list.push({ id, text });
    this.steering.set(key, list);
    this.deps.writer.appendTimeline('steering_submitted', 'user', `A steering prompt was submitted for ${key === 'root' ? this.deps.config.persona : key} (${id.slice(0, 8)}).`, { prompt_id: id, agent: key });
    return id;
  }
  private steeringFor(conversationId: string): () => readonly { id: string; text: string }[] {
    const key = this.isRootAgent(conversationId) ? 'root' : conversationId;
    return () => { const list = this.steering.get(key) ?? []; this.steering.delete(key); return list; };
  }

  /**
   * REQ-MONITOR-123/124: graceful, whole-run only; the status reads `pausing` until the current step finishes.
   * PD-ORCH-005: refused while the plan gate holds (clause 11: the durable hold wins). Accepted, it withdraws every approval
   * and question an agent waits on at once (clause 9), arms REQ-ORCH-134's tool deadline for every other call in flight,
   * and stops every child from starting (clause 2); each agent then stops before its next model step.
   */
  pause(): boolean {
    if (this.ended || this.stop.requested || this.pauseRequested || this.planHeld) return false;
    this.pauseRequested = true;
    this.deps.writer.save('pausing');
    this.deps.writer.appendTimeline('run_pause_requested', 'user', 'The user asked the run to pause; the current step finishes first.', {});
    try { this.withdrawPending('pause'); } catch (cause) { this.deps.warn(`withdrawing pending approvals on ${this.sessionId} failed: ${String(cause)}`); }
    // Clause 2: no model call after the pause is accepted, so an agent parked on a provider limit stops waiting now.
    this.waits.releaseForRest();
    this.toolDeadline = this.deps.clocks.timers.after(this.deps.pauseToolDeadlineMs ?? PAUSE_TOOL_DEADLINE, () => this.toolCut.abort());
    this.children?.beginRest();
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
      /*
       * REQ-ORCH-153: "the run MUST produce a plan". The producing role is TOLD that here, and nowhere else —
       * the turn below is the only one a held run takes, and on the first cycle its task is the user's own
       * prompt, which asks for the work rather than for a plan. The preamble reaches the model through the
       * content parts as well as the task string, because an initial turn built from `taskContent` (a prompt
       * with attachments — always, since `Sessions.start` builds one) never reads the task string at all.
       * The root execution record carries what the model was given (REQ-ORCH-072), which is why both are wrapped.
       */
      const preamble = planRequestSection();
      const content: readonly ContentPart[] = [
        { kind: 'text', text: preamble },
        ...(this.deps.taskContent ?? [{ kind: 'text' as const, text: this.deps.task }]),
      ];
      const report = await this.turn(`${preamble}\n\n${this.deps.task}`, 0, content);
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

  /**
   * REQ-MONITOR-009 / REQ-ORCH-133: cancel one child — it and its live descendants stop and settle `cancelled`
   * (`IterationChildren.cancel`, the per-child abort). The reserved run id is the full cancellation, which PD-ORCH-005
   * clause 3 keeps final: REQ-MONITOR-126's cancel control, "cannot be undone in this session" (OQ-69).
   */
  cancelAgent(taskId: string): boolean {
    if (this.ended) return false;
    if (this.isRootAgent(taskId)) {
      // Clause 3: a cancel that lands after teardown can no longer close what the rest left open is refused, not lost.
      if (this.cancelWindowClosed) return false;
      this.stop.request('user_cancelled', false, true);
      return true;
    }
    return this.children?.cancel(taskId) ?? false;
  }

  /**
   * PD-ORCH-005 clause 9: every approval and question every agent of this run waits on, withdrawn by `cause`; each
   * waiting call settles as interrupted and never run, and nothing is denied.
   */
  withdrawPending(cause: Interruption): number {
    let n = 0;
    for (const p of this.ports) n += p.withdrawPending?.(cause) ?? 0;
    if (this.deps.tools && !this.ports.has(this.deps.tools)) n += this.deps.tools.withdrawPending?.(cause) ?? 0;
    return n;
  }

  /**
   * PD-ORCH-005 clause 10: at a rest, what became of the background terminal sessions this session's agents started. A
   * pause leaves the running ones running; a stop and a quit end them (REQ-TOOLS-111). Each is recorded with its state —
   * the rest that ended it, or how it ended by itself — and its last output, so a resumed agent can be told, even after
   * the process that held them is gone.
   */
  private async restTerminals(cause: Interruption): Promise<void> {
    const port = this.deps.terminals;
    if (!port) return;
    const all = port.list();
    // Recorded before any is ended: the kill a stop sends ends each one again, as `killed`, and an end is recorded once.
    for (const t of all) {
      const state = t.status === 'running' && cause !== 'pause' ? cause : t.status;
      this.deps.writer.recordAgentTerminal({ terminal_id: t.id, task_id: t.taskId, command: t.command, started_at: t.startedAt, state, exit_code: t.exitCode, output_tail: t.tail });
    }
    const running = all.filter((t) => t.status === 'running').map((t) => t.id);
    if (cause === 'pause' || running.length === 0) return;
    try { await port.end(running); } catch (cause2) { this.deps.warn(`ending the background terminal sessions of ${this.sessionId} failed: ${String(cause2)}`); }
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
    /*
     * REQ-TOOLS-074: a change that would LOOSEN an agent whose persona pins `permission_mode` does not reach it;
     * the port says so by naming its persona. The SESSION's mode is the requested one either way — a pinned agent
     * keeping its pin does not make the session's change something other than what was asked for, and the agents
     * built after it take the session's (REQ-TOOLS-073). Under PD-TOOLS-002 the effective mode IS the requested
     * one, so it is read from the request rather than from whichever port answered first.
     */
    const skipped = [...new Set(changes.flatMap((c) => (c.skippedPersona === undefined ? [] : [c.skippedPersona])))].sort();
    const effective = change.requested;
    const { writer } = this.deps;
    writer.recordModeChange({
      timestamp: toIsoUtc(this.deps.clocks.wall.instant()), event: 'permission_mode_change', session_id: this.sessionId, agent_id: source,
      requested_mode: change.requested, effective_mode: effective, previous_mode: change.previous, source, reason: change.reason, skipped_personas: skipped,
    });
    // REQ-TOOLS-074: the personas the change did not reach are named wherever the change is — the audit entry above,
    // the log line, and the confirmation the transcript shows the user.
    const kept = skipped.length === 0 ? '' : ` ${skipped.join(', ')} keeps its pinned mode.`;
    writer.appendTimeline('permission_mode_changed', source, `Permission mode changed from '${change.previous}' to '${effective}'${change.reason ? ` — ${change.reason}` : ''}${kept}`, { requested_mode: change.requested, effective_mode: effective, previous_mode: change.previous, ...(skipped.length === 0 ? {} : { skipped_personas: skipped }) });
    if (skipped.length > 0) this.deps.warn(`permission mode '${change.requested}' did not reach ${skipped.join(', ')}: the persona pins a more restrictive mode (REQ-TOOLS-074)`);
    // PD-TOOLS-002: no downgrade — the row states the new mode, never a downgrade reason.
    const row = `Permission mode is now '${effective}'; it applies from the next tool call.${kept}`;
    writer.appendRow('system', row, true);
    this.saveRunning({ permission_mode: effective });
    return { ok: true, effective };
  }

  /** REQ-MONITOR-166: one sample of the cumulative total; the oldest of 120 discarded; a save publishes it. */
  private sampleTokens(save: boolean): void {
    if (this.ended) return;
    this.tokenSamples.push([toIsoUtc(this.deps.clocks.wall.instant()), this.aggregates.totalTokens]);
    if (this.tokenSamples.length > TOKEN_SAMPLE_CAP) this.tokenSamples.splice(0, this.tokenSamples.length - TOKEN_SAMPLE_CAP);
    if (save) this.saveRunning({});
  }

  private saveRunning(extra: { run_started_at?: string | null; permission_mode?: string; sandboxed?: number }, status: 'running' | 'waiting' = this.waits.size > 0 ? 'waiting' : 'running'): void {
    // REQ-MONITOR-124: an accepted pause reads `pausing` until the run has come to rest — a wait the pause releases, or any
    // other save on the way to rest, does not read `running` again (found by phase 3's second review).
    const r = this.deps.writer.save(this.pauseRequested ? 'pausing' : status, {
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
    // PD-ORCH-005 clause 10: a run that comes to rest records its agents' background sessions — a stop and a quit end them,
    // and so does the explicit cancel, which is a stop the user made final (OQ-69). Guarded like every teardown step.
    const ended = this.terminalsEndedBy();
    if (ended !== null) {
      try { await this.restTerminals(ended); } catch (cause) { this.deps.warn(`recording the background sessions of ${this.sessionId} failed: ${String(cause)}`); }
    }
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
    // REQ-HOOKS-003/081: session_end on every exit path, after the status is decided and before shutdown; `classified.result`
    // is the one string the payload, the result and the session.end event below all carry.
    if (this.hooks) {
      try { await this.hooks.fireLifecycle('session_end', { status: classified.result }); } catch (cause) { this.deps.warn(`the session_end hooks raised on ${this.sessionId}: ${String(cause)}`); }
    }
    /*
     * PD-ORCH-005 clause 3: the explicit cancel is final even when it lands after the rest was recorded — while this
     * teardown ended background sessions or ran the hooks. The iteration this run left open closes `cancelled` with every
     * agent it paused, and the background sessions a pause had left running end (found by phase 3's second review) —
     * before the result is built, so every terminal record counts the iteration it closes (the third review). From here
     * the cancel has nothing left to close, and a later one is refused (`cancelAgent`).
     */
    if (this.stop.final) {
      try {
        if (ended === 'pause') await this.restTerminals('stop');
        if (await this.closeOpenIteration(() => 'the run was cancelled after it had come to rest', () => 'Cancelled: the user cancelled the run after it had come to rest.', this.restedIteration) && this.rootRecord) this.rootRecord.state = 'cancelled';
      } catch (cause) { this.deps.warn(`closing the rested iteration of ${this.sessionId} after the cancel failed: ${String(cause)}`); }
    }
    this.cancelWindowClosed = true;
    const result: RunResult = {
      status: classified.result, session_id: this.sessionId, stop_reason: stopReason, summary: summary.message,
      iterations_completed: this.iterationsCompleted, report: null, tokens: this.aggregates.usagePayload().tokens, cost: this.aggregates.usagePayload().cost,
      error, execution_status: status, severity: summary.severity,
    };
    this.result = result;
    try {
    const step = (name: string, fn: () => void) => { try { fn(); } catch (cause) { this.deps.warn(`teardown step ${name} failed on ${this.sessionId}: ${String(cause)}`); } };

    step('run_end', () => { writer.appendTimeline('run_end', 'rotaris', `The run ended ${status}.`, { execution_status: status, stop_reason: stopReason }); });
    step('flush-publications', () => owner.flushPending());
    // (logging cleanup: the session log is not built — REQ-SESSION-142 lands with its own mechanism.)
    step('terminal-transaction', () => {
      // REQ-SESSION-093's row, session.end then result (REQ-SESSION-095), and the terminal save under the held lock.
      // REQ-MONITOR-166: once more at the terminal state, then the sampler goes.
      this.sampler?.cancel();
      this.sampleTokens(false);
      const systemRow = classified.result === 'interrupted' ? (this.pauseRequested && !this.stop.final ? 'Run paused at the user\'s request; continue it from the composer.' : 'Run paused: interrupted by user.')
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

/**
 * REQ-WORKSPACE-047/060 (ADR-0063) — the always-active context units, after the role's instructions and its
 * playbook, in the order the caller supplies. REQ-WORKSPACE-060 fixes that order as **workspace context →
 * skill catalog → force-loaded skill bodies → persona memory**, and the caller is the one place that knows
 * all four; this composes what it is given and adds nothing.
 *
 * It is deliberately a **list** rather than four parameters: two of the four units are not built in this
 * release (workspace-context injection, REQ-WORKSPACE-041..050, and persona memory), and a signature naming
 * them would have to change when they arrive. An empty unit contributes nothing, so a slot that is not
 * filled costs no separator.
 *
 * Applied at the two places a role's prompt becomes an agent's — the entry turn and a child's construction —
 * so REQ-WORKSPACE-065's "every agent built for a session sees the same catalog" holds by construction: the
 * units are a property of the session, composed onto whatever prompt the role resolved.
 */
export function withContextUnits(systemPrompt: string, units: readonly string[]): string {
  const present = units.filter((u) => u.trim() !== '');
  return present.length === 0 ? systemPrompt : [systemPrompt, ...present].join('\n\n');
}

function describe(e: ModelError): string {
  return [e.headline, e.status === undefined ? '' : `HTTP ${e.status}`, e.providerMessage ?? ''].filter(Boolean).join(' — ');
}
