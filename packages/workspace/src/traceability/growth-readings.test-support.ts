/**
 * REQ-TRACE-501 and REQ-TRACE-088 — the readings a linear-growth ratio is computed from, taken EVENLY on both sides.
 *
 * `traceability.proof.test.ts` asks whether the full-size pass costs about twice the half-size one. It answers with
 * the quotient of two minima of repeated wall-clock readings (ADR-0040, third execution: load can only make a pass
 * slower, so the minimum is the least contaminated estimate). That answer holds only when the two sides are read under
 * the same conditions. The proof used to read every full-size sample first and every half-size sample afterwards, so
 * the half side ran on a hotter JIT and a settled heap and read cheap, and the quotient came out above the work ratio
 * on an idle host (3.04 to 3.37 against a work ratio of 2.14). For the sweep the full side was one reading against a
 * minimum of three. Recorded in `docs/defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`.
 *
 * This module only ORDERS the readings and keeps them. Each reader times itself and returns milliseconds, so the
 * module needs no clock, and the sweep, which reports its own duration, uses it the same way as the parse.
 *
 * 2026-10-02: a reader may return two figures for one pass, its wall-clock milliseconds and the CPU milliseconds its
 * own thread spent on it (`PassReading`), and the ratio is then the quotient of the CPU minima. On a host with more
 * runnable work than CPUs the minimum of seven wall-clock readings no longer screens the load out: a side can go a whole
 * round without one uncontended reading, and the parse ratio read 0.34 to 5.52 at load averages of 9.9 to 20.6 on four
 * CPUs (`docs/defects/fixed/traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md`). REQ-TRACE-088's
 * reference conditions are one execution thread timing the pass alone, which the thread's own CPU time measures and a
 * contended wall clock does not. The wall-clock readings are kept beside the CPU ones, and so is their ratio.
 *
 * Test support, and named so (`*.test-support.ts`, which `vitest.config.ts` does not collect; `growth-readings.ts` until
 * 2026-10-15, its own test keeping the name `growth-readings.test.ts`): only the proof and that test import it and the
 * package entry does not reach it, which `tools/test-support-naming/test-support-naming.test.ts` pins
 * (`docs/defects/fixed/workspace-traceability-test-support-is-named-as-product-modules.md`).
 */
export type GrowthSide = 'full' | 'half';

/** One pass read on two clocks: the wall clock, and the CPU time (user plus system) of the thread that ran it. */
export interface PassReading {
  readonly wallMs: number;
  readonly cpuMs: number;
}

export interface SideReadings {
  /** The least of `runsMs`: the wall-clock estimate. */
  readonly minMs: number;
  /** Every recorded wall-clock reading, in the order taken. Warm-up readings are not among them. */
  readonly runsMs: readonly number[];
  /** The least of `cpuRunsMs`, or `null` when the readers returned wall-clock milliseconds alone. */
  readonly cpuMinMs: number | null;
  /** Every recorded thread-CPU reading, in the order taken, or `null` when the readers returned none. */
  readonly cpuRunsMs: readonly number[] | null;
}

export interface GrowthReadings {
  readonly full: SideReadings;
  readonly half: SideReadings;
  /** The sides in the order they were read, warm-ups included, so a record shows the measurement was even. */
  readonly order: readonly GrowthSide[];
}

/**
 * Reads each side `rounds` times, interleaved. Before the recorded rounds each side is read `warmups` times and the
 * readings are discarded. Rounds alternate which side goes first (full then half, then half then full), so neither
 * side always runs right after the other: whatever the previous pass leaves behind (a hotter JIT, garbage still to
 * collect) falls on both sides equally.
 */
