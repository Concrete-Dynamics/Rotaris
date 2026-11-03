import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { asideName, CutRestoreError, forgetSpelling, openWorkspaceStore, readRestoreJournal, recoverCutRestore, restoreJournal, stagingDir, StoreDal, storeDir, writeRestoreJournal, type RestoreJournal } from './index.js';

/**
 * Hardening C2 (`docs/architecture/hardening.md` §3.3 row 4; REQ-SESSION-201's failure clause, OQ-266): the next open's
 * reading of the restore journal, met at every point a restore can be cut after it began writing. Each state is laid out
 * on disk as a cut process leaves it — no restore runs here — and `recoverCutRestore` is called twice, because the open
 * that acts on a cut may itself be cut: the second call must find nothing left to do and change nothing.
 *
 * The order the restore follows (`restore.ts`): the staging copy `<id>.restoring-<n>` is prepared; the journal
 * `<id>.restore-pending` is written and flushed; step 8 renames the store to `<id>.displaced-<stamp>[.n]`; step 9 renames the
 * staging copy to `<id>`; the journal is removed.
 */
const id = mintWorkspaceId('000000000000000000000000000000c9');
const STAMP = '2026-11-03T01-02-03-004Z';
let root: string;
let ws: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-recover-')); ws = mkdtempSync(join(tmpdir(), 'rotaris-recover-ws-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

/** The store a restore would displace: a real one, holding `S-before`. */
function storeBefore(): void {
  const r = openWorkspaceStore(root, id, ws);
  new StoreDal(r.db).upsertSession({ session_id: 'S-before', execution_status: 'completed', workspace_root: ws, created_at: 't', updated_at: 't' });
  r.db.close();
  forgetSpelling(r.dir);
}

/** The prepared copy of the backup, marked so a test can tell it from the store it would replace. */
function staging(n = 1): string {
  const dir = stagingDir(root, id, n);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'from-the-backup.txt'), 'staged\n');
  return dir;
}

/** What the workspaces root holds, with each entry's own entries, so "changed nothing" is one comparison. */
function disk(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of readdirSync(root).sort()) {
    const full = join(root, name);
    out[name] = existsSync(full) && !name.endsWith('.restore-pending') ? readdirSync(full).sort() : [];
  }
  return out;
}

function sessionsAt(): string[] {
  const r = openWorkspaceStore(root, id, ws);
  const sids = new StoreDal(r.db).listSessions().map((s) => s.session_id);
  r.db.close();
  forgetSpelling(r.dir);
  return sids;
}

const journal = (over: Partial<RestoreJournal> = {}): RestoreJournal => ({ stamp: STAMP, stagingN: 1, targetExisted: true, ...over });

