import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { IntentCategory } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type RunConfig, type RuntimePosture, type ToolPort } from '../index.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';

/**
 * PD-ORCH-003 revision 2: a continue that resumes an iteration a rest left open runs that iteration without holding it
 * at the plan gate, whatever the mode and the release; when the gate would hold the run — no release and the mode
 * `plan`, or the release re-armed — it holds before the first new iteration the run begins.
 */
const HOST = mintMachineId('0000000000000000000000000000000d') as MachineId;
const MODEL = { providerId: 'scripted', modelId: 'm', dialect: 'chat' as const };

describe('PD-ORCH-003 revision 2: a resumed iteration and the gate', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let n = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-plan-resume-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const preflightOf = (category: IntentCategory): Preflight => ({
    intent: { category, confidence: 1, reason: 'fixed by the test', fallback: false, carried_over: false },
    grant: 'none', route: category === 'question' ? 'answer' : 'work', resolvedPlaybooks: {}, playbookFor: () => '', budgetCell: null, warnings: [],
  });

  const probe: ToolPort = {
    specs: () => [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }],
    dispatch: async () => ({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }),
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };

  /** The session starts in `auto`; the test then chooses the mode later runs start in, as the run-start control would. */
  function sessionsWith(calls: ScriptedCall[], opts: { intent?: IntentCategory; mode?: 'auto' | 'plan'; config?: Partial<RunConfig> } = {}) {
    const client = new ScriptedModelClient(calls);
    // Mutable, so the test can choose the mode (and the limit) later runs start with, as the run-start control would.
    const runtime: { -readonly [K in keyof RuntimePosture]: RuntimePosture[K] } = {
      permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' },
      sessionLogLevel: 'WARNING', runStartMode: opts.mode ?? 'auto',
    };
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 83, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-pgr-${++n}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...opts.config } }, runtime,
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      ...(opts.intent ? { preflight: async () => preflightOf(opts.intent!) } : {}),
      ...(opts.config ? { tools: () => probe } : {}),
    });
    return { sessions, client, runtime };
  }

  const tasksOf = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
  const textOf = (r: ModelRequest): string => r.messages.flatMap((m) => [...m.content]).map((c) => (c.kind === 'text' ? c.text : '')).join('\n');

  /**
   * A session whose first run did `first`, left as a rest leaves it — iteration 1 open by a pause, its task in progress —
   * with a second task, `later`, still pending in its todo; the mode then set to `plan` with no release.
   */
  async function restedWithPending(calls: ScriptedCall[], opts: { intent?: IntentCategory; config?: Partial<RunConfig> } = {}) {
    const h = sessionsWith([answer('first, done'), ...calls], opts);
    const sid = (h.sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    expect((await h.sessions.running(sid)!).status).toBe('completed');
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = 1").run(sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    planner.phases[0]!.tasks[0]!.state = 'in_progress';
    (planner.phases[0]!.tasks as unknown[]).push({ id: `${sid}:main:later`, text: 'later', state: 'pending', consecutiveRetries: 0 });
    dal.updateSessionRun(sid, { iterations_completed: 0, todo: encodeStoredTodo({ ...stored, planner }) });
    dal.setIterationInterruption(sid, 1, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
    h.runtime.runStartMode = 'plan';
    return { ...h, sid };
  }

  for (const route of ['a message', 'the Continue action'] as const) it(`resumed by ${route}, the iteration runs unheld, and the run holds before its first new iteration`, async () => {
    // A root whose record ends on its own answer, resumed with nothing new said to it, takes no model step (OQ-70).
    const { sessions, client, sid } = await restedWithPending(route === 'a message' ? [answer('resumed, done'), answer('Plan: do later.')] : [answer('Plan: do later.')]);
    expect((route === 'a message' ? sessions.prompt(sid, 'go on') : sessions.continueSession(sid, 'continue')).ok).toBe(true);
    const result = await sessions.running(sid)!;
    expect(result.execution_status).toBe('awaiting_plan_decision');
    expect(result.stop_reason).toBe('');
    const row = dal.getSession(sid)!;
    expect(row).toMatchObject({ execution_status: 'awaiting_plan_decision', plan_cycle: 1, plan_released: 0 });
    expect(dal.planCycle(sid, 1)!.plan).toBe('Plan: do later.');
    // The resumed iteration closed as any does; no new iteration began before the hold.
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'succeeded']]);
    expect(dal.eventsOfKind(sid, 'iteration.start')).toHaveLength(1);
    // The resumed root was not told it was held; the plan cycle was, and was told what is pending — not the message.
    const planned = textOf(client.requests.at(-1)!);
    if (route === 'a message') expect(textOf(client.requests.at(-2)!)).not.toContain('held at the plan gate');
    expect(planned).toContain('held at the plan gate');
    expect(planned).toContain('This run resumed iteration 1');
    expect(planned).toContain('Pending tasks:\n- later');
    expect(planned).not.toContain('- go on');
    // PD-ORCH-005 clause 17: the message is said to be carried out only when the resumed iteration closed it done.
    if (route === 'a message') expect(planned).toContain('the resumed iteration has already carried out its message.');
    else expect(planned).toContain('The request that continued the session follows as context.\n');
    // No terminal result beyond the first run's: the hold is not a termination (REQ-ORCH-153).
    expect(dal.eventsOfKind(sid, 'result')).toHaveLength(1);
  });

  it('approved, the pending work runs and the continue\'s message is not run again — the relaunch appends no task', async () => {
    const { sessions, sid } = await restedWithPending([answer('resumed, done'), answer('Plan: do later.'), answer('later, done'), answer('spare')]);
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(tasksOf(sid).map((t) => [t.text, t.state])).toEqual([['first', 'complete'], ['later', 'complete'], ['go on', 'complete']]);
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.todo_task_id, r.outcome])).toEqual([[1, `${sid}:main:1`, 'succeeded'], [2, `${sid}:main:later`, 'succeeded']]);
  });

  it('a session that holds a release is not held after the resumed iteration either', async () => {
    const { sessions, sid } = await restedWithPending([answer('resumed, done'), answer('later, done')]);
    dal.db.prepare('UPDATE sessions SET plan_released = 1 WHERE session_id = ?').run(sid);
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.planCyclesOf(sid)).toEqual([]);
    expect(dal.iterationsOf(sid).map((r) => r.outcome)).toEqual(['succeeded', 'succeeded']);
  });

  it('in `auto` mode nothing holds', async () => {
    const { sessions, runtime, sid } = await restedWithPending([answer('resumed, done'), answer('later, done')]);
    runtime.runStartMode = 'auto';
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.planCyclesOf(sid)).toEqual([]);
    expect(dal.iterationsOf(sid)).toHaveLength(2);
  });

  it('a continue whose intent is in the answer group is not held (REQ-ORCH-021), as at the start of a run', async () => {
    const { sessions, sid } = await restedWithPending([answer('resumed, done'), answer('later, done')], { intent: 'question' });
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.planCyclesOf(sid)).toEqual([]);
  });

  it('PD-ORCH-005 clause 11 and 15: during the plan cycle after a resumed iteration a pause is refused, and a stop leaves no iteration open and records no interruption', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { sessions, sid } = await restedWithPending([answer('resumed, done'), { parts: [{ hold }, ...answer('Plan: do later.').parts] }]);
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    for (let i = 0; i < 100 && !sessions.run(sid)!.isPlanGateHeld; i++) await new Promise((r) => setTimeout(r, 5));
    expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome, r.interruption])).toEqual([[1, 'closed', 'succeeded', null]]);
    expect(dal.childrenOf(sid).filter((c) => c.interruption !== null)).toEqual([]);
    expect(dal.timelineOf(sid).filter((t) => t.name === 'iteration_paused')).toHaveLength(0);
  });

  it('the message limit reached as the resumed iteration closes wins over the gate (REQ-ORCH-085)', async () => {
    const { sessions, runtime, sid } = await restedWithPending([answer('resumed, done'), answer('never')]);
    runtime.messageLimit = 1;
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).execution_status).toBe('paused_message_limit');
    expect(dal.planCyclesOf(sid)).toEqual([]);
  });

  it('declined by "continue without them", the run is held before its first iteration, as a run that resumes nothing is', async () => {
    const { sessions, client, sid } = await restedWithPending([answer('Plan: first again.')]);
    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
    expect((await sessions.running(sid)!).execution_status).toBe('awaiting_plan_decision');
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome])).toEqual([[1, 'cancelled']]);
    expect(textOf(client.requests.at(-1)!)).not.toContain('This run resumed iteration');
  });

  it('the repair of a-plan-decision-appends-the-gated-prompt-as-a-second-task: an approved first prompt runs once', async () => {
    const { sessions, sid } = (() => { const h = sessionsWith([answer('a plan'), answer('carried out'), answer('spare')], { mode: 'plan' }); return { ...h, sid: (h.sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value }; })();
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(tasksOf(sid).map((t) => [t.text, t.state])).toEqual([['change the thing', 'complete']]);
    expect(dal.iterationsOf(sid)).toHaveLength(1);
  });

  it('after a partial resumed iteration the plan cycle is told the message is pending and taken up first — never that it was dealt with (PD-ORCH-005 clause 17)', async () => {
    const { sessions, client, sid } = await restedWithPending([
      toolCalls([{ callId: 'p1', name: 'probe', args: {} }]), // one step, then the step belt ends the resumed turn partial
      answer('Plan: go on, then first, then later.'),
    ], { config: { maxStepsPerTurn: 1 } });
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).execution_status).toBe('awaiting_plan_decision');
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome])).toEqual([[1, 'partial']]);
    const planned = textOf(client.requests.at(-1)!);
    expect(planned).toContain('Pending tasks:\n- go on\n- first\n- later\n');
    expect(planned).toContain('did not finish its message, which is among the pending tasks above and is taken up first.');
    expect(planned).not.toContain('already');
  });
});
