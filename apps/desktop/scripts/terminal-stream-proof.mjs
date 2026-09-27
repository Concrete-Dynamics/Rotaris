/**
 * Part AL proof — the terminal stream in the run host (ADR-0021 first executed), headless, against a REAL PTY.
 *
 * Runs the three suites that hold the mechanism — the streams registry behind the real terminal tool, main's
 * delivery limiter, the relay's subscription accessor — with ROTARIS_TERMINAL_PROOF_DIR set so the real halves write
 * their measurements, then asserts over those measurements:
 *   1. a command printing 10,000 lines yields frames whose `seq` is gapless and whose concatenated deltas equal the PTY
 *      output; the closing frame carries the observation's final text (REQ-TOOLS-127, REQ-SHELL-104);
 *   2. a `bg:` session gets its own stream with its own gapless counter (REQ-TOOLS-107/127);
 *   3. with the interval at 2,000 ms a keystroke arms a flush — the echo is framed in well under the ceiling
 *      (ADR-0021 Decision; OQ-38's reading), and no closer than the 20 ms floor;
 *   4. forty real streams at full tilt never exceed 1,000 frames/s at main's point of delivery, and every byte arrives
 *      in order (REQ-MONITOR-306, REQ-SHELL-103);
 *   4b. Part T2: the same forty streams delivered to TWO windows stay under the bound ACROSS BOTH — REQ-MONITOR-306
 *      bounds "every window, taken together" and counts a stream shown twice twice (defect T2-1) — and the ladder of
 *      ADR-0021 obligation 2 (20 → 1,000 streams, one window and two) holds the bound at every rung while the lag a
 *      byte waits before it reaches a surface climbs with the count the configuration does not bound;
 *   5. `terminal_stream_enabled=false` publishes zero frames with the same exit code and output (REQ-TOOLS-126);
 *   6. a grid resize to 80×24 is the size the process reports, with the observation still clean (REQ-SHELL-100/106).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = join(repo, '.proof', 'terminal-stream-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
// Serially (`--no-file-parallelism`): the real-PTY suite must not share the CPU with the synthetic load test, whose
// spin would slow a keystroke echo the proof measures against REQ-SHELL-166's budget.
const args = ['exec', 'vitest', 'run', '--no-file-parallelism', 'packages/agent-tools/src/terminal/streams.test.ts', 'apps/desktop/src/main/terminal.test.ts', 'apps/desktop/src/main/terminal-load.test.ts', 'packages/shell/src/shell.test.ts'];
const env = { ...process.env, ROTARIS_TERMINAL_PROOF_DIR: output };
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 600_000, env })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 600_000, env });
writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);

let m = {};
try { m = JSON.parse(readFileSync(join(output, 'measurements.json'), 'utf8')); } catch { m = {}; }
const results = {
  testsPassed: test.status === 0,
  tenThousandLinesGapless: m.tenThousandLines?.gapless === true && m.tenThousandLines?.deltasEqualPty === true,
  closingFrameIsObservation: m.tenThousandLines?.closingEqualsObservation === true,
  backgroundStreamOwnCounter: m.backgroundStream?.gapless === true && typeof m.backgroundStream?.streamId === 'string' && m.backgroundStream.streamId.startsWith('bg:ts_'),
  keystrokeArmsFlushUnderCeiling: typeof m.armedFlush?.keyToFrameMs === 'number' && m.armedFlush.keyToFrameMs < 500 && m.armedFlush.intervalMs === 2000,
  fortyStreamsUnderBound: typeof m.fortyStreams?.deliveredPeakPerSecond === 'number' && m.fortyStreams.deliveredPeakPerSecond <= 1000 && m.fortyStreams.streams === 40,
  fortyStreamsOfferedAboveBound: typeof m.fortyStreams?.offeredPeakPerSecond === 'number' && m.fortyStreams.offeredPeakPerSecond > 1000,
  // Part T2 — REQ-MONITOR-306 bounds "every window, taken together"; two windows following one session (REQ-MONITOR-243)
  // spend two of the budget per frame. Before defect T2-1 was repaired this read 2,000 against a bound of 1,000.
  twoWindowsUnderTheAggregateBound: m.fortyStreamsTwoWindows?.windows === 2 && m.fortyStreamsTwoWindows.streams === 40
    && typeof m.fortyStreamsTwoWindows.aggregateDeliveredPeakPerSecond === 'number' && m.fortyStreamsTwoWindows.aggregateDeliveredPeakPerSecond <= 1000
    && m.fortyStreamsTwoWindows.offeredPeakPerSecond > 1000,
  // Part T2 — ADR-0021 obligation 2 priced: the bound holds at every rung, the shipped forty leave the surface under a
  // second behind, and the lag crosses that second once the stream count passes the bound the key does not cap.
  obligation2LadderHoldsTheBound: Array.isArray(m.obligation2?.rungs) && m.obligation2.rungs.length >= 8
    && m.obligation2.rungs.every((r) => r.deliveredPeakPerSecond <= 1000)
    && (m.obligation2.rungs.find((r) => r.streams === 40 && r.windows === 1)?.maxLagMs ?? Infinity) < 1000
    && (m.obligation2.rungs.find((r) => r.streams === 3000)?.maxLagMs ?? 0) > 2000,
  streamingOffZeroFramesSameResult: m.streamingOff?.offFrames === 0 && m.streamingOff?.onFrames > 2 && m.streamingOff?.outputEqual === true && m.streamingOff?.exitOn === m.streamingOff?.exitOff,
  resizeReachesProcess: m.resize?.reported === 'cols=80 rows=24' && m.resize?.clean === true,
  measurements: m,
};

/**
 * Part T2 — `--packaged` adds the half of REQ-TOOLS-126 no execution of ADR-0021 had reached: the key set to `false`
 * in the PACKAGED application. It is opt-in because it wants `apps/desktop/release/win-unpacked/Rotaris.exe`, which
 * `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package` builds (with `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
 * while `pnpm notices` refuses) and which takes minutes; without the flag the section records that it was not run, and
 * with the flag but no build it REFUSES and says where it stopped.
 */
