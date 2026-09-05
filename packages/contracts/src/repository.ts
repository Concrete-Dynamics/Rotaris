import { z } from 'zod';

/**
 * REQ-MONITOR-168 / REQ-GIT-102 / REQ-GIT-103: what the repository card reads, as the workspace service answers it.
 * Every read that failed or was abandoned contributes its EMPTY value (REQ-GIT-112): null for a name, 0 for a
 * count — never a dialog, never a thrown error. `gitAvailable` is decided by asking Git for its version and
 * `isRepository` by asking Git, not by the filesystem (REQ-GIT-103).
 */
export const RepositoryStateSchema = z.object({
  gitAvailable: z.boolean(),
  isRepository: z.boolean(),
  branch: z.string().nullable(),
  /** The comparison base — the upstream's name — or null when the branch has none. */
  base: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  /** Files with any change in the working tree or the index. */
  touched: z.number().int().nonnegative(),
  /** Changes not yet committed (unstaged plus staged, counted per file). */
  uncommitted: z.number().int().nonnegative(),
  /** The reads that contributed an empty value, by name, so a surface can say why a figure is absent. */
  failed: z.array(z.string()),
  readMs: z.number().nonnegative(),
});
export type RepositoryState = z.infer<typeof RepositoryStateSchema>;

/** REQ-SHELL-069: a stored pane layout — version 1, the view's pane count, one size per pane. */
export const PaneLayoutSchema = z.object({ version: z.literal(1), panes: z.number().int().positive(), sizes: z.array(z.number()) });
export type PaneLayout = z.infer<typeof PaneLayoutSchema>;

/**
 * REQ-GIT-015: the product's SINGLE definition of a session's worktree binding — the seven fields, the closed
 * `merge_status` vocabulary and every default. Created by isolation (REQ-GIT-010), by an attach (REQ-GIT-011) and
 * advanced by integration (REQ-GIT-133); carried in full on every listing record (REQ-GIT-018).
 */
export const MERGE_STATUSES = ['ready', 'integrating', 'merged', 'merge_failed'] as const;
export type MergeStatus = (typeof MERGE_STATUSES)[number];
export const WorktreeBindingSchema = z.object({
  worktree_path: z.string(),
  branch: z.string(),
  base_branch: z.string(),
  base_revision: z.string(),
  created_by_session: z.boolean().default(true),
  merge_status: z.enum(MERGE_STATUSES).default('ready'),
  integration_session_id: z.string().nullable().default(null),
});
export type WorktreeBinding = z.infer<typeof WorktreeBindingSchema>;

/**
 * REQ-GIT-085 / REQ-GIT-105..108: one worktree row and one history row as the workspace service collects them.
 * A figure that could not be computed is null — the empty value of REQ-GIT-112 — never an approximation.
 */
export const GitWorktreeRowSchema = z.object({
  path: z.string(),
  /** Without `refs/heads/`; null when the tree is on a detached HEAD (REQ-GIT-105 renders the literal `detached`). */
  branch: z.string().nullable(),
  head: z.string(),
  /** REQ-GIT-106: the main working tree — never identified by branch name; exactly one row carries it. */
  isBase: z.boolean(),
  /** REQ-GIT-106: the resolved path equals the open workspace. */
  isActive: z.boolean(),
  /** REQ-GIT-085: against the base branch, never an upstream; 0/0 for the base tree; null with no base branch. */
  ahead: z.number().int().nonnegative().nullable(),
  behind: z.number().int().nonnegative().nullable(),
  /** REQ-GIT-107's three figures under REQ-GIT-003's exclusion. */
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  files: z.number().int().nonnegative().nullable(),
});
export type GitWorktreeRow = z.infer<typeof GitWorktreeRowSchema>;

export const GitCommitRowSchema = z.object({
  hash: z.string(),
  /** REQ-GIT-105: the first 8 characters of the full hash. */
  abbrev: z.string(),
  subject: z.string(),
  author: z.string(),
  at: z.string(),
  /** REQ-GIT-105's relative-age ladder, pre-rendered. */
  age: z.string(),
  /** REQ-GIT-108: not reachable from the upstream; never derived from position. */
  local: z.boolean(),
});
export type GitCommitRow = z.infer<typeof GitCommitRowSchema>;

/** REQ-GIT-105: everything one Git-view refresh collects, as the workspace service answers `git.view`. */
export const GitViewStateSchema = z.object({
  workspaceRoot: z.string(),
  gitAvailable: z.boolean(),
  isRepository: z.boolean(),
  /** The checked-out branch; null when detached or not a repository. */
  branch: z.string().nullable(),
  detached: z.boolean(),
  upstream: z.string().nullable(),
  /** Against the upstream; both 0 with no upstream (REQ-GIT-112). */
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  /** Paths with uncommitted changes, untracked included, under the exclusion (REQ-GIT-014). */
  uncommitted: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  /** REQ-GIT-106: the branch the base tree has checked out; null when the base tree is detached. */
  baseBranch: z.string().nullable(),
  worktrees: z.array(GitWorktreeRowSchema),
  history: z.array(GitCommitRowSchema),
  failed: z.array(z.string()),
  reads: z.number().int().nonnegative(),
  readMs: z.number().nonnegative(),
});
export type GitViewState = z.infer<typeof GitViewStateSchema>;
