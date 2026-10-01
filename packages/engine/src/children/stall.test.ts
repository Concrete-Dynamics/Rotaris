import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { modelError } from '@rotaris/model';
import { correctiveInstruction, FIXED_CORRECTIVE_INSTRUCTION, hadCorrectiveMessage, stallCadence, stallRecoveryDue, stallRepeat, StallWatch, stallWarning, type StallRecoveryInput, type StallReport } from './stall.js';

function watched(thresholdMs: number) {
  const clock = new FakeClock();
  const stalled: StallReport[] = [];
  const waiting: { silentS: number; activeCalls: number }[] = [];
  const evaluated: boolean[] = [];
  let recovered = 0;
  const watch = new StallWatch(clock, millis(thresholdMs), {
    stalled: (r) => stalled.push(r), waiting: (w) => waiting.push(w), recovered: () => { recovered += 1; }, evaluated: (s) => evaluated.push(s),
  });
  return { clock, watch, stalled, waiting, evaluated, recovered: () => recovered };
}

describe('REQ-ORCH-089 / REQ-MONITOR-117..120: the stall watch', () => {
  it('REQ-MONITOR-117: evaluates every sixth of the threshold, never under 1 s or over 5 s; REQ-MONITOR-120: repeats no sooner than the threshold or 30 s', () => {
    expect([stallCadence(90_000), stallCadence(12_000), stallCadence(3_000)]).toEqual([5_000, 2_000, 1_000]);
    expect([stallRepeat(90_000), stallRepeat(10_000)]).toEqual([90_000, 30_000]);
  });

  it('REQ-MONITOR-119/120: every stall evaluation reports the stall and fires the callback; only the warning waits for the throttle', () => {
    const w = watched(90_000);
    w.watch.start();
    w.watch.toolStarted('c1', 'read_file'); w.watch.toolCompleted('c1');
    w.watch.modelEvent('usage');
    w.clock.advance(85_000);
    expect(w.stalled).toEqual([]);
    expect(w.evaluated).toHaveLength(17);
    expect(w.evaluated.every((s) => !s)).toBe(true);
    w.clock.advance(5_000);
    expect(w.stalled).toEqual([{ silentS: 90, entry: true, warn: true, activeTools: [], recentCalls: ['read_file'], lastModelEvent: 'usage' }]);
    expect(w.evaluated.at(-1)).toBe(true);
    // Every evaluation reports the stall (its issue) and calls back; the warning waits for max(90 s, 30 s).
    w.clock.advance(85_000);
    expect(w.stalled).toHaveLength(18);
    expect(w.stalled.slice(1).map((r) => [r.silentS, r.entry, r.warn])).toEqual(Array.from({ length: 17 }, (_, i) => [95 + i * 5, false, false]));
    expect(w.evaluated.slice(-17).every((s) => s)).toBe(true);
    w.clock.advance(5_000);
    expect(w.stalled).toHaveLength(19);
    expect(w.stalled.filter((r) => r.warn).map((r) => [r.silentS, r.entry])).toEqual([[90, true], [180, false]]);
    // One report per stalled evaluation, no more and no fewer.
    expect(w.stalled).toHaveLength(w.evaluated.filter((s) => s).length);
  });

  it('a model event ends the stall: the recovery is reported at the next evaluation and the callback reads not stalled', () => {
    const w = watched(12_000);
    w.watch.start();
    w.clock.advance(12_000);
    expect(w.stalled).toHaveLength(1);
    w.watch.modelEvent('text');
    w.clock.advance(2_000);
    expect(w.recovered()).toBe(1);
    expect(w.evaluated.at(-1)).toBe(false);
    expect(w.watch.stalled).toBe(false);
  });

  it('REQ-MONITOR-118: with a tool call in flight the silence is waiting on N active calls, not a stall', () => {
    const w = watched(30_000);
    w.watch.start();
    w.watch.toolStarted('a', 'terminal'); w.watch.toolStarted('b', 'terminal');
    w.clock.advance(30_000);
    expect(w.stalled).toEqual([]);
    expect(w.waiting).toEqual([{ silentS: 30, activeCalls: 2 }]);
    w.clock.advance(25_000);
    expect(w.waiting).toHaveLength(1);
    w.clock.advance(5_000);
    expect(w.waiting.map((x) => x.silentS)).toEqual([30, 60]);
    // The calls return: the model's next step starts then, so the silence is counted from there.
    w.watch.toolCompleted('a'); w.watch.toolCompleted('b');
    w.clock.advance(25_000);
    expect(w.stalled).toEqual([]);
    w.clock.advance(5_000);
    expect(w.stalled.map((r) => r.silentS)).toEqual([30]);
  });

  it('the diagnostics carry the last 5 tool calls, the active ones (none, in a stall) and the last model event type', () => {
    const w = watched(6_000);
    w.watch.start();
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) { w.watch.toolStarted(`id-${n}`, n); w.watch.toolCompleted(`id-${n}`); }
    w.watch.modelEvent('finish');
    w.clock.advance(6_000);
    expect(w.stalled).toEqual([{ silentS: 6, entry: true, warn: true, activeTools: [], recentCalls: ['b', 'c', 'd', 'e', 'f'], lastModelEvent: 'finish' }]);
  });

  it('REQ-NOTIFY-112: output is a token; an error or a usage part is a model event and not output', () => {
    const w = watched(90_000);
    w.watch.start();
    w.clock.advance(80_000);
    w.watch.modelEvent('usage');
    w.clock.advance(15_000);
    w.watch.modelEvent('error');
    expect(w.watch.quietFor()).toBe(95_000);
    w.watch.modelEvent('reasoning');
    expect(w.watch.quietFor()).toBe(0);
    w.clock.advance(1_000);
    w.watch.activity();
    expect(w.watch.quietFor()).toBe(0);
  });

  it('a stopped watch evaluates nothing', () => {
    const w = watched(6_000);
    w.watch.start();
    w.watch.stop();
    w.clock.advance(60_000);
    expect(w.evaluated).toEqual([]);
    expect(w.stalled).toEqual([]);
  });

  it('REQ-MONITOR-119 (OQ-155): between the child\'s turns there is no step to be silent: no stall is reported, the callback reads not stalled, and the next turn counts from its start', () => {
    const w = watched(12_000);
    w.watch.start();
    w.watch.modelEvent('finish');
    w.watch.betweenTurns();
    w.clock.advance(60_000);
    expect(w.stalled).toEqual([]);
    expect(w.waiting).toEqual([]);
    expect(w.evaluated.length).toBeGreaterThan(0);
    expect(w.evaluated.every((s) => !s)).toBe(true);
    // The run starts its next turn: the silence counts from here, not from the turn before the wait.
    w.watch.activity();
    w.clock.advance(10_000);
    expect(w.stalled).toEqual([]);
    w.clock.advance(2_000);
    expect(w.stalled.map((r) => [r.silentS, r.entry])).toEqual([[12, true]]);
  });

  it('REQ-MONITOR-120 (OQ-155 with OQ-153): a stall under way when the turn ends is over at the next evaluation between turns; it is logged recovered only when the agent was active after it', () => {
    // The turn ended with no activity after the stall — cancelled, paused, timed out: the stall is over, not recovered.
    const quiet = watched(12_000);
    quiet.watch.start();
    quiet.clock.advance(12_000);
    expect(quiet.stalled).toHaveLength(1);
    quiet.watch.betweenTurns();
    quiet.clock.advance(2_000);
    expect([quiet.recovered(), quiet.watch.stalled, quiet.evaluated[quiet.evaluated.length - 1]]).toEqual([0, false, false]);
    expect(quiet.stalled).toHaveLength(1);
    quiet.watch.stop();
    expect(quiet.recovered()).toBe(0);
    // The step answered after the stall and the turn then ended: that is activity resuming, logged recovered once.
    const answered = watched(12_000);
    answered.watch.start();
    answered.clock.advance(12_000);
    expect(answered.stalled).toHaveLength(1);
    answered.watch.modelEvent('text');
    answered.watch.betweenTurns();
    answered.clock.advance(2_000);
    expect([answered.recovered(), answered.watch.stalled]).toEqual([1, false]);
    answered.watch.stop();
    expect(answered.recovered()).toBe(1);
  });

  it('the warning says what REQ-ORCH-089 and REQ-MONITOR-119 say', () => {
    expect(stallWarning('build', 'bg_0000000a', 90)).toBe('child appears stalled: no model event or token for 90 seconds (build, bg_0000000a); the run is still waiting on it.');
  });
});

