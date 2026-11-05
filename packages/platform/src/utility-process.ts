import { millis, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import { probePid, type Liveness } from './liveness.js';

/**
 * R-091 (hardening §3.2 row 1), ADR-0002, PD-MONITOR-002 — how a utility process (the run host, a workspace service)
 * ends when nothing else will end it: a throw or a rejection no request path caught, and main gone.
 *
 * Both entries install this before anything else they start. Until 2026-11-03 neither did: an uncaught throw ended the
 * child with Node's default report to a standard error nobody reads in a packaged build, so main's log said only
 * "run host exited (1)"
 * (`docs/archive/defects/the-run-host-and-the-workspace-service-have-no-last-resort-exception-handler-and-end-without-a-word.md`),
 * and nothing in the child watched for main's end
 * (`docs/defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`).
 *
 * WHAT WAS MEASURED (2026-11-03, Windows 11 ARM64, Electron 44.3.0, a scratch app beside the build):
 * - `process.parentPort` emits no `close` when main is killed (`taskkill /F`), and the child gets no `disconnect` and no
 *   `exit` either: its prototype offers `start`, `pause` and `postMessage` alone. Chromium itself ended the child between
 *   about 0 and 3 s after the kill, natively, with no JavaScript run — so nothing the port offers can be listened for.
 * - Probing the parent's pid on the timer port saw main gone within 100 ms of the kill, in 3 launches of 3, before
 *   `taskkill` had even returned. That probe is what `watchParent` runs. On Windows `process.ppid` keeps naming the dead
 *   parent (nothing is reparented), so the probe is what tells; on POSIX the child is reparented, so a changed `ppid`
 *   tells as well.
 * - A last line posted on the parent port and followed at once by `process.exit(70)` reached main before the child's
 *   `exit` event in 18 of 18 launches (a throw and a rejection, each six times), so the handler exits at once.
 */

/** EX_SOFTWARE (sysexits): the status a utility process ends with on its last-resort handler. Main reads it (`exit.ts`). */
export const LAST_RESORT_EXIT_STATUS = 70;
/**
 * EX_UNAVAILABLE (sysexits): the status a utility process ends with when its parent is gone. Nobody in the product reads
 * it — main is the one gone — but it keeps the end distinct to anything outside that does.
 */
export const PARENT_GONE_EXIT_STATUS = 69;
/** How often a utility process asks whether main is still there. Well inside `RUN_HOST_END_BOUND_MS` (2,000 ms). */
export const PARENT_WATCH_PERIOD_MS: Millis = millis(250);

/** The part of Node's `process` the last-resort handler reads. */
export interface LastResortProcess {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  exit(code: number): void;
}

/** A thrown value as one line can carry it: an error's stack (or message), anything else as text. */
export function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.stack ?? `${thrown.name}: ${thrown.message}`;
  try { return typeof thrown === 'string' ? thrown : JSON.stringify(thrown) ?? String(thrown); } catch { return String(thrown); }
}

/**
 * The last-resort handler: on an uncaught exception or an unhandled rejection, ONE `error` line through `logError` (the
 * child's `log` event to main, so PD-MONITOR-002's log carries why the child ended) naming the process, the event and
 * the stack, then `exit(LAST_RESORT_EXIT_STATUS)` at once. Nothing else is written: for the run host the sessions it held
 * are left exactly as a lost process leaves them, and the engine's crash path repairs them on the next open
 * (`packages/engine/src/run/crash.ts`). A second event while the first is ending is ignored, so there is one line.
 */
export function installLastResort(deps: {
  readonly process: LastResortProcess;
  /** `run host` or `workspace service`, as the line names it. */
  readonly name: string;
  readonly logError: (message: string) => void;
}): void {
  let ending = false;
  const end = (event: string, thrown: unknown): void => {
    if (ending) return;
    ending = true;
    try { deps.logError(`${event} reached the ${deps.name}'s last-resort handler; ending with status ${LAST_RESORT_EXIT_STATUS} (R-091, ADR-0002): ${describeThrown(thrown)}`); } catch { /* the port may be gone: the status still says it */ }
    deps.process.exit(LAST_RESORT_EXIT_STATUS);
  };
  deps.process.on('uncaughtException', (e) => { end('an uncaught exception', e); });
  deps.process.on('unhandledRejection', (r) => { end('an unhandled rejection', r); });
}

/**
 * Ends this process within `periodMs` of its parent's end: every `periodMs` the parent's pid is probed (`probePid`,
 * REQ-SESSION-053's probe, which answers "alive" whenever it is unsure), and the current parent pid compared with the one
 * this process started under. Either telling the parent is gone calls `onGone` once and stops watching. Nothing is
 * paused or written first: main is gone, so there is no one to tell, and what the child held is left as a crash leaves
 * it, for the next launch's repair (REQ-SESSION-047 reaps the locks once this pid is dead).
 */
