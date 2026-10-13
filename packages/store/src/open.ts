import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { canonicalPath } from '@rotaris/platform';

/**
 * ADR-0058 rule 3 — the open sequence, and rule 6 — one canonical spelling.
 *
 * Open; set write-ahead logging and READ IT BACK; a write probe in
 * `BEGIN IMMEDIATE` rolled back, so a store that reports WAL enabled and
 * silently loses the next write (measured over a share, spike 19) is refused
 * here rather than discovered later. Every result-less pragma goes through
 * direct execution; prepared statements are retained by their owner
 * (consequence 16).
 *
 * The path handed in is canonicalised and the store remembers the spelling it
 * was opened by; a second open with a different spelling is refused (rule 6,
 * W-27). Two openers by two spellings destroy each other's writes silently.
 */
export type StoreHandle = Database.Database;

export interface OpenOptions {
  readonly readonly?: boolean;
  readonly mustExist?: boolean;
  readonly busyTimeoutMs?: number;
}

const openSpellings = new Map<string, string>();

export class StoreOpenError extends Error {
  constructor(readonly code: 'wal-not-enabled' | 'write-probe-failed' | 'spelling-mismatch' | 'open-failed', message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'StoreOpenError';
  }
}

export function openStore(file: string, opts: OpenOptions = {}): StoreHandle {
  // Rule 6: the engine is handed ONE spelling — the canonical one — whatever the caller passed.
  const canonicalDir = canonicalPath(dirname(file));
  const canonicalFile = join(canonicalDir, basename(file));
  const key = process.platform === 'win32' ? canonicalDir.toLowerCase() : canonicalDir;
  const prior = openSpellings.get(key);
  if (prior !== undefined && prior !== canonicalDir) {
    throw new StoreOpenError('spelling-mismatch', `store at ${canonicalDir} is already open as ${prior}; one canonical spelling only (ADR-0058 rule 6)`);
  }
  let db: Database.Database;
  try {
    db = new Database(canonicalFile, { readonly: !!opts.readonly, fileMustExist: !!opts.mustExist });
  } catch (e) {
    throw new StoreOpenError('open-failed', `could not open ${file}: ${String(e)}`, e);
  }
  if (opts.readonly) return db;
  const set = (db.pragma('journal_mode = WAL') as { journal_mode: string }[])[0]?.journal_mode;
  const back = db.pragma('journal_mode', { simple: true });
  if (set !== 'wal' || back !== 'wal') {
    db.close();
    throw new StoreOpenError('wal-not-enabled', `write-ahead logging not enabled: set=${set} readback=${back}`);
  }
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? 5000}`);
  // Part U's first execution (ADR-0058 note): `foreign_keys` is a PER-CONNECTION setting, and the product set it only
  // in `migrateStore` — the workspace service's connection, never the run host's, which is the connection every
  // session write and REQ-SESSION-166's delete go through. The reasoning "the schema declares the cascade, so a delete
  // cascades" was therefore incomplete: it held only because the bundled binding compiles SQLite with foreign keys ON
  // by default (measured: a raw open reads 1), a reliance nothing in the record stated. It is stated here — enabled on
  // every writable open and READ BACK like WAL — so a rebuilt binding with the engine's own default (OFF) is refused at
  // open rather than left to orphan thirteen tables on the first delete.
  db.pragma('foreign_keys = ON');
  const fk = db.pragma('foreign_keys', { simple: true });
  if (fk !== 1) {
    db.close();
    throw new StoreOpenError('open-failed', `foreign-key enforcement could not be enabled: readback=${String(fk)}`);
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TABLE IF NOT EXISTS __probe(x)');
      db.exec('INSERT INTO __probe(x) VALUES (1)');
    } finally {
      db.exec('ROLLBACK');
    }
  } catch (e) {
    db.close();
    throw new StoreOpenError('write-probe-failed', `the write probe failed: ${String(e)}`, e);
  }
  openSpellings.set(key, canonicalDir);
  return db;
}

/**
 * ADR-0058 consequence 18, D8 — a connection that only READS a store (the restore's assessment of its target),
 * opened so that it leaves the store's directory holding the files it found.
 *
 * The store is write-ahead logged, so ANY connection that reads it creates `-wal` and `-shm` beside it where they
 * are absent, and only the LAST connection's close removes them — by checkpointing, which a read-only connection
 * cannot do. The read-only open the assessment used therefore left both files in a target that had been closed
 * cleanly (measured 2026-09-02, and again 2026-10-13: `-shm` 32,768 B, `-wal` 0 B), so a restore refused or declined
 * after its assessment left the target different from how it found it. The rule, by what the directory holds:
 *  - neither file: no connection is open (an open one holds both), so open read-write by the ordinary sequence
 *    above; this connection's close is then the last one, and it removes the two files its open created.
 *  - both files: a connection holds them, or a process died holding them. Open read-only, which reads them, creates
 *    nothing and leaves them to their owner — recovering a dead writer's log is the next ordinary open's business.
 *  - `-wal` alone (a dead writer's log whose index is gone): read-write too, since a read-only open would create
 *    `-shm` and leave it; the close recovers the log into the store and removes it. The one case in which the
 *    listing changes, and the contents read the same either way.
 * A read-write open that fails other than on the spelling rule (a directory this user may not write) falls back to
 * the read-only open, so an inspection is never refused where it used to succeed.
 */
export function openStoreForInspection(file: string): StoreHandle {
  if (existsSync(`${file}-wal`) && existsSync(`${file}-shm`)) return openStore(file, { readonly: true, mustExist: true });
  try {
    return openStore(file, { mustExist: true });
  } catch (e) {
    if (e instanceof StoreOpenError && e.code === 'spelling-mismatch') throw e;
    return openStore(file, { readonly: true, mustExist: true });
  }
}

/** For tests and for the restore's own bookkeeping: forget a spelling once the directory is gone. */
export function forgetSpelling(dir: string): void {
  const c = canonicalPath(dir);
  openSpellings.delete(process.platform === 'win32' ? c.toLowerCase() : c);
}
