import { millis, toIsoUtc, type Clocks, type Millis, type SessionId, type TimerHandle } from '@rotaris/kernel';
import { interruptionPhrase, isTerminalChildState, reportStatusToState, resumeStateFor, TASK_ID_PATTERN, type ChildState, type Interruption, type RootExecutionRecord } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { ChildRow, StoreDal } from '@rotaris/store';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import { runTurn, type SteeringPrompt, type ToolPort, type TurnOutcome } from '../run/turn.js';
import { answerOpenCalls } from '../run/crash.js';
import { callsRun } from '../run/interruption.js';
import type { AttachmentOutcome, BackgroundOutput, DelegateOutcome, DelegateRequest, DelegationOps, WaitOutcome } from './delegation.js';
import { fullContextBlock, siblingIndexBlock, type AttachedResolution } from '../artifacts/context.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { ChildLedger, storeChildReport, userCancellation, type Budget } from './ledger.js';
import { childPayload, completionNotification, inheritedContextBlock, parseReport, priorAgentContext, reportBlock, resumeMessage } from './notify.js';
import { CHILD_STALL_TIMEOUT_MS, continuationRefusal, cutOffLines, cutOffReport, ProgressLog, type CutOff } from './cut-off.js';
import { BUILT_IN_PERSONAS, type Persona, type PersonaResolver, type RoleName } from './personas.js';
import { fallbackReport, produceReport, type ReportInput, type SummariserDeps } from './report.js';
import { Scheduler } from './scheduler.js';
import { correctiveInstruction, correctiveMessageLine, hadCorrectiveMessage, StallWatch, stallRecoveredLine, stallRecoveryDue, stallWaitingLine, stallWarning } from './stall.js';
import { validateWriteScope, WriteClaims, writeScopeBlock, type ClaimHit, type ScopeDisclosure } from './write-scope.js';
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
   */
  readonly countToolCalls?: ((n: number) => void) | undefined;
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

