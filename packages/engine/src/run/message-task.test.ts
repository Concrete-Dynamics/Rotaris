import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type RunConfig, type ToolPort } from '../index.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';
import type { Task } from './todo.js';

/**
 * PD-ORCH-005 clause 17 (revision 4): the message a continue delivers to the resumed root is also a task of the session's
 * todo, which closes with the resumed iteration — done when it succeeds, left pending when it is cancelled or fails, so
 * the next iteration takes it up. Driven end to end through the session manager.
 */
const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const PREFLIGHT: Preflight = {
  intent: { category: 'moderate_feature', confidence: 1, reason: 'fixed by the test', fallback: false, carried_over: false },
  grant: 'none', route: 'work', resolvedPlaybooks: {}, playbookFor: () => '', budgetCell: null, warnings: [],
};

describe('PD-ORCH-005 clause 17: a continue\'s message is also a task', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-message-task-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const probe: ToolPort = {
    specs: () => [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }],
    dispatch: async () => ({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }),
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };

  /** Model calls answered in order from `calls`; one past the end fails, as a root with nothing to say does. */
  function sessionsWith(calls: ScriptedCall[], opts: { preflightHold?: () => Promise<void>; config?: Partial<RunConfig> } = {}) {
    const client = new ScriptedModelClient(calls);
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...opts.config };
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 81, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-msg-${++minted}`, model: { backend: new DefaultAgentBackend(client), config },
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), tools: () => probe,
      ...(opts.preflightHold ? { preflight: async () => { await opts.preflightHold!(); return PREFLIGHT; } } : {}),
    });
    return { sessions, client };
  }

  const tasksOf = (sid: SessionId): Task[] => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
  const shape = (sid: SessionId) => tasksOf(sid).map((t) => [t.text, t.state, t.heldBy]);
  const tick = () => new Promise((r) => setTimeout(r, 10));

  /** The residue a rest leaves: iteration `n` open by a pause, its task in progress, and the session `paused`. */
  function restIn(sid: SessionId, n: number): void {
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = ?").run(sid, n);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    const own = dal.iterationsOf(sid).find((r) => r.iteration === n)!.todo_task_id;
    for (const phase of planner.phases) for (const task of phase.tasks) if (task.id === own) task.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: n - 1, todo: encodeStoredTodo({ ...stored, planner }) });
    dal.setIterationInterruption(sid, n, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
  }

  async function restedSession(calls: ScriptedCall[], opts: Parameters<typeof sessionsWith>[1] = {}) {
    const h = sessionsWith([answer('first, done'), ...calls], opts);
    const sid = (h.sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    expect((await h.sessions.running(sid)!).status).toBe('completed');
    restIn(sid, 1);
    return { ...h, sid };
  }

  it('the message is held by the resumed iteration while it runs, and done when it succeeds — no second iteration runs it', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedSession([{ parts: [{ hold }, ...answer('second, done').parts] }]);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(shape(sid)).toEqual([['first', 'in_progress', undefined], ['second', 'in_progress', 1]]);
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(shape(sid)).toEqual([['first', 'complete', undefined], ['second', 'complete', undefined]]);
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome])).toEqual([[1, 'succeeded']]);
    // Its id is a continued prompt's own, never the resumed iteration's task id.
    const [own, message] = tasksOf(sid);
    expect(message!.id).toBe(`${sid}:continued:2`);
    expect(message!.id).not.toBe(own!.id);
  });

  it('the task is stored when the run starts, so a process that dies during the pre-flight does not lose it', async () => {
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedSession([answer('second, done')], { preflightHold: () => (held ? gate : Promise.resolve()) });
    held = true;
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(shape(sid)).toEqual([['first', 'in_progress', undefined], ['second', 'in_progress', 1]]);
    held = false;
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
  });

  it('the Continue action delivers no message, so it appends no task', async () => {
    const { sessions, sid } = await restedSession([answer('resumed, done')]);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(shape(sid)).toEqual([['first', 'complete', undefined]]);
  });

  it('a resumed iteration that fails leaves the message pending, and the next continue\'s iteration takes it up', async () => {
    // No script remains for the resumed root: its turn fails, the iteration closes failed and the run ends.
    const h = sessionsWith([answer('first, done')]);
    const sid = (h.sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await h.sessions.running(sid)!;
    restIn(sid, 1);
    expect(h.sessions.prompt(sid, 'second').ok).toBe(true);
    await h.sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome])).toEqual([[1, 'failed']]);
    // Left pending, not requeued: no consecutive retry is counted against it.
    expect(tasksOf(sid).map((t) => [t.text, t.state, t.heldBy, t.consecutiveRetries])).toEqual([['first', 'abandoned', undefined, 0], ['second', 'pending', undefined, 0]]);
    h.client.push(answer('second, done'));
    h.client.push(answer('third, done'));
    expect(h.sessions.prompt(sid, 'third').ok).toBe(true);
    expect((await h.sessions.running(sid)!).status).toBe('completed');
    const message = tasksOf(sid)[1]!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.todo_task_id === message.id, r.outcome])).toEqual([[1, false, 'failed'], [2, true, 'succeeded'], [3, false, 'succeeded']]);
    expect(shape(sid).map(([text, state]) => [text, state])).toEqual([['first', 'abandoned'], ['second', 'complete'], ['third', 'complete']]);
  });

  it('a resumed iteration that raises closes failed and leaves the message pending', async () => {
    const { sessions, client, sid } = await restedSession([]);
    client.stream = () => { throw new Error('the model client raised'); };
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome])).toEqual([[1, 'failed']]);
    expect(shape(sid)).toEqual([['first', 'abandoned', undefined], ['second', 'pending', undefined]]);
  });

  it('a partial resumed iteration requeues its own task and leaves the message pending: the run takes both up, the message after', async () => {
    const { sessions, sid } = await restedSession([
      toolCalls([{ callId: 'p1', name: 'probe', args: {} }]), // one step, then the step belt ends the turn partial
      answer('first, again'), answer('second, done'),
    ], { config: { maxStepsPerTurn: 1 } });
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const [own, message] = tasksOf(sid);
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.todo_task_id === own!.id ? 'own' : r.todo_task_id === message!.id ? 'message' : '?', r.outcome])).toEqual([[1, 'own', 'partial'], [2, 'own', 'succeeded'], [3, 'message', 'succeeded']]);
    expect(shape(sid)).toEqual([['first', 'complete', undefined], ['second', 'complete', undefined]]);
  });

  it('the explicit cancel of the resumed iteration leaves the message pending', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedSession([{ parts: [{ hold }, ...answer('never').parts] }]);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled']]);
    expect(shape(sid)).toEqual([['first', 'pending', undefined], ['second', 'pending', undefined]]);
  });

  it('the explicit cancel during the continue\'s pre-flight closes the iteration it held, and leaves the message pending', async () => {
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedSession([], { preflightHold: () => (held ? gate : Promise.resolve()) });
    held = true;
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled']]);
    expect(shape(sid)).toEqual([['first', 'pending', undefined], ['second', 'pending', undefined]]);
  });

  it('a pause that finds nothing unfinished closes the resumed iteration cancelled, and the message with it, pending', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedSession([{ parts: [{ hold }, ...answer('second, answered').parts] }]);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled']]);
    expect(shape(sid)).toEqual([['first', 'pending', undefined], ['second', 'pending', undefined]]);
  });

  it('a rest keeps the message held; declined by "continue without them", it is left pending and taken up — never appended twice', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    // The resumed root's step is in flight when the pause lands; the call it asks for never runs, so the iteration rests again.
    const { sessions, sid } = await restedSession([{ parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'probe', args: {} }]).parts] }, answer('first, done again'), answer('second, done')]);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
    expect(shape(sid)).toEqual([['first', 'in_progress', undefined], ['second', 'in_progress', 1]]);

    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const [own, message] = tasksOf(sid);
    expect(tasksOf(sid)).toHaveLength(2);
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.todo_task_id === own!.id ? 'own' : r.todo_task_id === message!.id ? 'message' : '?', r.outcome])).toEqual([[1, 'own', 'cancelled'], [2, 'own', 'succeeded'], [3, 'message', 'succeeded']]);
    expect(shape(sid)).toEqual([['first', 'complete', undefined], ['second', 'complete', undefined]]);
  });

  it('a task held by an iteration that has closed — a process that died before the release was saved — goes back to pending at the next run', async () => {
    const h = sessionsWith([answer('first, done'), answer('LOST, done'), answer('next, done')]);
    const sid = (h.sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await h.sessions.running(sid)!;
    // The residue: iteration 1 closed, and the todo still shows a message it held in progress.
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = { ...stored.planner!, phases: [...stored.planner!.phases, { name: 'Continued Prompts', tasks: [{ id: `${sid}:continued:2`, text: 'LOST', state: 'in_progress' as const, consecutiveRetries: 0, heldBy: 1 }] }] };
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });
    expect(h.sessions.prompt(sid, 'next').ok).toBe(true);
    expect((await h.sessions.running(sid)!).status).toBe('completed');
    expect(shape(sid)).toEqual([['first', 'complete', undefined], ['LOST', 'complete', undefined], ['next', 'complete', undefined]]);
  });
});
