/**
 * `traceability-proof`'s verdict on a linear-growth pair (REQ-TRACE-501, REQ-TRACE-088), against the readings of the
 * red that exposed the defect: parse `[140.7, 138.8, 148.5]` full against `[50.6, 43.9, 44.1]` half, ratio 3.16, work
 * ratio 2.14 (`docs/defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the proof library is plain ESM beside the scripts that run it.
import { GROWTH_CEILING, GROWTH_FLOOR_MS, growthVerdict } from './growth-verdict.mjs';

type Verdict = { ok: boolean; asserted: boolean; message: string };
const verdict = growthVerdict as (label: string, pair: object, lower: number, options?: object) => Verdict;

const red = { work: { full: 1501, half: 701 }, fullRunsMs: [140.7, 138.8, 148.5], halfRunsMs: [50.6, 43.9, 44.1], fullMinMs: 138.8, halfMinMs: 43.9, ratio: 3.16 };

describe('growthVerdict (REQ-TRACE-501, REQ-TRACE-088)', () => {
  it('REQ-TRACE-501: a red names the full readings as full and the half readings as half', () => {
    const v = verdict('parse', red, 1.4);
    expect(v).toMatchObject({ ok: false, asserted: true });
    expect(v.message).toBe('parse growth ratio 3.16 is not linear — the readings [140.7,138.8,148.5] full (minimum 138.8 ms) against [50.6,43.9,44.1] half (minimum 43.9 ms), work ratio 2.14');
  });

  it('REQ-TRACE-501: a ratio inside (lower, 3.0) passes and still prints both sides', () => {
    const v = verdict('parse', { ...red, fullRunsMs: [92.1, 90.4], halfRunsMs: [43.0, 42.6], fullMinMs: 90.4, halfMinMs: 42.6, ratio: 2.12 }, 1.4);
    expect(v).toMatchObject({ ok: true, asserted: true });
    expect(v.message).toContain('[92.1,90.4] full (minimum 90.4 ms) against [43,42.6] half (minimum 42.6 ms)');
  });

  it('REQ-TRACE-088: the ceiling and the floor are the ones ADR-0040\'s third execution set, not moved', () => {
    expect(GROWTH_CEILING).toBe(3.0);
    expect(GROWTH_FLOOR_MS).toBe(25);
    expect(verdict('sweep', { ...red, ratio: 3.0 }, 1.3).ok).toBe(false);
    expect(verdict('sweep', { ...red, ratio: 1.3 }, 1.3).ok).toBe(false);
  });

  it('REQ-TRACE-088: below the floor the ratio is recorded, not asserted, and the line says so', () => {
    const v = verdict('sweep', { work: { full: 1000, half: 500 }, fullRunsMs: [69, 70], halfRunsMs: [23, 24], fullMinMs: 69, halfMinMs: 23, ratio: 3 }, 1.3);
    expect(v).toMatchObject({ ok: true, asserted: false });
    expect(v.message).toContain('recorded, NOT asserted: 69 ms against 23 ms is below the 25 ms floor');
  });

  describe('a pair read on the thread\'s CPU time (traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host)', () => {
    // The parse pair of a red at a load average of 14: the wall minima read 4.94, the thread's CPU minima the work ratio.
    const contended = {
      work: { full: 1501, half: 701 }, clock: 'thread-cpu', ratio: 2.2, wallRatio: 4.94,
      fullRunsMs: [912.4, 840.1], halfRunsMs: [190.2, 170.1], fullMinMs: 840.1, halfMinMs: 170.1,
      fullCpuRunsMs: [201.3, 198.0], halfCpuRunsMs: [90.4, 90.0], fullCpuMinMs: 198.0, halfCpuMinMs: 90.0,
      host: { loadAverage: [14.12, 11.8, 6.2], cpus: 4 },
    };

    it('REQ-TRACE-088: the ratio asserted is the CPU one, and the wall readings, their ratio and the load are printed beside it', () => {
      const v = verdict('parse', contended, 1.4);
      expect(v).toMatchObject({ ok: true, asserted: true });
      expect(v.message).toBe('parse growth ratio 2.2 against work ratio 2.14 — readings thread CPU [201.3,198] full (minimum 198 ms) against [90.4,90] half (minimum 90 ms); wall clock [912.4,840.1] full against [190.2,170.1] half, ratio 4.94, load average 14.12 on 4 CPUs');
    });

    it('REQ-TRACE-088: a CPU ratio out of the band still fails, with the same bounds', () => {
      expect(verdict('parse', { ...contended, ratio: 3.0 }, 1.4).ok).toBe(false);
      expect(verdict('sweep', { ...contended, ratio: 1.3 }, 1.3).ok).toBe(false);
    });

    it('REQ-TRACE-088: the floor is read on the CPU minima', () => {
      const v = verdict('sweep', { ...contended, fullCpuMinMs: 48, halfCpuMinMs: 21, ratio: 2.29 }, 1.3);
      expect(v).toMatchObject({ ok: true, asserted: false });
      expect(v.message).toContain('recorded, NOT asserted: 48 ms against 21 ms of thread CPU is below the 25 ms floor');
    });
  });

  it('REQ-TRACE-501: a half-size tree that is not about half the work fails whatever the clock reads', () => {
    const v = verdict('parse', { ...red, work: { full: 1501, half: 1400 }, ratio: 1.0 }, 1.4);
    expect(v).toMatchObject({ ok: false, asserted: false });
    expect(v.message).toBe('parse: the half-size tree is not about half the work (1501 against 1400, ratio 1.07)');
  });
});
