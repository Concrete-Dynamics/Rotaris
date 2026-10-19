// `pnpm worktree:land` — the landing sequence end to end against a scratch repository: real git, the heavy
// steps stubbed, and the remote inspected after every case.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISABLE_ENV, HOME_ENV, readRecords } from '../dev-time/dev-time.mjs';
import { slugFor } from './git.mjs';
import { parseLandArgs, runLand } from './land.mjs';
import { addWorktree, gitOk, removeRepo, scratchRepo, testDeps, type ScratchRepo } from './scratch.test-support.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'land.mjs');

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

describe('worktree:land', () => {
  it('parses its arguments', () => {
    expect(parseLandArgs([])).toEqual({
      skipProofs: false,
      reviewed: false,
      keep: false,
      maxAttempts: null,
      worktree: null,
      help: false,
      unknown: [],
    });
    expect(parseLandArgs(['--skip-proofs', '--reviewed', '--keep'])).toMatchObject({
      skipProofs: true,
      reviewed: true,
      keep: true,
    });
    expect(parseLandArgs(['--max-attempts=5']).maxAttempts).toBe(5);
    expect(parseLandArgs(['--max-attempts', '2']).maxAttempts).toBe(2);
    expect(parseLandArgs(['--worktree=/x/y']).worktree).toBe('/x/y');
    expect(parseLandArgs(['--worktree', 'rel']).worktree).toBe('rel');
    expect(parseLandArgs(['--max-attempts']).unknown).toEqual(['--max-attempts (missing value)']);
    expect(parseLandArgs(['--worktree=']).unknown).toEqual(['--worktree (missing value)']);
    expect(parseLandArgs(['--nope']).unknown).toEqual(['--nope']);
    expect(parseLandArgs(['--help']).help).toBe(true);
  });

  it('stops with a usage code on a malformed invocation', () => {
    const { deps } = testDeps();
    expect(runLand({ argv: ['--max-attempts=0'], cwd: process.cwd(), deps })).toBe(2);
    expect(runLand({ argv: ['--max-attempts=x'], cwd: process.cwd(), deps })).toBe(2);
    expect(runLand({ argv: ['--nope'], cwd: process.cwd(), deps })).toBe(2);
  });

  it('rebases onto origin/main, gates the rebased head, pushes fast-forward and cleans up', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    repo.commit(repo.primary, 'main moved', { 'a.txt': 'one\ntwo\nthree\nfour\n' });
    repo.push(repo.primary);
    const landDir = join(repo.base, `primary-wt-${slugFor('feat/x')}-land`);
    const { deps, calls, log } = testDeps();
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
    expect(repo.subjects('main')).toEqual(['the branch work', 'main moved', 'fixture']);
    expect(repo.git(repo.origin, 'show', 'main:b.txt').stdout).toBe('b\n');
    expect(repo.git(repo.origin, 'show', 'main:a.txt').stdout).toBe('one\ntwo\nthree\nfour\n');
    expect(calls.setup).toEqual([landDir]);
    expect(calls.plan).toEqual([landDir]);
    expect(calls.gate).toEqual([landDir]);
    expect(calls.preflight).toEqual([]);
    expect(calls.proofs).toEqual([]);
    const tip = repo.sha('main');
    const text = log.join('\n');
    expect(text).toContain(`pnpm check on ${tip.slice(0, 7)}`);
    expect(text).toContain(`the gate is green on ${tip.slice(0, 7)}`);
    expect(text).toContain(`landed ${tip.slice(0, 7)} on origin/main`);
    expect(text).not.toContain('also moved since fork');
    expect(existsSync(tree)).toBe(false);
    expect(existsSync(landDir)).toBe(false);
    expect(repo.git(repo.primary, 'branch', '--list', 'feat/x').stdout.trim()).toBe('');
    expect(repo.git(repo.primary, 'log', '--format=%s', '-1').stdout.trim()).toBe('main moved');
  });

  it('names the files origin/main and the branch both changed, before the rebase', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/overlap', tree);
    repo.commit(tree, 'the branch work', { 'a.txt': 'ONE\ntwo\nthree\n' });
    repo.commit(repo.primary, 'main moved', { 'a.txt': 'one\ntwo\nTHREE\n' });
    repo.push(repo.primary);
    const { deps, log } = testDeps();
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
    const text = log.join('\n');
    expect(text).toContain('origin/main also moved since fork');
    expect(text).toContain('a.txt');
    expect(text.indexOf('origin/main also moved since fork')).toBeLessThan(text.indexOf('rebase onto origin/main'));
    expect(repo.subjects('main')).toEqual(['the branch work', 'main moved', 'fixture']);
    expect(repo.git(repo.origin, 'show', 'main:a.txt').stdout).toBe('ONE\ntwo\nTHREE\n');
  });

  it('removes the branch and its worktree when HEAD is already on origin/main', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(repo.primary, 'main moved', { 'c.txt': 'c\n' });
    repo.push(repo.primary);
    const { deps, calls, log } = testDeps();
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
    expect(log.join('\n')).toContain('already on origin/main');
    expect(calls.gate).toEqual([]);
    expect(calls.plan).toEqual([]);
    expect(existsSync(tree)).toBe(false);
    expect(repo.git(repo.primary, 'branch', '--list', 'feat/x').stdout.trim()).toBe('');
    expect(repo.subjects('main')).toEqual(['main moved', 'fixture']);
  });

  it('refuses a branch tree with uncommitted changes, before any fetch or gate', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    writeFileSync(join(tree, 'scratch.txt'), 'x\n');
    const { deps, calls, log } = testDeps();
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    expect(log.join('\n')).toContain('uncommitted changes');
    expect(log.join('\n')).toContain('scratch.txt');
    expect(calls.gate).toEqual([]);
    expect(existsSync(tree)).toBe(true);
    expect(repo.subjects('main')).toEqual(['fixture']);
  });

  it('aborts a conflicting rebase and hands back, nothing rebased', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'fix/conflict', tree);
    repo.commit(tree, 'their line', { 'a.txt': 'one\nTWO\nthree\n' });
    const before = repo.git(tree, 'rev-parse', 'HEAD').stdout.trim();
    repo.commit(repo.primary, 'our line', { 'a.txt': 'one\nALSO\nthree\n' });
    repo.push(repo.primary);
    const { deps, calls, log } = testDeps();
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    const text = log.join('\n');
    expect(text).toContain('a.txt');
    expect(text).toContain('conflicts — aborted');
    expect(repo.git(tree, 'rev-parse', 'HEAD').stdout.trim()).toBe(before);
    expect(repo.git(tree, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('fix/conflict');
    expect(repo.git(tree, 'status', '--porcelain').stdout.trim()).toBe('');
    expect(calls.gate).toEqual([]);
    expect(calls.plan).toEqual([]);
    expect(existsSync(join(repo.base, `primary-wt-${slugFor('fix/conflict')}-land`))).toBe(false);
    expect(repo.subjects('main')).toEqual(['our line', 'fixture']);
  });

  it('re-rebases and gates again when origin/main moves under the push', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/race', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    repo.commit(repo.primary, 'main moved', { 'a.txt': 'one\ntwo\nthree\nfour\n' });
    repo.push(repo.primary);
    const scratch = repo;
    const gateCalls: string[] = [];
    const { deps, calls, log } = testDeps({
      gate: (dir) => {
        gateCalls.push(dir);
        if (gateCalls.length === 1) {
          scratch.commit(scratch.primary, 'the race commit', { 'c.txt': 'c\n' });
          scratch.push(scratch.primary);
        }
        return { ok: true };
      },
    });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
    expect(gateCalls).toHaveLength(2);
    expect(repo.subjects('main')).toEqual(['the branch work', 'the race commit', 'main moved', 'fixture']);
    expect(log.join('\n')).toContain('origin/main moved under the push');
    expect(calls.setup).toHaveLength(1);
    expect(existsSync(tree)).toBe(false);
  });

  it('stops when origin/main moved under every permitted attempt', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/race', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const scratch = repo;
    const gateCalls: string[] = [];
    const { deps, log } = testDeps({
      gate: (dir) => {
        gateCalls.push(dir);
        if (gateCalls.length === 1) {
          scratch.commit(scratch.primary, 'the race commit', { 'c.txt': 'c\n' });
          scratch.push(scratch.primary);
        }
        return { ok: true };
      },
    });
    expect(runLand({ argv: ['--max-attempts=1'], cwd: tree, deps })).toBe(1);
    expect(gateCalls).toHaveLength(1);
    expect(log.join('\n')).toContain('moved under 1 attempt(s)');
    expect(repo.subjects('main')).toEqual(['the race commit', 'fixture']);
    expect(existsSync(tree)).toBe(true);
  });

  it('stops for the explicit review verify:plan asks for, before the gate', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const { deps, calls, log } = testDeps({
      plan: () => ({ proofs: [], review: [{ path: 'package.json', reason: 'workspace scripts or pins' }] }),
    });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    expect(log.join('\n')).toContain('package.json');
    expect(log.join('\n')).toContain('workspace scripts or pins');
    expect(log.join('\n')).toContain('--reviewed');
    expect(calls.gate).toEqual([]);
    expect(repo.subjects('main')).toEqual(['fixture']);
    expect(runLand({ argv: ['--reviewed'], cwd: tree, deps })).toBe(0);
    expect(calls.gate).toHaveLength(1);
    expect(repo.subjects('main')).toEqual(['the branch work', 'fixture']);
  });

  it('runs preflight and the proof suites the plan names, on the rebased head', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/proofs', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const landDir = join(repo.base, `primary-wt-${slugFor('tool/proofs')}-land`);
    const { deps, calls, log } = testDeps({ plan: () => ({ proofs: ['layout-proof'], review: [] }) });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
    expect(calls.preflight).toEqual([[landDir, ['layout-proof']]]);
    expect(calls.proofs).toEqual([[landDir, ['layout-proof']]]);
    expect(log.join('\n')).toContain('verify:plan names layout-proof for this diff');
    expect(repo.subjects('main')).toEqual(['the branch work', 'fixture']);
  });

  it('skips the proofs when --skip-proofs says so, loudly', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/proofs', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const { deps, calls, log } = testDeps({ plan: () => ({ proofs: ['layout-proof'], review: [] }) });
    expect(runLand({ argv: ['--skip-proofs'], cwd: tree, deps })).toBe(0);
    expect(calls.preflight).toEqual([]);
    expect(calls.proofs).toEqual([]);
    expect(log.join('\n')).toContain('have NOT run');
    expect(repo.subjects('main')).toEqual(['the branch work', 'fixture']);
  });

  it('leaves everything unpushed when a proof suite is red', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/proofs', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const landDir = join(repo.base, `primary-wt-${slugFor('tool/proofs')}-land`);
    const { deps, log } = testDeps({
      plan: () => ({ proofs: ['layout-proof'], review: [] }),
      proofs: () => ({ ok: false, failed: 'layout-proof' }),
    });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    expect(log.join('\n')).toContain('layout-proof is red on the rebased head');
    expect(repo.subjects('main')).toEqual(['fixture']);
    expect(existsSync(tree)).toBe(true);
    expect(existsSync(landDir)).toBe(true);
  });

  it('stops on a red gate on the rebased head, with nothing pushed', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const { deps, log } = testDeps({ gate: () => ({ ok: false }) });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    expect(log.join('\n')).toContain('gate is red on the rebased head');
    expect(repo.subjects('main')).toEqual(['fixture']);
    expect(existsSync(tree)).toBe(true);
  });

  it('stops when the verification plan cannot be read', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const { deps, calls, log } = testDeps({
      plan: () => {
        throw new Error('verify:plan exited 2: origin/main did not resolve');
      },
    });
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    expect(log.join('\n')).toContain('verify:plan exited 2');
    expect(calls.gate).toEqual([]);
    expect(repo.subjects('main')).toEqual(['fixture']);
  });

  it('leaves both trees and the branch in place under --keep', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'feat/x', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const landDir = join(repo.base, `primary-wt-${slugFor('feat/x')}-land`);
    const { deps, log } = testDeps();
    expect(runLand({ argv: ['--keep'], cwd: tree, deps })).toBe(0);
    expect(log.join('\n')).toContain('--keep');
    expect(existsSync(tree)).toBe(true);
    expect(existsSync(landDir)).toBe(true);
    expect(repo.git(repo.primary, 'branch', '--list', 'feat/x').stdout.trim()).not.toBe('');
    expect(repo.subjects('main')).toEqual(['the branch work', 'fixture']);
  });

  it('takes --worktree when the command runs from somewhere else', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/elsewhere', tree);
    repo.commit(repo.primary, 'main moved', { 'c.txt': 'c\n' });
    repo.push(repo.primary);
    const { deps, calls } = testDeps();
    expect(runLand({ argv: [`--worktree=${tree}`], cwd: repo.primary, deps })).toBe(0);
    expect(existsSync(tree)).toBe(false);
    expect(calls.gate).toEqual([]);
    expect(repo.git(repo.primary, 'branch', '--list', 'tool/elsewhere').stdout.trim()).toBe('');
  });

  it('refuses a detached head, the landing branch, and a rebase in progress', () => {
    repo = scratchRepo();
    const { deps, log } = testDeps();
    const detached = join(repo.base, 'detached');
    gitOk(repo.primary, 'worktree', 'add', '--detach', detached, 'main');
    expect(runLand({ argv: [], cwd: detached, deps })).toBe(1);
    expect(runLand({ argv: [], cwd: repo.primary, deps })).toBe(1);
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'fix/conflict', tree);
    repo.commit(tree, 'their line', { 'a.txt': 'one\nTWO\nthree\n' });
    repo.commit(repo.primary, 'our line', { 'a.txt': 'one\nALSO\nthree\n' });
    expect(repo.git(tree, 'rebase', 'main').status).not.toBe(0);
    expect(runLand({ argv: [], cwd: tree, deps })).toBe(1);
    repo.git(tree, 'rebase', '--abort');
    const text = log.join('\n');
    expect(text).toContain('HEAD is detached');
    expect(text).toContain("'main' is where landed work lives");
    expect(text).toContain('rebase is in progress');
  });

  it('records its own steps in the development-time store, marked with the wrapper (R-075)', () => {
    repo = scratchRepo();
    const tree = join(repo.base, 'wt');
    addWorktree(repo, 'tool/recorded', tree);
    repo.commit(tree, 'the branch work', { 'b.txt': 'b\n' });
    const store = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-store-'));
    const priorHome = process.env[HOME_ENV];
    process.env[HOME_ENV] = store;
    delete process.env[DISABLE_ENV];
    try {
      const { deps } = testDeps();
      expect(runLand({ argv: [], cwd: tree, deps })).toBe(0);
      const { records } = readRecords(store);
      expect(records.map((record) => `${record.kind}:${record.label}`)).toEqual(['other:fetch', 'rebase:onto-main', 'other:push']);
      expect(records.every((record) => record.via === 'worktree:land')).toBe(true);
      expect(records[0]).toMatchObject({ command: 'git fetch origin main', exitCode: 0 });
      expect(records[1]).toMatchObject({ command: 'git rebase origin/main', exitCode: 0 });
      expect(records[2]).toMatchObject({ command: 'git push origin HEAD:main', exitCode: 0 });
      expect(records[2]?.durationMs).toBeGreaterThanOrEqual(0);
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
    expect(r.stdout).toContain('pnpm worktree:land');
  });
});
