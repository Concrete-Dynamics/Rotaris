import type { ProcessReply } from '@rotaris/contracts';
import { millis, type Timers } from '@rotaris/kernel';

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
 * (SIGTERM, the desktop's logout, `app.quit()`) is turned into the second before any window closes (`before-quit` in
 * `index.ts`). While it is under way, what a closing surface would send as a person's answer — REQ-TOOLS-063's Deny
 * for an approval dialog, REQ-CHAT-101's cancellation from the question dock — is the quit's, and is not sent: the run
 * host's `shutdown` withdraws the approval or the question instead, and a withdrawal is never recorded as an answer.
 * Before this, the last window's close denied the call first, and the agent took one more model step on the denial
 * (`docs/defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md`).
 */
export class QuitState {
  #exiting = false;
  readonly #closing = new Set<number>();

  /** The process is about to exit at once. */
  exiting(): void { this.#exiting = true; }
  /** A main window's close was confirmed by its guard and is under way. */
  closeConfirmed(wcId: number): void { this.#closing.add(wcId); }
  isClosing(wcId: number): boolean { return this.#closing.has(wcId); }
  /** Whether the application is quitting: the process exiting, or no main window staying. */
  quitting(mainWindows: readonly { readonly wcId: number; readonly destroyed: boolean }[]): boolean {
    return this.#exiting || mainWindows.every((w) => w.destroyed || this.#closing.has(w.wcId));
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

/** REQ-TOOLS-063 under PD-ORCH-005 clause 9: an approval dialog that closed unanswered answers Deny unless the quit closed it. */
export function dialogCloseAnswersDeny(state: { readonly answered: boolean; readonly quitting: boolean }): boolean {
  return !state.answered && !state.quitting;
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
