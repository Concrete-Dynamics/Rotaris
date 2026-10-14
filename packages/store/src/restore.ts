import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileStamp, millis, type MachineId, type Millis, type Timers, type WallClock, type WorkspaceId } from '@rotaris/kernel';
import { canonicalPath, isLockForeign, isLockLive } from '@rotaris/platform';
import { expandArtifact } from './backup.js';
import { removeRestoreJournal, writeRestoreJournal } from './recover.js';
import { StoreDal } from './dal.js';
import { ASIDE_TRIES, asideName, CONTAINER_MANIFEST, CONTAINER_STORE_FILE, ORIGIN_FILE, restoreStorePaths, STORE_FILE, stagingDir, storeDir, storeFile, storePathLimit } from './layout.js';
import { forgetSpelling, openStore, type StoreHandle } from './open.js';

/**
 * ADR-0058 — the restore, AS CORRECTED on 2026-09-02 and RE-MEASURED as IC-1
 * (`docs/architecture/spikes/corrected-restore-rerun.md`). Steps 1, 2, 3, 3a,
 * 3b, 4, 4a, 5, 6, 7, 8, 9, 9a and the R1/R2 reversal. This is the port of
 * that harness's `restore2.js` into product code; `restore.test.ts` is the
 * port of its experiments, each with its counterfactual.
 *
 * What each step exists for, because every one was measured to matter:
 *  1   refuse new runs — a LEASE the run host expires itself (3b), so a dead
 *      workspace service releases the workspace by doing nothing.
 *  2   liveness, with the refusal in force, on the service's own connection.
 *  3   the run host closes its connection and acknowledges — BOUNDED (3a);
 *      expiry REFUSES, because a bound that proceeds was measured to fail
 *      later, after mutation, at the rename (D3).
 *  4   liveness a SECOND time, after that acknowledgement — the evaluation the
 *      swap rests on. Removing it destroyed a raced session 10/10 (IC-1 E1c).
 *  4a  abandonment releases the run host. Not optional.
 *  5   the service closes its own connection.
 *  6   expand, ARRANGE INTO THE STORE LAYOUT (D7), drop foreign lock rows
 *      (ADR-0005 c.11), open read-write.
 *  7   close the staging connection — its own step.
 *  9a  origin.txt, written before the install so the directory is a complete
 *      store at the moment it becomes one (D7).
 *  8   displace the target: milliseconds AND a counter; the rename IS the
 *      claim on this platform (D6; the counter, not the granularity, is
 *      load-bearing — IC-1 E4).
 *  9   staging → <identifier>.
 *  8-journal (OQ-266, 2026-10-14): `<identifier>.restore-pending`, durable before
 *      step 8 and removed once step 9 or the reversal has succeeded, so a process
 *      cut between the two renames is reversed at the next open (recover.ts).
 *  R1/R2 on a failed install: displace whatever occupies the target name,
 *      then rename the displaced store back. The single-rename reversal
 *      reached a store directory holding no database 10/10 (IC-1 E2c).
 *
 * D9 (both ends): a lock naming another machine is reported TOGETHER, as one
 * condition, and the caller may confirm and proceed — never per-session
 * clearing as a precondition, never a bare refusal. The confirmation must
 * state the risk: if the store genuinely is reachable elsewhere, a run there
 * may be writing now.
 *
 * D5, ADR-0058 consequence 18, is half repaired (2026-10-14; OQ-265 ruled
 * 2026-10-13 under R-072): every failure that leaves the store as it was deletes the
 * restore's own staging copy before it returns (`discardStaging`), and a
 * delete that fails is listed in `leftovers` and named in the error. The copy
 * is kept, and listed, only after a reversal that failed; a process killed
 * mid-restore runs no deletion (OQ-266). The obstruction aside's half stays
 * deferred with OQ-48 under R-071: the product cannot know what it is.
 * D8 is repaired (2026-10-13): the -wal/-shm left in the target came from the
 * ASSESSMENT's read-only open, never from this gate — `svc` below is a
 * read-write connection whose close, the last one, removes the two files its
 * open created; the assessment now opens through `openStoreForInspection`
 * (open.ts). D11 is repaired (2026-10-13): step 0 below refuses, before
 * anything is asked of the run host, a restore whose staging store or kept
 * store would cross the engine's path limit (`storePathLimit`, layout.ts).
 *
 * IC-5: `store.test.ts` aims a test at the layout conversion against an artifact
 * whose container layout differs from the store layout, with `skipArrange` as
 * the counterfactual (D7 as it was). Discharged 2026-09-03; see the note on
 * ADR-0058 and implementation-conditions.md.
 */

