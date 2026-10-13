import { join } from 'node:path';
import type { WorkspaceId } from '@rotaris/kernel';

/**
 * ADR-0058's on-disk layout, machine-local, under the per-user LOCAL data
 * directory (REQ-STARTUP-145), located by the workspace identifier and never
 * by path (REQ-SESSION-197/198).
 *
 *   <data>/workspaces/
 *     <identifier>/                    the live store for one workspace
 *       workspace.db                   the store; -wal and -shm beside it
 *       origin.txt                     last-seen workspace path, for the reclamation surface (OQ-48)
 *       sessions/<session-id>/         the closed set of three file kinds (D-01)
 *     <identifier>.displaced-<stamp>[.n]   a store a restore or the ladder set aside — kept
 *     <identifier>.restoring-<n>       a restore's staging copy — D5: nothing deletes it yet
 *     <identifier>.obstruction-<stamp>[.n] what the reversal moved off the target name — D5
 *
 * Leftover shapes are tabulated in ADR-0058 consequence 5. D5 is deferred with OQ-48's
 * inspect-and-delete surface (R-071, "after the first release"). The first and second names are
 * longer than `<identifier>` by 35 to 37 and by 12 characters, and a restore refuses before its
 * first step where either would cross the engine's path limit (D11, `storePathLimit`, below).
 */
export const STORE_FILE = 'workspace.db' as const;
export const ORIGIN_FILE = 'origin.txt' as const;
export const SESSIONS_DIR = 'sessions' as const;
/** The container layout a backup artifact uses; converted into the store layout by the restore (step 6, D7). */
export const CONTAINER_STORE_FILE = 'store.db' as const;
export const CONTAINER_MANIFEST = 'manifest.json' as const;

export function storeDir(workspacesRoot: string, id: WorkspaceId): string {
  return join(workspacesRoot, id);
}
export function storeFile(workspacesRoot: string, id: WorkspaceId): string {
  return join(workspacesRoot, id, STORE_FILE);
}
export function stagingDir(workspacesRoot: string, id: WorkspaceId, n: number): string {
  return join(workspacesRoot, `${id}.restoring-${n}`);
}
export function asideName(workspacesRoot: string, id: WorkspaceId, kind: 'displaced' | 'obstruction', stamp: string, counter: number): string {
  return join(workspacesRoot, `${id}.${kind}-${stamp}${counter === 0 ? '' : `.${counter}`}`);
}
/** The length of a `fileStamp` (`2026-10-13T12-34-56-789Z`) — what the assessment, which reads no clock, measures the kept name with. */
export const FILE_STAMP_LENGTH = 24 as const;
/** How many aside names step 8's claim tries (D6: the counter, not the stamp's granularity, is what makes the name safe). */
export const ASIDE_TRIES = 5 as const;

/**
 * D11 (ADR-0058 consequence 18) — the longest database path, in characters, the store engine opens on this
 * platform, where one was measured. On Windows the binding threw `unable to open database file` on any statement
 * at an absolute database path of 252 to 259 characters and on open at 260 or more, with `LongPathsEnabled` set and
 * Node's own filesystem calls working at 328: the registry opt-in does not reach the engine. Nothing was measured
 * elsewhere, and on this host the engine opened every length the filesystem would create, so elsewhere there is
 * no limit to hold a restore to.
 */
export function storePathLimit(platform: NodeJS.Platform = process.platform): number | null {
  return platform === 'win32' ? 251 : null;
}

/**
 * The database paths a restore of `id` creates beside the live store: the staging store it opens at step 6, and,
 * where there is a store to displace, the kept one at the widest name step 8 can claim (the last counter).
 * `.displaced-` and a stamp make the kept one 35 characters longer than the live store, 37 at a counter; the
 * staging one (`.restoring-1`) is 12 longer.
 */
export function restoreStorePaths(workspacesRoot: string, id: WorkspaceId, stampLength: number, stagingN: number, targetExists: boolean): { readonly staging: string; readonly kept: string | null } {
  return {
    staging: join(stagingDir(workspacesRoot, id, stagingN), STORE_FILE),
    kept: targetExists ? join(asideName(workspacesRoot, id, 'displaced', 'x'.repeat(stampLength), ASIDE_TRIES - 1), STORE_FILE) : null,
  };
}
export const SIDECAR_PATTERN = /-(wal|shm)$/;
