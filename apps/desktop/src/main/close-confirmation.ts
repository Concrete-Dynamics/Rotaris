/**
 * REQ-STARTUP-046 with REQ-SHELL-119's third guard: the confirmation a main window's close asks while a run is active.
 *
 * REQ-SHELL-119 fixes the question ("Quit while a run is active?", "Quit while {n} runs are active?"), the two answers
 * (Yes and Cancel, Cancel the default) and that the box states Rotaris will request shutdown of the run and in-flight work
 * may not finish; REQ-STARTUP-046 fixes what it conveys (a run is still executing, closing ends it, the alternative is to
 * return and let it finish) and that Escape and the box's close control are the returning answer (`cancelId`,
 * REQ-SHELL-055). Under PD-ORCH-005 clause 3 the quit's shutdown leaves the run's unfinished agents `paused`; the box says
 * the run is stopped, which is what the shutdown does, and adds nothing beyond REQ-STARTUP-046's three things.
 *
 * When it is asked (PD-SHELL-009, ruling OQ-206 under R-072): closing a main window ends the active runs of the project open
 * in it. A person's close of the LAST main window asks REQ-SHELL-119's question while the run host counts any run active in
 * the instance, as before; the quit's shutdown stops them. A close of one of SEVERAL main windows asks "Close this window
 * while a run is active?" while that window's own workspace has a run active (the run host's count keyed by workspace), and
 * its Yes stops those runs as the stop control does before the window closes (PD-ORCH-005 clauses 3, 9, 10 and 21: the
 * agents rest `paused` by `stop` and Continue resumes them). A window with no active run of its own closes without asking.
 * A quit that starts outside any window (`before-quit`: a signal, the end of the desktop session where Electron emits it,
 * the driver's or the capture's `app.quit()`) is not a person's close of a window and asks no active-run confirmation — and,
 * since OQ-298's ruling (2026-10-14, R-072), no unsaved-settings guard either (REQ-SHELL-119 guard (1) and REQ-CONFIG-287 are a
 * user-initiated close's): unsaved settings stay unsaved (`quitGuardsOutsideAnyWindow`, `exit.ts`). On
 * Windows, Electron emits no `before-quit` at a logout or shutdown at all; a main window's `session-end` starts the orderly
 * shutdown there instead, asking nothing (`SessionEndShutdown`, `exit.ts`;
 * `docs/defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md`).
 */

/** The answer `1` is Yes, "close anyway"; `0`, Cancel, is the default and what Escape and the close control give. */
export const CLOSE_ANYWAY = 1;

export const activeRunCloseTitle = (activeRuns: number | null): string =>
  activeRuns !== null && activeRuns > 1 ? `Quit while ${activeRuns} runs are active?` : 'Quit while a run is active?';

export const activeRunCloseDetail = (activeRuns: number | null): string => {
  const many = activeRuns !== null && activeRuns > 1;
  return `${many ? `${activeRuns} runs are` : 'A run is'} still executing. Closing this window ends ${many ? 'them' : 'it'}: Rotaris will request shutdown of the ${many ? 'runs' : 'run'}, and work in flight may not finish. Choose Cancel to return to the window and let ${many ? 'them' : 'it'} finish.`;
};

/** The message box main shows (Electron's `MessageBoxOptions`): Cancel first, the default and the `cancelId`. */
export interface ActiveRunBox { type: 'warning'; title: string; message: string; detail: string; buttons: string[]; defaultId: 0; cancelId: 0; noLink: true }

export function activeRunCloseBox(activeRuns: number | null): ActiveRunBox {
  const question = activeRunCloseTitle(activeRuns);
  return { type: 'warning', title: question, message: question, detail: activeRunCloseDetail(activeRuns), buttons: ['Cancel', 'Yes'], defaultId: 0, cancelId: 0, noLink: true };
}

/** PD-SHELL-009: the question at the close of one of several main windows, about the runs of its own project. */
export const windowCloseTitle = (activeRuns: number | null): string =>
  activeRuns !== null && activeRuns > 1 ? `Close this window while ${activeRuns} runs are active?` : 'Close this window while a run is active?';

