#!/usr/bin/env node
// `pnpm worktree:overlaps` — what parallel work shares. Every registered worktree's branch is read against its
// fork point from `origin/main`: the files the branch touches (committed, staged, unstaged and untracked), the
// files `origin/main` has moved since that fork, and the files two or more branches both touch. The landing
// sequence prints the same overlap for the branch it lands, before the rebase — the case this makes visible is
// a rebase that merges textually while both sides have rewritten the same file.
// A report: it never fetches, never blocks and never writes; `origin/main` is read as last fetched.
import { isMainModule } from './exec.mjs';
import * as git from './git.mjs';

export const USAGE = `pnpm worktree:overlaps [--json]

What parallel work shares, read from every registered worktree beside origin/main:

  - per branch, the files its worktree touches against the fork point (committed,
    staged, unstaged and untracked ones);
  - per branch, the files origin/main has moved since that fork, in which the
    branch also works;
  - across branches, the files two or more branches both touch.

origin/main is read as last fetched — nothing here fetches. A report, not a gate:
the exit is 0 whether or not anything is shared. --json prints the same report as
one JSON object.

Exit codes: 0 reported · 1 not a repository, no origin, or origin/main unresolved · 2 usage
`;

/**
 * @typedef {Object} BranchOverlap
 * @property {string} branch
 * @property {string} worktree
 * @property {string | null} fork — the merge base with origin/main, null when the histories are unrelated
 * @property {string[]} files — what the worktree touches against the fork
 * @property {string[]} movedSinceFork — what origin/main moved between the fork and its tip
 * @property {string[]} sharedWithMain — files in both `files` and `movedSinceFork`
 */

/**
 * @typedef {Object} OverlapReport
 * @property {string} main — origin/main's tip, as last fetched
 * @property {BranchOverlap[]} branches
 * @property {Array<{ file: string, branches: string[] }>} sharedFiles — files two or more branches touch
 */

/**
 * @param {string[]} args
 * @returns {{ json: boolean, help: boolean, unknown: string[] }}
 */
export function parseOverlapsArgs(args) {
  /** @type {{ json: boolean, help: boolean, unknown: string[] }} */
  const parsed = { json: false, help: false, unknown: [] };
  for (const a of args) {
    if (a === '--help' || a === '-h') parsed.help = true;
    else if (a === '--json') parsed.json = true;
    else parsed.unknown.push(a);
  }
  return parsed;
}

/** The file names a plain commit range changed, sorted. @param {string} cwd @param {string} from @param {string} to */
export function filesChangedBetween(cwd, from, to) {
  const r = git.git(['diff', '--name-only', from, to], { cwd });
  if (r.status !== 0) return [];
  return r.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort();
}

/** The files a branch's worktree touches against `ref`: committed, staged, unstaged, and untracked. @param {string} cwd @param {string} ref */
export function touchedFiles(cwd, ref) {
  const diff = git.git(['diff', '--name-only', ref], { cwd });
  const untracked = git.git(['ls-files', '--others', '--exclude-standard'], { cwd });
  /** @type {Set<string>} */
  const names = new Set();
  for (const line of `${diff.stdout}\n${untracked.stdout}`.split('\n')) {
    const name = line.trim();
    if (name !== '') names.add(name);
  }
  return [...names].sort();
}

/**
 * The files this tree and `origin/main` both changed since their fork — what a rebase can merge textually
 * while both sides have rewritten the file. `null` when they share no fork.
 * @param {string} cwd @param {string} [head] @param {string} [mainRef]
 * @returns {{ fork: string, mine: string[], theirs: string[], both: string[] } | null}
 */
export function overlapWithMain(cwd, head = 'HEAD', mainRef = 'origin/main') {
  const forkOut = git.git(['merge-base', head, mainRef], { cwd });
  const fork = forkOut.status === 0 ? forkOut.stdout.trim() : '';
  if (fork === '') return null;
  const mine = filesChangedBetween(cwd, fork, head);
  const theirs = filesChangedBetween(cwd, fork, mainRef);
  const moved = new Set(theirs);
  return { fork, mine, theirs, both: mine.filter((file) => moved.has(file)) };
}

/**
 * One branch worktree read against its fork from `origin/main`.
 * @param {string} worktree @param {string} branch @param {string} [mainRef]
 * @returns {BranchOverlap}
 */
export function branchOverlap(worktree, branch, mainRef = 'origin/main') {
  const forkOut = git.git(['merge-base', branch, mainRef], { cwd: worktree });
  const fork = forkOut.status === 0 ? forkOut.stdout.trim() : '';
  if (fork === '') return { branch, worktree, fork: null, files: [], movedSinceFork: [], sharedWithMain: [] };
  const files = touchedFiles(worktree, fork);
  const movedSinceFork = filesChangedBetween(worktree, fork, mainRef);
  const moved = new Set(movedSinceFork);
  return { branch, worktree, fork, files, movedSinceFork, sharedWithMain: files.filter((file) => moved.has(file)) };
}

