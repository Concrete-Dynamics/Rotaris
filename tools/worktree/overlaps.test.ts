// `pnpm worktree:overlaps` — the report end to end against a scratch repository: real git, every read
// through the tool's own functions, and the JSON its machine form carries.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISABLE_ENV } from '../dev-time/dev-time.mjs';
import { collectOverlaps, parseOverlapsArgs, renderOverlaps, runOverlaps } from './overlaps.mjs';
import { addWorktree, gitOk, removeRepo, scratchRepo, type ScratchRepo } from './scratch.test-support.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'overlaps.mjs');

let repo: ScratchRepo | null = null;
let extra: string | null = null;
/**
 * The report records nothing, but it sits beside wrappers that do (R-075): the capture is switched off for the
 * whole file, so a `measured` step added here later still never appends to the operator's store.
 */
let priorDisable: string | undefined;
beforeEach(() => {
  priorDisable = process.env[DISABLE_ENV];
  process.env[DISABLE_ENV] = '1';
});
afterEach(() => {
  if (priorDisable === undefined) delete process.env[DISABLE_ENV];
  else process.env[DISABLE_ENV] = priorDisable;
  if (repo !== null) {
    removeRepo(repo);
    repo = null;
  }
  if (extra !== null) {
    rmSync(extra, { recursive: true, force: true });
    extra = null;
  }
});

/** The lines a run wrote, log and error together (`error` lines are marked). */
function capture() {
  const lines: string[] = [];
  return {
    lines,
    deps: { log: (line: string) => lines.push(line), error: (line: string) => lines.push(`! ${line}`) },
  };
}

describe('worktree:overlaps', () => {
  it('parses its arguments', () => {
    expect(parseOverlapsArgs([])).toEqual({ json: false, help: false, unknown: [] });
    expect(parseOverlapsArgs(['--json']).json).toBe(true);
    expect(parseOverlapsArgs(['--nope']).unknown).toEqual(['--nope']);
    expect(parseOverlapsArgs(['--help']).help).toBe(true);
  });

  it("reads every branch worktree: its files, origin/main's movement, and what two branches share", () => {
    repo = scratchRepo();
    const wtA = addWorktree(repo, 'feat/a', join(repo.base, 'wt-a'));
    const wtB = addWorktree(repo, 'feat/b', join(repo.base, 'wt-b'));
    repo.commit(wtA, 'a work', { 'shared.txt': 'a\n', 'only-a.txt': 'a\n' });
    repo.commit(wtB, 'b work', { 'shared.txt': 'b\n', 'only-b.txt': 'b\n' });
    writeFileSync(join(wtA, 'notes.md'), 'n\n'); // untracked, and still a file this work touches
    repo.commit(repo.primary, 'main moved', { 'shared.txt': 'm\n', 'main-only.txt': 'm\n' });
    repo.push(repo.primary);

    const report = collectOverlaps(repo.primary);
    if (report === null) throw new Error('no report');
    expect(report.branches.map((branch) => branch.branch)).toEqual(['feat/a', 'feat/b']);
    const a = report.branches[0];
    const b = report.branches[1];
    expect(a?.fork).toBe(repo.sha('main^'));
    expect(a?.files).toEqual(['notes.md', 'only-a.txt', 'shared.txt']);
    expect(a?.movedSinceFork).toEqual(['main-only.txt', 'shared.txt']);
    expect(a?.sharedWithMain).toEqual(['shared.txt']);
    expect(b?.files).toEqual(['only-b.txt', 'shared.txt']);
    expect(b?.sharedWithMain).toEqual(['shared.txt']);
    expect(report.sharedFiles).toEqual([{ file: 'shared.txt', branches: ['feat/a', 'feat/b'] }]);

    const text = renderOverlaps(report).join('\n');
    expect(text).toContain('2 branch worktrees beside origin/main');
    expect(text).toContain('touched by two or more branches:');
    expect(text).toContain('shared.txt — feat/a, feat/b');
    expect(text).toContain('origin/main moved since the fork, in files a branch touches:');
    expect(text).toContain('shared.txt — feat/a (fork');
  });

  it('prints the report, and --json prints the same report as one object', () => {
    repo = scratchRepo();
    const wt = addWorktree(repo, 'feat/solo', join(repo.base, 'wt-solo'));
    repo.commit(wt, 'solo work', { 'only.txt': '1\n' });

    const first = capture();
    expect(runOverlaps({ argv: [], cwd: repo.primary, deps: first.deps })).toBe(0);
    expect(first.lines.join('\n')).toContain('nothing shared');

    const second = capture();
    expect(runOverlaps({ argv: ['--json'], cwd: repo.primary, deps: second.deps })).toBe(0);
    const payload = JSON.parse(second.lines.join('\n')) as {
      branches: Array<{ branch: string, files: string[] }>;
      sharedFiles: unknown[];
    };
    expect(payload.branches.map((branch) => branch.branch)).toEqual(['feat/solo']);
    expect(payload.branches[0]?.files).toEqual(['only.txt']);
    expect(payload.sharedFiles).toEqual([]);
  });

  it('lists no branch for the primary checkout on main, and none for a detached tree', () => {
    repo = scratchRepo();
    addWorktree(repo, 'feat/a', join(repo.base, 'wt-a'));
    gitOk(repo.primary, 'worktree', 'add', '--detach', join(repo.base, 'detached'), 'main');
    const report = collectOverlaps(repo.primary);
    if (report === null) throw new Error('no report');
    expect(report.branches.map((branch) => branch.branch)).toEqual(['feat/a']);
    expect(renderOverlaps(report).join('\n')).not.toContain('detached');
  });

  it('names a branch whose history shares no fork with origin/main', () => {
    repo = scratchRepo();
    const dir = join(repo.base, 'orphan');
    gitOk(repo.primary, 'worktree', 'add', '-b', 'placeholder', dir, 'main');
    gitOk(dir, 'switch', '--orphan', 'orphan');
    repo.commit(dir, 'orphan root', { 'z.txt': 'z\n' });
    const report = collectOverlaps(repo.primary);
    if (report === null) throw new Error('no report');
    expect(report.branches.map((branch) => branch.branch)).toEqual(['orphan']);
    expect(report.branches[0]?.fork).toBeNull();
    expect(renderOverlaps(report).join('\n')).toContain('no fork point with origin/main');
  });

  it('refuses outside a repository, without origin, and with origin/main unresolved', () => {
    extra = mkdtempSync(join(tmpdir(), 'worktree-overlaps-'));
    const outside = capture();
    expect(runOverlaps({ argv: [], cwd: extra, deps: outside.deps })).toBe(1);
    expect(outside.lines.join('\n')).toContain('not inside a git repository');

    repo = scratchRepo();
    gitOk(repo.primary, 'update-ref', '-d', 'refs/remotes/origin/main');
    const unresolved = capture();
    expect(runOverlaps({ argv: [], cwd: repo.primary, deps: unresolved.deps })).toBe(1);
    expect(unresolved.lines.join('\n')).toContain('origin/main does not resolve');

    gitOk(repo.primary, 'remote', 'remove', 'origin');
    const noOrigin = capture();
    expect(runOverlaps({ argv: [], cwd: repo.primary, deps: noOrigin.deps })).toBe(1);
    expect(noOrigin.lines.join('\n')).toContain('needs an `origin` remote');

    const usage = capture();
    expect(runOverlaps({ argv: ['--nope'], cwd: repo.primary, deps: usage.deps })).toBe(2);
  });

  it('answers --help through the script itself', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pnpm worktree:overlaps');
  });
});
