import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { millis, type Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { checkAttach, createWorktree, derivedWorktreeDirectory, gitFailureText, isBranchCollision, longPathText, needsForceText, removeWorktree, sessionWorktreePath, validateBranchName } from '../index.js';

/**
 * ADR-0038's first WRITES (Part O): REQ-GIT-009's rules as a table, REQ-GIT-013's failure-text ladder, REQ-GIT-012's
 * one replacement and REQ-GIT-010's three phrases as pure functions; then creation, collision suffixes, removal with
 * Git's own refusal, and the attach check against a scratch repository.
 */
/**
 * REQ-GIT-033's bound reaches Git through ADR-0006's timer port, so a test that wants the bound REACHED fires it
 * rather than racing it. A zero bound is fired at once here; every other delay keeps the real timer. The falsified
 * form, kept: a 1 ms bound, which on a warm filesystem lost the race — Git exited first and the sentence named a
 * LATER invocation than the one the proof is about (found on Linux, 2026-09-16, where the same test had passed on
 * Windows for the same reason in reverse). A bound decided by how fast the host's disk is proves nothing.
 */
function firesZeroAtOnce(real: Clocks): Clocks {
  return {
    monotonic: real.monotonic,
    wall: real.wall,
    timers: {
      after: (delay, fn) => (Number(delay) === 0 ? (queueMicrotask(fn), { cancel: () => undefined }) : real.timers.after(delay, fn)),
      every: (period, fn) => real.timers.every(period, fn),
    },
  };
}
const clocks = nodeClocks();
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }

describe('REQ-GIT-009: the branch-name rules', () => {
  it.each([
    ['feature/short-name', true], ['main', true], ['a.b', true], ['rotaris/session/abc-123', true], ['x@y', true],
    ['', false], ['   ', false], ['@', false], ['-x', false], ['/x', false], ['.x', false], ['x/', false], ['x.', false], ['x.lock', false],
    ['a//b', false], ['a..b', false], ['a@{b', false], ['a\tb', false], ['a~b', false], ['a^b', false], ['a:b', false], ['a?b', false], ['a*b', false], ['a[b', false],
    ['a/.b', false], ['a/b.lock/c', false],
  ])('supplied %j → %s', (value, accepted) => {
    const r = validateBranchName(value, { derived: false });
    expect(r.ok).toBe(accepted);
    if (r.ok) expect(r.name).toBe(value);
    else expect(r.error).toBe(`Invalid Git branch name: ${value}`);
  });
  it('a supplied name is never transformed; a derived one is normalised and created under the transformed name', () => {
    expect(validateBranchName(' a b\\c ', { derived: false })).toMatchObject({ ok: false, error: 'Invalid Git branch name:  a b\\c ' });
    expect(validateBranchName('a b', { derived: false })).toMatchObject({ ok: false, detail: 'contains a space' });
    expect(validateBranchName(' a b\\c ', { derived: true })).toEqual({ ok: true, name: 'a-b/c' });
    expect(validateBranchName('a b..c', { derived: true })).toMatchObject({ ok: false, detail: "contains '..'" });
  });
  it('REQ-GIT-115: the directory derives from the parent of the workspace and the branch with / → -', () => {
    expect(derivedWorktreeDirectory('D:\\Development\\Apps\\ws', 'feature/proof')).toBe('D:\\Development\\Apps\\feature-proof');
    expect(derivedWorktreeDirectory('/home/u/ws/', 'a/b/c')).toBe('/home/u/a-b-c');
  });
});

