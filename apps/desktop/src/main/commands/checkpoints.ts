import { CHECKPOINT_BUSY_TOAST, CHECKPOINTS_NO_WORKSPACE, CHECKPOINTS_STORE_UNREADABLE, LIVE_RUN_REFUSAL, LIVENESS_UNKNOWN_REFUSAL, restoredNoticeBody, restoreSummary, type CheckpointListPayload, type CheckpointPreviewPayload, type CheckpointRestoreOutcomePayload, type CommandOutcome, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { millis } from '@rotaris/kernel';
import { canonicalPath } from '@rotaris/platform';
import type { ProcessLink } from '@rotaris/shell';
import type { CommandContext, CommandHandlers, MainWindowState } from './context.js';

/**
 * CHECKPOINTS — the seven gates a restore passes and the two reads in front of them (REQ-GIT-056..100,
 * ADR-0039). Everything the family needs is here: the one-at-a-time gate, the listing that repairs a
 * broken tree root as it reads, the preview the dialog is drawn from, and the restore itself. Main
 * relays to the run host for the record and to the workspace service for Git; it opens neither.
 *
 * The gate's in-flight promise is written here and nowhere else. It stays a holder main also has
 * because the quit path must wait on whatever is in flight when the window closes (REQ-GIT-101);
 * everything that decides when it is set, and when it is cleared, is in this file.
 */
export function checkpointsCommands(
  ctx: Pick<CommandContext, 'announceRepairs' | 'checkpointOp' | 'clocks' | 'log' | 'mainWindows' | 'raiseNotice' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'checkpoints.list' | 'checkpoints.preview' | 'checkpoints.restore'> {
  const { announceRepairs, checkpointOp, clocks, log, mainWindows, raiseNotice, runHost, services } = ctx;
  const checkpointGate = (fn: () => Promise<CommandOutcome>): Promise<CommandOutcome> => {
    if (checkpointOp.current) return Promise.resolve({ ok: false, code: 'checkpoint.busy', headline: CHECKPOINT_BUSY_TOAST });
    const p = fn().finally(() => { if (checkpointOp.current === p) checkpointOp.current = null; });
    checkpointOp.current = p;
    return p;
  };
  const checkpointContext = async (w: MainWindowState): Promise<{ workspaceId: string; root: string; svc: { link: ProcessLink<WorkspaceServiceRequest> } } | CommandOutcome> => {
    await mainWindows.awaitWorkspace(w.wcId);
    if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'checkpoint.no-workspace', headline: CHECKPOINTS_NO_WORKSPACE };
    const root = canonicalPath(w.workspace);
    const svc = services.get(root);
    if (!svc) return { ok: false, code: 'checkpoint.no-workspace', headline: CHECKPOINTS_NO_WORKSPACE };
    return { workspaceId: w.workspaceId, root, svc };
  };
  const readListing = async (workspaceId: string, sessionId: string): Promise<CheckpointListPayload | CommandOutcome> => {
    const r = await runHost.request({ kind: 'checkpoint.list', workspaceId, sessionId }, millis(15_000));
    if (r.kind !== 'checkpoint.list') {
      if (r.kind === 'refused' && r.code === 'checkpoint.no-session') return { ok: false, code: r.code, headline: r.headline };
      // REQ-GIT-095: a store that cannot be read is an empty listing behind the error dialog.
      return { ok: false, code: 'checkpoint.store', headline: "Could not read this session's checkpoints", detail: r.kind === 'refused' ? `${CHECKPOINTS_STORE_UNREADABLE} (${r.headline})` : CHECKPOINTS_STORE_UNREADABLE };
    }
    // REQ-GIT-094: the repair is announced as a warning notice. One session here, always — this path repairs the
    // session whose listing was asked for and no other (OQ-46 governs the batch the explicit repair produces).
    if (r.listing.repaired) announceRepairs([{ sessionId, from: r.listing.repaired.previous, reason: r.listing.repaired.reason }]);
    return r.listing;
  };
  const isOutcome = (x: unknown): x is CommandOutcome => typeof x === 'object' && x !== null && 'ok' in x;
  /** REQ-GIT-092: stamped on every listing and checked before every preview and restore; a broken check never enables a restore. */
  const livenessRefusal = (l: CheckpointListPayload): string | null => (l.liveness === 'live' ? LIVE_RUN_REFUSAL : l.liveness === 'unknown' ? LIVENESS_UNKNOWN_REFUSAL : null);
  /** REQ-GIT-056: the 10 most recent recorded plus the last restored when outside them, newest first. */
  const driftCandidates = (l: CheckpointListPayload): { sequence: number; commit: string }[] => {
    const newest = [...l.rows].sort((a, b) => b.sequence - a.sequence).slice(0, 10);
    const last = l.lastRestoredSequence === null ? undefined : l.rows.find((r) => r.sequence === l.lastRestoredSequence);
    if (last && !newest.some((r) => r.sequence === last.sequence)) newest.push(last);
    return newest.map((r) => ({ sequence: r.sequence, commit: r.commit }));
  };
  const previewOf = async (at: { workspaceId: string; root: string; svc: { link: ProcessLink<WorkspaceServiceRequest> } }, l: CheckpointListPayload, sequence: number) => {
    const row = l.rows.find((r) => r.sequence === sequence);
    if (!row) return null;
    const started = clocks.monotonic.now();
    const r = await at.svc.link.request({ kind: 'checkpoint.preview', workspaceRoot: at.root, treeRoot: l.treeRoot, sessionId: l.sessionId, sequence, commit: row.commit, candidates: driftCandidates(l), includeUntracked: l.includeUntracked }, millis(320_000));
    if (r.kind !== 'checkpoint.previewed') return { row, treeState: 'inspect-failed' as const, entries: [], dirty: [], blockedReason: `Git could not inspect checkpoint ${sequence}: ${r.kind === 'refused' ? r.headline : `unexpected answer ${r.kind}`}`, text: `Git could not inspect checkpoint ${sequence}: ${r.kind === 'refused' ? r.headline : `unexpected answer ${r.kind}`}`, invocations: 0, elapsedMs: 0 };
    log(`checkpoint preview ${l.sessionId}/${sequence}: ${r.treeState}, ${r.entries.length} entr${r.entries.length === 1 ? 'y' : 'ies'}, ${r.dirty.length} dirty; ${r.invocations} git invocations, ${r.elapsedMs} ms in the service, ${Math.round(clocks.monotonic.now() - started)} ms end to end`);
    return { row, ...r };
  };
  const checkpointPreview = async (w: MainWindowState, sessionId: string, sequence: number): Promise<CommandOutcome> => {
    const at = await checkpointContext(w);
    if (isOutcome(at)) return at;
    const l = await readListing(at.workspaceId, sessionId);
    if (isOutcome(l)) return l;
    if (l.unavailable) return { ok: false, code: 'checkpoint.unavailable', headline: l.unavailable };
    const live = livenessRefusal(l);
    if (live) return { ok: false, code: 'checkpoint.live', headline: live };
    const p = await previewOf(at, l, sequence);
    if (p === null) return { ok: false, code: 'checkpoint.unrecorded', headline: `Checkpoint ${sequence} is no longer recorded for this session.` };
    const value: CheckpointPreviewPayload = { sessionId, sequence, treeRoot: l.treeRoot, entries: p.entries, dirty: p.dirty, blockedReason: p.blockedReason, text: p.text, summary: restoreSummary(sequence, p.entries.length, l.treeRoot), restorable: p.treeState === 'ok' };
    return { ok: true, value };
  };
  const checkpointRestore = async (w: MainWindowState, sessionId: string, sequence: number, force: boolean): Promise<CommandOutcome> => {
    const at = await checkpointContext(w);
    if (isOutcome(at)) return at;
    const l = await readListing(at.workspaceId, sessionId);
    if (isOutcome(l)) return l;
    const outcome = (o: Omit<CheckpointRestoreOutcomePayload, 'sequence'>): CommandOutcome => ({ ok: true, value: { sequence, ...o } satisfies CheckpointRestoreOutcomePayload });
    if (l.unavailable) return outcome({ restored: false, safetySequence: null, changedPaths: 0, blockedReason: l.unavailable });
    const live = livenessRefusal(l);
    if (live) return outcome({ restored: false, safetySequence: null, changedPaths: 0, blockedReason: live });
    const started = clocks.monotonic.now();
    const row = l.rows.find((r) => r.sequence === sequence) ?? null;
    // REQ-GIT-058/062: every refusal at a gate is recorded on the session; the record never raises here.
    const record = async (o: { restored: boolean; safetySequence: number | null; changedPaths: number; blockedReason: string; dirtyPaths: readonly string[] }) => {
      const r = await runHost.request({ kind: 'checkpoint.recordRestore', workspaceId: at.workspaceId, sessionId, sequence, restored: o.restored, safetySequence: o.safetySequence, changedPaths: o.changedPaths, blockedReason: o.blockedReason, forced: force, treeRoot: l.treeRoot, dirtyPaths: [...o.dirtyPaths], ref: row?.ref ?? null, commit: row?.commit ?? null }, millis(15_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (r.kind !== 'ack') log(`checkpoint restore ${sessionId}/${sequence}: the outcome could not be recorded (${r.kind === 'refused' ? r.headline : r.kind})`);
    };
    const refuse = async (blockedReason: string, safetySequence: number | null = null, dirtyPaths: readonly string[] = []) => {
      await record({ restored: false, safetySequence, changedPaths: 0, blockedReason, dirtyPaths });
      log(`checkpoint restore ${sessionId}/${sequence} refused: ${blockedReason}`);
      return outcome({ restored: false, safetySequence, changedPaths: 0, blockedReason });
    };
    // Gate 1.
    if (!row) return refuse(`No checkpoint ${sequence} is recorded for session ${sessionId}.`);
    // Gates 2 and 3 — the preview again, fresh (the tree may have moved since the dialog was shown).
    const p = await previewOf(at, l, sequence);
    if (p === null) return refuse(`No checkpoint ${sequence} is recorded for session ${sessionId}.`);
    if (p.treeState !== 'ok') return refuse(p.blockedReason);
    // Gate 4 — force bypasses this gate only.
    if (p.dirty.length > 0 && !force) return refuse(p.blockedReason, null, p.dirty);
    // Gate 5 — the safety checkpoint, untracked always included, numbered from both sources (REQ-GIT-059); it MUST succeed.
    let safetySequence: number | null = null;
    const refs = await at.svc.link.request({ kind: 'checkpoint.refs', workspaceRoot: at.root, treeRoot: l.treeRoot, sessionId }, millis(60_000)).catch(() => null);
    const fromRefs = refs?.kind === 'checkpoint.refs' && refs.ok ? refs.entries.reduce((m, e) => Math.max(m, e.sequence), 0) : 0;
    const safety = Math.max(fromRefs, ...l.rows.map((r) => r.sequence), 0) + 1;
    const captured = await at.svc.link.request({ kind: 'checkpoint.capture', workspaceRoot: at.root, treeRoot: l.treeRoot, sessionId, sequence: safety, iteration: 0, childName: '', checkpointKind: 'pre_restore', includeUntracked: true, message: `rotaris pre-restore checkpoint ${safety} for session ${sessionId} (before restoring checkpoint ${sequence})` }, millis(320_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
    if (captured.kind !== 'checkpoint.captured') return refuse(`Could not record a safety checkpoint before the restore: ${captured.kind === 'refused' ? captured.headline : `unexpected answer ${captured.kind}`}`, null, p.dirty);
    if (captured.outcome === 'failed' || captured.outcome === 'unavailable') return refuse(`Could not record a safety checkpoint before the restore: ${captured.detail ?? 'Git declined'}`, null, p.dirty);
    if (captured.outcome === 'recorded') {
      const persisted = await runHost.request({ kind: 'checkpoint.recordSafety', workspaceId: at.workspaceId, sessionId, sequence: safety, ref: captured.ref ?? '', commit: captured.commit ?? '', files: captured.files ?? [] }, millis(60_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (persisted.kind !== 'checkpoint.recorded') return refuse(`Could not persist the safety checkpoint on the session: ${persisted.kind === 'refused' ? persisted.headline : `unexpected answer ${persisted.kind}`}`, null, p.dirty);
      safetySequence = safety;
      log(`checkpoint restore ${sessionId}/${sequence}: safety checkpoint ${safety} recorded over ${captured.files?.length ?? 0} file(s) (${captured.invocations} git invocations, ${captured.elapsedMs} ms)`);
    } else log(`checkpoint restore ${sessionId}/${sequence}: no safety checkpoint needed — the tree already matches the last commit`);
    // Gate 6 — the restore itself; a failure still reports the safety checkpoint, the sole surviving copy of the tree.
    const restored = await at.svc.link.request({ kind: 'checkpoint.restore', workspaceRoot: at.root, treeRoot: l.treeRoot, sessionId, sequence, commit: row.commit, entries: p.entries }, millis(320_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
    if (restored.kind !== 'checkpoint.restored') return refuse(`Git could not restore checkpoint ${sequence}: ${restored.kind === 'refused' ? restored.headline : `unexpected answer ${restored.kind}`}`, safetySequence, p.dirty);
    if (!restored.ok) return refuse(`Git could not restore checkpoint ${sequence}: ${restored.detail ?? 'Git declined'}`, safetySequence, p.dirty);
    // Gate 7 — success: the record (last_restored_sequence, the timeline entry, the event) and the persistent notice (REQ-GIT-100).
    await record({ restored: true, safetySequence, changedPaths: restored.touched.length, blockedReason: '', dirtyPaths: p.dirty });
    raiseNotice('info', `Restored checkpoint ${sequence}`, restoredNoticeBody(restored.touched.length, safetySequence));
    log(`checkpoint restore ${sessionId}/${sequence}: restored ${restored.touched.length} file(s) in ${l.treeRoot}, safety ${safetySequence ?? 'none'}${force ? ', forced' : ''}; ${restored.invocations} git invocations, ${restored.elapsedMs} ms in the service, ${Math.round(clocks.monotonic.now() - started)} ms end to end`);
    return outcome({ restored: true, safetySequence, changedPaths: restored.touched.length, blockedReason: '' });
  };
  return {
    'checkpoints.list': (req, { w }) => checkpointGate(async () => {
      const at = await checkpointContext(w);
      if (isOutcome(at)) return at;
      const l = await readListing(at.workspaceId, req.sessionId);
      return isOutcome(l) ? l : { ok: true, value: l };
    }),
    'checkpoints.preview': (req, { w }) => checkpointGate(() => checkpointPreview(w, req.sessionId, req.sequence)),
    'checkpoints.restore': (req, { w }) => checkpointGate(() => checkpointRestore(w, req.sessionId, req.sequence, req.force)),
  };
}
