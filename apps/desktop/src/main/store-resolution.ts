import { countNoun, millis, type Millis } from '@rotaris/kernel';
import type { CommandOutcome, ProcessReply, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import type { StoreRefusal } from './store-notice.js';

/**
 * REQ-SESSION-201's restore and REQ-SESSION-202's deliberate new store, as main conducts them: every question before
 * anything is changed, Cancel the default everywhere, and the work in the workspace service (ADR-0002 c.7). Pure over its
 * dependencies, so a test drives every answer without an Electron process; `index.ts` hands it the dialogs, the service
 * link, the run host and the open.
 *
 * OQ-281 (ruled 2026-10-14 by the consortium under the owner's delegation, R-072): the refusal of a place that holds no store
 * stands, and Settings › Project › Session store is where the user resolves it. While `workspace.store-missing` is held for
 * the window's workspace:
 *  - the restore is admitted although the window has no workspace identifier (no store was handed to the run host), and the
 *    `runs.active` gate is skipped — there is no store a run could be recording into; the service's liveness gates still run
 *    inside the swap. The first dialog says what was found, and the success notice names where it was kept;
 *  - "Start a new session store" (`establishFlow`) is offered beside it: Cancel the default, the found place moved aside and
 *    kept, the dialog saying what was found and that it recovers nothing;
 *  - after either succeeds the window's open is completed (`reopen`), which clears the held refusal and withdraws its notice.
 * A window with no workspace at all is still `workspace.none`; a held `workspace.store-displaced` (OQ-266) stays as it was.
 */

export interface FlowWindow {
  readonly workspace: string;
  readonly workspaceId: string | undefined;
}

export interface BoxOptions {
  readonly type: 'question' | 'warning';
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: string[];
  readonly defaultId: number;
  readonly cancelId: number;
  readonly noLink: true;
}

export interface StoreFlowDeps<W extends FlowWindow> {
  readonly canonicalPath: (p: string) => string;
  /** The workspace service for a canonical root, or none running. */
  readonly service: (root: string) => { request(req: WorkspaceServiceRequest, ms: Millis): Promise<ProcessReply> } | undefined;
  readonly runHost: { request(req: RunHostRequest, ms: Millis): Promise<ProcessReply> };
  /** The refusal main holds for a canonical root (`storeRefusals`), if any. */
  readonly heldRefusal: (root: string) => StoreRefusal | undefined;
  readonly chooseArtifact: (w: W) => Promise<string | null>;
  readonly ask: (w: W, box: BoxOptions) => Promise<number>;
  readonly raiseNotice: (severity: 'info' | 'error', headline: string, detail?: string) => void;
  /** Complete (or redo) the window's open of `root` — `MainWindows.open`, which clears a held refusal on success. */
  readonly reopen: (root: string, w: W) => Promise<unknown>;
}

const cancelled = (): CommandOutcome => ({ ok: true, value: { cancelled: true } });

function refusal(r: ProcessReply, headline: string): CommandOutcome {
  const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
  return { ok: false, code: r.kind === 'refused' ? r.code : 'reply.unexpected', headline, detail };
}

/** The window's workspace root, and whether its open is held as a place holding no store (OQ-281). */
function placeOf<W extends FlowWindow>(w: W, deps: StoreFlowDeps<W>): { readonly root: string | null; readonly missing: boolean } {
  if (w.workspace === '(no workspace)' || w.workspace === '') return { root: null, missing: false };
  const root = deps.canonicalPath(w.workspace);
  return { root, missing: w.workspaceId === undefined && deps.heldRefusal(root)?.code === 'workspace.store-missing' };
}

export async function restoreFlow<W extends FlowWindow>(w: W, deps: StoreFlowDeps<W>): Promise<CommandOutcome> {
  const { root, missing } = placeOf(w, deps);
  if (root === null || (!w.workspaceId && !missing)) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before restoring its session store' };
  const svc = deps.service(root);
  if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
  // REQ-SESSION-201 / REQ-SHELL-021's gate: refused while a run is active; the service's liveness gates hold it for the whole
  // restore. Under a held `store-missing` no store was handed to the run host, so no run can be recording into one (OQ-281).
  if (!missing && w.workspaceId) {
    const active = await deps.runHost.request({ kind: 'runs.active', workspaceId: w.workspaceId }, millis(5_000));
    if (active.kind === 'runs.count' && active.count > 0) return { ok: false, code: 'run.active', headline: 'Finish the active run before restoring the session store.' };
  }
  const artifact = await deps.chooseArtifact(w);
  if (!artifact) return cancelled();
  const assessed = await svc.request({ kind: 'workspace.restore.assess', workspaceRoot: root, artifact }, millis(120_000));
  if (assessed.kind !== 'workspace.restore.assessment') return refusal(assessed, 'The backup could not be assessed');
  const a = assessed.assessment;
  if (a.refusal) { deps.raiseNotice('error', 'The restore was refused', a.refusal.detail); return { ok: false, code: `restore.${a.refusal.why}`, headline: 'The restore was refused', detail: a.refusal.detail }; }

  // 1 — which workspace, when, and what it does to the store that is there now. Cancel is the default.
  const from = a.artifact.lastSeenWorkspacePath ?? a.artifact.workspaceId;
  const nowText = a.target.exists
    ? `The store this backup restores into currently holds ${countNoun(a.target.sessions, 'session')}. Restoring replaces it: those sessions are moved aside and kept (never deleted), and the backup's ${countNoun(a.artifact.sessions, 'session')} take their place. A session here and absent from the backup will no longer be listed; one in the backup and absent here will appear.`
    : a.target.placeEmpty
      // OQ-281: REQ-SESSION-202's condition, said as what was found; what is in the place is kept, never deleted.
      ? `The place for this workspace's session store exists and the store is not in it. Restoring moves what is in that place aside, keeps it, and puts the backup's ${countNoun(a.artifact.sessions, 'session')} there.`
      : `No store exists here for this backup's workspace yet; restoring creates it with the backup's ${countNoun(a.artifact.sessions, 'session')}.`;
  const first = await deps.ask(w, {
    type: 'question', title: 'Restore the session store', message: `This backup was taken from ${from} on ${a.artifact.takenAtUtc}.`, detail: nowText,
    buttons: ['Cancel', 'Restore'], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (first !== 1) return cancelled();

  // 2 — the identifier (ADR-0058 case (c), ESC-26): both values named, the consequence stated, cancel the default.
  let identifier: 'workspace' | 'artifact-store' | 'establish' = a.identifier.case === 'same' ? 'workspace' : 'establish';
  if (a.identifier.case === 'different') {
    const mine = a.identifier.current ?? '';
    const theirs = a.artifact.workspaceId;
    const second = await deps.ask(w, {
      type: 'warning', title: 'This workspace carries a different identifier',
      message: `This workspace's identifier is ${mine}. The backup was taken under ${theirs}.`,
      detail: `Restore into the backup's own store: the sessions are restored under ${theirs}, this workspace keeps ${mine}, and they will not appear here until a workspace carrying ${theirs} is opened.\n\nReplace this workspace's identifier with ${theirs} and restore: this workspace's existing sessions, recorded under ${mine}, become unreachable from this workspace. The store under ${mine} is kept intact; writing ${mine} back into .rotaris/workspace-id is a complete undo.`,
      buttons: ['Cancel', "Restore into the backup's own store", 'Replace the identifier and restore'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (second === 0) return cancelled();
    identifier = second === 1 ? 'artifact-store' : 'establish';
  }

  // 3 — D9 / IC-4: lock rows naming another machine, together, with the risk stated. Cancel is the default.
  let proceedWithForeignLocks = false;
  if (a.target.foreignLocks.length > 0) {
    const third = await deps.ask(w, {
      type: 'warning', title: 'Lock records name another machine',
      message: `${countNoun(a.target.foreignLocks.length, 'session')} in the store ${a.target.foreignLocks.length === 1 ? 'carries' : 'carry'} lock records naming another machine: ${a.target.foreignLocks.join(', ')}.`,
      detail: 'Nothing on this machine is writing under them. If this store genuinely is reachable from another machine, a run there may be writing to it now, and the restore replaces what it writes. Nothing needs to be cleared one at a time.',
      buttons: ['Cancel', 'Restore anyway'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (third !== 1) return cancelled();
    proceedWithForeignLocks = true;
  }

  const done = await svc.request({ kind: 'workspace.restore.perform', workspaceRoot: root, artifact, decisions: { identifier, proceedWithForeignLocks } }, millis(600_000));
  if (done.kind !== 'workspace.restored') return refusal(done, 'The restore could not be performed');
  const rep = done.report;
  if (rep.ok) {
    // The workspace now resolves as the restore left it; hand the run host the store again (W-18). Under a held refusal this
    // completes the window's open, which clears the refusal and withdraws its notice (OQ-281).
    await deps.reopen(root, w);
    const kept = rep.displaced === undefined ? '' : a.target.placeEmpty ? ` What was in the place for this workspace's session store was kept at ${rep.displaced}.` : ` The previous store was kept at ${rep.displaced}.`;
    deps.raiseNotice('info', `Restored ${countNoun(a.artifact.sessions, 'session')} from the backup taken on ${a.artifact.takenAtUtc}.${rep.identifierEstablished ? ' This workspace now carries the backup\'s identifier.' : ''}${kept}`);
    return { ok: true, value: { restoredInto: rep.restoredInto, identifierEstablished: rep.identifierEstablished } };
  }
  const why = rep.refusal
    ? rep.refusal.why === 'sessions-live' ? `A session became live before the restore could finish (${rep.refusal.sessions.join(', ')}); nothing was changed.`
      : rep.refusal.why === 'ack-timeout' ? `The run host did not answer within ${rep.refusal.boundMs} ms at step ${rep.refusal.step}; nothing was changed.`
        : `Lock records name another machine (${rep.refusal.sessions.join(', ')}); nothing was changed.`
    : rep.error ?? 'The restore did not complete.';
  deps.raiseNotice('error', 'The restore was not performed', why);
  await deps.reopen(root, w);
  return { ok: false, code: rep.refusal ? `restore.${rep.refusal.why}` : 'restore.failed', headline: 'The restore was not performed', detail: why };
}

/** OQ-281: the confirmation, in the ruling's words — what was found, that it recovers nothing, where the found place is kept. */
export function establishBox(place: string, kept: string): BoxOptions {
  return {
    type: 'warning', title: 'Start a new session store',
    message: `The place for this workspace's session store exists (${place}) and the store is not in it.`,
    detail: `Starting a new store recovers nothing that may have been there. If this workspace's sessions were moved or copied elsewhere, put them back or restore a backup instead. What is in that place now is moved aside to ${kept} and kept.`,
    buttons: ['Cancel', 'Start a new store'], defaultId: 0, cancelId: 0, noLink: true,
  };
}

/**
 * OQ-281 / REQ-SESSION-202: "Start a new session store…". Offered only while the window's open holds `workspace.store-missing`;
 * the user is told what was found and that it recovers nothing, Cancel the default and the cancel; the service re-checks the
 * condition, keeps the found place and creates the store; the window's open is then completed.
 */
export async function establishFlow<W extends FlowWindow>(w: W, deps: StoreFlowDeps<W>): Promise<CommandOutcome> {
  const { root, missing } = placeOf(w, deps);
  if (root === null) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting its session store' };
  if (!missing) return { ok: false, code: 'workspace.store-not-missing', headline: 'This workspace\'s session store is not missing from its place', detail: 'A new store is started only where the place for this workspace\'s store exists and the store is not in it.' };
  const svc = deps.service(root);
  if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
  const assessed = await svc.request({ kind: 'workspace.store.establish.assess', workspaceRoot: root }, millis(10_000));
  if (assessed.kind !== 'workspace.store.establishable') return refusal(assessed, 'A new session store was not started');
  if (await deps.ask(w, establishBox(assessed.place, assessed.kept)) !== 1) return cancelled();
  const done = await svc.request({ kind: 'workspace.store.establish.perform', workspaceRoot: root, stamp: assessed.stamp }, millis(30_000));
  if (done.kind !== 'workspace.store.established') {
    const out = refusal(done, 'A new session store was not started');
    deps.raiseNotice('error', 'A new session store was not started', out.ok ? undefined : out.detail);
    return out;
  }
  await deps.reopen(root, w);
  deps.raiseNotice('info', 'A new session store was started', `What was in the place for this workspace's session store was moved aside and kept at ${done.kept}. The new store holds no sessions.`);
  return { ok: true, value: { kept: done.kept } };
}
