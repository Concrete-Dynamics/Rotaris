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

/**
 * ADR-0038: the environment variables git must not inherit from the product. Fixed here, deleted by the helper.
 *
 * REQ-GIT-031 names fourteen: `GIT_INDEX_FILE`, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`,
 * `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and the six identity and
 * date variables. Found on ADR-0039's first execution: the list held fourteen names but NOT those fourteen — the six
 * identity variables were absent (an inherited `GIT_AUTHOR_NAME` would have reached `commit-tree` had the checkpoint
 * layer not set its own, REQ-GIT-032) and six the requirement does not name were present. The six are now here; the
 * extra six stay, since each can also redirect an invocation and REQ-GIT-031 says "every other … that could".
 */
export const GIT_ENV_DENYLIST = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE',
  'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM', 'GIT_COMMON_DIR', 'GIT_CONFIG_NOSYSTEM', 'GIT_EXTERNAL_DIFF',
] as const;

/** REQ-GIT-001: the network subcommands the helper rejects at its one chokepoint. */
export const GIT_NETWORK_SUBCOMMANDS = ['fetch', 'pull', 'push', 'clone', 'ls-remote', 'remote', 'submodule'] as const;
export * from './git/invoke.js';
export * from './git/repository.js';
export * from './git/paths.js';
export * from './git/view.js';
export * from './git/worktrees.js';
export * from './git/checkpoints.js';
export * from './backup.js';
export * from './restore.js';
// Part AJ
export * from './traceability/index.js';
