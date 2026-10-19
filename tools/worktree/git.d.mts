import type { RunResult } from './exec.mjs';

export function cleanEnv(): NodeJS.ProcessEnv;
export function git(
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: 'inherit' | 'capture' },
): RunResult;
export function repoRoot(cwd: string): string | null;
export function primaryRoot(cwd: string): string | null;
export function currentBranch(cwd: string): string | null;
export function branchExists(cwd: string, branch: string): boolean;
export function validBranchName(cwd: string, branch: string): boolean;
export function hasOrigin(cwd: string): boolean;
export function porcelain(cwd: string): string;
export function operationInProgress(cwd: string): 'rebase' | 'merge' | 'cherry-pick' | null;
export function worktreePaths(cwd: string): string[];
export function isAncestor(cwd: string, ancestor: string, descendant: string): boolean;
export function revParse(cwd: string, ref: string): string | null;
export function slugFor(name: string): string;
export function samePath(a: string, b: string): boolean;
export function isInside(child: string, parent: string): boolean;
