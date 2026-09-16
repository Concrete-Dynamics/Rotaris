import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * The one place a child process is started with the product's fixed flags:
 * no console window on Windows, and an environment the caller has already
 * shaped. ADR-0038's git helper, ADR-0034's tool-server launch and ADR-0015's
 * hook children all go through here so the no-window rule is one line.
 */
export interface SpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdio?: SpawnOptions['stdio'];
  /** ADR-0015: a hook's command reaches the interpreter as ONE argument, unquoted by Node (Windows only). */
  readonly windowsVerbatimArguments?: boolean;
}

export function spawnChild(spec: SpawnSpec): ChildProcess {
  const opts: SpawnOptions = {
    args: undefined,
    env: { ...spec.env },
    stdio: spec.stdio ?? 'pipe',
    windowsHide: true,
    detached: false,
  } as SpawnOptions;
  if (spec.cwd !== undefined) opts.cwd = spec.cwd;
  if (spec.windowsVerbatimArguments !== undefined) opts.windowsVerbatimArguments = spec.windowsVerbatimArguments;
  return spawn(spec.command, [...spec.args], opts);
}

/**
 * A PATH lookup over an environment (REQ-MCP-037's rule, one implementation for every surface): Windows honours PATHEXT;
 * a command carrying a path separator is checked where it points. Returns the file found or null.
 */
export function findExecutable(command: string, env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform): string | null {
  if (command.trim() === '') return null;
  const win = platform === 'win32';
  // PATH's separator is a property of the STRING the caller passed, so it follows the platform parameter: the
  // host-bound `delimiter` split a Windows PATH on `:` whenever the host was not Windows, which cut every entry
  // at its drive letter. `join` and `isAbsolute` stay the HOST's, because what is stat'd below is the host's own
  // filesystem however the PATH was spelled.
  const delimiter = win ? ';' : ':';
  const exts = win ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((e) => e !== '') : [''];
  // The merge of Parts R and S (2026-09-05) read the MCP category's PNG: the shipped `browser` row still said `spawn npx
  // ENOENT` after Part S's `.cmd` wrap, because Node's own `npx` directory holds an extensionless `npx` (a POSIX shell
  // script) BESIDE `npx.cmd`, and this lookup returned the extensionless file first — which Windows cannot start, so the
  // wrap never saw `.cmd`. The falsified form, kept: `[base, ...exts.map((e) => base + e)]`. Windows executes a name only
  // under a PATHEXT extension, so on win32 a base without one is tried with the extensions ONLY.
  const candidates = (base: string): string[] => (win && !exts.some((e) => base.toLowerCase().endsWith(e.toLowerCase())) ? exts.map((e) => base + e) : [base]);
  const isFile = (p: string): boolean => { try { return statSync(p).isFile(); } catch { return false; } };
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    for (const c of candidates(command)) if (isFile(c)) return c;
    return null;
  }
  const pathKey = win ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH' : 'PATH';
  for (const dir of (env[pathKey] ?? '').split(delimiter)) {
    if (dir === '') continue;
    for (const c of candidates(join(dir, command))) if (isFile(c)) return c;
  }
  return null;
}

/**
 * The Windows script-file wrap (Part S's first-execution finding, recorded in the ADR-0033 note): a package runner on
 * Windows is `npx.cmd` / `uvx.cmd`, a batch script that `spawn` cannot start by bare name and — since Node's
 * CVE-2024-27980 hardening — refuses to start without a shell even by its full path (EINVAL). A command whose PATH
 * resolution ends in `.cmd` or `.bat` is therefore launched through `cmd.exe /d /s /c "<quoted line>"` with the
 * arguments passed verbatim, the way ADR-0015's hook children already reach the interpreter. Any other command is
 * returned unchanged. Pure: the caller spawns.
 */
export function windowsLaunchOf(command: string, args: readonly string[], env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform): { command: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (platform !== 'win32') return { command, args: [...args] };
  const found = findExecutable(command, env, platform);
  const target = found ?? command;
  if (!/\.(cmd|bat)$/i.test(target)) return { command, args: [...args] };
  const quote = (a: string): string => (/[\s"&|<>^()]/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a);
  const line = [target, ...args].map(quote).join(' ');
  const comspec = env['ComSpec'] ?? env['COMSPEC'] ?? 'cmd.exe';
  return { command: comspec, args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
}

/** Copy the process environment with named variables deleted (ADR-0038: fourteen named variables for git). */
export function environmentWithout(names: readonly string[], base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  const drop = new Set(names.map((n) => (process.platform === 'win32' ? n.toUpperCase() : n)));
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    const key = process.platform === 'win32' ? k.toUpperCase() : k;
    if (drop.has(key)) continue;
    out[k] = v;
  }
  return out;
}
