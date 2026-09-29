/**
 * Ending a launch within a bound — what a proof uses so that no launch outlives its time.
 *
 * A driven launch (`lib/driver.mjs`) ends by the driver's `quit`; a launch whose application does not exit on it, or a
 * proof that gives up on one mid-step, still has to END it. Here that is three steps, and it is REPORTED, never
 * absorbed: SIGTERM to the application's own process (the signal a person's `kill` sends, and the one Electron's
 * shutdown handler answers), a bounded grace for it to take its quit path, then SIGKILL — to the launch's whole process
 * group when it leads one, so nothing it started survives it. The result says which of the two ended it and how long
 * each took.
 *
 * Nothing here is product code. It runs only from the proofs; `bounded-launch.test.ts` pins it against real children.
 */
const POSIX = process.platform !== 'win32';
/** How long SIGKILL may take to be reaped. It cannot be refused, so this is a bound on the kernel, not on the app. */
const KILL_REAP_MS = 5_000;

/** Whether the process has exited, by the fields Node sets on `exit`. */
export function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Resolves with `{ code, signal }` once the process has exited, or with `null` when `ms` passes first. */
export function exitWithin(child, ms) {
  if (hasExited(child)) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve) => {
    const onExit = (code, sig) => { clearTimeout(timer); resolve({ code, signal: sig }); };
    const timer = setTimeout(() => { child.off('exit', onExit); resolve(hasExited(child) ? { code: child.exitCode, signal: child.signalCode } : null); }, ms);
    child.once('exit', onExit);
  });
}

/**
 * Send `sig` to the process — or, with `group` on POSIX, to the process group it leads (`detached: true` made it the
 * leader). A process that is already gone is not an error: the point is that it is gone.
 */
function signal(child, sig, group) {
  try {
    if (group && POSIX && child.pid) process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch { /* ESRCH: already gone */ }
}

/**
 * End a process that overran its bound: SIGTERM to the process itself, `graceMs` for it to exit, then SIGKILL (to its
 * group when `group`). Resolves with what ended it — `'SIGTERM'`, `'SIGKILL'` or `'nothing'` when even SIGKILL was not
 * reaped in time — how long the grace ran, and the exit the process reported.
 */
export async function endOverrun(child, { graceMs = 10_000, group = false } = {}) {
  const started = Date.now();
  signal(child, 'SIGTERM', false);
  const onTerm = await exitWithin(child, graceMs);
  if (onTerm) return { endedBy: 'SIGTERM', afterTermMs: Date.now() - started, exit: onTerm };
  const killedAt = Date.now();
  signal(child, 'SIGKILL', group);
  const onKill = await exitWithin(child, KILL_REAP_MS);
  return { endedBy: onKill ? 'SIGKILL' : 'nothing', afterTermMs: killedAt - started, afterKillMs: Date.now() - killedAt, exit: onKill };
}
