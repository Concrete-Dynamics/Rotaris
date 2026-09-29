import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, millis, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type ChildRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { CHILD_STATES, CHILD_TRANSITIONS, isLegalChildMove, RUN_AGENT_ID, TASK_ID_PATTERN, TERMINAL_CHILD_STATES, type PermissionPreset, type SessionRecord } from '@rotaris/contracts';
import { canonicaliseName, ChildLedger, RUN_CONFIG_DEFAULTS, Scheduler, Sessions, SessionWriter, uniqueUnderParent, type DelegationOps, type PortToolResult, type Publisher, type RunConfig, type ToolPort, type ToolPortContext } from '../index.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { HookPort } from '../hooks-port.js';
import { conversationOf } from '../run/record.js';
import { interruptedResult } from '../run/interruption.js';
import { decodeStoredTodo } from '../todo-view.js';
import { resumableOf } from '../sessions.js';
import { userCancellation } from './ledger.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

describe('naming (REQ-ORCH-044/045)', () => {
  it('canonicalises, shortens to 80 with an 8-hex suffix, and disambiguates per parent', () => {
    expect(canonicaliseName('  Fix the  bug!  ')).toBe('Fix-the-bug');
    expect(canonicaliseName('---')).toBe('task');
    const long = 'x'.repeat(100);
    const c = canonicaliseName(long);
    expect(c).toHaveLength(80);
    expect(c).toMatch(/^x{71}-[0-9a-f]{8}$/);
    expect(canonicaliseName(long)).toBe(c);
    expect(canonicaliseName(`${long}y`)).not.toBe(c);
    expect(uniqueUnderParent('a', new Set(['a', 'a_1']))).toBe('a_2');
  });
});

describe('the transition table (REQ-MONITOR-300)', () => {
  it('admits exactly the listed moves, the two settling paths, and nothing out of a terminal state', () => {
    for (const from of CHILD_STATES) for (const to of CHILD_STATES) {
      expect(isLegalChildMove(from, to)).toBe(CHILD_TRANSITIONS[from].includes(to));
      expect(isLegalChildMove(from, to, 'cancellation')).toBe(!TERMINAL_CHILD_STATES.has(from) && to === 'cancelled');
      expect(isLegalChildMove(from, to, 'reconciliation')).toBe(!TERMINAL_CHILD_STATES.has(from) && TERMINAL_CHILD_STATES.has(to));
    }
    // PD-ORCH-005 (narrowing REQ-MONITOR-300): every non-terminal state may come to rest in `paused`.
    expect(CHILD_TRANSITIONS.queued).toEqual(['starting', 'waiting_on_model_slot', 'blocked', 'paused']);
    expect(CHILD_TRANSITIONS.running).toEqual(['summarizing', 'succeeded', 'failed', 'paused']);
  });
});