describe('REQ-GIT-013 / REQ-GIT-012 / REQ-GIT-010 as pure functions of the raw result', () => {
  it('the failure-text ladder: cannot start, stderr, else stdout, else the sentence; a timeout names the rendered command', () => {
    expect(gitFailureText({ outcome: 'cannot-start', reason: 'ENOENT', elapsedMs: 0 }, ['worktree', 'add'])).toBe('Could not run Git: ENOENT');
    expect(gitFailureText({ outcome: 'exited', status: 128, stdout: 'out', stderr: 'fatal: bad\n', elapsedMs: 0 }, [])).toBe('fatal: bad');
    expect(gitFailureText({ outcome: 'exited', status: 1, stdout: 'only out\n', stderr: '', elapsedMs: 0 }, [])).toBe('only out');
    expect(gitFailureText({ outcome: 'exited', status: 1, stdout: '', stderr: '  ', elapsedMs: 0 }, [])).toBe('git command failed');
    expect(gitFailureText({ outcome: 'timed-out', stdout: '', stderr: '', elapsedMs: 30_000 }, ['worktree', 'add', '-b', 'x', 'D:/p', 'HEAD'])).toBe('Git timed out after 30s: worktree add -b x D:/p HEAD');
  });
  it('the long-path replacement matches three phrases case-insensitively and reproduces the complete text on line 2', () => {
    const detail = "error: unable to create file some/very/long/name: Filename too long\nfatal: could not create worktree";
    const text = longPathText('D:\\ws', detail);
    expect(text).not.toBeNull();
    const lines = text!.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('move the workspace somewhere shorter than D:\\ws');
    expect(lines[0]).toContain('git config --global core.longpaths true');
    expect(`${lines[1]}\n${lines[2]}`).toBe(`Git reported: ${detail}`);
    expect(longPathText('D:\\ws', 'FILE NAME TOO LONG')).not.toBeNull();
    expect(longPathText('D:\\ws', 'The filename or extension is too long.')).not.toBeNull();
    expect(longPathText('D:\\ws', 'fatal: a branch named x already exists')).toBeNull();
  });
  it('exactly the three collision phrases count, case-insensitively', () => {
    expect(isBranchCollision("fatal: a branch named 'x' already exists")).toBe(true);
    expect(isBranchCollision("fatal: 'x' is Already Checked Out at 'D:/p'")).toBe(true);
    expect(isBranchCollision("fatal: 'x' is already used by worktree at 'D:/p'")).toBe(true);
    expect(isBranchCollision("fatal: 'D:/p' already exists")).toBe(false);
    expect(isBranchCollision('Filename too long')).toBe(false);
  });
  it('REQ-GIT-005: the storage subpath stays inside .rotaris', () => {
    expect(sessionWorktreePath('D:\\ws', undefined, 'sid')).toEqual({ ok: true, value: resolve('D:\\ws', '.rotaris', 'worktrees', 'sid') });
    expect(sessionWorktreePath('D:\\ws', 'trees/here', 'sid')).toEqual({ ok: true, value: resolve('D:\\ws', '.rotaris', 'trees', 'here', 'sid') });
    for (const bad of ['../x', 'a/../../x', 'D:\\elsewhere', '/abs']) expect(sessionWorktreePath('D:\\ws', bad, 'sid')).toEqual({ ok: false, error: 'Worktree storage path must stay inside .rotaris.' });
  });
});

