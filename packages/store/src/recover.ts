import { closeSync, existsSync, fsyncSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { WorkspaceId } from '@rotaris/kernel';
import { restoreJournal, stagingDir, storeDir } from './layout.js';

/**
 * OQ-266, ruled 2026-10-13 under R-072 — a restore cut between its two renames is reversed at the next open.
 *
 * ADR-0058's restore displaces the target (step 8) and installs the staging copy (step 9); a process that dies between the
 * two leaves the target name empty, the store it displaced whole at `<identifier>.displaced-<stamp>[.n]` and the staging
 * copy whole beside it (`pnpm restore-kill-proof`, 10 of 10). Nothing in that state says a restore was cut, so the restore
 * now writes a durable journal, `<identifier>.restore-pending`, before step 8, and removes it once step 9 or the in-process
 * reversal has succeeded. The workspace service's next open of that identifier acts on the journal alone, before anything
 * is created: it puts back the store this restore displaced, applies nothing from the backup, and says so once.
 *
 * This is REQ-SESSION-201's failure clause carried out, not a restore run by itself: nothing from the artifact is installed,
 * and a `.displaced-*` beside a present store — the store a successful restore keeps — is never touched.
 */

/** What the journal holds: the stamp step 8 names the displaced store with, the staging number, and whether there was a store. */
export interface RestoreJournal {
  readonly stamp: string;
  readonly stagingN: number;
  readonly targetExisted: boolean;
}

/** What the next open did about a cut restore; `workspace.opened` carries it to main, which tells the user once. */
export interface CutRestore {
  /** The store put back at the target name (the displaced path it came from), or `null` when there was none to put back. */
  readonly reversed: string | null;
  /** Whether the workspace had a store here before the restore began. */
  readonly hadStore: boolean;
  /** The prepared copy of the backup, kept where the restore staged it. */
  readonly staging: string;
  /** The stamp the restore began under. */
  readonly stamp: string;
}

/** The next open could not put the displaced store back: the journal is kept, nothing is created, and the open refuses. */
export class CutRestoreError extends Error {
  constructor(readonly target: string, readonly displaced: string | null, message: string) {
    super(message);
    this.name = 'CutRestoreError';
  }
}

function fsyncDirectory(dir: string): void {
  // A directory's entry is durable once the directory is flushed; Windows refuses to open a directory for that and
  // flushes the entry with the file, so a refusal there is not a failure.
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch { /* EISDIR / EPERM on Windows */ } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Written before step 8 — replaced where a stale one is there — then flushed with its directory. */
export function writeRestoreJournal(workspacesRoot: string, id: WorkspaceId, journal: RestoreJournal): void {
  const file = restoreJournal(workspacesRoot, id);
  const fd = openSync(file, 'w');
  try {
    writeSync(fd, `${JSON.stringify(journal)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDirectory(dirname(file));
}

/**
 * Removed once step 9 or the reversal has succeeded; best effort, since a journal beside a present store is harmless and the
 * next open removes it. A remove that fails (a held handle, something other than a file at the name) never throws: it would
 * otherwise reject a restore that installed, or an open, over a file whose only job is already done.
 */
export function removeRestoreJournal(workspacesRoot: string, id: WorkspaceId): void {
  try {
    rmSync(restoreJournal(workspacesRoot, id), { force: true });
  } catch { /* best effort, above */ }
}

/** The journal, `null` where there is none, or `'unreadable'` where a write was cut before its flush. */
export function readRestoreJournal(workspacesRoot: string, id: WorkspaceId): RestoreJournal | 'unreadable' | null {
  const file = restoreJournal(workspacesRoot, id);
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as Partial<RestoreJournal>;
    if (typeof j.stamp !== 'string' || typeof j.stagingN !== 'number' || typeof j.targetExisted !== 'boolean') return 'unreadable';
    return { stamp: j.stamp, stagingN: j.stagingN, targetExisted: j.targetExisted };
  } catch {
    return 'unreadable';
  }
}

/** The store step 8 claimed under `stamp`: the highest counter, since the claim tries the names upward (D6). */
export function displacedUnder(workspacesRoot: string, id: WorkspaceId, stamp: string): string | null {
  const bare = `${id}.displaced-${stamp}`;
  let best: { n: number; name: string } | null = null;
  for (const name of readdirSync(workspacesRoot)) {
    // OQ-281: a dot-prefixed entry is a store being made, never one set aside.
    if (name.startsWith('.')) continue;
    let n: number;
    if (name === bare) n = 0;
    else if (name.startsWith(`${bare}.`) && /^\d+$/.test(name.slice(bare.length + 1))) n = Number(name.slice(bare.length + 1));
    else continue;
    if (best === null || n > best.n) best = { n, name };
  }
  return best === null ? null : join(workspacesRoot, best.name);
}

/**
 * The next open's check, run before anything is created (`openWorkspaceStore`). It acts on the journal alone:
 *  - no journal: nothing;
 *  - a journal and a present target: a restore that finished, or a stale journal — the journal is removed, nothing else;
 *  - a journal and an absent target, with a store before: the highest `.displaced-<stamp>[.n]` is renamed back, then the
 *    journal removed;
 *  - a journal and an absent target, with no store before: the journal is removed, and the ordinary creating open follows;
 *  - a journal that cannot be read: its write was cut before its flush, so step 8 never ran — removed, nothing else.
 * A rename that fails, or a displaced store that is not there, keeps the journal and throws `CutRestoreError`.
 */
export function recoverCutRestore(workspacesRoot: string, id: WorkspaceId, deps: { readonly rename?: typeof renameSync } = {}): CutRestore | null {
  const journal = readRestoreJournal(workspacesRoot, id);
  if (journal === null) return null;
  const target = storeDir(workspacesRoot, id);
  if (journal === 'unreadable' || existsSync(target)) {
    removeRestoreJournal(workspacesRoot, id);
    return null;
  }
  const staging = stagingDir(workspacesRoot, id, journal.stagingN);
  if (!journal.targetExisted) {
    removeRestoreJournal(workspacesRoot, id);
    return { reversed: null, hadStore: false, staging, stamp: journal.stamp };
  }
  const displaced = displacedUnder(workspacesRoot, id, journal.stamp);
  if (displaced === null) {
    throw new CutRestoreError(target, null, `a restore begun at ${journal.stamp} did not finish, and the store it set aside (${id}.displaced-${journal.stamp}) is not beside ${target}; nothing was created there`);
  }
  try {
    (deps.rename ?? renameSync)(displaced, target);
  } catch (e) {
    throw new CutRestoreError(target, displaced, `the store for this workspace is at ${displaced} and must be renamed to ${target} (${(e as NodeJS.ErrnoException).code ?? String(e)})`);
  }
  removeRestoreJournal(workspacesRoot, id);
  return { reversed: displaced, hadStore: true, staging, stamp: journal.stamp };
}
