import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { millis } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { countStatus, gitEnvironment, invokeGit, isNetworkSubcommand, readRepository, renderGitCommand } from '../index.js';

/**
 * ADR-0038's first execution (Part M, the repository card): the one helper — the environment scrub of REQ-GIT-031,
 * the network refusal of REQ-GIT-001, the rendering of REQ-GIT-033 — and the five reads of REQ-MONITOR-168 against a
 * repository this test creates. Whether Git exists is asked of Git (REQ-GIT-103).
 */
const clocks = nodeClocks();
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }

describe('ADR-0038 the git invocation helper', () => {
  it('REQ-GIT-031: deletes the fourteen named variables from a copy and passes everything else through', () => {
    const env = { PATH: 'p', HOME: 'h', GIT_DIR: 'x', GIT_INDEX_FILE: 'y', GIT_CONFIG_NOSYSTEM: '1', LANG: 'C', EMPTY: undefined };
    const scrubbed = gitEnvironment(env);
    expect(scrubbed).toEqual({ PATH: 'p', HOME: 'h', LANG: 'C' });
    expect(env.GIT_DIR).toBe('x');
  });
  it('REQ-GIT-001 / REQ-GIT-033: a network subcommand is refused before anything spawns; the rendering is the vector joined by single spaces', async () => {
    expect(isNetworkSubcommand(['push', 'origin', 'main'])).toBe(true);
    expect(isNetworkSubcommand(['--no-pager', 'fetch'])).toBe(true);
    expect(isNetworkSubcommand(['status', '--porcelain'])).toBe(false);
    const r = await invokeGit({ args: ['push', 'origin', 'main'], workspaceRoot: '.', timeoutMs: millis(1_000), timers: clocks.timers, clock: clocks.monotonic });
    expect(r.outcome).toBe('refused');
    expect(renderGitCommand(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])).toBe('rev-list --left-right --count origin/main...HEAD');
    expect(renderGitCommand(['commit', '-m', 'a message with spaces'])).toBe('commit -m a message with spaces');
  });
  it('a missing executable is "cannot start", never a throw', async () => {
    const r = await invokeGit({ args: ['--version'], workspaceRoot: '.', timeoutMs: millis(5_000), timers: clocks.timers, clock: clocks.monotonic, executable: join(tmpdir(), 'no-such-git-binary-rotaris') });
    expect(r.outcome).toBe('cannot-start');
  });
  it('REQ-MONITOR-168: the porcelain count — touched files, and those with an index or work-tree change', () => {
    expect(countStatus('')).toEqual({ touched: 0, uncommitted: 0 });
    expect(countStatus(' M a.txt\n?? b.txt\nA  c.txt\nMM d.txt\n')).toEqual({ touched: 4, uncommitted: 3 });
  });
});

describe.skipIf(!gitPresent)('ADR-0038 the repository reads against a repository this test creates', () => {
  let ws: string;
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'rotaris-git-')); });
  afterEach(() => { rmSync(ws, { recursive: true, force: true }); });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ws, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'r', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'r', GIT_COMMITTER_EMAIL: 'r@x' } });

  it('reads branch, base, counts and the working tree; a non-repository and a missing git each end in a state', async () => {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(ws, 'README.md'), '# x\n');
    git('add', 'README.md');
    git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
    writeFileSync(join(ws, 'NOTES.md'), 'new\n');
    const state = await readRepository(ws, { clocks });
    expect(state).toMatchObject({ gitAvailable: true, isRepository: true, branch: 'main', base: null, ahead: 0, behind: 0, touched: 1, uncommitted: 0, failed: [] });
    expect(state.readMs).toBeGreaterThanOrEqual(0);
    // REQ-GIT-103: not a repository, decided by Git
    const plain = mkdtempSync(join(tmpdir(), 'rotaris-plain-'));
    try {
      const none = await readRepository(plain, { clocks });
      expect(none).toMatchObject({ gitAvailable: true, isRepository: false, branch: null, touched: 0 });
      expect(none.failed).toEqual(['is-inside-work-tree']);
    } finally { rmSync(plain, { recursive: true, force: true }); }
    // no git at all: every value empty, the version read named as failed, no throw
    const missing = await readRepository(ws, { clocks, executable: join(tmpdir(), 'no-such-git-binary-rotaris') });
    expect(missing).toMatchObject({ gitAvailable: false, isRepository: false, failed: ['version'] });
  });
});
