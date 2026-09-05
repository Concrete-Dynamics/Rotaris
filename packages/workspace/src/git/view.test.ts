import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeClocks } from '@rotaris/platform';
import { ageLabel, excludedPath, normalisePath, parseLog, parseNumstat, parseStatusPaths, parseWorktreeList, readGitView } from '../index.js';

/**
 * ADR-0038's second execution (Part O): the Git view's reads — the parsers as pure functions, REQ-GIT-003's exclusion,
 * REQ-GIT-105's age ladder, and the whole read against a repository this test creates with a local bare "remote", a
 * linked worktree and work under `.rotaris/` that must count nowhere.
 */
const clocks = nodeClocks();
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }

describe('REQ-GIT-003: the exclusion is on the first component, ASCII-case-insensitive, on the path as named', () => {
  it.each([
    ['.rotaris/worktrees/x/a.txt', true], ['.Rotaris/agents.yaml', true], ['.ROTARIS', true], ['/.rotaris/x', true],
    ['src/.rotaris/x', false], ['rotaris/x', false], ['.rotarisx/y', false], ['a.txt', false], ['', false],
  ])('%s → %s', (path, excluded) => { expect(excludedPath(path)).toBe(excluded); });
});

describe('the parsers are pure functions of Git\'s machine-readable output', () => {
  it('worktree list --porcelain: the main tree first, a detached tree, a bare one', () => {
    const text = 'worktree D:/ws\nHEAD aaaa\nbranch refs/heads/main\n\nworktree D:/ws-feature\nHEAD bbbb\nbranch refs/heads/feature/x\n\nworktree D:/ws-det\nHEAD cccc\ndetached\n\nworktree D:/bare.git\nbare\n\n';
    expect(parseWorktreeList(text)).toEqual([
      { path: 'D:/ws', head: 'aaaa', branch: 'main', bare: false, detached: false },
      { path: 'D:/ws-feature', head: 'bbbb', branch: 'feature/x', bare: false, detached: false },
      { path: 'D:/ws-det', head: 'cccc', branch: null, bare: false, detached: true },
      { path: 'D:/bare.git', head: '', branch: null, bare: true, detached: false },
    ]);
  });
  it('numstat -z: totals and paths under the exclusion; a binary file is a path with no lines', () => {
    const n = parseNumstat(['3\t1\ta.txt', '-\t-\timg.png', '9\t9\t.rotaris/agents.yaml', ''].join('\0'));
    expect(n).toEqual({ additions: 3, deletions: 1, paths: ['a.txt', 'img.png'] });
  });
  it('status --porcelain -z: changed and untracked paths, the exclusion applied to both', () => {
    const s = parseStatusPaths(' M a.txt\0?? b.txt\0A  c.txt\0?? .rotaris/x\0!! ignored.txt\0');
    expect(s).toEqual({ changed: ['a.txt', 'c.txt'], untracked: ['b.txt'] });
  });
  it('log records: hash, subject, author, an ISO instant from the unix seconds', () => {
    const line = ['0123456789abcdef0123456789abcdef01234567', 'first', 'r', '1700000000'].join('\u001f');
    expect(parseLog(`${line}\nnot-a-record\n`)).toEqual([{ hash: '0123456789abcdef0123456789abcdef01234567', subject: 'first', author: 'r', at: '2023-11-14T22:13:20.000Z' }]);
  });
  it('normalises separators and, on win32, case', () => {
    expect(normalisePath('D:\\A\\B\\', 'win32')).toBe('d:/a/b');
    expect(normalisePath('/a/B/', 'linux')).toBe('/a/B');
  });
});

describe('REQ-GIT-105: the relative-age ladder names exactly one unit', () => {
  const now = '2026-09-05T12:00:00.000Z';
  const ago = (seconds: number) => new Date(new Date(now).getTime() - seconds * 1000).toISOString();
  it.each([
    [0, 'just now'], [59, 'just now'], [60, '1 minute ago'], [59 * 60, '59 minutes ago'], [60 * 60, '1 hour ago'], [23 * 3600, '23 hours ago'],
    [24 * 3600, '1 day ago'], [29 * 86400, '29 days ago'], [30 * 86400, '1 month ago'], [11 * 30 * 86400, '11 months ago'], [365 * 86400, '1 year ago'], [2 * 365 * 86400, '2 years ago'],
  ])('%d s → %s', (seconds, label) => { expect(ageLabel(now, ago(seconds))).toBe(label); });
});

