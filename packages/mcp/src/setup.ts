import type { ChildProcess } from 'node:child_process';
import { millis, type Clocks, type Millis, type Timers } from '@rotaris/kernel';
import { spawnChild, windowsLaunchOf } from '@rotaris/platform';
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
  /** The command each step spawns, and nothing else: a step's outcome is the `onStep` caller's to log. */
  readonly log: McpLog;
  readonly signal: AbortSignal;
  readonly onStep: (step: SetupStepReport, all: readonly SetupStepReport[]) => void;
  readonly pollMs?: Millis;
  readonly graceMs?: Millis;
}

export const SETUP_POLL_MS: Millis = millis(250);
export const SETUP_TERMINATE_GRACE_MS: Millis = millis(5_000);
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
 */
export async function terminateSetupChild(child: ChildProcess, clocks: Clocks, graceMs: Millis, env: Readonly<Record<string, string>>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  const timers = clocks.timers;
  if (process.platform === 'win32' && pid !== undefined) {
    spawnChild({ command: 'taskkill', args: ['/PID', String(pid), '/T'], env, stdio: 'ignore' }).once('error', () => undefined);
  } else {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  const deadline = clocks.monotonic.now() + graceMs;
  while (child.exitCode === null && child.signalCode === null && clocks.monotonic.now() < deadline) await wait(timers, SETUP_POLL_MS);
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && pid !== undefined) {
    await new Promise<void>((resolve) => {
      const killer = spawnChild({ command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'], env, stdio: 'ignore' });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
    });
  }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

export async function runSetupSteps(o: RunSetupOptions): Promise<SetupReport> {
  const { clocks, log } = o;
  const pollMs = o.pollMs ?? SETUP_POLL_MS;
  const graceMs = o.graceMs ?? SETUP_TERMINATE_GRACE_MS;
  const reports: SetupStepReport[] = o.steps.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: '', elapsedMs: null }));
  const set = (i: number, patch: Partial<SetupStepReport>) => { reports[i] = { ...reports[i]!, ...patch }; o.onStep(reports[i]!, reports); };
  let stopped: 'failed' | 'cancelled' | null = null;
  for (let i = 0; i < o.steps.length; i += 1) {
    const step = o.steps[i]!;
    if (stopped !== null) { set(i, { status: 'not-attempted', detail: stopped === 'cancelled' ? 'not attempted: the setup was cancelled before this step' : 'not attempted: an earlier step failed and this one depends on it' }); continue; }
    if (o.signal.aborted) { stopped = 'cancelled'; set(i, { status: 'not-attempted', detail: 'not attempted: the setup was cancelled before this step' }); continue; }
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
      child = spawnChild({ command: launch.command, args: launch.args, cwd: o.workspaceRoot, env, stdio: ['pipe', 'pipe', 'pipe'], ...(launch.windowsVerbatimArguments === undefined ? {} : { windowsVerbatimArguments: launch.windowsVerbatimArguments }) });
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
      if (o.signal.aborted) { cancelled = true; break; }
      if (clocks.monotonic.now() - started > step.budgetMs) { exceeded = true; break; }
      await wait(clocks.timers, pollMs);
    }
    if (exceeded || cancelled) await terminateSetupChild(child, clocks, graceMs, env);
    const elapsedMs = clocks.monotonic.now() - started;
    const tail = output.trim().slice(-SETUP_OUTPUT_TAIL);
    if (cancelled) { stopped = 'cancelled'; set(i, { status: 'failed', detail: `cancelled while running; the child was terminated${tail ? `; its last output: ${tail}` : ''}`, elapsedMs, stopped: 'cancelled' }); continue; }
    if (exceeded) { stopped = 'failed'; set(i, { status: 'failed', detail: `exceeded its budget of ${Math.round(step.budgetMs / 1000)} s and was terminated${tail ? `; its last output: ${tail}` : ''}`, elapsedMs, stopped: 'budget' }); continue; }
    if (spawnError !== null) { stopped = 'failed'; set(i, { status: 'failed', detail: `the setup command could not be started: ${spawnError}`, elapsedMs }); continue; }
    if (child.exitCode !== 0) { stopped = 'failed'; set(i, { status: 'failed', detail: `exited with ${child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`}${tail ? `; its last output: ${tail}` : ''}`, elapsedMs }); continue; }
    // A step's outcome is logged by the caller's `onStep` (the run host's step reporter), never here as well:
    // PD-MONITOR-002, live-run finding a71-9 — each success had reached the application log twice.
    set(i, { status: 'succeeded', detail: '', elapsedMs });
  }
  const outcome: SetupOutcome = stopped ?? (reports.every((r) => r.status === 'succeeded' || r.status === 'skipped-no-code') ? 'completed' : 'failed');
  return { steps: reports, outcome };
}
