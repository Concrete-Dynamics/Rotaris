import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { millis, type SessionId } from '@rotaris/kernel';
import { openStore, StoreDal, type ChildRow } from '@rotaris/store';
import { answer, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_AGENT_ID, type SessionRecord } from '@rotaris/contracts';
import { SessionWriter, type Sessions, type PortToolResult, type Publisher, type ToolPortContext } from '../index.js';
import type { HookPort } from '../hooks-port.js';
import { conversationOf } from '../run/record.js';
import { callsRun, interruptedResult } from '../run/interruption.js';
import { recordCrash } from '../run/crash.js';
import { decodeStoredTodo } from '../todo-view.js';
import { resumableOf } from '../sessions.js';
import { HOST, dir, dal, clock, warnings, infos, type TestTool, sessionsWith, children, setDal, useIterationStore } from './children.test-support.js';

/**
 * Part 3 of 4 of the end-to-end cases of `children.test.ts`, which were one describe in that file and the longest
 * file of the parallel project by a factor of two. They are spread over files so that the cores run them side by side;
 * the store, the clock and the helpers every case starts from are `children.test-support.ts`. A new case goes into the
 * part its neighbours are in.
 */
describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  useIterationStore();

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
        setDal(new StoreDal(openStore(join(dir, 'workspace.db'))));
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
});
