/**
 * REQ-TRACE-501 and REQ-TRACE-088 — `traceability-proof`'s verdict on a linear-growth pair.
 *
 * ADR-0040's third execution (Part R2) set the rules, and they are unchanged here: the work ratio is asserted always,
 * the timing ratio is asserted against `ceiling` only when both minima reach `floorMs`, and below the floor it is
 * recorded with a line saying it was not asserted. What this module adds is that the message names each side's
 * readings as that side's. The script used to print `warmRunsMs` as the full readings and `halfWarmRunsMs ??
 * warmRunsMs` as the half ones; for the parse and the sweep `warmRunsMs` held the HALF readings, so a red printed the
 * half readings twice and never the full ones
 * (`docs/defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`).
 *
 * A pair is what `growthPair` in `packages/workspace/src/traceability/growth-readings.ts` records:
 * `{ work: { full, half }, clock, ratio, fullRunsMs, halfRunsMs, fullMinMs, halfMinMs, wallRatio, fullCpuRunsMs,
 * halfCpuRunsMs, fullCpuMinMs, halfCpuMinMs }`, and the proof adds the `host` it was read on.
 *
 * 2026-10-02: where `clock` is `thread-cpu` the ratio, the floor and the readings the verdict names are the thread's CPU
 * time, and the wall-clock readings, their ratio and the host's load are printed beside them; a pair with no `clock`
 * (wall-clock readings alone) is judged on the wall clock as before. The ceiling, the lower bounds, the floor and the
 * work range are unchanged (`docs/defects/fixed/traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md`).
 */

export const GROWTH_FLOOR_MS = 25;
export const GROWTH_CEILING = 3.0;
const WORK_RANGE = { above: 1.5, below: 2.6 };

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * `{ ok, asserted, message }`. `ok` is false when the work ratio is out of range, or when the timing ratio was asserted
 * and is not inside `(lower, ceiling)`. `asserted` says whether the timing ratio was asserted at all.
 */
export function growthVerdict(label, pair, lower, { floorMs = GROWTH_FLOOR_MS, ceiling = GROWTH_CEILING } = {}) {
  const workRatio = round2(pair.work.full / Math.max(pair.work.half, 1));
  if (!(workRatio > WORK_RANGE.above && workRatio < WORK_RANGE.below)) {
    return { ok: false, asserted: false, message: `${label}: the half-size tree is not about half the work (${pair.work.full} against ${pair.work.half}, ratio ${workRatio})` };
  }
  const cpu = pair.clock === 'thread-cpu';
  const side = cpu
    ? { full: pair.fullCpuRunsMs, half: pair.halfCpuRunsMs, fullMin: pair.fullCpuMinMs, halfMin: pair.halfCpuMinMs }
    : { full: pair.fullRunsMs, half: pair.halfRunsMs, fullMin: pair.fullMinMs, halfMin: pair.halfMinMs };
  const readings = `${cpu ? 'thread CPU ' : ''}${JSON.stringify(side.full ?? [])} full (minimum ${side.fullMin} ms) against ${JSON.stringify(side.half ?? [])} half (minimum ${side.halfMin} ms)`;
  const load = pair.host ? `, load average ${pair.host.loadAverage?.[0]} on ${pair.host.cpus} CPUs` : '';
  const beside = cpu ? `; wall clock ${JSON.stringify(pair.fullRunsMs ?? [])} full against ${JSON.stringify(pair.halfRunsMs ?? [])} half, ratio ${pair.wallRatio}${load}` : load;
  if (side.fullMin < floorMs || side.halfMin < floorMs) {
    return { ok: true, asserted: false, message: `${label} growth ratio ${pair.ratio} recorded, NOT asserted: ${side.fullMin} ms against ${side.halfMin} ms${cpu ? ' of thread CPU' : ''} is below the ${floorMs} ms floor at which a ${cpu ? 'clock' : 'wall clock'} can tell two passes apart (work ratio ${workRatio} asserted instead)${beside}` };
  }
  const ok = pair.ratio > lower && pair.ratio < ceiling;
  return {
    ok,
    asserted: true,
    message: ok
      ? `${label} growth ratio ${pair.ratio} against work ratio ${workRatio} — readings ${readings}${beside}`
      : `${label} growth ratio ${pair.ratio} is not linear — the readings ${readings}, work ratio ${workRatio}${beside}`,
  };
}
