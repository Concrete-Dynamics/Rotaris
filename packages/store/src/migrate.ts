import type { StoreHandle } from './open.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from './schema.js';

export type MigrateOutcome =
  | { readonly kind: 'unchanged'; readonly version: number }
  | { readonly kind: 'migrated'; readonly from: number; readonly to: number }
  | { readonly kind: 'newer-than-build'; readonly version: number };

/**
 * Bring a store to the current schema. Each migration runs in one
 * transaction and bumps `user_version` inside it, so a crash leaves the store
 * at a whole version. A store NEWER than this build is not touched and not
 * refused here — ADR-0058: an older-schema restore must not refuse; what a
 * newer one means for opening is the caller's decision.
 */
export function migrateStore(db: StoreHandle): MigrateOutcome {
  const start = db.pragma('user_version', { simple: true }) as number;
  if (start > CURRENT_SCHEMA_VERSION) return { kind: 'newer-than-build', version: start };
  if (start === CURRENT_SCHEMA_VERSION) return { kind: 'unchanged', version: start };
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) {
    if (m.to <= start) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.to}`);
    })();
  }
  return { kind: 'migrated', from: start, to: CURRENT_SCHEMA_VERSION };
}

/** What `PRAGMA foreign_key_check` found: how many rows name a parent that is not there, and the first few as SQLite reports them. */
export interface ForeignKeyReport {
  readonly count: number;
  readonly first: readonly { readonly table: string; readonly rowid: number | null; readonly parent: string }[];
}

/**
 * Hardening C1: run after a migration that changed the store (`openWorkspaceStore`). `quick_check` does not look at foreign
 * keys, and a migration is the operation that rebuilds tables; a store whose rows name a missing parent is reported in the
 * service's log and still opened — the check refuses nothing, since what it finds is a record to read, not a file that
 * cannot be (REQ-SESSION-089 refuses a store that cannot be opened, and this one can). Counts every violation, keeps `sample`.
 */
export function foreignKeyViolations(db: StoreHandle, sample = 5): ForeignKeyReport {
  let count = 0;
  const first: { table: string; rowid: number | null; parent: string }[] = [];
  for (const row of db.prepare('PRAGMA foreign_key_check').iterate() as Iterable<{ table: string; rowid: number | null; parent: string }>) {
    count += 1;
    if (first.length < sample) first.push({ table: row.table, rowid: row.rowid, parent: row.parent });
  }
  return { count, first };
}
