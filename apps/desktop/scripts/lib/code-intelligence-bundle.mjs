import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { INITIALIZATION_TASK_ID } from './initialization-marker.mjs';

/**
 * The bundled code-intelligence runtime as a precondition of a proof whose subject is project setup itself.
 *
 * `code-intelligence-setup` runs that runtime (`apps/desktop/resources/code-intelligence/`), which git ignores and only
 * `pnpm code-intel:bundle` builds. Without it the setup's `create` exits 127, the task records nothing
 * (REQ-WORKSPACE-084: a failure leaves it pending), and the product says why in its own log. A proof that expects the
 * task to be recorded completed (REQ-WORKSPACE-083/088) then reports "the background task recorded nothing", which names
 * the workspace file's writer when the cause is the build tree
 * (`docs/defects/fixed/init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md`).
 *
 * So the proof checks the tree first (`bundle.mjs --check`), builds it when the proof builds, refuses at once naming
 * `pnpm code-intel:bundle` when it does not, and quotes the app's own setup failure when the marker is still not written.
 */
const APP = resolve(import.meta.dirname, '..', '..');
export const BUNDLE_SCRIPT = join(APP, 'scripts', 'code-intelligence', 'bundle.mjs');

/** `bundle.mjs` run by this Node, with its arguments; the outcome as `{ status, output }`. */
export function runBundleScript(args, timeoutMs) {
  const r = spawnSync(process.execPath, [BUNDLE_SCRIPT, ...args], { encoding: 'utf8', windowsHide: true, timeout: timeoutMs });
  return { status: r.status ?? (r.signal ? `signal ${r.signal}` : r.error?.message ?? 'unknown'), output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

const tail = (text) => String(text ?? '').trim().split('\n').slice(-6).join('\n');

/**
 * Makes the bundle present before any launch. `check()` and `build()` answer `{ status, output }` (status 0 = success).
 * With `skipBuild` nothing is built: an absent or stale tree refuses at once, naming the command that builds it.
 * Answers what was done: `'present'` or `'built'`.
 */
export function ensureBundle({ skipBuild, check = () => runBundleScript(['--check'], 60_000), build = () => runBundleScript([], 900_000) }) {
  const first = check();
  if (first.status === 0) return 'present';
  if (skipBuild) {
    throw new Error(`the bundled code-intelligence runtime is absent or stale, and --skip-build builds nothing: run pnpm code-intel:bundle first. `
      + `Without it code-intelligence-setup fails and records nothing (REQ-WORKSPACE-084), so every scenario that expects it recorded would fail on a cause outside this proof.\n${tail(first.output)}`);
  }
  const built = build();
  if (built.status !== 0) throw new Error(`the code-intelligence bundle step (pnpm code-intel:bundle) exited ${built.status}:\n${tail(built.output)}`);
  const again = check();
  if (again.status !== 0) throw new Error(`the code-intelligence bundle step succeeded but bundle.mjs --check still refuses:\n${tail(again.output)}`);
  return 'built';
}

/**
 * The app log's own account of a failed setup task: the coordinator's `initialization: <id> → failure — …` line and the
 * runtime launcher's "not present in this installation" line, each without the log's prefix. `null` when neither is there.
 */
export function setupFailureOf(log, taskId = INITIALIZATION_TASK_ID) {
  const failure = new RegExp(`initialization: ${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → failure\\b.*`);
  const absent = /rotaris: the bundled code-intelligence runtime is not present in this installation.*/;
  const lines = [];
  for (const line of String(log ?? '').split('\n')) {
    const m = failure.exec(line) ?? absent.exec(line);
    if (m) lines.push(m[0].trim());
  }
  return lines.length === 0 ? null : lines.join('\n');
}

/** `message`, with the app log's setup failure quoted after it when the log holds one. */
export function withSetupFailure(message, log, taskId = INITIALIZATION_TASK_ID) {
  const failure = setupFailureOf(log, taskId);
  return failure === null ? message : `${message}\nthe app logged why ${taskId} failed:\n${failure}`;
}
