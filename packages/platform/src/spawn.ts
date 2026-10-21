import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { lstatSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

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
  /**
   * POSIX only: the child leads a process group of its own, so the caller can signal the child and everything it
   * started as one (`process.kill(-pid, …)`). Without it that call finds no group and fails with ESRCH, which is
   * how a background terminal session on Linux refused every signal (REQ-TOOLS-110, OQ-10). On Windows `detached`
   * would open a new console instead, so the flag is ignored there and the product's tree kill stays `taskkill /T`.
   */
  readonly processGroup?: boolean;
}

export function spawnChild(spec: SpawnSpec): ChildProcess {
  const opts: SpawnOptions = {
    args: undefined,
    env: { ...spec.env },
    stdio: spec.stdio ?? 'pipe',
    windowsHide: true,
    detached: spec.processGroup === true && process.platform !== 'win32',
  } as SpawnOptions;
  if (spec.cwd !== undefined) opts.cwd = spec.cwd;
  if (spec.windowsVerbatimArguments !== undefined) opts.windowsVerbatimArguments = spec.windowsVerbatimArguments;
  return spawn(spec.command, [...spec.args], opts);
}

/**
 * Whether `path` is a file a PATH lookup may name: a regular file, or, on Windows, an App Execution Alias — the reparse point
 * through which an MSIX or Store package is started (`%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe`, `python.exe`). Node
 * cannot `stat` an alias (`EACCES`; `existsSync` is false) though it starts when run, and `lstat` reads it as a symbolic
 * link, so it is taken where `stat` refuses with `EACCES` and `lstat` reads a link. Until 2026-10-15 only the `stat` was
 * asked, and a pwsh installed by `winget install Microsoft.PowerShell` on Windows 11 ARM64 was passed over for Windows
 * PowerShell 5.1 (docs/defects/fixed/the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md).
 */
export function presentExecutable(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EACCES') return false;
    try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
  }
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
  const isFile = presentExecutable;
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    for (const c of candidates(command)) if (isFile(c)) return c;
    return null;
  }
  const pathKey = win ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH' : 'PATH';
  for (const dir of (env[pathKey] ?? '').split(delimiter)) {
    if (dir === '') continue;
    const names = directoryNames(dir, win);
    for (const c of candidates(command)) {
      // A name the directory's listing lacks is not there: one `stat` of the directory instead of one per extension.
      if (names !== null && !names.has(win ? c.toLowerCase() : c)) continue;
      if (isFile(join(dir, c))) return join(dir, c);
    }
  }
  return null;
}

/**
 * The names a PATH directory holds, kept while its modification time holds (lower-cased on win32, where a name matches
 * without regard to case), or null when it cannot be listed and the lookup must `stat` each candidate. Until 2026-10-20
 * the lookup `stat`ed every directory under every PATHEXT extension: 1,105 calls on a Windows 11 host with 85 PATH
 * entries and 13 extensions, about 880 ms a lookup at that host's 0.8 ms a `stat`, paid on every configuration load
 * (docs/defects/fixed/a-configuration-load-costs-about-half-a-second-on-a-windows-host-with-a-long-path.md). A directory
 * gains a new modification time when an entry is added, removed or renamed in it, so a kept listing costs one `stat`.
 * A listing is kept only when the directory's time did not move while it was read, and only when that time carries a
 * fraction of a millisecond: a coarse filesystem (FAT's two seconds, exFAT's ten milliseconds) can take an entry in
 * the same tick as the read and leave the time unchanged, and its listing is read afresh at each lookup instead.
 */
function directoryNames(dir: string, win: boolean): ReadonlySet<string> | null {
  const key = resolve(dir);
  try {
    const before = statSync(key, { bigint: true, throwIfNoEntry: false });
    const kept = listings.get(key);
    if (before !== undefined && kept !== undefined && kept.mtimeNs === before.mtimeNs) return kept.names;
    listings.delete(key);
    // An entry naming nothing, or naming a file, holds no executable: nothing under it can be `stat`ed either.
    if (before === undefined || !before.isDirectory()) return NOTHING;
    const names = new Set(readdirSync(key).map((n) => (win ? n.toLowerCase() : n)));
    const after = statSync(key, { bigint: true, throwIfNoEntry: false });
    if (after !== undefined && after.mtimeNs === before.mtimeNs && !String(before.mtimeNs).endsWith('000000')) listings.set(key, { mtimeNs: before.mtimeNs, names });
    return names;
  } catch {
    // A directory that refuses to be listed (`EACCES`, `EPERM`) may still let a named file be `stat`ed.
    listings.delete(key);
    return null;
  }
}
const NOTHING: ReadonlySet<string> = new Set();
const listings = new Map<string, { readonly mtimeNs: bigint; readonly names: ReadonlySet<string> }>();

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
export function environmentWithout(names: readonly string[], base: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const out: Record<string, string> = {};
  // The platform is a PARAMETER for the same reason `findExecutable` takes one: on Windows the
  // comparison is case-insensitive and off Windows it is not, whatever host asks the question.
  const keyOf = (n: string): string => (platform === 'win32' ? n.toUpperCase() : n);
  const drop = new Set(names.map(keyOf));
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (drop.has(keyOf(k))) continue;
    out[k] = v;
  }
  return out;
}
