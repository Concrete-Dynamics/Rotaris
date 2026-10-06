import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, millis, mintMachineId, ok, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage, type ModelRequest } from '@rotaris/model';
import { RUN_AGENT_ID, type ApprovalPayload, type SessionRecord } from '@rotaris/contracts';
import { RUN_CONFIG_DEFAULTS, Sessions, SessionWriter, type CheckpointPort, type Publisher, type RunConfig, type ToolPort } from '../index.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';
import { ACCEPTED_CANCEL_REPORT, recordCrash } from './crash.js';
import { cancelLeftOf, crashLeftOf, ownCallsMayRunOf, resumableOf, toAgentRecord, type ToolPortContext } from '../sessions.js';
import { conversationOf } from './record.js';
import { interruptedResult } from './interruption.js';
import type { HookPort } from '../hooks-port.js';

/**
 * PD-ORCH-005 clause 3 — "a crash is recorded when the session is next repaired or continued": what a dead run host
 * left, written from the store alone. Clause 8 — loading a session to view it records nothing.
 */
const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };
const ROOT = 'bg_0000dead';

describe('PD-ORCH-005 clause 3: recording a crash (run/crash.ts)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-crash-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const child = (taskId: string, state: string, parentId: string) => ({
    task_id: taskId, canonical_name: taskId.slice(-2), given_name: taskId.slice(-2), persona: 'coding-agent', state, parent_id: parentId, depth: 1, iteration: 2,
    model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}',
  });
  const text = (role: 'user' | 'assistant', t: string): ChatMessage => ({ role, content: [{ kind: 'text', text: t }] });
  const approval: ApprovalPayload = { request_id: 'req-1', session_id: 'x', agent_id: 'c1', persona: 'coding-agent', tool_name: 'write_file', command: '', argument_summary: 'path=a.txt', rule_id: 'ask', reason: 'asks', sequence: 1 };

  /**
   * The residue a run host that died in iteration 2 leaves on top of a finished iteration 1: the row open with no
   * interruption, its children where they stood, a root whose last message asked for two calls, an approval still
   * listed, and background sessions still recorded running.
   */
  function dieIn(writer: SessionWriter, sid: SessionId): void {
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    writer.spawnChild(child('bg_000000c1', 'running', ROOT));
    writer.spawnChild(child('bg_000000c2', 'starting', ROOT));
    writer.spawnChild(child('bg_000000c3', 'waiting_on_dependencies', 'bg_000000c1'));
    writer.spawnChild(child('bg_000000c4', 'succeeded', ROOT));
    // Another root's child with the same number — a plan cycle's, or a row older than the iteration record.
    writer.spawnChild(child('bg_000000x1', 'running', 'bg_0000else'));
    writer.recordAgentMessage(ROOT, 2, 'message', text('user', 'work'));
    writer.recordAgentMessage(ROOT, 2, 'message', { role: 'assistant', content: [{ kind: 'text', text: 'Two.' }, { kind: 'tool-call', callId: 'a', name: 'grep', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'glob', args: '{}' }] });
    writer.recordAgentMessage('bg_000000c1', 2, 'message', text('user', 'TASK'));
    writer.recordAgentMessage('bg_000000c1', 2, 'message', text('assistant', 'thinking'));
    writer.save('running', { pending_approvals: JSON.stringify([approval]) });
    for (const [id, state] of [['ts_dead', 'running'], ['ts_live', 'running'], ['ts_done', 'completed']] as const) {
      writer.recordAgentTerminal({ terminal_id: id, task_id: 'bg_000000c1', command: `run ${id}`, started_at: 't', state, exit_code: state === 'completed' ? 0 : null, output_tail: `${id} out` });
    }
  }

  function created(sid: SessionId): SessionWriter {
    const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    return w.value;
  }

  it('writes what a rest would have: the iteration\'s interruption, its unfinished agents paused where they stood, the unanswered calls answered, the approval withdrawn, the dead background sessions ended — and only once', () => {
    const sid = 'S-crash' as SessionId;
    const writer = created(sid);
    dieIn(writer, sid);
    const r = recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined);
    expect(r).toEqual({ iteration: 2, paused: 3, cancelled: 0, withdrawn: 1, terminals: 1 });
    expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'open', interruption: 'crash' });
    const state = (id: string) => dal.getChild(sid, id)!;
    expect(state('bg_000000c1')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'running' });
    expect(state('bg_000000c2')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'queued' });
    expect(state('bg_000000c3')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'waiting_on_dependencies' });
    expect(state('bg_000000c4')).toMatchObject({ state: 'succeeded', interruption: null });
    // Not this iteration's agent: left for the stale-child settle.
    expect(state('bg_000000x1')).toMatchObject({ state: 'running', interruption: null });
    // The root's two calls, which have no rows and so never started, are answered as not run by the crash; the child,
    // whose record ends on an answer, gains nothing.
    expect(conversationOf(dal.agentConversation(sid, ROOT)).at(-1)).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'grep', isError: true, result: interruptedResult('crash', false, '') },
      { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult('crash', false, '') },
    ] });
    expect(conversationOf(dal.agentConversation(sid, 'bg_000000c1')).map((m) => m.role)).toEqual(['user', 'assistant']);
    // Clause 9: withdrawn, never denied — the list is emptied and the timeline names the crash.
    expect(dal.getSession(sid)!.pending_approvals).toBe('[]');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'approval_withdrawn')!.metadata)).toEqual({ request_id: 'req-1', tool: 'write_file', persona: 'coding-agent', interruption: 'crash' });
    expect(dal.auditOf(sid)).toEqual([]);
    // Clause 10: a crash ends them — except one this process still holds.
    expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_dead', 'crash'], ['ts_done', 'completed'], ['ts_live', 'running']]);

    const before = { messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length };
    expect(recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined)).toEqual({ iteration: null, paused: 0, cancelled: 0, withdrawn: 0, terminals: 0 });
    expect({ messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length }).toEqual(before);
  });

  it('clauses 3 and 4 (found by phase 3\'s fourth review): a call that completed before the crash keeps what it returned, and only the call still running is answered as interrupted, its row settling (docs/defects/fixed/a-crash-leaves-its-tool-rows-running.md)', () => {
    const sid = 'S-completed' as SessionId;
    const writer = created(sid);
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    writer.recordAgentMessage(ROOT, 1, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'a', name: 'write', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'grep', args: '{}' }] });
    // An earlier step's call with an id this step reuses: the call's row is the latest (REQ-ORCH-141).
    writer.appendRow('tool', 'grep', true, { name: 'orchestrator', toolName: 'grep', toolStatus: 'ok', callKey: 'b', output: 'an earlier answer' });
    writer.appendRow('tool', 'write', true, { name: 'orchestrator', toolName: 'write', toolStatus: 'ok', callKey: 'a', output: 'wrote the file' });
    writer.appendRow('tool', 'grep', false, { name: 'orchestrator', toolName: 'grep', toolStatus: 'running', callKey: 'b', output: 'a.ts:1' });
    // Another agent's call with the same id — local providers number calls — is not the root's.
    writer.appendRow('tool', 'glob', false, { name: 'c9', toolName: 'glob', toolStatus: 'running', callKey: 'b' });
    recordCrash(dal, writer, sid, new Set(), () => undefined);
    expect(conversationOf(dal.agentConversation(sid, ROOT)).at(-1)).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'write', isError: false, result: 'wrote the file' },
      { kind: 'tool-result', callId: 'b', name: 'grep', isError: true, result: interruptedResult('crash', true, 'a.ts:1') },
    ] });
    // REQ-SESSION-129: the row a crash left running settles `failed`, keeping the output it had recorded.
    expect(dal.residentRows(sid).map((r) => [r.name, r.tool_name, r.tool_status, r.output])).toEqual([
      ['orchestrator', 'grep', 'ok', 'an earlier answer'],
      ['orchestrator', 'write', 'ok', 'wrote the file'],
      ['orchestrator', 'grep', 'failed', interruptedResult('crash', true, 'a.ts:1')],
      ['c9', 'glob', 'running', null],
    ]);
  });

  it('REQ-SESSION-129 with ADR-0024 (the repair of a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md): the ring row of every call a dead run left running settles `failed` with the crash\'s statement, once; a settled one keeps what it returned', () => {
    const sid = 'S-ring' as SessionId;
    const writer = created(sid);
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    writer.recordAgentMessage(ROOT, 1, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'a', name: 'write', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'grep', args: '{}' }] });
    // Each call's two records, as the run host's gate and the turn write them: the ring row and the transcript row.
    const call = (callId: string, agent: string, tool: string) => ({ call_id: callId, agent_name: agent, tool_name: tool, args: { pattern: callId } });
    const a = writer.openToolCall(call('a', 'orchestrator', 'write'));
    if (!a.ok) throw new Error('open');
    writer.settleToolCall(a.value, call('a', 'orchestrator', 'write'), { status: 'ok', elapsed_ms: 3, is_error: false, result: 'wrote the file' });
    writer.appendRow('tool', 'write', true, { name: 'orchestrator', toolName: 'write', toolStatus: 'ok', callKey: 'a', output: 'wrote the file' });
    expect(writer.openToolCall(call('b', 'orchestrator', 'grep')).ok).toBe(true);
    writer.appendRow('tool', 'grep', false, { name: 'orchestrator', toolName: 'grep', toolStatus: 'running', callKey: 'b', output: 'a.ts:1' });
    // An agent the crash record pauses none of — another root's orphan, left to the stale-child settle — is dead as well.
    expect(writer.openToolCall(call('b', 'c9', 'glob')).ok).toBe(true);
    const finishes = () => dal.eventsOfKind(sid, 'tool.finish').length;
    expect(finishes()).toBe(1);
    recordCrash(dal, writer, sid, new Set(), () => undefined);
    const ring = () => dal.toolCallsOf(sid).map((r) => { const e = JSON.parse(r.entry) as { result?: string; elapsed_ms: number | null }; return [r.agent_name, r.call_id, r.status, r.is_error, e.result, r.elapsed_ms]; });
    const statement = interruptedResult('crash', true, '');
    expect(ring()).toEqual([
      ['orchestrator', 'a', 'ok', 0, 'wrote the file', 3],
      // The end of a call a crash cut was observed by no process: its duration is not known.
      ['orchestrator', 'b', 'failed', 1, statement, null],
      ['c9', 'b', 'failed', 1, statement, null],
    ]);
    // Each settle is REQ-EVENTS-057's `tool.finish`, as every settled call's is; the transcript row settled as before.
    expect(finishes()).toBe(3);
    expect(dal.residentRows(sid).find((r) => r.call_key === 'b' && r.name === 'orchestrator')).toMatchObject({ tool_status: 'failed' });
    // A second recording finds nothing running.
    recordCrash(dal, writer, sid, new Set(), () => undefined);
    expect(finishes()).toBe(3);
  });

  it('clause 6 with clauses 8 and 19: the Continue action counts what a crash left unfinished, the root included, before the crash is recorded, and the same after', () => {
    const sid = 'S-count' as SessionId;
    const writer = created(sid);
    dieIn(writer, sid);
    // Clause 19: the root and its three unfinished agents; not the succeeded one, nor another root's.
    expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 4 });
    expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
    recordCrash(dal, writer, sid, new Set(), () => undefined);
    expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 4 });
  });

  describe('REQ-MONITOR-102: the calls a crash left uncounted join the session total (the repair of a-roots-calls-before-a-crash-never-reach-the-session-total.md)', () => {
    const calls = (...ids: string[]): ChatMessage => ({ role: 'assistant', content: ids.map((id) => ({ kind: 'tool-call' as const, callId: id, name: 'grep', args: '{}' })) });
    const results = (...ids: string[]): ChatMessage => ({ role: 'tool', content: ids.map((id) => ({ kind: 'tool-result' as const, callId: id, name: 'grep', isError: false, result: 'found' })) });
    /**
     * An iteration whose root had one call counted when an earlier execution returned (`r1`), then made two more (`r2`,
     * and `r3`, whose row was still running at the death) and asked for a fourth it never started (`r4`, no row); a
     * running child with one completed call its count does not hold; and five calls of other agents in the total.
     */
    function died(writer: SessionWriter, sid: SessionId): void {
      dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
      writer.countToolCalls({ root: { iteration: 1, add: 1 } }, 6);
      writer.recordAgentMessage(ROOT, 1, 'message', text('user', 'work'));
      writer.recordAgentMessage(ROOT, 1, 'message', calls('r1'));
      writer.recordAgentMessage(ROOT, 1, 'message', results('r1'));
      writer.recordAgentMessage(ROOT, 1, 'message', calls('r2'));
      writer.recordAgentMessage(ROOT, 1, 'message', results('r2'));
      writer.recordAgentMessage(ROOT, 1, 'message', calls('r3', 'r4'));
      writer.appendRow('tool', 'grep', false, { name: 'orchestrator', toolName: 'grep', toolStatus: 'running', callKey: 'r3' });
      writer.spawnChild({ ...child('bg_000000c1', 'running', ROOT), iteration: 1 });
      writer.recordAgentMessage('bg_000000c1', 1, 'message', text('user', 'TASK'));
      writer.recordAgentMessage('bg_000000c1', 1, 'message', calls('p1'));
      writer.recordAgentMessage('bg_000000c1', 1, 'message', results('p1'));
    }

    it('the root\'s beyond its iteration\'s count and each unfinished child\'s beyond its own, with both counts, once — a call the crash cut before it started is not one', () => {
      const sid = 'S-uncounted' as SessionId;
      const writer = created(sid);
      died(writer, sid);
      expect(dal.getSession(sid)!.tool_calls).toBe(6);
      recordCrash(dal, writer, sid, new Set(), () => undefined);
      // The root's r2 and r3 (r1 was counted; r4 never started) and the child's p1.
      expect(dal.getSession(sid)!.tool_calls).toBe(9);
      expect(dal.getIteration(sid, 1)!.root_tool_calls).toBe(3);
      expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'paused', tool_calls: 1 });
      // A second recording finds nothing more to count.
      recordCrash(dal, writer, sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(9);
    });

    it('a root whose count is not known — an iteration opened before store v26 — adds nothing; its children are still counted', () => {
      const sid = 'S-unknown' as SessionId;
      const writer = created(sid);
      died(writer, sid);
      dal.db.prepare('UPDATE iterations SET root_tool_calls = NULL WHERE session_id = ?').run(sid);
      recordCrash(dal, writer, sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(7);
      expect(dal.getIteration(sid, 1)!.root_tool_calls).toBeNull();
    });
  });

  it('an iteration a rest left open is not a crash\'s: its interruption and its agents are left as they are', () => {
    const sid = 'S-rested' as SessionId;
    const writer = created(sid);
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.setIterationInterruption(sid, 1, 'pause');
    writer.spawnChild({ ...child('bg_000000c1', 'running', ROOT), iteration: 1 });
    writer.restChild('bg_000000c1', 'pause', 'running');
    expect(recordCrash(dal, writer, sid, new Set(), () => undefined)).toEqual({ iteration: null, paused: 0, cancelled: 0, withdrawn: 0, terminals: 0 });
    expect(dal.getIteration(sid, 1)!.interruption).toBe('pause');
    expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'paused', interruption: 'pause' });
  });

  /**
   * OQ-103's last question, ruled 2026-09-29 (R-067): clause 3's "those are never resumed" governs a run whose explicit
   * cancel was accepted and not carried out when its host died. The mark `Run.cancelAgent` writes when the cancel is
   * accepted is what tells it apart (store v27); the repair of
   * docs/defects/fixed/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md.
   */
  describe('PD-ORCH-005 clause 3 with REQ-MONITOR-126 (OQ-103 ruled): an explicit cancel accepted and never carried out', () => {
    /** The residue of a host that died in iteration 2 after the explicit cancel was accepted, its todo task in progress. */
    function cancelledThenDied(writer: SessionWriter, sid: SessionId): void {
      dieIn(writer, sid);
      writer.save('cancelling', { todo: encodeStoredTodo({ planner: { schema_version: 1, phases: [{ name: 'main', tasks: [{ id: 't', text: 't', state: 'in_progress', consecutiveRetries: 0 }] }] }, agent: null }) });
      expect(writer.recordCancelAccepted()).toEqual({ ok: true, value: true });
    }

    it('the store marks the open iteration only, and keeps the first acceptance', () => {
      const sid = 'S-mark' as SessionId;
      const writer = created(sid);
      expect(writer.recordCancelAccepted()).toEqual({ ok: true, value: false });
      dieIn(writer, sid);
      expect(dal.getIteration(sid, 2)!.cancel_accepted_at).toBeNull();
      expect(writer.recordCancelAccepted()).toEqual({ ok: true, value: true });
      const first = dal.getIteration(sid, 2)!.cancel_accepted_at;
      expect(first).not.toBeNull();
      clock.advance(millis(5_000));
      expect(writer.recordCancelAccepted()).toEqual({ ok: true, value: false });
      expect(dal.getIteration(sid, 2)!.cancel_accepted_at).toBe(first);
    });

    it('before it is recorded, no agent is crash-left, the Continue action counts nothing, and every unfinished agent is named cancel-left', () => {
      const sid = 'S-before' as SessionId;
      const writer = created(sid);
      cancelledThenDied(writer, sid);
      const row = dal.getSession(sid)!;
      expect(crashLeftOf(dal, row, () => true)).toEqual(new Set());
      expect(resumableOf(dal, row)).toBeNull();
      expect(cancelLeftOf(dal, row, () => true)).toEqual(new Set(['bg_000000c1', 'bg_000000c2', 'bg_000000c3']));
      // Only while no run carries the cancel out, and not under a store failure.
      expect(cancelLeftOf(dal, row, () => false)).toEqual(new Set());
      expect(cancelLeftOf(dal, row, () => true, true)).toEqual(new Set());
      // Presented as the record will leave them: cancelled, never paused by a crash.
      const shown = toAgentRecord(dal.getChild(sid, 'bg_000000c1')!, clock, { session: { executionStatus: row.execution_status, updatedAt: row.updated_at }, crashLeft: crashLeftOf(dal, row, () => true), cancelLeft: cancelLeftOf(dal, row, () => true) });
      expect(shown).toMatchObject({ state: 'cancelled', presentationState: 'cancelled', interruption: null, live: false, activeTools: [] });
    });

    it('the record ends every unfinished agent cancelled with its report and closes the iteration cancelled — the calls answered, the approval withdrawn, the dead background sessions ended, the task back to pending — and only once', () => {
      const sid = 'S-cancel' as SessionId;
      const writer = created(sid);
      cancelledThenDied(writer, sid);
      const r = recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined);
      expect(r).toEqual({ iteration: 2, paused: 0, cancelled: 3, withdrawn: 1, terminals: 1 });
      expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', outcome: 'cancelled', interruption: null });
      for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) {
        expect(dal.getChild(sid, id), id).toMatchObject({ state: 'cancelled', interruption: null, resume_state: null });
        expect(JSON.parse(dal.getChild(sid, id)!.report!), id).toMatchObject({ status: 'cancelled', summary: ACCEPTED_CANCEL_REPORT });
      }
      expect(dal.getChild(sid, 'bg_000000c4')).toMatchObject({ state: 'succeeded' });
      // Another root's orphan is the stale-child settle's, as before.
      expect(dal.getChild(sid, 'bg_000000x1')).toMatchObject({ state: 'running' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toEqual([]);
      // The root's calls, which never started, are answered so no conversation or row is left open.
      expect(conversationOf(dal.agentConversation(sid, ROOT)).at(-1)).toMatchObject({ role: 'tool', content: [{ callId: 'a', isError: true }, { callId: 'b', isError: true }] });
      expect(dal.getSession(sid)!.pending_approvals).toBe('[]');
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_dead', 'crash'], ['ts_done', 'completed'], ['ts_live', 'running']]);
      // REQ-ORCH-135: the task stays anchored; the count moves past the closed iteration.
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks).toMatchObject([{ id: 't', state: 'pending' }]);
      expect(dal.getSession(sid)!.iterations_completed).toBe(2);
      // The close is the vocabulary's `iteration.end`; REQ-ORCH-139's closed timeline vocabulary gains no word for it.
      expect(dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string })).toMatchObject([{ iteration: 2, outcome: 'cancelled' }]);
      expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('iteration_cancelled');
      expect(resumableOf(dal, dal.getSession(sid)!)).toBeNull();

      const before = { messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length };
      expect(recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined)).toEqual({ iteration: null, paused: 0, cancelled: 0, withdrawn: 0, terminals: 0 });
      expect({ messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length }).toEqual(before);
    });

    it('REQ-ORCH-098 (the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries): every agent the record ends cancelled is torn down once, in its report\'s words; a second record writes none', () => {
      const sid = 'S-cancel-teardown' as SessionId;
      const writer = created(sid);
      cancelledThenDied(writer, sid);
      recordCrash(dal, writer, sid, new Set(), () => undefined);
      const teardown = ['child_end', 'child_result', 'child_conversation_closed'];
      const ownOf = (taskId: string) => dal.timelineOf(sid).filter((t) => teardown.includes(t.name) && (JSON.parse(t.metadata) as { task_id?: string }).task_id === taskId);
      for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) {
        const name = id.slice(-2);
        expect(ownOf(id).map((t) => [t.name, t.message]), id).toEqual([
          ['child_end', `Child ${name} (${id}) ended cancelled.`],
          ['child_result', `Child ${name} reported cancelled: ${ACCEPTED_CANCEL_REPORT.slice(0, 120)}`],
          ['child_conversation_closed', `Child ${name}'s conversation closed.`],
        ]);
        expect(JSON.parse(ownOf(id)[0]!.metadata), id).toEqual({ task_id: id, state: 'cancelled', at: expect.any(String) });
      }
      // The finished child and another root's orphan are not this record's to end.
      expect(ownOf('bg_000000c4')).toEqual([]);
      expect(ownOf('bg_000000x1')).toEqual([]);
      const before = dal.timelineOf(sid).length;
      recordCrash(dal, writer, sid, new Set(), () => undefined);
      expect(dal.timelineOf(sid).length).toBe(before);
    });

    it('a cancel that overtook a rest: the iteration a stop had left open is closed too, and the agent the stop paused ends cancelled', () => {
      const sid = 'S-overtaken' as SessionId;
      const writer = created(sid);
      dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
      dal.setIterationInterruption(sid, 1, 'stop');
      writer.spawnChild({ ...child('bg_000000c1', 'running', ROOT), iteration: 1 });
      writer.restChild('bg_000000c1', 'stop', 'running');
      expect(writer.recordCancelAccepted()).toEqual({ ok: true, value: true });
      expect(resumableOf(dal, dal.getSession(sid)!)).toBeNull();
      expect(recordCrash(dal, writer, sid, new Set(), () => undefined)).toMatchObject({ iteration: 1, paused: 0, cancelled: 1 });
      expect(dal.getIteration(sid, 1)).toMatchObject({ state: 'closed', outcome: 'cancelled' });
      // As clause 6's decline leaves a paused agent it cancels (`Run.cancelPausedAgents`): terminal, never resumed.
      expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'cancelled' });
    });
  });

  describe('when it is recorded (Sessions)', () => {
    /** Every model request any of these processes made. */
    const asked: ModelRequest[] = [];
    /**
     * `configured`: the process resolves each run's setup through `configure`, which reports the entry persona asked for.
     * `publisher`: where its projections publish. `alive`: REQ-GIT-093's process probe (every other process is dead).
     * `checkpoints`: the run's checkpoint port, when a test needs to hold the run between an iteration's close and its next.
     */
    function sessionsAs(pid: number, configured?: (entryPersona: string | undefined) => void, publisher: Publisher = NONE, alive: (pid: number) => boolean = () => false, warn: (m: string) => void = () => undefined, checkpoints?: CheckpointPort) {
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      client.stream = (req) => { asked.push(req); client.push(answer('Answered.')); return original(req); };
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
      const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
      // A tool port offering nothing: its presence is what gives the run its children, so the crash's can be resumed.
      const port = (): ToolPort => ({
        specs: () => [], dispatch: async () => ({ text: 'none', isError: true, status: 'failed', durationMs: 1, label: 'x', args: {} }),
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      return new Sessions({
        clocks: clock, publisher, pid, host: HOST, retentionCap: 20_000, warn, mintSessionId: () => 'S-dead', isProcessAlive: alive,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
        tools: () => port(),
        ...(checkpoints ? { checkpoints: () => checkpoints } : {}),
        ...(configured ? { configure: (_ws: string, ctx: { readonly entryPersona?: string | undefined }) => { configured(ctx.entryPersona); return ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }); } } : {}),
      });
    }
    /** A session whose first run finished, then a host that died in iteration 2 with the session still marked running. */
    async function crashed(more: (w: SessionWriter) => void = () => undefined, status: 'running' | 'paused' = 'running'): Promise<SessionId> {
      const first = sessionsAs(77);
      const sid = (first.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
      await first.running(sid);
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 66, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      dieIn(w.value, sid);
      more(w.value);
      w.value.save(status);
      w.value.release(66, HOST);
      return sid;
    }

    it('clause 8: loading the session records nothing, and still states what the Continue action would resume (clause 6)', async () => {
      const sid = await crashed();
      const snapshots: SessionRecord[] = [];
      const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
      expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
      viewer.owner(sid)!.attach();
      expect(snapshots.at(-1)!.resumable).toEqual({ iteration: 2, agents: 4 });
      expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
      expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      expect(dal.getSession(sid)!.pending_approvals).not.toBe('[]');
    });

    it('clause 8 (OQ-96): opening the session\'s checkpoints repairs its status (REQ-GIT-094) and records nothing of its agents', async () => {
      const sid = await crashed();
      const listed = sessionsAs(88).checkpointListing(dal, 'C:/ws', sid);
      expect(listed.ok && listed.value.repaired).toBeTruthy();
      expect(dal.getSession(sid)!.execution_status).toBe('interrupted');
      expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
      expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      expect(dal.getSession(sid)!.pending_approvals).not.toBe('[]');
    });

    it('the repair records it', async () => {
      const sid = await crashed();
      const report = sessionsAs(88).repair(dal, 'C:/ws', { sessionId: sid });
      expect(report.repaired).toHaveLength(1);
      expect(dal.getIteration(sid, 2)!.interruption).toBe('crash');
      expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'paused', interruption: 'crash' });
      expect(dal.getSession(sid)!.pending_approvals).toBe('[]');
    });

    it('a continue records it before the stale-child settle, then resumes what the crash left: every unfinished agent carries on from its record, the root with the crash\'s answers and the new message', async () => {
      const sid = await crashed();
      const next = sessionsAs(88);
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      expect((await next.running(sid))!.status).toBe('completed');
      // Paused by the crash and resumed — never cancelled by the settle, whose report says the run ended.
      for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) expect(dal.getChild(sid, id), id).toMatchObject({ state: 'succeeded', interruption: null, resume_state: null });
      // Clause 5: an agent that had ended is never resumed — the succeeded one is as it was, and took no step.
      expect(dal.getChild(sid, 'bg_000000c4')).toMatchObject({ state: 'succeeded', report_stored: 0 });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused').map((t) => (JSON.parse(t.metadata) as { interruption: string }).interruption)).toEqual(['crash', 'crash', 'crash']);
      // Another root's orphan is the settle's, as before (REQ-ORCH-053).
      expect(JSON.parse(dal.getChild(sid, 'bg_000000x1')!.report!)).toMatchObject({ summary: expect.stringMatching(/^Cancelled: the run that owned this child ended/) });
      expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome, r.interruption])).toEqual([[1, 'closed', 'succeeded', null], [2, 'closed', 'succeeded', null]]);
      const root = conversationOf(dal.agentConversation(sid, ROOT));
      // The root's two calls had no rows, so they never started: the crash's answers say they were not run.
      expect(root.slice(2, 4)).toEqual([
        { role: 'tool', content: [
          { kind: 'tool-result', callId: 'a', name: 'grep', isError: true, result: interruptedResult('crash', false, '') },
          { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult('crash', false, '') },
        ] },
        { role: 'user', content: [{ kind: 'text', text: 'second' }] },
      ]);
    });

    it('clause 4 (found by phase 4\'s review): a continue that resumes the open iteration is set up as the persona its root ran as; one that finds none, as the entry role', async () => {
      const sid = await crashed();
      const personas: (string | undefined)[] = [];
      const next = sessionsAs(88, (p) => personas.push(p));
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      await next.running(sid);
      expect(next.prompt(sid, 'third').ok).toBe(true);
      await next.running(sid);
      expect(personas).toEqual(['orchestrator', undefined]);
    });

    it('clauses 3 and 4 with OQ-97: a root resumed as the entry role because its persona is no longer configured writes its rows under the persona its iteration was opened with, so a crash in its step still keeps the call that completed (docs/defects/fixed/a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md)', async () => {
      const sid = await crashed();
      // The continue's run is set up as the entry role, `coding-agent`: 'orchestrator' is no longer configured (the run
      // host's `prepareRun` falls back so, OQ-97). Its step asks for two calls; the first completes, the second never returns.
      // The children resume beside it and answer; the root's request is the one carrying the continue's message.
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      let asked = false;
      client.stream = (req) => {
        const root = !asked && req.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === 'second'));
        if (root) asked = true;
        client.push(root ? toolCalls([{ callId: 'k1', name: 'write', args: {} }, { callId: 'k2', name: 'grep', args: {} }], 'Two more.') : answer('Answered.'));
        return original(req);
      };
      const port = (): ToolPort => ({
        specs: () => ['write', 'grep'].map((name) => ({ name, description: name, parameters: { type: 'object' } })),
        dispatch: (c) => (c.callId === 'k1'
          ? Promise.resolve({ text: 'wrote the file', isError: false, status: 'ok' as const, durationMs: 1, label: 'write', args: {} })
          : new Promise(() => undefined)),
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      const personas: (string | undefined)[] = [];
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
      const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
      const next = new Sessions({
        clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
        tools: () => port(),
        configure: (_ws, ctx) => { personas.push(ctx.entryPersona); return ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }); },
      });
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      const running = () => dal.residentRows(sid).some((r) => r.call_key === 'k2' && r.tool_status === 'running');
      for (let i = 0; i < 400 && !running(); i++) await new Promise((r) => setTimeout(r, 5));
      expect(running()).toBe(true);
      expect(personas).toEqual(['orchestrator']);
      // The root runs as the entry role and keeps its name: every row of its step carries the persona it was opened with.
      expect(dal.residentRows(sid).filter((r) => r.call_key === 'k1' || r.call_key === 'k2').map((r) => [r.name, r.persona, r.tool_status])).toEqual([
        ['orchestrator', 'coding-agent', 'ok'],
        ['orchestrator', 'coding-agent', 'running'],
      ]);
      // A steer for the root is announced under that same name, the one its injection and its rows carry.
      expect(next.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } }).ok).toBe(true);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'steering_submitted').map((t) => t.message)).toEqual([expect.stringMatching(/^A steering prompt was submitted for orchestrator \(/)]);
      // The host dies in that step; the next repair or continue records the crash from the store alone.
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 99, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      expect(recordCrash(dal, w.value, sid, new Set(), () => undefined).iteration).toBe(2);
      // Clause 3: the call that completed keeps what it returned; only the call cut off is recorded as interrupted.
      expect(conversationOf(dal.agentConversation(sid, ROOT)).at(-1)).toEqual({ role: 'tool', content: [
        { kind: 'tool-result', callId: 'k1', name: 'write', isError: false, result: 'wrote the file' },
        { kind: 'tool-result', callId: 'k2', name: 'grep', isError: true, result: interruptedResult('crash', true, '') },
      ] });
      // REQ-SESSION-129: no row is left running.
      expect(dal.residentRows(sid).find((r) => r.call_key === 'k2')).toMatchObject({ tool_status: 'failed', output: interruptedResult('crash', true, '') });
    });

    it('clause 4 with OQ-97 (found by the review of the repair of a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record): a steer for a root resumed as the entry role, submitted before its first step, is announced under the persona its iteration was opened with', async () => {
      const sid = await crashed();
      // The continue's run is set up as the entry role, `coding-agent` (OQ-97); its `session_start` hook is held, so the
      // steer lands before the resumed root's turn begins.
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      let starting = false;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event) => { if (event === 'session_start') { starting = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      client.stream = (req) => { client.push(answer('Answered.')); return original(req); };
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
      const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
      const next = new Sessions({
        clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
        hooks: () => hooks,
        configure: () => ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }),
      });
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      for (let i = 0; i < 400 && !starting; i++) await new Promise((r) => setTimeout(r, 5));
      expect(starting).toBe(true);
      expect(next.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } }).ok).toBe(true);
      releaseHook();
      await next.running(sid);
      // Announced and injected under the one name its rows carry, not the entry role it runs as.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'steering_submitted').map((t) => t.message)).toEqual([expect.stringMatching(/^A steering prompt was submitted for orchestrator \(/)]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'steering_injected').map((t) => t.message)).toEqual([expect.stringMatching(/orchestrator/)]);
    });

    describe('REQ-MONITOR-133/134 with clause 4 and OQ-97 (the repair of a-root-steer-after-a-resumed-iteration-closes-is-announced-under-the-resumed-roots-name.md): a root steer submitted after the resumed iteration closes is announced under the root that will take it', () => {
      /**
       * The continue's run is set up as the entry role, `coding-agent` (OQ-97); the resumed root, `orchestrator`, answers and
       * its iteration closes. Its `iteration_end` hook is held: `during` runs in that window, after the resumed root finished
       * and before any next iteration's turn begins.
       */
      async function steerAfterTheResumedIterationCloses(during: (next: Sessions, sid: SessionId) => void): Promise<SessionId> {
        const sid = await crashed();
        let releaseHook!: () => void;
        const hookHold = new Promise<void>((r) => { releaseHook = r; });
        let closing = false;
        const hooks: HookPort = {
          auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
          fireLifecycle: async (event, fields) => { if (event === 'iteration_end' && fields['iteration'] === 2) { closing = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
        };
        const client = new ScriptedModelClient([]);
        const original = client.stream.bind(client);
        client.stream = (req) => { client.push(answer('Answered.')); return original(req); };
        const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
        const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
        const next = new Sessions({
          clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
          model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
          hooks: () => hooks,
          configure: () => ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }),
        });
        expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(next.prompt(sid, 'second').ok).toBe(true);
        for (let i = 0; i < 400 && !closing; i++) await new Promise((r) => setTimeout(r, 5));
        expect(closing).toBe(true);
        during(next, sid);
        releaseHook();
        await next.running(sid);
        return sid;
      }
      const messages = (sid: SessionId, name: string) => dal.timelineOf(sid).filter((t) => t.name === name).map((t) => t.message);

      it('an iteration follows: announced and injected under the fresh root\'s name, the entry role', async () => {
        const sid = await steerAfterTheResumedIterationCloses((next, s) => {
          // A queued prompt gives the run another iteration, whose root is fresh and runs as the entry role.
          expect(next.control({ op: 'createQueuedPrompt', sessionId: s, args: { text: 'then this' } }).ok).toBe(true);
          expect(next.control({ op: 'submitSteeringPrompt', sessionId: s, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } }).ok).toBe(true);
        });
        expect(dal.iterationsOf(sid).filter((r) => r.iteration >= 2).map((r) => [r.iteration, r.root_persona])).toEqual([[2, 'orchestrator'], [3, 'coding-agent']]);
        expect(messages(sid, 'steering_submitted')).toEqual([expect.stringMatching(/^A steering prompt was submitted for coding-agent \(/)]);
        expect(messages(sid, 'steering_injected')).toEqual([expect.stringMatching(/^A steering prompt reached coding-agent \(/)]);
      });

      it('no iteration follows: announced, and reported not delivered, under the same name', async () => {
        const sid = await steerAfterTheResumedIterationCloses((next, s) => {
          expect(next.control({ op: 'submitSteeringPrompt', sessionId: s, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } }).ok).toBe(true);
        });
        expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2]);
        expect(messages(sid, 'steering_submitted')).toEqual([expect.stringMatching(/^A steering prompt was submitted for coding-agent \(/)]);
        expect(messages(sid, 'steering_not_delivered')).toEqual([expect.stringMatching(/^The steering prompt for coding-agent \(.*before coding-agent took another step\.$/)]);
      });

      it('a stop rests the resumed root: a steer after its turn ended, while the rest waits on a child, is announced and delivered under its name', async () => {
        const sid = await crashed();
        // The resumed root answers at once; every child's step is held and ignores its abort, so the stop's rest waits on
        // the children for the grace — after the root's turn has ended, before the rest leaves it `paused`.
        const client = new ScriptedModelClient([]);
        const original = client.stream.bind(client);
        let childAsked = false;
        client.stream = (req) => {
          const root = req.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === 'second'));
          if (root) { client.push(answer('Answered.')); return original(req); }
          childAsked = true;
          client.push({ parts: [{ hold: new Promise<void>(() => undefined) }, ...answer('late').parts] });
          return original({ ...req, signal: new AbortController().signal });
        };
        const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
        const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
        const next = new Sessions({
          clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
          model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
          tools: () => ({ specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed' as const, durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false }),
          configure: () => ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }),
        });
        expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(next.prompt(sid, 'second').ok).toBe(true);
        for (let i = 0; i < 400 && !childAsked; i++) await new Promise((r) => setTimeout(r, 5));
        expect(childAsked).toBe(true);
        expect(next.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
        // The root's turn ends on the stop's abort; its children hold the rest until the grace runs out.
        await new Promise((r) => setTimeout(r, 50));
        expect(next.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'mind the tests' } }).ok).toBe(true);
        clock.advance(30_000);
        await next.running(sid);
        expect(dal.iterationsOf(sid).find((r) => r.iteration === 2)).toMatchObject({ state: 'open', interruption: 'stop' });
        expect(messages(sid, 'steering_submitted')).toEqual([expect.stringMatching(/^A steering prompt was submitted for orchestrator \(/)]);
        expect(messages(sid, 'steering_injected')).toEqual([expect.stringMatching(/^A steering prompt reached orchestrator \(/)]);
      });
    });

    /*
     * Found by the fourth review of the repair of a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record
     * (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md): the root's rows and calls carry the
     * persona its iteration was opened with, and the surfaces knew the run-level agent by the entry persona alone.
     */
    it('clause 4 with OQ-97 (REQ-MONITOR-060/061/071): the session names a root resumed as the entry role among its roots, and the run-level agent\'s tools are the calls it made under that name', async () => {
      const sid = await crashed();
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      let asked = false;
      client.stream = (req) => {
        const root = !asked && req.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === 'second'));
        if (root) asked = true;
        client.push(root ? toolCalls([{ callId: 'k1', name: 'write', args: {} }, { callId: 'k2', name: 'grep', args: {} }], 'Two more.') : answer('Answered.'));
        return original(req);
      };
      // The root's second call is held until the test has read the session as the surfaces would. Each call is recorded
      // through the writer as the run host's gate records it (`openToolCall`, `settleToolCall`), which is what the
      // run-level agent's tool history is read from.
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const port = (writer: SessionWriter): ToolPort => ({
        specs: () => ['write', 'grep'].map((name) => ({ name, description: name, parameters: { type: 'object' } })),
        dispatch: async (c) => {
          const open = { call_id: c.callId, agent_name: c.agentName, tool_name: c.name, args: {} };
          const ordinal = writer.openToolCall(open);
          if (c.callId === 'k2') await held;
          if (ordinal.ok) writer.settleToolCall(ordinal.value, open, { status: 'ok', elapsed_ms: 1, is_error: false, result: 'done' });
          return { text: 'done', isError: false, status: 'ok' as const, durationMs: 1, label: c.name, args: {} };
        },
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      const snapshots: SessionRecord[] = [];
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
      const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
      const next = new Sessions({
        clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
        tools: (ctx) => port(ctx.writer),
        configure: () => ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }),
      });
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      const running = () => dal.residentRows(sid).some((r) => r.call_key === 'k2' && r.tool_status === 'running');
      for (let i = 0; i < 400 && !running(); i++) await new Promise((r) => setTimeout(r, 5));
      expect(running()).toBe(true);
      next.owner(sid)!.reconcile();
      const seen = snapshots.at(-1)!;
      // Every root the session recorded, by the name its rows carry and its canonical name: iteration 1's and the one resumed.
      expect(seen.entryRoots).toEqual([{ name: 'orchestrator', canonical: 'orchestrator' }]);
      // The calls of its step, recorded under that name, are the run-level agent's history, the held one active.
      expect(seen.entryTools.called).toEqual(['write', 'grep']);
      expect(seen.entryTools.active).toEqual(['grep']);
      release();
      await next.running(sid);
    });

    it('clause 4 with OQ-97 (REQ-SESSION-092): a root resumed as the entry role that the stop\'s grace gives up on is named in the warning by the name its rows carry', async () => {
      const sid = await crashed();
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      let asked = false;
      client.stream = (req) => {
        const root = !asked && req.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === 'second'));
        if (root) asked = true;
        client.push(root ? toolCalls([{ callId: 'k1', name: 'hang', args: {} }], 'Hanging.') : answer('Answered.'));
        return original(req);
      };
      // The resumed root's call never returns, whatever the stop does.
      const port = (): ToolPort => ({
        specs: () => [{ name: 'hang', description: 'hang', parameters: { type: 'object' } }],
        dispatch: () => new Promise(() => undefined),
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      const warnings: string[] = [];
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, persona: 'coding-agent', model: MODEL, credentialFor: () => async () => 'k' };
      const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' as const };
      const next = new Sessions({
        clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => 'S-dead', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
        tools: () => port(),
        configure: () => ok({ model: { backend: new DefaultAgentBackend(client), config }, runtime }),
      });
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      const hanging = () => dal.residentRows(sid).some((r) => r.call_key === 'k1' && r.tool_status === 'running');
      for (let i = 0; i < 400 && !hanging(); i++) await new Promise((r) => setTimeout(r, 5));
      expect(hanging()).toBe(true);
      expect(next.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      await next.running(sid);
      const given = warnings.filter((w) => /did not return within the stop's 30 s grace/.test(w));
      expect(given).toEqual([expect.stringMatching(/the root orchestrator did not return/)]);
    });

    it('clause 6 (found by phase 4\'s second review): a continue that declines the open iteration is set up as the entry role — its root is not restored', async () => {
      const sid = await crashed(() => undefined, 'paused');
      const personas: (string | undefined)[] = [];
      const next = sessionsAs(88, (p) => personas.push(p));
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
      await next.running(sid);
      expect(personas).toEqual([undefined]);
      expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', outcome: 'cancelled' });
    });

    it('clause 4 with REQ-ORCH-095 (found by phase 4\'s review): a child that worked before the crash counts its calls from its record — the crash wrote no count — so it is not re-prompted', async () => {
      asked.length = 0;
      const sid = await crashed((w) => {
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'p1', name: 'grep', args: '{}' }] });
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'p1', name: 'grep', isError: false, result: 'found' }] });
      });
      expect(dal.getChild(sid, 'bg_000000c1')!.tool_calls).toBe(0);
      const next = sessionsAs(88);
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      await next.running(sid);
      expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'succeeded', tool_calls: 1 });
      // REQ-MONITOR-102: the session's total counts that call too, once — no other agent made one.
      expect(dal.getSession(sid)!.tool_calls).toBe(1);
      // Its own requests are the ones carrying its call before the crash; none of them re-prompts it.
      const its = asked.filter((r) => r.messages.some((m) => m.content.some((p) => p.kind === 'tool-result' && p.callId === 'p1')));
      expect(its.length).toBeGreaterThan(0);
      expect(its.filter((r) => r.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.startsWith('Carry out the task now'))))).toEqual([]);
    });

    it('REQ-MONITOR-102 (the repair of a-roots-calls-before-a-crash-never-reach-the-session-total.md): the calls the root and a child made before the crash reach the session total when it is repaired, and a continue counts none of them twice', async () => {
      const worked = (w: SessionWriter): void => {
        // A call the root completed before the crash, after dieIn's two it never started (answered by the crash first).
        w.recordAgentMessage(ROOT, 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'a', name: 'grep', isError: false, result: 'x' }, { kind: 'tool-result', callId: 'b', name: 'glob', isError: false, result: 'y' }] });
        w.recordAgentMessage(ROOT, 2, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'r1', name: 'grep', args: '{}' }] });
        w.recordAgentMessage(ROOT, 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'r1', name: 'grep', isError: false, result: 'found' }] });
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'p1', name: 'grep', args: '{}' }] });
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'p1', name: 'grep', isError: false, result: 'found' }] });
      };
      const repaired = await crashed(worked);
      expect(dal.getSession(repaired)!.tool_calls).toBe(0);
      sessionsAs(88).repair(dal, 'C:/ws', { sessionId: repaired });
      // The root's a, b and r1, and the child's p1.
      expect(dal.getSession(repaired)!.tool_calls).toBe(4);
      expect(dal.getIteration(repaired, 2)!.root_tool_calls).toBe(3);
      expect(dal.getChild(repaired, 'bg_000000c1')!.tool_calls).toBe(1);
    });

    it('REQ-MONITOR-102: a continue after the crash counts what the crash left once — the resumed agents add only their own new calls', async () => {
      const sid = await crashed((w) => {
        w.recordAgentMessage(ROOT, 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'a', name: 'grep', isError: false, result: 'x' }, { kind: 'tool-result', callId: 'b', name: 'glob', isError: false, result: 'y' }] });
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'p1', name: 'grep', args: '{}' }] });
        w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'tool', content: [{ kind: 'tool-result', callId: 'p1', name: 'grep', isError: false, result: 'found' }] });
      });
      const next = sessionsAs(88);
      expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(next.prompt(sid, 'second').ok).toBe(true);
      expect((await next.running(sid))!.status).toBe('completed');
      // Every agent answers without a call here: the total is the crash's three, counted once.
      expect(dal.getSession(sid)!.tool_calls).toBe(3);
      expect(dal.getIteration(sid, 2)!.root_tool_calls).toBe(2);
      expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'succeeded', tool_calls: 1 });
    });

    describe('PD-ORCH-005 clauses 13 and 18 (OQ-100): before the crash is recorded, what it left presents as the record will leave it', () => {
      it('crashLeftOf names the open iteration\'s unfinished agents only while no rest recorded an interruption, and only for a session no run is behind', () => {
        const sid = 'S-left' as SessionId;
        const writer = created(sid);
        dieIn(writer, sid);
        const at = (status: string) => ({ ...dal.getSession(sid)!, execution_status: status });
        const left = ['bg_000000c1', 'bg_000000c2', 'bg_000000c3'];
        let asked = 0;
        const notLive = (v: boolean) => () => { asked += 1; return v; };
        expect([...crashLeftOf(dal, at('running'), notLive(true))].sort()).toEqual(left);
        expect([...crashLeftOf(dal, at('interrupted'), notLive(false))].sort()).toEqual(left);
        // A run is behind it: nothing. Liveness is asked only for a status that claims a run.
        expect(crashLeftOf(dal, at('running'), notLive(false)).size).toBe(0);
        asked = 0;
        for (const status of ['paused', 'completed', 'failed', 'idle', 'awaiting_plan_decision']) expect(crashLeftOf(dal, at(status), notLive(true)).size).toBe(0);
        expect(asked).toBe(0);
        // A rest recorded the iteration's interruption: whatever it left is its own, not a crash's.
        dal.setIterationInterruption(sid, 2, 'quit');
        expect(crashLeftOf(dal, at('interrupted'), notLive(true)).size).toBe(0);
      });

      const shown = (snapshot: SessionRecord) => Object.fromEntries(snapshot.agents.map((a) => [a.id, [a.state, a.presentationState, a.interruption]]));
      const expected = {
        bg_000000c1: ['paused', 'paused', 'crash'], bg_000000c2: ['paused', 'paused', 'crash'], bg_000000c3: ['paused', 'paused', 'crash'],
        bg_000000c4: ['succeeded', 'done', null],
      };
      function viewed(sid: SessionId, before: (s: Sessions) => void = () => undefined): SessionRecord {
        const snapshots: SessionRecord[] = [];
        const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
        before(viewer);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        viewer.owner(sid)!.attach();
        return snapshots.at(-1)!;
      }

      it('in REQ-CHAT-008\'s recovery state, every agent the Continue action counts presents `paused` by the crash, and nothing is recorded (clause 8)', async () => {
        const sid = await crashed();
        const snapshot = viewed(sid);
        expect(snapshot.resumable).toEqual({ iteration: 2, agents: 4 });
        expect(shown(snapshot)).toMatchObject(expected);
        expect(snapshot.agents.filter((a) => a.presentationState === 'paused')).toHaveLength(snapshot.resumable!.agents - 1);
        expect(snapshot.agents.find((a) => a.id === 'bg_000000c1')).toMatchObject({ live: false, activity: 't', completedAt: null });
        // Another root's child is none of the iteration's, and presents as it did.
        expect(shown(snapshot)['bg_000000x1']).toEqual(['running', 'running', null]);
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
      });

      it('`interrupted` by a repair that recorded no crash (a checkpoint listing\'s), they present `paused` — not settled `cancelled` — and nothing is recorded', async () => {
        const sid = await crashed();
        const snapshot = viewed(sid, (s) => { s.checkpointListing(dal, 'C:/ws', sid); });
        expect(dal.getSession(sid)!.execution_status).toBe('interrupted');
        expect(shown(snapshot)).toMatchObject(expected);
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });

      it('once the repair records the crash, the stored rows say the same', async () => {
        const sid = await crashed();
        const snapshot = viewed(sid, (s) => { s.repair(dal, 'C:/ws', { sessionId: sid }); });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('paused');
        expect(shown(snapshot)).toMatchObject(expected);
      });
    });

    describe('PD-ORCH-005 clauses 3, 8 and 16 (OQ-101): cancelling one child a crash left ends it from its stored state, and leaves the crash for the next repair or continue to record', () => {
      const cancel = (s: Sessions, sid: SessionId, agentId: string) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });
      /** What a crash record writes beyond the agents: the iteration's interruption, the approvals and the background sessions. */
      const crashWrites = (sid: SessionId) => ({ interruption: dal.getIteration(sid, 2)!.interruption, approvals: dal.getSession(sid)!.pending_approvals, terminals: dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state]), paused: dal.timelineOf(sid).filter((t) => t.name === 'iteration_paused').length });
      it('in REQ-CHAT-008\'s recovery state: the child and its descendant end cancelled from where they stood, and nothing of the crash is recorded — the rest stay as stored, presenting paused', async () => {
        // c1 had asked for a call the crash cut off: no crash record will reach it once it is cancelled, so the cancel answers it.
        const sid = await crashed((w) => { w.recordAgentMessage('bg_000000c1', 2, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'c', name: 'grep', args: '{}' }] }); });
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        const before = crashWrites(sid);
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect(crashWrites(sid)).toEqual(before);
        expect(before.interruption).toBeNull();
        expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'cancelled', interruption: null });
        expect(dal.getChild(sid, 'bg_000000c3')).toMatchObject({ state: 'cancelled', interruption: null });
        expect(dal.getChild(sid, 'bg_000000c2')).toMatchObject({ state: 'starting', interruption: null });
        expect(JSON.parse(dal.getChild(sid, 'bg_000000c3')!.report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with c1, which the user cancelled.' });
        expect(conversationOf(dal.agentConversation(sid, 'bg_000000c1')).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'c', name: 'grep', isError: true, result: interruptedResult('crash', false, '') }] });
        // The root's calls are the crash record's, not the cancel's.
        expect(conversationOf(dal.agentConversation(sid, ROOT))).toHaveLength(2);
        expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 2 });
        // The next repair records the crash: it pauses what is left, and the cancelled stay cancelled.
        viewer.repair(dal, 'C:/ws', { sessionId: sid });
        expect(dal.getIteration(sid, 2)!.interruption).toBe('crash');
        expect(dal.getChild(sid, 'bg_000000c2')).toMatchObject({ state: 'paused', interruption: 'crash' });
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['cancelled', 'cancelled']);
      });

      /**
       * Clause 16 meets clause 18: a crash-left child cancelled while the session rests stays cancelled through either
       * continue, each of which records the rest of the crash first (`Sessions.launchContinuation`) — the Continue action
       * resumes the others, and "continue without them" ends only those still unfinished.
       */
      for (const state of ['recovery', 'interrupted'] as const) {
        it(`${state}: after one child is cancelled at rest, the Continue action resumes the rest and the cancelled child stays cancelled`, async () => {
          const sid = await crashed();
          const next = sessionsAs(88);
          expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
          if (state === 'interrupted') expect(next.checkpointListing(dal, 'C:/ws', sid).ok).toBe(true);
          expect(cancel(next, sid, 'bg_000000c2')).toEqual({ ok: true });
          expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 3 });
          expect(next.continueSession(sid, 'continue').ok).toBe(true);
          expect((await next.running(sid))!.status).toBe('completed');
          expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].map((id) => dal.getChild(sid, id)!.state)).toEqual(['succeeded', 'cancelled', 'succeeded']);
          expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded'], [2, 'closed', 'succeeded']]);
        });

        it(`${state}: after one child and its descendant are cancelled at rest, "continue without them" ends only the one left and continues as a new iteration`, async () => {
          const sid = await crashed();
          const next = sessionsAs(88);
          expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
          if (state === 'interrupted') expect(next.checkpointListing(dal, 'C:/ws', sid).ok).toBe(true);
          expect(cancel(next, sid, 'bg_000000c1')).toEqual({ ok: true });
          expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 2 });
          expect(next.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
          await next.running(sid);
          expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', outcome: 'cancelled', interruption: 'crash' });
          expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].map((id) => dal.getChild(sid, id)!.state)).toEqual(['cancelled', 'cancelled', 'cancelled']);
          // The crash record paused only the child the cancel left; the cancelled two were never paused.
          expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused').map((t) => (JSON.parse(t.metadata) as { interruption: string }).interruption)).toEqual(['crash']);
          expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2, 3]);
        });
      }

      it('OQ-103: a session the store\'s failure left busy is not one a crash left — its agents present as before, nothing is resumable, and the at-rest cancel is refused, writing and warning nothing', async () => {
        const sid = await crashed();
        const snapshots: SessionRecord[] = [];
        const warned: string[] = [];
        const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, () => false, (m) => { warned.push(m); });
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        const insert = vi.spyOn(dal, 'insertEvent').mockImplementationOnce(() => { throw new Error('injected full disk'); });
        expect(viewer.writer(sid)!.recordEvent('error', { message: 'failure probe' }).ok).toBe(false);
        insert.mockRestore();
        warned.length = 0;
        viewer.owner(sid)!.attach();
        const snapshot = snapshots.at(-1)!;
        expect(snapshot.resumable).toBeNull();
        expect(snapshot.agents.find((a) => a.id === 'bg_000000c1')).toMatchObject({ state: 'running', presentationState: 'running', interruption: null });
        const before = crashWrites(sid);
        // The refusal carries the engine's words: it is the store, not the agent, that stands in the way.
        expect(cancel(viewer, sid, 'bg_000000c1')).toMatchObject({ ok: false, refusal: { code: 'store_failed', message: expect.stringContaining('The workspace store requires recovery before an agent can be cancelled') } });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
        expect(crashWrites(sid)).toEqual(before);
        expect(warned).toEqual([]);
        expect(SessionWriter.recoverStore(dal).ok).toBe(true);
      });

      it('a refusal records nothing: a finished agent, another root\'s child, and the run', async () => {
        const sid = await crashed();
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        for (const id of ['bg_000000c4', 'bg_000000x1', 'run', ROOT]) expect(cancel(viewer, sid, id)).toEqual({ ok: false });
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });
    });
    describe('PD-ORCH-005 clause 16 (revision 4, OQ-101): the at-rest cancel walks through a finished descendant, records nothing of the crash, and answers a failed move', () => {
      const cancel = (s: Sessions, sid: SessionId, agentId: string) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });
      /** c1, c2 and c3 brought to rest by a pause; `recorded` whether the rest also wrote the iteration's interruption. */
      const rested = (recorded: boolean) => (w: SessionWriter) => {
        if (recorded) dal.setIterationInterruption(w.sessionId, 2, 'pause');
        w.restChild('bg_000000c1', 'pause', 'running');
        w.restChild('bg_000000c2', 'pause', 'queued');
        w.restChild('bg_000000c3', 'pause', 'waiting_on_dependencies');
      };
      /** What a crash record writes beyond the agents: the iteration's interruption, the approvals and the background sessions. */
      const crashWrites = (sid: SessionId) => ({ interruption: dal.getIteration(sid, 2)!.interruption, approvals: dal.getSession(sid)!.pending_approvals, terminals: dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state]), withdrawn: dal.timelineOf(sid).filter((t) => t.name === 'approval_withdrawn').length });

      it('a paused descendant below a finished one is cancelled with the child the user chose', async () => {
        const sid = await crashed((w) => {
          w.spawnChild(child('bg_000000d1', 'running', ROOT));
          w.spawnChild(child('bg_000000d2', 'succeeded', 'bg_000000d1'));
          w.spawnChild(child('bg_000000d3', 'running', 'bg_000000d2'));
        });
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(cancel(viewer, sid, 'bg_000000d1')).toEqual({ ok: true });
        expect(dal.getChild(sid, 'bg_000000d2')!.state).toBe('succeeded');
        expect(dal.getChild(sid, 'bg_000000d3')).toMatchObject({ state: 'cancelled' });
        expect(JSON.parse(dal.getChild(sid, 'bg_000000d3')!.report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with d1, which the user cancelled.' });
      });

      it('a session a pause left at rest, its host gone since: the cancel writes no crash record — its approvals and running background sessions stay (clause 10)', async () => {
        const sid = await crashed(rested(true), 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        const before = crashWrites(sid);
        expect(before.terminals).toContainEqual(['ts_dead', 'running']);
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state, dal.getChild(sid, 'bg_000000c2')!.state]).toEqual(['cancelled', 'cancelled', 'paused']);
        expect(crashWrites(sid)).toEqual(before);
      });

      it('a crash after every agent had come to rest, before the rest recorded the iteration\'s interruption: nothing is crash-left, so the cancel records no crash', async () => {
        const sid = await crashed(rested(false));
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        const before = crashWrites(sid);
        expect(before.interruption).toBeNull();
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('cancelled');
        expect(crashWrites(sid)).toEqual(before);
      });

      /**
       * Clause 16 meets REQ-ORCH-048 (OQ-101's "A dependent of the cancelled child"): the at-rest cancel runs no cascade —
       * clause 16's count "drops by as many as were cancelled" and "the rest of its agents resume with it" — so a paused
       * (or crash-left) sibling whose `depends_on` names the cancelled child stays unfinished and counted, is resumed by
       * the Continue action, and is blocked by the resumed run's first scheduler pass. A ruling that blocks it at the
       * cancel turns this red.
       */
      for (const status of ['paused', 'recovery'] as const) {
        it(`${status}: a dependent of the cancelled child stays counted, is resumed, and is blocked by the first pass of the resumed run (REQ-ORCH-048)`, async () => {
          const dependent = (w: SessionWriter) => {
            if (status === 'paused') rested(true)(w);
            w.spawnChild({ ...child('bg_000000e1', 'waiting_on_dependencies', ROOT), depends_on: JSON.stringify(['bg_000000c2']) });
            if (status === 'paused') w.restChild('bg_000000e1', 'pause', 'waiting_on_dependencies');
          };
          const sid = await crashed(dependent, status === 'paused' ? 'paused' : 'running');
          const viewer = sessionsAs(88);
          expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
          expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 5 });
          expect(cancel(viewer, sid, 'bg_000000c2')).toEqual({ ok: true });
          // Only the chosen child ends; the dependent is left where it stood, and the count drops by one.
          expect(dal.getChild(sid, 'bg_000000e1')!.state).toBe(status === 'paused' ? 'paused' : 'waiting_on_dependencies');
          expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 4 });
          expect(viewer.continueSession(sid, 'continue').ok).toBe(true);
          expect((await viewer.running(sid))!.status).toBe('completed');
          expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3', 'bg_000000e1'].map((id) => dal.getChild(sid, id)!.state)).toEqual(['succeeded', 'cancelled', 'succeeded', 'blocked']);
          expect(dal.timelineOf(sid).some((t) => t.name === 'child_resumed' && t.message.includes('bg_000000e1'))).toBe(true);
        });
      }

      it('when the chosen child\'s own move fails to be written, the cancel is refused store_failed in the engine\'s words and nothing below it is cancelled (OQ-101)', async () => {
        const sid = await crashed(rested(true), 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.db.exec("CREATE TRIGGER refuse_c1 BEFORE UPDATE OF state ON children WHEN NEW.state = 'cancelled' AND OLD.task_id = 'bg_000000c1' BEGIN SELECT RAISE(ABORT, 'refused'); END;");
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false, refusal: { code: 'store_failed', message: expect.stringMatching(/^The workspace store requires recovery before an agent can be cancelled: .*refused/) } });
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['paused', 'paused']);
      });
    });
    describe('PD-ORCH-005 clause 16 (revision 4, OQ-101): the at-rest cancel writes under the session\'s lock, answers a session not loaded, and keeps a failed descendant paused', () => {
      const cancel = (s: Sessions, sid: SessionId, agentId: string) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });
      const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
      const at = () => new Date(Number(clock.instant())).toISOString();

      it('refused, writing nothing, while another machine holds the lock; the lock is left as it was', async () => {
        const sid = await crashed();
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.releaseLock(sid, 88, HOST);
        expect(dal.claimLock(sid, 99, OTHER, at()).claimed).toBe(true);
        // Another machine's lock reads live (REQ-GIT-093), so the child is not crash-left to this process: the target is
        // refused before the lock is asked, stating nothing of its own.
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false });
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
        expect(dal.getLock(sid)).toMatchObject({ pid: 99, host: OTHER });
      });

      it('a dead local holder is reaped, the cancel made under the lock and the lock given back; a lock this process holds is kept', async () => {
        const sid = await crashed();
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(dal.getLock(sid)).toMatchObject({ pid: 88 });
        expect(cancel(viewer, sid, 'bg_000000c2')).toEqual({ ok: true });
        expect(dal.getLock(sid)).toMatchObject({ pid: 88 });
        dal.releaseLock(sid, 88, HOST);
        expect(dal.claimLock(sid, 99, HOST, at()).claimed).toBe(true);
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('cancelled');
        expect(dal.getLock(sid)).toBeUndefined();
      });

      it('refused for a session this process has not loaded', async () => {
        const sid = await crashed();
        expect(cancel(sessionsAs(88), sid, 'bg_000000c1')).toEqual({ ok: false });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });

      it('a paused descendant whose move fails stays paused, and the chosen child\'s cancel still stands', async () => {
        const sid = await crashed((w) => {
          dal.setIterationInterruption(w.sessionId, 2, 'pause');
          w.restChild('bg_000000c1', 'pause', 'running');
          w.restChild('bg_000000c2', 'pause', 'queued');
          w.restChild('bg_000000c3', 'pause', 'waiting_on_dependencies');
        }, 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.db.exec("CREATE TRIGGER refuse_c3 BEFORE UPDATE OF state ON children WHEN NEW.state = 'cancelled' AND OLD.task_id = 'bg_000000c3' BEGIN SELECT RAISE(ABORT, 'refused'); END;");
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['cancelled', 'paused']);
        expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 3 });
      });
    });
    describe('PD-ORCH-005 clause 16 (OQ-101): the at-rest cancel\'s entry, a crash that left a sibling of a paused child, a refused move\'s republish, and a refusal that writes nothing', () => {
      const cancel = (s: Sessions, sid: SessionId, agentId: string) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });
      const entries = (sid: SessionId) => dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled').map((t) => t.message);

      it('each agent it ends gets the live cancel\'s entry, saying the session rested', async () => {
        const sid = await crashed();
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect(entries(sid)).toEqual(['The user cancelled child c1 (bg_000000c1) while the session rested.', 'The user cancelled child c3 (bg_000000c3) with c1 while the session rested.']);
      });

      it('the chosen child already paused, a sibling and a descendant left unfinished by the crash: nothing of the crash is recorded — the descendant is cancelled from where it stood, the sibling, the approval and the background sessions left for the next continue', async () => {
        // A `pausing` run: c1 had come to rest, c2's and c3's calls were still in flight when the host died.
        const sid = await crashed((w) => { w.restChild('bg_000000c1', 'pause', 'running'); });
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        const approvals = dal.getSession(sid)!.pending_approvals;
        expect(approvals).not.toBe('[]');
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: true });
        expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'open', interruption: null });
        expect(dal.getChild(sid, 'bg_000000c2')).toMatchObject({ state: 'starting', interruption: null });
        // c3, c1's child, the crash left unfinished: it is cancelled with c1 from the state it is stored in.
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['cancelled', 'cancelled']);
        expect(dal.getSession(sid)!.pending_approvals).toBe(approvals);
        expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toContainEqual(['ts_dead', 'running']);
      });

      it('when the chosen child\'s own move fails to be written, it is refused store_failed, nothing is written and nothing needs republishing: the crash is still unrecorded, and its agents present as before', async () => {
        const sid = await crashed();
        const snapshots: SessionRecord[] = [];
        const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        viewer.owner(sid)!.attach();
        expect(snapshots.at(-1)!.pendingApprovals).toHaveLength(1);
        dal.db.exec("CREATE TRIGGER refuse_c1 BEFORE UPDATE OF state ON children WHEN NEW.state = 'cancelled' AND OLD.task_id = 'bg_000000c1' BEGIN SELECT RAISE(ABORT, 'refused'); END;");
        expect(cancel(viewer, sid, 'bg_000000c1')).toMatchObject({ ok: false, refusal: { code: 'store_failed' } });
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['running', 'waiting_on_dependencies']);
        expect(dal.getSession(sid)!.pending_approvals).not.toBe('[]');
        expect(snapshots.at(-1)!.agents.find((a) => a.id === 'bg_000000c1')).toMatchObject({ state: 'paused', presentationState: 'paused', interruption: 'crash' });
      });

      it('a refused target is judged before the lock is taken: a dead local holder\'s lock is not reaped for it', async () => {
        const sid = await crashed(rested(), 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.releaseLock(sid, 88, HOST);
        expect(dal.claimLock(sid, 99, HOST, at()).claimed).toBe(true);
        for (const id of ['run', ROOT, 'bg_000000c4', 'bg_ffffffff']) expect(cancel(viewer, sid, id)).toEqual({ ok: false });
        expect(dal.getLock(sid)).toMatchObject({ pid: 99, host: HOST });
      });

      it('a local holder whose pid is no positive integer is never reaped (REQ-SESSION-047/083/112): the cancel is refused and the lock left as it was', async () => {
        const sid = await crashed(rested(), 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.releaseLock(sid, 88, HOST);
        expect(dal.claimLock(sid, 0, HOST, at()).claimed).toBe(true);
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false, refusal: { code: 'session_locked', message: 'Another process holds this session, so the agent was not cancelled.' } });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('paused');
        expect(dal.getLock(sid)).toMatchObject({ pid: 0, host: HOST });
      });

      const at = () => new Date(Number(clock.instant())).toISOString();
      /** c1, c2 and c3 brought to rest by a pause that recorded the iteration's interruption. */
      const rested = () => (w: SessionWriter) => {
        dal.setIterationInterruption(w.sessionId, 2, 'pause');
        w.restChild('bg_000000c1', 'pause', 'running');
        w.restChild('bg_000000c2', 'pause', 'queued');
        w.restChild('bg_000000c3', 'pause', 'waiting_on_dependencies');
      };
    });

    /**
     * PD-ORCH-005 clause 18 (extending REQ-MONITOR-125): a session a crash left — in REQ-CHAT-008's recovery state before
     * any repair, or `interrupted` after one — offers the Continue action and "continue without them" as a `paused`
     * session does, and either choice records the crash first, as any continue does (clause 8). Readings in OQ-103.
     */
    describe('PD-ORCH-005 clause 18: a crash offers the same choice', () => {
      const userRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'user').length;
      const pausedBy = (sid: SessionId) => dal.timelineOf(sid).filter((t) => t.name === 'child_paused').map((t) => (JSON.parse(t.metadata) as { interruption: string }).interruption);
      /** The recovery state (the status still `running`, its process dead), or the repair's `interrupted` — which records nothing of the agents (clause 8, the checkpoint listing's repair). */
      function leftBy(state: 'recovery' | 'interrupted', sid: SessionId): Sessions {
        const next = sessionsAs(88);
        expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
        if (state === 'interrupted') expect(next.checkpointListing(dal, 'C:/ws', sid).ok).toBe(true);
        expect(dal.getSession(sid)!.execution_status).toBe(state === 'recovery' ? 'running' : 'interrupted');
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        return next;
      }

      for (const state of ['recovery', 'interrupted'] as const) {
        it(`${state}: the Continue action records the crash first, then resumes every unfinished agent from its record, and appends no user row`, async () => {
          const sid = await crashed();
          const next = leftBy(state, sid);
          const before = userRows(sid);
          expect(next.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
          expect((await next.running(sid))!.status).toBe('completed');
          expect(pausedBy(sid)).toEqual(['crash', 'crash', 'crash']);
          for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) expect(dal.getChild(sid, id), id).toMatchObject({ state: 'succeeded', interruption: null });
          expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded'], [2, 'closed', 'succeeded']]);
          // REQ-MONITOR-125's "resumed from the composer": the last request stands and nothing is appended.
          expect(userRows(sid)).toBe(before);
        });

        it(`${state}: "continue without them" records the crash first, then ends those agents cancelled, closes the iteration cancelled and continues as a new iteration`, async () => {
          const sid = await crashed();
          const next = leftBy(state, sid);
          expect(next.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
          await next.running(sid);
          expect(pausedBy(sid)).toEqual(['crash', 'crash', 'crash']);
          expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', outcome: 'cancelled', interruption: 'crash' });
          for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) expect(dal.getChild(sid, id)!.state, id).toBe('cancelled');
          expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2, 3]);
          // The iteration's close records the user's decline, in the words its agents' reports use — not a dead run's.
          const closed = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; summary: string }).find((e) => e.iteration === 2)!;
          expect(closed.summary).toBe('the session was continued without the agents a crash had left paused');
          expect(JSON.parse(dal.getChild(sid, 'bg_000000c1')!.report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled: the session was continued without this agent, which a crash had left paused.' });
        });
      }

      /**
       * OQ-103's reading, confirmed 2026-10-06 (R-071, `PD-ORCH-005` clause 26): a crash between an iteration closing `succeeded` and the run's teardown leaves the
       * session busy with nothing open and the last request `complete`. The build continues the last request, as
       * REQ-MONITOR-125 has it, and OQ-102's no-append covers only a request the todo holds unfinished — so the finished
       * request is appended again and a second iteration re-works it, as on the `paused` session below that reaches the
       * same state. Pinned as built, which the ruling keeps.
       */
      for (const state of ['recovery', 'interrupted'] as const) {
        it(`${state}, nothing open and the last request finished: the Continue action appends that request again and a new iteration re-works it (OQ-103)`, async () => {
          const first = sessionsAs(77);
          const sid = (first.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
          expect((await first.running(sid))!.status).toBe('completed');
          // The host died after iteration 1 closed and before the teardown settled the status.
          const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 66, host: HOST, isProcessAlive: () => false });
          if (!w.ok) throw new Error('writer');
          w.value.save('running');
          w.value.release(66, HOST);
          const next = sessionsAs(88);
          expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
          if (state === 'interrupted') expect(next.checkpointListing(dal, 'C:/ws', sid).ok).toBe(true);
          expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded']]);
          const before = userRows(sid);
          expect(next.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
          expect((await next.running(sid))!.status).toBe('completed');
          const rows = dal.iterationsOf(sid);
          expect(rows.map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded'], [2, 'closed', 'succeeded']]);
          expect(rows[1]!.todo_task_id).not.toBe(rows[0]!.todo_task_id);
          expect(rows[1]!.task).toContain('first');
          expect(userRows(sid)).toBe(before);
        });
      }

      /**
       * The same state reached with no crash: a pause, a stop or the application's quit (`application_shutdown`, which
       * `classifyStop` rests as `interrupted`, PD-ORCH-005 clause 15) the run accepts after an iteration closed
       * `succeeded` — while its checkpoint is captured, its `iteration_end` hooks fire or its events drain — is met at
       * the loop head, which comes to rest before the stop conditions run. Nothing is open, the last request is
       * `complete`, and the session is `paused`; only a pause accepted during the turn puts the task back to pending.
       * So the Continue action re-works the finished request here too, and OQ-103's ruling (2026-10-06, `PD-ORCH-005`
       * clause 26) covers every route (the plan mode's third and the message limit's fourth are pinned in
       * `plan-gate-resume.test.ts`). Pinned as built, which the ruling keeps.
       */
      const restingBy = { pause: 'pause', cancel: 'stop', announceShutdown: 'quit' } as const;
      for (const op of ['pause', 'cancel', 'announceShutdown'] as const) {
        it(`a ${restingBy[op]} accepted after the iteration closed leaves a \`paused\` session in the same state, and the Continue action re-works the request there too (OQ-103)`, async () => {
          let entered!: () => void;
          const capturing = new Promise<void>((r) => { entered = r; });
          let release!: () => void;
          const held = new Promise<void>((r) => { release = r; });
          const port: CheckpointPort = { enabled: true, capture: async () => { entered(); await held; return { outcome: 'disabled' }; } };
          const first = sessionsAs(77, undefined, NONE, () => false, () => undefined, port);
          const sid = (first.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
          await capturing;
          expect(first.control({ op, sessionId: sid, args: {} })).toEqual({ ok: true });
          release();
          await first.running(sid);
          expect(dal.getSession(sid)!.execution_status).toBe('paused');
          expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded']]);
          const tasks = () => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks).map((t) => [t.text, t.state]);
          expect(tasks()).toEqual([['first', 'complete']]);
          expect(first.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
          await first.running(sid);
          expect(tasks()).toEqual([['first', 'complete'], ['first', 'complete']]);
          expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded'], [2, 'closed', 'succeeded']]);
        });
      }

      it('a busy session whose process may still be running it is refused, and nothing is recorded', async () => {
        const sid = await crashed();
        const next = sessionsAs(88);
        expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
        // REQ-GIT-093: a lock naming another machine is live — this process cannot tell whether that run goes on.
        dal.db.prepare('UPDATE session_locks SET host = ? WHERE session_id = ?').run('0000000000000000000000000000000b', sid);
        expect(next.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'run-active' } });
        expect(next.continueSession(sid, 'continue', { withoutPaused: true })).toMatchObject({ ok: false, error: { code: 'run-active' } });
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });

      it('a busy session whose liveness is unknown is refused, and nothing is recorded (REQ-GIT-093: unknown resolves toward running)', async () => {
        const sid = await crashed();
        let probe: 'dead' | 'throws' = 'dead';
        const next = sessionsAs(88, undefined, NONE, () => { if (probe === 'throws') throw new Error('the probe cannot tell'); return false; });
        expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
        // The lock names another process on this machine, and the probe cannot say whether it lives.
        dal.db.prepare('UPDATE session_locks SET host = ?, pid = ? WHERE session_id = ?').run(HOST, 66, sid);
        probe = 'throws';
        expect(next.liveness(dal, sid)).toBe('unknown');
        expect(next.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'run-active' } });
        expect(next.continueSession(sid, 'continue', { withoutPaused: true })).toMatchObject({ ok: false, error: { code: 'run-active' } });
        expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });
    });

    /**
     * OQ-103's last question, ruled 2026-09-29 (R-067): the explicit cancel is made durable when it is accepted, and the next
     * repair or continue ends its agents `cancelled` and closes the iteration; clause 18's Continue resumes none of them.
     * The repair of docs/defects/fixed/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md.
     */
    describe('PD-ORCH-005 clause 3 with REQ-MONITOR-126 (OQ-103 ruled): a run whose explicit cancel was accepted and never carried out', () => {
      /** A process whose root's first model call holds until `release`, then answers. */
      function holding() {
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        const client = new ScriptedModelClient([{ parts: [{ hold }, ...answer('never').parts] }]);
        const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
        const sessions = new Sessions({
          clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-held',
          model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
        });
        return { sessions, release: () => release() };
      }
      const cancelRun = (s: Sessions, sid: SessionId) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } });

      it('the cancel is marked on the open iteration when it is accepted, before the run carries it out, and the run\'s own close keeps the mark', async () => {
        const { sessions, release } = holding();
        const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
        await vi.waitFor(() => { expect(dal.openIterationOf(sid)).toBeDefined(); });
        expect(dal.getIteration(sid, 1)!.cancel_accepted_at).toBeNull();
        expect(cancelRun(sessions, sid)).toEqual({ ok: true });
        // Durable at once: a host that died here would leave the mark for the next repair or continue.
        expect(dal.getIteration(sid, 1)).toMatchObject({ state: 'open', cancel_accepted_at: expect.any(String) });
        release();
        await sessions.running(sid);
        expect(dal.getIteration(sid, 1)).toMatchObject({ state: 'closed', outcome: 'cancelled', cancel_accepted_at: expect.any(String) });
      });

      it('a cancel accepted as the iteration begins, before it is recorded open, marks it when it opens', async () => {
        const { sessions, release } = holding();
        const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
        let cancelled = false;
        sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => {
          if (e.event === 'iteration.start' && !cancelled) { cancelled = true; expect(dal.openIterationOf(sid)).toBeUndefined(); expect(cancelRun(sessions, sid)).toEqual({ ok: true }); }
          return undefined;
        } });
        release();
        await sessions.running(sid);
        expect(cancelled).toBe(true);
        expect(dal.getIteration(sid, 1)).toMatchObject({ state: 'closed', outcome: 'cancelled', cancel_accepted_at: expect.any(String) });
      });

      const cancelledThenDied = () => crashed((w) => { expect(w.recordCancelAccepted()).toEqual({ ok: true, value: true }); }, 'running');

      it('loading the session records nothing; its agents present cancelled, none crash-left, and the Continue action counts nothing (clause 8)', async () => {
        const sid = await cancelledThenDied();
        const snapshots: SessionRecord[] = [];
        const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        viewer.owner(sid)!.attach();
        const seen = snapshots.at(-1)!;
        expect(seen.resumable).toBeNull();
        expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].map((id) => seen.agents.find((a) => a.id === id)!.presentationState)).toEqual(['cancelled', 'cancelled', 'cancelled']);
        expect(seen.agents.filter((a) => a.interruption !== null)).toEqual([]);
        expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'open', interruption: null });
        expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      });

      it('the repair ends them cancelled and closes the iteration; the session is left with nothing to resume', async () => {
        const sid = await cancelledThenDied();
        const warned: string[] = [];
        const report = sessionsAs(88, undefined, NONE, () => false, (m) => { warned.push(m); }).repair(dal, 'C:/ws', { sessionId: sid });
        expect(report.repaired).toHaveLength(1);
        expect(dal.getSession(sid)!.execution_status).toBe('interrupted');
        expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', outcome: 'cancelled', interruption: null });
        expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].map((id) => dal.getChild(sid, id)!.state)).toEqual(['cancelled', 'cancelled', 'cancelled']);
        // REQ-LIBRARY-092: each report is materialised, as every terminal child's is.
        expect(dal.artifactsOf(sid).filter((a) => a.source_task_id !== null && ['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].includes(a.source_task_id)).map((a) => a.status).sort()).toEqual(['cancelled', 'cancelled', 'cancelled']);
        expect(resumableOf(dal, dal.getSession(sid)!)).toBeNull();
        expect(warned.some((m) => m.includes('was closed cancelled'))).toBe(true);
      });

      for (const how of ['the Continue action', '"continue without them"', 'a continue by message'] as const) {
        for (const state of ['recovery', 'interrupted'] as const) {
          it(`${state}: ${how} resumes none of them — they end cancelled, the iteration closes cancelled, and the session goes on as a new iteration`, async () => {
            const sid = await cancelledThenDied();
            const personas: (string | undefined)[] = [];
            const next = sessionsAs(88, (p) => personas.push(p));
            expect(next.resume(dal, 'C:/ws', sid).ok).toBe(true);
            if (state === 'interrupted') expect(next.checkpointListing(dal, 'C:/ws', sid).ok).toBe(true);
            const rootBefore = dal.agentConversation(sid, ROOT).length;
            if (how === 'the Continue action') expect(next.continueSession(sid, 'continue').ok).toBe(true);
            else if (how === '"continue without them"') expect(next.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
            else expect(next.prompt(sid, 'second').ok).toBe(true);
            expect((await next.running(sid))!.status).toBe('completed');
            expect(['bg_000000c1', 'bg_000000c2', 'bg_000000c3'].map((id) => dal.getChild(sid, id)!.state)).toEqual(['cancelled', 'cancelled', 'cancelled']);
            for (const id of ['bg_000000c1', 'bg_000000c2', 'bg_000000c3']) expect(JSON.parse(dal.getChild(sid, id)!.report!), id).toMatchObject({ status: 'cancelled', summary: ACCEPTED_CANCEL_REPORT });
            expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused' || t.name === 'iteration_resumed')).toEqual([]);
            expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded'], [2, 'closed', 'cancelled'], [3, 'closed', 'succeeded']]);
            // The cancelled root was not restored: its record gained only the answers to its cut calls, and the run was set up as the entry role.
            expect(dal.agentConversation(sid, ROOT).length).toBe(rootBefore + 1);
            expect(dal.iterationsOf(sid)[2]!.root_task_id).not.toBe(ROOT);
            expect(personas).toEqual([undefined]);
          });
        }
      }
    });
  });

  /*
   * REQ-MONITOR-102 with REQ-ORCH-153 (the repair of a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md):
   * a plan cycle is not an iteration and has no `iterations` row, so the count the crash record reads for an execution root
   * never reached a plan cycle's root, and a crash during one lost the calls its root had made.
   */
  describe('REQ-MONITOR-102 with REQ-ORCH-153: a plan cycle\'s root calls before a crash reach the session total', () => {
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i++) await new Promise((r) => setTimeout(r, 5)); };
    /**
     * A plan-mode session (REQ-ORCH-153) whose plan cycle's root makes one call that completes (`g1`), then one that never
     * returns (`g2`) — or, `parks`, answers with its plan after `g1`. `alive` is the process probe the session's own
     * process answers to.
     */
    function planSession(parks = false) {
      const client = new ScriptedModelClient([
        toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading.'),
        parks ? answer('Step 1: change it.') : toolCalls([{ callId: 'g2', name: 'grep', args: {} }], 'Reading more.'),
      ]);
      const port = (): ToolPort => ({
        specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }],
        dispatch: (c) => (c.callId === 'g1' ? Promise.resolve({ text: 'a.ts:1', isError: false, status: 'ok' as const, durationMs: 1, label: 'grep', args: {} }) : new Promise(() => undefined)),
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      const sessions = new Sessions({
        clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan', isProcessAlive: () => true,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s), tools: () => port(),
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: 'plan' },
      });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      return { sessions, sid };
    }
    const cutRow = (sid: SessionId) => dal.residentRows(sid).find((r) => r.call_key === 'g2');
    /** The plan cycle's root: the one agent whose record the session holds. */
    const planRootOf = (sid: SessionId): string => (dal.db.prepare('SELECT DISTINCT task_id FROM agent_messages WHERE session_id = ?').all(sid) as { task_id: string }[]).map((r) => r.task_id)[0]!;
    /** The next process: every other is dead, so the session's run is a crash's. */
    const next = () => new Sessions({
      clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan', isProcessAlive: () => false,
      model: { backend: new DefaultAgentBackend(new ScriptedModelClient([])), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
    });
    const writerAs = (sid: SessionId): SessionWriter => {
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 99, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      return w.value;
    };

    it('the repair adds the calls the plan cycle\'s root made — the one that completed and the one the crash cut — once, and settles the cut call\'s row', async () => {
      const { sessions, sid } = planSession();
      await settle(() => cutRow(sid)?.tool_status === 'running');
      expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
      // The call that completed is counted (OQ-116 as ruled, PD-ORCH-008; store v32), and the session holds that it is: the
      // cut one is not. Before the ruling nothing was counted until the root's turn returned. The session names the root.
      expect(dal.getSession(sid)).toMatchObject({ tool_calls: 1, plan_root_tool_calls: 1, plan_root_task_id: planRootOf(sid), plan_root_persona: 'orchestrator' });
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(next().repair(dal, 'C:/ws', { sessionId: sid }).repaired).toHaveLength(1);
      expect(dal.getSession(sid)).toMatchObject({ tool_calls: 2, plan_root_tool_calls: 0, plan_root_task_id: null, plan_root_persona: null });
      // REQ-SESSION-129: the call the crash cut is answered as a crash's, and its row settles `failed`.
      expect(conversationOf(dal.agentConversation(sid, planRootOf(sid))).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'g2', name: 'grep', isError: true, result: interruptedResult('crash', true, '') }] });
      expect(cutRow(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult('crash', true, '') });
      // A second recording finds nothing more to count.
      recordCrash(dal, writerAs(sid), sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(2);
    });

    it('a plan cycle whose root returned — the run parked at the gate — counted its calls once and names no root, so a crash recorded after adds nothing', async () => {
      const { sessions, sid } = planSession(true);
      expect((await sessions.running(sid))!.execution_status).toBe('awaiting_plan_decision');
      expect(dal.getSession(sid)).toMatchObject({ tool_calls: 1, plan_root_task_id: null });
      recordCrash(dal, writerAs(sid), sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(1);
    });

    it('a plan cycle\'s root the stop\'s grace gave up on is counted from its record and released, so a crash recorded after adds nothing', async () => {
      const { sessions, sid } = planSession();
      await settle(() => cutRow(sid)?.tool_status === 'running');
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      expect(await Promise.race([sessions.running(sid)!.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1_000))])).toBe(true);
      expect(dal.getSession(sid)).toMatchObject({ tool_calls: 2, plan_root_task_id: null });
      recordCrash(dal, writerAs(sid), sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(2);
    });

    /*
     * The give-up path's own release (the verifier's review of the repair): a root given up on is released in the transaction
     * that adds its calls to the total, not by a later write apart from it. A store that drops every release written once the
     * total already holds the calls stands in for a process death between two such writes: with the release made apart — the
     * total first, the marker cleared after — the marker stays set, and a later crash record counts the calls a second time.
     */
    it('a plan cycle\'s root the stop\'s grace gave up on is released in the transaction that adds its calls, not by a write apart from it', async () => {
      const { sessions, sid } = planSession();
      // Since OQ-116's ruling the total holds the calls the root completed (`plan_root_tool_calls`) before its release, so a
      // release apart is one written once the total holds more than those.
      dal.db.exec(`CREATE TEMP TRIGGER drop_release_apart BEFORE UPDATE OF plan_root_task_id ON sessions
        WHEN OLD.plan_root_task_id IS NOT NULL AND NEW.plan_root_task_id IS NULL AND OLD.tool_calls > OLD.plan_root_tool_calls BEGIN SELECT RAISE(IGNORE); END`);
      await settle(() => cutRow(sid)?.tool_status === 'running');
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      expect(await Promise.race([sessions.running(sid)!.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1_000))])).toBe(true);
      expect(dal.getSession(sid)).toMatchObject({ tool_calls: 2, plan_root_task_id: null });
      dal.db.exec('DROP TRIGGER drop_release_apart');
      recordCrash(dal, writerAs(sid), sid, new Set(), () => undefined);
      expect(dal.getSession(sid)!.tool_calls).toBe(2);
    });

    /*
     * REQ-MONITOR-102 / REQ-SESSION-129 with REQ-ORCH-053 and OQ-96 (the repair of
     * a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md): a plan cycle's child a
     * crash ended mid-call. A plan cycle has no iteration row, so the crash record pauses none of its agents, and the next
     * continue's stale-child settle ends the child `cancelled`.
     */
    describe('a plan cycle\'s child a crash ended mid-call', () => {
      /** The root delegates `look`, then waits; `look` makes one call that completes (`c1`), then one that never returns (`c2`). */
      function planWithChild() {
        const client = new ScriptedModelClient([]);
        const original = client.stream.bind(client);
        const turns = { root: 0, child: 0 };
        client.stream = (req) => {
          const root = /^You are the orchestrator/.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '');
          const n = root ? ++turns.root : ++turns.child;
          if (root) client.push(n === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'look', task: 'TASK: look' } }], 'Delegating.') : { parts: [{ hold: new Promise<void>(() => undefined) }, ...answer('never').parts] });
          else client.push(n === 1 ? toolCalls([{ callId: 'c1', name: 'grep', args: {} }], 'Reading.') : toolCalls([{ callId: 'c2', name: 'grep', args: {} }], 'Reading more.'));
          return original(req);
        };
        const port = (ctx: ToolPortContext): ToolPort => ({
          specs: () => (ctx.delegation ? [{ name: 'delegate', description: 'delegate', parameters: { type: 'object' } }] : [{ name: 'grep', description: 'search', parameters: { type: 'object' } }]),
          dispatch: async (c) => {
            if (c.name === 'delegate' && ctx.delegation) {
              const a = JSON.parse(c.rawArgs) as Record<string, string>;
              const r = await ctx.delegation.delegate(ctx.parentId ?? 'root', { persona: a['persona']!, taskName: a['task_name']!, task: a['task']!, dependsOn: [], inheritedContext: [], category: '', runInBackground: true, writeScope: [] });
              return { text: `Task '${r.canonicalName}': ${r.status}`, isError: r.status === 'rejected', status: r.status === 'rejected' ? 'failed' as const : 'ok' as const, durationMs: 1, label: 'delegate', args: a };
            }
            return c.callId === 'c1' ? { text: 'a.ts:1', isError: false, status: 'ok' as const, durationMs: 1, label: 'grep', args: {} } : new Promise(() => undefined);
          },
          cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
        });
        const sessions = new Sessions({
          clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan', isProcessAlive: () => true,
          model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s), tools: port,
          runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: 'plan' },
        });
        const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
        return { sessions, sid };
      }
      const look = (sid: SessionId) => dal.childrenOf(sid).find((c) => c.canonical_name === 'look');
      const childCut = (sid: SessionId) => dal.residentRows(sid).find((r) => r.call_key === 'c2');
      const toolRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'tool');
      /** The next process, which answers every request at once. */
      const continuing = () => new Sessions({
        clocks: clock, publisher: NONE, pid: 88, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend((() => { const c = new ScriptedModelClient([]); const o = c.stream.bind(c); c.stream = (req) => { c.push(answer('Planned.')); return o(req); }; return c; })()), config },
        sessionFilesDir: (_d, s) => join(dir, 'sessions', s),
      });

      it('the repair answers its cut call and settles the row, and counts its calls; the continue\'s settle ends it cancelled and counts none twice', async () => {
        const { sessions, sid } = planWithChild();
        await settle(() => childCut(sid)?.tool_status === 'running');
        expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
        // OQ-116 as ruled: its completed call is counted already, and so is the root's delegate, in the session's total.
        expect(look(sid)).toMatchObject({ iteration: 0, state: 'running', tool_calls: 1 });
        expect(dal.getSession(sid)).toMatchObject({ tool_calls: 2, plan_root_tool_calls: 1 });
        expect(next().repair(dal, 'C:/ws', { sessionId: sid }).repaired).toHaveLength(1);
        // REQ-SESSION-129: a repair alone leaves no transcript row `running`; the cut call is answered as a crash's.
        expect(toolRows(sid).filter((r) => r.tool_status === 'running')).toEqual([]);
        expect(childCut(sid)).toMatchObject({ tool_status: 'failed', output: interruptedResult('crash', true, '') });
        expect(conversationOf(dal.agentConversation(sid, look(sid)!.task_id)).at(-1)).toEqual({ role: 'tool', content: [{ kind: 'tool-result', callId: 'c2', name: 'grep', isError: true, result: interruptedResult('crash', true, '') }] });
        // REQ-MONITOR-102: the root's delegate and the child's two calls are in the total, and the child's count is its record's.
        expect(look(sid)!.tool_calls).toBe(2);
        expect(dal.getSession(sid)!.tool_calls).toBe(toolRows(sid).length);
        expect(toolRows(sid)).toHaveLength(3);
        // The continue: the stale-child settle ends it `cancelled`, and nothing is counted twice.
        const next2 = continuing();
        expect(next2.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(next2.prompt(sid, 'again').ok).toBe(true);
        await next2.running(sid);
        expect(look(sid)).toMatchObject({ state: 'cancelled', tool_calls: 2 });
        expect(toolRows(sid).filter((r) => r.tool_status === 'running')).toEqual([]);
        expect(dal.getSession(sid)!.tool_calls).toBe(toolRows(sid).length);
      });

      it('a continue with no repair before it does the same: no row left `running`, the child counted once from its record', async () => {
        const { sid } = planWithChild();
        await settle(() => childCut(sid)?.tool_status === 'running');
        const next2 = continuing();
        expect(next2.resume(dal, 'C:/ws', sid).ok).toBe(true);
        expect(next2.prompt(sid, 'again').ok).toBe(true);
        await next2.running(sid);
        expect(look(sid)).toMatchObject({ state: 'cancelled', tool_calls: 2 });
        expect(toolRows(sid).filter((r) => r.tool_status === 'running')).toEqual([]);
        expect(dal.getSession(sid)!.tool_calls).toBe(toolRows(sid).length);
      });
    });
  });

  describe('REQ-MONITOR-105 with ADR-0024: the crash record\'s ring settle at a continue', () => {
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    /*
     * OQ-170, ruled 2026-10-06 by the owner (R-071), closing a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md:
     * a run that parks — at the plan gate or the message-limit pause — closes its tool ports there, as its teardown would, so
     * every call still open is settled `failed` (REQ-MONITOR-228) through the port's `close`, which the gate sink implements.
     * Until the ruling a parked run closed none: a call that never returned kept its ring row `running` for good, and the
     * crash record a continue makes skipped the ring settle for as long as the parked run's ports stayed open.
     *
     * The stand-in port does what the run host's gate sink does: a call it opened and has not settled is settled `failed`
     * with the run's cut-off statement at `close`. A row the port does not hold — opened by no live call of this process, as a
     * dead process's call leaves one — is the crash record's to settle.
     */
    const call = (callId: string, agent: string) => ({ call_id: callId, agent_name: agent, tool_name: 'grep', args: {} });
    const closingPort = (ctx: ToolPortContext, closes: string[]): ToolPort => {
      const open = new Map<number, ReturnType<typeof call>>();
      return {
        specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }],
        dispatch: (c) => {
          const own = ctx.writer.openToolCall(call(c.callId, 'orchestrator'));
          if (own.ok) ctx.writer.settleToolCall(own.value, call(c.callId, 'orchestrator'), { status: 'ok', elapsed_ms: 1, is_error: false, result: 'a.ts:1' });
          if (c.callId === 'g1') {
            // Another agent's call that ignored its abort and never returns: the port holds it open.
            const stray = ctx.writer.openToolCall(call('stray', 'c9'));
            if (stray.ok) open.set(stray.value, call('stray', 'c9'));
            // A row no live call of this process holds, as a dead process's call leaves one (residual 3).
            ctx.writer.openToolCall(call('dead', 'c8'));
          }
          return Promise.resolve({ text: 'a.ts:1', isError: false, status: 'ok' as const, durationMs: 1, label: 'grep', args: {} });
        },
        close: (cutOff) => { closes.push(cutOff); for (const [ordinal, c] of open) ctx.writer.settleToolCall(ordinal, c, { status: 'failed', elapsed_ms: 0, is_error: true, result: cutOff }); open.clear(); },
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      };
    };
    const parkedSessions = (id: string, client: ScriptedModelClient, closes: string[], runtime: { runStartMode: 'plan' | 'auto'; messageLimit?: number }) => new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => id, isProcessAlive: () => true,
      model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s), tools: (ctx) => closingPort(ctx, closes),
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', ...runtime },
    });

    /*
     * The guard `Live.portsOpen` is kept should a run ever end without closing its ports (OQ-170's ruling closes them at
     * every park and at teardown, so no path of today reaches it): such a run holds back the ring settle until it closes
     * them, and so does an earlier one after a later run tore down.
     */
    it('the ring settle is held back by any run of this process whose ports are still open, and only until it closes them', () => {
      const run = (closed: boolean) => ({ closedItsPorts: closed }) as unknown as NonNullable<Parameters<typeof ownCallsMayRunOf>[0]['run']>;
      const open = run(false);
      const live = { run: open, portsOpen: new Set<typeof open>() };
      expect(ownCallsMayRunOf(live)).toBe(true);
      expect(live.portsOpen.has(open)).toBe(true);
      // A later run that closed its ports does not re-arm the settle over the earlier open one.
      const later = run(true);
      expect(ownCallsMayRunOf({ ...live, run: later })).toBe(true);
      (open as unknown as { closedItsPorts: boolean }).closedItsPorts = true;
      expect(ownCallsMayRunOf({ ...live, run: later })).toBe(false);
      expect(live.portsOpen.size).toBe(0);
      expect(ownCallsMayRunOf({ run: null, portsOpen: new Set() })).toBe(false);
    });

    it('a park at the plan gate closes its run\'s ports: the call still open settles `failed` at the park, never left `running`', async () => {
      const closes: string[] = [];
      const client = new ScriptedModelClient([toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading.'), answer('Step 1: change it.'), answer('Done.')]);
      const sessions = parkedSessions('S-park', client, closes, { runStartMode: 'plan' });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid))!.execution_status).toBe('awaiting_plan_decision');
      const row = (id: string) => dal.toolCallsOf(sid).find((r) => r.call_id === id);
      // At the park, before any continue: the port was closed with the run's cut-off statement and its open call settled.
      expect(sessions.run(sid)!.closedItsPorts).toBe(true);
      expect(closes).toEqual([interruptedResult(null, true, '')]);
      expect(row('stray')).toMatchObject({ status: 'failed', is_error: 1 });
      // The approval launches the continuation, which records a crash before its run is built; the stray keeps its settle.
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      await sessions.running(sid);
      expect(row('stray')).toMatchObject({ status: 'failed', is_error: 1 });
      expect(dal.toolCallsOf(sid).filter((r) => r.status === 'running')).toEqual([]);
    });

    it('a park at the message-limit pause closes its run\'s ports the same way', async () => {
      const closes: string[] = [];
      const client = new ScriptedModelClient([toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading.'), answer('Done.'), answer('Done again.'), answer('More.')]);
      const sessions = parkedSessions('S-limit', client, closes, { runStartMode: 'auto', messageLimit: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      // A queued prompt keeps the run going past the first iteration, so the limit is what stops it.
      sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'more work' } });
      expect((await sessions.running(sid))!.execution_status).toBe('paused_message_limit');
      expect(sessions.run(sid)!.closedItsPorts).toBe(true);
      expect(closes.length).toBeGreaterThan(0);
      expect(dal.toolCallsOf(sid).find((r) => r.call_id === 'stray')).toMatchObject({ status: 'failed', is_error: 1 });
    });

    /*
     * Residual 3: once a run of this process had parked, the continue's crash record skipped the ring settle for the session
     * for as long as it stayed live here, so a ring row no live call holds — another process's dead call's — stayed
     * `running`. A parked run now closes its ports, so the continue settles that row as a crash's, the parked run's own
     * having settled at the park.
     */
    it('a continue after a park settles, as a crash\'s, a ring row no live call of this process holds', async () => {
      const client = new ScriptedModelClient([toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading.'), answer('Step 1: change it.'), answer('Done.')]);
      const sessions = parkedSessions('S-park3', client, [], { runStartMode: 'plan' });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid))!.execution_status).toBe('awaiting_plan_decision');
      const dead = () => dal.toolCallsOf(sid).find((r) => r.call_id === 'dead');
      expect(dead()).toMatchObject({ status: 'running' });
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      expect(dead()).toMatchObject({ status: 'failed', is_error: 1 });
      await sessions.running(sid);
      expect(dead()).toMatchObject({ status: 'failed', is_error: 1 });
    });

    /*
     * The other half of residual 2's repair: a run leaves the set once it has closed its ports. A run of this process that
     * completed and tore down holds no call that may still settle, so a continue after it settles `failed`, as a crash's,
     * the ring row no live call holds (here one its port opened and never settled, as a dead process's call leaves it). Were
     * the run kept in the set after its teardown, every later continue in this process would skip the settle and the row
     * would stay `running` for good.
     */
    it('a continue after a run of this process that completed and tore down settles a ring row no live call holds', async () => {
      const client = new ScriptedModelClient([toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading.'), answer('Done.'), answer('Done again.')]);
      const call = (callId: string, agent: string) => ({ call_id: callId, agent_name: agent, tool_name: 'grep', args: {} });
      const port = (ctx: ToolPortContext): ToolPort => ({
        specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }],
        dispatch: (c) => {
          const own = ctx.writer.openToolCall(call(c.callId, 'orchestrator'));
          if (own.ok) ctx.writer.settleToolCall(own.value, call(c.callId, 'orchestrator'), { status: 'ok', elapsed_ms: 1, is_error: false, result: 'a.ts:1' });
          if (c.callId === 'g1') ctx.writer.openToolCall(call('dead', 'c9'));
          return Promise.resolve({ text: 'a.ts:1', isError: false, status: 'ok' as const, durationMs: 1, label: 'grep', args: {} });
        },
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      const sessions = new Sessions({
        clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-torn', isProcessAlive: () => true,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, s) => join(dir, 'sessions', s), tools: (ctx) => port(ctx),
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: 'auto' },
      });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid))!.execution_status).not.toBe('awaiting_plan_decision');
      const dead = () => dal.toolCallsOf(sid).find((r) => r.call_id === 'dead');
      expect(dead()).toMatchObject({ status: 'running' });
      // The continue records a crash before its run is built; the run that completed closed its ports, so nothing of this
      // process may still settle the row and it is settled as a crash's.
      expect(sessions.prompt(sid, 'again').ok).toBe(true);
      expect(dead()).toMatchObject({ status: 'failed', is_error: 1 });
      await sessions.running(sid);
      expect(dead()).toMatchObject({ status: 'failed', is_error: 1 });
    });
  });
});
