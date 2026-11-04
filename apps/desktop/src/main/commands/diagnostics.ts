import { shell } from 'electron';
import type { CommandOutcome, DiagnosticsCardState } from '@rotaris/contracts';
import type { DiagnosticsCaptures } from '../diagnostics.js';
import { openFolder } from '../open-folder.js';
import type { CommandContext, CommandHandlers, MainWindowState } from './context.js';

/**
 * DIAGNOSTICS — Settings › About's diagnostics card (REQ-SHELL-163) over the one source REQ-STARTUP-129 names, the
 * preference store. Every answer is for the window that asked: its own capture, fixed when it was built, and the folder in
 * force for it — the chosen one, else the default fixed when it was built, the per-user one for a window built with no
 * workspace (PD-STARTUP-011). A level or a folder chosen here is stored and reaches the windows built afterwards; the asking window's
 * capture is not touched (`diagnostics.ts`).
 */
export function diagnosticsCommands(
  ctx: Pick<CommandContext, 'capturing' | 'chooseDirectory' | 'clocks' | 'diagnostics' | 'log' | 'preferences'>,
): Pick<CommandHandlers, 'diagnostics.state' | 'diagnostics.setLevel' | 'diagnostics.chooseOutputDir' | 'diagnostics.openRunDirectory'> {
  const { capturing, chooseDirectory, clocks, diagnostics, log, preferences } = ctx;
  const card = (w: MainWindowState): CommandOutcome => ({ ok: true, value: cardState(w, preferences.read('diagnostics/level'), preferences.read('diagnostics/outputDir'), diagnostics) });
  return {
    'diagnostics.state': (_req, { w }) => card(w),
    'diagnostics.setLevel': async (req, { w }) => {
      await preferences.write('diagnostics/level', req.level);
      log(`diagnostics: the level is now ${req.level} for windows built from now on`);
      return card(w);
    },
    /** REQ-SHELL-163: the folder comes from the platform chooser, limited to directories; a cancel changes nothing. */
    'diagnostics.chooseOutputDir': async (_req, { w }) => {
      const current = diagnostics.folderFor(w.wcId, preferences.read('diagnostics/outputDir'), workspaceOf(w));
      const chosen = await chooseDirectory(w.win, { title: 'Choose the diagnostics output folder', properties: ['openDirectory', 'createDirectory'], defaultPath: current });
      if (chosen !== null) {
        await preferences.write('diagnostics/outputDir', chosen);
        log(`diagnostics: the output folder is now ${chosen} for windows built from now on`);
      }
      return card(w);
    },
    /**
     * REQ-SHELL-163's third control: this window's run directory in the OS file manager, only while one exists for it.
     * Verification seam (only with ROTARIS_CAPTURE_PNG), as `workspace.openFolder`'s: `record` opens nothing and succeeds.
     */
    'diagnostics.openRunDirectory': async (_req, { w }) => {
      const capture = diagnostics.stateOf(w.wcId);
      if (capture.state !== 'active') return { ok: false, code: 'diagnostics.no-run-directory', headline: 'This window has no diagnostics run directory' };
      const path = capture.runDirectory;
      if (__ROTARIS_SEAMS__ && capturing && process.env['ROTARIS_CAPTURE_OPEN_EXTERNAL'] === 'record') { log(`capture: open-folder ${path}`); return { ok: true, value: { path } }; }
      const opened = await openFolder(path, (p) => shell.openPath(p), clocks.timers);
      if (!opened.ok) return { ok: false, code: 'folder.failed', headline: 'The diagnostics run directory could not be opened', detail: `${path} — ${opened.reason}` };
      return { ok: true, value: { path } };
    },
  };
}

/** The workspace a window was built for, or null for one that holds none. */
export function workspaceOf(w: Pick<MainWindowState, 'workspace'>): string | null {
  return w.workspace === '(no workspace)' || w.workspace === '' ? null : w.workspace;
}

/** REQ-SHELL-163's card for one window: the stored choices, the folder in force for it (PD-STARTUP-011), and its own capture. */
export function cardState(w: Pick<MainWindowState, 'wcId' | 'workspace'>, level: DiagnosticsCardState['level'], outputDir: string | undefined, diagnostics: Pick<DiagnosticsCaptures, 'stateOf' | 'folderFor'>): DiagnosticsCardState {
  return { level, folder: diagnostics.folderFor(w.wcId, outputDir, workspaceOf(w)), folderChosen: outputDir !== undefined, capture: diagnostics.stateOf(w.wcId) };
}
