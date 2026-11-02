/**
 * @rotaris/workspace — what the workspace service holds (ADR-0002 #3):
 * configuration loading over the document tree (ADR-0036, ADR-0037), the git
 * invocation helper — the only place the product spawns git (ADR-0038) —
 * checkpoints via a private index (ADR-0039), the traceability engine on
 * terminable worker threads with one I/O owner (ADR-0040), the delivery
 * store (ADR-0041), the improvement library, the storage classification of
 * REQ-STARTUP-166 held for the life of the open, and the backup
 * orchestration (REQ-SESSION-201).
 *
 * Skeleton: the open-workspace sequence — establish the identifier, open and
 * migrate the store, hand the resolved path on — is in `@rotaris/store`
 * (`establishWorkspaceId`, `openWorkspaceStore`) and is composed by the
 * workspace-service entry. Everything else lands with its ADR.
 */
export const WORKSPACE_PACKAGE = '@rotaris/workspace' as const;

export * from './git/invoke.js';
export * from './git/repository.js';
export * from './git/paths.js';
export * from './git/view.js';
export * from './git/worktrees.js';
export * from './git/checkpoints.js';
export * from './backup.js';
export * from './restore.js';
export * from './delivery/index.js'; // Part AK
export * from './improvements/index.js';
// Part AJ
export * from './traceability/index.js';
export * from './adoption/index.js'; // domain 22, PD-TRACE-001
