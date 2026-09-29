import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import type { Millis, MonotonicClock, TimerHandle, Timers, WallClock } from '@rotaris/kernel';
import { spawnChild } from '@rotaris/platform';
import { toIsoUtc } from '@rotaris/kernel';
import type { ShellBackend } from './foreground.js';
import { killTree } from './foreground.js';
import type { BackgroundStatus } from './classify.js';

/**
 * ADR-0020 background (REQ-TOOLS-107..111): a plain subprocess, shell-interpreted, stdout and stderr
 * merged into one pipe, stdin piped, cwd the tool's working directory, its own process group on POSIX;
 * returns immediately. Output is buffered to 1 MB per session and truncated silently from the oldest
 * end with the read cursor adjusted. Termination is SIGTERM, up to 5 s grace returning as soon as the
 * process exits, then SIGKILL — on Windows (decision 6 of the plan, OQ-10) both terminate the tree.
 * Session ids are `ts_` + 8 hex derived from the command and a monotonic timestamp, collision-checked.
 */
export const BACKGROUND_BUFFER = 1024 * 1024;
export const DEFAULT_MAX_BACKGROUND = 20;
export const DEFAULT_BACKGROUND_TIMEOUT_S = 3600;

/**
 * REQ-TOOLS-109/179 with OQ-133: the status and exit code a background session ends with, from what its process's
 * `exit` reported. An exit code is the command's own outcome — `completed` for 0, `failed` for any other. A death by a
 * signal carries no exit code: one the product delivered at the agent's or the user's request (`send_signal`, the
 * stream-control interrupt) ends it `killed` with −1, as an explicit kill does, because the agent or the user ended it
 * deliberately (REQ-TOOLS-112); one the product never sent — a crash, another process's kill — is `failed` with the
 * shell's `128 + n` for signal `n`, so −1 stays `killed`'s alone. Before this, every signal death read `failed (exit -1)`
 * (live-run finding L4).
 */
export function endOfExit(code: number | null, signal: NodeJS.Signals | null, delivered: ReadonlySet<string>): { readonly status: BackgroundStatus; readonly exitCode: number } {
  if (code !== null) return { status: code === 0 ? 'completed' : 'failed', exitCode: code };
  if (signal !== null && delivered.has(signal)) return { status: 'killed', exitCode: -1 };
  const n = signal === null ? undefined : (osConstants.signals as Record<string, number | undefined>)[signal];
  return { status: 'failed', exitCode: n === undefined ? -1 : 128 + n };
}

export interface BackgroundDeps {
  readonly backend: ShellBackend;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly monotonic: MonotonicClock;
  readonly wall: WallClock;
  readonly timers: Timers;
  readonly maxSessions?: number;
  readonly warn: (m: string) => void;
}

export class BackgroundSession {
  readonly id: string;
  readonly startedAt: string;
  status: BackgroundStatus = 'running';
  exitCode: number | null = null;
  /** REQ-SANDBOX-085: this spawn was confined, so its failure may be the launcher's rather than the command's. */
  confined = false;
  /**
   * PD-ORCH-005 clause 10: the session and the agent (its task id) that started this background session, so a resumed
   * agent can be told which of its own still run; null for one started by no agent of a run (a test, a proof).
   */
  owner: BackgroundOwner | null = null;
  private buffer = '';
  /** How many characters have been dropped from the oldest end; the read cursor is relative to the whole stream. */
  private dropped = 0;
  private cursor = 0;
  private timer: TimerHandle | null = null;
  private exited: Promise<void>;
  /** Part AL: the live stream's taps (REQ-TOOLS-127: `bg:<id>` publishes what the pipe produces). */
  private taps: ((chunk: string) => void)[] = [];
  /** OQ-133: the signals `signal` delivered to the session's group, so a death by one of them reads `killed`. */
  private readonly delivered = new Set<string>();

  constructor(readonly command: string, private readonly child: ChildProcess, id: string, startedAt: string, timeoutMs: number, private readonly deps: BackgroundDeps) {
    this.id = id;
    this.startedAt = startedAt;
    const onData = (d: Buffer) => this.append(d.toString('utf8'));
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    this.exited = new Promise<void>((resolve) => {
      child.on('exit', (code, signal) => {
        this.timer?.cancel();
        if (this.status === 'running') { const end = endOfExit(code, signal, this.delivered); this.exitCode = end.exitCode; this.status = end.status; }
        resolve();
      });
      child.on('error', (e) => { this.append(`\n[spawn error] ${String(e)}`); if (this.status === 'running') { this.status = 'failed'; this.exitCode = -1; } resolve(); });
    });
    this.timer = deps.timers.after(timeoutMs as Millis, () => { void this.end('timeout'); });
  }

  onOutput(cb: (chunk: string) => void): () => void {
    this.taps.push(cb);
    return () => { this.taps = this.taps.filter((t) => t !== cb); };
  }
  /** Resolves once the process has exited — after `end`'s grace, or on its own. */
  whenExited(): Promise<void> {
    return this.exited;
  }
  /** REQ-TOOLS-128: interrupt for a background session is SIGINT — on a Windows pipe it terminates
   * the session's own tree (OQ-10, ruled 2026-09-21 in R-044), there being no graceful interrupt to deliver. */
  interrupt(): boolean {
    return this.signal('SIGINT');
  }

  private append(text: string): void {
    for (const t of this.taps) { try { t(text); } catch (cause) { this.deps.warn(`background session ${this.id}: an output tap raised: ${String(cause)}`); } }
    this.buffer += text;
    if (this.buffer.length > BACKGROUND_BUFFER) {
      const cut = this.buffer.length - BACKGROUND_BUFFER;
      this.buffer = this.buffer.slice(cut);
      this.dropped += cut;
      if (this.cursor < this.dropped) this.cursor = this.dropped;
    }
  }

