// @ts-check
/**
 * Whether the process a session lock names is gone once the launch that held the lock has returned.
 *
 * A proof that leaves a session `running` behind a lock, and then asks the next launch to repair it (REQ-GIT-094,
 * REQ-SESSION-060), measures the repair only if the lock's pid probes dead by then (REQ-SESSION-056, REQ-GIT-093).
 * The pid is the launch's RUN HOST. Since `endBeforeMain` (`apps/desktop/src/main/exit.ts`), main has been gone only
 * after the run host, so the pid is dead when `spawnSync` returns. Before that, the run host outlived main by up to
 * 1.8 s, and a repair launch started inside that window found the holder alive and correctly made no repair
 * (`docs/defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md`).
 * `checkpoint-proof` then reported that as the repair failing
 * (`docs/defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md`).
 *
 * `lockHolderAfterExit` reads the holder AT ONCE, which is the product's guarantee. It keeps probing afterwards only
 * so a failure can say how long the holder outlived its application; it never waits for a result it can then pass.
 * `describeLingeringHolder` is the sentence a proof throws, and it names the precondition and the requirement.
 *
 * Nothing here is product code. It runs only from the proofs.
 */

import { spawnSync } from 'node:child_process';

/**
 * The one question REQ-GIT-093 lets the product ask: does a process bearing this pid exist on this machine now.
 * `EPERM` means it exists and belongs to someone else.
 * @param {number} pid
 * @returns {boolean}
 */
export function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
  }
}

/**
 * A pid for a lock a proof plants as DEAD, chosen per platform so it cannot name a live process while the next launch
 * reads it (REQ-SESSION-056: a pid that probes alive makes the lock live, and the session is then correctly not stale).
 *
 * - `win32`: 4 242, which is never a Windows pid, since those are multiples of 4. A pid a child just gave back is NOT
 *   used there: Windows reissues a freed id soon from its free list rather than after a counter wraps, so the next
 *   launch's own processes (main, GPU, renderer, run host, workspace service) could be handed it before the probe.
 * - `linux`, `darwin`: the pid of a child that has already exited. Those systems hand pids out in rising order and
 *   reuse one only after the counter wraps, so the freed pid stays unused for the seconds the proof needs. A small
 *   literal is not safe there: a wrapped counter hands out small numbers (pids near 1 400 followed pids near 30 000
 *   on the Linux host of 2026-09-28).
 * @param {NodeJS.Platform} [platform]
 * @param {{ exitedChildPid?: () => number | undefined }} [seams]
 * @returns {number}
 */
export function plantedDeadPid(platform = process.platform, { exitedChildPid = runExitedChild } = {}) {
  if (platform === 'win32') return NEVER_A_WINDOWS_PID;
  const pid = exitedChildPid();
  if (!Number.isInteger(pid) || /** @type {number} */ (pid) <= 0) throw new Error(`the child run to give a dead pid reported pid ${pid}`);
  return /** @type {number} */ (pid);
}

/** Not a multiple of 4, so never a Windows pid. */
export const NEVER_A_WINDOWS_PID = 4242;

function runExitedChild() {
  return spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true }).pid;
}

/** @param {number} ms */
function pauseSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @typedef {{ pid: number, aliveAtExit: boolean, goneAfterMs: number | null, boundMs: number }} HolderReading
 * `goneAfterMs` is 0 when the holder was already gone. It is the time the holder took to go when it was alive at
 * the first read, and null when it was still alive after `boundMs`.
 */

/**
 * @param {number} pid the pid recorded in the session's lock
 * @param {{ probe?: (pid: number) => boolean, now?: () => number, pause?: (ms: number) => void, boundMs?: number, stepMs?: number }} [options]
 * @returns {HolderReading}
 */
export function lockHolderAfterExit(pid, { probe = pidExists, now = Date.now, pause = pauseSync, boundMs = 10_000, stepMs = 50 } = {}) {
  if (!probe(pid)) return { pid, aliveAtExit: false, goneAfterMs: 0, boundMs };
  const started = now();
  for (;;) {
    pause(stepMs);
    const elapsed = now() - started;
    if (!probe(pid)) return { pid, aliveAtExit: true, goneAfterMs: elapsed, boundMs };
    if (elapsed >= boundMs) return { pid, aliveAtExit: true, goneAfterMs: null, boundMs };
  }
}

/**
 * The failure a proof throws when the holder was alive at the first read. The sentence names the precondition that
 * failed and the requirement that breaks, so the red lands on the launch that left the lock held. Without it, the red
 * appears one launch later and is blamed on the repair.
 *
 * Given the launch's log, the sentence also says whether main logged that its run host was still running when the
 * bound for its end elapsed (`runHostStillRunning`, `apps/desktop/src/main/index.ts`). That line tells a run host
 * slower than the bound, which main reports and then leaves, apart from a main that left without waiting at all.
 * @param {string} launch the launch that held the lock and has returned
 * @param {HolderReading} reading
 * @param {string} [appLog] that launch's output, when the proof kept it
 */
export function describeLingeringHolder(launch, reading, appLog) {
  const after = reading.goneAfterMs === null ? `and was still alive ${reading.boundMs} ms later` : `and went ${reading.goneAfterMs} ms later`;
  let said = '';
  if (appLog !== undefined) {
    said = /quit: the run host \(pid (?:\d+|\?)\) was still running \d+ ms after it was ended/.test(appLog)
      ? ' Main logged that its run host was still running when the bound for its end elapsed, and left without it.'
      : ' Main logged no line saying its run host was still running when the bound for its end elapsed.';
  }
  return `the '${launch}' launch returned, but the process its session lock names (pid ${reading.pid}) was still alive ${after}.${said} `
    + 'The lock outlived the application that held it (REQ-SESSION-047, REQ-SESSION-056: a pid that probes alive is live), '
    + 'so the next launch would read the session as live (REQ-GIT-093) and correctly repair nothing. The repair step would measure nothing.';
}
