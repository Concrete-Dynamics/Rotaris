import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import type { StoreHandle } from './open.js';
import { CURRENT_SCHEMA_VERSION, forgetSpelling, ImprovementDal, openStore, openWorkspaceStore, QUICK_CHECK_REPORT_LINES, StoreCorruptError, StoreDal, StoreOpenError, setAutocheckpoint, storeDir, storeFile, WAL_AUTOCHECKPOINT_PAGES } from './index.js';

/**
 * Hardening C1 (REQ-SESSION-089, ADR-0058's detection paragraph): the workspace service's open asks SQLite whether the file
 * is sound before it migrates it, refuses one that is not as `corrupt`, and leaves its write-ahead log as it found it. The
 * run host's open asks nothing.
 */
const id = mintWorkspaceId('000000000000000000000000000000c7');
let root: string;
let ws: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-open-')); ws = mkdtempSync(join(tmpdir(), 'rotaris-open-ws-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

const session = (n: number) => ({ session_id: `S-${String(n).padStart(4, '0')}`, execution_status: 'completed' as const, workspace_root: ws, created_at: 't', updated_at: 't' });

/**
 * A store left as a process killed mid-life leaves it — its file, and a write-ahead log holding a committed transaction the
 * file does not — with the `sessions` table's root page damaged in the FILE. The table is filled and checkpointed first, so
 * its root is an interior page; the logged transaction writes `prompt_history` alone, so the log never covers that page.
 * `whole` overwrites the whole page (the engine then throws `SQLITE_CORRUPT` from the check); otherwise only its header,
 * which the check reports as rows.
 */
