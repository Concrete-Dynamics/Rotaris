import type { ProcessEvent, ProcessReply } from '@rotaris/contracts';
import { millis, type Timers } from '@rotaris/kernel';
import type { AppLogLevel } from './app-log.js';

/**
 * An immediate exit (`app.exit`) that does not crash on Linux.
 *
 * Electron on Linux (X11) segfaults when `app.exit` runs while a modal child window is still open: measured
 * 2026-09-24 with an eleven-line app — a parent and one `modal: true` child, then `app.exit(0)` — which ends
 * `SIGSEGV` (exit 139) every time, and exits 0 with no child, with the child destroyed a moment before, or through
 * `app.quit()`. Destroying the child in the same tick as the exit is not enough; waiting for its `closed` event
 * and then exiting on the next turn is. Every live-run sign-in on Linux crashed this way, because the capture seam
 * exits over the still-open provider dialog (`docs/defects/fixed/the-app-segfaults-on-quit-after-adding-a-provider-on-headless-linux.md`).
 *
 * The user's own quit goes through `app.quit()` and never reached this. What does is every path that ends the
 * process at once: the capture seam and the driver's `quit`.
 */
export interface ClosableWindow {
  isDestroyed(): boolean;
  getParentWindow(): unknown;
  once(event: 'closed', listener: () => void): unknown;
  destroy(): void;
}

export interface ExitDeps {
  readonly windows: () => readonly ClosableWindow[];
  readonly exit: (code: number) => void;
  readonly timers: Timers;
  /** The next turn of the event loop, after the windows' teardown has run. */
  readonly nextTurn: (fn: () => void) => void;
}

/**
 * PD-ORCH-005 clause 9: the application's quit, as main can tell it. A quit is the process exiting at once
 * (`exitCleanly`), or every main window's close confirmed by its guard; a quit Electron starts on its own account
 * (SIGTERM, the desktop's logout where Electron emits `before-quit`, `app.quit()`) is turned into the second before any
 * window closes (`before-quit` in `index.ts`); on Windows, where a logout or shutdown emits no `before-quit`, the session's
 * end marks the first (`SessionEndShutdown`, below). While it is under way, what a closing surface would send as a person's answer — REQ-TOOLS-063's Deny
 * for an approval dialog, REQ-CHAT-101's cancellation from the question dock — is the quit's, and is not sent: the run
 * host's `shutdown` withdraws the approval or the question instead, and a withdrawal is never recorded as an answer.
 * Before this, the last window's close denied the call first, and the agent took one more model step on the denial
 * (`docs/defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md`).
 */
export class QuitState {
  #exiting = false;
  readonly #closing = new Set<number>();
  /** PD-SHELL-009: the sessions a window's close stopped whose run has not yet ended (its `run.result` not yet seen). */
  readonly #stoppedByClose = new Set<string>();
  /** How many `run.result` events main has seen, and when (in that count) each session's last one came. */
  #results = 0;
  readonly #lastResult = new Map<string, number>();

