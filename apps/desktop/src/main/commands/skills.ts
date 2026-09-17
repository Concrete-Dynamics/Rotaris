import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { type CommandOutcome, type CommandRequest } from '@rotaris/contracts';
import { refusal, type CommandAt, type CommandContext, type CommandHandlers } from './context.js';

/**
 * SKILLS — the portable catalog and the two gestures over it (ADR-0063, REQ-WORKSPACE-051..073, 151). The
 * run host owns the catalog because it owns the load; main names the window's workspace and the session it
 * follows, and picks the file when a load needs one chosen.
 */
export function skillsCommands(
  ctx: Pick<CommandContext, 'chooseSkillFile' | 'runHost'>,
): Pick<CommandHandlers, 'skills.read' | 'skills.rescan' | 'skills.forceLoad' | 'skills.loadFile'> {
  const { chooseSkillFile, runHost } = ctx;
  /*
   * ADR-0063 — portable skills (REQ-WORKSPACE-051..073, 151). The run host answers because it owns the
   * catalog; main names the window's open workspace and the session it follows, as it does for every
   * workspace-scoped command. A window following no session sends none, and the run host puts the
   * gesture in that workspace's pending bucket for the next session to adopt (OQ-58).
   */
  const onSkillsRead = async (req: Extract<CommandRequest, { kind: 'skills.read' | 'skills.rescan' }>, { w }: CommandAt): Promise<CommandOutcome> => {
    if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its portable skills' };
    const r = await runHost.request({ kind: req.kind, workspaceRoot: canonicalPath(w.workspace), ...(w.followedSessionId === null ? {} : { sessionId: w.followedSessionId }) }, millis(15_000));
    return r.kind === 'skills.state' ? { ok: true, value: r.state } : refusal(r, 'The portable skills could not be read');
  };
  return {
    'skills.read': onSkillsRead,
    'skills.rescan': onSkillsRead,
    'skills.forceLoad': async (req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'skills.forceLoad', workspaceRoot: canonicalPath(w.workspace), name: req.name, ...(w.followedSessionId === null ? {} : { sessionId: w.followedSessionId }) }, millis(10_000));
      // REQ-WORKSPACE-073: the refusal text is the run host's — "Skills are disabled. Enable them in Settings."
      return r.kind === 'skills.state' ? { ok: true, value: { name: r.loaded, state: r.state } } : refusal(r, 'The skill could not be loaded');
    },
    /*
     * REQ-WORKSPACE-151 — "Load skill file…". With no path the platform's own chooser opens on REQ-SHELL-164's
     * terms and a dismissal by any means returns no selection and changes nothing; with one the caller already
     * has the path (the typed `/skill <path>` of REQ-CHAT-162, which needs no dialog).
     *
     * **The dialog is a FILE chooser on Windows and Linux** and both properties on macOS. The requirement asks
     * for a chooser "restricted to selecting a SKILL.md file or a directory containing one", which no platform
     * dialog offers on those two hosts — logged as OQ-59. The directory form of REQ-WORKSPACE-057 stays
     * reachable through the typed command, so no capability is lost; only the dialog is narrower.
     */
    'skills.loadFile': async (req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      let path = req.path;
      if (path === undefined) {
        const chosen = await chooseSkillFile(w.win, canonicalPath(w.workspace));
        if (chosen === null) return { ok: true, value: { cancelled: true } };
        path = chosen;
      }
      const r = await runHost.request({ kind: 'skills.loadFile', workspaceRoot: canonicalPath(w.workspace), path, ...(w.followedSessionId === null ? {} : { sessionId: w.followedSessionId }) }, millis(10_000));
      return r.kind === 'skills.state' ? { ok: true, value: { cancelled: false, name: r.loaded, state: r.state } } : refusal(r, 'The skill file could not be loaded');
    },
  };
}