export const ACK_BOUND_MS: Millis = millis(2_000);
export const REFUSAL_LEASE_MS: Millis = millis(30_000);

/** The run host as the restore sees it. The real one is a utility process behind the process protocol. */
export interface RunHostControl {
  refuseRuns(id: WorkspaceId, leaseMs: Millis): Promise<void>;
  closeStore(id: WorkspaceId): Promise<void>;
  release(id: WorkspaceId): Promise<void>;
  reopen(id: WorkspaceId, storeFile: string): Promise<void>;
}

export interface RestoreContext {
  readonly workspacesRoot: string;
  readonly id: WorkspaceId;
  readonly artifact: string;
  readonly thisMachine: MachineId;
  readonly originLabel: string;
  readonly runHost: RunHostControl;
  readonly timers: Timers;
  readonly wall: WallClock;
}

export interface RestoreOptions {
  /** D9: the user has seen the foreign rows as one condition, with the risk stated, and confirmed. */
  readonly proceedWithForeignLocks?: boolean;
  readonly ackBoundMs?: Millis;
  readonly stagingN?: number;
  /** Test hooks — counterfactuals. Each reproduces a measured defect and must stay available to the test. */
  readonly forceInstallFail?: 'target-exists';
  /** IC-5's counterfactual: D7 as it was — the container's layout installed as the store's. */
  readonly skipArrange?: boolean;
  readonly singleLiveness?: boolean;
  readonly oldReversal?: boolean;
  readonly stamp?: string;
  /**
   * The kill-in-the-gap measurement (ADR-0058, README B2): awaited after step 8 has displaced the target and before step 9
   * installs the staging copy — the one window in which the target name holds nothing. `restore-kill-proof` kills the
   * process here; `store.test.ts` throws here. Never set by the product.
   */
  readonly betweenRenames?: () => Promise<void>;
  /** Test hook: R2 does not run, as though its rename had failed, so the journal is kept for the next open (OQ-266). */
  readonly forceReversalFail?: boolean;
  /** OQ-266's counterfactual: no journal is written before step 8, so a cut between the renames is the case as it was. */
  readonly skipJournal?: boolean;
  /** Test hook: the delete OQ-265's discard runs, replaced to make it fail. Never set by the product. */
  readonly removeStaging?: typeof rmSync;
  /** D11: the engine's database-path limit to hold the restore to; `null` for none (D11 as it was). Defaults to this platform's. */
  readonly storePathLimit?: number | null;
}

/** D11 — the restore's database paths measured against the engine's limit, as the engine will be handed them (canonical). */
export function restorePathTooLong(
  workspacesRoot: string, id: WorkspaceId, opts: { readonly limit: number | null; readonly stampLength: number; readonly stagingN?: number; readonly targetExists: boolean },
): { readonly which: 'kept' | 'staging'; readonly path: string; readonly length: number; readonly limit: number } | null {
  if (opts.limit === null) return null;
  const p = restoreStorePaths(canonicalPath(workspacesRoot), id, opts.stampLength, opts.stagingN ?? 1, opts.targetExists);
  const widest = p.kept !== null && p.kept.length >= p.staging.length ? { which: 'kept' as const, path: p.kept } : { which: 'staging' as const, path: p.staging };
  return widest.path.length > opts.limit ? { ...widest, length: widest.path.length, limit: opts.limit } : null;
}

/** What a restore refused on D11 says, in the words a person reads before anything is changed. */
export function pathTooLongDetail(t: { readonly which: 'kept' | 'staging'; readonly path: string; readonly length: number; readonly limit: number }): string {
  const what = t.which === 'kept' ? 'the copy a restore keeps of the store it replaces' : 'the copy a restore prepares the backup in';
  return `This machine keeps this workspace's sessions at a path too long to restore into: ${what} would be up to ${t.length} characters long (${t.path}), and the store engine on this platform opens none longer than ${t.limit}. Nothing was changed.`;
}

export type Refusal =
  | { readonly why: 'ack-timeout'; readonly step: 1 | 3; readonly boundMs: Millis }
  | { readonly why: 'sessions-live'; readonly step: 2 | 4; readonly sessions: readonly string[] }
  | { readonly why: 'foreign-locks'; readonly sessions: readonly string[]; readonly risk: string };

export interface RestoreReport {
  readonly ok: boolean;
  readonly abandoned: boolean;
  readonly refusal?: Refusal;
  readonly error?: string;
  /** Where the previous store went, if there was one. Kept on purpose. */
  readonly displaced?: string;
  readonly leftovers: readonly string[];
  readonly reversal?: { readonly mode: 'displace-then-rename' | 'single-rename'; readonly ok: boolean; readonly obstruction?: string };
  readonly steps: readonly string[];
  readonly stamp?: string;
}

