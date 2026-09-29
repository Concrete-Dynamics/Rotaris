import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type RuntimePosture } from '../index.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';

/**
 * The repair of `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`: the launch content is the base of every
 * iteration, and the todo task an iteration selected — when it is not the run's own and the launch content's request is
 * another — is sent after it as the task to work on (REQ-CHAT-040, REQ-ORCH-004 / REQ-ORCH-135). The three flows that
 * depend on the launch content reaching such an iteration keep it: plan approval (REQ-ORCH-154), improvement runs
 * (REQ-LIBRARY-059), and a continue after a pause (REQ-SESSION-115). Driven end to end through the session manager.
 */
const HOST = mintMachineId('0000000000000000000000000000000e') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const TASK = 'The task for this iteration is the task below, from the session\'s todo. Work on it now. What precedes it is what this run was launched with: read it as context, and leave any other work it asks for to its own task.';

describe('every iteration is sent its own task (REQ-CHAT-040, REQ-ORCH-004, REQ-ORCH-135)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iteration-task-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(calls: ScriptedCall[], mode: 'auto' | 'plan' = 'auto') {
    const client = new ScriptedModelClient(calls);
    const runtime: RuntimePosture = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: mode };
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 85, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-task-${++minted}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, runtime,
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
    });
    return { sessions, client };
  }

  /** The first user message of a request: what a fresh root is sent. */
  const firstUser = (r: ModelRequest): string => r.messages.find((m) => m.role === 'user')!.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
  const tasksOf = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
  const iterationTexts = (sid: SessionId) => dal.iterationsOf(sid).map((r) => [r.iteration, tasksOf(sid).find((t) => t.id === r.todo_task_id)?.text, r.outcome]);
  const tick = () => new Promise((r) => setTimeout(r, 10));

  it('REQ-CHAT-040: a prompt queued while the run is busy is sent to the iteration that takes it up, after the launch prompt; the launch prompt\'s own iteration is told nothing more', async () => {
    const { sessions, client } = sessionsWith([answer('first, done'), answer('queued, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first task') as { value: SessionId }).value;
    expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'then do this' } }).ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(iterationTexts(sid)).toEqual([[1, 'first task', 'succeeded'], [2, 'then do this', 'succeeded']]);
    const [one, two] = client.requests.map(firstUser);
    expect(one).toBe('first task');
    expect(two).toBe(`first task\n${TASK}\n\nthen do this`);
  });

  it('REQ-ORCH-135 with REQ-SESSION-115: a request a pause put back is sent to the iteration a later message\'s run takes it up in, after that run\'s handoff; the message\'s own iteration is told nothing more', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, client } = sessionsWith([{ parts: [{ hold }, ...answer('first, answered').parts] }, answer('first, done'), answer('second, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    // Nothing was unfinished, so iteration 1 closed cancelled and put its task back.
    expect(tasksOf(sid).map((t) => [t.text, t.state])).toEqual([['first', 'pending']]);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(iterationTexts(sid)).toEqual([[1, 'first', 'cancelled'], [2, 'first', 'succeeded'], [3, 'second', 'succeeded']]);
    const [two, three] = client.requests.slice(-2).map(firstUser);
    // The handoff stays the base: its latest request is the message, and the selected task follows it.
    expect(two).toMatch(/^This is a follow-up within an existing session\./);
    expect(two).toContain('Latest user request:\nsecond');
    expect(two!.endsWith(`\n${TASK}\n\nfirst`)).toBe(true);
    expect(three).toContain('Latest user request:\nsecond');
    expect(three).not.toContain(TASK);
  });

  it('REQ-ORCH-004: the Continue action that restates a request still pending takes that task up as the launch content\'s own request, and is told nothing more', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, client } = sessionsWith([{ parts: [{ hold }, ...answer('first, answered').parts] }, answer('first, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(iterationTexts(sid)).toEqual([[1, 'first', 'cancelled'], [2, 'first', 'succeeded']]);
    const last = firstUser(client.requests.at(-1)!);
    expect(last).toContain('Latest user request:\nfirst');
    expect(last).not.toContain(TASK);
  });

  it('REQ-LIBRARY-059: every iteration of an improvement run is sent the executor\'s instructions, and then the one proposal it took up', async () => {
    const launch = 'Execute only the approved improvement proposals in this run plan.\n\n## imp_1\nApply improvement imp_1: first\n\n## imp_2\nApply improvement imp_2: second';
    const { sessions, client } = sessionsWith([answer('Applied the first proposal.'), answer('Applied the second proposal.')]);
    const sid = (sessions.start(dal, 'C:/ws', launch, {
      runType: 'improvement_run',
      initialTodo: { schema_version: 1, phases: [{ name: 'improvement_run', tasks: [
        { id: 'imp_1', text: 'Apply improvement imp_1: first', state: 'pending', consecutiveRetries: 0 },
        { id: 'imp_2', text: 'Apply improvement imp_2: second', state: 'pending', consecutiveRetries: 0 },
      ] }] },
    }) as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const [one, two] = client.requests.map(firstUser);
    expect(one).toBe(`${launch}\n${TASK}\n\nApply improvement imp_1: first`);
    expect(two).toBe(`${launch}\n${TASK}\n\nApply improvement imp_2: second`);
  });

  it('REQ-ORCH-154: the approved plan reaches every iteration the approval releases — the gated request\'s told nothing more, a later task\'s told its own text after it', async () => {
    const { sessions, client } = sessionsWith([answer('Plan: change it, then the later thing.'), answer('changed'), answer('later, done')], 'plan');
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).execution_status).toBe('awaiting_plan_decision');
    // A second task the held run's todo carries beside the gated request.
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    (planner.phases[0]!.tasks as unknown[]).push({ id: `${sid}:main:later`, text: 'the later thing', state: 'pending', consecutiveRetries: 0 });
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });
    expect(sessions.planDecision(sid, 'approve')).toEqual({ ok: true, value: { relaunched: true, cycle: 1 } });
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(iterationTexts(sid)).toEqual([[1, 'change the thing', 'succeeded'], [2, 'the later thing', 'succeeded']]);
    const [gated, later] = client.requests.slice(-2).map(firstUser);
    for (const text of [gated!, later!]) expect(text).toContain('Approved plan:\nPlan: change it, then the later thing.');
    expect(gated).not.toContain(TASK);
    expect(later!.endsWith(`\n${TASK}\n\nthe later thing`)).toBe(true);
  });
});
