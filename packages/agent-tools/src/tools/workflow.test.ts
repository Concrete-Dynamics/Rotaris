import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../workflow/journal.js';
import { WorkflowManager, workflowTool, type StoredWorkflow, type WorkflowOps, type WorkflowStore } from './workflow.js';
import type { DelegationPort } from './delegation.js';

/**
 * PD-ORCH-018 clause 8: a workflow survives a restart. The store is a plain object here, as the session's writer is to the
 * run host; a second manager built over the same store is the next process.
 */
function memoryStore() {
  const workflows = new Map<string, StoredWorkflow>();
  const journals = new Map<string, Map<number, JournalEntry>>();
  const store: WorkflowStore = {
    load: () => [...workflows.values()].map((workflow) => ({ workflow, journal: [...(journals.get(workflow.id)?.values() ?? [])].sort((a, b) => a.seq - b.seq) })),
    save: (w) => { workflows.set(w.id, w); },
    journal: (id) => ({
      append: (e) => { const j = journals.get(id) ?? new Map<number, JournalEntry>(); journals.set(id, j); j.set(e.seq, { ...e, ...(e.taskId === undefined && j.get(e.seq)?.taskId !== undefined ? { taskId: j.get(e.seq)!.taskId } : {}) }); },
      truncate: (seq) => { const j = journals.get(id); if (j) for (const k of [...j.keys()]) if (k >= seq) j.delete(k); },
    }),
  };
  return { store, workflows, journals };
}

/** A run's delegation operations: children end when the test says so, and a rest aborts every workflow. */
function fakeRun() {
  const delegated: string[] = [];
  const reports = new Map<string, string>();
  const waiters = new Map<string, () => void>();
  const notices: string[] = [];
  const acknowledged: string[] = [];
  let rest = new AbortController();
  let resting = false;
  const ops: DelegationPort & WorkflowOps = {
    delegate: async (_p, req) => { delegated.push(req.task); const taskId = `bg_${delegated.length}`; return { status: 'queued', canonicalName: req.taskName, taskId, message: 'started' }; },
    backgroundOutput: (_p, taskId) => (reports.has(taskId) ? { status: 'ok', state: 'succeeded', text: reports.get(taskId)! } : Number(taskId.slice(3)) <= delegated.length ? { status: 'still_running', state: 'running', text: '' } : { status: 'not_found', state: '', text: '' }),
    waitForTasks: (_p, ids) => new Promise((resolve) => {
      const id = ids[0]!;
      const done = () => resolve(resting ? { interrupted: 'the run came to rest' } : { immediate: false, requested: 1, text: reports.get(id) ?? '' });
      if (reports.has(id)) done(); else waiters.set(id, done);
    }),
    beginWorkflow: () => rest.signal,
    endWorkflow: (_p, _id, notice) => { notices.push(notice); },
    acknowledgeWorkflow: (_p, id) => { acknowledged.push(id); },
    claimForWorkflow: () => undefined,
  };
  return {
    ops, delegated, notices, acknowledged,
    end: (taskId: string, report: string) => { reports.set(taskId, report); waiters.get(taskId)?.(); waiters.delete(taskId); },
    /** The application ends, or the run is paused: every waiting call is released as interrupted and every script stopped. */
    comeToRest: () => { resting = true; rest.abort(); for (const [id, w] of [...waiters]) { waiters.delete(id); w(); } },
    /** The next process: the same children (the run's store keeps them), nothing resting. */
    restart: () => { resting = false; rest = new AbortController(); },
  };
}

const SCRIPT = `
  const first = await agent('step one');
  const [a, b] = await parallel([() => agent('step two a'), () => agent('step two b')]);
  return [first, a, b].join(' | ');`;
const settle = () => new Promise((r) => setTimeout(r, 15));
const managerOver = (run: ReturnType<typeof fakeRun>, store: WorkflowStore) => new WorkflowManager({
  delegation: run.ops, parentId: 'root', defaultPersona: 'coding-agent', now: () => performance.now(), store,
  dispatchTool: async () => ({ text: 'ok', isError: false }),
});

