// `pnpm worktree:new` — a branch in a fresh worktree beside the primary checkout, then its setup, end to end
// against a scratch repository with only the heavy steps stubbed.
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNewArgs, runNew } from './new.mjs';
import { removeRepo, scratchRepo, testDeps, type ScratchRepo } from './scratch.test-support.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'new.mjs');

let repo: ScratchRepo | null = null;
afterEach(() => {
  if (repo !== null) {
    removeRepo(repo);
    repo = null;
  }
});

describe('worktree:new', () => {
  it('parses its arguments', () => {
    expect(parseNewArgs([])).toEqual({ branch: null, dir: null, help: false, unknown: [] });
    expect(parseNewArgs(['tool-x', '--dir=../x'])).toEqual({ branch: 'tool-x', dir: '../x', help: false, unknown: [] });
    expect(parseNewArgs(['--dir', '../x', 'tool-x'])).toEqual({ branch: 'tool-x', dir: '../x', help: false, unknown: [] });
    expect(parseNewArgs(['a', 'b']).unknown).toEqual(['b']);
    expect(parseNewArgs(['--nope']).unknown).toEqual(['--nope']);
    expect(parseNewArgs(['--dir=']).unknown).toEqual(['--dir (missing value)']);
    expect(parseNewArgs(['--help']).help).toBe(true);
  });

  it('creates the branch in a worktree beside the primary, then sets it up and preflights it', () => {
    repo = scratchRepo();
    const { deps, calls, log } = testDeps();
    expect(runNew({ argv: ['tool/x'], cwd: repo.primary, deps })).toBe(0);
    const dir = join(dirname(repo.primary), 'primary-wt-tool-x');
    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(repo.git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('tool/x');
    expect(repo.git(dir, 'rev-parse', 'HEAD').stdout.trim()).toBe(repo.sha('main'));
    expect(calls.setup).toEqual([dir]);
    expect(calls.preflight).toEqual([[dir, []]]);
    expect(log.join('\n')).toContain(`cd ${dir}`);
  });

  it('places the worktree where --dir says', () => {
    repo = scratchRepo();
    const { deps } = testDeps();
    const dir = join(repo.base, 'elsewhere');
    expect(runNew({ argv: ['tool/y', `--dir=${dir}`], cwd: repo.primary, deps })).toBe(0);
    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(repo.git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('tool/y');
  });

  it('refuses what it cannot do, without a fetch or a worktree', () => {
    repo = scratchRepo();
    const { deps, calls, log } = testDeps();
    expect(runNew({ argv: [], cwd: repo.primary, deps })).toBe(2);
    expect(runNew({ argv: ['--nope'], cwd: repo.primary, deps })).toBe(2);
    expect(runNew({ argv: ['main'], cwd: repo.primary, deps })).toBe(1);
    expect(runNew({ argv: ['bad name!'], cwd: repo.primary, deps })).toBe(1);
    repo.git(repo.primary, 'branch', 'taken');
    expect(runNew({ argv: ['taken'], cwd: repo.primary, deps })).toBe(1);
    mkdirSync(join(repo.base, 'primary-wt-free'));
    expect(runNew({ argv: ['free'], cwd: repo.primary, deps })).toBe(1);
    expect(runNew({ argv: ['z'], cwd: repo.base, deps })).toBe(1);
    expect(calls.setup).toEqual([]);
    expect(calls.preflight).toEqual([]);
    const text = log.join('\n');
    expect(text).toContain("branch 'taken' already exists");
    expect(text).toContain('already exists — remove it');
    expect(text).toContain('not inside a git repository');
    expect(text).toContain('is not a valid branch name');
    expect(text).toContain('is where landed work lives');
  });

  it('answers --help through the script itself', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pnpm worktree:new');
  });
});
