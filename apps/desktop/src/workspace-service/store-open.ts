import type { ProcessReply } from '@rotaris/contracts';
import type { WorkspaceId } from '@rotaris/kernel';
import { CutRestoreError, openWorkspaceStore, RestorePendingError, StorePlaceEmptyError, type ResolvedStore } from '@rotaris/store';

type Refusal = Extract<ProcessReply, { kind: 'refused' }>;

/**
 * The workspace service's open of a workspace's store (`openOwn`), and the conditions it refuses rather than creating over.
 *
 * - OQ-266 (ruled 2026-10-13 under R-072): a restore cut between its two renames is reversed by `openWorkspaceStore` before
 *   anything is created, unless this service's own restore is in flight — then the restore owns the journal and the open
 *   neither reverses nor creates (`RestorePendingError`). What the reversal did travels on `workspace.opened` as `cutRestore`.
 * - REQ-SESSION-202 / W-31: a place that exists and holds no store is refused as a store that could not be opened, saying
 *   what was found; no reason is invented for it (W-31 (2)).
 */
export function openStoreAtOpen(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, restoreInFlight: boolean): { readonly ok: true; readonly store: ResolvedStore } | { readonly ok: false; readonly refusal: Refusal } {
  try {
    return { ok: true, store: openWorkspaceStore(workspacesRoot, id, workspaceRoot, { recover: !restoreInFlight }) };
  } catch (e) {
    if (e instanceof StorePlaceEmptyError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept', detail: `The place for this workspace's session store exists (${e.dir}) and the store is not in it. Nothing was created there, and no session in this workspace can start until it is resolved.` } };
    }
    if (e instanceof CutRestoreError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.store-displaced', headline: 'A restore of this workspace did not finish, and its store could not be put back', detail: `${e.message[0]!.toUpperCase()}${e.message.slice(1)}. Nothing was created there.` } };
    }
    if (e instanceof RestorePendingError) {
      return { ok: false, refusal: { kind: 'refused', code: 'workspace.restore-in-flight', headline: 'A restore of this workspace is under way', detail: `${e.message[0]!.toUpperCase()}${e.message.slice(1)}.` } };
    }
    throw e;
  }
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