  /** The process is about to exit at once. */
  exiting(): void { this.#exiting = true; }
  /** A main window's close was confirmed by its guard and is under way. */
  closeConfirmed(wcId: number): void { this.#closing.add(wcId); }
  isClosing(wcId: number): boolean { return this.#closing.has(wcId); }
  /** Whether the application is quitting: the process exiting, or no main window staying. */
  quitting(mainWindows: readonly { readonly wcId: number; readonly destroyed: boolean }[]): boolean {
    return this.#exiting || mainWindows.every((w) => w.destroyed || this.#closing.has(w.wcId));
  }

  /**
   * PD-SHELL-009: the mark a window close's stop is asked at (`runs.stopWorkspace`), handed back to `stoppedByClose` with
   * the reply, so a stopped run whose end reached main before the reply is known to have ended already.
   */
  stopAsked(): number { return this.#results; }
  /**
   * PD-SHELL-009: the close of one of several main windows stopped these sessions' runs (`runs.stopWorkspace`) before the
   * window closed. Like the quit's shutdown, that stop withdraws what they wait on (PD-ORCH-005 clause 9): an approval
   * dialog or a question dock the closing window held for one of them answers nothing as it closes, and an approval queued
   * behind it is not reported unshown. And as REQ-STARTUP-046's last sentence has it, no notice of theirs appears on the
   * window that stays while they come to rest.
   *
   * Each is held until ITS RUN's end — the `run.result` the run host sends once per run, after the reply for every run the
   * stop took, since the stop takes only a run whose end is not yet written (`Sessions.stopActiveIn`). A published status
   * was read here before (fin28): a status names no run, so "inactive" could not tell the stop's rest from a run stopped
   * before it had saved its first status (one released from the plan gate, or continued), whose `cancelling` then ended
   * the hold (`docs/defects/fixed/a-window-close-registers-a-stopped-session-by-the-status-main-last-saw.md`). A run whose
   * end reached main between `asked` (`stopAsked`) and the reply has ended already, and nothing is held for it.
   */
  stoppedByClose(sessionIds: readonly string[], asked: number): void {
    for (const id of sessionIds) if ((this.#lastResult.get(id) ?? 0) <= asked) this.#stoppedByClose.add(id);
  }
  /** Whether the session's waits are the window close's stop to withdraw, and its notices held back. */
  withdrawnByClose(sessionId: string): boolean {
    return this.#stoppedByClose.has(sessionId);
  }

  /**
   * The run host's events, as a window close's stop concerns them (`runHost.onEvent` in `index.ts` asks this of every
   * event before routing it). A notice for a session the close stopped is held back from the windows that stay, as
   * REQ-STARTUP-046's last sentence has it, and so is the stopped run's own outcome (`run.result`, whose notice main would
   * raise): that is the rest's own notice, and the hold ends with it, so a session never continued has its later notices
   * relayed again and a later run the person starts is its own
   * (`docs/defects/fixed/a-stopped-session-that-is-never-continued-keeps-its-notices-held.md`). Answers whether main holds
   * the event's notice back rather than relays it; main still does everything else a `run.result` asks.
   */
  holdsBack(e: ProcessEvent): boolean {
    if (e.kind === 'run.result') {
      this.#results += 1;
      this.#lastResult.set(e.sessionId, this.#results);
      return this.#stoppedByClose.delete(e.sessionId);
    }
    return e.kind === 'notice.publish' && this.withdrawnByClose(e.sessionId);
  }

  /**
   * The approvals a closing main window held unshown that main reports to the run host as unshown (`approval.shown`, not
   * ok). None while the application quits (PD-ORCH-005 clause 9: the shutdown withdraws them), and none of a session the
   * window's close stopped (PD-SHELL-009: the stop withdraws them).
   */
  unshownToReport<T extends { readonly session_id: string }>(approvals: readonly T[], quitting: boolean): readonly T[] {
    return quitting ? [] : approvals.filter((a) => !this.withdrawnByClose(a.session_id));
  }
}

/**
 * PD-ORCH-005 clause 9: a quit Electron starts on its own account closes the main windows through their guards, all or
 * none. Every guard is asked first; only when every one allows is every close confirmed, and only then is any window
 * closed — so no window's dialog closes while another main window's guard is still undecided, which would leave
 * `QuitState` seeing a window that stays (found by phase 7's second review). A guard that refuses closes nothing, which
 * is what a refused close has always meant. Answers whether the windows are closing.
 */
export async function closeThroughGuards(guards: readonly { ask(): Promise<boolean>; confirm(): void; close(): void }[]): Promise<boolean> {
  const allowed = await Promise.all(guards.map((g) => g.ask()));
  if (allowed.some((a) => !a)) return false;
  for (const g of guards) g.confirm();
  for (const g of guards) g.close();
  return true;
}

/**
 * REQ-SHELL-121 on Windows: a logout, a restart or a shutdown of the desktop session ends the application without
 * `before-quit` or `will-quit` (Electron's typings: neither "will be emitted if the app is closed due to a
 * shutdown/restart of the system or a user logout"), so the orderly shutdown those hang on — the main windows' guarded
 * close, then `window-all-closed`'s shutdown of the children, the run host's resting every run under PD-ORCH-005 clause 3
 * — never ran, and the runs were left as a crash leaves them. Electron's documented hook for that end is a window's
 * `session-end` (Windows only): "Emitted when a session is about to end due to a shutdown, machine restart, or user
 * log-off. Once this event fires, there is no way to prevent the session from ending." So on the first `session-end`
 * of any main window the quit is marked as the process's own exit (`QuitState.exiting`: what a closing dialog or dock
 * would send as an answer is the shutdown's to withdraw, PD-ORCH-005 clause 9), the same orderly shutdown
 * `window-all-closed` runs starts at once, and the process exits when it is done. No guard is asked and no box is shown:
 * the session's end cannot be refused, as a quit outside any window asks nothing (PD-SHELL-009). Every main window
 * reports the event; the shutdown runs once
 * (`docs/defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md`).
 */
export class SessionEndShutdown {
  #begun: Promise<void> | null = null;

  constructor(private readonly deps: {
    readonly quit: QuitState;
    /** The orderly shutdown `window-all-closed` runs (memoized there: it runs once whichever starts it). */
    readonly shutdown: () => Promise<void>;
    /** The process's exit once the shutdown is done. */
    readonly exit: () => void;
    readonly log: (message: string, level?: AppLogLevel) => void;
  }) {}

  /** A main window's `session-end`, with the reasons Windows gave. Answers when the shutdown is done. */
  sessionEnding(reasons: readonly string[]): Promise<void> {
    if (this.#begun !== null) return this.#begun;
    this.deps.quit.exiting();
    this.deps.log(`quit: the desktop session is ending (${reasons.length === 0 ? 'no reason given' : reasons.join(', ')}); the orderly shutdown runs now, asking nothing (REQ-SHELL-121)`);
    this.#begun = this.deps.shutdown()
      .catch((cause: unknown) => { this.deps.log(`quit: the orderly shutdown at the session's end failed (${String(cause)})`, 'error'); })
      .then(() => { this.deps.exit(); });
    return this.#begun;
  }
}

/**
 * REQ-TOOLS-063 under PD-ORCH-005 clause 9: an approval dialog that closed unanswered answers Deny unless the quit closed it,
 * or (PD-SHELL-009) its window's close stopped the run that asked it — the stop withdraws it instead.
 */
export function dialogCloseAnswersDeny(state: { readonly answered: boolean; readonly quitting: boolean; readonly withdrawnByClose?: boolean }): boolean {
  return !state.answered && !state.quitting && state.withdrawnByClose !== true;
}

/** A child window that never reports `closed` must not hold the process open: the exit happens regardless. */
export const CHILD_CLOSE_BOUND_MS = 2_000;

export function exitAfterChildWindows(deps: ExitDeps, code: number): void {
  const children = deps.windows().filter((w) => !w.isDestroyed() && w.getParentWindow() !== null);
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    deps.nextTurn(() => deps.exit(code));
  };
  if (children.length === 0) { finish(); return; }
  let open = children.length;
  const bound = deps.timers.after(millis(CHILD_CLOSE_BOUND_MS), finish);
  for (const w of children) {
    w.once('closed', () => { open -= 1; if (open === 0) { bound.cancel(); finish(); } });
    w.destroy();
  }
}

/**
 * A child process's exit, watched from the moment it is forked so the event can never be missed: `exited` settles with
 * the exit code, and `code` reads it synchronously once it has (`null` while the child runs).
 */
export interface ChildExit {
  readonly exited: Promise<number>;
  readonly code: number | null;
}

export function watchChildExit(child: { once(event: 'exit', listener: (code: number) => void): unknown }): ChildExit {
  let code: number | null = null;
  const exited = new Promise<number>((resolve) => { child.once('exit', (c) => { code = c; resolve(c); }); });
  return { exited, get code() { return code; } };
}

/**
 * A child's `shutdown` at quit, raced against the child's own exit (PD-MONITOR-002; defect
 * `docs/defects/fixed/a-childs-shutdown-ack-can-lose-the-race-with-its-exit.md`).
 *
 * The run host answers `shutdown` and then exits on a 0 ms timer, and its reply is posted asynchronously, so the exit
 * sometimes arrives and the answer never does: measured 3 quits in 26. Waiting on the answer alone then stalled the quit
 * for the whole bound and reported an orderly end as a failure. So the exit counts as an answer:
 *
 * - answered `ack` → nothing to say;
 * - answered anything else → `notCompleted`: a child whose `shutdown` threw (a store that would not release, a
 *   connection that would not close) answers `refused` rather than staying silent, has not closed what it holds and has
 *   not scheduled its exit, and Electron's teardown will then report 0 — so this answer is the only record of it;
 * - the child exits first → nothing more: 0 is the orderly end whose answer was lost, and any other status has already
 *   been written, at `error`, by that child's exit handler;
 * - the request fails (its bound elapsed) while the child still runs → `notCompleted`, once;
 * - the child was gone before the quit began → nothing is asked, and this resolves at once.
 *
 * The request is never left to reject unobserved, whichever side of the race loses.
 */
export async function shutdownAtQuit(request: () => Promise<ProcessReply>, exit: ChildExit, notCompleted: (cause: unknown) => void): Promise<void> {
  if (exit.code !== null) return;
  const answer = Promise.resolve().then(request).then(
    (reply) => (reply.kind === 'ack' ? { failed: false as const } : { failed: true as const, cause: new Error(unacknowledged(reply)) }),
    (cause: unknown) => ({ failed: true as const, cause }),
  );
  const outcome = await Promise.race([answer, exit.exited.then(() => null)]);
  if (outcome === null || !outcome.failed || exit.code !== null) return;
  notCompleted(outcome.cause);
}

/** What a `shutdown` answer other than `ack` said, for the line that reports it. */
function unacknowledged(reply: ProcessReply): string {
  return reply.kind === 'refused' ? `refused (${reply.code}): ${reply.headline}` : `answered '${reply.kind}' rather than 'ack'`;
}

/**
 * How long main waits for the run host to be gone at its own end, once when the run host is expected to exit by itself
 * and once more after it has been ended (`endBeforeMain`). Measured on Linux: a run host main does not wait for
 * outlived main by 1.7–1.8 s in two launches of three when the launch ended through `app.exit`; one that has answered
 * its `shutdown` exits on a 0 ms timer, and one that is ended exits at once.
 */
export const RUN_HOST_END_BOUND_MS = 2_000;

/**
 * Main is gone only after the run host is (`docs/defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md`).
 *
 * The run host holds every session lock this instance holds, keyed on its own pid, and a lock is proved unheld only when
 * that pid probes dead (REQ-SESSION-047, REQ-SESSION-056). A run host that outlives main therefore keeps each session it
 * held refused to the next launch — "held by another run in this application" — for as long as it takes to exit, although
 * no run holds it and the application that did is gone. So main's end waits for the run host's exit, bounded, and ends
 * the run host itself when it has not exited: then a launch that becomes the instance after this one (REQ-STARTUP-161,
 * REQ-STARTUP-164) finds the pid dead, and the lock is reaped by the one path that exists for a lock whose holder is gone.
 *
 * This is not the race `shutdownAtQuit` runs, and does not undo it: that race is over the `shutdown` ANSWER, which can be
 * lost to the exit, and it lets the exit count as the answer. Nothing there argues against waiting for the exit itself;
 * after an answered `shutdown` the run host exits on a 0 ms timer, so the wait costs that timer on an orderly quit.
 *
 * - the child has already exited → nothing, at once;
 * - `graceMs` > 0 (the orderly quit, after its `shutdown`) → wait that long for the exit, and end the child only if it
 *   has not come;
 * - `graceMs` = 0 (an immediate exit — the capture seam, the driver's `quit`: nothing was asked of the run host) → end
 *   it at once, which is what Electron's own teardown does anyway, only later;
 * - then wait `boundMs` for the exit; `stillRunning` is called, once, only when it has not come by then, and this
 *   resolves regardless — nothing here may hold main open for ever. Never rejects.
 *
 * Ending the run host this way leaves its locks in the store with a pid that is gone, exactly as a crash does; the next
 * claim reaps them (REQ-SESSION-047). Releasing them first from inside a run host that is still stopping was not taken:
 * holding the lock is what owning the session consists of (REQ-SESSION-050), a stopping run is still writing its
 * history under it, and REQ-SESSION-049 orders the release after the session's long-lived services are torn down.
 */
export async function endBeforeMain(
  child: { kill(): boolean },
  exit: ChildExit,
  timers: Timers,
  bounds: { readonly graceMs: number; readonly boundMs: number },
  stillRunning: () => void,
): Promise<void> {
  if (exit.code !== null) return;
  if (bounds.graceMs > 0 && await exitedWithin(exit, bounds.graceMs, timers)) return;
  try { child.kill(); } catch { /* already gone, or not ours to end: the wait below says which */ }
  if (await exitedWithin(exit, bounds.boundMs, timers)) return;
  stillRunning();
}

/** Whether the child's exit arrives within `ms` on the timer port (at once when it already has). */
function exitedWithin(exit: ChildExit, ms: number, timers: Timers): Promise<boolean> {
  if (exit.code !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const bound = timers.after(millis(ms), () => resolve(false));
    void exit.exited.then(() => { bound.cancel(); resolve(true); });
  });
}

/** What Electron's `child-process-gone` carries that the line reads. */
export interface ChildGone {
  readonly type: string;
  readonly name?: string | undefined;
  readonly reason: string;
  readonly exitCode: number;
}

/**
 * PD-MONITOR-002: a child process gone for any reason but `clean-exit` is a loss, written at `error` — except one main
 * ended itself (live-run finding L13, `docs/defects/fixed/an-orderly-quit-logs-the-run-host-gone-at-error.md`).
 *
 * An immediate exit (the capture seam, the driver's `quit`) ends the run host at once through `endBeforeMain`, and one
 * whose `shutdown` went unanswered past the grace is ended the same way. Electron then reports the end `killed` — exit 15,
 * the SIGTERM `kill()` sends — after the run host's own `exit` event has already said 0. Written at `error`, it made an
 * orderly quit end on an `error` line in 9 of the 11 launches of the live runs of 2026-09-29. So the kill is recorded
 * here, by the child's service name, as main sends it, and Electron's report of that end is written at `info` and says
 * main ended it. A child killed by anything else (a SIGKILL from outside was the first execution's measured loss), a
 * child that crashed, and one main never ended stay at `error`. A loss that main's kill papers over is not hidden:
 * the unanswered `shutdown` and the run host still running past its bound are written at `error` on the quit path.
 */
export class ChildrenEndedByMain {
  readonly #ended = new Set<string>();

  /** `child` whose `kill` is recorded under `name` — the service name Electron reports it by — before it is sent. */
  endable(name: string, child: { kill(): boolean }): { kill(): boolean } {
    return { kill: () => { this.#ended.add(name); return child.kill(); } };
  }

  /** The line for Electron's report of a child gone, and its level. */
  gone(details: ChildGone): { readonly level: AppLogLevel; readonly message: string } {
    const message = `CHILD PROCESS GONE (${details.type}${details.name === undefined ? '' : ` ${details.name}`}: ${details.reason}, exit ${details.exitCode})`;
    if (details.reason === 'clean-exit') return { level: 'info', message };
    if (details.reason === 'killed' && details.name !== undefined && this.#ended.has(details.name)) return { level: 'info', message: `${message}; main ended it at its exit` };
    return { level: 'error', message };
  }
}
