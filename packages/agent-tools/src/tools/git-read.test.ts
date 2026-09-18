import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { gitReadTool } from './git-read.js';
import type { ToolContext } from './types.js';

/**
 * REQ-TOOLS-193 (OQ-61): `git_read` answers repository identity for the worktree the run occupies,
 * resolved by reading `HEAD`, loose refs and `packed-refs` through the `gitdir:` pointer — the shape
 * a linked worktree takes, whose metadata lives above the path fence. Real repositories throughout:
 * nothing here can be shown with a fixture, because the pointer file is what is under test.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local',
  GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local',
} as Record<string, string>;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: GIT_ENV }).toString().trim();

/** A repository with one commit on `main`, returning its root and HEAD sha. */
function repo(): { root: string; sha: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-read-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'user.name', 'proof');
  git(root, 'config', 'user.email', 'proof@rotaris.local');
  execFileSync('node', ['-e', 'require("node:fs").writeFileSync("f.txt", "one\\n")'], { cwd: root });
  git(root, 'add', 'f.txt');
  git(root, 'commit', '-q', '-m', 'first');
  return { root, sha: git(root, 'rev-parse', 'HEAD') };
}

const clock = new FakeClock();
const ctx = (): ToolContext => ({ workspaceRoot: '', sessionId: 's', agentName: 'a', persona: 'p', monotonic: clock, wall: clock, signal: new AbortController().signal, warn: () => undefined });

describe('git_read, against real repositories', () => {
  it('resolves HEAD to the commit and the branch in a plain repository', async () => {
    const { root, sha } = repo();
    const r = await gitReadTool(root).execute({ operation: 'head' }, ctx());
    expect(r.isError).toBe(false);
    expect(r.text).toBe(`commit: ${sha}\nbranch: main`);
  });

  it('reads through a linked worktree\'s gitdir pointer file (OQ-61\'s shape)', async () => {
    const { root, sha } = repo();
    const wt = join(root, '..', `git-read-wt-${Date.now()}`);
    git(root, 'worktree', 'add', '-q', wt, '-b', 'wt-branch');
    dirs.push(wt);
    const r = await gitReadTool(wt).execute({ operation: 'head' }, ctx());
    expect(r.isError).toBe(false);
    expect(r.text).toBe(`commit: ${sha}\nbranch: wt-branch`);
    const ref = await gitReadTool(wt).execute({ operation: 'read_ref', ref: 'main' }, ctx());
    expect(ref.isError).toBe(false);
    expect(ref.text).toBe(`ref main is ${sha}.`);
    git(root, 'worktree', 'remove', '--force', wt);
    dirs.pop();
  });

  it('resolves a packed ref once the loose ref is gone', async () => {
    const { root, sha } = repo();
    git(root, 'pack-refs', '--all');
    // `pack-refs` may already have pruned the loose ref; either way only the pack carries it now.
    rmSync(join(root, '.git', 'refs', 'heads', 'main'), { force: true });
    const r = await gitReadTool(root).execute({ operation: 'read_ref', ref: 'main' }, ctx());
    expect(r.isError).toBe(false);
    expect(r.text).toBe(`ref main is ${sha}.`);
  });

  it('names a detached HEAD as detached rather than inventing a branch', async () => {
    const { root, sha } = repo();
    git(root, 'checkout', '-q', '--detach', 'HEAD');
    const r = await gitReadTool(root).execute({ operation: 'head' }, ctx());
    expect(r.isError).toBe(false);
    expect(r.text).toBe(`commit: ${sha}\ndetached: true`);
  });

  it('detects a non-repository up front and refuses unknown refs by name', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'git-read-bare-'));
    dirs.push(bare);
    const { root } = repo();
    expect((await gitReadTool(bare).execute({ operation: 'head' }, ctx())).text).toBe(`Not a git repository: ${bare}.`);
    expect((await gitReadTool(root).execute({ operation: 'read_ref', ref: 'no-such-branch' }, ctx())).text).toBe('Unknown ref: no-such-branch.');
  });

  it('a branch name is never a path: traversal and pointer syntax resolve to nothing', async () => {
    const { root } = repo();
    for (const ref of ['../config', '../../etc/passwd', '..', '/etc/passwd', 'main@{1}', '-b', 'heads/main.lock']) {
      const r = await gitReadTool(root).execute({ operation: 'read_ref', ref }, ctx());
      expect(r.isError).toBe(true);
      expect(r.text).toBe(`Unknown ref: ${ref}.`);
    }
  });

  it('refuses what the whitelist never lists in REQ-TOOLS-193\'s words', async () => {
    const tool = gitReadTool(repo().root);
    expect(tool.validationError!({ operation: 'bogus' }, 'operation: invalid option').text).toMatch(/^Unsupported operation: bogus\./);
    expect(tool.validationError!({}, 'Required').text).toMatch(/requires an operation/);
    expect(tool.validationError!({ operation: 'read_ref' }, 'ref: Required').text).toMatch(/requires a branch name in 'ref'/);
    expect(tool.label!({ operation: 'head' })).toBe('git_read head');
    expect(tool.label!({ operation: 'read_ref', ref: 'main' })).toBe('git_read read_ref main');
    expect(tool.name).toBe('git_read');
  });
});