export function watchParent(deps: {
  readonly parentPid: number;
  readonly currentParentPid: () => number;
  readonly timers: Timers;
  readonly onGone: (why: string) => void;
  readonly periodMs?: Millis;
  readonly probe?: (pid: number) => Liveness;
}): TimerHandle {
  const probe = deps.probe ?? ((pid: number) => probePid(pid));
  let done = false;
  const handle = deps.timers.every(deps.periodMs ?? PARENT_WATCH_PERIOD_MS, () => {
    if (done) return;
    const now = deps.currentParentPid();
    const why = now !== deps.parentPid ? `the parent pid changed from ${deps.parentPid} to ${now}` : probe(deps.parentPid) === 'dead' ? `the parent pid ${deps.parentPid} is gone` : null;
    if (why === null) return;
    done = true;
    handle.cancel();
    deps.onGone(why);
  });
  return handle;
}

/**
 * Verification only — `ROTARIS_CAPTURE_CHILD_FAULT`, read by each entry behind `__ROTARIS_SEAMS__` (so a packaged build
 * carries neither the read nor the name): `<process>:<fault>[:<afterMs>]`, with `<process>` `run-host` or
 * `workspace-service` and `<fault>` one of
 * - `uncaught`: a throw from a timer `afterMs` after the start (default 3,000), which no request path catches;
 * - `rejection`: a rejected promise nothing awaits, as late;
 * - `silent`: the process starts and never answers a request, so main's ready bound is missed (OQ-462 (2));
 * - `slow`: the process answers nothing for its first `afterMs`, then everything it was asked meanwhile, in order — a
 *   child slow to start that still makes its ready bound (OQ-473: `hello` late, the window painted, nothing lost).
 * `exit-trace-proof` drives all four: the first two through the last-resort handler (its `last-resort` launches), the
 * third as a missed ready bound (its `not-ready` launches), the fourth as a late one met (its `slow-ready` launch); a spec
 * naming another process, or none, is no fault. Answers whether this process stays silent, and for how long it holds its
 * first messages (`slowMs`, 0 for none; the entry applies it with `holdMessagesFor`).
 */
export function injectChildFault(spec: string | undefined, self: 'run-host' | 'workspace-service', timers: Timers): { readonly silent: boolean; readonly slowMs: number } {
  const [target, fault, after] = (spec ?? '').split(':');
  if (target !== self) return { silent: false, slowMs: 0 };
  const afterMs = millis(after === undefined || after === '' || !Number.isFinite(Number(after)) ? 3_000 : Number(after));
  if (fault === 'uncaught') timers.after(afterMs, () => { throw new Error(`child fault: an uncaught throw in the ${self}, by the verification seam`); });
  if (fault === 'rejection') timers.after(afterMs, () => { void Promise.reject(new Error(`child fault: an unhandled rejection in the ${self}, by the verification seam`)); });
  return { silent: fault === 'silent', slowMs: fault === 'slow' ? afterMs : 0 };
}

/**
 * Verification only, for `injectChildFault`'s `slow`: a message handler that holds every message it is given for the first
 * `ms` from now, then handles the held ones in the order they came and every later one at once. `ms` 0 is the handler
 * itself.
 */
export function holdMessagesFor<E>(handle: (message: E) => void, ms: number, timers: Timers): (message: E) => void {
  if (ms <= 0) return handle;
  let held: E[] | null = [];
  timers.after(millis(ms), () => { const due = held ?? []; held = null; for (const m of due) handle(m); });
  return (message) => { if (held === null) handle(message); else held.push(message); };
}

/** The part of Node's `process` a utility process's supervision reads. */
export interface UtilityProcessSelf extends LastResortProcess {
  readonly ppid: number;
}

/**
 * Both ends at once, as each entry installs them first thing: the last-resort handler, and the parent watch that exits
 * with `PARENT_GONE_EXIT_STATUS`.
 */
export function superviseUtilityProcess(deps: {
  readonly process: UtilityProcessSelf;
  readonly name: string;
  readonly logError: (message: string) => void;
  readonly timers: Timers;
  readonly periodMs?: Millis;
  readonly probe?: (pid: number) => Liveness;
}): TimerHandle {
  installLastResort(deps);
  const self = deps.process;
  return watchParent({
    parentPid: self.ppid,
    currentParentPid: () => self.ppid,
    timers: deps.timers,
    ...(deps.periodMs === undefined ? {} : { periodMs: deps.periodMs }),
    ...(deps.probe === undefined ? {} : { probe: deps.probe }),
    onGone: () => { self.exit(PARENT_GONE_EXIT_STATUS); },
  });
}