export function interleavedMinima(
  read: { readonly full: () => number | PassReading; readonly half: () => number | PassReading },
  options: { readonly rounds?: number; readonly warmups?: number } = {},
): GrowthReadings {
  const rounds = options.rounds ?? 7;
  const warmups = options.warmups ?? 1;
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`interleavedMinima needs at least one round, not ${rounds}`);
  if (!Number.isInteger(warmups) || warmups < 0) throw new Error(`interleavedMinima needs a whole number of warm-ups, not ${warmups}`);
  const order: GrowthSide[] = [];
  const runs: Record<GrowthSide, number[]> = { full: [], half: [] };
  const cpuRuns: Record<GrowthSide, number[]> = { full: [], half: [] };
  let everyCpu = true;
  const record = (side: GrowthSide, r: number | PassReading): void => {
    if (typeof r === 'number') { runs[side].push(r); everyCpu = false; return; }
    runs[side].push(r.wallMs);
    cpuRuns[side].push(r.cpuMs);
  };
  const pairFor = (i: number): readonly GrowthSide[] => (i % 2 === 0 ? ['full', 'half'] : ['half', 'full']);
  for (let i = 0; i < warmups; i += 1) {
    for (const side of pairFor(i)) { order.push(side); read[side](); }
  }
  for (let i = 0; i < rounds; i += 1) {
    for (const side of pairFor(warmups + i)) { order.push(side); record(side, read[side]()); }
  }
  const sideOf = (side: GrowthSide): SideReadings => ({
    minMs: Math.min(...runs[side]),
    runsMs: runs[side],
    cpuMinMs: everyCpu ? Math.min(...cpuRuns[side]) : null,
    cpuRunsMs: everyCpu ? cpuRuns[side] : null,
  });
  return { full: sideOf('full'), half: sideOf('half'), order };
}

/**
 * The pair a growth check reads: the work on each side, every reading on each side, the two minima and their ratio.
 * `clock` names the readings `ratio` is computed from: `thread-cpu` when every reader returned a `PassReading` (the CPU
 * minima), `wall` otherwise. The wall-clock readings, their minima and their quotient (`wallRatio`) are kept either way.
 */
export interface GrowthPair {
  readonly work: { readonly full: number; readonly half: number };
  readonly clock: 'thread-cpu' | 'wall';
  readonly ratio: number;
  readonly fullRunsMs: readonly number[];
  readonly halfRunsMs: readonly number[];
  readonly fullMinMs: number;
  readonly halfMinMs: number;
  readonly wallRatio: number;
  readonly fullCpuRunsMs: readonly number[] | null;
  readonly halfCpuRunsMs: readonly number[] | null;
  readonly fullCpuMinMs: number | null;
  readonly halfCpuMinMs: number | null;
  readonly order: readonly GrowthSide[];
}

/**
 * The record of one growth measurement. `denominatorFloorMs` keeps the quotient finite when the half side reads 0;
 * the proof script refuses to assert a ratio whose readings sit below its own floor anyway.
 */
export function growthPair(readings: GrowthReadings, work: { readonly full: number; readonly half: number }, denominatorFloorMs = 0.1): GrowthPair {
  const quotient = (full: number, half: number): number => Math.round((full / Math.max(half, denominatorFloorMs)) * 100) / 100;
  const wallRatio = quotient(readings.full.minMs, readings.half.minMs);
  const { cpuMinMs: fullCpu } = readings.full;
  const { cpuMinMs: halfCpu } = readings.half;
  const cpu = fullCpu !== null && halfCpu !== null;
  return {
    work,
    clock: cpu ? 'thread-cpu' : 'wall',
    ratio: cpu ? quotient(fullCpu, halfCpu) : wallRatio,
    fullRunsMs: readings.full.runsMs,
    halfRunsMs: readings.half.runsMs,
    fullMinMs: readings.full.minMs,
    halfMinMs: readings.half.minMs,
    wallRatio,
    fullCpuRunsMs: readings.full.cpuRunsMs,
    halfCpuRunsMs: readings.half.cpuRunsMs,
    fullCpuMinMs: fullCpu,
    halfCpuMinMs: halfCpu,
    order: readings.order,
  };
}