function bounded<T>(p: Promise<T>, ms: Millis, timers: Timers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const h = timers.after(ms, () => { if (!settled) { settled = true; reject(new Error('timeout')); } });
    p.then((v) => { if (!settled) { settled = true; h.cancel(); resolve(v); } }, (e) => { if (!settled) { settled = true; h.cancel(); reject(e); } });
  });
}

/** Step 8's claim. The rename IS the exclusive claim: a directory cannot be renamed onto an existing one here. */
export function claimAsideName(workspacesRoot: string, id: WorkspaceId, stamp: string, kind: 'displaced' | 'obstruction', from: string, tries: number = ASIDE_TRIES): { ok: true; to: string; attempts: number } | { ok: false; code: string; attempts: number } {
  let lastCode = 'ENAMETAKEN';
  for (let i = 0; i < tries; i++) {
    const to = asideName(workspacesRoot, id, kind, stamp, i);
    if (existsSync(to)) continue;
    try {
      renameSync(from, to);
      return { ok: true, to, attempts: i + 1 };
    } catch (e) {
      lastCode = (e as NodeJS.ErrnoException).code ?? 'EUNKNOWN';
    }
  }
  return { ok: false, code: lastCode, attempts: tries };
}

/** Step 6's layout conversion (D7): the container's names are the container's; the store's are ADR-0058's. */
export function arrangeStagingIntoStoreLayout(stage: string): { moved: [string, string][]; removed: string[] } {
  const moved: [string, string][] = [];
  const removed: string[] = [];
  const src = join(stage, CONTAINER_STORE_FILE);
  if (existsSync(src)) { renameSync(src, join(stage, STORE_FILE)); moved.push([CONTAINER_STORE_FILE, STORE_FILE]); }
  const manifest = join(stage, CONTAINER_MANIFEST);
  if (existsSync(manifest)) { rmSync(manifest); removed.push(CONTAINER_MANIFEST); }
  return { moved, removed };
}

/**
 * OQ-265 (ruled 2026-10-13 under R-072): the restore's own staging copy, deleted on a failure that leaves the store as
 * it was. It holds nothing the artifact the user chose does not. `null` when it is gone; the path when the delete threw.
 */
