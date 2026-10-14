import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { ProjectionOwner, Run, RUN_CONFIG_DEFAULTS, SequenceCounters, Sessions, SessionWriter, toSessionRecord, toTranscriptRow, type RuntimePosture, type ToolPort, type ToolPortContext } from '../index.js';
import { decodeStoredTodo, projectSessionTodos, type AgentTodoDocument } from '../todo-view.js';
import { TODO_LIST_OWED_TEXT } from './stop-conditions.js';
import { ANSWER_REPROMPT } from './run.js';
import { SUPERVISOR_DEFAULTS, type LoopActivation, type LoopClassifier } from './supervisor.js';

/**
 * The repair of `the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` (live-run finding G5):
 * REQ-ORCH-029, the coordinator "does not report the run successful while a todo item is non-terminal". An iteration whose
 * root answers with an item of its own plan still open returns its task to the pending queue (REQ-ORCH-068) rather than
 * marking it complete, so REQ-ORCH-069 and REQ-ORCH-082 do not read success off it; the next iteration is told which items
 * were left open. Under a `single` override the entry role is the worker (REQ-ORCH-025) and the constraint does not bind.
 * REQ-ORCH-075's re-queue is of the same task, and a task answers only for items not already open at its first take-up
 * (OQ-203), a record kept with the task in the stored todo: an item a given-up task or an earlier run left open passes to no
 * later task, and one the task's own iteration left open holds it after a pause, a continue or a later run. REQ-ORCH-078 under
 * PD-ORCH-015 (OQ-225): a correction goes into the root's own conversation first, at least once, so the cases that pin the
 * re-queue script a root that ignores it ("Still done."); the directive's own cases are in their block below.
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

  function sessionsWith(calls: ScriptedCall[], runOverride: 'single' | 'swarm' | null = null, gate?: (callId: string) => Promise<void>, config: Partial<typeof RUN_CONFIG_DEFAULTS> = {}, runStartMode: 'auto' | 'plan' = 'auto', withoutTodo = false, classifier?: LoopClassifier) {
    const client = new ScriptedModelClient(calls);
    const workItemsRun: string[] = [];
    const warnings: string[] = [];
    const runtime: RuntimePosture = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runOverride, runStartMode };
    // The `todo` tool as the run host's is to the run: it writes the root's plan through the context's `writeTodo`.
    const portFor = (ctx: ToolPortContext): ToolPort => {
      // OQ-213: the run host tells the run when the entry role's resolved set holds no `todo`, and hands its gate no check.
      if (withoutTodo && ctx.todoList) { ctx.todoList.unavailable(); ctx = { ...ctx, todoList: undefined }; }
      return portOver(ctx);
    };
    const portOver = (ctx: ToolPortContext): ToolPort => ({
      specs: () => [{ name: 'todo', description: 'the plan', parameters: { type: 'object' } }, { name: 'delegate', description: 'a work item', parameters: { type: 'object' } }],
      dispatch: async (call) => {
        // OQ-213: a work item as the run host's gate treats one — refused while the run owes a todo list, else counted and run.
        if (call.name === 'delegate') {
          const args = JSON.parse(call.rawArgs) as Record<string, unknown>;
          await gate?.(call.callId);
          const owed = ctx.todoList?.owed() ?? null;
          if (owed !== null) return { text: owed, isError: true, status: 'blocked', durationMs: 0, label: 'delegate', args, blockedReason: owed };
          ctx.todoList?.started();
          workItemsRun.push(String(args['task']));
          return { text: 'delegated', isError: false, status: 'ok', durationMs: 0, label: 'delegate', args };
        }
        const args = JSON.parse(call.rawArgs) as { states: Parameters<typeof plan>[0] };
        await gate?.(call.callId);
        const written = ctx.writeTodo?.(plan(args.states)) ?? false;
        return { text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 0, label: 'todo', args };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 86, host: HOST, retentionCap: 20_000, warn: (m) => { warnings.push(m); },
      mintSessionId: () => `S-plan-${++minted}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, ...config, model: MODEL, credentialFor: () => async () => 'k' } }, runtime,
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), tools: portFor, attended: () => true,
      ...(classifier ? { supervisor: () => ({ config: SUPERVISOR_DEFAULTS, classifier }) } : {}),
    });
    return { sessions, client, workItemsRun, warnings };
  }
  const firstUser = (r: ModelRequest): string => r.messages.find((m) => m.role === 'user')!.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
  const outcomes = (sid: SessionId) => dal.iterationsOf(sid).map((r) => r.outcome);
  const agentStates = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).agent!.phases.flatMap((p) => p.tasks.map((t) => t.state));

  it('a coordinator that answers with an item of its plan pending does not end the run successful; the next iteration is told the item, finishes it, and the run completes', async () => {
    const { sessions, client } = sessionsWith([
      // The root ignores its correction (PD-ORCH-015), so the task is re-queued.
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'), answer('Still done.'),
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
    const second = firstUser(client.requests[3]!);
    expect(second).toContain('run the sequence');
    expect(second).toContain('Report each command\'s outcome in one line');
    expect(firstUser(client.requests[0]!)).not.toContain('Report each command');
    const ends = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string; summary: string });
    expect(ends[0]).toMatchObject({ iteration: 1, outcome: 'partial', summary: 'the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line' });
  });

  it('a coordinator that never finishes its plan does not end the run successful: the task is given up at the retry limit and the session reads failed', async () => {
    const calls: ScriptedCall[] = [];
    for (let i = 0; i < 3; i++) calls.push(writePlan(`c${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
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
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
    // Task B, a queued prompt (REQ-CHAT-040): it opens an item of its own and leaves it pending, then finishes it.
    calls.push(writePlan('b0', ['COMPLETED', 'IN_PROGRESS', 'PENDING']), answer('B done.'), answer('B done.'));
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
    const bFirst = firstUser(client.requests[9]!);
    expect(bFirst).toContain('write the changelog');
    expect(bFirst).not.toContain('Report each command');
    expect(bFirst).not.toContain('The previous iteration on this task');
    const bSecond = firstUser(client.requests[12]!);
    expect(bSecond).toContain('A third item');
    expect(bSecond).not.toContain('Report each command');
    // The item A left open stays open in the plan the Todo pane counts: the record does not call it done.
    expect(agentStates(sid)).toEqual(['COMPLETED', 'IN_PROGRESS', 'COMPLETED']);
  });

  it('REQ-ORCH-075 (OQ-203): an item an earlier run left open is not held against a later run\'s task', async () => {
    const calls: ScriptedCall[] = [];
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
    calls.push(answer('Changelog written.'));
    const { sessions, client } = sessionsWith(calls);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned']);
    expect(sessions.prompt(sid, 'write the changelog').ok).toBe(true);
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', 'succeeded']);
    const next = firstUser(client.requests[9]!);
    expect(next).not.toContain('The previous iteration on this task');
  });

  it('REQ-ORCH-075 (OQ-203): an iteration a continue resumes holds every open item against its task — one its root opened before the pause included', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const { sessions } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'), answer('Still done.'),
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
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
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
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'), answer('Still done.'),
      answer('All done.'), answer('All done.'),
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
    expect(firstUser(client.requests[3]!)).toContain('Report each command\'s outcome in one line');
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

  it('PD-ORCH-009 beside REQ-ORCH-078: a root that answers when asked once more is not said to be answerless when a later plan correction ends without text', async () => {
    // A step that reasons and ends its turn with neither text nor a tool call (OQ-199).
    const silent: ScriptedCall = { parts: [{ part: { kind: 'reasoning', delta: 'thinking' } }, { part: { kind: 'usage', usage: { input: 1, output: 1 } } }, { part: { kind: 'finish', reason: 'stop' } }] };
    const { sessions, client } = sessionsWith([
      writePlan('c1', ['COMPLETED', 'PENDING']), silent,
      // Asked once more (PD-ORCH-009), it answers; the plan's correction then follows (REQ-ORCH-078), and its turn is silent.
      answer('Here is each command\'s outcome.'), silent,
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, undefined, { validationRetries: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(6);
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
    expect(dal.residentRows(sid).filter((r) => r.body.includes('ended without an answer'))).toEqual([]);
    expect(dal.issuesOf(sid).filter((i) => i.kind === 'incomplete_execution')).toEqual([]);
  });

  it('REQ-ORCH-153 / REQ-ORCH-075 (OQ-203): the plan the coordinator writes in its plan cycle is the planned task\'s own — a root that answers without finishing it after approval does not complete the run', async () => {
    const { sessions, client } = sessionsWith([
      // The plan cycle: the coordinator writes its plan as its todo list (REQ-ORCH-153 keeps the todo state writable).
      writePlan('p1', ['PENDING', 'PENDING']), answer('Step 1: run the sequence. Step 2: report each outcome.'),
      // After approval: the first root answers without touching the plan, and ignores its correction; the next finishes it.
      answer('All done.'), answer('All done.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, undefined, {}, 'plan');
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
    expect(agentStates(sid)).toEqual(['PENDING', 'PENDING']);
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    // Without the repair the first take-up after approval found the plan cycle's items open, excused them, and the run read
    // completed / tasks_complete beside [PENDING, PENDING] — finding G5 on every plan-mode run.
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'completed', stop_reason: 'tasks_complete' });
    expect(agentStates(sid)).toEqual(['COMPLETED', 'COMPLETED']);
    // The second fresh root is told both items its plan cycle wrote and the first root left open.
    const second = firstUser(client.requests[4]!);
    expect(second).toContain('Run the sequence');
    expect(second).toContain('Report each command\'s outcome in one line');
  });

  it('REQ-ORCH-154 / REQ-ORCH-075 (OQ-203): a revise cycle keeps the take-up the first cycle recorded, so the plan it leaves as it stands is still the task\'s own', async () => {
    const { sessions } = sessionsWith([
      writePlan('p1', ['PENDING', 'PENDING']), answer('Step 1: run the sequence. Step 2: report.'),
      // The revise cycle answers with the revised text and leaves the todo list as the first cycle wrote it.
      answer('Revised: Step 1, run the sequence quietly. Step 2: report.'),
      answer('All done.'), answer('All done.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ], null, undefined, {}, 'plan');
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'revise', 'run it quietly').ok).toBe(true);
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    // A take-up recorded at the revise cycle would have found the first cycle's items open and excused them.
    expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
    expect(agentStates(sid)).toEqual(['COMPLETED', 'COMPLETED']);
  });

  it('REQ-ORCH-153 / REQ-ORCH-075 (OQ-203): what was open before a re-armed plan cycle is excused for the task it plans; what the cycle writes is not', async () => {
    const calls: ScriptedCall[] = [];
    // Run 1, in plan mode: the cycle leaves the plan alone; after approval task A leaves its second item in progress three times.
    calls.push(answer('Step 1: run the sequence.'));
    for (let i = 0; i < 3; i++) calls.push(writePlan(`a${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
    // Run 2, re-armed: its plan cycle adds an item of its own; after approval the root answers without finishing it, then does.
    calls.push(writePlan('p2', ['COMPLETED', 'IN_PROGRESS', 'PENDING']), answer('Step 1: write the changelog.'));
    calls.push(answer('Changelog written.'), answer('Changelog written.'));
    calls.push(writePlan('b1', ['COMPLETED', 'IN_PROGRESS', 'COMPLETED']), answer('Changelog written; its item is complete.'));
    const { sessions } = sessionsWith(calls, null, undefined, {}, 'plan');
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    await sessions.running(sid)!;
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned']);
    expect(sessions.planRearm(sid)).toEqual({ ok: true, value: true });
    expect(sessions.prompt(sid, 'write the changelog').ok).toBe(true);
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    await sessions.running(sid)!;
    // The item A left open is not held against the changelog's task; the item its plan cycle wrote is, until it is done.
    expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned', 'partial', 'succeeded']);
    const ends = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string; summary: string });
    expect(ends[3]).toMatchObject({ outcome: 'partial', summary: 'the coordinator answered with 1 item of its plan not done: A third item' });
    expect(agentStates(sid)).toEqual(['COMPLETED', 'IN_PROGRESS', 'COMPLETED']);
  });

  it('REQ-ORCH-078: a run built without per-agent tool ports (no children) sends the correction into the root\'s conversation too', async () => {
    const sid = asSessionId('S-plan-no-children');
    const client = new ScriptedModelClient([
      writePlan('c1', ['COMPLETED', 'PENDING']), answer('Here is each command\'s outcome.'),
      writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
    ]);
    const publisher = { increment: () => undefined, snapshot: () => undefined };
    const bus = new Sessions({ clocks: clock, publisher, pid: 1, host: HOST, retentionCap: 0, warn: () => undefined, mintSessionId: () => 'x', model: null, sessionFilesDir: () => dir }).bus;
    let owner: ProjectionOwner | undefined;
    let run: Run | undefined;
    const created = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => { owner?.onCommitted(c); run?.onCommitted(c); } }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST, task: 'run the sequence' });
    if (!created.ok) throw new Error('create');
    owner = new ProjectionOwner({ sessionId: sid, seq: new SequenceCounters(), timers: clock, publisher, readSession: () => toSessionRecord(dal.getSession(sid)!), readResident: () => dal.residentRows(sid).map(toTranscriptRow) });
    // One port for the whole run (`RunDeps.tools`, no `toolsFor`): the root's `todo` writes the root's plan.
    const tools: ToolPort = {
      specs: () => [{ name: 'todo', description: 'the plan', parameters: { type: 'object' } }],
      dispatch: async (call) => {
        const args = JSON.parse(call.rawArgs) as { states: Parameters<typeof plan>[0] };
        const written = run?.replaceAgentTodo(null, true, plan(args.states)) ?? false;
        return { text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 0, label: 'todo', args };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
    run = new Run({
      sessionId: sid, workspaceRoot: 'C:/ws', task: 'run the sequence', taskId: 'T', writer: created.value, owner, bus, clocks: clock, backend: new DefaultAgentBackend(client),
      config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', validationRetries: 1 }, tools,
      permission: { requested: 'ask', effective: 'ask', downgraded: false, reason: '', sandboxed: false, sandboxBackend: '' }, pid: 1, host: HOST, readSession: () => dal.getSession(sid), warn: () => undefined,
    });
    expect((await run.start()).status).toBe('completed');
    // One iteration: the correction was answered in the root's own conversation, so nothing was re-queued.
    expect(outcomes(sid)).toEqual(['succeeded']);
    expect(client.requests).toHaveLength(4);
    const corrected = client.requests[2]!;
    const last = corrected.messages[corrected.messages.length - 1]!;
    expect(last.role).toBe('user');
    expect(last.content.map((c) => (c.kind === 'text' ? c.text : '')).join('')).toContain('Report each command\'s outcome in one line');
    expect(corrected.messages.some((m) => m.role === 'assistant' && m.content.some((c) => c.kind === 'text' && c.text.includes('Here is each command')))).toBe(true);
  });

  it('an item ABANDONED is terminal: the run completes', async () => {
    const { sessions } = sessionsWith([writePlan('c1', ['COMPLETED', 'ABANDONED']), answer('Done; the second item was dropped.')]);
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(outcomes(sid)).toEqual(['succeeded']);
  });

  /**
   * OQ-213 as ruled under the owner's delegation (R-072), building REQ-ORCH-029's "work spanning more than one step is
   * accompanied by a todo list it keeps current": while the entry role coordinates, the call that would start the current
   * task's second work item is refused until the entry role has written a todo list of its own for that task. The port here
   * stands in for the run host's gate (`apps/desktop/src/run-host/tools.ts`, `packages/agent-tools/src/gate.ts`): a
   * `delegate` call is a work item, refused while the run owes a list, counted once it runs.
   */
  describe('the todo list owed before a task\'s second work item (OQ-213, REQ-ORCH-029)', () => {
    const del = (callId: string, task: string): ScriptedCall => toolCalls([{ callId, name: 'delegate', args: { task } }], 'working');
    const refusals = (warnings: readonly string[]) => warnings.filter((w) => w.includes('began the task\'s second work item with no todo list of its own; the call was refused (REQ-ORCH-029)'));
    const toolResultsOf = (r: ModelRequest) => r.messages.flatMap((m) => [...m.content] as { kind: string }[]).filter((c) => c.kind === 'tool-result') as unknown as { callId: string; result: string }[];
    const planner = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);

    it('two delegations with no list: the second is refused and logged; once the list is written the same call runs', async () => {
      const { sessions, client, workItemsRun, warnings } = sessionsWith([
        del('d1', 'one'), del('d2', 'two'),
        writePlan('p1', ['COMPLETED', 'IN_PROGRESS']), del('d3', 'two'),
        writePlan('p2', ['COMPLETED', 'COMPLETED']), answer('Both done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Without the refusal both delegations ran with no plan behind them: ['one', 'two', 'two'].
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toHaveLength(1);
      expect(refusals(warnings)[0]).toMatch(/iteration 1: orchestrator began/);
      const refused = toolResultsOf(client.requests[2]!).find((r) => r.callId === 'd2')!;
      expect(refused.result).toBe(TODO_LIST_OWED_TEXT);
      expect(outcomes(sid)).toEqual(['succeeded']);
      // A task completed carries neither fact any further.
      expect(planner(sid)[0]).not.toHaveProperty('workItems');
      expect(planner(sid)[0]).not.toHaveProperty('listWritten');
    });

    /*
     * PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 (OQ-249): the refusal tells the coordinator to plan pieces of work,
     * keep only its own item IN_PROGRESS and leave the items it will delegate PENDING, which the delegation then marks. It said
     * "one item per step with only the step you are on IN_PROGRESS", and the live runs at a68f121 planned two parallel children
     * IN_PROGRESS and were refused (edit #5, duress #19).
     */
    it('the refusal teaches the plan PD-TOOLS-008 revision 2 bounds: delegated items PENDING, marked by the delegation', () => {
      expect(TODO_LIST_OWED_TEXT).toContain('one item per piece of work, with only an item you work on yourself IN_PROGRESS and the items you will delegate PENDING');
      expect(TODO_LIST_OWED_TEXT).toContain('on a delegate call give todo_item: the id of the item it serves, which the call marks IN_PROGRESS.');
      expect(TODO_LIST_OWED_TEXT).not.toContain('only the step you are on');
    });

    it('a coordinator that plans first is never refused', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        writePlan('p1', ['IN_PROGRESS', 'PENDING']), del('d1', 'one'), del('d2', 'two'),
        writePlan('p2', ['COMPLETED', 'COMPLETED']), answer('Both done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toEqual([]);
    });

    it('[delegate, delegate, todo] in one step: the second delegate is refused — the calls dispatch in order', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        toolCalls([{ callId: 'd1', name: 'delegate', args: { task: 'one' } }, { callId: 'd2', name: 'delegate', args: { task: 'two' } }, { callId: 'p1', name: 'todo', args: { states: ['COMPLETED', 'COMPLETED'] } }], 'all at once'),
        del('d3', 'two'), answer('Both done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toHaveLength(1);
    });

    it('[todo, delegate, delegate] in one step: a list written earlier in the step satisfies the check', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        toolCalls([{ callId: 'p1', name: 'todo', args: { states: ['COMPLETED', 'COMPLETED'] } }, { callId: 'd1', name: 'delegate', args: { task: 'one' } }, { callId: 'd2', name: 'delegate', args: { task: 'two' } }], 'plan, then both'),
        answer('Both done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toEqual([]);
    });

    it('one delegation is no multi-step work: nothing is refused and no list is asked for', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([del('d1', 'one'), answer('Done.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(workItemsRun).toEqual(['one']);
      expect(refusals(warnings)).toEqual([]);
    });

    it('REQ-ORCH-025: under a `single` override the entry role does not coordinate, and nothing is refused', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([del('d1', 'one'), del('d2', 'two'), answer('Done.')], 'single');
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toEqual([]);
      expect(planner(sid)[0]).not.toHaveProperty('workItems');
    });

    it('an entry role whose resolved set holds no todo is never refused, and the run says so once, across its iterations', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([del('d1', 'one'), del('d2', 'two'), answer('A done.'), del('d3', 'three'), answer('B done.')], null, undefined, {}, 'auto', true);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'write the changelog' } } as never)).toMatchObject({ ok: true });
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['one', 'two', 'three']);
      expect(refusals(warnings)).toEqual([]);
      expect(warnings.filter((w) => w.includes('holds no todo tool'))).toHaveLength(1);
    });

    it('REQ-ORCH-153: a plan cycle\'s delegations neither count nor are refused, and the list it writes is the planned task\'s', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        del('c1', 'look'), del('c2', 'look again'), writePlan('p1', ['PENDING', 'PENDING']), answer('Step 1: one. Step 2: two.'),
        del('d1', 'one'), del('d2', 'two'), writePlan('p2', ['COMPLETED', 'COMPLETED']), answer('Both done.'),
      ], null, undefined, {}, 'plan');
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(planner(sid)[0]).toMatchObject({ listWritten: true });
      expect(planner(sid)[0]).not.toHaveProperty('workItems');
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(workItemsRun).toEqual(['look', 'look again', 'one', 'two']);
      expect(refusals(warnings)).toEqual([]);
    });

    it('a plan cycle that writes no list leaves the task owing one after approval', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        del('c1', 'look'), del('c2', 'look again'), answer('Step 1: one. Step 2: two.'),
        del('d1', 'one'), del('d2', 'two'), writePlan('p2', ['COMPLETED', 'COMPLETED']), del('d3', 'two'), answer('Both done.'),
      ], null, undefined, {}, 'plan');
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['look', 'look again', 'one', 'two']);
      expect(refusals(warnings)).toHaveLength(1);
    });

    it('pause then continue: the work-item count is kept with the task, so the resumed iteration\'s next work item still waits for a list', async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const reached = new Promise<void>((resolve) => { entered = resolve; });
      const { sessions, workItemsRun, warnings } = sessionsWith([
        del('d1', 'one'),
        del('d2', 'two'), writePlan('p1', ['COMPLETED', 'COMPLETED']), del('d3', 'two'), answer('Both done.'),
      ], null, async (callId) => { if (callId === 'd1') { entered(); await held; } });
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await reached;
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(planner(sid)[0]).toMatchObject({ workItems: 1 });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Without the stored count the resumed run started from none and let the second delegation through unplanned.
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toHaveLength(1);
    });

    it('pause then continue after the list is written: the written list is kept with the task, so the resumed iteration\'s next work item is not refused', async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const reached = new Promise<void>((resolve) => { entered = resolve; });
      const { sessions, workItemsRun, warnings } = sessionsWith([
        writePlan('p1', ['IN_PROGRESS', 'PENDING']), del('d1', 'one'),
        del('d2', 'two'), writePlan('p2', ['COMPLETED', 'COMPLETED']), answer('Both done.'),
      ], null, async (callId) => { if (callId === 'd1') { entered(); await held; } });
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await reached;
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(planner(sid)[0]).toMatchObject({ workItems: 1, listWritten: true });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Without the stored fact the resumed run read the task as one work item in with no list, and refused d2.
      expect(workItemsRun).toEqual(['one', 'two']);
      expect(refusals(warnings)).toEqual([]);
    });

    it('a later task whose earlier list is all done is refused until it writes its own', async () => {
      const { sessions, workItemsRun, warnings } = sessionsWith([
        writePlan('a1', ['COMPLETED', 'COMPLETED']), del('a2', 'a-one'), del('a3', 'a-two'), answer('A done.'),
        del('b1', 'b-one'), del('b2', 'b-two'), writePlan('b3', ['COMPLETED', 'COMPLETED', 'COMPLETED']), del('b4', 'b-two'), answer('B done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'write the changelog' } } as never)).toMatchObject({ ok: true });
      await sessions.running(sid)!;
      expect(outcomes(sid)).toEqual(['succeeded', 'succeeded']);
      expect(workItemsRun).toEqual(['a-one', 'a-two', 'b-one', 'b-two']);
      expect(refusals(warnings)).toHaveLength(1);
      expect(refusals(warnings)[0]).toMatch(/^.*iteration 2:/);
    });

    it('a person\'s own edit of the plan is not the coordinator\'s list', async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const reached = new Promise<void>((resolve) => { entered = resolve; });
      const { sessions, workItemsRun, warnings } = sessionsWith([
        writePlan('a1', ['COMPLETED', 'COMPLETED']), answer('A done.'),
        del('b1', 'b-one'), del('b2', 'b-two'), writePlan('b3', ['COMPLETED', 'COMPLETED', 'COMPLETED']), del('b4', 'b-two'), answer('B done.'),
      ], null, async (callId) => { if (callId === 'b1') { entered(); await held; } });
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'write the changelog' } } as never)).toMatchObject({ ok: true });
      await reached;
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', text: 'a step of my own', source: 'agent', phaseId: 'e002ab7d' } })).toMatchObject({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(workItemsRun).toEqual(['b-one', 'b-two']);
      expect(refusals(warnings)).toHaveLength(1);
    });
  });

  /**
   * OQ-225 as ruled under the owner's delegation (R-072), `PD-ORCH-015` (narrowing REQ-ORCH-078, extending REQ-ORCH-075) and
   * `PD-ORCH-009` revision 2: a root that answers with its plan open is corrected in its own conversation at least once, the
   * count the larger of 1 and the validation-retry setting; a turn after an answer is never re-prompted for one; a task still
   * re-queued or given up on is announced in a `system` row, and its next fresh root is handed the held answer. The repair of
   * `a-re-queued-tasks-fresh-root-cannot-see-the-answer-its-iteration-was-held-back-for.md` (live-run finding P1).
   */
  describe('a root that answers with its plan open is corrected in its own conversation; a held answer is carried and announced (PD-ORCH-015, OQ-225)', () => {
    const REPORT = 'Here is each command\'s outcome: 1. echo printed hi (exit 0). 2. false exited 1. 3. sleep 1 ended (exit 0).';
    const silent: ScriptedCall = { parts: [{ part: { kind: 'reasoning', delta: 'recorded' } }, { part: { kind: 'usage', usage: { input: 1, output: 1 } } }, { part: { kind: 'finish', reason: 'stop' } }] };
    const lastUser = (r: ModelRequest): string => r.messages.filter((m) => m.role === 'user').at(-1)!.content.map((c) => (c.kind === 'text' ? c.text : '')).join('');
    const corrections = (warnings: readonly string[]) => warnings.filter((w) => w.includes('a correction is sent into its conversation'));
    const systemRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'system' && r.body.startsWith('Iteration '));
    const ends = (sid: SessionId) => dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string; summary: string });
    const planner = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks) as unknown as Record<string, unknown>[];

    it('at the default configuration a root that answers with an item pending is corrected once, records it, and the iteration closes succeeded with no re-prompt', async () => {
      const { sessions, client, warnings } = sessionsWith([
        writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT),
        // The correction: the root records the item it already did, and ends its turn with no text.
        writePlan('c2', ['COMPLETED', 'COMPLETED']), silent,
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Without the directive (REQ-ORCH-078's default of 0) the task was re-queued: ['partial', ...] and a fresh root redid it.
      expect(outcomes(sid)).toEqual(['succeeded']);
      expect(dal.getSession(sid)).toMatchObject({ execution_status: 'completed', stop_reason: 'tasks_complete' });
      expect(client.requests).toHaveLength(4);
      const corrected = lastUser(client.requests[2]!);
      expect(corrected.startsWith('Your answer has been shown to the person.')).toBe(true);
      expect(corrected).toContain('Report each command\'s outcome in one line');
      expect(corrected).toContain('Record each item\'s true state with the todo tool: COMPLETED where the work is done, ABANDONED where you will not do it.');
      expect(corrections(warnings)).toEqual(['iteration 1: the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line; a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)']);
      // PD-ORCH-009 revision 2: the correction's silent turn follows an answer, so it is not asked for one.
      expect(client.requests.some((r) => lastUser(r) === ANSWER_REPROMPT)).toBe(false);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'incomplete_execution')).toEqual([]);
      // The iteration's summary is the answer the correction followed, not the correction turn's silence.
      expect(ends(sid)[0]).toMatchObject({ iteration: 1, outcome: 'succeeded', summary: REPORT.slice(0, 200) });
      expect(systemRows(sid)).toEqual([]);
    });

    /*
     * OQ-284 (raised 2026-10-14 by fin43 beside PD-ORCH-009 revision 3): a root turn that ends empty arms REQ-ORCH-096's stuck
     * trigger, and a turn the run does not follow up leaves it pending in the root's supervisor. When the run then sends a plan
     * correction (REQ-ORCH-078, PD-ORCH-015), the correction's request takes the trigger at its first step: the stuck corrective
     * follows the correction in the same request — the shape revision 3 removed for the re-prompt alone. These two cases pin
     * what was found, as found; a ruling of OQ-284 changes them.
     */
    describe('OQ-284: a stuck trigger an unanswered empty turn left pending lands after a plan correction', () => {
      const supervised = () => {
        const asked: LoopActivation[] = [];
        const classifier: LoopClassifier = { classify: async (a) => { asked.push(a); return { loop_detected: true, reason: 'stuck', corrective_message: 'Pause and reassess the current task.' }; } };
        return { asked, classifier };
      };
      const userTexts = (r: ModelRequest): string[] => r.messages.filter((m) => m.role === 'user').map((m) => m.content.map((c) => (c.kind === 'text' ? c.text : '')).join(''));

      it('a second silence (the re-prompt answered by none): the plan correction is followed by the stuck corrective', async () => {
        const { asked, classifier } = supervised();
        const { sessions, client } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), silent, silent, writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done.')], null, undefined, {}, 'auto', false, classifier);
        const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        // Revision 3: the re-prompt is the request's last message.
        expect(lastUser(client.requests[2]!)).toBe(ANSWER_REPROMPT);
        // The silence that answered it armed stuck, and the correction's request took it.
        const after = userTexts(client.requests[3]!);
        expect(after.at(-2)!.startsWith('You declared success with 1 item')).toBe(true);
        expect(after.at(-1)).toBe('Pause and reassess the current task.');
        expect(asked.map((a) => a.trigger)).toEqual(['stuck']);
      });

      it('an empty turn after an answer and a plan correction: a second correction is followed by the stuck corrective', async () => {
        const { asked, classifier } = supervised();
        const { sessions, client } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT), silent, writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Recorded.')], null, undefined, { validationRetries: 2 }, 'auto', false, classifier);
        const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        expect(lastUser(client.requests[2]!).startsWith('Your answer has been shown to the person.')).toBe(true);
        const after = userTexts(client.requests[3]!);
        expect(after.at(-2)!.startsWith('Your answer has been shown to the person.')).toBe(true);
        expect(after.at(-1)).toBe('Pause and reassess the current task.');
        expect(asked.map((a) => a.trigger)).toEqual(['stuck']);
      });
    });

    it('a correction answered with a short line keeps the answer as the iteration\'s summary', async () => {
      const { sessions } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT), writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Recorded.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(ends(sid)[0]).toMatchObject({ outcome: 'succeeded', summary: REPORT.slice(0, 200) });
    });

    it('a root asked once more and still silent is corrected without being told an answer was shown', async () => {
      const { sessions, client } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), silent, silent, writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done.')]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(lastUser(client.requests[2]!)).toBe(ANSWER_REPROMPT);
      const corrected = lastUser(client.requests[3]!);
      expect(corrected.startsWith('You declared success with 1 item')).toBe(true);
      expect(corrected).not.toContain('has been shown');
      expect(outcomes(sid)).toEqual(['succeeded']);
    });

    it('with a validation-retry setting of 2, two corrections are sent before the re-queue', async () => {
      const { sessions, warnings } = sessionsWith([
        writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT), answer('Still done.'), answer('Still done.'),
        writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
      ], null, undefined, { validationRetries: 2 });
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(corrections(warnings).map((w) => /\((\d) of (\d)/.exec(w)!.slice(1).join('/'))).toEqual(['1/2', '2/2']);
      expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
    });

    it('a correction left unanswered re-queues the task: one system row says so, and the next fresh root is handed the held answer beside the marker', async () => {
      const { sessions, client } = sessionsWith([
        writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT), answer('Still done.'),
        writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
      // Without the directive nothing in the transcript said the answer was held back.
      expect(systemRows(sid).map((r) => r.body)).toEqual(['Iteration 1: the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line. The task was not marked complete and was returned to the queue.']);
      const second = firstUser(client.requests[3]!);
      expect(second).toContain('The previous iteration on this task declared success with 1 item of your plan not complete');
      expect(second).toContain(`Your previous iteration answered as follows, and the person was shown it:\n${REPORT}`);
      expect(second).toContain('Where it shows an item done, record that item COMPLETED with the todo tool rather than doing the work again.');
      expect(firstUser(client.requests[0]!)).not.toContain('Your previous iteration answered');
      // A task completed carries the answer no further.
      expect(planner(sid)[0]).not.toHaveProperty('heldAnswer');
      // REQ-SESSION-115 / REQ-ORCH-139 (live-run finding P4): the iteration's `iteration_end` timeline entry names the outcome
      // and the open items, so a later follow-up's "Recent iterations" says why the first iteration did not complete the task.
      expect(dal.timelineOf(sid).filter((e) => e.name === 'iteration_end').map((e) => e.message)).toEqual([
        'Iteration 1 (run the sequence): partial — the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line',
        'Iteration 2 (run the sequence): succeeded — Done: every item of the plan is complete.',
      ]);
    });

    it('the held answer is kept with the task, so a later run\'s fresh root of it is handed the answer; it reaches no other task', async () => {
      const { sessions, client } = sessionsWith([
        writePlan('c1', ['COMPLETED', 'PENDING']), answer(REPORT), answer('Still done.'),
        // The later run takes the re-queued task up again, and finishes it.
        writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done: every item of the plan is complete.'),
        answer('Changelog written.'),
      ], null, undefined, { iterationLimit: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(outcomes(sid)).toEqual(['partial']);
      expect(planner(sid)[0]!['heldAnswer']).toBe(REPORT);
      expect(sessions.prompt(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(outcomes(sid)).toEqual(['partial', 'succeeded']);
      expect(firstUser(client.requests[3]!)).toContain(REPORT);
      expect(planner(sid)[0]).not.toHaveProperty('heldAnswer');
      // The next run takes up the other task, the prompt that continued the session: it is handed nothing of the held answer.
      expect(sessions.prompt(sid, 'write the changelog').ok).toBe(true);
      await sessions.running(sid)!;
      expect(client.requests).toHaveLength(6);
      expect(firstUser(client.requests[5]!)).not.toContain('Your previous iteration answered');
    });

    it('the held answer is cut to 6,000 characters', async () => {
      const long = `${'x'.repeat(5_990)}TAIL-BEYOND-THE-CUT`;
      const { sessions, client } = sessionsWith([
        writePlan('c1', ['COMPLETED', 'PENDING']), answer(long), answer('Still done.'),
        writePlan('c2', ['COMPLETED', 'COMPLETED']), answer('Done.'),
      ]);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const second = firstUser(client.requests[3]!);
      expect(second).toContain(long.slice(0, 6_000));
      expect(second).not.toContain('TAIL-BEYOND-THE-CUT');
    });

    it('a root that never finishes is corrected once in each iteration, given up on at the retry limit, and the give-up is announced', async () => {
      const calls: ScriptedCall[] = [];
      for (let i = 0; i < 3; i++) calls.push(writePlan(`c${i}`, ['COMPLETED', 'IN_PROGRESS']), answer('All done.'), answer('All done.'));
      const { sessions, warnings } = sessionsWith(calls);
      const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(outcomes(sid)).toEqual(['partial', 'partial', 'abandoned']);
      expect(dal.getSession(sid)).toMatchObject({ execution_status: 'failed', summary_status: 'failed' });
      expect(corrections(warnings)).toHaveLength(3);
      const rows = systemRows(sid).map((r) => r.body);
      expect(rows).toHaveLength(3);
      expect(rows[2]).toBe('Iteration 3: the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line. The task was given up on at the retry limit.');
      expect(planner(sid)[0]).not.toHaveProperty('heldAnswer');
    });
  });

  it('REQ-ORCH-025: under a `single` override the entry role is the worker, and REQ-ORCH-029 does not bind it', async () => {
    const { sessions } = sessionsWith([writePlan('c1', ['COMPLETED', 'PENDING']), answer('Done.')], 'single');
    const sid = (sessions.start(dal, 'C:/ws', 'run the sequence') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(outcomes(sid)).toEqual(['succeeded']);
  });
});
