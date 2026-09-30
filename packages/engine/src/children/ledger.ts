import type { SessionId } from '@rotaris/kernel';
import { isTerminalChildState, type ChildState, type Interruption, type ResumeState, type RootExecutionRecord, type SettlingPath } from '@rotaris/contracts';
import type { ChildInsert, ChildRow, StoreDal } from '@rotaris/store';
import type { SessionWriter } from '../session-writer.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { canonicaliseName, mintTaskId, takenTaskIds, uniqueUnderParent } from './naming.js';
import { EMPTY_MCP_EVIDENCE, knownRolesMessage, resolveRole, type Persona, type PersonaResolver } from './personas.js';
import type { RanCommand } from '../artifacts/record.js';

/**
 * PD-LIBRARY-001: the report's `commands` as the artifact record wants them. The report carries `exit_code`
 * — REQ-ORCH-108's schema, snake-cased like every other field a report holds — and the record carries
 * `exitCode`, so one hop converts. It is exported because these two shapes meeting is exactly the join a
 * test has to be able to make without a scheduler and a store standing around it.
 *
 * The shape is RE-READ rather than trusted: `storeReport` takes a `Record<string, unknown>`, which is the
 * boundary a model's own output reaches. A command with no text is dropped rather than rendered as an empty
 * span, and a non-numeric exit code reads as "not recorded" rather than as the zero that means success.
 */
export function commandsForArtifact(v: unknown): RanCommand[] {
  return (Array.isArray(v) ? v : []).flatMap((x): RanCommand[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    if (typeof o['command'] !== 'string' || o['command'] === '') return [];
    return [{ command: o['command'], exitCode: typeof o['exit_code'] === 'number' ? o['exit_code'] : null }];
  });
}

/**
 * REQ-ORCH-133 / REQ-MONITOR-128: what the user's cancel of one child writes for each agent it ends — the report and the
 * timeline entry — shared by the live cancel (`IterationChildren.cancel`) and PD-ORCH-005 clause 16's cancel while the
 * session rests (`Sessions`, OQ-101), so the two cannot drift. `whileResting` adds that clause's words to the entry.
 */
export function userCancellation(t: Pick<ChildRow, 'task_id' | 'canonical_name' | 'persona'>, chosen: Pick<ChildRow, 'task_id' | 'canonical_name'>, whileResting = false): { readonly report: Record<string, unknown>; readonly message: string; readonly metadata: Record<string, unknown> } {
  const own = t.task_id === chosen.task_id;
  return {
    report: { agent_name: t.canonical_name, role: t.persona, status: 'cancelled', summary: own ? 'The user cancelled this child.' : `Cancelled with ${chosen.canonical_name}, which the user cancelled.`, key_findings: [], last_response: '', final_response: '', errors: [] },
    message: `The user cancelled child ${t.canonical_name} (${t.task_id})${own ? '' : ` with ${chosen.canonical_name}`}${whileResting ? ' while the session rested' : ''}.`,
    metadata: { task_id: t.task_id, ...(own ? {} : { cancelled_with: chosen.task_id }) },
  };
}

/**
 * REQ-LIBRARY-092: EVERY terminal child report is materialised as an artifact. The materialisation lives beside the one
 * write every stored report passes through — the ledger's own reports, the scheduler's cancellation and its blocking
 * cascade (REQ-ORCH-048), the user's cancel, the settle of a child a previous run left (REQ-ORCH-053) and the decline of a
 * resumable iteration (PD-ORCH-005 clause 6) — so no caller can store a report without one, exactly as the
 * adjacent-duplicate rule lives beside its insert rather than in a caller. The cascade stored no report at all until
 * 2026-09-29 (`docs/defects/fixed/a-child-blocked-by-its-dependency-gets-no-report.md`). The last two wrote the report alone until 2026-09-27
 * (`docs/defects/fixed/a-stale-settled-childs-report-is-never-an-artifact.md`). The row names the artifact; without
 * one, the report is stored and no artifact is made.
 */
