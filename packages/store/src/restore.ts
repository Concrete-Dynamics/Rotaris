import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileStamp, millis, type MachineId, type Millis, type Timers, type WallClock, type WorkspaceId } from '@rotaris/kernel';
import { isLockForeign, isLockLive } from '@rotaris/platform';
import { expandArtifact } from './backup.js';
import { StoreDal } from './dal.js';
import { asideName, CONTAINER_MANIFEST, CONTAINER_STORE_FILE, ORIGIN_FILE, STORE_FILE, stagingDir, storeDir, storeFile } from './layout.js';
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
 * Open, and stated in ADR-0058 consequence 18: D5 (nothing deletes the
 * staging copy or the obstruction aside), D11 (the suffix against the engine's
 * path thresholds). D8 is repaired (2026-10-13): the -wal/-shm left in the
 * target came from the ASSESSMENT's read-only open, never from this gate —
 * `svc` below is a read-write connection whose close, the last one, removes
 * the two files its open created; the assessment now opens through
 * `openStoreForInspection` (open.ts).
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
export function claimAsideName(workspacesRoot: string, id: WorkspaceId, stamp: string, kind: 'displaced' | 'obstruction', from: string, tries = 5): { ok: true; to: string; attempts: number } | { ok: false; code: string; attempts: number } {
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

export async function restoreStore(ctx: RestoreContext, opts: RestoreOptions = {}): Promise<RestoreReport> {
  const { workspacesRoot, id, thisMachine, runHost, timers } = ctx;
  const steps: string[] = [];
  const leftovers: string[] = [];
  const target = storeDir(workspacesRoot, id);
  const dbFile = storeFile(workspacesRoot, id);
  const ackBound = opts.ackBoundMs ?? ACK_BOUND_MS;

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

  // 6 — expand, arrange, drop foreign locks, open read-write.
  const stage = stagingDir(workspacesRoot, id, opts.stagingN ?? 1);
  rmSync(stage, { recursive: true, force: true });
  expandArtifact(ctx.artifact, stage);
  if (!opts.skipArrange) arrangeStagingIntoStoreLayout(stage);
  else steps.push('6-arrange-SKIPPED(counterfactual)');
  try {
    const stageDb = openStore(join(stage, opts.skipArrange ? CONTAINER_STORE_FILE : STORE_FILE), { mustExist: true });
    const check = stageDb.pragma('quick_check', { simple: true });
    if (check !== 'ok') { stageDb.close(); forgetSpelling(stage); leftovers.push(stage); return { ok: false, abandoned: false, error: `staging store failed quick_check: ${String(check)}`, leftovers, steps }; }
    new StoreDal(stageDb).deleteLocksNotOnHost(thisMachine);
    stageDb.close(); // 7
    forgetSpelling(stage);
    steps.push('6-expand-open', '7-close-staging');
  } catch (e) {
    leftovers.push(stage);
    return { ok: false, abandoned: false, error: `staging store did not open: ${String(e)}`, leftovers, steps };
  }

  // 9a — origin.txt before the install (D7). The counterfactual leaves the container's layout as it was.
  if (!opts.skipArrange) { writeFileSync(join(stage, ORIGIN_FILE), `${ctx.originLabel}\n`); steps.push('9a-origin'); }

  // 8 — displace the target. Milliseconds AND a counter; the rename is the claim.
  const stamp = opts.stamp ?? fileStamp(ctx.wall.instant());
  const targetExisted = existsSync(target);
  let displaced: string | undefined;
  if (targetExisted) {
    const c = claimAsideName(workspacesRoot, id, stamp, 'displaced', target);
    if (!c.ok) { leftovers.push(stage); return { ok: false, abandoned: false, error: `step 8 failed: ${c.code}`, leftovers, steps, stamp }; }
    displaced = c.to;
    steps.push(`8-displace(attempts=${c.attempts})`);
  } else {
    steps.push('8-displace(skipped)');
  }

  if (opts.forceInstallFail === 'target-exists') { mkdirSync(target, { recursive: true }); writeFileSync(join(target, 'squatter.txt'), 'x'); }

  // 9 — staging → <identifier>.
  let installErr: string | undefined;
  try { renameSync(stage, target); } catch (e) { installErr = (e as NodeJS.ErrnoException).code ?? 'EUNKNOWN'; }
  steps.push(installErr ? `9-install-FAILED(${installErr})` : '9-install');

  if (!installErr) {
    await runHost.reopen(id, dbFile).catch(() => undefined);
    steps.push('10-reopen');
    const r: RestoreReport = { ok: true, abandoned: false, leftovers, steps, stamp };
    return displaced ? { ...r, displaced } : r;
  }

  // The reversal.
  leftovers.push(stage);
  if (!targetExisted || !displaced) {
    return { ok: false, abandoned: false, error: `restore failed at step 9 (${installErr}); there was no previous store to put back`, leftovers, steps, stamp };
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
    if (r1ok) { try { renameSync(displaced, target); r2ok = true; } catch { /* */ } }
    const reversal = { mode: 'displace-then-rename' as const, ok: r2ok, ...(obstruction ? { obstruction } : {}) };
    return {
      ok: false, abandoned: false, displaced, leftovers, steps, stamp, reversal,
      error: r2ok
        ? `restore failed at step 9 (${installErr}); the previous store was put back`
        : `restore failed at step 9 (${installErr}): the store for this workspace is at ${displaced} and must be renamed to ${target}`,
    };
  }
  let ok = false;
  try { renameSync(displaced, target); ok = true; } catch { /* */ }
  return {
    ok: false, abandoned: false, displaced, leftovers, steps, stamp, reversal: { mode: 'single-rename', ok },
    error: ok ? `restore failed at step 9 (${installErr}); the previous store was put back` : `restore failed at step 9 (${installErr}): the store for this workspace is at ${displaced} and must be renamed to ${target}`,
  };
}
