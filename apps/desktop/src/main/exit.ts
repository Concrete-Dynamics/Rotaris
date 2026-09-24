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