function corruptStore(opts: { readonly whole: boolean; readonly log: boolean }): { readonly file: string; readonly wal: Buffer | null } {
  const built = mkdtempSync(join(tmpdir(), 'rotaris-open-built-'));
  try {
    const r = openWorkspaceStore(built, id, ws);
    const dal = new StoreDal(r.db);
    for (let n = 0; n < 400; n++) dal.upsertSession(session(n));
    r.db.pragma('wal_checkpoint(TRUNCATE)');
    r.db.pragma('wal_autocheckpoint = 0');
    if (opts.log) r.db.prepare('INSERT INTO prompt_history(text, at) VALUES (?, ?)').run('logged after the checkpoint', 't');
    const rootPage = (r.db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'sessions'").get() as { rootpage: number }).rootpage;
    const pageSize = r.db.pragma('page_size', { simple: true }) as number;
    mkdirSync(storeDir(root, id), { recursive: true });
    const file = storeFile(root, id);
    // The disk a killed process leaves: copied while the connection is open, so no close has checkpointed the log away.
    copyFileSync(r.file, file);
    if (opts.log) copyFileSync(`${r.file}-wal`, `${file}-wal`);
    r.db.close();
    forgetSpelling(r.dir);
    const fd = openSync(file, 'r+');
    try {
      const bytes = opts.whole ? pageSize : 12;
      writeSync(fd, Buffer.alloc(bytes, 0xa5), 0, bytes, (rootPage - 1) * pageSize);
    } finally {
      closeSync(fd);
    }
    return { file, wal: opts.log ? readFileSync(`${file}-wal`) : null };
  } finally {
    rmSync(built, { recursive: true, force: true });
  }
}

describe('store — the integrity check before a migration (hardening C1, REQ-SESSION-089)', () => {
  it('a store whose page past the header is damaged is refused as corrupt, with SQLite\'s own report', () => {
    const { file } = corruptStore({ whole: false, log: true });
    let thrown: unknown;
    try { openStore(file, { mustExist: true, checkIntegrity: true }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(StoreCorruptError);
    const e = thrown as StoreCorruptError;
    expect(e).toBeInstanceOf(StoreOpenError);
    expect(e.code).toBe('corrupt');
    expect(e.file).toBe(file);
    expect(e.report.length).toBeGreaterThan(0);
    expect(e.report.length).toBeLessThanOrEqual(QUICK_CHECK_REPORT_LINES);
    expect(e.report).not.toEqual(['ok']);
    expect(e.message).toContain(file);
  });

  it('a page damaged past what the check can report (SQLITE_CORRUPT thrown) is refused the same way', () => {
    const { file } = corruptStore({ whole: true, log: true });
    expect(() => openStore(file, { mustExist: true, checkIntegrity: true })).toThrow(StoreCorruptError);
  });

  it('the refusal leaves the write-ahead log byte for byte, and the file unwritten', () => {
    const { file, wal } = corruptStore({ whole: false, log: true });
    const before = readFileSync(file);
    expect(() => openStore(file, { mustExist: true, checkIntegrity: true })).toThrow(StoreCorruptError);
    expect(existsSync(`${file}-wal`)).toBe(true);
    expect(readFileSync(`${file}-wal`).equals(wal!)).toBe(true);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('(counterfactual) the ordinary close the refusal avoids checkpoints that log into the damaged file and deletes it', () => {
    const { file } = corruptStore({ whole: false, log: true });
    const before = readFileSync(file);
    const plain = new Database(file, { fileMustExist: true });
    plain.pragma('journal_mode = WAL');
    plain.close();
    expect(existsSync(`${file}-wal`)).toBe(false);
    expect(readFileSync(file).equals(before)).toBe(false);
  });

  it('a damaged store with no log beside it is refused and left with none', () => {
    const { file } = corruptStore({ whole: false, log: false });
    expect(() => openStore(file, { mustExist: true, checkIntegrity: true })).toThrow(StoreCorruptError);
    expect(existsSync(`${file}-wal`)).toBe(false);
  });

  it('(counterfactual) the run host\'s open, which asks nothing, opens the same damaged store', () => {
    const { file } = corruptStore({ whole: false, log: true });
    const db = openStore(file, { mustExist: true });
    db.close();
    forgetSpelling(storeDir(root, id));
  });

  it('the workspace service\'s open refuses it before migrating: the version the file holds is unchanged', () => {
    const { file } = corruptStore({ whole: false, log: true });
    const raw = new Database(file, { readonly: true, fileMustExist: true });
    const version = raw.pragma('user_version', { simple: true });
    raw.close();
    expect(() => openWorkspaceStore(root, id, ws)).toThrow(StoreCorruptError);
    const after = new Database(file, { readonly: true, fileMustExist: true });
    expect(after.pragma('user_version', { simple: true })).toBe(version);
    after.close();
    // Refused: no spelling is held, so the same open may be asked again.
    expect(() => openWorkspaceStore(root, id, ws)).toThrow(StoreCorruptError);
  });

  it('a sound store opens through the check unchanged, its rows and its logged transaction in place', () => {
    const first = openWorkspaceStore(root, id, ws);
    new StoreDal(first.db).upsertSession(session(1));
    first.db.close();
    forgetSpelling(first.dir);
    const again = openWorkspaceStore(root, id, ws);
    expect(again.migration).toEqual({ kind: 'unchanged', version: CURRENT_SCHEMA_VERSION });
    expect(again.foreignKeyViolations).toBeUndefined();
    expect(new StoreDal(again.db).listSessions().map((s) => s.session_id)).toEqual(['S-0001']);
    again.db.close();
    forgetSpelling(again.dir);
  });
});

/** PD-ORCH-005 clause 9 / REQ-SESSION-031: what v35 added, undone so a store can stand at v34 and climb it again. */
const UNDO_V35 = 'ALTER TABLE sessions DROP COLUMN pending_questions;';

describe('store — foreign keys after a migration (hardening C1)', () => {
  function storeAtV34(orphan: boolean): void {
    const r = openWorkspaceStore(root, id, ws);
    new StoreDal(r.db).upsertSession(session(1));
    r.db.close();
    forgetSpelling(r.dir);
    const raw = new Database(storeFile(root, id), { fileMustExist: true });
    raw.pragma('foreign_keys = OFF');
    raw.exec(UNDO_V35);
    if (orphan) raw.prepare('INSERT INTO session_locks(session_id, pid, host, acquired_at) VALUES (?, ?, ?, ?)').run('S-ghost', 1, 'h', 't');
    raw.pragma(`user_version = ${CURRENT_SCHEMA_VERSION - 1}`);
    raw.close();
  }

  it('rows naming a missing parent are reported after the migration, and the store still opens', () => {
    storeAtV34(true);
    const r = openWorkspaceStore(root, id, ws);
    expect(r.migration).toEqual({ kind: 'migrated', from: CURRENT_SCHEMA_VERSION - 1, to: CURRENT_SCHEMA_VERSION });
    expect(r.foreignKeyViolations).toEqual({ count: 1, first: [{ table: 'session_locks', rowid: expect.any(Number), parent: 'sessions' }] });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('(counterfactual) the same migration over sound rows reports nothing', () => {
    storeAtV34(false);
    const r = openWorkspaceStore(root, id, ws);
    expect(r.migration.kind).toBe('migrated');
    expect(r.foreignKeyViolations).toBeUndefined();
    r.db.close();
    forgetSpelling(r.dir);
  });
});

/** SQLite's `synchronous` values, as `PRAGMA synchronous` reads them back. */
const NORMAL = 1;
const FULL = 2;

describe('store — durability settings, asserted (REQ-SESSION-034, REQ-SESSION-067, REQ-EVENTS-029; spikes/power-loss.md)', () => {
  function runHostConnection(): StoreHandle {
    const r = openWorkspaceStore(root, id, ws);
    r.db.close();
    forgetSpelling(r.dir);
    // The run host's open: `openStore` with no options (`run-host/dispatch.ts`).
    return openStore(storeFile(root, id));
  }

  it('the run host\'s connection commits at NORMAL, with the automatic checkpoint at its named 1,000 pages, read back', () => {
    const db = runHostConnection();
    expect(db.pragma('synchronous', { simple: true })).toBe(NORMAL);
    expect(WAL_AUTOCHECKPOINT_PAGES).toBe(1000);
    expect(db.pragma('wal_autocheckpoint', { simple: true })).toBe(WAL_AUTOCHECKPOINT_PAGES);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
    forgetSpelling(storeDir(root, id));
  });

  it('the critical-commit helpers run FULL inside the transaction and NORMAL again after it, a throw included', () => {
    const db = runHostConnection();
    for (const dal of [new StoreDal(db), new ImprovementDal(db)]) {
      let inside: unknown;
      dal.durableTransaction(() => { inside = db.pragma('synchronous', { simple: true }); });
      expect(inside).toBe(FULL);
      expect(db.pragma('synchronous', { simple: true })).toBe(NORMAL);
      expect(() => dal.durableTransaction(() => { throw new Error('the work failed'); })).toThrow('the work failed');
      expect(db.pragma('synchronous', { simple: true })).toBe(NORMAL);
      // An ordinary transaction stays at NORMAL.
      let ordinary: unknown;
      dal.transaction(() => { ordinary = db.pragma('synchronous', { simple: true }); });
      expect(ordinary).toBe(NORMAL);
    }
    db.close();
    forgetSpelling(storeDir(root, id));
  });

  it('the bundled SQLite is at least 3.51.3, the release that fixed the WAL reset this two-connection shape can meet', () => {
    const db = runHostConnection();
    const version = (db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v;
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
    expect(major * 1_000_000 + minor * 1_000 + patch, `bundled SQLite ${version}`).toBeGreaterThanOrEqual(3_051_003);
    db.close();
    forgetSpelling(storeDir(root, id));
  });
});

describe('store — the automatic checkpoint, set by name (hardening C1)', () => {
  it('a connection whose threshold is anything else is set back to WAL_AUTOCHECKPOINT_PAGES, read back', () => {
    const r = openWorkspaceStore(root, id, ws);
    r.db.close();
    forgetSpelling(r.dir);
    // A raw connection standing for a binding compiled with another default: the open's step sets it, whatever it was.
    const raw = new Database(storeFile(root, id), { fileMustExist: true });
    raw.pragma('wal_autocheckpoint = 0');
    setAutocheckpoint(raw);
    expect(raw.pragma('wal_autocheckpoint', { simple: true })).toBe(WAL_AUTOCHECKPOINT_PAGES);
    raw.close();
  });
});
