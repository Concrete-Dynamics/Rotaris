import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkspaceId, type MachineId, type Millis, type Timers, type WallClock, type WorkspaceId } from '@rotaris/kernel';
import { exclusiveCreate, isLockForeign, isLockLive, probePid, replaceDocument, type Liveness } from '@rotaris/platform';
import type { RestoreAssessment, RestoreDecisions, RestoreReportPayload } from '@rotaris/contracts';
import {
  CONTAINER_MANIFEST, CONTAINER_STORE_FILE, CURRENT_SCHEMA_VERSION, expandArtifact, forgetSpelling, openStore, openStoreForInspection, readWorkspaceId, restoreStore,
  StoreDal, storeFile, WORKSPACE_ID_HEADER, workspaceIdFile, type BackupManifest, type RunHostControl,
} from '@rotaris/store';

/**
 * REQ-SESSION-201's restore as the workspace service performs it, in two
 * phases so every confirmation is asked before anything is changed:
 *
 * `assessRestore` is read-only — ADR-0058's gates 1 and 2 (the artifact opens
 * and passes quick_check; its schema is not newer than this build), the
 * identifier case (same / absent / different / unreadable, REQ-SESSION-197,
 * ESC-26), and what the target store holds now including the lock rows that
 * gate it (D9: foreign rows as ONE condition, live rows as a refusal).
 *
 * `performRestore` runs ADR-0058's mechanism (`restoreStore`) into the
 * ARTIFACT's identifier — the store every outcome writes — and then, on
 * success and only where the user chose it, establishes that identifier for
 * the workspace: by exclusive create where none exists (case (b), replaces
 * nothing), or by replacement where the user confirmed ESC-26's exception
 * (case (c) outcome 3). The store under the replaced identifier is never
 * touched: writing the old value back is a complete undo.
 */
export interface AssessDeps {
  readonly workspacesRoot: string;
  readonly workspaceRoot: string;
  readonly artifact: string;
  readonly thisMachine: MachineId;
  readonly probe?: (pid: number) => Liveness;
}

function readManifest(dir: string): BackupManifest | null {
  try {
    const m = JSON.parse(readFileSync(join(dir, CONTAINER_MANIFEST), 'utf8')) as BackupManifest;
    if (m.artifact_format_version !== 1 || !parseWorkspaceId(m.workspace_identifier)) return null;
    return m;
  } catch {
    return null;
  }
}

export function assessRestore(d: AssessDeps): RestoreAssessment {
  const empty: RestoreAssessment['artifact'] = { workspaceId: '', takenAtUtc: '', sessions: 0, rows: 0, locks: 0, storeUserVersion: 0, lastSeenWorkspacePath: null };
  const noTarget: RestoreAssessment['target'] = { exists: false, sessions: 0, foreignLocks: [], liveLocks: [] };
  const refuse = (why: NonNullable<RestoreAssessment['refusal']>['why'], detail: string, artifact = empty): RestoreAssessment =>
    ({ artifact, identifier: { case: 'absent', current: null }, target: noTarget, refusal: { why, detail } });

  // Gate 1 and 2, on the artifact alone, in a scratch directory that is removed whatever happens.
  const peek = mkdtempSync(join(d.workspacesRoot, '.assess-'));
  let manifest: BackupManifest | null = null;
  let userVersion = 0;
  try {
    try {
      expandArtifact(d.artifact, peek);
    } catch (cause) {
      return refuse('unreadable-artifact', `The file could not be read as a backup: ${String(cause)}`);
    }
    manifest = readManifest(peek);
    if (!manifest) return refuse('unreadable-artifact', 'The file carries no readable backup manifest.');
    const dbFile = join(peek, CONTAINER_STORE_FILE);
    if (!existsSync(dbFile)) return refuse('unreadable-artifact', 'The backup holds no store.');
    let db;
    try {
      db = openStore(dbFile, { readonly: true, mustExist: true });
    } catch (cause) {
      return refuse('corrupt', `The backup's store does not open: ${String(cause)}`);
    }
    try {
      const check = db.pragma('quick_check', { simple: true });
      userVersion = db.pragma('user_version', { simple: true }) as number;
      if (check !== 'ok') return refuse('corrupt', `The backup's store fails its integrity check: ${String(check)}`);
    } finally {
      db.close();
      forgetSpelling(peek);
    }
  } finally {
    rmSync(peek, { recursive: true, force: true });
  }
  const artifact: RestoreAssessment['artifact'] = {
    workspaceId: manifest.workspace_identifier, takenAtUtc: manifest.taken_at_utc, sessions: manifest.counts.sessions, rows: manifest.counts.rows,
    locks: manifest.counts.locks, storeUserVersion: userVersion, lastSeenWorkspacePath: manifest.last_seen_workspace_path,
  };
  if (userVersion > CURRENT_SCHEMA_VERSION) {
    return refuse('newer-schema', `The backup was taken by a newer version (store schema ${userVersion}; this build reads up to ${CURRENT_SCHEMA_VERSION}). Update Rotaris and try again.`, artifact);
  }

  // The identifier case.
  const current = readWorkspaceId(d.workspaceRoot);
  if (current.state === 'unreadable') {
    return refuse('unreadable-identifier', `This workspace's identifier file is present but cannot be read (it begins: ${current.raw.slice(0, 60)}). It is never written over; repair it by hand first.`, artifact);
  }
  const identifier: RestoreAssessment['identifier'] = current.state === 'absent'
    ? { case: 'absent', current: null }
    : { case: current.id === artifact.workspaceId ? 'same' : 'different', current: current.id };

  // The target: the store every outcome writes — the artifact's own identifier on this machine.
  const targetId = artifact.workspaceId as WorkspaceId;
  const targetFile = storeFile(d.workspacesRoot, targetId);
  let target: RestoreAssessment['target'] = noTarget;
  if (existsSync(targetFile)) {
    // D8 (ADR-0058 consequence 18): an inspection that leaves the target's directory holding the files it found —
    // the read-only open this replaced left `-wal` and `-shm` in a target that had been closed cleanly.
    const db = openStoreForInspection(targetFile);
    try {
      const dal = new StoreDal(db);
      const locks = dal.listLocks();
      const probe = d.probe ?? probePid;
      target = {
        exists: true, sessions: dal.totals().sessions,
        foreignLocks: locks.filter((l) => isLockForeign(l, d.thisMachine)).map((l) => l.session_id),
        liveLocks: locks.filter((l) => !isLockForeign(l, d.thisMachine) && isLockLive(l, d.thisMachine, probe)).map((l) => l.session_id),
      };
    } finally {
      db.close();
      forgetSpelling(join(d.workspacesRoot, targetId));
    }
  }
  return { artifact, identifier, target, refusal: null };
}

