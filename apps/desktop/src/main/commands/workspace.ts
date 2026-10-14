import { shell } from 'electron';
import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { openFolder } from '../open-folder.js';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE WORKSPACE — the backup, the restore, the deliberate new store (OQ-281) and the folder chooser (REQ-WORKSPACE-*, ADR-0043). The restore is
 * long enough, and raised from more than one place, that it stays a flow main owns; these handlers are the
 * command surface over it.
 */
export function workspaceCommands(
  ctx: Pick<CommandContext, 'capturing' | 'chooseSave' | 'clocks' | 'establishFlow' | 'log' | 'mainWindows' | 'raiseNotice' | 'restoreFlow' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'workspace.backup' | 'workspace.restore' | 'workspace.establishStore' | 'workspace.choose' | 'workspace.openFolder' | 'workspace.usage'> {
  const { capturing, chooseSave, clocks, establishFlow, log, mainWindows, raiseNotice, restoreFlow, runHost, services } = ctx;
  return {
    /**
     * REQ-SHELL-040 / REQ-WORKSPACE-019: the strip's workspace-path link — the folder of the window that asked, in the OS
     * file manager. A failure is answered, never swallowed: the refusal names the path attempted, so the renderer's
     * transient error says what could not be opened and where it is (REQ-SHELL-040's resolution; OQ-191 records that
     * REQ-WORKSPACE-019 still says silent). Verification seam (only with ROTARIS_CAPTURE_PNG): `record` opens nothing and
     * reports success, `fail` reports the platform refusal, as `shell.openExternal`'s does.
     */
    'workspace.openFolder': async (_req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'No workspace folder is open' };
      const path = w.workspace;
      const scripted = __ROTARIS_SEAMS__ && capturing ? process.env['ROTARIS_CAPTURE_OPEN_EXTERNAL'] : undefined;
      if (scripted === 'fail') { log(`capture: open-folder REFUSED ${path}`); return { ok: false, code: 'folder.failed', headline: 'The workspace folder could not be opened', detail: `${path} — the file manager refused to open it (scripted).` }; }
      if (scripted === 'record') { log(`capture: open-folder ${path}`); return { ok: true, value: { path } }; }
      const opened = await openFolder(path, (p) => shell.openPath(p), clocks.timers);
      if (!opened.ok) { log(`the workspace folder could not be opened: ${path} — ${opened.reason}`); return { ok: false, code: 'folder.failed', headline: 'The workspace folder could not be opened', detail: `${path} — ${opened.reason}` }; }
      log(`opened the workspace folder: ${path}`);
      return { ok: true, value: { path } };
    },
    /** REQ-SHELL-044/045: the strip's tokens and cost, relayed to the run host that owns the store. */
    'workspace.usage': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'No workspace is open' };
      const r = await runHost.request({ kind: 'workspace.usage', workspaceId: w.workspaceId }, millis(5_000));
      return r.kind === 'workspace.usage' ? { ok: true, value: { tokens: r.tokens, cost: r.cost } } : refusal(r, 'The workspace usage could not be read');
    },
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
    /** OQ-281 / REQ-SESSION-202: the deliberate new store, beside the restore, while the window's open holds `workspace.store-missing`. */
    'workspace.establishStore': (_req, { w }) => {
      return establishFlow(w);
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
