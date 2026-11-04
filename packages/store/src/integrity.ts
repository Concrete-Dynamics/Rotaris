import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceId } from '@rotaris/kernel';
import { STORE_FILE, storeFile } from './layout.js';
import { forgetSpelling, openStore, StoreCorruptError } from './open.js';

/**
 * OQ-477 (ruled 2026-11-04 by the consortium under the owner's delegation, R-072): C1's integrity check asked again of a store
 * main holds as `workspace.store-corrupt`, by the two actions that resolve it in Settings › Project (the restore and "Set the
 * damaged store aside and start a new one…"), at their assessment and again at their perform — so a store repaired by hand
 * in the meantime is never set aside on a stale refusal.
 *
 * The ruling's invariant is that no flow opens the damaged target except through C1's checked open. That open was measured
 * to leave the write-ahead log and the file byte for byte (`open.test.ts`), and it is the check asked here — `openStore`
 * with `checkIntegrity` — but it is asked of a COPY of the store's files, in a scratch directory beside it that is removed
 * whatever happens, and never of the store in its place: an open of a store holding a `-wal` and no `-shm` creates the `-shm`
 * and C1's close leaves it (measured 2026-11-04 on Windows 11 ARM64: after the checked open the directory read `workspace.db`,
 * `workspace.db-shm`, `workspace.db-wal`). The copy holds the same bytes, its log replayed the same way, so its answer is the
 * store's; and the store the two actions move aside is the one the user was told about, not one an inspection touched.
 * `-shm` is not copied: it is an index any first open rebuilds from the log.
 */
export type StoreIntegrity =
  | { readonly ok: true }
  | { readonly ok: false; readonly why: 'corrupt'; readonly report: readonly string[] }
  | { readonly ok: false; readonly why: 'unchecked'; readonly detail: string };

export function checkStoreIntegrity(workspacesRoot: string, id: WorkspaceId): StoreIntegrity {
  const file = storeFile(workspacesRoot, id);
  const scratch = mkdtempSync(join(workspacesRoot, '.check-'));
  try {
    const copy = join(scratch, STORE_FILE);
    try {
      copyFileSync(file, copy);
      if (existsSync(`${file}-wal`)) copyFileSync(`${file}-wal`, `${copy}-wal`);
    } catch (e) {
      return { ok: false, why: 'unchecked', detail: `the store at ${file} could not be read to check it: ${String(e)}` };
    }
    try {
      openStore(copy, { mustExist: true, checkIntegrity: true }).close();
      return { ok: true };
    } catch (e) {
      if (e instanceof StoreCorruptError) return { ok: false, why: 'corrupt', report: e.report };
      return { ok: false, why: 'unchecked', detail: `the integrity check of the store at ${file} could not run: ${String(e)}` };
    }
  } finally {
    forgetSpelling(scratch);
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