export function discardStaging(stage: string, rm: typeof rmSync = rmSync): string | null {
  try {
    rm(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return null;
  } catch {
    return stage;
  }
}

/** The sentence a failed delete adds to the failure's error, which reaches the notice and the log alike (OQ-265). */
export function stagingLeftDetail(path: string): string {
  return `A working copy of the backup could not be removed and is at ${path}; it holds nothing the backup file does not, and it can be deleted.`;
}

export async function restoreStore(ctx: RestoreContext, opts: RestoreOptions = {}): Promise<RestoreReport> {
  const { workspacesRoot, id, thisMachine, runHost, timers } = ctx;
  const steps: string[] = [];
  const leftovers: string[] = [];
  const target = storeDir(workspacesRoot, id);
  const dbFile = storeFile(workspacesRoot, id);
  const ackBound = opts.ackBoundMs ?? ACK_BOUND_MS;

  // 0 — D11: a restore whose staging store or kept store the engine could not open is refused before anything is
  // asked of anyone. The rename that would put the kept store there always succeeds; only the next open fails.
  const tooLong = restorePathTooLong(workspacesRoot, id, {
    limit: opts.storePathLimit === undefined ? storePathLimit() : opts.storePathLimit,
    stampLength: (opts.stamp ?? fileStamp(ctx.wall.instant())).length,
    stagingN: opts.stagingN ?? 1,
    targetExists: existsSync(target),
  });
  if (tooLong) return { ok: false, abandoned: true, error: pathTooLongDetail(tooLong), leftovers, steps: ['0-path-too-long'] };

  // The target may not exist yet: a restore into an artifact's own store on a machine that never held it
  // (ADR-0058 case (c) outcome 2, case (b)). Then there are no locks to judge and nothing to displace.
  let svc: StoreHandle | null = existsSync(dbFile) ? openStore(dbFile, { mustExist: true }) : null;
  let dal: StoreDal | null = svc ? new StoreDal(svc) : null;

  const abandon = async (refusal: Refusal): Promise<RestoreReport> => {
    if (svc) { try { svc.close(); } catch { /* */ } svc = null; dal = null; }
    await runHost.release(id).catch(() => undefined); // 4a — not optional
    steps.push('4a-abandon');
    return { ok: false, abandoned: true, refusal, leftovers, steps };
  };

  const judge = (): { live: string[]; foreign: string[] } => {
    if (!dal) return { live: [], foreign: [] };
    const locks = dal.listLocks();
    const foreign = locks.filter((l) => isLockForeign(l, thisMachine)).map((l) => l.session_id);
    const live = locks.filter((l) => !isLockForeign(l, thisMachine) && isLockLive(l, thisMachine)).map((l) => l.session_id);
    return { live, foreign };
  };

  // 1 — refuse new runs (a lease), bounded; expiry refuses.
  try {
    await bounded(runHost.refuseRuns(id, REFUSAL_LEASE_MS), ackBound, timers);
    steps.push('1-refuse');
  } catch {
    steps.push('1-refuse-timeout');
    return abandon({ why: 'ack-timeout', step: 1, boundMs: ackBound });
  }

  // 2 — first liveness, with the refusal in force. D9: foreign rows are one condition, confirmable.
  const l2 = judge();
  steps.push('2-liveness');
  if (l2.foreign.length > 0 && !opts.proceedWithForeignLocks) {
    return abandon({ why: 'foreign-locks', sessions: l2.foreign, risk: 'If this store is genuinely reachable from another machine, a run there may be writing to it now. Restoring replaces it.' });
  }
  if (l2.live.length > 0) return abandon({ why: 'sessions-live', step: 2, sessions: l2.live });

  // 3 / 3a — the run host closes and acknowledges, bounded; expiry refuses.
  try {
    await bounded(runHost.closeStore(id), ackBound, timers);
    steps.push('3-close');
  } catch {
    steps.push('3-close-timeout');
    return abandon({ why: 'ack-timeout', step: 3, boundMs: ackBound });
  }

  // 4 — liveness a SECOND time. This is the evaluation the swap rests on.
  if (!opts.singleLiveness) {
    const l4 = judge();
    steps.push('4-liveness');
    if (l4.live.length > 0) return abandon({ why: 'sessions-live', step: 4, sessions: l4.live });
  } else {
    steps.push('4-liveness-SKIPPED(counterfactual)');
  }

  // 5 — the service closes its own connection.
  if (svc) { svc.close(); forgetSpelling(target); }
  svc = null; dal = null;
  steps.push('5-close-service');

  // 6 — expand, arrange, drop foreign locks, open read-write. A leftover copy of an earlier restore is cleared first.
  const stage = stagingDir(workspacesRoot, id, opts.stagingN ?? 1);
  const rm = opts.removeStaging ?? rmSync;
  rmSync(stage, { recursive: true, force: true });
  /** OQ-266: the journal, once written, is removed by every return but a failed reversal's. */
  let journalWritten = false;
  /** OQ-265: a failure that leaves the store as it was deletes the staging copy; a delete that fails is listed and named. */
  const failSafely = (error: string, extra: Partial<RestoreReport> = {}): RestoreReport => {
    if (journalWritten) removeRestoreJournal(workspacesRoot, id);
    const left = discardStaging(stage, rm);
    if (left !== null) leftovers.push(left);
    return { ok: false, abandoned: false, ...extra, error: left === null ? error : `${error}. ${stagingLeftDetail(left)}`, leftovers, steps };
  };
  // Held outside the try so the catch can close it: a handle still open on Windows makes the delete fail.
  let stageDb: StoreHandle | null = null;
  let prepared = false;
  try {
    expandArtifact(ctx.artifact, stage);
    if (!opts.skipArrange) arrangeStagingIntoStoreLayout(stage);
    else steps.push('6-arrange-SKIPPED(counterfactual)');
    prepared = true;
    stageDb = openStore(join(stage, opts.skipArrange ? CONTAINER_STORE_FILE : STORE_FILE), { mustExist: true });
    const check = stageDb.pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      stageDb.close(); stageDb = null; forgetSpelling(stage);
      return failSafely(`staging store failed quick_check: ${String(check)}`);
    }
    new StoreDal(stageDb).deleteLocksNotOnHost(thisMachine);
    stageDb.close(); // 7
    stageDb = null;
    forgetSpelling(stage);
    steps.push('6-expand-open', '7-close-staging');
  } catch (e) {
    if (stageDb) { try { stageDb.close(); } catch { /* */ } stageDb = null; }
    forgetSpelling(stage);
    return failSafely(prepared ? `staging store did not open: ${String(e)}` : `staging store could not be prepared: ${String(e)}`);
  }

  // 9a — origin.txt before the install (D7). The counterfactual leaves the container's layout as it was.
  if (!opts.skipArrange) { writeFileSync(join(stage, ORIGIN_FILE), `${ctx.originLabel}\n`); steps.push('9a-origin'); }

  // OQ-266 — the journal, durable before step 8, so a process cut between the two renames leaves a restore the next open
  // can name and reverse (`recoverCutRestore`, recover.ts). The counterfactual (`skipJournal`) is the cut as it was.
  const stamp = opts.stamp ?? fileStamp(ctx.wall.instant());
  const targetExisted = existsSync(target);
  if (!opts.skipJournal) {
    // A journal that cannot be written (a full disk, a refused create) is a failure that leaves the store as it was: nothing
    // has been displaced yet, so it returns through OQ-265's discard rather than rejecting with the copy left behind.
    try {
      writeRestoreJournal(workspacesRoot, id, { stamp, stagingN: opts.stagingN ?? 1, targetExisted });
    } catch (e) {
      removeRestoreJournal(workspacesRoot, id);
      return failSafely(`the restore's journal could not be written: ${String(e)}`, { stamp });
    }
    journalWritten = true;
    steps.push('8-journal');
  }

  // 8 — displace the target. Milliseconds AND a counter; the rename is the claim.
  let displaced: string | undefined;
  if (targetExisted) {
    const c = claimAsideName(workspacesRoot, id, stamp, 'displaced', target);
    if (!c.ok) return failSafely(`step 8 failed: ${c.code}`, { stamp });
    displaced = c.to;
    steps.push(`8-displace(attempts=${c.attempts})`);
  } else {
    steps.push('8-displace(skipped)');
  }

  if (opts.betweenRenames) await opts.betweenRenames();

  if (opts.forceInstallFail === 'target-exists') { mkdirSync(target, { recursive: true }); writeFileSync(join(target, 'squatter.txt'), 'x'); }

  // 9 — staging → <identifier>.
  let installErr: string | undefined;
  try { renameSync(stage, target); } catch (e) { installErr = (e as NodeJS.ErrnoException).code ?? 'EUNKNOWN'; }
  steps.push(installErr ? `9-install-FAILED(${installErr})` : '9-install');

  if (!installErr) {
    if (journalWritten) removeRestoreJournal(workspacesRoot, id);
    await runHost.reopen(id, dbFile).catch(() => undefined);
    steps.push('10-reopen');
    const r: RestoreReport = { ok: true, abandoned: false, leftovers, steps, stamp };
    return displaced ? { ...r, displaced } : r;
  }

  // The reversal.
  if (!targetExisted || !displaced) {
    return failSafely(`restore failed at step 9 (${installErr}); there was no previous store to put back`, { stamp });
  }
  if (!opts.oldReversal) {
    let obstruction: string | undefined;
    let r1ok = true;
    if (existsSync(target)) {
      const c = claimAsideName(workspacesRoot, id, stamp, 'obstruction', target);
      r1ok = c.ok;
      if (c.ok) { obstruction = c.to; leftovers.push(c.to); }
    }
    let r2ok = false;
    if (r1ok && !opts.forceReversalFail) { try { renameSync(displaced, target); r2ok = true; } catch { /* */ } }
    const reversal = { mode: 'displace-then-rename' as const, ok: r2ok, ...(obstruction ? { obstruction } : {}) };
    // The store is back: the staging copy is discarded (OQ-265). Not back: it is kept and listed, beside the store to rename.
    if (r2ok) return failSafely(`restore failed at step 9 (${installErr}); the previous store was put back`, { displaced, stamp, reversal });
    // The journal stays (OQ-266): with the target name free, the next open of this workspace renames the store back.
    leftovers.push(stage);
    const retried = journalWritten && !existsSync(target);
    return {
      ok: false, abandoned: false, displaced, leftovers, steps, stamp, reversal,
      error: `restore failed at step 9 (${installErr}): the store for this workspace is at ${displaced} and must be renamed to ${target}${retried ? '; the next open of this workspace will try that rename again' : ''}`,
    };
  }
  // The single-rename counterfactual (E2c) stays as it was measured.
  leftovers.push(stage);
  let ok = false;
  try { renameSync(displaced, target); ok = true; } catch { /* */ }
  if (ok && journalWritten) removeRestoreJournal(workspacesRoot, id);
  return {
    ok: false, abandoned: false, displaced, leftovers, steps, stamp, reversal: { mode: 'single-rename', ok },
    error: ok ? `restore failed at step 9 (${installErr}); the previous store was put back` : `restore failed at step 9 (${installErr}): the store for this workspace is at ${displaced} and must be renamed to ${target}`,
  };
}