export function storeChildReport(deps: { readonly writer: SessionWriter; readonly artifacts?: ArtifactStore | undefined; readonly warn: (m: string) => void }, taskId: string, row: ChildRow | undefined, report: Record<string, unknown>): void {
  const r = deps.writer.storeChildReport(taskId, report);
  if (!r.ok) deps.warn(`the report for child ${taskId} could not be stored: ${r.error.code}`);
  const artifacts = deps.artifacts;
  if (!artifacts || !row) return;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  const m = artifacts.materialiseChildReport({
    taskId, canonicalName: row.canonical_name, persona: row.persona,
    status: text(report['status']) || row.state, summary: text(report['summary']),
    keyFindings: list(report['key_findings']), editedFiles: list(report['edited_files']), createdFiles: list(report['created_files']),
    commands: commandsForArtifact(report['commands']),
    highlightPaths: [], snippets: [], tags: list(report['tags']), conversationId: taskId,
  });
  if (!m.ok) deps.warn(`the report for child ${taskId} could not be materialised as an artifact: ${m.error.reason}`);
}

/**
 * REQ-CONFIG-094 / REQ-MONITOR-020 / REQ-ORCH-050: whether a child holds a place on its `models:` entry's cap — from the
 * start claim (`starting`) until its terminal state, through `running` and `summarizing`. PD-ORCH-005 clause 4: "each
 * agent keeps the place in every child limit it already held", so a child `paused` out of `running` or `summarizing` (its
 * `resume_state`) keeps its place while its session rests, and resumes into it; one paused while it waited, or before its
 * start was claimed, held none and holds none (OQ-149).
 */
export function holdsModelSlot(c: Pick<ChildRow, 'state' | 'resume_state'>): boolean {
  if (c.state === 'starting' || c.state === 'running' || c.state === 'summarizing') return true;
  return c.state === 'paused' && (c.resume_state === 'running' || c.resume_state === 'summarizing');
}

/**
 * ADR-0012: the ledger is the primary representation — one row per child, written through the session
 * writer, every state change one transaction with its event, every query carrying the session id
 * (REQ-ORCH-151). This class is the engine's view of it: admission (REQ-ORCH-046's five checks in order,
 * REQ-ORCH-038's rejections, REQ-ORCH-034's aliases, REQ-TOOLS-152's inherited-context rule, REQ-ORCH-044/045's naming), the transition function
 * (the writer's, the sole implementation of REQ-MONITOR-300), the start claim, the report.
 */
export interface Budget {
  /** REQ-ORCH-046 defaults 3 / 20 / 6; REQ-ORCH-024's BUDGET cell only narrows. */
  readonly maxDepth: number;
  readonly maxTotal: number;
  readonly maxActive: number;
}
export const DEFAULT_BUDGET: Budget = { maxDepth: 3, maxTotal: 20, maxActive: 6 };
/** REQ-ORCH-024: the `normal` cell, a fixed clamp until playbooks are built (decision in codebase.md). */
export const NORMAL_CELL: Budget = { maxDepth: 3, maxTotal: 12, maxActive: 4 };
export function clampBudget(configured: Budget, cell: Budget | null): Budget {
  if (!cell) return configured;
  return { maxDepth: Math.min(configured.maxDepth, cell.maxDepth), maxTotal: Math.min(configured.maxTotal, cell.maxTotal), maxActive: Math.min(configured.maxActive, cell.maxActive) };
}

export interface SpawnInput {
  readonly parentId: string;
  readonly parentDepth: number;
  readonly persona: string;
  readonly taskName: string;
  readonly task: string;
  readonly dependsOn: readonly string[];
  readonly inheritedContext: readonly string[];
  readonly category: string;
  readonly background: boolean;
  readonly modelKey: string;
  readonly grantedTools: readonly string[];
  /** PD-ORCH-004: the child this one continues, admitted by the caller before the spawn; absent for ordinary work. */
  readonly continuationOf?: string | undefined;
  /** PD-TOOLS-006 revision 2: the validated patterns the child declared, stored with its record; absent means none. */
  readonly writeScope?: readonly string[] | undefined;
  /** REQ-TOOLS-152: the call's `suppress_auto_context`, stored with its record; absent means the index is given. */
  readonly suppressAutoContext?: boolean | undefined;
}

