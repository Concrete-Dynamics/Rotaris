import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type RuntimePosture, type ToolPort, type ToolPortContext } from '../index.js';
import { decodeStoredTodo, projectSessionTodos, type AgentTodoDocument } from '../todo-view.js';

/**
 * The repair of `the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` (live-run finding G5):
 * REQ-ORCH-029, the coordinator "does not report the run successful while a todo item is non-terminal". An iteration whose
 * root answers with an item of its own plan still open returns its task to the pending queue (REQ-ORCH-068) rather than
 * marking it complete, so REQ-ORCH-069 and REQ-ORCH-082 do not read success off it; the next iteration is told which items
 * were left open. Under a `single` override the entry role is the worker (REQ-ORCH-025) and the constraint does not bind.
 * REQ-ORCH-075's re-queue is of the same task, and a task answers only for items not already open at its first take-up
 * (OQ-203), a record kept with the task in the stored todo: an item a given-up task or an earlier run left open passes to no
 * later task, and one the task's own iteration left open holds it after a pause, a continue or a later run. REQ-ORCH-078: with
 * a positive validation-retry setting a correction goes into the root's own conversation first.
 */
const HOST = mintMachineId('0000000000000000000000000000000f') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

function plan(states: readonly ('PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED')[]): AgentTodoDocument {
  const names = ['Run the sequence', 'Report each command\'s outcome in one line', 'A third item'];
  return { schema_version: 1, phases: [{ id: 'e002ab7d', name: 'Execute', tasks: states.map((state, i) => ({ id: `0000000${i}`, name: names[i]!, description: '', state })) }] };
}
const writePlan = (callId: string, states: Parameters<typeof plan>[0]): ScriptedCall => toolCalls([{ callId, name: 'todo', args: { states } }], 'planning');

