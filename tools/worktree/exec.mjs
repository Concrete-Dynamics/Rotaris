// Process helpers for the worktree workflow (`tools/worktree/`): one place that runs a command with its output
// inherited or captured, and one that builds `pnpm`'s own command line per platform. The pnpm handling is
// `tools/dev-time/dev-time.mjs`'s pattern — `npm_execpath` when pnpm is the parent, a quoted `cmd` line on
// Windows otherwise — kept here so both wrappers reach pnpm the same way.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {Object} RunResult
 * @property {number} status
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * Run one command. `stdio: 'inherit'` streams it to this process's own streams and captures nothing — a gate,
 * an install or a proof is watched as it runs; the default captures both streams and prints nothing.
 * @param {string} file @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, shell?: boolean, stdio?: 'inherit' | 'capture' }} [opts]
 * @returns {RunResult}
 */
export function run(file, args, opts = {}) {
  const inherit = opts.stdio === 'inherit';
  const child = spawnSync(file, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    env: opts.env ?? process.env,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: opts.shell ?? false,
  });
  const failed = child.error !== undefined || child.signal !== null;
  return {
    status: child.status ?? (failed ? 1 : 0),
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? (child.error ? String(child.error.message) : ''),
  };
}

/**
 * One command line built from tokens. Everywhere but Windows the tokens run directly (`shell: false`), so
 * quoting stays exactly as written; on Windows a `cmd` line is built, because a shim like `pnpm.cmd` is only
 * reachable through a shell — each token is quoted here rather than left to `spawn`'s (unquoted) join, and
 * cmd's embedded quote is `""`. The `pretty` form is what a log line carries: the command as a person spelled it.
 * @param {string[]} tokens @param {string} [platform]
 * @returns {{ file: string, args: string[], pretty: string, shell?: boolean }}
 */
export function shellCommand(tokens, platform = process.platform) {
  if (tokens.length === 0) throw new TypeError('shellCommand needs at least one token');
  const pretty = tokens.join(' ');
  if (platform === 'win32') {
    const quote = (piece) => (/[\s"]/.test(piece) ? `"${piece.replaceAll('"', '""')}"` : piece);
    return { file: tokens.map(quote).join(' '), args: [], pretty, shell: true };
  }
  return { file: tokens[0], args: tokens.slice(1), pretty };
}

/**
 * The command to run `pnpm <argv…>` with. Under `pnpm worktree:new` / `pnpm worktree:land` the environment
 * names pnpm's own entry (`npm_execpath`), so the child is that entry run by this Node — exact, and immune to
 * the Windows shim problem. Without it (a direct `node tools/worktree/<script>.mjs`), `pnpm` from the PATH is
 * used, through `shellCommand`'s platform handling.
 * @param {string[]} argv @param {NodeJS.ProcessEnv} [env]
 * @returns {{ file: string, args: string[], pretty: string, shell?: boolean }}
 */
export function pnpmCommand(argv, env = process.env) {
  const pretty = `pnpm ${argv.join(' ')}`;
  const entry = env.npm_execpath;
  if (entry !== undefined && entry !== '' && /\.(?:c?js|mjs)$/i.test(entry)) {
    return { file: process.execPath, args: [entry, ...argv], pretty };
  }
  if (process.platform === 'win32') {
    return { ...shellCommand(['pnpm.cmd', ...argv]), pretty };
  }
  return { file: 'pnpm', args: argv, pretty };
}

/**
 * Run `pnpm <argv…>` and answer the child's result.
 * @param {string[]} argv
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdio?: 'inherit' | 'capture' }} [opts]
 * @returns {RunResult}
 */
export function runPnpm(argv, opts = {}) {
  const command = pnpmCommand(argv, opts.env);
  return run(command.file, command.args, { ...opts, shell: command.shell ?? false });
}

/** The last non-blank line of a command's output — git's own message. @param {string} text */
export function oneLine(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : '(no output)';
}

/** A duration for a log line: `8.2 s`, or `6 m 50 s` past a minute. @param {number} ms */
export function seconds(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`;
}

/**
 * True when `argv1` is the script the caller is: `node tools/worktree/<script>.mjs`. The caller passes its own
 * `import.meta.url` — this module's is exec.mjs's, never the script's. `resolve` so a relative
 * `process.argv[1]` matches on Windows.
 * @param {string | undefined} argv1 @param {string} metaUrl
 */
export function isMainModule(argv1, metaUrl) {
  return argv1 !== undefined && metaUrl === pathToFileURL(resolve(argv1)).href;
}
