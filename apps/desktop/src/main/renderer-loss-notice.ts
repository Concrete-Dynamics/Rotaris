import type { ReportInput } from './notices.js';
import { RENDERER_RELOAD_BOUND_MS, type RendererLoss, type RendererLossOutcome } from './main-windows.js';

/**
 * A MAIN WINDOW WHOSE RENDERER WAS LOST, TOLD (R-091, hardening §3.2 row 5; REQ-NOTIFY-001, REQ-NOTIFY-003, REQ-NOTIFY-005,
 * REQ-NOTIFY-023).
 *
 * Until 2026-11-04 a renderer lost (`render-process-gone`) was detached from the relay and written to the log, and the window
 * stayed open and blank, with no reload and nothing said. `MainWindows` now reloads it once within `RENDERER_RELOAD_BOUND_MS`
 * and leaves it as it is after a second loss inside that bound; this module holds every word the person reads about it. Pure,
 * so its test reads the notice whole. The notice is persistent, at `error`, with no action: what it reports is a failure, its
 * headline is plain words, and the reason and exit code Electron gave are in the detail block (REQ-NOTIFY-005). A renderer's
 * loss is not a run's: the message says runs go on, because the run host is not touched.
 */
export function rendererLossNotice(loss: RendererLoss, outcome: RendererLossOutcome, window: { readonly wcId: number; readonly workspace: string }, error?: string): ReportInput {
  const detail = [
    `The renderer process was gone: ${loss.reason}, exit code ${loss.exitCode}.`,
    `Window: main window ${window.wcId}, ${window.workspace}.`,
    outcome === 'reloaded'
      ? `The window was reloaded once; a second loss within ${RENDERER_RELOAD_BOUND_MS / 1000} s leaves it as it is.`
      : outcome === 'left'
        ? `The window was reloaded less than ${RENDERER_RELOAD_BOUND_MS / 1000} s ago and is not reloaded again.`
        : `The reload failed: ${error ?? 'no reason was given'}.`,
  ].join('\n');
  switch (outcome) {
    case 'reloaded':
      return { severity: 'error', title: 'This window stopped and was reloaded', message: 'The part of Rotaris that draws this window ended unexpectedly, and the window was loaded again. Runs were not affected.', detail, persistent: true };
    case 'left':
      return { severity: 'error', title: 'This window stopped again and was not reloaded', message: 'The window ended unexpectedly again soon after it was reloaded, so it was left as it is. Close it and open the project again. Runs were not affected.', detail, persistent: true };
    case 'reload-failed':
      return { severity: 'error', title: 'This window stopped and could not be reloaded', message: 'The part of Rotaris that draws this window ended unexpectedly, and loading it again failed. Close it and open the project again. Runs were not affected.', detail, persistent: true };
  }
}
