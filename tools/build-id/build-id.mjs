// @ts-check
// The build-identifier writer (REQ-SHELL-140; ADR-0054; first-release-plan.md §4.4). The About page's Build row reads
// "a build identifier ... from a bundled text asset" and shows an em dash when the asset is missing or unreadable; the
// specification's appendix fixes the asset's shape as a single stripped line. This module decides what that line says
// and writes `apps/desktop/resources/build-id.txt` (git-ignored), which the packaging step carries to the root of
// `process.resourcesPath` beside the notices file.
//
// **What the identifier is.** The full object name of the commit the build was made from, as `git rev-parse` prints it
// — 40 hexadecimal digits, or 64 in a repository that uses SHA-256 — with `-dirty` appended when git reports a change
// the commit does not hold (a modified, staged, deleted or untracked file that is not ignored; `git describe --dirty`'s
// word). So two builds of one commit from a clean tree carry the same identifier on every machine, and an identifier
// never names a commit the build did not come from. The full name rather than an abbreviation, because the length git
// abbreviates to grows with the number of objects in the clone and so is not a property of the commit; no tag and no
// `git describe`, because whether a clone has fetched its tags is not a property of the commit either. It reads the
// local repository only: nothing here reaches the network.
//
// Plain JavaScript, like `tools/notices/`: its callers are `pnpm build-id` and `pnpm package`, neither of which compiles
// TypeScript. The contract is declared in `build-id.d.mts` for the tests beside it.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** REQ-SHELL-140's bundled text asset, by the name `apps/desktop/src/main/about.ts` reads (`BUILD_ID_ASSET`). */
export const BUILD_ID_FILE = 'build-id.txt';

/** The output, relative to the repository root. One place, so the records can cite it. */
export const PATHS = Object.freeze({ output: `apps/desktop/resources/${BUILD_ID_FILE}` });

/** A commit's full object name: SHA-1's 40 hexadecimal digits, or SHA-256's 64. */
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * The variables by which an enclosing git process (a hook, `git rebase --exec`) points git at another repository or
 * index. Inherited, they would make `git -C <root>` answer for that repository instead of `root`'s.
 */
const REDIRECTING = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX'];

/** @param {NodeJS.ProcessEnv} env */
function gitEnvironment(env) {
  const out = { ...env };
  for (const name of REDIRECTING) delete out[name];
  return out;
}

/**
 * One git command in `root`, answered as its trimmed output or the reason it gave none. `--no-optional-locks` keeps
 * `status` from taking the index lock to refresh it, so the writer never contends with a git command running beside it.
 * @param {string} root @param {string[]} args @param {{ git: string, env: NodeJS.ProcessEnv }} how
 * @returns {{ ok: true, out: string } | { ok: false, why: string }}
 */
function git(root, args, { git: executable, env }) {
  const r = spawnSync(executable, ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', env: gitEnvironment(env), windowsHide: true, timeout: 60_000 });
  if (r.error) return { ok: false, why: `${executable} could not be run (${/** @type {NodeJS.ErrnoException} */ (r.error).code ?? r.error.message})` };
  if (r.status !== 0) {
    const said = (r.stderr || r.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
    return { ok: false, why: `git ${args.join(' ')} exited ${r.status ?? r.signal}${said ? `: ${said}` : ''}` };
  }
  return { ok: true, out: (r.stdout ?? '').trim() };
}

/**
 * The identifier of the build made from `root`'s working tree, or why there is none. Deterministic: it reads only the
 * commit git names for HEAD and whether the tree differs from it.
 * @param {{ root: string, git?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {{ id: string, commit: string, dirty: boolean } | { problem: string }}
 */
export function identifyBuild({ root, git: executable = 'git', env = process.env }) {
  const how = { git: executable, env };
  const head = git(root, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], how);
  if (!head.ok) return { problem: `the commit this build is made from cannot be named in ${root}: ${head.why}` };
  if (!OBJECT_NAME.test(head.out)) return { problem: `git named HEAD in ${root} as "${head.out}", which is not a full commit name` };
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=normal'], how);
  if (!status.ok) return { problem: `whether ${root} differs from ${head.out} cannot be read: ${status.why}` };
  const dirty = status.out !== '';
  return { id: dirty ? `${head.out}-dirty` : head.out, commit: head.out, dirty };
}

/**
 * The step `pnpm build-id` and `pnpm package` run (REQ-SHELL-140; exit codes per REQ-STARTUP-149), answered as an exit
 * code and the lines to print rather than printed, so the tests drive it over a fixture repository. It writes the
 * identifier as one line; on a failure it removes any earlier file, so an identifier naming another commit can never be
 * carried into an artifact in place of the one that could not be read.
 * @param {{ root: string, git?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {{ code: 0 | 1, stdout: string[], stderr: string[] }}
 */
export function runBuildIdStep(options) {
  const output = join(options.root, PATHS.output);
  const removeEarlier = () => {
    try { rmSync(output, { force: true }); return []; } catch (e) { return [`error: ${PATHS.output} cannot be removed: ${/** @type {NodeJS.ErrnoException} */ (e).code ?? String(e)}`]; }
  };
  const found = identifyBuild(options);
  if ('problem' in found) return { code: 1, stdout: [], stderr: [`error: ${found.problem}; ${PATHS.output} was not written`, ...removeEarlier()] };
  try {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${found.id}\n`);
  } catch (e) {
    return { code: 1, stdout: [], stderr: [`error: ${PATHS.output} cannot be written: ${/** @type {NodeJS.ErrnoException} */ (e).code ?? String(e)}`, ...removeEarlier()] };
  }
  const note = found.dirty ? ' — the working tree differs from that commit, so the identifier says -dirty' : '';
  return { code: 0, stdout: [`[build-id] wrote ${PATHS.output}: ${found.id}${note}`], stderr: [] };
}
