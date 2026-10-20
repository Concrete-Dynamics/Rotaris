/**
 * A launch that passes no workspace: the directory it runs in, and the workspace it opened.
 *
 * With no workspace argument and nothing remembered, the app opens its working directory (REQ-SHELL-010 (c),
 * `MainWindows.resolveStartup`). There is no launch with no workspace at all. `settings-proof` ran its four such launches
 * in `apps/desktop`, so each opened the checkout the proof runs in. The background initialization then ran the bundled
 * code-intelligence setup over the product's own source. The capture seam's immediate exit sends the run host no
 * `shutdown`, so the index's serena and pyright processes were still running more than 6 s after the launch
 * (`docs/defects/fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`).
 *
 * `workspace-proof`'s `cold` and `gone` launches and `updater-proof`'s first stage did the same through the driver's
 * `startApp`, which ran every launch in `apps/desktop`; since plan `loc1` they name a directory of their own as its `cwd`
 * (`docs/defects/fixed/workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md`).
 *
 * `emptyWorkingDirectory` makes the directory such a launch runs in: new, empty, and in no git repository. Under the
 * checkout's `.proof/` the harness's git bar (`barEnclosingRepository`) makes that so. `openedWorkspace` reads what the
 * launch opened from its log, so a proof can assert that it opened that directory and nothing else. `setupResidue` names
 * what the code-intelligence setup leaves in a directory it ran in, so a proof can show the checkout gained none.
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REDIRECTING } from '../../../../tools/build-id/build-id.mjs';

/** The git a launch's workspace would see: without an enclosing git process's variables, which would name another tree. */
const gitEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !REDIRECTING.includes(k)));

/**
 * The repository `directory` lies in, as git's own discovery answers it, or `null` when it lies in none. A missing `git`
 * reads as none: the app's own read then finds no repository either.
 */
export function enclosingRepository(directory) {
  const asked = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', env: gitEnvironment() });
  return asked.status === 0 ? asked.stdout.trim() : null;
}

/**
 * `path`, made new and empty, as its real path. It throws when the directory lies in a git repository: a launch run there
 * with no workspace argument would open that repository's tree, and index it.
 */
export function emptyWorkingDirectory(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
  const real = realpathSync(path);
  const repository = enclosingRepository(real);
  if (repository !== null) {
    throw new Error(`the working directory ${real} lies in the git repository ${repository}: a launch with no workspace argument opens its working directory, and would read and index that tree`);
  }
  const entries = readdirSync(real);
  if (entries.length > 0) throw new Error(`the working directory ${real} is not empty: ${entries.join(', ')}`);
  return real;
}

/** The workspace the launch's first main window opened, from its log line "main window N loaded for <path> (origin …)", or `null`. */
export function openedWorkspace(log) {
  const line = /main window \d+ loaded for (.+) \(origin [^)]+\)\s*$/m.exec(log);
  return line ? line[1] : null;
}

/** Throws unless the launch `name` opened exactly `directory`. */
export function assertOpened(log, directory, name) {
  const opened = openedWorkspace(log);
  if (opened === null) throw new Error(`${name}: the log names no workspace its main window opened`);
  if (opened !== directory) throw new Error(`${name} opened ${opened}, not its empty working directory ${directory}`);
  return opened;
}

/**
 * What the code-intelligence setup leaves in a workspace it ran in: the product's `.rotaris` and the tool server's
 * `.serena`, the two names `apps/desktop/.gitignore` exists for. A proof reads it for `apps/desktop` before and after its
 * launches: a name that appeared is a launch that opened the checkout.
 */
export const SETUP_RESIDUE = Object.freeze(['.rotaris', '.serena']);
export function setupResidue(directory) {
  return SETUP_RESIDUE.filter((name) => existsSync(join(directory, name)));
}
