// git reads for the worktree workflow. Every call goes through `run`, with this file's `cleanEnv`: the
// wrappers always know which tree they mean, so the variables an enclosing git process sets (a hook running
// `pnpm check`, `REDIRECTING` in `tools/build-id/build-id.mjs`) never redirect a read to another repository.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { REDIRECTING } from '../build-id/build-id.mjs';
import { run } from './exec.mjs';

/** The environment without the variables an enclosing git process sets. @returns {NodeJS.ProcessEnv} */
export function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !REDIRECTING.includes(key)));
}

/**
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdio?: 'inherit' | 'capture' }} [opts]
 * @returns {import('./exec.mjs').RunResult}
 */
export function git(args, opts = {}) {
  return run('git', args, { ...opts, env: opts.env ?? cleanEnv() });
}

/** The tree's top level, or null outside a repository. @param {string} cwd */
export function repoRoot(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd });
  return r.status === 0 && r.stdout.trim() ? resolve(r.stdout.trim()) : null;
}

/** The primary checkout — the directory holding the shared git directory. @param {string} cwd */
export function primaryRoot(cwd) {
  const r = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  return r.status === 0 && r.stdout.trim() ? dirname(resolve(r.stdout.trim())) : null;
}

/** The checked-out branch, or null when HEAD is detached. @param {string} cwd */
export function currentBranch(cwd) {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  const name = r.status === 0 ? r.stdout.trim() : '';
  return name !== '' && name !== 'HEAD' ? name : null;
}

/** @param {string} cwd @param {string} branch */
export function branchExists(cwd, branch) {
  return git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd }).status === 0;
}

/** @param {string} cwd @param {string} branch */
export function validBranchName(cwd, branch) {
  return branch !== '' && git(['check-ref-format', '--branch', branch], { cwd }).status === 0;
}

/** @param {string} cwd */
export function hasOrigin(cwd) {
  return git(['remote'], { cwd })
    .stdout.split('\n')
    .map((line) => line.trim())
    .includes('origin');
}

/** `git status --porcelain` output — empty when the tree is clean. @param {string} cwd */
export function porcelain(cwd) {
  return git(['status', '--porcelain=v1'], { cwd }).stdout;
}

/** The operation a tree is in the middle of, or null. @param {string} cwd */
export function operationInProgress(cwd) {
  /** @type {Array<[string, string]>} */
  const markers = [
    ['rebase', 'rebase-merge'],
    ['rebase', 'rebase-apply'],
    ['merge', 'MERGE_HEAD'],
    ['cherry-pick', 'CHERRY_PICK_HEAD'],
  ];
  for (const [name, file] of markers) {
    const r = git(['rev-parse', '--path-format=absolute', '--git-path', file], { cwd });
    if (r.status === 0 && r.stdout.trim() && existsSync(r.stdout.trim())) return name;
  }
  return null;
}

/** Every registered worktree's path. @param {string} cwd */
export function worktreePaths(cwd) {
  return git(['worktree', 'list', '--porcelain'], { cwd })
    .stdout.split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim());
}

/** @param {string} cwd @param {string} ancestor @param {string} descendant */
export function isAncestor(cwd, ancestor, descendant) {
  return git(['merge-base', '--is-ancestor', ancestor, descendant], { cwd }).status === 0;
}

/** @param {string} cwd @param {string} ref */
export function revParse(cwd, ref) {
  const r = git(['rev-parse', '--verify', ref], { cwd });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** A branch name as a directory component: every run of anything else becomes `-`. @param {string} name */
export function slugFor(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'branch'
  );
}

/** Path equality that survives git's `/` and Windows' case rules. @param {string} a @param {string} b */
export function samePath(a, b) {
  const x = resolve(a).replace(/[\\/]+$/, '');
  const y = resolve(b).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** True when `child` is below `parent`. @param {string} child @param {string} parent */
export function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
