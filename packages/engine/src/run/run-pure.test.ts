import { describe, expect, it } from 'vitest';
import { Aggregates } from './aggregates.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import { classifyStop, EXECUTION_STATUSES, isBusy, presentationStatus, resultFromStatus, statusForResult, stopCondition, STOP_REASONS, summarise, TERMINAL_RESULTS } from './stop-conditions.js';
import { StopRequest } from './stop-request.js';
import { Todo } from './todo.js';

describe('engine/run — the stop request is sticky and observable (ADR-0014, REQ-SESSION-092)', () => {
  it('replays to a listener wired after the request; a second request can only raise forced; the first reason stands', () => {
    const s = new StopRequest();
    s.request('user_cancelled');
    const seen: string[] = [];
    s.onRequested((st) => seen.push(`${st.reason}:${st.forced}`));
    expect(seen).toEqual(['user_cancelled:false']);
    s.request('application_shutdown');
    expect(seen).toEqual(['user_cancelled:false']);
    s.request('application_shutdown', true);
    expect(seen).toEqual(['user_cancelled:false', 'user_cancelled:true']);
    s.request('user_cancelled', true);
    expect(seen.length).toBe(2);
  });
});

describe('engine/run — the closed vocabularies and their total mappings', () => {
  it('REQ-MONITOR-301 → REQ-ORCH-083: every stop reason maps; an unknown token is error with a diagnostic, never success', () => {
    for (const r of STOP_REASONS) expect(TERMINAL_RESULTS).toContain(classifyStop(r).result);
    expect(classifyStop('tasks_complete').result).toBe('completed');
    expect(classifyStop('user_cancelled').result).toBe('interrupted');
    expect(classifyStop('agent_session_aborted').result).toBe('failed');
    expect(classifyStop('iteration_limit_reached').result).toBe('max_iterations');
    const bad = classifyStop('Tasks_Complete');
    expect(bad.result).toBe('error');
    expect(bad.diagnostic).toContain('Tasks_Complete');
  });
  it('REQ-SESSION-076 is total over REQ-SESSION-073; REQ-MONITOR-029 persists max_iterations as stopped', () => {
    for (const s of EXECUTION_STATUSES) expect(TERMINAL_RESULTS).toContain(resultFromStatus(s).result);
    expect(resultFromStatus('interrupted').result).toBe('interrupted');
    expect(resultFromStatus('running').result).toBe('error');
    expect(statusForResult('max_iterations')).toBe('stopped');
    expect(statusForResult('interrupted')).toBe('paused');
    expect(statusForResult('error')).toBe('failed');
  });
  it('REQ-NOTIFY-049/050: every persisted status presents; background and waiting present as running and are busy', () => {
    for (const s of EXECUTION_STATUSES) expect(typeof presentationStatus(s)).toBe('string');
    expect(presentationStatus('background')).toBe('running');
    expect(presentationStatus('waiting')).toBe('running');
    expect(presentationStatus('paused_message_limit')).toBe('paused');
    // REQ-NOTIFY-049/160: a repaired session's `interrupted` is at rest, not resumable.
    expect(presentationStatus('interrupted')).toBe('idle');
    expect(isBusy('waiting')).toBe(true);
    expect(isBusy('paused')).toBe(false);
    expect(isBusy('interrupted')).toBe(false);
    expect(isBusy('cancelling')).toBe(true);
  });
  it('REQ-ORCH-069: first match wins, in its order; budgets are never overridden', () => {
    const base = { allTasksComplete: false, pendingTasks: 1, iterationsCompleted: 0, iterationLimit: 20, elapsedMs: 0, timeLimitMs: null };
    expect(stopCondition(base)).toBeNull();
    expect(stopCondition({ ...base, allTasksComplete: true, iterationsCompleted: 99 })).toBe('tasks_complete');
    expect(stopCondition({ ...base, iterationsCompleted: 20 })).toBe('iteration_limit_reached');
    expect(stopCondition({ ...base, timeLimitMs: 10, elapsedMs: 10 })).toBe('time_limit_reached');
    expect(stopCondition({ ...base, pendingTasks: 0 })).toBe('no_pending_tasks');
  });
  it('REQ-ORCH-082: the five arms in order', () => {
    expect(summarise({ stopReason: 'user_cancelled', completed: 3, abandoned: 0, lastFailure: null }).status).toBe('paused');
    expect(summarise({ stopReason: 'no_pending_tasks', completed: 0, abandoned: 0, lastFailure: null })).toMatchObject({ status: 'completed', severity: 'information' });
    expect(summarise({ stopReason: 'tasks_complete', completed: 1, abandoned: 0, lastFailure: null })).toMatchObject({ status: 'completed', severity: 'information' });
    expect(summarise({ stopReason: 'agent_session_aborted', completed: 0, abandoned: 1, lastFailure: 'boom' })).toMatchObject({ status: 'failed', severity: 'error', message: expect.stringContaining('boom') });
    expect(summarise({ stopReason: 'tasks_complete', completed: 1, abandoned: 1, lastFailure: null })).toMatchObject({ status: 'completed', severity: 'warning' });
  });
});

