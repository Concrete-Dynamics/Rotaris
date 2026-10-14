import { existsSync } from 'node:fs';
import type { WorkspaceId } from '@rotaris/kernel';
import { ASIDE_TRIES, asideName, restoreJournal, storeDir, storeFile } from './layout.js';
import { forgetSpelling } from './open.js';
import { openWorkspaceStore } from './resolve.js';
import { claimAsideName } from './restore.js';

/**
 * OQ-281 (ruled 2026-10-14 by the consortium under the owner's delegation, R-072) — REQ-SESSION-202's deliberate action:
 * "An action that establishes a new store in that place MUST be one the user takes deliberately, having been told what was
 * found and that it recovers nothing that may have been there". Settings › Project offers it beside the restore while the
 * open holds `workspace.store-missing`; main asks first, Cancel the default (`main/store-resolution.ts`). This is the work,
 * in the workspace service, in two phases like the restore so the kept path the user is told is the one taken:
 *
 *  - `assessEmptyPlace` re-reads the condition and names the place and the aside name `stamp` would claim;
 *  - `establishInEmptyPlace` re-checks it (a place present, no `workspace.db` in it, no restore journal beside it) and refuses
 *    where it no longer holds; then moves the place aside whole under that stamp — `claimAsideName(…, 'displaced', place)`,
 *    the rename that is the claim, a counter where the name is taken — and KEEPS it; then runs the open an absent place
 *    gets (REQ-SESSION-043's ordinary create).
 *
 * Nothing in the found place is read, judged or deleted: the product cannot tell an empty place from a store carried off a
 * moment ago (REQ-SESSION-202), so what is there is kept exactly as found.
 */
export type EmptyPlaceCheck =
  | { readonly ok: true; readonly place: string }
  | { readonly ok: false; readonly why: 'place-absent' | 'store-present' | 'restore-pending'; readonly detail: string };

export function checkEmptyPlace(workspacesRoot: string, id: WorkspaceId): EmptyPlaceCheck {
  const place = storeDir(workspacesRoot, id);
  if (existsSync(restoreJournal(workspacesRoot, id))) return { ok: false, why: 'restore-pending', detail: `A restore of this workspace did not finish (its journal is at ${restoreJournal(workspacesRoot, id)}); open the workspace again so it can be put back first.` };
  if (!existsSync(place)) return { ok: false, why: 'place-absent', detail: `The place for this workspace's session store (${place}) no longer exists; open the workspace again and a store is created there as for any new workspace.` };
  if (existsSync(storeFile(workspacesRoot, id))) return { ok: false, why: 'store-present', detail: `The session store is in its place again (${storeFile(workspacesRoot, id)}); open the workspace again to use it.` };
  return { ok: true, place };
}

/** The aside name `claimAsideName` would take first for `stamp` — the one the user is told, unless it is taken meanwhile. */
export function plannedAsideName(workspacesRoot: string, id: WorkspaceId, stamp: string): string {
  for (let i = 0; i < ASIDE_TRIES; i++) {
    const to = asideName(workspacesRoot, id, 'displaced', stamp, i);
    if (!existsSync(to)) return to;
  }
  return asideName(workspacesRoot, id, 'displaced', stamp, ASIDE_TRIES - 1);
}

export type EstablishOutcome =
  | { readonly ok: true; readonly place: string; readonly kept: string; readonly migratedTo: number }
  | { readonly ok: false; readonly why: 'place-absent' | 'store-present' | 'restore-pending' | 'aside-failed' | 'create-failed'; readonly detail: string; readonly kept?: string };

export function establishInEmptyPlace(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, stamp: string): EstablishOutcome {
  const check = checkEmptyPlace(workspacesRoot, id);
  if (!check.ok) return check;
  const aside = claimAsideName(workspacesRoot, id, stamp, 'displaced', check.place);
  if (!aside.ok) return { ok: false, why: 'aside-failed', detail: `What is in the place for this workspace's session store (${check.place}) could not be moved aside (${aside.code}); nothing was changed.` };
  // The place is absent now, and the open is the one an absent place gets: the store is created and migrated there.
  try {
    const r = openWorkspaceStore(workspacesRoot, id, workspaceRoot);
    const migratedTo = r.migration.kind === 'migrated' ? r.migration.to : r.migration.version;
    r.db.close();
    forgetSpelling(r.dir);
    return { ok: true, place: check.place, kept: aside.to, migratedTo };
  } catch (e) {
    return { ok: false, why: 'create-failed', detail: `What was in the place was moved aside and kept at ${aside.to}, and the new store could not be created: ${String(e)}`, kept: aside.to };
  }
}
