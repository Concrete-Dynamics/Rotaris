import { dirname } from 'node:path';
import { toIsoUtc, type Clocks, type Millis } from '@rotaris/kernel';
import type { GitCommitRow, GitViewState, GitWorktreeRow } from '@rotaris/contracts';
import { invokeGit, type GitResult } from './invoke.js';
import { GIT_READ_TIMEOUT } from './repository.js';
import { excludedPath, resolvedPath } from './paths.js';

/**
 * ADR-0038's second execution: the Git view's reads (REQ-GIT-105), every one through `invokeGit`, every one bounded
 * at 15 s (REQ-GIT-102), every failure its empty value and its name in `failed` (REQ-GIT-112); the version and the
 * is-inside-work-tree gates first (REQ-GIT-103). The base tree is the main working tree, never a branch name
 * (REQ-GIT-106); every figure is counted under REQ-GIT-003's exclusion; the local flag is a reachability fact, never a
 * position (REQ-GIT-108). A refresh always ends in a state — never a dialog, never a throw.
 *
 * Read count: 2 gates + branch + upstream (+ upstream counts) + the workspace's status and numstat + the worktree
 * listing + the common dir + the log (+ the local set) = 9..11, then 2 per non-base worktree (counts and the
 * merge-base diff), plus 2 for the base tree's own uncommitted work when the workspace is a linked tree, plus 2 for
 * an active non-base tree's own uncommitted work. Logged as `git view: N reads in M ms`.
 */
export interface GitViewDeps {
  readonly clocks: Clocks;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executable?: string;
  readonly timeoutMs?: Millis;
  readonly platform?: NodeJS.Platform;
}

export const HISTORY_WINDOW = 30;

export interface ParsedWorktree {
  readonly path: string;
  readonly head: string;
  /** Without `refs/heads/`; null when detached or bare. */
  readonly branch: string | null;
  readonly bare: boolean;
  readonly detached: boolean;
}

/** `git worktree list --porcelain`: blank-line-separated blocks; the main working tree is listed first. */
export function parseWorktreeList(porcelain: string): ParsedWorktree[] {
  const out: ParsedWorktree[] = [];
  for (const block of porcelain.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== '');
    const worktree = lines.find((l) => l.startsWith('worktree '));
    if (!worktree) continue;
    const head = lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? '';
    const branchLine = lines.find((l) => l.startsWith('branch '))?.slice(7) ?? null;
    out.push({
      path: worktree.slice(9), head, bare: lines.includes('bare'), detached: lines.includes('detached'),
      branch: branchLine === null ? null : branchLine.replace(/^refs\/heads\//, ''),
    });
  }
  return out;
}

export interface Numstat { readonly additions: number; readonly deletions: number; readonly paths: readonly string[] }

/** `git diff --numstat --no-renames -z`: `add TAB del TAB path NUL`; a binary file counts as a path with no lines. */
export function parseNumstat(text: string): Numstat {
  let additions = 0;
  let deletions = 0;
  const paths: string[] = [];
  for (const record of text.split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(record);
    if (!m) continue;
    const path = m[3]!;
    if (excludedPath(path)) continue;
    paths.push(path);
    if (m[1] !== '-') additions += Number(m[1]);
    if (m[2] !== '-') deletions += Number(m[2]);
  }
  return { additions, deletions, paths };
}

export interface StatusPaths { readonly changed: readonly string[]; readonly untracked: readonly string[] }

/** `git status --porcelain --untracked-files=all --no-renames -z`: `XY path NUL`; `??` is untracked; the exclusion applies to every path. */
export function parseStatusPaths(text: string): StatusPaths {
  const changed: string[] = [];
  const untracked: string[] = [];
  for (const record of text.split('\0')) {
    if (record.length < 4) continue;
    const xy = record.slice(0, 2);
    const path = record.slice(3);
    if (excludedPath(path)) continue;
    if (xy === '??') untracked.push(path);
    else if (xy !== '!!') changed.push(path);
  }
  return { changed, untracked };
}

/** `git log --format=%H%x1f%s%x1f%an%x1f%at`: one record per line, fields separated by U+001F. */
export function parseLog(text: string): { hash: string; subject: string; author: string; at: string }[] {
  const out: { hash: string; subject: string; author: string; at: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [hash, subject, author, seconds] = line.split('\u001f');
    if (!hash || !/^[0-9a-f]{40}$/.test(hash)) continue;
    const at = new Date(Number(seconds ?? '0') * 1000);
    out.push({ hash, subject: subject ?? '', author: author ?? '', at: Number.isFinite(at.getTime()) ? at.toISOString() : '' });
  }
  return out;
}

