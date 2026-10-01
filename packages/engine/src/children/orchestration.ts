import { type Clocks, countNoun, millis, type Millis, type SessionId, type TimerHandle } from '@rotaris/kernel';
import { interruptionPhrase, isTerminalChildState, reportStatusToState, resumeStateFor, TASK_ID_PATTERN, type ChildState, type Interruption, type RootExecutionRecord } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import { isSteeringMessage, runTurn, type SteeringPrompt, type ToolPort, type TurnOutcome } from '../run/turn.js';
import { answerOpenCalls, recordCutChild } from '../run/crash.js';
import { callsRun } from '../run/interruption.js';
import type { AttachmentOutcome, BackgroundOutput, DelegateOutcome, DelegateRequest, DelegationOps, WaitOutcome } from './delegation.js';
import { fullContextBlock, siblingIndexBlock, type AttachedResolution } from '../artifacts/context.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { ChildLedger, storeChildReport, userCancellation, writeCancelledTeardown, writeTeardown, type Budget } from './ledger.js';
import { childPayload, completionNotification, parseReport, priorAgentContext, reportBlock, resumeMessage } from './notify.js';
import { CHILD_STALL_TIMEOUT_MS, continuationRefusal, cutOffLines, cutOffReport, ProgressLog, type CutOff } from './cut-off.js';
import { resolveRole, type Persona, type PersonaResolver } from './personas.js';
import { fallbackReport, produceReport, type ReportInput, type SummariserDeps } from './report.js';
import { Scheduler } from './scheduler.js';
import { correctiveInstruction, correctiveMessageLine, hadCorrectiveMessage, StallWatch, stallRecoveredLine, stallRecoveryDue, stallWaitingLine, stallWarning } from './stall.js';
import { fileWriters, scopeWithoutWriterReason, validateWriteScope, WriteClaims, writeScopeBlock, writesFiles, type ClaimHit, type ScopeDisclosure } from './write-scope.js';
import type { HookPort } from '../hooks-port.js';
import { withContextUnits, withPlaybook } from '../run/run.js';
import { STOP_GRACE } from '../run/grace.js';
import type { LoopSupervisor } from '../run/supervisor.js';
import type { TurnResilience } from '../run/ladder.js';
import { providerIdentity, type ModelChoice } from '../run/resilience.js';
import type { TurnCompression } from '../run/compression.js';
import type { PricedUsage } from '../run/pricing.js';
import { todoLinesFromStored } from '../todo-view.js';
import type { ConversationRecord } from '../run/record.js';
import { firstTurn, resumedStart, type TurnStart } from '../run/resume.js';

/**
 * One iteration's children (REQ-ORCH-072: a fresh ledger per iteration under the clamped policy): the
 * delegation operations the tools call, the child's execution from `starting` to a terminal state
 * (REQ-ORCH-088's hard timeout, with PD-ORCH-004's hand-back for a child cut off while making progress;
 * REQ-ORCH-095's assessment with one re-prompt; the report; REQ-ORCH-098's teardown), and the parent's resume
 * loop (REQ-ORCH-055/056/057/059: resumed with the newly terminal children's reports whenever one reaches a
 * terminal state it has not observed; idle otherwise; the same loop serves the root and a child that delegated).
 */
export const CHILD_TIMEOUT_MS: Millis = millis(1_200_000);

/**
 * REQ-ORCH-088 says the expiry GRACEFULLY PAUSES the child, and the hard abort that stood here alone
 * is not that: it cut the child off inside a tool call, which is why the report it then produced carried
 * no last response at all. The pause is `turn.ts`'s own — the turn stops before its next model step with
 * its text intact — and the abort stays behind it as the backstop, so a child that cannot land inside the
 * window is still cut off and REQ-CONFIG-113's ceiling keeps its meaning.
 *
 * The window is the run's own `STOP_GRACE` rather than a second figure derived here: ADR-0014 rule 1
 * calls it "the one 30 s allowance" and this is a third reader of it, not a second figure. It is taken
 * from `run/grace.js` and never from `run/run.js`, for the reason that file gives. Should 30 s prove
 * wrong for a landing, that is reported back beside this reason rather than repaired quietly.
 */
export const CHILD_LANDING_GRACE: Millis = STOP_GRACE;

export interface ChildrenDeps {
  readonly sessionId: SessionId;
  readonly workspaceRoot: string;
  readonly dal: StoreDal;
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly backend: AgentBackend;
  readonly clocks: Clocks;
  readonly model: ModelRef;
  /** REQ-CONFIG-094: the `models:` key of `model` (`RunConfig.modelKey`); absent means its id stands in. */
  readonly modelKey?: string | undefined;
  readonly thinking: ThinkingLevel;
  readonly modelTimeoutMs: number;
  readonly modelRetries: number;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly maxStepsPerTurn: number;
  readonly budget: Budget;
  readonly modelCap: (modelKey: string) => number | null;
  /** REQ-CONFIG-094: the slots the process's other runs hold on a key (`ModelSlots.heldElsewhere`); absent means none. */
  readonly slotsHeldElsewhere?: ((modelKey: string) => number) | undefined;
  /** REQ-MONITOR-020: a child of this iteration reached a terminal state, so a slot may have freed for another run. */
  readonly onSlotFreed?: (() => void) | undefined;
  /** The tool surface for an agent — the root or a child — with its own delegation identity. */
  readonly toolsFor: (persona: string, agentName: string, delegation: DelegationOps, parentId: string, depth: number, canonicalName?: string, parentPersona?: string) => ToolPort | null;
  readonly summariser: SummariserDeps | null;
  readonly childTimeoutMs?: Millis;
  /**
   * PD-ORCH-004 / REQ-CONFIG-113: `runtime.child_stall_timeout`, the progress rule's window and the stall watch's threshold
   * (REQ-ORCH-089); absent means the engine's 90 s.
   */
  readonly childStallTimeoutMs?: Millis | undefined;
  readonly runSignal: AbortSignal;
  readonly warn: (m: string) => void;
  /**
   * REQ-MONITOR-102: the persisted total is SESSION-wide, so a child's calls reach the run's aggregates as the
   * child settles — once per child, from the one place its count is known. Without it the total is the entry
   * agent's own calls, and a surface that subtracts the per-agent counts from it (the synthetic run row) reads
   * zero on any run that delegated. Found by the live run's first execution, 2026-09-11.
   *
   * `child` is the child's own count that now holds those calls: the run persists it with the session's total in one
   * transaction (`SessionWriter.countToolCalls`), so a crash never leaves a call held by one and not the other — the crash
   * record adds what a child's record shows beyond its count (the repair of
   * `a-roots-calls-before-a-crash-never-reach-the-session-total.md`).
   */
  readonly countToolCalls?: ((n: number, child?: { readonly taskId: string; readonly calls: number }) => void) | undefined;
  /**
   * REQ-EVENTS-053, PD-MONITOR-001: every completed provider request a child makes is a request of the run, so it
   * reaches the run's cumulative tokens and cost through the same callback the entry agent's turn uses. Without it
   * the run's totals counted the entry agent alone (`a-delegated-childs-provider-requests-never-reach-the-runs-totals`).
   */
  readonly onRequestUsage?: ((usage: PricedUsage) => void) | undefined;
  /** ADR-0015: `child_completed` fires once a child has finished, whatever its final state (REQ-HOOKS-003). */
  readonly hooks?: HookPort | null | undefined;
  /** REQ-ORCH-019: the rendered playbook per role; null or '' means no playbook. */
  readonly playbookFor?: ((role: string) => string) | null | undefined;
  /**
   * REQ-WORKSPACE-060 (ADR-0063): the session's always-active context units — the skill catalog and any
   * force-loaded bodies. The run passes its own getter through unchanged, so every agent of a session sees
   * one catalog (REQ-WORKSPACE-065 forbids per-persona scoping) and a mid-session force-load reaches the
   * next child built without touching one already running.
   */
  readonly contextUnits?: (() => readonly string[]) | undefined;
  /** REQ-ORCH-015: on the answer route the answered category is accepted at once. */
  readonly route?: 'answer' | 'work' | undefined;
  readonly supervisorFor?: ((conversationId: string) => LoopSupervisor) | undefined;
  /** ADR-0036: the configured personas over the built-in table; absent means the built-in table alone. */
  readonly personas?: PersonaResolver | undefined;
  /** REQ-MONITOR-133: the pending steering prompts per child conversation. */
  readonly steeringFor?: ((conversationId: string) => () => readonly SteeringPrompt[]) | undefined;
  /**
   * REQ-MONITOR-135: whether a steering prompt is pending for the agent `agentId` (a child's task id, or the root's), read
   * without taking it — a stall evaluation asks, and only the step it wakes delivers. Absent means none ever is.
   */
  readonly steeringPending?: ((agentId: string) => boolean) | undefined;
  readonly shouldPause?: (() => boolean) | undefined;
  /**
   * PD-ORCH-005: the interruption the run is coming to rest by — a pause, a stop or a quit — or null when it is not, or
   * when its stop is the explicit cancel (which ends its children `cancelled`, as before).
   */
  readonly restCause?: (() => Interruption | null) | undefined;
  /** PD-ORCH-005 clause 2 / REQ-ORCH-134: aborted when the pause's tool deadline passes; every child's calls run under it. */
  readonly cutCalls?: AbortSignal | undefined;
  /** PD-ORCH-005 clause 10: what a resumed agent is told of the background sessions it had started; null for none. */
  readonly resumeNotice?: ((taskId: string) => ChatMessage | null) | undefined;
  /** Part Q: the ladder for a child — its own cell (one fallback across both routes, REQ-ORCH-144) over the run's memory and waits. */
  readonly resilience?: { readonly forChild: (persona: Persona | undefined, current: ModelChoice, unresponsiveBoundMs: number) => TurnResilience } | undefined;
  /**
   * Part AH (ADR-0060): compression for a child — the trigger resolved against the model THIS child calls, and
   * the child's OWN task plan carried across (REQ-MONITOR-078, REQ-MONITOR-084 (4)).
   */
  readonly compressionFor?: ((current: ModelChoice, todoLines: () => readonly string[]) => TurnCompression | undefined) | undefined;
  /** Part Y (REQ-LIBRARY-092/097/098): the session artifact store — child reports land in it and its two context blocks reach every child. */
  readonly artifacts?: ArtifactStore | undefined;
  /**
   * REQ-ORCH-153 (ADR-0062): "While the gate is held the run MUST NOT spawn a child whose role holds such a
   * tool." `held` is the run's own live read; `withholds` is the registry predicate, injected because the
   * declarations live in `@rotaris/agent-tools` and the engine does not import it (ADR-0002's boundaries).
   * Absent means no gate can hold this run and no delegation is refused on its account.
   */
  readonly planGate?: { readonly held: () => boolean; readonly withholds: (tool: string) => boolean } | undefined;
  /** REQ-ORCH-072: the iteration's root execution record. */
  readonly rootRecord?: RootExecutionRecord | undefined;
  /** PD-ORCH-005 clause 1: the conversation record each child's turn appends to; absent means nothing is recorded. */
  readonly record?: ConversationRecord | undefined;
}

/**
 * REQ-CONFIG-094 / REQ-MONITOR-049 / REQ-MONITOR-020 (live-run finding D5): the key a child is recorded under — its
 * `model_key` — is the `models:` key of the model it runs on, the key configuration states `max_parallel` and
 * `max_input_tokens` under. It was the model's bare id, which no configured key matched once a key was qualified
 * (`openai-compatible--katalyst/qwen3.8-flash-next`), so every cap lookup found none and every context meter read
 * REQ-MONITOR-080's default. The role's own key when it names a model; else the run's; the id stands in only where no
 * configuration names a key.
 */
export function childModelKey(persona: Pick<Persona, 'modelRef' | 'modelKey'> | undefined, run: Pick<ChildrenDeps, 'model' | 'modelKey'>): string {
  if (persona?.modelRef) return persona.modelKey ?? persona.modelRef.modelId;
  return run.modelKey ?? run.model.modelId;
}

/**
 * The persona `name` names, an alias resolved to its target (REQ-ORCH-034: "Role aliases MUST be resolved before spawn") —
 * the one the ledger will spawn, so admission reads the same role: REQ-ORCH-153's plan-gate refusal, the grant and the
 * model key. The built-in path read `BUILT_IN_PERSONAS` alone until 2026-09-30, so `coder` and `playwright` read as no
 * persona there (`docs/defects/fixed/delegate-reads-no-alias-on-the-built-in-table.md`).
 */
function personaOf(deps: ChildrenDeps, name: string): Persona | undefined {
  return (deps.personas ? deps.personas.resolve(name) : resolveRole(name))?.persona;
}

