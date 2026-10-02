import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain ES module beside the proof script, typed by its use here
import { hostLoad, judgeWithRerun, loadRange, loadWords, overloadedLaunches, rerunCall } from './append-rerun.mjs';

/**
 * REQ-CHAT-055's append comparison under host load
 * (`docs/defects/fixed/transcript-proofs-append-comparison-goes-red-under-host-load.md`): each launch carries the
 * host's load at its start and end, and a red verdict with a launch above the CPU count is judged on one re-run.
 */
const at = (one: number, cpus = 4) => ({ loadAverage: [one, one, one], cpus });
const launch = (name: string, start: number, end = start) => ({ name, host: { start: at(start), end: at(end) } });
const verdicts = (all: boolean, appends: boolean) => ({ all: { label: 'every update', pass: all }, appends: { label: 'row appends', pass: appends } });
type Launch = ReturnType<typeof launch>;
type Set = { launches: Launch[]; verdicts: ReturnType<typeof verdicts> };

describe('the append comparison reads the host load beside each launch', () => {
  it('reads the three load averages, rounded, and the CPU count', () => {
    expect(hostLoad({ loadavg: () => [5.4321, 3.14159, 1], availableParallelism: () => 4 })).toEqual({ loadAverage: [5.43, 3.14, 1], cpus: 4 });
  });
  it('names a launch above the CPU count at its start or its end, and none at or below it', () => {
    expect(overloadedLaunches([launch('append-empty-1', 4), launch('append-loaded-1', 3.9, 4.1), launch('append-empty-2', 6.6, 2)])).toEqual(['append-loaded-1', 'append-empty-2']);
    expect(loadRange([launch('a', 2.5, 3), launch('b', 6.6, 1.2)])).toEqual({ min: 1.2, max: 6.6, cpus: 4 });
  });
});

describe('a red taken above the CPU count is judged on one re-run', () => {
  const sets = (results: Set[]) => {
    const asked: number[] = [];
    return { asked, runSet: async (n: number) => { asked.push(n); return results[n - 1]!.launches; }, judge: (launches: Launch[]) => results.find((r) => r.launches === launches)! };
  };
  it('re-runs a red set in which a launch ran above the CPU count, and judges the second set, keeping both', async () => {
    const first = { launches: [launch('append-empty-1', 2), launch('append-loaded-1', 14.7)], verdicts: verdicts(false, true) };
    const second = { launches: [launch('append-empty-rerun-1', 2), launch('append-loaded-rerun-1', 2.5)], verdicts: verdicts(true, true) };
    const s = sets([first, second]);
    const r = await judgeWithRerun(s);
    expect(s.asked).toEqual([1, 2]);
    expect(r.judged).toBe(second);
    expect(r.first).toBe(first);
    expect(r.rerun).toBe(second);
    expect(r.call).toEqual({ red: ['every update'], overloaded: ['append-loaded-1'], rerun: true });
    expect(loadWords(r)).toBe('load average 2 to 2.5 on 4 CPUs, judged on a re-run: the first set was red on every update with append-loaded-1 above the CPU count (load average 2 to 14.7 on 4 CPUs)');
  });
  it('lets a red with no launch above the CPU count stand, with no re-run', async () => {
    const first = { launches: [launch('append-empty-1', 3), launch('append-loaded-1', 4)], verdicts: verdicts(false, false) };
    const s = sets([first]);
    const r = await judgeWithRerun(s);
    expect(s.asked).toEqual([1]);
    expect(r).toMatchObject({ judged: first, rerun: null, call: { red: ['every update', 'row appends'], overloaded: [], rerun: false } });
    expect(loadWords(r)).toBe('load average 3 to 4 on 4 CPUs');
  });
  it('does not re-run a pass, however loaded', async () => {
    const first = { launches: [launch('append-empty-1', 12), launch('append-loaded-1', 13)], verdicts: verdicts(true, true) };
    const s = sets([first]);
    expect((await judgeWithRerun(s)).rerun).toBeNull();
    expect(s.asked).toEqual([1]);
  });
  it('re-runs once: a red second set stands, loaded or not', async () => {
    const first = { launches: [launch('append-empty-1', 9)], verdicts: verdicts(false, true) };
    const second = { launches: [launch('append-empty-rerun-1', 9)], verdicts: verdicts(false, true) };
    const s = sets([first, second]);
    const r = await judgeWithRerun(s);
    expect(s.asked).toEqual([1, 2]);
    expect(r.judged.verdicts.all.pass).toBe(false);
    expect(rerunCall(r.judged.verdicts, r.judged.launches).rerun).toBe(true);
  });
});
