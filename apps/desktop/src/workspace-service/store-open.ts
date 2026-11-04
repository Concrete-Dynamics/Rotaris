import type { ProcessReply } from '@rotaris/contracts';
import type { WorkspaceId } from '@rotaris/kernel';
import { CutRestoreError, openWorkspaceStore, RestorePendingError, StoreCorruptError, StorePlaceEmptyError, type ResolvedStore } from '@rotaris/store';

type Refusal = Extract<ProcessReply, { kind: 'refused' }>;

/**
 * The workspace service's open of a workspace's store (`openOwn`), and the conditions it refuses rather than creating over.
 *
 * - OQ-266 (ruled 2026-10-13 under R-072): a restore cut between its two renames is reversed by `openWorkspaceStore` before
 *   anything is created, unless this service's own restore is in flight — then the restore owns the journal and the open
 *   neither reverses nor creates (`RestorePendingError`). What the reversal did travels on `workspace.opened` as `cutRestore`.
 * - REQ-SESSION-202 / W-31: a place that exists and holds no store is refused as a store that could not be opened, saying
 *   what was found; no reason is invented for it (W-31 (2)). OQ-281 (ruled 2026-10-14 under R-072): the detail ends with
 *   where it is resolved — a restore or a deliberate new store in Settings › Project, or the store put back by hand.
 * - Hardening C1, REQ-SESSION-089: a store that fails SQLite's `quick_check` is refused before it is migrated, held and raised
 *   as a store that could not be opened (`workspace.store-corrupt`, `corruptRefusal`).
 */
export function openStoreAtOpen(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, restoreInFlight: boolean): { readonly ok: true; readonly store: ResolvedStore } | { readonly ok: false; readonly refusal: Refusal } {
  try {
    return { ok: true, store: openWorkspaceStore(workspacesRoot, id, workspaceRoot, { recover: !restoreInFlight }) };
  } catch (e) {
    if (e instanceof StorePlaceEmptyError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept', detail: `The place for this workspace's session store exists (${e.dir}) and the store is not in it. Nothing was created there, and no session in this workspace can start until it is resolved. Restore a backup or start a new store from Settings › Project, or put the store back in that place and open the workspace again.` } };
    }
    if (e instanceof CutRestoreError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.store-displaced', headline: 'A restore of this workspace did not finish, and its store could not be put back', detail: `${e.message[0]!.toUpperCase()}${e.message.slice(1)}. Nothing was created there.` } };
    }
    if (e instanceof RestorePendingError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.restore-in-flight', headline: 'A restore of this workspace is under way', detail: `${e.message[0]!.toUpperCase()}${e.message.slice(1)}.` } };
    }
    if (e instanceof StoreCorruptError) return { ok: false, refusal: corruptRefusal(e) };
    throw e;
  }
}

/**
 * Hardening C1, REQ-SESSION-089: which store could not be opened and the reason the store itself gave — SQLite's own report,
 * unaltered (ADR-0058's recovery ladder, step 1) — that it was left as it was found, and that no session starts. Main holds
 * it and raises it like the other store refusals (`STORE_REFUSALS`, `main/store-notice.ts`). OQ-477 (ruled 2026-11-04 under
 * R-072): the detail ends with the two remedies Settings › Project offers while it is held — a restore, or setting the damaged
 * store aside and starting a new one, each keeping it unchanged (ADR-0058 part 11's steps 4 and 5) — and the route by hand.
 */
export function corruptRefusal(e: StoreCorruptError): Refusal {
  return {
    kind: 'refused', code: 'workspace.store-corrupt', headline: 'The session store for this workspace failed its integrity check',
    detail: `The session store at ${e.file} fails SQLite's integrity check: ${e.report.join('; ')}. It was left exactly as it was found, its write-ahead log included: nothing was migrated or written, and no session in this workspace can start until it is resolved. Restore a backup, or set the damaged store aside and start a new one, from Settings › Project: either keeps the damaged store, unchanged, beside its place. Or move it out of its place by hand (a copy may be repaired outside Rotaris) and open the workspace again.`,
  };
}

/** OQ-266: whether this service's own restore is running, so an open in the meantime leaves the journal to it. */
export class RestoreInFlight {
  #depth = 0;
  get active(): boolean {
    return this.#depth > 0;
  }
  async around<T>(work: () => Promise<T>): Promise<T> {
    this.#depth += 1;
    try {
      return await work();
    } finally {
      this.#depth -= 1;
    }
  }
}
