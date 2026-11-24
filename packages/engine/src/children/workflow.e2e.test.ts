import { describe, expect, it } from 'vitest';
import type { SessionId } from '@rotaris/kernel';
import { answer, toolCalls, type ModelRequest } from '@rotaris/model';
import { dal, sessionsWith, children, useIterationStore, type TestTool } from './children.test-support.js';

/**
 * PD-ORCH-019 clause 7 against the run: a parent that started a workflow is held by its resume loop while the workflow
 * runs, is not sent a report for each child the workflow claimed, and is resumed with the workflow's ending.
 */
describe('a workflow a parent started, end to end against the run (PD-ORCH-019 clauses 6 and 7)', () => {
  useIterationStore();

  const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');

  /** A stand-in for the workflow tool: it starts `agents` children one after another through the port's own operations. */
  const workflowStandIn = (agents: number, over: { acknowledge?: boolean } = {}): TestTool => (name, args, ctx) => {
    if (name !== 'workflow') return undefined;
    const ops = ctx.delegation!;
    const parent = ctx.parentId ?? 'root';
    ops.beginWorkflow(parent, 'wf_1');
    void (async () => {
      for (let i = 1; i <= agents; i += 1) {
        const started = await ops.delegate(parent, { persona: 'coder', taskName: `step-${i}`, task: `TASK: step ${i}`, dependsOn: [], inheritedContext: [], category: '', runInBackground: true, attachArtifacts: [], writeScope: [] });
        if (started.status === 'rejected') throw new Error(started.message);
        ops.claimForWorkflow(parent, started.taskId);
        await ops.waitForTasks(parent, [started.taskId]);
      }
      ops.endWorkflow(parent, 'wf_1', 'Workflow steps (wf_1) completed: both agents ended.');
      if (over.acknowledge === true) ops.acknowledgeWorkflow(parent, 'wf_1');
    })();
    return Promise.resolve({ text: 'Workflow steps started in the background as wf_1.', isError: false, status: 'ok' as const, durationMs: 1, label: name, args });
  };

  it('the parent waits through a workflow whose children run one after another, and its next message is the ending alone', async () => {
    const requests: string[] = [];
    const { sessions, counts } = sessionsWith((persona, turn, req) => {
      if (persona === 'orchestrator') {
        requests.push(textOf(req));
        return turn === 1 ? toolCalls([{ callId: 'wf', name: 'workflow', args: { action: 'start' } }]) : turn === 2 ? answer('The workflow is running.') : answer('Both steps are done.');
      }
      if (persona === 'summariser') return answer('{"summary":"Did the step."}');
      return answer('step done');
    }, { tool: workflowStandIn(2) });
    const sid = (sessions.start(dal, 'C:/ws', 'run the workflow') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // Between the first child's end and the second's start the parent has no child pending: only the workflow holds it.
    expect(children(sid).map((c) => [c.canonical_name, c.state, c.observed])).toEqual([['step-1', 'succeeded', 1], ['step-2', 'succeeded', 1]]);
    expect(counts.get('orchestrator')).toBe(3);
    expect(requests[2]).toContain('Workflow steps (wf_1) completed: both agents ended.');
    // No per-child report reached the parent: the workflow claimed its children.
    expect(requests[2]).not.toContain('step done');
  });

  it('an ending the parent already read is not sent again, and the parent is not held for it', async () => {
    const { sessions, counts } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'wf', name: 'workflow', args: { action: 'start' } }]) : answer('Done.');
      if (persona === 'summariser') return answer('{"summary":"Did the step."}');
      return answer('step done');
    }, { tool: workflowStandIn(1, { acknowledge: true }) });
    const sid = (sessions.start(dal, 'C:/ws', 'run the workflow') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(counts.get('orchestrator')).toBe(2);
  });
});
