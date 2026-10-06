import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { modelError } from '@rotaris/model';
import { correctiveInstruction, duringImposedWait, FIXED_CORRECTIVE_INSTRUCTION, hadCorrectiveMessage, recordCorrectiveMessage, stallCadence, stallImposedWaitLine, stallRecords, stallRecoveryDue, stallRepeat, StallWatch, stallWarning, type ImposedWait, type StallRecordPorts, type StallRecoveryInput, type StallReport } from './stall.js';

function watched(thresholdMs: number) {
  const clock = new FakeClock();
  const stalled: StallReport[] = [];
  const waiting: { silentS: number; activeCalls: number }[] = [];
  const imposed: { silentS: number; wait: ImposedWait }[] = [];
  const evaluated: boolean[] = [];
  let recovered = 0;
  const watch = new StallWatch(clock, millis(thresholdMs), {
    stalled: (r) => stalled.push(r), waiting: (w) => waiting.push(w), imposed: (w) => imposed.push(w), recovered: () => { recovered += 1; }, evaluated: (s) => evaluated.push(s),
  });
  return { clock, watch, stalled, waiting, imposed, evaluated, recovered: () => recovered };
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
    // Every evaluation reports the stall and calls back; the warning (and, since PD-MONITOR-005 revision 2, its issue)
    // waits for max(90 s, 30 s).
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

  it('REQ-MONITOR-117..119 (OQ-173): a 120 s suspended wait on a provider limit is the run\'s wait, not a stall — no `stall` report, no stalled seconds, the wait reported at REQ-MONITOR-118\'s cadence', () => {
    const w = watched(90_000);
    w.watch.start();
    // The step's error part, then the ladder's suspended wait.
    w.watch.modelEvent('error');
    const release = w.watch.imposedWait('provider_limit');
    w.clock.advance(120_000);
    expect(w.stalled).toEqual([]);
    expect(w.watch.stalled).toBe(false);
    expect(w.evaluated).toHaveLength(24);
    expect(w.evaluated.every((s) => !s)).toBe(true);
    expect(w.imposed).toEqual([{ silentS: 90, wait: 'provider_limit' }]);
    // A longer wait repeats the line no sooner than the throttle, as the tool wait does.
    w.clock.advance(60_000);
    expect(w.imposed.map((x) => x.silentS)).toEqual([90, 180]);
    // The release restarts the silence: the next step is counted from it, and REQ-NOTIFY-112's window too.
    release();
    expect(w.watch.quietFor()).toBe(0);
    w.clock.advance(85_000);
    expect(w.stalled).toEqual([]);
    w.clock.advance(5_000);
    expect(w.stalled.map((r) => [r.silentS, r.entry])).toEqual([[90, true]]);
    // A second release changes nothing.
    release();
    expect(w.watch.stalled).toBe(true);
  });

  it('OQ-173: a stall under way when the run imposes a wait is over and not recovered; overlapping waits end with the last release; a backoff and a compression are reported by name', async () => {
    const w = watched(12_000);
    w.watch.start();
    w.clock.advance(12_000);
    expect(w.stalled).toHaveLength(1);
    const compression = w.watch.imposedWait('compression');
    w.clock.advance(2_000);
    expect([w.watch.stalled, w.recovered(), w.evaluated.at(-1)]).toEqual([false, 0, false]);
    expect(w.imposed.map((x) => x.wait)).toEqual(['compression']);
    const backoff = w.watch.imposedWait('backoff');
    compression();
    w.clock.advance(30_000);
    expect(w.stalled).toHaveLength(1);
    expect(w.imposed.map((x) => x.wait)).toEqual(['compression', 'backoff']);
    backoff();
    w.clock.advance(10_000);
    expect(w.stalled).toHaveLength(1);
    w.clock.advance(2_000);
    expect(w.stalled).toHaveLength(2);
    // The helper releases however its body ends, and the release restarts the silence: the stall is over, not recovered.
    await expect(duringImposedWait((wait) => w.watch.imposedWait(wait), 'provider_limit', () => Promise.reject(new Error('cancelled')))).rejects.toThrow('cancelled');
    w.clock.advance(2_000);
    expect([w.stalled.length, w.watch.stalled, w.recovered()]).toEqual([2, false, 0]);
    w.clock.advance(10_000);
    expect(w.stalled).toHaveLength(3);
  });

  it('OQ-173: the session-log line names the wait and says it is not a stall', () => {
    expect(stallImposedWaitLine('build', 'bg_0000000a', 'provider_limit', 90)).toBe('child waiting on a provider limit: build (bg_0000000a) has no model event or token for 90 seconds; the wait is the run\'s own and not a stall (OQ-173)');
    expect(stallImposedWaitLine('orchestrator', 'bg_0000000b', 'compression', 95, 'agent')).toBe('agent waiting on a context compression: orchestrator (bg_0000000b) has no model event or token for 95 seconds; the wait is the run\'s own and not a stall (OQ-173)');
  });

  it('the warning says what REQ-ORCH-089 and REQ-MONITOR-119 say', () => {
    expect(stallWarning('build', 'bg_0000000a', 90)).toBe('child appears stalled: no model event or token for 90 seconds (build, bg_0000000a); the run is still waiting on it.');
  });
});

