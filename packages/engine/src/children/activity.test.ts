import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import { AgentActivity } from './activity.js';
import { toAgentRecord } from '../sessions.js';

const clocks = {} as Parameters<typeof toAgentRecord>[1];
const row = (over: Partial<ChildRow> = {}): ChildRow => ({
  session_id: 's', task_id: 'bg_00000001', canonical_name: 'helper', given_name: 'Helper', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1,
  launch_generation: 0, model_key: 'scripted/alpha', category: 'quick', background: 1, task: 'do the thing', depends_on: '[]', inherited_context: '["a","b"]', granted_tools: '["read_file","grep"]', granted_mcp: '{}',
  todo: null, spawned_at: '2026-09-05T10:00:00.000Z', completed_at: null, report: null, report_stored: 0, observed: 0, context_injected: 0, tool_calls: 0, continuation_of: null, interruption: null, resume_state: null, write_scope: '[]', ...over,
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
  it('PD-ORCH-005 clause 13 (revision 4): a paused agent of a session at rest presents as `paused` with its interruption and its last activity, never settled to the run\'s outcome', () => {
    const atRest = { executionStatus: 'paused', updatedAt: '2026-09-05T10:09:00.000Z' };
    // A call a crash left `running` in the ring seeds an active chip; nothing runs for a paused agent, so it shows none.
    const activity = new AgentActivity();
    activity.started('helper', 'c1', 'terminal');
    const r = toAgentRecord(row({ state: 'paused', interruption: 'stop', resume_state: 'running', tool_calls: 4 }), clocks, { activity, session: atRest });
    expect(r).toMatchObject({ state: 'paused', presentationState: 'paused', interruption: 'stop', activity: 'do the thing', completedAt: null, live: false, toolCalls: 4, activeTools: [] });
    // Every session status presents it the same: the one it came to rest in, one a crash left, and one resumed but not yet reached.
    for (const executionStatus of ['stopped', 'interrupted', 'failed', 'running']) expect(toAgentRecord(row({ state: 'paused', interruption: 'pause' }), clocks, { session: { executionStatus, updatedAt: 'x' } })).toMatchObject({ presentationState: 'paused', live: false, activity: 'do the thing' });
    // Beside it, any other unfinished agent of a session at rest is still presented settled (REQ-MONITOR-211) — the
    // shape a killed host leaves until a repair or a continue records the crash — and only a paused agent carries an
    // interruption.
    expect(toAgentRecord(row({ state: 'running' }), clocks, { session: atRest })).toMatchObject({ state: 'cancelled', interruption: null });
    expect(toAgentRecord(row({ state: 'running', interruption: 'pause' }), clocks, { session: { executionStatus: 'running', updatedAt: 'x' } }).interruption).toBeNull();
  });
});

describe('toAgentRecord — PD-ORCH-005 clauses 13 and 18 (OQ-73): an agent a crash left, the crash not yet recorded', () => {
  it('presents as the crash record will leave it — `paused` by `crash`, its activity kept, no chip — where it would otherwise settle or show running', () => {
    const activity = new AgentActivity();
    activity.started('helper', 'c1', 'terminal');
    const crashLeft = new Set(['bg_00000001']);
    // `interrupted` by a repair that recorded no crash: without the fact it settles `cancelled` (REQ-MONITOR-211).
    const repaired = { executionStatus: 'interrupted', updatedAt: '2026-09-05T10:09:00.000Z' };
    expect(toAgentRecord(row({ state: 'running' }), clocks, { activity, session: repaired })).toMatchObject({ state: 'cancelled', presentationState: 'cancelled' });
    expect(toAgentRecord(row({ state: 'running' }), clocks, { activity, session: repaired, crashLeft })).toMatchObject({ state: 'paused', presentationState: 'paused', interruption: 'crash', activity: 'do the thing', completedAt: null, live: false, activeTools: [] });
    // REQ-CHAT-008's recovery state: the status still claims a run no process is behind.
    const recovery = { executionStatus: 'running', updatedAt: 'x' };
    expect(toAgentRecord(row({ state: 'queued' }), clocks, { session: recovery, crashLeft })).toMatchObject({ state: 'paused', presentationState: 'paused', interruption: 'crash', live: false });
    // Only the agents named: a terminal row, a row already paused and an agent of no open iteration present as before.
    expect(toAgentRecord(row({ state: 'succeeded', completed_at: 't' }), clocks, { session: repaired, crashLeft })).toMatchObject({ presentationState: 'done', interruption: null });
    expect(toAgentRecord(row({ state: 'paused', interruption: 'stop' }), clocks, { session: repaired, crashLeft })).toMatchObject({ presentationState: 'paused', interruption: 'stop' });
    expect(toAgentRecord(row({ task_id: 'bg_00000002', state: 'running' }), clocks, { session: repaired, crashLeft }).presentationState).toBe('cancelled');
  });
});
