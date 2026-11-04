import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { checkDamagedStore, checkStoreIntegrity, forgetSpelling, openStore, openWorkspaceStore, StoreCorruptError, StoreDal, storeDir, storeFile } from './index.js';

/**
 * OQ-477 (ruled 2026-11-04 under R-072): C1's integrity check asked again by the two actions that resolve a store held as
 * corrupt, at their assessment and their perform — of a copy, so the store in its place is never opened. The fixture is the
 * disk a killed process leaves: the file with the `sessions` table's root page header overwritten, and a write-ahead log
 * holding a committed transaction, with no `-shm`.
 */
const id = mintWorkspaceId('000000000000000000000000000004d7');
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-integrity-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function corruptInPlace(): { readonly file: string; readonly db: Buffer; readonly wal: Buffer } {
  const built = mkdtempSync(join(tmpdir(), 'rotaris-integrity-built-'));
  try {
    const r = openWorkspaceStore(built, id, '/work/a');
    const dal = new StoreDal(r.db);
    for (let n = 0; n < 400; n++) dal.upsertSession({ session_id: `S-${n}`, execution_status: 'completed', workspace_root: '/work/a', created_at: 't', updated_at: 't' });
    r.db.pragma('wal_checkpoint(TRUNCATE)');
    r.db.pragma('wal_autocheckpoint = 0');
    r.db.prepare('INSERT INTO prompt_history(text, at) VALUES (?, ?)').run('logged after the checkpoint', 't');
    const rootPage = (r.db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'sessions'").get() as { rootpage: number }).rootpage;
    const pageSize = r.db.pragma('page_size', { simple: true }) as number;
    mkdirSync(storeDir(root, id), { recursive: true });
    const file = storeFile(root, id);
    copyFileSync(r.file, file);
    copyFileSync(`${r.file}-wal`, `${file}-wal`);
    r.db.close();
    forgetSpelling(r.dir);
    const fd = openSync(file, 'r+');
    try { writeSync(fd, Buffer.alloc(12, 0xa5), 0, 12, (rootPage - 1) * pageSize); } finally { closeSync(fd); }
    return { file, db: readFileSync(file), wal: readFileSync(`${file}-wal`) };
  } finally {
    rmSync(built, { recursive: true, force: true });
  }
}

describe('checkStoreIntegrity — C1\'s check, asked of a copy (OQ-477)', () => {
  it('reports a damaged store with SQLite\'s own words and leaves it exactly as found: no -shm, its file and log byte for byte, no scratch left', () => {
    const found = corruptInPlace();
    const r = checkStoreIntegrity(root, id);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.why === 'corrupt' ? r.report.length : 0).toBeGreaterThan(0);
    expect(readdirSync(storeDir(root, id)).sort()).toEqual(['workspace.db', 'workspace.db-wal']);
    expect(readFileSync(found.file).equals(found.db)).toBe(true);
    expect(readFileSync(`${found.file}-wal`).equals(found.wal)).toBe(true);
    expect(readdirSync(root)).toEqual([id]);
  });

  it('answers what the checked open in place answers: the same report', () => {
    corruptInPlace();
    const copied = checkStoreIntegrity(root, id);
    let inPlace: unknown;
    try { openStore(storeFile(root, id), { mustExist: true, checkIntegrity: true }); } catch (e) { inPlace = e; }
    expect(inPlace).toBeInstanceOf(StoreCorruptError);
    expect(copied).toEqual({ ok: false, why: 'corrupt', report: (inPlace as StoreCorruptError).report });
  });

  it('(counterfactual) the checked open asked of the store in its place leaves a -shm the store did not have', () => {
    corruptInPlace();
    expect(() => openStore(storeFile(root, id), { mustExist: true, checkIntegrity: true })).toThrow(StoreCorruptError);
    expect(existsSync(`${storeFile(root, id)}-shm`)).toBe(true);
  });

  it('a sound store passes, and its own files are untouched', () => {
    const s = openWorkspaceStore(root, id, '/work/a');
    s.db.close();
    forgetSpelling(s.dir);
    const before = readdirSync(storeDir(root, id)).sort();
    expect(checkStoreIntegrity(root, id)).toEqual({ ok: true });
    expect(readdirSync(storeDir(root, id)).sort()).toEqual(before);
  });

  it('checkDamagedStore names the condition that no longer holds: store sound, store absent, place absent', () => {
    const s = openWorkspaceStore(root, id, '/work/a');
    s.db.close();
    forgetSpelling(s.dir);
    expect(checkDamagedStore(root, id)).toMatchObject({ ok: false, why: 'store-sound' });
    rmSync(storeFile(root, id));
    expect(checkDamagedStore(root, id)).toMatchObject({ ok: false, why: 'store-absent' });
    rmSync(storeDir(root, id), { recursive: true });
    expect(checkDamagedStore(root, id)).toMatchObject({ ok: false, why: 'place-absent' });
  });
});