  /** REQ-TOOLS-110 `query`: only what is new since the last poll. */
  readNew(): string {
    const from = Math.max(0, this.cursor - this.dropped);
    const out = this.buffer.slice(from);
    this.cursor = this.dropped + this.buffer.length;
    return out;
  }
  readAll(): string {
    return this.buffer;
  }
  /** PD-ORCH-005 clause 10: the last output, at most `BACKGROUND_TAIL_CHARS`, without moving the read cursor. */
  tail(chars = BACKGROUND_TAIL_CHARS): string {
    return this.buffer.length <= chars ? this.buffer : this.buffer.slice(this.buffer.length - chars);
  }
  sendInput(data: string): boolean {
    if (!this.child.stdin || this.child.stdin.destroyed) { this.deps.warn(`background session ${this.id}: stdin is closed`); return false; }
    this.child.stdin.write(data);
    return true;
  }

  /** REQ-TOOLS-109: SIGTERM, grace up to 5 s returning as soon as it exits, then SIGKILL. */
  async end(as: 'killed' | 'timeout'): Promise<void> {
    if (this.status !== 'running') return;
    this.status = as;
    this.exitCode = as === 'timeout' ? 124 : -1;
    const pid = this.child.pid;
    if (pid) killTree(pid, false);
    const grace = new Promise<void>((resolve) => this.deps.timers.after(5_000 as Millis, resolve));
    await Promise.race([this.exited, grace]);
    if (this.child.exitCode === null && pid) killTree(pid, true);
  }

  signal(name: 'SIGTERM' | 'SIGINT' | 'SIGKILL' | 'SIGHUP'): boolean {
    const pid = this.child.pid;
    if (!pid) return false;
    if (process.platform === 'win32') {
      // OQ-10, ruled 2026-09-21 in R-044: a pipe has no graceful interrupt on Windows, so EVERY signal
      // terminates the session's own tree — the mapping SIGTERM/SIGKILL already used, extended to
      // SIGINT/SIGHUP rather than refusing what REQ-TOOLS-110 promises to send.
      void this.end('killed');
      return true;
    }
    try { process.kill(-pid, name); } catch { return false; }
    this.delivered.add(name);
    return true;
  }
}

/** PD-ORCH-005 clause 10: who started a background session — the session and the agent's task id. */
export interface BackgroundOwner {
  readonly sessionId: string;
  readonly taskId: string;
}

/** PD-ORCH-005 clause 10: how many characters of a session's output are its "last recorded output". */
export const BACKGROUND_TAIL_CHARS = 2_000;

export class BackgroundManager {
  private readonly sessions = new Map<string, BackgroundSession>();
  /** Part AL: the cap as the run's configuration set it (REQ-TOOLS-108); null means the construction-time value. */
  private maxOverride: number | null = null;
  constructor(private readonly deps: BackgroundDeps) {}

  get running(): number {
    return [...this.sessions.values()].filter((s) => s.status === 'running').length;
  }
  get max(): number {
    return Math.max(1, this.maxOverride ?? this.deps.maxSessions ?? DEFAULT_MAX_BACKGROUND);
  }
  /** REQ-TOOLS-108 / REQ-CONFIG-116: `runtime.shell_max_background_sessions` (minimum 1) takes effect for the next start. */
  setMax(n: number): void {
    this.maxOverride = Math.max(1, Math.floor(n));
  }

  /**
   * REQ-TOOLS-107/108. `command` is the command AS SUBMITTED — it names the session, and
   * REQ-SANDBOX-086 requires every observation show it rather than the confining invocation.
   * `options.line` is what the shell actually receives; absent, the two are the same string.
   */
  start(command: string, timeoutS: number, options?: { readonly line?: string; readonly confined?: boolean }): { ok: true; session: BackgroundSession } | { ok: false; error: string } {
    if (this.running >= this.max) return { ok: false, error: `Maximum background terminal sessions (${this.max}) reached. Kill or wait for existing sessions before starting new ones.` };
    const stamp = String(this.deps.monotonic.now());
    let id = '';
    for (let n = 0; ; n += 1) {
      id = `ts_${createHash('sha256').update(`${command}\n${stamp}\n${n}`).digest('hex').slice(0, 8)}`;
      if (!this.sessions.has(id)) break;
    }
    const { backend } = this.deps;
    const line = options?.line ?? command;
    const args = backend.kind === 'powershell' ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', line] : ['-c', line];
    let child: ChildProcess;
    try {
      // REQ-TOOLS-110: its own process group on POSIX, so a signal and the tree kill reach the command, not only the shell.
      child = spawnChild({ command: backend.file, args, cwd: this.deps.cwd, env: this.deps.env, stdio: ['pipe', 'pipe', 'pipe'], processGroup: true });
    } catch (cause) {
      return { ok: false, error: `The background command could not be started: ${String(cause)}` };
    }
    const s = new BackgroundSession(command, child, id, toIsoUtc(this.deps.wall.instant()), Math.max(1, timeoutS) * 1000, this.deps);
    // REQ-SANDBOX-085: the relabelling applies to the result of polling or terminating a background
    // command too, since a spawn returns before the failure is visible and it first shows at the
    // next poll. The session remembers that it was confined so that poll can make the test.
    if (options?.confined === true) s.confined = true;
    this.sessions.set(id, s);
    return { ok: true, session: s };
  }
  get(id: string): BackgroundSession | undefined {
    return this.sessions.get(id);
  }
  list(): BackgroundSession[] {
    return [...this.sessions.values()];
  }
  /** REQ-TOOLS-111: every background session ended. */
  async dispose(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.end('killed')));
  }
}