describe('REQ-NOTIFY-111/112: the corrective message', () => {
  const due: StallRecoveryInput = { status: 'failed', error: modelError({ code: 'unknown', headline: 'the stream ended' }), escalated: false, aborted: false, timedOut: false, resting: false, paused: false, answerRoute: false, corrected: false, quietMs: 90_000, thresholdMs: 90_000, activeCalls: 0 };

  it('is due for a failed turn after no output for the whole window, the bound inclusive', () => {
    expect(stallRecoveryDue(due)).toBe(true);
    expect(stallRecoveryDue({ ...due, quietMs: 89_999 })).toBe(false);
    expect(stallRecoveryDue({ ...due, error: modelError({ code: 'timeout', headline: 't' }) })).toBe(true);
  });

  it('is never due for an outcome REQ-NOTIFY-112 names as not recovery-eligible, a second time, on an answer-only route, or with a call in flight', () => {
    const not: Partial<StallRecoveryInput>[] = [
      { status: 'succeeded' }, { status: 'partial' },
      { aborted: true }, { timedOut: true }, { escalated: true }, { resting: true }, { paused: true },
      { answerRoute: true }, { corrected: true }, { activeCalls: 1 },
      { error: modelError({ code: 'http', status: 401, headline: 'unauthorised' }) },
      { error: modelError({ code: 'http', status: 403, headline: 'forbidden' }) },
      { error: modelError({ code: 'http', status: 429, headline: 'quota' }) },
      { error: modelError({ code: 'http', status: 402, headline: 'payment' }) },
      { error: modelError({ code: 'validation', headline: 'bad request' }) },
      { error: modelError({ code: 'aborted', headline: 'aborted' }) },
    ];
    for (const o of not) expect([o, stallRecoveryDue({ ...due, ...o })]).toEqual([o, false]);
    expect(stallRecoveryDue({ ...due, error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) })).toBe(true);
  });

  it('is composed from the condition, and the fixed read-then-edit instruction stands in where there is nothing to compose from', () => {
    expect(correctiveInstruction({ quietS: 95, windowS: 90, failure: 'the stream ended' })).toBe('[Corrective message] You produced no output for 95 seconds (the stall window, runtime.child_stall_timeout, is 90 seconds), and your last model request then failed: the stream ended. Carry on from where you stopped: take the next step of your task with your tools, keep each step small so that output starts promptly, and answer with what you did.');
    expect(correctiveInstruction(null)).toBe(FIXED_CORRECTIVE_INSTRUCTION);
    expect(FIXED_CORRECTIVE_INSTRUCTION).toMatch(/reading files and editing them/);
  });

  it('REQ-NOTIFY-112 "per child task": a conversation that carries a corrective message, composed or fixed, says so; the words elsewhere do not', () => {
    const user = (text: string) => ({ role: 'user' as const, content: [{ kind: 'text' as const, text }] });
    const composed = correctiveInstruction({ quietS: 95, windowS: 90, failure: 'the stream ended' });
    expect(hadCorrectiveMessage([user('TASK: x'), { role: 'assistant', content: [{ kind: 'text', text: 'ok' }] }, user(composed)])).toBe(true);
    expect(hadCorrectiveMessage([user(FIXED_CORRECTIVE_INSTRUCTION)])).toBe(true);
    expect(hadCorrectiveMessage([])).toBe(false);
    expect(hadCorrectiveMessage([user('TASK: x')])).toBe(false);
    // Only what the run told the child counts: the child quoting it, or a task mentioning it further in, is not the message.
    expect(hadCorrectiveMessage([{ role: 'assistant', content: [{ kind: 'text', text: composed }] }])).toBe(false);
    expect(hadCorrectiveMessage([user(`TASK: explain what a ${composed}`)])).toBe(false);
  });
});

