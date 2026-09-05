import { spawn } from 'node:child_process';
import { millis, type Millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { GIT_ENV_DENYLIST, GIT_NETWORK_SUBCOMMANDS } from '../index.js';

/**
 * ADR-0038: the ONE place the product spawns Git. An argument vector in; the fourteen named variables deleted
 * from a copy of the environment and everything else passed through (REQ-GIT-031); the repository and the working
 * tree named explicitly on every invocation; no console window (REQ-GIT-102); stdout and stderr captured as bytes and
 * decoded UTF-8 with replacement (REQ-GIT-013); the caller's timeout applied from the clock port, never a bare
 * timer; the raw texts and the exit status returned WITHOUT interpretation. A network subcommand is refused here
 * (REQ-GIT-001) before anything is spawned, and the rendered command of REQ-GIT-033 is computed from the same
 * vector, so the rendered and the executed command cannot disagree.
 */
export interface GitInvocation {
  readonly args: readonly string[];
  readonly workspaceRoot: string;
  readonly timeoutMs: Millis;
  readonly timers: Timers;
  readonly clock: MonotonicClock;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** The executable; `git` on the search path by default (ADR-0038 consequence 1). */
  readonly executable?: string;
}

export type GitResult =
  | { readonly outcome: 'exited'; readonly status: number; readonly stdout: string; readonly stderr: string; readonly elapsedMs: number }
  | { readonly outcome: 'timed-out'; readonly stdout: string; readonly stderr: string; readonly elapsedMs: number }
  | { readonly outcome: 'cannot-start'; readonly reason: string; readonly elapsedMs: number }
  | { readonly outcome: 'refused'; readonly reason: string; readonly elapsedMs: number };

/** REQ-GIT-033: the subcommand and its arguments in invocation order, single spaces, no quoting, eliding or truncation. */
export function renderGitCommand(args: readonly string[]): string {
  return args.join(' ');
}

/** REQ-GIT-031: the named variables deleted from a COPY; everything else passes through unchanged. */
export function gitEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  const denied = new Set<string>(GIT_ENV_DENYLIST);
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !denied.has(k)) out[k] = v;
  return out;
}

/** REQ-GIT-001: the first non-option argument is the subcommand; a network one is refused. */
export function isNetworkSubcommand(args: readonly string[]): boolean {
  const sub = args.find((a) => !a.startsWith('-'));
  return sub !== undefined && (GIT_NETWORK_SUBCOMMANDS as readonly string[]).includes(sub);
}

export function invokeGit(inv: GitInvocation): Promise<GitResult> {
  const started = Number(inv.clock.now());
  const elapsed = () => Number(inv.clock.now()) - started;
  if (isNetworkSubcommand(inv.args)) return Promise.resolve({ outcome: 'refused', reason: `git ${renderGitCommand(inv.args)} opens a network connection and is refused (REQ-GIT-001)`, elapsedMs: elapsed() });
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const decode = (b: Buffer[]) => Buffer.concat(b).toString('utf8');
    let child: ReturnType<typeof spawn>;
    try {
      // `-C` names the working tree; `--git-dir` is derived by Git from it, and REQ-GIT-031's variables cannot redirect either.
      child = spawn(inv.executable ?? 'git', ['-C', inv.workspaceRoot, ...inv.args], { env: gitEnvironment(inv.env ?? process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (cause) {
      resolve({ outcome: 'cannot-start', reason: String(cause instanceof Error ? cause.message : cause), elapsedMs: elapsed() });
      return;
    }
    const timer = inv.timers.after(millis(Number(inv.timeoutMs)), () => { timedOut = true; try { child.kill(); } catch { /* already gone */ } });
    child.stdout?.on('data', (b: Buffer) => out.push(b));
    child.stderr?.on('data', (b: Buffer) => errs.push(b));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      timer.cancel();
      resolve({ outcome: 'cannot-start', reason: e.message, elapsedMs: elapsed() });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      timer.cancel();
      if (timedOut) resolve({ outcome: 'timed-out', stdout: decode(out), stderr: decode(errs), elapsedMs: elapsed() });
      else resolve({ outcome: 'exited', status: code ?? -1, stdout: decode(out), stderr: decode(errs), elapsedMs: elapsed() });
    });
  });
}
