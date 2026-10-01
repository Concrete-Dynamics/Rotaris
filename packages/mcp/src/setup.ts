import type { ChildProcess } from 'node:child_process';
import { millis, type Clocks, type Millis, type Timers } from '@rotaris/kernel';
import { linuxProcessTable, spawnChild, windowsLaunchOf } from '@rotaris/platform';
import type { McpLog } from './types.js';

/**
 * REQ-MCP-099 (ADR-0035, Part T 2026-09-06): the deterministic code-intelligence project setup — three steps in order
 * over the invocation REQ-MCP-036 derived, each a child of that command with the step's subcommand and the workspace
 * root as its last argument; budgets from the caller (300 / 1800 / 120 s); UTF-8 in and out; completion POLLED every
 * 0.25 s on the Timers port; on cancellation or an exhausted budget the child is asked to terminate, given 5 s and then
 * force-killed — the whole tree on Windows (`taskkill /T /F`, which reaches the runtime below the application's own
 * sentinel process); a failing step's output truncated to its LAST 400 characters; creation skipped when the marker is
 * present and never overwriting; `skipped-no-code` for the two gated steps; `not-attempted` after a failure or a
 * cancellation between steps. The status vocabulary is closed; a run with a `failed` or `not-attempted` step has not
 * completed setup (`outcome`).
 *
 * No Electron, no globals: the clock ports and the platform's one spawn helper. The library assumes no process.
 */
export type SetupStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped-no-code' | 'not-attempted';
export type SetupOutcome = 'completed' | 'failed' | 'cancelled';

export interface SetupStepSpec {
  readonly id: string;
  readonly label: string;
  readonly subcommand: readonly string[];
  readonly budgetMs: number;
  readonly needsCode: boolean;
}

export interface SetupStepReport {
  readonly id: string;
  readonly label: string;
  readonly status: SetupStepStatus;
  readonly detail: string;
  readonly elapsedMs: number | null;
  /** Set only on a step stopped before it finished: by the setup's cancellation, or by its exhausted budget. */
  readonly stopped?: 'cancelled' | 'budget';
}

export interface SetupReport {
  readonly steps: readonly SetupStepReport[];
  readonly outcome: SetupOutcome;
}

export interface RunSetupOptions {
  readonly invocation: { readonly command: string; readonly args: readonly string[] };
  readonly workspaceRoot: string;
  readonly steps: readonly SetupStepSpec[];
  /** The id of the creation step, skipped (reported `succeeded`, nothing written) when `markerPresent`. */
  readonly creationStepId: string;
  readonly markerPresent: boolean;
  readonly containsCode: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly clocks: Clocks;
  readonly log: McpLog;
  readonly signal: AbortSignal;
  readonly onStep: (step: SetupStepReport, all: readonly SetupStepReport[]) => void;
  readonly pollMs?: Millis;
  readonly graceMs?: Millis;
  /**
   * REQ-WORKSPACE-092/109: the host that runs the setup is shutting down. Once `signal` fires, the step in flight is
   * stopped as a cancellation is — and one already being stopped under the cancellation's grace — but given `graceMs`
   * before the force-kill, so the application's close completes inside its 5000 ms with nothing the step launched
   * left running (`SETUP_SHUTDOWN_GRACE_MS`).
   */
  readonly shutdown?: { readonly signal: AbortSignal; readonly graceMs: Millis };
}

export const SETUP_POLL_MS: Millis = millis(250);
export const SETUP_TERMINATE_GRACE_MS: Millis = millis(5_000);
/**
 * REQ-WORKSPACE-109: closing the application completes within 5000 ms, the run stopped by force if it has not ended by
 * then; REQ-WORKSPACE-092: nothing a step launched is still running 5 s after the close. At the run host's shutdown a
 * step is asked to terminate and force-killed after this much, inside both bounds with the poll and the host's own exit
 * to spare. The figure is the build's: the specification bounds the close, not the step's share of it.
 */
export const SETUP_SHUTDOWN_GRACE_MS: Millis = millis(2_000);
/** How long the termination waits for a force-kill to be acted on, and how often it looks. */
const SETUP_KILL_SETTLE_MS = 1_000;
const SETUP_KILL_POLL_MS: Millis = millis(25);
export const SETUP_OUTPUT_TAIL = 400;
/** Empty-line answers fed to a setup child's standard input — one per prompt the runtime might raise (see the spawn below). */
export const SETUP_STDIN_ANSWERS = 128;

function wait(timers: Timers, ms: Millis): Promise<void> {
  return new Promise((resolve) => { timers.after(ms, resolve); });
}

