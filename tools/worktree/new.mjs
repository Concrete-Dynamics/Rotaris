#!/usr/bin/env node
// `pnpm worktree:new <branch>` — a fresh worktree beside the primary checkout, on a new branch cut from
// origin/main, its dependencies and electron's dist/ installed, and `pnpm preflight` run. It wraps the block
// `docs/clean-room/agent-workflow.md` spells by hand; the rules that file states still bind.
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isMainModule, oneLine, seconds } from './exec.mjs';
import * as git from './git.mjs';
import { defaultDeps } from './steps.mjs';

export const USAGE = `pnpm worktree:new <branch> [--dir=<path>]

A fresh worktree beside the primary checkout, on a new branch cut from origin/main, and the setup
docs/clean-room/agent-workflow.md spells by hand:

  git fetch origin main
  git worktree add -b <branch> <dir> origin/main
  pnpm install --prefer-offline
  node node_modules/electron/install.js
  pnpm preflight

<dir> defaults to <primary>-wt-<branch as a slug> beside the primary checkout; --dir places it
elsewhere and it must not exist yet. The branch is refused when it already exists, when it is
\`main\`, or when the directory is taken. Without an \`origin\` remote the command refuses: the landing
sequence pushes there.

Exit codes: 0 created · 1 refused, or a step failed (the worktree stays, named) · 2 usage
`;

/**
 * @param {string[]} args
 * @returns {{ branch: string | null, dir: string | null, help: boolean, unknown: string[] }}
 */
export function parseNewArgs(args) {
  /** @type {{ branch: string | null, dir: string | null, help: boolean, unknown: string[] }} */
  const parsed = { branch: null, dir: null, help: false, unknown: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      parsed.help = true;
      continue;
    }
    if (a === '--dir') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        parsed.unknown.push('--dir (missing value)');
        continue;
      }
      parsed.dir = next;
      i += 1;
      continue;
    }
    if (a.startsWith('--dir=')) {
      const value = a.slice('--dir='.length);
      if (value === '') parsed.unknown.push('--dir (missing value)');
      else parsed.dir = value;
      continue;
    }
    if (a.startsWith('-')) {
      parsed.unknown.push(a);
      continue;
    }
    if (parsed.branch === null) parsed.branch = a;
    else parsed.unknown.push(a);
  }
  return parsed;
}

/**
 * @param {{ argv: string[], cwd?: string, deps?: import('./steps.mjs').Deps }} options
 * @returns {number} the exit code
 */
export function runNew({ argv, cwd = process.cwd(), deps = defaultDeps() }) {
  const parsed = parseNewArgs(argv);
  if (parsed.help) {
    deps.log(USAGE);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    deps.error(`worktree:new: unknown argument ${parsed.unknown.join(' ')} (known: --dir --help)`);
    return 2;
  }
  if (parsed.branch === null) {
    deps.error('worktree:new: name the branch — pnpm worktree:new <branch> [--dir=<path>]');
    return 2;
  }
  const branch = parsed.branch;

  const root = git.repoRoot(cwd);
  if (root === null) {
    deps.error('worktree:new: not inside a git repository');
    return 1;
  }
  const primary = git.primaryRoot(cwd);
  if (primary === null) {
    deps.error('worktree:new: cannot resolve the primary checkout');
    return 1;
  }
  if (!git.hasOrigin(root)) {
    deps.error('worktree:new: this needs an `origin` remote — the landing sequence pushes to it');
    return 1;
  }
  if (!git.validBranchName(root, branch)) {
    deps.error(`worktree:new: '${branch}' is not a valid branch name`);
    return 1;
  }
  if (branch === 'main' || branch === 'master') {
    deps.error(
      `worktree:new: '${branch}' is where landed work lives; name the branch after the work (part-<letter>-<topic>, fix-<topic>, tool-<topic>)`,
    );
    return 1;
  }
  if (git.branchExists(root, branch)) {
    deps.error(`worktree:new: branch '${branch}' already exists`);
    return 1;
  }

  const dir =
    parsed.dir !== null ? resolve(cwd, parsed.dir) : join(dirname(primary), `${basename(primary)}-wt-${git.slugFor(branch)}`);
  if (existsSync(dir)) {
    deps.error(`worktree:new: ${dir} already exists — remove it, or name another --dir`);
    return 1;
  }

  deps.log('worktree:new: fetching origin/main');
  const fetch = git.git(['fetch', 'origin', 'main'], { cwd: root });
  if (fetch.status !== 0) {
    deps.error(`worktree:new: git fetch failed: ${oneLine(fetch.stderr)}`);
    return 1;
  }
  const base = git.revParse(root, 'origin/main');
  if (base === null) {
    deps.error('worktree:new: origin/main did not resolve after the fetch');
    return 1;
  }

  const added = git.git(['worktree', 'add', '-b', branch, dir, 'origin/main'], { cwd: root });
  if (added.status !== 0) {
    deps.error(`worktree:new: git worktree add failed: ${oneLine(added.stderr)}`);
    return 1;
  }
  deps.log(`worktree:new: ${dir} on ${branch}, cut from origin/main ${base.slice(0, 7)}`);

  const started = Date.now();
  const setup = deps.setup(dir);
  if (!setup.ok) {
    deps.error(`worktree:new: setup stopped at ${setup.step ?? 'a step'} — the worktree exists at ${dir}`);
    return 1;
  }
  const pre = deps.preflight(dir, []);
  if (!pre.ok) {
    deps.error(`worktree:new: preflight found red checks — the worktree exists at ${dir}; fix the machine before working in it`);
    return 1;
  }
  deps.log(`worktree:new: install, electron and preflight took ${seconds(Date.now() - started)}`);
  deps.log(`worktree:new: cd ${dir}`);
  return 0;
}

if (isMainModule(process.argv[1], import.meta.url)) {
  process.exit(runNew({ argv: process.argv.slice(2) }));
}
