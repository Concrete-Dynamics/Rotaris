import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { CHILD_STATES, CHILD_TRANSITIONS, FOLLOW_UP_STATE, isLegalChildMove, isLegalFollowUp, TERMINAL_CHILD_STATES } from '@rotaris/contracts';
import { canonicaliseName, ChildLedger, Scheduler, SessionWriter, uniqueUnderParent } from '../index.js';
import { conversationOf } from '../run/record.js';
import { userCancellation } from './ledger.js';
const HOST = mintMachineId('0000000000000000000000000000000a');

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

  it('PD-ORCH-005 clause 22: a follow-up is the one exit from a terminal state, to `queued`, and it leaves no other state', () => {
    for (const from of CHILD_STATES) expect(isLegalFollowUp(from)).toBe(TERMINAL_CHILD_STATES.has(from));
    expect(FOLLOW_UP_STATE).toBe('queued');
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
  const spawn = (l: ChildLedger, name: string, over: Partial<Parameters<ChildLedger['spawn']>[0]> = {}) => l.spawn({ parentId: 'root', parentDepth: 0, persona: 'coding-agent', taskName: name, task: `do ${name}`, dependsOn: [], inheritedContext: [], category: '', background: true, modelKey: 'm', ...over });

  it('PD-ORCH-005 clause 22: the writer\'s follow-up reopens a settled child — completion, report and observation cleared, the messages recorded — and refuses one that has not ended, changing nothing', () => {
    const l = ledger();
    const a = spawn(l, 'a'); const id = a.ok ? a.value.row.task_id : '';
    l.claimStart(id); l.transition(id, 'running');
    const live = l.followUp(id, [{ role: 'user', content: [{ kind: 'text', text: 'more?' }] }]);
    expect(live).toMatchObject({ ok: false, reason: expect.stringMatching(/is in state 'running', not a terminal one, and cannot be followed up/) });
    expect(dal.agentConversation(sid, id)).toHaveLength(0);
    l.transition(id, 'succeeded'); l.storeReport(id, { status: 'succeeded', summary: 's' }); l.markObserved(id);
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'succeeded', report_stored: 1, observed: 1, completed_at: expect.any(String) });
    const r = l.followUp(id, [{ role: 'user', content: [{ kind: 'text', text: 'more?' }] }]);
    expect(r.ok).toBe(true);
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'queued', report: null, report_stored: 0, observed: 0, completed_at: null });
    expect(conversationOf(dal.agentConversation(sid, id))).toEqual([{ role: 'user', content: [{ kind: 'text', text: 'more?' }] }]);
    expect(dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { from_state: string; to_state: string }).at(-1)).toMatchObject({ from_state: 'succeeded', to_state: 'queued' });
  });

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

  it('REQ-ORCH-044 with REQ-MONITOR-071/044 and REQ-CHAT-069 (OQ-158): no child at any depth takes a name a root of the session carries — the current root\'s persona and canonical name, and each earlier root\'s — so no child is presented as the run-level agent too', () => {
    const nameOf = (r: ReturnType<typeof spawn>): string => (r.ok ? r.value.row.canonical_name : `rejected: ${r.error.reason}`);
    // An earlier iteration's root, of a persona the canonicaliser rewrites: its rows carry `Lead Planner`, its publishes `Lead-Planner`.
    expect(writer.openIteration({ iteration: 7, root_task_id: 'bg_0000e1a1', root_canonical_name: 'Lead-Planner', root_persona: 'Lead Planner', todo_task_id: '', task: 'earlier' })).toMatchObject({ ok: true, value: true });
    const l = ledger();
    expect(l.root).toMatchObject({ canonicalName: 'orchestrator', persona: 'orchestrator' });
    const someone = spawn(l, 'someone');
    const someoneId = someone.ok ? someone.value.row.task_id : '';
    // A grandchild named like the current root: the ledger kept only the root's direct children off its name.
    expect(nameOf(spawn(l, 'orchestrator', { parentId: someoneId, parentDepth: 1 }))).toBe('orchestrator_1');
    // A direct child named like the current root, as before.
    expect(nameOf(spawn(l, 'orchestrator'))).toBe('orchestrator_1');
    // A child named like an earlier root, directly under the root and deeper.
    expect(nameOf(spawn(l, 'Lead Planner'))).toBe('Lead-Planner_1');
    expect(nameOf(spawn(l, 'Lead Planner', { parentId: someoneId, parentDepth: 1 }))).toBe('Lead-Planner_1');
    // A name no root carries is the model's own, and a reused one still counts up under its parent alone (REQ-ORCH-044).
    expect(nameOf(spawn(l, 'survey', { parentId: someoneId, parentDepth: 1 }))).toBe('survey');
    expect(nameOf(spawn(l, 'survey'))).toBe('survey');
    expect(nameOf(spawn(l, 'orchestrator', { parentId: someoneId, parentDepth: 1 }))).toBe('orchestrator_2');
  });

  it('REQ-ORCH-044 (OQ-158): a resumed root\'s canonical name and the entry persona it runs as are kept off its grandchildren too', () => {
    const nameOf = (r: ReturnType<typeof spawn>): string => (r.ok ? r.value.row.canonical_name : `rejected: ${r.error.reason}`);
    const l = new ChildLedger({ dal, writer, sessionId: sid, iteration: 1, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => null, warn: (m) => warnings.push(m), rootRecord: { taskId: 'bg_0000e1a2', canonicalName: 'Lead-Planner', persona: 'orchestrator', task: '', iteration: 1, depth: 0, state: 'running' } });
    const a = spawn(l, 'a');
    const aId = a.ok ? a.value.row.task_id : '';
    expect(nameOf(spawn(l, 'Lead Planner', { parentId: aId, parentDepth: 1 }))).toBe('Lead-Planner_1');
    expect(nameOf(spawn(l, 'orchestrator', { parentId: aId, parentDepth: 1 }))).toBe('orchestrator_1');
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

  /*
   * The repair of a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it (REQ-ORCH-053, REQ-ORCH-098): the pass
   * that follows a child's end runs in an unawaited `.finally`, and reads the ledger. A child whose execution settles after
   * the store was closed — at quit, or while the run host lives (`workspace.closeStore` before a backup or a restore,
   * `workspace.closing`) — made that pass raise "The database connection is not open" as an unhandled rejection, which ends
   * a process with no handler for one (the run host installs none).
   */
  describe('a child\'s closing pass and a closed store', () => {
    const settlingAfterClose = (closeFirst: boolean) => async () => {
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => { rejections.push(e); };
      process.on('unhandledRejection', onRejection);
      try {
        const l = ledger();
        let finish!: () => void;
        const execution = new Promise<void>((r) => { finish = r; });
        let reads = 0;
        const counted = new Proxy(l, { get: (t, p, r) => { if (p === 'all') reads += 1; const v = Reflect.get(t, p, r) as unknown; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
        const sched = new Scheduler({ ledger: counted, runChild: () => execution, warn: (m) => warnings.push(m) });
        const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
        sched.pass();
        expect(dal.getChild(sid, idA)!.state).toBe('starting');
        // The run's teardown of the iteration's children (`IterationChildren.close`), then the store closes under it.
        if (closeFirst) sched.close();
        const readsAtClose = reads;
        dal.db.close();
        finish();
        await new Promise((r) => setTimeout(r, 20));
        expect(rejections).toEqual([]);
        if (closeFirst) {
          // Closed: the follow-up pass returns at once — no ledger read, nothing warned.
          expect(reads).toBe(readsAtClose);
          expect(warnings).toEqual([]);
        } else {
          // Never closed: the pass raises on the closed store, and the raise is warned once instead of rejecting.
          expect(warnings).toHaveLength(1);
          expect(warnings[0]).toMatch(/the scheduler's pass after child .* raised: .*not open/i);
        }
      } finally {
        process.off('unhandledRejection', onRejection);
        // The suite's afterEach closes the store it finds: give it an open one.
        dal = new StoreDal(openStore(join(dir, 'workspace.db')));
      }
    };
    it('a pass the store closed under raises nothing unhandled: it is warned, once', settlingAfterClose(false));
    it('after `close()`, the pass that follows a child\'s end returns at once and reads nothing', settlingAfterClose(true));
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
