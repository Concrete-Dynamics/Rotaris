import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

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
