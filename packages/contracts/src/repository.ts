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