describe('REQ-MONITOR-135: "each successful injection refreshes the agent\'s last-activity timestamp"', () => {
  it('a steering drain that delivers refreshes once; one that delivers nothing does not', async () => {
    const { refreshing } = await import('./orchestration.js');
    let pending = [{ id: 'p1', text: 'look again' }];
    let refreshed = 0;
    const drain = refreshing(() => { const out = pending; pending = []; return out; }, () => { refreshed += 1; });
    expect(drain()).toEqual([{ id: 'p1', text: 'look again' }]);
    expect(refreshed).toBe(1);
    expect(drain()).toEqual([]);
    expect(refreshed).toBe(1);
  });

  it('a refresh restarts the silence the watch evaluates: a stall under way is recovered at the next evaluation', () => {
    const clock = new FakeClock();
    const seen: string[] = [];
    const watch = new StallWatch(clock, millis(30_000), { stalled: () => seen.push('stalled'), waiting: () => undefined, recovered: () => seen.push('recovered'), evaluated: () => undefined });
    watch.start();
    clock.advance(30_000);
    expect(seen).toEqual(['stalled']);
    expect(watch.silentSeconds).toBe(30);
    watch.activity();
    expect(watch.silentSeconds).toBe(0);
    clock.advance(5_000);
    expect(seen).toEqual(['stalled', 'recovered']);
    watch.stop();
  });
});