describe('OQ-127\'s ruling (2026-10-06, R-071): what a stall watch\'s reports write — PD-MONITOR-005 revision 2 and the three timeline words', () => {
  function recorded(live = () => true) {
    const clock = new FakeClock();
    const issues: { kind: string; severity: string; actor: string; message: string; metadata?: Record<string, unknown> }[] = [];
    const timeline: { name: string; actor: string; message: string; metadata: Record<string, unknown> }[] = [];
    const warned: string[] = [];
    const informed: string[] = [];
    const ports: StallRecordPorts = {
      writer: {
        recordIssue: (i) => { issues.push(i); return { ok: true, value: `i${issues.length}` } as const; },
        appendTimeline: (name, actor, message, metadata) => { timeline.push({ name, actor, message, metadata }); return { ok: true, value: timeline.length } as const; },
      },
      warn: (m) => warned.push(m),
      info: (m) => informed.push(m),
    };
    const watch = new StallWatch(clock, millis(90_000), { ...stallRecords(ports, { subject: 'child', agentName: 'build', taskId: 'bg_0000000a', live }), evaluated: () => undefined });
    return { clock, watch, ports, issues, timeline, warned, informed };
  }

  it('PD-MONITOR-005 revision 2: the `stall` issue is written with each throttled warning and only then — not at every evaluation', () => {
    const r = recorded();
    r.watch.start();
    r.clock.advance(90_000);
    r.clock.advance(85_000);
    // Eighteen evaluations found the stall (90 to 175 s); one warning, and one issue beside it.
    expect(r.warned).toEqual([stallWarning('build', 'bg_0000000a', 90)]);
    expect(r.issues.map((i) => [i.kind, i.severity, i.actor, i.message])).toEqual([['stall', 'warning', 'build', r.warned[0]]]);
    expect(r.issues[0]!.metadata).toEqual({ task_id: 'bg_0000000a', silent_seconds: 90, active_tools: [], recent_tool_calls: [], last_model_event: null });
    r.clock.advance(5_000);
    expect(r.issues.map((i) => i.metadata!['silent_seconds'])).toEqual([90, 180]);
    expect(r.issues.map((i) => i.message)).toEqual(r.warned);
    // A stall from 90 s to the 1200 s `child_timeout` writes thirteen issues, not 223, so REQ-SESSION-133's 500-issue ring keeps the session's others.
    r.clock.advance(1_020_000);
    expect(r.issues).toHaveLength(13);
    expect(r.timeline).toEqual([]);
    expect(r.informed).toEqual([]);
  });

  it('REQ-MONITOR-118 and REQ-MONITOR-120: the wait on tools and the recovery are `waiting_on_tools` and `stall_recovered` entries, their lines at INFO', () => {
    const r = recorded();
    r.watch.start();
    r.watch.toolStarted('c1', 'terminal');
    r.clock.advance(90_000);
    const wait = 'child waiting on tools: build (bg_0000000a) has 1 active tool call and no model event or token for 90 seconds; the run is still waiting on it (REQ-MONITOR-118)';
    expect(r.informed).toEqual([wait]);
    expect(r.timeline).toEqual([{ name: 'waiting_on_tools', actor: 'build', message: wait, metadata: { task_id: 'bg_0000000a', silent_seconds: 90, active_calls: 1 } }]);
    r.watch.toolCompleted('c1');
    r.clock.advance(90_000);
    r.watch.modelEvent('text');
    r.clock.advance(5_000);
    const recovered = 'child stall recovered: build (bg_0000000a) is active again after a stall (REQ-MONITOR-120)';
    expect(r.informed).toEqual([wait, recovered]);
    expect(r.timeline.at(-1)).toEqual({ name: 'stall_recovered', actor: 'build', message: recovered, metadata: { task_id: 'bg_0000000a' } });
    // The stall itself stays a warning: REQ-MONITOR-119 says "log a warning".
    expect(r.warned).toEqual([stallWarning('build', 'bg_0000000a', 90)]);
  });

  it('OQ-173\'s wait the run imposes is REQ-MONITOR-118\'s manner: a line at INFO, and no timeline word was ruled for it', () => {
    const r = recorded();
    r.watch.start();
    r.watch.imposedWait('provider_limit');
    r.clock.advance(90_000);
    expect(r.informed).toEqual([stallImposedWaitLine('build', 'bg_0000000a', 'provider_limit', 90)]);
    expect([r.warned, r.timeline, r.issues]).toEqual([[], [], []]);
  });

  it('a detached execution writes nothing (REQ-SESSION-094)', () => {
    const r = recorded(() => false);
    r.watch.start();
    r.watch.toolStarted('c1', 'terminal');
    r.clock.advance(90_000);
    r.watch.toolCompleted('c1');
    r.clock.advance(180_000);
    expect([r.warned, r.informed, r.timeline, r.issues]).toEqual([[], [], [], []]);
  });

  it('REQ-NOTIFY-111: the corrective message is a `corrective_message` entry, its line a warning since a failed step precedes it', () => {
    const r = recorded();
    recordCorrectiveMessage(r.ports, 'build', 'bg_0000000a', 92, 90, 'the stream ended');
    const line = 'child corrective message: build (bg_0000000a) produced no output for 92 seconds and its model request then failed (the stream ended); it was given its one corrective message and resumes (REQ-NOTIFY-111)';
    expect(r.warned).toEqual([line]);
    expect(r.timeline).toEqual([{ name: 'corrective_message', actor: 'build', message: line, metadata: { task_id: 'bg_0000000a', quiet_seconds: 92, window_seconds: 90, failure: 'the stream ended' } }]);
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
