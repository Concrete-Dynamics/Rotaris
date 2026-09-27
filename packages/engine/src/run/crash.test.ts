import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ChatMessage } from '@rotaris/model';
import type { ApprovalPayload, SessionRecord } from '@rotaris/contracts';
import { RUN_CONFIG_DEFAULTS, Sessions, SessionWriter, type Publisher, type RunConfig, type ToolPort } from '../index.js';
import { recordCrash } from './crash.js';
import { resumableOf } from '../sessions.js';
import { conversationOf } from './record.js';
import { interruptedResult } from './interruption.js';

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
    expect(r).toEqual({ iteration: 2, paused: 3, withdrawn: 1, terminals: 1 });
    expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'open', interruption: 'crash' });
    const state = (id: string) => dal.getChild(sid, id)!;
    expect(state('bg_000000c1')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'running' });
    expect(state('bg_000000c2')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'queued' });
    expect(state('bg_000000c3')).toMatchObject({ state: 'paused', interruption: 'crash', resume_state: 'waiting_on_dependencies' });
    expect(state('bg_000000c4')).toMatchObject({ state: 'succeeded', interruption: null });
    // Not this iteration's agent: left for the stale-child settle.
    expect(state('bg_000000x1')).toMatchObject({ state: 'running', interruption: null });
    // The root's two calls are answered as interrupted by the crash; the child, whose record ends on an answer, gains nothing.
    expect(conversationOf(dal.agentConversation(sid, ROOT)).at(-1)).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'grep', isError: true, result: interruptedResult('crash', true, '') },
      { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult('crash', true, '') },
    ] });
    expect(conversationOf(dal.agentConversation(sid, 'bg_000000c1')).map((m) => m.role)).toEqual(['user', 'assistant']);
    // Clause 9: withdrawn, never denied — the list is emptied and the timeline names the crash.
    expect(dal.getSession(sid)!.pending_approvals).toBe('[]');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'approval_withdrawn')!.metadata)).toEqual({ request_id: 'req-1', tool: 'write_file', persona: 'coding-agent', interruption: 'crash' });
    expect(dal.auditOf(sid)).toEqual([]);
    // Clause 10: a crash ends them — except one this process still holds.
    expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_dead', 'crash'], ['ts_done', 'completed'], ['ts_live', 'running']]);

    const before = { messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length };
    expect(recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined)).toEqual({ iteration: null, paused: 0, withdrawn: 0, terminals: 0 });
    expect({ messages: dal.agentMessagesOf(sid, ROOT).length, timeline: dal.timelineOf(sid).length }).toEqual(before);
  });

  it('clause 6 with clause 8: the Continue action counts what a crash left unfinished before the crash is recorded, and the same after', () => {
    const sid = 'S-count' as SessionId;
    const writer = created(sid);
    dieIn(writer, sid);
    // The root and its three unfinished agents; not the succeeded one, nor another root's.
    expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 4 });
    expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
    recordCrash(dal, writer, sid, new Set(), () => undefined);
    expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 2, agents: 4 });
  });

  it('an iteration a rest left open is not a crash\'s: its interruption and its agents are left as they are', () => {
    const sid = 'S-rested' as SessionId;
    const writer = created(sid);
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: ROOT, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.setIterationInterruption(sid, 1, 'pause');
    writer.spawnChild({ ...child('bg_000000c1', 'running', ROOT), iteration: 1 });
    writer.restChild('bg_000000c1', 'pause', 'running');
    expect(recordCrash(dal, writer, sid, new Set(), () => undefined)).toEqual({ iteration: null, paused: 0, withdrawn: 0, terminals: 0 });
    expect(dal.getIteration(sid, 1)!.interruption).toBe('pause');
    expect(dal.getChild(sid, 'bg_000000c1')).toMatchObject({ state: 'paused', interruption: 'pause' });
  });

  describe('when it is recorded (Sessions)', () => {
    function sessionsAs(pid: number, publisher: Publisher = NONE) {
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      client.stream = (req) => { client.push(answer('Answered.')); return original(req); };
      const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
      // A tool port offering nothing: its presence is what gives the run its children, so the crash's can be resumed.
      const port = (): ToolPort => ({
        specs: () => [], dispatch: async () => ({ text: 'none', isError: true, status: 'failed', durationMs: 1, label: 'x', args: {} }),
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      });
      return new Sessions({
        clocks: clock, publisher, pid, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-dead', isProcessAlive: () => false,
        model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
        tools: () => port(),
      });
    }
    /** A session whose first run finished, then a host that died in iteration 2 with the session still marked running. */
    async function crashed(): Promise<SessionId> {
      const first = sessionsAs(77);
      const sid = (first.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
      await first.running(sid);
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 66, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      dieIn(w.value, sid);
      w.value.save('running');
      w.value.release(66, HOST);
      return sid;
    }

    it('clause 8: loading the session records nothing, and still states what the Continue action would resume (clause 6)', async () => {
      const sid = await crashed();
      const snapshots: SessionRecord[] = [];
      const viewer = sessionsAs(88, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
      expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
      viewer.owner(sid)!.attach();
      expect(snapshots.at(-1)!.resumable).toEqual({ iteration: 2, agents: 4 });
      expect(dal.getIteration(sid, 2)!.interruption).toBeNull();
      expect(dal.getChild(sid, 'bg_000000c1')!.state).toBe('running');
      expect(dal.getSession(sid)!.pending_approvals).not.toBe('[]');
    });

    it('clause 8 (OQ-69): opening the session\'s checkpoints repairs its status (REQ-GIT-094) and records nothing of its agents', async () => {
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
      expect(root.slice(2, 4)).toEqual([
        { role: 'tool', content: [
          { kind: 'tool-result', callId: 'a', name: 'grep', isError: true, result: interruptedResult('crash', true, '') },
          { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult('crash', true, '') },
        ] },
        { role: 'user', content: [{ kind: 'text', text: 'second' }] },
      ]);
    });
  });
});
