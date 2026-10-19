// `pnpm worktree:new` — a branch in a fresh worktree beside the primary checkout, then its setup, end to end
// against a scratch repository with only the heavy steps stubbed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISABLE_ENV, HOME_ENV, readRecords } from '../dev-time/dev-time.mjs';
import { parseNewArgs, runNew } from './new.mjs';
import { removeRepo, scratchRepo, testDeps, type ScratchRepo } from './scratch.test-support.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'new.mjs');

let repo: ScratchRepo | null = null;
/**
 * The wrappers run in this process and their steps record themselves (R-075), so the capture is switched off for
 * the whole file — no test may append to the operator's store. The one test that reads records sets its own home.
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

  it('records its own steps in the development-time store (R-075)', () => {
    repo = scratchRepo();
    const store = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-store-'));
    const priorHome = process.env[HOME_ENV];
    process.env[HOME_ENV] = store;
    delete process.env[DISABLE_ENV];
    try {
      const { deps } = testDeps();
      expect(runNew({ argv: ['tool/recorded'], cwd: repo.primary, deps })).toBe(0);
      const { records } = readRecords(store);
      expect(records.map((record) => `${record.kind}:${record.label}`)).toEqual(['other:fetch']);
      expect(records[0]).toMatchObject({ command: 'git fetch origin main', via: 'worktree:new', exitCode: 0 });
    } finally {
      if (priorHome === undefined) delete process.env[HOME_ENV];
      else process.env[HOME_ENV] = priorHome;
      process.env[DISABLE_ENV] = '1'; // the file's guard again; the afterEach restores what the shell had
      rmSync(store, { recursive: true, force: true });
    }
  });

  it('answers --help through the script itself', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pnpm worktree:new');
  });
});
