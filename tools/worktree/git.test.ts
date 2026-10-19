// The git reads, against a scratch repository — the wrappers' whole picture of a checkout, its branch and its
// worktrees, real git throughout.
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  branchExists,
  currentBranch,
  git,
  hasOrigin,
  isAncestor,
  isInside,
  operationInProgress,
  porcelain,
  primaryRoot,
  repoRoot,
  revParse,
  samePath,
  slugFor,
  validBranchName,
  worktreePaths,
} from './git.mjs';
import { addWorktree, gitOk, removeRepo, scratchRepo, type ScratchRepo } from './scratch.test-support.js';

let repo: ScratchRepo | null = null;
afterEach(() => {
  if (repo !== null) {
    removeRepo(repo);
    repo = null;
  }
});

describe('the pure helpers', () => {
  it('slugs a branch name into a directory component', () => {
    expect(slugFor('tool-worktree')).toBe('tool-worktree');
    expect(slugFor('codex/Fix Thing')).toBe('codex-fix-thing');
    expect(slugFor('///')).toBe('branch');
  });

  it('compares paths the way the platform does, and tells inside from outside', () => {
    expect(samePath('/a/b', '/a/b/')).toBe(true);
    expect(isInside('/a/b/c', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(false);
    expect(isInside('/a/bc', '/a/b')).toBe(false);
  });
});

describe('the git reads', () => {
  it('reads the repository, its primary checkout, the branch and the worktrees', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/x', tree);
    const branchHead = repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    expect(samePath(repoRoot(tree) ?? '', tree)).toBe(true);
    expect(repoRoot(repo.base)).toBeNull();
    expect(samePath(primaryRoot(tree) ?? '', repo.primary)).toBe(true);
    expect(currentBranch(tree)).toBe('tool/x');
    expect(currentBranch(repo.primary)).toBe('main');
    expect(branchExists(repo.primary, 'tool/x')).toBe(true);
    expect(branchExists(repo.primary, 'tool/nope')).toBe(false);
    expect(validBranchName(repo.primary, 'tool/x')).toBe(true);
    expect(validBranchName(repo.primary, 'bad name!')).toBe(false);
    expect(hasOrigin(repo.primary)).toBe(true);
    expect(porcelain(tree).trim()).toBe('');
    expect(operationInProgress(tree)).toBeNull();
    expect(worktreePaths(repo.primary).some((path) => samePath(path, tree))).toBe(true);
    expect(revParse(repo.primary, 'origin/main')).toBe(repo.sha('main'));
    expect(isAncestor(repo.primary, repo.sha('main'), branchHead)).toBe(true);
    expect(isAncestor(repo.primary, branchHead, repo.sha('main'))).toBe(false);
  });

  it('names a rebase in progress', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'fix/conflict', tree);
    repo.commit(tree, 'their line', { 'a.txt': 'one\nTWO\nthree\n' });
    repo.commit(repo.primary, 'our line', { 'a.txt': 'one\nALSO\nthree\n' });
    const rebase = git(['rebase', 'main'], { cwd: tree });
    expect(rebase.status).not.toBe(0);
    expect(operationInProgress(tree)).toBe('rebase');
    expect(porcelain(tree)).toContain('a.txt');
    gitOk(tree, 'rebase', '--abort');
    expect(operationInProgress(tree)).toBeNull();
    expect(porcelain(tree).trim()).toBe('');
  });
});