describe('a workflow across a restart (PD-ORCH-018 clause 8)', () => {
  it('cut off while two agents run, it is told once and continues from its journal: nothing reported is repeated, and the agents under way are waited for', async () => {
    const run = fakeRun();
    const { store, workflows, journals } = memoryStore();
    const first = managerOver(run, store);
    expect(first.start('steps', SCRIPT)).toMatchObject({ ok: true, id: 'wf_1', resumed: false });
    await settle();
    run.end('bg_1', 'ONE');
    await settle();
    expect(run.delegated).toEqual(['step one', 'step two a', 'step two b']);
    // The journal as the cut finds it: one answered call, two whose children are started and not waited out.
    expect([...journals.get('wf_1')!.values()].sort((x, y) => x.seq - y.seq).map((e) => [e.seq, e.taskId, e.outcome?.ok])).toEqual([[0, 'bg_1', true], [1, 'bg_2', undefined], [2, 'bg_3', undefined]]);
    run.comeToRest();
    await settle();
    expect(workflows.get('wf_1')).toMatchObject({ state: 'interrupted', notified: false, agentsStarted: 3, agentsEnded: 1 });

    // The next process. The agent's new port loads the store and tells it, once.
    run.restart();
    const before = run.notices.length;
    const second = managerOver(run, store);
    expect(second.announceInterrupted()).toBe(1);
    expect(run.notices.slice(before)).toHaveLength(1);
    expect(run.notices.at(-1)).toContain('Workflow steps (wf_1) was interrupted');
    expect(run.notices.at(-1)).toContain('start the same script again');
    expect(managerOver(run, store).announceInterrupted()).toBe(0);

    // Started again, the very same script continues under its own id.
    expect(second.start('whatever name', SCRIPT)).toMatchObject({ ok: true, id: 'wf_1', resumed: true });
    await settle();
    expect(run.delegated).toEqual(['step one', 'step two a', 'step two b']);
    run.end('bg_2', 'TWO-A');
    run.end('bg_3', 'TWO-B');
    await settle();
    expect(workflows.get('wf_1')).toMatchObject({ state: 'completed', result: '"ONE | TWO-A | TWO-B"', notified: true, agentsStarted: 3, agentsEnded: 3 });
    expect(run.notices.at(-1)).toContain('Workflow steps (wf_1) completed: 3 of 3 agents ended');
    expect(run.delegated).toHaveLength(3);
  });

  it('a different script starts a new workflow and leaves the interrupted one as it is', async () => {
    const run = fakeRun();
    const { store, workflows } = memoryStore();
    const first = managerOver(run, store);
    first.start('steps', SCRIPT);
    await settle();
    run.comeToRest();
    await settle();
    run.restart();
    const second = managerOver(run, store);
    expect(second.start('other', `return 'done';`)).toMatchObject({ ok: true, id: 'wf_2', resumed: false });
    await settle();
    expect(workflows.get('wf_2')).toMatchObject({ state: 'completed' });
    expect(workflows.get('wf_1')).toMatchObject({ state: 'interrupted' });
  });

  it('a workflow the store still calls running was cut off with its process: the next manager reads it as interrupted', () => {
    const run = fakeRun();
    const { store, workflows } = memoryStore();
    store.save({ id: 'wf_3', name: 'crashed', script: 'return 1;', state: 'running', phase: 'Build', agentsStarted: 2, agentsEnded: 1, calls: 4, result: '', notified: false });
    const m = managerOver(run, store);
    expect(workflows.get('wf_3')).toMatchObject({ state: 'interrupted' });
    expect(m.snapshots()).toMatchObject([{ id: 'wf_3', state: 'interrupted', phase: 'Build' }]);
    // Ids go on from the highest the store holds.
    expect(m.start('next', `return 2;`)).toMatchObject({ id: 'wf_4' });
  });

  it('an agent that reads an interrupted workflow by status has been told, and is not told again by the next port', async () => {
    const run = fakeRun();
    const { store, workflows } = memoryStore();
    store.save({ id: 'wf_1', name: 'crashed', script: 'return 1;', state: 'running', phase: '', agentsStarted: 0, agentsEnded: 0, calls: 0, result: '', notified: false });
    const m = managerOver(run, store);
    const status = await workflowTool(m).execute({ action: 'status' }, {} as never);
    expect(status.text).toContain('state: interrupted');
    expect(status.text).toContain('start the same script again');
    expect(workflows.get('wf_1')).toMatchObject({ notified: true });
    expect(managerOver(run, store).announceInterrupted()).toBe(0);
  });
});
