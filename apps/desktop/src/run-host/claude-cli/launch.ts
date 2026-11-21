import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { findExecutable } from '@rotaris/platform';
import type { CliLaunch, CliProcess } from './client.js';

/**
 * PD-PROVIDER-002 — the one place the Claude Code executable is started. It is found on the executable search path
 * the application was started with and run as it is: this product ships no copy of it and changes nothing in it.
 */
const STDERR_TAIL = 2_000;

/** Whether the tool's name resolves to a Windows command shim, which only the command interpreter can run. */
export function isCommandShim(executable: string, env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(findExecutable(executable, env, platform) ?? '');
}

/** What may stand on the command interpreter's line unquoted: nothing it reads as syntax, and no blank. */
const PLAIN_ARGUMENT = /^[A-Za-z0-9_.,:=@+\/-]+$/;

/**
 * The process to start. Directly, the arguments are passed as they are and no shell reads them. For a command shim the
 * line is `cmd.exe /d /s /c "<name> <arguments>"`, and it is built WITHOUT escaping: an argument is either empty
 * (written `""`) or made only of characters the interpreter gives no meaning to, and anything else refuses the launch —
 * so there is no quoting rule to get wrong.
 */
export function launchTargetOf(executable: string, args: readonly string[], shim: boolean): { command: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (!shim) return { command: executable, args: [...args] };
  const words = [executable, ...args].map((a) => {
    if (a === '') return '""';
    if (!PLAIN_ARGUMENT.test(a)) throw new Error(`Claude Code cannot be started through its Windows command shim with the argument "${a}": it holds a character the command interpreter would read as syntax.`);
    return a;
  });
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${words.join(' ')}"`], windowsVerbatimArguments: true };
}

export function launchClaudeCli(l: CliLaunch): CliProcess {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(l.env)) if (v !== undefined) env[k] = v;
  // Nothing of the command line comes from the environment: the tool's name is this product's, and the arguments are
  // the client's flags, the model's name and two file names relative to the working directory. The search path only
  // decides whether the Windows form is needed.
  const target = launchTargetOf(l.executable, l.args, isCommandShim(l.executable, env));
  const child = spawn(target.command, target.args, { cwd: l.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...(target.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}) });
  let stderr = '';
  let exited = false;
  const lines: ((line: string) => void)[] = [];
  const exits: ((code: number | null, stderrTail: string) => void)[] = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      for (const fn of lines) fn(line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
  const end = (code: number | null): void => {
    if (exited) return;
    exited = true;
    for (const fn of exits) fn(code, stderr.trim());
  };
  child.on('error', () => end(null));
  child.on('exit', (code) => end(code));
  child.stdin.on('error', () => undefined);
  return {
    write: (line) => { if (!exited && child.stdin.writable) child.stdin.write(line); },
    endInput: () => { if (child.stdin.writable) child.stdin.end(); },
    kill: () => { if (!exited) child.kill(); },
    onLine: (fn) => { lines.push(fn); },
    onExit: (fn) => { exits.push(fn); },
  };
}

/** REQ-PROVIDER-048: the user's own Claude Code settings, as text, or null when there are none to read. */
export function readClaudeUserSettings(): string | null {
  try { return readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'); } catch { return null; }
}

/**
 * A session's files under `dir`, each owner-only; removed when the session ends. The tool description holds the bridge's
 * bearer. A file is named RELATIVE to `dir`, which is the process's working directory, so no path read from the
 * environment (the temporary directory's) is ever part of the command line.
 */
export function sessionFiles(dir: string): { write: (kind: 'instructions' | 'tools', text: string) => string; remove: (path: string) => void } {
  return {
    write: (kind, text) => {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `${kind}-${randomBytes(8).toString('hex')}.${kind === 'tools' ? 'json' : 'txt'}`;
      writeFileSync(join(dir, name), text, { encoding: 'utf8', mode: 0o600 });
      return name;
    },
    remove: (name) => { rmSync(join(dir, name), { force: true }); },
  };
}
