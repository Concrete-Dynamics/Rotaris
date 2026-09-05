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

/** ADR-0038: the environment variables git must not inherit from the product. Fixed here, deleted by the helper. */
export const GIT_ENV_DENYLIST = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM', 'GIT_COMMON_DIR',
  'GIT_CONFIG', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_EXTERNAL_DIFF',
] as const;

/** REQ-GIT-001: the network subcommands the helper rejects at its one chokepoint. */
export const GIT_NETWORK_SUBCOMMANDS = ['fetch', 'pull', 'push', 'clone', 'ls-remote', 'remote', 'submodule'] as const;
export * from './git/invoke.js';
export * from './git/repository.js';
export * from './backup.js';
export * from './restore.js';