describe('REQ-MONITOR-120 with OQ-153: a stall under way when the watch is disarmed is recovered only if the agent was active', () => {
  it('stop() after a stall and then activity reports the recovery once; stop() with no stall reports nothing', () => {
    const clock = new FakeClock();
    let recovered = 0;
    const watch = new StallWatch(clock, millis(30_000), { stalled: () => undefined, waiting: () => undefined, recovered: () => { recovered += 1; }, evaluated: () => undefined });
    watch.start();
    watch.stop();
    expect(recovered).toBe(0);
    watch.start();
    clock.advance(30_000);
    expect(watch.stalled).toBe(true);
    // The retry streamed, and the turn ended before the next evaluation (the live run's case).
    watch.modelEvent('text');
    watch.stop();
    expect([recovered, watch.stalled]).toEqual([1, false]);
    watch.stop();
    expect(recovered).toBe(1);
  });

  it('stop() after a stall with no activity since — a cancel, a stop, a pause, a hard timeout — ends the stall and reports no recovery', () => {
    const clock = new FakeClock();
    let recovered = 0;
    const watch = new StallWatch(clock, millis(30_000), { stalled: () => undefined, waiting: () => undefined, recovered: () => { recovered += 1; }, evaluated: () => undefined });
    watch.start();
    clock.advance(30_000);
    expect(watch.stalled).toBe(true);
    watch.stop();
    expect([recovered, watch.stalled]).toEqual([0, false]);
    // The call's own abort or timeout reaches the watch as an error part: that is not the agent active again.
    watch.start();
    clock.advance(30_000);
    expect(watch.stalled).toBe(true);
    watch.modelEvent('error');
    watch.stop();
    expect([recovered, watch.stalled]).toEqual([0, false]);
  });

  it('activity before the stall was last found is not activity after it: only what arrives after the stalled evaluation counts', () => {
    const clock = new FakeClock();
    let recovered = 0;
    const watch = new StallWatch(clock, millis(30_000), { stalled: () => undefined, waiting: () => undefined, recovered: () => { recovered += 1; }, evaluated: () => undefined });
    watch.start();
    watch.modelEvent('text');
    clock.advance(35_000);
    expect(watch.stalled).toBe(true);
    watch.stop();
    expect(recovered).toBe(0);
  });

  it('a turn that ended while stalled, its agent then between turns, is not reported recovered at the next evaluation', () => {
    const clock = new FakeClock();
    let recovered = 0;
    const evaluated: boolean[] = [];
    const watch = new StallWatch(clock, millis(30_000), { stalled: () => undefined, waiting: () => undefined, recovered: () => { recovered += 1; }, evaluated: (s) => { evaluated.push(s); } });
    watch.start();
    clock.advance(30_000);
    expect(watch.stalled).toBe(true);
    watch.modelEvent('error');
    watch.betweenTurns();
    clock.advance(5_000);
    expect([recovered, watch.stalled, evaluated[evaluated.length - 1]]).toEqual([0, false, false]);
    watch.stop();
  });
});
