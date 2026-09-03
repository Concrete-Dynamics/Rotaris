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