describe.skipIf(!gitPresent)('the writes against a repository this test creates', () => {
  let root: string;
  let ws: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-wt-')); ws = join(root, 'ws'); mkdirSync(ws); });
  // Windows may hold a just-written repository open for a moment (an indexer or scanner): the removal retries, and a
  // scratch directory that still refuses is left to the temp folder rather than failing the test it did not test.
  afterEach(() => { try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* scratch left behind */ } });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
  const seed = () => {
    git(ws, 'init', '-q', '-b', 'main');
    writeFileSync(join(ws, '.gitignore'), '.rotaris/\n');
    writeFileSync(join(ws, 'README.md'), '# x\n');
    git(ws, 'add', '.');
    git(ws, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  };

  it('creates a session worktree under .rotaris, suffixes on a collision, refuses an existing path and every REQ-GIT-006 state', async () => {
    seed();
    const deps = { clocks };
    const head = git(ws, 'rev-parse', 'HEAD');
    const first = sessionWorktreePath(ws, undefined, 'sid-1');
    expect(first.ok).toBe(true);
    const created = await createWorktree({ root: ws, branch: 'rotaris/session/sid-1', path: first.ok ? first.value : '', collisionSafe: true, route: 'session' }, deps);
    expect(created).toEqual({ ok: true, value: { path: first.ok ? first.value : '', branch: 'rotaris/session/sid-1', baseBranch: 'main', baseRevision: head } });
    expect(existsSync(join(ws, '.rotaris', 'worktrees', 'sid-1', 'README.md'))).toBe(true);
    // The base tree stays clean: .rotaris/ is ignored (REQ-GIT-014).
    expect(git(ws, 'status', '--porcelain')).toBe('');
    // REQ-GIT-008: the same path again is refused, no retry under another path.
    const again = await createWorktree({ root: ws, branch: 'rotaris/session/sid-1', path: first.ok ? first.value : '', collisionSafe: true, route: 'session' }, deps);
    expect(again).toEqual({ ok: false, error: `Worktree path already exists: ${first.ok ? first.value : ''}` });
    // REQ-GIT-010: the branch already exists → -2; the phrase is Git's own.
    const second = sessionWorktreePath(ws, undefined, 'sid-2');
    const suffixed = await createWorktree({ root: ws, branch: 'rotaris/session/sid-1', path: second.ok ? second.value : '', collisionSafe: true, route: 'session' }, deps);
    expect(suffixed.ok && suffixed.value.branch).toBe('rotaris/session/sid-1-2');
    // Not collision-safe: the same failure propagates unchanged, with Git's wording (REQ-GIT-013).
    const third = sessionWorktreePath(ws, undefined, 'sid-3');
    const plain = await createWorktree({ root: ws, branch: 'rotaris/session/sid-1', path: third.ok ? third.value : '', collisionSafe: false, route: 'session' }, deps);
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(isBranchCollision(plain.error)).toBe(true);
    // REQ-GIT-006: a subdirectory of the workspace is not the root of its worktree; a detached checkout cannot host.
    mkdirSync(join(ws, 'sub'));
    const sub = await createWorktree({ root: join(ws, 'sub'), branch: 'x', path: join(root, 'x'), collisionSafe: false, route: 'manual' }, deps);
    expect(sub).toEqual({ ok: false, error: 'Workspace must be the root of its Git worktree.' });
    git(ws, 'checkout', '-q', '--detach');
    const detached = await createWorktree({ root: ws, branch: 'y', path: join(root, 'y'), collisionSafe: false, route: 'manual' }, deps);
    expect(detached).toEqual({ ok: false, error: 'Detached HEAD cannot host an isolated session or integration.' });
  }, 60_000);

  it('REQ-GIT-110/111/117: a manual worktree beside the workspace; removal refused by Git for uncommitted work, then forced', async () => {
    seed();
    const deps = { clocks };
    const path = join(root, 'feature-proof');
    const created = await createWorktree({ root: ws, branch: 'feature/proof', path, collisionSafe: false, route: 'manual' }, deps);
    expect(created.ok).toBe(true);
    // REQ-GIT-110: a non-empty existing directory is refused before Git is asked.
    const full = join(root, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'f.txt'), 'x');
    expect(await createWorktree({ root: ws, branch: 'feature/other', path: full, collisionSafe: false, route: 'manual' }, deps)).toEqual({ ok: false, error: `Worktree path is not empty: ${full}` });
    // A file dropped into the tree: Git refuses without --force, with its own phrase.
    writeFileSync(join(path, 'DROPPED.txt'), 'uncommitted\n');
    const refused = await removeWorktree({ root: ws, path, force: false }, deps);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.needsForce).toBe(true);
      // Quoted from Git 2.41 for Windows: "fatal: '<path>' contains modified or untracked files, use --force to delete it".
      expect(needsForceText(refused.error.error)).toBe(true);
      expect(refused.error.error).toMatch(/contains modified or untracked files, use --force to delete it/);
    }
    expect(existsSync(path)).toBe(true);
    const forced = await removeWorktree({ root: ws, path, force: true }, deps);
    expect(forced).toEqual({ ok: true, value: { path } });
    expect(existsSync(path)).toBe(false);
    expect(git(ws, 'worktree', 'list', '--porcelain')).not.toContain('feature-proof');
    // Removing what is not a worktree: any other failure carries Git's wording and needsForce false.
    const none = await removeWorktree({ root: ws, path: join(root, 'nowhere'), force: false }, deps);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.needsForce).toBe(false);
  }, 60_000);

  it('REQ-GIT-011: the attach check — missing, not a directory, foreign repository, and one of this repository', async () => {
    seed();
    const deps = { clocks };
    expect(await checkAttach({ root: ws, path: join(root, 'missing') }, deps)).toEqual({ ok: false, error: `Worktree directory does not exist: ${join(root, 'missing')}` });
    writeFileSync(join(root, 'file.txt'), 'x');
    expect(await checkAttach({ root: ws, path: join(root, 'file.txt') }, deps)).toEqual({ ok: false, error: 'Attached path is not a worktree of this workspace repository.' });
    const foreign = join(root, 'foreign');
    mkdirSync(foreign);
    git(foreign, 'init', '-q', '-b', 'main');
    expect(await checkAttach({ root: ws, path: foreign }, deps)).toEqual({ ok: false, error: 'Attached path is not a worktree of this workspace repository.' });
    const wt = join(root, 'mine');
    git(ws, 'worktree', 'add', '-q', '-b', 'mine', wt, 'HEAD');
    const head = git(ws, 'rev-parse', 'HEAD');
    expect(await checkAttach({ root: ws, path: wt }, deps)).toEqual({ ok: true, value: { path: wt, branch: 'mine', baseBranch: 'main', baseRevision: head } });
  }, 60_000);

  it('REQ-GIT-013: a timed-out invocation reports the fixed sentence with the rendered command', async () => {
    seed();
    // A bound of zero, fired at once through the timer port, abandons the FIRST invocation on every host; the text
    // is the timeout sentence, never Git's partial output.
    const r = await createWorktree({ root: ws, branch: 'slow', path: join(root, 'slow'), collisionSafe: false, route: 'manual' }, { clocks: firesZeroAtOnce(clocks), timeoutMs: millis(0) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Git timed out after 30s: rev-parse --show-toplevel$/);
  });
});
