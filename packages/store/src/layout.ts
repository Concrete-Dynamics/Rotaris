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
 * Leftover shapes are tabulated in ADR-0058 consequence 5.
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
export const SIDECAR_PATTERN = /-(wal|shm)$/;