/**
 * REQ-GIT-105's ladder: under one minute "just now"; then minutes to 59, hours to 23, days to 29, months of 30 days
 * to 11, years of 365 days — the largest unit whose count is at least 1, and only that unit.
 */
export function ageLabel(nowIso: string, atIso: string): string {
  const seconds = Math.max(0, Math.floor((new Date(nowIso).getTime() - new Date(atIso).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return '';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return unit(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return unit(days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return unit(months, 'month');
  return unit(Math.floor(days / 365), 'year');
}

const EMPTY_VIEW = (workspaceRoot: string): GitViewState => ({
  workspaceRoot, gitAvailable: false, isRepository: false, branch: null, detached: false, upstream: null, ahead: 0, behind: 0,
  uncommitted: 0, additions: 0, deletions: 0, files: 0, baseBranch: null, worktrees: [], history: [], failed: [], reads: 0, readMs: 0,
});

const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout : null);
const parseCounts = (text: string | null): { ahead: number; behind: number } | null => {
  const m = text === null ? null : /^(\d+)\s+(\d+)\s*$/.exec(text.trim());
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null;
};

export async function readGitView(workspaceRoot: string, deps: GitViewDeps): Promise<GitViewState> {
  const started = Number(deps.clocks.monotonic.now());
  const elapsed = () => Math.round(Number(deps.clocks.monotonic.now()) - started);
  const platform = deps.platform ?? process.platform;
  const failed: string[] = [];
  let reads = 0;
  const timeoutMs = deps.timeoutMs ?? GIT_READ_TIMEOUT;
  const raw = async (args: readonly string[], cwd = workspaceRoot): Promise<GitResult> => {
    reads += 1;
    return invokeGit({ args, workspaceRoot: cwd, timeoutMs, timers: deps.clocks.timers, clock: deps.clocks.monotonic, ...(deps.env ? { env: deps.env } : {}), ...(deps.executable ? { executable: deps.executable } : {}) });
  };
  /** A named read: a failure contributes null and its name. */
  const read = async (name: string, args: readonly string[], cwd = workspaceRoot): Promise<string | null> => {
    const text = okText(await raw(args, cwd));
    if (text === null) failed.push(name);
    return text;
  };
  const done = (state: GitViewState): GitViewState => ({ ...state, failed, reads, readMs: elapsed() });

  // REQ-GIT-103: both gates are questions to Git.
  if ((await read('version', ['--version'])) === null) return done(EMPTY_VIEW(workspaceRoot));
  const inside = await read('is-inside-work-tree', ['rev-parse', '--is-inside-work-tree']);
  if (inside?.trim() !== 'true') return done({ ...EMPTY_VIEW(workspaceRoot), gitAvailable: true });

  // The header: the checked-out branch (or detached), the upstream and its counts.
  const branchText = await read('branch', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const detached = branchText?.trim() === 'HEAD';
  const branch = branchText === null || detached ? null : branchText.trim();
  // No upstream is not a failed read: the counters are simply 0 (REQ-GIT-112).
  const upstream = okText(await raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']))?.trim() ?? null;
  let ahead = 0;
  let behind = 0;
  if (upstream !== null && !detached) {
    const counts = parseCounts(await read('ahead-behind', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]));
    if (counts) ({ ahead, behind } = counts);
  }

  // One tree's own uncommitted work: the numstat of its working tree plus its untracked paths (REQ-GIT-107, REQ-GIT-014).
  const uncommittedOf = async (label: string, cwd: string): Promise<{ additions: number; deletions: number; paths: Set<string>; changed: number } | null> => {
    // Found on ADR-0039's first execution (REQ-GIT-004/030: the index file is never refreshed or rewritten): after a
    // checkpoint restore had written a file, this refresh's `diff … HEAD` porcelain refreshed the repository's index and
    // WROTE it — the reason had been that a read is a read. `diff-index` compares the same trees and writes nothing, and
    // `status` is told to take no optional lock; the figures are unchanged (a stat-dirty, content-identical path is not listed).
    const status = await read(`${label}:status`, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all', '--no-renames', '-z'], cwd);
    const numstat = await read(`${label}:numstat`, ['diff-index', '--numstat', '--no-renames', '-z', 'HEAD'], cwd);
    if (status === null && numstat === null) return null;
    const s = parseStatusPaths(status ?? '');
    const n = parseNumstat(numstat ?? '');
    // An untracked path is counted in the files figure and in the uncommitted count; its line count is not read.
    return { additions: n.additions, deletions: n.deletions, paths: new Set([...n.paths, ...s.untracked]), changed: s.changed.length + s.untracked.length };
  };
  const own = await uncommittedOf('workspace', workspaceRoot);

  // The worktrees: the listing, and the base tree found by its common directory (REQ-GIT-106), never by branch name.
  const listing = parseWorktreeList((await read('worktree-list', ['worktree', 'list', '--porcelain'])) ?? '');
  const commonDir = (await read('common-dir', ['rev-parse', '--path-format=absolute', '--git-common-dir']))?.trim() ?? null;
  const workspaceResolved = resolvedPath(workspaceRoot, platform);
  let baseIndex = commonDir === null ? -1 : listing.findIndex((w) => resolvedPath(w.path, platform) === resolvedPath(dirname(commonDir), platform));
  if (baseIndex < 0 && listing.length > 0) baseIndex = 0;
  const base = baseIndex >= 0 ? listing[baseIndex]! : null;
  const baseBranch = base?.branch ?? null;
  const worktrees: GitWorktreeRow[] = [];
  for (const [index, w] of listing.entries()) {
    const isBase = index === baseIndex;
    const isActive = resolvedPath(w.path, platform) === workspaceResolved;
    const tip = w.branch ?? w.head;
    let row: GitWorktreeRow = { path: w.path, branch: w.branch, head: w.head, isBase, isActive, ahead: null, behind: null, additions: null, deletions: null, files: null };
    if (w.bare) { worktrees.push(row); continue; }
    if (isBase) {
      const u = isActive ? own : await uncommittedOf('base', w.path);
      row = { ...row, ahead: 0, behind: 0, ...(u ? { additions: u.additions, deletions: u.deletions, files: u.paths.size } : {}) };
    } else if (baseBranch !== null && tip !== '') {
      const counts = parseCounts(await read(`worktree:${w.path}:counts`, ['rev-list', '--left-right', '--count', `${baseBranch}...${tip}`]));
      const committedText = await read(`worktree:${w.path}:numstat`, ['diff', '--numstat', '--no-renames', '-z', `${baseBranch}...${tip}`]);
      const committed = committedText === null ? null : parseNumstat(committedText);
      row = { ...row, ...(counts ?? {}) };
      if (committed) {
        // REQ-GIT-107: the active non-base tree adds its own uncommitted work; the files figure is the union of the two path sets.
        const u = isActive ? own : null;
        const files = new Set([...committed.paths, ...(u ? u.paths : [])]);
        row = { ...row, additions: committed.additions + (u?.additions ?? 0), deletions: committed.deletions + (u?.deletions ?? 0), files: files.size };
      }
    }
    worktrees.push(row);
  }

  // The history: 30 from HEAD; the local set is a reachability question to Git (REQ-GIT-108), none when detached or without an upstream.
  const logText = await read('log', ['log', `-${HISTORY_WINDOW}`, '--format=%H%x1f%s%x1f%an%x1f%at']);
  const local = new Set<string>();
  if (upstream !== null && !detached && logText !== null) {
    const set = await read('local-set', ['rev-list', `${upstream}..HEAD`]);
    for (const h of (set ?? '').split(/\r?\n/)) if (h.trim() !== '') local.add(h.trim());
  }
  const nowIso = toIsoUtc(deps.clocks.wall.instant());
  const history: GitCommitRow[] = parseLog(logText ?? '').map((c) => ({ ...c, abbrev: c.hash.slice(0, 8), age: c.at === '' ? '' : ageLabel(nowIso, c.at), local: local.has(c.hash) }));

  return done({
    workspaceRoot, gitAvailable: true, isRepository: true, branch, detached, upstream, ahead, behind,
    uncommitted: own?.changed ?? 0, additions: own?.additions ?? 0, deletions: own?.deletions ?? 0, files: own?.paths.size ?? 0,
    baseBranch, worktrees, history, failed, reads, readMs: 0,
  });
}
