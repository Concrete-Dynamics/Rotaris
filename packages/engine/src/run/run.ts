import { Budget, millis, toIsoUtc, type Clocks, type MachineId, type Millis, type SessionId, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { IterationRow, SessionRow } from '@rotaris/store';
import { DEFAULT_CONTEXT_CAPACITY, interruptionPhrase, isAnswerOnly, type ApprovalOption, type EntryRoot, type EntryToolsPayload, type Interruption, type PermissionPreset, type QuestionAnswers, type QuestionPrompt, type RootExecutionRecord } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ContentPart, ModelError, ModelRef, ThinkingLevel, TurnReport } from '@rotaris/model';
import type { EventBus } from './event-bus.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { Committed, SessionWriter } from '../session-writer.js';
import { Aggregates } from './aggregates.js';
import { classifyStop, HELD_ANSWER_LIMIT, openPlanIds, openPlanItems, planCarryText, planCorrectionText, planHeldRowText, planNotDoneSummary, statusForResult, stopCondition, summarise, TODO_LIST_OWED_TEXT, type StopReason, type TerminalResult } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { mintTodoId, taskLine, taskTitle, Todo, type Task, type TodoDocument } from './todo.js';
import { cut } from './cut.js';
import { planRequestSection, resumedWorkSection } from './plan-text.js';
import { recordSteeringInjected, runTurn, steeringMessage, type ToolPort, type TurnOutcome } from './turn.js';
import { childCompletedFields, IterationChildren, refreshing } from '../children/orchestration.js';
import type { DelegationOps } from '../children/delegation.js';
import type { Budget as ChildBudget } from '../children/ledger.js';
import { canonicaliseName, mintTaskId, takenTaskIds } from '../children/naming.js';
import type { SummariserDeps } from '../children/report.js';
import type { ClaimHit } from '../children/write-scope.js';
import type { CallerPlan } from '../children/todo-item.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import type { CountUsage } from './metered.js';
import type { HookPort, RunNotice } from '../hooks-port.js';
import type { CheckpointPort } from '../checkpoint-port.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { NO_PREFLIGHT_INTENT, type Preflight } from '../preflight.js';
import { clampBudget, storeChildReport, writeCancelledTeardown } from '../children/ledger.js';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { LoopSupervisor } from './supervisor.js';
import { entryInstructionsFor, resolveRole, runOverrideLayer, type Persona, type PersonaResolver } from '../children/personas.js';
import { agentCell, type AgentResilienceCell, type TurnResilience } from './ladder.js';
import { entryOf, excludedModelKeys, helperChoiceOf, isLoaderCopyKey, keyOfPair, overridesInForce, pairKey, providerIdentity, ResilienceMemory, sameRef, withSettings, type CatalogueEntry, type HelperModel, type ModelChoice } from './resilience.js';
import { WaitRegistry, type WaitState } from './waits.js';
import type { ResolvedTrigger, TurnCompression } from './compression.js';
import { ConversationRegistry, type ManualCompressionReport } from './conversations.js'; // Part AO
import { ConversationRecord, personaDefinitionOf } from './record.js';
import { answerOpenCalls, iterationAgents } from './crash.js';
import { callsRun, interruptedResult } from './interruption.js';
import { firstTurn, resumedStart, resumeNoticeOf, type TurnStart } from './resume.js';
import { offersForFirstMessage } from './offers.js';
import { randomUUID } from 'node:crypto';
import { StallWatch, stallRecords } from '../children/stall.js';
import { CHILD_STALL_TIMEOUT_MS } from '../children/cut-off.js';
import { decodeStoredTodo, editAgentTodo, encodeStoredTodo, isAgentTodoDocument, type AgentTodoDocument } from '../todo-view.js';

/** PD-TOOLS-008 revision 2: the held set of an agent with no iteration's children to read. */
const NO_HELD_ITEMS: ReadonlySet<string> = new Set();

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
  /**
   * REQ-CONFIG-094 / REQ-MONITOR-049: the `models:` key `model` was resolved from — what a child that runs on the run's
   * model is recorded under, so its cap and its context limit are found. Absent where no configuration names one (a
   * test, the process-wide model); the model's id then stands in.
   */
  readonly modelKey?: string | undefined;
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

/**
 * OQ-199 as ruled (R-071, PD-ORCH-009): the one message an entry role that ended its turn without writing an answer is
 * sent, as the next user message of its own conversation.
 */
