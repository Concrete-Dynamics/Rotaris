/**
 * How the autopsy reader (`autopsy.mjs`, R-043) opens the store it reads without leaving anything beside it.
 *
 * The product's store runs in WAL mode (`packages/store/src/open.ts`). SQLite opening a WAL database, even read-only,
 * creates `<db>-shm` and `<db>-wal` beside it, and a read-only connection cannot checkpoint, so it leaves both behind
 * when it closes. A live-run pack holds a checkpointed `workspace.db` with no sidecars and an evidence manifest that
 * names none, so the reader's open made `pnpm evidence verify` fail the pack on two files it did not record
 * (`docs/archive/defects/the-autopsy-reader-leaves-wal-sidecars-in-a-live-run-pack-which-then-fails-evidence-verify.md`,
 * acceptance finding AF-23 of plan hrda, 2026-11-04).
 *
 * The rule here: every connection to a WAL database holds `<db>-shm` open while it lives. So where no `-shm` stands
 * beside the store, nothing has it open, and the reader reads a copy of it (the file and any `-wal` a crash left) in a
 * temporary directory that `close` removes: the source directory gains nothing. Where a `-shm` stands, a connection
 * may be live — the running application's — and copying the store and its log one after the other could tear a
 * write, so the reader opens it in place, read-only, as before; its sidecars were already there.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @typedef {{ close(): unknown }} ReadOnlyDatabase */

/**
 * Whether opening `dbPath` in place could add a file beside it: true when no `-shm` stands there, so no connection
 * has the store open.
 * @param {string} dbPath
 */
export function quiescent(dbPath) {
  return !existsSync(`${dbPath}-shm`);
}

/**
 * Open `dbPath` read-only for one pass. `db` is the connection; `close()` closes it and removes the snapshot
 * directory when there was one. `snapshot` says which way it was opened.
 * @template {ReadOnlyDatabase} D
 * @param {string} dbPath
 * @param {new (path: string, options: { readonly: boolean, fileMustExist: boolean }) => D} Database
 * @returns {{ db: D, snapshot: boolean, close(): void }}
 */
export function openStoreForReading(dbPath, Database) {
  if (!existsSync(dbPath)) throw new Error(`no store at ${dbPath}`);
  if (!quiescent(dbPath)) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return { db, snapshot: false, close: () => { db.close(); } };
  }
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-'));
  try {
    const copy = join(dir, 'workspace.db');
    copyFileSync(dbPath, copy);
    // A `-wal` with no `-shm` is a crash's log: its committed frames are part of the store, so the copy carries them.
    if (existsSync(`${dbPath}-wal`)) copyFileSync(`${dbPath}-wal`, `${copy}-wal`);
    const db = new Database(copy, { readonly: true, fileMustExist: true });
    return {
      db,
      snapshot: true,
      close: () => {
        try { db.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
      },
    };
  } catch (cause) {
    rmSync(dir, { recursive: true, force: true });
    throw cause;
  }
}
