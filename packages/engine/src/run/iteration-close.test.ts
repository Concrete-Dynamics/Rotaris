import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type CheckpointPort } from '../index.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';

/**
 * The repair of `an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`. An iteration's close and
 * the todo its task was closed in commit in one transaction (`SessionWriter.endIteration`), so a run host that dies while
 * the iteration's checkpoint capture or its hooks are still running cannot leave the task `in_progress` with nothing open
 * to hold it (REQ-ORCH-072's in-progress means an iteration is working it; REQ-ORCH-069/073/074/135's closes never leave
 * it so). A store an earlier build left that way is settled when the next run is built, as the closed row says its
 * iteration closed. Driven end to end through the session manager.
 */
const HOST = mintMachineId('0000000000000000000000000000000f') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

describe('an iteration\'s own task closes with its iteration (REQ-ORCH-072, REQ-ORCH-073, REQ-ORCH-074, REQ-ORCH-135)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iteration-close-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /**
   * A checkpoint port whose capture of one iteration can be held until released — the window between an iteration's
   * close and the save that used to follow its capture and hooks, where a death stranded the task.
   */
  function capturePort() {
    let hold: { readonly at: number; readonly gate: Promise<void>; readonly entered: () => void } | null = null;
    const port: CheckpointPort = {
      enabled: true,
      capture: async ({ iteration }) => {
        const h = hold;
        if (h !== null && h.at === iteration) { hold = null; h.entered(); await h.gate; }
        return { outcome: 'nothing-to-record', invocations: 0, elapsedMs: 0 };
      },
    };
    const holdAt = (at: number) => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const reached = new Promise<void>((r) => { entered = r; });
      hold = { at, gate, entered };
      return { reached, release };
    };
    return { port, holdAt };
  }

  function sessionsWith(calls: ScriptedCall[], checkpoints?: CheckpointPort) {
    const client = new ScriptedModelClient(calls);
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 86, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-close-${++minted}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } },
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      ...(checkpoints ? { checkpoints: () => checkpoints } : {}),
    });
    return { sessions, client };
  }

  const tasksOf = (sid: SessionId) => decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
  const shape = (sid: SessionId) => tasksOf(sid).map((t) => [t.text, t.state, t.consecutiveRetries]);
  const worked = (sid: SessionId) => dal.iterationsOf(sid).map((r) => [r.iteration, tasksOf(sid).find((t) => t.id === r.todo_task_id)?.text, r.outcome]);

  for (const [how, calls, state] of [
    ['succeeds', [answer('first, done')], 'complete'],
    ['fails', [], 'abandoned'],
  ] as const) it(`an iteration that ${how}: its task is stored ${state} in the transaction that closes it, before its capture ends`, async () => {
    const capture = capturePort();
    const held = capture.holdAt(1);
    const { sessions } = sessionsWith([...calls], capture.port);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await held.reached;
    // The capture is still running: a death now leaves what the store holds.
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state])).toEqual([[1, 'closed']]);
    expect(shape(sid)).toEqual([['first', state, 0]]);
    held.release();
    await sessions.running(sid)!;
    expect(shape(sid)).toEqual([['first', state, 0]]);
  });

  it('"continue without them": the declined iteration\'s task is stored pending in the transaction that closes it, before its capture ends', async () => {
    const capture = capturePort();
    const { sessions } = sessionsWith([answer('first, done'), answer('first, done again')], capture.port);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    // The residue a rest leaves: iteration 1 open by a pause, its task in progress, the session paused.
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = 1").run(sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    planner.phases[0]!.tasks[0]!.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: 0, todo: encodeStoredTodo({ ...stored, planner }) });
    dal.setIterationInterruption(sid, 1, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);

    const decline = capture.holdAt(1);
    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
    await decline.reached;
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled']]);
    expect(shape(sid)).toEqual([['first', 'pending', 0]]);
    decline.release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(worked(sid)).toEqual([[1, 'first', 'cancelled'], [2, 'first', 'succeeded']]);
  });

  /**
   * The residue an earlier build's death between the close and the save left: iteration 1's row closed with `outcome`,
   * its task still in progress, nothing open, and the session at rest.
   */
  function stranded(sid: SessionId, outcome: string): void {
    dal.db.prepare('UPDATE iterations SET outcome = ? WHERE session_id = ? AND iteration = 1').run(outcome, sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    planner.phases[0]!.tasks[0]!.state = 'in_progress';
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
  }

  for (const [outcome, state, again] of [
    ['succeeded', 'complete', false],
    ['cancelled', 'complete', true],
    ['partial', 'complete', true],
    ['failed', 'abandoned', false],
    ['abandoned', 'abandoned', false],
  ] as const) it(`a task an earlier build's death left in progress after its iteration closed ${outcome} is settled as that close would have left it when the next run is built${again ? ', and worked again' : ', and never worked again'}`, async () => {
    const { sessions } = sessionsWith([answer('first, done'), ...(again ? [answer('first, done again')] : []), answer('next, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    stranded(sid, outcome);
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(worked(sid)).toEqual([[1, 'first', outcome], ...(again ? [[2, 'first', 'succeeded']] : []), [again ? 3 : 2, 'next', 'succeeded']]);
    // A partial close requeues it, which counts one consecutive retry (REQ-ORCH-077); a success resets the count.
    expect(shape(sid)).toEqual([['first', state, 0], ['next', 'complete', 0]]);
  });
});
