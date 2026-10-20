/**
 * The live run's wait on one launch (`live-run.mjs`'s `runElectron`), bounded by the launch's own bound even when
 * something the launch started keeps its pipes open.
 *
 * `runElectron` resolved on the child's `close`, which Node emits only once every holder of the child's standard output
 * and error has let go of them: the main process AND every descendant that inherited the handles. At `8080fbda` on Windows
 * the `crlf` launch overran its 522,320 ms bound, the harness's SIGKILL ended main alone (`child.kill` on Windows ends that
 * one process), and two utility processes of the dead main kept the pipes, so `close`, and with it the harness, came eight
 * hours later (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`, its 2026-10-20
 * addendum; the orphans are the Windows session's own note,
 * `docs/defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`). Here the wait settles on
 * the child's `exit` and then drains the pipes for at most `drainMs`; whatever still holds them after that is let go and
 * named (`pipesHeld`), never waited on. A SIGKILL whose `exit` never comes is given `reapMs`, then reported `unreaped`.
 *
 * The returned shape is `spawnSync`'s (`status`, `signal`, `stdout`, `stderr`), as `runElectron`'s always was, plus `pid`,
 * `timedOut` (the bound ran out and the harness sent SIGKILL: `status` null and `signal` `'SIGKILL'`, never a clean exit),
 * `pipesHeld` and, when it applies, `unreaped`. Nothing here is product code; `settle-launch.test.ts` pins it against real
 * children, a grandchild holding the pipes among them.
 */

/** How long the pipes may stay open after the launch's main process has exited: what it wrote last is read in that time. */
export const PIPE_DRAIN_MS = 5_000;
/** How long a SIGKILL may take to be reported as an `exit`. It cannot be refused, so this bounds the kernel, not the app. */
export const KILL_REAP_MS = 10_000;

/**
 * Settle a spawned launch: resolves once it has exited and its pipes have closed or drained for `drainMs`, or once its
 * `timeoutMs` bound ran out, `kill` was sent, and the exit (or `reapMs`) followed. `kill` defaults to SIGKILL to the process.
 */
export function settleLaunch(child, { timeoutMs, drainMs = PIPE_DRAIN_MS, reapMs = KILL_REAP_MS, kill = (c) => c.kill('SIGKILL') } = {}) {
  if (!(timeoutMs > 0)) throw new Error('settleLaunch needs a positive timeoutMs');
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let exited = null;
    let drain = null;
    let reap = null;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    const settle = (status, signal, extra = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(drain);
      clearTimeout(reap);
      // A descendant still holding the pipes is let go: its reading ends here, and so does the harness's wait on it.
      child.stdout?.destroy();
      child.stderr?.destroy();
      // `spawnSync` reports a timeout as a signal with a null status; the callers all read it that way.
      resolve({ status: timedOut ? null : status, signal: timedOut ? 'SIGKILL' : signal, stdout, stderr: `${stderr}${extra.error === undefined ? '' : `\n${extra.error}`}`, pid: child.pid, timedOut, pipesHeld: extra.pipesHeld === true, ...(extra.unreaped ? { unreaped: true } : {}) });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { kill(child); } catch { /* already gone: its `exit` settles it */ }
      reap = setTimeout(() => settle(null, null, { unreaped: true }), reapMs);
    }, timeoutMs);
    child.on('error', (cause) => { if (exited === null) settle(null, null, { error: String(cause) }); });
    child.on('exit', (status, signal) => {
      exited = { status, signal };
      clearTimeout(timer);
      clearTimeout(reap);
      drain = setTimeout(() => settle(status, signal, { pipesHeld: true }), drainMs);
    });
    child.on('close', (status, signal) => settle(exited?.status ?? status, exited?.signal ?? signal));
  });
}
