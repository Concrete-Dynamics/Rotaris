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
