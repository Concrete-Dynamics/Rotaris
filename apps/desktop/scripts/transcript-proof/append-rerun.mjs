/**
 * REQ-CHAT-055's append comparison in `transcript-proof.mjs`: the host's load beside each launch, and the one re-run a
 * red taken above the CPU count earns.
 *
 * The comparison is two alternating launches a side, judged on the loaded side's median against the empty side's
 * median plus one measured frame (about 17 ms). One launch that lands in a burst of other work on the host moves its
 * side's median by two frames or more, and fin4's verifiers saw it red at load averages of 5 to 14.7 on 4 CPUs, with
 * nothing in the evidence to say so (`docs/defects/fixed/transcript-proofs-append-comparison-goes-red-under-host-load.md`).
 * So each launch records the host's load at its start and its end; a red verdict where any launch ran at a one-minute
 * load average above the CPU count runs the alternating launches once more and is judged on that second set, both sets
 * kept. The slack and the statistic are unchanged, a red with no launch above the CPU count stands, and a red on the
 * second set stands whatever its load: the host's rule (`.agents/skills/orchestrated-build/references/environment.md`,
 * "Load") is to re-run a red taken above the CPU count once, and a red reproduced is real.
 *
 * Kept beside the script rather than in `lib/` so the decision has a test of its own; the script does the launching.
 */
import { availableParallelism, loadavg } from 'node:os';

const round2 = (n) => Math.round(n * 100) / 100;

/** The host's load now: the one, five and fifteen minute load averages, and the CPUs they compete for. */
export function hostLoad(read = { loadavg, availableParallelism }) {
  return { loadAverage: read.loadavg().map(round2), cpus: read.availableParallelism() };
}

/** The names of the launches that ran above the CPU count: a one-minute load average above it at their start or end. */
export function overloadedLaunches(launches) {
  return launches.filter((l) => [l.host.start, l.host.end].some((h) => h.loadAverage[0] > h.cpus)).map((l) => l.name);
}

/** The one-minute load averages a set of launches saw, at their starts and ends, and the CPU count. */
export function loadRange(launches) {
  const readings = launches.flatMap((l) => [l.host.start, l.host.end]);
  const ones = readings.map((h) => h.loadAverage[0]);
  return { min: Math.min(...ones), max: Math.max(...ones), cpus: Math.max(...readings.map((h) => h.cpus)) };
}

/** `{ red, overloaded, rerun }`: the verdicts that failed, the launches above the CPU count, and whether to re-run. */
export function rerunCall(verdicts, launches) {
  const red = Object.values(verdicts).filter((v) => !v.pass).map((v) => v.label);
  const overloaded = overloadedLaunches(launches);
  return { red, overloaded, rerun: red.length > 0 && overloaded.length > 0 };
}

/**
 * Runs one set of launches and judges it; when the call says so, runs one more and judges that instead. `runSet(n)`
 * launches set `n` (1 or 2) and returns its launches; `judge(launches)` returns `{ verdicts, … }` for them, where
 * `verdicts` maps a name to `{ label, pass }`. Returns the set judged, the first set, the re-run (or null) and the call.
 */
export async function judgeWithRerun({ runSet, judge }) {
  const first = judge(await runSet(1));
  const call = rerunCall(first.verdicts, first.launches);
  if (!call.rerun) return { judged: first, first, rerun: null, call };
  const rerun = judge(await runSet(2));
  return { judged: rerun, first, rerun, call };
}

/** The words the verdict carries about the load, and about a re-run when one was taken. */
export function loadWords({ judged, first, rerun, call }) {
  const range = (set) => { const r = loadRange(set.launches); return `load average ${r.min} to ${r.max} on ${r.cpus} CPUs`; };
  if (rerun === null) return range(judged);
  return `${range(rerun)}, judged on a re-run: the first set was red on ${call.red.join(' and ')} with ${call.overloaded.join(', ')} above the CPU count (${range(first)})`;
}
