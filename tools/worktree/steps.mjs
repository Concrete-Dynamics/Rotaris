// The heavy steps `pnpm worktree:new` and `pnpm worktree:land` take, gathered as seams: the tests run the
// wrappers end to end against a scratch repository with git real and only these replaced. Each answers
// `{ ok }` (the plan throws), so the wrappers decide and the seams only run and report.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, runPnpm } from './exec.mjs';
import { cleanEnv } from './git.mjs';

/** Where electron's binary lands inside a worktree's node_modules. @param {string} dir */
export function electronBinary(dir) {
  return process.platform === 'win32'
    ? join(dir, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(dir, 'node_modules', 'electron', 'dist', 'electron');
}

/** True when a tree still needs the two setup steps: no node_modules, or no electron binary in one. @param {string} dir */
export function needsSetup(dir) {
  return !existsSync(join(dir, 'node_modules')) || !existsSync(electronBinary(dir));
}

/**
 * @typedef {Object} StepResult
 * @property {boolean} ok
 * @property {string} [step]
 */

/**
 * @typedef {Object} Deps
 * @property {(line: string) => void} log
 * @property {(line: string) => void} error
 * @property {(dir: string) => StepResult} setup
 * @property {(dir: string) => StepResult} gate
 * @property {(dir: string, ids: string[]) => StepResult} preflight
 * @property {(dir: string) => { proofs: string[], review: Array<{ path: string, reason: string }> }} plan
 * @property {(dir: string, ids: string[]) => StepResult & { failed?: string }} proofs
 */

/** The real steps, on this machine. @returns {Deps} */
export function defaultDeps() {
  return {
    log: (line) => process.stdout.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
    setup(dir) {
      const install = runPnpm(['install', '--prefer-offline'], { cwd: dir, stdio: 'inherit' });
      if (install.status !== 0) return { ok: false, step: 'pnpm install --prefer-offline' };
      const electron = run(process.execPath, [join(dir, 'node_modules', 'electron', 'install.js')], {
        cwd: dir,
        stdio: 'inherit',
      });
      if (electron.status !== 0) return { ok: false, step: "electron's install.js" };
      return { ok: true };
    },
    gate(dir) {
      return { ok: runPnpm(['run', 'check'], { cwd: dir, stdio: 'inherit' }).status === 0 };
    },
    preflight(dir, ids) {
      return { ok: runPnpm(['run', 'preflight', ...ids], { cwd: dir, stdio: 'inherit' }).status === 0 };
    },
    plan(dir) {
      // verify:plan's own tree, read against the ref the rebase landed on; its git calls get the clean
      // environment too, so a hook's GIT_DIR cannot point it at another repository.
      const r = run(process.execPath, [join(dir, 'tools', 'verify-plan', 'plan.mjs'), '--json', '--base=origin/main'], {
        cwd: dir,
        env: cleanEnv(),
      });
      if (r.status !== 0) throw new Error(`verify:plan exited ${r.status}: ${(r.stderr || r.stdout).trim()}`);
      return JSON.parse(r.stdout);
    },
    proofs(dir, ids) {
      for (const id of ids) {
        if (runPnpm(['run', id], { cwd: dir, stdio: 'inherit' }).status !== 0) return { ok: false, failed: id };
      }
      return { ok: true };
    },
  };
}
