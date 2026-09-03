import type { ChildProcess } from 'node:child_process';
import { spawnChild, type SpawnSpec } from '@rotaris/platform';
import type { HookEntry } from '@rotaris/config';
import { millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { NO_EXIT_STATUS, OUTPUT_STREAM_CAP_BYTES, type Outcome } from './verdict.js';

/**
 * ADR-0015's runner: a fresh process per invocation handed to the platform's interpreter
 * (REQ-HOOKS-030), the payload written once to stdin which is then closed (REQ-HOOKS-031), output
 * captured per stream under REQ-HOOKS-037's cap, bounded by `timeout_seconds` plus 5.0 s of grace
 * (REQ-HOOKS-033). The three mechanics the ADR fixes: resolve on EXIT plus a grace timer, never on
 * `close` (a surviving descendant can hold the pipes open); kill the started process only, never its
 * group — this is the opposite of the terminal's `killTree` and shares nothing with it; write the exact
 * payload bytes and end the stream. Every timer is the `Timers` port's (ADR-0006).
 */
export const GRACE_MS = 5_000;
export const DEFAULT_TIMEOUT_SECONDS = 60;

export interface RunnerDeps {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timers: Timers;
  readonly monotonic: MonotonicClock;
  readonly platform?: NodeJS.Platform;
  readonly spawn?: (spec: SpawnSpec) => ChildProcess;
}

/** REQ-HOOKS-030: the interpreter is fixed by platform and never varies with the command. */
export function interpreterFor(command: string, platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>): { command: string; args: string[]; verbatim: boolean } {
  if (platform === 'win32') {
    const comspec = (env['ComSpec'] ?? env['COMSPEC'] ?? '').trim();
    return { command: comspec === '' ? 'cmd.exe' : comspec, args: ['/c', command], verbatim: true };
  }
  return { command: '/bin/sh', args: ['-c', command], verbatim: false };
}

/** REQ-HOOKS-037: UTF-8 with replacement, the longest prefix whose encoding is at most the cap, the marker beyond it. */
export function capStream(chunks: readonly Uint8Array[], totalBytes: number, cap = OUTPUT_STREAM_CAP_BYTES): string {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks));
  const encoder = new TextEncoder();
  if (encoder.encode(decoded).length <= cap && totalBytes <= cap) return decoded;
  let lo = 0;
  let hi = decoded.length;
  // binary search on the code-unit prefix length; then step back off a surrogate boundary
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (encoder.encode(decoded.slice(0, mid)).length <= cap) lo = mid;
    else hi = mid - 1;
  }
  let kept = decoded.slice(0, lo);
  const last = kept.charCodeAt(kept.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
  return `${kept}\n[truncated: ${totalBytes} bytes of output, ${cap} kept]`;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

class Capture {
  private readonly chunks: Uint8Array[] = [];
  private kept = 0;
  total = 0;
  push(b: Uint8Array): void {
    this.total += b.length;
    if (this.kept < OUTPUT_STREAM_CAP_BYTES + 8) {
      const take = b.subarray(0, OUTPUT_STREAM_CAP_BYTES + 8 - this.kept);
      this.chunks.push(take);
      this.kept += take.length;
    }
  }
  text(): string {
    return capStream(this.chunks, this.total);
  }
}

export function invokeHook(hook: HookEntry, payload: Uint8Array, deps: RunnerDeps): Promise<Outcome> {
  const platform = deps.platform ?? process.platform;
  const timeoutS = hook.timeoutSeconds > 0 ? hook.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;
  const started = deps.monotonic.now();
  const interp = interpreterFor(hook.command, platform, deps.env);
  const stdout = new Capture();
  const stderr = new Capture();
  return new Promise<Outcome>((resolve) => {
    let done = false;
    let timedOut = false;
    let exited: { code: number | null; signal: string | null } | null = null;
    let graceExpired = false;
    let timeoutHandle: { cancel(): void } | null = null;
    let graceHandle: { cancel(): void } | null = null;
    const finish = (launchFailure = ''): void => {
      if (done) return;
      done = true;
      timeoutHandle?.cancel();
      graceHandle?.cancel();
      const durationMs = Math.round(deps.monotonic.now() - started);
      const empty = timedOut && graceExpired;
      const code = exited?.code ?? null;
      resolve({
        hook, exitCode: launchFailure !== '' || code === null ? NO_EXIT_STATUS : code, timedOut, launchFailure,
        signalled: launchFailure === '' && !timedOut && exited !== null && exited.signal !== null,
        stdout: empty ? '' : stdout.text(), stderr: empty ? '' : stderr.text(), durationMs,
      });
    };
    let child: ChildProcess;
    try {
      child = (deps.spawn ?? spawnChild)({ command: interp.command, args: interp.args, cwd: deps.cwd, env: deps.env, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: interp.verbatim });
    } catch (cause) {
      finish(String(cause instanceof Error ? cause.message : cause));
      return;
    }
    child.on('error', (e) => finish(e.message));
    child.stdout?.on('data', (b: Buffer) => stdout.push(b));
    child.stderr?.on('data', (b: Buffer) => stderr.push(b));
    // REQ-HOOKS-031: the exact bytes, one write, then end; a hook that never reads must not stall us.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(payload);
    const armGrace = (): void => {
      if (graceHandle) return;
      graceHandle = deps.timers.after(millis(GRACE_MS), () => { graceExpired = true; finish(); });
    };
    child.on('exit', (code, signal) => {
      exited = { code, signal };
      // Resolve on exit plus a grace for the streams to drain; never wait on `close` alone (ADR-0015 mechanic 1).
      armGrace();
    });
    child.on('close', () => { if (exited !== null) finish(); });
    timeoutHandle = deps.timers.after(millis(Math.round(timeoutS * 1000)), () => {
      if (done || exited !== null) return;
      timedOut = true;
      try { child.kill(); } catch { /* the outcome is decided by the grace below */ }
      armGrace();
    });
  });
}
