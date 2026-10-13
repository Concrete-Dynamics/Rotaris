import { resolve, relative, isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIREMENT_CHECKOUT_SUBPATH, worktreeStorageCollision } from '@rotaris/config';
import { REQUIREMENT_WORKTREES_SUBPATH, requirementWorktreePath, sessionWorktreePath } from '@rotaris/workspace';

/**
 * REQ-GIT-138 across the two packages that each hold half of it: the configuration load rejects a `worktree_storage_subpath`
 * (REQ-GIT-073) whose session trees would land in the requirement checkout directory REQ-GIT-137 fixes, and the workspace
 * service places both kinds of tree. config sits below workspace and cannot import its constant, so this composition root —
 * which imports both — pins that the load-time check and the placement agree, value by value
 * (docs/defects/fixed/a-worktree-storage-subpath-inside-the-requirement-checkout-directory-is-not-rejected-at-load.md).
 */
describe('REQ-GIT-138: the load-time check and the worktree placement agree', () => {
  const ws = resolve('/work/ws');
  it('both packages name the same fixed requirement checkout directory', () => {
    expect(resolve(ws, '.rotaris', REQUIREMENT_CHECKOUT_SUBPATH)).toBe(resolve(ws, REQUIREMENT_WORKTREES_SUBPATH));
    expect(requirementWorktreePath(ws, 'rotaris/req/r1/u1').startsWith(resolve(ws, REQUIREMENT_WORKTREES_SUBPATH))).toBe(true);
  });
  it('a value is rejected at load exactly when the session tree it places would lie in that directory', () => {
    const fixed = resolve(ws, REQUIREMENT_WORKTREES_SUBPATH);
    const inside = (p: string) => { const r = relative(fixed, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
    for (const sub of ['worktrees', '', 'trees/sessions', 'requirements', 'requirements/worktrees', 'requirements/worktrees/s', './requirements/worktrees', 'requirements/worktrees2', 'x/requirements/worktrees']) {
      const placed = sessionWorktreePath(ws, sub, 'sid');
      expect(placed.ok, sub).toBe(true);
      if (!placed.ok) continue;
      expect(worktreeStorageCollision(sub, process.platform) !== null, sub).toBe(inside(placed.value));
    }
  });
});
