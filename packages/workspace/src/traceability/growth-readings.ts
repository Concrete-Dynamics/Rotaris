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
 */
export type GrowthSide = 'full' | 'half';

export interface SideReadings {
  /** The least of `runsMs`: the estimate the ratio is computed from. */
  readonly minMs: number;
  /** Every recorded reading, in the order taken. Warm-up readings are not among them. */
  readonly runsMs: readonly number[];
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
  read: { readonly full: () => number; readonly half: () => number },
  options: { readonly rounds?: number; readonly warmups?: number } = {},
): GrowthReadings {
  const rounds = options.rounds ?? 7;
  const warmups = options.warmups ?? 1;
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`interleavedMinima needs at least one round, not ${rounds}`);
  if (!Number.isInteger(warmups) || warmups < 0) throw new Error(`interleavedMinima needs a whole number of warm-ups, not ${warmups}`);
  const order: GrowthSide[] = [];
  const runs: Record<GrowthSide, number[]> = { full: [], half: [] };
  const pairFor = (i: number): readonly GrowthSide[] => (i % 2 === 0 ? ['full', 'half'] : ['half', 'full']);
  for (let i = 0; i < warmups; i += 1) {
    for (const side of pairFor(i)) { order.push(side); read[side](); }
  }
  for (let i = 0; i < rounds; i += 1) {
    for (const side of pairFor(warmups + i)) { order.push(side); runs[side].push(read[side]()); }
  }
  return {
    full: { minMs: Math.min(...runs.full), runsMs: runs.full },
    half: { minMs: Math.min(...runs.half), runsMs: runs.half },
    order,
  };
}

/** The pair a growth check reads: the work on each side, every reading on each side, the two minima and their ratio. */
export interface GrowthPair {
  readonly work: { readonly full: number; readonly half: number };
  readonly fullRunsMs: readonly number[];
  readonly halfRunsMs: readonly number[];
  readonly fullMinMs: number;
  readonly halfMinMs: number;
  readonly ratio: number;
  readonly order: readonly GrowthSide[];
}

/**
 * The record of one growth measurement. `denominatorFloorMs` keeps the quotient finite when the half side reads 0;
 * the proof script refuses to assert a ratio whose readings sit below its own floor anyway.
 */
export function growthPair(readings: GrowthReadings, work: { readonly full: number; readonly half: number }, denominatorFloorMs = 0.1): GrowthPair {
  return {
    work,
    fullRunsMs: readings.full.runsMs,
    halfRunsMs: readings.half.runsMs,
    fullMinMs: readings.full.minMs,
    halfMinMs: readings.half.minMs,
    ratio: Math.round((readings.full.minMs / Math.max(readings.half.minMs, denominatorFloorMs)) * 100) / 100,
    order: readings.order,
  };
}