export interface PerformDeps extends AssessDeps {
  readonly decisions: RestoreDecisions;
  readonly runHost: RunHostControl;
  readonly timers: Timers;
  readonly wall: WallClock;
  readonly ackBoundMs?: Millis;
}

/** The decision each case admits; anything else is refused before any mutation. */
export function decisionAllowed(c: RestoreAssessment['identifier']['case'], d: RestoreDecisions['identifier']): boolean {
  if (c === 'same') return d === 'workspace';
  if (c === 'absent') return d === 'establish';
  if (c === 'different') return d === 'artifact-store' || d === 'establish';
  return false;
}

export async function performRestore(d: PerformDeps): Promise<RestoreReportPayload> {
  const a = assessRestore(d);
  const fail = (error: string): RestoreReportPayload => ({ ok: false, abandoned: true, error, leftovers: [], steps: ['assess-refused'], restoredInto: a.artifact.workspaceId, identifierEstablished: false });
  if (a.refusal) return fail(a.refusal.detail);
  if (!decisionAllowed(a.identifier.case, d.decisions.identifier)) return fail(`the decision "${d.decisions.identifier}" is not one the identifier case "${a.identifier.case}" admits`);

  const targetId = a.artifact.workspaceId as WorkspaceId;
  const r = await restoreStore(
    { workspacesRoot: d.workspacesRoot, id: targetId, artifact: d.artifact, thisMachine: d.thisMachine, originLabel: d.workspaceRoot, runHost: d.runHost, timers: d.timers, wall: d.wall },
    { proceedWithForeignLocks: d.decisions.proceedWithForeignLocks, ...(d.ackBoundMs === undefined ? {} : { ackBoundMs: d.ackBoundMs }) },
  );
  const refusal: RestoreReportPayload['refusal'] = r.refusal === undefined ? undefined
    : r.refusal.why === 'ack-timeout' ? { why: 'ack-timeout', step: r.refusal.step, boundMs: r.refusal.boundMs }
      : r.refusal.why === 'sessions-live' ? { why: 'sessions-live', step: r.refusal.step, sessions: [...r.refusal.sessions] }
        : { why: 'foreign-locks', sessions: [...r.refusal.sessions], risk: r.refusal.risk };
  const base: RestoreReportPayload = {
    ok: r.ok, abandoned: r.abandoned, leftovers: [...r.leftovers], steps: [...r.steps], restoredInto: targetId, identifierEstablished: false,
    ...(refusal ? { refusal } : {}), ...(r.error === undefined ? {} : { error: r.error }), ...(r.displaced === undefined ? {} : { displaced: r.displaced }),
  };
  if (!r.ok || d.decisions.identifier !== 'establish') return base;

  // ESC-26 / case (b): the identifier, after the store is whole, and only where the user chose it.
  const file = workspaceIdFile(d.workspaceRoot);
  const content = `${WORKSPACE_ID_HEADER}${targetId}\n`;
  if (a.identifier.case === 'absent') {
    const c = exclusiveCreate(file, content);
    if (!c.ok) return { ...base, error: `restored, but the identifier could not be written: ${c.error.headline}` };
    if (!c.value.minted) {
      // Lost the race to another process: what is there wins (REQ-SESSION-197); the sessions are under the artifact's store.
      return { ...base, steps: [...base.steps, 'identifier-race-lost'], error: 'restored, but another process established a different identifier first; the restored sessions are under the backup\'s own store' };
    }
    return { ...base, steps: [...base.steps, 'identifier-established(create)'], identifierEstablished: true };
  }
  const w = await replaceDocument(file, content, { createParent: true, timers: d.timers });
  if (!w.ok) return { ...base, error: `restored, but the identifier could not be replaced: ${w.error.headline}` };
  return { ...base, steps: [...base.steps, 'identifier-established(replace)'], identifierEstablished: true };
}
