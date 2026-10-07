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
 * stand — in every proof since 2026-09-29, which `launch-sites.test.ts` (rule 4) keeps
 * (`docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`). Until 2026-09-29 that call could not bound a launch: at its timeout Node sends the signal AND closes its ends of the child's
 * standard output and error, so the application's first quit-path line (`quit: requested (before-quit)`) fails with
 * EPIPE, and the main process's uncaught-exception handler logs that failure to the same closed stream — a loop at full
 * CPU that never reaches the quit, and a `spawnSync` that never returns
 * (`docs/defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`, repaired 2026-09-29). Since
 * that repair the application does quit on it, and `spawnSync` returns at its timeout — but with `status` 0, only
 * `error.code` `ETIMEDOUT` to show the overrun, and none of the quit path's lines (measured 2026-09-30), so a `launch`
 * that checks the status passes an overrun as a clean exit. Here the pipes stay open and read until the process has
 * exited, so SIGTERM reaches the quit path the way a person's `kill` does, its lines reach the log, and the overrun is
 * reported (`overran`, `overrunMessage`).
 *
 * Nothing here is product code. It runs only from the proofs; `bounded-launch.test.ts` pins it against real children.
 */
import { spawn, spawnSync } from 'node:child_process';

const POSIX = process.platform !== 'win32';
/**
 * How long the rest of a launch's process group may outlive its leader before it is ended (`drainGroup`). Electron's
 * zygotes, GPU, utility and renderer processes leave within moments of the main process; what is still there after this
 * is a process the launch left behind (finacc3 A2-19: a `git diff --numstat` the Git view started, alive after the quit).
 */
const GROUP_GRACE_MS = 3_000;
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
/**
 * A launch the proof started some other way (`lib/driver.mjs`'s `startApp`) taken into the same care: while it is live, a
 * fatal signal to the proof, or the proof's exit, ends its whole group. It leaves the set through `drainGroup`.
 */
export function trackLaunch(child) {
  track(child);
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
  if (group && POSIX && child.pid) {
    try { process.kill(-child.pid, sig); return; } catch { /* no such group: a launch that leads none — the process alone */ }
  }
  try { child.kill(sig); } catch { /* ESRCH: already gone */ }
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
 * The live members of process group `pgid`, one `pid args` line each, a zombie not counted (it runs nothing and init
 * reaps it on its own schedule); `null` where `ps` cannot be asked, and then `kill(-pgid, 0)` alone says whether any is left.
 */
function groupMembers(pgid) {
  const r = spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'pgid=', '-o', 'stat=', '-o', 'args='], { encoding: 'utf8', timeout: 5_000 });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  const members = [];
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (m && Number(m[2]) === pgid && !m[3].startsWith('Z')) members.push(`${m[1]} ${m[4].trim()}`);
  }
  return members;
}
function groupLive(pgid) {
  const members = groupMembers(pgid);
  if (members !== null) return members.length > 0;
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

/**
 * finacc3 A2-19 (`docs/defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md`): a launch ends
 * with its whole process group, not with its main process alone. Called once the leader has exited: the rest of the group
 * is given `graceMs` to leave on its own, and whatever is still running then is ended with SIGKILL and NAMED — a proof that
 * moved on with it alive would have measured beside its own leftovers. Resolves with `{ endedBy, lingered, afterMs }`:
 * `endedBy` null when the group left by itself, `'SIGKILL'` when it had to be ended, `'nothing'` when even that was not
 * seen to take; `lingered` the members found at the grace (`pid args`). On Windows, or for a launch that leads no group,
 * there is no group to drain. The launch leaves the proof's care here.
 */
/** A wait that holds the event loop open: a drain must finish even when nothing else is left for the proof to wait on. */
const heldSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
export async function drainGroup(child, { graceMs = GROUP_GRACE_MS } = {}) {
  const started = Date.now();
  if (!POSIX || !child.pid) { untrack(child); return { endedBy: null, lingered: [], afterMs: 0 }; }
  const pgid = child.pid;
  while (groupLive(pgid) && Date.now() - started < graceMs) await heldSleep(50);
  if (!groupLive(pgid)) { untrack(child); return { endedBy: null, lingered: [], afterMs: Date.now() - started }; }
  const lingered = groupMembers(pgid) ?? ['(members unknown: ps could not be asked)'];
  try { process.kill(-pgid, 'SIGKILL'); } catch { /* ESRCH: gone between the look and the signal */ }
  const killedAt = Date.now();
  while (groupLive(pgid) && Date.now() - killedAt < KILL_REAP_MS) await heldSleep(50);
  const endedBy = groupLive(pgid) ? 'nothing' : 'SIGKILL';
  untrack(child);
  console.error(`bounded-launch: ${lingered.length} process(es) of the launch's group (${pgid}) outlived it by ${graceMs} ms and ${endedBy === 'SIGKILL' ? 'were ended with SIGKILL' : 'did not end on SIGKILL'}: ${lingered.join(' ;; ')}`);
  return { endedBy, lingered, afterMs: Date.now() - started };
}

/**
 * `spawnSync`'s shape — `{ status, signal, stdout, stderr }` — from an asynchronous launch that ends within
 * `timeoutMs` whatever the process does, plus `elapsedMs` and `overran`: `null` for a launch that ended by itself,
 * otherwise `endOverrun`'s account of how it was ended. `graceMs` is the SIGTERM grace.
 *
 * On POSIX the launch leads its own process group, so the SIGKILL reaches every helper it started. SIGTERM goes to the
 * process alone: that is what a person's `kill` does, and what the product's own quit path is expected to answer.
 */
export async function spawnBounded(command, args, { timeoutMs, graceMs = 10_000, groupGraceMs = GROUP_GRACE_MS, cwd, env, windowsHide = true } = {}) {
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
  // The rest of the group first: a helper holding the pipes is a member of it, so the pipes close once it is drained.
  const group = hasExited(child) ? await drainGroup(child, { graceMs: groupGraceMs }) : null;
  await Promise.race([closed, sleep(PIPE_GRACE_MS)]);
  child.stdout.destroy();
  child.stderr.destroy();
  return { status: exit?.code ?? null, signal: exit?.signal ?? null, stdout, stderr, elapsedMs: Date.now() - started, overran, group };
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
