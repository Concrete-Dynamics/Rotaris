import { describe, expect, it } from 'vitest';
import { Aggregates } from './aggregates.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import { classifyStop, EXECUTION_STATUSES, isBusy, openPlanIds, openPlanItems, planCarryText, planNotDoneSummary, presentationStatus, resultFromStatus, statusForResult, stopCondition, STOP_REASONS, summarise, TERMINAL_RESULTS } from './stop-conditions.js';
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
  /*
   * REQ-ORCH-082 rule 1 (the repair of `a-paused-runs-notice-says-a-person-stopped-it.md`, R-067): a pause, a stop and
   * the explicit cancel all record `user_cancelled` (PD-ORCH-005 clause 21), so the one message they share conveys that
   * a person brought the run to rest and names none of those rests — it said "a person stopped it", which a paused
   * session's notice then contradicted beside its own "Run paused" row. It bakes in no persisted status either: the
   * token is this summary's own (REQ-SESSION-074), whatever status the rest persists.
   */
  it('REQ-ORCH-082 rule 1: every rest a person asked for gets one message, which names no pause, stop or cancel', () => {
    const rest = summarise({ stopReason: 'user_cancelled', completed: 0, abandoned: 0, lastFailure: null });
    expect(rest).toEqual({ status: 'paused', severity: 'warning', message: "The run came to rest at the user's request." });
    expect(rest.message).not.toMatch(/stop|paus|cancel|interrupt/i);
    // Rule 1 reads the stop reason alone: the counts and the failure change nothing.
    expect(summarise({ stopReason: 'user_cancelled', completed: 2, abandoned: 1, lastFailure: 'boom' })).toEqual(rest);
  });
});

describe('engine/run — the coordinator\'s own plan and the run\'s completion (REQ-ORCH-029, live-run finding G5)', () => {
  const plan = (...states: string[]) => ({ phases: [{ tasks: states.slice(0, 2).map((state, i) => ({ id: `a${i}`, name: `a${i}`, state })) }, { tasks: states.slice(2).map((state, i) => ({ id: `b${i}`, name: `b${i}`, state })) }] });
  it('PENDING, IN_PROGRESS and a state outside REQ-TOOLS-144\'s vocabulary are open; COMPLETED and ABANDONED are terminal; in plan order', () => {
    expect(openPlanItems(plan('COMPLETED', 'PENDING', 'IN_PROGRESS', 'ABANDONED', 'BLOCKED'))).toEqual(['a1', 'b0', 'b2']);
    expect(openPlanItems(plan('COMPLETED', 'ABANDONED'))).toEqual([]);
    expect(openPlanItems(null)).toEqual([]);
  });
  it('OQ-203: what a task\'s first take-up found open is excused by id; the ids it found open are the open items\' ids', () => {
    const before = plan('COMPLETED', 'IN_PROGRESS');
    expect([...openPlanIds(before)]).toEqual(['a1']);
    expect(openPlanIds(null).size).toBe(0);
    expect(openPlanItems(plan('COMPLETED', 'IN_PROGRESS', 'PENDING'), openPlanIds(before))).toEqual(['b0']);
    expect(openPlanItems(plan('COMPLETED', 'IN_PROGRESS', 'COMPLETED'), openPlanIds(before))).toEqual([]);
  });
  it('REQ-ORCH-075\'s continuation marker counts the open items, names up to the first five, and says to continue from the plan', () => {
    const one = planCarryText(['Report each command\'s outcome in one line']);
    expect(one).toBe('The previous iteration on this task declared success with 1 item of your plan not complete, so the task is not complete:\n- Report each command\'s outcome in one line\nContinue from your plan, and do not end your turn until every remaining item is complete or recorded in its true state.');
    const seven = planCarryText(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']);
    expect(seven).toContain('with 7 items of your plan');
    expect(seven).toContain('- i5\n(and 2 more)');
    expect(seven).not.toContain('- i6');
  });
  it('the iteration summary counts and names the open items', () => {
    expect(planNotDoneSummary(['Report each command\'s outcome in one line'])).toBe('the coordinator answered with 1 item of its plan not done: Report each command\'s outcome in one line');
    expect(planNotDoneSummary(['x', 'y'])).toBe('the coordinator answered with 2 items of its plan not done: x; y');
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
