import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, ok, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ChatMessage, type ModelRequest } from '@rotaris/model';
import type { ApprovalPayload, SessionRecord } from '@rotaris/contracts';
import { RUN_CONFIG_DEFAULTS, Sessions, SessionWriter, type Publisher, type RunConfig, type ToolPort } from '../index.js';
import { recordCrash } from './crash.js';
import { crashLeftOf, resumableOf } from '../sessions.js';
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
    expect(recordCrash(dal, writer, sid, new Set(['ts_live']), () => undefined)).toEqual({ iteration: null, paused: 0, withdrawn: 0, terminals: 0 });
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
    /** Every model request any of these processes made. */
    const asked: ModelRequest[] = [];
    /**
     * `configured`: the process resolves each run's setup through `configure`, which reports the entry persona asked for.
     * `publisher`: where its projections publish. `alive`: REQ-GIT-093's process probe (every other process is dead).
     */
    function sessionsAs(pid: number, configured?: (entryPersona: string | undefined) => void, publisher: Publisher = NONE, alive: (pid: number) => boolean = () => false, warn: (m: string) => void = () => undefined) {
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

    describe('PD-ORCH-005 clauses 13 and 18 (OQ-73): before the crash is recorded, what it left presents as the record will leave it', () => {
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

    describe('PD-ORCH-005 clauses 3, 8 and 16 (OQ-74): cancelling one child a crash left ends it from its stored state, and leaves the crash for the next repair or continue to record', () => {
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

      it('OQ-76: a session the store\'s failure left busy is not one a crash left — its agents present as before, nothing is resumable, and the at-rest cancel is refused, writing and warning nothing', async () => {
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
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false });
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
    describe('PD-ORCH-005 clause 16 (revision 4, OQ-74): the at-rest cancel walks through a finished descendant, records nothing of the crash, and answers a failed move', () => {
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

      it('when the chosen child\'s own move fails, the cancel is refused and nothing below it is cancelled (REQ-MONITOR-128)', async () => {
        const sid = await crashed(rested(true), 'paused');
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.db.exec("CREATE TRIGGER refuse_c1 BEFORE UPDATE OF state ON children WHEN NEW.state = 'cancelled' AND OLD.task_id = 'bg_000000c1' BEGIN SELECT RAISE(ABORT, 'refused'); END;");
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false });
        expect([dal.getChild(sid, 'bg_000000c1')!.state, dal.getChild(sid, 'bg_000000c3')!.state]).toEqual(['paused', 'paused']);
      });
    });
    describe('PD-ORCH-005 clause 16 (revision 4, OQ-74): the at-rest cancel writes under the session\'s lock, answers a session not loaded, and keeps a failed descendant paused', () => {
      const cancel = (s: Sessions, sid: SessionId, agentId: string) => s.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });
      const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
      const at = () => new Date(Number(clock.instant())).toISOString();

      it('refused, writing nothing, while another machine holds the lock; the lock is left as it was', async () => {
        const sid = await crashed();
        const viewer = sessionsAs(88);
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        dal.releaseLock(sid, 88, HOST);
        expect(dal.claimLock(sid, 99, OTHER, at()).claimed).toBe(true);
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
    describe('PD-ORCH-005 clause 16 (OQ-74): the at-rest cancel\'s entry, a crash that left a sibling of a paused child, a refused move\'s republish, and a refusal that writes nothing', () => {
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

      it('when the chosen child\'s own move fails, nothing is written and nothing needs republishing: the crash is still unrecorded, and its agents present as before', async () => {
        const sid = await crashed();
        const snapshots: SessionRecord[] = [];
        const viewer = sessionsAs(88, undefined, { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } });
        expect(viewer.resume(dal, 'C:/ws', sid).ok).toBe(true);
        viewer.owner(sid)!.attach();
        expect(snapshots.at(-1)!.pendingApprovals).toHaveLength(1);
        dal.db.exec("CREATE TRIGGER refuse_c1 BEFORE UPDATE OF state ON children WHEN NEW.state = 'cancelled' AND OLD.task_id = 'bg_000000c1' BEGIN SELECT RAISE(ABORT, 'refused'); END;");
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false });
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
        expect(cancel(viewer, sid, 'bg_000000c1')).toEqual({ ok: false });
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
     * session does, and either choice records the crash first, as any continue does (clause 8). Readings in OQ-76.
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
        });
      }

      /**
       * OQ-76's undecided reading: a crash between an iteration closing `succeeded` and the run's teardown leaves the
       * session busy with nothing open and the last request `complete`. No `paused` session reaches this state (a pause that
       * finds nothing unfinished puts its task back to pending), so clause 18's "as a `paused` session does" does not say
       * what the Continue action does here. The build continues the last request, as REQ-MONITOR-125 has it, and OQ-75's
       * no-append covers only a request the todo holds unfinished — so the finished request is appended again and a second
       * iteration re-works it. Pinned so that a ruling either way turns this red.
       */
      for (const state of ['recovery', 'interrupted'] as const) {
        it(`${state}, nothing open and the last request finished: the Continue action appends that request again and a new iteration re-works it (OQ-76)`, async () => {
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
  });
});
