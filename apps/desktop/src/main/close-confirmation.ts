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
 * When it is asked (OQ-206): on a person's close of a main window that leaves no other main window open, since only that
 * close ends a run (the run host keeps executing while any main window stays, REQ-STARTUP-161), with the run host's
 * instance-wide count (sessions are not keyed by workspace, as at REQ-SHELL-021's gate 3 and OQ-86). A quit Electron
 * starts on its own account (`before-quit`: SIGTERM, the desktop's logout, the driver's `app.quit()`) is not a
 * user-initiated close in REQ-SHELL-119's sense and is not asked.
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
export function activeRunCloseBox(activeRuns: number | null): { type: 'warning'; title: string; message: string; detail: string; buttons: string[]; defaultId: 0; cancelId: 0; noLink: true } {
  const question = activeRunCloseTitle(activeRuns);
  return { type: 'warning', title: question, message: question, detail: activeRunCloseDetail(activeRuns), buttons: ['Cancel', 'Yes'], defaultId: 0, cancelId: 0, noLink: true };
}

/**
 * OQ-206's reading: whether another main window stays open once the window `closing` closes. A window already destroyed,
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
  /** Whether another main window stays open after this close (then nothing ends, and nothing is asked). */
  readonly othersStaying: () => boolean;
  /** The run host's instance-wide count; `null` when it cannot be read, which asks. */
  readonly activeRuns: () => Promise<number | null>;
  /** Shows the box and answers the index of the button chosen. */
  readonly ask: (box: ReturnType<typeof activeRunCloseBox>) => Promise<number>;
  readonly log: (message: string) => void;
}

/**
 * REQ-STARTUP-046: true when the close may go on. No run active, or another window staying, asks nothing; otherwise the
 * box is asked, and only Yes goes on (REQ-SHELL-119, "any answer other than Yes aborts the close"). A count that cannot be
 * read is a run active, and a box that cannot be shown is the returning answer, as at the update's close (OQ-86).
 */
export async function confirmActiveRunClose(deps: ActiveRunCloseDeps): Promise<boolean> {
  if (deps.othersStaying()) return true;
  const activeRuns = await deps.activeRuns().catch(() => null);
  if (activeRuns === 0) return true;
  const answer = await deps.ask(activeRunCloseBox(activeRuns)).catch((cause: unknown) => {
    deps.log(`close: the active-run confirmation could not be shown (${cause instanceof Error ? cause.message : String(cause)}); the window stays (REQ-STARTUP-046)`);
    return 0;
  });
  const proceed = answer === CLOSE_ANYWAY;
  deps.log(`close: active-run confirmation (${activeRuns === null ? 'run count unknown' : `${activeRuns} active`}) → ${proceed ? 'close anyway' : 'return to the window; the close is aborted and the run keeps executing'} (REQ-STARTUP-046, REQ-SHELL-119)`);
  return proceed;
}
