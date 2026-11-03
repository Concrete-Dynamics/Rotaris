import { z } from 'zod';

/**
 * Opt-in diagnostics (REQ-STARTUP-129 onward) as the renderer sees them: the three capture levels and the
 * diagnostics card of Settings › About (REQ-SHELL-163). Main owns the capture (`apps/desktop/src/main/diagnostics.ts`);
 * the renderer reads the card's state and sends the card's three gestures, and names no path and no window.
 */

/** REQ-STARTUP-129 / REQ-SHELL-163: exactly these three, `off` the default. `@rotaris/platform` holds the same list for the store. */
export const DIAGNOSTICS_LEVELS = ['off', 'light', 'deep'] as const;
export type DiagnosticsLevel = (typeof DIAGNOSTICS_LEVELS)[number];

/** The capture of the window that asked: none, one writing into its run directory, or one that could not start. */
export type DiagnosticsCapture =
  | { readonly state: 'off' }
  | { readonly state: 'active'; readonly level: Exclude<DiagnosticsLevel, 'off'>; readonly runDirectory: string }
  /** REQ-STARTUP-131: the window opened with diagnostics inactive, and the card says why rather than the launch failing. */
  | { readonly state: 'inactive'; readonly level: Exclude<DiagnosticsLevel, 'off'>; readonly reason: string };

/** REQ-SHELL-163's card, as `diagnostics.state` answers it for the window that asked. */
export interface DiagnosticsCardState {
  /** The stored level: what windows built from now on capture at (REQ-STARTUP-129). */
  readonly level: DiagnosticsLevel;
  /**
   * The folder in force: the chosen one, else this window's default location (REQ-STARTUP-131,
   * `<workspace>/.rotaris/diagnostics/rotaris`), or null where the window holds no workspace and none is chosen.
   */
  readonly folder: string | null;
  /** Whether `folder` is the person's choice (`diagnostics/outputDir`) rather than the default. */
  readonly folderChosen: boolean;
  /** This window's own capture, fixed when the window was built: a later choice never alters it (REQ-SHELL-163). */
  readonly capture: DiagnosticsCapture;
}

/**
 * The card's gestures. None names a path or a window: the level is one of the three (an invalid selection is
 * unreachable, REQ-SHELL-163), the folder comes from the platform chooser main opens, and the run directory opened is
 * the asking window's own. Each answers with the card's new `DiagnosticsCardState`, except the open, which answers
 * nothing on success.
 */
export const DIAGNOSTICS_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('diagnostics.state') }),
  z.object({ kind: z.literal('diagnostics.setLevel'), level: z.enum(DIAGNOSTICS_LEVELS) }),
  z.object({ kind: z.literal('diagnostics.chooseOutputDir') }),
  z.object({ kind: z.literal('diagnostics.openRunDirectory') }),
] as const;
