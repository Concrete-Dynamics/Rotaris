import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { shell } from 'electron';
import { type CommandOutcome, type CommandRequest } from '@rotaris/contracts';
import { refusal, type CommandAt, type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE LIBRARY — the sessions a workspace has recorded and what hangs off them: the listing, the repair, the
 * delete, the two exports, the artifacts and the prompt library (ADR-0051, REQ-LIBRARY-*). Every read is the
 * run host's; main chooses the destination file when one is written out.
 */
export function libraryCommands(
  ctx: Pick<CommandContext, 'announceRepairs' | 'chooseExportPath' | 'clocks' | 'libraryRevision' | 'log' | 'mainWindows' | 'raiseNotice' | 'runHost' | 'services' | 'storeRefusal'>,
): Pick<CommandHandlers, 'session.list' | 'artifacts.list' | 'artifacts.body' | 'artifacts.save' | 'session.repair' | 'session.delete' | 'session.export' | 'session.exportTrajectory' | 'session.openLog' | 'session.revealFiles' | 'prompts.read' | 'prompts.push' | 'prompts.take' | 'prompts.roots.read'> {
  const { announceRepairs, chooseExportPath, clocks, libraryRevision, log, mainWindows, raiseNotice, runHost, services } = ctx;
  const onSessionExport = async (req: Extract<CommandRequest, { kind: 'session.export' | 'session.exportTrajectory' }>, { w, awaitWorkspace }: CommandAt): Promise<CommandOutcome> => {
    // REQ-SESSION-189/199: a file the user chooses; nothing is written until then; not a channel.
    await awaitWorkspace();
    if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before exporting a session' };
    const ids = req.kind === 'session.export' ? [req.sessionId] : req.sessionIds;
    const stamp = new Date(clocks.wall.instant()).toISOString().replace(/[:.]/g, '-');
    const destination = await chooseExportPath(w.win, req.kind === 'session.export'
      ? { title: 'Export the session records', defaultPath: `rotaris-session-${req.sessionId}-records-${stamp}.json`, filters: [{ name: 'JSON document', extensions: ['json'] }] }
      : { title: ids.length === 1 ? 'Export the trajectory' : `Export ${ids.length} trajectories`, defaultPath: ids.length === 1 ? `rotaris-trajectory-${ids[0]}-${stamp}.json` : `rotaris-trajectories-${ids.length}-${stamp}.json`, filters: [{ name: 'JSON document', extensions: ['json'] }] });
    if (!destination) return { ok: true, value: { cancelled: true } };
    const r = await runHost.request(req.kind === 'session.export'
      ? { kind: 'session.export', workspaceId: w.workspaceId, sessionId: req.sessionId, destination }
      : { kind: 'session.exportTrajectory', workspaceId: w.workspaceId, sessionIds: [...req.sessionIds], destination }, millis(120_000));
    if (r.kind !== 'session.exported') { if (r.kind === 'refused') raiseNotice('error', 'The export could not be written', [r.headline, r.detail].filter(Boolean).join(': ')); return refusal(r, 'The export could not be written'); }
    raiseNotice(r.warnings.length > 0 ? 'warning' : 'info', `Wrote ${r.documents} ${req.kind === 'session.export' ? 'records document' : `trajectory document${r.documents === 1 ? '' : 's'}`} to ${r.destination}.`, r.warnings.length > 0 ? r.warnings.join(' ') : undefined);
    return { ok: true, value: { destination: r.destination, bytes: r.bytes, documents: r.documents, warnings: r.warnings, elapsedMs: r.elapsedMs } };
  };
  const onSessionOpenLog = async (req: Extract<CommandRequest, { kind: 'session.openLog' | 'session.revealFiles' }>, { w, awaitWorkspace }: CommandAt): Promise<CommandOutcome> => {
    // REQ-SESSION-191: the log opened for reading, the files revealed in the platform's file manager; a missing file is reported, never faked.
    await awaitWorkspace();
    if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
    const r = await runHost.request({ kind: 'session.files', workspaceId: w.workspaceId, sessionId: req.sessionId }, millis(10_000));
    if (r.kind !== 'session.files') return refusal(r, 'The session files could not be located');
    if (req.kind === 'session.openLog') {
      if (r.files.log === null) return { ok: false, code: 'session.no-log', headline: 'No log is kept for this session', detail: `Nothing was logged at or above the configured level, so no log file exists in ${r.files.directory}.` };
      const failed = await shell.openPath(r.files.log);
      return failed === '' ? { ok: true, value: { path: r.files.log } } : { ok: false, code: 'session.open-failed', headline: 'The log could not be opened', detail: failed };
    }
    const anyFile = r.files.summary ?? r.files.log ?? r.files.artifacts;
    if (anyFile === null) return { ok: false, code: 'session.no-files', headline: 'This session has no files yet', detail: `No log, summary or artifact body has been written for it, so there is nothing to reveal in ${r.files.directory}.` };
    shell.showItemInFolder(anyFile);
    return { ok: true, value: { directory: r.files.directory, log: r.files.log, summary: r.files.summary, artifacts: r.files.artifacts } };
  };
  const onPromptsRead = async (req: Extract<CommandRequest, { kind: 'prompts.read' | 'prompts.push' | 'prompts.take' }>, { w, awaitWorkspace }: CommandAt): Promise<CommandOutcome> => {
    await awaitWorkspace();
    if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its saved prompts' };
    const r = await runHost.request(
      req.kind === 'prompts.read' ? { kind: 'prompts.read', workspaceId: w.workspaceId }
        : req.kind === 'prompts.push' ? { kind: 'prompts.push', workspaceId: w.workspaceId, list: req.list, text: req.text }
          : { kind: 'prompts.take', workspaceId: w.workspaceId, list: req.list, index: req.index, remove: req.remove },
      millis(10_000),
    ).catch((e: Error) => ({ kind: 'refused' as const, code: 'prompts.ask', headline: 'Could not save prompt history', detail: e.message }));
    if (r.kind !== 'prompts.state' && r.kind !== 'prompts.taken') {
      // REQ-LIBRARY-138: the persistent notice, with the detail the requirement writes; the window's in-memory
      // lists stay usable, which is what that detail promises, so nothing here clears anything.
      if (req.kind !== 'prompts.read') raiseNotice('error', 'Could not save prompt history', 'Rotaris will keep prompts in memory for this window.');
      return refusal(r, 'Could not save prompt history');
    }
    // REQ-LIBRARY-105: exactly a write that changed a list is a library change; a read is not one, and neither is
    // a `take` that kept the entry (`remove: false` copies and stores nothing).
    if (req.kind === 'prompts.push') libraryRevision.bump(req.list === 'history' ? 'prompt-history' : 'prompt-stash');
    else if (req.kind === 'prompts.take' && req.remove) libraryRevision.bump(req.list === 'history' ? 'prompt-history' : 'prompt-stash');
    return { ok: true, value: r.kind === 'prompts.state' ? { state: r.state } : { text: r.text, state: r.state } };
  };
  return {
    'session.list': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) {
        // REQ-SESSION-202 / REQ-SESSION-043: a store the open refused is reported as what was found, never as an empty list.
        const held = ctx.storeRefusal?.(w.workspace);
        if (held) return { ok: false, code: held.code, headline: held.headline, ...(held.detail === undefined ? {} : { detail: held.detail }) };
        return { ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing sessions' };
      }
      const r = await runHost.request({ kind: 'session.list', workspaceId: w.workspaceId }, millis(5_000));
      return r.kind === 'session.list' ? { ok: true, value: { sessions: r.sessions } } : refusal(r, 'The session list could not be loaded');
    },
    // ---- Part Y: the Library's Artifacts tab (REQ-LIBRARY-108/131..136). Main relays; the run host owns the store and the files. ----
    'artifacts.list': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing artifacts' };
      const r = await runHost.request({ kind: 'artifacts.list', workspaceId: w.workspaceId }, millis(5_000));
      return r.kind === 'artifacts.state' ? { ok: true, value: r.state } : refusal(r, 'The session artifacts could not be read');
    },
    'artifacts.body': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before opening an artifact' };
      const r = await runHost.request({ kind: 'artifacts.body', workspaceId: w.workspaceId, ref: req.ref }, millis(10_000));
      return r.kind === 'artifacts.body' ? { ok: true, value: { id: r.id, slug: r.slug, title: r.title, artifactKind: r.kind_, status: r.status, producer: r.producer, persona: r.persona, edited: r.edited, body: r.body, fallback: r.fallback } } : refusal(r, 'The artifact could not be loaded');
    },
    'artifacts.save': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before saving an artifact' };
      const r = await runHost.request({ kind: 'artifacts.save', workspaceId: w.workspaceId, ref: req.ref, body: req.body }, millis(10_000));
      if (r.kind !== 'artifacts.saved') return refusal(r, 'The artifact could not be saved');
      // REQ-LIBRARY-105: the session artifact store is one of the closed four, so a hand edit that reached the
      // store IS a library change and every live window re-reads — the same counter a prompt write moves.
      libraryRevision.bump('session-artifacts');
      return { ok: true, value: { id: r.id, editedAt: r.editedAt } };
    },
    // ---- Part U: the session browser's actions (REQ-SESSION-182). Main supplies the dialogs and the platform's file manager; the run host does the work. ----
    'session.repair': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before repairing its sessions' };
      const r = await runHost.request({ kind: 'session.repair', workspaceId: w.workspaceId, ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }) }, millis(30_000));
      if (r.kind !== 'session.repaired') return refusal(r, 'The repair could not be carried out');
      for (const x of r.report.repaired) log(`session ${x.sessionId} repaired: '${x.from}' → interrupted (${x.reason})`);
      if (r.report.nothingStale) log(`session repair: nothing was stale`);
      /**
       * OQ-46: the whole batch is settled before this reply exists — the run host repairs every stale session
       * of the workspace inside the one request — so the announcement, and the browser's refreshed list behind
       * it, describe a settled batch and never a partly repaired one. That is what makes continuation safe to
       * offer here rather than after a later re-check.
       */
      announceRepairs(r.report.repaired);
      return { ok: true, value: { report: r.report } };
    },
    'session.delete': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before deleting a session' };
      const r = await runHost.request({ kind: 'session.delete', workspaceId: w.workspaceId, sessionId: req.sessionId }, millis(120_000));
      if (r.kind !== 'session.deleted') { if (r.kind === 'refused') raiseNotice('error', 'The session was not deleted', r.headline); return refusal(r, 'The session was not deleted'); }
      if (r.refsLeft !== null) log(`session ${req.sessionId}: checkpoint refs remain under ${r.refsLeft} (REQ-GIT-069, best-effort)`);
      if (w.followedSessionId === req.sessionId) { mainWindows.clearFollowedSession(w.wcId, req.sessionId); w.personaWindows.destroyAll('the followed session was deleted'); }
      if (r.existed) raiseNotice('info', `Deleted session ${req.sessionId}.`, `${r.refsDeleted} checkpoint ref${r.refsDeleted === 1 ? '' : 's'} removed${r.refsLeft === null ? '' : `; some refs remain under ${r.refsLeft}`}.`);
      return { ok: true, value: { sessionId: r.sessionId, existed: r.existed, refsDeleted: r.refsDeleted, refsLeft: r.refsLeft, filesRemoved: r.filesRemoved, unreadable: r.unreadable, elapsedMs: r.elapsedMs } };
    },
    'session.export': onSessionExport,
    'session.exportTrajectory': onSessionExport,
    'session.openLog': onSessionOpenLog,
    'session.revealFiles': onSessionOpenLog,
    'prompts.read': onPromptsRead,
    'prompts.push': onPromptsRead,
    'prompts.take': onPromptsRead,
    'prompts.roots.read': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its prompt files' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const r = await svc.link.request({ kind: 'prompts.roots.read', workspaceRoot: canonicalPath(w.workspace) }, millis(10_000));
      return r.kind === 'prompts.roots' ? { ok: true, value: r.result } : refusal(r, 'The prompt files could not be read');
    },
  };
}