export const ANSWER_REPROMPT = 'You ended your turn without writing an answer. Write your answer to the user now, in plain text: what you did, what you found, and anything left open.';

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
  /**
   * Part B: the tool surface for an agent with a delegation identity (the root and every child). Absent: no delegation.
   * `canonicalName` is the instance name its publishes record as `created_by` (REQ-LIBRARY-093) — the root's, whose
   * `agentName` is its persona; absent for a child, whose `agentName` is its canonical name. `parentPersona` is the persona of
   * the agent that delegated a child (REQ-TOOLS-006 (4), OQ-145); absent for the root.
   */
  readonly toolsFor?: ((persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string, parentPersona?: string) => ToolPort | null) | undefined;
  readonly dal?: StoreDal | undefined;
  /** Part Y (REQ-ORCH-149): the session artifact store, shared across iterations; absent means no artifacts exist. */
  readonly artifacts?: ArtifactStore | undefined;
  readonly budget?: ChildBudget | undefined;
  readonly modelCap?: ((modelKey: string) => number | null) | undefined;
  /**
   * REQ-CONFIG-094: the process-wide half of the per-model count — the slots the process's other sessions hold on a key,
   * a paused child's kept place among them (PD-ORCH-005 clause 4) — and the signal that one of this run's children ended or
   * gave its place up, so another run's held child can be promoted (`ModelSlots`, joined by `Sessions` while the session
   * runs or rests holding a place). Absent: this run is the only one counted.
   */
  readonly modelSlots?: { readonly heldElsewhere: (modelKey: string) => number; readonly freed: () => void } | undefined;
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
   * "continue without them". Absent means decline, and the declined iteration's close and its agents' reports say so; a
   * run with no open iteration ignores it, and only such a run — a new session's — is launched without it. `delivered`
   * is clause 17: the continue delivered a message to the resumed root, which is also appended as a task that closes
   * with the iteration.
   */
  readonly openIteration?: { readonly resume: boolean; readonly delivered?: boolean } | undefined;
  readonly permission: PermissionPosture;
  /** ADR-0015: the session's hooks; null or absent means none exist and nothing about hooks is observable (REQ-HOOKS-041). */
  readonly hooks?: HookPort | null | undefined;
  /**
   * REQ-HOOKS-003 with REQ-ORCH-053: the `child_completed` fields of each child this run settled before it existed — the
   * stale settle (`settleStaleChildren`), made once the run has the session's lock and before its first iteration. The
   * run fires them once its own `session_start` has, so they keep REQ-HOOKS-076's order.
   */
  readonly settledBeforeStart?: readonly Readonly<Record<string, unknown>>[] | undefined;
  /** The host's notice channel (REQ-HOOKS-054/086/087). */
  readonly notice?: ((n: RunNotice) => void) | undefined;
  /** ADR-0039 / REQ-GIT-024/051: the session's checkpoint port; null or absent means no capture at any iteration close. */
  readonly checkpoints?: CheckpointPort | null | undefined;
  /** REQ-ORCH-005: classify, grant, resolve the playbooks — before the coordinator exists. Absent: the fallback intent, no playbook. */
  readonly preflight?: ((signal: AbortSignal) => Promise<Preflight>) | undefined;
  /**
   * OQ-162 as ruled (R-071, `PD-ORCH-005` revision 7 clause 40): the pre-flight of the intent the iteration this run
   * resumes started with, carried and unclassified. Given, it governs that iteration — its root's and its children's
   * grant, playbook and clamp — and `preflight`'s classification governs from the run's next iteration. Absent, `preflight`
   * governs every iteration. Read only by a run that resumes an open iteration.
   */
  readonly resumedPreflight?: ((signal: AbortSignal) => Promise<Preflight>) | undefined;
  /**
   * OQ-162 as ruled (clause 40): `preflight` carries the intent in effect and classifies nothing (the Continue action), so
   * the status never reads `classifying` for it — REQ-ORCH-014 ties that phase to the classification call.
   */
  readonly preflightCarries?: boolean | undefined;
  readonly pid: number;
  readonly host: MachineId;
  readonly readSession: () => SessionRow | undefined;
  readonly warn: (message: string) => void;
  /**
   * A line at `INFO` (the session log, REQ-SESSION-142, and the application log): an intended state — the stall watch's
   * wait or recovery, the children a rest leaves paused (OQ-127's ruling). Absent means such a line goes through `warn`.
   */
  readonly info?: ((message: string) => void) | undefined;
  /** After every save's commit, off the path (REQ-SESSION-028's one file). */
  readonly onSaved?: (generation: number) => void;
  readonly supervisorFor?: ((conversationId: string) => LoopSupervisor) | undefined;
  readonly resumeTodo?: TodoDocument | undefined;
  /**
   * REQ-ORCH-004 / REQ-ORCH-154: false for a plan decision's relaunch, which states no new task — the held run's stored
   * todo already carries every task, the gated work and any continue's message among them (complete, or pending and
   * taken up first), so appending the last request again would duplicate it (OQ-104, the reading kept under PD-ORCH-003
   * revision 2's hold). False too for a continue that states no new request while the todo still holds the last one
   * unfinished: OQ-102's reading, a departure from REQ-ORCH-004 that PD-ORCH-005 clause 25 states since OQ-102's ruling
   * (R-071, 2026-10-06); clause 17 speaks only of the message a continue delivers. Absent means a continuation appends its prompt (REQ-ORCH-004).
   */
  readonly appendsTask?: boolean | undefined;
  /**
   * PD-ORCH-004 revision 4: the offers that were open when the launch content's handoff was built — the ones its list names
   * and the ones it left out as earlier — so an iteration's root re-sent that handoff is told only the offers raised since.
   */
  readonly handoffOffers?: ReadonlySet<string> | undefined;
  readonly initialTodo?: TodoDocument | undefined;
  readonly continuation?: boolean | undefined;
  /** ADR-0036: the configured personas over the built-in table. */
  readonly personas?: PersonaResolver | undefined;
  /**
   * PD-TOOLS-006 revision 6 with REQ-ORCH-028: whether a child of `parentPersona` as `persona` holds an implementation
   * delegation, as the host's tool registry reads its grant (`IterationChildren`'s `implementationRole`). Absent means the
   * engine's own reading of the file-writing tools.
   */
  readonly implementationRole?: ((persona: Persona, parentPersona: Persona | undefined) => boolean) | undefined;
  /** REQ-ORCH-084: the message limit in force for the session; null = disabled. */
  readonly messageLimit?: number | null | undefined;
  /**
   * REQ-ORCH-029 / REQ-ORCH-025: whether the entry role acts as coordinator — every run except one taken under a `single`
   * override, where it is the worker. Absent means it does. Read by `Run.iterate` for REQ-ORCH-029's completion constraint.
   */
  readonly coordinating?: boolean | undefined;
  /**
   * REQ-ORCH-025: the run override chosen where the run is started (`rotaris.delegation_strategy`). `single` reaches the run
   * through `coordinating` and the grant; `swarm` changes the entry role's instruction text only (`runOverrideLayer`).
   * Absent means none.
   */
  readonly runOverride?: 'single' | 'swarm' | null | undefined;
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
  /**
   * REQ-SESSION-092 / REQ-MONITOR-129: settles when the stop's 30 s grace has run out, counted from the first stop request
   * whether or not it was forced. The root's turn is awaited no longer than this (`withinStopGrace`): a root whose call
   * ignores its abort is given up on here, as a rest gives up on a child's execution, so it cannot hold the run and its
   * lock open (the repair of `a-root-call-that-ignores-the-stop-holds-the-run-open.md`).
   */
  private readonly stopGraceSpent: Promise<void>;
  private spendStopGrace: (() => void) | null = null;
  /** When `stopGraceSpent` settles, on the monotonic clock: what is left of the grace is read from it (`stopGraceLeft`). */
  private stopGraceDeadline: Millis | null = null;
  private iterationsCompleted = 0;
  private initialIterations = 0;
  private lastFailure: string | null = null;
  /**
   * REQ-NOTIFY-070 / REQ-NOTIFY-072 / REQ-MONITOR-147: the model the root's failed model call was addressed to — the root
   * cell's model at that moment, after any ladder move — or null when the run's last failure was no root model call's.
   * The automatic fallback pins the fallback against this model (`Sessions.restartOnFallback`); the recovery dialog names
   * it and pins a chosen model against its pair (`Sessions.authRecoveryFacts`, `restartAfterAuthFailure`).
   */
  private failedModel: ModelRef | null = null;
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
  /** The run's `INFO` line (`RunDeps.info`), else its `warn`. */
  private readonly info = (message: string): void => { (this.deps.info ?? this.deps.warn)(message); };
  private children: IterationChildren | null = null;
  /** REQ-ORCH-072: the root agent's own child identity for this iteration. */
  private rootId = 'root';
  private rootIterationId = 'root:1';
  private rootRecord: RootExecutionRecord | null = null;
  /**
   * REQ-MONITOR-044/052 (acceptance A20): the tracker's call count under the current root's name when its execution began,
   * plus each of that execution's calls counted as it completed (OQ-116 as ruled); null once its turn's end has counted the
   * rest, or with no root running.
   */
  private rootUncountedFrom: number | null = null;
  /**
   * PD-ORCH-005 clauses 3 and 4: the name the current root's rows carry — the persona its iteration was opened with
   * (`iterations.root_persona`), so a root resumed as the entry role because that persona is no longer configured (OQ-97)
   * keeps writing under the name its earlier rows and the crash record read (the repair of
   * `a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md`). It is the run's persona otherwise.
   */
  private rootName: string;
  /**
   * Whether the current root's execution is over — its turn returned, raised or was given up on, and no rest left it
   * `paused` to be resumed — so it takes no other step. Set as each root's turn settles and cleared as the next begins;
   * false before the run's first root.
   */
  private rootDone = false;
  /**
   * OQ-199 as ruled (R-071, PD-ORCH-009): the closed iteration whose root was asked once more for an answer and still wrote
   * none, until the person is told. What they are told depends on what follows it: the run ending, or the run going on to
   * another iteration (or parking at its message limit) — so it is said where that is known (`tellUnanswered`).
   */
  private unanswered: { iteration: number; rootName: string; actor: string; taskId: string } | null = null;

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
  private portsClosed = false;
  /**
   * REQ-MONITOR-105 with ADR-0024: whether this run closed its tool ports (`closePorts`, its teardown — and, since OQ-170's
   * ruling on 2026-10-06, its park at the message-limit pause or the plan gate). Until the ruling a parked run closed none,
   * so a call of its that ignored its abort might still be under way, its `tool_calls` ring row `running` that call's and
   * not a dead run's, and the crash record's ring settle was skipped for it; a call that never returned kept its row
   * `running` for good.
   */
  get closedItsPorts(): boolean { return this.portsClosed; }
  /** Live-run finding K1: the port the current iteration's root dispatches through — the one resolution `entryTools` reports. */
  private rootPort: ToolPort | null = null;
  /** REQ-HOOKS-087: the session's hook attachment, removed at the end of the run. */
  private hooks: HookPort | null;
  private preflight: Preflight | null = null;
  /** OQ-162 as ruled: the carried pre-flight the resumed iteration runs under, until it closes; null otherwise. */
  private resumedPreflight: Preflight | null = null;
  /**
   * OQ-162 as ruled (R-071): the pre-flight in effect for the iteration running now — the resumed iteration's carried one
   * while it runs, else the run's own. What the ports are granted, the roles are instructed with and the ledger is clamped by.
   */
  get preflightInEffect(): Preflight | null { return this.resumedPreflight ?? this.preflight; }
  /**
   * REQ-ORCH-014: true while this run's pre-flight classification is in flight, so the status reads `classifying` before
   * the call and is replaced in place by its result. Derived from the live run, as `currentWait` is: a continuation's
   * pre-flight runs with the previous run's intent already on the record (OQ-162), which the status must not go on
   * showing as the intent in effect while the new one is decided.
   */
  private classifying = false;
  get intentClassifying(): boolean { return this.classifying; }
  /** REQ-MONITOR-123: a graceful pause requested; honoured at the next model step and at the iteration boundary. */
  private pauseRequested = false;
  /**
   * OQ-165 (ruled 2026-10-06): the explicit cancel, or the stop (REQ-SESSION-186, `stopAccepted`), was accepted and saved
   * `cancelling`, which every later save keeps until the teardown writes the run's end.
   */
  private cancelSaved = false;
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
  /**
   * PD-ORCH-005 clause 3: teardown has passed the point where the explicit cancel can still close anything. Set just before
   * the terminal transaction writes the run's end, with nothing awaited between, so it also marks the end as written: from
   * here no control of the run is accepted and no save of it writes a non-terminal status over that end (`endWritten`). The
   * teardown is one of the run's three ends; the two rests that are not terminations mark theirs with `restWritten`.
   */
  private cancelWindowClosed = false;
  /**
   * finacc3 F05 (its first verifier): the run's rest is written — the message-limit pause's (`pauseAtLimit`) or the plan
   * gate's park (`parkAtPlanGate`) — set straight after the writer's transaction with nothing awaited between. Like
   * `cancelWindowClosed` at the teardown, it marks the end as written (`endWritten`) while the rest is still forwarded and
   * the `session_end` hooks run, before `ended`.
   */
  private restWritten = false;
  private pausedAtLimit: { count: number; limit: number | null } | null = null;
  /**
   * REQ-ORCH-153: whether this run is held at the plan gate. Settled once, after the pre-flight and before the
   * first thing the gate withholds — or, for a run that resumed an open iteration, once that iteration has closed and
   * before the first new one (PD-ORCH-003 revision 2); never cleared in place, because approval releases execution by
   * launching the next segment (ADR-0062) rather than by flipping a flag under a running turn.
   */
  private planHeld = false;
  /** OQ-213: whether this run has said its entry role holds no `todo` tool (`todoListUnavailable`). */
  private todoListUnavailableTold = false;
  /**
   * REQ-MONITOR-133/134: pending steering per conversation (`root` for the entry role, the task id for a child), each with
   * the name it was announced under, which the not-delivered line repeats (`reportUndeliveredSteering`).
   */
  private readonly steering = new Map<string, { id: string; text: string; name: string }[]>();
  /**
   * REQ-MONITOR-133 with OQ-128: set once no agent of this run will take another step — when the iteration's rest is
   * recorded (after `deliverSteeringAtRest`), or when the run stops stepping (`closeSteering`: teardown, the pause at the
   * message limit, the park at the plan gate) — so a later steer is refused rather than acknowledged for a step nothing
   * would take.
   */
  private steeringClosed = false;
  /**
   * REQ-MONITOR-142: the entry model/reasoning switched mid-run; applied from the next iteration. `key` is the `models:` key
   * the switched model was chosen by, which the root's cell carries (`AgentResilienceCell.key`, `entryModelKey`).
   */
  private entryOverride: { model?: ModelRef; key?: string; thinking?: ThinkingLevel } = {};
  /** Part Q: the waits parked on a provider limit (REQ-NOTIFY-263 reads `current()`), the memory, the catalogue. */
  private readonly waits: WaitRegistry;
  private readonly memory: ResilienceMemory;
  private readonly catalogue: readonly CatalogueEntry[];
  /** The root agent's ladder state for this run (one same-tier fallback, one role fallback — REQ-ORCH-091 b / REQ-ORCH-144). */
  private rootCell: AgentResilienceCell | null = null;
  /**
   * REQ-MONITOR-052/066 with REQ-MONITOR-049: each child's ladder cell of this run, by task id — the latest execution's, with
   * the configured pair and key its row records — so `childModel` names the model a moved child runs on. Until 2026-10-03
   * a child's cell was built unnamed and the record read `children.model_key` alone
   * (docs/defects/fixed/a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md).
   */
  private readonly childCells = new Map<string, { readonly cell: AgentResilienceCell; readonly configured: ModelRef; readonly key: string }>();
  /** REQ-NOTIFY-078: the session's memory changed under the root (a pin taken back), so its cell is rebuilt at its next turn. */
  private entryRebuild = false;
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
  /**
   * PD-ORCH-005 clause 17: the tasks the resumed iteration holds — the message this run's continue delivered, and any an
   * earlier continue delivered to it before it came to rest again — which close with it (OQ-104).
   */
  private resumedMessageIds: readonly string[] = [];
  /**
   * REQ-CHAT-040, REQ-ORCH-004 / REQ-ORCH-135: the todo task the current iteration selected when it is not the run's own
   * and the launch content's request is another — a queued prompt, a task a pause, a stop or a death put back, an earlier
   * request, an improvement run's proposal — sent to its fresh root after the launch content as the task to work on.
   * `message` is PD-ORCH-005 clause 17's continue's message ("so the next iteration takes it up", OQ-102), told in its
   * own words. The repair of `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`.
   */
  private takenUp: { readonly text: string; readonly message: boolean } | null = null;
  /**
   * REQ-ORCH-075 / REQ-ORCH-076: what this iteration's fresh root is told after its task — the items of the coordinator's
   * plan its task's last iteration closed with open (`Task.planLeftOpen`, kept with the task in the stored todo). Empty for
   * a resumed root, which carries on from its record.
   */
  private planCarry: readonly string[] = [];
  /** `PD-ORCH-015`: the answer that iteration wrote, carried beside the marker (`Task.heldAnswer`); none for a resumed root. */
  private planCarryAnswer: string | null = null;
  private appliedEntryModel: ModelRef | null = null;
  /**
   * REQ-MONITOR-142 (OQ-177): the user's entry switch not yet applied to the root's cell, which `rootResilience` applies
   * at the next iteration's turn. A model switch rebuilds the cell on the chosen model even when it names the model
   * already requested, because the ladder may have moved the cell off it (REQ-ORCH-090, REQ-ORCH-091 b); a reasoning
   * switch sets the level on whatever model the cell has. Without it the cell was rebuilt only when the requested model
   * changed, so a switch back onto the configured key, and every reasoning switch, appended a row that was untrue.
   */
  private pendingEntrySwitch: 'model' | 'reasoning' | null = null;
  /**
   * A switch recorded since the root's cell was last settled (`rootResilience`, at the root's next turn): until then a
   * later switch, or the root's own wait choice, replaces it and it never applies. Each record says so (`supersedes`), and
   * each ladder move of the root says whether one is pending at it (`switch_pending`, `TurnResilience.switchPending`),
   * since the autopsy reader cannot see when the root's turns start (the repair of the verifier's away-and-back case of
   * the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback).
   */
  private entrySwitchPending = false;

  constructor(private readonly deps: RunDeps) {
    this.sessionId = deps.sessionId;
    this.rootName = deps.config.persona;
    this.hooks = deps.hooks ?? null;
    this.record = new ConversationRecord(deps.writer, deps.dal, deps.sessionId);
    this.memory = deps.resilience?.memory ?? new ResilienceMemory();
    this.catalogue = deps.resilience?.catalogue ?? [];
    this.waits = new WaitRegistry({ clocks: deps.clocks, onChange: () => this.publishWait() });
    const stored = deps.readSession();
    this.agentTodo = decodeStoredTodo(stored?.todo ?? null).agent;
    this.todo = deps.initialTodo
      ? Todo.seeded(deps.initialTodo, deps.config.consecutiveRetryLimit, new Set([deps.taskId]))
      : deps.resumeTodo
        ? Todo.fromDocument(deps.resumeTodo, deps.config.consecutiveRetryLimit)
        : Todo.fresh(deps.taskId, deps.taskLabel ?? deps.task, deps.config.consecutiveRetryLimit);
    const openRow = deps.dal?.openIterationOf(deps.sessionId) ?? null;
    // PD-ORCH-005 clause 17: a task held by an iteration that is no longer open closes as the record says that iteration
    // did — done when it closed succeeded, pending otherwise — before anything reads the todo; and so does an iteration's
    // own task an earlier build's death left in progress after its iteration closed (`settleClosedIterations`).
    if (deps.dal) settleClosedIterations(this.todo, deps.dal, deps.sessionId, openRow);
    const open = deps.openIteration === undefined ? null : openRow;
    this.resumeFrom = deps.openIteration?.resume === true ? open : null;
    // Clause 4 with OQ-97: a run built to resume an open iteration names its root as that iteration was opened, from the
    // start — a steer before the resumed root's first turn is announced under the name its injection and rows carry.
    if (this.resumeFrom !== null) this.rootName = this.resumeFrom.root_persona;
    this.restedIteration = open?.iteration ?? null;
    /*
     * PD-ORCH-005 clause 17: a continue that resumes an open iteration delivers its message to the resumed root (clause 4)
     * and appends it as a task that iteration holds, closing with it — done when it succeeds, pending otherwise. A continue
     * that resumes and delivers no message (the Continue action) adds no task for a message. Beyond the clause, by OQ-102's
     * reading (a departure from REQ-ORCH-004 that PD-ORCH-005 clause 25 states since the ruling of 2026-10-06): a continue that states no new request while the todo
     * holds the last one unfinished — the Continue action, "continue without them" or the message-limit resolution, after
     * a message was left pending or while the open iteration holds it — adds none either (`appendsTask`, set by the session
     * manager). A plan decision resumes nothing (the iteration closed before the hold) and states no new task, so it
     * appends nothing (`appendsTask`, REQ-ORCH-004 / REQ-ORCH-154, OQ-104).
     */
    if (deps.resumeTodo && this.resumeFrom !== null && deps.openIteration?.delivered === true) {
      this.todo.appendHeld('Continued Prompts', deps.taskId, deps.taskLabel ?? deps.task, this.resumeFrom.iteration);
    } else if (deps.resumeTodo && this.resumeFrom === null && deps.appendsTask !== false) this.todo.appendTask('Continued Prompts', deps.taskId, deps.taskLabel ?? deps.task);
    if (this.resumeFrom !== null) this.resumedMessageIds = this.todo.heldIds(this.resumeFrom.iteration);
    this.aggregates = Aggregates.rehydrate(stored);
    this.lastUsageEmitted = usageTotals(this.aggregates.usagePayload());
    this.tokenSamples = parseTokenSamples(stored?.token_samples ?? '[]');
    // PD-ORCH-005: the count is never below the highest iteration recorded closed, so the next iteration's number is
    // always free even where a process death landed between an iteration's close and the save that counts it.
    const closedIterations = deps.dal?.iterationsOf(deps.sessionId).filter((i) => i.state === 'closed').map((i) => i.iteration) ?? [];
    this.iterationsCompleted = Math.max(stored?.iterations_completed ?? 0, ...closedIterations);
    this.initialIterations = this.iterationsCompleted;
    this.stopGraceSpent = new Promise<void>((resolve) => { this.spendStopGrace = resolve; });
    // Sticky and observable: a request before the loop exists replays here (REQ-SESSION-092).
    this.stop.onRequested((s) => {
      // REQ-MONITOR-012: whatever is blocked on a person is released first, then the run stops. PD-ORCH-005 clause 9: a
      // stop or a quit brings the run to rest, so the waits are WITHDRAWN (the calls interrupted, never denied) and every
      // agent is left paused; only the explicit cancel releases them as REQ-TOOLS-052's cancellation, as before. Clause
      // 15: a stop or a quit during a plan cycle withdraws its waits too, though its agents end (`waitsWithdrawnBy`).
      const rest = this.restCause;
      const withdrawBy = this.waitsWithdrawnBy;
      try { if (withdrawBy !== null) this.withdrawPending(withdrawBy); else this.cancelPending(); } catch (cause) { this.deps.warn(`releasing pending approvals on ${this.sessionId} failed: ${String(cause)}`); }
      if (rest !== null) this.children?.beginRest();
      this.abort.abort();
      // The root's bound: the grace counted from the first request, forced at its first activation or not, so a root that
      // honours the abort a moment after a forced stop still records what its step did.
      const spend = this.spendStopGrace;
      if (spend !== null) {
        this.spendStopGrace = null;
        this.stopGraceDeadline = millis(this.deps.clocks.monotonic.now() + STOP_GRACE);
        this.deps.clocks.timers.after(STOP_GRACE, spend);
      }
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
   * or a quit during a plan cycle ends its agents and records no interruption — PD-ORCH-005 clause 15). A forced stop is
   * a stop (clause 15): `forced` is never read here.
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
  /** REQ-NOTIFY-070 / REQ-NOTIFY-072: the model the root's failing call was addressed to, when the run's last failure was a root model call's. */
  get failedEntryModel(): ModelRef | null {
    return this.failedModel;
  }

  /**
   * REQ-NOTIFY-070 / REQ-MONITOR-147: a root turn's model call failed — an iteration's (`iterate`) or a plan cycle's
   * (`parkAtPlanGate`). The run's last failure and the model the root's cell was calling (after any ladder move) are
   * recorded together, in this one place, so no root turn records the one without the other: a plan cycle's turn did,
   * and its first 401 was never restarted on the fallback.
   */
  private recordRootModelFailure(error: ModelError): void {
    this.lastFailure = describe(error);
    this.failedModel = this.rootCell?.model.model ?? null;
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
  /** REQ-MONITOR-020: a slot freed in another run — this run's scheduler passes, so a child it holds can be promoted. */
  wakeForFreedSlot(): void {
    this.children?.scheduler.pass();
  }
  /**
   * PD-TOOLS-006: the live write-scope claim that refuses the agent `callerId` a write to the workspace-relative
   * `rel`, or null. Read through the iteration's children on every call, so a claim lapses the moment its child
   * settles and a port built before a child was accepted still sees that child's scope.
   */
  writeClaimFor(callerId: string, rel: string): ClaimHit | null {
    return this.children?.writeClaimFor(callerId, rel) ?? null;
  }
  /**
   * PD-TOOLS-008 revision 2 (OQ-249): the items of the agent `callerId`'s plan its non-terminal children hold, outside
   * REQ-TOOLS-145's count; read through the iteration's children at every `todo` call.
   */
  heldTodoItems(callerId: string): ReadonlySet<string> {
    return this.children?.heldTodoItems(callerId) ?? NO_HELD_ITEMS;
  }
  /**
   * PD-TOOLS-008 revision 3 (OQ-254): the items of `callerId`'s plan any of its children serves, terminal ones included; read
   * through the iteration's children at every `todo` call.
   */
  servedTodoItems(callerId: string): ReadonlySet<string> {
    return this.children?.servedTodoItems(callerId) ?? NO_HELD_ITEMS;
  }
  /** REQ-CHAT-006 / REQ-SESSION-026: the session-wide overrides in force, by model key, for the record (`overridesInForce`). */
  get modelOverridesInForce(): { from: string; to: string }[] {
    return overridesInForce(this.catalogue, this.memory);
  }
  /**
   * REQ-NOTIFY-263: the wait the record carries; null while no agent is parked on a provider limit. REQ-MONITOR-194 /
   * REQ-MONITOR-303: with it, the model keys the session holds out of quota (`excludedModelKeys`), read from the memory at
   * every snapshot, so the change-model picker lists them annotated with the reason rather than as any other model; and the
   * waiting pair's own key (`keyOfPair`), which the header's keep waiting chooses in the out-of-quota wait (OQ-188's ruling,
   * PD-MONITOR-004 revision 2).
   */
  get currentWait(): (WaitState & { readonly excluded: string[]; readonly modelKey: string | null }) | null {
    const wait = this.waits.current();
    return wait === null ? null : { ...wait, excluded: this.excludedModelKeys, modelKey: keyOfPair(this.catalogue, wait.provider, wait.model) };
  }
  /**
   * REQ-MONITOR-194: the configured model keys the session holds out of quota, for the record's `excludedModels` — read
   * from the memory at every snapshot, inside a wait and outside one, so every model selector can annotate them.
   */
  get excludedModelKeys(): string[] {
    return excludedModelKeys(this.catalogue, this.memory.exhausted);
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
   *
   * REQ-MONITOR-049: the limit is the maximum input of the model the root's ladder cell calls — after a same-tier or
   * unresponsive-model move (REQ-ORCH-090, REQ-ORCH-091 b) or an override it follows (REQ-ORCH-091 d) — and the requested
   * model's only before the cell exists. (Until 2026-10-02 it was always the requested model's:
   * the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on.)
   */
  get entryContext(): { readonly used: number; readonly limit: number } {
    const model = this.rootCell?.model.model ?? this.entryOverride.model ?? this.deps.config.model;
    const advertised = this.deps.compression?.triggerFor(model).advertisedInputLimit ?? null;
    return { used: this.deps.writer.activity.contextUsed(this.rootName), limit: advertised !== null && advertised > 0 ? advertised : DEFAULT_CONTEXT_CAPACITY };
  }
  /**
   * REQ-MONITOR-117/119/120: the entry agent's stalled figure — the seconds of silence its stall watch's latest evaluation
   * found while it finds the root stalled, else null — kept beside its tools in the writer's activity tracker.
   */
  get entryStalledSeconds(): number | null {
    return this.deps.writer.activity.stalledSeconds(this.rootName);
  }
  /**
   * REQ-MONITOR-044/052 (the repair of `the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md`, acceptance
   * A20, R-067): the calls the current root has started in this execution that the session's total does not hold yet. Since
   * OQ-116's ruling (R-071, `PD-ORCH-008`) each call joins the total as it completes, and the rest when its turn returns, or
   * from its record when it never does; until then they are the tracker's count under the name it dispatches as (`rootName`)
   * less that count when the execution began, moved on by each call counted (`countRootCall`) — so, during a pass, its calls
   * in flight. Zero once they are counted, so the run-level agent's figure (`entryToolCallsOf`) never holds a call twice.
   */
  get entryUncountedToolCalls(): number {
    return this.rootUncountedFrom === null ? 0 : Math.max(0, this.deps.writer.activity.callCount(this.rootName) - this.rootUncountedFrom);
  }
  /**
   * REQ-MONITOR-086 with REQ-SESSION-139: the run-wide compression count as the run maintains it (ADR-0008) — rehydrated from
   * the session's row and raised at every completion, the roots' and every child's, so it leads the stored figure until the
   * pass's save copies it there. `runCompressionsOf` reads it for `SessionRecord.compressions` while this run is live.
   */
  get compressions(): number {
    return this.aggregates.figures.compressions;
  }
  /**
   * REQ-MONITOR-060/061 (live-run finding K1, R-067): the entry role's tools as the run-level agent presents them — the native
   * set its port's one resolution kept (policy narrowing applied), and its called and in-flight tools from the tracker the
   * writer feeds, keyed by the name the root dispatches under (`rootName`, as `entryContext` reads it). Not the run's
   * persona: a root resumed as the entry role keeps the persona its iteration was opened with (OQ-97), and read by the entry
   * role's name its calls were never found (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md).
   * Like `entryContext`, the entry role has no `children` row.
   */
  get entryTools(): EntryToolsPayload {
    const name = this.rootName;
    const activity = this.deps.writer.activity;
    return { resolved: [...(this.rootPort?.resolvedTools?.() ?? [])], called: activity.calledTools(name), active: activity.activeTools(name) };
  }
  /**
   * PD-ORCH-005 clause 4 with OQ-97, and REQ-LIBRARY-093: the root this run executes, or executed last, by the name its rows
   * and calls carry (`rootName`) and its canonical instance name — what `SessionRecord.entryRoots` adds, while the run is
   * live, for a root with no iteration row, a plan cycle's. The session lets go of the run once it parks or ends, and such
   * a root is then named by the record its turn's start wrote (`plan_roots`, store v30) — before v30 by its publishes alone,
   * so one that only read was no agent's at the gate (`entryRootsOf`). Null before the run's first turn.
   */
  get currentRoot(): EntryRoot | null {
    return this.rootRecord === null ? null : { name: this.rootName, canonical: this.rootRecord.canonicalName };
  }
  /**
   * REQ-MONITOR-057/060 with PD-ORCH-003: the persona this run's root runs as — the persona its rows carry and its port
   * resolves `entryTools` for, a resumed root's included (it keeps its name, `rootName`, and runs as the entry role, OQ-97).
   * `SessionRecord.entryPersona`, so the run-level agent is named from the root whose tools its chips show before that root
   * has written a row (the second repair of
   * `after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`).
   */
  get entryPersona(): string {
    return this.deps.config.persona;
  }
  /**
   * REQ-MONITOR-052 / REQ-MONITOR-066 / REQ-MONITOR-069: the configured model key of the pair the root's ladder cell calls —
   * after a same-tier or unresponsive-model move (REQ-NOTIFY-082, REQ-ORCH-091 b, REQ-ORCH-090), a pre-call move off a pair
   * held out of quota (REQ-MONITOR-194) or an override it follows (REQ-ORCH-091 d), none of which writes the configuration —
   * so the run-level agent's Model names the model the root runs on (`SessionRecord.entryModelKey`), as `entryContext` reads
   * its limit from that cell (REQ-MONITOR-049). The key the cell carries (`AgentResilienceCell.key`, set at every assignment
   * of its model) when that is a configured key — so two configured keys for one pair are told apart; else the configured
   * key for the cell's pair where one names it — the keys the model selectors list — else the entry the move took it to (a
   * discovered tier pick, `scripted-b/beta` in resilience-proof). Null before the cell exists, or for a pair no catalogue
   * entry and no carried key names. (Until the first repair round of 2026-10-03 the carried key did not exist and the first
   * configured key for the pair was named, a-fast for a root configured on a-deep.) Until
   * 2026-10-03 the inspector named the configured key or the override in force while the root ran on a candidate
   * (docs/defects/fixed/the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md).
   */
  get entryModelKey(): string | null {
    const cell = this.rootCell;
    return cell === null ? null : this.keyOfCell(cell);
  }
  /**
   * The configured key that names the model a ladder cell runs on — `entryModelKey`'s rule, which `childModel` shares: the
   * carried key when it is a configured, non-copy key, else the configured key for the cell's pair, else the carried key or
   * the catalogue entry the move took it to; null when nothing names the pair.
   */
  private keyOfCell(cell: AgentResilienceCell): string | null {
    const model = cell.model.model;
    // The key the cell carries — set at every assignment of its model — when it is a configured key: two keys may name one
    // provider's model, each with its own thinking, and only the carried key tells them apart.
    const listed = (e: CatalogueEntry): boolean => e.origin === 'configured' && !isLoaderCopyKey(e.key);
    const carried = cell.key === null ? undefined : this.catalogue.find((e) => e.key === cell.key);
    if (carried !== undefined && listed(carried)) return carried.key;
    // Else by pair, as the exclusions are keyed (`excludedModelKeys`): a discovered tier pick, a loader-made copy (a slot's
    // reasoning synthesis, which carries a tier role and so can be a same-tier candidate) or a role's fallback (which carries
    // no key) is named by the configured key for its pair where one names it — a configured key and a discovered pick for
    // one provider's model can carry different dispatch references.
    const pair = pairKey(providerIdentity(this.catalogue, model), model.modelId);
    return (this.catalogue.find((e) => listed(e) && pairKey(e.provider, e.model.modelId) === pair) ?? carried ?? entryOf(this.catalogue, model))?.key ?? cell.key;
  }
  /**
   * REQ-MONITOR-052 / REQ-MONITOR-066 / REQ-MONITOR-069 with REQ-MONITOR-049: the key a child's ladder cell of this run runs
   * on, and that model's maximum input, once the cell has left the pair and key its row records — a same-tier move after a
   * quota or rate-limit answer or before the call off a pair held out of quota (REQ-ORCH-091 b, REQ-NOTIFY-082,
   * REQ-MONITOR-194), the unresponsive-model fallback (REQ-ORCH-090), REQ-ORCH-088's timeout fallback, a model chosen during
   * its wait, or an override it follows (REQ-ORCH-091 a/d) — so `toAgentRecord` names it in the inspector's Model and the
   * persona window and measures the context ring against it, as the run-level agent's are (`entryModelKey`, `entryContext`).
   * Null for a child this run has not executed, or one still on its recorded pair and key: the row's `model_key` stands.
   * The limit is null where the model advertises none, and the caller looks the key up instead.
   */
  childModel(taskId: string): { readonly key: string; readonly limit: number | null } | null {
    const held = this.childCells.get(taskId);
    if (held === undefined) return null;
    const { cell, configured, key } = held;
    if (sameRef(cell.model.model, configured) && cell.key === key) return null;
    const named = this.keyOfCell(cell);
    if (named === null) return null;
    const advertised = this.deps.compression?.triggerFor(cell.model.model).advertisedInputLimit ?? null;
    return { key: named, limit: advertised !== null && advertised > 0 ? advertised : null };
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

      // REQ-SESSION-087, in order and observably. PD-ORCH-005 clause 17: the todo with it, so a continue's message task
      // survives a process that dies during the pre-flight, as the message itself does in the resumed root's record.
      // REQ-ORCH-014: set before the save that publishes `starting`, so that snapshot already reads `classifying`.
      this.classifying = this.deps.preflight !== undefined && this.deps.preflightCarries !== true;
      writer.save('starting', { todo: this.todoJson() });
      this.startedAt = clocks.monotonic.now();
      /*
       * REQ-CHAT-158 / REQ-SESSION-154: the run's wall-clock start is this `starting` save, the pre-flight inside it, for a
       * continuation as for a launch. Read back here, before the pre-flight, since a continuation's "Intent classified" row
       * moves the row's `updated_at` past the classification (live-run finding G8: 8.6 s dropped from a 64.9 s run).
       */
      const runStartedAt = this.deps.readSession()?.updated_at ?? null;
      // REQ-ORCH-005: the intent is in effect before the first iteration; while it is being decided the session reads `classifying`.
      if (this.deps.preflight) {
        try { this.preflight = await this.deps.preflight(this.abort.signal); } catch (cause) { this.deps.warn(`the pre-flight raised and the run continues on the fallback intent: ${String(cause)}`); }
        finally { this.classifying = false; }
      }
      // OQ-162 as ruled (R-071, PD-ORCH-005 revision 7 clause 40): the iteration this run resumes keeps the intent it started with.
      if (this.deps.resumedPreflight && this.resumeFrom !== null) {
        try { this.resumedPreflight = await this.deps.resumedPreflight(this.abort.signal); } catch (cause) { this.deps.warn(`the resumed iteration's pre-flight raised and it continues on this run's intent: ${String(cause)}`); }
      }
      if (this.deps.continuation) this.appendIntentRow(this.preflightInEffect);
      /*
       * REQ-ORCH-153: the hold is settled HERE — after the pre-flight, so the answer group is known, and ahead of
       * everything the gate withholds: the tool ports the first turn builds, the first hook command (`session_start`
       * below) and any child. "Where the classified intent is not a member of the answer group of REQ-ORCH-021" is
       * the one exemption; a run with no pre-flight falls back to `moderate_feature`, which is outside it, so a
       * plan-mode run with no classifier still holds rather than silently proceeding.
       */
      // PD-ORCH-003 revision 2: a run that resumes an open iteration runs it without holding, since it is work already
      // under way; a gate that would hold the run holds before the first new iteration instead (the loop below).
      const gated = this.deps.plan !== undefined && !isAnswerOnly((this.preflight?.intent ?? NO_PREFLIGHT_INTENT).category);
      this.planHeld = gated && this.resumeFrom === null;
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
      const auditPayload = this.intentAudit(this.preflightInEffect);
      if (this.deps.continuation) {
        // OQ-162 as ruled: a resumed iteration's carried intent is the one in effect; the request's classification is
        // recorded beside it, and in effect once that iteration closes (`nextIntentInEffect`).
        const next = this.resumedPreflight !== null ? { next_run_intent: this.preflight?.intent ?? NO_PREFLIGHT_INTENT } : {};
        writer.appendTimeline('run_continuation_intent', 'rotaris', `Continuation intent: ${auditPayload.run_intent.category}.`, { ...auditPayload, ...next });
      }
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
      this.saveRunning({ run_started_at: runStartedAt, permission_mode: perm.effective, sandboxed: perm.sandboxed ? 1 : 0, sandbox_backend: perm.sandboxed ? perm.sandboxBackend : '' });
      // REQ-MONITOR-166: sampled by the run, not by a view — the cadence from the clock port, never a bare timer.
      this.sampler = clocks.timers.every(TOKEN_SAMPLE_PERIOD, () => this.sampleTokens(true));
      await this.drain();
      // REQ-HOOKS-003/081: session_start once, ahead of the first iteration, in line with the loop (REQ-HOOKS-080).
      if (this.hooks) await this.hooks.fireLifecycle('session_start', { task: this.deps.task });
      // REQ-HOOKS-003 / REQ-ORCH-053: the children this run's stale settle ended, each in line, before anything else runs.
      for (const fields of this.deps.settledBeforeStart ?? []) await this.childCompleted(fields);

      // PD-ORCH-005 clauses 4 and 6: an iteration a previous run left open resumes before anything else runs, as the
      // loop's first iteration below; declined, it closes here.
      if (this.resumeFrom === null) {
        await this.closeLeftOpenIteration();
        // REQ-CONFIG-094 with PD-ORCH-005 clause 6: a declined iteration's paused agents gave up the places they kept, so
        // another session's child held on one may start (OQ-149).
        this.deps.modelSlots?.freed();
      }
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
          /*
           * PD-ORCH-003 revision 2: re-arming asks for a plan before new work, and the resumed iteration was not new work.
           * A run that resumed one, and that the gate would hold, holds HERE — once that iteration has closed and the stop
           * conditions found work left, before the first new iteration begins and before anything this segment withholds
           * (its turn builds its ports under the hold). The pause, the stop and the message limit checked above win.
           */
          if (gated && this.resumeFrom !== null) {
            this.tellUnanswered(false);
            this.planHeld = true;
            return await this.parkAtPlanGate(this.resumeFrom.iteration);
          }
        }
        // OQ-199 (PD-ORCH-009): an iteration the run goes on from is said to have ended without an answer, not the run.
        this.tellUnanswered(false);
        const escalated = await this.iterate(resuming);
        // OQ-162 as ruled: once the resumed iteration has closed, the run's own classification governs the next.
        if (resuming !== null && this.resumedPreflight !== null && this.deps.dal?.openIterationOf(this.sessionId)?.iteration !== resuming.iteration) this.nextIntentInEffect();
        resuming = null;
        if (escalated) { stopReason = 'agent_session_aborted'; break; }
        // REQ-ORCH-085/087: the limit in force is checked at the boundary; the pause is recorded durably before the loop stops.
        const limit = this.deps.messageLimit ?? null;
        if (limit !== null && this.iterationsCompleted >= limit && !this.stop.requested) { this.tellUnanswered(false); return await this.pauseAtLimit(limit); }
      }
      return await this.teardown(stopReason ?? 'no_pending_tasks');
    } catch (cause) {
      // REQ-SESSION-094: teardown runs even on any exception; REQ-SESSION-093: a runtime exception persists failed.
      if (this.lastFailure === null) this.failedModel = null;
      this.lastFailure = this.lastFailure ?? String(cause);
      this.deps.warn(`run ${this.sessionId} raised outside an iteration: ${String(cause)}`);
      return await this.teardown('agent_session_aborted');
    } finally {
      // The pause's tool deadline outlives no run, whichever way it ended.
      this.toolDeadline?.cancel();
    }
  }

  /** REQ-SESSION-138 / REQ-ORCH-027: the audit payload of an intent — the launch audit's, and every continuation entry's. */
  private intentAudit(p: Preflight | null) {
    return {
      session_id: this.sessionId, workspace_root: this.deps.workspaceRoot, created_at: this.deps.readSession()?.created_at ?? null,
      run_intent: p?.intent ?? NO_PREFLIGHT_INTENT, intent_grant: p?.grant ?? 'none',
      permission_mode: this.deps.permission.effective, check_suite: null, resolved_playbooks: p?.resolvedPlaybooks ?? {}, hooks: this.hooks?.auditSnapshot() ?? [], config_snapshot: this.deps.configurationSnapshot ?? {},
    };
  }

  /** REQ-SESSION-114 / REQ-ORCH-014: a continuation's intent row, with the carried-over suffix where it applies. */
  private appendIntentRow(p: Preflight | null): void {
    const intent = p?.intent ?? NO_PREFLIGHT_INTENT;
    this.deps.writer.appendRow('system', `Intent classified: ${intent.category}${intent.carried_over ? ' (continued from previous run)' : ''}`, true);
  }

  /**
   * OQ-162 as ruled (R-071, PD-ORCH-005 revision 7 clause 40): the resumed iteration closed, so the intent this run's
   * request was classified as comes into effect for the run's next iteration — recorded as a continuation intent with its
   * row, so the status (REQ-ORCH-014) and REQ-ORCH-013's prior intent read it from here on. An iteration a rest left open
   * again keeps its carried intent, and this is not reached.
   */
  private nextIntentInEffect(): void {
    this.resumedPreflight = null;
    const audit = this.intentAudit(this.preflight);
    this.deps.writer.appendTimeline('run_continuation_intent', 'rotaris', `Continuation intent: ${audit.run_intent.category}.`, audit);
    this.appendIntentRow(this.preflight);
    this.saveRunning({});
  }

  /**
   * OQ-199 as ruled (R-071, PD-ORCH-009): the person is told, once, that the closed iteration's root wrote no answer even when
   * asked once more — in the transcript and as a warning issue (REQ-ORCH-139's `incomplete_execution`). `runEnds` is whether
   * the run ends after it: then the run ended without an answer; otherwise the run goes on (another iteration, a queued
   * prompt, a pause at the message limit), and only that iteration did.
   */
  private tellUnanswered(runEnds: boolean): void {
    const u = this.unanswered;
    if (u === null) return;
    this.unanswered = null;
    const message = `${runEnds ? 'The run' : `Iteration ${u.iteration}`} ended without an answer: ${u.rootName} ended its turn without writing one, even when asked once more.`;
    this.deps.writer.recordIssue({ kind: 'incomplete_execution', severity: 'warning', actor: u.actor, message, metadata: { task_id: u.taskId, iteration: u.iteration, reprompted: true, run_ended: runEnds } });
    this.deps.writer.appendRow('system', message, true);
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
    // The task this iteration selected is its task even when the run was launched by another request: the launch content
    // is the base of every iteration, so a task that is not the run's own is sent beside it — unless the launch content's
    // request is that same text, when the launch content already says it (REQ-CHAT-040; PD-ORCH-005 clause 17 and OQ-102
    // for a continue's message). The run's own task is the launch content's request. A resumed root carries on from its
    // record and is sent no launch content, so for it this is never read.
    this.takenUp = task.id !== this.deps.taskId && task.text !== (this.deps.taskLabel ?? this.deps.task) ? { text: task.text, message: task.message === true } : null;
    // REQ-ORCH-075 (OQ-203): what the task's first take-up finds open is not held against it; the items its own previous
    // iteration closed with open reach this iteration's fresh root, and no other task's. Both are kept with the task.
    this.takeUp(task, resume !== null);
    this.planCarry = resume ? [] : storedIds(task.planLeftOpen);
    this.planCarryAnswer = resume ? null : storedText(task.heldAnswer);
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
    /** REQ-ORCH-075: the root answered succeeded with items of its plan open, and the task was returned for them. */
    let leftPlanOpen = false;
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
        this.todo.releaseHeld(iteration, false);
        summary = 'the run was cancelled before the agent finished';
        if (this.rootRecord) this.rootRecord.state = 'cancelled';
      } else if (this.pauseRequested) {
        // REQ-MONITOR-123: the current step finished; the task stays pending for the continuation.
        outcome = 'cancelled';
        task.state = 'pending';
        this.todo.releaseHeld(iteration, false);
        summary = 'the run paused at the user\'s request before the agent finished';
        if (this.rootRecord) this.rootRecord.state = 'cancelled';
      } else if (report.status === 'succeeded' && this.openRootPlan(task).length > 0) {
        /*
         * REQ-ORCH-029: the coordinator does not report the run successful while an item of its plan is non-terminal, and
         * REQ-ORCH-069 / REQ-ORCH-082 read success off the planner's tasks — so this task is not marked complete. REQ-ORCH-075's
         * re-queue of the same task, once REQ-ORCH-078's corrections are spent (`turn`), with the open items told to its next
         * iteration's root; at REQ-ORCH-077's retry limit it is given up on, and the run reads failed rather than completed
         * (live-run finding G5).
         */
        const open = this.openRootPlan(task);
        outcome = this.todo.requeue(task) === 'abandoned' ? 'abandoned' : 'partial';
        this.todo.releaseHeld(iteration, false);
        summary = planNotDoneSummary(open);
        task.planLeftOpen = open;
        // PD-ORCH-015 (extending REQ-ORCH-075): the answer the person was shown goes with the task to its next fresh root.
        const held = report.text.trim().slice(0, HELD_ANSWER_LIMIT);
        if (held === '') delete task.heldAnswer;
        else task.heldAnswer = held;
        leftPlanOpen = true;
        this.deps.warn(`iteration ${iteration}: ${summary}; its task is ${outcome === 'abandoned' ? 'given up on at the retry limit' : 'returned to the pending queue'} (REQ-ORCH-029)`);
        // PD-ORCH-015, building REQ-ORCH-067's iteration-end visibility: the person is told, under the answer, why it is held.
        writer.appendRow('system', planHeldRowText(iteration, open, outcome === 'abandoned'), true);
        if (outcome === 'abandoned') { this.lastFailure = summary; this.failedModel = null; }
        if (this.rootRecord) this.rootRecord.state = outcome === 'abandoned' ? 'failed' : 'succeeded';
      } else if (report.status === 'succeeded') {
        outcome = 'succeeded';
        this.todo.complete(task);
        // PD-ORCH-005 clause 17: a continue's message the resumed iteration held is done with it, before completion is judged.
        this.todo.releaseHeld(iteration, true);
        if (this.rootRecord) this.rootRecord.state = 'succeeded';
      } else if (report.status === 'partial') {
        outcome = this.todo.requeue(task) === 'abandoned' ? 'abandoned' : 'partial';
        // PD-ORCH-005 clause 17: not done, so a continue's message the iteration held is left pending for the next.
        this.todo.releaseHeld(iteration, false);
        if (this.rootRecord) this.rootRecord.state = outcome === 'abandoned' ? 'failed' : 'succeeded';
      } else {
        // REQ-ORCH-074: failed → the task is abandoned; for the root agent the run ends agent_session_aborted.
        outcome = 'failed';
        this.recordRootModelFailure(report.error);
        summary = this.lastFailure ?? describe(report.error);
        this.todo.abandon(task);
        this.todo.releaseHeld(iteration, false);
        escalate = true;
        if (this.rootRecord) this.rootRecord.state = 'failed';
      }
    } catch (cause) {
      if (this.iterationRest === null) {
        // REQ-ORCH-073 / REQ-ORCH-135: an iteration that raises closes as failed, the task abandoned.
        this.lastFailure = String(cause);
        this.failedModel = null;
        summary = `the iteration ended with an unhandled error: ${String(cause)}`;
        this.todo.abandon(task);
        this.todo.releaseHeld(iteration, false);
        escalate = true;
        if (this.rootRecord) this.rootRecord.state = 'failed';
      } else {
        this.deps.warn(`iteration ${iteration} raised while coming to rest, and is left open to be resumed: ${String(cause)}`);
      }
    }
    if (this.iterationRest !== null) return await this.leaveIterationOpen(iteration, this.iterationRest);
    // REQ-ORCH-075: a task completed or given up on carries nothing further, to its own iterations or any other task's; an
    // iteration that closed for another reason than its plan left open leaves nothing to tell the next (a cancelled one
    // did not finish, and the items the one before it left open still stand).
    if (task.state === 'complete' || task.state === 'abandoned') { delete task.planLeftOpen; delete task.heldAnswer; delete task.planExcused; delete task.workItems; delete task.listWritten; }
    else if (outcome !== 'cancelled' && !leftPlanOpen) { delete task.planLeftOpen; delete task.heldAnswer; }
    // PD-ORCH-005 clause 1: `iteration.end` and the iteration's record closing with its outcome, in one transaction — with
    // the todo its task and held messages were just closed in, so no death before the save below strands them in progress.
    /*
     * REQ-ORCH-139's `iteration_end` timeline entry, carrying REQ-ORCH-067's iteration number, task, outcome and summary: the
     * record REQ-SESSION-115's follow-up payload reads for "the last 5 outer-loop iterations" (`buildContinuationPayload`).
     * Nothing wrote it before, and that block always read "(none recorded)" (live-run finding P4). An iteration a rest leaves
     * open has not ended and writes none (`leaveIterationOpen`). Since fin34 it commits in the transaction that closes the
     * iteration, so no death between two writes leaves a closed iteration without it.
     */
    const title = cut(taskTitle(task), 80);
    writer.endIteration(iteration, { task: task.text, outcome, summary }, outcome, this.todoJson(), { message: `Iteration ${iteration} (${title}): ${outcome}${summary.trim() === '' ? '' : ` — ${summary.trim()}`}`, metadata: { iteration, task_id: task.id, task: title, outcome, summary } });
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

  /**
   * The first message of a fresh root: the launch content, and — for an execution iteration's root, never a plan cycle's
   * (REQ-ORCH-153: a plan cycle is not an iteration and takes up no offer or task) — PD-ORCH-004 revision 4's list of the
   * open continuation offers that content does not already hold, as a text part after it. A continuation's first
   * iteration holds them all in its handoff — those it names and those it left out (`handoffOffers`); each later
   * iteration of the same run is told those raised since (OQ-107). Between the two, the todo task the iteration selected
   * when it is not the run's own and the launch content's request is another (`takenUp`) — a continue's message among
   * them (PD-ORCH-005 clause 17, OQ-102).
   */
  private firstMessage(task: string, launch: readonly ContentPart[] | undefined, execution: boolean): readonly ContentPart[] | undefined {
    const base = launch ?? [{ kind: 'text', text: task }];
    // The task this iteration selected, when the launch content is another request's. Only `iterate()` sets it. A plan
    // cycle is not an iteration and has no iteration task (REQ-ORCH-153), and PD-ORCH-003 revision 2's plan cycle runs
    // after the resumed iteration's `iterate()` has set it — so only an execution root is told it (found by the iteration
    // lane review). With no launch content the base is already the selected task's own text (`iterate()`'s `modelTask`).
    const takenUp: ContentPart[] = !execution || launch === undefined || this.takenUp === null ? [] : [{ kind: 'text', text: takenUpText(this.takenUp) }];
    // REQ-ORCH-068 with REQ-ORCH-029: the items of its plan the previous iteration left open, after the task.
    const carry: ContentPart[] = !execution || this.planCarry.length === 0 ? [] : [{ kind: 'text', text: planCarryText(this.planCarry, this.planCarryAnswer) }];
    const offers = execution && this.deps.dal ? offersForFirstMessage(this.deps.dal, this.sessionId, base, this.deps.handoffOffers) : null;
    if (offers === null && takenUp.length === 0 && carry.length === 0) return launch;
    return [...base, ...takenUp, ...carry, ...(offers === null ? [] : [offers])];
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
    // The summary is the decline's (PD-ORCH-005 clause 6), whatever left the iteration open: clause 18's "continue without
    // them" declines a crash-left iteration after recording the crash, so a crash is the user's decline too, and names
    // what left the agents paused as its agents' reports do. Every run that reaches here was told to decline: a run is
    // told nothing only when it opens a new session (`Sessions.start`), where no iteration is open (`RunDeps.openIteration`).
    const closed = await this.closeOpenIteration((open) => `the session was continued without the agents ${interruptionPhrase(open.interruption ?? 'crash')} had left paused`,
      (c) => `Cancelled: the session was continued without this agent, which ${interruptionPhrase(c.interruption ?? '')} had left paused.`, undefined, true);
    if (!closed) return;
    this.initialIterations = this.iterationsCompleted;
    this.saveRunning({});
  }

  /**
   * The open iteration closes `cancelled` with every agent it left paused, each with `agentReport`'s words: its todo task
   * back to `pending` and `iteration.end` and the row's close with that todo in one transaction, its capture, and the
   * count moved past it.
   * `only` names the one iteration the caller may close. False when none is open, or the open one is not that one.
   * `completed`: each agent it cancels fires `child_completed` (REQ-HOOKS-003), in line, before the iteration closes — the
   * decline's close, which runs after this run's `session_start`. The explicit cancel's close after the run's
   * `session_end` fires none (OQ-154).
   */
  private async closeOpenIteration(summary: (open: IterationRow) => string, agentReport: (c: ChildRow) => string, only?: number | null, completed = false): Promise<boolean> {
    const dal = this.deps.dal;
    const open = dal?.openIterationOf(this.sessionId);
    if (!dal || !open || (only !== undefined && open.iteration !== only)) return false;
    const cancelled = this.cancelPausedAgents(dal, open, agentReport);
    if (completed) for (const c of cancelled) await this.childCompleted(childCompletedFields(dal.getChild(this.sessionId, c.task_id) ?? c));
    this.todo.reopen(open.todo_task_id);
    // PD-ORCH-005 clause 17: a continue's message the iteration held is left pending, so the next iteration takes it up.
    this.todo.releaseHeld(open.iteration, false);
    // The close and the todo it leaves in one transaction, as `iterate()`'s close is.
    this.deps.writer.endIteration(open.iteration, { task: this.todo.textOf(open.todo_task_id) ?? open.task, outcome: 'cancelled', summary: summary(open) }, 'cancelled', this.todoJson());
    // REQ-GIT-051: the iteration closes here, so its one capture is attempted here — it records the work done in it. No
    // child is credited: none finished the iteration. Its hooks' `iteration_end` is not fired: an iteration left open by
    // an earlier run began under that run's hooks, and one this run left open ends with the run.
    await this.captureCheckpoint(open.iteration, '');
    this.iterationsCompleted = Math.max(this.iterationsCompleted, open.iteration);
    return true;
  }

  /**
   * PD-ORCH-005 clause 6's "continue without them": every `paused` agent of the open iteration ends `cancelled`, with a
   * report saying so, before the iteration closes as cancelled. Until the resume is built this is what every continue
   * does with an iteration a rest left open; once it is, only the user's declining does.
   */
  private cancelPausedAgents(dal: StoreDal, open: IterationRow, report: (c: ChildRow) => string): ChildRow[] {
    const cancelled: ChildRow[] = [];
    for (const c of iterationAgents(dal, this.sessionId, open)) {
      if (c.state !== 'paused') continue;
      const r = this.deps.writer.transitionChild(c.task_id, 'cancelled', 'cancellation');
      if (!r.ok) { this.deps.warn(r.error.code === 'illegal-move' ? r.error.reason : `cancelling paused ${c.task_id} failed: ${r.error.code}`); continue; }
      // REQ-LIBRARY-092: the report is materialised as every terminal child's is.
      const stored = { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: report(c), key_findings: [], last_response: '', final_response: '', errors: [] };
      storeChildReport({ writer: this.deps.writer, artifacts: this.deps.artifacts, warn: this.deps.warn }, c.task_id, c, stored);
      // REQ-ORCH-098: torn down as every terminal child is (OQ-152).
      writeCancelledTeardown(this.deps.writer, c, stored);
      cancelled.push(r.value);
    }
    return cancelled;
  }

  /**
   * REQ-HOOKS-003: one `child_completed`, in line (REQ-HOOKS-080), for a child this run ended outside an iteration's
   * children — the stale settle's and the decline's. A raise out of the port reduces to a warning (REQ-HOOKS-079).
   */
  private async childCompleted(fields: Readonly<Record<string, unknown>>): Promise<void> {
    if (!this.hooks) return;
    try { await this.hooks.fireLifecycle('child_completed', fields); }
    catch (cause) { this.deps.warn(`the child_completed hooks raised for child ${String(fields['child_name'])} (${String(fields['child_id'])}): ${String(cause instanceof Error ? cause.message : cause)}`); }
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
   *
   * REQ-MONITOR-080 / REQ-MONITOR-079: `current` is read at each pass — the model the agent's cell calls next (`callsOn`) —
   * so a ladder move within the turn moves the compressing model (unless `compression.model` is configured) and the
   * trigger with it. Until 2026-10-02 (fin10) the root's were taken from its cell once when its turn started and a child's
   * from its persona's configured model, not its cell, so a child under a session override compressed on the pair the
   * override replaced (the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves).
   */
  private readonly compressionFor = (current: () => ModelChoice, todoLines: () => readonly string[]): TurnCompression | undefined => {
    const c = this.deps.compression;
    if (!c) return undefined;
    /*
     * OQ-189's ruling (R-071, PD-MONITOR-007): a configured `compression.model` is followed through the session's overrides,
     * and where the pair it ends on is held out of quota the pass compresses on the agent's own model — the model its cell
     * calls next. Until 2026-10-06 the configured model was called as configured, a pair the provider had refused included.
     */
    const compressing = (): ModelChoice => {
      const agent = current();
      if (!c.model) return agent;
      const h = this.helperModel(c.model);
      return h.ok ? { model: h.model, thinking: h.thinking } : agent;
    };
    return {
      // OQ-156: the compressing model is given the history it condenses up to its own threshold (REQ-MONITOR-078).
      compressor: () => {
        const chosen = compressing();
        return { backend: c.backend, model: chosen.model, thinking: chosen.thinking, timers: c.timers, credentialFor: c.credentialFor, timeoutMs: c.timeoutMs, inputTokens: c.triggerFor(chosen.model).tokens };
      },
      trigger: () => c.triggerFor(current().model), charsPerToken: c.charsPerToken, preserveRecentTurns: c.preserveRecentTurns, todoLines,
      /**
       * REQ-MONITOR-194 with REQ-MONITOR-080: the agent's own pair, when the session holds it out of quota, is not called to
       * compress. The turn settles the cell before its automatic check (`settleBeforeCall`), so this answers only in the
       * span before the agent's next call — a manual pass while it awaits a tool or a child. Since OQ-189's ruling
       * (PD-MONITOR-007, 2026-10-06) a configured `compression.model` held out of quota yields to the agent's own model
       * (`compressing`), so this is read for whichever model the pass would call; until then a configured one was called as
       * configured.
       */
      withheld: () => {
        const chosen = compressing();
        const provider = providerIdentity(this.catalogue, chosen.model);
        if (!this.memory.isExhausted(provider, chosen.model.modelId)) return null;
        return `${provider}/${chosen.model.modelId}, the model this agent runs on, is held out of quota for this session${c.model ? ', as is the configured compressing model' : ''}; no compressing call is made on it, and the agent's next call moves it to another model first`;
      },
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
    return this.todo.toDocument().phases.flatMap((phase) => phase.tasks.map((task) => `[${task.state}] ${phase.name} — ${taskLine(task)}`));
  }

  /**
   * The summariser, its model carried through the session's overrides at each call (REQ-ORCH-091 a/d, REQ-MONITOR-194), as
   * every ladder cell's is (`followOverride`): it has no ladder of its own, and it called the configured pair a wait's
   * choice had replaced (a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced).
   */
  private summariserDeps(): SummariserDeps | null {
    const s = this.deps.summariser ?? null;
    if (s === null) return null;
    // OQ-189's ruling (R-071, PD-MONITOR-007): where the pair the summariser's model ends on is held out of quota, the child's
    // report is summarised on the model the child itself ran on — the calling agent's, as a compression pass falls back to
    // it — and where that one is held out of quota too, no call is made and the report is the fallback one, saying why.
    return {
      ...s,
      resolve: (c, agent) => {
        const h = this.helperModel(c);
        if (h.ok) return { model: h.model, thinking: h.thinking };
        const own = agent === undefined ? null : this.helperModel(agent);
        if (own?.ok) return { model: own.model, thinking: own.thinking };
        return { withheld: `the summarising model ${h.reason}${own ? ', and so is the model the agent ran on' : ''}; no summarising call was made` };
      },
    };
  }

  /**
   * OQ-189's ruling (R-071, PD-MONITOR-007): what a helper call configured on `choice` makes — the session's overrides
   * followed, or not `ok` where the pair it ends on is held out of quota (`helperChoiceOf`). Read at each call, from the
   * session's memory as it stands then. The intent classifier, the loop classifier and the post-run analyst reach it
   * through the session (`Sessions`), the compressor and the summariser here.
   */
  readonly helperModel: HelperModel = (choice) => helperChoiceOf(this.memory, this.catalogue, choice);

  /**
   * REQ-MONITOR-080: the model an agent's cell calls next — its pair with the session's overrides followed, as the ladder
   * follows them before the call (`followOverride`) — which its compression uses when none is configured.
   */
  private callsOn(cell: AgentResilienceCell): ModelChoice {
    return this.memory.effective(cell.model, this.catalogue);
  }

  /** The per-agent ladder deps shared by the root and every child (the cell is the agent's own). */
  private resilienceFor(cell: AgentResilienceCell, unresponsiveBoundMs: number, switchPending?: () => boolean): TurnResilience {
    const { config } = this.deps;
    return { cell, memory: this.memory, catalogue: this.catalogue, waits: this.waits, transientRetries: config.transientRetries, validationRetries: config.validationRetries, llmResponseTimeoutMs: config.llmResponseTimeoutMs, unresponsiveBoundMs, resting: () => this.restCause !== null, switchPending, moved: () => this.deps.owner.refreshRecord() };
  }

  /**
   * Whether the root's cell is built anew for `entryModel` at its next turn: when there is none yet, when it was last
   * built from another model, or when a model switch is pending (`pendingEntrySwitch`, OQ-177), so a switch ends a ladder
   * move of it (REQ-ORCH-090, REQ-ORCH-091 b) even onto the model it was last built from; `setEntryModel` records it as
   * `rebuilds`. (Until 2026-10-02 the pending switch was not part of the test: a switch onto the model the cell was last
   * built from left it as it stood, a ladder move included, and the switch recorded `rebuilds: false`.)
   */
  private rootRebuildsFor(entryModel: ModelRef): boolean {
    return this.rootCell === null || this.appliedEntryModel === null || !sameRef(this.appliedEntryModel, entryModel) || this.pendingEntrySwitch === 'model';
  }

  /**
   * The root's cell lives for the run; the entry model (and a mid-run switch of it) enters through the session memory.
   * Called once per root turn — an iteration, or the plan cycle — so a switch made while it runs reaches the next one
   * (REQ-MONITOR-142: "the iteration already in flight finishes on the previous setting").
   */
  private rootResilience(): TurnResilience {
    const { config } = this.deps;
    const entryModel = this.entryOverride.model ?? config.model;
    const thinking = this.entryOverride.thinking ?? config.thinking;
    // The cell is settled here for whatever switch is in force: a switch recorded from now on supersedes none.
    this.entrySwitchPending = false;
    if (this.rootCell === null || this.entryRebuild || this.rootRebuildsFor(entryModel)) {
      this.entryRebuild = false;
      const base = withSettings(this.catalogue, { model: entryModel, thinking });
      const current = this.memory.effective(base, this.catalogue);
      const persona = this.deps.personas?.resolve(config.persona)?.persona;
      const previous = this.rootCell;
      // The key the cell is taken from: the override the memory followed, else the switched key, else the configured one.
      const key = this.memory.overrideReaching(base, this.catalogue)?.key ?? (this.entryOverride.model === undefined ? config.modelKey : this.entryOverride.key) ?? null;
      this.rootCell = agentCell(current, this.fallbackFor(persona, current), key);
      if (previous) { this.rootCell.fallbackAttempted = previous.fallbackAttempted; this.rootCell.sameTierAttempted = previous.sameTierAttempted; for (const p of previous.attempted) this.rootCell.attempted.add(p); }
      this.appliedEntryModel = entryModel;
    } else if (this.pendingEntrySwitch === 'reasoning') {
      // OQ-177: a reasoning switch is not a model switch — a move the ladder made stands, at the level the user chose.
      this.rootCell.model = { ...this.rootCell.model, thinking };
    }
    this.pendingEntrySwitch = null;
    // A ladder move of the root records whether a switch is pending at it: made on this cell, before the switch applies.
    return this.resilienceFor(this.rootCell, config.modelTimeoutMs, () => this.entrySwitchPending);
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
    // Clause 4 with OQ-97: a resumed root keeps the name its rows carry, even when it runs as the entry role now.
    const rootName = resume?.root_persona ?? config.persona;
    this.rootName = rootName;
    this.rootDone = false;
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
      // OQ-103 (R-067): a cancel accepted before this iteration was recorded open marks it as well.
      if (opened.ok && opened.value && this.stop.final) this.markCancelAccepted();
    }
    /*
     * REQ-MONITOR-102 with REQ-ORCH-153 (the repair of `a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md`):
     * a plan cycle's root has no iteration row to carry its count, so the session records it as under way, none of its calls
     * counted, until they join the total below. A crash that ends its turn leaves it recorded, which is how the crash record
     * finds it (`recordCrash`).
     */
    const planRoot = iterationOverride !== undefined && resume === undefined ? rootTaskId : null;
    if (planRoot !== null) {
      const r = writer.openPlanRoot(planRoot, rootName, rootCanonical);
      if (!r.ok) this.deps.warn(`the plan cycle's root ${rootName} (${planRoot}) of ${this.sessionId} was not recorded under way: ${r.error.code}`);
    }
    const children = this.deps.toolsFor && this.deps.dal
      ? new IterationChildren({
        rootRecord,
        // REQ-GIT-019: the children are told the root they work in — the worktree for an isolated run.
        sessionId: this.sessionId, workspaceRoot: this.deps.effectiveRoot ?? this.deps.workspaceRoot, dal: this.deps.dal, writer, owner, backend, clocks: this.deps.clocks, model: config.model, ...(config.modelKey === undefined ? {} : { modelKey: config.modelKey }), thinking: config.thinking,
        modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries, credentialFor: config.credentialFor, maxStepsPerTurn: config.maxStepsPerTurn,
        // Part Q: each child gets its own cell over the shared memory, catalogue and wait registry.
        // REQ-MONITOR-052/066: the cell carries the key its model was taken from — the override followed, else the configured
        // key the child's row records — and is kept by the child's task id, so `childModel` can name a later move.
        resilience: { forChild: (persona, current, bound, child) => {
          const base = withSettings(this.catalogue, current);
          const effective = this.memory.effective(base, this.catalogue);
          const cell = agentCell(effective, this.fallbackFor(persona, effective), this.memory.overrideReaching(base, this.catalogue)?.key ?? child.key);
          this.childCells.set(child.taskId, { cell, configured: current.model, key: child.key });
          return this.resilienceFor(cell, bound);
        } },
        // Part AH (ADR-0060): each child compresses against its own model's capacity, with its own task plan — the model its
        // cell calls next, read at each pass (REQ-MONITOR-080).
        compressionFor: this.compressionFor,
        // REQ-ORCH-024: the BUDGET cell only narrows; with no pre-flight the configured policy stands unchanged.
        budget: clampBudget(this.deps.budget ?? { maxDepth: 3, maxTotal: 20, maxActive: 6 }, this.preflightInEffect?.budgetCell ?? null), modelCap: this.deps.modelCap ?? (() => null), toolsFor: this.portFor,
        ...(this.deps.modelSlots ? { slotsHeldElsewhere: this.deps.modelSlots.heldElsewhere, onSlotFreed: this.deps.modelSlots.freed } : {}),
        // REQ-MONITOR-102: a child's tool calls are the session's too; the entry agent's own are added at the turn below. The
        // child's own count is persisted with the total, in one transaction, so a crash leaves the two agreeing.
        countToolCalls: (n, child) => { this.aggregates.addToolCalls(n); if (child) this.persistToolCalls({ children: [child] }); },
        // REQ-EVENTS-053, PD-MONITOR-001: a child's provider requests are the run's, counted where the entry agent's are.
        onRequestUsage: this.onRequestUsage,
        summariser: this.summariserDeps(), hooks: this.hooks, playbookFor: this.preflightInEffect?.playbookFor ?? null, route: this.preflightInEffect?.route ?? 'work', ...(this.deps.childTimeoutMs === undefined ? {} : { childTimeoutMs: this.deps.childTimeoutMs }), ...(this.deps.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: this.deps.childStallTimeoutMs }), runSignal: this.abort.signal, warn: this.deps.warn, info: this.info,
        // REQ-WORKSPACE-060/065 (ADR-0063): a child is an agent, so it receives the SAME units the entry agent
        // does — the getter is passed through, not a copy, which is what makes "a skill can never be visible to
        // one persona and hidden from another" true by construction rather than by two call sites agreeing.
        ...(this.deps.contextUnits ? { contextUnits: this.deps.contextUnits } : {}),
        ...(this.deps.supervisorFor ? { supervisorFor: this.deps.supervisorFor } : {}),
        ...(this.deps.personas ? { personas: this.deps.personas } : {}),
        steeringFor: (id: string) => this.steeringFor(id), steeringPending: (id: string) => this.steeringPending(id), shouldPause: () => this.pauseRequested,
        // PD-ORCH-005: the rest the run is coming to, and the pause's tool deadline every child's calls run under.
        restCause: () => this.restCause, cutCalls: this.toolCut.signal, resumeNotice: (taskId: string) => this.resumeNotice(taskId),
        // PD-ORCH-005 clause 1: every child's conversation is recorded under its task id.
        record: this.record,
        // Part Y (REQ-LIBRARY-092/097/098): the session artifact store — child reports materialise into it and its
        // two context blocks reach every child the iteration launches.
        ...(this.deps.artifacts ? { artifacts: this.deps.artifacts } : {}),
        // REQ-ORCH-153: the live hold and the registry predicate, for the child-admission refusal.
        ...(this.deps.plan ? { planGate: { held: () => this.planHeld, withholds: this.deps.plan.withholds } } : {}),
        // REQ-ORCH-059: the open items a completion notification reminds its parent of.
        openTodoFor: (agentId: string) => this.openTodoFor(agentId),
        // PD-TOOLS-006 revision 6 (OQ-220): the caller's own plan and OQ-213's `listWritten`, read live at each delegate call,
        // and the host's reading of which roles hold an implementation delegation.
        todoPlanFor: (callerId: string) => this.todoPlanFor(callerId),
        ...(this.deps.implementationRole ? { implementationRole: this.deps.implementationRole } : {}),
      }, iteration)
      : null;
    this.children = children;
    const tools = children && this.deps.toolsFor ? this.portFor(config.persona, rootName, children, this.rootId, 0, rootCanonical) : this.register(this.deps.tools);
    this.rootPort = tools;
    // PD-ORCH-005 clause 4: a resumed iteration's agents are restored first, so the root resumes among them.
    // The timeline records each agent resumed (`child_resumed`), so a resume is not a warning (phase 4's review).
    if (resume && children) children.resumePaused();
    // The launch content goes to a fresh root's first call only; a resumed root carries on from its record.
    let launching = resume === undefined;
    let initial = true;
    // REQ-MONITOR-142: the root's ladder for this whole turn, the resumes after its children included — a switch made
    // while it runs applies from the next iteration, not at this iteration's next resume.
    const rootResilience = this.rootResilience();
    const compression = this.compressionFor(() => this.callsOn(rootResilience.cell), () => this.plannerTodoLines());
    // PD-ORCH-005 revision 4 clause 14: one check per execution of the root, at its first model step.
    // OQ-105 as ruled (R-071): taken of the entry persona's own definition — its instructions and its tool declaration.
    // The definition is the persona's prompt as written, never the grant-fitted form below (PD-ORCH-005 revision 7 clause 14).
    const entryPersona = (this.deps.personas ? this.deps.personas.resolve(config.persona) : resolveRole(config.persona))?.persona;
    const fingerprint = this.record.fingerprint(rootTaskId, rootCanonical, iteration, personaDefinitionOf(config.systemPrompt, entryPersona));
    /*
     * OQ-202 as ruled (R-071, `PD-ORCH-006`): a coordinator its run grants the direct-work bundle (REQ-ORCH-016) is told to
     * do the work itself, so its instructions agree with the tools it is offered; every other entry keeps its own prompt.
     * While the plan gate holds the run, REQ-ORCH-153 withholds the bundle's writing and command tools, so the held turn
     * keeps the prompt it had before the ruling (`turnFn` reads the hold per turn, as the supervisor below does).
     * OQ-162 as ruled (R-071, `PD-ORCH-005` revision 7 clause 40): the grant read is the one the iteration runs under —
     * a resumed iteration's carried intent, never the classification a continue's message brought for the next one —
     * so a resumed coordinator's instructions agree with the carried tools and do not change partway through it.
     */
    const entryInstructions = entryInstructionsFor(config.systemPrompt, this.preflightInEffect?.grant ?? null, entryPersona ?? null);
    /** REQ-SESSION-092: the stop's grace ran out before the root's turn returned, and the run went on without it. */
    let rootDetached = false;
    /*
     * REQ-MONITOR-117 ("each agent is evaluated for a stall"), the repair of `a-stalled-child-is-never-shown-stalled.md`: the
     * entry agent has a stall watch too, over its whole execution, as a child's has over each attempt. Its threshold is the
     * one REQ-MONITOR-118 names — the role's own `stall_timeout`, else `runtime.child_stall_timeout`, else 90 s (OQ-153). It
     * is visibility only (REQ-MONITOR-121); it writes what a child's watch writes, naming the agent, and its callback carries
     * the root's figure to the session record and wakes a root waiting on its children for a steer (REQ-MONITOR-135). Between
     * its turns — while it waits on its own children — no silence is counted against it (`betweenTurns`). No corrective
     * message: REQ-NOTIFY-112's is a child task's.
     */
    const rootWatch = new StallWatch(this.deps.clocks, millis(this.deps.personas?.resolve(config.persona)?.persona.stallTimeoutMs ?? this.deps.childStallTimeoutMs ?? CHILD_STALL_TIMEOUT_MS), {
      // OQ-173: a backoff, a provider-limit wait or a compression the run holds the root in is a wait, not a stall.
      ...stallRecords({ writer, warn: this.deps.warn, info: this.info }, { subject: 'agent', agentName: rootName, taskId: rootTaskId, live: () => !rootDetached }),
      evaluated: (stalled) => { if (!rootDetached) this.rootStallEvaluated(rootName, stalled ? rootWatch.silentSeconds : null); },
    });
    /** OQ-116 as ruled: counts one call the root completed; set below, once the root's counts are known. */
    let countRootCall: () => void = () => undefined;
    const turnFn = (text: string | null, history: readonly ChatMessage[]) => {
      const content = launching ? this.firstMessage(text ?? task, contentOverride ?? this.deps.taskContent, iterationOverride === undefined) : undefined;
      const initialCall = initial;
      launching = false;
      initial = false;
      // The run hands the root something to answer: its silence counts from here (as a child's, OQ-127).
      rootWatch.activity();
      return runTurn({
      writer, owner, backend, tools, clocks: this.deps.clocks, persona: config.persona, agentName: rootName,
      // REQ-ORCH-019: the rendered playbook is part of the instructions the role is given — the entry role's form, whose
      // ROUTE slot says the request came from the user rather than that a coordinator routed it here (K3, c2fdd6a).
      // REQ-WORKSPACE-060 (ADR-0063): then the session's always-active context units, read at THIS construction
      // so a skill force-loaded since the last turn reaches this agent (REQ-CONFIG-166).
      systemPrompt: withContextUnits(withPlaybook(this.planHeld ? config.systemPrompt : entryInstructions, this.preflightInEffect?.playbookFor(config.persona, true) ?? ''), this.deps.contextUnits?.() ?? []),
      // REQ-ORCH-025: the run override's layer, which `runTurn` places after everything else, the MCP section included
      // (`withRunOverrideLayer`); pointed at the plan while the gate holds (REQ-ORCH-153). A run the mapping grants the
      // direct-work bundle gets none (PD-ORCH-006 rev 3, OQ-205 as ruled, R-072).
      runOverrideLayer: runOverrideLayer(this.deps.runOverride ?? null, this.preflightInEffect?.grant ?? null, entryPersona ?? null, this.planHeld),
      model: this.entryOverride.model ?? config.model, thinking: this.entryOverride.thinking ?? config.thinking, modelTimeoutMs: config.modelTimeoutMs, modelRetries: config.modelRetries,
      credentialFor: config.credentialFor, maxStepsPerTurn: config.maxStepsPerTurn, warn: this.deps.warn, dispatched: this.dispatched,
      // PD-ORCH-001: no supervision while the plan gate holds the run. The hold withholds every writing tool,
      // so the only work left is reading the same region repeatedly — REQ-ORCH-101's first trigger, fired by the
      // gate's own side effect — and the corrective message goes in as the user, to a run that is waiting for
      // the user. Read here rather than captured once because `turnFn` is built once per segment and called per
      // turn; the hold itself is settled once and never cleared in place (REQ-ORCH-153), so the two agree.
      ...(this.deps.supervisorFor && !this.planHeld ? { supervisor: this.deps.supervisorFor(this.rootId) } : {}),
      // REQ-MONITOR-135: a steer delivered refreshes the root's last activity, as a child's (`refreshing`).
      steering: refreshing(this.steeringFor('root'), () => rootWatch.activity()), shouldPause: () => this.pauseRequested,
      // PD-ORCH-005: the pause's tool deadline, and what the root's interrupted calls are recorded as interrupted by.
      cutCalls: this.toolCut.signal, interruption: () => this.restCause,
      resilience: rootResilience,
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
      // REQ-SESSION-094: a root the stop's grace gave up on writes nothing more when its call returns.
      detached: () => rootDetached,
      // REQ-MONITOR-117: the root's stall watch is fed as a child's is — every streamed part, every call's start and end.
      onModelEvent: (kind) => rootWatch.modelEvent(kind),
      onToolStarted: (call) => rootWatch.toolStarted(call.callId, call.name),
      onToolCompleted: (call) => { rootWatch.toolCompleted(call.callId); countRootCall(); },
      // OQ-173: and told of each wait the run holds it in between its steps, which is not its silence.
      onImposedWait: (wait) => rootWatch.imposedWait(wait),
      }, text, history, this.abort.signal, content).finally(() => rootWatch.betweenTurns());
    };
    let outcome: TurnOutcome | null = null;
    /**
     * REQ-MONITOR-102: the calls the root's record held when this execution began — every one of them already counted, when
     * its earlier execution returned, raised or was given up on, or by the crash record — so a root given up on, or whose
     * turn raises, counts only what its record gained.
     */
    const recordedAtStart = resume ? callsRun(this.record.load(rootTaskId)) : 0;
    /**
     * An execution iteration's root has a count on its row (`iterations.root_tool_calls`); a plan cycle's has no row, and its
     * calls joining the total release it from the session instead (store v29).
     */
    const rootCount = iterationOverride === undefined ? iteration : null;
    const rootCounts = (add: number): Parameters<SessionWriter['countToolCalls']>[0] => (rootCount !== null ? { root: { iteration: rootCount, add } } : planRoot !== null ? { planRoot: { taskId: planRoot, add } } : {});
    /*
     * OQ-116 as ruled (R-071, `PD-ORCH-008`, narrowing REQ-ORCH-097's cadence): each call the root completes joins the
     * session's total as it completes, with the root's own count — its iteration's, or the plan cycle root's under way
     * (store v32), which it does not release — so the displayed total (REQ-MONITOR-102) follows the record during a long
     * pass. What its turn's end, its give-up or its raise adds is only what these did not: a call it started and never
     * completed, or one REQ-ORCH-141 answered from a replay. `rootLive` is how many it counted this execution.
     */
    let rootLive = 0;
    countRootCall = () => {
      if (rootDetached) return;
      rootLive += 1;
      this.aggregates.addToolCalls(1);
      this.persistToolCalls(rootCount !== null ? { root: { iteration: rootCount, add: 1 } } : planRoot !== null ? { planRootCall: { taskId: planRoot, add: 1 } } : {});
      // The run-level agent's live share (`entryUncountedToolCalls`) is what the total does not hold yet.
      if (this.rootUncountedFrom !== null) this.rootUncountedFrom += 1;
    };
    // REQ-MONITOR-044/052 (acceptance A20): from here until they join the total, the root's calls are counted live.
    this.rootUncountedFrom = writer.activity.callCount(rootName);
    rootWatch.start();
    try {
      const start: TurnStart = resume ? this.resumedRootStart(rootTaskId) : { kind: 'fresh', task };
      // OQ-153 with PD-ORCH-005 clause 4: a root resumed into waiting takes no step until a child's report — it is between
      // its turns from the start, and no silence is counted against it while it waits (found by the verifier's review).
      if (start.kind === 'resumed' && start.waiting) rootWatch.betweenTurns();
      /*
       * REQ-ORCH-078 under PD-ORCH-015 (OQ-225, narrowing it): a root that answers succeeded with items of its plan open is
       * sent a correction into its own conversation at least once — up to the larger of 1 and the validation-retry setting,
       * whose own default stays 0 for validation-class model failures (REQ-ORCH-092) — before `iterate` re-queues its task
       * (REQ-ORCH-075, "after correction retries are exhausted"). It is the next message of the conversation the answer left,
       * and a delegation it leads to is waited for as any turn's is. Never for a plan cycle, a turn that stopped where it
       * stood, or once the run is stopping, pausing or coming to rest. Asked where the root would otherwise be left idle
       * (`runWithChildren`'s `followUp`), so a root with nothing to correct ends in the same step it always has. Before the
       * directive the default sent none, and the open item went past the root holding the evidence to a fresh root that
       * redid the task (live-run finding P1).
       */
      const correctionLimit = Math.max(1, config.validationRetries);
      let corrections = 0;
      /**
       * PD-ORCH-015 / PD-ORCH-009 revision 2: the answer this execution of the root wrote — the first non-empty text a turn
       * left, replaced by a later turn's only when that is longer. A correction's own turn ("Recorded.", or a `todo` write and
       * no text) does not take its place: it stays the iteration's answer, its summary and the answer a re-queue holds.
       */
      let answer = '';
      /*
       * OQ-199 as ruled (R-071, PD-ORCH-009): a root that ends its turn with neither text nor a tool call — its last step
       * wrote nothing, and a step with a tool call never ends a turn — is asked once more, in its own conversation, as a
       * delegated child is re-prompted (REQ-ORCH-095). On the same terms as the plan's correction, and before it: the
       * person's answer first. A root still silent after it is reported below, once its turn returns.
       */
      let answerAsked = false;
      /** Whether the re-prompt's own turn has not yet been read; then whether it, too, ended without text. */
      let awaitingAnswer = false;
      let silentWhenAsked = false;
      const correction = (result: TurnOutcome): string | null => {
        const said = result.report.text.trim();
        if (said !== '' && said.length > answer.length) answer = said;
        // The first follow-up after the re-prompt reads the turn it led to: an answer written there is an answer, even if a
        // later turn of REQ-ORCH-078's plan correction ends without text.
        if (awaitingAnswer) { awaitingAnswer = false; silentWhenAsked = said === '' && this.correctionDue(result, iterationOverride === undefined); }
        // PD-ORCH-009 revision 2: never asked for an answer an earlier turn of this execution already wrote.
        if (!answerAsked && answer === '' && this.correctionDue(result, iterationOverride === undefined)) {
          answerAsked = true;
          awaitingAnswer = true;
          this.deps.warn(`iteration ${iteration}: ${rootName} ended its turn without writing an answer; it is asked once more (PD-ORCH-009, OQ-199)`);
          return ANSWER_REPROMPT;
        }
        const planTask = this.iterationTaskRecord();
        if (corrections >= correctionLimit || planTask === null || !this.correctionDue(result, iterationOverride === undefined)) return null;
        const open = this.openRootPlan(planTask);
        if (open.length === 0) return null;
        corrections += 1;
        this.deps.warn(`iteration ${iteration}: ${planNotDoneSummary(open)}; a correction is sent into its conversation (${corrections} of ${correctionLimit}, REQ-ORCH-078, PD-ORCH-015)`);
        return planCorrectionText(open, answer !== '');
      };
      const running = children
        ? children.runWithChildren(this.rootId, turnFn, start, this.abort.signal, correction)
        : (async () => {
          let result = await firstTurn(turnFn, start);
          for (let next = correction(result); next !== null; next = correction(result)) {
            const again = await turnFn(next, result.messages);
            result = { ...again, toolCallCount: result.toolCallCount + again.toolCallCount };
          }
          return result;
        })();
      /*
       * REQ-SESSION-092 / REQ-MONITOR-129: a stop bounds how long the root is awaited, as a rest bounds a child's execution
       * (`IterationChildren.rest`). Past the grace the root is detached: it is left where it stood — paused by a rest, its
       * open call answered as interrupted, below — and a turn that returns after that writes nothing more.
       */
      const settled = await Promise.race([running, this.stopGraceSpent.then(() => { rootDetached = true; return null; })]);
      if (settled === null) {
        // The turn's end is no longer awaited, so its raise must be handled here or it is an unhandled rejection.
        running.catch(() => undefined);
        // Named as its rows and calls name it (`rootName`): a root resumed as the entry role keeps its own persona (OQ-97).
        this.deps.warn(`iteration ${iteration}: the root ${rootName} did not return within the stop's 30 s grace and was given up on (REQ-SESSION-092)`);
      } else {
        // PD-ORCH-015: a final turn that wrote less than the execution's answer (a correction's "Recorded.") reports the answer.
        outcome = settled.report.status === 'succeeded' && answer.length > settled.report.text.trim().length ? { ...settled, report: { ...settled.report, text: answer } } : settled;
        // REQ-MONITOR-102: the root's count on its iteration moves with the total, in one transaction. Its completed calls
        // were counted as they completed (OQ-116 as ruled); its turn's end adds the rest, and releases a plan cycle's root.
        const rest = Math.max(0, outcome.toolCallCount - rootLive);
        this.aggregates.addToolCalls(rest);
        this.persistToolCalls(rootCounts(rest));
        this.rootUncountedFrom = null;
        // OQ-199 as ruled (PD-ORCH-009): asked once more and still silent — the iteration completes as it would have, and the
        // person is told once what follows it is known: the run ending, or going on (`tellUnanswered`).
        if (silentWhenAsked && outcome.report.text.trim() === '' && this.correctionDue(outcome, iterationOverride === undefined)) {
          this.unanswered = { iteration, rootName, actor: rootCanonical, taskId: rootTaskId };
        }
      }
      /*
       * REQ-ORCH-080: a stop with active background children drains before anything is cancelled — only a stop that
       * cancels them (the explicit cancel); a stop that brings the run to rest leaves them paused (PD-ORCH-005). A root
       * given up on drains them as one that returned does: the drain is bounded by its own timeout, not by the stop's
       * grace (OQ-121).
       */
      if (children && this.stop.requested && this.restCause === null && children.scheduler.hasNonTerminal) await children.drain(this.deps.drainTimeoutMs ?? millis(120_000));
      // A root given up on reports nothing of its own: `iterate` reads the stop before the report (REQ-SESSION-092).
      return outcome?.report ?? { status: 'succeeded', text: '', usage: { input: 0, output: 0 } };
    } finally {
      // The root's execution is over, or given up on: its watch is disarmed and its figure cleared (REQ-MONITOR-120).
      rootWatch.stop();
      this.rootStallEvaluated(rootName, null);
      /*
       * PD-ORCH-005 clause 2 (narrowing REQ-ORCH-052): an iteration that comes to rest with work unfinished — the root
       * stopped where it stood, or a child is not terminal — leaves every unfinished agent `paused` and the iteration
       * open. Every other exit, a plan cycle's among them, still leaves every child record terminal.
       */
      const rest = iterationOverride === undefined ? this.restCause : null;
      const rootFinished = outcome !== null && outcome.paused !== true && !this.abort.signal.aborted && outcome.report.status !== 'failed';
      /** Whether the root's open calls were answered as interrupted by a rest. */
      let answered = false;
      const resting = rest !== null && (!rootFinished || (children?.scheduler.hasNonTerminal ?? false));
      // A root the rest leaves `paused` is the root a continue resumes, and a root steer pending at the rest is delivered to
      // it (`deliverSteeringAtRest`): it can still step. Every other root's execution is over (`rootSteerName`).
      this.rootDone = !resting;
      if (resting) {
        // Every child's execution had the stop's grace beside the root's, counted from the same first request: the rest
        // is given what is left of it — none after a root given up on, and never a fresh 30 s after a root that returned
        // late — so the stop stays bounded at the one 30 s (REQ-SESSION-092).
        if (children) { const n = await children.rest(rest, this.stopGraceLeft()); if (n > 0) this.info(`iteration ${iteration}: ${n} child(ren) left paused by ${rest} (PD-ORCH-005)`); }
        /*
         * Clause 3: the explicit cancel is final even when it arrives while the run is coming to rest — the rest waits on
         * every execution, which can take the pause's whole tool deadline. Read again once the rest is done: cancelled
         * meanwhile, every agent it paused ends `cancelled` and the iteration closes (found by phase 3's review).
         */
        if (this.restCause === null) {
          rootRecord.state = 'cancelled';
          // REQ-HOOKS-003 / REQ-HOOKS-080: the sweep's `child_completed` hooks finish before the iteration's own.
          if (children) { children.finalize('cancelled: the run was cancelled while it was coming to rest'); await children.completionsSettled(); }
        } else {
          this.iterationRest = this.restCause;
          rootRecord.state = 'paused';
          // Clauses 3 and 4: a root that raised out of a call, or was given up on in one, has that call answered as
          // interrupted, as a child's is.
          if (this.deps.dal) answerOpenCalls(this.deps.dal, writer, this.sessionId, { taskId: rootTaskId, name: rootName }, iteration, this.restCause);
          answered = true;
          // REQ-MONITOR-134 with clause 4: a steering prompt still pending reaches the record its agent resumes from.
          this.deliverSteeringAtRest({ taskId: rootTaskId, name: rootName }, iteration, this.restCause);
        }
        // OQ-128: the rest is recorded and no agent of this run takes another step, so no steer is accepted from here — one
        // acknowledged now would reach no record while its agent sits `paused`, to resume on the continue without it.
        this.steeringClosed = true;
      } else if (children) {
        // REQ-ORCH-052: every exit path from an iteration leaves every child record terminal.
        const n = children.finalize(this.stop.requested ? 'cancelled: the run was stopped while this child was in flight' : 'cancelled during iteration cleanup');
        if (n > 0) this.deps.warn(`iteration ${iteration}: ${n} child(ren) settled cancelled at exit (REQ-ORCH-052)`);
        // REQ-HOOKS-003 / REQ-HOOKS-080: the sweep's `child_completed` hooks finish before the iteration's own.
        await children.completionsSettled();
        /*
         * REQ-SESSION-092 / REQ-SESSION-094: a stop that rests nothing — the explicit cancel, a stop the run raises itself,
         * a plan cycle's — aborted every child execution with the root. Each is awaited within what is left of the grace
         * (none after a root given up on), and what still executes then is detached, so a child's step or call that
         * ignored the stop writes nothing into the finished session when it returns.
         */
        if (this.stop.requested && await children.outlast(this.stopGraceLeft())) {
          this.deps.warn(`iteration ${iteration}: child executions still running at the stop's 30 s grace were given up on (REQ-SESSION-092)`);
          // REQ-MONITOR-102 / REQ-SESSION-129: no rest counts them — each one's open calls are answered as cut off, naming
          // no rest (OQ-96), and it is counted from its record (the repair of
          // `a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`).
          children.closeGivenUpOn();
        }
      }
      // REQ-ORCH-053 / REQ-ORCH-098: the iteration's children are torn down — finalized, or paused by the rest — so their
      // scheduler is closed: a child execution settling after this runs no pass against a store that may be closed by then
      // (the repair of a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it).
      children?.close();
      // A root given up on, or whose turn raised, that no rest paused — the explicit cancel, an iteration that closes
      // failed — still leaves no call row running (REQ-SESSION-129): its open call is recorded cut off, naming no rest
      // (OQ-96, "A call cut by no rest").
      if ((rootDetached || outcome === null) && !answered && this.deps.dal) answerOpenCalls(this.deps.dal, writer, this.sessionId, { taskId: rootTaskId, name: rootName }, iteration, null);
      /*
       * REQ-MONITOR-102 (the repairs of `a-roots-calls-before-a-crash-never-reach-the-session-total.md` and
       * `a-root-whose-turn-raises-never-counts-its-calls.md`): a root given up on, or whose turn raised, never returns its
       * count, so its calls are counted from its record — once its open calls are answered, so a call it asked for and
       * never started is not one — less what the record held when this execution began. Only a root that never returned:
       * the grace's timer still sets `rootDetached` when it runs out after the root returned — while the rest waits for its
       * children — and that root's calls were counted with its outcome above.
       */
      if (outcome === null && this.deps.dal) {
        // Less the calls it counted as they completed (OQ-116 as ruled), which its record holds too.
        const gained = Math.max(0, callsRun(this.record.load(rootTaskId)) - recordedAtStart - rootLive);
        this.aggregates.addToolCalls(gained);
        this.persistToolCalls(rootCounts(gained));
      }
      // The root's execution is over: its calls are in the total, or — with no store record to count from — never will be.
      this.rootUncountedFrom = null;
      /*
       * A plan cycle's root is released with its calls above — returned, given up on, or whose turn raised (the repair of
       * `a-root-whose-turn-raises-never-counts-its-calls.md`) — in the transaction that adds them; this release, of a root
       * already released, writes nothing. It is the one for a run with no store record to count from; only a crash leaves
       * the root recorded.
       */
      if (planRoot !== null) {
        const r = writer.countToolCalls({ planRoot: { taskId: planRoot, add: 0 } });
        if (!r.ok) this.deps.warn(`the plan cycle's root ${rootName} (${planRoot}) of ${this.sessionId} was not released: ${r.error.code}`);
      }
    }
  }

  /**
   * REQ-MONITOR-102: the run's tool-call total as its aggregates hold it, written with the per-agent counts that now hold
   * the calls just added (`SessionWriter.countToolCalls`) — so a process death after this never finds a call one of them
   * counts and the other does not. The next save publishes it.
   */
  private persistToolCalls(counts: Parameters<SessionWriter['countToolCalls']>[0]): void {
    const r = this.deps.writer.countToolCalls(counts, this.aggregates.figures.toolCalls);
    if (!r.ok) this.deps.warn(`the tool-call count of ${this.sessionId} was not persisted: ${r.error.code}`);
  }

  /**
   * REQ-HOOKS-076 / REQ-HOOKS-080 (the fourth verification of the repair of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`): every `child_completed` hook the last
   * iteration's children queued from outside a settle (`IterationChildren.completedOutside`) is awaited — after a stop,
   * only within what is left of its 30 s grace (REQ-SESSION-092), so one the grace gave up on may still finish after
   * `session_end`, bounded by its own per-hook timeout (REQ-HOOKS-033).
   */
  private async childCompletionsSettled(): Promise<void> {
    const children = this.children;
    if (!children || !this.hooks) return;
    if (!this.stop.requested) { await children.completionsSettled(); return; }
    const grace = this.stopGraceLeft();
    if (grace <= 0) return;
    let timer: TimerHandle | undefined;
    await Promise.race([children.completionsSettled(), new Promise<void>((r) => { timer = this.deps.clocks.timers.after(grace, r); })]);
    timer?.cancel();
  }

  /**
   * REQ-SESSION-092: what is left of the stop's 30 s grace, counted from the first stop request — the whole of it when no
   * stop has been requested.
   */
  private stopGraceLeft(): Millis {
    return this.stopGraceDeadline === null ? STOP_GRACE : millis(Math.max(0, this.stopGraceDeadline - this.deps.clocks.monotonic.now()));
  }

  /**
   * REQ-SESSION-094: closes every port this run built (`ToolPort.close`) — the root's and each child's, not a port the
   * caller handed it — its open calls settled with what cut them off: the rest the run came to, or none named.
   */
  private closePorts(): void {
    this.portsClosed = true;
    const cutOff = interruptedResult(this.restCause, true, '');
    for (const p of this.ports) {
      if (p === this.deps.tools) continue;
      try { p.close?.(cutOff); } catch (cause) { this.deps.warn(`closing a tool port of ${this.sessionId} failed: ${String(cause)}`); }
    }
  }

  private register(port: ToolPort | null): ToolPort | null {
    if (port) this.ports.add(port);
    return port;
  }
  private readonly portFor = (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string, parentPersona?: string): ToolPort | null => {
    const p = this.deps.toolsFor ? this.deps.toolsFor(persona, agentName, delegation, parentId, depth, canonicalName, parentPersona) : null;
    return this.register(p);
  };

  /** REQ-MONITOR-133: a steer is pending until its conversation's next step; the id is the control's string value. */
  steer(agentId: string, text: string): string | null {
    if (this.ended || this.steeringClosed || text.trim() === '' || agentId.trim() === '') return null;
    const key = this.isRootAgent(agentId) ? 'root' : agentId;
    if (key !== 'root' && !this.children?.ledger.get(key)) return null;
    const id = randomUUID();
    // Named as its injection names it: the root by the name of the root that will take it (`rootSteerName`), a child by its
    // instance name (the metadata keeps the key).
    const who = key === 'root' ? this.rootSteerName() : this.children?.ledger.get(key)?.canonical_name ?? key;
    const list = this.steering.get(key) ?? [];
    list.push({ id, text, name: who });
    this.steering.set(key, list);
    this.deps.writer.appendTimeline('steering_submitted', 'user', `A steering prompt was submitted for ${who} (${id.slice(0, 8)}).`, { prompt_id: id, agent: key });
    return id;
  }
  /**
   * The name a root steer is announced under: the root that will take it (the repair of
   * `a-root-steer-after-a-resumed-iteration-closes-is-announced-under-the-resumed-roots-name.md`). While the current root
   * can still step — its turn running, or a resumed root before its first turn — that is `rootName`, which for a root
   * resumed as the entry role is the persona its iteration was opened with (PD-ORCH-005 clause 4, OQ-97). Once its
   * execution is over, the next root is a fresh one and runs as the run's persona, so the steer is named for that.
   */
  private rootSteerName(): string {
    return this.rootDone ? this.deps.config.persona : this.rootName;
  }

  /**
   * The host's stall callback for the entry agent (REQ-MONITOR-119/120/122): its figure beside its tools, the record
   * republished when it changed; then REQ-MONITOR-135's injection — a root waiting on its children with a steer pending is
   * woken to take its next step. Neither may block or fail the run.
   */
  private rootStallEvaluated(rootName: string, seconds: number | null): void {
    try {
      if (this.deps.writer.activity.stalled(rootName, seconds)) this.deps.owner.refreshRecord();
      if (this.children !== null && this.steeringPending('root')) this.children.wakeForSteering(this.rootId);
    } catch (cause) {
      this.deps.warn(`the stall evaluation of ${rootName} could not reach its host: ${String(cause instanceof Error ? cause.message : cause)}`);
    }
  }
  /** REQ-MONITOR-135: whether a steer is pending for `conversationId`, read without taking it (a stall evaluation asks). */
  private steeringPending(conversationId: string): boolean {
    const key = this.isRootAgent(conversationId) ? 'root' : conversationId;
    return (this.steering.get(key)?.length ?? 0) > 0;
  }
  private steeringFor(conversationId: string): () => readonly { id: string; text: string }[] {
    const key = this.isRootAgent(conversationId) ? 'root' : conversationId;
    return () => { const list = this.steering.get(key) ?? []; this.steering.delete(key); return list; };
  }

  /**
   * REQ-MONITOR-134 with PD-ORCH-005 clause 4, the repair of `a-steering-prompt-pending-at-a-rest-is-lost.md`: a steering
   * prompt still pending when the iteration comes to rest — its agent stopped before the step that would have injected it —
   * is delivered into the conversation record of the agent it names, when that agent is left `paused` with a record to
   * carry on from: as the marked message its next step would have injected, after the answers to the calls the rest cut,
   * and marked injected then, once. The resumed agent reads it at its first step. A prompt for an agent with no record — a
   * child that never started — stays pending, and the run's end reports it not delivered (`closeSteering`,
   * OQ-128). Once this has run, the rest closes steering: a steer after it is refused.
   */
  private deliverSteeringAtRest(root: { readonly taskId: string; readonly name: string }, iteration: number, cause: Interruption | null): void {
    for (const [key, pending] of [...this.steering]) {
      const child = key === 'root' ? null : this.children?.ledger.get(key) ?? null;
      const agent = key === 'root' ? { ...root, iteration } : child?.state === 'paused' ? { taskId: child.task_id, name: child.canonical_name, iteration: child.iteration } : null;
      if (agent === null || pending.length === 0 || this.record.load(agent.taskId).length === 0) continue;
      this.steering.delete(key);
      const recorder = this.record.recorder(agent.taskId, agent.iteration);
      // Unlike `injectSteering`, no supervisor is told of the instruction here (REQ-MONITOR-134, "reported to the run"):
      // the agent steps again only in the continue's run, whose supervisors are a fresh `SupervisorRegistry` with no
      // consecutive series for a new user instruction to restart. A change that carried supervisors across a rest owes
      // the `noteUserInstruction` call here.
      for (const s of pending) {
        recorder.appended(steeringMessage(s));
        recordSteeringInjected(this.deps.writer, agent.name, s, { interruption: cause });
      }
    }
  }

  /**
   * REQ-MONITOR-133/134 at the run's end (OQ-128): no steer is accepted from here, and a prompt no step injected and no rest
   * delivered — its agent never started, ended first, or was cancelled — is recorded as not delivered: a
   * `steering_not_delivered` timeline entry and a transcript line, so an acknowledged submission is never lost without a
   * word. The specification has no word for such a prompt; the entry takes REQ-MONITOR-134's "delivered".
   *
   * Every way a run stops stepping reaches this before it awaits anything: teardown, and the two ends that are not
   * terminations and never enter it — the pause at the message limit (`pauseAtLimit`) and the park at the plan gate
   * (`parkAtPlanGate`, on the path that parks), each of which names itself in `ending` (found by the third review of the
   * repair of a-steering-prompt-pending-at-a-rest-is-lost: both ended the run with a root steer still pending and said
   * nothing). An end is named only on the path that takes it: a plan cycle that ends in teardown is teardown's to record.
   */
  private closeSteering(ending?: string): void {
    try { this.reportUndeliveredSteering(ending); } catch (cause) { this.steeringClosed = true; this.deps.warn(`recording the undelivered steering of ${this.sessionId} failed: ${String(cause)}`); }
  }
  private reportUndeliveredSteering(ending = 'the run ended'): void {
    this.steeringClosed = true;
    for (const [key, pending] of this.steering) {
      for (const s of pending) {
        // Under the name it was announced with: a root steer announced while a resumed root ran keeps that root's name.
        const who = s.name;
        const message = `The steering prompt for ${who} (${s.id.slice(0, 8)}) was not delivered: ${ending} before ${who} took another step.`;
        this.deps.writer.appendTimeline('steering_not_delivered', 'rotaris', message, { prompt_id: s.id, agent: key });
        this.deps.writer.appendRow('system', message, true);
      }
    }
    this.steering.clear();
  }

  /**
   * REQ-MONITOR-123/124: graceful, whole-run only; the status reads `pausing` until the current step finishes.
   * PD-ORCH-005: refused while the plan gate holds (clause 11: the durable hold wins). Accepted, it withdraws every approval
   * and question an agent waits on at once (clause 9), arms REQ-ORCH-134's tool deadline for every other call in flight,
   * and stops every child from starting (clause 2); each agent then stops before its next model step.
   */
  pause(): boolean {
    if (this.endWritten || this.stop.requested || this.pauseRequested || this.planHeld) return false;
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
  /**
   * REQ-SESSION-094 with OQ-165 (finacc3 F05): the run's end is written — the teardown's terminal status (or about to be,
   * with nothing awaited before it), or a rest that is not a termination: `paused_message_limit` or
   * `awaiting_plan_decision`. `ended` is set only after each of the three forwarded what it wrote and ran the `session_end`
   * hooks (and, at the teardown, the hooks advisory); a control accepted between the write and `ended` saved `cancelling`,
   * `pausing` or `running` over that end, and nothing wrote it again
   * (`docs/defects/fixed/a-stop-accepted-during-teardown-writes-cancelling-over-the-runs-terminal-status.md`).
   */
  private get endWritten(): boolean {
    return this.ended || this.cancelWindowClosed || this.restWritten;
  }
  /** REQ-SESSION-186: whether the stop control is still accepted — refused, as the explicit cancel is, once the end is written. */
  get acceptsStop(): boolean {
    return !this.endWritten;
  }
  get isPausedByUser(): boolean {
    return this.pauseRequested;
  }

  /**
   * REQ-CHAT-040 / REQ-ORCH-071: every QUEUED prompt becomes a task in phase "Queued Prompts", named "Queued Prompt: <first 8
   * characters of the prompt id>" and carrying the prompt text as its content (acceptance A28); the supervisor sees a user
   * instruction.
   */
  private consumeQueued(): void {
    const r = this.deps.writer.triggerQueuedPrompts();
    if (!r.ok || r.value.length === 0) return;
    // REQ-CHAT-089: the task's id is the backend's own, never the prompt's; the prompt is found by the task's name and by
    // the `prompt_triggered` timeline entry, which carries its full id.
    for (const p of r.value) this.todo.appendTask('Queued Prompts', this.mintTaskId(), p.content, `Queued Prompt: ${p.prompt_id.slice(0, 8)}`);
    this.deps.supervisorFor?.(this.rootId).noteUserInstruction();
    this.saveRunning({});
  }

  /** REQ-CHAT-088/090/091: edits follow the source the visible plan names. */
  editTodo(op: 'add' | 'update' | 'remove', id: string, text: string, source: 'child' | 'agent' | 'planner' = 'planner', ownerId: string | null = null, phaseId = 'main'): { changed: boolean; id?: string } {
    if (this.endWritten) return { changed: false };
    let result: { changed: boolean; id?: string } = { changed: false };
    if (source === 'planner') {
      // REQ-CHAT-089: an added task takes the backend's id, never one the caller sent (a temporary id is never recorded).
      const assigned = op === 'add' ? this.mintTaskId() : id;
      result = this.todo.editTask(op, assigned, text, phaseId) ? { changed: true, ...(op === 'add' ? { id: assigned } : {}) } : { changed: false };
    } else {
      const current = source === 'agent' ? this.agentTodo : this.agentTodoFor(ownerId, false);
      if (current !== null) {
        const edited = editAgentTodo(current, op, id, text, phaseId);
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

  /**
   * REQ-CHAT-089: a new planner task's id — 8 lowercase hexadecimal characters, unique within the todo and among the ids
   * the session's iterations recorded as their task (`todo_task_id`), so no iteration's record names a later task.
   */
  private mintTaskId(): string {
    const taken = this.todo.ids();
    for (const r of this.deps.dal?.iterationsOf(this.sessionId) ?? []) taken.add(r.todo_task_id);
    return mintTodoId(taken);
  }

  /** REQ-ORCH-029: the root's own plan while the entry role acts as coordinator; none under `single` (REQ-ORCH-025). */
  private coordinatorPlan(): AgentTodoDocument | null {
    return this.deps.coordinating === false ? null : this.agentTodo;
  }

  /** The planner task the current iteration works on, as the todo holds it; null outside an iteration. */
  private iterationTaskRecord(): Task | null {
    return this.iterationTask === null ? null : this.todo.task(this.iterationTask.id) ?? null;
  }

  /** REQ-ORCH-078: whether the root's answer is one a correction may still be sent after — an execution root's, run on. */
  private correctionDue(result: TurnOutcome, execution: boolean): boolean {
    return execution && result.report.status === 'succeeded' && result.paused !== true && !this.abort.signal.aborted
      && !this.stop.requested && !this.pauseRequested && this.restCause === null;
  }

  /** REQ-ORCH-029 / REQ-ORCH-075 (OQ-203): the open items of the root's own plan held against the planner task `task`. */
  private openRootPlan(task: Task): string[] {
    return openPlanItems(this.coordinatorPlan(), new Set(storedIds(task.planExcused)));
  }

  /**
   * REQ-ORCH-075 with REQ-ORCH-029 and REQ-ORCH-067 (OQ-203): a task's first take-up records, with the task, the items of the
   * coordinator's plan already open then, which are not held against it (`Task.planExcused`). The first take-up is the plan
   * cycle that planned the task (`planCycleTakeUp`), or else the iteration that takes it up while it carries no record and no
   * iteration row of the session names it yet; every later one — the iteration a continue resumes, a fresh iteration of a
   * re-queued task, in this run or a later one — reads the record back from the stored todo, so an item its plan cycle wrote
   * or its own earlier iteration left open still holds it, and one a given-up task or an earlier run left open never does.
   * The record is saved at once, so a crash before the task's next save does not lose it.
   */
  private takeUp(task: Task, resumed: boolean): void {
    if (resumed || task.planExcused !== undefined || this.iterationNamed(task)) return;
    task.planExcused = [...openPlanIds(this.coordinatorPlan())];
    this.saveRunning({});
  }

  /**
   * REQ-ORCH-153 with REQ-ORCH-075 and REQ-ORCH-029 (OQ-203): a plan cycle is the take-up of the tasks it plans. Its turn is
   * the coordinator's, under planning grants that keep the todo state writable, so the plan it writes there is those tasks'
   * own: what was open BEFORE the turn is recorded as excused for each pending task not yet taken up, and what the turn
   * writes is not — so the first iteration after approval does not find the plan cycle's items open and excuse them (found by
   * the verifier of fin18's second repair round: every plan-mode run read completed beside its untouched plan). A task that
   * already carries a record (a revise cycle's, or one a resumed iteration's plan cycle plans again) keeps it.
   */
  private planCycleTakeUp(): void {
    const open = [...openPlanIds(this.coordinatorPlan())];
    let recorded = false;
    for (const task of this.todo.pendingTasks()) {
      if (task.planExcused !== undefined || this.iterationNamed(task)) continue;
      task.planExcused = [...open];
      recorded = true;
    }
    if (recorded) this.saveRunning({});
  }

  /** Whether an iteration row of the session names `task` — a task a build before the take-up record took up has only that. */
  private iterationNamed(task: Task): boolean {
    const dal = this.deps.dal;
    return dal ? dal.iterationsOf(this.sessionId).some((row) => row.todo_task_id === task.id) : task.consecutiveRetries > 0;
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
    if (this.endWritten) return false;
    if (root) {
      this.agentTodo = document;
      this.noteListWritten(document);
    } else if (!this.storeChildTodo(ownerId, document)) return false;
    this.saveRunning({});
    return true;
  }

  /**
   * OQ-213 (REQ-ORCH-029): an accepted root `todo` write that leaves the coordinator's plan holding at least one task is the
   * todo list its task's further work items wait for — the current iteration's task, or in a plan cycle every task it plans
   * (REQ-ORCH-153: the cycle's plan is theirs, as `planCycleTakeUp` records). A person's edit (`editTodo`) never comes here.
   */
  private noteListWritten(document: AgentTodoDocument): void {
    if (this.coordinatorPlan() === null || !document.phases.some((phase) => phase.tasks.length > 0)) return;
    const current = this.iterationTaskRecord();
    const tasks = current !== null ? [current] : this.planHeld ? this.todo.pendingTasks() : [];
    for (const task of tasks) task.listWritten = true;
  }

  /**
   * PD-TOOLS-006 revision 6 (OQ-220): the plan the delegating agent `callerId` keeps, as a delegation's todo item is admitted
   * against it — the root's own plan while it coordinates, with OQ-213's `listWritten` for the current execution task (so an
   * unnamed implementation delegation is refused once the list is written), or a child's own stored todo, which holds no
   * such flag.
   */
  private todoPlanFor(callerId: string): CallerPlan {
    if (this.isRootAgent(callerId)) return { document: this.coordinatorPlan(), listWritten: this.workItemTask()?.listWritten === true };
    return { document: this.agentTodoFor(callerId, false), listWritten: false };
  }

  /**
   * OQ-213 as ruled under the owner's delegation (R-072), building REQ-ORCH-029's "work spanning more than one step is
   * accompanied by a todo list it keeps current": the planner task whose work items the entry port's calls are — the current
   * execution iteration's, while the entry role coordinates. None under `single` (REQ-ORCH-025), none in a plan cycle (its
   * calls neither count nor are refused), none outside an iteration.
   */
  private workItemTask(): Task | null {
    if (this.deps.coordinating === false || this.planHeld) return null;
    return this.iterationTaskRecord();
  }

  /**
   * OQ-213: the refusal the entry port's gate returns for the call that would start the current task's second work item
   * while the coordinator keeps no todo list of its own for it (`Task.listWritten`), or null. Each refusal is logged as a
   * warning citing REQ-ORCH-029. Read live at each dispatch through the tool context's `todoList`.
   */
  todoListOwed(): string | null {
    const task = this.workItemTask();
    if (task === null || (task.workItems ?? 0) < 1 || task.listWritten === true) return null;
    this.deps.warn(`iteration ${this.rootRecord?.iteration ?? this.iterationsCompleted + 1}: ${this.rootName} began the task's second work item with no todo list of its own; the call was refused (REQ-ORCH-029)`);
    return TODO_LIST_OWED_TEXT;
  }

  /** OQ-213: a work item of the entry port reached execution; counted with the current task and saved at once. */
  workItemStarted(): void {
    const task = this.workItemTask();
    if (task === null) return;
    task.workItems = (task.workItems ?? 0) + 1;
    this.saveRunning({});
  }

  /**
   * OQ-213: the entry role's resolved tool set holds no `todo`, so no list can be written and the check refuses nothing —
   * said once per run, while the entry role coordinates, so a persona configured without the tool is not deadlocked silently.
   */
  todoListUnavailable(): void {
    if (this.deps.coordinating === false || this.todoListUnavailableTold) return;
    this.todoListUnavailableTold = true;
    this.deps.warn(`${this.rootName} holds no todo tool, so REQ-ORCH-029's todo list cannot be kept and no work item waits for one on this run`);
  }

  /**
   * REQ-ORCH-059: the open plan items a completion notification reminds the agent `agentId` of — the root's, those its
   * current task answers for (`openRootPlan`); a child's, its own todo's.
   */
  private openTodoFor(agentId: string): readonly string[] {
    if (this.isRootAgent(agentId)) {
      const task = this.iterationTaskRecord();
      return task === null ? openPlanItems(this.coordinatorPlan()) : this.openRootPlan(task);
    }
    return openPlanItems(this.agentTodoFor(agentId, false));
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
   * REQ-MONITOR-142: applies from the next iteration, for the rest of this run (PD-MONITOR-006, OQ-185: it ends with its run,
   * and its row says so); a system row states the switch. It ends a ladder move and takes back an override an earlier wait
   * choice set from the pair chosen (PD-ORCH-013, OQ-177). During a wait (REQ-ORCH-091 d,
   * REQ-NOTIFY-089/263) it is the change-model resolution: the parked agent rebuilds and re-runs at once, and the
   * override is persisted (`model_override` timeline entry) so later calls of the session never return to the
   * exhausted pair. A choice that cannot be applied is never discarded silently: `model_override_rejected` is
   * recorded, the wait continues on the model it had, and the header names the reason.
   *
   * REQ-MONITOR-194: a choice of a pair recorded out of quota clears its exclusion, on either path (`clearChosenExclusion`),
   * so it is eligible again until a further insufficient-quota response re-records it. In a quota wait the waiting pair
   * itself may be chosen: the exclusion is cleared and the wait resolves as a retry on that pair, with no override
   * persisted. (Until 2026-10-02 the waiting pair was refused and no choice cleared an exclusion:
   * an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.)
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
      const chosen = pairKey(provider, resolved.choice.model.modelId);
      const choice = withSettings(this.catalogue, resolved.choice);
      if (chosen === pairKey(waiting.provider, waiting.model)) {
        // A rate-limit wait's own pair is not excluded: choosing it is no change of model, and the wait keeps its timer.
        if (!this.memory.isExhausted(waiting.provider, waiting.model)) {
          this.rejectOverride(waiting, key, `${key} is the model that is waiting (${waiting.provider}/${waiting.model}); choose a different one`);
          return false;
        }
        // REQ-MONITOR-194 / REQ-MONITOR-303: the excluded pair chosen on the quota-wait surface — the exclusion is cleared
        // and the wait resolves as a retry on it. No override: the pair replaces nothing, and an override an earlier choice
        // set for it is taken back (`takeBackOverrideOf`), so the retry calls the pair chosen. Another agent waiting on
        // another pair moves to it, as a change-model choice moves every parked agent.
        this.clearChosenExclusion(key, provider, resolved.choice.model.modelId);
        this.takeBackOverrideOf(`during the wait on ${waiting.provider}/${waiting.model}`, key, choice, waiting.agent === this.rootName ? {} : { switch_pending: this.entrySwitchPending });
        this.overrideWaitingPairs(waiting, key, choice, provider, chosen);
        writer.appendRow('system', `${key} chosen during the wait on ${waiting.provider}/${waiting.model}: it is no longer treated as out of quota, and the call is retried on it now.`, true);
        this.waits.resolveWithModel(key, choice);
        return true;
      }
      this.clearChosenExclusion(key, provider, resolved.choice.model.modelId);
      this.takeBackOverrideOf(`during the wait on ${waiting.provider}/${waiting.model}`, key, choice, waiting.agent === this.rootName ? {} : { switch_pending: this.entrySwitchPending });
      this.overrideWaitingPairs(waiting, key, choice, provider, chosen);
      writer.appendRow('system', `Model changed to ${key} during the wait; the run resumes on it now and keeps it for the rest of the session.`, true);
      this.waits.resolveWithModel(key, choice);
      return true;
    }
    this.clearChosenExclusion(key, providerIdentity(this.catalogue, resolved.choice.model), resolved.choice.model.modelId);
    // OQ-177's ruling (R-071, PD-ORCH-013): every explicit switch wins. It ends a ladder move (`pendingEntrySwitch`), and it
    // takes back an override an earlier wait choice set FROM the pair chosen (REQ-ORCH-091 d), as the quota-wait surface's
    // own choice does, so the entry agent runs on the pair chosen from the next iteration. Until 2026-10-06 the override
    // stood and the row said "but <key>, chosen for <pair> during an earlier wait, stands for the rest of the session".
    // Written before the switch's own entry, so a reader replays the take-back, then the switch. The root's own placement:
    // the switch it belongs to is recorded next and places both.
    this.takeBackOverrideOf('as the entry model', key, withSettings(this.catalogue, resolved.choice), {});
    this.entryOverride = { ...this.entryOverride, model: resolved.choice.model, key };
    this.pendingEntrySwitch = 'model';
    // OQ-185's ruling (R-071, PD-MONITOR-006): the switch holds for the rest of its own run, and the row says so; the
    // composer's model chip is the one control for the next run. Until 2026-10-06 it read "it applies from the next
    // iteration", untrue when the run had none of its own left.
    writer.appendRow('system', `Entry model switched to ${key}; it applies for the rest of this run, after the iteration in flight. The next run starts on the composer's model.`, true);
    // `rebuilds`: whether the root's cell is built anew for this model at its next turn, unless a later switch supersedes
    // this one first. Since OQ-177 it is true on every switch (`pendingEntrySwitch`); until 2026-10-02 it was false onto
    // the model the cell was last built from, which left a ladder move of the root in force — stores written then carry
    // that false, and the autopsy reader still reads it. `supersedes`: this switch replaces one recorded since the cell
    // was last settled, which never applied. The autopsy reader reads both; the record holds nothing else that says so
    // (the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback).
    const supersedes = this.entrySwitchPending;
    this.entrySwitchPending = true;
    writer.appendTimeline('entry_model_switched', 'user', `The entry model switched to ${key}.`, { model: key, rebuilds: this.rootRebuildsFor(resolved.choice.model), supersedes });
    return true;
  }
  /**
   * OQ-188's ruling (R-071, PD-MONITOR-004 revision 2 clause 1): the wait header's keep waiting in a wait that never auto-resumes — a retry
   * of the model the wait shows, not a change of model. The wait is named by its agent and attempt, as the header drew it, and
   * `key` must name its pair; a press that names no outstanding out-of-quota wait — a timed one, one already retried (a second
   * click before the next snapshot), a key of another pair — is refused and changes nothing, so it can never fall through to a
   * switch of the entry model. Accepted, it clears the pair's exclusion as an explicit choice of it does (REQ-MONITOR-194,
   * `clearChosenExclusion`), takes back an earlier override of the pair (`takeBackOverrideOf`, so the retry calls it), persists
   * no override, and resumes the agents parked out of quota on that pair alone (`WaitRegistry.retryOn`), each on its own cell;
   * an agent parked on another pair stays in its own wait, which the header shows next.
   *
   * Until repair round 1 of plan fin21 (2026-10-06) the header sent a plain `setModel` with the key and reached
   * `setEntryModel`'s quota-retry branch, which moves every other parked agent to the waiting pair with a `model_override`
   * that stands for the rest of the session, and a second press, with no wait current, switched the entry model.
   */
  keepWaiting(key: string, agent: string, attempt: number): boolean {
    if (this.ended) return false;
    const waiting = this.waits.all().find((w) => w.agent === agent && w.attempt === attempt);
    if (waiting === undefined || !waiting.exhausted) return false;
    const resolved: ModelLookup = this.deps.models ? this.deps.models(key) : { ok: false, reason: 'this run resolves no model keys' };
    if (!resolved.ok) return false;
    const provider = providerIdentity(this.catalogue, resolved.choice.model);
    if (pairKey(provider, resolved.choice.model.modelId) !== pairKey(waiting.provider, waiting.model)) return false;
    const choice = withSettings(this.catalogue, resolved.choice);
    this.clearChosenExclusion(key, provider, resolved.choice.model.modelId);
    this.takeBackOverrideOf(`to keep waiting on ${waiting.provider}/${waiting.model}`, key, choice, waiting.agent === this.rootName ? {} : { switch_pending: this.entrySwitchPending });
    this.deps.writer.appendRow('system', `Keep waiting: ${key} is retried now and is no longer treated as out of quota.`, true);
    this.waits.retryOn(waiting.provider, waiting.model);
    return true;
  }
  /**
   * REQ-ORCH-091 (d) / REQ-SESSION-026 / REQ-SESSION-196: a wait choice resolves every parked agent (`resolveWithModel`), so
   * every waiting pair but the one chosen is overridden to it — in the memory and as a `model_override` entry of its own, so
   * a reload (`ResilienceMemory.rehydrate`) and both autopsy readers replay every override the run holds. Each entry carries
   * the placement of its own wait's agent: `supersedes` for the root's wait — its choice replaces a switch recorded since its
   * cell was last settled, which then never applies (`entrySwitchPending`); a child's wait leaves the root's switch as it
   * stands — and `switch_pending` for a child's, as a ladder move of the root records it: the root follows the override from
   * its next call (`followOverride`), on the cell from before the switch, and the switch's rebuild then resolves through it,
   * so the autopsy reader reads the choice before the switch
   * (the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it). A root among the
   * waits takes the choice as its entry model, as when its own wait is the one shown. Until 2026-10-02 (fin10) only the shown
   * wait's pair was written, and on the quota-retry path none
   * (a-wait-choice-persists-the-override-for-the-shown-wait-alone): a reload returned the other agents to the pairs replaced.
   */
  private overrideWaitingPairs(shown: WaitState, key: string, choice: ModelChoice, toProvider: string, chosen: string): void {
    const pending = this.entrySwitchPending;
    let rootMoved = false;
    for (const w of this.waits.all()) {
      if (pairKey(w.provider, w.model) === chosen) continue;
      const root = w.agent === this.rootName;
      rootMoved ||= root;
      this.memory.setOverride(w.provider, w.model, { key, choice });
      const message = w.agent === shown.agent
        ? `The user chose ${key} (${toProvider}/${choice.model.modelId}) during the wait on ${w.provider}/${w.model}; it stands for the rest of the session.`
        : `The user chose ${key} (${toProvider}/${choice.model.modelId}) during the wait on ${shown.provider}/${shown.model}; ${w.agent}, waiting on ${w.provider}/${w.model}, resumes on it, and it stands for the rest of the session.`;
      this.deps.writer.appendTimeline('model_override', 'user', message, { provider: w.provider, model: w.model, model_key: key, to_provider: toProvider, to_model: choice.model.modelId, supersedes: root && pending, ...(root ? {} : { switch_pending: pending }) });
    }
    if (rootMoved) { this.entryOverride = { ...this.entryOverride, model: choice.model, key }; this.entrySwitchPending = false; }
  }
  /**
   * REQ-MONITOR-194: "Choosing it explicitly clears the recorded exclusion for that pair, so it is eligible again until a
   * further insufficient-quota response re-records it" — in the session's memory and as a `model_exhausted` entry carrying
   * `cleared: true`, which `ResilienceMemory.rehydrate` replays, so the clearing survives a resume as the exclusion does.
   * Nothing is written for a pair that was not excluded.
   */
  private clearChosenExclusion(key: string, provider: string, modelId: string): void {
    if (!this.memory.clearExhausted(provider, modelId)) return;
    this.deps.writer.appendTimeline('model_exhausted', 'user', `The user chose ${key} (${provider}/${modelId}) explicitly; the pair is no longer excluded as out of quota and is eligible again until a further insufficient-quota response.`, { provider, model: modelId, model_key: key, cleared: true });
  }
  /**
   * REQ-ORCH-091 (d) with REQ-MONITOR-303 and REQ-MONITOR-194: the user's newest explicit choice of a pair in a wait — a
   * change of model, or the waiting pair itself chosen for a retry — supersedes any override an earlier choice set FROM
   * that pair, so the agent resumes on the pair chosen, as the wait's row says. Since OQ-177's ruling (R-071, PD-ORCH-013,
   * 2026-10-06) a switch of the entry model from the run header or the inspector does the same (`where`: "as the entry
   * model"), so every explicit choice wins. The override is taken back in the memory
   * and as a `model_override` entry carrying `cleared: true`, `cause: 'superseded'` (fin6's shape for a taken-back pin),
   * which `rehydrate` and both autopsy readers replay; with the chosen pair's own override gone, the new override from the
   * waiting pair can never lead back to it, so the chain never cycles. An agent whose cell had already followed the
   * override stays where it is (`followOverride` moves a cell; nothing moves it back). `root_cell` says where the root's
   * cell is at the choice — `followed` (on any pair of the chain from the override's own target on, `onChainFrom`: it moves
   * along the rest of the chain from its next call, and the reader keeps it on the chain's end instead of returning it to
   * the pair), `on_pair` (still on the pair, its call in flight or waiting there when the override was set:
   * the reader takes back the target's key it printed, which the root never ran on) or `elsewhere`. `placed`
   * is the choice's own placement against a pending entry switch (`switch_pending` for a child's), so the reader orders the
   * two entries alike.
   *
   * Until this repair round only an override whose chain led back to the waiting pair was taken back
   * (`ResilienceMemory.supersededBy`, 822224c): a chosen pair with an older override elsewhere kept it, and the agent
   * followed it off the pair chosen before its first call — a1 → c1, then a1 chosen in f1's wait, called c1 while the row
   * said "resumes on a1" (the verifier's repair-round-2 finding on
   * a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced). Until repair round 3, `followed` was recorded only
   * for a root on the chain's END: a root that had followed a1 → c1 and was still on c1 when c1 → f1 was added recorded
   * `elsewhere`, and both autopsy readers returned it to a1 while it called f1 (the verifier's repair-round-3 finding).
   */
  private takeBackOverrideOf(where: string, key: string, choice: ModelChoice, placed: Readonly<Record<string, unknown>>): void {
    const provider = providerIdentity(this.catalogue, choice.model);
    const modelId = choice.model.modelId;
    const old = this.memory.overrideFor(provider, modelId);
    if (old === undefined) return;
    const cell = this.rootCell?.model.model;
    const rootCell = cell === undefined ? 'elsewhere' : sameRef(cell, choice.model) ? 'on_pair' : this.onChainFrom(old.choice, cell) ? 'followed' : 'elsewhere';
    this.memory.clearOverride(provider, modelId);
    this.deps.writer.appendTimeline('model_override', 'user', `${key} (${provider}/${modelId}) was chosen ${where}; the earlier override that replaced it with ${old.key} is taken back.`, { provider, model: modelId, cleared: true, cause: 'superseded', root_cell: rootCell, ...placed });
  }
  /**
   * Whether `cell` is a pair of the override chain that starts at `from` — the taken-back override's own target or any pair
   * it leads on to. A root on any of them followed the override and moves along the rest of the chain from its next call
   * (`followOverride`), so it ends where the chain ends, never back on the pair the override replaced. Bounded by the
   * pairs already passed, for a cycle an older store replays.
   */
  private onChainFrom(from: ModelChoice, cell: ModelRef): boolean {
    const passed = new Set<string>();
    for (let at: ModelChoice | undefined = from; at !== undefined;) {
      if (sameRef(at.model, cell)) return true;
      const provider = providerIdentity(this.catalogue, at.model);
      const key = pairKey(provider, at.model.modelId);
      if (passed.has(key)) return false;
      passed.add(key);
      at = this.memory.overrideFor(provider, at.model.modelId)?.choice;
    }
    return false;
  }
  private rejectOverride(waiting: WaitState, key: string, reason: string): void {
    const message = `The model was not changed: ${key} could not be applied (${reason}). The wait on ${waiting.provider}/${waiting.model} is still outstanding; choose again or cancel the run.`;
    this.deps.writer.recordIssue({ kind: 'model_override_rejected', severity: 'warning', actor: 'user', message, metadata: { requested_model: key, reason, waiting_provider: waiting.provider, waiting_model: waiting.model } });
    this.deps.warn(message);
    this.waits.reject(message);
  }
  /**
   * REQ-NOTIFY-078: re-authentication re-pinned the primary model — the session's memory no longer maps the failed pair to
   * the fallback — so the root's cell is rebuilt from the memory at its next turn: the switch applies from the next
   * iteration, and the turn in flight finishes on the model it has. False for a run that has ended.
   */
  rebuildEntryFromMemory(): boolean {
    if (this.ended) return false;
    this.entryRebuild = true;
    return true;
  }
  setEntryReasoning(level: ThinkingLevel): boolean {
    if (this.ended) return false;
    this.entryOverride = { ...this.entryOverride, thinking: level };
    if (this.pendingEntrySwitch !== 'model') this.pendingEntrySwitch = 'reasoning';
    // OQ-185's ruling (R-071, PD-MONITOR-006): held for the rest of this run; the composer's reasoning chip chooses the next run's.
    this.deps.writer.appendRow('system', `Entry reasoning level switched to ${level}; it applies for the rest of this run, after the iteration in flight. The next run starts at the composer's reasoning level.`, true);
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
    // REQ-MONITOR-133/134 with OQ-128: no agent of this run steps again, so steering closes before anything is awaited and
    // a prompt still pending — for the entry role, whose iteration has closed — is recorded as not delivered.
    this.closeSteering('the run paused at the message limit');
    // OQ-170, ruled 2026-10-06 (R-071): no agent of this run steps again, so its tool ports close here as they do at a
    // teardown — every call still open settles `failed` (REQ-MONITOR-228), and one that returns later writes nothing.
    this.closePorts();
    writer.appendRow('system', `Paused: ${count} message${count === 1 ? '' : 's'} reached the limit of ${limit}. Continue, double the limit, or cancel the run.`, true);
    this.sampler?.cancel();
    this.sampleTokens(false);
    writer.pauseAtLimit(count, limit, { ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), iterations_completed: count, todo: this.todoJson(), progress: JSON.stringify(this.progress()) });
    if (writer.failed) return this.teardown('agent_session_aborted');
    // finacc3 F05: the rest is written; no control accepted from here saves an active status over it (`endWritten`).
    this.restWritten = true;
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
  private async parkAtPlanGate(resumed: number | null = null): Promise<RunResult> {
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
      /*
       * PD-ORCH-003 revision 2: a plan cycle after a resumed iteration plans the work still pending — the launch content
       * is the continue that resumed the iteration — so the tasks the next iteration would take up, in that order, lead,
       * and the launch content follows as the session's context, said to be carried out only when the resumed iteration
       * closed the messages it held as done (PD-ORCH-005 clause 17; OQ-104) — this continue's, or an earlier one's that the
       * Continue action resumed it with (found by the iteration lane review). That launch content is the payload the
       * continue built before the resumed iteration ran, so its handoff predates the close the preamble states; nothing
       * rebuilds it here (OQ-104, "The handoff after the preamble is the continue's", which the repair of
       * every-iteration-is-sent-the-prompt-the-run-was-launched-with.md kept: a plan cycle is sent no iteration task).
       */
      const held = this.resumedMessageIds.map((id) => this.todo.task(id)?.state);
      const message = held.length === 0 ? 'none' : held.every((state) => state === 'complete') ? 'done' : 'pending';
      const preamble = resumed === null ? planRequestSection() : `${planRequestSection()}\n\n${resumedWorkSection(resumed, this.todo.pendingTexts(), message)}`;
      const content: readonly ContentPart[] = [
        { kind: 'text', text: preamble },
        ...(this.deps.taskContent ?? [{ kind: 'text' as const, text: this.deps.task }]),
      ];
      // REQ-ORCH-075 (OQ-203): the cycle takes up the tasks it plans, before its turn writes the plan they will answer for.
      this.planCycleTakeUp();
      const report = await this.turn(`${preamble}\n\n${this.deps.task}`, 0, content);
      plan = report.status === 'failed' ? '' : report.text.trim();
      // REQ-NOTIFY-070: a plan cycle's turn is the root's model call too, so its failure records the model it was calling,
      // as an iteration's does — a first 401 here restarts on the fallback like any other (the repair of the plan-mode
      // finding on docs/defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md).
      if (report.status === 'failed') this.recordRootModelFailure(report.error);
    } catch (cause) {
      this.lastFailure = String(cause);
      this.failedModel = null;
    }
    // A stopped cycle, and one whose turn produced no plan, end the run in teardown, whose own close records a prompt still
    // pending as not delivered because the run ended — reached before anything is awaited, as the park's close below is.
    if (this.stop.requested) return await this.teardown(this.stop.reason ?? 'user_cancelled');
    if (plan === '') {
      // Nothing to put a decision on. A gate with no plan would offer three answers over an empty surface, so the
      // run ends the way a failed root iteration does (REQ-ORCH-074) and the reason is the role's own.
      this.lastFailure = this.lastFailure ?? 'the entry role produced no plan text while the run was held at the plan gate';
      return await this.teardown('agent_session_aborted');
    }
    /*
     * REQ-MONITOR-133/134 with OQ-128: the run parks, and no agent of it steps again — the gate's release starts the next
     * run — so steering closes here, as the park begins and before anything is awaited, and a prompt still pending is
     * recorded as not delivered because the run was held at the plan gate. Only here, on the path that parks: the close
     * sat above the two branches that end the run instead, and named a gate that never opened for a stopped cycle or a
     * failed one (found by the fourth review of the repair of a-steering-prompt-pending-at-a-rest-is-lost).
     */
    this.closeSteering('the run was held at the plan gate');
    // OQ-170, ruled 2026-10-06 (R-071): the gate's release starts the next run, so this run's tool ports close at the park
    // as they do at a teardown — every call still open settles `failed` (REQ-MONITOR-228), and one that returns later writes nothing.
    this.closePorts();
    writer.appendRow('system', `A plan is ready for your decision (cycle ${cycle}). Approve to release execution, revise to ask for another plan, or cancel the run.`, true);
    this.sampler?.cancel();
    this.sampleTokens(false);
    const opened = writer.openPlanGate(cycle, plan, intent, this.todoJson(), this.deps.plan?.changes ?? '', {
      ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), todo: this.todoJson(), progress: JSON.stringify(this.progress()),
    });
    if (!opened.ok || writer.failed) return this.teardown('agent_session_aborted');
    // finacc3 F05: the hold is written; no control accepted from here saves an active status over it (`endWritten`).
    this.restWritten = true;
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
   * clause 3 keeps final: REQ-MONITOR-126's cancel control, "cannot be undone in this session", which every confirmed
   * "Cancel the run?" sends (clause 15).
   */
  cancelAgent(taskId: string): boolean {
    if (this.ended) return false;
    if (this.isRootAgent(taskId)) {
      // Clause 3: a cancel that lands after teardown can no longer close what the rest left open is refused, not lost; so is
      // one that lands after the message-limit pause or the park wrote its rest (finacc3 F05), which the rest's own cancel
      // (`continueSession`, `planDecision`) answers once the run has ended.
      if (this.endWritten) return false;
      this.stop.request('user_cancelled', false, true);
      // OQ-103's last question, ruled (R-067): the cancel is made durable when it is accepted, so a host that dies before
      // this run carries it out leaves the next repair or continue to end its agents `cancelled`, never to resume them.
      this.markCancelAccepted();
      // OQ-165, ruled 2026-10-06 (R-071): the accepted cancel is saved `cancelling`, as the stop's control saves it, so every
      // window reads it from the session record (REQ-MONITOR-127, REQ-MONITOR-130) and a window's own optimistic overlay
      // hands over to it. Before, the record read `running` (or `waiting`) through the graceful stop until the teardown
      // wrote the run's end, and only the window that sent the cancel showed `cancelling`. It holds until then
      // (`saveRunning`).
      this.cancelSaved = true;
      this.saveRunning({});
      return true;
    }
    return this.children?.cancel(taskId) ?? false;
  }

  /**
   * REQ-SESSION-186's stop, accepted by the stop control (`Sessions.control`, `op: 'cancel'`): saved `cancelling`, and held
   * there by every later save of the run on its way to rest, as the explicit cancel's is (OQ-165's reading, ruled 2026-10-06 by R-071). Until fin22 the
   * control wrote the status itself and the run's next save (a token sample, a child's settle, a mode change) wrote `running`
   * again, so every window read `running` for the rest of the graceful stop
   * (`docs/defects/fixed/a-stops-saved-cancelling-reads-running-again-at-the-runs-next-save.md`).
   */
  stopAccepted(): boolean {
    // finacc3 F05: refused once the run's end is written — the teardown's, or a rest's — as the explicit cancel is (`cancelAgent`).
    if (this.endWritten) return false;
    this.cancelSaved = true;
    this.saveRunning({});
    return true;
  }

  /**
   * PD-ORCH-005 clause 3 (OQ-103, R-067): the explicit cancel's durable mark, on the iteration open in the store — the one
   * this run works in, or resumes, or an earlier run left open for it to resume. Written again when this run opens an
   * iteration after the cancel was accepted (`turn`), so no iteration the cancel ends is left open unmarked. A failed write
   * is warned of: the cancel itself stands, and only its durability across a crash is lost.
   */
  private markCancelAccepted(): void {
    const r = this.deps.writer.recordCancelAccepted();
    if (!r.ok) this.deps.warn(`the explicit cancel of ${this.sessionId} was accepted but could not be recorded durably: ${r.error.code}`);
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
   * PD-ORCH-005 clause 9: the interruption that withdraws what waits on a person, read when a stop request lands, or null
   * when the waits are cancelled (REQ-TOOLS-052) — the explicit cancel and a stop the run raised itself. A stop withdraws
   * by `stop` and a quit by `quit` whether or not a plan cycle holds the run: clause 15 has the quit withdraw an approval
   * its dialog closes and PD-CHAT-002 revision 2 a question, in every case the directive decides, a plan cycle among
   * them. The withdrawal's cause is its own, so the plan hold is never read here; a cycle's agents still end and no
   * interruption is recorded of them (`restCause`, clause 15). Readings in OQ-108.
   */
  private get waitsWithdrawnBy(): Interruption | null {
    if (this.stop.final) return null;
    if (this.stop.reason === 'application_shutdown') return 'quit';
    return this.stop.reason === 'user_cancelled' ? 'stop' : null;
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
    if (all.length === 0 || this.endWritten) return { ok: false };
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

  private saveRunning(extra: { run_started_at?: string | null; permission_mode?: string; sandboxed?: number; sandbox_backend?: string }, status: 'running' | 'waiting' = this.waits.size > 0 ? 'waiting' : 'running'): void {
    // finacc3 F05: nothing of the run writes an active status over the end its teardown wrote (`endWritten`); the terminal
    // transaction's own patch carries what a save from here would have.
    if (this.endWritten) return;
    // REQ-MONITOR-124: an accepted pause reads `pausing` until the run has come to rest — a wait the pause releases, or any
    // other save on the way to rest, does not read `running` again (found by phase 3's second review).
    // OQ-165: an accepted explicit cancel reads `cancelling` until the teardown writes the run's end, over a pause accepted
    // before it, since the cancel is final (PD-ORCH-005 clause 3); so does an accepted stop (`stopAccepted`, fin22).
    const r = this.deps.writer.save(this.cancelSaved ? 'cancelling' : this.pauseRequested ? 'pausing' : status, {
      ...this.aggregates.patch(), token_samples: JSON.stringify(this.tokenSamples), iterations_completed: this.iterationsCompleted,
      todo: this.todoJson(), progress: JSON.stringify(this.progress()),
      ...(extra.run_started_at === undefined ? {} : { run_started_at: extra.run_started_at }),
      ...(extra.permission_mode === undefined ? {} : { permission_mode: extra.permission_mode }),
      ...(extra.sandboxed === undefined ? {} : { sandboxed: extra.sandboxed }),
      ...(extra.sandbox_backend === undefined ? {} : { sandbox_backend: extra.sandbox_backend }),
    });
    if (r.ok) this.deps.onSaved?.(r.value);
  }

  private progress(): Record<string, unknown> {
    return { schema_version: 1, iterations_completed: this.iterationsCompleted, completed: this.todo.completedCount, abandoned: this.todo.abandonedCount, last_failure: this.lastFailure };
  }

  /** REQ-SESSION-094: the ordered pipeline, each step guarded, the whole of it run even on exception. */
  private async teardown(reasonIn: StopReason): Promise<RunResult> {
    const { writer, owner, bus, clocks } = this.deps;
    // REQ-SESSION-094: every agent's turn has returned or been given up on, so nothing of this run's tool ports is owed
    // from here. Each is closed before anything terminal is written: a call still open settles now, and one that returns
    // later writes nothing through its gate into the finished session, or into a later run's.
    this.closePorts();
    // REQ-MONITOR-133/134 with OQ-128: no agent takes another step from here, so steering closes before anything is awaited
    // — a steer while the hooks run is refused, not acknowledged for nothing to deliver — and what is still pending is
    // recorded as not delivered.
    this.closeSteering();
    // PD-ORCH-005 clause 10: a run that comes to rest records its agents' background sessions — a stop and a quit end them,
    // and so does the explicit cancel, which is a stop the user made final (OQ-96). Guarded like every teardown step.
    const ended = this.terminalsEndedBy();
    if (ended !== null) {
      try { await this.restTerminals(ended); } catch (cause) { this.deps.warn(`recording the background sessions of ${this.sessionId} failed: ${String(cause)}`); }
    }
    // REQ-EVENTS-028 / REQ-SESSION-092: a requested cancellation wins over any other outcome.
    const stopReason: StopReason = this.stop.requested ? (this.stop.reason ?? 'user_cancelled') : reasonIn;
    const classified = classifyStop(stopReason);
    if (classified.diagnostic) this.deps.warn(classified.diagnostic);
    // OQ-199 (PD-ORCH-009): the run ends here after an iteration whose root wrote no answer — unless it is only paused, to
    // be continued, when the iteration is what ended without one.
    try { this.tellUnanswered(classified.result !== 'interrupted'); } catch (cause) { this.deps.warn(`telling ${this.sessionId}'s answerless iteration failed: ${String(cause)}`); }
    const summary = summarise({ stopReason, completed: this.todo.completedCount, abandoned: this.todo.abandonedCount, lastFailure: this.lastFailure });
    // REQ-SESSION-093: on normal completion the persisted status comes from the summarisation (a run that
    // abandoned its only task persists `failed` even though REQ-MONITOR-301 classifies its stop as
    // completed); every other outcome takes REQ-MONITOR-029's mapping.
    const status = classified.result === 'completed' ? summary.status : statusForResult(classified.result);
    const elapsed = this.startedAt === null ? null : (clocks.monotonic.now() - this.startedAt) / 1000;
    // REQ-NOTIFY-093: a wait the user cancelled ends the run with the limit condition as its error, so main classifies it (REQ-NOTIFY-063).
    const error = this.lastFailure ?? this.waits.cancelledReason;
    // REQ-HOOKS-076 / REQ-HOOKS-080: a `child_completed` the user's cancel of one child queued once the iteration's own
    // waits were done — a paused child cancelled while the rest was being recorded — ends before `session_end`.
    await this.childCompletionsSettled();
    // REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 (the repair of
    // `a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`): the user's cancel of one paused child is
    // accepted until the run has ended (`cancelAgent`), but one accepted from here, while `session_end` runs or after it,
    // ends the child and fires no `child_completed`, which would follow `session_end`.
    this.children?.endLifecycle();
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

/**
 * PD-ORCH-005 clause 17: the iterations the record holds closed `succeeded` — what a task a closed iteration still holds
 * is settled against (`Todo.releaseStale`), here and by the session manager before it judges what a continue restates.
 */
export function succeededIterationsOf(dal: StoreDal, sessionId: SessionId): ReadonlySet<number> {
  return new Set(dal.iterationsOf(sessionId).filter((i) => i.state === 'closed' && i.outcome === 'succeeded').map((i) => i.iteration));
}

/**
 * What a death between an iteration's close and the save of its todo left, settled as the record says that iteration
 * closed, before anything reads the todo — here and by the session manager before it judges what a continue restates:
 * a task a closed iteration still holds (PD-ORCH-005 clause 17, `Todo.releaseStale`), and an iteration's own task left in
 * progress (`Todo.settleStranded`), read from the latest row whose `todo_task_id` names it. Since the close and the todo
 * commit together (`SessionWriter.endIteration`) neither is left by this build; a store an earlier build wrote can hold
 * both (the repair of `an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`).
 */
export function settleClosedIterations(todo: Todo, dal: StoreDal, sessionId: SessionId, open: IterationRow | null | undefined): void {
  const rows = dal.iterationsOf(sessionId);
  todo.releaseStale(open?.iteration ?? null, succeededIterationsOf(dal, sessionId));
  todo.settleStranded(open?.todo_task_id ?? null, (taskId) => {
    const latest = rows.filter((r) => r.todo_task_id === taskId).at(-1);
    return latest?.state === 'closed' ? latest.outcome : undefined;
  });
}

/**
 * What a fresh root is told, after the launch content, when the todo task its iteration selected is not the run's own and
 * the launch content's request is another — the task's text, as the task to work on (REQ-CHAT-040, REQ-ORCH-004 /
 * REQ-ORCH-135). A continue's message is told in PD-ORCH-005 clause 17's words ("so the next iteration takes it up",
 * OQ-102). Attachments are not carried: a task holds its text only (OQ-102).
 */
function takenUpText(task: { readonly text: string; readonly message: boolean }): string {
  if (task.message) return `The task for this iteration is an earlier message from the user, which the iteration it was sent to did not finish. Work on it now; the latest user request above is a separate task.\n\n${task.text}`;
  return `The task for this iteration is the task below, from the session's todo. Work on it now. What precedes it is what this run was launched with: read it as context, and leave any other work it asks for to its own task.\n\n${task.text}`;
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

/**
 * REQ-ORCH-075 (OQ-203): a task's plan record as the stored todo holds it — strings only, so a record a hand or an earlier
 * build wrote in another shape reads as none rather than raising.
 */
function storedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** `PD-ORCH-015`: a task's held answer as the stored todo holds it — a non-empty string, or none. */
function storedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