function personaOf(deps: ChildrenDeps, name: string): Persona | undefined {
  return deps.personas ? deps.personas.resolve(name)?.persona : BUILT_IN_PERSONAS[name as RoleName];
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
  /** REQ-LIBRARY-098: the artifacts each launch attached explicitly, by reference, for as long as the run lives. */
  private readonly attached = new Map<string, readonly string[]>();
  /**
   * REQ-TOOLS-152: the inherited-context block of each child that named a completed sibling, rendered at the call
   * from the reports as they stood then, for as long as the run lives — the same terms as `attached`. The ids
   * themselves are on the row (`children.inherited_context`); what is remembered here is which of them counted.
   */
  private readonly inherited = new Map<string, string>();
  /** PD-TOOLS-006: the live write scopes' claims, in acceptance order, and each child's disclosure as fixed at its acceptance. */
  private readonly claims = new WriteClaims();
  private readonly disclosures = new Map<string, ScopeDisclosure>();
  /** PD-ORCH-005: every child execution in flight, so a rest can wait for each to come to rest before it sweeps. */
  private readonly executing = new Set<Promise<void>>();
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
   * PD-ORCH-004 revision 3: this iteration's children that had ended before this run took the iteration up — a resumed
   * iteration's, left by an earlier run. Their offers are the root's to take up, as "a later run" of the session's.
   */
  private readonly endedInEarlierRun: ReadonlySet<string>;

  constructor(private readonly deps: ChildrenDeps, readonly iteration: number) {
    this.ledger = new ChildLedger({ dal: deps.dal, writer: deps.writer, sessionId: deps.sessionId, iteration, budget: deps.budget, modelCap: deps.modelCap, warn: deps.warn , personas: deps.personas, ...(deps.artifacts ? { artifacts: deps.artifacts } : {}), ...(deps.rootRecord ? { rootRecord: deps.rootRecord } : {}) });
    this.endedInEarlierRun = new Set(this.ledger.all().filter((c) => isTerminalChildState(c.state)).map((c) => c.task_id));
    this.scheduler = new Scheduler({ ledger: this.ledger, runChild: (row) => this.track(this.executeSettling(row)), warn: deps.warn });
    this.scheduler.onTerminal((row) => { const w = this.resumeWaiters.get(row.parent_id); if (w) { this.resumeWaiters.delete(row.parent_id); w(); } });
    // PD-TOOLS-006: a claim lapses at its child's terminal state. Liveness is also read from the ledger at every
    // query, so a child settled by a path that fires no listener (a stale sweep) holds nothing either; this only
    // keeps the map from growing with the run.
    this.scheduler.onTerminal((row) => { this.claims.release(row.task_id); this.disclosures.delete(row.task_id); });
  }

  children(): readonly ChildRow[] {
    return this.ledger.all();
  }

  // ---- DelegationOps -----------------------------------------------------------------------

  async delegate(parentId: string, req: DelegateRequest): Promise<DelegateOutcome> {
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
    // PD-ORCH-004: a continuation is admitted only for the caller's own child that offered one, and only once.
    const continuationOf = req.continuationOf ?? '';
    if (continuationOf !== '') {
      const refusal = this.continuationRefusalFor(parentId, continuationOf);
      if (refusal !== null) return { status: 'rejected', canonicalName: req.taskName, message: refusal };
    }
    const r = this.ledger.spawn({
      parentId, parentDepth, persona: req.persona, taskName: req.taskName, task: req.task, dependsOn: req.dependsOn, inheritedContext: req.inheritedContext,
      category: req.category, background: req.runInBackground, modelKey: persona?.modelRef?.modelId ?? this.deps.model.modelId, grantedTools: persona?.tools ?? [],
      ...(continuationOf !== '' ? { continuationOf } : {}),
      ...(scope.patterns.length > 0 ? { writeScope: scope.patterns } : {}),
    });
    if (!r.ok) return { status: 'rejected', canonicalName: req.taskName, message: r.error.reason };
    const { row, held, aliasResolved, inherited } = r.value;
    // REQ-LIBRARY-098: the attachment list belongs to THIS launch, not to the record — a child does not outlive
    // the run that spawned it, so it is remembered here for the moment the child's payload is assembled.
    const attachments = this.rememberAttachments(row.task_id, req.attachArtifacts ?? []);
    // REQ-TOOLS-152 / REQ-TOOLS-154 (5): the completed siblings' reports the ledger admitted, rendered now — a terminal
    // child's report does not change — and read when the payload is assembled, before the pass below can start the child.
    const inheritedBlock = inheritedContextBlock(inherited);
    if (inheritedBlock !== '') this.inherited.set(row.task_id, inheritedBlock);
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
    const already = set.every((id) => { const r = this.ledger.get(id); return !r || isTerminalChildState(r.state); });
    if (already) {
      const rows = set.map((id) => this.ledger.get(id)).filter((r): r is ChildRow => r !== undefined);
      for (const r of rows) this.ledger.markObserved(r.task_id);
      return { immediate: true, requested: set.length, text: set.length === 0 ? 'There was nothing to wait for: no task ids were given and no background children are active.' : `All ${set.length} requested task(s) were already complete.\n\n${rows.map(reportBlock).join('\n\n')}` };
    }
    await this.scheduler.waitFor(set);
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
  async rest(cause: Interruption): Promise<number> {
    this.beginRest();
    // A stop and a quit have aborted every execution; REQ-SESSION-092's grace bounds how long their ends are awaited. A
    // pause waits for the step in flight, whose own model timeout bounds it (REQ-MONITOR-123).
    const executions = Promise.allSettled([...this.executing]).then(() => false);
    if (cause === 'pause') await executions;
    else {
      let grace: TimerHandle | undefined;
      this.detached = await Promise.race([executions, new Promise<boolean>((r) => { grace = this.deps.clocks.timers.after(STOP_GRACE, () => r(true)); })]);
      grace?.cancel();
    }
    // Clause 3: an explicit cancel that arrived meanwhile is final — nothing more is paused; the caller settles the rest.
    if ((this.deps.restCause?.() ?? null) === null) return 0;
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
    return paused.length;
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
      const r = this.ledger.resume(c.task_id, summarising && notice !== null ? 'running' : undefined);
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
      this.controllers.get(t.task_id)?.abort();
      this.scheduler.settled(r.row);
    }
    this.scheduler.pass();
    return true;
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
      if (signal.aborted || this.resting) break;
      const newly = this.ledger.takeNewlyTerminal(agentId);
      if (newly.length === 0) continue;
      const stillRunning = this.ledger.childrenOf(agentId).filter((c) => !isTerminalChildState(c.state)).length;
      const notices = newly.filter((c) => c.background === 1).map((c) => completionNotification(c, stillRunning, this.durationS(c)));
      const message = [...notices, resumeMessage(newly, stillRunning)].join('\n\n');
      outcome = await turn(message, history);
      history = outcome.messages;
      toolCalls += outcome.toolCallCount;
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
  private async executeSettling(row: ChildRow, resume: ChildResume | null = null): Promise<void> {
    try {
      await this.execute(row, resume);
    } catch (cause) {
      await this.settleRaised(row, cause, 'its execution raised outside its turn');
    }
  }

  /**
   * A child whose execution raised where nothing settled it ends `failed` (REQ-ORCH-073's intent at the child's level)
   * with a report whose error names the raise, stored before its parent is told (REQ-ORCH-108), and the teardown's
   * `child_end`, `child_result` and `child_conversation_closed` (REQ-ORCH-098) and `child_completed` (REQ-HOOKS-003). A child already terminal (a cancel), or `paused`, is
   * left as it is, and so is everything after the rest detached this iteration (REQ-SESSION-094). A raise inside the
   * turn while the run comes to rest never reaches here: `execute` catches it and leaves the child `paused` (OQ-96).
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
    // REQ-ORCH-098: the same teardown the settle in `execute` writes, "whether or not its execution raised".
    deps.writer.appendTimeline('child_end', 'rotaris', `Child ${row.canonical_name} (${row.task_id}) ended failed.`, { task_id: row.task_id, state: 'failed', at: toIsoUtc(deps.clocks.wall.instant()) });
    deps.writer.appendTimeline('child_result', 'rotaris', `Child ${row.canonical_name} reported failed: ${message.slice(0, 120)}`, { task_id: row.task_id, status: 'failed' });
    deps.writer.appendTimeline('child_conversation_closed', 'rotaris', `Child ${row.canonical_name}'s conversation closed.`, { task_id: row.task_id });
    if (deps.hooks) await deps.hooks.fireLifecycle('child_completed', { child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state: 'failed', status: 'failed', summary: message });
    this.scheduler.settled(this.ledger.get(row.task_id) ?? t.row);
  }

  /**
   * A child's execution. `resume` is PD-ORCH-005's resume: the child was restored `running` or `summarizing` and carries
   * on from its recorded conversation under a fresh `child_timeout`, its tool-call count carried on from its record. One
   * restored `summarizing` had answered, so its record ends on its answer: it resumes into waiting, takes no step, and
   * writes its report.
   */
  private async execute(row: ChildRow, resume: ChildResume | null = null): Promise<void> {
    const resumed = resume !== null;
    const { deps } = this;
    const started = deps.clocks.monotonic.now();
    this.startedAt.set(row.task_id, started);
    if (!resumed) {
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
    // OQ-126 asks the owner for the words.
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
      // REQ-ORCH-089's stall callback: no host listens yet, so no badge draws (`a-stalled-child-is-never-shown-stalled.md`).
      evaluated: () => undefined,
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
    // store as it stands at launch — a newly created agent is given them, so they are built when its payload is, and a
    // resumed agent, whose payload is already in its record, is given them only if REQ-ORCH-088's retry restarts it.
    let artifactBlocks: readonly string[] | null = null;
    const payload = (): string => childPayload(deps.workspaceRoot, row.task, prior, artifactBlocks ??= this.artifactContext(row), writeScopeBlock(this.disclosures.get(row.task_id)), this.inherited.get(row.task_id) ?? '');
    // PD-ORCH-005 clause 4: a resumed child's first attempt starts from its record; a retry starts from its payload.
    let start: TurnStart | null = resume ? resumedStart(resume.history) : null;
    // The column is written at a rest or a settle, and a crash writes neither, so the record's own calls count too (found
    // by phase 4's review: a child that worked before a crash counted none).
    const priorCalls = resume ? Math.max(row.tool_calls, callsRun(resume.history)) : 0;
    // REQ-MONITOR-102: calls the record shows that no count held join the session's total now, once (phase 4's review).
    if (priorCalls > row.tool_calls) deps.countToolCalls?.(priorCalls - row.tool_calls);
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
        ...(deps.steeringFor ? { steering: deps.steeringFor(row.task_id) } : {}),
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
      }, task, history, controller.signal); };
      // A resumed child's first attempt carries on from its record; REQ-ORCH-088's retry starts again from its payload.
      const fromRecord = start !== null;
      try {
        outcome = await this.runWithChildren(row.task_id, turn, start ?? { kind: 'fresh', task: payload() }, controller.signal);
        start = null;
        /*
         * REQ-NOTIFY-111/112: a child whose turn failed after it produced no output for the whole stall window does not end
         * as a failure: it is given one corrective message and resumes from where it stopped, its conversation carrying on
         * with the message (OQ-126). Once per child task; never on an answer-only route, after its own limit, a cancel, the
         * rest, loop supervision's escalation, or an error no instruction can address.
         */
        const failedStep = outcome.report.status === 'failed' ? outcome.report.error : null;
        if (stallRecoveryDue({ status: outcome.report.status, error: failedStep, escalated: outcome.escalation !== undefined, aborted: controller.signal.aborted, timedOut, resting: this.resting, paused: outcome.paused === true, answerRoute: deps.route === 'answer', corrected, quietMs: stallWatch.quietFor(), thresholdMs: stallMs, activeCalls: stallWatch.activeCalls })) {
          corrected = true;
          const quietS = Math.floor(stallWatch.quietFor() / 1000);
          const instruction = correctiveInstruction({ quietS, windowS: stallMs / 1000, failure: failedStep?.headline ?? 'no reason was given' });
          // The message itself is in the child's conversation record (REQ-ORCH-140); the session log says it was sent (OQ-126).
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
        deps.writer.appendTimeline('child_timeout_fallback', 'rotaris', message, { task_id: row.task_id, from_provider: providerIdentity(resilience.catalogue, from.model), from_model: from.model.modelId, to_provider: providerIdentity(resilience.catalogue, cell.model.model), to_model: cell.model.model.modelId, timeout_seconds: seconds });
        deps.writer.recordIssue({ kind: 'child_timeout_fallback', severity: 'warning', actor: row.canonical_name, message, metadata: { task_id: row.task_id, requested_model: `${providerIdentity(resilience.catalogue, from.model)}/${from.model.modelId}`, fallback_model: `${providerIdentity(resilience.catalogue, cell.model.model)}/${cell.model.model.modelId}`, timeout_seconds: seconds } });
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
    deps.countToolCalls?.(outcome?.toolCallCount ?? 0);
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
    const reportInput: ReportInput = { agentName: row.canonical_name, role: row.persona, status, messages, toolCallCount: toolCalls, toolsUsed: [...new Set(messages.flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-call' ? [p.name] : []))))], lastText, finalTextIsFinal: finalIsFinal, errors };
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

/** PD-TOOLS-006 revision 2: the write scope a child's record stores, as the patterns it declared; none when unreadable. */
function storedScope(row: ChildRow): string[] {
  try { const v = JSON.parse(row.write_scope) as unknown; return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : []; } catch { return []; }
}

/**
 * REQ-ORCH-053: on a later run of the same session, settle every non-terminal child of any previous iteration before the
 * first iteration. Its report is materialised as every other terminal child's is (REQ-LIBRARY-092), given the session's
 * artifact store.
 */
export function settleStaleChildren(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, warn: (m: string) => void, artifacts?: ArtifactStore): number {
  let n = 0;
  for (const c of dal.childrenOf(sessionId)) {
    // PD-ORCH-005 (narrowing REQ-ORCH-053 / REQ-SESSION-065 / REQ-NOTIFY-121): a `paused` agent is left as it is; it is
    // resumed with its iteration, or ended by the user continuing without it.
    if (isTerminalChildState(c.state) || c.state === 'paused') continue;
    const r = writer.transitionChild(c.task_id, 'cancelled', 'cancellation');
    if (r.ok) { n += 1; storeChildReport({ writer, artifacts, warn }, c.task_id, c, { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: 'Cancelled: the run that owned this child ended (killed host or hard cancel) before it settled.', key_findings: [], last_response: '', final_response: '', errors: [{ type: 'cancelled', message: 'settled on continue (REQ-ORCH-053)' }] }); }
    else warn(r.error.code === 'illegal-move' ? r.error.reason : r.error.code);
  }
  return n;
}