describe.skipIf(!gitPresent)('readGitView against a repository this test creates', () => {
  let root: string;
  let ws: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-gitview-')); ws = join(root, 'ws'); mkdirSync(ws); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* a scanner still holds the scratch repository; left to the temp folder */ } });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env }).toString();
  const commit = (cwd: string, message: string) => git(cwd, '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', message);

  it('collects the header, the worktrees with the base tree by common directory, the history with the local flag, all under the exclusion', async () => {
    git(ws, 'init', '-q', '-b', 'main');
    writeFileSync(join(ws, '.gitignore'), '.rotaris/\n');
    writeFileSync(join(ws, 'README.md'), '# x\n');
    git(ws, 'add', '.');
    commit(ws, 'first');
    writeFileSync(join(ws, 'README.md'), '# x\nmore\n');
    git(ws, 'add', '.');
    commit(ws, 'second');
    // A local bare "remote": pushed once, then one more local commit → ahead 1, one local-tinted row (REQ-GIT-108).
    const bare = join(root, 'remote.git');
    git(root, 'clone', '-q', '--bare', ws, bare);
    git(ws, 'remote', 'add', 'origin', bare);
    git(ws, 'push', '-q', '-u', 'origin', 'main');
    writeFileSync(join(ws, 'NEW.md'), 'new\n');
    git(ws, 'add', 'NEW.md');
    commit(ws, 'third (local)');
    // A linked worktree with one commit of its own; the base tree's uncommitted work and untracked paths, some under .rotaris/.
    const wt = join(root, 'feature-x');
    git(ws, 'worktree', 'add', '-q', '-b', 'feature/x', wt, 'HEAD');
    writeFileSync(join(wt, 'FEATURE.md'), 'a\nb\n');
    git(wt, 'add', 'FEATURE.md');
    commit(wt, 'feature commit');
    writeFileSync(join(ws, 'README.md'), '# x\nmore\nchanged\n');
    writeFileSync(join(ws, 'UNTRACKED.md'), 'u\n');
    mkdirSync(join(ws, '.rotaris', 'worktrees'), { recursive: true });
    writeFileSync(join(ws, '.rotaris', 'scratch.txt'), 'excluded\n');

    const state = await readGitView(ws, { clocks });
    expect(state).toMatchObject({ gitAvailable: true, isRepository: true, branch: 'main', detached: false, upstream: 'origin/main', ahead: 1, behind: 0, baseBranch: 'main', failed: [] });
    // The header's own work: README changed (+1 line), UNTRACKED counted as a path with no lines read; .rotaris/ counts nowhere.
    expect(state.uncommitted).toBe(2);
    expect(state.additions).toBe(1);
    expect(state.deletions).toBe(0);
    expect(state.files).toBe(2);
    expect(state.worktrees).toHaveLength(2);
    const base = state.worktrees.find((w) => w.isBase)!;
    const linked = state.worktrees.find((w) => !w.isBase)!;
    expect(base).toMatchObject({ branch: 'main', isActive: true, ahead: 0, behind: 0, additions: 1, deletions: 0, files: 2 });
    expect(linked).toMatchObject({ branch: 'feature/x', isActive: false, ahead: 1, behind: 0, additions: 2, deletions: 0, files: 1 });
    expect(state.history).toHaveLength(3);
    expect(state.history.map((h) => [h.subject, h.local])).toEqual([['third (local)', true], ['second', false], ['first', false]]);
    expect(state.history[0]!.abbrev).toHaveLength(8);
    expect(state.history.every((h) => h.age === 'just now')).toBe(true);
    expect(state.reads).toBeGreaterThanOrEqual(11);
    expect(state.readMs).toBeGreaterThanOrEqual(0);

    // From inside the linked worktree: it is active and not base; the base tree keeps its own figures (REQ-GIT-107).
    const fromLinked = await readGitView(wt, { clocks });
    expect(fromLinked.branch).toBe('feature/x');
    expect(fromLinked.worktrees.find((w) => w.isActive)!.isBase).toBe(false);
    expect(fromLinked.worktrees.find((w) => w.isBase)).toMatchObject({ branch: 'main', additions: 1, files: 2 });
    expect(fromLinked.upstream).toBeNull();
    expect(fromLinked.history.some((h) => h.local)).toBe(false);
  }, 60_000);

  it('a detached base tree gives every non-base figure the empty value, and a commit-less repository shows no log', async () => {
    git(ws, 'init', '-q', '-b', 'main');
    const empty = await readGitView(ws, { clocks });
    expect(empty.isRepository).toBe(true);
    expect(empty.history).toEqual([]);
    expect(empty.failed).toContain('log');
    writeFileSync(join(ws, 'a.txt'), 'a\n');
    git(ws, 'add', '.');
    commit(ws, 'first');
    const wt = join(root, 'linked');
    git(ws, 'worktree', 'add', '-q', '-b', 'side', wt, 'HEAD');
    git(ws, 'checkout', '-q', '--detach');
    const state = await readGitView(ws, { clocks });
    expect(state).toMatchObject({ branch: null, detached: true, baseBranch: null, ahead: 0, behind: 0 });
    const linked = state.worktrees.find((w) => !w.isBase)!;
    expect(linked).toMatchObject({ branch: 'side', ahead: null, behind: null, additions: null, deletions: null, files: null });
    expect(state.worktrees.find((w) => w.isBase)).toMatchObject({ branch: null, ahead: 0, behind: 0, additions: 0, files: 0 });
    expect(state.history).toHaveLength(1);
  }, 60_000);

  it('REQ-GIT-102/103: not a repository and no Git at all each end in a state', async () => {
    const plain = await readGitView(ws, { clocks });
    expect(plain).toMatchObject({ gitAvailable: true, isRepository: false, worktrees: [], history: [] });
    const missing = await readGitView(ws, { clocks, executable: join(tmpdir(), 'no-such-git-binary-rotaris') });
    expect(missing).toMatchObject({ gitAvailable: false, isRepository: false, failed: ['version'], reads: 1 });
  });
});
