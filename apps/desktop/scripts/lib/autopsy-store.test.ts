/**
 * The autopsy reader opens the store it reads without leaving a file beside it (`autopsy-store.mjs`): a live-run pack
 * read by it still verifies against its evidence manifest (acceptance finding AF-23 of plan hrda, 2026-11-04,
 * `docs/archive/defects/the-autopsy-reader-leaves-wal-sidecars-in-a-live-run-pack-which-then-fails-evidence-verify.md`), and a
 * store a connection holds open is still read in place, its log's rows included.
 */
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openStoreForReading } from './autopsy-store.mjs';
import { verifyEvidenceManifest, writeEvidenceManifest } from './evidence-manifest.mjs';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A pack as a live run leaves it: a checkpointed WAL-mode `workspace.db`, a results file, and a manifest naming both. */
function pack(): { dir: string, db: string } {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-pack-'));
  dirs.push(dir);
  const db = join(dir, 'workspace.db');
  const writer = new Database(db);
  writer.pragma('journal_mode = WAL');
  writer.exec("CREATE TABLE sessions (session_id TEXT); INSERT INTO sessions VALUES ('s-1')");
  writer.close();
  writeFileSync(join(dir, 'results.json'), '{}\n');
  writeEvidenceManifest(dir, { kind: 'pack', label: 'af-23', environment: {}, now: () => '2026-11-04T00:00:00.000Z' });
  return { dir, db };
}

describe('the autopsy reader\'s store open (R-043, AF-23)', () => {
  it('a pack the reader has read still verifies: nothing is left beside its workspace.db', () => {
    const { dir, db } = pack();
    expect(readdirSync(dir).sort()).toEqual(['evidence-manifest.json', 'results.json', 'workspace.db']);
    expect(verifyEvidenceManifest(dir).problems).toEqual([]);
    const store = openStoreForReading(db, Database);
    expect(store.snapshot).toBe(true);
    expect(store.db.prepare('SELECT session_id FROM sessions').all()).toEqual([{ session_id: 's-1' }]);
    store.close();
    expect(readdirSync(dir).sort()).toEqual(['evidence-manifest.json', 'results.json', 'workspace.db']);
    expect(verifyEvidenceManifest(dir)).toMatchObject({ ok: true, problems: [] });
  });

  it('a plain read-only open, the reader\'s before AF-23, leaves both sidecars and fails the pack', () => {
    const { dir, db } = pack();
    const plain = new Database(db, { readonly: true, fileMustExist: true });
    plain.prepare('SELECT session_id FROM sessions').all();
    plain.close();
    expect(readdirSync(dir).sort()).toEqual(['evidence-manifest.json', 'results.json', 'workspace.db', 'workspace.db-shm', 'workspace.db-wal']);
    expect(verifyEvidenceManifest(dir).problems).toEqual([
      expect.stringMatching(/^not in the manifest: workspace\.db-shm /),
      expect.stringMatching(/^not in the manifest: workspace\.db-wal /),
    ]);
  });

  it('a store a connection holds open is read in place, rows still in its log included, and keeps its sidecars', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-live-'));
    dirs.push(dir);
    const db = join(dir, 'workspace.db');
    const writer = new Database(db);
    try {
      writer.pragma('journal_mode = WAL');
      writer.pragma('wal_autocheckpoint = 0');
      writer.exec("CREATE TABLE sessions (session_id TEXT); INSERT INTO sessions VALUES ('live')");
      const store = openStoreForReading(db, Database);
      expect(store.snapshot).toBe(false);
      expect(store.db.prepare('SELECT session_id FROM sessions').all()).toEqual([{ session_id: 'live' }]);
      store.close();
      expect(readdirSync(dir).sort()).toEqual(['workspace.db', 'workspace.db-shm', 'workspace.db-wal']);
    } finally {
      writer.close();
    }
  });

  it('a log a crash left without its index is carried into the copy, and the source directory is untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-crash-'));
    dirs.push(dir);
    const db = join(dir, 'workspace.db');
    const writer = new Database(db);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer.exec("CREATE TABLE sessions (session_id TEXT); INSERT INTO sessions VALUES ('logged')");
    // Keep the log's frames as a crash would: the store and its log copied while the writer held them, no index.
    const crashed = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-crashed-'));
    dirs.push(crashed);
    copyFileSync(db, join(crashed, 'workspace.db'));
    copyFileSync(`${db}-wal`, join(crashed, 'workspace.db-wal'));
    writer.close();
    const store = openStoreForReading(join(crashed, 'workspace.db'), Database);
    expect(store.snapshot).toBe(true);
    expect(store.db.prepare('SELECT session_id FROM sessions').all()).toEqual([{ session_id: 'logged' }]);
    store.close();
    expect(readdirSync(crashed).sort()).toEqual(['workspace.db', 'workspace.db-wal']);
  });
});