describe('the ledger and the scheduler against a real store (ADR-0012)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let writer: SessionWriter;
  const sid = 'S-ledger' as SessionId;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-children-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
    const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: (m) => warnings.push(m), onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    writer = w.value;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const ledger = (cap: number | null = null, budget = { maxDepth: 3, maxTotal: 20, maxActive: 6 }) => new ChildLedger({ dal, writer, sessionId: sid, iteration: 1, budget, modelCap: () => cap, warn: (m) => warnings.push(m) });
  const spawn = (l: ChildLedger, name: string, over: Partial<Parameters<ChildLedger['spawn']>[0]> = {}) => l.spawn({ parentId: 'root', parentDepth: 0, persona: 'coding-agent', taskName: name, task: `do ${name}`, dependsOn: [], inheritedContext: [], category: '', background: true, modelKey: 'm', grantedTools: [], ...over });

  it('REQ-ORCH-046: the five checks in order reject with no record; aliases resolve; names are unique per parent', () => {
    const l = ledger(null, { maxDepth: 1, maxTotal: 2, maxActive: 1 });
    expect(spawn(l, 'x', { persona: 'nobody' })).toMatchObject({ ok: false, error: { reason: expect.stringMatching(/^Unknown persona 'nobody'\. Known personas: orchestrator, .*coder->coding-agent/) } });
    expect(spawn(l, 'x', { parentDepth: 1 })).toMatchObject({ ok: false, error: { reason: 'Max depth 1 exceeded' } });
    const a = spawn(l, 'build it', { persona: 'coder' });
    expect(a.ok && a.value.aliasResolved).toBe('coder');
    expect(a.ok && a.value.row).toMatchObject({ persona: 'coding-agent', canonical_name: 'build-it', state: 'queued' });
    const a2 = spawn(l, 'build it');
    expect(a2.ok && a2.value.row.canonical_name).toBe('build-it_1');
    expect(spawn(l, 'third')).toMatchObject({ ok: false, error: { reason: 'Max total children 2 exceeded' } });
    expect(dal.childrenOf(sid)).toHaveLength(2);
    // the total check (2) precedes the dependency check (4): a wider budget reaches it
    const wide = ledger(null, { maxDepth: 3, maxTotal: 20, maxActive: 6 });
    expect(spawn(wide, 'dep', { dependsOn: ['bg_00000000'] })).toMatchObject({ ok: false, error: { reason: "Unknown dependency 'bg_00000000'" } });
    // A dependency owned by another parent of the same iteration — a child's child — is refused naming that parent.
    const someone = spawn(wide, 'someone');
    const someoneId = someone.ok ? someone.value.row.task_id : '';
    const other = spawn(wide, 'other', { parentId: someoneId, parentDepth: 1 });
    const otherId = other.ok ? other.value.row.task_id : '';
    expect(spawn(wide, 'dep2', { dependsOn: [otherId] })).toMatchObject({ ok: false, error: { reason: expect.stringMatching(new RegExp(`is owned by parent '${someoneId}', not 'root'`)) } });
    expect(dal.eventsOfKind(sid, 'child.spawn')).toHaveLength(4);
  });

  it('REQ-TOOLS-152: an inherited-context id naming no task at all refuses the call with no record; one naming a failed or unfinished task is ignored; a completed sibling with its report is carried once', () => {
    const l = ledger();
    const done = spawn(l, 'done'); const idDone = done.ok ? done.value.row.task_id : '';
    const failed = spawn(l, 'failed'); const idFailed = failed.ok ? failed.value.row.task_id : '';
    const queued = spawn(l, 'queued'); const idQueued = queued.ok ? queued.value.row.task_id : '';
    const noReport = spawn(l, 'no-report'); const idNoReport = noReport.ok ? noReport.value.row.task_id : '';
    for (const id of [idDone, idFailed, idNoReport]) { l.claimStart(id); l.transition(id, 'running'); }
    l.transition(idDone, 'succeeded'); l.storeReport(idDone, { status: 'succeeded', summary: 's', final_response: 'The module is small.' });
    l.transition(idFailed, 'failed'); l.storeReport(idFailed, { status: 'failed', summary: 'f' });
    l.transition(idNoReport, 'succeeded');
    const other = spawn(l, 'other', { parentId: 'someone-else' }); const idOther = other.ok ? other.value.row.task_id : '';
    const otherDone = spawn(l, 'other-done', { parentId: 'someone-else' }); const idOtherDone = otherDone.ok ? otherDone.value.row.task_id : '';
    l.claimStart(idOtherDone); l.transition(idOtherDone, 'running'); l.transition(idOtherDone, 'succeeded'); l.storeReport(idOtherDone, { status: 'succeeded', summary: 'o' });
    const before = dal.childrenOf(sid).length;
    // "an id … that names no task at all refuses the call": no record, no id, the reason names the id.
    expect(spawn(l, 'x', { inheritedContext: [idDone, 'bg_00000000'] })).toMatchObject({ ok: false, error: { reason: "inherited_context id 'bg_00000000' refers to nothing: no task has that id" } });
    // Another parent's COMPLETED task exists and is not a sibling: refused for ownership, never as nonexistent (OQ-81).
    expect(spawn(l, 'x', { inheritedContext: [idOtherDone] })).toMatchObject({ ok: false, error: { reason: `inherited_context id '${idOtherDone}' is not a sibling's: it is owned by parent 'someone-else', not '${l.root.taskId}'` } });
    expect(spawn(l, 'x', { inheritedContext: [' '] })).toMatchObject({ ok: false, error: { reason: 'A malformed inherited-context entry (empty) was rejected' } });
    expect(dal.childrenOf(sid)).toHaveLength(before);
    // "an id … naming a task that failed or has not finished is ignored without refusing"; a report is what is carried, so succeeded-without-report is not yet complete either.
    // The root execution record is a task in the same namespace that has not finished (REQ-ORCH-072), and so is another parent's unfinished task.
    const r = spawn(l, 'reader', { inheritedContext: [idFailed, idDone, idQueued, idNoReport, l.root.taskId, idOther, idDone] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.inherited.map((c) => c.task_id)).toEqual([idDone]);
    expect(r.value.row.state).toBe('queued');
    expect(JSON.parse(r.value.row.inherited_context)).toEqual([idFailed, idDone, idQueued, idNoReport, l.root.taskId, idOther, idDone]);
    // Inheriting imposes no ordering: the reader does not wait on anything (REQ-ORCH-032).
    expect(JSON.parse(r.value.row.depends_on)).toEqual([]);
  });

  it('REQ-TOOLS-152 with REQ-ORCH-072: a child naming the root or its own task in inherited_context is ignored, not told the task does not exist', () => {
    const l = ledger();
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    l.claimStart(idA); l.transition(idA, 'running');
    // The root delegating with its own id: the root is running, so the id is ignored.
    const fromRoot = spawn(l, 'r', { inheritedContext: [l.root.taskId] });
    expect(fromRoot.ok && fromRoot.value.inherited).toEqual([]);
    // Child `a` delegating (one level deeper) naming the root, and naming its own task: both exist and neither has finished.
    const fromA = spawn(l, 'b', { parentId: idA, parentDepth: 1, inheritedContext: [l.root.taskId, idA] });
    expect(fromA.ok).toBe(true);
    expect(fromA.ok && fromA.value.inherited).toEqual([]);
    expect(fromA.ok && fromA.value.row.parent_id).toBe(idA);
  });

  it('REQ-MONITOR-016: an illegal move is refused naming both states, the record untouched, no event; a legal terminal move stamps completed_at', () => {
    const l = ledger();
    const a = spawn(l, 'a');
    const id = a.ok ? a.value.row.task_id : '';
    const bad = l.transition(id, 'succeeded');
    expect(bad).toMatchObject({ ok: false, reason: expect.stringContaining("is in state 'queued' and cannot move to 'succeeded'") });
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'queued', completed_at: null });
    expect(dal.eventsOfKind(sid, 'child.transition')).toHaveLength(0);
    expect(l.transition(id, 'cancelled', 'cancellation')).toMatchObject({ ok: true, row: { state: 'cancelled' } });
    expect(dal.getChild(sid, id)!.completed_at).not.toBeNull();
    expect(dal.eventsOfKind(sid, 'child.transition')).toHaveLength(1);
    expect(JSON.parse(dal.eventsOfKind(sid, 'child.transition')[0]!.payload)).toMatchObject({ from_state: 'queued', to_state: 'cancelled', child_id: id });
  });

  it('the repair of a-crashed-iteration-number-is-reused-by-the-next-run: a ledger holds its own root\'s tree, not every child numbered like it', () => {
    // Two roots under one iteration number — every plan cycle is numbered 0, and a dead run's number was reused.
    const earlier = ledger();
    const a = spawn(earlier, 'a');
    const idA = a.ok ? a.value.row.task_id : '';
    spawn(earlier, 'b', { parentId: idA, parentDepth: 1 });
    const later = ledger();
    expect(later.root.taskId).not.toBe(earlier.root.taskId);
    expect(earlier.all().map((c) => c.canonical_name).sort()).toEqual(['a', 'b']);
    expect(later.all()).toEqual([]);
    // So the earlier root's children count toward none of the later ledger's limits and resolve none of its dependencies.
    expect(spawn(later, 'dep', { dependsOn: [idA] })).toMatchObject({ ok: false, error: { reason: `Unknown dependency '${idA}'` } });
  });

  it('REQ-ORCH-049: two passes claim the same child; exactly one child_start, one suppression recorded in the same transaction', () => {
    const l = ledger();
    const a = spawn(l, 'a');
    const id = a.ok ? a.value.row.task_id : '';
    expect(l.claimStart(id)).toBe(true);
    expect(l.claimStart(id)).toBe(false);
    const names = dal.timelineOf(sid).map((t) => t.name);
    expect(names.filter((n) => n === 'child_start')).toHaveLength(1);
    expect(names.filter((n) => n === 'child_launch_suppressed')).toHaveLength(1);
    expect(dal.issuesOf(sid).map((i) => i.kind)).toEqual(['stale_child_launch_claim']);
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'starting', launch_generation: 1 });
  });

  it('dependencies: a dependent starts only when every dependency succeeded WITH a stored report; a failure cascades blocked transitively', async () => {
    const l = ledger();
    const started: string[] = [];
    const sched = new Scheduler({ ledger: l, runChild: async (row) => { started.push(row.task_id); }, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    const b = spawn(l, 'b', { dependsOn: [idA] }); const idB = b.ok ? b.value.row.task_id : '';
    const c = spawn(l, 'c', { dependsOn: [idB] }); const idC = c.ok ? c.value.row.task_id : '';
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_dependencies');
    sched.pass();
    expect(started).toEqual([idA]);
    expect(dal.getChild(sid, idA)!.state).toBe('starting');
    l.transition(idA, 'running'); l.transition(idA, 'succeeded');
    sched.pass();
    // succeeded but no report yet: not released
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_dependencies');
    l.storeReport(idA, { status: 'succeeded', summary: 's' });
    sched.pass();
    expect(started).toEqual([idA, idB]);
    l.transition(idB, 'running'); l.transition(idB, 'failed'); sched.settled(dal.getChild(sid, idB)!);
    sched.pass();
    expect(dal.getChild(sid, idC)!.state).toBe('blocked');
    expect(dal.getChild(sid, idC)!.completed_at).not.toBeNull();
  });

  it('REQ-ORCH-048 with REQ-ORCH-108 / REQ-ORCH-112: each child the cascade blocks has its `blocked` report stored, naming the dependency, before its parent is told', () => {
    const l = ledger();
    const sched = new Scheduler({ ledger: l, runChild: async () => undefined, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    const b = spawn(l, 'b', { dependsOn: [idA] }); const idB = b.ok ? b.value.row.task_id : '';
    const c = spawn(l, 'c', { dependsOn: [idB] }); const idC = c.ok ? c.value.row.task_id : '';
    sched.pass();
    // The terminal callback sees each blocked child with its report already stored (REQ-ORCH-108: "before its parent resumes").
    const seen: [string, string, number][] = [];
    sched.onTerminal((row) => seen.push([row.task_id, row.state, row.report_stored]));
    l.transition(idA, 'running'); l.transition(idA, 'failed'); sched.settled(dal.getChild(sid, idA)!);
    sched.pass();
    expect(seen).toEqual([[idA, 'failed', 0], [idB, 'blocked', 1], [idC, 'blocked', 1]]);
    expect(JSON.parse(dal.getChild(sid, idB)!.report!)).toEqual({ agent_name: 'b', role: 'coding-agent', status: 'blocked', summary: `Blocked: Its dependency a (${idA}) ended failed, so this child never started (REQ-ORCH-048).`, key_findings: [], last_response: '', final_response: '', errors: [{ type: 'blocked', message: `Its dependency a (${idA}) ended failed, so this child never started (REQ-ORCH-048).` }] });
    // Transitively: c names the dependency that blocked it, b, and how b ended.
    expect(JSON.parse(dal.getChild(sid, idC)!.report!)).toMatchObject({ status: 'blocked', summary: `Blocked: Its dependency b (${idB}) ended blocked, so this child never started (REQ-ORCH-048).` });
    expect(warnings).toEqual([]);
  });

  it('REQ-ORCH-050: over the cap a child is held, promoted in the order held one per freed slot; a terminal held child is dropped', () => {
    const l = ledger(1);
    const started: string[] = [];
    const sched = new Scheduler({ ledger: l, runChild: async (row) => { started.push(row.task_id); }, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    sched.pass();
    l.transition(idA, 'running');
    const b = spawn(l, 'b'); const idB = b.ok ? b.value.row.task_id : '';
    const c = spawn(l, 'c'); const idC = c.ok ? c.value.row.task_id : '';
    expect(b.ok && b.value.held).toBe(true);
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_model_slot');
    expect(l.slotQueue('m')).toEqual([idB, idC]);
    sched.pass();
    expect(started).toEqual([idA]);
    // c is cancelled while held → dropped, not released
    l.transition(idC, 'cancelled', 'cancellation');
    l.transition(idA, 'succeeded'); sched.settled(dal.getChild(sid, idA)!); sched.pass();
    expect(started).toEqual([idA, idB]);
    expect(l.slotQueue('m')).toEqual([]);
    expect(dal.getChild(sid, idB)!.state).toBe('starting');
  });

  it('REQ-ORCH-052/056: the finalize sweep settles every non-terminal record cancelled with a report; a pass that changes nothing ends', () => {
    const l = ledger();
    const sched = new Scheduler({ ledger: l, runChild: async () => undefined, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    const b = spawn(l, 'b', { dependsOn: [idA] }); const idB = b.ok ? b.value.row.task_id : '';
    sched.pass();
    expect(sched.finalizeIncomplete('cleanup')).toBe(2);
    expect(dal.getChild(sid, idA)).toMatchObject({ state: 'cancelled', report_stored: 1 });
    expect(dal.getChild(sid, idB)!.state).toBe('cancelled');
    expect(sched.hasNonTerminal).toBe(false);
    sched.pass();
    expect(warnings.filter((w) => /quiescence/.test(w))).toHaveLength(0);
  });
});

describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iter-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /**
   * A tool the test answers itself, in place of the gate's executors; undefined leaves the call to the delegation tools.
   * The third argument is the calling agent's port context, for a stand-in that reads what the run handed the port;
   * the fourth, `builtIn`, runs the delegation tool of that name, so a test can hold one.
   */
  type TestTool = (name: string, args: Record<string, unknown>, ctx: ToolPortContext, builtIn: () => Promise<PortToolResult>) => Promise<PortToolResult> | undefined;

  /** A tool port whose only tools are the three delegation tools, dispatched straight to the ops (the gate is Part A's, tested there). */
  function delegationPort(ops: DelegationOps, parentId: string, tool?: TestTool, ctx?: ToolPortContext): ToolPort {
    const dispatch = async (name: string, raw: string): Promise<PortToolResult> => {
      const a = JSON.parse(raw) as Record<string, unknown>;
      const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: name, args: a });
      const own = ctx ? tool?.(name, a, ctx, () => builtIn(name, a, ok)) : undefined;
      if (own) return own;
      return builtIn(name, a, ok);
    };
    const builtIn = async (name: string, a: Record<string, unknown>, ok: (text: string) => PortToolResult): Promise<PortToolResult> => {
      if (name === 'delegate') {
        const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: (a['depends_on'] as string[]) ?? [], inheritedContext: (a['inherited_context'] as string[] | undefined) ?? [], category: '', runInBackground: a['run_in_background'] !== false, writeScope: (a['write_scope'] as string[] | undefined) ?? [], ...(typeof a['continuation_of'] === 'string' ? { continuationOf: a['continuation_of'] } : {}) });
        if (r.status === 'rejected') return { ...ok(`Task '${r.canonicalName}': rejected — ${r.message}`), isError: true, status: 'failed' };
        let text = `Task '${r.canonicalName}': ${r.status} — ${r.message}\ntask_id: ${r.taskId}`;
        if (a['run_in_background'] === false) { const w = await ops.waitForTasks(parentId, [r.taskId]); text += `\n\n${'refused' in w ? w.refused : 'interrupted' in w ? w.interrupted : w.text}`; }
        return ok(text);
      }
      if (name === 'wait_for_tasks') { const w = await ops.waitForTasks(parentId, (a['task_ids'] as string[]) ?? []); return 'refused' in w ? { ...ok(w.refused), isError: true, status: 'failed' } : 'interrupted' in w ? { ...ok(w.interrupted), isError: true, status: 'failed', interrupted: true } : ok(w.text); }
      if (name === 'background_output') { const r = ops.backgroundOutput(parentId, String(a['task_id']), 'summary'); return ok(r.status === 'ok' ? r.text : r.status); }
      return { ...ok(`unknown ${name}`), isError: true, status: 'failed' };
    };
    return {
      specs: () => ['delegate', 'wait_for_tasks', 'background_output'].map((n) => ({ name: n, description: n, parameters: { type: 'object' } })),
      dispatch: (c) => dispatch(c.name, c.rawArgs), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
  }

  /**
   * `deaf`: the personas whose calls ignore their abort — a provider that does not honour it — so a test can have a call
   * outlive a stop. `hooks`, `drainTimeoutMs` and `publisher` reach the session as their names say; `images` has the
   * model accept image input. `pending`: request ids every port reports as its own live approval or question set, so an
   * id-routed answer finds a holder.
   */
  function sessionsWith(script: (persona: string, turn: number, req: ModelRequest) => ScriptedCall, over: { cap?: number | null; childTimeoutMs?: number; childStallTimeoutMs?: number; tool?: TestTool; deaf?: readonly string[]; hooks?: HookPort; drainTimeoutMs?: number; images?: boolean; publisher?: Publisher; pending?: ReadonlySet<string>; raisingPort?: string } = {}) {
    // The scripted client answers by persona and by the number of calls that persona has made.
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const persona = /^You are the orchestrator/.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'orchestrator' : /summarise/i.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'summariser' : 'child';
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n, req));
      return original(over.deaf?.includes(persona) === true ? { ...req, signal: new AbortController().signal } : req);
    };
    let n = 0;
    const built: { persona: string; mode: PermissionPreset }[] = [];
    /** Each agent's tool-port context, by canonical name, as the engine built it. */
    const contexts = new Map<string, ToolPortContext>();
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: over.images === true ? { ...MODEL, acceptsImageInput: true } : MODEL, credentialFor: () => async () => 'k' };
    const sessions = new Sessions({
      clocks: clock, publisher: over.publisher ?? NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++n}`,
      model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => {
        // The mode each agent was BUILT with, in construction order. The run host's port SELECTS it through
        // `selectRequestedMode` — the persona's pin, then the session override, then `runtime.permission_mode`
        // (REQ-TOOLS-048, covered in `run-host/tools.test.ts`); with no pins that is the override or the
        // start-of-run mode, which is the half this run's engine owns (REQ-TOOLS-073's second).
        // `raisingPort`: the agent whose tool-port factory throws, as one the run host could not build would.
        if (over.raisingPort === ctx.agentName) throw new Error(`no tool port for ${ctx.agentName}`);
        const selected = (ctx.modeOverride ?? ctx.requestedMode) as PermissionPreset;
        built.push({ persona: ctx.persona, mode: selected });
        contexts.set(ctx.agentName, ctx);
        let mode: PermissionPreset = selected;
        const held = (id: string): boolean => over.pending?.has(id) ?? false;
        const base = { cancelPending: () => 0, setMode: (m: string) => { const previous = mode; mode = m as PermissionPreset; return { requested: mode, effective: mode, downgraded: false, reason: '', previous }; }, currentMode: () => mode, answerApproval: held, answerQuestions: held, cancelQuestions: held };
        return ctx.delegation
          ? { ...delegationPort(ctx.delegation, ctx.parentId ?? 'root', over.tool, ctx), ...base }
          : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), ...base };
      },
      attended: () => true,
      ...(over.hooks ? { hooks: () => over.hooks! } : {}),
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', modelConcurrencyCap: over.cap ?? null, drainTimeoutMs: over.drainTimeoutMs ?? 0, ...(over.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: over.childStallTimeoutMs }), ...(over.childTimeoutMs === undefined ? {} : { childTimeoutMs: over.childTimeoutMs }) },
    });
    return { sessions, client, counts, built, contexts };
  }
  const children = (sid: SessionId): ChildRow[] => dal.childrenOf(sid);
  const kinds = (sid: SessionId) => dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind);

  it('delegate in the background → the child runs its own turn, reports, the parent is resumed once with the report, the run completes', async () => {
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done: the child implemented it.');
      if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":["one file"],"tags":["implementation"]}');
      return answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const rows = children(sid);
    expect(rows).toHaveLength(1);
    const c = rows[0]!;
    expect(c).toMatchObject({ persona: 'coding-agent', canonical_name: 'implement', state: 'succeeded', iteration: 1, depth: 1, observed: 1, report_stored: 1 });
    // REQ-ORCH-072: the child names the root execution record's task id as its parent
    expect(c.parent_id).toMatch(TASK_ID_PATTERN);
    expect(JSON.parse(c.report!)).toMatchObject({ agent_name: 'implement', role: 'coding-agent', status: 'succeeded', summary: 'The child wrote the file.', key_findings: ['one file'], final_response: 'I implemented it.' });
    // the ordering obligations: child.spawn precedes every event naming the child, child.complete carries the report
    const ks = kinds(sid);
    expect(ks.indexOf('child.spawn')).toBeLessThan(ks.indexOf('child.transition'));
    expect(ks.filter((k) => k === 'child.spawn')).toHaveLength(1);
    expect(ks.filter((k) => k === 'child.complete')).toHaveLength(1);
    const transitions = dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state);
    expect(transitions).toEqual(['starting', 'running', 'summarizing', 'succeeded']);
    // the parent's second model call carried the notification and the report block
    const resume = client.requests.filter((r) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '')).at(-1)!;
    const lastUser = [...resume.messages].reverse().find((m) => m.role === 'user')!;
    const text = lastUser.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(text).toContain('[Background task completed]');
    expect(text).toContain('### implement (coding-agent) — succeeded');
    expect(text).toContain('All background tasks finished.');
    // the child's rows are in the same transcript, tagged by its canonical name
    expect(dal.residentRows(sid).some((r) => r.kind === 'agent' && r.name === 'implement')).toBe(true);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['child_start', 'child_end', 'child_result', 'child_conversation_closed']));
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: a delegated child\'s provider requests reach the run\'s tokens, cost and usage.update', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      // The summariser reports nothing here, so this case is the child's alone; the next case counts the summariser.
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 0, output: 0 });
      // A reader that answers in text is accepted at once (REQ-ORCH-095 re-prompts only an implementer), so this is one request.
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    // The entry agent's two requests and the child's one, each counted once; the summariser reported no usage, so it moves no total.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 122, tokens_output: 25, cost: '0.0135' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { tokens: { total: number }; cost: { total: string } }));
    expect(updates).toHaveLength(3);
    expect(updates.at(-1)).toMatchObject({ tokens: { input: 122, output: 25, total: 147 }, cost: { total: '0.0135' } });
    expect(updates.map((u) => u.cost.total)).toContain('0.0115');
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: the child-report summariser\'s request counts against the run like any agent\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 40, output: 8, cost: '0.0004' });
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The three agent requests of the case above, plus the summariser's one — no agent's turn, and still the run's.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 162, tokens_output: 33, cost: '0.0139' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { cost: { total: string } }));
    expect(updates).toHaveLength(4);
    expect(updates.at(-1)).toMatchObject({ cost: { total: '0.0139' } });
  });

  describe('PD-TOOLS-006: write scopes', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    const heldByApi = { canonicalName: 'api', persona: 'codebase-analyst', pattern: 'src/api/**' };
    /** Until `ready()` holds, yielding to the run between looks; the scripted children park on a hold meanwhile. */
    async function until(ready: () => boolean): Promise<void> {
      for (let i = 0; i < 500 && !ready(); i += 1) await new Promise((r) => setTimeout(r, 1));
      expect(ready()).toBe(true);
    }

    it('a live scope refuses its sibling and the entry agent but not its holder; each child is told the live scopes; the claim lapses when its child ends', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([
            { callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } },
            { callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'ui', task: 'TASK: ui' } },
          ], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: api') ? 'api' : 'ui';
        if (!payloads.has(name)) payloads.set(name, text);
        return { parts: [{ hold }, ...answer(`${name}: read.`).parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'split the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.size === 2);
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      // The entry agent and the unscoped sibling are refused inside the scope; the holder is not, and nobody is outside it.
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'SRC/API/users.ts')).toMatchObject(heldByApi);
      expect(claim('api', 'src/api/users.ts')).toBeNull();
      expect(claim('ui', 'src/ui/view.ts')).toBeNull();
      expect(claim('api', 'src/ui/view.ts')).toBeNull();
      // The disclosure sits immediately after the workspace-root prefix: the holder's own scope, the sibling's view of it.
      expect(payloads.get('api')).toMatch(/Workspace root: [^\n]*\n\nWrite scopes:\n- Yours: 'src\/api\/\*\*'\./);
      expect(payloads.get('ui')).toMatch(/Workspace root: [^\n]*\n\nWrite scopes:\n- Held by other agents[^\n]*\n {2}- api: 'src\/api\/\*\*'\n/);
      // PD-TOOLS-006 revision 2: the declared scope is stored with the child's record, so a resumed child can claim it again.
      expect(Object.fromEntries(children(sid).map((c) => [c.canonical_name, c.write_scope]))).toEqual({ api: '["src/api/**"]', ui: '[]' });
      release();
      expect((await running).status).toBe('completed');
      expect(claim('orchestrator', 'src/api/users.ts')).toBeNull();
    });

    it('the holder\'s own descendants are not refused, and are told the scope belongs to an agent they work under', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const calls = new Map<string, number>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: deep') ? 'deep' : 'api';
        const n = (calls.get(name) ?? 0) + 1;
        calls.set(name, n);
        if (!payloads.has(name)) payloads.set(name, text);
        if (name === 'api' && n === 1) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'deep', task: 'TASK: deep' } }], 'Delegating further.');
        return name === 'deep' ? { parts: [{ hold }, ...answer('deep: read.').parts] } : answer('api: done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'nest the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.has('deep'));
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      expect(claim('deep', 'src/api/users.ts')).toBeNull();
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(payloads.get('deep')).toContain("  - api: 'src/api/**' (you work under this agent, so its scope does not fence you)");
      release();
      expect((await running).status).toBe('completed');
    });

    it('a scope reaching outside the workspace root rejects the delegation: no child, no task id, the reason names the pattern', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'escape', task: 'TASK: x', write_scope: ['src/**', '../elsewhere/**'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'try it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'escape': rejected — write_scope pattern '../elsewhere/**' reaches outside the workspace root.");
      expect(resumed).not.toContain('task_id:');
    });
  });

  describe('REQ-TOOLS-152 / REQ-TOOLS-154 (5): inherited context reaches the child', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');

    it('the named completed sibling\'s report is item (5) of the child\'s payload: after the workspace root, immediately before the task, as the block the parent read', async () => {
      const payloads = new Map<string, string>();
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey', run_in_background: false } }], 'Surveying.');
          if (turn === 2) {
            const surveyId = /task_id: (bg_[0-9a-f]{8})/.exec(textOf(req))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coder', task_name: 'build', task: 'TASK: build', inherited_context: [surveyId], run_in_background: false } }], 'Building.');
          }
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: build') ? 'build' : 'survey';
        if (!payloads.has(name)) payloads.set(name, text);
        return answer(name === 'survey' ? 'The module is small.' : 'Built it.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'survey then build') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rows = children(sid);
      expect(rows.map((c) => c.canonical_name).sort()).toEqual(['build', 'survey']);
      const survey = rows.find((c) => c.canonical_name === 'survey')!;
      const build = rows.find((c) => c.canonical_name === 'build')!;
      expect(JSON.parse(build.inherited_context)).toEqual([survey.task_id]);
      // (1) the root, (3) the sibling-artifact index the survey's report became, (5) the same report block the parent
      // was handed, (6) the task — in REQ-TOOLS-154's order, with nothing between (5) and (6).
      expect(payloads.get('build')).toMatch(/Workspace root: C:\/ws\.[^\n]*\n\nPRIOR SIBLING ARTIFACT INDEX\n[^\n]*survey[^\n]*\n\n\[Inherited context — [^\n]*\]\n\n### survey \(codebase-analyst\) — succeeded\nThe module is small\.\n\nTASK: build$/);
      const parentRead = textOf(client.requests.find((r) => textOf(r).includes('TASK: build'))!);
      expect(parentRead).toContain('### survey (codebase-analyst) — succeeded\nThe module is small.');
      // The survey's own payload carried no such block: nothing had been named for it.
      expect(payloads.get('survey')).not.toContain('[Inherited context');
      // The delegation itself was ordinary: accepted, no wait on the sibling (REQ-ORCH-032).
      expect(JSON.parse(build.depends_on)).toEqual([]);
    });

    it('an id naming no task refuses the delegation: no child, no task id, the reason names the id (REQ-TOOLS-153)', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'build', task: 'TASK: x', inherited_context: ['bg_00000000'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'try it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'build': rejected — inherited_context id 'bg_00000000' refers to nothing: no task has that id");
      expect(resumed).not.toContain('task_id:');
    });
  });

  it('REQ-TOOLS-030/073 (PD-TOOLS-002): a mid-run switch to autonomous reaches the children built after it', async () => {
    const ref: { sid?: SessionId } = {};
    const { sessions, built } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) {
          // Mid-run, while the entry agent is the only agent: the user picks `autonomous` in the composer.
          expect(sessions.control({ op: 'setPermissionMode', sessionId: ref.sid!, args: { mode: 'autonomous' } })).toEqual({ ok: true });
          return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
        }
        return answer('All done.');
      }
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    });
    ref.sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(ref.sid)!).status).toBe('completed');
    // The entry agent was built before the switch; the child was built after it and must carry the new mode.
    expect(built[0]).toMatchObject({ persona: 'orchestrator', mode: 'ask' });
    expect(built.slice(1).map((b) => b.mode)).not.toContain('ask');
  });

  /**
   * PD-TOOLS-005, the engine's half: ONE away holder per run reaches every agent's port context, delegated children
   * included; the user's input to the run's session — a mode change, a message, an answer — clears it; and a later run of
   * the session starts with the user present. The gate's half (marking on the expired wait, resolving at once with the
   * directive's reason) is `gate.test.ts`'s and `run-host/tools.test.ts`'s; here a stand-in reads the holder as the gate does.
   */
  describe('PD-TOOLS-005: the run\'s away state reaches every agent, ends on the user\'s input, and does not outlive the run', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    /** The gate's consultation, stood in: a `write_file` ask is denied at once while away, and "times out" (marks away) when the path says so. */
    const asks: { agent: string; away: { afterSeconds: number } | null }[] = [];
    const gateStandIn = (name: string, a: Record<string, unknown>, ctx: ToolPortContext): Promise<PortToolResult> | undefined => {
      if (name !== 'write_file') return undefined;
      const away = ctx.presence?.away() ?? null;
      asks.push({ agent: ctx.agentName, away });
      if (away !== null) return Promise.resolve({ text: `Permission denied. The user is treated as away because an earlier approval in this run went unanswered for ${away.afterSeconds} seconds, so the request was denied.`, isError: true, status: 'blocked', durationMs: 0, label: name, args: a });
      if (String(a['path']) === 'unanswered.ts') { ctx.presence?.markAway(5); return Promise.resolve({ text: 'Permission denied. Denied because no answer arrived within 5 seconds.', isError: true, status: 'blocked', durationMs: 5_000, label: name, args: a }); }
      return Promise.resolve({ text: 'ok', isError: false, status: 'ok', durationMs: 1, label: name, args: a });
    };

    it('a child\'s ask in an away run reads the mark the root\'s expired wait set, on the one holder the run hands every port', async () => {
      asks.length = 0;
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return turn === 1 ? toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'child.ts', content: 'b' } }]) : answer('I could not write.');
      }, { tool: gateStandIn });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const root = contexts.get('orchestrator')!;
      const child = contexts.get('implement')!;
      expect(root.presence).toBeDefined();
      expect(child.presence).toBe(root.presence);
      expect(asks).toEqual([{ agent: 'orchestrator', away: null }, { agent: 'implement', away: { afterSeconds: 5 } }]);
      // The transition is in the session log's words, once.
      expect(warnings.filter((w) => w.startsWith('user away: an approval in this run went unanswered for 5 seconds'))).toHaveLength(1);
      // The run ended: the holder is the run's, and a later run of this session starts present (below).
      expect(root.presence!.away()).toEqual({ afterSeconds: 5 });
    });

    it('the user returns on a permission-mode change, a message or an answer; shutdown is not the user; a new run starts present', async () => {
      asks.length = 0;
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona !== 'orchestrator') return answer('unused');
        if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'hold' } }]);
        return answer(`root turn ${turn}`);
      }, { tool: (name, a, ctx) => (name === 'read_file' ? hold.p.then(() => ({ text: 'held', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : gateStandIn(name, a, ctx)) });
      sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      // The run is live, parked on the held read, with the user marked away by the expired wait before it.
      await tick();
      const presence = contexts.get('orchestrator')!.presence!;
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // A permission-mode change returns the user …
      expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
      expect(presence.away()).toBeNull();
      expect(warnings.filter((w) => w.startsWith('user returned:'))).toHaveLength(1);
      // … so does a message to the run, even one the operation then refuses (blank text) — the input is the user's.
      presence.markAway(5);
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: '   ' } })).toEqual({ ok: false });
      expect(presence.away()).toBeNull();
      // An answer routed by request id returns the user of the session that held it; a stale id, held by none, returns nobody.
      presence.markAway(5);
      expect(sessions.answerApproval('no-such-request', 'once')).toBe(false);
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // The application's shutdown announcement is not the user's input; a run control is. (Shutdown is not sent here — it would stop the run.)
      expect(sessions.control({ op: 'setReasoning', sessionId: sid, args: { level: 'low' } }).ok).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // A later run of the same session: a fresh holder, present, and the old one is not consulted.
      contexts.clear();
      const again = sessions.prompt(sid, 'and again');
      expect(again.ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const next = contexts.get('orchestrator')!.presence!;
      expect(next).not.toBe(presence);
      expect(next.away()).toBeNull();
      expect(presence.away()).toEqual({ afterSeconds: 5 });
    });

    it('the user returns on a confirmed transcript clear, a compression, and an approval or question answer the run holds', async () => {
      const hold = gate();
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona !== 'orchestrator') return answer('unused');
        if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'hold' } }]);
        return answer(`root turn ${turn}`);
      }, {
        tool: (name, a, ctx) => (name === 'read_file' ? hold.p.then(() => ({ text: 'held', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : gateStandIn(name, a, ctx)),
        pending: new Set(['live-approval', 'live-questions', 'cancelled-questions']),
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      await tick();
      const presence = contexts.get('orchestrator')!.presence!;
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // REQ-MONITOR-004 / REQ-CHAT-084: the confirmed clear is an operation on the live run, answered before `control`'s common line.
      expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} }).ok).toBe(true);
      expect(presence.away()).toBeNull();
      // REQ-MONITOR-092: the compression the host awaits reaches `controlAsync`, never `control`; the return is taken before it settles.
      presence.markAway(5);
      const compressing = sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} });
      expect(presence.away()).toBeNull();
      await compressing;
      // ADR-0013: answers routed by request id — the session whose run holds the id is the one whose user returns.
      presence.markAway(5);
      expect(sessions.answerApproval('live-approval', 'once')).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      expect(sessions.answerQuestions('live-questions', {})).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      expect(sessions.cancelQuestions('cancelled-questions')).toBe(true);
      expect(presence.away()).toBeNull();
      hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });
  });

  it('REQ-MONITOR-102: the persisted tool-call total is session-wide — the entry agent\'s calls AND its children\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return turn === 1 ? toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'none' } }], 'Checking.') : answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(children(sid)[0]!.tool_calls).toBe(1);
    // One delegate by the entry agent, one call by the child. A total that held the entry agent's alone read 1,
    // and every surface that subtracts the per-agent counts from it — the synthetic run row — read zero.
    expect(dal.getSession(sid)!.tool_calls).toBe(2);
  });

  it('a foreground delegation waits through the one mechanism and returns the report inline; wait_for_tasks refuses the caller\'s own task', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'tester', task_name: 'test it', task: 'TASK: run tests', run_in_background: false } }]);
        if (turn === 2) return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: ['root:1'] } }]);
        return answer('done');
      }
      if (persona === 'summariser') return answer('{"summary":"tests pass"}');
      return answer('All tests pass.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'test') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const rows = dal.residentRows(sid);
    const delegateRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'delegate')!;
    expect(delegateRow.output).toContain('The waited-for background tasks completed (1).');
    expect(delegateRow.output).toContain('### test-it (tester) — succeeded');
    const waitRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks')!;
    expect(waitRow.output).toBe('An agent cannot wait for its own task.');
    expect(waitRow.tool_status).toBe('failed');
  });

  it('REQ-ORCH-088: a child that never answers times out, reports failed with the timeout, and the parent still completes', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running');
    clock.advance(1_200_000);
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { errors: { type: string; message: string }[] };
    expect(report.errors.map((e) => e.type)).toEqual(expect.arrayContaining(['timeout', 'summary_failure']));
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  describe('REQ-NOTIFY-111/112 with REQ-ORCH-089: a child that produces no output is given its one corrective message', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const failed = modelError({ code: 'unknown', headline: 'the stream ended with no answer' });
    /** Each child request is `silent` (held, then fails) or answers; `gates` releases the silent ones in order. */
    function stalling(plan: readonly ('silent' | 'fails at once' | 'answers')[], over: { childStallTimeoutMs?: number } = {}) {
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const made = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        const step = plan[turn - 1] ?? 'answers';
        if (step === 'answers') return answer('I carried on and finished.');
        if (step === 'fails at once') return { parts: [{ error: failed }] };
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ hold }, { error: failed }] };
      }, over);
      return { ...made, gates, childAsked };
    }
    const child = (sid: SessionId) => children(sid)[0]!;

    it('the step goes silent for the window and then fails: the stall is warned with its issue, the child is given one corrective message and resumes from where it stopped, and it succeeds', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'answers']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      // REQ-MONITOR-119: the stall is reported while the child is still running — nothing is cancelled.
      expect(child(sid).state).toBe('running');
      const stall = dal.issuesOf(sid).filter((i) => i.kind === 'stall');
      expect(stall.map((i) => [i.severity, i.message])).toEqual([['warning', `child appears stalled: no model event or token for 90 seconds (quiet, ${child(sid).task_id}); the run is still waiting on it.`]]);
      expect(JSON.parse(stall[0]!.metadata)).toEqual({ task_id: child(sid).task_id, silent_seconds: 90, active_tools: [], recent_tool_calls: [], last_model_event: null });
      expect(warnings).toContain(stall[0]!.message);
      gates[0]!();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
      // Its third request is REQ-ORCH-095's, a separate re-prompt: an implementer that answered without acting on anything.
      expect(childAsked).toHaveLength(3);
      expect(childAsked[2]).toContain('Carry out the task now');
      // The corrective message follows the conversation the failed turn left: the task, then the message.
      expect(childAsked[1]).toContain('TASK: be quiet');
      expect(childAsked[1]).toContain('[Corrective message] You produced no output for 90 seconds (the stall window, runtime.child_stall_timeout, is 90 seconds), and your last model request then failed: the stream ended with no answer.');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_corrective_message')).toHaveLength(1);
      expect(child(sid).state).toBe('succeeded');
      expect(JSON.parse(child(sid).report!)).toMatchObject({ status: 'succeeded' });
    });

    it('REQ-MONITOR-119/120: a `stall` issue at every stall evaluation, and the warning only at entry and at the throttle', async () => {
      const { sessions, gates } = stalling(['silent', 'answers']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      clock.advance(10_000);
      const silent = () => dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => (JSON.parse(i.metadata) as { silent_seconds: number }).silent_seconds);
      // The evaluations at 90, 95 and 100 s each record the issue; the warning is written once, at entry.
      expect(silent()).toEqual([90, 95, 100]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').every((i) => i.severity === 'warning')).toBe(true);
      expect(warnings.filter((m) => m.startsWith('child appears stalled'))).toEqual([`child appears stalled: no model event or token for 90 seconds (quiet, ${child(sid).task_id}); the run is still waiting on it.`]);
      // REQ-MONITOR-120: the next warning is due max(90 s, 30 s) after the first.
      clock.advance(80_000);
      expect(silent()).toHaveLength(19);
      expect(warnings.filter((m) => m.startsWith('child appears stalled')).map((m) => /for (\d+) seconds/.exec(m)![1])).toEqual(['90', '180']);
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });

    it('REQ-MONITOR-118/120: a tool call in flight is waited on, not a stall; a stall that ends in output is recorded as recovered', async () => {
      let releaseTool!: () => void;
      const toolHeld = new Promise<void>((r) => { releaseTool = r; });
      let speak!: () => void;
      const spoken = new Promise<void>((r) => { speak = r; });
      let finish!: () => void;
      const finished = new Promise<void>((r) => { finish = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (turn === 1) return toolCalls([{ callId: 'r1', name: 'read_file', args: { path: 'a' } }]);
        return { parts: [{ hold: spoken }, { part: { kind: 'text', delta: 'Read it; ' } }, { hold: finished }, { part: { kind: 'text', delta: 'done.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: (name, a) => (name === 'read_file' ? toolHeld.then(() => ({ text: 'contents', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).length > 0 && child(sid)?.state === 'running');
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_waiting_on_tools').map((t) => t.message)).toEqual([`quiet (${child(sid).task_id}) is waiting on 1 active tool call(s): no model event or token for 90 seconds.`]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toEqual([]);
      releaseTool();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toHaveLength(1);
      speak();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(5_000);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_stall_recovered').map((t) => t.message)).toEqual([`quiet (${child(sid).task_id}) is active again after a stall.`]);
      finish();
      await sessions.running(sid)!;
      expect(child(sid).state).toBe('succeeded');
    });

    it('at most one corrective message per child: a second silent failure ends it failed', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'silent']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      gates[0]!();
      await settle(() => gates.length === 2);
      clock.advance(90_000);
      gates[1]!();
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(2);
      expect(childAsked.filter((t) => t.includes('[Corrective message]'))).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
      expect(JSON.parse(child(sid).report!)).toMatchObject({ status: 'failed', errors: [{ type: 'model', message: 'the stream ended with no answer' }] });
    });

    it('a failure inside the window is not the stall condition: no corrective message, and the child ends failed', async () => {
      const { sessions, childAsked } = stalling(['fails at once']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(1);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_corrective_message')).toEqual([]);
      expect(child(sid).state).toBe('failed');
    });

    it('runtime.child_stall_timeout is the window: at 30 s, a failure 29 s into the silence earns nothing', async () => {
      const { sessions, gates, childAsked } = stalling(['silent'], { childStallTimeoutMs: 30_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(29_000);
      gates[0]!();
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
    });

    it('runtime.child_stall_timeout is the window: at 30 s, a failure 30 s into the silence earns its message', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'answers'], { childStallTimeoutMs: 30_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(30_000);
      gates[0]!();
      await sessions.running(sid)!;
      expect(childAsked[1]).toContain('[Corrective message] You produced no output for 30 seconds (the stall window, runtime.child_stall_timeout, is 30 seconds)');
      expect(child(sid).state).toBe('succeeded');
    });
  });

  it('REQ-ORCH-088: the ceiling asks the child to land, so the step in flight finishes and its words reach the report', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'I surveyed nine files and found the lockfile pins yaml twice' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    // The ceiling has passed and the child has NOT been cut: the step in flight is still allowed to answer.
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; final_response: string; errors: { type: string }[] };
    // REQ-ORCH-088: "carrying the last/final response extracted from the transcript" — before the landing
    // this read '' for both, because the abort killed the child inside the step that was about to speak.
    expect(report.last_response).toContain('the lockfile pins yaml twice');
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // REQ-ORCH-110: it is the LAST response, never the final one — the child was stopped, it did not conclude.
    expect(report.final_response).toBe('');
  });

  it('REQ-ORCH-088 / REQ-CONFIG-113: a child that cannot land inside the grace is still cut off by the backstop', async () => {
    // Nothing in this test ever resolves the hold: the point is that a child which CANNOT land is
    // still ended by the product rather than by the test.
    const hold = new Promise<void>(() => undefined);
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: never answer' } }]) : answer('finished after the backstop');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'never said' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running'); // asked to land; not cut, because nothing has spoken yet
    // Past the grace, and past a second ceiling too: REQ-ORCH-088's fallback retry may take one more
    // attempt, and it is bounded by the same ladder. The run must end on its own either way.
    for (let i = 0; i < 4 && sessions.running(sid) !== undefined && children(sid)[0]!.state === 'running'; i += 1) {
      clock.advance(30_000);
      await new Promise((r) => setTimeout(r, 10));
      clock.advance(1_200_000);
      await new Promise((r) => setTimeout(r, 10));
    }
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; errors: { type: string }[] };
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // Cut before it could speak — the grace is a chance to land, not an extension of the ceiling.
    expect(report.last_response).toBe('');
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  describe('PD-ORCH-004: a child cut off while making progress hands its work back', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const textOf = (m: ModelRequest['messages'][number]) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');
    /** A gate the test opens: a tool call waiting on it completes at whatever the clock reads when it is opened. */
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    type StoredCutOff = { statement: string; changed_paths: string[]; changes: string; continuation_offer: string | null };
    type Stored = { status: string; last_response: string; errors: { type: string; message: string }[]; cut_off?: StoredCutOff };
    const reportOf = (row: ChildRow) => JSON.parse(row.report!) as Stored;
    /** The file tools and `read_file`, answered here: a write to `fail.ts` fails, a read of a gate waits for it. */
    const fileTools = (gates: Record<string, Promise<void>>) => (name: string, a: Record<string, unknown>): Promise<PortToolResult> | undefined => {
      if (!['write_file', 'haet_edit', 'read_file'].includes(name)) return undefined;
      const failed = String(a['path']).endsWith('fail.ts');
      const result: PortToolResult = { text: failed ? 'the edit did not apply' : 'ok', isError: failed, status: failed ? 'failed' : 'ok', durationMs: 1, label: name, args: a };
      const waitOn = gates[String(a['path'])];
      return waitOn ? waitOn.then(() => result) : Promise.resolve(result);
    };
    /** A child's step number is the count of its own assistant messages so far, plus one. */
    const stepOf = (req: ModelRequest) => req.messages.filter((m) => m.role === 'assistant').length + 1;
    const hasTask = (req: ModelRequest, task: string) => req.messages.some((m) => m.role === 'user' && textOf(m).includes(task));

    /**
     * One child, delegated by the root, whose last tool call completes when the clock reads `completedAt` (the child
     * started at 0, so its 1,200 s limit expires at 1,200,000); it then speaks once more and is cut off. At its next
     * turn the root tries to continue it and then ends.
     */
    async function cutOffAt(completedAt: number, over: { childStallTimeoutMs?: number } = {}) {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: children(sid)[0]!.task_id } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate: g.p }), ...over });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(completedAt);
      g.open();
      await tick();
      clock.advance(1_200_000 - completedAt);
      hold.open();
      const result = await sessions.running(sid)!;
      return { sid, result, client, row: children(sid)[0]! };
    }

    it('a call completed exactly at the start of the final 90 s is progress: the report adds the statement, the paths and the offer, and the parent reads them', async () => {
      const { sid, result, client, row } = await cutOffAt(1_110_000);
      expect(result.status).toBe('completed');
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      // REQ-ORCH-088's report stands as it was.
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.last_response).toBe('I wrote a and was reading on');
      expect(report.cut_off).toEqual({
        statement: 'Cut off while making progress: this child completed a tool call within the final 90s before its 1200s limit expired.',
        changed_paths: ['src/a.ts'],
        changes: 'Workspace paths its file-writing calls changed, in the order first changed: src/a.ts.',
        continuation_offer: expect.stringContaining(`continuation_of: "${row.task_id}"`),
      });
      // The parent's resume message carries all three, after the report's result text.
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      const block = textOf([...resume.messages].reverse().find((m) => m.role === 'user')!);
      expect(block).toContain(`### build (coding-agent) — failed\nI wrote a and was reading on\n${report.cut_off!.statement}\n${report.cut_off!.changes}\n${report.cut_off!.continuation_offer}`);
      // The continuation was admitted and carries the relationship in its record.
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(rest.continuation_of).toBe(row.task_id);
      expect(row.continuation_of).toBeNull();
    });

    it('a call completed one millisecond before the final 90 s is not progress: exactly REQ-ORCH-088\'s report, and no continuation is admitted', async () => {
      const { sid, client, row } = await cutOffAt(1_109_999);
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.cut_off).toBeUndefined();
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      expect(textOf([...resume.messages].reverse().find((m) => m.role === 'user')!)).not.toMatch(/Cut off|continuation/);
      // The root's attempt to continue it is refused before a record exists.
      expect(children(sid)).toHaveLength(1);
      const after = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[3]!;
      expect(textOf(after.messages.at(-1)!)).toMatch(/rejected — Task 'build' \(bg_[0-9a-f]{8}\) made no continuation offer/);
    });

    it('revision 3, an offer outlives its run: a later run\'s root takes up the offer an earlier iteration left, once; a later child cannot', async () => {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      let run = 1;
      const acted = new Set<number>();
      const buildId = () => children(sid).find((c) => c.canonical_name === 'build')!.task_id;
      const PEER = 'bg_0000be01';
      const GRAND = 'bg_0000be02';
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          // Run 1: delegate, and leave the offer untaken. Run 2: take it up. Run 3: try again, and have a child try too.
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (run === 2 && !acted.has(2)) { acted.add(2); return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: buildId() } }]); }
          if (run === 3 && !acted.has(3)) {
            acted.add(3);
            return toolCalls([
              { callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'again', task: 'TASK: again', continuation_of: buildId() } },
              { callId: 'd4', name: 'delegate', args: { persona: 'coding-agent', task_name: 'helper', task: 'TASK: helper' } },
            ]);
          }
          if (run === 3 && !acted.has(30)) {
            acted.add(30);
            // An offer this iteration's `helper` delegated and this run cut off (its child's): the root does not take it
            // up, for the delegating agent still runs (found by phase 6's second review: a seed outside the root's tree
            // could not tell "ended before this run" from "ended at all"). A grandchild's offer an earlier iteration left
            // is the root's like any other of that iteration's.
            const helper = children(sid).find((c) => c.canonical_name === 'helper')!.task_id;
            for (const [id, name, iteration, parent] of [[PEER, 'peer', 3, helper], [GRAND, 'grand', 1, 'bg_0000a11e']] as const) {
              dal.insertChild({ session_id: sid, task_id: id, canonical_name: name, given_name: name, persona: 'coding-agent', state: 'failed', parent_id: parent, depth: 2, iteration, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
              dal.setChildReport(sid, id, JSON.stringify({ ...reportOf(children(sid)[0]!), task_id: id }));
            }
            return toolCalls([
              { callId: 'd5', name: 'delegate', args: { persona: 'coding-agent', task_name: 'peer-rest', task: 'TASK: peer-rest', continuation_of: PEER } },
              { callId: 'd6', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand-rest', task: 'TASK: grand-rest', continuation_of: GRAND } },
            ]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: build')) {
          if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
          return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        }
        // The helper, a child of run 3, names the earlier offer itself: only a root may take up an earlier iteration's.
        if (hasTask(req, 'TASK: helper') && stepOf(req) === 1) return toolCalls([{ callId: 'h1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'sneak', task: 'TASK: sneak', continuation_of: buildId() } }]);
        return answer('done');
      }, { tool: fileTools({ gate: g.p }) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_110_000); g.open(); await tick();
      clock.advance(90_000); hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(reportOf(children(sid)[0]!).cut_off!.continuation_offer).toContain(`continuation_of: "${buildId()}"`);

      run = 2;
      expect(sessions.prompt(sid, 'finish the build').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(rest).toMatchObject({ continuation_of: buildId(), iteration: 2 });
      expect(rest.parent_id).toBe(dal.iterationsOf(sid)[1]!.root_task_id);

      run = 3;
      expect(sessions.prompt(sid, 'and again').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid).map((c) => c.canonical_name).sort()).toEqual(['build', 'build-rest', 'grand', 'grand-rest', 'helper', 'peer']);
      expect(children(sid).find((c) => c.canonical_name === 'grand-rest')).toMatchObject({ continuation_of: GRAND, iteration: 3 });
      const refusals = client.requests.map((r) => textOf(r.messages.at(-1)!)).join('\n');
      expect(refusals).toContain(`Task 'again': rejected — Task 'build' (${buildId()}) was already continued by 'build-rest' (${rest.task_id})`);
      // Within its iteration an offer is taken up by the agent that delegated the child, the root included.
      expect(refusals).toContain(`Task 'peer-rest': rejected — continuation_of '${PEER}' names no child task of yours, nor a child that an earlier iteration, or an earlier run of this iteration, left`);
      expect(refusals).toContain(`Task 'sneak': rejected — continuation_of '${buildId()}' names no child task of yours: a continuation continues one of your own children`);
    });

    it('revision 3 (found by phase 6\'s review): a resumed iteration\'s root takes up an offer its own iteration left in an earlier run, whoever had delegated the child', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const LEFT = 'bg_0000be03';
      let taking = false;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          if (taking) { taking = false; return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'left-rest', task: 'TASK: left-rest', continuation_of: LEFT } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: work') && stepOf(req) === 1) return { parts: [{ hold }, ...answer('work done').parts] };
        return answer('done');
      });
      const sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 400 && children(sid)[0]?.state !== 'running'; i += 1) await tick();
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open' }]);
      // In that earlier run, a child of this iteration that another agent had delegated — `work`'s — was cut off with an offer.
      dal.insertChild({ session_id: sid, task_id: LEFT, canonical_name: 'left', given_name: 'left', persona: 'coding-agent', state: 'failed', parent_id: children(sid)[0]!.task_id, depth: 2, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      dal.setChildReport(sid, LEFT, JSON.stringify({ agent_name: 'left', role: 'coding-agent', status: 'failed', summary: 'Child timed out after 1200s', key_findings: [], last_response: '', final_response: '', errors: [], cut_off: { statement: 'Cut off while making progress.', changed_paths: ['src/a.ts'], changes: 'It changed src/a.ts.', continuation_offer: `Continue it with continuation_of: "${LEFT}".` } }));
      taking = true;
      expect(sessions.prompt(sid, 'take up what was left').ok).toBe(true);
      await sessions.running(sid)!;
      expect(children(sid).find((c) => c.canonical_name === 'left-rest')).toMatchObject({ continuation_of: LEFT, iteration: 1 });
      // It was told of the offer at the continue, before the user's message (found by phase 6's second review).
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const told = conversationOf(dal.agentConversation(sid, root)).map((m) => textOf(m));
      const at = told.indexOf('take up what was left');
      expect(told[at - 1]).toBe(`Open continuation offers (delegate with \`continuation_of\` set to the task id to take one up):\n- left (${LEFT})`);
    });

    it('runtime.child_stall_timeout is the window: at 60 s, a call completed 60.001 s before the expiry is not progress', async () => {
      const { row } = await cutOffAt(1_139_999, { childStallTimeoutMs: 60_000 });
      expect(reportOf(row).cut_off).toBeUndefined();
    });

    it('the paths are listed in the order first changed, once each; the continuation says it changed none and is never continued in turn; work is continued once', async () => {
      const g1 = gate(); const hold1 = gate(); const g2 = gate(); const hold2 = gate();
      let sid = '' as SessionId;
      const idOf = (name: string) => children(sid).find((c) => c.canonical_name === name)!.task_id;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) {
            // The offer named the id to use: take it from the resume message rather than from the store.
            const offered = /continuation_of: "(bg_[0-9a-f]{8})"/.exec(textOf([...req.messages].reverse().find((m) => m.role === 'user')!))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: offered } }]);
          }
          if (turn === 5) return toolCalls([
            { callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'chain', task: 'TASK: chain', continuation_of: idOf('build-rest') } },
            { callId: 'd4', name: 'delegate', args: { persona: 'coding-agent', task_name: 'again', task: 'TASK: again', continuation_of: idOf('build') } },
            { callId: 'd5', name: 'delegate', args: { persona: 'coding-agent', task_name: 'nobody', task: 'TASK: nobody', continuation_of: 'bg_00000000' } },
          ]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: build')) {
          const step = stepOf(req);
          if (step === 1) return toolCalls([
            { callId: 'b1', name: 'write_file', args: { path: 'src/b.ts', content: 'b' } },
            { callId: 'b2', name: 'haet_edit', args: { path: './src/a.ts' } },
            { callId: 'b3', name: 'write_file', args: { path: 'src/fail.ts', content: 'x' } },
          ]);
          if (step === 2) return toolCalls([
            { callId: 'b4', name: 'write_file', args: { path: '/ws/src/b.ts', content: 'b2' } },
            { callId: 'b5', name: 'haet_edit', args: { file_path: 'docs/c.md' } },
            { callId: 'b6', name: 'read_file', args: { path: 'gate1' } },
          ]);
          return { parts: [{ hold: hold1.p }, { part: { kind: 'text', delta: 'halfway' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        }
        if (stepOf(req) === 1) return toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'gate2' } }]);
        return { parts: [{ hold: hold2.p }, { part: { kind: 'text', delta: 'still reading' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate1: g1.p, gate2: g2.p }) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_150_000); g1.open(); await tick();
      clock.advance(50_000); hold1.open(); await tick(); await tick();
      // The continuation started when the root delegated it, at 1,200,000; its own limit expires at 2,400,000.
      expect(children(sid).find((c) => c.canonical_name === 'build-rest')?.state).toBe('running');
      clock.advance(1_150_000); g2.open(); await tick();
      clock.advance(50_000); hold2.open();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');

      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(reportOf(build).cut_off!.changed_paths).toEqual(['src/b.ts', 'src/a.ts', 'docs/c.md']);
      expect(rest.continuation_of).toBe(build.task_id);
      expect(rest.state).toBe('failed');
      const restReport = reportOf(rest);
      expect(restReport.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(restReport.cut_off).toMatchObject({ changed_paths: [], changes: 'Its file-writing calls changed no workspace paths.', continuation_offer: null });
      expect(restReport.cut_off!.statement).toMatch(/^Cut off while making progress/);
      // The three refused continuations created no record, and each says why.
      expect(children(sid).map((c) => c.canonical_name)).toEqual(['build', 'build-rest']);
      const last = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!))).at(-1)!;
      const refusals = textOf(last.messages.at(-1)!);
      expect(refusals).toContain(`Task 'chain': rejected — Task 'build-rest' (${rest.task_id}) made no continuation offer`);
      expect(refusals).toContain(`Task 'again': rejected — Task 'build' (${build.task_id}) was already continued by 'build-rest' (${rest.task_id})`);
      expect(refusals).toContain("Task 'nobody': rejected — continuation_of 'bg_00000000' names no child task of yours");
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'timeout')).toHaveLength(2);
    });
  });

  function holdingChild() {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
      if (persona === 'summariser') return answer('{}');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    return { sessions, release: () => releaseChild() };
  }

  it('PD-ORCH-005 clause 3 (narrowing REQ-ORCH-052): a stop while a child runs leaves it paused by the stop, the iteration open, and the run ends interrupted', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    // Its model step was cut by the stop, so it resumes running; nothing settled it, summarised it or stored a report.
    expect(c).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running', completed_at: null, report_stored: 0 });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption: 'stop' }]);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(dal.getSession(sid)!.iterations_completed).toBe(0);
  });

  it('PD-ORCH-005 clause 3: the explicit cancel (REQ-MONITOR-126, the reserved run id) is final — its child settles cancelled with a report and the iteration closes', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    expect(c.state).toBe('cancelled');
    expect(c.interruption).toBeNull();
    expect(c.completed_at).not.toBeNull();
    expect(JSON.parse(c.report!)).toMatchObject({ status: 'cancelled' });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled', interruption: null }]);
  });

  it('REQ-ORCH-053: a later run on the same session settles a phantom child left by a killed host before its first iteration', async () => {
    const { sessions } = sessionsWith(() => answer('hi'));
    // A child left `running` by a previous run (as a killed host would leave it).
    const sid0 = 'S-prev' as SessionId;
    const w = SessionWriter.create({ dal, sessionId: sid0, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    w.value.spawnChild({ task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}' });
    w.value.release(1, HOST);
    // The next run on that session id is refused by design (a new session is minted per prompt today), so the sweep is exercised directly.
    const { ArtifactStore } = await import('../artifacts/store.js');
    const artifacts = new ArtifactStore({ dal, sessionId: sid0, directory: () => join(tmpdir(), 'rotaris-phantom-artifacts'), wall: clock, warn: () => undefined });
    const settled = (await import('./orchestration.js')).settleStaleChildren(dal, w.value, sid0, () => undefined, artifacts);
    expect(settled).toBe(1);
    expect(dal.getChild(sid0, 'bg_0000dead')).toMatchObject({ state: 'cancelled', report_stored: 1 });
    // REQ-LIBRARY-092: the settled report is an artifact like every other terminal child's, so a later run finds it by
    // reading artifacts (the repair of a-stale-settled-childs-report-is-never-an-artifact.md).
    expect(dal.artifactsOf(sid0).map((a) => [a.kind, a.source_task_id, a.canonical_name, a.status])).toEqual([['child_report', 'bg_0000dead', 'ghost', 'cancelled']]);
    void sessions;
  });

  it('REQ-ORCH-050: with a cap of 1 the second child parks waiting_on_model_slot and is promoted when the first ends', async () => {
    let releaseFirst!: () => void;
    const hold = new Promise<void>((r) => { releaseFirst = r; });
    let childCalls = 0;
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]);
        return answer('both done');
      }
      if (persona === 'summariser') return answer('{"summary":"ok"}');
      childCalls += 1;
      // the first child holds its slot until the second has been delegated and parked
      return childCalls === 1 ? { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('done');
    }, { cap: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 200 && !(children(sid).length === 2 && children(sid)[1]!.state === 'waiting_on_model_slot'); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(children(sid).map((c) => c.state).sort()).toEqual(['running', 'waiting_on_model_slot']);
    releaseFirst();
    await sessions.running(sid)!;
    const rows = children(sid);
    expect(rows.map((c) => c.state)).toEqual(['succeeded', 'succeeded']);
    const delegateRows = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
    expect(delegateRows[1]!.output).toMatch(/waiting_on_model_slot — Queued behind model 'm''s slot cap: 1 of 1 slots in use/);
    const trans = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; from_state: string; to_state: string });
    const two = rows.find((c) => c.canonical_name === 'two')!.task_id;
    expect(trans.filter((t) => t.child_id === two).map((t) => t.to_state)).toEqual(['queued', 'starting', 'running', 'summarizing', 'succeeded']);
  });

  it('REQ-MONITOR-009 / REQ-ORCH-133: cancelAgent settles one child cancelled with the user\'s timeline entry; the reserved id cancels the run; unknown ids refuse', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
      if (persona === 'summariser') return answer('{"summary":"x"}');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    const id = children(sid)[0]!.task_id;
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'bg_00000000' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: false });
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('child_user_cancelled');
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(children(sid)[0]!.state).toBe('cancelled');
    void millis;
  });

  describe('PD-ORCH-005 phase 3: a pause, a stop and a quit leave every unfinished agent paused, and a cancel stops what it cancels', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;

    /** Two background children under a cap of one: `one` is mid-step on a held model call, `two` waits on the slot. */
    function heldPair(publisher?: Publisher) {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const seen = { summaries: 0, childSteps: 0, orchestratorSteps: 0 };
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          seen.orchestratorSteps += 1;
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        }
        if (persona === 'summariser') { seen.summaries += 1; return answer('{"summary":"x"}'); }
        seen.childSteps += 1;
        // The step in flight when the pause is accepted finishes by asking for a call; every later step answers.
        if (seen.childSteps > 1) return answer('done');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { cap: 1, ...(publisher ? { publisher } : {}) });
      return { sessions, client, seen, release: () => release() };
    }

    it('clause 2, the repair of a-pause-settles-children-instead-of-holding-them: no model call after the pause, no queued child starts, nothing summarises — every unfinished agent is left paused where it stood and the iteration open', async () => {
      const { sessions, seen, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      // No summarising call, no step of the parked child, nothing after the pause but the step already in flight.
      expect(seen).toEqual({ summaries: 0, childSteps: 1, orchestratorSteps: 2 });
      expect(byName(sid, 'one')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'running', completed_at: null, report_stored: 0 });
      expect(byName(sid, 'two')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'waiting_on_model_slot', completed_at: null, report_stored: 0 });
      // The call the in-flight step asked for never ran, and the record says so for the resume to read.
      const last = conversationOf(dal.agentConversation(sid, byName(sid, 'one').task_id)).at(-1)!;
      expect(last.role).toBe('tool');
      expect(last.content).toEqual([expect.objectContaining({ callId: 'p1', isError: true, result: expect.stringMatching(/^This call was not run: it was interrupted by the pause/) })]);
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption: 'pause' }]);
      expect(dal.eventsOfKind(sid, 'iteration.end')).toHaveLength(0);
      // The open iteration still holds its task: neither re-queued nor closed.
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks[0]!.state).toBe('in_progress');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toHaveLength(2);
      expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'iteration_paused')!.metadata)).toMatchObject({ iteration: 1, interruption: 'pause', paused_agents: 3 });
    });

    it('clause 3: a quit (the application closing its sessions) leaves the same state, recorded as quit', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      const closing = sessions.closeAll();
      release();
      await closing;
      expect(children(sid).map((c) => [c.canonical_name, c.state, c.interruption]).sort()).toEqual([['one', 'paused', 'quit'], ['two', 'paused', 'quit']]);
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'quit' }]);
      expect(dal.getSession(sid)!.stop_reason).toBe('application_shutdown');
    });

    it('REQ-ORCH-053 narrowed: the stale-child settle leaves a paused agent as it is', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      release();
      await sessions.running(sid)!;
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 5, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      expect((await import('./orchestration.js')).settleStaleChildren(dal, w.value, sid, () => undefined)).toBe(0);
      expect(children(sid).map((c) => c.state)).toEqual(['paused', 'paused']);
    });

    it('clause 4: the Continue action resumes the open iteration — each paused child carries on from its record under its identity (the parked one from its slot), and the root from its own', async () => {
      const { sessions, client, seen, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      release();
      await sessions.running(sid)!;
      const [iteration] = dal.iterationsOf(sid);
      const rootRequestsBefore = seen.orchestratorSteps;
      const identity = (name: string) => { const c = byName(sid, name); return { task_id: c.task_id, canonical_name: c.canonical_name, persona: c.persona, parent_id: c.parent_id, depends_on: c.depends_on, background: c.background, write_scope: c.write_scope, iteration: c.iteration }; };
      const before = { one: identity('one'), two: identity('two') };
      const oneRecord = conversationOf(dal.agentConversation(sid, before.one.task_id));

      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The same iteration, closed now, under the same root; nothing new appended to the todo.
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'succeeded', root_task_id: iteration!.root_task_id, interruption: null }]);
      for (const name of ['one', 'two'] as const) {
        expect(identity(name)).toEqual(before[name]);
        expect(byName(sid, name)).toMatchObject({ state: 'succeeded', interruption: null, resume_state: null, report_stored: 1 });
      }
      // `one` carried on from its record — the call its step asked for recorded as never run — and answered. (Its only call
      // never ran, so REQ-ORCH-095's one re-prompt follows, as for any child that acted on nothing.)
      expect(conversationOf(dal.agentConversation(sid, before.one.task_id)).slice(0, oneRecord.length + 1)).toEqual([...oneRecord, { role: 'assistant', content: [{ kind: 'text', text: 'done' }] }]);
      // `two` never started before the pause, so it starts now from its payload; each child summarised once, after the resume.
      expect(seen.summaries).toBe(2);
      // The root had answered and was waiting on its children, so it resumed into waiting: every step it took after the
      // resume answered a child's end, and none followed its own answer.
      const orchestrator = client.requests.filter((r) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? ''));
      const resumedSteps = orchestrator.slice(rootRequestsBefore);
      expect(resumedSteps.length).toBeGreaterThan(0);
      for (const r of resumedSteps) expect(r.messages.at(-1)!.role).toBe('user');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_resumed').map((t) => (JSON.parse(t.metadata) as { resume_state: string }).resume_state).sort()).toEqual(['running', 'waiting_on_model_slot']);
      const trans = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; from_state: string; to_state: string });
      expect(trans.filter((t) => t.child_id === before.two.task_id).map((t) => t.to_state)).toEqual(['paused', 'waiting_on_model_slot', 'queued', 'starting', 'running', 'summarizing', 'succeeded']);
    });

    /** One background child whose steps the test scripts one by one; each step may wait on the promise it is given. */
    function scriptedChild(steps: readonly ((n: number) => ScriptedCall)[], over: { childTimeoutMs?: number; summary?: (req: ModelRequest) => ScriptedCall; root?: (turn: number) => ScriptedCall; tool?: TestTool; deaf?: readonly string[]; hooks?: HookPort; drainTimeoutMs?: number } = {}) {
      const seen = { summaries: 0, childSteps: 0 };
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return over.root?.(turn) ?? (turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work', write_scope: ['src/**'] } }]) : answer('ok'));
        if (persona === 'summariser') { seen.summaries += 1; return over.summary?.(req) ?? answer('{"summary":"x"}'); }
        seen.childSteps += 1;
        return (steps[seen.childSteps - 1] ?? (() => answer('done')))(seen.childSteps);
      }, over);
      return { sessions, seen, client };
    }
    const gate = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
    const look = (): ScriptedCall => toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Looking.');
    async function pauseAt(sessions: Sessions, sid: SessionId, reached: () => boolean, release: () => void): Promise<void> {
      await settle(reached);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
    }

    it('clause 4: a child whose turn had finished resumes `summarizing` and writes its report from its record, with no step of its own', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([look, () => ({ parts: [{ hold: g.hold }, ...answer('Finished the work.').parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 2, g.open);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'summarizing' });
      expect(seen.summaries).toBe(0);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', report_stored: 1 });
      expect(seen).toEqual({ summaries: 1, childSteps: 2 });
      // It is summarising already: no move into the state it is in is attempted, so none is refused.
      expect(warnings.filter((w) => /summarizing/.test(w))).toEqual([]);
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ final_response: 'Finished the work.' });
    });

    it('clause 4 with REQ-ORCH-095: a resumed child that worked before the rest is not re-prompted for answering without a call after it', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([look, () => ({ parts: [{ hold: g.hold }, ...look().parts] }), () => answer('Finished.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 2, g.open);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'running', tool_calls: 1 });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      // One step after the resume, and no "Carry out the task now": its call before the rest counts.
      expect(seen.childSteps).toBe(3);
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', tool_calls: 1 });
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ final_response: 'Finished.' });
      // REQ-MONITOR-102: the session total counts each call once — the root's delegate and the child's call before the rest.
      expect(dal.getSession(sid)!.tool_calls).toBe(2);
    });

    it('clause 4 with REQ-ORCH-095 (found by phase 4\'s review): a child resumed `summarizing` was assessed before the rest, and is not re-prompted a second time', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([() => answer('I would do it.'), () => answer('I would do it, really.')], { summary: () => ({ parts: [{ hold: g.hold }, ...answer('{"summary":"s"}').parts] }) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'summarizing');
      // Its one re-prompt was spent: the second step answered "Carry out the task now".
      expect(seen.childSteps).toBe(2);
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'summarizing' });
      g.open();
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      // No third step: it wrote its report from its record, as it would have before the stop.
      expect(seen.childSteps).toBe(2);
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', report_stored: 1 });
    });

    it('clause 10 (found by phase 4\'s review): a child that was summarising and is told of its background sessions resumes `running`, since it takes a step to read the notice', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([look, () => ({ parts: [{ hold: g.hold }, ...answer('Finished.').parts] }), look, () => answer('Finished, the server checked.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 2, g.open);
      const work = byName(sid, 'work');
      expect(work).toMatchObject({ state: 'paused', resume_state: 'summarizing' });
      dal.upsertAgentTerminal({ session_id: sid, terminal_id: 'ts_serve', task_id: work.task_id, command: 'serve', started_at: '2026-09-27T00:00:00.000Z', state: 'running', exit_code: null, output_tail: 'listening', updated_at: '2026-09-27T00:00:01.000Z' });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(seen.childSteps).toBe(4);
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; to_state: string }).filter((t) => t.child_id === work.task_id).map((t) => t.to_state);
      expect(moves.slice(moves.lastIndexOf('paused') + 1)).toEqual(['running', 'summarizing', 'succeeded']);
    });

    it('clause 4 (OQ-97): a root that had answered and was waiting resumes into waiting, and its next message is its child\'s report — not its launch prompt', async () => {
      const g = gate();
      const delegate = toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
      const { sessions, seen, client } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...look().parts] }), () => answer('Finished.')], { root: (turn) => (turn === 1 ? delegate : answer(turn === 2 ? 'Delegated; waiting.' : 'Read the report.')) });
      const sid = (sessions.start(dal, 'C:/ws', 'the launch prompt') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g.open);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      const rootCalls = client.requests.filter((r) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? ''));
      // Two steps before the pause; after it, no step until the report — then one, over the report.
      expect(rootCalls).toHaveLength(3);
      const last = rootCalls.at(-1)!.messages.at(-1)!;
      const said = last.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
      expect(last.role).toBe('user');
      expect(said).not.toBe('the launch prompt');
      expect(said).toContain('work');
    });

    it('clause 10: a resumed child is told of the background sessions it had started, and the notice joins its record', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([look, () => ({ parts: [{ hold: g.hold }, ...look().parts] }), () => answer('Finished.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 2, g.open);
      const work = byName(sid, 'work').task_id;
      dal.upsertAgentTerminal({ session_id: sid, terminal_id: 'ts_serve', task_id: work, command: 'serve', started_at: '2026-09-27T00:00:00.000Z', state: 'running', exit_code: null, output_tail: 'listening', updated_at: '2026-09-27T00:00:01.000Z' });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      const told = conversationOf(dal.agentConversation(sid, work)).filter((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.startsWith('You were paused and have now resumed.')));
      expect(told).toHaveLength(1);
    });

    it('clause 4: a child the pause held before it started starts as soon as it resumes — beside the root\'s resumed step, not after it', async () => {
      const delegating = gate();
      const rootStep = gate();
      const { sessions, seen } = scriptedChild([() => answer('Finished.')], {
        root: (turn) => (turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : turn === 2 ? { parts: [{ hold: rootStep.hold }, ...answer('Delegated; waiting.').parts] } : answer('ok')),
        // The delegate call is in flight when the pause is accepted: it finishes, and its child is held unstarted.
        tool: (name, _a, _ctx, builtIn) => (name === 'delegate' ? delegating.hold.then(builtIn) : undefined),
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'delegate'), delegating.open);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause' });
      expect(seen.childSteps).toBe(0);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      // The root's resumed step is in flight, and the child has already started.
      await settle(() => seen.childSteps >= 1);
      expect(seen.childSteps).toBeGreaterThanOrEqual(1);
      rootStep.open();
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded' });
    });

    describe('clause 4 (found by phase 4\'s review): a resumed child\'s end is a scheduler pass, so a sibling it held starts and the run ends', () => {
      const probe: TestTool = (name) => (name === 'probe' ? Promise.resolve({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }) : undefined);
      /** `aa` holds its first step until the pause; `bb` waits on `aa`, by `hold`; the root then waits on every child. */
      async function heldBehind(hold: 'slot' | 'dependency'): Promise<string> {
        const g = gate();
        const seen = { a: 0 };
        let sid = '' as SessionId;
        const waitAll = (turn: number) => toolCalls([{ callId: `w${turn}`, name: 'wait_for_tasks', args: { task_ids: [] } }], 'Waiting.');
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') {
            if (hold === 'slot') {
              if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'aa', task: 'TASK: aa' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'bb', task: 'TASK: bb' } }]);
              return turn <= 3 ? waitAll(turn) : answer('root done');
            }
            if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'aa', task: 'TASK: aa' } }]);
            if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'bb', task: 'TASK: bb', depends_on: [byName(sid, 'aa').task_id] } }]);
            return turn <= 4 ? waitAll(turn) : answer('root done');
          }
          if (persona === 'summariser') return answer('{"summary":"s"}');
          if (!userText(req).includes('TASK: aa')) return answer('bb done');
          seen.a += 1;
          return seen.a === 1 ? { parts: [{ hold: g.hold }, ...toolCalls([{ callId: 'p1', name: 'probe', args: {} }], 'Probing.').parts] } : answer('aa done');
        }, { tool: probe, ...(hold === 'slot' ? { cap: 1 } : {}) });
        sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await pauseAt(sessions, sid, () => seen.a === 1 && byName(sid, 'bb')?.state === (hold === 'slot' ? 'waiting_on_model_slot' : 'waiting_on_dependencies') && dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks'), g.open);
        expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
        const ended = await Promise.race([sessions.running(sid)!.then((r) => r.status), new Promise<string>((r) => { setTimeout(() => r('hung'), 3_000); })]);
        if (ended === 'hung') sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } });
        expect(byName(sid, 'bb')).toMatchObject({ state: 'succeeded' });
        return ended;
      }

      it('a sibling held on the model slot the resumed child frees', async () => {
        expect(await heldBehind('slot')).toBe('completed');
      });

      it('a sibling that depends on the resumed child', async () => {
        expect(await heldBehind('dependency')).toBe('completed');
      });
    });

    describe('before the resumed iteration begins (found by phase 4\'s review)', () => {
      /** A child left paused mid-step, and a root that answered and waits: the session at rest with an iteration open. */
      async function pausedWithChild(images = false) {
        const g = gate();
        const root = { steps: 0, requests: [] as ModelRequest[] };
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') {
            root.steps = turn;
            root.requests.push(req);
            return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer(`root step ${turn}`);
          }
          if (persona === 'summariser') return answer('{"summary":"s"}');
          return { parts: [{ hold: g.hold }, ...answer('work done').parts] };
        }, { images });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await pauseAt(sessions, sid, () => root.steps === 2 && byName(sid, 'work')?.state === 'running', g.open);
        expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
        return { sessions, sid, root };
      }

      it('clause 3: the explicit cancel of the continue ends what it would have resumed, and the iteration closes', async () => {
        const { sessions, sid } = await pausedWithChild();
        expect(sessions.prompt(sid, 'go on').ok).toBe(true);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        await sessions.running(sid)!;
        expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
      });

      it('clause 4: a continue by message that comes to rest at once still delivers its message, which the resumed root reads next time', async () => {
        const { sessions, sid, root } = await pausedWithChild();
        expect(sessions.prompt(sid, 'PLEASE ALSO DO X').ok).toBe(true);
        expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
        await sessions.running(sid)!;
        const rootId = dal.iterationsOf(sid)[0]!.root_task_id;
        // Delivered at the continue: the message is the root's next message in its record, whatever came after.
        expect(conversationOf(dal.agentConversation(sid, rootId)).at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: 'PLEASE ALSO DO X' }] });
        expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
        await sessions.running(sid)!;
        const said = (r: ModelRequest) => r.messages.filter((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === 'PLEASE ALSO DO X')).length;
        expect(said(root.requests.at(-1)!)).toBe(1);
      });

      it('clause 4: the message a continue delivers carries the images attached to it', async () => {
        const { sessions, sid } = await pausedWithChild(true);
        const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString('base64');
        expect(sessions.prompt(sid, 'look at this', [{ name: 'shot.png', mediaType: 'image/png', size: 9, base64: png }]).ok).toBe(true);
        sessions.control({ op: 'pause', sessionId: sid, args: {} });
        await sessions.running(sid)!;
        const rootId = dal.iterationsOf(sid)[0]!.root_task_id;
        expect(conversationOf(dal.agentConversation(sid, rootId)).at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: 'look at this' }, { kind: 'image', mediaType: 'image/png', base64: png }] });
      });
    });

    it('clause 7: an iteration interrupted again after a resume is resumed in turn — the same iteration, the same agents', async () => {
      const g1 = gate();
      const g2 = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g1.hold }, ...look().parts] }), () => ({ parts: [{ hold: g2.hold }, ...look().parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g1.open);
      const work = byName(sid, 'work').task_id;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await pauseAt(sessions, sid, () => seen.childSteps === 2, g2.open);
      expect(byName(sid, 'work')).toMatchObject({ task_id: work, state: 'paused', interruption: 'pause' });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work')).toMatchObject({ task_id: work, state: 'succeeded' });
      expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded']]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'iteration_resumed')).toHaveLength(2);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toHaveLength(2);
    });

    it('PD-TOOLS-006 revision 2: a resumed child claims its stored write scope again from the moment it is resumed', async () => {
      const g1 = gate();
      const g2 = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g1.hold }, ...look().parts] }), () => ({ parts: [{ hold: g2.hold }, ...answer('done').parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g1.open);
      expect(byName(sid, 'work').write_scope).toBe('["src/**"]');
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => seen.childSteps === 2);
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      // The root is refused a write into the resumed child's scope, and the child itself is not.
      expect(sessions.run(sid)!.writeClaimFor(root, 'src/a.ts')).toMatchObject({ canonicalName: 'work', pattern: 'src/**' });
      expect(sessions.run(sid)!.writeClaimFor(byName(sid, 'work').task_id, 'src/a.ts')).toBeNull();
      g2.open();
      await sessions.running(sid)!;
    });

    it('PD-TOOLS-006 revision 2 (OQ-97): resumed children re-claim in the order they were first accepted, so the child accepted first still holds an overlap', async () => {
      const first = gate();
      const second = gate();
      const steps = new Map<string, number>();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls(['one', 'two'].map((name, i) => ({ callId: `d${i}`, name: 'delegate', args: { persona: 'coding-agent', task_name: name, task: `TASK: ${name}`, write_scope: ['src/**'] } }))) : answer('ok');
        if (persona === 'summariser') return answer('{"summary":"s"}');
        const name = userText(req).includes('TASK: one') ? 'one' : 'two';
        const n = (steps.get(name) ?? 0) + 1;
        steps.set(name, n);
        return { parts: [{ hold: n === 1 ? first.hold : second.hold }, ...(n === 1 ? look() : answer('done')).parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => steps.get('one') === 1 && steps.get('two') === 1, first.open);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => steps.get('one') === 2 && steps.get('two') === 2);
      const run = sessions.run(sid)!;
      expect(run.writeClaimFor(byName(sid, 'two').task_id, 'src/a.ts')).toMatchObject({ canonicalName: 'one' });
      expect(run.writeClaimFor(byName(sid, 'one').task_id, 'src/a.ts')).toBeNull();
      second.open();
      await sessions.running(sid)!;
    });

    it('clause 4 (found by phase 4\'s review): a resumed iteration starts once and counts once, and the run goes on to the next iteration numbered after it', async () => {
      const g1 = gate();
      const g2 = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g1.hold }, ...look().parts] }), () => ({ parts: [{ hold: g2.hold }, ...answer('done').parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g1.open);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => seen.childSteps === 2);
      // A prompt queued during the resumed iteration is a task for the next one (REQ-CHAT-040).
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'and then this' } }).ok).toBe(true);
      g2.open();
      await sessions.running(sid)!;
      expect(dal.iterationsOf(sid).map((i) => [i.iteration, i.state])).toEqual([[1, 'closed'], [2, 'closed']]);
      expect(dal.eventsOfKind(sid, 'iteration.start').map((e) => e.iteration)).toEqual([1, 2]);
      expect(dal.getSession(sid)!.iterations_completed).toBe(2);
    });

    it('clause 4: a resumed child\'s child_timeout starts afresh', async () => {
      const g1 = gate();
      const g2 = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g1.hold }, ...look().parts] }), () => ({ parts: [{ hold: g2.hold }, ...answer('done').parts] })], { childTimeoutMs: 10_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => seen.childSteps === 1);
      clock.advance(9_000);
      await pauseAt(sessions, sid, () => true, g1.open);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => seen.childSteps === 2);
      // 18 s in all, 9 s since the resume: under a fresh 10 s limit the child is not asked to land.
      clock.advance(9_000);
      g2.open();
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded' });
      expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('child_timeout_fallback');
      expect(JSON.parse(byName(sid, 'work').report!).errors).toEqual([]);
    });

    it('clauses 6 and 19, declined: the count includes the root; "continue without them" ends the paused agents cancelled, closes the open iteration cancelled, and works in a new one', async () => {
      const snapshots: SessionRecord[] = [];
      const { sessions, release } = heldPair({ increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      release();
      await sessions.running(sid)!;
      // Clause 6: what the Continue action states — the open iteration, its root and its two paused agents. Clause 19:
      // the count includes the root, which resumes with them (`1 +` in `resumableOf`).
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 3 });
      expect(snapshots.at(-1)!.resumable).toEqual({ iteration: 1, agents: 3 });
      expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
      await sessions.running(sid)!;
      expect(resumableOf(dal, dal.getSession(sid)!)).toBeNull();
      expect(snapshots.at(-1)!.resumable).toBeNull();
      for (const name of ['one', 'two']) {
        expect(byName(sid, name)).toMatchObject({ state: 'cancelled', interruption: 'pause', report_stored: 1 });
        expect(JSON.parse(byName(sid, name).report!)).toMatchObject({ status: 'cancelled', summary: expect.stringMatching(/continued without this agent, which the pause had left paused/) });
        // REQ-LIBRARY-092: a declined agent's report is an artifact like every other terminal child's.
        expect(dal.artifactsOf(sid).filter((a) => a.source_task_id === byName(sid, name).task_id).map((a) => [a.kind, a.status])).toEqual([['child_report', 'cancelled']]);
      }
      // The declined iteration's task stays anchored (REQ-ORCH-135): it is worked again, in a new iteration.
      const rows = dal.iterationsOf(sid);
      expect(rows.slice(0, 2).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled'], [2, 'closed', 'succeeded']]);
      expect(rows[1]!.todo_task_id).toBe(rows[0]!.todo_task_id);
      expect(rows[1]!.root_task_id).not.toBe(rows[0]!.root_task_id);
      const first = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; summary: string }).find((e) => e.iteration === 1)!;
      expect(first.summary).toBe('the session was continued without the agents the pause had left paused');
    });

    it('REQ-SESSION-092 (found by phase 3\'s review): a stop waits for its child executions within the 30 s grace, so a child\'s call that ignores the stop cannot hold the run open (a root\'s still can: docs/defects/a-root-call-that-ignores-the-stop-holds-the-run-open.md)', async () => {
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
        return toolCalls([{ callId: 'h1', name: 'hang', args: {} }], 'Hanging.');
      }, { tool: (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang'));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      const ended = await Promise.race([sessions.running(sid)!.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1_000))]);
      expect(ended).toBe(true);
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running' });
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'stop' }]);
    });

    it('clause 2 (found by phase 3\'s review): a child that ended with a report its parent has not been given leaves the parent unfinished — the rest holds the iteration open', async () => {
      const g = gate();
      const delegate = toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
      const { sessions } = scriptedChild([look, () => answer('done')], { root: (turn) => (turn === 1 ? delegate : { parts: [{ hold: g.hold }, ...answer('Mid-step.').parts] }) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => byName(sid, 'work')?.state === 'succeeded', g.open);
      // The child's report was never given to the root: the root is not done, so the iteration is open and the report owed.
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', observed: 0 });
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks[0]!.state).toBe('in_progress');
    });

    it('clause 2 with REQ-ORCH-095: a child that answered without a call when the pause came still owes its re-prompt, so it resumes running, not summarising', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...answer('I would do it.').parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g.open);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'running' });
      expect(seen).toEqual({ summaries: 0, childSteps: 1 });
    });

    it('clause 3 (found by phase 3\'s review): the explicit cancel is final even while the run is coming to rest — nothing is left paused and the iteration closes', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      // The root is woken and its turn comes to rest, which then waits on `one`'s step in flight: the user cancels the run
      // in that window, after the rest began and before it paused anything.
      await new Promise((r) => setTimeout(r, 20));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(children(sid).map((c) => c.state)).toEqual(['cancelled', 'cancelled']);
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled', interruption: null }]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toEqual([]);
    });

    it('REQ-ORCH-133 (found by phase 3\'s review): a child cancelled while it summarises keeps the cancellation\'s report — the summarising call is aborted and nothing is written over it', async () => {
      const g = gate();
      let summarising: AbortSignal | null = null;
      const { sessions, seen } = scriptedChild([look, () => answer('Finished.')], { summary: (req) => { summarising = req.signal; return { parts: [{ hold: g.hold }, ...answer('{"summary":"the summariser won"}').parts] }; } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.summaries === 1);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      expect(summarising!.aborted).toBe(true);
      g.open();
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_end')).toEqual([]);
    });

    describe('the summarising pass cut short (found by phase 3\'s second review): no summarising call follows it', () => {
      /** A child that answers and is left summarising, its first summarising call held; every later one is counted. */
      function summarisingChild(first: () => ScriptedCall) {
        const g = gate();
        const seen = { calls: 0 };
        const { sessions } = scriptedChild([() => answer('Finished.')], { summary: () => { seen.calls += 1; return seen.calls === 1 ? { parts: [{ hold: g.hold }, ...first().parts] } : answer('{"summary":"a later attempt"}'); } });
        return { sessions, seen, open: g.open };
      }
      const usable = () => answer('{"summary":"the first attempt"}');

      it('REQ-ORCH-133: cancelling the child aborts the pass and it makes no second attempt', async () => {
        const { sessions, seen, open } = summarisingChild(usable);
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.calls === 1);
        sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } });
        await sessions.running(sid)!;
        open();
        await new Promise((r) => setTimeout(r, 20));
        expect(seen.calls).toBe(1);
        expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      });

      it('clause 3: a stop aborts the pass, and the child is left paused to summarise when it resumes', async () => {
        const { sessions, seen, open } = summarisingChild(usable);
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.calls === 1);
        sessions.control({ op: 'cancel', sessionId: sid, args: {} });
        await sessions.running(sid)!;
        open();
        expect(seen.calls).toBe(1);
        expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'summarizing', report_stored: 0 });
      });

      it('clause 3 "as today" (found by phase 3\'s third review): the explicit cancel does not abort the pass — REQ-ORCH-080\'s drain lets the child write its report', async () => {
        const g = gate();
        const seen = { calls: 0 };
        const { sessions } = scriptedChild([() => answer('Finished.')], { drainTimeoutMs: 60_000, summary: () => { seen.calls += 1; return { parts: [{ hold: g.hold }, ...usable().parts] }; } });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.calls === 1);
        sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } });
        await new Promise((r) => setTimeout(r, 20));
        g.open();
        await sessions.running(sid)!;
        expect(seen.calls).toBe(1);
        expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', interruption: null });
        expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ summary: 'the first attempt' });
      });

      it('clause 2: the call in flight when the pause came finishes; an unusable answer is not retried, and the child is left paused', async () => {
        const { sessions, seen, open } = summarisingChild(() => answer('not json at all'));
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await pauseAt(sessions, sid, () => byName(sid, 'work')?.state === 'summarizing' && seen.calls === 1, open);
        expect(seen.calls).toBe(1);
        expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'summarizing', report_stored: 0 });
      });

      it('clause 2: a usable answer to the call in flight is the child\'s report — it finished before the rest', async () => {
        const { sessions, seen, open } = summarisingChild(usable);
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await pauseAt(sessions, sid, () => byName(sid, 'work')?.state === 'summarizing' && seen.calls === 1, open);
        expect(seen.calls).toBe(1);
        expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', report_stored: 1 });
      });
    });

    it('REQ-SESSION-094 (found by phase 3\'s second review): an execution the stop\'s grace gave up on writes nothing into the finished session when it returns', async () => {
      let late!: () => void;
      const returning = new Promise<void>((r) => { late = r; });
      // A call that ignores the stop's abort and returns only when the test lets it — after the run has ended.
      const { sessions } = scriptedChild([() => toolCalls([{ callId: 'h1', name: 'hang', args: {} }], 'Hanging.')], { tool: (name) => (name === 'hang' ? returning.then((): PortToolResult => ({ text: 'finally', isError: false, status: 'ok', durationMs: 1, label: 'hang', args: {} })) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang'));
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await sessions.running(sid)!;
      const before = { timeline: dal.timelineOf(sid).length, rows: dal.residentRows(sid), child: byName(sid, 'work'), record: dal.agentConversation(sid, byName(sid, 'work').task_id).length };
      expect(before.child).toMatchObject({ state: 'paused', interruption: 'stop' });
      // Clauses 3 and 4 (found by phase 3's third review): the call it never returned from is answered as interrupted in
      // its record, and its row settles, so it resumes from a record whose every call has its result.
      expect(conversationOf(dal.agentConversation(sid, before.child.task_id)).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'h1', name: 'hang', isError: true, result: interruptedResult('stop', true, '') }] });
      expect(before.rows.filter((r) => r.tool_name === 'hang').map((r) => r.tool_status)).toEqual(['failed']);
      late();
      await new Promise((r) => setTimeout(r, 30));
      expect(dal.timelineOf(sid)).toHaveLength(before.timeline);
      expect(dal.residentRows(sid)).toEqual(before.rows);
      expect(byName(sid, 'work')).toEqual(before.child);
      expect(dal.agentConversation(sid, before.child.task_id)).toHaveLength(before.record);
    });

    it('REQ-SESSION-094 (found by phase 3\'s third review): a summarising call the stop\'s grace gave up on writes no report when it returns', async () => {
      const g = gate();
      // The summariser ignores its abort, so its call outlives the stop.
      const { sessions } = scriptedChild([() => answer('Finished.')], { deaf: ['summariser'], summary: () => ({ parts: [{ hold: g.hold }, ...answer('{"summary":"late summary"}').parts] }) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'summarizing');
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await sessions.running(sid)!;
      const before = { timeline: dal.timelineOf(sid).length, child: byName(sid, 'work') };
      expect(before.child).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'summarizing', report_stored: 0 });
      g.open();
      await new Promise((r) => setTimeout(r, 30));
      expect(byName(sid, 'work')).toEqual(before.child);
      expect(dal.timelineOf(sid)).toHaveLength(before.timeline);
    });

    it('clause 3 (found by phase 3\'s third review): the explicit cancel that lands while teardown runs its hooks cancels the paused agents in the cancel\'s own words, and every terminal record counts the iteration it closes', async () => {
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      let ending = false;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event) => { if (event === 'session_end') { ending = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const g = gate();
      const { sessions } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...look().parts] })], { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      g.open();
      await settle(() => ending);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause' });
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      releaseHook();
      const result = await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ summary: 'Cancelled: the user cancelled the run after it had come to rest.' });
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
      expect(result.iterations_completed).toBe(1);
      expect(dal.getSession(sid)!.iterations_completed).toBe(1);
      const results = dal.eventsOfKind(sid, 'result').map((e) => JSON.parse(e.payload) as { result: { iterations_completed: number } });
      expect(results.at(-1)!.result.iterations_completed).toBe(1);
      expect(dal.residentRows(sid).filter((r) => r.kind === 'system').at(-1)!.body).toBe('Run paused: interrupted by user.');
    });

    it('clause 3 (found by phase 3\'s third review): an explicit cancel that lands once teardown can no longer close anything is refused, not lost', async () => {
      let releaseResult!: () => void;
      const resultHold = new Promise<void>((r) => { releaseResult = r; });
      let delivering = false;
      const { sessions } = scriptedChild([look]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => { if (e.event === 'result') { delivering = true; return resultHold; } return undefined; } });
      await settle(() => byName(sid, 'work')?.state === 'running');
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await settle(() => delivering);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: false });
      releaseResult();
      await sessions.running(sid)!;
    });

    it('OQ-96 (found by phase 3\'s second review): a child whose execution raises while the run comes to rest is left paused, as the root is', async () => {
      let raise!: () => void;
      const raised = new Promise<void>((r) => { raise = r; });
      const { sessions } = scriptedChild([() => toolCalls([{ callId: 'b1', name: 'boom', args: {} }], 'Trying.')], { tool: (name) => (name === 'boom' ? raised.then((): PortToolResult => { throw new Error('the tool host went away'); }) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'boom'), raise);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'running', report_stored: 0 });
      // The call it raised out of is answered as interrupted, and its row settles (found by phase 3's third review).
      expect(conversationOf(dal.agentConversation(sid, byName(sid, 'work').task_id)).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'b1', name: 'boom', isError: true, result: interruptedResult('pause', true, '') }] });
      expect(dal.residentRows(sid).filter((r) => r.tool_name === 'boom').map((r) => r.tool_status)).toEqual(['failed']);
    });

    describe('clauses 3 and 4 (found by phase 3\'s fourth review): a call that completed in the step that raised, or was given up on, keeps its result', () => {
      const wrote: PortToolResult = { text: 'wrote the file', isError: false, status: 'ok', durationMs: 1, label: 'write', args: {} };
      const step = () => toolCalls([{ callId: 'w1', name: 'write', args: {} }, { callId: 'b2', name: 'boom', args: {} }], 'Write, then boom.');
      const expectAnswered = (sid: SessionId, cause: 'pause' | 'stop') => {
        expect(conversationOf(dal.agentConversation(sid, byName(sid, 'work').task_id)).at(-1)).toEqual({ role: 'tool', content: [
          { kind: 'tool-result', callId: 'w1', name: 'write', isError: false, result: 'wrote the file' },
          { kind: 'tool-result', callId: 'b2', name: 'boom', isError: true, result: interruptedResult(cause, true, '') },
        ] });
        expect(dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.name === 'work').map((r) => [r.tool_name, r.tool_status])).toEqual([['write', 'ok'], ['boom', 'failed']]);
      };

      it('a call raised out of during a pause', async () => {
        let raise!: () => void;
        const raised = new Promise<void>((r) => { raise = r; });
        const { sessions } = scriptedChild([step], { tool: (name) => (name === 'write' ? Promise.resolve(wrote) : name === 'boom' ? raised.then((): PortToolResult => { throw new Error('the tool host went away'); }) : undefined) });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await pauseAt(sessions, sid, () => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'boom'), raise);
        expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause' });
        expectAnswered(sid, 'pause');
      });

      it('a call the stop\'s grace gave up on', async () => {
        const { sessions } = scriptedChild([step], { tool: (name) => (name === 'write' ? Promise.resolve(wrote) : name === 'boom' ? new Promise<PortToolResult>(() => undefined) : undefined) });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'boom'));
        sessions.control({ op: 'cancel', sessionId: sid, args: {} });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid)!;
        expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'stop' });
        expectAnswered(sid, 'stop');
      });
    });

    it('REQ-TOOLS-156 at a rest: a parent waiting in wait_for_tasks is released at once, and its wait is recorded as interrupted', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          return turn === 2 ? toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]) : answer('never');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      await settle(() => !sessions.isRunActive(sid) || dal.getSession(sid)!.execution_status !== 'pausing');
      release();
      await sessions.running(sid)!;
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const waited = conversationOf(dal.agentConversation(sid, root)).flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-result' ? [p] : []))).find((p) => p.callId === 'w1');
      expect(waited).toMatchObject({ isError: true, result: expect.stringMatching(/^This call was interrupted by the pause before it completed[\s\S]*The wait for .* was interrupted by the pause: the tasks were paused with the run/) });
      expect(children(sid)[0]).toMatchObject({ state: 'paused', interruption: 'pause' });
    });

    it('REQ-ORCH-133 / REQ-MONITOR-128, the repair of cancelling-one-child-does-not-stop-it: cancelling a child aborts its execution and its descendant\'s, and the cancellation\'s report is the one that stays', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const seen = { summaries: 0, stepsAfterRelease: 0, released: false };
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
        if (persona === 'summariser') { seen.summaries += 1; return answer('{"summary":"x"}'); }
        if (seen.released) seen.stepsAfterRelease += 1;
        const grand = userText(req).includes('TASK: grand');
        const delegated = req.messages.some((m) => m.role === 'tool');
        if (!grand && !delegated) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }], 'Delegating.');
        return { parts: [{ hold }, ...answer(grand ? 'grand late' : 'late').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && children(sid).every((c) => c.state === 'running'));
      const work = byName(sid, 'work').task_id;
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: work } })).toEqual({ ok: true });
      // Both settle at once: the child and, with it, its live descendant.
      expect(children(sid).map((c) => c.state)).toEqual(['cancelled', 'cancelled']);
      seen.released = true;
      release();
      await sessions.running(sid)!;
      // Neither aborted execution took another step, summarised, or wrote over the cancellation's report.
      expect(seen.summaries).toBe(0);
      expect(seen.stepsAfterRelease).toBe(0);
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(JSON.parse(byName(sid, 'grand').report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with work, which the user cancelled.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([{ task_id: work }, { task_id: byName(sid, 'grand').task_id, cancelled_with: work }]);
      // An explicit cancel is final: nothing it ended is paused or carries an interruption.
      expect(children(sid).map((c) => c.interruption)).toEqual([null, null]);
    });
  });

  describe('REQ-ORCH-072: the root execution record identity and lookups', () => {
    it('carries canonical name and task id in the children namespace, and is distinct from delegated children', () => {
      const sid = 'S-root-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const ledger = new ChildLedger({ dal, writer: w.value, sessionId: sid, iteration: 1, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => null, warn: () => undefined });
      expect(ledger.root.taskId).toMatch(TASK_ID_PATTERN);
      expect(ledger.root.canonicalName).toBe('orchestrator');
      expect(ledger.root.persona).toBe('orchestrator');
      expect(ledger.root.depth).toBe(0);
      expect(ledger.root.state).toBe('running');
      // The root record is NOT a delegated child row
      expect(ledger.all()).toHaveLength(0);
      expect(ledger.activeCount()).toBe(0);
      expect(ledger.slotsInUse('m')).toBe(0);
      // isRoot recognizes all forms of identity
      expect(ledger.isRoot(ledger.root.taskId)).toBe(true);
      expect(ledger.isRoot(ledger.root.canonicalName)).toBe(true);
      expect(ledger.isRoot('root')).toBe(true);
      expect(ledger.isRoot('root:1')).toBe(true);
      expect(ledger.isRoot('bg_ffffffff')).toBe(false);
      w.value.release(1, HOST);
    });

    it('wait_for_tasks and background_output lookups naming the root resolve and enforce parent-scoping', async () => {
      const sid = 'S-ops-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      const ops = new IterationChildren({
        dal,
        writer: w.value,
        sessionId: sid,
        workspaceRoot: 'C:/ws',
        owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])),
        clocks: clock,
        model: MODEL,
        thinking: 'unset',
        modelTimeoutMs: 1000,
        modelRetries: 0,
        credentialFor: () => async () => '',
        maxStepsPerTurn: 10,
        budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 },
        modelCap: () => null,
        toolsFor: () => null,
        summariser: null,
        runSignal: new AbortController().signal,
        warn: () => undefined,
      }, 1);
      const rootId = ops.ledger.root.taskId;
      const rootName = ops.ledger.root.canonicalName;
      // 1. Root caller waiting for its own task (by task id, canonical name, 'root', or 'root:1') is refused
      expect(await ops.waitForTasks(rootId, [rootId])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, [rootName])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root'])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root:1'])).toEqual({ refused: 'An agent cannot wait for its own task.' });

      // 2. Child caller waiting for root is refused under parent-scoping, NOT told root is not a task id
      const childId = 'bg_11112222';
      expect(await ops.waitForTasks(childId, [rootId])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, [rootName])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, ['root'])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      // Non-existent invalid id is refused as not a task id
      expect(await ops.waitForTasks(childId, ['not-a-task-id'])).toEqual({ refused: "'not-a-task-id' is not a task id." });

      // 3. background_output naming the root reads as not_found under parent-scoping (caller does not own root)
      expect(ops.backgroundOutput(rootId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootName, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });

      w.value.release(1, HOST);
    });

    it('end-to-end: delegated children carry the root task id as parent_id and steer/cancel resolve the root', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      let rootCapturedTaskId = '';
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with root') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      // Access root execution record identity
      const childRow = children(sid)[0]!;
      rootCapturedTaskId = childRow.parent_id;
      expect(rootCapturedTaskId).toMatch(TASK_ID_PATTERN);
      expect(childRow.depth).toBe(1);

      // Steer by root task id
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: rootCapturedTaskId, text: 'keep going' } })).toMatchObject({ ok: true });
      // Steer by root canonical name
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'orchestrator', text: 'focus' } })).toMatchObject({ ok: true });

      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
    });

    it('end-to-end: cancelAgent naming the root by task id stops the run', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with cancel') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      const childRow = children(sid)[0]!;
      const rootTaskId = childRow.parent_id;

      // Cancel by root task id
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: rootTaskId } })).toEqual({ ok: true });
      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
    });
  });

  describe('PD-ORCH-005 clause 16 (revision 4, OQ-101): one paused child is cancelled while its session rests', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const cancel = (sessions: Sessions, sid: SessionId, agentId: string) => sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });

    /**
     * The root delegates `one` and `two`; `one` delegates `grand` and `quick`, which finishes at once; the others hold a
     * step that asks for a call, so a pause leaves them and the root paused, and `quick` a finished descendant of `one`.
     */
    async function restedFamily() {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const rootAsked: string[] = [];
      const snapshots: SessionRecord[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n'));
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        const text = userText(req);
        if (text.includes('TASK: quick')) return answer('quick done');
        if (text.includes('TASK: one') && !req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }, { callId: 'g2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quick', task: 'TASK: quick' } }], 'Delegating.');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 4 && byName(sid, 'quick').state === 'succeeded' && children(sid).filter((c) => c.state === 'running').length === 3);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(children(sid).map((c) => [c.canonical_name, c.state]).sort()).toEqual([['grand', 'paused'], ['one', 'paused'], ['quick', 'succeeded'], ['two', 'paused']]);
      warnings.length = 0;
      return { sessions, sid, state, rootAsked, snapshots };
    }

    it('it and its paused descendant end cancelled with the live cancel\'s report, entry and artifact; the rest stay paused, the iteration open, and the count drops', async () => {
      const { sessions, sid, snapshots } = await restedFamily();
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 4 });
      const one = byName(sid, 'one').task_id;
      const grand = byName(sid, 'grand').task_id;
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      expect([byName(sid, 'one').state, byName(sid, 'grand').state, byName(sid, 'two').state]).toEqual(['cancelled', 'cancelled', 'paused']);
      // A finished descendant is left as it is, and nothing is attempted on it.
      expect(byName(sid, 'quick').state).toBe('succeeded');
      expect(warnings).toEqual([]);
      expect(JSON.parse(byName(sid, 'one').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(JSON.parse(byName(sid, 'grand').report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with one, which the user cancelled.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([{ task_id: one }, { task_id: grand, cancelled_with: one }]);
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.status === 'cancelled').map((a) => a.source_task_id).sort()).toEqual([one, grand].sort());
      // Clause 16: the iteration stays open, its task still held, and the Continue action's count drops by two.
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 2 });
      const last = snapshots.at(-1)!;
      expect(last.resumable).toEqual({ iteration: 1, agents: 2 });
      expect(Object.fromEntries(last.agents.map((a) => [a.name, a.presentationState]))).toEqual({ one: 'cancelled', two: 'paused', grand: 'cancelled', quick: 'done' });
    });

    it('refused for the run, the root, an unknown id, and an agent no longer paused; a descendant alone takes nothing above it', async () => {
      const { sessions, sid } = await restedFamily();
      const root = dal.openIterationOf(sid)!.root_task_id;
      for (const id of [RUN_AGENT_ID, root, 'bg_ffffffff', '']) expect(cancel(sessions, sid, id)).toEqual({ ok: false });
      expect(cancel(sessions, sid, byName(sid, 'grand').task_id)).toEqual({ ok: true });
      expect([byName(sid, 'one').state, byName(sid, 'grand').state, byName(sid, 'two').state]).toEqual(['paused', 'cancelled', 'paused']);
      expect(cancel(sessions, sid, byName(sid, 'grand').task_id)).toEqual({ ok: false });
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 3 });
    });

    it('the continue resumes the rest: the root is given the cancelled child\'s report, the other child finishes, and the iteration closes', async () => {
      const { sessions, sid, state, rootAsked } = await restedFamily();
      expect(cancel(sessions, sid, byName(sid, 'one').task_id)).toEqual({ ok: true });
      state.resumed = true;
      const before = rootAsked.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'two').state).toBe('succeeded');
      expect([byName(sid, 'one').state, byName(sid, 'grand').state]).toEqual(['cancelled', 'cancelled']);
      expect(rootAsked.slice(before).some((t) => t.includes('The user cancelled this child.'))).toBe(true);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
      // Nothing is left open, so nothing is cancellable at rest any more.
      expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false });
    });
    it('a dependent of the cancelled child (OQ-101) is blocked by the resumed run\'s first pass with its `blocked` report and artifact (REQ-ORCH-048 / REQ-ORCH-108 / REQ-LIBRARY-092)', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const rootAsked: string[] = [];
      const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(textOf(req));
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }]);
          const one = /task_id: (bg_[0-9a-f]{8})/.exec(textOf(req))?.[1] ?? '';
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'after', task: 'TASK: after', depends_on: [one] } }]);
          return answer('delegated');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'one').state === 'running' && byName(sid, 'after').state === 'waiting_on_dependencies');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect([byName(sid, 'one').state, byName(sid, 'after').state]).toEqual(['paused', 'paused']);
      const one = byName(sid, 'one').task_id;
      const after = byName(sid, 'after').task_id;
      // Clause 16: the at-rest cancel runs no cascade, so the dependent stays paused until the continue resumes it.
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      expect(byName(sid, 'after').state).toBe('paused');
      state.resumed = true;
      const before = rootAsked.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'after')).toMatchObject({ state: 'blocked', report_stored: 1 });
      expect(JSON.parse(byName(sid, 'after').report!)).toMatchObject({ status: 'blocked', summary: `Blocked: Its dependency one (${one}) ended cancelled, so this child never started (REQ-ORCH-048).` });
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.source_task_id === after).map((a) => a.status)).toEqual(['blocked']);
      // The root is resumed with the blocked child's report, and the iteration closes.
      expect(rootAsked.slice(before).some((t) => t.includes(`Its dependency one (${one}) ended cancelled`))).toBe(true);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    describe('PD-ORCH-005 clause 16 (OQ-101): the cancel is made under the session\'s lock', () => {
      it('a session this process paused holds no lock: the cancel takes it for the write and gives it back; another live process holding it refuses the cancel, writing nothing', async () => {
        const { sessions, sid } = await restedFamily();
        expect(dal.getLock(sid)).toBeUndefined();
        const at = new Date(Number(clock.instant())).toISOString();
        expect(dal.claimLock(sid, 999, HOST, at).claimed).toBe(true);
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'session_locked', message: 'Another process holds this session, so the agent was not cancelled.' } });
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toMatchObject({ pid: 999 });
        dal.releaseLock(sid, 999, HOST);
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: true });
        expect(byName(sid, 'two').state).toBe('cancelled');
        expect(dal.getLock(sid)).toBeUndefined();
      });

      it('a store error while taking the lock involves no other process: it is refused store_failed in the engine\'s words, not session_locked, writing nothing', async () => {
        const { sessions, sid } = await restedFamily();
        const read = vi.spyOn(dal, 'getLock').mockImplementationOnce(() => { throw new Error('SQLITE_IOERR: disk I/O error'); });
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'store_failed', message: 'The workspace store could not take this session\'s lock, so the agent was not cancelled: Error: SQLITE_IOERR: disk I/O error' } });
        read.mockRestore();
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toBeUndefined();
        expect(warnings.some((w) => w.includes('for a cancel failed'))).toBe(true);
      });

      it('a failed write of the chosen child\'s own move is refused store_failed in the engine\'s words, not "not cancellable", and the lock is given back', async () => {
        const { sessions, sid } = await restedFamily();
        const write = vi.spyOn(dal, 'setChildState').mockImplementationOnce(() => { throw new Error('SQLITE_FULL: database or disk is full'); });
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'store_failed', message: 'The workspace store requires recovery before an agent can be cancelled: Error: SQLITE_FULL: database or disk is full' } });
        write.mockRestore();
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toBeUndefined();
      });
    });
  });

  /**
   * PD-ORCH-005 clause 15 (revision 4): "A forced stop is a stop: its agents come to rest as clause 3 says." The
   * graceful stop is covered above; these are the forced one, reached either way the stop control forces it, and the
   * application's quit, whose `quit` a stop request received first would displace (the first reason stands — the
   * board-run defect, `docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`).
   */
  describe('REQ-ORCH-052 / REQ-ORCH-108, the repair of a-child-whose-execution-raises-before-its-turn-stays-running: a raise outside the turn settles the child', () => {
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');

    it('the fresh path: a tool port that cannot be built ends the child failed with its report and artifact, and the parent\'s foreground wait returns it', async () => {
      const rootAsked: string[] = [];
      const completed: Readonly<Record<string, unknown>>[] = [];
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed') completed.push(fields); return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'broken', task: 'TASK: broken', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'broken')?.state === 'failed');
      const row = byName(sid, 'broken')!;
      expect(row).toMatchObject({ state: 'failed', report_stored: 1 });
      expect(JSON.parse(row.report!)).toMatchObject({ status: 'failed', summary: 'Child broken ended failed: its execution raised outside its turn: no tool port for broken', errors: [{ type: 'child_exception', message: 'no tool port for broken' }] });
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.source_task_id === row.task_id).map((a) => a.status)).toEqual(['failed']);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'child_exception').map((i) => i.message)).toEqual(['Child broken raised: no tool port for broken']);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_end').map((t) => t.message)).toEqual([`Child broken (${row.task_id}) ended failed.`]);
      // REQ-ORCH-098: torn down "whether or not its execution raised" — its result and its closed conversation.
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
      // REQ-HOOKS-003: `child_completed` fires for it, whatever its final state.
      expect(completed).toEqual([{ child_id: row.task_id, child_name: 'broken', persona: 'coding-agent', state: 'failed', status: 'failed', summary: 'Child broken ended failed: its execution raised outside its turn: no tool port for broken' }]);
      await sessions.running(sid);
      // The foreground delegation's wait (REQ-TOOLS-156) resolved with the report, and the run went on to its end.
      expect(rootAsked.at(-1)).toContain('no tool port for broken');
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('the resume path: a record that cannot be decoded ends the child failed with its report, and the resumed iteration closes', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect(one.state).toBe('paused');
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      state.resumed = true;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => byName(sid, 'one')?.state === 'failed');
      const row = byName(sid, 'one')!;
      expect(row).toMatchObject({ state: 'failed', report_stored: 1 });
      expect(JSON.parse(row.report!)).toMatchObject({ status: 'failed', errors: [{ type: 'child_exception' }] });
      expect(JSON.parse(row.report!).summary).toMatch(/^Child one ended failed: its record could not be loaded to resume it: /);
      // REQ-ORCH-098: a resumed child that had a recorded conversation has it closed too.
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
      await sessions.running(sid);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });
  });

  describe('PD-ORCH-005 clause 15: a forced stop is a stop, and a quit rests by quit', () => {
    const restsBy = async (sessions: Sessions, sid: SessionId, interruption: 'stop' | 'quit') => {
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(children(sid)[0]!).toMatchObject({ state: 'paused', interruption, completed_at: null, report_stored: 0 });
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption }]);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
    };

    it('a stop forced at its first activation leaves the child paused by the stop and the iteration open, as a graceful one does', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: { force: true } })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });

    it('a second activation of the stop control forces it (REQ-SESSION-186), and it still comes to rest', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });

    it('the application\'s quit (`announceShutdown`, what a board run is sent at the last window\'s close) rests by quit', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'announceShutdown', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'quit');
    });

    it('a stop that reaches the run before the quit keeps its reason: the run rests by stop (why the board sends the quit)', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      expect(sessions.control({ op: 'announceShutdown', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });
  });
});

describe('PD-ORCH-005 clause 16 (OQ-101): the user\'s cancel writes one entry for both cancels, the at-rest one saying the session rested', () => {
  const t = { task_id: 'bg_00000002', canonical_name: 'grand', persona: 'coding-agent' };
  const chosen = { task_id: 'bg_00000001', canonical_name: 'one' };
  it('the live cancel\'s entry names the child and what it was cancelled with, and nothing more', () => {
    expect(userCancellation(chosen as typeof t & typeof chosen, chosen).message).toBe('The user cancelled child one (bg_00000001).');
    expect(userCancellation(t, chosen).message).toBe('The user cancelled child grand (bg_00000002) with one.');
  });
  it('the at-rest cancel\'s adds that the session rested', () => {
    expect(userCancellation(t, chosen, true).message).toBe('The user cancelled child grand (bg_00000002) with one while the session rested.');
    expect(userCancellation(t, chosen, true).metadata).toEqual({ task_id: 'bg_00000002', cancelled_with: 'bg_00000001' });
  });
});