/**
 * The termination of REQ-MCP-099: the ask, the grace, then the force-kill of the whole tree. On Windows the ask is
 * `taskkill /T` without `/F` — a close request, which a process with no window ignores, so the grace is what a child
 * actually gets before `/T /F` reaches every process below the one started (the sentinel's runtime included).
 *
 * On POSIX the step leads a process group of its own (`runSetupSteps` spawns it with `processGroup`), and the ask and the
 * force-kill go to the group: REQ-WORKSPACE-092's "nothing the step launched … neither the command the step itself
 * started nor anything descended from it". Before, the signal reached the step alone, and a process it had started
 * outlived its cancellation (measured 2026-10-01; `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).
 * The grace ends when the step and everything in its group have gone. `hurry` (the host's shutdown) shortens a grace
 * already under way to `hurry.graceMs` from the moment it fires.
 */
export async function terminateSetupChild(child: ChildProcess, clocks: Clocks, graceMs: Millis, env: Readonly<Record<string, string>>, hurry?: { readonly signal: AbortSignal; readonly graceMs: Millis }): Promise<void> {
  const pid = child.pid;
  // Whether the step leads a group (spawned with `processGroup`): a group whose id is its pid exists while any member lives.
  const group = process.platform !== 'win32' && pid !== undefined && groupExists(pid);
  const leaderRunning = (): boolean => child.exitCode === null && child.signalCode === null;
  const running = (): boolean => leaderRunning() || (group && groupRunning(pid!));
  if (!running()) return;
  const timers = clocks.timers;
  if (process.platform === 'win32' && pid !== undefined) {
    spawnChild({ command: 'taskkill', args: ['/PID', String(pid), '/T'], env, stdio: 'ignore' }).once('error', () => undefined);
  } else if (group) {
    signalGroup(pid!, 'SIGTERM');
  } else {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  let deadline = clocks.monotonic.now() + graceMs;
  const hurried = (): void => { deadline = Math.min(deadline, clocks.monotonic.now() + (hurry?.graceMs ?? 0)); };
  if (hurry?.signal.aborted === true) hurried();
  else hurry?.signal.addEventListener('abort', hurried, { once: true });
  try {
    while (running() && clocks.monotonic.now() < deadline) await wait(timers, SETUP_POLL_MS);
  } finally {
    hurry?.signal.removeEventListener('abort', hurried);
  }
  if (group) signalGroup(pid!, 'SIGKILL');
  if (leaderRunning()) {
    if (process.platform === 'win32' && pid !== undefined) {
      await new Promise<void>((resolve) => {
        const killer = spawnChild({ command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'], env, stdio: 'ignore' });
        killer.once('exit', () => resolve());
        killer.once('error', () => resolve());
      });
    }
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
  // A force-kill is acted on a moment after it is sent: wait for it, bounded, so a caller told the step has ended — the
  // run host's shutdown, which exits next — is told the truth.
  const settleBy = clocks.monotonic.now() + SETUP_KILL_SETTLE_MS;
  while (running() && clocks.monotonic.now() < settleBy) await wait(timers, SETUP_KILL_POLL_MS);
}

/** POSIX: whether a process group with id `pid` exists — the one a step spawned with `processGroup` leads. */
function groupExists(pid: number): boolean {
  try { process.kill(-pid, 0); return true; } catch { return false; }
}
/**
 * Whether a member of group `pid` still runs. A member that has exited stays in the group as a zombie until its parent
 * reaps it, and an orphan's new parent may never do so (a container's pid 1, measured 2026-10-01), so where Linux's process
 * table can tell a zombie from a running process the group counts only the running; elsewhere any member counts.
 */
function groupRunning(pid: number): boolean {
  if (!groupExists(pid)) return false;
  const table = linuxProcessTable();
  return table === null || table.group(pid).some((m) => m.state !== 'Z' && m.state !== 'X');
}
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pid, signal); } catch { /* the group has gone */ }
}

export async function runSetupSteps(o: RunSetupOptions): Promise<SetupReport> {
  const { clocks, log } = o;
  const pollMs = o.pollMs ?? SETUP_POLL_MS;
  const graceMs = o.graceMs ?? SETUP_TERMINATE_GRACE_MS;
  const reports: SetupStepReport[] = o.steps.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: '', elapsedMs: null }));
  const set = (i: number, patch: Partial<SetupStepReport>) => { reports[i] = { ...reports[i]!, ...patch }; o.onStep(reports[i]!, reports); };
  let stopped: 'failed' | 'cancelled' | null = null;
  // Read through functions: a signal's `aborted` changes under the awaits below, which TypeScript's narrowing cannot see.
  const shuttingDown = (): boolean => o.shutdown?.signal.aborted === true;
  const stopAsked = (): boolean => o.signal.aborted || shuttingDown();
  for (let i = 0; i < o.steps.length; i += 1) {
    const step = o.steps[i]!;
    if (stopped !== null) { set(i, { status: 'not-attempted', detail: stopped === 'cancelled' ? 'not attempted: the setup was cancelled before this step' : 'not attempted: an earlier step failed and this one depends on it' }); continue; }
    if (stopAsked()) { stopped = 'cancelled'; set(i, { status: 'not-attempted', detail: 'not attempted: the setup was cancelled before this step' }); continue; }
    if (step.id === o.creationStepId && o.markerPresent) { set(i, { status: 'succeeded', detail: 'the project already exists (its marker file is present); creation skipped, nothing overwritten', elapsedMs: 0 }); continue; }
    if (step.needsCode && !o.containsCode) { set(i, { status: 'skipped-no-code', detail: 'skipped: the workspace contains no file the runtime indexes', elapsedMs: 0 }); continue; }
    set(i, { status: 'running' });
    const started = clocks.monotonic.now();
    const env = { ...o.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
    const args = [...o.invocation.args, ...step.subcommand, o.workspaceRoot];
    let child: ChildProcess;
    try {
      const launch = windowsLaunchOf(o.invocation.command, args, env);
      log.info(`mcp setup: ${step.id} → ${o.invocation.command} ${args.join(' ')}`);
      // `processGroup`: on POSIX the step leads a group of its own, so its termination reaches what it started too
      // (REQ-WORKSPACE-092; `terminateSetupChild`). Windows reaches the tree through `taskkill /T` instead.
      child = spawnChild({ command: launch.command, args: launch.args, cwd: o.workspaceRoot, env, stdio: ['pipe', 'pipe', 'pipe'], processGroup: true, ...(launch.windowsVerbatimArguments === undefined ? {} : { windowsVerbatimArguments: launch.windowsVerbatimArguments }) });
      // Measured 2026-09-06 (ADR-0035's note): the runtime's creation subcommand is interactive by construction — it asks,
      // once per further language it detected beyond the main one, whether to enable that language's server, reading the
      // answer from standard input, and an end-of-file there is an exception and exit 1. REQ-MCP-099's "UTF-8 INPUT
      // encoding" is the anticipation of a fed standard input: every prompt is answered with an empty line, which the
      // runtime takes as its default (that language not enabled — the main language only), then the stream is closed.
      // Enough lines for every language the runtime knows; a step that asks nothing never reads them.
      child.stdin?.on('error', () => undefined);
      child.stdin?.end('\n'.repeat(SETUP_STDIN_ANSWERS), 'utf8');
    } catch (cause) {
      stopped = 'failed';
      set(i, { status: 'failed', detail: `the setup command could not be started: ${String(cause instanceof Error ? cause.message : cause)}`, elapsedMs: clocks.monotonic.now() - started });
      continue;
    }
    let output = '';
    let spawnError: string | null = null;
    const take = (chunk: string) => { output = `${output}${chunk}`.slice(-4_000); };
    child.stdout?.setEncoding('utf8'); child.stdout?.on('data', take);
    child.stderr?.setEncoding('utf8'); child.stderr?.on('data', take);
    child.on('error', (e: Error) => { spawnError = e.message; });
    let exceeded = false;
    let cancelled = false;
    for (;;) {
      if (child.exitCode !== null || child.signalCode !== null || spawnError !== null) break;
      if (stopAsked()) { cancelled = true; break; }
      if (clocks.monotonic.now() - started > step.budgetMs) { exceeded = true; break; }
      await wait(clocks.timers, pollMs);
    }
    if (exceeded || cancelled) await terminateSetupChild(child, clocks, shuttingDown() && o.shutdown !== undefined ? o.shutdown.graceMs : graceMs, env, o.shutdown);
    const elapsedMs = clocks.monotonic.now() - started;
    const tail = output.trim().slice(-SETUP_OUTPUT_TAIL);
    if (cancelled) { stopped = 'cancelled'; set(i, { status: 'failed', detail: `cancelled while running; the child was terminated${tail ? `; its last output: ${tail}` : ''}`, elapsedMs, stopped: 'cancelled' }); continue; }
    if (exceeded) { stopped = 'failed'; set(i, { status: 'failed', detail: `exceeded its budget of ${Math.round(step.budgetMs / 1000)} s and was terminated${tail ? `; its last output: ${tail}` : ''}`, elapsedMs, stopped: 'budget' }); continue; }
    if (spawnError !== null) { stopped = 'failed'; set(i, { status: 'failed', detail: `the setup command could not be started: ${spawnError}`, elapsedMs }); continue; }
    if (child.exitCode !== 0) { stopped = 'failed'; set(i, { status: 'failed', detail: `exited with ${child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`}${tail ? `; its last output: ${tail}` : ''}`, elapsedMs }); continue; }
    set(i, { status: 'succeeded', detail: '', elapsedMs });
    log.info(`mcp setup: ${step.id} succeeded in ${elapsedMs.toFixed(0)} ms`);
  }
  const outcome: SetupOutcome = stopped ?? (reports.every((r) => r.status === 'succeeded' || r.status === 'skipped-no-code') ? 'completed' : 'failed');
  return { steps: reports, outcome };
}
