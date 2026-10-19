// The heavy steps `pnpm worktree:new` and `pnpm worktree:land` take, gathered as seams: the tests run the
// wrappers end to end against a scratch repository with git real and only these replaced. Each answers
// `{ ok }` (the plan throws), so the wrappers decide and the seams only run and report.
//
// Each step also records itself in the development-time store (R-075): the owner asked for "time spent on setup…
// and repeated rebases", and these are that time wherever a wrapper ran them. The gate and the proof scripts are
// the exception — they record themselves through `tools/dev-time/` (the wrapped `pnpm check`, the harness
// libraries a proof imports), so measuring them here would count the same span twice.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VIA_ENV, recordSpan } from '../dev-time/dev-time.mjs';
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

/**
 * Time one step and record it (R-075). A store that cannot be written never fails a step: the write is attempted
 * after the step ran, its result passed through untouched, and a step that threw is recorded as failed before it
 * is rethrown.
 * @template T
 * @param {{ kind: string, label: string, command?: string | null, cwd?: string, via?: string | null }} span
 * @param {() => T} step
 * @returns {T}
 */
export function measured(span, step) {
  const began = Date.now();
  /** @type {unknown} */
  let failure = null;
  /** @type {T | undefined} */
  let result;
  try {
    result = step();
  } catch (error) {
    failure = error;
  }
  const status = /** @type {{ status?: number } | undefined} */ (result)?.status;
  recordSpan({
    kind: span.kind,
    label: span.label,
    command: span.command ?? null,
    cwd: span.cwd,
    durationMs: Date.now() - began,
    exitCode: typeof status === 'number' ? status : null,
    error: failure === null ? null : failure instanceof Error ? failure.message : String(failure),
    via: span.via ?? null,
  });
  if (failure !== null) throw failure;
  return /** @type {T} */ (result);
}

/** The real steps, on this machine; `via` names the wrapper they run for (`worktree:new`, `worktree:land`). @returns {Deps} */
export function defaultDeps({ via = null } = {}) {
  return {
    log: (line) => process.stdout.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
    setup(dir) {
      const install = measured({ kind: 'setup', label: 'install', command: 'pnpm install --prefer-offline', cwd: dir, via }, () =>
        runPnpm(['install', '--prefer-offline'], { cwd: dir, stdio: 'inherit' }),
      );
      if (install.status !== 0) return { ok: false, step: 'pnpm install --prefer-offline' };
      const electron = measured({ kind: 'setup', label: 'electron', command: 'node node_modules/electron/install.js', cwd: dir, via }, () =>
        run(process.execPath, [join(dir, 'node_modules', 'electron', 'install.js')], { cwd: dir, stdio: 'inherit' }),
      );
      if (electron.status !== 0) return { ok: false, step: "electron's install.js" };
      return { ok: true };
    },
    gate(dir) {
      return { ok: runPnpm(['run', 'check'], { cwd: dir, stdio: 'inherit' }).status === 0 };
    },
    preflight(dir, ids) {
      const command = ids.length > 0 ? `pnpm preflight ${ids.join(' ')}` : 'pnpm preflight';
      const pre = measured({ kind: 'other', label: 'preflight', command, cwd: dir, via }, () =>
        runPnpm(['run', 'preflight', ...ids], { cwd: dir, stdio: 'inherit' }),
      );
      return { ok: pre.status === 0 };
    },
    plan(dir) {
      // verify:plan's own tree, read against the ref the rebase landed on; its git calls get the clean
      // environment too, so a hook's GIT_DIR cannot point it at another repository.
      const r = measured(
        { kind: 'other', label: 'plan', command: 'node tools/verify-plan/plan.mjs --json --base=origin/main', cwd: dir, via },
        () =>
          run(process.execPath, [join(dir, 'tools', 'verify-plan', 'plan.mjs'), '--json', '--base=origin/main'], {
            cwd: dir,
            env: cleanEnv(),
          }),
      );
      if (r.status !== 0) throw new Error(`verify:plan exited ${r.status}: ${(r.stderr || r.stdout).trim()}`);
      return JSON.parse(r.stdout);
    },
    proofs(dir, ids) {
      for (const id of ids) {
        // The proof records itself (its harness arms the clock); `VIA_ENV` says a landing asked for it.
        const env = via === null ? process.env : { ...process.env, [VIA_ENV]: via };
        if (runPnpm(['run', id], { cwd: dir, stdio: 'inherit', env }).status !== 0) return { ok: false, failed: id };
      }
      return { ok: true };
    },
  };
}