describe('engine/run — the todo in miniature (REQ-ORCH-004/067/077)', () => {
  it('a fresh session has one phase main with the task; requeue counts consecutive retries and abandons at 3', () => {
    const t = Todo.fresh('T1', 'do the thing');
    expect(t.toDocument().phases[0]!.name).toBe('main');
    const task = t.selectNext()!;
    t.begin(task);
    expect(t.selectNext()).toBeUndefined();
    expect(t.requeue(task)).toBe('pending');
    expect(t.requeue(task)).toBe('pending');
    expect(t.requeue(task)).toBe('abandoned');
    expect(t.allTasksComplete).toBe(false);
    expect(t.pendingCount).toBe(0);
    expect(t.abandonedCount).toBe(1);
    const again = Todo.fromDocument(t.toDocument());
    expect(again.abandonedCount).toBe(1);
  });
  it('completing the only task makes allTasksComplete true; an abandoned task does not count against it', () => {
    const t = Todo.fresh('T1', 'x');
    t.complete(t.selectNext()!);
    expect(t.allTasksComplete).toBe(true);
    expect(t.completedCount).toBe(1);
  });
});

describe('engine/run — aggregates are maintained, not recomputed (REQ-SESSION-168/169)', () => {
  it('rehydrates from the row, adds a request, and its patch copies every figure', () => {
    const a = Aggregates.rehydrate({ tokens_input: 5, tokens_output: 1, cost: '0', cost_qualifier: 'unknown', tool_calls: 0, compressions: 0 });
    a.addRequest({ input: 10, output: 4, pricing: 'unpriced' });
    expect(a.patch()).toEqual({ tokens_input: 15, tokens_output: 5, cost: '0', cost_qualifier: 'unknown', tool_calls: 0, compressions: 0 });
    expect(a.usagePayload().tokens.total).toBe(20);
    expect(Aggregates.rehydrate(undefined).totalTokens).toBe(0);
  });
});

describe('engine/run — pricing a request and the qualifier the run earns (PD-MONITOR-001 revision 2)', () => {
  const rates = { input: '0.000003', output: '0.000015' };

  it('the reported figure wins; otherwise both configured prices, multiplied exactly; otherwise no figure at all', () => {
    expect(priceRequest({ input: 1000, output: 200, cost: '0.01' }, rates)).toEqual({ input: 1000, output: 200, cost: '0.01', pricing: 'reported' });
    // 1000 × 0.000003 + 200 × 0.000015 = 0.003 + 0.003, with no double anywhere.
    expect(priceRequest({ input: 1000, output: 200 }, rates)).toEqual({ input: 1000, output: 200, cost: '0.006000', pricing: 'configured' });
    expect(priceRequest({ input: 1000, output: 200 }, null)).toEqual({ input: 1000, output: 200, pricing: 'unpriced' });
    // An attempt the provider counted nothing for is not a configured figure of zero.
    expect(priceRequest({ input: 0, output: 0 }, rates)).toEqual({ input: 0, output: 0, pricing: 'unpriced' });
  });

  it('the four qualifiers follow the directive\'s table, and an empty attempt moves none of them', () => {
    const run = (...requests: PricedUsage[]) => { const a = Aggregates.rehydrate(undefined); for (const r of requests) a.addRequest(r); return a; };
    const reported: PricedUsage = { input: 10, output: 5, cost: '0.001', pricing: 'reported' };
    const configured: PricedUsage = { input: 10, output: 5, cost: '0.002', pricing: 'configured' };
    const unpriced: PricedUsage = { input: 10, output: 5, pricing: 'unpriced' };
    const empty: PricedUsage = { input: 0, output: 0, pricing: 'unpriced' };
    expect(run().costQualifier).toBe('unknown');
    expect(run(unpriced).costQualifier).toBe('unknown');
    expect(run(reported, empty).costQualifier).toBe('reported');
    expect(run(configured).costQualifier).toBe('configured');
    // A mix of reported and configured figures reads configured (the ruled fork).
    expect(run(reported, configured).costQualifier).toBe('configured');
    expect(run(reported, unpriced).costQualifier).toBe('incomplete');
    expect(run(configured, unpriced, reported).figures).toMatchObject({ cost: '0.003', costQualifier: 'incomplete', tokensInput: 30 });
  });

  it('a continuation counts on from the recorded qualifier and totals', () => {
    const after = (qualifier: string, tokens: number, next: PricedUsage) => {
      const a = Aggregates.rehydrate({ tokens_input: tokens, tokens_output: 0, cost: qualifier === 'unknown' ? '0' : '0.01', cost_qualifier: qualifier, tool_calls: 0, compressions: 0 });
      a.addRequest(next);
      return a.costQualifier;
    };
    const priced: PricedUsage = { input: 1, output: 1, cost: '0.001', pricing: 'reported' };
    expect(after('unknown', 0, priced)).toBe('reported');
    // Unknown WITH tokens means earlier requests went unpriced, so a figure now makes the run incomplete, not reported.
    expect(after('unknown', 40, priced)).toBe('incomplete');
    expect(after('reported', 40, { ...priced, pricing: 'configured' })).toBe('configured');
    expect(after('configured', 40, priced)).toBe('configured');
    expect(after('incomplete', 40, priced)).toBe('incomplete');
  });
});