/**
 * The whole report: every branch worktree beside `main`, and the files branches share. `null` outside a
 * repository or without `origin/main`.
 * @param {string} cwd
 * @returns {OverlapReport | null}
 */
export function collectOverlaps(cwd) {
  const root = git.repoRoot(cwd);
  if (root === null) return null;
  const main = git.revParse(root, 'origin/main');
  if (main === null) return null;
  /** @type {BranchOverlap[]} */
  const branches = [];
  for (const entry of git.worktrees(root)) {
    if (entry.branch === null || entry.branch === 'main' || entry.branch === 'master') continue;
    if (branches.some((branch) => branch.branch === entry.branch)) continue;
    branches.push(branchOverlap(entry.path, entry.branch));
  }
  branches.sort((a, b) => a.branch.localeCompare(b.branch));
  /** @type {Map<string, string[]>} */
  const byFile = new Map();
  for (const branch of branches) {
    for (const file of branch.files) {
      if (!byFile.has(file)) byFile.set(file, []);
      /** @type {string[]} */ (byFile.get(file)).push(branch.branch);
    }
  }
  const sharedFiles = [...byFile.entries()]
    .filter(([, touched]) => touched.length >= 2)
    .map(([file, touched]) => ({ file, branches: [...new Set(touched)].sort() }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return { main, branches, sharedFiles };
}

/** The report as lines a person reads. @param {OverlapReport} report @returns {string[]} */
export function renderOverlaps(report) {
  /** @type {string[]} */
  const lines = [];
  const cap = 20;
  const count = report.branches.length;
  lines.push(
    `worktree:overlaps: ${count} branch worktree${count === 1 ? '' : 's'} beside origin/main ${report.main.slice(0, 7)} (as last fetched)`,
  );
  for (const branch of report.branches) {
    lines.push('');
    lines.push(`  ${branch.branch}  (${branch.worktree})`);
    if (branch.fork === null) {
      lines.push('    no fork point with origin/main — unrelated histories');
      continue;
    }
    lines.push(`    fork ${branch.fork.slice(0, 7)} · ${branch.files.length} file(s)`);
    for (const file of branch.files.slice(0, cap)) lines.push(`      ${file}`);
    if (branch.files.length > cap) lines.push(`      … +${branch.files.length - cap} more`);
  }
  lines.push('');
  const sharedMain = report.branches.filter((branch) => branch.sharedWithMain.length > 0);
  if (report.sharedFiles.length === 0 && sharedMain.length === 0) {
    lines.push(
      count === 0
        ? 'no branch worktree beside main — nothing to share'
        : 'nothing shared: no file is touched by two or more branches, and no branch touches a file origin/main moved since its fork',
    );
    return lines;
  }
  if (report.sharedFiles.length > 0) {
    lines.push('touched by two or more branches:');
    for (const entry of report.sharedFiles) lines.push(`  ${entry.file} — ${entry.branches.join(', ')}`);
    lines.push('');
  }
  if (sharedMain.length > 0) {
    lines.push('origin/main moved since the fork, in files a branch touches:');
    for (const branch of sharedMain) {
      for (const file of branch.sharedWithMain) {
        lines.push(`  ${file} — ${branch.branch} (fork ${branch.fork === null ? '?' : branch.fork.slice(0, 7)})`);
      }
    }
  }
  return lines;
}

/**
 * @param {{ argv: string[], cwd?: string, deps?: { log: (line: string) => void, error: (line: string) => void } }} options
 * @returns {number} the exit code
 */
export function runOverlaps({ argv, cwd = process.cwd(), deps = { log: (line) => process.stdout.write(`${line}\n`), error: (line) => process.stderr.write(`${line}\n`) } }) {
  const parsed = parseOverlapsArgs(argv);
  if (parsed.help) {
    deps.log(USAGE);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    deps.error(`worktree:overlaps: unknown argument ${parsed.unknown.join(' ')} (known: --json --help)`);
    return 2;
  }
  const root = git.repoRoot(cwd);
  if (root === null) {
    deps.error(`worktree:overlaps: ${cwd} is not inside a git repository`);
    return 1;
  }
  if (!git.hasOrigin(root)) {
    deps.error('worktree:overlaps: this needs an `origin` remote — origin/main is the reference');
    return 1;
  }
  const report = collectOverlaps(root);
  if (report === null) {
    deps.error('worktree:overlaps: origin/main does not resolve — fetch it (a landing or a fetch does), then run again');
    return 1;
  }
  if (parsed.json) {
    deps.log(JSON.stringify(report, null, 2));
    return 0;
  }
  for (const line of renderOverlaps(report)) deps.log(line);
  return 0;
}

if (isMainModule(process.argv[1], import.meta.url)) {
  process.exit(runOverlaps({ argv: process.argv.slice(2) }));
}