export type SpawnRejection = { readonly reason: string };

export interface Spawned {
  readonly row: ChildRow;
  readonly persona: Persona;
  readonly aliasResolved: string | null;
  /** REQ-ORCH-050: held behind the per-model cap at creation. */
  readonly held: boolean;
  /**
   * REQ-TOOLS-152: the siblings named in `inherited_context` that had completed with their report stored when the
   * call was made, in the caller's order and once each; the ids naming a failed or unfinished sibling are not here.
   */
  readonly inherited: readonly ChildRow[];
}

export class ChildLedger {
  readonly root: RootExecutionRecord;

  constructor(private readonly deps: {
    readonly dal: StoreDal;
    readonly writer: SessionWriter;
    readonly sessionId: SessionId;
    readonly iteration: number;
    readonly budget: Budget;
    readonly modelCap: (modelKey: string) => number | null;
    /**
     * REQ-CONFIG-094: the slots on a key the process's OTHER runs hold (`ModelSlots.heldElsewhere`) — the cap counts every
     * child on the entry across the whole process, and this ledger sees one iteration of one session. Absent means none.
     */
    readonly slotsHeldElsewhere?: ((modelKey: string) => number) | undefined;
    readonly warn: (m: string) => void;
    readonly personas?: PersonaResolver | undefined;
    readonly artifacts?: ArtifactStore | undefined;
    readonly rootRecord?: RootExecutionRecord | undefined;
  }) {
    if (deps.rootRecord) {
      this.root = deps.rootRecord;
    } else {
      const taskId = mintTaskId(takenTaskIds(deps.dal, deps.sessionId));
      this.root = {
        taskId,
        canonicalName: 'orchestrator',
        persona: 'orchestrator',
        task: '',
        iteration: deps.iteration,
        depth: 0,
        state: 'running',
      };
    }
  }

  isRoot(idOrName: string): boolean {
    return (
      idOrName === this.root.taskId ||
      idOrName === this.root.canonicalName ||
      idOrName === 'root' ||
      idOrName === `root:${this.root.iteration}`
    );
  }

  get sessionId(): SessionId {
    return this.deps.sessionId;
  }
  get iteration(): number {
    return this.deps.iteration;
  }
  get budget(): Budget {
    return this.deps.budget;
  }
  enqueueSlot(modelKey: string, taskId: string): void {
    this.deps.dal.enqueueSlot(this.deps.sessionId, modelKey, taskId);
  }
  /**
   * REQ-ORCH-065/072: one ledger per iteration — every child this iteration created, which is every child descending from
   * this iteration's ROOT. The iteration number alone is not that set: every plan cycle is numbered 0, and a run host
   * that died mid-iteration left its children under a number the next run reused
   * (`a-crashed-iteration-number-is-reused-by-the-next-run.md`), so a ledger scoped by number read another root's
   * children into its limits, its dependencies and its credited child. The tree is walked from the root, since children
   * spawned in one instant are ordered by task id and a child can be read before its parent; the result keeps the
   * store's spawn order.
   */
  all(): ChildRow[] {
    return treeOf(this.deps.dal.childrenOfIteration(this.deps.sessionId, this.deps.iteration), (id) => this.isRoot(id));
  }
  get(taskId: string): ChildRow | undefined {
    return this.deps.dal.getChild(this.deps.sessionId, taskId);
  }
  childrenOf(parentId: string): ChildRow[] {
    if (this.isRoot(parentId)) {
      return this.all().filter((c) => this.isRoot(c.parent_id));
    }
    return this.all().filter((c) => c.parent_id === parentId);
  }
  activeCount(): number {
    return this.all().filter((c) => c.state === 'starting' || c.state === 'running').length;
  }
  /**
   * REQ-ORCH-050 governs at scheduling time — `starting` or `running` may not exceed the cap — while
   * REQ-MONITOR-020 describes the release (a slot frees when a running or summarizing child ends). Read
   * together: a slot is held from the claim until the terminal state, so the cap is never exceeded by two
   * children claimed in one pass (recorded on ADR-0012).
   *
   * REQ-CONFIG-094: the count is the whole process's — this iteration's children and every other run's
   * (`slotsHeldElsewhere`), so two sessions under way in one run host cannot each fill a cap (acceptance A13).
   */
  slotsInUse(modelKey: string): number {
    return this.slotsInUseHere(modelKey) + (this.deps.slotsHeldElsewhere?.(modelKey) ?? 0);
  }
  /** This iteration's children holding a slot on the key (`holdsModelSlot`). */
  slotsInUseHere(modelKey: string): number {
    return this.all().filter((c) => c.model_key === modelKey && holdsModelSlot(c)).length;
  }
  slotFree(modelKey: string): boolean {
    const cap = this.deps.modelCap(modelKey);
    return cap === null || this.slotsInUse(modelKey) < cap;
  }

