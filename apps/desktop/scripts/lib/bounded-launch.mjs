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
 * `spawnBounded` is the same ending for a launch a proof starts itself, where `spawnSync(…, { timeout })` used to
 * stand. That call cannot bound a launch: at its timeout Node sends the signal AND closes its ends of the child's
 * standard output and error, so the application's first quit-path line (`quit: requested (before-quit)`) fails with
 * EPIPE, and the main process's uncaught-exception handler logs that failure to the same closed stream — a loop at full
 * CPU that never reaches the quit, and a `spawnSync` that never returns
 * (`docs/defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`, repaired 2026-09-29). Here the pipes stay open and
 * read until the process has exited, so SIGTERM reaches the quit path the way a person's `kill` does.
 *
 * Nothing here is product code. It runs only from the proofs; `bounded-launch.test.ts` pins it against real children.
 */
import { spawn } from 'node:child_process';

const POSIX = process.platform !== 'win32';
/** How long SIGKILL may take to be reaped. It cannot be refused, so this is a bound on the kernel, not on the app. */
const KILL_REAP_MS = 5_000;
/** How long the pipes may stay open after the process exited — a helper holding them is not a reason to hang. */
const PIPE_GRACE_MS = 2_000;

/**
 * Every launch `spawnBounded` started and has not seen end, so a proof that dies mid-launch does not leave one behind.
 *
 * On POSIX a launch leads its OWN process group (`detached`), so the signal a terminal sends to the proof's group —
 * Ctrl+C's SIGINT, a closed terminal's SIGHUP — no longer reaches it the way it reached a `spawnSync` child, and
 * Node does not emit `exit` on a fatal signal. So while a launch is live the proof also answers SIGINT, SIGTERM and
 * SIGHUP: every live launch's group is SIGKILLed, and the signal is raised again once this handler is out of the way,
 * so the proof still dies of it as it would have (unless the proof installed its own handler, which then decides).
 */
const live = new Set();
const FATAL_SIGNALS = POSIX ? ['SIGINT', 'SIGTERM', 'SIGHUP'] : [];
const onFatal = new Map();
function endLive() {
  for (const child of live) signal(child, 'SIGKILL', true);
  live.clear();
}
process.on('exit', endLive);
function removeFatalHandlers() {
  for (const [sig, handler] of onFatal) process.off(sig, handler);
  onFatal.clear();
}
function track(child) {
  live.add(child);
  if (onFatal.size > 0) return;
  for (const sig of FATAL_SIGNALS) {
    const handler = () => {
      endLive();
      removeFatalHandlers();
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    };
    onFatal.set(sig, handler);
    process.on(sig, handler);
  }
}
/** A launch seen to end is no longer the proof's to clean up; with none left, the proof's signals are its own again. */
function untrack(child) {
  live.delete(child);
  if (live.size === 0) removeFatalHandlers();
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

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

/**
 * `spawnSync`'s shape — `{ status, signal, stdout, stderr }` — from an asynchronous launch that ends within
 * `timeoutMs` whatever the process does, plus `elapsedMs` and `overran`: `null` for a launch that ended by itself,
 * otherwise `endOverrun`'s account of how it was ended. `graceMs` is the SIGTERM grace.
 *
 * On POSIX the launch leads its own process group, so the SIGKILL reaches every helper it started. SIGTERM goes to the
 * process alone: that is what a person's `kill` does, and what the product's own quit path is expected to answer.
 */
export async function spawnBounded(command, args, { timeoutMs, graceMs = 10_000, cwd, env, windowsHide = true } = {}) {
  if (!(timeoutMs > 0)) throw new Error('spawnBounded needs a positive timeoutMs');
  const started = Date.now();
  const child = spawn(command, args, { cwd, env, windowsHide, detached: POSIX, stdio: ['ignore', 'pipe', 'pipe'] });
  track(child);
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => { child.once('close', resolve); });
  const spawnError = new Promise((resolve) => { child.once('error', resolve); });

  const first = await Promise.race([exitWithin(child, timeoutMs), spawnError.then((error) => ({ error }))]);
  let exit = first;
  let overran = null;
  if (first && 'error' in first) {
    untrack(child);
    return { status: null, signal: null, stdout, stderr, elapsedMs: Date.now() - started, overran: null, error: first.error };
  }
  if (first === null) {
    overran = { timeoutMs, ...(await endOverrun(child, { graceMs, group: POSIX })) };
    exit = overran.exit;
  }
  await Promise.race([closed, sleep(PIPE_GRACE_MS)]);
  child.stdout.destroy();
  child.stderr.destroy();
  if (hasExited(child)) untrack(child);
  return { status: exit?.code ?? null, signal: exit?.signal ?? null, stdout, stderr, elapsedMs: Date.now() - started, overran };
}

/** The last `lines` lines of a log, for a failure that has to say what the launch was doing when it was ended. */
export function logTail(log, lines = 30) {
  return log.split('\n').filter((line) => line.trim() !== '').slice(-lines).join('\n');
}

/**
 * The sentence a proof throws for an overrun launch: its name, its bound, what ended it, and its last words. An overrun
 * is a FAILURE of the launch, never a pass the assertions after it might still find something in.
 */
export function overrunMessage(name, result, log) {
  const o = result.overran;
  return `${name} overran its ${o.timeoutMs} ms bound: ${endedHow(o)}.\n--- the launch's last words ---\n${logTail(log)}`;
}

/** What ended an overrun, from `endOverrun`'s account of it — the clause every overrun message shares. */
export function endedHow(o) {
  return o.endedBy === 'SIGTERM'
    ? `SIGTERM ended it after ${o.afterTermMs} ms`
    : o.endedBy === 'SIGKILL'
      ? `SIGTERM did not end it within ${o.afterTermMs} ms; SIGKILL did`
      : `neither SIGTERM (${o.afterTermMs} ms) nor SIGKILL (${o.afterKillMs} ms) was reaped`;
}
