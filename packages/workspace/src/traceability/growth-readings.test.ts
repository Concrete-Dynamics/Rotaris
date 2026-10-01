import { describe, expect, it } from 'vitest';
import { growthPair, interleavedMinima } from './growth-readings.js';

/**
 * REQ-TRACE-501 / REQ-TRACE-088: the readings the proof's linear-growth ratio is computed from
 * (`docs/defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`).
 *
 * The pass is modelled, not run: a reader that costs `work × warmth(n)`, where `n` counts every pass the process has
 * made so far and `warmth` falls as the JIT warms, which is the shape that made the half-size side read cheap when it
 * was read after the full-size side.
 */
const WORK = { full: 2.14, half: 1 } as const;
const warming = () => {
  let n = 0;
  const pass = (work: number) => { const cost = work * 40 * (1 + 2 / (n + 1)); n += 1; return cost; };
  return { full: () => pass(WORK.full), half: () => pass(WORK.half), passes: () => n };
};

describe('interleavedMinima (REQ-TRACE-501, REQ-TRACE-088)', () => {
  it('REQ-TRACE-501: reads the two sides alternately, each round swapping which goes first, warm-ups unrecorded', () => {
    const r = interleavedMinima({ full: () => 2, half: () => 1 }, { rounds: 3, warmups: 1 });
    expect(r.order).toEqual(['full', 'half', 'half', 'full', 'full', 'half', 'half', 'full']);
    expect(r.full.runsMs).toHaveLength(3);
    expect(r.half.runsMs).toHaveLength(3);
  });

  it('REQ-TRACE-501: the same number of recorded readings on each side, defaulting to seven after one warm-up each', () => {
    const model = warming();
    const r = interleavedMinima(model);
    expect(r.full.runsMs).toHaveLength(7);
    expect(r.half.runsMs).toHaveLength(7);
    expect(model.passes()).toBe(16);
    expect(r.full.minMs).toBe(Math.min(...r.full.runsMs));
    expect(r.half.minMs).toBe(Math.min(...r.half.runsMs));
  });

  it('REQ-TRACE-501: under a warming pass the interleaved ratio reads the work ratio, where full-then-half read it high', () => {
    // The order the proof used before the repair: one cold and three warm full-size passes, then one unrecorded and
    // three recorded half-size passes, each side's minimum.
    const before = warming();
    before.full();
    const fullBefore = Math.min(before.full(), before.full(), before.full());
    before.half();
    const halfBefore = Math.min(before.half(), before.half(), before.half());
    const sequential = fullBefore / halfBefore;
    expect(sequential).toBeGreaterThan(2.5);

    const pair = growthPair(interleavedMinima(warming()), { full: 1501, half: 701 });
    expect(Math.abs(pair.ratio - WORK.full / WORK.half)).toBeLessThan(0.05);
  });

  it('REQ-TRACE-088: one stalled reading on either side does not move that side\'s minimum', () => {
    let fullCalls = 0;
    let halfCalls = 0;
    const r = interleavedMinima({
      full: () => { fullCalls += 1; return fullCalls === 3 ? 900 : 100; },
      half: () => { halfCalls += 1; return halfCalls === 5 ? 900 : 48; },
    });
    expect(r.full.runsMs).toContain(900);
    expect(r.half.runsMs).toContain(900);
    expect(growthPair(r, { full: 1000, half: 500 })).toMatchObject({ fullMinMs: 100, halfMinMs: 48, ratio: 2.08 });
  });

  it('REQ-TRACE-501: the pair keeps the full readings and the half readings apart, so a report can print each as itself', () => {
    let f = 0;
    let h = 0;
    const fulls = [140.7, 138.8, 148.5];
    const halves = [50.6, 43.9, 44.1];
    const pair = growthPair(
      interleavedMinima({ full: () => fulls[f++ % 3]!, half: () => halves[h++ % 3]! }, { rounds: 3, warmups: 0 }),
      { full: 1501, half: 701 },
    );
    expect(pair.fullRunsMs).toEqual(fulls);
    expect(pair.halfRunsMs).toEqual(halves);
    expect(pair).toMatchObject({ fullMinMs: 138.8, halfMinMs: 43.9, ratio: 3.16, work: { full: 1501, half: 701 } });
  });

  it('refuses a measurement with no recorded round or a fractional warm-up count', () => {
    expect(() => interleavedMinima({ full: () => 1, half: () => 1 }, { rounds: 0 })).toThrow(/at least one round/);
    expect(() => interleavedMinima({ full: () => 1, half: () => 1 }, { warmups: 0.5 })).toThrow(/whole number of warm-ups/);
  });
});