  /**
   * REQ-ORCH-046: the five checks IN ORDER, the first failure rejecting with no record and no id;
   * REQ-ORCH-034 aliases; REQ-ORCH-044/045 naming; the initial state per REQ-ORCH-040 and REQ-ORCH-050.
   */
  spawn(input: SpawnInput): { ok: true; value: Spawned } | { ok: false; error: SpawnRejection } {
    const role = this.deps.personas ? this.deps.personas.resolve(input.persona) : resolveRole(input.persona);
    if (!role) return { ok: false, error: { reason: `Unknown persona '${input.persona}'. ${this.deps.personas ? `Known personas: ${this.deps.personas.knownRoles().join(', ')}.` : knownRolesMessage()}` } };
    const all = this.all();
    const b = this.deps.budget;
    const depth = input.parentDepth + 1;
    if (depth > b.maxDepth) return { ok: false, error: { reason: `Max depth ${b.maxDepth} exceeded` } };
    if (all.length >= b.maxTotal) return { ok: false, error: { reason: `Max total children ${b.maxTotal} exceeded` } };
    if (this.activeCount() >= b.maxActive) return { ok: false, error: { reason: `Max active children ${b.maxActive} exceeded` } };
    for (const dep of input.dependsOn) {
      const d = all.find((c) => c.task_id === dep);
      if (!d) return { ok: false, error: { reason: `Unknown dependency '${dep}'` } };
      const matchParent = d.parent_id === input.parentId || (this.isRoot(input.parentId) && this.isRoot(d.parent_id));
      if (!matchParent) return { ok: false, error: { reason: `Dependency '${dep}' is owned by parent '${d.parent_id}', not '${input.parentId}'` } };
    }
    // (5) the new edges close no cycle: a dependency that (transitively) depends on a child of this parent named here.
    const edges = new Map(all.map((c) => [c.task_id, JSON.parse(c.depends_on) as string[]]));
    const seen = new Set<string>();
    const reaches = (from: string, target: string): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (edges.get(from) ?? []).some((d) => reaches(d, target));
    };
    /*
     * REQ-TOOLS-152: "an id in `inherited_context` that names no task at all refuses the call, an id … naming a task
     * that failed or has not finished is ignored without refusing". Existence is asked of the whole session and the
     * root execution record, which shares the children's id namespace (REQ-ORCH-072: a lookup naming the root resolves
     * to it rather than reporting it unknown), so only an id no task has is refused as referring to nothing. A task that
     * exists and has not completed — the root, the caller's own task, a sibling or any other task that failed, was
     * cancelled or is still under way — is ignored. "Completed" is REQ-ORCH-047's notion: `succeeded` with the report
     * stored, since it is the report that is carried. A completed task that is not the caller's own child (another
     * parent's, or an earlier iteration's) is not a sibling; it is refused, for ownership and never as nonexistent, as
     * the `depends_on` check above refuses one — that reading is OQ-81. This runs after the dependency checks and before
     * the cycle check (5). A refusal creates no record and issues no id (REQ-TOOLS-153).
     */
    const siblings = this.childrenOf(input.parentId);
    const inherited: ChildRow[] = [];
    for (const inh of input.inheritedContext) {
      if (inh.trim() === '') return { ok: false, error: { reason: 'A malformed inherited-context entry (empty) was rejected' } };
      if (this.isRoot(inh)) continue;
      const named = this.get(inh);
      if (!named) return { ok: false, error: { reason: `inherited_context id '${inh}' refers to nothing: no task has that id` } };
      if (named.state !== 'succeeded' || named.report_stored !== 1) continue;
      if (!siblings.some((c) => c.task_id === inh)) {
        const caller = this.isRoot(input.parentId) ? this.root.taskId : input.parentId;
        return { ok: false, error: { reason: `inherited_context id '${inh}' is not a sibling's: it is owned by parent '${named.parent_id}', not '${caller}'` } };
      }
      if (!inherited.some((c) => c.task_id === inh)) inherited.push(named);
    }
    // REQ-ORCH-036: unique within the SESSION — every child's and every recorded root's id (PD-ORCH-005), not this iteration's.
    const taken = takenTaskIds(this.deps.dal, this.deps.sessionId);
    taken.add(this.root.taskId);
    const taskId = mintTaskId(taken);
    for (const dep of input.dependsOn) if (reaches(dep, taskId)) return { ok: false, error: { reason: 'Dependency cycle detected' } };
    const siblingNames = new Set(siblings.map((c) => c.canonical_name));
    if (this.isRoot(input.parentId)) {
      siblingNames.add(this.root.canonicalName);
    }
    const canonical = uniqueUnderParent(canonicaliseName(input.taskName), siblingNames);
    const held = input.dependsOn.length === 0 && !this.slotFree(input.modelKey);
    const state: ChildState = input.dependsOn.length > 0 ? 'waiting_on_dependencies' : held ? 'waiting_on_model_slot' : 'queued';
    const effectiveParentId = this.isRoot(input.parentId) ? this.root.taskId : input.parentId;
    const row: Omit<ChildInsert, 'session_id' | 'spawned_at'> = {
      task_id: taskId, canonical_name: canonical, given_name: input.taskName, persona: role.persona.name, state, parent_id: effectiveParentId, depth,
      iteration: this.deps.iteration, model_key: input.modelKey, category: input.category, background: input.background ? 1 : 0, task: input.task,
      depends_on: JSON.stringify(input.dependsOn), inherited_context: JSON.stringify(input.inheritedContext), granted_tools: JSON.stringify(input.grantedTools),
      // REQ-MCP-065 / REQ-MCP-114 (Part S): the grant evidence at spawn — `{ granted: {server: [tool…]}, servers: [{name, transport, origin, fate, reason?}] }` — from the persona's resolver; `{}` was written until then.
      granted_mcp: JSON.stringify(role.persona.mcpEvidence?.() ?? EMPTY_MCP_EVIDENCE),
      // PD-ORCH-004: "A child delegated as a continuation carries that relationship in its record."
      continuation_of: input.continuationOf ?? null,
      // PD-TOOLS-006 revision 2: "the `write_scope` a child declared is stored with its record".
      write_scope: JSON.stringify(input.writeScope ?? []),
      // REQ-TOOLS-152: the call's `suppress_auto_context`, so every assembly of the payload — a retry's included — omits the index.
      suppress_auto_context: input.suppressAutoContext === true ? 1 : 0,
    };
    const r = this.deps.writer.spawnChild(row);
    if (!r.ok) return { ok: false, error: { reason: `The child could not be recorded: ${r.error.code}` } };
    if (held) this.deps.dal.enqueueSlot(this.deps.sessionId, input.modelKey, taskId);
    return { ok: true, value: { row: r.value, persona: role.persona, aliasResolved: role.alias, held, inherited } };
  }

  /** The one transition function; a refusal names both states and leaves the record untouched. */
  transition(taskId: string, to: ChildState, via: SettlingPath | null = null): { ok: true; row: ChildRow } | { ok: false; reason: string } {
    const r = this.deps.writer.transitionChild(taskId, to, via);
    if (r.ok) return { ok: true, row: r.value };
    return { ok: false, reason: r.error.code === 'illegal-move' ? r.error.reason : `recording failed: ${r.error.code}` };
  }
  /**
   * PD-ORCH-005 clauses 2 and 3: the child comes to rest in `paused`, recording what interrupted it, the state it resumes
   * into and its tool-call count so far — the writer's one transaction. A refusal names both states and changes nothing.
   */
  rest(taskId: string, interruption: Interruption, resumeState: ResumeState, toolCalls: number | null = null): { ok: true; row: ChildRow } | { ok: false; reason: string } {
    const r = this.deps.writer.restChild(taskId, interruption, resumeState, toolCalls);
    if (r.ok) return { ok: true, row: r.value };
    return { ok: false, reason: r.error.code === 'illegal-move' ? r.error.reason : `recording failed: ${r.error.code}` };
  }
  /** PD-ORCH-005 clause 4: a `paused` child moves back to the state it resumes into — the writer's one transaction. */
  resume(taskId: string, into?: 'running'): { ok: true; row: ChildRow } | { ok: false; reason: string } {
    const r = this.deps.writer.resumeChild(taskId, into);
    if (r.ok) return { ok: true, row: r.value };
    return { ok: false, reason: r.error.code === 'illegal-move' ? r.error.reason : `recording failed: ${r.error.code}` };
  }
  /**
   * PD-ORCH-005 clause 22: a settled child followed up moves back to `queued` with `messages` joining its record — the
   * writer's one transaction. A refusal names both states and changes nothing.
   */
  followUp(taskId: string, messages: readonly unknown[]): { ok: true; row: ChildRow } | { ok: false; reason: string } {
    const row = this.get(taskId);
    const r = this.deps.writer.followUpChild(taskId, row?.iteration ?? this.deps.iteration, messages);
    if (r.ok) return { ok: true, row: r.value };
    return { ok: false, reason: r.error.code === 'illegal-move' ? r.error.reason : `recording failed: ${r.error.code}` };
  }
  claimStart(taskId: string): boolean {
    const row = this.get(taskId);
    const r = this.deps.writer.claimChildStart(taskId, row?.canonical_name ?? taskId);
    return r.ok && r.value;
  }
  /** REQ-LIBRARY-092: every report the ledger stores goes through `storeChildReport`, which materialises its artifact. */
  storeReport(taskId: string, report: Record<string, unknown>): void {
    storeChildReport(this.deps, taskId, this.get(taskId), report);
  }
  markObserved(taskId: string): void {
    this.deps.dal.setChildObserved(this.deps.sessionId, taskId);
  }
  markContextInjected(taskId: string): void {
    this.deps.dal.setChildContextInjected(this.deps.sessionId, taskId);
  }
  /** REQ-ORCH-054: terminal children the parent has not yet observed, marked observed. */
  takeNewlyTerminal(parentId: string): ChildRow[] {
    const out = this.childrenOf(parentId).filter((c) => isTerminalChildState(c.state) && c.observed === 0);
    for (const c of out) this.markObserved(c.task_id);
    return out;
  }
  dequeueSlot(modelKey: string, taskId: string): void {
    this.deps.dal.dequeueSlot(this.deps.sessionId, modelKey, taskId);
  }
  slotQueue(modelKey: string): string[] {
    return this.deps.dal.slotQueueOf(this.deps.sessionId, modelKey);
  }
}

/**
 * The children of `rows` that descend from a root `isRoot` recognises, in the order `rows` holds them. The tree is
 * walked to a fixpoint, since children spawned in one instant are ordered by task id and a child can be read before
 * its parent. The live ledger reads its iteration through it, and so does a stored iteration's crash record and its
 * decline (PD-ORCH-005), which have no ledger.
 */
export function treeOf(rows: readonly ChildRow[], isRoot: (id: string) => boolean): ChildRow[] {
  const tree = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of rows) {
      if (tree.has(c.task_id) || !(isRoot(c.parent_id) || tree.has(c.parent_id))) continue;
      tree.add(c.task_id);
      grew = true;
    }
  }
  return rows.filter((c) => tree.has(c.task_id));
}
