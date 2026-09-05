import { spawn } from 'node:child_process';
import { millis, type Millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { GIT_ENV_DENYLIST, GIT_NETWORK_SUBCOMMANDS } from '../index.js';

/**
 * ADR-0038: the ONE place the product spawns Git. An argument vector in; the named variables deleted from a copy of
 * the environment and everything else passed through (REQ-GIT-031); the repository and the working tree named
 * explicitly on every invocation; no console window (REQ-GIT-102); stdout and stderr captured as bytes and decoded
 * UTF-8 with replacement (REQ-GIT-013); the caller's timeout applied from the clock port, never a bare timer; the
 * raw texts and the exit status returned WITHOUT interpretation. A network subcommand is refused here (REQ-GIT-001)
 * before anything is spawned, and the rendered command of REQ-GIT-033 is computed from the same vector, so the
 * rendered and the executed command cannot disagree.
 *
 * ADR-0039's first execution added two seams the checkpoint layer needs and no read did: `stdin` (the NUL-separated
 * path list `update-index --stdin` consumes) and `setEnv`, applied AFTER the scrub — "neutralise, then set our own"
 * (ADR-0039 §1): the private `GIT_INDEX_FILE` and REQ-GIT-032's fixed identity.
 */
export interface GitInvocation {
  readonly args: readonly string[];
  readonly workspaceRoot: string;
  readonly timeoutMs: Millis;
  readonly timers: Timers;
  readonly clock: MonotonicClock;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Set after REQ-GIT-031's scrub, so a denied name can still be given OUR value for this one invocation (ADR-0039 §1). */
  readonly setEnv?: Readonly<Record<string, string>>;
  /** Bytes written to the child's standard input, then closed; absent means no standard input at all. */
  readonly stdin?: string | Buffer;
  /** The executable; `git` on the search path by default (ADR-0038 consequence 1). */
  readonly executable?: string;
}

export type GitResult =
  | { readonly outcome: 'exited'; readonly status: number; readonly stdout: string; readonly stderr: string; readonly elapsedMs: number }
  | { readonly outcome: 'timed-out'; readonly stdout: string; readonly stderr: string; readonly elapsedMs: number }
  | { readonly outcome: 'cannot-start'; readonly reason: string; readonly elapsedMs: number }
  | { readonly outcome: 'refused'; readonly reason: string; readonly elapsedMs: number };

/** Git's global options that take the NEXT argument as their value when not written with `=`. */
const GLOBAL_OPTIONS_WITH_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);

/**
 * The index of the subcommand in the vector: the first argument that is neither a global option nor the value of one.
 *
 * Found on ADR-0039's first execution: the chokepoint read "the first argument not starting with `-`" as the
 * subcommand, so `-c gc.auto=0 push …` — the form every checkpoint invocation takes (ADR-0039 §3) — named `gc.auto=0`
 * as the subcommand and a network subcommand behind a global option would have passed the refusal. The reason given
 * was that no caller passed global options; that stopped being true with this record's first write.
 */
export function subcommandIndex(args: readonly string[]): number {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (GLOBAL_OPTIONS_WITH_VALUE.has(a)) { i += 1; continue; }
    if (a.startsWith('-')) continue;
    return i;
  }
  return -1;
}

/** REQ-GIT-033: the subcommand and its arguments in invocation order, single spaces, no quoting, eliding or truncation; the global options before it are not "arguments passed to the subcommand". */
export function renderGitCommand(args: readonly string[]): string {
  const at = subcommandIndex(args);
  return (at < 0 ? args : args.slice(at)).join(' ');
}

/** REQ-GIT-031: the named variables deleted from a COPY; everything else passes through unchanged. */
export function gitEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  const denied = new Set<string>(GIT_ENV_DENYLIST);
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !denied.has(k)) out[k] = v;
  return out;
}

/** REQ-GIT-001: the subcommand (past any global option) is looked up in the network set; a member is refused. */
export function isNetworkSubcommand(args: readonly string[]): boolean {
  const at = subcommandIndex(args);
  return at >= 0 && (GIT_NETWORK_SUBCOMMANDS as readonly string[]).includes(args[at]!);
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
      const env = { ...gitEnvironment(inv.env ?? process.env), ...(inv.setEnv ?? {}) };
      child = spawn(inv.executable ?? 'git', ['-C', inv.workspaceRoot, ...inv.args], { env, windowsHide: true, stdio: [inv.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    } catch (cause) {
      resolve({ outcome: 'cannot-start', reason: String(cause instanceof Error ? cause.message : cause), elapsedMs: elapsed() });
      return;
    }
    const timer = inv.timers.after(millis(Number(inv.timeoutMs)), () => { timedOut = true; try { child.kill(); } catch { /* already gone */ } });
    child.stdout?.on('data', (b: Buffer) => out.push(b));
    child.stderr?.on('data', (b: Buffer) => errs.push(b));
    if (inv.stdin !== undefined && child.stdin) {
      // A child that exits before reading (a refused ref, a bad argument) closes its end first; that is not our error.
      child.stdin.on('error', () => undefined);
      child.stdin.end(inv.stdin);
    }
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