let packaged = { run: false, note: 'pass --packaged (after `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package`, with `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` while `pnpm notices` refuses) to measure the packaged application' };
if (process.argv.includes('--packaged')) {
  const { packagedTerminalStreaming } = await import('./terminal-proof/packaged.mjs');
  packaged = { run: true, ...packagedTerminalStreaming({ repo }) };
  if (packaged.available) for (const [name, value] of Object.entries(packaged.checks)) results[`packaged.${name}`] = value === true;
  else results['packaged.buildPresent'] = false;
}
results.packaged = packaged;
results.passed = Object.entries(results).filter(([k]) => k !== 'measurements' && k !== 'packaged').every(([, v]) => v === true);
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
if (!results.passed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(`terminal-stream-proof PASSED ${join(output, 'results.json')}`);
console.log(JSON.stringify({ tenThousandLines: m.tenThousandLines, armedFlush: m.armedFlush, fortyStreams: m.fortyStreams, streamingOff: m.streamingOff, resize: m.resize }, null, 2));
// Part T2: the two-window aggregate and obligation 2's ladder, in the run log as well as in results.json — the second
// is the number the owner is owed (`streams | windows | offered/s | delivered/s | merged | pending | maxLag | median`).
console.log(`terminal-stream-proof two windows (REQ-MONITOR-306): ${JSON.stringify(m.fortyStreamsTwoWindows)}`);
for (const r of m.obligation2?.rungs ?? []) {
  console.log(`terminal-stream-proof obligation 2: ${[r.streams, r.windows, r.offeredDeliveriesPerSecond, r.deliveredPeakPerSecond, r.mergedFrames, r.maxPendingSegments, `${r.maxLagMs} ms`, `${r.medianLagMs} ms`].join(' | ')}`);
}
