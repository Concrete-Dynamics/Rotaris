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
