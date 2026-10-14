import { SKIP_WRITE_FAILED } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { type CommandContext, type CommandHandlers, type MainWindowState } from './context.js';

/**
 * The workspace a window holds, by the canonical root the coordinator keys it by (`initialization.open`, from main's
 * `openWorkspaceInner`). A window with none answers for nothing: the sentinel is never a coordinator's key.
 */
const rootOf = (w: MainWindowState): string => (w.workspace === '(no workspace)' ? w.workspace : canonicalPath(w.workspace));

export function initializationCommands(
  ctx: Pick<CommandContext, 'initialization'>,
): Pick<CommandHandlers, 'initialization.read' | 'initialization.resolve' | 'initialization.start' | 'initialization.skip' | 'initialization.cancel'> {
  const { initialization } = ctx;
  return {
    /*
     * Part AS — ADR-0064 (REQ-WORKSPACE-102, 105, 110, 111, 109, 115). Every answer is the whole state of the asking
     * window's own workspace, and the coordinator publishes it on channel 12 besides, to the windows holding that workspace
     * and no other, so a window that did not ask still catches up. With two main windows open (PD-SHELL-001) each acts on
     * its own workspace (REQ-WORKSPACE-013;
     * `docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`).
     */
    'initialization.read': async (_req, { w }) => {
      return { ok: true, value: await initialization.read(rootOf(w)) };
    },
    'initialization.resolve': async (_req, { w }) => {
      // REQ-WORKSPACE-102: a user-requested check is additional to the one automatic resolution per workspace open.
      return { ok: true, value: await initialization.resolve(rootOf(w), false) };
    },
    'initialization.start': async (_req, { w }) => {
      const root = rootOf(w);
      const r = await initialization.start(root);
      return r.ok ? { ok: true, value: await initialization.read(root) } : { ok: false, code: 'initialization.refused', headline: r.headline, ...(r.detail === '' ? {} : { detail: r.detail }) };
    },
    'initialization.skip': async (req, { w }) => {
      const root = rootOf(w);
      const r = await initialization.skip(root, req.ids);
      return r.ok ? { ok: true, value: await initialization.read(root) } : { ok: false, code: 'initialization.write', headline: SKIP_WRITE_FAILED(r.reason) };
    },
    'initialization.cancel': async (_req, { w }) => {
      const root = rootOf(w);
      await initialization.cancel(root);
      return { ok: true, value: await initialization.read(root) };
    },
  };
}

/**
 * PD-WORKSPACE-005 revision 3 (OQ-294, ruled 2026-10-14 under R-072) — a project-setup banner's `open-project-init` action.
 * Notices are application-wide, so the press may come from a window holding another workspace (PD-SHELL-001's second window,
 * or a switch since the banner was raised). The action takes PD-SHELL-001 revision 2's reach (`MainWindows.reach`): the window
 * holding the named workspace is surfaced on REQ-SHELL-161's terms, else a main window is added for it on the add terms — no
 * REQ-SHELL-021 gate, nothing closed, nothing asked, the workspace persisted as last opened, a failure reported under
 * REQ-SHELL-019 by the add route itself — and Settings › Project opens in the reached window, where REQ-WORKSPACE-103 puts the
 * recorded outcome and its retry. The window holds the request until its renderer can take it (`projectInit.ready`), so a
 * press during an added window's load still lands. Revision 2's "Project <name> is not open in any window." (OQ-262) is gone.
 */
export function projectInitCommands(
  ctx: Pick<CommandContext, 'log' | 'mainWindows'>,
): Pick<CommandHandlers, 'projectInit.open' | 'projectInit.ready'> {
  const { log, mainWindows } = ctx;
  return {
    'projectInit.open': async (req) => {
      const reached = await mainWindows.reach(req.workspace);
      if (!reached.ok) {
        log(`project-setup action for ${req.workspace}: the workspace could not be reached (${reached.outcome.ok ? 'no window' : reached.outcome.headline}) (PD-WORKSPACE-005 revision 3, OQ-294)`);
        return reached.outcome;
      }
      const delivered = mainWindows.openProjectInit(reached.window.wcId);
      log(`project-setup action for ${req.workspace}: ${reached.added ? 'added' : 'surfaced'} window ${reached.window.wcId} and opened Settings › Project there (${delivered}; PD-WORKSPACE-005 revision 3, OQ-294)`);
      if (delivered === 'gone') return { ok: false, code: 'window.gone', headline: 'The window holding the project closed before Settings › Project could open' };
      return { ok: true, value: { opened: true, window: reached.window.wcId, added: reached.added, delivered } };
    },
    /** The asking main window's renderer listens on channel 15 from now on; answers whether an open was held for it (once). */
    'projectInit.ready': (_req, { senderId }) => {
      const own = mainWindows.forSender(senderId);
      if (!own) return { ok: false, code: 'window.notMain', headline: 'Only a main window opens Settings › Project' };
      return { ok: true, value: { owed: mainWindows.projectInitReady(own.wcId) } };
    },
  };
}