describe('the run\'s completion agrees with the coordinator\'s own plan (REQ-ORCH-029, REQ-ORCH-068, REQ-ORCH-069)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-coordinator-plan-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(calls: ScriptedCall[], runOverride: 'single' | 'swarm' | null = null, gate?: (callId: string) => Promise<void>, config: Partial<typeof RUN_CONFIG_DEFAULTS> = {}) {
    const client = new ScriptedModelClient(calls);
    const runtime: RuntimePosture = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runOverride };
    // The `todo` tool as the run host's is to the run: it writes the root's plan through the context's `writeTodo`.
    const portFor = (ctx: ToolPortContext): ToolPort => ({
      specs: () => [{ name: 'todo', description: 'the plan', parameters: { type: 'object' } }],
      dispatch: async (call) => {
        const args = JSON.parse(call.rawArgs) as { states: Parameters<typeof plan>[0] };
        await gate?.(call.callId);
        const written = ctx.writeTodo?.(plan(args.states)) ?? false;
        return { text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 0, label: 'todo', args };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 86, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-plan-${++minted}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, ...config, model: MODEL, credentialFor: () => async () => 'k' } }, runtime,
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), tools: portFor, attended: () => true,
    });
    return { sessions, client };
  }
  const firstUser = (r: ModelRequest): string => r.messages.find((m) => m.role === 'user')!.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
  const outcomes = (sid: SessionId) => dal.iterationsOf(sid).map((r) => r.outcome);
  const agentStates = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).agent!.phases.flatMap((p) => p.tasks.map((t) => t.state));

  it('a coordinator that answers with an item of its plan pending does not end the run successful; the next iteration is told the item, finishes it, and the run completes', async () => {
    const { sessions, client } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ]);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // Without the repair the first iteration closed `succeeded` and the run ended there, its plan still pending.
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'completed', stop_reason: 'tasks_complete' });
    expect(agentStates(sid)).toEqual(['COMPLETED', 'COMPLETED']);
    // The plan the Todo pane counts (REQ-CHAT-088: the agent's over the planner's) reads every task done beside "Completed".
    const shown = projectSessionTodos(dal.getSession(sid)!, []).todo!;
    expect(shown.source).toBe('agent');
    expect(shown.phases.flatMap((p) => p.tasks.map((t) => t.state))).toEqual(['done', 'done']);
    // The second iteration's fresh root is told which items of its plan were left open (REQ-ORCH-068's continuation payload).
    const second = firstUser(client.requests[2]!);
    expect(second).toContain('run the sequence');
    expect(second).toContain('Report each command\'s outcome in one line');
    expect(firstUser(client.requests[0]!)).not.toContain('Report each command');
    const ends = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string; summary: string });
    expect(ends[0]).toMatchObject({ iteration: 1, outcome: 'partial', summary: 'the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line' });
  });

  it('a coordinator that never finishes its plan does not end the run successful: the task is given up at the retry limit and the session reads failed', async () => {
    const calls: ScriptedCall[] = [];
    for (let i = 0; i < 3; i++) calls.push(writePlan(`c${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'));
    const { sessions } = sessionsWith(calls);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned']);
    // REQ-ORCH-082 rule 4 over the abandoned task: the session reads failed, naming the plan left open.
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'failed', summary_status: 'failed', summary_text: 'The run failed: the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line' });
    expect(dal.getSession(sid)!.stop_reason).not.toBe('tasks_complete');
  });

  it('REQ-ORCH-075 / REQ-ORCH-067 (OQ-203): an item a given-up task left open is not carried to, nor held against, the next task — which still answers for an item it opens itself', async () => {
    const calls: ScriptedCall[] = [];
    // Task A: the coordinator leaves its second item in progress three times, and A is given up at the retry limit.
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'));
    // Task B, a queued prompt (REQ-CHAT-040): it opens an item of its own and leaves it pending, then finishes it.
    calls.push(writePlan('b0', ['COMPLETED', 'IN_PROGRESS', 'PENDING']), answer('B done.'));
    calls.push(writePlan('b1', ['COMPLETED', 'IN_PROGRESS', 'COMPLETED']), answer('B done; its item is complete.'));
    const { sessions, client } = sessionsWith(calls);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'write the changelog' } } as never)).toMatchObject({ ok: true });
    await sessions.running(sid)!;
    // Without the scope, B was returned to the queue and given up on too — [partial, partial, abandoned, partial, partial, abandoned].
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', 'partial', 'succeeded']);
    const ends = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string; summary: string });
    // B answers only for the item it opened, never for the one A left open.
    expect(ends[3]).toMatchObject({ iteration: 4, outcome: 'partial', summary: 'the coordinator answered with 1 item of its plan not done: A third item' });
    // B's first root is told nothing of A's plan: the continuation reaches the same task's next iteration alone.
    const bFirst = firstUser(client.requests[6]!);
    expect(bFirst).toContain('write the changelog');
    expect(bFirst).not.toContain('Report each command');
    expect(bFirst).not.toContain('The previous iteration on this task');
    const bSecond = firstUser(client.requests[8]!);
    expect(bSecond).toContain('A third item');
    expect(bSecond).not.toContain('Report each command');
    // The item A left open stays open in the plan the Todo pane counts: the record does not call it done.
    expect(agentStates(sid)).toEqual(['COMPLETED', 'IN_PROGRESS', 'COMPLETED']);
  });

  it('REQ-ORCH-075 (OQ-203): an item an earlier run left open is not held against a later run\'s task', async () => {
    const calls: ScriptedCall[] = [];
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'));
    calls.push(answer('Changelog written.'));
    const { sessions, client } = sessionsWith(calls);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned']);
    expect(sessions.prompt(sid, 'write the changelog').ok).toBe(true);
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', 'succeeded']);
    const next = firstUser(client.requests[6]!);
    expect(next).not.toContain('The previous iteration on this task');
  });

  it('REQ-ORCH-075 (OQ-203): an iteration a continue resumes holds every open item against its task — one its root opened before the pause included', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const { sessions } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, async (callId) => { if (callId === 'c1') { entered(); await held; } });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await reached;
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    expect((await sessions.running(sid)!).status).toBe('interrupted');
    expect(dal.iterationsOf(sid).map((r) => r.state)).toEqual(['open']);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The resumed iteration's root answered with the item it had opened before the pause still pending: not complete.
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
  });

  it('REQ-ORCH-075 (OQ-203): a task\'s take-up record is kept with it, so the iteration a continue resumes still holds no item a given-up task left open', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const calls: ScriptedCall[] = [];
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'));
    // Task B, a queued prompt: it opens its own item, finishes it, and is paused in that very call.
    calls.push(writePlan('b0', ['COMPLETED', 'IN_PROGRESS', 'COMPLETED']), answer('B done; its item is complete.'));
    const { sessions } = sessionsWith(calls, null, async (callId) => { if (callId === 'b0') { entered(); await held; } });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'write the changelog' } } as never)).toMatchObject({ ok: true });
    await reached;
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    expect((await sessions.running(sid)!).status).toBe('interrupted');
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', null]);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    // Without the stored record the resumed run found none and held A's item against B: B was returned to the queue and given
    // up on, [partial, partial, abandoned, partial, partial, abandoned].
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', 'succeeded']);
    expect(agentStates(sid)).toEqual(['COMPLETED', 'IN_PROGRESS', 'COMPLETED']);
  });

  it('REQ-ORCH-029 / REQ-ORCH-075 (OQ-203): a task re-queued with its own item open, taken up again by a later run, still answers for that item', async () => {
    const { sessions, client } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      answer('All done.'),
    ], null, undefined, { iterationLimit: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial']);
    expect(dal.getSession(sid)!.stop_reason).toBe('iteration_limit_reached');
    expect(sessions.prompt(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    // Without the stored record the later run took the task's own leftover item as open at take-up and excused it: the root
    // answered "All done." without touching its plan and the task was marked complete beside [COMPLETED, PENDING].
    expect(outcomes(sid)).toEqual(['partial', 'partial']);
    const planner = decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
    expect(planner.find((t) => t.text === 'run the sequence')!.state).not.toBe('complete');
    expect(agentStates(sid)).toEqual(['COMPLETED', 'PENDING']);
    // The later run's fresh root of the same task is told the item its last iteration left open (REQ-ORCH-075's marker).
    expect(firstUser(client.requests[2]!)).toContain('Report each command\'s outcome in one line');
  });

  it('REQ-ORCH-078: with a validation-retry setting of 1, a correction is sent into the same conversation before the task is re-queued', async () => {
    const { sessions, client } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, undefined, { validationRetries: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // One iteration: the correction was answered in the root's own conversation, so nothing was re-queued.
    expect(outcomes(sid)).toEqual(['succeeded']);
    const corrected = client.requests[2]!;
    const last = corrected.messages[corrected.messages.length - 1]!;
    expect(last.role).toBe('user');
    const said = last.content.map((c) => (c.kind === 'text' ? c.text : '')).join('');
    expect(said).toContain('Report each command\'s outcome in one line');
    // The same conversation: the root's own answer before the correction is in it.
    expect(corrected.messages.some((m) => m.role === 'assistant' && m.content.some((c) => c.kind === 'text' && c.text.includes('Here is each command')))).toBe(true);
  });

  it('REQ-ORCH-078 / REQ-ORCH-075: a correction left unanswered is followed by the re-queue, once the retries are spent', async () => {
    const { sessions } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      answer('Still done.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, undefined, { validationRetries: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
  });

  it('an item ABANDONED is terminal: the run completes', async () => {
    const { sessions } = sessionsWith([writePlan('c1', ['COMPLETED', 'ABANDONED']), answer('Done; the second item was dropped.')]);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(outcomes(sid)).toEqual(['succeeded']);
  });

  it('REQ-ORCH-025: under a `single` override the entry role is the worker, and REQ-ORCH-029 does not bind it', async () => {
    const { sessions } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), answer('Done.')], 'single');
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(outcomes(sid)).toEqual(['succeeded']);
  });
});
