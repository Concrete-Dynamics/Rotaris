/**
 * How the autopsy reader (`autopsy.mjs`, R-043) opens the store it reads without leaving anything beside it.
 *
 * The product's store runs in WAL mode (`packages/store/src/open.ts`). SQLite opening a WAL database, even read-only,
 * creates `<db>-shm` and `<db>-wal` beside it, and a read-only connection cannot checkpoint, so it leaves both behind
 * when it closes; where a `-shm` already stands, the open rebuilds and marks the wal-index in it. A live-run pack holds
 * the store as the run left it — `workspace.db` alone, or with the `-wal` and `-shm` `live-run.mjs`'s `preserveStore`
 * copies beside it — and an evidence manifest that names exactly those files, so the reader's open made
 * `pnpm evidence verify` fail the pack: on two files it did not record, or on a `-shm` that changed
 * (`docs/archive/defects/the-autopsy-reader-leaves-wal-sidecars-in-a-live-run-pack-which-then-fails-evidence-verify.md`,
 * acceptance finding AF-23 of plan hrda, 2026-11-04).
 *
 * The rule here: the reader reads a copy — the file and any `-wal` beside it, whose committed frames are part of the
 * store — in a temporary directory that `close` removes, so the source directory is left as it stood, whenever no
 * connection can be live: where no `-shm` stands (every connection to a WAL database holds `<db>-shm` open while it
 * lives), and in an evidence pack (`evidence-manifest.json` beside the store), which is written once the run has
 * ended. Elsewhere, where a `-shm` stands, a connection may be live — the running application's — and copying the
 * store and its log one after the other could tear a write, so the reader opens it in place, read-only, as before;
 * its sidecars were already there.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MANIFEST_FILE } from './evidence-manifest.mjs';

/** @typedef {{ close(): unknown }} ReadOnlyDatabase */

/**
 * Whether no connection can hold `dbPath` open, so the reader may read a copy of it: true when no `-shm` stands beside
 * it, or when it lies in an evidence pack, which a finished run wrote and nothing writes after.
 * @param {string} dbPath
 */
export function quiescent(dbPath) {
  return !existsSync(`${dbPath}-shm`) || existsSync(join(dirname(dbPath), MANIFEST_FILE));
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
    // A `-wal` beside a store nothing holds open (a crash's, or one a pack recorded) carries committed frames of the
    // store, so the copy carries it; a `-shm` is only an index of it, rebuilt by the copy's first open.
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
