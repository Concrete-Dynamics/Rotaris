import { CHANNEL, CONTRACT_SCHEMA_VERSION, PROJECT_NOT_OPEN, SKIP_WRITE_FAILED } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { projectNameOf } from '../initialization.js';
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
 * PD-WORKSPACE-005 revision 2 (OQ-262, ruled 2026-10-13 under R-072) — a project-setup banner's `open-project-init` action.
 * Notices are application-wide, so the press may come from a window holding another workspace (PD-SHELL-001's second window,
 * or a switch since the banner was raised). The window holding the named workspace is surfaced on REQ-SHELL-161's terms and
 * told, on channel 15, to open Settings › Project, where REQ-WORKSPACE-103 puts the recorded outcome and its retry. Where no
 * window holds it, the window the press came from shows the info notice "Project <name> is not open in any window." and
 * nothing else happens: no window is added, replaced or asked about.
 */
export function projectInitCommands(
  ctx: Pick<CommandContext, 'log' | 'mainWindows' | 'raiseTransient' | 'relay'>,
): Pick<CommandHandlers, 'projectInit.open'> {
  const { log, mainWindows, raiseTransient, relay } = ctx;
  return {
    'projectInit.open': (req, { w }) => {
      const holder = mainWindows.surfaceHolding(req.workspace);
      if (holder === undefined || holder.win.isDestroyed()) {
        const text = PROJECT_NOT_OPEN(projectNameOf(req.workspace));
        raiseTransient(w, 'info', text);
        log(`project-setup action for ${req.workspace}: no window holds it, so nothing was opened (PD-WORKSPACE-005 revision 2) — ${text}`);
        return { ok: true, value: { opened: false } };
      }
      relay.count(CHANNEL.projectInitOpen);
      holder.win.webContents.send(CHANNEL.projectInitOpen, { v: CONTRACT_SCHEMA_VERSION, workspace: holder.workspace });
      log(`project-setup action for ${req.workspace}: surfaced window ${holder.wcId} and opened Settings › Project there (PD-WORKSPACE-005 revision 2)`);
      return { ok: true, value: { opened: true, window: holder.wcId } };
    },
  };
}
