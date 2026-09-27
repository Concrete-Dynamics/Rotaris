import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { AgentActivity } from './activity.js';
import { toAgentRecord } from '../sessions.js';

const clocks = {} as Parameters<typeof toAgentRecord>[1];
const row = (over: Partial<ChildRow> = {}): ChildRow => ({
  session_id: 's', task_id: 'bg_00000001', canonical_name: 'helper', given_name: 'Helper', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1,
  launch_generation: 0, model_key: 'scripted/alpha', category: 'quick', background: 1, task: 'do the thing', depends_on: '[]', inherited_context: '["a","b"]', granted_tools: '["read_file","grep"]', granted_mcp: '{}',
  todo: null, spawned_at: '2026-09-05T10:00:00.000Z', completed_at: null, report: null, report_stored: 0, observed: 0, context_injected: 0, tool_calls: 0, continuation_of: null, ...over,
});

describe('AgentActivity — REQ-MONITOR-044/049/060 kept incrementally (Part R)', () => {
  it('records called tools in first-call order, active calls by id, the count, and the latest prompt reading', () => {
    const a = new AgentActivity();
    a.started('helper', 'c1', 'grep');
    a.started('helper', 'c2', 'read_file');
    a.started('helper', 'c3', 'grep');
    expect(a.calledTools('helper')).toEqual(['grep', 'read_file']);
    expect(a.activeTools('helper')).toEqual(['grep', 'read_file']);
    expect(a.callCount('helper')).toBe(3);
    a.settled('helper', 'c1');
    a.settled('helper', 'c2');
    expect(a.activeTools('helper')).toEqual(['grep']);
    // REQ-MONITOR-062: the called order is unchanged by a state-only change.
    expect(a.calledTools('helper')).toEqual(['grep', 'read_file']);
    a.usage('helper', 1200);
    a.usage('helper', 900);
    expect(a.contextUsed('helper')).toBe(900);
    a.usage('helper', -1);
    expect(a.contextUsed('helper')).toBe(900);
    a.clearActive('helper');
    expect(a.activeTools('helper')).toEqual([]);
    expect(a.calledTools('other')).toEqual([]);
  });
  it('seeds once from the ring: settled rows are called only, a row still running is active', () => {
    const a = new AgentActivity();
    a.seed([{ agent_name: 'x', call_id: '1', tool_name: 'glob', status: 'ok' }, { agent_name: 'x', call_id: '2', tool_name: 'terminal', status: 'running' }]);
    expect(a.calledTools('x')).toEqual(['glob', 'terminal']);
    expect(a.activeTools('x')).toEqual(['terminal']);
    expect(a.callCount('x')).toBe(2);
  });
});

describe('toAgentRecord — the new fields of REQ-MONITOR-044 (Part R)', () => {
  it('projects the tracker, the persona reasoning, the default limit, the grant and the inherited context', () => {
    const activity = new AgentActivity();
    activity.started('helper', 'c1', 'grep');
    activity.usage('helper', 4321);
    const r = toAgentRecord(row(), clocks, { activity, reasoningFor: (p) => (p === 'coding-agent' ? 'high' : null) });
    expect(r).toMatchObject({ reasoning: 'high', contextUsed: 4321, contextLimit: DEFAULT_CONTEXT_CAPACITY, grantedTools: ['read_file', 'grep'], calledTools: ['grep'], activeTools: ['grep'], delegationSessionId: null, inheritedContext: 'a\nb', toolCalls: 1 });
    expect(toAgentRecord(row(), clocks).reasoning).toBe('medium');
    expect(toAgentRecord(row({ model_key: 'k' }), clocks, { contextLimitFor: (k) => (k === 'k' ? 200_000 : null) }).contextLimit).toBe(200_000);
  });
  it('a settled agent carries no active tool whatever the ring holds (REQ-MONITOR-211/213), and the count is the larger figure', () => {
    const activity = new AgentActivity();
    activity.started('helper', 'c1', 'grep');
    const r = toAgentRecord(row({ state: 'succeeded', completed_at: '2026-09-05T10:01:00.000Z', tool_calls: 5 }), clocks, { activity });
    expect(r.activeTools).toEqual([]);
    expect(r.calledTools).toEqual(['grep']);
    expect(r.toolCalls).toBe(5);
    expect(r.live).toBe(false);
  });
  it('REQ-MONITOR-211/213: a non-terminal child of an ended session is PRESENTED settled to the run outcome, activity replaced, chips cleared; a live or idle session leaves it', () => {
    const activity = new AgentActivity();
    activity.started('helper', 'c1', 'grep');
    const ended = { executionStatus: 'completed', updatedAt: '2026-09-05T10:09:00.000Z' };
    const r = toAgentRecord(row({ state: 'running' }), clocks, { activity, session: ended });
    expect(r).toMatchObject({ state: 'succeeded', presentationState: 'done', live: false, activity: 'Ended with the run.', activeTools: [], completedAt: '2026-09-05T10:09:00.000Z' });
    expect(toAgentRecord(row({ state: 'queued' }), clocks, { session: { executionStatus: 'failed', updatedAt: 'x' } }).presentationState).toBe('failed');
    expect(toAgentRecord(row({ state: 'waiting_on_model_slot' }), clocks, { session: { executionStatus: 'paused', updatedAt: 'x' } }).presentationState).toBe('cancelled');
    expect(toAgentRecord(row({ state: 'running' }), clocks, { activity, session: { executionStatus: 'running', updatedAt: 'x' } })).toMatchObject({ presentationState: 'running', activeTools: ['grep'] });
    expect(toAgentRecord(row({ state: 'running' }), clocks, { session: { executionStatus: 'idle', updatedAt: 'x' } }).presentationState).toBe('running');
    expect(toAgentRecord(row({ state: 'succeeded', completed_at: 't' }), clocks, { session: ended }).completedAt).toBe('t');
  });
});
