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
  /**
   * ADR-0058's detection paragraph (hardening C1, REQ-SESSION-089): ask SQLite whether the file is sound — `PRAGMA
   * quick_check`, after the write-ahead log is read back and before anything writes — and refuse a store that is not as
   * `StoreCorruptError`. The WORKSPACE SERVICE's open alone passes it (`openWorkspaceStore`): it is the one opener that
   * migrates (W-02), and a migration over a damaged file makes it worse. The run host's open never does, so its hot path
   * pays nothing; the restore keeps its own check of its staging copy, and the backup's assessment its own of the backup.
   */
  readonly checkIntegrity?: boolean;
}

const openSpellings = new Map<string, string>();

export class StoreOpenError extends Error {
  constructor(readonly code: 'wal-not-enabled' | 'write-probe-failed' | 'spelling-mismatch' | 'open-failed' | 'corrupt', message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'StoreOpenError';
  }
}

/**
 * Hardening C1 (SQLite's write-ahead logging page, "Automatic Checkpoint"): every writable connection checkpoints once a
 * commit leaves the log past this many pages. It is the engine's own default, 1000 pages (about 4 MB at the store's
 * 4,096-byte page), set by name so that a rebuilt binding with another compiled-in default cannot change it unnoticed: the
 * run host commits at the publish path's rate and its connection is the one that checkpoints during a run. Growth the
 * automatic checkpoint cannot stop — a reader holding an old snapshot keeps the log from being reset — is the workspace
 * service's idle checkpoint's (`checkpoint.ts`).
 */
export const WAL_AUTOCHECKPOINT_PAGES = 1000;

/** The automatic checkpoint set on a writable connection by name and READ BACK like WAL; a readback that differs refuses. */
export function setAutocheckpoint(db: Database.Database): void {
  db.pragma(`wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES}`);
  const back = db.pragma('wal_autocheckpoint', { simple: true });
  if (back !== WAL_AUTOCHECKPOINT_PAGES) {
    throw new StoreOpenError('open-failed', `the automatic checkpoint could not be set to ${WAL_AUTOCHECKPOINT_PAGES} pages: readback=${String(back)}`);
  }
}

/** How many lines of SQLite's own report a corrupt store's refusal carries: `quick_check(N)` stops after N problems. */
export const QUICK_CHECK_REPORT_LINES = 5;

/**
 * Hardening C1 (REQ-SESSION-089, ADR-0058's corruption domain): the store failed SQLite's `quick_check`, or the engine
 * called it damaged (`SQLITE_CORRUPT`, `SQLITE_NOTADB`) before the check could answer. `report` is the engine's own words,
 * at most `QUICK_CHECK_REPORT_LINES` of them, unaltered. The store was closed without touching its write-ahead log, which
 * holds committed transactions: nothing was migrated, probed or written.
 */
export class StoreCorruptError extends StoreOpenError {
  constructor(readonly file: string, readonly report: readonly string[], cause?: unknown) {
    super('corrupt', `the session store at ${file} fails SQLite's integrity check: ${report.join('; ')}`, cause);
    this.name = 'StoreCorruptError';
  }
}

/** The engine's own word for a damaged file, on whichever statement first meets it. */
function damaged(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB');
}

/** `null` where SQLite answers the single row `ok`; otherwise its report, at most `QUICK_CHECK_REPORT_LINES` lines. */
function quickCheck(db: Database.Database): readonly string[] | null {
  const rows = db.pragma(`quick_check(${QUICK_CHECK_REPORT_LINES})`) as { quick_check: unknown }[];
  const lines = rows.map((r) => String(r.quick_check));
  return lines.length === 1 && lines[0] === 'ok' ? null : lines.slice(0, QUICK_CHECK_REPORT_LINES);
}

/**
 * Close a connection to a store refused as corrupt WITHOUT touching its write-ahead log. The last connection to a WAL
 * database checkpoints the log into the file and deletes it on close — over a damaged file that writes into it, and it
 * removes the one copy of the committed transactions the log holds (SQLite's guidance: never delete the log to make an
 * open succeed). A close skips both while another connection still holds the database, and a read-only connection never
 * checkpoints; so where the open found a log, a read-only holder takes a read first, this connection closes beside it,
 * and the holder closes last. The log is left byte for byte, and the `-shm` index beside it, which the next open rebuilds
 * (measured 2026-11-01, `open.test.ts`). A holder that cannot read is let go, and the close is the ordinary one: its
 * read is of the header, which every open of the store already read to set the journal mode.
 */
function closeKeepingLog(db: Database.Database, file: string, logFound: boolean): void {
  let holder: Database.Database | null = null;
  if (logFound) {
    try {
      holder = new Database(file, { readonly: true, fileMustExist: true });
      holder.pragma('user_version', { simple: true });
    } catch {
      try { holder?.close(); } catch { /* the ordinary close below */ }
      holder = null;
    }
  }
  try {
    db.close();
  } finally {
    holder?.close();
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
  // Whether a write-ahead log was there before this open: the open creates one where none was, and only a log it found
  // can hold transactions a refusal must leave in place (`closeKeepingLog`).
  const logFound = !!opts.checkIntegrity && existsSync(`${canonicalFile}-wal`);
  let db: Database.Database;
  try {
    db = new Database(canonicalFile, { readonly: !!opts.readonly, fileMustExist: !!opts.mustExist });
  } catch (e) {
    throw new StoreOpenError('open-failed', `could not open ${file}: ${String(e)}`, e);
  }
  if (opts.readonly) return db;
  let set: string | undefined;
  let back: unknown;
  try {
    set = (db.pragma('journal_mode = WAL') as { journal_mode: string }[])[0]?.journal_mode;
    back = db.pragma('journal_mode', { simple: true });
  } catch (e) {
    // A file the engine calls damaged before the check can run is the check's answer — on the checked open only; the
    // run host's open throws what it always threw.
    if (!opts.checkIntegrity || !damaged(e)) throw e;
    closeKeepingLog(db, canonicalFile, logFound);
    throw new StoreCorruptError(canonicalFile, [(e as Error).message], e);
  }
  if (set !== 'wal' || back !== 'wal') {
    db.close();
    throw new StoreOpenError('wal-not-enabled', `write-ahead logging not enabled: set=${set} readback=${String(back)}`);
  }
  if (opts.checkIntegrity) {
    // Hardening C1: after the mode is read back, before any pragma that writes, the write probe, or a migration.
    let report: readonly string[] | null;
    try {
      report = quickCheck(db);
    } catch (e) {
      if (!damaged(e)) { db.close(); throw new StoreOpenError('open-failed', `the integrity check could not run on ${file}: ${String(e)}`, e); }
      report = [(e as Error).message];
    }
    if (report !== null) {
      closeKeepingLog(db, canonicalFile, logFound);
      throw new StoreCorruptError(canonicalFile, report);
    }
  }
  // NORMAL on every connection, FULL around the critical commits alone (`StoreDal.durableTransaction`): under WAL a NORMAL
  // commit survives the process's death and may not survive a power cut, and the record decided that shape on measurement
  // (ADR-0058's durability section, spikes/power-loss.md, REQ-SESSION-034's budget stated in saves). Never FULL globally.
  db.pragma('synchronous = NORMAL');
  // Hardening C1: the automatic checkpoint, named rather than left to the engine's default, and read back like WAL.
  try {
    setAutocheckpoint(db);
  } catch (e) {
    db.close();
    throw e;
  }
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
