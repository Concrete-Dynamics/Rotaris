import Database from 'better-sqlite3';
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

/** For tests and for the restore's own bookkeeping: forget a spelling once the directory is gone. */
export function forgetSpelling(dir: string): void {
  const c = canonicalPath(dir);
  openSpellings.delete(process.platform === 'win32' ? c.toLowerCase() : c);
}
