import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, millis, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type ChildRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { CHILD_STATES, CHILD_TRANSITIONS, FOLLOW_UP_STATE, isLegalChildMove, isLegalFollowUp, RUN_AGENT_ID, TASK_ID_PATTERN, TERMINAL_CHILD_STATES, type PermissionPreset, type SessionRecord, type TranscriptIncrement } from '@rotaris/contracts';
import { BUILT_IN_PERSONAS, canonicaliseName, ChildLedger, RUN_CONFIG_DEFAULTS, Scheduler, Sessions, SessionWriter, uniqueUnderParent, type DelegationOps, type PortToolResult, type Publisher, type RunConfig, type RoleName, type ToolPort, type ToolPortContext } from '../index.js';
import type { AgentGrant, PersonaResolver } from './personas.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { HookPort } from '../hooks-port.js';
import { conversationOf } from '../run/record.js';
import { callsRun, interruptedResult } from '../run/interruption.js';
import { recordCrash } from '../run/crash.js';
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

describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  /** The lines the run writes at `INFO` (`SessionsDeps.log`): an intended state, since OQ-127's ruling. */
  const infos: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iter-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
    infos.length = 0;
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
        const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: (a['depends_on'] as string[]) ?? [], inheritedContext: (a['inherited_context'] as string[] | undefined) ?? [], category: '', runInBackground: a['run_in_background'] !== false, writeScope: (a['write_scope'] as string[] | undefined) ?? [], ...(typeof a['continuation_of'] === 'string' ? { continuationOf: a['continuation_of'] } : {}), ...(typeof a['session_id'] === 'string' ? { sessionId: a['session_id'] } : {}), ...(a['suppress_auto_context'] === true ? { suppressAutoContext: true } : {}), ...(Array.isArray(a['attach_artifacts']) ? { attachArtifacts: a['attach_artifacts'] as string[] } : {}) });
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
   * id-routed answer finds a holder. `closed` collects each port's close (REQ-SESSION-094): the agent, the statement its
   * open calls are settled with, and how many `session.end` events the session held at that moment.
   */
  function sessionsWith(script: (persona: string, turn: number, req: ModelRequest) => ScriptedCall, over: { cap?: number | null; childTimeoutMs?: number; childStallTimeoutMs?: number; tool?: TestTool; deaf?: readonly string[]; hooks?: HookPort; drainTimeoutMs?: number; images?: boolean; publisher?: Publisher; pending?: ReadonlySet<string>; closed?: { agent: string; statement: string; ended: number }[]; personas?: PersonaResolver; capFor?: (modelKey: string) => number | null; modelKey?: string; raisingPort?: string; grant?: (ctx: ToolPortContext) => AgentGrant | null; readiness?: (ctx: ToolPortContext) => Promise<void> | undefined } = {}) {
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
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: over.images === true ? { ...MODEL, acceptsImageInput: true } : MODEL, ...(over.modelKey === undefined ? {} : { modelKey: over.modelKey }), credentialFor: () => async () => 'k' };
    const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', modelConcurrencyCap: over.cap ?? null, ...(over.capFor ? { modelCapFor: over.capFor } : {}), drainTimeoutMs: over.drainTimeoutMs ?? 0, ...(over.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: over.childStallTimeoutMs }), ...(over.childTimeoutMs === undefined ? {} : { childTimeoutMs: over.childTimeoutMs }) } as const;
    const sessions = new Sessions({
      clocks: clock, publisher: over.publisher ?? NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), log: (m) => infos.push(m), mintSessionId: () => `S${++n}`,
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
        const base = { ...(over.grant ? { ready: async () => { await over.readiness?.(ctx); }, grant: () => over.grant!(ctx) } : {}), close: (statement: string) => { over.closed?.push({ agent: ctx.agentName, statement, ended: dal.eventsOfKind(ctx.sessionId, 'session.end').length }); }, cancelPending: () => 0, setMode: (m: string) => { const previous = mode; mode = m as PermissionPreset; return { requested: mode, effective: mode, downgraded: false, reason: '', previous }; }, currentMode: () => mode, answerApproval: held, answerQuestions: held, cancelQuestions: held };
        return ctx.delegation
          ? { ...delegationPort(ctx.delegation, ctx.parentId ?? 'root', over.tool, ctx), ...base }
          : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), ...base };
      },
      attended: () => true,
      ...(over.hooks ? { hooks: () => over.hooks! } : {}),
      runtime,
      // A resolved `personas:` table reaches a run only through the root's configuration (RunSetup).
      ...(over.personas ? { configure: () => ({ ok: true as const, value: { model: { backend: new DefaultAgentBackend(client), config }, runtime, personas: over.personas! } }) } : {}),
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

  /**
   * REQ-ORCH-059's "Open-todo reminder lines are appended" (the repair of
   * `docs/defects/fixed/the-completion-notification-carries-no-open-todo-reminder-lines.md`, found ruling OQ-213): the
   * notification that tells the coordinator a background child finished names the items its own plan still holds open.
   */
  it('REQ-ORCH-059: the completion notification names the coordinator\'s open plan items', async () => {
    const plan = (states: readonly string[]) => ({ schema_version: 1 as const, phases: [{ id: 'e002ab7d', name: 'Build', tasks: states.map((state, i) => ({ id: `0000000${i}`, name: ['Implement it', 'Check it'][i]!, description: '', state })) }] });
    const tool: TestTool = (name, a, ctx) => {
      if (name !== 'todo') return undefined;
      const written = ctx.writeTodo?.(plan(a['states'] as string[]) as never) ?? false;
      return Promise.resolve({ text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 1, label: 'todo', args: a });
    };
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 't1', name: 'todo', args: { states: ['IN_PROGRESS', 'PENDING'] } }, { callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Planning, then delegating.');
        if (turn === 2) return answer('The child is working on it.');
        if (turn === 3) return toolCalls([{ callId: 't2', name: 'todo', args: { states: ['COMPLETED', 'COMPLETED'] } }], 'Done.');
        return answer('All done: implemented and checked.');
      }
      if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    }, { tool });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const userTexts = client.requests.flatMap((r) => r.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')));
    const text = userTexts.find((t) => t.includes('[Background task completed]'))!;
    expect(text).toBeDefined();
    // Without the repair the notification ended at "All background tasks have completed." and named no item of the plan.
    expect(text).toContain('All background tasks have completed.\nYour todo list still holds 2 open items:\n- Implement it\n- Check it');
  });

  /**
   * REQ-MCP-065 with REQ-TOOLS-006 (the repair of `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`):
   * the child's row recorded its persona's DECLARED tools at spawn and its persona's MCP surface before any control, so a tool
   * `coordinator_only`, `read_only` or `tool_restrictions` removed was still recorded as granted. The row now records what
   * the child's port reports once it is ready — the grant in force — and nothing at spawn, where no grant exists yet.
   */
  it('REQ-MCP-065 / REQ-TOOLS-006: a child\'s row records the grant its port reports once ready, not its persona\'s declared tools', async () => {
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    };
    const narrowed: AgentGrant = { tools: ['read_file', 'grep'], mcp: { granted: { srv: [] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const snapshots: SessionRecord[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } } as Publisher;
    const { sessions } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? narrowed : null), publisher });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const c = children(sid)[0]!;
    expect(JSON.parse(c.granted_tools)).toEqual(['read_file', 'grep']);
    expect(JSON.parse(c.granted_mcp)).toEqual({ ...narrowed.mcp, recorded: true });
    for (const declared of BUILT_IN_PERSONAS['coding-agent'].tools.filter((t) => !narrowed.tools.includes(t))) expect(JSON.parse(c.granted_tools)).not.toContain(declared);
    // The record reaches the projection: the agent's tools are the grant, not the declared set standing in.
    expect(snapshots.at(-1)?.agents.find((a) => a.name === 'implement')).toMatchObject({ grantedTools: ['read_file', 'grep'], grantedMcp: { srv: [] } });
  });

  /*
   * REQ-MONITOR-049/060 with REQ-TOOLS-006 (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md):
   * a `tool_restrictions` list naming only a tool-server tool leaves the child no native tool. The row records that empty
   * grant, and the record says a grant was recorded, so the declared tools do not stand in for it on the surface. Until
   * 2026-10-01 the record could not tell it from the spawn's "no grant yet", and the inspector listed every tool removed.
   */
  it('REQ-MONITOR-049 / REQ-TOOLS-006: a grant the controls left empty of native tools is recorded as a grant, not read as none', async () => {
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    };
    const onlyEcho: AgentGrant = { tools: [], mcp: { granted: { srv: ['echo'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const snapshots: SessionRecord[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } } as Publisher;
    const { sessions } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? onlyEcho : null), publisher });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const c = children(sid)[0]!;
    expect(JSON.parse(c.granted_tools)).toEqual([]);
    expect(JSON.parse(c.granted_mcp)).toEqual({ ...onlyEcho.mcp, recorded: true });
    expect(snapshots.at(-1)?.agents.find((a) => a.name === 'implement')).toMatchObject({ grantedTools: [], grantRecorded: true, grantedMcp: { srv: ['echo'] } });
  });

  // A port that reports no grant records none: REQ-MONITOR-049's stand-in then applies on the surface, rather than the
  // declared set being written down as if it had been granted.
  it('REQ-MCP-065 / REQ-MONITOR-049: a child whose port reports no grant has none recorded — the spawn writes no declared set', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    });
    const sid2 = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid2)!).status).toBe('completed');
    const c2 = children(sid2)[0]!;
    expect(JSON.parse(c2.granted_tools)).toEqual([]);
    expect(JSON.parse(c2.granted_mcp)).toEqual({ granted: {}, servers: [] });
  });

  /*
   * REQ-MCP-065 with REQ-ORCH-088 / PD-ORCH-005: recording the grant waits on the port's readiness, the turn does not wait
   * on the recording. Until the 2026-10-01 repair round the whole first turn was chained behind it, so while an MCP
   * discovery was pending the child was `running` with an empty record — a crash then resumed it from no history, without
   * its task. The payload is recorded as it was before the grant was, and the grant still lands before the first request.
   */
  it('REQ-MCP-065 / PD-ORCH-005: a child\'s payload is in its record while its port\'s readiness is pending, and its grant is recorded before its first model request', async () => {
    let release!: () => void;
    const readiness = new Promise<void>((r) => { release = r; });
    let sid = '' as SessionId;
    let grantedAtFirstRequest: string | null = null;
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      if (turn === 1) grantedAtFirstRequest = children(sid)[0]!.granted_tools;
      return answer('I implemented it.');
    };
    const narrowed: AgentGrant = { tools: ['read_file'], mcp: { granted: { srv: ['echo'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const { sessions, contexts } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? narrowed : null), readiness: (ctx) => (ctx.depth === 1 ? readiness : undefined) });
    sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const until = async (cond: () => boolean): Promise<void> => { for (let i = 0; i < 400 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const recorded = (): string[] => { const c = children(sid)[0]; return c ? dal.agentMessagesOf(sid, c.task_id).map((m) => m.body) : []; };
    await until(() => contexts.has('implement') && recorded().length > 0);
    // Read while readiness is still held, then released before asserting, so a failure leaves no run waiting on it.
    const heldRecord = recorded();
    const heldGrant = children(sid)[0]?.granted_tools ?? null;
    release();
    // The child's task is in its record, and no grant is (none is in force yet).
    expect(heldRecord.some((b) => b.includes('TASK: write it'))).toBe(true);
    expect(JSON.parse(heldGrant ?? 'null')).toEqual([]);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(JSON.parse(grantedAtFirstRequest ?? 'null')).toEqual(['read_file']);
    expect(JSON.parse(children(sid)[0]!.granted_mcp)).toEqual({ ...narrowed.mcp, recorded: true });
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

  it("OQ-111 (live-run finding D1): the child-report summariser's transcript starts with the child's task as given, the payload's blocks ahead of it marked omitted (REQ-ORCH-110)", async () => {
    const asked: string[] = [];
    const { sessions } = sessionsWith((persona, turn, req) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it\nEXPECTED OUTCOME: what the module does', run_in_background: false } }], 'Delegating.')
        : answer('All done.');
      if (persona === 'summariser') {
        asked.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n'));
        return answer('{"summary":"done","key_findings":[],"tags":[]}');
      }
      return answer('The module is small.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(asked).toHaveLength(1);
    // REQ-TOOLS-154's payload puts the workspace root ahead of the task; the pass's start is the task itself.
    expect(asked[0]).toMatch(/\nTranscript:\nuser: … \[\d+ characters omitted\] … TASK: read it\nEXPECTED OUTCOME: what the module does\nassistant: The module is small\.$/);
    expect(asked[0]).not.toContain('Transcript:\nuser: Workspace root:');
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
    // PD-TOOLS-006 revision 3: a scope is for a persona that can write files, so the scoped child is a `docs-writer`.
    const heldByApi = { canonicalName: 'api', persona: 'docs-writer', pattern: 'src/api/**' };
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
            { callId: 'd1', name: 'delegate', args: { persona: 'docs-writer', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } },
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
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'docs-writer', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Done.');
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

    it('PD-TOOLS-006 revision 3 (OQ-112, live-run finding D6): a scope for a persona that cannot write files rejects the delegation — no child, no task id, the writers named', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'c: write docs/overview.md', task: 'TASK: write it', write_scope: ['docs/overview.md'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'write the overview') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'c: write docs/overview.md': rejected — write_scope was given to 'codebase-analyst', which cannot write files");
      expect(resumed).toContain('Personas that can write files: coding-agent, tester, docs-writer, refactorer.');
      expect(resumed).not.toContain('task_id:');
    });

    it('PD-TOOLS-006 revision 3 (OQ-112): an ALIAS of a persona that cannot write files is refused the same way — the persona the ledger would resolve', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'playwright', task_name: 'ui: write docs/overview.md', task: 'TASK: write it', write_scope: ['docs/overview.md'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'write the overview') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'ui: write docs/overview.md': rejected — write_scope was given to 'ui-verifier', which cannot write files");
      expect(resumed).not.toContain('task_id:');
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

    /*
     * Acceptance finding A4 (R-067): "after REQ-TOOLS-006's controls" read the first three alone while the fourth narrowed
     * no grant. Under OQ-145 the delegating persona's `tool_restrictions` entry naming the child's persona binds the child's
     * grant, so it binds this refusal, and the writers the reason names are the ones this caller's map lets write.
     */
    it("PD-TOOLS-006 revision 3 with REQ-TOOLS-006 (4) (OQ-145): the parent agent's tool_restrictions bind the refusal — a writer it restricts to reading cannot take a scope, and is not named", async () => {
      const personas: PersonaResolver = {
        resolve: (name) => {
          const base = BUILT_IN_PERSONAS[name as RoleName];
          if (!base) return null;
          return { persona: name === 'orchestrator' ? { ...base, toolRestrictions: { 'coding-agent': ['read_file', 'grep'], tester: ['read_file'] } } : base, alias: null };
        },
        knownRoles: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      }, { personas });
      const sid = (sessions.start(dal, 'C:/ws', 'build the api') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'api': rejected — write_scope was given to 'coding-agent', which cannot write files");
      expect(resumed).toContain('Personas that can write files: docs-writer, refactorer.');
    });

    it('REQ-TOOLS-006 (4) (OQ-145): a child\'s tool port is told the persona that delegated it; the root\'s is told none', async () => {
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'api', task: 'TASK: api', run_in_background: false } }], 'Delegating.') : answer('Done.');
        }
        return answer('Built it.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build the api') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(contexts.get('api')?.parentPersona).toBe('orchestrator');
      expect(contexts.get('orchestrator')?.parentPersona).toBeUndefined();
    });
  });

  describe('REQ-TOOLS-152 / REQ-TOOLS-154 (3): suppress_auto_context omits the sibling-artifact index', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /** A survey whose report becomes an artifact, then `build` delegated with `buildArgs`; returns each child's first payload. */
    async function surveyThenBuild(buildArgs: Record<string, unknown>, over: { personas?: PersonaResolver } = {}) {
      const payloads = new Map<string, string>();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey', run_in_background: false } }], 'Surveying.');
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build', run_in_background: false, ...buildArgs } }], 'Building.');
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: build') ? 'build' : 'survey';
        if (!payloads.has(name)) payloads.set(name, text);
        return answer(name === 'survey' ? 'The module is small.' : 'Built it.');
      }, over);
      const sid = (sessions.start(dal, 'C:/ws', 'survey then build') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const selection = dal.timelineOf(sid).filter((t) => t.name === 'context_selection');
      return { payloads, build, selection };
    }

    it('REQ-TOOLS-152: the default gives the index — the survey\'s artifact is listed in the build\'s payload, and nothing is stored', async () => {
      const { payloads, build } = await surveyThenBuild({});
      expect(payloads.get('build')).toMatch(/PRIOR SIBLING ARTIFACT INDEX\n[^\n]*survey/);
      expect(build.suppress_auto_context).toBe(0);
    });

    it('REQ-TOOLS-152: a call that sets it omits the index from the child\'s payload, and the flag is stored with the child\'s record', async () => {
      const { payloads, build } = await surveyThenBuild({ suppress_auto_context: true });
      expect(payloads.get('build')).toContain('TASK: build');
      expect(payloads.get('build')).toMatch(/Workspace root: C:\/ws\./);
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      expect(build.suppress_auto_context).toBe(1);
    });

    it('REQ-CONFIG-107: the persona-level setting forces the same omission for a call that did not ask for it, and only for that role', async () => {
      const personas: PersonaResolver = {
        resolve: (name) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: name === 'coding-agent' ? { ...base, skipAutoSiblingContext: true } : base, alias: null } : null; },
        knownRoles: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { payloads, build } = await surveyThenBuild({}, { personas });
      expect(payloads.get('build')).toContain('TASK: build');
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      // Configuration, read at each assembly — not copied onto the record.
      expect(build.suppress_auto_context).toBe(0);
    });

    it('REQ-LIBRARY-098: the attached artifacts are the caller\'s explicit choice — a suppressed index still carries them, and the diagnostic says the index was suppressed', async () => {
      const { payloads, build, selection } = await surveyThenBuild({ suppress_auto_context: true, attach_artifacts: ['no-such-artifact'] });
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      expect(payloads.get('build')).toContain('PRIOR AGENT CONTEXT (FULL)');
      expect(payloads.get('build')).toContain('no-such-artifact');
      const buildSelection = selection.map((t) => JSON.parse(t.metadata) as Record<string, unknown>).find((m) => m['task_id'] === build.task_id);
      expect(buildSelection).toMatchObject({ sibling_index_suppressed: true, sibling_index_included: 0, attached_unresolved: ['no-such-artifact'] });
    });
  });

  describe('PD-ORCH-005 clause 22 / PD-TOOLS-006 revision 3 (OQ-66, R-067): a follow-up by session_id resumes the caller\'s own settled child from its record', () => {
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');
    const isRoot = (req: ModelRequest) => /^You are the orchestrator/.test(textOf(req.messages[0]!));
    const rootRequests = (client: ScriptedModelClient) => client.requests.filter(isRoot);
    const childRequests = (client: ScriptedModelClient) => client.requests.filter((r) => !isRoot(r) && !/summarise/i.test(textOf(r.messages[0]!)));
    /** The text of the root's last tool result in its `n`th request (1-based): what its last delegate call observed. */
    const observed = (client: ScriptedModelClient, n: number) => textOf(rootRequests(client)[n - 1]!.messages.at(-1)!);

    /**
     * The root delegates `survey`, ends its turn and, resumed with the survey's report (its third request), calls
     * `delegate` again with `followUp(surveyId)` as the rest of the call's arguments; what that call observed is the last
     * message of its fourth request. Then it answers. `child` scripts the survey's steps.
     */
    async function surveyThenFollowUp(followUp: (surveyId: string) => Record<string, unknown>, child: (step: number, req: ModelRequest) => ScriptedCall = (step) => answer(step === 1 ? 'The module is small.' : 'It has two files: a.ts and b.ts.'), over: { childTimeoutMs?: number } = {}) {
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }], 'Surveying.');
          if (turn === 2) return answer('Waiting for the survey.');
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', ...followUp(children(sid).find((c) => c.canonical_name === 'survey')!.task_id) } }], 'Following up.');
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"surveyed","key_findings":[],"tags":[]}');
        return child(req.messages.filter((m) => m.role === 'assistant').length + 1, req);
      }, over);
      sid = (sessions.start(dal, 'C:/ws', 'survey, then ask again') as { value: SessionId }).value;
      const result = await sessions.running(sid)!;
      return { sid, result, client };
    }

    it('clause 22: the named child resumes under its own task id from its recorded conversation, the call\'s task as its next user message, and ends and reports again', async () => {
      const { sid, result, client } = await surveyThenFollowUp((id) => ({ session_id: id }));
      expect(result.status).toBe('completed');
      // No second record: the follow-up is the same child.
      const rows = children(sid);
      expect(rows).toHaveLength(1);
      const survey = rows[0]!;
      expect(survey).toMatchObject({ canonical_name: 'survey', state: 'succeeded', observed: 1, report_stored: 1 });
      // Its second request carries its whole first conversation, then the follow-up as the next user message.
      const [first, second] = childRequests(client);
      expect(second).toBeDefined();
      const firstTexts = first!.messages.map(textOf);
      expect(second!.messages.slice(0, firstTexts.length).map(textOf)).toEqual(firstTexts);
      expect(textOf(second!.messages[firstTexts.length]!)).toBe('The module is small.');
      expect(second!.messages.at(-1)!.role).toBe('user');
      expect(textOf(second!.messages.at(-1)!)).toBe('TASK: which files does it have?');
      // The record holds the follow-up where the model saw it.
      const record = conversationOf(dal.agentConversation(sid, survey.task_id));
      expect(record.map(textOf)).toEqual(expect.arrayContaining(['TASK: which files does it have?', 'It has two files: a.ts and b.ts.']));
      // REQ-MONITOR-300 narrowed by clause 22: one exit from the terminal state, then the path any child takes.
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { from_state: string; to_state: string });
      expect(moves.map((m) => m.to_state)).toEqual(['starting', 'running', 'summarizing', 'succeeded', 'queued', 'starting', 'running', 'summarizing', 'succeeded']);
      expect(moves[4]).toEqual(expect.objectContaining({ from_state: 'succeeded', to_state: 'queued' }));
      // It reported again: two stored reports, the second the follow-up's.
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(2);
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'It has two files: a.ts and b.ts.' });
      // REQ-TOOLS-153: the call returned the child's own task id; the root was told of its second end.
      expect(observed(client, 4)).toMatch(new RegExp(`^Task 'survey': queued — .*\\ntask_id: ${survey.task_id}$`));
      const told = rootRequests(client)[4]!;
      expect(textOf([...told.messages].reverse().find((m) => m.role === 'user')!)).toContain('It has two files: a.ts and b.ts.');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_resumed').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([expect.objectContaining({ task_id: survey.task_id, follow_up: true, from_state: 'succeeded', resume_state: 'queued' })]);
    });

    it('run_in_background false waits for the follow-up as for any child, and the call returns its new report', async () => {
      const { sid, result, client } = await surveyThenFollowUp((id) => ({ session_id: id, run_in_background: false }));
      expect(result.status).toBe('completed');
      expect(children(sid)).toHaveLength(1);
      expect(observed(client, 4)).toContain('It has two files: a.ts and b.ts.');
    });

    /** A settled child of another agent — a grandchild's shape — in the case's one session, `S1`. */
    const othersChild = () => {
      const OTHER = 'bg_0000a7e1';
      dal.insertChild({ session_id: 'S1' as SessionId, task_id: OTHER, canonical_name: 'grand', given_name: 'grand', persona: 'codebase-analyst', state: 'succeeded', parent_id: 'bg_0000a11e', depth: 2, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      return { session_id: OTHER };
    };
    it.each([
      ['no task', () => ({ session_id: 'bg_0000dead' }), 1],
      ['a name rather than a task id', () => ({ session_id: 'survey' }), 1],
      ["another agent's child", othersChild, 2],
    ] as const)('PD-TOOLS-006 revision 3: a session_id naming %s is refused rejected, with no record and no task id', async (_name, followUp, records) => {
      const { sid, client } = await surveyThenFollowUp(followUp);
      expect(children(sid)).toHaveLength(records);
      expect(observed(client, 4)).toMatch(/^Task 'survey': rejected — .*session_id.*no settled child of yours/);
      expect(observed(client, 4)).not.toContain('task_id:');
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
    });

    it('OQ-66 ruled, REQ-TOOLS-155: a later iteration\'s root is refused a session_id naming an earlier iteration\'s child, which stays as it ended', async () => {
      let sid = '' as SessionId;
      let asked = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          // The second iteration's root names the first iteration's settled child.
          if (!asked && textOf(req.messages.at(-1)!).includes('ask the survey again')) {
            asked = true;
            const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', session_id: survey.task_id } }]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"surveyed","key_findings":[],"tags":[]}');
        return answer('The module is small.');
      });
      sid = (sessions.start(dal, 'C:/ws', 'survey the module') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(survey).toMatchObject({ state: 'succeeded', iteration: 1 });
      expect(sessions.prompt(sid, 'ask the survey again').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(asked).toBe(true);
      const refused = rootRequests(client).map((r) => textOf(r.messages.at(-1)!)).find((t) => t.startsWith("Task 'survey': rejected"));
      expect(refused).toMatch(/session_id.*no settled child of yours: none of your children has that task id/);
      expect(refused).not.toContain('task_id:');
      // Nothing moved: no second record, no exit from its terminal state, one report.
      expect(children(sid)).toHaveLength(1);
      expect(children(sid)[0]).toMatchObject({ task_id: survey.task_id, state: 'succeeded', iteration: 1 });
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(1);
      expect(childRequests(client).filter((r) => r.messages.some((m) => textOf(m) === 'TASK: which files does it have?'))).toHaveLength(0);
    });

    it('PD-TOOLS-006 revision 3: a session_id naming a child that has not ended is refused rejected, and the child runs on untouched', async () => {
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }, { callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'quick', task: 'TASK: quick' } }], 'Two.');
          if (turn === 2) { const slow = children(sid).find((c) => c.canonical_name === 'slow')!; return toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: and?', session_id: slow.task_id } }]); }
          // The refusal is observed; only now may `slow` end.
          if (turn === 3) release();
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return textOf(req.messages.at(-1)!).includes('TASK: slow') ? { parts: [{ hold: held }, { part: { kind: 'text', delta: 'slow done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('quick done');
      });
      sid = (sessions.start(dal, 'C:/ws', 'two') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toHaveLength(2);
      expect(observed(client, 3)).toMatch(/^Task 'slow': rejected — .*session_id.*has not ended/);
      expect(children(sid).find((c) => c.canonical_name === 'slow')).toMatchObject({ state: 'succeeded' });
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(2);
    });

    it('OQ-131: a child that never started — blocked by its dependency — is followed up from the payload it would have started with, then the follow-up, and REQ-ORCH-048\'s cascade does not block it again', async () => {
      let sid = '' as SessionId;
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [children(sid).find((c) => c.canonical_name === 'a')!.task_id] } }]);
          const b = children(sid).find((c) => c.canonical_name === 'b');
          if (!followed && b?.state === 'blocked') { followed = true; return toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: go ahead without a', session_id: b.task_id } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked; `b` answers.
        return answer(req.messages.some((m) => textOf(m).includes('TASK: b')) ? 'b went ahead.' : '');
      });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(followed).toBe(true);
      const b = children(sid).find((c) => c.canonical_name === 'b')!;
      expect(children(sid).find((c) => c.canonical_name === 'a')!.state).toBe('failed');
      expect(b.state).toBe('succeeded');
      const asked = childRequests(client).filter((r) => r.messages.some((m) => textOf(m).includes('TASK: b')));
      expect(asked).toHaveLength(1);
      const users = asked[0]!.messages.filter((m) => m.role === 'user').map(textOf);
      // Its payload — the workspace root, then its task — and then the follow-up as its next user message.
      expect(users).toHaveLength(2);
      expect(users[0]).toMatch(/Workspace root: C:\/ws\.[\s\S]*TASK: b$/);
      expect(users[1]).toBe('TASK: go ahead without a');
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; to_state: string }).filter((m) => m.child_id === b.task_id).map((m) => m.to_state);
      expect(moves).toEqual(['blocked', 'queued', 'starting', 'running', 'summarizing', 'succeeded']);
    });

    it('PD-ORCH-005 clauses 2 and 4: a follow-up still waiting for a model slot when the run is paused is paused where it stood, and the continue starts it from its record, the follow-up included', async () => {
      let sid = '' as SessionId;
      let release!: () => void;
      const hog = new Promise<void>((r) => { release = r; });
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          const survey = children(sid).find((c) => c.canonical_name === 'survey');
          if (!followed && survey?.state === 'succeeded') {
            followed = true;
            // `hog` takes the one model slot first, so the follow-up waits for it.
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'hog', task: 'TASK: hog' } }, { callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', session_id: survey.task_id } }]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const last = req;
        if (last.messages.some((m) => textOf(m).includes('TASK: hog'))) return { parts: [{ hold: hog }, { part: { kind: 'text', delta: 'hog done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        return answer(textOf(last.messages.at(-1)!) === 'TASK: which files does it have?' ? 'It has two files.' : 'The module is small.');
      }, { cap: 1 });
      sid = (sessions.start(dal, 'C:/ws', 'survey, then ask again') as { value: SessionId }).value;
      for (let i = 0; i < 400 && children(sid).find((c) => c.canonical_name === 'survey')?.state !== 'waiting_on_model_slot'; i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(children(sid).find((c) => c.canonical_name === 'survey')!.state).toBe('waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      const paused = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(paused).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'waiting_on_model_slot', report_stored: 0 });
      // The follow-up is in the record the continue resumes from.
      expect(textOf(conversationOf(dal.agentConversation(sid, paused.task_id)).at(-1)!)).toBe('TASK: which files does it have?');
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(survey.state).toBe('succeeded');
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'It has two files.' });
      // Its request after the continue carried its first conversation and the follow-up — never its payload afresh.
      const second = childRequests(client).filter((r) => textOf(r.messages.at(-1)!) === 'TASK: which files does it have?');
      expect(second).toHaveLength(1);
      expect(second[0]!.messages.filter((m) => m.role === 'user').map(textOf).filter((t) => t.includes('TASK: survey the module'))).toHaveLength(1);
      expect(second[0]!.messages.some((m) => m.role === 'assistant' && textOf(m) === 'The module is small.')).toBe(true);
    });

    it('clause 22 with REQ-ORCH-133: a child the user cancelled mid-step is followed up only once its execution has wound down, so that execution writes nothing over the follow-up', async () => {
      let sid = '' as SessionId;
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          const survey = children(sid).find((c) => c.canonical_name === 'survey');
          if (!followed && survey?.state === 'cancelled') { followed = true; return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: try again', session_id: survey.task_id } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // The first step ignores its abort (a provider that does not honour it) and ends only when released.
        return textOf(req.messages.at(-1)!) === 'TASK: try again' ? answer('Tried again.') : { parts: [{ hold: held }, { part: { kind: 'text', delta: 'late words' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { deaf: ['child'] });
      sid = (sessions.start(dal, 'C:/ws', 'survey') as { value: SessionId }).value;
      for (let i = 0; i < 400 && childRequests(client).length === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
      const id = children(sid)[0]!.task_id;
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: true });
      // The root is told, and follows it up while the cancelled step still streams.
      for (let i = 0; i < 400 && !followed; i += 1) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 20));
      expect(children(sid)[0]!.state).toBe('cancelled');
      expect(childRequests(client)).toHaveLength(1);
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid)[0]!;
      expect(survey.state).toBe('succeeded');
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'Tried again.' });
      // Two reports — the cancel's and the follow-up's — and nothing from the wound-down step between them.
      expect(dal.eventsOfKind(sid, 'child.complete').map((e) => (JSON.parse(e.payload) as { report: { status: string } }).report.status)).toEqual(['cancelled', 'succeeded']);
      expect(childRequests(client)).toHaveLength(2);
    });

    it('clause 4\'s rule for a record, at a follow-up: a call left open by an execution that raised out of it is answered as cut off before the follow-up is appended', async () => {
      const CRASHY = 'bg_0000c0de';
      const { sid, client } = await surveyThenFollowUp((surveyId) => {
        const survey = dal.getChild('S1' as SessionId, surveyId)!;
        dal.insertChild({ session_id: survey.session_id as SessionId, task_id: CRASHY, canonical_name: 'crashy', given_name: 'crashy', persona: 'codebase-analyst', state: 'failed', parent_id: survey.parent_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 'TASK: crashy', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: survey.spawned_at });
        dal.setChildObserved(survey.session_id as SessionId, CRASHY);
        for (const m of [{ role: 'user', content: [{ kind: 'text', text: 'TASK: crashy' }] }, { role: 'assistant', content: [{ kind: 'tool-call', callId: 'x1', name: 'read_file', args: '{"path":"a.ts"}' }] }]) {
          dal.insertAgentMessage({ session_id: survey.session_id as SessionId, task_id: CRASHY, iteration: 1, kind: 'message', body: JSON.stringify(m), at: 't' });
        }
        return { session_id: CRASHY };
      }, (_step, req) => answer(req.messages.some((m) => textOf(m) === 'TASK: crashy') ? 'Crashy answers.' : 'The module is small.'));
      expect(children(sid).find((c) => c.task_id === CRASHY)!.state).toBe('succeeded');
      const asked = childRequests(client).find((r) => r.messages.some((m) => textOf(m) === 'TASK: crashy'))!;
      const tail = asked.messages.slice(-3);
      expect(tail.map((m) => m.role)).toEqual(['assistant', 'tool', 'user']);
      expect(tail[1]!.content).toEqual([expect.objectContaining({ kind: 'tool-result', callId: 'x1', isError: true, result: expect.stringMatching(/^This call was not run: its agent was stopped before it started/) })]);
      expect(textOf(tail[2]!)).toBe('TASK: which files does it have?');
    });

    it('PD-TOOLS-006 revision 3: a child its child_timeout cut off is refused, and the reason names continuation_of', async () => {
      // The survey never answers within its limit: its step holds until the limit and the landing grace have passed.
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const { sid, client } = await (async () => {
        const run = surveyThenFollowUp((id) => ({ session_id: id }), (step) => (step === 1 ? { parts: [{ hold: held }, { part: { kind: 'text', delta: 'partial' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('never')), { childTimeoutMs: 1_000 });
        await new Promise((r) => setTimeout(r, 10));
        clock.advance(1_000);
        release();
        return run;
      })();
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(JSON.parse(survey.report!)).toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ type: 'timeout' })]) });
      expect(survey.state).toBe('failed');
      expect(observed(client, 4)).toMatch(/^Task 'survey': rejected — .*child_timeout.*continuation_of/);
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
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
      // OQ-76's ruling (PD-TOOLS-011): and on the timeline, as `user_away`, the run's own entry.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'user_away').map((t) => [t.actor, JSON.parse(t.metadata)])).toEqual([['rotaris', { after_seconds: 5 }]]);
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
      expect(dal.timelineOf(sid).filter((t) => t.name === 'user_returned').map((t) => [t.actor, JSON.parse(t.metadata)])).toEqual([['user', { after_seconds: 5 }]]);
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
      // OQ-127's ruling: the session log says it was sent, at WARNING (it follows a failed step), and the timeline records
      // it as a `corrective_message` entry (OQ-157's word) of the same severity (finding F11: `info` until 2026-10-06).
      const line = `child corrective message: quiet (${child(sid).task_id}) produced no output for 90 seconds and its model request then failed (the stream ended with no answer); it was given its one corrective message and resumes (REQ-NOTIFY-111)`;
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([line]);
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'corrective_message');
      expect(entries.map((t) => [t.actor, t.message, t.severity])).toEqual([['quiet', line, 'warning']]);
      expect(JSON.parse(entries[0]!.metadata)).toEqual({ task_id: child(sid).task_id, quiet_seconds: 90, window_seconds: 90, failure: 'the stream ended with no answer' });
      expect(child(sid).state).toBe('succeeded');
      expect(JSON.parse(child(sid).report!)).toMatchObject({ status: 'succeeded' });
    });

    it('PD-MONITOR-005 revision 2 (REQ-MONITOR-119/120): the `stall` issue is written with each throttled warning and only then — at entry and at the throttle', async () => {
      const { sessions, gates } = stalling(['silent', 'answers']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      clock.advance(10_000);
      const silent = () => dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => (JSON.parse(i.metadata) as { silent_seconds: number }).silent_seconds);
      // The evaluations at 90, 95 and 100 s each find the stall; the warning and its issue are written once, at entry.
      expect(silent()).toEqual([90]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').every((i) => i.severity === 'warning')).toBe(true);
      expect(warnings.filter((m) => m.startsWith('child appears stalled'))).toEqual([`child appears stalled: no model event or token for 90 seconds (quiet, ${child(sid).task_id}); the run is still waiting on it.`]);
      // REQ-MONITOR-120: the next warning is due max(90 s, 30 s) after the first.
      clock.advance(80_000);
      // Nineteen evaluations found the stall; two issues, each beside its warning, so one long stall cannot evict the
      // session's other issues from REQ-SESSION-133's ring.
      expect(silent()).toEqual([90, 180]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled')).map((m) => /for (\d+) seconds/.exec(m)![1])).toEqual(['90', '180']);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => i.message)).toEqual(warnings.filter((m) => m.startsWith('child appears stalled')));
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
      // OQ-127's ruling: REQ-MONITOR-118's informational message is an intended state — at INFO, never a warning — and a
      // `waiting_on_tools` timeline entry.
      const waitLine = `child waiting on tools: quiet (${child(sid).task_id}) has 1 active tool call and no model event or token for 90 seconds; the run is still waiting on it (REQ-MONITOR-118)`;
      expect(infos.filter((m) => m.startsWith('child waiting on tools:'))).toEqual([waitLine]);
      expect(warnings.filter((m) => m.startsWith('child waiting on tools:'))).toEqual([]);
      const waited = dal.timelineOf(sid).filter((t) => t.name === 'waiting_on_tools');
      expect(waited.map((t) => [t.actor, t.message, t.severity])).toEqual([['quiet', waitLine, 'info']]);
      expect(JSON.parse(waited[0]!.metadata)).toEqual({ task_id: child(sid).task_id, silent_seconds: 90, active_calls: 1 });
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toEqual([]);
      releaseTool();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toHaveLength(1);
      speak();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(5_000);
      const recoveredLine = `child stall recovered: quiet (${child(sid).task_id}) is active again after a stall (REQ-MONITOR-120)`;
      expect(infos.filter((m) => m.startsWith('child stall recovered:'))).toEqual([recoveredLine]);
      expect(warnings.filter((m) => m.startsWith('child stall recovered:'))).toEqual([]);
      finish();
      await sessions.running(sid)!;
      expect(child(sid).state).toBe('succeeded');
      // OQ-127's ruling: the recovery is a `stall_recovered` timeline entry beside its line.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'stall_recovered').map((t) => [t.actor, t.message, JSON.parse(t.metadata)])).toEqual([['quiet', recoveredLine, { task_id: child(sid).task_id }]]);
    });

    /*
     * The duress live runs' child (L2 at c2fdd6a, N1 at c2a9444): its last text token, then a `write_file` whose arguments
     * streamed for about 97 s. Each piece now reaches the run as a `tool-input` model event
     * (docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md).
     */
    it('REQ-ORCH-089 / REQ-NOTIFY-112 / REQ-CHAT-164: a child streaming a tool call\'s arguments for 95 s is not stalled, its row is not marked stalled, and a failure after it earns no corrective message', async () => {
      const increments: TranscriptIncrement[] = [];
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const PIECES = 19;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'writer', task: 'TASK: write the report' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        const gate = (): Promise<void> => new Promise<void>((r) => { gates.push(r); });
        const pieces = Array.from({ length: PIECES }, () => [{ hold: gate() }, { part: { kind: 'tool-input' as const, callId: 'w1' } }]).flat();
        return { parts: [{ part: { kind: 'text', delta: 'Writing the report now.' } }, ...pieces, { hold: gate() }, { error: failed }] };
      }, { publisher: { increment: (p) => increments.push(p), snapshot: () => undefined } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === PIECES + 1);
      await new Promise((r) => setTimeout(r, 20));
      // A piece every 5 s: 95 s of arguments, past the 90 s threshold and nine times REQ-CHAT-164's ten seconds.
      for (let i = 0; i < PIECES; i += 1) {
        clock.advance(5_000);
        gates[i]!();
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(child(sid).state).toBe('running');
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled'))).toEqual([]);
      // REQ-CHAT-164: the child's live row was never marked as a provider producing no output.
      expect(increments.flatMap((p) => p.rows).filter((r) => r.stalledSince !== undefined)).toEqual([]);
      gates[PIECES]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // REQ-NOTIFY-112: the child produced output until it failed, so it is not owed the corrective message.
      expect(childAsked).toHaveLength(1);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'corrective_message')).toEqual([]);
      expect(child(sid).state).toBe('failed');
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
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([]);
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

    /** How many corrective messages one request's conversation carries. */
    const correctives = (text: string): number => (text.match(/\[Corrective message\]/g) ?? []).length;

    it('REQ-NOTIFY-112 across PD-ORCH-005: a child given its corrective message before a pause is not given a second after the continue', async () => {
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        if (turn >= 4) return answer('I carried on and finished.');
        const hold = new Promise<void>((r) => { gates.push(r); });
        // The step after the corrective message is the one in flight when the pause is accepted: it asks for a call.
        if (turn === 2) return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
        return { parts: [{ hold }, { error: failed }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      gates[0]!();
      await settle(() => gates.length === 2);
      expect(correctives(childAsked[1]!)).toBe(1);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      gates[1]!();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(child(sid)).toMatchObject({ state: 'paused', resume_state: 'running' });
      // The same child task resumes from its record, goes silent for the whole window again, and fails.
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => gates.length === 3);
      clock.advance(90_000);
      gates[2]!();
      await sessions.running(sid)!;
      // The count is per child task: no request carries a second corrective message, and the second failure ends it failed.
      expect(childAsked).toHaveLength(3);
      expect(childAsked.map(correctives)).toEqual([0, 1, 1]);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
    });

    it('REQ-NOTIFY-112: a child that waited on its own child past the window was asked for no output then, so a resumed step that fails at once earns nothing', async () => {
      let releaseLeaf!: () => void;
      const leafHeld = new Promise<void>((r) => { releaseLeaf = r; });
      const midAsked: string[] = [];
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        const text = userText(req);
        if (!text.includes('TASK: mid')) { leafAsked += 1; return { parts: [{ hold: leafHeld }, ...answer('leaf done').parts] }; }
        midAsked.push(text);
        if (midAsked.length === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked.length === 2) return answer('Waiting on leaf.');
        // Resumed with leaf's report, its step fails at once.
        return { parts: [{ error: failed }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name);
      await settle(() => midAsked.length === 2 && leafAsked === 1);
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(120_000);
      releaseLeaf();
      await sessions.running(sid)!;
      expect(midAsked).toHaveLength(3);
      expect(midAsked.map(correctives)).toEqual([0, 0, 0]);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([]);
      expect(byName('mid')!.state).toBe('failed');
    });

    it('REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155): a child waiting on its own child between its turns is not reported stalled; the child that is silent is, by its own watch', async () => {
      let releaseLeaf!: () => void;
      const leafHeld = new Promise<void>((r) => { releaseLeaf = r; });
      let midAsked = 0;
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!userText(req).includes('TASK: mid')) { leafAsked += 1; return { parts: [{ hold: leafHeld }, ...answer('leaf done').parts] }; }
        midAsked += 1;
        if (midAsked === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked === 2) return answer('Waiting on leaf.');
        return answer('Leaf reported; done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name)!;
      await settle(() => midAsked === 2 && leafAsked === 1);
      await new Promise((r) => setTimeout(r, 20));
      // Two minutes: past the 90 s window, the leaf silent in its step and `mid` waiting on it between its turns.
      clock.advance(120_000);
      const stallsOf = (name: string) => dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === name);
      // The leaf is silent inside a model step: its own watch reports it (REQ-MONITOR-119), at every evaluation.
      expect(stallsOf('leaf').length).toBeGreaterThan(0);
      expect(warnings.some((m) => m.startsWith(`child appears stalled: no model event or token for 90 seconds (leaf, ${byName('leaf').task_id})`))).toBe(true);
      // `mid`, asked for nothing while it waits, is not silent: no `stall` issue and no stall warning name it.
      expect(stallsOf('mid')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled') && m.includes(`(mid, ${byName('mid').task_id})`))).toEqual([]);
      releaseLeaf();
      await sessions.running(sid)!;
      expect(midAsked).toBe(3);
      expect(byName('mid').state).toBe('succeeded');
      // Its resumed turn after the wait is not a recovery from a stall it never had.
      expect(infos.filter((m) => m.startsWith('child stall recovered:') && m.includes('(mid,'))).toEqual([]);
      expect(stallsOf('mid')).toEqual([]);
    });

    it('REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155) with PD-ORCH-005 clause 4: a child resumed into waiting on its own child is not reported stalled; the child that is silent is, by its own watch', async () => {
      const leafGates: (() => void)[] = [];
      let midAsked = 0;
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!userText(req).includes('TASK: mid')) {
          leafAsked += 1;
          // Its only call never ran, so REQ-ORCH-095's one re-prompt follows its resumed answer: that one is not held.
          if (leafAsked > 2) return answer('leaf done');
          const hold = new Promise<void>((r) => { leafGates.push(r); });
          // The leaf's first step is the one in flight when the pause is accepted: it asks for a call the pause cuts.
          if (leafAsked === 1) return { parts: [{ hold }, ...toolCalls([{ callId: 'l1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
          return { parts: [{ hold }, ...answer('leaf done').parts] };
        }
        midAsked += 1;
        if (midAsked === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked === 2) return answer('Waiting on leaf.');
        return answer('Leaf reported; done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name)!;
      await settle(() => midAsked === 2 && leafGates.length === 1);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      leafGates[0]!();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(byName('mid')).toMatchObject({ state: 'paused' });
      expect(byName('leaf')).toMatchObject({ state: 'paused' });
      // Continued: `mid`'s record ends on its answer, so it resumes into waiting and takes no step; the leaf's resumed step
      // is held, silent.
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => leafGates.length === 2);
      await new Promise((r) => setTimeout(r, 20));
      expect(midAsked).toBe(2);
      clock.advance(120_000);
      const stallsOf = (name: string) => dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === name);
      // The leaf is silent inside a model step: its own watch reports it (REQ-MONITOR-119).
      expect(stallsOf('leaf').length).toBeGreaterThan(0);
      expect(warnings.some((m) => m.startsWith(`child appears stalled: no model event or token for 90 seconds (leaf, ${byName('leaf').task_id})`))).toBe(true);
      // `mid`, resumed into waiting and asked for nothing, is not silent: no `stall` issue and no stall warning name it.
      expect(stallsOf('mid')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled') && m.includes(`(mid, ${byName('mid').task_id})`))).toEqual([]);
      leafGates[1]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(midAsked).toBe(3);
      expect(byName('mid').state).toBe('succeeded');
      expect(infos.filter((m) => m.startsWith('child stall recovered:') && m.includes('(mid,'))).toEqual([]);
      expect(stallsOf('mid')).toEqual([]);
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

  describe('REQ-ORCH-089 / REQ-MONITOR-117..122 / REQ-MONITOR-135, the repair of a-stalled-child-is-never-shown-stalled: the stall callback reaches the host, the root is watched, and a stall evaluation lands a steer', () => {
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const failed = modelError({ code: 'unknown', headline: 'the stream ended with no answer' });
    /** Every published whole-session record, in order. */
    const recorder = () => { const snapshots: SessionRecord[] = []; return { snapshots, publisher: { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } } as Publisher }; };
    /** The figure each published record carried for the child named `name`, consecutive repeats folded. */
    const figures = (snapshots: readonly SessionRecord[], of: (s: SessionRecord) => number | null | undefined): (number | null | undefined)[] => snapshots.map(of).filter((v, i, all) => i === 0 || v !== all[i - 1]);

    it('REQ-ORCH-089 / REQ-MONITOR-119/120/122: a stalled child\'s record carries its silence, republished at every evaluation so the figure advances, and clears once it is no longer stalled', async () => {
      const gates: (() => void)[] = [];
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (turn === 1) { const hold = new Promise<void>((r) => { gates.push(r); }); return { parts: [{ hold }, { error: failed }] }; }
        return answer('I carried on and finished.');
      }, { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      const quiet = (s: SessionRecord) => s.agents.find((a) => a.name === 'quiet')?.stalledSeconds;
      clock.advance(89_000);
      clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBeNull();
      // The evaluations at 90, 95 and 100 s each find it stalled; each changes the figure, and each is published.
      clock.advance(1_000); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(90);
      clock.advance(4_900); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(95);
      clock.advance(4_900); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(100);
      // Nothing is cancelled: the child still runs (REQ-MONITOR-121).
      expect(children(sid)[0]!.state).toBe('running');
      gates[0]!();
      await sessions.running(sid)!;
      expect(children(sid)[0]!.state).toBe('succeeded');
      // The recovery reaches the record (REQ-MONITOR-120's "notified"): the last record the child ran in carries no figure.
      expect(figures(snapshots, quiet)).toEqual([undefined, null, 90, 95, 100, null]);
      expect(snapshots.at(-1)!.agents[0]!.stalledSeconds).toBeNull();
    });

    it('REQ-MONITOR-117: the entry agent is watched too — its stall is warned in REQ-MONITOR-119\'s words with its `stall` issue, and the session record carries its figure until its step speaks again', async () => {
      let speak!: () => void;
      const spoken = new Promise<void>((r) => { speak = r; });
      let finish!: () => void;
      const finished = new Promise<void>((r) => { finish = r; });
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona) => {
        if (persona === 'orchestrator') return { parts: [{ hold: spoken }, { part: { kind: 'text', delta: 'Working; ' } }, { hold: finished }, { part: { kind: 'text', delta: 'done.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        return answer('');
      }, { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).some((t) => t.name === 'run_start'));
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000); clock.advance(100);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(90);
      const stall = dal.issuesOf(sid).filter((i) => i.kind === 'stall');
      expect(stall).toHaveLength(1);
      const rootTaskId = (JSON.parse(stall[0]!.metadata) as { task_id: string }).task_id;
      expect(rootTaskId).toMatch(TASK_ID_PATTERN);
      expect([stall[0]!.severity, stall[0]!.actor, stall[0]!.message]).toEqual(['warning', 'orchestrator', `agent appears stalled: no model event or token for 90 seconds (orchestrator, ${rootTaskId}); the run is still waiting on it.`]);
      expect(warnings).toContain(stall[0]!.message);
      clock.advance(5_000); clock.advance(100);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(95);
      speak();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(5_000); clock.advance(100);
      expect(infos.filter((m) => m.startsWith('agent stall recovered:'))).toEqual([`agent stall recovered: orchestrator (${rootTaskId}) is active again after a stall (REQ-MONITOR-120)`]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'stall_recovered').map((t) => t.actor)).toEqual(['orchestrator']);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBeNull();
      finish();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(figures(snapshots, (s) => s.entryStalledSeconds)).toEqual([null, 90, 95, null]);
    });

    it('REQ-MONITOR-120 with OQ-153: a stalled root that is cancelled did not resume — its stall ends with its figure cleared and is not logged recovered', async () => {
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? { parts: [{ hold: new Promise<void>(() => undefined) }, { part: { kind: 'text', delta: 'never' } }] } : answer('')), { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).some((t) => t.name === 'run_start'));
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000); clock.advance(100);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toHaveLength(1);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(90);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      await sessions.running(sid)!;
      expect(infos.filter((m) => m.startsWith('agent stall recovered:'))).toEqual([]);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBeNull();
    });

    it('REQ-MONITOR-117 with OQ-153: a root waiting on its own children between its turns is not silent — no `stall` issue while its child works', async () => {
      const gates: (() => void)[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }]) : answer(`root turn ${turn}`);
        if (persona === 'summariser') return answer('{"summary":"x"}');
        // The child keeps streaming: it is not stalled either, so any `stall` issue would be the root's.
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ part: { kind: 'text', delta: 'Reading.' } }, { hold }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      await new Promise((r) => setTimeout(r, 20));
      for (let t = 0; t < 40; t += 1) { clock.advance(5_000); if (t % 10 === 0) await new Promise((r) => setTimeout(r, 1)); }
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === 'orchestrator')).toEqual([]);
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });

    it('REQ-MONITOR-135 / REQ-MONITOR-122: a steer to the root while it waits on its children lands at the next stall evaluation — it takes a step before any child ends, then waits again', async () => {
      const gates: (() => void)[] = [];
      const rootAsked: string[] = [];
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(userText(req));
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }]) : answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'Read it.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1 && rootAsked.length === 2);
      await new Promise((r) => setTimeout(r, 20));
      const r = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'Also check the README.' } });
      expect(r.ok && typeof r.value === 'string').toBe(true);
      // Nothing lands before the evaluation: the root waits on its child, with no step to inject at.
      await new Promise((r) => setTimeout(r, 20));
      expect(rootAsked).toHaveLength(2);
      clock.advance(5_000);
      await settle(() => rootAsked.length === 3);
      expect(rootAsked[2]).toContain('[Steering prompt] Also check the README.');
      expect(children(sid)[0]!.state).toBe('running');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'steering_injected')).toHaveLength(1);
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The child's report reached the root afterwards, as its fourth request.
      expect(rootAsked).toHaveLength(4);
      expect(rootAsked[3]).toContain('### slow (codebase-analyst)');
    });
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
      // OQ-217 (R-072): the summarising pass was told how the child ended — the timeout and the statement, at the facts' head
      // (the continuation, which succeeded, is summarised with no Outcome line).
      const summarising = client.requests.map((r) => r.messages.map(textOf).join('\n')).filter((t) => t.includes('Condense the transcript below') && !t.includes('TASK: continue'));
      expect(summarising.length).toBeGreaterThan(0);
      for (const t of summarising) expect(t).toContain(`Facts:\nOutcome: failed — Child timed out after 1200s. ${report.cut_off!.statement}\nEdited files: src/a.ts`);
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
      // OQ-217: the pass is told the timeout, and no cut-off statement, since none was made.
      const asks = client.requests.map((r) => r.messages.map(textOf).join('\n')).filter((t) => t.includes('Condense the transcript below') && !t.includes('TASK: continue'));
      expect(asks.length).toBeGreaterThan(0);
      for (const t of asks) expect(t).toContain('Facts:\nOutcome: failed — Child timed out after 1200s\nEdited files: src/a.ts');
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
    // OQ-127's ruling: a stop is the user's own too, and the child it leaves paused is logged at INFO.
    expect(infos).toContain('iteration 1: 1 child(ren) left paused by stop (PD-ORCH-005)');
    expect(warnings.filter((m) => m.includes('left paused by'))).toEqual([]);
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

  it('REQ-MONITOR-102 / REQ-SESSION-129 (the repair of a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running): the stale settle answers the phantom child\'s open calls as cut by no rest, settles its row, and counts its calls once', async () => {
    const sid0 = 'S-prev-calls' as SessionId;
    const w = SessionWriter.create({ dal, sessionId: sid0, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    w.value.spawnChild({ task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}' });
    // A call that completed, and one the dead run cut while its row was `running`.
    w.value.recordAgentMessage('bg_0000dead', 1, 'message', { role: 'user', content: [{ kind: 'text', text: 'TASK' }] });
    w.value.recordAgentMessage('bg_0000dead', 1, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'a', name: 'grep', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'glob', args: '{}' }] });
    w.value.appendRow('tool', 'grep', true, { name: 'ghost', toolName: 'grep', toolStatus: 'ok', callKey: 'a', output: 'a.ts:1' });
    w.value.appendRow('tool', 'glob', false, { name: 'ghost', toolName: 'glob', toolStatus: 'running', callKey: 'b', output: 'partial' });
    const { settleStaleChildren } = await import('./orchestration.js');
    expect(settleStaleChildren(dal, w.value, sid0, () => undefined)).toBe(1);
    expect(dal.getChild(sid0, 'bg_0000dead')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
    expect(dal.getSession(sid0)!.tool_calls).toBe(2);
    expect(conversationOf(dal.agentConversation(sid0, 'bg_0000dead')).at(-1)).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'grep', isError: false, result: 'a.ts:1' },
      { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult(null, true, 'partial') },
    ] });
    expect(dal.residentRows(sid0).map((r) => [r.call_key, r.tool_status])).toEqual([['a', 'ok'], ['b', 'failed']]);
    // A second settle finds the child terminal and changes nothing.
    expect(settleStaleChildren(dal, w.value, sid0, () => undefined)).toBe(0);
    expect(dal.getSession(sid0)!.tool_calls).toBe(2);
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

  describe('live-run finding D5: a child is recorded, capped and measured under its model\'s models: key (REQ-CONFIG-094, REQ-MONITOR-020, REQ-MONITOR-049)', () => {
    /** Two coding-agent children in one turn, the first holding its slot until the second has been delegated. */
    async function twoChildren(over: { personas?: PersonaResolver; capFor: (modelKey: string) => number | null; modelKey?: string }) {
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
        return childCalls === 1 ? { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('done');
      }, over);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 200 && !(children(sid).length === 2 && children(sid)[1]!.state !== 'queued'); i += 1) await new Promise((r) => setTimeout(r, 5));
      const parked = children(sid).map((c) => c.state).sort();
      releaseFirst();
      await sessions.running(sid)!;
      const delegateRows = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
      return { parked, rows: children(sid), second: delegateRows[1]!.output };
    }

    it('REQ-CONFIG-094: a child on the run\'s model is recorded under the run\'s models: key, and the cap stated under that key parks the second', async () => {
      const KEY = 'openai-compatible--katalyst/m';
      const { parked, rows, second } = await twoChildren({ modelKey: KEY, capFor: (k) => (k === KEY ? 1 : null) });
      expect(rows.map((c) => c.model_key)).toEqual([KEY, KEY]);
      expect(parked).toEqual(['running', 'waiting_on_model_slot']);
      expect(second).toMatch(new RegExp(`waiting_on_model_slot — Queued behind model '${KEY}''s slot cap: 1 of 1 slots in use`));
    });

    it('REQ-CONFIG-094: a child of a role with its own model is recorded under that role\'s models: key, not the model\'s bare id', async () => {
      const KEY = 'openai-compatible--other/bare-id';
      const personas: PersonaResolver = {
        resolve: (name) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: name === 'coding-agent' ? { ...base, modelRef: { providerId: 'openai-compatible', modelId: 'bare-id', dialect: 'chat' }, modelKey: KEY } : base, alias: null } : null; },
        knownRoles: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { parked, rows } = await twoChildren({ personas, modelKey: 'run-key', capFor: (k) => (k === KEY ? 1 : null) });
      expect(rows.map((c) => c.model_key)).toEqual([KEY, KEY]);
      expect(parked).toEqual(['running', 'waiting_on_model_slot']);
    });

    it('where no configuration names a key, the model id stands in, as before', async () => {
      const { rows } = await twoChildren({ capFor: () => null });
      expect(rows.map((c) => c.model_key)).toEqual(['m', 'm']);
    });
  });

  describe('acceptance A13: the per-model cap counts every child in the process, not one iteration\'s (REQ-CONFIG-094, REQ-MONITOR-020, REQ-ORCH-050)', () => {
    const KEY = 'openai-compatible--katalyst/m';
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => ('text' in p && typeof p.text === 'string' ? p.text : '')).join('');
    /**
     * Two sessions in one `Sessions` — one run host — each delegating one coding-agent child on the same `models:` key
     * with `max_parallel` 1. The first session's child holds its model call until released.
     */
    function twoSessions(onSecondChild: () => void = () => undefined) {
      let releaseFirst!: () => void;
      const hold = new Promise<void>((r) => { releaseFirst = r; });
      // The first session's root, once it has delegated, holds its every later turn until released — so that run is still
      // under way when its child ends, and only the child's end can free the slot for the other session.
      let releaseFirstRoot!: () => void;
      const rootHold = new Promise<void>((r) => { releaseFirstRoot = r; });
      const setup = sessionsWith((persona, _turn, req) => {
        const all = req.messages.map(textOf).join('\n');
        if (persona === 'orchestrator') {
          // A first turn has no tool result in it yet; the task name is the session's own prompt.
          if (!req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: /first/.test(all) ? 'one' : 'two', task: /first/.test(all) ? 'TASK: one' : 'TASK: two' } }]);
          if (/the first task/.test(all)) return { parts: [{ hold: rootHold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"ok"}');
        if (/TASK: one/.test(all)) return { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        onSecondChild();
        return answer('done');
      }, { modelKey: KEY, capFor: (k) => (k === KEY ? 1 : null) });
      return { ...setup, releaseFirst, releaseFirstRoot };
    }
    const until = async (cond: () => boolean): Promise<void> => { for (let i = 0; i < 400 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5)); };

    it('a second session\'s child on a key the first session\'s child holds at its cap is held waiting_on_model_slot, and runs once that child ends', async () => {
      const { sessions, releaseFirst, releaseFirstRoot } = twoSessions();
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      await until(() => children(s1)[0]?.state === 'running');
      expect(children(s1).map((c) => c.state)).toEqual(['running']);
      const s2 = (sessions.start(dal, 'C:/ws', 'the second task') as { value: SessionId }).value;
      await until(() => children(s2).length === 1 && children(s2)[0]!.state !== 'queued');
      // REQ-CONFIG-094: "children belonging to any other session running in the same process" count against the cap.
      expect(children(s2).map((c) => [c.model_key, c.state])).toEqual([[KEY, 'waiting_on_model_slot']]);
      const told = dal.residentRows(s2).find((r) => r.kind === 'tool' && r.tool_name === 'delegate')?.output ?? '';
      expect(told).toMatch(new RegExp(`waiting_on_model_slot — Queued behind model '${KEY}''s slot cap: 1 of 1 slots in use`));
      // REQ-MONITOR-020: the first session's child finishing frees the slot, and the held child in the OTHER session is
      // promoted — while the first session's run is still under way, its root held.
      releaseFirst();
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(sessions.running(s1)).not.toBeNull();
      expect(dal.getSession(s1)!.execution_status).toBe('running');
      releaseFirstRoot();
      expect((await sessions.running(s1)!).status).toBe('completed');
      expect(children(s1).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
      // Created held (REQ-ORCH-050), its first move is the promotion back to `queued`, then its start.
      const moves = dal.eventsOfKind(s2, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state);
      expect(moves.slice(0, 2)).toEqual(['queued', 'starting']);
    });

    it('a session whose run has ended holds no slot: the next session\'s child starts at once', async () => {
      const { sessions, releaseFirst, releaseFirstRoot } = twoSessions();
      releaseFirst(); releaseFirstRoot();
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      expect((await sessions.running(s1)!).status).toBe('completed');
      const s2 = (sessions.start(dal, 'C:/ws', 'the second task') as { value: SessionId }).value;
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(dal.eventsOfKind(s2, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('waiting_on_model_slot');
    });

    /**
     * PD-ORCH-005 clause 4 with REQ-CONFIG-094 (OQ-149's reading, confirmed 2026-10-06 by R-071): a child paused while it held a slot keeps that place
     * while its session rests, so no other session takes it, and continuing never puts two on the key. The first session is
     * paused with its child mid-step and comes to rest `interrupted`, its child `paused`.
     */
    async function pausedFirst(onSecondChild?: () => void) {
      const setup = twoSessions(onSecondChild);
      const { sessions, releaseFirst, releaseFirstRoot } = setup;
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      await until(() => children(s1)[0]?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: s1, args: {} })).toEqual({ ok: true });
      releaseFirst(); releaseFirstRoot();
      expect((await sessions.running(s1)!).status).toBe('interrupted');
      expect(children(s1).map((c) => [c.state, c.resume_state])).toEqual([['paused', expect.stringMatching(/^(running|summarizing)$/)]]);
      const s2 = (sessions.start(dal, 'C:/ws', 'the second task') as { value: SessionId }).value;
      await until(() => children(s2).length === 1 && children(s2)[0]!.state !== 'queued');
      return { ...setup, s1, s2 };
    }
    const holding = (sid: SessionId): number => children(sid).filter((c) => c.state === 'starting' || c.state === 'running' || c.state === 'summarizing').length;

    it('PD-ORCH-005 clause 4: a paused child keeps its place while its session rests — another session\'s child is held, and a continue never runs two on the key', async () => {
      const { sessions, s1, s2 } = await pausedFirst();
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.running(s2)).not.toBeNull();
      // Sampled on every poll from the continue to both runs' ends: never more than the cap on the key across the process.
      let most = 0;
      expect(sessions.continueSession(s1, 'continue').ok).toBe(true);
      const done = Promise.all([sessions.running(s1)!, sessions.running(s2)!]);
      let settled = false; void done.then(() => { settled = true; });
      while (!settled) { most = Math.max(most, holding(s1) + holding(s2)); await new Promise((r) => setTimeout(r, 1)); }
      const [r1, r2] = await done;
      expect([r1.status, r2.status]).toEqual(['completed', 'completed']);
      expect(most).toBeLessThanOrEqual(1);
      expect(children(s1).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
    });

    it('PD-ORCH-005 clause 6: continuing without the paused child gives its place up, and the other session\'s held child starts', async () => {
      // What the first session had when the second's child made its first model call: the decline alone frees the place,
      // not a later child of the first session's new iteration ending.
      let firstHad: string[] | null = null;
      const { sessions, s1, s2 } = await pausedFirst(() => { firstHad ??= children(s1).map((c) => c.state); });
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.continueSession(s1, 'continue', { withoutPaused: true }).ok).toBe(true);
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s1)[0]!.state).toBe('cancelled');
      expect(firstHad).toEqual(['cancelled']);
      await sessions.running(s1);
    });

    it('PD-ORCH-005 clause 16: cancelling the paused child while its session rests gives its place up at once', async () => {
      const { sessions, s1, s2 } = await pausedFirst();
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.control({ op: 'cancelAgent', sessionId: s1, args: { agentId: children(s1)[0]!.task_id } }).ok).toBe(true);
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
    });
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
      // OQ-127's ruling (the repair of the-users-own-pause-is-logged-at-warning.md): the user's own pause leaving its children
      // paused is an intended state — written at INFO, never as a warning.
      expect(infos).toContain('iteration 1: 2 child(ren) left paused by pause (PD-ORCH-005)');
      expect(warnings.filter((m) => m.includes('left paused by'))).toEqual([]);
    });

    it('REQ-MONITOR-134 with clause 4, the repair of a-steering-prompt-pending-at-a-rest-is-lost: a prompt pending when the run comes to rest is delivered into the record of the paused agent it names, marked injected once, and the resumed agent reads it at its first step; one for an agent with no record yet is recorded as not delivered, and said so', async () => {
      const { sessions, client, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      const steer = (agentId: string, text: string): string => { const r = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId, text } }); if (!r.ok || !r.value) throw new Error('steer'); return r.value; };
      // `one` is mid-step, the root waits on its children, and `two` has not started: none takes another step before the pause.
      const toOne = steer(byName(sid, 'one').task_id, 'go left');
      const toRoot = steer('run', 'mind the tests');
      const toTwo = steer(byName(sid, 'two').task_id, 'hurry');
      // Each submission names its agent as its injection does: a child by its instance name, not its task id.
      const submitted = (id: string) => dal.timelineOf(sid).find((t) => t.name === 'steering_submitted' && (JSON.parse(t.metadata) as { prompt_id: string }).prompt_id === id)!.message;
      expect(submitted(toOne)).toMatch(/^A steering prompt was submitted for one \(/);
      expect(submitted(toTwo)).toMatch(/^A steering prompt was submitted for two \(/);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const recordOf = (taskId: string) => conversationOf(dal.agentConversation(sid, taskId));
      // Each paused agent's record ends on its prompt, after the answers to the calls the pause cut (clauses 3 and 4).
      expect(recordOf(byName(sid, 'one').task_id).slice(-2).map((m) => m.role)).toEqual(['tool', 'user']);
      expect(recordOf(byName(sid, 'one').task_id).at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: '[Steering prompt] go left' }] });
      expect(recordOf(root).at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: '[Steering prompt] mind the tests' }] });
      const injected = () => dal.timelineOf(sid).filter((t) => t.name === 'steering_injected').map((t) => (JSON.parse(t.metadata) as { prompt_id: string }).prompt_id);
      expect(injected().sort()).toEqual([toOne, toRoot].sort());
      // `two` has no conversation to carry it: the prompt is recorded as not delivered, in the timeline and the transcript.
      const undelivered = dal.timelineOf(sid).filter((t) => t.name === 'steering_not_delivered');
      expect(undelivered.map((t) => (JSON.parse(t.metadata) as { prompt_id: string }).prompt_id)).toEqual([toTwo]);
      expect(undelivered[0]!.message).toMatch(/^The steering prompt for two \([0-9a-f]{8}\) was not delivered/);
      expect(dal.residentRows(sid).some((r) => r.kind === 'system' && r.body === undelivered[0]!.message)).toBe(true);
      // Resumed, each reads its prompt as the last message of its first request, and it is marked injected no second time.
      const asked = client.requests.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const resumed = client.requests.slice(asked);
      const firstWith = (text: string) => resumed.find((r) => r.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === text)));
      expect(firstWith('[Steering prompt] go left')?.messages.at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: '[Steering prompt] go left' }] });
      expect(firstWith('[Steering prompt] mind the tests')?.messages.at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: '[Steering prompt] mind the tests' }] });
      expect(injected().sort()).toEqual([toOne, toRoot].sort());
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
    function scriptedChild(steps: readonly ((n: number) => ScriptedCall)[], over: { childTimeoutMs?: number; summary?: (req: ModelRequest) => ScriptedCall; root?: (turn: number) => ScriptedCall; tool?: TestTool; deaf?: readonly string[]; hooks?: HookPort; drainTimeoutMs?: number; closed?: { agent: string; statement: string; ended: number }[] } = {}) {
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

    it('REQ-MONITOR-134 and REQ-MONITOR-136 with clause 4 (the repair of a-steering-prompt-pending-at-a-rest-is-lost): a child steered while summarising, then stopped, resumes `running` and reads the prompt at a step of its own before it reports', async () => {
      const g = gate();
      const { sessions, seen, client } = scriptedChild([() => answer('I did it.'), () => answer('I did it, really.'), () => answer('Went left, done.')], { summary: () => ({ parts: [{ hold: g.hold }, ...answer('{"summary":"s"}').parts] }) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.summaries === 1);
      const steered = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: byName(sid, 'work').task_id, text: 'go left' } });
      expect(steered.ok).toBe(true);
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work).toMatchObject({ state: 'paused', resume_state: 'summarizing' });
      expect(conversationOf(dal.agentConversation(sid, work.task_id)).at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: '[Steering prompt] go left' }] });
      g.open();
      const asked = client.requests.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      // Its two steps before the stop (REQ-ORCH-095's one re-prompt among them), then a step of its own over the prompt.
      expect(seen.childSteps).toBe(3);
      expect(client.requests.slice(asked).some((r) => r.messages.at(-1)?.role === 'user' && r.messages.at(-1)?.content.some((p) => p.kind === 'text' && p.text === '[Steering prompt] go left'))).toBe(true);
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; to_state: string }).filter((t) => t.child_id === work.task_id).map((t) => t.to_state);
      expect(moves.slice(moves.lastIndexOf('paused') + 1)).toEqual(['running', 'summarizing', 'succeeded']);
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ final_response: 'Went left, done.' });
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

    it('REQ-MONITOR-117 with OQ-153 and clause 4: a root resumed into waiting on its child is between turns — its stall watch counts no silence while the child works, and the run-level agent carries no stalled figure', async () => {
      const g = gate();
      const working = gate();
      const delegate = toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
      // After the resume the child streams and then works on: it is not silent, so a `stall` issue would be the root's.
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...look().parts] }), () => ({ parts: [{ part: { kind: 'text', delta: 'Reading.' } }, { hold: working.hold }, { part: { kind: 'finish', reason: 'stop' } }] })], { root: (turn) => (turn === 1 ? delegate : answer(turn === 2 ? 'Delegated; waiting.' : 'Read the report.')) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g.open);
      const before = dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === 'orchestrator').length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => seen.childSteps === 2);
      await new Promise((r) => setTimeout(r, 20));
      for (let t = 0; t < 40; t += 1) { clock.advance(5_000); if (t % 10 === 0) await new Promise((r) => setTimeout(r, 1)); }
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === 'orchestrator')).toHaveLength(before);
      expect(warnings.filter((m) => m.startsWith('agent appears stalled:'))).toEqual([]);
      working.open();
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded' });
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
      expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('fallback_model');
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

    it('REQ-SESSION-092 (found by phase 3\'s review): a stop waits for its child executions within the 30 s grace, so a child\'s call that ignores the stop cannot hold the run open (nor, since the repair below, can a root\'s)', async () => {
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

    it('REQ-MONITOR-102 (the repair of a-roots-calls-before-a-crash-never-reach-the-session-total.md): a child the stop\'s grace gave up on, credited from its record by the continue and then lost to a crash, is counted once — the credit persisted its own count with the total', async () => {
      const probe: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
        // Two calls before the stop (the second one hangs through it), and — resumed — one more that hangs through the crash.
        return turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: {} }]) : toolCalls([{ callId: `h${turn}`, name: 'hang', args: {} }]);
      }, { tool: (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve(probe) : undefined) });
      const hangRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'stuck');
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => hangRows(sid).length === 1);
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await sessions.running(sid);
      // Given up on at the grace: counted from its record at the rest — p1 and the cut h2 — with the root's delegate. (Until
      // the repair of a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md it was rested
      // with no count, and only the continue's credit below counted its calls.)
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop', tool_calls: 2 });
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
      // The root returned before the grace ran out (while the rest waited for its child): counted once, with its outcome.
      expect(dal.iterationsOf(sid)[0]!.root_tool_calls).toBe(1);
      // The continue credits nothing more from its record; the resumed child makes h3, which is running at the death.
      expect(sessions.prompt(sid, 'go on').ok).toBe(true);
      await settle(() => hangRows(sid).length === 2);
      // The run's token sampler saves its figures every 10 s, so the credit is in the stored total before the death.
      clock.advance(10_000);
      await settle(() => dal.getSession(sid)!.tool_calls === 3);
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'running', tool_calls: 2 });
      // The process dies here: a later process records the crash from the store alone.
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 5, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      recordCrash(dal, w.value, sid, new Set(), () => undefined);
      // d1, p1, h2 and h3 — each once; the child's count is its record's.
      expect(dal.getSession(sid)!.tool_calls).toBe(4);
      expect(dal.iterationsOf(sid)[0]!.root_tool_calls).toBe(1);
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'crash', tool_calls: 3 });
      expect(callsRun(conversationOf(dal.agentConversation(sid, byName(sid, 'stuck').task_id)))).toBe(3);
    });

    it('REQ-MONITOR-102 / PD-ORCH-005 clause 6 (the repair of a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md): a child the stop\'s grace gave up on is counted from its record at the rest, so a continue that declines it loses none of its calls', async () => {
      const probe: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
        // One call that returns, then one that hangs through the stop.
        return turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: {} }]) : toolCalls([{ callId: `h${turn}`, name: 'hang', args: {} }]);
      }, { tool: (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve(probe) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'stuck'));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await sessions.running(sid);
      // Given up on at the grace, and counted from its record once its open call is answered: p1 and the cut h2.
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop', tool_calls: 2 });
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
      // The user continues without it (clause 6): it ends cancelled, and every call it made stays counted, once.
      expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
      await sessions.running(sid);
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
      expect(callsRun(conversationOf(dal.agentConversation(sid, byName(sid, 'stuck').task_id)))).toBe(2);
      // d1, p1 and h2 — the root's later iteration made no call.
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
    });

    it('REQ-MONITOR-102 / PD-ORCH-005 clause 3 (the repair of a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md, found by its verifier): a child the stop\'s grace gave up on while the explicit cancel arrived is counted from its record before it ends cancelled, its open call answered as cut off by no rest', async () => {
      const probe: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
        // One call that returns, then one that hangs through the stop and the cancel.
        return turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: {} }]) : toolCalls([{ callId: `h${turn}`, name: 'hang', args: {} }]);
      }, { tool: (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve(probe) : undefined) });
      const hangRow = (sid: SessionId) => dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'stuck');
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => hangRow(sid) !== undefined);
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      // The explicit cancel arrives while the rest waits within the grace: final, so the rest pauses nothing (clause 3).
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      clock.advance(30_000);
      await sessions.running(sid);
      // p1 and the cut h2 are counted with the child's own count, and the total holds them with the root's d1.
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
      expect(callsRun(conversationOf(dal.agentConversation(sid, byName(sid, 'stuck').task_id)))).toBe(2);
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
      // Its open call is answered, and its row settled, as cut off — naming no rest (OQ-96, "A call cut by no rest").
      expect(hangRow(sid)).toMatchObject({ tool_status: 'failed' });
      expect(hangRow(sid)!.output).toMatch(/^This call was cut off before it completed, and it was not re-run\./);
    });

    describe('REQ-MONITOR-102 / REQ-SESSION-094 (the repair of a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md): a child execution a stop\'s grace gave up on, that no rest counts, is counted from its record', () => {
      const probe: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const hangOrProbe: TestTool = (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve(probe) : undefined);
      /** `stuck` makes one call that returns (p1), then one that ignores its abort (h2). */
      const stuck = (turn: number): ScriptedCall => (turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: {} }]) : toolCalls([{ callId: `h${turn}`, name: 'hang', args: {} }]));
      const hangRow = (sid: SessionId) => dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'stuck');

      it('the explicit cancel rests nothing: the child its grace gave up on is counted, its open call answered as cut off by no rest', async () => {
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
          return stuck(turn);
        }, { tool: hangOrProbe });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => hangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid);
        // p1 and the cut h2 with the child's own count; the total holds them with the root's d1.
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
        expect(callsRun(conversationOf(dal.agentConversation(sid, byName(sid, 'stuck').task_id)))).toBe(2);
        expect(dal.getSession(sid)!.tool_calls).toBe(3);
        expect(hangRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult(null, true, '') });
      });

      /** A root that delegates `stuck` and hangs in the same step, so the run outlives the cancel of `stuck` alone. */
      const rootHangsBeside = (persona: string, turn: number): ScriptedCall => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }, { callId: 'h1', name: 'hang', args: {} }]) : answer('never');
        return stuck(turn);
      };

      it('a child the user cancelled on its own, whose call ignores the abort, is counted when the explicit cancel\'s grace gives up on its execution', async () => {
        const { sessions } = sessionsWith(rootHangsBeside, { tool: hangOrProbe });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => hangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'stuck').task_id } })).toEqual({ ok: true });
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled' });
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid);
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
        // d1 and the cut h1 (the root, given up on, counted from its record), with p1 and the cut h2.
        expect(dal.getSession(sid)!.tool_calls).toBe(4);
        expect(hangRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult(null, true, '') });
      });

      it('a child the user cancelled on its own, whose call ignores the abort, is counted when a stop\'s rest gives up on its execution', async () => {
        const { sessions } = sessionsWith(rootHangsBeside, { tool: hangOrProbe });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => hangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'stuck').task_id } })).toEqual({ ok: true });
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid);
        // The rest pauses the root and leaves the cancelled child as it is; its calls are counted all the same.
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
        expect(dal.getSession(sid)!.tool_calls).toBe(4);
        expect(hangRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult(null, true, '') });
      });
    });

    it('REQ-MONITOR-102 (the repair of a-roots-calls-before-a-crash-never-reach-the-session-total.md): a child\'s settle persists the total with its own count, so a crash right after it — the child terminal, never counted by the crash record — loses none of its calls', async () => {
      const probe: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const { sessions, counts } = sessionsWith((persona, turn) => {
        // The root delegates, answers, and — resumed with the report — takes a step that never returns: the death.
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quick', task: 'TASK: quick' } }]) : turn === 2 ? answer('delegated') : { parts: [{ hold: new Promise<void>(() => undefined) }, ...answer('never').parts] };
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: {} }, { callId: 'p2', name: 'probe', args: {} }]) : answer('Done.');
      }, { tool: (name) => (name === 'probe' ? Promise.resolve(probe) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'quick')?.state === 'succeeded' && (counts.get('orchestrator') ?? 0) >= 3);
      expect(byName(sid, 'quick')).toMatchObject({ state: 'succeeded', tool_calls: 2 });
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 5, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      recordCrash(dal, w.value, sid, new Set(), () => undefined);
      // d1, p1 and p2, each once.
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
    });

    describe('REQ-SESSION-092 / REQ-MONITOR-129: a root call that ignores the stop no longer holds the run open (the repair of a-root-call-that-ignores-the-stop-holds-the-run-open.md)', () => {
      const hang: TestTool = (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : undefined);
      const hangs = (turn: number): ScriptedCall => (turn === 1 ? toolCalls([{ callId: 'h1', name: 'hang', args: {} }], 'Hanging.') : answer('never'));
      /** Whether the run ends within a second of real time once `advance` has been applied to the fake clock. */
      const endsAfter = async (sessions: Sessions, sid: SessionId, advance: number): Promise<boolean> => {
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(advance);
        return Promise.race([sessions.running(sid)!.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1_000))]);
      };
      const rootHangRow = (sid: SessionId) => dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'orchestrator')!;

      it('a stop: the root is given up on at the 30 s grace, left paused by the stop with its call answered as interrupted, and the lock is released', async () => {
        const { sessions } = sessionsWith((persona, turn) => (persona === 'orchestrator' ? hangs(turn) : answer('done')), { tool: hang });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        // Short of the grace the run still waits for its root.
        expect(await endsAfter(sessions, sid, 29_000)).toBe(false);
        expect(await endsAfter(sessions, sid, 1_000)).toBe(true);
        expect(dal.getLock(sid)).toBeUndefined();
        expect(dal.getSession(sid)!.execution_status).toBe('paused');
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop' }]);
        // REQ-SESSION-129: the call's row is not left running; clause 3: it is recorded as interrupted, and the root's
        // record gains that result, so the resumed root sees every call answered.
        expect(rootHangRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult('stop', true, '') });
        const root = dal.iterationsOf(sid)[0]!.root_task_id;
        const last = conversationOf(dal.agentConversation(sid, root)).at(-1)!;
        expect(last).toMatchObject({ role: 'tool', content: [{ kind: 'tool-result', callId: 'h1', result: interruptedResult('stop', true, ''), isError: true }] });
        expect(warnings.some((w) => /root.*did not return within the stop's 30 s grace/.test(w))).toBe(true);
      });

      it('REQ-MONITOR-102 (the repair of a-roots-calls-before-a-crash-never-reach-the-session-total.md): a root given up on counts the call it made from its record, and its resume counts only the calls it adds', async () => {
        const probe: TestTool = (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }) : undefined);
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona !== 'orchestrator') return answer('done');
          // Two calls before the one that hangs, then — resumed — one more before its answer.
          return turn === 1 ? toolCalls([{ callId: 'q1', name: 'probe', args: {} }, { callId: 'q2', name: 'probe', args: {} }]) : turn === 2 ? toolCalls([{ callId: 'h1', name: 'hang', args: {} }]) : turn === 3 ? toolCalls([{ callId: 'q3', name: 'probe', args: {} }]) : answer('Done.');
        }, { tool: probe });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        // q1, q2 and the cut h1 — none of which a returned turn counted.
        expect(dal.getSession(sid)!.tool_calls).toBe(3);
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop', root_tool_calls: 3 }]);
        expect(sessions.prompt(sid, 'go on').ok).toBe(true);
        expect((await sessions.running(sid))!.status).toBe('completed');
        expect(dal.getSession(sid)!.tool_calls).toBe(4);
        expect(dal.iterationsOf(sid)[0]).toMatchObject({ state: 'closed', root_tool_calls: 4 });
      });

      it('REQ-MONITOR-102: a resumed root given up on at a second stop counts only what its record gained in that execution', async () => {
        const probe: TestTool = (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : name === 'probe' ? Promise.resolve({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }) : undefined);
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona !== 'orchestrator') return answer('done');
          // Each execution: one call that returns, then one that hangs through the stop.
          return turn % 2 === 1 ? toolCalls([{ callId: `q${turn}`, name: 'probe', args: {} }]) : toolCalls([{ callId: `h${turn}`, name: 'hang', args: {} }]);
        }, { tool: probe });
        const hangs = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'hang' && r.name === 'orchestrator');
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => hangs(sid).length === 1);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        expect(dal.getSession(sid)!.tool_calls).toBe(2);
        expect(sessions.prompt(sid, 'go on').ok).toBe(true);
        await settle(() => hangs(sid).length === 2);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        // q1 and h2 from the first execution, q3 and h4 from the second — the record's first two not counted again.
        expect(dal.getSession(sid)!.tool_calls).toBe(4);
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop', root_tool_calls: 4 }]);
      });

      it('a stop forced at its first activation still gives the root the whole grace before it is given up on', async () => {
        const { sessions } = sessionsWith((persona, turn) => (persona === 'orchestrator' ? hangs(turn) : answer('done')), { tool: hang });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: { force: true } })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 29_000)).toBe(false);
        expect(await endsAfter(sessions, sid, 1_000)).toBe(true);
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop' }]);
      });

      it('a root and a child that both ignore the stop: the run ends at the one 30 s grace, not at a second one the children would start after the root', async () => {
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }, { callId: 'h1', name: 'hang', args: {} }]) : answer('never');
          return toolCalls([{ callId: 'h2', name: 'hang', args: {} }], 'Hanging.');
        }, { tool: hang });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'hang').length === 2);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running' });
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop' }]);
        expect(dal.getLock(sid)).toBeUndefined();
        // Every call's row settles: none is left running (REQ-SESSION-129).
        expect(dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_status === 'running')).toEqual([]);
      });

      it('the explicit cancel: the root is given up on at the grace, the iteration closes cancelled, and its call is recorded cut off', async () => {
        const { sessions } = sessionsWith((persona, turn) => (persona === 'orchestrator' ? hangs(turn) : answer('done')), { tool: hang });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        expect(dal.getLock(sid)).toBeUndefined();
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
        // A call cut by the explicit cancel names no rest (OQ-96, "A call cut by no rest").
        expect(rootHangRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult(null, true, '') });
      });

      /** Everything a finished session holds that a straggler could append to. */
      const holdingsOf = (sid: SessionId) => ({ events: dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind), rows: dal.residentRows(sid), timeline: dal.timelineOf(sid).length, issues: dal.issuesOf(sid).length });
      /** A root that delegates `stuck` and hangs in one step, beside a child whose step ignores its abort and is held. */
      const rootAndDeafChild = (g: { hold: Promise<void> }, over: { drainTimeoutMs?: number } = {}) => sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }, { callId: 'h1', name: 'hang', args: {} }]) : answer('never');
        return { parts: [{ part: { kind: 'text', delta: 'Before. ' } }, { hold: g.hold }, ...answer('Child words after the run ended.', { input: 7, output: 3 }).parts] };
      }, { tool: hang, deaf: ['child'], ...over });
      const childStreamed = (sid: SessionId) => dal.residentRows(sid).some((r) => r.kind === 'agent' && r.name === 'stuck' && r.body === 'Before. ');

      it('REQ-SESSION-094: under the explicit cancel, a child execution beside the root given up on is given up on with it and writes nothing into the finished session when it returns', async () => {
        const g = gate();
        const { sessions } = rootAndDeafChild(g);
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined && childStreamed(sid));
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled' });
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
        const before = holdingsOf(sid);
        g.open();
        await new Promise((r) => setTimeout(r, 30));
        expect(holdingsOf(sid)).toEqual(before);
      });

      it('REQ-ORCH-080: under the explicit cancel, a root given up on still drains the active background children before they are cancelled (OQ-121)', async () => {
        const g = gate();
        const { sessions } = rootAndDeafChild(g, { drainTimeoutMs: 60_000 });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined && childStreamed(sid));
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        // The root is given up on at the grace; the drain then waits its own timeout for the background child.
        expect(await endsAfter(sessions, sid, 30_000)).toBe(false);
        expect(await endsAfter(sessions, sid, 60_000)).toBe(true);
        expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('background_child_drain_timeout');
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'cancelled' });
        const before = holdingsOf(sid);
        g.open();
        await new Promise((r) => setTimeout(r, 30));
        expect(holdingsOf(sid)).toEqual(before);
      });

      it('a root that returns just short of the grace leaves the children\'s rest only what is left of it: the stop ends at the one 30 s, not 30 s after the root returned', async () => {
        const tools: TestTool = (name) => {
          if (name === 'hang') return new Promise<PortToolResult>(() => undefined);
          // Ignores its abort and returns 29 s after the stop, which is made at the same instant on the fake clock.
          if (name === 'slow') return new Promise<PortToolResult>((r) => { clock.after(millis(29_000), () => r({ text: 'slow', isError: false, status: 'ok', durationMs: 1, label: 'slow', args: {} })); });
          return undefined;
        };
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }, { callId: 's1', name: 'slow', args: {} }]) : answer('never');
          return toolCalls([{ callId: 'h2', name: 'hang', args: {} }], 'Hanging.');
        }, { tool: tools });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'slow') && dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang'));
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        // The root returns at 29 s; the child's call still ignores the stop, and the rest waits for it only to 30 s.
        expect(await endsAfter(sessions, sid, 29_000)).toBe(false);
        expect(await endsAfter(sessions, sid, 1_000)).toBe(true);
        expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop' });
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop' }]);
        expect(dal.getLock(sid)).toBeUndefined();
      });

      /*
       * REQ-MONITOR-044/052 (acceptance A20, the verifier's finding on its repair): between a root's return and the end of
       * the rest that waits for its children, the root's calls are in the total — they joined it with the root's outcome —
       * and the run is still live. The run-level agent's figure there is the root's share alone, never that plus the
       * tracker's count of the same calls (`Run.entryUncountedToolCalls` is cleared as its outcome is counted).
       */
      it('REQ-MONITOR-044/052: while the rest waits for a child after the root returned, the run-level agent\'s count holds the root\'s calls once', async () => {
        // The root's two calls are recorded through the writer as the gate records them, so the tracker counts them too.
        let ids = 0;
        const recorded = (ctx: ToolPortContext, name: string, result: Promise<PortToolResult>): Promise<PortToolResult> => {
          const open = { call_id: `r${++ids}`, agent_name: ctx.agentName, tool_name: name, args: {} };
          const ordinal = ctx.writer.openToolCall(open);
          return result.then((r) => { if (ordinal.ok) ctx.writer.settleToolCall(ordinal.value, open, { status: 'ok', elapsed_ms: 1, is_error: false, result: r.text }); return r; });
        };
        const tools: TestTool = (name, _a, ctx, builtIn) => {
          if (name === 'hang') return new Promise<PortToolResult>(() => undefined);
          if (name === 'slow') return recorded(ctx, name, new Promise<PortToolResult>((r) => { clock.after(millis(29_000), () => r({ text: 'slow', isError: false, status: 'ok', durationMs: 1, label: 'slow', args: {} })); }));
          if (name === 'delegate' && ctx.agentName === 'orchestrator') return recorded(ctx, name, builtIn());
          return undefined;
        };
        const snapshots: SessionRecord[] = [];
        const publisher: Publisher = { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } };
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }, { callId: 's1', name: 'slow', args: {} }]) : answer('never');
          return toolCalls([{ callId: 'h2', name: 'hang', args: {} }], 'Hanging.');
        }, { tool: tools, publisher });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'slow') && dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang'));
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        // At 29 s the root has returned with its two calls; the rest still waits for the child's call, to 30 s.
        expect(await endsAfter(sessions, sid, 29_000)).toBe(false);
        expect(dal.getSession(sid)!.tool_calls).toBe(2);
        sessions.owner(sid)!.reconcile();
        const resting = snapshots.at(-1)!;
        expect(resting.toolCalls.total).toBe(2);
        expect(resting.entryToolCalls).toBe(2);
        expect(await endsAfter(sessions, sid, 1_000)).toBe(true);
      });

      it('REQ-SESSION-094: the root\'s call that returns after the run ended writes nothing more into the finished session', async () => {
        let finish!: (r: PortToolResult) => void;
        const late: TestTool = (name) => (name === 'hang' ? new Promise<PortToolResult>((r) => { finish = r; }) : undefined);
        const { sessions } = sessionsWith((persona, turn) => (persona === 'orchestrator' ? hangs(turn) : answer('done')), { tool: late });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootHangRow(sid) !== undefined);
        expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        expect(await endsAfter(sessions, sid, 30_000)).toBe(true);
        const before = { events: dal.eventsFrom(sid, 1, 10_000).length, rows: dal.residentRows(sid).length, row: rootHangRow(sid), record: dal.agentConversation(sid, dal.iterationsOf(sid)[0]!.root_task_id).length };
        finish({ text: 'late', isError: false, status: 'ok', durationMs: 1, label: 'hang', args: {} });
        await new Promise((r) => setTimeout(r, 30));
        expect({ events: dal.eventsFrom(sid, 1, 10_000).length, rows: dal.residentRows(sid).length, row: rootHangRow(sid), record: dal.agentConversation(sid, dal.iterationsOf(sid)[0]!.root_task_id).length }).toEqual(before);
      });
    });

    describe('REQ-MONITOR-102 (the repair of a-root-whose-turn-raises-never-counts-its-calls.md): a root whose turn raises counts its calls from its record', () => {
      const probed: PortToolResult = { text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} };
      const rootRow = (sid: SessionId, name: string) => dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === name && r.name === 'orchestrator');

      it('a raise that closes the iteration failed: the calls it ran reach the total and its iteration, the one it never started does not, and no row is left running', async () => {
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona !== 'orchestrator') return answer('done');
          // One call that returns, then a step whose first call raises out of its dispatch and whose second never starts.
          return turn === 1 ? toolCalls([{ callId: 'q1', name: 'probe', args: {} }]) : toolCalls([{ callId: 'b1', name: 'boom', args: {} }, { callId: 'q2', name: 'probe', args: {} }]);
        }, { tool: (name) => (name === 'boom' ? Promise.reject(new Error('the port raised')) : name === 'probe' ? Promise.resolve(probed) : undefined) });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await sessions.running(sid);
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed' }]);
        // q1 and the raising b1 — q2 was asked for and never started.
        expect(dal.getSession(sid)!.tool_calls).toBe(2);
        expect(dal.iterationsOf(sid)[0]!.root_tool_calls).toBe(2);
        // REQ-SESSION-129: the call it raised out of is answered, and its row settled, as cut off — naming no rest.
        expect(rootRow(sid, 'boom')).toMatchObject({ tool_status: 'failed' });
        expect(rootRow(sid, 'boom')!.output).toMatch(/^This call was cut off before it completed, and it was not re-run\./);
      });

      it('a raise while the run comes to rest leaves the iteration open; the continue counts only the calls the resumed root adds', async () => {
        let fail!: () => void;
        const raised = new Promise<PortToolResult>((_, reject) => { fail = () => reject(new Error('the port raised')); });
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona !== 'orchestrator') return answer('done');
          // q1 returns; b1 raises once the pause is asked for; resumed, the root makes q3 and answers.
          return turn === 1 ? toolCalls([{ callId: 'q1', name: 'probe', args: {} }]) : turn === 2 ? toolCalls([{ callId: 'b1', name: 'boom', args: {} }]) : turn === 3 ? toolCalls([{ callId: 'q3', name: 'probe', args: {} }]) : answer('Done.');
        }, { tool: (name) => (name === 'boom' ? raised : name === 'probe' ? Promise.resolve(probed) : undefined) });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootRow(sid, 'boom') !== undefined);
        expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
        fail();
        await sessions.running(sid);
        expect(warnings.some((w) => /raised while coming to rest, and is left open/.test(w))).toBe(true);
        // q1 and b1, which no returned turn counted.
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause', root_tool_calls: 2 }]);
        expect(dal.getSession(sid)!.tool_calls).toBe(2);
        expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
        expect((await sessions.running(sid))!.status).toBe('completed');
        // q3 added once; the record's first two are not counted again.
        expect(dal.getSession(sid)!.tool_calls).toBe(3);
        expect(dal.iterationsOf(sid)[0]).toMatchObject({ state: 'closed', root_tool_calls: 3 });
      });
    });

    describe('REQ-SESSION-094: a detached call no longer writes through its tool gate or its stream (the repair of a-detached-call-still-writes-through-its-tool-gate.md)', () => {
      it('teardown closes every port the run built, before the terminal pair, each with the statement its open calls settle with', async () => {
        const closed: { agent: string; statement: string; ended: number }[] = [];
        const { sessions } = scriptedChild([() => answer('done')], { closed });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        expect(closed.map((c) => c.agent).sort()).toEqual(['orchestrator', 'work']);
        // Before `session.end`: nothing a port settles can follow the terminal pair.
        expect(closed.every((c) => c.ended === 0 && c.statement === interruptedResult(null, true, ''))).toBe(true);
      });

      it('after a stop, a port is closed with the stop\'s statement', async () => {
        const closed: { agent: string; statement: string; ended: number }[] = [];
        const g = gate();
        const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...look().parts] })], { closed });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => seen.childSteps === 1);
        sessions.control({ op: 'cancel', sessionId: sid, args: {} });
        g.open();
        await sessions.running(sid)!;
        expect(closed.map((c) => c.statement)).toEqual([interruptedResult('stop', true, ''), interruptedResult('stop', true, '')]);
      });

      /** Everything a finished session holds that a straggler could append to. */
      const holdings = (sid: SessionId) => ({ events: dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind), rows: dal.residentRows(sid), timeline: dal.timelineOf(sid).length, issues: dal.issuesOf(sid).length });

      it('a child\'s model step the stop\'s grace gave up on streams no row and counts no usage when it returns', async () => {
        const g = gate();
        // It streams a first word before the stop, so the row it would settle afterwards already exists.
        const { sessions, seen } = scriptedChild([() => ({ parts: [{ part: { kind: 'text', delta: 'Before. ' } }, { hold: g.hold }, ...answer('Words after the run ended.', { input: 7, output: 3 }).parts] })], { deaf: ['child'] });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => seen.childSteps === 1);
        sessions.control({ op: 'cancel', sessionId: sid, args: {} });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid)!;
        expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'stop' });
        expect(dal.residentRows(sid).filter((r) => r.kind === 'agent' && r.name === 'work').map((r) => [r.body, r.settled])).toEqual([['Before. ', 0]]);
        const before = holdings(sid);
        g.open();
        await new Promise((r) => setTimeout(r, 30));
        expect(holdings(sid)).toEqual(before);
      });

      it('the explicit cancel: a child\'s model step that ignores it is awaited within the 30 s grace, then given up on, and streams no row and counts no usage when it returns', async () => {
        const g = gate();
        const rootStep = { calls: 0 };
        // The root delegates, then takes a step that honours the cancel; the child's step streams and ignores it.
        const { sessions, seen } = scriptedChild([() => ({ parts: [{ part: { kind: 'text', delta: 'Before. ' } }, { hold: g.hold }, ...answer('Child words after the run ended.', { input: 7, output: 3 }).parts] })], {
          deaf: ['child'],
          root: (turn) => { rootStep.calls = turn; return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : { parts: [{ hold: new Promise<void>(() => undefined) }, ...answer('never').parts] }; },
        });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => rootStep.calls === 2 && seen.childSteps === 1 && dal.residentRows(sid).some((r) => r.kind === 'agent' && r.name === 'work' && r.body === 'Before. '));
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
        await new Promise((r) => setTimeout(r, 20));
        // The root has returned; the run waits for the child's execution only within the grace.
        expect(dal.eventsOfKind(sid, 'session.end')).toHaveLength(0);
        clock.advance(30_000);
        await sessions.running(sid)!;
        expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
        expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
        expect(warnings.some((w) => /child executions still running at the stop's 30 s grace were given up on/.test(w))).toBe(true);
        const before = holdings(sid);
        g.open();
        await new Promise((r) => setTimeout(r, 30));
        expect(holdings(sid)).toEqual(before);
      });

      it('a root\'s model step the stop\'s grace gave up on streams no row and counts no usage when it returns', async () => {
        const g = gate();
        const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? { parts: [{ hold: g.hold }, ...answer('Root words after the run ended.', { input: 7, output: 3 }).parts] } : answer('done')), { deaf: ['orchestrator'] });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await new Promise((r) => setTimeout(r, 20));
        sessions.control({ op: 'cancel', sessionId: sid, args: {} });
        await new Promise((r) => setTimeout(r, 20));
        clock.advance(30_000);
        await sessions.running(sid)!;
        const before = holdings(sid);
        g.open();
        await new Promise((r) => setTimeout(r, 30));
        expect(holdings(sid)).toEqual(before);
      });
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
      // REQ-ORCH-098 (the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries): the cancel
      // tears the child down, once, in the cancellation's words; the summariser, aborted, wrote no teardown of its own.
      const work = byName(sid, 'work');
      const own = dal.timelineOf(sid).filter((t) => (JSON.parse(t.metadata) as { task_id?: string }).task_id === work.task_id);
      expect(own.filter((t) => ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => [t.name, t.message])).toEqual([
        ['child_end', `Child work (${work.task_id}) ended cancelled.`],
        ['child_result', 'Child work reported cancelled: The user cancelled this child.'],
        ['child_conversation_closed', 'Child work\'s conversation closed.'],
      ]);
      expect(own.findIndex((t) => t.name === 'child_end')).toBeGreaterThan(own.findIndex((t) => t.name === 'child_user_cancelled'));
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

    // REQ-ORCH-053 / REQ-ORCH-098, repair round 1 of a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it: the run
    // closes the iteration's scheduler at its teardown (`IterationChildren.close` from `Run.turn`). Under the explicit cancel —
    // a stop that rests nothing, so `hold` never stops the scheduler — a child's step that ignores the cancel is given up on at
    // the grace and returns after the run's end and after its store closed (as the run host closes one before a backup or a
    // restore, or when a window lets the workspace go): the pass that follows it returns at once, so it reads nothing, warns
    // nothing and rejects nothing. Without the close it reads the closed store and its raise is warned.
    it('REQ-ORCH-053 / REQ-ORCH-098: a child step the explicit cancel gave up on, returning after the run ended and its store closed, finds the scheduler closed by the run', async () => {
      const g = gate();
      const rootStep = { calls: 0 };
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ part: { kind: 'text', delta: 'Before. ' } }, { hold: g.hold }, ...answer('Child words after the run ended.').parts] })], {
        deaf: ['child'],
        root: (turn) => { rootStep.calls = turn; return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : { parts: [{ hold: new Promise<void>(() => undefined) }, ...answer('never').parts] }; },
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => rootStep.calls === 2 && seen.childSteps === 1);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
      expect(warnings.some((w) => /child executions still running at the stop's 30 s grace were given up on/.test(w))).toBe(true);
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => { rejections.push(e); };
      process.on('unhandledRejection', onRejection);
      try {
        dal.db.close();
        g.open();
        await new Promise((r) => setTimeout(r, 40));
        expect(rejections).toEqual([]);
        expect(warnings.filter((m) => /the scheduler's pass after child/.test(m))).toEqual([]);
      } finally {
        process.off('unhandledRejection', onRejection);
        // The suite's afterEach closes the store it finds: give it an open one.
        dal = new StoreDal(openStore(join(dir, 'workspace.db')));
      }
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

    it('REQ-MONITOR-133/134 with clause 4 (the repair of a-steering-prompt-pending-at-a-rest-is-lost, found by its review): a steer that lands after the rest is recorded, while teardown runs its hooks, is refused, not acknowledged and left undelivered for an agent that resumes', async () => {
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
      // The rest is recorded: nothing of this run takes another step, so a steer now is refused, for a child or the root.
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: byName(sid, 'work').task_id, text: 'go left' } })).toEqual({ ok: false });
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } })).toEqual({ ok: false });
      releaseHook();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(dal.timelineOf(sid).filter((t) => t.name.startsWith('steering_'))).toEqual([]);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'running' });
    });

    it('REQ-MONITOR-133 with OQ-128 (found by the second review of the repair of a-steering-prompt-pending-at-a-rest-is-lost): once the rest is recorded a steer is refused, while the open iteration still waits on a blocking consumer and before teardown begins', async () => {
      let releaseDrain!: () => void;
      const drainHold = new Promise<void>((r) => { releaseDrain = r; });
      let holding = false;
      const g = gate();
      const { sessions } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...look().parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // REQ-EVENTS-165: the open iteration's drain waits on this consumer once the rest is in the timeline.
      sessions.bus.attach(sid, { mode: 'blocking', deliver: () => { if (dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')) { holding = true; return drainHold; } return undefined; } });
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      g.open();
      await settle(() => holding);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', interruption: 'pause' });
      // No agent of this run takes another step: a steer acknowledged now would reach no record while its agent resumes.
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: byName(sid, 'work').task_id, text: 'go left' } })).toEqual({ ok: false });
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } })).toEqual({ ok: false });
      releaseDrain();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(dal.timelineOf(sid).filter((t) => t.name.startsWith('steering_'))).toEqual([]);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'running' });
    });

    it('REQ-MONITOR-133 with OQ-128 (found by the review of the repair of a-steering-prompt-pending-at-a-rest-is-lost): once the run\'s teardown has begun a steer is refused, not acknowledged for a step no agent will take', async () => {
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      let ending = false;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event) => { if (event === 'session_end') { ending = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { sessions } = scriptedChild([look], { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => ending);
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } })).toEqual({ ok: false });
      releaseHook();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(dal.timelineOf(sid).filter((t) => t.name.startsWith('steering_'))).toEqual([]);
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

    it('REQ-ORCH-109 with clause 3 (found by the verification of the repair of a-reports-edited-files-counts-refused-writes): a write that landed after the pause\'s tool deadline cut it off is still in the resumed child\'s report', async () => {
      const g = gate();
      const wrote: PortToolResult = { text: 'Overwrote src/app.ts', isError: false, status: 'ok', durationMs: 1, label: 'write_file', args: {} };
      const write = (): ScriptedCall => toolCalls([{ callId: 'w1', name: 'write_file', args: { operation: 'overwrite', path: 'src/app.ts', content: 'x' } }], 'Writing.');
      // The tool holds its `ok` the way a post-tool hook (a formatter) would, past the pause's 30 s tool deadline.
      const { sessions } = scriptedChild([write, () => answer('Wrote src/app.ts.')], { tool: (name) => (name === 'write_file' ? g.hold.then(() => wrote) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'write_file'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(31_000);
      g.open();
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work).toMatchObject({ state: 'paused', interruption: 'pause' });
      // The record: the call is answered as cut off, with what it had produced.
      expect(conversationOf(dal.agentConversation(sid, work.task_id)).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'w1', name: 'write_file', isError: true, result: interruptedResult('pause', true, 'Overwrote src/app.ts') }] });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', report_stored: 1 });
      expect((JSON.parse(byName(sid, 'work').report!) as { edited_files: string[] }).edited_files).toEqual(['src/app.ts']);
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

    // REQ-ORCH-053 / REQ-ORCH-098, repair round 1 of a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it: a
    // resumed child (PD-ORCH-005 clause 4) ends in the same unawaited pass a fresh one does. Its store closes before anything
    // closed the scheduler; the pass that follows its end raises on the closed store, and that raise is warned once, never
    // rejected (before: `.finally(() => this.scheduler.pass())`, an unhandled 'The database connection is not open').
    it('a resumed child that settles after its store is closed: the pass that follows is warned once and rejects nothing', async () => {
      const sid = 'S-resumed-close' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const client = new ScriptedModelClient([{ parts: [{ hold: held }, ...answer('resumed and done').parts] }]);
      const warned: string[] = [];
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => { rejections.push(e); };
      process.on('unhandledRejection', onRejection);
      try {
        const ops = new IterationChildren({
          dal, writer: w.value, sessionId: sid, workspaceRoot: 'C:/ws', owner: null as unknown as ProjectionOwner,
          backend: new DefaultAgentBackend(client), clocks: clock, model: MODEL, thinking: 'unset', modelTimeoutMs: 1000, modelRetries: 0,
          // A cap of 0 holds the accepted child on its model's slot, so it never starts before the test rests it.
          credentialFor: () => async () => '', maxStepsPerTurn: 10, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => 0,
          toolsFor: () => null, summariser: null, runSignal: new AbortController().signal, warn: (m) => warned.push(m),
        }, 1);
        const accepted = await ops.delegate(ops.ledger.root.taskId, { persona: 'coding-agent', taskName: 'work', task: 'TASK: work', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
        expect(accepted.status).toBe('waiting_on_model_slot');
        const taskId = dal.childrenOf(sid)[0]!.task_id;
        // Left paused by a stop while running, as a rest leaves it (PD-ORCH-005 clause 3); the continuation resumes it.
        const rested = ops.ledger.rest(taskId, 'stop', 'running');
        expect(rested.ok).toBe(true);
        expect(ops.resumePaused()).toBe(1);
        for (let i = 0; i < 40 && client.requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
        expect(client.requests).toHaveLength(1);
        // The store closes under the resumed execution, before anything closed the scheduler; then the call returns.
        dal.db.close();
        release();
        await new Promise((r) => setTimeout(r, 40));
        expect(rejections).toEqual([]);
        expect(warned.filter((m) => /the scheduler's pass after child .* raised: .*not open/i.test(m))).toHaveLength(1);
      } finally {
        process.off('unhandledRejection', onRejection);
        // The suite's afterEach closes the store it finds: give it an open one.
        if (!dal.db.open) dal = new StoreDal(openStore(join(dir, 'workspace.db')));
      }
    });

    it('REQ-ORCH-034 / REQ-ORCH-153 (the repair of delegate-reads-no-alias-on-the-built-in-table): with no configured persona catalogue an alias is admitted as its target — refused while the plan gate holds, and granted its target\'s tools', async () => {
      const sid = 'S-alias-built-in' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      let held = true;
      // No `personas`: the engine's built-in table is the catalogue. The gate withholds what writes files or runs commands.
      const ops = new IterationChildren({
        dal, writer: w.value, sessionId: sid, workspaceRoot: 'C:/ws', owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])), clocks: clock, model: MODEL, thinking: 'unset', modelTimeoutMs: 1000, modelRetries: 0,
        // A cap of 0 holds an accepted child on its model's slot, so nothing starts once the test's store is closed.
        credentialFor: () => async () => '', maxStepsPerTurn: 10, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => 0,
        toolsFor: () => null, summariser: null, runSignal: new AbortController().signal, warn: () => undefined,
        planGate: { held: () => held, withholds: (t) => ['write_file', 'haet_edit', 'haet', 'terminal'].includes(t) },
      }, 1);
      const root = ops.ledger.root.taskId;
      const request = (persona: string, taskName: string) => ({ persona, taskName, task: 'TASK: t', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
      // While the gate holds, `coder` and `playwright` are refused as the roles they name, before any record exists.
      const coder = await ops.delegate(root, request('coder', 'write'));
      expect(coder).toMatchObject({ status: 'rejected' });
      expect(coder.message).toContain("The 'coder' role was not started");
      expect(coder.message).toContain('write_file');
      const playwright = await ops.delegate(root, request('playwright', 'look'));
      expect(playwright).toMatchObject({ status: 'rejected' });
      expect(playwright.message).toContain('terminal');
      expect(dal.childrenOf(sid)).toHaveLength(0);
      // Released, the alias is accepted as its target, granted the target's tools and recorded under the run's key.
      held = false;
      const accepted = await ops.delegate(root, request('coder', 'write'));
      expect(accepted.status).toBe('waiting_on_model_slot');
      expect(accepted.message).toContain("Alias 'coder' resolved to 'coding-agent'");
      const row = dal.childrenOf(sid)[0]!;
      // The target's tools reach the child through its port, which is built for the row's persona; the row records the grant
      // that port puts in force once ready (REQ-MCP-065), and none at spawn — until 2026-10-01 it recorded the target's
      // declared tools here (`docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).
      expect(row.persona).toBe('coding-agent');
      expect(JSON.parse(row.granted_tools)).toEqual([]);
      expect(row.model_key).toBe(MODEL.modelId);
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

    it('REQ-ORCH-098 (the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries): it and its paused descendant are torn down once each, after their `child_user_cancelled`, in their reports\' words; the rest are not', async () => {
      const { sessions, sid } = await restedFamily();
      const one = byName(sid, 'one').task_id;
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      const teardown = ['child_end', 'child_result', 'child_conversation_closed'];
      const ownOf = (taskId: string) => dal.timelineOf(sid).filter((t) => (JSON.parse(t.metadata) as { task_id?: string }).task_id === taskId);
      for (const name of ['one', 'grand']) {
        const c = byName(sid, name);
        expect(ownOf(c.task_id).filter((t) => teardown.includes(t.name)).map((t) => [t.name, t.message]), name).toEqual([
          ['child_end', `Child ${name} (${c.task_id}) ended cancelled.`],
          ['child_result', `Child ${name} reported cancelled: ${(JSON.parse(c.report!) as { summary: string }).summary}`],
          ['child_conversation_closed', `Child ${name}'s conversation closed.`],
        ]);
        expect(ownOf(c.task_id).findIndex((t) => t.name === 'child_end'), name).toBeGreaterThan(ownOf(c.task_id).findIndex((t) => t.name === 'child_user_cancelled'));
      }
      // `two` is still paused, and `quick` was torn down by its own settle when it finished.
      expect(ownOf(byName(sid, 'two').task_id).filter((t) => teardown.includes(t.name))).toEqual([]);
      expect(ownOf(byName(sid, 'quick').task_id).filter((t) => teardown.includes(t.name)).map((t) => t.name)).toEqual(teardown);
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

    it('the resume path: the rest waits for the settle, its `child_completed` hook included, as it waits for a fresh child\'s (PD-ORCH-005 clause 2)', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let releaseTwo!: () => void;
      const holdTwo = new Promise<void>((r) => { releaseTwo = r; });
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      const state = { resumed: false, hookEntered: false, twoHeld: false };
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed' && state.resumed && fields['child_name'] === 'one') { state.hookEntered = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        // `two`, resumed, holds its step so the run is still live when the settle of `one` reaches its hook.
        if (state.resumed) { state.twoHeld = true; return { parts: [{ hold: holdTwo }, ...answer('two: done').parts] }; }
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running' && byName(sid, 'two')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect([one.state, byName(sid, 'two')!.state]).toEqual(['paused', 'paused']);
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      state.resumed = true;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => state.hookEntered && state.twoHeld);
      expect(byName(sid, 'one')?.state).toBe('failed');
      const resting = sessions.running(sid)!;
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      let rested = false;
      void resting.then(() => { rested = true; });
      releaseTwo();
      await settle(() => byName(sid, 'two')?.state !== 'running');
      await new Promise((r) => setTimeout(r, 100));
      // `two` has come to rest; the settle of `one` still holds in its hook, so the rest has not finished: the settle is
      // one of the executions it waits for.
      expect(rested).toBe(false);
      releaseHook();
      await resting;
      expect(rested).toBe(true);
    });
  });

  describe('REQ-HOOKS-076 / REQ-HOOKS-080, the repair of a-child-completed-hook-can-finish-after-its-iteration-ends: a child\'s `child_completed` hook runs in line — its parent takes it as ended, and the iteration ends, only once the hook is done', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    /** The run as a run without its hook in line would end it: given this long to get there before a test says it did not. */
    const RACE_ROUNDS = 40;
    /** Every lifecycle occurrence's start and end, in order, with each of `names`' `child_completed` held until it is released. */
    function heldHooks(...names: string[]) {
      const order: string[] = [];
      const held = new Map<string, { hold: Promise<void>; release: () => void; entered: boolean }>();
      for (const name of names) {
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        held.set(name, { hold, release, entered: false });
      }
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          const label = event === 'child_completed' ? `child_completed(${String(fields['child_name'])})` : event;
          order.push(`${label}:start`);
          const h = event === 'child_completed' ? held.get(String(fields['child_name'])) : undefined;
          if (h) { h.entered = true; await h.hold; }
          order.push(`${label}:end`);
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { order, hooks, entered: (name: string) => held.get(name)?.entered === true, release: (name: string) => { held.get(name)?.release(); } };
    }
    /** `heldHooks` for one child: its hook held until `release`. */
    function heldHook(name: string) {
      const { order, hooks, entered, release } = heldHooks(name);
      return { order, hooks, state: { get entered() { return entered(name); } }, release: () => release(name) };
    }
    /** REQ-HOOKS-076's order for two children whose hooks overlap, `first`'s having started first and ended first. */
    const bothInOrder = (first: string, second: string) => ['session_start:start', 'session_start:end', `child_completed(${first}):start`, `child_completed(${second}):start`, `child_completed(${first}):end`, `child_completed(${second}):end`, 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end'];
    /** PD-ORCH-005 clause 1: an agent's words are in its recorded conversation once the step that said them has ended. */
    const said = (sid: SessionId, text: string): boolean => (dal.db.prepare('SELECT body FROM agent_messages WHERE session_id = ?').all(sid) as { body: string }[]).some((r) => r.body.includes(text));
    /** REQ-HOOKS-076: the order of a run in which each of the four events occurs once. */
    const inOrder = (child: string) => ['session_start:start', 'session_start:end', `child_completed(${child}):start`, `child_completed(${child}):end`, 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end'];
    const lifecycle = (order: readonly string[]) => order.filter((e) => !e.startsWith('root:'));
    const delegation = (name: string, background = true) => ({ callId: `d-${name}`, name: 'delegate', args: { persona: 'coding-agent', task_name: name, task: `TASK: ${name}`, run_in_background: background } });

    it('the fresh path: a background child whose execution raises outside its turn — the root is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('broken');
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('broken')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered && order.includes('root:2'));
      await settle(() => order.includes('root:3') || order.includes('iteration_end:start'), RACE_ROUNDS);
      // The hook holds the run: the root has not been given the report, and the iteration has not ended.
      expect(order).not.toContain('root:3');
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(broken):end'));
      expect(lifecycle(order)).toEqual(inOrder('broken'));
    });

    it('the resume path: a paused child whose record cannot be decoded — the resumed root is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('one');
      let releaseStep!: () => void;
      const step = new Promise<void>((r) => { releaseStep = r; });
      const script = { resumed: false };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('one')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (script.resumed) return answer('done');
        return { parts: [{ hold: step }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseStep();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect(one.state).toBe('paused');
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      script.resumed = true;
      order.length = 0;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => state.entered);
      await settle(() => order.some((e) => e.startsWith('root:')) || order.includes('iteration_end:start'), RACE_ROUNDS);
      // The root resumed into waiting for `one` (OQ-97); it is given the report only once the hook is done.
      expect(order.filter((e) => e.startsWith('root:'))).toEqual([]);
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.findIndex((e) => e.startsWith('root:'))).toBeGreaterThan(order.indexOf('child_completed(one):end'));
      expect(lifecycle(order)).toEqual(inOrder('one'));
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('a child that ends while its parent is still in its turn (the normal settle): the parent is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('quick');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('quick')]);
          // The root's step after the delegation is still streaming when the child ends and its hook starts.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...answer('still working').parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      expect(byName(sid, 'quick')?.state).toBe('succeeded');
      releaseRoot();
      await settle(() => order.includes('root:3') || order.includes('iteration_end:start'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(quick):end'));
      expect(lifecycle(order)).toEqual(inOrder('quick'));
    });

    it('a root whose turn fails while its child\'s hook still runs: the session ends only after the hook', async () => {
      const { order, hooks, state, release } = heldHook('broken');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          return turn === 1 ? toolCalls([delegation('broken')]) : { parts: [{ hold: rootStep }, { error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      releaseRoot();
      await settle(() => order.includes('iteration_end:start') || order.includes('session_end:start'), RACE_ROUNDS);
      expect(order).not.toContain('iteration_end:start');
      expect(order).not.toContain('session_end:start');
      release();
      await sessions.running(sid);
      // Whatever else the failed turn leads to, the child's hook ends before the iteration's and the session's own.
      const done = order.indexOf('child_completed(broken):end');
      expect(done).toBeGreaterThan(-1);
      expect(order.filter((e, i) => i < done && (e.startsWith('iteration_end') || e.startsWith('session_end')))).toEqual([]);
      expect(order.at(-1)).toBe('session_end:end');
    });

    it('wait_for_tasks naming a child whose settle is still running: the wait returns its report only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('quick');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('quick')]);
          // Asked once `quick` has ended and its hook has started: the wait finds it terminal at once.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'quick')!.task_id] } }]).parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      releaseRoot();
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(quick):end'));
      expect(lifecycle(order)).toEqual(inOrder('quick'));
    });

    it('wait_for_tasks naming two children: the second one\'s settle does not release the wait while the first one\'s hook still runs', async () => {
      const { order, hooks, state, release } = heldHook('first');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      const waited = { issued: false };
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          if (turn === 2) return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'first')!.task_id, byName(sid, 'second')!.task_id] } }]);
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks, tool: (name, _args, _ctx, builtIn) => { if (name !== 'wait_for_tasks') return undefined; waited.issued = true; return builtIn(); } });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // The wait is registered while both children still run, so it is released by a settle, not found done at once.
      await settle(() => waited.issued);
      releaseFirst();
      await settle(() => state.entered);
      releaseSecond();
      await settle(() => order.includes('child_completed(second):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(first):end'));
      expect(lifecycle(order).filter((e) => !e.startsWith('child_completed(second)'))).toEqual(inOrder('first'));
    });

    it('wait_for_tasks waiting on the first child\'s hook while the second ends and starts its own: the wait returns only once both hooks are done', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const waited = { issued: false };
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          // Asked once `first` has ended and its hook has started, while `second` still runs.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'first')!.task_id, byName(sid, 'second')!.task_id] } }]).parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks, tool: (name, _args, _ctx, builtIn) => { if (name !== 'wait_for_tasks') return undefined; waited.issued = true; return builtIn(); } });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      releaseRoot();
      // The wait is issued while `first`'s hook holds: it waits on that settle.
      await settle(() => waited.issued);
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      // `second` ended while the wait waited on `first`: its hook still holds, so the wait has not returned its report.
      expect(order).not.toContain('root:3');
      release('second');
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(second):end'));
      expect(lifecycle(order)).toEqual(bothInOrder('first', 'second'));
    });

    it('the resume loop waiting on the first child\'s hook while the second ends and starts its own: the parent is given the reports only once both hooks are done', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          // Still streaming when `first` ends: the turn ends with `first` ended and unobserved, so the loop finds it at once.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...answer('root is still working').parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      releaseRoot();
      // The root's turn has ended: its loop waits on `first`'s settle.
      await settle(() => said(sid, 'root is still working'));
      await new Promise((r) => setTimeout(r, 20));
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      // `second` ended while the loop waited on `first`: its hook still holds, so neither report has been given.
      expect(order).not.toContain('root:3');
      release('second');
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(second):end'));
      expect(lifecycle(order)).toEqual(bothInOrder('first', 'second'));
    });

    it('a root whose turn fails while the first child\'s hook runs, the second then ending and starting its own: the session ends only after both hooks', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          return turn === 1 ? toolCalls([delegation('first'), delegation('second')]) : { parts: [{ hold: rootStep }, { error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      // The root's turn fails with `second` still running: the end of its loop waits on `first`'s settle.
      releaseRoot();
      await new Promise((r) => setTimeout(r, 20));
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('iteration_end:start') || order.includes('session_end:start'), RACE_ROUNDS);
      // `second` ended while the root waited on `first`: its hook still holds, so the iteration has not ended.
      expect(order).not.toContain('iteration_end:start');
      expect(order).not.toContain('session_end:start');
      release('second');
      await sessions.running(sid);
      // Whatever else the failed turn leads to, both hooks end before the iteration's and the session's own.
      const done = order.indexOf('child_completed(second):end');
      expect(done).toBeGreaterThan(order.indexOf('child_completed(first):end'));
      expect(order.filter((e, i) => i < done && (e.startsWith('iteration_end') || e.startsWith('session_end')))).toEqual([]);
      expect(order.at(-1)).toBe('session_end:end');
    });

    it('REQ-ORCH-088: a child that lands at its own limit while a child of its own is still in its hook settles only after that hook', async () => {
      const { order, hooks, state, release } = heldHook('leaf');
      let releaseLeaf!: () => void;
      const leafStep = new Promise<void>((r) => { releaseLeaf = r; });
      let releaseMid!: () => void;
      const midStep = new Promise<void>((r) => { releaseMid = r; });
      let midAsked = 0;
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('mid')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!textOf(req).includes('TASK: mid')) return { parts: [{ hold: leafStep }, ...answer('leaf: done').parts] };
        midAsked += 1;
        if (midAsked === 1) return toolCalls([delegation('leaf')]);
        // In flight when the limit expires: it finishes, and the child stops before its next step (the landing).
        if (midAsked === 2) return { parts: [{ hold: midStep }, ...toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: byName(sid, 'leaf')!.task_id } }], 'Checking on leaf.').parts] };
        return answer('mid: never asked again');
      }, { hooks, childTimeoutMs: 60_000 });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => midAsked === 2 && byName(sid, 'leaf')?.state === 'running');
      releaseLeaf();
      await settle(() => state.entered);
      clock.advance(60_000);
      releaseMid();
      await settle(() => order.includes('child_completed(mid):start') || order.includes('iteration_end:start'), RACE_ROUNDS);
      // `mid` has landed, its loop ended with `leaf` in its hook: it has not settled, and the iteration has not ended.
      expect(order).not.toContain('child_completed(mid):start');
      expect(order).not.toContain('iteration_end:start');
      expect(byName(sid, 'mid')?.state).toBe('running');
      release();
      await sessions.running(sid);
      expect(midAsked).toBe(2);
      const mid = byName(sid, 'mid')!;
      expect(mid.state).toBe('failed');
      expect((JSON.parse(mid.report!) as { errors: { type: string }[] }).errors.map((e) => e.type)).toContain('timeout');
      expect(lifecycle(order)).toEqual(['session_start:start', 'session_start:end', 'child_completed(leaf):start', 'child_completed(leaf):end', 'child_completed(mid):start', 'child_completed(mid):end', 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end']);
    });
  });

  describe('REQ-ORCH-048 / REQ-TOOLS-156 / REQ-HOOKS-079, the repair of a-raise-after-a-childs-terminal-transition-never-releases-its-parent: a `child_completed` hook that raises still releases the parent', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /** A hook port whose `child_completed` raises — the port's contract does not say it never does — counting each firing. */
    function raisingHooks() {
      const fired: string[] = [];
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed') { fired.push(String(fields['child_name'])); throw new Error('the hook port exploded'); } return []; },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { hooks, fired };
    }

    it('the settle in `execute`: a foreground delegation\'s wait (REQ-TOOLS-156) resolves with the report, once, and the run ends', async () => {
      const { hooks, fired } = raisingHooks();
      const rootAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quick', task: 'TASK: quick', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => rootAsked.length >= 2);
      // Without the repair the wait never resolves: the child is `succeeded`, and its parent is never told.
      expect(byName(sid, 'quick')?.state).toBe('succeeded');
      expect(rootAsked).toHaveLength(2);
      expect(rootAsked[1]).toContain('quick: done');
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
      // The hook fired once; its raise reduced to a warning naming it (REQ-HOOKS-079), and the report reached the root once.
      expect(fired).toEqual(['quick']);
      expect(warnings.filter((w) => w.includes('child_completed') && w.includes('the hook port exploded'))).toHaveLength(1);
      expect(rootAsked.filter((t) => t.includes('quick: done'))).toHaveLength(1);
      // REQ-ORCH-098: its teardown is whole.
      const row = byName(sid, 'quick')!;
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
    });

    it('the settle in `execute`: a parent waiting in its resume loop for a background child is resumed with the report', async () => {
      const { hooks, fired } = raisingHooks();
      let releaseChild!: () => void;
      const childStep = new Promise<void>((r) => { releaseChild = r; });
      const rootAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: slow' } }]) : answer(turn === 2 ? 'waiting for slow' : 'handled'); }
        if (persona === 'summariser') return answer('{"summary":"slow is done"}');
        return { parts: [{ hold: childStep }, ...answer('slow: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => rootAsked.length === 2 && byName(sid, 'slow')?.state === 'running');
      await new Promise((r) => setTimeout(r, 20));
      releaseChild();
      await settle(() => rootAsked.length >= 3);
      expect(byName(sid, 'slow')?.state).toBe('succeeded');
      expect(rootAsked).toHaveLength(3);
      expect(rootAsked[2]).toContain('slow: done');
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The report reached the root once: its last request, which carries its whole conversation, holds it once.
      expect(rootAsked[2]!.split('slow: done')).toHaveLength(2);
      expect(fired).toEqual(['slow']);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('the settle in `settleRaised`: a child whose execution raised outside its turn still releases its parent\'s foreground wait', async () => {
      const { hooks, fired } = raisingHooks();
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      const rootAsked: string[] = [];
      // One model slot (REQ-ORCH-050): `broken` is held behind `first`, so it starts — and raises — only once its parent is
      // already waiting on it, rather than inside the delegation, before the wait begins.
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'first', task: 'TASK: first' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'broken', task: 'TASK: broken', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"first is done"}');
        return { parts: [{ hold: firstStep }, ...answer('first: done').parts] };
      }, { raisingPort: 'broken', hooks, cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'broken')?.state === 'waiting_on_model_slot');
      releaseFirst();
      await settle(() => rootAsked.length >= 2);
      expect(byName(sid, 'broken')?.state).toBe('failed');
      expect(rootAsked[1]).toContain('no tool port for broken');
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Then resumed once more, with `first`'s report — whose own hook raised too.
      expect(rootAsked).toHaveLength(3);
      expect(rootAsked[2]).toContain('first: done');
      // Each report reached the root once: its last request, which carries its whole conversation, holds each once.
      expect(rootAsked[2]!.split('no tool port for broken')).toHaveLength(2);
      expect(rootAsked[2]!.split('first: done')).toHaveLength(2);
      expect(fired.sort()).toEqual(['broken', 'first']);
      expect(warnings.filter((w) => w.includes('child_completed') && w.includes('the hook port exploded'))).toHaveLength(2);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });
  });

  /**
   * REQ-HOOKS-003 ("`child_completed` once a delegated child agent has finished, whatever its final state"), REQ-HOOKS-075
   * (its `state` is one of `succeeded`, `failed`, `cancelled` or `blocked`), REQ-ORCH-048 and REQ-ORCH-052 (terminal-state
   * callbacks fire for cascaded and swept records "exactly as for directly completed ones"): the repair of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`. Only a child's own execution and
   * `settleRaised` fired it; every other path that ends a child fired nothing.
   */
  describe('REQ-HOOKS-003 / REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-053 / REQ-ORCH-133 / PD-ORCH-005 clause 6: a child settled outside its execution fires `child_completed`', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /**
     * Every lifecycle occurrence in order, a `child_completed` labelled by its child, and each `child_completed`'s fields.
     * `held`: the child whose `child_completed` is held until `release`, its end then recorded as `…:end`.
     */
    function recordingHooks(held?: string) {
      const order: string[] = [];
      const completed: Record<string, unknown>[] = [];
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') { order.push(event); return []; }
          const name = String(fields['child_name']);
          completed.push({ ...fields });
          order.push(`child_completed(${name})`);
          if (name === held) { await hold; order.push(`child_completed(${name}):end`); }
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { order, completed, hooks, release: () => release() };
    }
    const fieldsOf = (row: ChildRow, state: string, summary: string) => ({ child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state, status: state, summary });

    it('REQ-ORCH-048: a child the cascade blocks fires it, `blocked`, with its report\'s summary, before the iteration ends', async () => {
      const { order, completed, hooks } = recordingHooks();
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [byName(sid, 'a').task_id] } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked.
        return answer(textOf(req).includes('TASK: b') ? 'b ran.' : '');
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const b = byName(sid, 'b');
      expect(b.state).toBe('blocked');
      expect(completed.filter((f) => f['child_name'] === 'b')).toEqual([fieldsOf(b, 'blocked', (JSON.parse(b.report!) as { summary: string }).summary)]);
      expect(order.filter((e) => e.startsWith('child_completed(b)'))).toHaveLength(1);
      expect(order.indexOf('child_completed(b)')).toBeGreaterThan(order.indexOf('child_completed(a)'));
      expect(order.indexOf('child_completed(b)')).toBeLessThan(order.indexOf('iteration_end'));
    });

    it('REQ-ORCH-133: the user\'s cancel of one running child fires it once, `cancelled`, before the iteration ends', async () => {
      const { order, completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(work)', 'iteration_end', 'session_end']);
    });

    it('REQ-ORCH-052: a child the finalize sweep cancels at the explicit cancel — one that never started — fires it once, `cancelled`, before the run ends', async () => {
      // `second`'s hook is held: the run ends only after it (REQ-HOOKS-076 / REQ-HOOKS-080).
      const { order, completed, hooks, release } = recordingHooks('second');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      // One model slot (REQ-ORCH-050): `second` waits behind `first`, so no execution of its own ends it.
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'first', task: 'TASK: first' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'second', task: 'TASK: second' } }]) : answer('never');
        if (persona === 'summariser') return answer('{}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks, cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'first')?.state === 'running' && byName(sid, 'second')?.state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('child_completed(second)'));
      await settle(() => order.includes('session_end'), 40);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      const second = byName(sid, 'second');
      expect(second.state).toBe('cancelled');
      expect(completed.filter((f) => f['child_name'] === 'second')).toEqual([fieldsOf(second, 'cancelled', (JSON.parse(second.report!) as { summary: string }).summary)]);
      expect(order.filter((e) => e.startsWith('child_completed') && !e.endsWith(':end')).sort()).toEqual(['child_completed(first)', 'child_completed(second)']);
      expect(order.indexOf('child_completed(second):end')).toBeLessThan(order.indexOf('session_end'));
    });

    it('REQ-ORCH-052: a child the finalize sweep cancels at an ordinary exit — its root\'s turn failed — fires it, and the iteration ends only after it', async () => {
      const { order, completed, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : { parts: [{ error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        if (persona === 'summariser') return answer('{}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('child_completed(work)'));
      await settle(() => order.includes('iteration_end') || order.includes('session_end'), 40);
      // The sweep's hook holds the run: neither the iteration's hook nor the session's has started (REQ-HOOKS-076/080).
      expect(order).not.toContain('iteration_end');
      expect(order).not.toContain('session_end');
      release();
      releaseChild();
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', (JSON.parse(work.report!) as { summary: string }).summary)]);
      const done = order.indexOf('child_completed(work):end');
      expect(order.filter((e, i) => i < done && (e === 'iteration_end' || e === 'session_end'))).toEqual([]);
      expect(order.at(-1)).toBe('session_end');
    });

    it('REQ-ORCH-053: a child a previous run left unfinished, settled by the next run, fires it after that run\'s `session_start`', async () => {
      const { order, completed, hooks } = recordingHooks();
      const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? answer('hi') : answer('{}')), { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      // A child left `running` by a previous run, as a killed host would leave it.
      dal.insertChild({ session_id: sid, task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: dal.iterationsOf(sid)[0]!.root_task_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: new Date(Number(clock.instant())).toISOString() });
      order.length = 0;
      expect(sessions.prompt(sid, 'again').ok).toBe(true);
      await sessions.running(sid)!;
      const ghost = byName(sid, 'ghost');
      expect(ghost.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(ghost, 'cancelled', 'Cancelled: the run that owned this child ended (killed host or hard cancel) before it settled.')]);
      expect(order.slice(0, 2)).toEqual(['session_start', 'child_completed(ghost)']);
    });

    it('PD-ORCH-005 clause 6: "continue without them" fires it for each paused agent it cancels, after the continuing run\'s `session_start`', async () => {
      const { order, completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await sessions.running(sid)!;
      expect(byName(sid, 'work').state).toBe('paused');
      expect(completed).toEqual([]);
      order.length = 0;
      expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', (JSON.parse(work.report!) as { summary: string }).summary)]);
      expect(order.slice(0, 2)).toEqual(['session_start', 'child_completed(work)']);
    });

    it('REQ-HOOKS-076 with clause 22 (found by the verification of this repair): a child followed up while its cancel\'s hook still runs fires it once for each end, not a third time when the first hook ends mid-way through the second', async () => {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const ends: string[] = [];
      const gates = [gateOf(), gateOf()];
      let n = 0;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const i = n; n += 1;
          ends.push(String(fields['state']));
          await gates[i]?.hold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const rootGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          // Its second step is held until the cancel's hook is running, then follows the cancelled child up.
          if (turn === 2) return { parts: [{ hold: rootGate.hold }, ...toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: again', session_id: byName(sid, 'work').task_id } }]).parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: again') ? answer('Done again.') : { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => ends.length === 1);
      rootGate.open();
      // The follow-up ends and its own settle's hook starts while the cancel's hook still runs.
      await settle(() => ends.length === 2);
      expect(ends).toEqual(['cancelled', 'succeeded']);
      gates[0]!.open();
      await new Promise((r) => setTimeout(r, 20));
      gates[1]!.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('succeeded');
      expect(ends).toEqual(['cancelled', 'succeeded']);
    });

    it('REQ-HOOKS-080 (the third verification of this repair): a parent takes a child the user cancelled as ended only once its `child_completed` hook is done — its next model step waits for the hook', async () => {
      const { order, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root(${turn})`);
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work', background: true } }]) : answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // The root's turn has ended and it waits on its child in the resume loop.
      await settle(() => byName(sid, 'work')?.state === 'running' && order.includes('root(2)'));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('child_completed(work)'));
      await settle(() => order.includes('root(3)'), 40);
      // The cancel woke the parent, but the child is settling until its hook is done: no model step yet.
      expect(order).not.toContain('root(3)');
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(order.indexOf('root(3)')).toBeGreaterThan(order.indexOf('child_completed(work):end'));
    });

    it('REQ-HOOKS-003 (the third verification of this repair): a store that cannot be read as the scheduler is told still fires the hook, from the moved row', async () => {
      const { completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      const workId = byName(sid, 'work').task_id;
      // The cancel's timeline entry arms one failed read of the child's record: the next, the terminal listener's.
      let armed = false;
      const insert = dal.insertTimeline.bind(dal);
      const inserted = vi.spyOn(dal, 'insertTimeline').mockImplementation((...args: Parameters<typeof dal.insertTimeline>) => { if (args[3] === 'child_user_cancelled') armed = true; return insert(...args); });
      const getChild = dal.getChild.bind(dal);
      let raised = 0;
      const read = vi.spyOn(dal, 'getChild').mockImplementation((s: SessionId, taskId: string) => {
        if (armed && taskId === workId) { armed = false; raised += 1; throw new Error('SQLITE_IOERR: disk I/O error'); }
        return getChild(s, taskId);
      });
      try {
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: workId } })).toEqual({ ok: true });
      } finally { inserted.mockRestore(); read.mockRestore(); }
      expect(raised).toBe(1);
      releaseChild();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('cancelled');
      expect(completed.map((f) => [f['child_name'], f['state']])).toEqual([['work', 'cancelled']]);
    });

    it('REQ-HOOKS-080 with clause 22 (the third verification of this repair): a child followed up while its cancel\'s hook runs is still settling when that hook ends and the follow-up\'s own hook runs — its parent waits for the second', async () => {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const order: string[] = [];
      const gates = [gateOf(), gateOf()];
      let n = 0;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const i = n; n += 1;
          order.push(`hook${i}(${String(fields['state'])})`);
          await gates[i]?.hold;
          order.push(`hook${i}:end`);
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const followGate = gateOf();
      const endTurnGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root(${turn})`);
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          // Held until the cancel's hook is running, then follows the cancelled child up.
          if (turn === 2) return { parts: [{ hold: followGate.hold }, ...toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: again', session_id: byName(sid, 'work').task_id } }]).parts] };
          // Held until the follow-up has ended and the cancel's hook has ended too: the turn then ends and the root finds
          // its child ended on its own, while the follow-up's own hook still runs.
          if (turn === 3) return { parts: [{ hold: endTurnGate.hold }, ...answer('root turn 3').parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: again') ? answer('Done again.') : { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('hook0(cancelled)'));
      followGate.open();
      // The follow-up ends `succeeded` and its own settle's hook starts while the cancel's hook still runs.
      await settle(() => order.includes('hook1(succeeded)'));
      gates[0]!.open();
      await settle(() => order.includes('hook0:end'));
      endTurnGate.open();
      await settle(() => order.includes('root(4)'), 40);
      // The first hook's end did not end the second's settle: the root has not been resumed with its child's report.
      expect(order).not.toContain('root(4)');
      gates[1]!.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('succeeded');
      expect(order.indexOf('root(4)')).toBeGreaterThan(order.indexOf('hook1:end'));
    });

    /**
     * Two children, `y` and `x`. The user cancels `y`, whose hook is held, then `x`, whose hook is queued behind it; the
     * root follows `x` up (clause 22) before `y`'s hook ends. `again` says how the follow-up goes.
     */
    function queuedBehindAHeldHook(again: 'answers' | 'holds') {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const fired: { name: string; state: string; summary: string }[] = [];
      const yGate = gateOf();
      const rootGate = gateOf();
      const againGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const name = String(fields['child_name']);
          fired.push({ name, state: String(fields['state']), summary: String(fields['summary']) });
          if (name === 'y') await yGate.hold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'y', task: 'TASK: y' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'x', task: 'TASK: x' } }]);
          if (turn === 2) return { parts: [{ hold: rootGate.hold }, ...toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'x', task: 'TASK: again', session_id: byName(sid, 'x').task_id } }]).parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"the follow-up\'s summary"}');
        if (textOf(req).includes('TASK: again')) return again === 'answers' ? answer('Done again.') : { parts: [{ hold: againGate.hold }, ...answer('late again').parts] };
        return { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const cancelBoth = async () => {
        await settle(() => byName(sid, 'y')?.state === 'running' && byName(sid, 'x')?.state === 'running');
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'y').task_id } })).toEqual({ ok: true });
        await settle(() => fired.length === 1);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'x').task_id } })).toEqual({ ok: true });
        releaseChild();
        rootGate.open();
      };
      return { sessions, sid, fired, cancelBoth, releaseY: yGate.open, releaseAgain: againGate.open };
    }

    it('REQ-HOOKS-075 / REQ-HOOKS-076 with clause 22 (found by the verification of this repair): a hook queued behind another carries the fields of the end that queued it, not those of a later end of the same child', async () => {
      const { sessions, sid, fired, cancelBoth, releaseY } = queuedBehindAHeldHook('answers');
      await cancelBoth();
      // The follow-up ends `succeeded` and its own settle's hook runs while `x`'s cancel's hook still waits behind `y`'s.
      await settle(() => fired.some((f) => f.name === 'x'));
      expect(byName(sid, 'x').state).toBe('succeeded');
      expect(fired.map((f) => `${f.name}:${f.state}`)).toEqual(['y:cancelled', 'x:succeeded']);
      releaseY();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Each end once, each with its own state and summary: the cancel's is not replaced by the follow-up's record.
      const xs = fired.filter((f) => f.name === 'x').sort((a, b) => a.state.localeCompare(b.state));
      expect(xs).toEqual([{ name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' }, { name: 'x', state: 'succeeded', summary: 'the follow-up\'s summary' }]);
      expect(fired.filter((f) => f.name === 'y')).toEqual([{ name: 'y', state: 'cancelled', summary: 'The user cancelled this child.' }]);
    });

    it('REQ-HOOKS-003 with clause 22 (found by the verification of this repair): a followed-up child cancelled again while its first cancel\'s hook is still queued fires it for the second cancel too', async () => {
      const { sessions, sid, fired, cancelBoth, releaseY, releaseAgain } = queuedBehindAHeldHook('holds');
      await cancelBoth();
      // The follow-up is running while `x`'s first cancel's hook still waits behind `y`'s; the user cancels it again.
      await settle(() => byName(sid, 'x')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'x').task_id } })).toEqual({ ok: true });
      releaseAgain();
      releaseY();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'x').state).toBe('cancelled');
      expect(fired.filter((f) => f.name === 'x')).toEqual([
        { name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' },
        { name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' },
      ]);
    });

    /**
     * Two children, `a` and `b`, each held in its step, and `b`'s `child_completed` held. The run is brought to rest by
     * `op` and the user cancels `b` while the rest waits on the executions it saw when it began (the fourth verification
     * of this repair). The children are deaf to the stop's abort, so a stop's rest waits on their steps as a pause's does.
     */
    async function cancelledWhileTheRestWaits(op: 'pause' | 'cancel') {
      const { order, completed, hooks, release } = recordingHooks('b');
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const aGate = gateOf();
      const bGate = gateOf();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'a', task: 'TASK: a' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'b', task: 'TASK: b' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold: textOf(req).includes('TASK: b') ? bGate.hold : aGate.hold }, ...answer('late').parts] };
      }, { hooks, deaf: ['child'] });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'a')?.state === 'running' && byName(sid, 'b')?.state === 'running');
      expect(sessions.control({ op, sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'b').task_id } })).toEqual({ ok: true });
      bGate.open();
      await settle(() => order.includes('child_completed(b)'));
      aGate.open();
      await settle(() => order.includes('session_end') || dal.timelineOf(sid).some((t) => t.name === 'iteration_paused'), 40);
      return { sessions, sid, order, completed, release };
    }

    it('REQ-HOOKS-076 / REQ-HOOKS-080 with PD-ORCH-005 clause 2 (the fourth verification of this repair): a child the user cancels while a pause waits on the executions is waited for too — its `child_completed` ends before the rest is recorded and before `session_end`', async () => {
      const { sessions, sid, order, completed, release } = await cancelledWhileTheRestWaits('pause');
      // The rest still waits: the hook `b`'s cancel queued is an execution it waits for, though it began after the rest did.
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(false);
      expect(order).not.toContain('session_end');
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(byName(sid, 'a').state).toBe('paused');
      const b = byName(sid, 'b');
      expect(b.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(b, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(b)', 'child_completed(b):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-080 with REQ-SESSION-092 (the fourth verification of this repair): a child the user cancels while a stop waits on the executions is waited for within the stop\'s grace — its `child_completed` ends before `session_end`', async () => {
      const { sessions, sid, order, release } = await cancelledWhileTheRestWaits('cancel');
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(false);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      expect(byName(sid, 'b').state).toBe('cancelled');
      expect(order).toEqual(['session_start', 'child_completed(b)', 'child_completed(b):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-080 (the fourth verification of this repair): a paused child the user cancels once the rest is recorded, before the run ends, fires `child_completed` before `session_end`', async () => {
      const { order, completed, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      let releaseDrain!: () => void;
      const drainHold = new Promise<void>((r) => { releaseDrain = r; });
      let holding = false;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // REQ-EVENTS-165: the open iteration's drain waits on this consumer. The hold is taken at the first delivery once the
      // child is paused, which the rest's own drain — after `iteration_paused` is written — is queued behind. Holding only
      // once `iteration_paused` was in the timeline left the hold to whichever forward happened to straddle that write, and
      // one microtask more on a child's turn (the stall watch's `betweenTurns`, OQ-155) let the rest's drain pass first, so
      // the cancel landed after the run's last wait on the outside hooks — the open defect
      // `a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`, not the path this case pins.
      sessions.bus.attach(sid, { mode: 'blocking', deliver: () => { if (dal.timelineOf(sid).some((t) => t.name === 'child_paused')) { holding = true; return drainHold; } return undefined; } });
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await settle(() => holding && dal.timelineOf(sid).some((t) => t.name === 'iteration_paused'));
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(true);
      expect(byName(sid, 'work').state).toBe('paused');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      await settle(() => order.includes('child_completed(work)'));
      releaseDrain();
      await settle(() => order.includes('session_end'), 40);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(work)', 'child_completed(work):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 (the repair of a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md): a paused child the user cancels while `session_end` runs ends `cancelled` and fires no `child_completed` after it', async () => {
      const order: string[] = [];
      let releaseEnd!: () => void;
      const endHold = new Promise<void>((r) => { releaseEnd = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          order.push(event === 'child_completed' ? `child_completed(${String(fields['child_name'])})` : event);
          if (event === 'session_end') await endHold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('session_end'));
      expect(byName(sid, 'work').state).toBe('paused');
      // While the run's `session_end` hook runs, the user cancels the paused child: it ends `cancelled` (REQ-ORCH-133), and
      // its `child_completed` is not fired after `session_end` (OQ-154's reading, confirmed 2026-10-06 by R-071: none fires where the run has announced its end).
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      expect(byName(sid, 'work').state).toBe('cancelled');
      releaseEnd();
      await sessions.running(sid)!;
      await new Promise((r) => setTimeout(r, 30));
      expect(order).toEqual(['session_start', 'session_end']);
      expect(dal.timelineOf(sid).map((t) => t.name)).toContain('child_user_cancelled');
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

  describe('REQ-ORCH-098, the repair of a-child-that-never-started-gets-no-teardown-timeline-entries: a child the scheduler settles is torn down too (OQ-152)', () => {
    const TEARDOWN = ['child_end', 'child_result', 'child_conversation_closed'];
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const teardownOf = (sid: SessionId, taskId: string) => dal.timelineOf(sid).filter((t) => (JSON.parse(t.metadata) as { task_id?: string }).task_id === taskId && TEARDOWN.includes(t.name));
    const resultLine = (name: string, status: string, summary: string): string => `Child ${name} reported ${status}: ${summary.slice(0, 120)}`;

    it('REQ-ORCH-048: a child its dependency\'s failure blocks — it never started — gets `child_end`, `child_result` and `child_conversation_closed`, once each, before its parent is resumed', async () => {
      let sid = '' as SessionId;
      /** What the timeline held for `b` when the root was resumed with its report. */
      let atResume: string[] | null = null;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [byName(sid, 'a').task_id] } }]);
          const b = children(sid).find((c) => c.canonical_name === 'b');
          if (atResume === null && b?.state === 'blocked' && req.messages.some((m) => m.content.some((p) => p.kind === 'text' && p.text.includes('### b (')))) atResume = teardownOf(sid, b.task_id).map((t) => t.name);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked.
        return answer('');
      });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const a = byName(sid, 'a');
      const b = byName(sid, 'b');
      expect([a.state, b.state]).toEqual(['failed', 'blocked']);
      expect(teardownOf(sid, b.task_id).map((t) => [t.name, t.message])).toEqual([
        ['child_end', `Child b (${b.task_id}) ended blocked.`],
        ['child_result', resultLine('b', 'blocked', `Blocked: Its dependency a (${a.task_id}) ended failed, so this child never started (REQ-ORCH-048).`)],
        ['child_conversation_closed', 'Child b\'s conversation closed.'],
      ]);
      expect(teardownOf(sid, b.task_id).map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([
        { task_id: b.task_id, state: 'blocked', at: expect.any(String) },
        { task_id: b.task_id, status: 'blocked' },
        { task_id: b.task_id },
      ]);
      // The teardown precedes the terminal callbacks, as the settle in `execute` writes it (`afterTerminal`).
      expect(atResume).toEqual(TEARDOWN);
      // `a`, which ran, is torn down once, as before.
      expect(teardownOf(sid, a.task_id).map((t) => t.name)).toEqual(TEARDOWN);
    });

    it('REQ-ORCH-052: the finalize sweep the explicit cancel runs tears down every child it settles — one held on its model slot, which never started, and one mid-step — once each', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let childSteps = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childSteps += 1;
        return childSteps > 1 ? answer('done') : { parts: [{ hold }, ...answer('done').parts] };
      }, { cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 400 && !(children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot'); i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(byName(sid, 'two').state).toBe('waiting_on_model_slot');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one');
      const two = byName(sid, 'two');
      expect([one.state, two.state]).toEqual(['cancelled', 'cancelled']);
      // `two` never started: no `child_start` names it.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_start').map((t) => (JSON.parse(t.metadata) as { task_id: string }).task_id)).toEqual([one.task_id]);
      for (const c of [one, two]) {
        expect(teardownOf(sid, c.task_id).map((t) => [t.name, t.message])).toEqual([
          ['child_end', `Child ${c.canonical_name} (${c.task_id}) ended cancelled.`],
          ['child_result', resultLine(c.canonical_name, 'cancelled', (JSON.parse(c.report!) as { summary: string }).summary)],
          ['child_conversation_closed', `Child ${c.canonical_name}'s conversation closed.`],
        ]);
      }
    });

    describe('the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries: every path that settles a child `cancelled` without its execution tears it down, once', () => {
      const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
      const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
      /** The three entries of `c`, as its stored report words them. */
      const tornDown = (c: ChildRow) => [
        ['child_end', `Child ${c.canonical_name} (${c.task_id}) ended cancelled.`],
        ['child_result', resultLine(c.canonical_name, 'cancelled', (JSON.parse(c.report!) as { summary: string }).summary)],
        ['child_conversation_closed', `Child ${c.canonical_name}'s conversation closed.`],
      ];
      const entriesOf = (sid: SessionId, taskId: string) => teardownOf(sid, taskId).map((t) => [t.name, t.message]);

      it('REQ-ORCH-133 / REQ-MONITOR-128: the user\'s cancel of a running child tears it and its live descendant down at the cancel, after each one\'s `child_user_cancelled`; their executions, which return later, write no second', async () => {
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
          if (persona === 'summariser') return answer('{"summary":"x"}');
          const grand = userText(req).includes('TASK: grand');
          if (!grand && !req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }], 'Delegating.');
          return { parts: [{ hold }, ...answer(grand ? 'grand late' : 'late').parts] };
        });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => children(sid).length === 2 && children(sid).every((c) => c.state === 'running'));
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
        for (const name of ['work', 'grand']) {
          const c = byName(sid, name);
          expect(entriesOf(sid, c.task_id), name).toEqual(tornDown(c));
          const cancelledAt = dal.timelineOf(sid).find((t) => t.name === 'child_user_cancelled' && (JSON.parse(t.metadata) as { task_id: string }).task_id === c.task_id)!.ordinal;
          expect(teardownOf(sid, c.task_id)[0]!.ordinal, name).toBeGreaterThan(cancelledAt);
        }
        release();
        await sessions.running(sid)!;
        for (const name of ['work', 'grand']) expect(entriesOf(sid, byName(sid, name).task_id), name).toEqual(tornDown(byName(sid, name)));
      });

      it('PD-ORCH-005 clause 6: "continue without them" tears down each paused agent it cancels, once', async () => {
        let releaseChild!: () => void;
        const hold = new Promise<void>((r) => { releaseChild = r; });
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
          if (persona === 'summariser') return answer('{"summary":"x"}');
          return { parts: [{ hold }, ...answer('late').parts] };
        });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => byName(sid, 'work')?.state === 'running');
        expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
        releaseChild();
        await sessions.running(sid)!;
        expect(byName(sid, 'work').state).toBe('paused');
        expect(teardownOf(sid, byName(sid, 'work').task_id)).toEqual([]);
        expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
        await sessions.running(sid)!;
        const work = byName(sid, 'work');
        expect(work.state).toBe('cancelled');
        expect(entriesOf(sid, work.task_id)).toEqual(tornDown(work));
      });

      it('REQ-ORCH-053: a child a previous run left unfinished is torn down by the settle of the next run, once', async () => {
        const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? answer('hi') : answer('{}')));
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await sessions.running(sid)!;
        dal.insertChild({ session_id: sid, task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: dal.iterationsOf(sid)[0]!.root_task_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: new Date(Number(clock.instant())).toISOString() });
        expect(sessions.prompt(sid, 'again').ok).toBe(true);
        await sessions.running(sid)!;
        const ghost = byName(sid, 'ghost');
        expect(ghost.state).toBe('cancelled');
        expect(entriesOf(sid, ghost.task_id)).toEqual(tornDown(ghost));
        expect(JSON.parse(teardownOf(sid, ghost.task_id)[0]!.metadata)).toEqual({ task_id: ghost.task_id, state: 'cancelled', at: expect.any(String) });
      });
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