/** How a resumed child carries on (PD-ORCH-005 clause 4). */
interface ChildResume {
  /** Its recorded conversation, with anything it is told at its resume. */
  readonly history: readonly ChatMessage[];
  /** It had answered and was summarising: REQ-ORCH-095's assessment was made before the rest. */
  readonly assessed: boolean;
}

export class IterationChildren implements DelegationOps {
  readonly ledger: ChildLedger;
  readonly scheduler: Scheduler;
  private readonly startedAt = new Map<string, Millis>();
  private readonly toolCalls = new Map<string, number>();
  private readonly resumeWaiters = new Map<string, () => void>();
  /** PD-TOOLS-006: the live write scopes' claims, in acceptance order, and each child's disclosure as fixed at its acceptance. */
  private readonly claims = new WriteClaims();
  private readonly disclosures = new Map<string, ScopeDisclosure>();
  /** PD-ORCH-005: every child execution in flight, so a rest can wait for each to come to rest before it sweeps. */
  private readonly executing = new Set<Promise<void>>();
  /**
   * REQ-HOOKS-076 / REQ-HOOKS-080 (the repair of `a-child-completed-hook-can-finish-after-its-iteration-ends.md`): each
   * child whose settle has made its terminal move and is running its `child_completed` hook, in line with the run, until
   * the scheduler is told it settled. Its parent takes it as ended only then (`settlesOf`), as a parent the settle wakes
   * does, so the hook finishes before the parent goes on and before the iteration's own hooks.
   */
  private readonly settles = new Map<string, Promise<void>>();
  /**
   * REQ-HOOKS-003 / REQ-HOOKS-076: the child whose own settle is telling the scheduler it settled (`afterTerminal`), which
   * fires its `child_completed` itself. Every other terminal move the scheduler is told of fires it from outside
   * (`completedOutside`). A `settles` entry could not say this: an outside hook still queued holds one too, so a
   * followed-up child ended again from outside meanwhile fired nothing (found by the second verification of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook`'s repair).
   */
  private readonly tellingOwnSettle = new Set<string>();
  /**
   * REQ-HOOKS-003 / REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-133 (the repair of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`): the `child_completed` hooks of the children
   * settled by a path other than their own settle — the cascade, the finalize sweep, the user's cancel of one child — one
   * after another, in the order the children settled (`completedOutside`).
   */
  private completions: Promise<void> = Promise.resolve();
  /** PD-ORCH-005 clause 22: each child's execution in flight, by task id, so a follow-up of a settled child waits for its end. */
  private readonly executionOf = new Map<string, Promise<void>>();
  /** REQ-ORCH-133 / REQ-MONITOR-128: each executing child's own abort, so cancelling one child stops it (and only it). */
  private readonly controllers = new Map<string, AbortController>();
  /** PD-ORCH-005 clause 2: the run is coming to rest — no child starts, every agent stops before its next model step. */
  private resting = false;
  /**
   * REQ-SESSION-094 / PD-ORCH-005: the rest stopped waiting for this iteration's executions at the stop's grace. One that
   * ends after that is a straggler of a finished run: it writes nothing more (found by phase 3's second review).
   */
  private detached = false;
  /**
   * REQ-MONITOR-102: the children whose executions were still running when the stop's grace gave up on them (`outlast`).
   * Each returns without its count, so a rest counts it from its record (the repair of
   * `a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md`).
   */
  private readonly givenUpOn = new Set<string>();
  /**
   * REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 (the repair of
   * `a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`): the run's `session_end` has begun
   * (`endLifecycle`). A child ended from outside its settle after that — the user's cancel of one paused child, accepted
   * until the run has ended — fires no `child_completed`, which would follow `session_end`: OQ-154's reading, as for the
   * explicit cancel that lands after `session_end`.
   */
  private lifecycleEnded = false;
  /**
   * PD-ORCH-004 revision 3: this iteration's children that had ended before this run took the iteration up — a resumed
   * iteration's, left by an earlier run. Their offers are the root's to take up, as "a later run" of the session's.
   */
  private readonly endedInEarlierRun: ReadonlySet<string>;

  constructor(private readonly deps: ChildrenDeps, readonly iteration: number) {
    this.ledger = new ChildLedger({ dal: deps.dal, writer: deps.writer, sessionId: deps.sessionId, iteration, budget: deps.budget, modelCap: deps.modelCap, ...(deps.slotsHeldElsewhere ? { slotsHeldElsewhere: deps.slotsHeldElsewhere } : {}), warn: deps.warn , personas: deps.personas, ...(deps.artifacts ? { artifacts: deps.artifacts } : {}), ...(deps.rootRecord ? { rootRecord: deps.rootRecord } : {}) });
    this.endedInEarlierRun = new Set(this.ledger.all().filter((c) => isTerminalChildState(c.state)).map((c) => c.task_id));
    this.scheduler = new Scheduler({
      ledger: this.ledger, runChild: (row) => this.track(this.executeSettling(row)), warn: deps.warn, hasConversation: (taskId) => (deps.record?.load(taskId).length ?? 0) > 0,
      // REQ-ORCH-098: a child the scheduler settles — blocked, or cancelled by the finalize sweep — is torn down as any (OQ-152).
      teardown: (row, report) => { writeTeardown(deps.writer, row, row.state, String(report['status'] ?? row.state), String(report['summary'] ?? '')); },
    });
    this.scheduler.onTerminal((row) => { const w = this.resumeWaiters.get(row.parent_id); if (w) { this.resumeWaiters.delete(row.parent_id); w(); } });
    // PD-TOOLS-006: a claim lapses at its child's terminal state. Liveness is also read from the ledger at every
    // query, so a child settled by a path that fires no listener (a stale sweep) holds nothing either; this only
    // keeps the map from growing with the run.
    this.scheduler.onTerminal((row) => { this.claims.release(row.task_id); this.disclosures.delete(row.task_id); });
    // REQ-HOOKS-003: a child settled by any path but its own settle fires `child_completed` too. A settle's own terminal
    // move is told from inside `afterTerminal`, which fires the hook itself (`tellingOwnSettle`). REQ-HOOKS-075: the
    // fields are taken here, as the scheduler is told — every path stores the report before it tells — and not when the
    // hook starts, which can be after a follow-up has moved the record on (PD-ORCH-005 clause 22).
    // A store that cannot be read falls back to the moved row, as `afterTerminal` does, so the hook still fires.
    this.scheduler.onTerminal((row) => {
      if (this.tellingOwnSettle.has(row.task_id)) return;
      let settled: ChildRow;
      try { settled = this.ledger.get(row.task_id) ?? row; } catch { settled = row; }
      this.completedOutside(settled);
    });
    // REQ-CONFIG-094 / REQ-MONITOR-020: a child ending here may free a slot another session's held child is waiting for.
    const onSlotFreed = deps.onSlotFreed;
    if (onSlotFreed) this.scheduler.onTerminal(() => { onSlotFreed(); });
  }

  children(): readonly ChildRow[] {
    return this.ledger.all();
  }

  // ---- DelegationOps -----------------------------------------------------------------------

