import type { SessionId } from '@rotaris/kernel';
import { isTerminalChildState, type ChildState, type RootExecutionRecord, type SettlingPath } from '@rotaris/contracts';
import type { ChildInsert, ChildRow, StoreDal } from '@rotaris/store';
import type { SessionWriter } from '../session-writer.js';
import type { ArtifactStore } from '../artifacts/store.js';
import { canonicaliseName, mintTaskId, uniqueUnderParent } from './naming.js';
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
    readonly warn: (m: string) => void;
    readonly personas?: PersonaResolver | undefined;
    readonly artifacts?: ArtifactStore | undefined;
    readonly rootRecord?: RootExecutionRecord | undefined;
  }) {
    if (deps.rootRecord) {
      this.root = deps.rootRecord;
    } else {
      const taken = new Set(deps.dal.childrenOf(deps.sessionId).map((c) => c.task_id));
      const taskId = mintTaskId(taken);
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
  /** REQ-ORCH-065/072: one ledger per iteration — every child this iteration created. */
  all(): ChildRow[] {
    return this.deps.dal.childrenOfIteration(this.deps.sessionId, this.deps.iteration);
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
   */
  slotsInUse(modelKey: string): number {
    return this.all().filter((c) => c.model_key === modelKey && (c.state === 'starting' || c.state === 'running' || c.state === 'summarizing')).length;
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
     * the `depends_on` check above refuses one — that reading is OQ-76. This runs after the dependency checks and before
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
    const taken = new Set(all.map((c) => c.task_id));
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
  claimStart(taskId: string): boolean {
    const row = this.get(taskId);
    const r = this.deps.writer.claimChildStart(taskId, row?.canonical_name ?? taskId);
    return r.ok && r.value;
  }
  /**
   * REQ-LIBRARY-092: EVERY terminal child report is materialised as an artifact. The materialisation lives
   * here, beside the one write every report passes through — the ordinary path, the scheduler's cancellation
   * and the user's cancel all call this — so no third caller can store a report without one, exactly as the
   * adjacent-duplicate rule lives beside its insert rather than in a caller.
   */
  storeReport(taskId: string, report: Record<string, unknown>): void {
    const r = this.deps.writer.storeChildReport(taskId, report);
    if (!r.ok) this.deps.warn(`the report for child ${taskId} could not be stored: ${r.error.code}`);
    const artifacts = this.deps.artifacts;
    if (!artifacts) return;
    const row = this.get(taskId);
    if (!row) return;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    const m = artifacts.materialiseChildReport({
      taskId, canonicalName: row.canonical_name, persona: row.persona,
      status: text(report['status']) || row.state, summary: text(report['summary']),
      keyFindings: list(report['key_findings']), editedFiles: list(report['edited_files']), createdFiles: list(report['created_files']),
      commands: commandsForArtifact(report['commands']),
      highlightPaths: [], snippets: [], tags: list(report['tags']), conversationId: taskId,
    });
    if (!m.ok) this.deps.warn(`the report for child ${taskId} could not be materialised as an artifact: ${m.error.reason}`);
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
