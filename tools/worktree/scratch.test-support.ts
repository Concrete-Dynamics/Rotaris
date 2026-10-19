// `tools/worktree/`'s tests' own fixture: a scratch repository (a bare origin, a primary clone) in a temporary
// directory, the git runs both wrappers make, and the heavy steps stubbed. Nothing here touches this repository,
// and no product module imports it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REDIRECTING } from '../build-id/build-id.mjs';
import { electronBinary, type Deps } from './steps.mjs';

/** The fixture's git runs without the variables an enclosing git process sets (a hook running `pnpm check`). */
const ENV: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !REDIRECTING.includes(key)));

export interface GitOut {
  status: number;
  stdout: string;
  stderr: string;
}

/** `git -C cwd …` in the fixture. */
export function gitIn(cwd: string, ...args: string[]): GitOut {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ENV });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The same, failing loudly when git does not. */
export function gitOk(cwd: string, ...args: string[]): string {
  const r = gitIn(cwd, ...args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

export interface ScratchRepo {
  /** The scratch root; `origin` and `primary` live under it. */
  base: string;
  /** The bare repository every push goes to. */
  origin: string;
  /** The primary checkout, cloned from `origin` and standing on `main`. */
  primary: string;
  git: typeof gitIn;
  /** Write files, `git add -A` and commit; answers the new head. */
  commit(cwd: string, message: string, files: Record<string, string>): string;
  /** `git push origin main`. */
  push(cwd: string): void;
  /** A ref, read from the bare origin. */
  sha(ref: string): string;
  /** Commit subjects, newest first, read from the bare origin. */
  subjects(ref: string): string[];
}

/** A bare origin and a primary checkout on `main`, holding one commit (`fixture`, `a.txt`). */
export function scratchRepo(): ScratchRepo {
  const base = mkdtempSync(join(tmpdir(), 'worktree-tools-'));
  const origin = join(base, 'origin.git');
  const primary = join(base, 'primary');
  gitOk(base, 'init', '--bare', '--initial-branch=main', origin);
  gitOk(base, 'clone', origin, primary);
  const settings: Array<[string, string]> = [
    ['user.name', 'Fixture'],
    ['user.email', 'fixture@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false'],
  ];
  for (const [key, value] of settings) gitOk(primary, 'config', key, value);
  const repo: ScratchRepo = {
    base,
    origin,
    primary,
    git: gitIn,
    commit(cwd, message, files) {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(dirname(join(cwd, rel)), { recursive: true });
        writeFileSync(join(cwd, rel), text);
      }
      gitOk(cwd, 'add', '-A');
      gitOk(cwd, 'commit', '-q', '-m', message);
      return gitOk(cwd, 'rev-parse', 'HEAD');
    },
    push(cwd) {
      gitOk(cwd, 'push', '-q', 'origin', 'main');
    },
    sha(ref) {
      return gitOk(origin, 'rev-parse', ref);
    },
    subjects(ref) {
      return gitOk(origin, 'log', '--format=%s', ref).split('\n');
    },
  };
  repo.commit(primary, 'fixture', { 'a.txt': 'one\ntwo\nthree\n' });
  repo.push(primary);
  return repo;
}

/** A branch in a worktree of its own, cut from `main`. */
export function addWorktree(repo: ScratchRepo, branch: string, dir: string): string {
  gitOk(repo.primary, 'worktree', 'add', '-b', branch, dir, 'main');
  return dir;
}

/** Remove a scratch repository, worktrees and all. */
export function removeRepo(repo: ScratchRepo): void {
  rmSync(repo.base, { recursive: true, force: true });
}

export interface TestCalls {
  setup: string[];
  gate: string[];
  preflight: Array<[string, string[]]>;
  plan: string[];
  proofs: Array<[string, string[]]>;
}

/** The heavy steps stubbed: each one is recorded and succeeds, and `setup` leaves the electron marker so
 * `needsSetup` reads false on a second call — which is how the tests see the landing tree being reused. */
export function testDeps(overrides: Partial<Deps> = {}): { deps: Deps; calls: TestCalls; log: string[] } {
  const calls: TestCalls = { setup: [], gate: [], preflight: [], plan: [], proofs: [] };
  const log: string[] = [];
  const base: Deps = {
    log: (line) => {
      log.push(line);
    },
    error: (line) => {
      log.push(`! ${line}`);
    },
    setup: (dir) => {
      calls.setup.push(dir);
      mkdirSync(join(dir, 'node_modules', 'electron', 'dist'), { recursive: true });
      writeFileSync(electronBinary(dir), '');
      return { ok: true };
    },
    gate: (dir) => {
      calls.gate.push(dir);
      return { ok: true };
    },
    preflight: (dir, ids) => {
      calls.preflight.push([dir, ids]);
      return { ok: true };
    },
    plan: (dir) => {
      calls.plan.push(dir);
      return { proofs: [], review: [] };
    },
    proofs: (dir, ids) => {
      calls.proofs.push([dir, ids]);
      return { ok: true };
    },
  };
  return { deps: { ...base, ...overrides }, calls, log };
}