  async delegate(parentId: string, req: DelegateRequest): Promise<DelegateOutcome> {
    // PD-ORCH-005 clause 22 / PD-TOOLS-006 revision 3: a `session_id` follows up a settled child; it creates no record.
    if ((req.sessionId ?? '') !== '') return await this.followUp(parentId, req.sessionId!, req);
    const parent = this.ledger.get(parentId);
    const parentDepth = parent ? parent.depth : (this.ledger.isRoot(parentId) ? this.ledger.root.depth : 0);
    const persona = personaOf(this.deps, req.persona);
    /*
     * REQ-ORCH-153: refused at ADMISSION, before a record exists. The dispatch check in the tool gate is the
     * authoritative line and would refuse the child's calls one by one; this refusal is kept beside it because it
     * tells the delegating role WHY at the moment it asked, rather than letting a child start and fail on every
     * call it was spawned to make. A role that declares nothing withheld is spawned as usual — the gate holds the
     * run, not the idea of delegation (a researcher reading files is exactly what a plan cycle wants).
     */
    const gate = this.deps.planGate;
    if (gate?.held() === true) {
      const withheld = (persona?.tools ?? []).filter((t) => gate.withholds(t));
      if (withheld.length > 0) {
        return { status: 'rejected', canonicalName: req.taskName, message: `The '${req.persona}' role was not started: this run is held at the plan gate, and that role holds ${withheld.join(', ')} — tools that write workspace files or run commands (REQ-ORCH-153). Delegate to a role that only reads, or write the plan as the final message of this turn and let the user's approval release execution.` };
      }
    }
    // PD-TOOLS-006: a scope that cannot be honoured refuses the delegation before a record exists, like every refusal here.
    const scope = validateWriteScope(req.writeScope ?? []);
    if (!scope.ok) return { status: 'rejected', canonicalName: req.taskName, message: scope.reason };
    /*
     * PD-TOOLS-006 revision 3 (OQ-112): a scope for a persona that cannot write files. The persona is the one the ledger
     * will resolve, an alias included (`personaOf`), so `playwright` is refused as `ui-verifier`. An unknown persona is
     * the ledger's refusal.
     */
    // REQ-TOOLS-006 (4), OQ-145: the parent agent's `tool_restrictions` bind the child's grant, so they bind this check too.
    const parentName = this.parentPersonaOf(parentId);
    const parentPersona = parentName === undefined ? undefined : personaOf(this.deps, parentName);
    if (scope.patterns.length > 0 && persona !== undefined && !writesFiles(persona, parentPersona)) {
      return { status: 'rejected', canonicalName: req.taskName, message: scopeWithoutWriterReason(persona.name, fileWriters(this.deps.personas, parentPersona)) };
    }
    // PD-ORCH-004: a continuation is admitted only for the caller's own child that offered one, and only once.
    const continuationOf = req.continuationOf ?? '';
    if (continuationOf !== '') {
      const refusal = this.continuationRefusalFor(parentId, continuationOf);
      if (refusal !== null) return { status: 'rejected', canonicalName: req.taskName, message: refusal };
    }
    const r = this.ledger.spawn({
      parentId, parentDepth, persona: req.persona, taskName: req.taskName, task: req.task, dependsOn: req.dependsOn, inheritedContext: req.inheritedContext,
      category: req.category, background: req.runInBackground, modelKey: childModelKey(persona, this.deps), grantedTools: persona?.tools ?? [],
      ...(continuationOf !== '' ? { continuationOf } : {}),
      ...(scope.patterns.length > 0 ? { writeScope: scope.patterns } : {}),
      ...(req.suppressAutoContext === true ? { suppressAutoContext: true } : {}),
      // REQ-LIBRARY-098 / REQ-TOOLS-152: the attachments and the inherited-context block are stored with the record, since
      // PD-ORCH-005 lets a child outlive the run that accepted it and every assembly of its payload reads them from there
      // (the repair of `a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`).
      ...((req.attachArtifacts ?? []).length > 0 ? { attachArtifacts: req.attachArtifacts } : {}),
    });
    if (!r.ok) return { status: 'rejected', canonicalName: req.taskName, message: r.error.reason };
    const { row, held, aliasResolved } = r.value;
    // REQ-LIBRARY-098: the references are resolved now, so the caller is told at once what could not be.
    const attachments = this.resolveAttachments(req.attachArtifacts ?? []);
    // PD-TOOLS-006: the claim starts at acceptance, and the disclosure is fixed now — before the pass below, which
    // may start the child and assemble its payload before this call returns.
    this.acceptScope(row, scope.patterns);
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
   * PD-ORCH-005 clause 22 and PD-TOOLS-006 revision 3 (OQ-66's open part, ruled by R-067): `delegate` with `session_id`
   * follows up the settled child it names. The child resumes from its record under its own identity — task id, canonical
   * name, persona, parent, dependencies, background flag and stored write scope, re-claimed now as any accepted child's
   * is — with the call's `task` appended as its next user message; it waits in `queued` and is started by the scheduler
   * as any queued child is, from its record (`execute`), and ends and reports again. The call's other fields are the
   * child's own already and are not read (OQ-131). A `session_id` naming no settled child of the caller is refused
   * `rejected` with no record touched. A child whose record holds
   * no conversation — it never started — is given the payload it would have started with first (OQ-131).
   */
  private async followUp(parentId: string, taskId: string, req: DelegateRequest): Promise<DelegateOutcome> {
    const rejected = (message: string): DelegateOutcome => ({ status: 'rejected', canonicalName: req.taskName, message });
    const refused = this.followUpRefusalFor(parentId, taskId);
    if (refused !== null) return rejected(refused);
    /*
     * A child can be settled while its execution still winds down — a cancel settles the record and aborts the execution,
     * which returns once its turn does — and an execution that found its record live again would write over the follow-up.
     * So the follow-up waits for it, and then asks again.
     */
    const winding = this.executionOf.get(taskId);
    if (winding !== undefined) {
      await winding;
      const again = this.followUpRefusalFor(parentId, taskId);
      if (again !== null) return rejected(again);
    }
    // REQ-ORCH-153 needs no second check here: the gate holds only a plan cycle, whose children were admitted under it.
    const row = this.ledger.get(taskId)!;
    // Clause 4's rule for a record: every call it holds has its result before a message follows it. An execution that
    // raised out of a call leaves one open; it is answered as cut off, naming no rest.
    answerOpenCalls(this.deps.dal, this.deps.writer, this.deps.sessionId, { taskId, name: row.canonical_name }, row.iteration, null);
    // PD-TOOLS-006 revision 2: the stored scope is claimed again from the moment the child is accepted again, before a
    // payload that discloses it is assembled. A claim whose child stays terminal (the write below refused) holds nothing.
    this.acceptScope(row, storedScope(row));
    const messages: ChatMessage[] = [];
    if ((this.deps.record?.load(taskId).length ?? 0) === 0) messages.push({ role: 'user', content: [{ kind: 'text', text: this.startingPayload(row) }] });
    messages.push({ role: 'user', content: [{ kind: 'text', text: req.task }] });
    const r = this.ledger.followUp(taskId, messages);
    if (!r.ok) return rejected(r.reason);
    this.scheduler.pass();
    const now = this.ledger.get(taskId) ?? r.row;
    const said = `Following up ${now.canonical_name} (${now.persona}): it resumes from its record under its own task id, with this task as its next message, and reports again when it ends.`;
    if (now.state === 'waiting_on_model_slot') {
      const cap = this.deps.modelCap(now.model_key) ?? 0;
      return { status: 'waiting_on_model_slot', canonicalName: now.canonical_name, taskId, message: `${said} Queued behind model '${now.model_key}''s slot cap: ${this.ledger.slotsInUse(now.model_key)} of ${cap} slots in use; it starts by itself once a slot opens.` };
    }
    return { status: 'queued', canonicalName: now.canonical_name, taskId, message: said };
  }

  /**
   * PD-TOOLS-006 revision 3: the refusal of a `session_id` naming `taskId`, or null. It names a settled child of the caller
   * — a direct child by REQ-TOOLS-155's ownership test, in a terminal state, that its `child_timeout` did not cut off. Like
   * `background_output`, another agent's child reads as no child of the caller's. A child the limit cut off keeps
   * PD-ORCH-004's `continuation_of`, and the reason names that field. A child the user cancelled is settled and is not
   * refused: PD-ORCH-005 clauses 3 and 16 are read as about a continue's resume (OQ-131, put to the owner).
   */
  private followUpRefusalFor(parentId: string, taskId: string): string | null {
    const head = `session_id '${taskId}' names no settled child of yours`;
    const row = TASK_ID_PATTERN.test(taskId) && !this.ledger.isRoot(taskId) ? this.ledger.get(taskId) : undefined;
    if (row === undefined || !this.owns(parentId, row)) return `${head}: none of your children has that task id. Give session_id the task_id a delegate call returned to you, or delegate a new child without it.`;
    if (!isTerminalChildState(row.state)) return `${head}: ${row.canonical_name} has not ended (state: ${row.state}). Wait for it with wait_for_tasks, and follow it up once it has ended.`;
    const report = parseReport(row);
    if (report?.cut_off !== undefined || (report?.errors ?? []).some((e) => e.type === 'timeout')) {
      return `${head}: ${row.canonical_name} was cut off by its child_timeout, and a child cut off is never resumed. Its route is continuation_of: "${taskId}", where its report offers a continuation (PD-ORCH-004).`;
    }
    return null;
  }

  /**
   * REQ-TOOLS-154: the payload a child starts from, as `execute` assembles it for a fresh start — REQ-ORCH-047's
   * prior-agent-context block the first time it is given, the workspace root, the write-scope disclosure, the artifact
   * blocks, the inherited context and the task. A follow-up of a child that never started records it ahead of the
   * follow-up (PD-ORCH-005 clause 22).
   */
  private startingPayload(row: ChildRow): string {
    let prior = '';
    if (row.context_injected === 0) {
      const depRows = (JSON.parse(row.depends_on) as string[]).map((d) => this.ledger.get(d)).filter((d): d is ChildRow => d !== undefined);
      prior = priorAgentContext(depRows);
      if (prior) this.ledger.markContextInjected(row.task_id);
    }
    return childPayload(this.deps.workspaceRoot, row.task, prior, this.artifactContext(row), writeScopeBlock(this.disclosures.get(row.task_id)), row.inherited_context_block);
  }

  /** REQ-TOOLS-155: whether `row` is a direct child of the agent `parentId` — the root's children whichever name the root goes by. */
  private owns(parentId: string, row: ChildRow): boolean {
    return row.parent_id === parentId || (this.ledger.isRoot(parentId) && this.ledger.isRoot(row.parent_id));
  }

  /**
   * PD-ORCH-004: the refusal of a `continuation_of` naming `reference`, or null. The offer is read from the named
   * child's stored report, so only a child the limit cut off while making progress — and never a continuation — can be
   * continued; a child already recorded as its continuation refuses a second one, anywhere in the session. Revision 3,
   * "an offer outlives its run": the agent that delegated the child takes its offer up while it runs, and the root of a
   * later iteration or a later run takes up one the session left before — any earlier iteration's, and a resumed
   * iteration's own from an earlier run (found by phase 6's review). A plan cycle's root takes up none: a plan cycle is
   * not an iteration (REQ-ORCH-153).
   */
  /**
   * REQ-TOOLS-006 (4), OQ-145: the persona of the agent a delegation comes from — the root's for the root, a child's own
   * for its children. Its `tool_restrictions` entry naming the delegated persona narrows the child's grant.
   */
  private parentPersonaOf(parentId: string): string | undefined {
    return this.ledger.isRoot(parentId) ? this.ledger.root.persona : this.ledger.get(parentId)?.persona;
  }

  private continuationRefusalFor(parentId: string, reference: string): string | null {
    const row = this.ledger.get(reference);
    const laterRoot = this.ledger.isRoot(parentId) && this.iteration >= 1;
    const left = row !== undefined && laterRoot && (row.iteration < this.iteration || this.endedInEarlierRun.has(row.task_id));
    const target = row !== undefined && (this.owns(parentId, row) || left) ? row : undefined;
    const offered = target !== undefined && typeof parseReport(target)?.cut_off?.continuation_offer === 'string';
    const continuedBy = this.deps.dal.childrenOf(this.deps.sessionId).find((c) => c.continuation_of === reference);
    return continuationRefusal(reference, target, offered, continuedBy, laterRoot);
  }

  // ---- PD-TOOLS-006: write scopes ---------------------------------------------------------------

  private readonly isLive = (taskId: string): boolean => {
    const row = this.ledger.get(taskId);
    return row !== undefined && !isTerminalChildState(row.state);
  };

  private acceptScope(row: ChildRow, patterns: readonly string[]): void {
    const others = this.claims.live(this.isLive).map((o) => ({ ...o, heldByAncestor: this.isSelfOrDescendant(row.task_id, o.taskId) }));
    this.claims.claim(row.task_id, row.canonical_name, row.persona, patterns);
    if (patterns.length > 0 || others.length > 0) this.disclosures.set(row.task_id, { own: patterns, others });
  }

  /** Whether `callerId` is `claimTaskId` itself or one of its descendants, walking the ledger's parent links. */
  private isSelfOrDescendant(callerId: string, claimTaskId: string): boolean {
    const seen = new Set<string>();
    for (let id: string | undefined = callerId; id !== undefined && !seen.has(id); id = this.ledger.get(id)?.parent_id) {
      if (id === claimTaskId) return true;
      seen.add(id);
    }
    return false;
  }

  /**
   * PD-TOOLS-006: the claim that refuses the agent `callerId` (its own task id; the root's for the entry agent) a
   * write to the workspace-relative path `rel`, or null when no live claim reaches it for this caller.
   */
  writeClaimFor(callerId: string, rel: string): ClaimHit | null {
    return this.claims.refusalFor(rel, this.isLive, (claimTaskId) => this.isSelfOrDescendant(callerId, claimTaskId));
  }

  /**
   * REQ-LIBRARY-098: the references are resolved AT DELEGATION so the caller is told at once what could not
   * be resolved; the block itself is assembled when the child's payload is built, from the references stored with
   * its record and the store as it stands then. Where no artifact store exists every reference is reported
   * unresolved rather than silently dropped.
   */
  private resolveAttachments(references: readonly string[]): AttachmentOutcome | undefined {
    if (references.length === 0) return undefined;
    const store = this.deps.artifacts;
    if (!store) return { attached: 0, unresolved: [...references] };
    const unresolved = references.filter((ref) => store.lookup(ref) === null);
    return { attached: references.length - unresolved.length, unresolved };
  }

  backgroundOutput(parentId: string, taskId: string, detail: 'summary' | 'verbatim'): BackgroundOutput {
    if (this.ledger.isRoot(taskId)) {
      // REQ-ORCH-072 / REQ-TOOLS-155: root resolves, but caller does not own it (root is never a child of caller).
      // Results are parent-scoped: a task whose parent is not the caller reads as not_found.
      return { status: 'not_found', state: '', text: '' };
    }
    const row = this.ledger.get(taskId);
    // REQ-TOOLS-155: parent-scoped — another parent's child reads as not_found.
    if (!row || !this.owns(parentId, row)) return { status: 'not_found', state: '', text: '' };
    if (!isTerminalChildState(row.state)) return { status: 'still_running', state: row.state, text: '' };
    const r = parseReport(row);
    const lines = [`agent: ${row.canonical_name} (${row.persona})`, `status: ${r?.status ?? row.state}`, `summary: ${r?.summary ?? ''}`, `key findings:\n${(r?.key_findings ?? []).map((k) => `- ${k}`).join('\n') || '(none)'}`, `last reply: ${r?.last_response ?? ''}`, ...cutOffLines(r?.cut_off)];
    if (detail === 'verbatim') lines.push(`final reply (verbatim): ${r?.final_response ?? ''}`);
    return { status: 'ok', state: row.state, text: lines.join('\n') };
  }

  /** REQ-TOOLS-156: only direct children, never the caller's own task, no deadline; N = 0 is valid. */
  async waitForTasks(parentId: string, taskIds: readonly string[]): Promise<WaitOutcome | { readonly refused: string } | { readonly interrupted: string }> {
    const isCallerRoot = this.ledger.isRoot(parentId);
    for (const id of taskIds) {
      if (id === parentId || (isCallerRoot && this.ledger.isRoot(id))) {
        return { refused: 'An agent cannot wait for its own task.' };
      }
    }
    const mine = this.ledger.childrenOf(parentId);
    for (const id of taskIds) {
      if (this.ledger.isRoot(id)) {
        return { refused: 'An agent can wait only for its direct child tasks.' };
      }
      if (!TASK_ID_PATTERN.test(id)) return { refused: `'${id}' is not a task id.` };
      if (!mine.some((c) => c.task_id === id)) return { refused: 'An agent can wait only for its direct child tasks.' };
    }
    const set = taskIds.length > 0 ? taskIds : mine.filter((c) => c.background === 1 && !isTerminalChildState(c.state)).map((c) => c.task_id);
    // REQ-HOOKS-080: a task that has ended is complete once its settle's `child_completed` hook is done.
    const settling = this.settlesOf(set);
    if (settling) await settling;
    const already = set.every((id) => { const r = this.ledger.get(id); return !r || isTerminalChildState(r.state); });
    if (already) {
      const rows = set.map((id) => this.ledger.get(id)).filter((r): r is ChildRow => r !== undefined);
      for (const r of rows) this.ledger.markObserved(r.task_id);
      return { immediate: true, requested: set.length, text: set.length === 0 ? 'There was nothing to wait for: no task ids were given and no background children are active.' : `${set.length === 1 ? 'The 1 requested task was' : `All ${set.length} requested tasks were`} already complete.\n\n${rows.map(reportBlock).join('\n\n')}` };
    }
    await this.scheduler.waitFor(set);
    // REQ-HOOKS-080: the settle that released the wait may not be the last to finish — another task of the set can have
    // ended before it and still be running its hook.
    const settled = this.settlesOf(set);
    if (settled) await settled;
    // PD-ORCH-005: the run came to rest while the caller waited; the tasks it waited on are paused with the run.
    if (this.resting && !set.every((id) => { const r = this.ledger.get(id); return !r || isTerminalChildState(r.state); })) {
      return { interrupted: `The wait for ${set.join(', ')} was interrupted by ${interruptionPhrase(this.deps.restCause?.() ?? '')}: the tasks were paused with the run and resume when it is continued. Wait for them again then.` };
    }
    const rows = set.map((id) => this.ledger.get(id)).filter((r): r is ChildRow => r !== undefined);
    for (const r of rows) this.ledger.markObserved(r.task_id);
    return { immediate: false, requested: set.length, text: `The waited-for background tasks completed (${set.length}).\n\n${rows.map(reportBlock).join('\n\n')}` };
  }

  // ---- PD-ORCH-005: coming to rest, and cancelling one child ------------------------------------

  private track(execution: Promise<void>): Promise<void> {
    this.executing.add(execution);
    // Both ways out: a `finally` here would re-raise an execution's rejection where nothing handles it.
    const done = () => { this.executing.delete(execution); };
    void execution.then(done, done);
    return execution;
  }

  /**
   * REQ-HOOKS-080: `taskId`'s settle runs its hook from here; the function returned ends it, once the scheduler is told.
   * It removes the entry only while the entry is its own: a child followed up while an earlier end's hook still runs
   * (PD-ORCH-005 clause 22) begins a second settle over the first, and the first ending must not take the second's entry
   * with it — the terminal listener would then find none and fire `child_completed` a third time (REQ-HOOKS-076, found by
   * the verification of `a-child-settled-outside-its-execution-fires-no-child-completed-hook`'s repair). The listener now
   * reads `tellingOwnSettle`, not this map (the second verification), so the guard no longer keeps that third hook out.
   * What it keeps now (the third verification): the second end's entry still says the child is settling once the first
   * end's hook is done, so a parent that finds the child ended on its own (`settlesOf`, in the resume loop or in
   * `wait_for_tasks`) does not take it as ended while the second end's hook runs (REQ-HOOKS-080) — the case "a child
   * followed up while its cancel's hook runs is still settling …" in `children.test.ts`.
   */
  private beginSettle(taskId: string): () => void {
    let end!: () => void;
    const settle = new Promise<void>((resolve) => { end = resolve; });
    this.settles.set(taskId, settle);
    return () => { if (this.settles.get(taskId) === settle) this.settles.delete(taskId); end(); };
  }

  /**
   * REQ-HOOKS-080: a wait that ends once none of `taskIds` is settling, to be awaited before any of them is taken as
   * ended — or null when none is, so an agent with none to wait for does not yield. It looks again whenever the settles
   * it waits on end, because another of `taskIds` can have ended meanwhile and be running its own hook: a wait on only
   * the settles running when it began let that one through (found by the verifier's fifth round). A task settles once,
   * so the wait ends.
   */
  private settlesOf(taskIds: readonly string[]): Promise<unknown> | null {
    if (this.settles.size === 0) return null;
    const running = taskIds.flatMap((id) => { const settle = this.settles.get(id); return settle === undefined ? [] : [settle]; });
    return running.length === 0 ? null : Promise.all(running).then(() => this.settlesOf(taskIds));
  }

  /**
   * PD-ORCH-005 clause 2: the run is coming to rest. No queued child starts from here (the scheduler holds), every child
   * and parent stops before its next model step (`shouldPause`), and every parent waiting on children — in the resume
   * loop or in `wait_for_tasks` — is woken to find the rest. Idempotent.
   */
  beginRest(): void {
    if (this.resting) return;
    this.resting = true;
    this.scheduler.hold();
    for (const [parent, wake] of [...this.resumeWaiters]) { this.resumeWaiters.delete(parent); wake(); }
  }
  get isResting(): boolean {
    return this.resting;
  }

  /**
   * PD-ORCH-005 clauses 2 and 3: every agent of the iteration that has not reached a terminal state is left `paused` with
   * `cause` recorded. The children executing come to rest themselves, each in its own execution (its in-flight calls
   * finish or are cut at the deadline, and it stops before its next model step); this waits for all of them, then pauses
   * every child that never started where it stood. Nothing summarises and nothing is settled. Returns how many ended
   * paused.
   */
  async rest(cause: Interruption, grace: Millis = STOP_GRACE): Promise<number> {
    this.beginRest();
    // A stop and a quit have aborted every execution; REQ-SESSION-092's grace bounds how long their ends are awaited. A
    // pause waits for the step in flight, whose own model timeout bounds it (REQ-MONITOR-123). `grace` is what is left of
    // it, counted from the first stop request (`Run.stopGraceLeft`): none when the run already spent it waiting for its
    // root, so what still executes is detached now, and never a fresh 30 s after a root that returned late.
    if (cause === 'pause') await this.drained();
    else await this.outlast(grace);
    // Clause 3: an explicit cancel that arrived meanwhile is final — nothing more is paused; the caller settles the rest.
    // A child the grace gave up on meanwhile is still counted from its record first (REQ-MONITOR-102), its open calls
    // answered as cut off, naming no rest (OQ-96, "A call cut by no rest"); the caller then ends it `cancelled` (found by
    // the verifier of the repair of a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md).
    if ((this.deps.restCause?.() ?? null) === null) {
      this.closeGivenUpOn();
      return 0;
    }
    for (const c of this.ledger.all()) {
      const current = this.ledger.get(c.task_id);
      if (!current || isTerminalChildState(current.state) || current.state === 'paused') continue;
      const into = resumeStateFor(current.state as ChildState);
      if (into === null) continue;
      const r = this.ledger.rest(c.task_id, cause, into);
      if (!r.ok) this.deps.warn(r.reason);
    }
    // Clauses 3 and 4: a paused child whose execution never returned from a call, or raised out of one, has its open
    // calls answered as interrupted, so it resumes from a record whose every call has its result (found by phase 3's
    // third review).
    const paused = this.ledger.all().filter((c) => this.ledger.get(c.task_id)?.state === 'paused');
    for (const c of paused) answerOpenCalls(this.deps.dal, this.deps.writer, this.deps.sessionId, { taskId: c.task_id, name: c.canonical_name }, c.iteration, cause);
    for (const c of paused) if (this.givenUpOn.has(c.task_id)) this.countGivenUpOn(c.task_id);
    // A child the grace gave up on that this rest did not pause — one the user's cancel of one child had already ended while
    // its call ignored the abort — is counted all the same (the repair of
    // `a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`).
    this.closeGivenUpOn();
    return paused.length;
  }

  /**
   * REQ-MONITOR-102 / REQ-SESSION-129 with OQ-96 (the repair of `a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`):
   * every child whose execution a stop's grace gave up on (`givenUpOn`) and that no rest leaves `paused` — every one under
   * the explicit cancel, which rests nothing (`rest`'s early return, and `Run.turn` after `finalize` and `outlast`), and at
   * a rest one already terminal, ended by the user's cancel of one child while its call ignored the abort — has its open
   * calls answered as cut off, naming no rest (OQ-96, "A call cut by no rest"), and is counted from its record
   * (`countGivenUpOn`), terminal or not: its execution, if it ever returns, returns through `execute`'s detached return,
   * before its count. A paused one is answered under its rest's cause and counted by the rest. Idempotent — an answered
   * call is not answered again and a count already held adds nothing — so a second stop's give-up adds nothing twice.
   */
  closeGivenUpOn(): void {
    for (const c of this.ledger.all()) {
      if (!this.givenUpOn.has(c.task_id) || this.ledger.get(c.task_id)?.state === 'paused') continue;
      answerOpenCalls(this.deps.dal, this.deps.writer, this.deps.sessionId, { taskId: c.task_id, name: c.canonical_name }, c.iteration, null);
      this.countGivenUpOn(c.task_id);
    }
  }

  /**
   * REQ-MONITOR-102 (the repair of `a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md`):
   * a child the stop's grace gave up on returns no count — `execute` writes nothing once detached — so the calls its record
   * shows beyond its count join the session's total now, with its own count, once its open calls are answered (so a call
   * it asked for and never started is not one), as a root given up on is counted (`Run.turn`). A continue that resumes it
   * then credits nothing twice (`priorCalls` is its record's, less its count), and one that declines it (PD-ORCH-005
   * clause 6) has nothing left uncounted.
   */
  private countGivenUpOn(taskId: string): void {
    const row = this.ledger.get(taskId);
    if (!row) return;
    let recorded: number;
    try { recorded = callsRun(this.deps.record?.load(taskId) ?? []); }
    catch (cause) { this.deps.warn(`the calls of child ${taskId}, given up on at the stop's grace, could not be read from its record: ${String(cause)}`); return; }
    if (recorded > row.tool_calls) this.deps.countToolCalls?.(recorded - row.tool_calls, { taskId, calls: recorded });
  }

  /**
   * PD-ORCH-005 clause 4: every `paused` agent of the iteration is restored from its record — moved back to the state it
   * resumes into, in the order the children were accepted, each re-claiming its stored write scope under the same rules
   * as any child (PD-TOOLS-006 revision 2). A child that waited is left to the scheduler; one that was running carries on
   * from its recorded conversation, and one that was summarising writes its report — each under a fresh
   * `child_timeout`. Every child keeps the place in every limit its record already holds. Returns how many resumed.
   */
  resumePaused(): number {
    let n = 0;
    for (const c of this.ledger.all()) {
      if (c.state !== 'paused') continue;
      // Clause 10: an agent told of its background sessions takes a step to read it, so one that had answered and was
      // summarising resumes `running` instead — it works, and the limits count it (found by phase 4's review).
      const notice = this.deps.resumeNotice?.(c.task_id) ?? null;
      const summarising = c.resume_state === 'summarizing';
      // REQ-MONITOR-136 with REQ-MONITOR-134: so does one whose record ends on a steering prompt the rest delivered to it
      // (`Run.deliverSteeringAtRest`) — a steer that arrives while an agent is finishing makes it take another round.
      const steered = summarising && isSteeringMessage(this.deps.record?.load(c.task_id).at(-1));
      const r = this.ledger.resume(c.task_id, summarising && (notice !== null || steered) ? 'running' : undefined);
      if (!r.ok) { this.deps.warn(r.reason); continue; }
      n += 1;
      this.acceptScope(r.row, storedScope(r.row));
      if (r.row.state !== 'running' && r.row.state !== 'summarizing') continue;
      const row = r.row;
      // REQ-ORCH-052: a record that cannot be loaded (one that does not decode) settles the child, never leaving it moved
      // back to `running` with no execution behind it (the repair of `a-child-whose-execution-raises-before-its-turn-stays-running.md`).
      let history: ChatMessage[];
      try { history = this.resumedConversation(row.task_id, row.iteration, notice); }
      // Tracked as the fresh path's settle is (`runChild`), so a rest waits for it, its `child_completed` hook included.
      catch (cause) { void this.track(this.settleRaised(row, cause, 'its record could not be loaded to resume it')).catch((e) => this.deps.warn(`child ${row.task_id} could not be settled: ${String(e)}`)); continue; }
      const resume: ChildResume = { history, assessed: summarising };
      // Started as the scheduler starts a child (`startOne`): a raise is warned, and its end is a pass, so a sibling held
      // on the model slot it frees, or on it as a dependency, starts then (found by phase 4's review).
      void this.track(this.executeSettling(row, resume)).catch((e) => this.deps.warn(`child ${row.task_id} raised out of its resumed execution: ${String(e)}`)).finally(() => this.scheduler.pass());
    }
    this.scheduler.pass();
    return n;
  }

  /**
   * PD-ORCH-005 clauses 4 and 10: a resumed agent's conversation — its record, then, as its next message, what became of
   * the background sessions it had started (`notice`). The notice is recorded as it joins the conversation.
   */
  private resumedConversation(taskId: string, iteration: number, notice: ChatMessage | null): ChatMessage[] {
    const history = this.deps.record?.load(taskId) ?? [];
    if (notice !== null) {
      this.deps.record?.recorder(taskId, iteration).appended(notice);
      history.push(notice);
    }
    return history;
  }

  /**
   * REQ-ORCH-133 / REQ-MONITOR-128, the repair of `cancelling-one-child-does-not-stop-it.md`: the user cancels one child.
   * It and each of its live descendants settle `cancelled` with a report saying so, and each one's own execution is
   * ABORTED, so it stops rather than working on under a cancelled record; the execution finds its record terminal and
   * writes nothing over the cancellation's report. False when the child is unknown or already terminal.
   */
  cancel(taskId: string): boolean {
    const row = this.ledger.get(taskId);
    if (!row || isTerminalChildState(row.state)) return false;
    const targets = [row, ...this.ledger.all().filter((c) => c.task_id !== taskId && !isTerminalChildState(c.state) && this.isSelfOrDescendant(c.task_id, taskId))];
    for (const t of targets) {
      const r = this.ledger.transition(t.task_id, 'cancelled', 'cancellation');
      if (!r.ok) { this.deps.warn(r.reason); continue; }
      const written = userCancellation(t, row);
      this.ledger.storeReport(t.task_id, written.report);
      this.deps.writer.appendTimeline('child_user_cancelled', 'user', written.message, written.metadata);
      // REQ-ORCH-098: torn down here, after the cancel's own entry and before the terminal callbacks; its execution, which
      // finds its record terminal when it returns, writes none (the repair of
      // `a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`).
      writeCancelledTeardown(this.deps.writer, t, written.report);
      this.controllers.get(t.task_id)?.abort();
      this.scheduler.settled(r.row);
    }
    this.scheduler.pass();
    return true;
  }

  // ---- REQ-ORCH-089 / REQ-MONITOR-117..122 / REQ-MONITOR-135: what a stall evaluation tells the host ----------------

  /**
   * The host's stall callback for one agent — a child's watch in `execute`, and the root's in `Run.turn` — at every
   * evaluation: `seconds` is its silence while the evaluation finds it stalled, else null. The figure is kept beside its tool
   * activity (`AgentActivity.stalled`), and the whole-session record is republished when it changed, so a surface's stalled
   * figure advances at the watch's cadence and clears at the recovery (REQ-MONITOR-119/120/122). Then REQ-MONITOR-135's
   * opportunistic injection: an agent waiting between its turns on its own children, with a steer pending, is woken to take
   * its next step, whose start injects the steer (`runWithChildren`). Neither may block or fail the run (REQ-MONITOR-122).
   */
  stallEvaluated(agentId: string, agentName: string, seconds: number | null): void {
    try {
      if (this.deps.writer.activity.stalled(agentName, seconds)) this.deps.owner.refreshRecord();
      if (this.deps.steeringPending?.(agentId) === true) this.wakeForSteering(agentId);
    } catch (cause) {
      this.deps.warn(`the stall evaluation of ${agentName} could not reach its host: ${String(cause instanceof Error ? cause.message : cause)}`);
    }
  }

  /** REQ-MONITOR-135: `agentId`, waiting on its own children in the resume loop, is woken to take a step for its steer. */
  wakeForSteering(agentId: string): void {
    const wake = this.resumeWaiters.get(agentId);
    if (wake === undefined) return;
    this.resumeWaiters.delete(agentId);
    wake();
  }

  // ---- the resume loop ---------------------------------------------------------------------

  /** Resolves when a direct child of `parentId` reaches a terminal state the parent has not observed, or when none remains. */
  private awaitTerminal(parentId: string): Promise<void> {
    if (this.resting) return Promise.resolve();
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
  async runWithChildren(agentId: string, turn: (task: string | null, history: readonly ChatMessage[]) => Promise<TurnOutcome>, start: TurnStart, signal: AbortSignal): Promise<TurnOutcome> {
    // PD-ORCH-005 clause 4: a fresh agent's payload, or a resumed agent's record — into a model step, or into waiting.
    let outcome = await firstTurn(turn, start);
    let history = outcome.messages;
    let toolCalls = outcome.toolCallCount;
    for (;;) {
      // PD-ORCH-005 clause 2: an agent whose turn stopped where it stood, or whose run is coming to rest, waits for no child.
      if (signal.aborted || outcome.report.status === 'failed' || outcome.paused === true || this.resting) break;
      this.scheduler.pass();
      const mine = this.ledger.childrenOf(agentId);
      const pending = mine.filter((c) => !isTerminalChildState(c.state));
      const unobserved = mine.filter((c) => isTerminalChildState(c.state) && c.observed === 0);
      if (pending.length === 0 && unobserved.length === 0) break;
      if (unobserved.length === 0) await this.awaitTerminal(agentId);
      // REQ-HOOKS-080: a child that has ended is taken once its settle's `child_completed` hook is done — as a parent the
      // settle wakes takes it — never while the hook still runs because the parent found it ended on its own.
      const settling = this.settlesOf(mine.map((c) => c.task_id));
      if (settling) await settling;
      if (signal.aborted || this.resting) break;
      const newly = this.ledger.takeNewlyTerminal(agentId);
      if (newly.length === 0) {
        /*
         * REQ-MONITOR-135: a stall evaluation woke this agent for a steer pending while it waited on its children, so it
         * takes its next step now, before any child ends: the step's start injects the steer (REQ-MONITOR-134), and the
         * agent then waits on its children again.
         */
        if (this.deps.steeringPending?.(agentId) === true) {
          outcome = await turn(null, history);
          history = outcome.messages;
          toolCalls += outcome.toolCallCount;
        }
        continue;
      }
      const stillRunning = this.ledger.childrenOf(agentId).filter((c) => !isTerminalChildState(c.state)).length;
      const notices = newly.filter((c) => c.background === 1).map((c) => completionNotification(c, stillRunning, this.durationS(c)));
      const message = [...notices, resumeMessage(newly, stillRunning)].join('\n\n');
      outcome = await turn(message, history);
      history = outcome.messages;
      toolCalls += outcome.toolCallCount;
    }
    /*
     * REQ-HOOKS-076 / REQ-HOOKS-080: an agent that ends with a child of its own still in its settle — its turn failed, say —
     * ends after that child's `child_completed` hook, so the hook comes before the agent's own settle and before the
     * iteration's hooks. A rest and a stop wait for the settles themselves, as executions (`rest`, `outlast`).
     */
    if (!signal.aborted && !this.resting && this.settles.size > 0) {
      const settling = this.settlesOf(this.ledger.childrenOf(agentId).map((c) => c.task_id));
      if (settling) await settling;
    }
    /*
     * PD-ORCH-005 clause 2: an agent the rest stopped while children of its own are unfinished, or ended with reports it
     * has not been given, has not finished: it stopped where it stood, and it resumes into waiting for them (found by
     * phase 3's review — the rest used to read such an agent as done and lose the reports it was owed).
     */
    const owed = this.resting && this.ledger.childrenOf(agentId).some((c) => !isTerminalChildState(c.state) || c.observed === 0);
    return { ...outcome, messages: history, toolCallCount: toolCalls, ...(owed ? { paused: true } : {}) };
  }

  private durationS(c: ChildRow): number {
    const started = this.startedAt.get(c.task_id);
    return started === undefined ? 0 : (this.deps.clocks.monotonic.now() - started) / 1000;
  }

  // ---- a child's execution -----------------------------------------------------------------

  /**
   * REQ-ORCH-052 / REQ-ORCH-108, the repair of `a-child-whose-execution-raises-before-its-turn-stays-running.md`: a child's
   * execution, on either start path, that never ends with the child left `running` and nothing behind it. `execute`
   * catches a raise inside the child's turn itself; one anywhere else — the stretch that builds what the turn needs
   * (persona, resilience, compression, the tool port, the fingerprint) before its `try`, or the settle after it — is
   * settled here.
   */
  private executeSettling(row: ChildRow, resume: ChildResume | null = null): Promise<void> {
    const execution = (async () => {
      try {
        await this.execute(row, resume);
      } catch (cause) {
        await this.settleRaised(row, cause, 'its execution raised outside its turn');
      }
    })();
    // PD-ORCH-005 clause 22: a follow-up of this child waits for this execution to end (`followUp`).
    this.executionOf.set(row.task_id, execution);
    const forget = () => { if (this.executionOf.get(row.task_id) === execution) this.executionOf.delete(row.task_id); };
    void execution.then(forget, forget);
    return execution;
  }

  /**
   * A child whose execution raised where nothing settled it ends `failed` (REQ-ORCH-073's intent at the child's level)
   * with a report whose error names the raise, stored before its parent is told (REQ-ORCH-108), and the teardown's
   * `child_end`, `child_result` and `child_conversation_closed` (REQ-ORCH-098) and `child_completed` (REQ-HOOKS-003). A child already terminal (a cancel), or `paused`, is
   * left as it is, and so is everything after the rest detached this iteration (REQ-SESSION-094). A raise inside the
   * turn while the run comes to rest never reaches here: `execute` catches it and leaves the child `paused` (OQ-96).
   * A terminal child found here was told to the scheduler by whatever made it terminal — the user's cancel, or a settle,
   * whose `afterTerminal` tells it even when its teardown or its hook raised — so it is not told twice.
   */
  private async settleRaised(row: ChildRow, cause: unknown, where: string): Promise<void> {
    const { deps } = this;
    const reason = String(cause instanceof Error ? cause.message : cause);
    if (this.detached) return;
    const current = this.ledger.get(row.task_id);
    if (!current || isTerminalChildState(current.state) || current.state === 'paused') { deps.warn(`child ${row.task_id} raised (${where}): ${reason}`); return; }
    deps.writer.recordIssue({ kind: 'child_exception', severity: 'error', actor: row.canonical_name, message: `Child ${row.canonical_name} raised: ${reason}` });
    const message = `Child ${row.canonical_name} ended failed: ${where}: ${reason}`;
    this.ledger.storeReport(row.task_id, { agent_name: row.canonical_name, role: row.persona, status: 'failed', summary: message, key_findings: [], last_response: '', final_response: '', errors: [{ type: 'child_exception', message: reason }] });
    const t = this.ledger.transition(row.task_id, 'failed');
    if (!t.ok) { deps.warn(t.reason); return; }
    await this.afterTerminal(row, t.row, () => {
      // REQ-ORCH-098: the same teardown the settle in `execute` writes, "whether or not its execution raised".
      writeTeardown(deps.writer, row, 'failed', 'failed', message);
    }, { child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state: 'failed', status: 'failed', summary: message });
  }

  /**
   * REQ-HOOKS-003 ("`child_completed` once a delegated child agent has finished, whatever its final state"), REQ-ORCH-048
   * and REQ-ORCH-052 (terminal-state callbacks fire for a cascaded or swept record "exactly as for directly completed
   * ones"): the hook of a child the cascade blocked, the finalize sweep cancelled or the user's cancel of one child ended —
   * none of which runs the child's own settle. It runs in line as a settle's does (REQ-HOOKS-080): the child is settling
   * until its hook is done (`beginSettle`), so its parent — woken by the same terminal move — takes it as ended only
   * then (the case "a parent takes a child the user cancelled as ended only once its `child_completed` hook is done …"),
   * and a rest waits for it as for an execution (`track`). These hooks run one after another, in the order the children settled; `completionsSettled` is
   * the wait for all of them, which the run takes after the finalize sweep and before the iteration's own hooks.
   *
   * REQ-HOOKS-075: the fields are the child's record as it stood when the scheduler was told it settled — its terminal
   * state and its report's status and summary — taken then and carried to the hook. The first reading, falsified by the
   * second verification of this repair, was "the fields are the child's record once it is terminal", read when the hook
   * started: a hook queued behind another that was still running read a record a follow-up (PD-ORCH-005 clause 22) had
   * since moved on, so a cancelled end was sent as the follow-up's `succeeded`, twice, or as a state that is not terminal.
   * The bound, stated: each end fires once with its own fields, but a hook queued here is delivered after a later end's own
   * settle has fired its hook if that later end comes first, since a follow-up does not wait for this queue.
   *
   * A rest waits for such a hook as for an execution, whenever it was queued (`drained`), and the run waits for every one
   * of them before `session_end` (`Run.childCompletionsSettled`). The first reading, "a pause waits for it", was false
   * until the fourth verification of this repair: a rest waited on a snapshot of the executions taken when it began, so a
   * hook the user's cancel queued meanwhile ended after `session_end`.
   *
   * The bound, stated: at a stop or a quit such a hook is awaited only within what is left of the stop's 30 s grace
   * (`outlast`, REQ-SESSION-092); one still running then is given up on with the executions, as a settle's own hook
   * inside a child's execution is, and may finish after `session_end` — bounded by its own per-hook timeout
   * (REQ-HOOKS-033). The explicit cancel's sweep is awaited (`completionsSettled`) before `outlast`, bounded only by that
   * per-hook timeout.
   */
  private completedOutside(row: ChildRow): void {
    const hooks = this.deps.hooks;
    if (!hooks || this.lifecycleEnded) return;
    const fields = childCompletedFields(row);
    const endSettle = this.beginSettle(row.task_id);
    const fire = async (): Promise<void> => {
      try { await hooks.fireLifecycle('child_completed', fields); }
      catch (cause) { this.deps.warn(`the child_completed hooks raised for child ${row.canonical_name} (${row.task_id}): ${String(cause instanceof Error ? cause.message : cause)}`); }
    };
    const next = this.completions.then(fire).finally(endSettle);
    this.completions = next;
    void this.track(next);
  }

  /**
   * REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154: the run is about to fire `session_end`, once every hook `completedOutside`
   * queued has been awaited (`Run.childCompletionsSettled`); from here none is queued (`lifecycleEnded`).
   */
  endLifecycle(): void {
    this.lifecycleEnded = true;
  }

  /** REQ-HOOKS-076 / REQ-HOOKS-080: resolves once every `child_completed` hook `completedOutside` started has finished. */
  async completionsSettled(): Promise<void> {
    for (;;) {
      const pending = this.completions;
      await pending;
      if (pending === this.completions) return;
    }
  }

  /**
   * The end of a settle, once the child has made its terminal move: REQ-ORCH-098's `teardown`, then the `child_completed`
   * hook in line (REQ-HOOKS-080 — the parent takes the child as ended once the scheduler is told, `settles`), then the
   * scheduler told, which fires the terminal callbacks (REQ-ORCH-048) and releases every wait on the child (REQ-TOOLS-156).
   * The scheduler is told whatever raised before it (the repair of
   * `a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`): a child that has ended never leaves its
   * parent waiting on it. A raise out of the hook port reduces to a warning and the settle goes on (REQ-HOOKS-079: the
   * occurrence completes, the child's terminal status is unaffected, and no error reaches an agent); one out of the
   * teardown is re-raised after the scheduler is told, to the caller's `settleRaised`, which finds the child terminal.
   */
  private async afterTerminal(row: ChildRow, moved: ChildRow | null, teardown: () => void, completed: Readonly<Record<string, unknown>>): Promise<void> {
    const { deps } = this;
    const endSettle = this.beginSettle(row.task_id);
    try {
      teardown();
      if (deps.hooks) {
        try { await deps.hooks.fireLifecycle('child_completed', completed); }
        catch (cause) { deps.warn(`the child_completed hooks raised for child ${row.canonical_name} (${row.task_id}): ${String(cause instanceof Error ? cause.message : cause)}`); }
      }
    } finally {
      // The terminal row as it stands; the one the move returned when the store cannot be read, so a raising store does
      // not replace what raised before it and leave the scheduler untold.
      let settled: ChildRow | null;
      try { settled = this.ledger.get(row.task_id) ?? moved; } catch { settled = moved; }
      try {
        if (settled) {
          this.tellingOwnSettle.add(row.task_id);
          try { this.scheduler.settled(settled); } finally { this.tellingOwnSettle.delete(row.task_id); }
        }
      } finally { endSettle(); }
    }
  }

  /**
   * A child's execution. `resume` is PD-ORCH-005's resume: the child was restored `running` or `summarizing` and carries
   * on from its recorded conversation under a fresh `child_timeout`, its tool-call count carried on from its record. One
   * restored `summarizing` had answered, so its record ends on its answer: it resumes into waiting, takes no step, and
   * writes its report.
   */
  private async execute(row: ChildRow, resumeFromRest: ChildResume | null = null): Promise<void> {
    const { deps } = this;
    /*
     * PD-ORCH-005 clause 22: a child the scheduler starts whose record holds a conversation is a settled child its parent
     * followed up — the follow-up is in its record, after everything it said — so it carries on from the record, as a
     * resumed agent does, rather than from its payload. Every other child the scheduler starts has none.
     */
    let resume = resumeFromRest;
    if (resume === null && row.state === 'starting') {
      const recorded = deps.record?.load(row.task_id) ?? [];
      if (recorded.length > 0) resume = { history: recorded, assessed: false };
    }
    const started = deps.clocks.monotonic.now();
    this.startedAt.set(row.task_id, started);
    // A child the scheduler claimed starts running; one resumed from a rest was moved back by `resumePaused`.
    if (row.state === 'starting') {
      const moved = this.ledger.transition(row.task_id, 'running');
      if (!moved.ok) { deps.warn(moved.reason); return; }
    }
    const persona = personaOf(deps, row.persona);
    const childTimeoutMs = deps.childTimeoutMs ?? CHILD_TIMEOUT_MS;
    // PD-ORCH-004: the progress rule's window — the role's own `stall_timeout` (REQ-CONFIG-108), else the run's
    // `runtime.child_stall_timeout` — and the log it reads, kept across both attempts of REQ-ORCH-088's retry.
    const stallMs = millis(persona?.stallTimeoutMs ?? deps.childStallTimeoutMs ?? CHILD_STALL_TIMEOUT_MS);
    const progress = new ProgressLog(deps.workspaceRoot);
    // REQ-ORCH-089 / REQ-MONITOR-117..120: the stall watch over the same window — visibility only, it cancels nothing. What
    // it reports is written only while this execution still belongs to a live run (REQ-SESSION-094). REQ-ORCH-139's closed
    // timeline vocabulary has no word for the wait on tools, the recovery or the corrective message, so, as OQ-76 did for
    // the user's presence, they are written to the session log through the run's `warn` and no timeline word is minted;
    // OQ-127 asks the owner for the words.
    const stallWatch = new StallWatch(deps.clocks, stallMs, {
      // REQ-MONITOR-119: the `stall` issue at every stall evaluation; REQ-MONITOR-120 throttles only the warning.
      stalled: (s) => {
        if (this.detached) return;
        const message = stallWarning(row.canonical_name, row.task_id, s.silentS);
        if (s.warn) deps.warn(message);
        deps.writer.recordIssue({ kind: 'stall', severity: 'warning', actor: row.canonical_name, message, metadata: { task_id: row.task_id, silent_seconds: s.silentS, active_tools: s.activeTools, recent_tool_calls: s.recentCalls, last_model_event: s.lastModelEvent } });
      },
      waiting: (w) => { if (!this.detached) deps.warn(stallWaitingLine(row.canonical_name, row.task_id, w.activeCalls, w.silentS)); },
      recovered: () => { if (!this.detached) deps.warn(stallRecoveredLine(row.canonical_name, row.task_id)); },
      // REQ-ORCH-089's stall callback, at every evaluation: the child's stalled figure reaches its `AgentRecord`, republished
      // when it changes (REQ-MONITOR-119's countdown, REQ-MONITOR-120's recovery notified; REQ-MONITOR-122), and a steer
      // pending for a child waiting on its own children wakes it (REQ-MONITOR-135). The repair of
      // `a-stalled-child-is-never-shown-stalled.md`.
      evaluated: (stalled) => { if (!this.detached) this.stallEvaluated(row.task_id, row.canonical_name, stalled ? stallWatch.silentSeconds : null); },
    });
    /**
     * REQ-NOTIFY-112: the one corrective message about its lack of progress, per child task, however often the outcome
     * recurs. It holds across REQ-ORCH-088's retry within this execution, and a resumed execution (PD-ORCH-005) of a task
     * that already had it reads so from what the task was told: its whole record, replaced messages included, and the
     * conversation it resumes from.
     */
    let corrected = resume !== null && (hadCorrectiveMessage(resume.history) || hadCorrectiveMessage(deps.record?.everRecorded(row.task_id) ?? []));
    // Part Q: the child's own cell — its model (an override of the session applied), its role's fallback, one fallback across both routes.
    const resilience = deps.resilience?.forChild(persona, { model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking }, childTimeoutMs) ?? null;
    // Part AH: this child's own capacity and its own plan — the ledger row is where a child's task plan lives.
    const compression = deps.compressionFor?.({ model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking }, () => todoLinesFromStored(this.ledger.get(row.task_id)?.todo ?? null));
    // REQ-TOOLS-006 (4), OQ-145: the delegating agent's persona, whose `tool_restrictions` may name this child's.
    const tools = deps.toolsFor(row.persona, row.canonical_name, this, row.task_id, row.depth, undefined, this.parentPersonaOf(row.parent_id));
    const dispatched = new Map<string, string>();
    // REQ-ORCH-047 / REQ-TOOLS-154: the prior-agent-context block, exactly once, ahead of everything.
    const depRows = (): ChildRow[] => (JSON.parse(row.depends_on) as string[]).map((d) => this.ledger.get(d)).filter((d): d is ChildRow => d !== undefined);
    let prior = '';
    if (row.context_injected === 0) {
      prior = priorAgentContext(depRows());
      if (prior) this.ledger.markContextInjected(row.task_id);
    }
    // REQ-LIBRARY-097/098: the automatic sibling index and the explicitly attached artifacts, assembled from the
    // store as it stands at launch — a newly created agent is given them, so they are built when its payload is, and a
    // resumed agent, whose payload is already in its record, is given them only if REQ-ORCH-088's retry restarts it.
    // The attachments and the inherited-context block are read from the record, so a retry in a later run carries them
    // as the first payload did (the repair of `a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`).
    let artifactBlocks: readonly string[] | null = null;
    const payload = (): string => {
      // A resumed child was given its prior-agent context in the conversation its first payload started; REQ-ORCH-088's
      // retry starts that conversation again, so its payload carries the block again, as a retry within the first run
      // does — once in the conversation the retry starts, and never re-prefixed on a state hop.
      if (resume !== null && row.context_injected === 1 && prior === '') prior = priorAgentContext(depRows());
      return childPayload(deps.workspaceRoot, row.task, prior, artifactBlocks ??= this.artifactContext(row), writeScopeBlock(this.disclosures.get(row.task_id)), row.inherited_context_block);
    };
    // PD-ORCH-005 clause 4: a resumed child's first attempt starts from its record; a retry starts from its payload.
    let start: TurnStart | null = resume ? resumedStart(resume.history) : null;
    // The column is written at a rest or a settle, and a crash writes neither, so the record's own calls count too (found
    // by phase 4's review: a child that worked before a crash counted none).
    const priorCalls = resume ? Math.max(row.tool_calls, callsRun(resume.history)) : 0;
    // REQ-MONITOR-102: calls the record shows that no count held join the session's total now, once (phase 4's review).
    if (priorCalls > row.tool_calls) deps.countToolCalls?.(priorCalls - row.tool_calls, { taskId: row.task_id, calls: priorCalls });
    let outcome: TurnOutcome | null = null;
    let error: { type: string; message: string } | null = null;
    let timedOut = false;
    let landing = false;
    /** PD-ORCH-005: REQ-ORCH-095's one re-prompt was due when the run came to rest, so it is owed to the resumed child. */
    let rePromptOwed = false;
    /** PD-ORCH-004: whether the child was making progress at the instant its limit expired. */
    let progressing = false;
    // PD-ORCH-005 revision 4 clause 14: one check per execution, at the child's first model step — REQ-ORCH-088's retry and
    // REQ-ORCH-095's re-prompt run within it and compare nothing.
    const fingerprint = deps.record?.fingerprint(row.task_id, row.canonical_name, row.iteration);
    // REQ-ORCH-088: the child runs under the hard timeout; on expiry, once, it is retried on the role's fallback when one is untried.
    for (;;) {
      const controller = new AbortController();
      // REQ-ORCH-133: this child's own abort, which cancelling it (and only it, with its descendants) fires.
      this.controllers.set(row.task_id, controller);
      const onRunAbort = () => controller.abort();
      deps.runSignal.addEventListener('abort', onRunAbort, { once: true });
      timedOut = false;
      landing = false;
      progressing = false;
      // REQ-ORCH-088: expiry asks the child to land — the turn stops before its next model step — and only
      // the backstop CHILD_LANDING_GRACE later cuts it off. `timedOut` is set at the ceiling, not at the
      // backstop, so the fallback-retry limb below and the report's `Child timed out after <N>s` are
      // reached by a child that landed gracefully exactly as by one that had to be cut.
      // A box rather than a `let`: the assignment happens inside the ceiling's callback, which the compiler
      // cannot see, and the cast that would otherwise be needed in the `finally` says less than this does.
      const backstop: { handle: TimerHandle | null } = { handle: null };
      stallWatch.start();
      // OQ-155 with PD-ORCH-005 clause 4: a child resumed into waiting takes no step until a child of its own reports — it is
      // between its turns from the start, and no silence is counted against it while it waits (found by the verifier's review).
      if (start?.kind === 'resumed' && start.waiting) stallWatch.betweenTurns();
      const timer = deps.clocks.timers.after(childTimeoutMs, () => {
        timedOut = true;
        landing = true;
        // PD-ORCH-004: read AT the expiry, so a call completed during the landing that follows never counts.
        progressing = progress.madeProgress(deps.clocks.monotonic.now(), stallMs);
        backstop.handle = deps.clocks.timers.after(CHILD_LANDING_GRACE, () => { controller.abort(); });
      });
      let firstCall = true;
      const turn = (task: string | null, history: readonly ChatMessage[]) => {
        const wasFirst = firstCall; firstCall = false;
        // REQ-NOTIFY-112: the run hands the child something to answer — its payload, its record, its children's reports, a
        // re-prompt or the corrective message — so the silence it could be blamed for starts now. A wait on its own children
        // before this asked it for no output.
        stallWatch.activity();
        return runTurn({
        writer: deps.writer, owner: deps.owner, backend: deps.backend, tools, clocks: deps.clocks, persona: row.persona, agentName: row.canonical_name,
        // REQ-WORKSPACE-060 (ADR-0063): the session's context units follow the role's instructions and its playbook,
        // read at THIS construction so a skill force-loaded since the last child reaches this one.
        systemPrompt: withContextUnits(withPlaybook(persona?.systemPrompt ?? '', deps.playbookFor?.(row.persona) ?? ''), deps.contextUnits?.() ?? []), model: persona?.modelRef ?? deps.model, thinking: persona?.thinking ?? deps.thinking, modelTimeoutMs: deps.modelTimeoutMs, modelRetries: deps.modelRetries,
        credentialFor: deps.credentialFor, maxStepsPerTurn: deps.maxStepsPerTurn, warn: deps.warn, dispatched,
        ...(deps.supervisorFor ? { supervisor: deps.supervisorFor(row.task_id) } : {}),
        // REQ-MONITOR-135: "each successful injection refreshes the agent's last-activity timestamp" — its stall watch's.
        ...(deps.steeringFor ? { steering: refreshing(deps.steeringFor(row.task_id), () => stallWatch.activity()) } : {}),
        // REQ-MONITOR-123's pause and REQ-ORCH-088's landing are the same act, so they are the same flag here — and so is
        // PD-ORCH-005's rest, whatever brought it: every agent stops before its next model step.
        shouldPause: () => landing || this.resting || (deps.shouldPause?.() ?? false),
        ...(deps.cutCalls ? { cutCalls: deps.cutCalls } : {}),
        interruption: () => (this.resting ? deps.restCause?.() ?? null : null),
        ...(resilience ? { resilience } : {}),
        ...(compression ? { compression } : {}),
        ...(deps.onRequestUsage ? { onRequestUsage: deps.onRequestUsage } : {}),
        onToolCompleted: (call, result) => { stallWatch.toolCompleted(call.callId); progress.completed(deps.clocks.monotonic.now(), call.name, result.args, result.status === 'ok' && !result.isError); },
        onToolStarted: (call) => stallWatch.toolStarted(call.callId, call.name),
        onModelEvent: (kind) => stallWatch.modelEvent(kind),
        // PD-ORCH-005 clause 1: the child's conversation, recorded under its task id as it happens.
        ...(deps.record ? { recorder: deps.record.recorder(row.task_id, row.iteration) } : {}),
        ...(fingerprint ? { fingerprint } : {}),
        detached: () => this.detached,
        // REQ-ORCH-093: the resume limb — a child's turn after its first is a parent being resumed with reports.
        parentResume: !wasFirst,
        // OQ-155: once the turn ends the child waits on its own children, or ends; neither is a silence of its own.
      }, task, history, controller.signal).finally(() => stallWatch.betweenTurns()); };
      // A resumed child's first attempt carries on from its record; REQ-ORCH-088's retry starts again from its payload.
      const fromRecord = start !== null;
      try {
        outcome = await this.runWithChildren(row.task_id, turn, start ?? { kind: 'fresh', task: payload() }, controller.signal);
        start = null;
        /*
         * REQ-NOTIFY-111/112: a child whose turn failed after it produced no output for the whole stall window does not end
         * as a failure: it is given one corrective message and resumes from where it stopped, its conversation carrying on
         * with the message (OQ-127). Once per child task; never on an answer-only route, after its own limit, a cancel, the
         * rest, loop supervision's escalation, or an error no instruction can address.
         */
        const failedStep = outcome.report.status === 'failed' ? outcome.report.error : null;
        if (stallRecoveryDue({ status: outcome.report.status, error: failedStep, escalated: outcome.escalation !== undefined, aborted: controller.signal.aborted, timedOut, resting: this.resting, paused: outcome.paused === true, answerRoute: deps.route === 'answer', corrected, quietMs: stallWatch.quietFor(), thresholdMs: stallMs, activeCalls: stallWatch.activeCalls })) {
          corrected = true;
          const quietS = Math.floor(stallWatch.quietFor() / 1000);
          const instruction = correctiveInstruction({ quietS, windowS: stallMs / 1000, failure: failedStep?.headline ?? 'no reason was given' });
          // The message itself is in the child's conversation record (REQ-ORCH-140); the session log says it was sent (OQ-127).
          deps.warn(correctiveMessageLine(row.canonical_name, row.task_id, quietS, failedStep?.headline ?? 'no reason was given'));
          stallWatch.activity();
          const stopped = outcome;
          let first = true;
          // The corrective message is the next message of the conversation the failed turn left, and a delegation it
          // leads to is waited for as any turn's is.
          const resumeWith = (task: string | null, history: readonly ChatMessage[]): Promise<TurnOutcome> => { if (first) { first = false; return turn(instruction, stopped.messages); } return turn(task, history); };
          const again = await this.runWithChildren(row.task_id, resumeWith, { kind: 'fresh', task: instruction }, controller.signal);
          outcome = { ...again, toolCallCount: stopped.toolCallCount + again.toolCallCount };
        }
        // REQ-ORCH-095: one re-prompt for a child that neither worked nor answered — and, on a work route, for an implementer
        // that produced text and acted on nothing; on the answer route the answered category is accepted at once (REQ-ORCH-015).
        // A resumed child's calls before the rest count: it worked, even if its resumed turn made no call.
        const calls = priorCalls + outcome.toolCallCount;
        const textOnly = calls === 0 && outcome.report.text.trim() !== '';
        const rePrompt = calls === 0 && outcome.report.text.trim() === '' || ((deps.route ?? 'work') === 'work' && textOnly && persona?.implementer === true);
        // A child resumed from `summarizing` had answered, and was assessed then: its attempt from the record is not
        // assessed twice, and a retry from its payload is a new attempt, assessed as any (phase 4's reviews).
        const assessed = fromRecord && resume?.assessed === true;
        if (!controller.signal.aborted && outcome.report.status !== 'failed' && outcome.paused !== true && rePrompt && !assessed) {
          // PD-ORCH-005 clause 2: no model call once the run is coming to rest — the re-prompt waits for the resume.
          if (this.resting) rePromptOwed = true;
          else {
            const again = await turn('Carry out the task now, using your tools where the task needs them, then answer with what you did.', outcome.messages);
            outcome = { ...again, toolCallCount: outcome.toolCallCount + again.toolCallCount };
          }
        }
      } catch (cause) {
        error = { type: 'child_exception', message: String(cause instanceof Error ? cause.message : cause) };
        deps.writer.recordIssue({ kind: 'child_exception', severity: 'error', actor: row.canonical_name, message: `Child ${row.canonical_name} raised: ${error.message}` });
      } finally {
        stallWatch.stop();
        // The watch is disarmed: whatever the child's figure said, it is no longer stalled on this attempt's account.
        if (!this.detached) this.stallEvaluated(row.task_id, row.canonical_name, null);
        timer.cancel();
        backstop.handle?.cancel();
        deps.runSignal.removeEventListener('abort', onRunAbort);
        this.controllers.delete(row.task_id);
      }
      const fb = resilience?.cell.fallback ?? null;
      // Not after a rest (PD-ORCH-005: the retry is a model call) nor after the user cancelled this child (REQ-ORCH-133):
      // the landing grace aborts the controller too, so the cancel is read from the record rather than from the signal.
      const cancelled = isTerminalChildState(this.ledger.get(row.task_id)?.state ?? 'cancelled');
      if (timedOut && !deps.runSignal.aborted && !this.resting && !cancelled && resilience && fb !== null && !resilience.cell.fallbackAttempted) {
        const cell = resilience.cell;
        const from = cell.model;
        cell.fallbackAttempted = true;
        cell.model = fb;
        const seconds = childTimeoutMs / 1000;
        const message = `Child ${row.canonical_name} timed out after ${seconds}s on ${providerIdentity(resilience.catalogue, from.model)}/${from.model.modelId}; retried once on the fallback model ${providerIdentity(resilience.catalogue, cell.model.model)}/${cell.model.model.modelId} (REQ-ORCH-088).`;
        // REQ-ORCH-139: the vocabulary's words for REQ-ORCH-088's retry on the role's fallback — the `fallback_model` entry and
        // the `timeout_fallback` issue (A29; formerly `child_timeout_fallback` for both, a name no list has).
        deps.writer.appendTimeline('fallback_model', 'rotaris', message, { task_id: row.task_id, from_provider: providerIdentity(resilience.catalogue, from.model), from_model: from.model.modelId, to_provider: providerIdentity(resilience.catalogue, cell.model.model), to_model: cell.model.model.modelId, timeout_seconds: seconds });
        deps.writer.recordIssue({ kind: 'timeout_fallback', severity: 'warning', actor: row.canonical_name, message, metadata: { task_id: row.task_id, requested_model: `${providerIdentity(resilience.catalogue, from.model)}/${from.model.modelId}`, fallback_model: `${providerIdentity(resilience.catalogue, cell.model.model)}/${cell.model.model.modelId}`, timeout_seconds: seconds } });
        deps.warn(message);
        outcome = null;
        error = null;
        // PD-ORCH-005: the retry starts the child's conversation again from its payload, and its record says so.
        deps.record?.restarted(row.task_id, row.iteration);
        continue;
      }
      break;
    }
    // REQ-SESSION-094: the rest gave up waiting for this execution, and the run it belonged to has ended.
    if (this.detached) return;
    const cancelled = deps.runSignal.aborted;
    // A resumed child's count carries on from its record; only this run's calls join this run's total.
    const toolCalls = priorCalls + (outcome?.toolCallCount ?? 0);
    this.toolCalls.set(row.task_id, toolCalls);
    // REQ-MONITOR-102: this child's calls join the session-wide total, counted once, here, whatever it ended as.
    deps.countToolCalls?.(outcome?.toolCallCount ?? 0, { taskId: row.task_id, calls: toolCalls });
    // REQ-CHAT-088: the tool port may have persisted this child's own plan while it ran; settling updates the
    // call count while preserving that document for the scoped transcript and later session refreshes.
    const persistedTodo = deps.dal.childrenOf(deps.sessionId).find((child) => child.task_id === row.task_id)?.todo ?? null;
    deps.dal.setChildTodo(deps.sessionId, row.task_id, persistedTodo, toolCalls);
    /*
     * REQ-ORCH-133 (the repair of `cancelling-one-child-does-not-stop-it.md`): the user cancelled this child while it ran.
     * The cancel already settled its record, stored the report that says so and aborted this execution; nothing is
     * written over either.
     */
    if (isTerminalChildState(this.ledger.get(row.task_id)?.state ?? 'cancelled')) return;
    /*
     * PD-ORCH-005 clauses 2 and 3: the run is coming to rest. This child stopped where it stood — before its next model
     * step, its in-flight calls finished or cut — and it is left `paused` with the interruption recorded: no re-prompt,
     * no summary, no report, no terminal state (the repair of `a-pause-settles-children-instead-of-holding-them.md`). It
     * resumes into writing its report only when its turn truly finished — it answered, owes no re-prompt and is owed
     * nothing by children of its own; otherwise (its turn stopped where it stood, or the rest's abort cut its model step,
     * which reads as a failed step, or its execution raised, as the root's may) it resumes `running` from its record
     * (OQ-96). A child whose limit expired is not stopped by the rest: it ends `failed` as REQ-ORCH-088 has it, and is
     * never resumed (clause 5) — its report assembled with no summarising call, since no model call is made once the run
     * comes to rest.
     */
    const rest = this.resting && !timedOut ? deps.restCause?.() ?? null : null;
    if (rest !== null) {
      const finished = outcome !== null && outcome.paused !== true && outcome.report.status !== 'failed' && !rePromptOwed;
      const into = finished ? 'summarizing' : 'running';
      const r = this.ledger.rest(row.task_id, rest, into, toolCalls);
      if (!r.ok) deps.warn(r.reason);
      return;
    }
    const messages = outcome?.messages ?? [];
    const textOf = (m: ChatMessage): string => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const reversed = [...messages].reverse();
    const lastAssistant = reversed.find((m) => m.role === 'assistant');
    /**
     * REQ-ORCH-088: the timeout report carries "the last/final response extracted from the transcript".
     * The last assistant message is very often the one that OPENED a tool call and said nothing, which is
     * how a whole child's work reported an empty last response: the extraction stopped at the first
     * assistant message it met rather than at the last one that spoke. It now falls back to the last
     * assistant message carrying text.
     *
     * `finalIsFinal` is deliberately still decided on the plain last assistant message: REQ-ORCH-110 fixes
     * the final-response field to text "not followed by further tool activity", and text found further back
     * WAS followed by it. So a landed child's words reach `last_response` and never `final_response`.
     */
    const lastSpoken = reversed.find((m) => m.role === 'assistant' && textOf(m).trim() !== '');
    const lastText = lastAssistant ? (textOf(lastAssistant).trim() !== '' ? textOf(lastAssistant) : (lastSpoken ? textOf(lastSpoken) : '')) : '';
    const finalIsFinal = lastAssistant !== undefined && messages[messages.length - 1] === lastAssistant && textOf(lastAssistant).trim() !== '';
    let status: 'succeeded' | 'failed' | 'cancelled';
    const errors: { type: string; message: string }[] = [];
    if (cancelled) status = 'cancelled';
    else if (timedOut) { status = 'failed'; errors.push({ type: 'timeout', message: `Child timed out after ${(deps.childTimeoutMs ?? CHILD_TIMEOUT_MS) / 1000}s` }); deps.writer.recordIssue({ kind: 'timeout', severity: 'error', actor: row.canonical_name, message: `Child ${row.canonical_name} timed out after ${(deps.childTimeoutMs ?? CHILD_TIMEOUT_MS) / 1000}s.` }); }
    else if (error) { status = 'failed'; errors.push(error); }
    else if (!outcome || outcome.report.status === 'failed') { status = 'failed'; if (outcome && outcome.report.status === 'failed') errors.push({ type: outcome.escalation ? 'circuit_breaker_escalation' : 'model', message: outcome.report.error.headline }); }
    else if (toolCalls === 0 && lastText.trim() === '') { status = 'failed'; errors.push({ type: 'incomplete_execution', message: 'no_activity' }); deps.writer.recordIssue({ kind: 'incomplete_execution', severity: 'warning', actor: row.canonical_name, message: `Child ${row.canonical_name} ended with no activity after one re-prompt (category no_activity).` }); }
    else status = 'succeeded';

    // REQ-MONITOR-018: summarizing until the report exists, then terminal; cancellation settles from anywhere. A child
    // resumed `summarizing` is there already.
    if (!cancelled && this.ledger.get(row.task_id)?.state !== 'summarizing') { const s = this.ledger.transition(row.task_id, 'summarizing'); if (!s.ok) deps.warn(s.reason); }
    /*
     * PD-ORCH-004: REQ-ORCH-088's report stands as it is — status, timeout error, last response — and a child that was
     * making progress when the limit expired additionally carries the statement, the paths it changed and, unless it
     * is itself a continuation, the offer. A child that was not making progress gets exactly REQ-ORCH-088's report.
     */
    const cutOff: CutOff | null = timedOut && !cancelled && progressing
      ? cutOffReport({ taskId: row.task_id, limitS: childTimeoutMs / 1000, stallS: stallMs / 1000, changedPaths: progress.changedPaths(), isContinuation: row.continuation_of !== null })
      : null;
    /*
     * REQ-ORCH-133 (the repair of `cancelling-one-child-does-not-stop-it.md`): the summarising pass runs under this
     * child's own abort too, so a cancel while it summarises stops it, and what it produced is not stored over the
     * cancellation's report. PD-ORCH-005: nothing summarises once the run is coming to rest, so a stop's or a quit's abort
     * ends the pass. The explicit cancel's does not: REQ-ORCH-080's drain lets a finishing child write its report
     * "without cancelling" it, as before (clause 3: "as today"; found by phase 3's third review).
     */
    const summarising = new AbortController();
    this.controllers.set(row.task_id, summarising);
    const onRunAbortWhileSummarising = () => { if ((deps.restCause?.() ?? null) !== null) summarising.abort(); };
    deps.runSignal.addEventListener('abort', onRunAbortWhileSummarising, { once: true });
    const reportInput: ReportInput = { agentName: row.canonical_name, role: row.persona, status, messages, toolCallCount: toolCalls, toolsUsed: [...new Set(messages.flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-call' ? [p.name] : []))))], lastText, finalTextIsFinal: finalIsFinal, errors, task: row.task };
    let produced: Awaited<ReturnType<typeof produceReport>>;
    try {
      produced = await produceReport(reportInput, cancelled || this.resting ? null : deps.summariser, summarising.signal, this.resting && !cancelled ? 'the run was coming to rest, so no summarising call was made' : undefined, () => this.resting);
    } finally {
      deps.runSignal.removeEventListener('abort', onRunAbortWhileSummarising);
      this.controllers.delete(row.task_id);
    }
    if (this.detached || isTerminalChildState(this.ledger.get(row.task_id)?.state ?? 'cancelled')) return;
    if (produced === null) {
      /*
       * PD-ORCH-005 clauses 2 and 3: the summarising pass was cut short — a stop's or a quit's abort, or a pause that
       * allowed no second attempt. It produced no report, so this child has not finished: it is left `paused`, and it
       * summarises again when it resumes (found by phase 3's second review).
       */
      const restNow = this.resting ? deps.restCause?.() ?? null : null;
      if (restNow !== null) {
        const r = this.ledger.rest(row.task_id, restNow, 'summarizing', toolCalls);
        if (!r.ok) deps.warn(r.reason);
        return;
      }
      produced = fallbackReport(reportInput, 'the run was cancelled during the summarising pass');
    }
    const report = cutOff === null ? produced : { ...produced, cut_off: cutOff };
    this.ledger.storeReport(row.task_id, report as unknown as Record<string, unknown>);
    const terminal = cancelled ? 'cancelled' : status === 'failed' ? 'failed' : reportStatusToState(report.status);
    const t = cancelled ? this.ledger.transition(row.task_id, 'cancelled', 'cancellation') : this.ledger.transition(row.task_id, terminal);
    if (!t.ok) deps.warn(t.reason);
    // REQ-HOOKS-075: child_completed carries the child's terminal state and its report status side by side.
    await this.afterTerminal(row, t.ok ? t.row : null, () => {
      // REQ-ORCH-098: teardown, whatever the terminal state.
      writeTeardown(deps.writer, row, terminal, report.status, report.summary);
    }, { child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state: terminal, status: report.status, summary: report.summary });
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
    // REQ-TOOLS-152: the call's `suppress_auto_context`, stored on the row, or the role's `skip_auto_sibling_context`
    // (REQ-CONFIG-107) omits the index; the attached artifacts are the caller's explicit choice and are carried either way.
    const suppressed = row.suppress_auto_context === 1 || personaOf(this.deps, row.persona)?.skipAutoSiblingContext === true;
    const index = suppressed ? { text: '', included: 0, elided: 0 } : siblingIndexBlock(store.hydrate().records);
    if (index.text !== '') blocks.push(index.text);
    const references = JSON.parse(row.attach_artifacts) as string[];
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
      this.deps.writer.appendTimeline('context_selection', 'rotaris', `${row.canonical_name} was given ${countNoun(index.included, 'sibling artifact')}${full ? ` and ${countNoun(full.included, 'attached artifact')}` : ''}.`, {
        task_id: row.task_id, canonical_name: row.canonical_name,
        sibling_index_included: index.included, sibling_index_elided: index.elided, sibling_index_suppressed: suppressed,
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

  /**
   * REQ-SESSION-092 / REQ-SESSION-094: every execution in flight — each aborted by the stop — is awaited within `grace`,
   * what is left of the stop's 30 s, and whatever still executes after that is detached: it streams, settles and records
   * nothing more when it returns, whatever its record says by then. A rest calls it for a stop or a quit, and `Run.turn`
   * for a stop that brings the iteration to no rest (the explicit cancel), after `finalize`. Returns whether any execution
   * was detached.
   */
  async outlast(grace: Millis): Promise<boolean> {
    if (this.executing.size === 0) return false;
    if (grace <= 0) this.detach();
    else {
      let timer: TimerHandle | undefined;
      const executions = this.drained().then(() => false);
      const cut = await Promise.race([executions, new Promise<boolean>((r) => { timer = this.deps.clocks.timers.after(grace, () => r(true)); })]);
      timer?.cancel();
      if (cut) this.detach();
    }
    return this.detached;
  }

  /**
   * PD-ORCH-005 clause 2 / REQ-HOOKS-080: resolves once no execution is in flight. It looks again whenever the ones it
   * waited on have ended, since one can have begun meanwhile: a `child_completed` hook the user's cancel of one child
   * queued while the rest waited (`completedOutside`, tracked as an execution), which a wait on only the executions
   * running when the rest began let through to `session_end` (found by the fourth verification of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook`'s repair). The scheduler is held from the rest,
   * so no child starts meanwhile and the wait ends.
   */
  private async drained(): Promise<void> {
    while (this.executing.size > 0) await Promise.allSettled([...this.executing]);
  }

  /** REQ-SESSION-094: every execution still in flight is given up on, and which children they are is kept (`givenUpOn`). */
  private detach(): void {
    this.detached = true;
    for (const taskId of this.executionOf.keys()) this.givenUpOn.add(taskId);
  }

  /** REQ-ORCH-052: every exit path leaves every record terminal. */
  finalize(reason: string): number {
    return this.scheduler.finalizeIncomplete(reason);
  }
}

/**
 * REQ-MONITOR-135: a steering port whose every delivery refreshes the agent's last activity (`refresh`), so a steer that
 * reaches the conversation starts the stall watch's silence again. A drain that delivers nothing refreshes nothing.
 */
export function refreshing<T>(drain: () => readonly T[], refresh: () => void): () => readonly T[] {
  return () => { const delivered = drain(); if (delivered.length > 0) refresh(); return delivered; };
}

/** PD-TOOLS-006 revision 2: the write scope a child's record stores, as the patterns it declared; none when unreadable. */
function storedScope(row: ChildRow): string[] {
  try { const v = JSON.parse(row.write_scope) as unknown; return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : []; } catch { return []; }
}

/**
 * REQ-ORCH-053: on a later run of the same session, settle every non-terminal child of any previous iteration before the
 * first iteration. Its report is materialised as every other terminal child's is (REQ-LIBRARY-092), given the session's
 * artifact store. Before it ends, its open calls are answered as cut by no rest and the calls its record holds join the
 * session's total (`recordCutChild`, REQ-MONITOR-102 / REQ-SESSION-129); after, it is torn down (REQ-ORCH-098).
 */
export function settleStaleChildren(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, warn: (m: string) => void, artifacts?: ArtifactStore, settled?: (fields: Readonly<Record<string, unknown>>) => void): number {
  let n = 0;
  for (const c of dal.childrenOf(sessionId)) {
    // PD-ORCH-005 (narrowing REQ-ORCH-053 / REQ-SESSION-065 / REQ-NOTIFY-121): a `paused` agent is left as it is; it is
    // resumed with its iteration, or ended by the user continuing without it.
    if (isTerminalChildState(c.state) || c.state === 'paused') continue;
    // REQ-MONITOR-102 / REQ-SESSION-129: before it ends, its open calls are answered and the calls its record holds are
    // counted (the repair of `a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md`).
    // Idempotent, so a plan cycle's child the crash record already reached adds nothing here.
    recordCutChild(dal, writer, sessionId, c, null, warn);
    const r = writer.transitionChild(c.task_id, 'cancelled', 'cancellation');
    if (r.ok) {
      n += 1;
      const report = { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: 'Cancelled: the run that owned this child ended (killed host or hard cancel) before it settled.', key_findings: [], last_response: '', final_response: '', errors: [{ type: 'cancelled', message: 'settled on continue (REQ-ORCH-053)' }] };
      storeChildReport({ writer, artifacts, warn }, c.task_id, c, report);
      // REQ-ORCH-098: torn down as every terminal child is (OQ-152).
      writeCancelledTeardown(writer, c, report);
      // REQ-HOOKS-003: the settling run fires its `child_completed` once its own `session_start` has (`RunDeps.settledBeforeStart`).
      settled?.(childCompletedFields(dal.getChild(sessionId, c.task_id) ?? r.value));
    }
    else warn(r.error.code === 'illegal-move' ? r.error.reason : r.error.code);
  }
  return n;
}

/**
 * REQ-HOOKS-075: `child_completed`'s fields for a child whose record is terminal — its terminal state beside its report's
 * status and summary, read from the report stored on the record (`""` for either when none is, which a consumer reads as
 * unknown). Every path that ends a child outside its own settle builds them here.
 */
export function childCompletedFields(row: ChildRow): Readonly<Record<string, unknown>> {
  let report: Record<string, unknown> = {};
  try { const v = JSON.parse(row.report ?? '{}') as unknown; if (v !== null && typeof v === 'object' && !Array.isArray(v)) report = v as Record<string, unknown>; }
  catch { /* an unreadable report leaves both fields unknown */ }
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  return { child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state: row.state, status: text(report['status']), summary: text(report['summary']) };
}
