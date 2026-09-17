import { canonicalPath } from '@rotaris/platform';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { millis } from '@rotaris/kernel';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * GIT AND WORKTREES — the repository a window is looking at, and the worktrees a session may be started in
 * (REQ-GIT-137/140/141, ADR-0040). Git itself runs in the workspace service; main addresses the service for
 * the window's own workspace and never shells out.
 */
export function gitCommands(
  ctx: Pick<CommandContext, 'chooseDirectory' | 'log' | 'raiseNoticeKeyed' | 'services'>,
): Pick<CommandHandlers, 'git.read' | 'worktree.create' | 'worktree.remove' | 'worktree.chooseAttach' | 'worktree.probePath'> {
  const { chooseDirectory, log, raiseNoticeKeyed, services } = ctx;
  return {
    'git.read': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its repository' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      // REQ-GIT-102: 15 s per read is the bound; a refresh of a repository with many worktrees is many reads.
      const r = await svc.link.request({ kind: 'git.view', workspaceRoot: canonicalPath(w.workspace) }, millis(600_000));
      if (r.kind !== 'git.state') return refusal(r, 'The repository could not be read');
      const st = r.state;
      log(`git view: ${st.reads} reads in ${st.readMs} ms (git=${st.gitAvailable} repo=${st.isRepository} branch=${st.branch ?? (st.detached ? 'detached' : '-')} +${st.ahead}/-${st.behind} worktrees=${st.worktrees.length} history=${st.history.length}${st.failed.length > 0 ? ` failed=${st.failed.join(',')}` : ''})`);
      // REQ-GIT-104 / ADR-0038 c.1: a fixed identity, so refreshes replace rather than stack it; a non-repository raises nothing.
      if (!st.gitAvailable && raiseNoticeKeyed('git.missing', 'info', 'Working without Git', 'Git is not installed or not on PATH, so this workspace has no history and no worktrees. Everything else works, and Rotaris makes its changes in place instead of in a worktree of its own.')) log('notice: Working without Git');
      return { ok: true, value: st };
    },
    'worktree.create': async (req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before creating a worktree' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      // REQ-GIT-110/115: the user's own path, not collision-safe — a typed name is created exactly or refused with Git's wording.
      const r = await svc.link.request({ kind: 'worktree.create', workspaceRoot: canonicalPath(w.workspace), branch: req.branch, collisionSafe: false, target: { kind: 'path', path: req.path } }, millis(120_000));
      if (r.kind !== 'worktree.created') { log(`worktree create refused: ${r.kind === 'refused' ? r.headline : r.kind}`); return r.kind === 'refused' ? { ok: false, code: r.code, headline: r.headline, ...(r.detail === undefined ? {} : { detail: r.detail }) } : refusal(r, 'The worktree could not be created'); }
      log(`worktree created by the user: ${r.branch} at ${r.path}`);
      return { ok: true, value: { path: r.path, branch: r.branch } };
    },
    'worktree.remove': async (req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before deleting a worktree' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const r = await svc.link.request({ kind: 'worktree.remove', workspaceRoot: canonicalPath(w.workspace), path: req.path, force: req.force }, millis(120_000));
      if (r.kind !== 'worktree.removed') {
        // REQ-GIT-117: the one refusal force would cure is named by its code; everything else is Git's wording.
        if (r.kind === 'refused') { log(`worktree remove refused${r.needsForce ? ' (needs force)' : ''}: ${r.headline}`); return { ok: false, code: r.needsForce ? 'worktree.needs-force' : r.code, headline: r.headline }; }
        return refusal(r, 'The worktree could not be deleted');
      }
      log(`worktree deleted by the user: ${r.path}${req.force ? ' (forced)' : ''}`);
      return { ok: true, value: { path: r.path } };
    },
    'worktree.chooseAttach': async (_req, { w }) => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before attaching a worktree' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const chosen = await chooseDirectory(w.win, { title: 'Attach to an existing worktree', properties: ['openDirectory'] });
      if (!chosen) return { ok: true, value: { cancelled: true } };
      // REQ-GIT-158: validated exactly as REQ-GIT-011 validates an attach, before any session exists.
      const r = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: canonicalPath(w.workspace), path: chosen }, millis(60_000));
      if (r.kind !== 'worktree.attachable') return r.kind === 'refused' ? { ok: false, code: r.code, headline: r.headline } : refusal(r, 'The worktree could not be checked');
      return { ok: true, value: { path: r.path, branch: r.branch } };
    },
    'worktree.probePath': (req) => {
      try {
        if (!existsSync(req.path)) return { ok: true, value: { exists: false, nonEmpty: false } };
        const st = statSync(req.path);
        return { ok: true, value: { exists: true, nonEmpty: !st.isDirectory() || readdirSync(req.path).length > 0 } };
      } catch { return { ok: true, value: { exists: true, nonEmpty: true } }; }
    },
  };
}
