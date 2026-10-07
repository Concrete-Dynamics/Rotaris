import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { conclusive, evaluationIntervalMs, pacedWindows, stallsWhileStreaming } from './paced-arguments.mjs';

/** The live run's `faults-args` reading (docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md). */
describe('the faults-args reading of paced tool-call arguments', () => {
  const T0 = Date.parse('2026-10-07T10:00:00.000Z');
  const records = [
    { at: 'a', paced: { events: 0, firstAt: null, lastAt: null } },
    { at: 'b' },
    { at: 'c', paced: { events: 400, firstAt: T0, lastAt: T0 + 30_000 } },
    { at: 'd', paced: { events: 20, firstAt: T0 + 60_000, lastAt: T0 + 61_000 } },
  ];

  it('reads one window per call that paced a piece, longest first', () => {
    expect(pacedWindows(records)).toEqual([
      { at: 'c', events: 400, firstAt: T0, lastAt: T0 + 30_000, spanMs: 30_000 },
      { at: 'd', events: 20, firstAt: T0 + 60_000, lastAt: T0 + 61_000, spanMs: 1_000 },
    ]);
  });

  it('a window shorter than the threshold and one evaluation is no evidence', () => {
    const [long, short] = pacedWindows(records);
    expect(evaluationIntervalMs(10_000)).toBeCloseTo(10_000 / 6);
    expect(conclusive(long!, 10_000)).toBe(true);
    expect(conclusive(short!, 10_000)).toBe(false);
  });

  it('finds the `stall` issue the old build wrote during the stream, and none written outside a window', () => {
    const windows = pacedWindows(records);
    const at = (ms: number) => new Date(T0 + ms).toISOString();
    const issues = [
      // Before the stream: a slow first token, a stall of its own, not this scenario's question.
      { kind: 'stall', recorded_at: at(-5_000), actor: 'orchestrator', message: 'agent appears stalled: no model event or token for 10 seconds' },
      // An evaluation a second after the first piece that read the silence before it.
      { kind: 'stall', recorded_at: at(1_000), actor: 'orchestrator', message: 'agent appears stalled: no model event or token for 10 seconds' },
      // The old build: the pieces never reached the watch, so it found the threshold's silence just under ten seconds in.
      { kind: 'stall', recorded_at: at(9_500), actor: 'orchestrator', message: 'agent appears stalled: no model event or token for 10 seconds' },
      { kind: 'model_wait', recorded_at: at(12_000), actor: 'orchestrator', message: 'not a stall' },
      // After the stream and its last evaluation.
      { kind: 'stall', recorded_at: at(45_000), actor: 'orchestrator', message: 'agent appears stalled: no model event or token for 10 seconds' },
    ];
    expect(stallsWhileStreaming(issues, windows, 10_000).map((f) => f.issue.recorded_at)).toEqual([at(9_500)]);
    expect(stallsWhileStreaming([], windows, 10_000)).toEqual([]);
  });
});