describe('recoverCutRestore — a restore cut at each step, read at the next open (OQ-266; REQ-SESSION-201)', () => {
  it('cut while the journal was being written (empty, or half a line): step 8 never ran, so the journal goes and nothing else moves', () => {
    storeBefore();
    staging();
    for (const partial of ['', '{"stamp":"2026-11-03T01-0']) {
      writeFileSync(restoreJournal(root, id), partial);
      expect(readRestoreJournal(root, id)).toBe('unreadable');
      const before = disk();
      expect(recoverCutRestore(root, id)).toBeNull();
      expect(existsSync(restoreJournal(root, id))).toBe(false);
      const after = disk();
      delete before[`${id}.restore-pending`];
      expect(after).toEqual(before);
      // Idempotent: the second open finds no journal and does nothing.
      expect(recoverCutRestore(root, id)).toBeNull();
      expect(disk()).toEqual(after);
    }
    expect(sessionsAt()).toEqual(['S-before']);
  });

  it('cut after the journal, before step 8: the store is still in place, so the journal is stale — removed, the store and the staging copy untouched', () => {
    storeBefore();
    const stage = staging();
    writeRestoreJournal(root, id, journal());
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(existsSync(restoreJournal(root, id))).toBe(false);
    expect(readdirSync(stage)).toEqual(['from-the-backup.txt']);
    const after = disk();
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(disk()).toEqual(after);
    expect(sessionsAt()).toEqual(['S-before']);
  });

  it('cut between step 8 and step 9: the displaced store is put back, nothing from the backup is applied, and a second open has nothing to do', () => {
    storeBefore();
    const stage = staging();
    writeRestoreJournal(root, id, journal());
    const displaced = asideName(root, id, 'displaced', STAMP, 0);
    renameSync(storeDir(root, id), displaced);
    expect(existsSync(storeDir(root, id))).toBe(false);

    expect(recoverCutRestore(root, id)).toEqual({ reversed: displaced, hadStore: true, staging: stage, stamp: STAMP });
    expect(existsSync(displaced)).toBe(false);
    expect(existsSync(restoreJournal(root, id))).toBe(false);
    // The staging copy is kept where the restore left it, and never installed.
    expect(readdirSync(stage)).toEqual(['from-the-backup.txt']);
    expect(existsSync(join(storeDir(root, id), 'from-the-backup.txt'))).toBe(false);
    const after = disk();
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(disk()).toEqual(after);
    expect(sessionsAt()).toEqual(['S-before']);
  });

  it('cut between step 8 and step 9 after the claim retried its name: the highest counter is the store this restore displaced', () => {
    storeBefore();
    staging();
    writeRestoreJournal(root, id, journal());
    // Two earlier claims under the same stamp found their names taken (D6): the store went to `.2`.
    for (const n of [0, 1]) { mkdirSync(asideName(root, id, 'displaced', STAMP, n)); writeFileSync(join(asideName(root, id, 'displaced', STAMP, n), 'older.txt'), 'x'); }
    const displaced = asideName(root, id, 'displaced', STAMP, 2);
    renameSync(storeDir(root, id), displaced);
    expect(recoverCutRestore(root, id)?.reversed).toBe(displaced);
    expect(existsSync(asideName(root, id, 'displaced', STAMP, 0))).toBe(true);
    expect(existsSync(asideName(root, id, 'displaced', STAMP, 1))).toBe(true);
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(sessionsAt()).toEqual(['S-before']);
  });

  it('cut between step 9 and the journal’s removal: the restore finished, so the restored store stays and the store it displaced is never touched', () => {
    storeBefore();
    const stage = staging();
    writeRestoreJournal(root, id, journal());
    const displaced = asideName(root, id, 'displaced', STAMP, 0);
    renameSync(storeDir(root, id), displaced);
    renameSync(stage, storeDir(root, id));

    expect(recoverCutRestore(root, id)).toBeNull();
    expect(existsSync(restoreJournal(root, id))).toBe(false);
    expect(readFileSync(join(storeDir(root, id), 'from-the-backup.txt'), 'utf8')).toBe('staged\n');
    expect(readdirSync(displaced)).toContain('workspace.db');
    const after = disk();
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(disk()).toEqual(after);
  });

  it('cut after step 8 of a restore into a workspace with no store: nothing to put back, the journal goes, and the ordinary open follows', () => {
    const stage = staging();
    writeRestoreJournal(root, id, journal({ targetExisted: false }));
    expect(recoverCutRestore(root, id)).toEqual({ reversed: null, hadStore: false, staging: stage, stamp: STAMP });
    expect(existsSync(restoreJournal(root, id))).toBe(false);
    expect(existsSync(storeDir(root, id))).toBe(false);
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(sessionsAt()).toEqual([]);
  });

  it('a displaced store that is not there refuses the open, keeps the journal, creates nothing, and the same refusal repeats until the store is back', () => {
    storeBefore();
    writeRestoreJournal(root, id, journal());
    const away = join(root, 'moved-by-hand');
    renameSync(storeDir(root, id), away);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(() => recoverCutRestore(root, id)).toThrow(CutRestoreError);
      expect(readRestoreJournal(root, id)).toEqual(journal());
      expect(existsSync(storeDir(root, id))).toBe(false);
    }
    // The person puts it where the journal says: the next open reverses as ever, and reports no staging copy it cannot find.
    renameSync(away, asideName(root, id, 'displaced', STAMP, 0));
    expect(recoverCutRestore(root, id)).toEqual({ reversed: asideName(root, id, 'displaced', STAMP, 0), hadStore: true, staging: null, stamp: STAMP });
    expect(recoverCutRestore(root, id)).toBeNull();
    expect(sessionsAt()).toEqual(['S-before']);
  });

  it('the next open is where it runs: openWorkspaceStore reverses the cut before it creates anything, and says so once', () => {
    storeBefore();
    staging();
    writeRestoreJournal(root, id, journal());
    const displaced = asideName(root, id, 'displaced', STAMP, 0);
    renameSync(storeDir(root, id), displaced);
    const first = openWorkspaceStore(root, id, ws);
    expect(first.cutRestore).toMatchObject({ reversed: displaced, hadStore: true, stamp: STAMP });
    expect(new StoreDal(first.db).listSessions().map((s) => s.session_id)).toEqual(['S-before']);
    first.db.close();
    forgetSpelling(first.dir);
    const second = openWorkspaceStore(root, id, ws);
    expect(second.cutRestore).toBeUndefined();
    second.db.close();
    forgetSpelling(second.dir);
  });
});
