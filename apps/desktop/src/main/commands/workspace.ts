import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE WORKSPACE — the backup, the restore and the folder chooser (REQ-WORKSPACE-*, ADR-0043). The restore is
 * long enough, and raised from more than one place, that it stays a flow main owns; these handlers are the
 * command surface over it.
 */
export function workspaceCommands(
  ctx: Pick<CommandContext, 'chooseSave' | 'clocks' | 'mainWindows' | 'raiseNotice' | 'restoreFlow' | 'services'>,
): Pick<CommandHandlers, 'workspace.backup' | 'workspace.restore' | 'workspace.choose'> {
  const { chooseSave, clocks, mainWindows, raiseNotice, restoreFlow, services } = ctx;
  return {
    'workspace.backup': async (_req, { w }) => {
      // REQ-SESSION-201: the destination is a file the user chooses; nothing is written until then.
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before backing up its session store' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const stamp = new Date(clocks.wall.instant()).toISOString().replace(/[:.]/g, '-');
      const destination = await chooseSave(w.win, {
        title: 'Back up the session store', defaultPath: `rotaris-sessions-${w.workspaceId}-${stamp}.tar`,
        filters: [{ name: 'Rotaris session store backup', extensions: ['tar'] }],
      });
      if (!destination) return { ok: true, value: { cancelled: true } };
      const r = await svc.link.request({ kind: 'workspace.backup', workspaceRoot: canonicalPath(w.workspace), destination }, millis(600_000));
      if (r.kind !== 'workspace.backedUp') { if (r.kind === 'refused') raiseNotice('error', 'The backup could not be taken', [r.headline, r.detail].filter(Boolean).join(': ')); return refusal(r, 'The backup could not be taken'); }
      raiseNotice('info', `Backed up ${r.sessions} session${r.sessions === 1 ? '' : 's'} to ${r.destination}.`);
      return { ok: true, value: { destination: r.destination, sessions: r.sessions, bytes: r.bytes } };
    },
    'workspace.restore': (_req, { w }) => {
      return restoreFlow(w);
    },
    /**
     * Stage B — REQ-SHELL-021 / REQ-WORKSPACE-009/010: the title-bar chip's flow, answered for the window that
     * raised it (REQ-SHELL-020). Gates first and in order, then the chooser, then either nothing at all or the
     * replacement. No folder arrives from the renderer, so no surface can skip a gate or name a folder it was
     * not given.
     */
    'workspace.choose': (req, { w }) => {
      return mainWindows.choose(w.wcId, { newWindow: req.newWindow === true });
    },
  };
}