export const windowCloseDetail = (activeRuns: number | null): string => {
  const many = activeRuns !== null && activeRuns > 1;
  return `${many ? `${activeRuns} runs are` : 'A run is'} still executing in this project. Closing this window ends ${many ? 'them' : 'it'}: Rotaris will stop the ${many ? 'runs' : 'run'}, and work in flight may not finish. Choose Cancel to return to the window and let ${many ? 'them' : 'it'} finish.`;
};

/** PD-SHELL-009's box: REQ-STARTUP-046's two answers, Cancel first, the default and the `cancelId`, as the last close's. */
export function windowCloseBox(activeRuns: number | null): ActiveRunBox {
  const question = windowCloseTitle(activeRuns);
  return { type: 'warning', title: question, message: question, detail: windowCloseDetail(activeRuns), buttons: ['Cancel', 'Yes'], defaultId: 0, cancelId: 0, noLink: true };
}

/**
 * PD-SHELL-009: whether another main window stays open once the window `closing` closes. A window already destroyed,
 * or one whose close its guard has already confirmed (`QuitState.isClosing`, `exit.ts`), does not stay.
 */
export function anotherMainWindowStays(
  windows: readonly { readonly wcId: number; readonly win: { isDestroyed(): boolean } }[],
  closing: number,
  isClosing: (wcId: number) => boolean,
): boolean {
  return windows.some((m) => m.wcId !== closing && !m.win.isDestroyed() && !isClosing(m.wcId));
}

export interface ActiveRunCloseDeps {
  /** Whether another main window stays open after this close (then the close ends only its own workspace's runs). */
  readonly othersStaying: () => boolean;
  /** The run host's instance-wide count; `null` when it cannot be read, which asks. */
  readonly activeRuns: () => Promise<number | null>;
  /** The run host's count for the closing window's workspace; absent for a window that holds no workspace. */
  readonly workspaceRuns?: (() => Promise<number | null>) | undefined;
  /** Stops the closing window's workspace's active runs as the stop control does, and resolves once the run host took it. */
  readonly stopWorkspaceRuns?: (() => Promise<void>) | undefined;
  /** Shows the box and answers the index of the button chosen. */
  readonly ask: (box: ActiveRunBox) => Promise<number>;
  readonly log: (message: string) => void;
}

/**
 * REQ-STARTUP-046 under PD-SHELL-009: true when the close may go on. At the last main window, no run active in the instance
 * asks nothing; otherwise REQ-SHELL-119's box is asked. At one of several, a window that holds no workspace, or whose
 * workspace has no run active, asks nothing; otherwise the window's box is asked, and its Yes stops those runs before the
 * close goes on (a stop that fails is logged and the close still goes on). Only Yes goes on (REQ-SHELL-119, "any answer
 * other than Yes aborts the close"). A count that cannot be read is a run active, and a box that cannot be shown is the
 * returning answer, as at the update's close (OQ-86).
 */
export async function confirmActiveRunClose(deps: ActiveRunCloseDeps): Promise<boolean> {
  const others = deps.othersStaying();
  if (others && deps.workspaceRuns === undefined) return true;
  const activeRuns = await (others ? deps.workspaceRuns!() : deps.activeRuns()).catch(() => null);
  if (activeRuns === 0) return true;
  const answer = await deps.ask(others ? windowCloseBox(activeRuns) : activeRunCloseBox(activeRuns)).catch((cause: unknown) => {
    deps.log(`close: the active-run confirmation could not be shown (${cause instanceof Error ? cause.message : String(cause)}); the window stays (REQ-STARTUP-046)`);
    return 0;
  });
  const proceed = answer === CLOSE_ANYWAY;
  const count = activeRuns === null ? 'run count unknown' : `${activeRuns} active${others ? ' in this window\'s project' : ''}`;
  deps.log(`close: active-run confirmation (${count}) → ${proceed ? 'close anyway' : 'return to the window; the close is aborted and the run keeps executing'} (REQ-STARTUP-046, ${others ? 'PD-SHELL-009' : 'REQ-SHELL-119'})`);
  if (proceed && others && deps.stopWorkspaceRuns !== undefined) {
    await deps.stopWorkspaceRuns().catch((cause: unknown) => {
      deps.log(`close: the window's runs could not be stopped (${cause instanceof Error ? cause.message : String(cause)}); the close goes on (PD-SHELL-009)`);
    });
  }
  return proceed;
}
