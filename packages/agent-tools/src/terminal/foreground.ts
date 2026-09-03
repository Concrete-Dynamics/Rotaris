import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { MonotonicClock, Timers, TimerHandle, Millis } from '@rotaris/kernel';
import { stripVt } from './classify.js';

/**
 * ADR-0020 foreground: one long-lived PTY-hosted interactive shell per terminal session, a command
 * submitted as a line, completion and exit status recovered by an OUT-OF-BAND MARKER PROTOCOL — a start
 * marker and an end marker carrying the shell's exit-status variable, each a nonce unguessable per
 * session AND per call, scanned for in the byte stream. The session is a small machine — idle, running,
 * resetting — with a queue of one, so a second foreground call waits (REQ-TOOLS-187). Shell state persists
 * across calls and is OBSERVABLY lost on a hard timeout, which kills the process tree and restarts the
 * session (REQ-TOOLS-097, REQ-TOOLS-099). The soft pause (REQ-TOOLS-098) fires only when the call supplied
 * no timeout and nothing has been produced for the no-output window.
 *
 * The PTY is `node-pty` (ConPTY on Windows, `pwsh` else `powershell` — REQ-TOOLS-104; `/bin/sh` else the
 * login shell elsewhere). Time comes from the clock ports; the capture is cleaned of VT sequences, the
 * echoed line and the marker frames before anything reads it (ADR-0020 c.2).
 */
export interface PtyLike {
  readonly pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtyFactory {
  spawn(file: string, args: readonly string[], opts: { cwd: string; env: Record<string, string>; cols: number; rows: number; name: string }): PtyLike;
}

export type ShellBackend = { readonly kind: 'powershell'; readonly file: string } | { readonly kind: 'posix'; readonly file: string };

export interface ForegroundResult {
  readonly output: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly softPaused: boolean;
  readonly killStatus: 'session_reset' | 'reset_failed' | null;
  readonly sessionReinitialized: boolean;
  readonly truncated: boolean;
  readonly error: string | null;
}

export const FOREGROUND_CAP = 100_000;
export const NO_OUTPUT_WINDOW_MS = 30_000;

export interface SessionDeps {
  readonly factory: PtyFactory;
  readonly backend: ShellBackend;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly monotonic: MonotonicClock;
  readonly timers: Timers;
  readonly noOutputWindowMs?: number;
  readonly warn: (m: string) => void;
}

/** Windows: terminate the whole tree; POSIX: signal the group. Never throws. */
export function killTree(pid: number, force: boolean): boolean {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/T', ...(force ? ['/F'] : []), '/PID', String(pid)], { stdio: 'ignore', windowsHide: true, timeout: 5_000 });
    } else {
      process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

/** The two shells' one-liners that bracket a command with the markers and recover the exit status. */
export function wrapCommand(backend: ShellBackend, command: string, start: string, end: string): string {
  if (backend.kind === 'powershell') {
    // `$?` says whether the last statement succeeded; a native command's status is in $LASTEXITCODE.
    return `$global:LASTEXITCODE = $null; Write-Output '${start}'; ${command}; Write-Output ('${end}:' + $(if ($?) { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 } } else { if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 } }))`;
  }
  return `printf '%s\\n' '${start}'; ${command}; printf '${end}:%s\\n' "$?"`;
}

export class ForegroundSession {
  readonly id: string;
  private pty: PtyLike | null = null;
  private state: 'idle' | 'running' | 'resetting' = 'idle';
  private chain: Promise<unknown> = Promise.resolve();
  private listeners: ((chunk: string) => void)[] = [];
  private active: { readonly start: string; readonly end: string; readonly onEnd: (code: number) => void } | null = null;
  private pendingText = '';
  private reinitialized = false;
  private pausedCommand: { readonly start: string; readonly end: string; onEnd: ((code: number) => void) | null; captured: string } | null = null;
  /** A paused command that has since finished: its output and exit status wait for the next poll. */
  private pausedDone: { readonly start: string; readonly end: string; readonly captured: string; readonly code: number } | null = null;

  constructor(private readonly deps: SessionDeps, id?: string) {
    this.id = id ?? `ts_${randomBytes(4).toString('hex')}`;
  }

  get pid(): number | null {
    return this.pty?.pid ?? null;
  }
  get isRunning(): boolean {
    return this.state === 'running';
  }

  private ensure(): PtyLike {
    if (this.pty) return this.pty;
    const { backend } = this.deps;
    const args = backend.kind === 'powershell'
      ? ['-NoLogo', '-NoProfile', '-NoExit', '-Command', "Remove-Module PSReadLine -ErrorAction SilentlyContinue; function prompt { '' }; $ProgressPreference = 'SilentlyContinue'"]
      : ['-i'];
    const p = this.deps.factory.spawn(backend.file, args, { cwd: this.deps.cwd, env: { ...this.deps.env, TERM: 'dumb', PSModuleAnalysisCachePath: '' }, cols: 240, rows: 50, name: 'dumb' });
    p.onData((d) => this.onData(d));
    p.onExit(() => { if (this.pty === p) this.pty = null; });
    this.pty = p;
    return p;
  }

  private onData(chunk: string): void {
    for (const l of this.listeners) l(chunk);
    if (!this.active && !this.pausedCommand) return;
    this.pendingText += chunk;
    const end = this.active?.end ?? this.pausedCommand?.end;
    if (!end) return;
    // The echoed wrapper carries the marker text too (`'__rot_x_e:' + $(...`), so the match is the marker
    // FOLLOWED BY DIGITS on the VT-stripped stream — only the shell's own Write-Output produces that.
    const m = new RegExp(`${end}:(-?\\d+)`).exec(stripVt(this.pendingText));
    if (!m) return;
    const code = Number(m[1]);
    const handler = this.active?.onEnd ?? this.pausedCommand?.onEnd;
    this.pendingText = '';
    if (this.active) this.active = null;
    if (this.pausedCommand) { this.pausedDone = { start: this.pausedCommand.start, end: this.pausedCommand.end, captured: this.pausedCommand.captured, code }; this.pausedCommand = null; }
    handler?.(code);
  }

  /** The capture: VT stripped, the echoed command line and both marker frames removed. */
  static clean(rawSinceStart: string, start: string, end: string): string {
    const text = stripVt(rawSinceStart);
    const lines = text.split('\n');
    // Everything up to and including the line that is exactly the start marker is echo/prompt.
    const startAt = lines.findIndex((l) => l.trim() === start);
    let body = startAt >= 0 ? lines.slice(startAt + 1) : lines;
    // Everything from the shell's own end-marker line (marker followed by digits) is the frame and the prompt after it.
    const endRe = new RegExp(`^${end}:-?\\d+`);
    const endAt = body.findIndex((l) => endRe.test(l.trim()));
    if (endAt >= 0) body = body.slice(0, endAt);
    // The echoed wrapper can spill after the start marker when the line wrapped: drop lines that are fragments of it.
    const cleaned = body.filter((l) => !l.includes('Write-Output (') && !l.includes("printf '%s"));
    return cleaned.join('\n').replace(/\s+$/, '');
  }

  /** REQ-TOOLS-187: a queue of one — a second foreground call waits for the first. */
  run(command: string, opts: { timeoutMs: number | null; signal?: AbortSignal }): Promise<ForegroundResult> {
    const next = this.chain.then(() => this.execute(command, opts));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async execute(command: string, opts: { timeoutMs: number | null; signal?: AbortSignal }): Promise<ForegroundResult> {
    const { timers, monotonic } = this.deps;
    const p = this.ensure();
    this.state = 'running';
    const reinit = this.reinitialized;
    this.reinitialized = false;
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    const end = `__rot_${nonce}_e`;
    let captured = '';
    let truncated = false;
    let lastOutputAt = monotonic.now();
    const listener = (chunk: string) => {
      lastOutputAt = monotonic.now();
      captured += chunk;
      if (captured.length > FOREGROUND_CAP * 2) { captured = captured.slice(-FOREGROUND_CAP - 1000); truncated = true; }
    };
    this.listeners.push(listener);
    const done = new Promise<{ kind: 'exit'; code: number } | { kind: 'timeout' } | { kind: 'pause' } | { kind: 'abort' }>((resolve) => {
      this.active = { start, end, onEnd: (code) => resolve({ kind: 'exit', code }) };
      let hard: TimerHandle | null = null;
      let soft: TimerHandle | null = null;
      if (opts.timeoutMs !== null) hard = timers.after(opts.timeoutMs as Millis, () => resolve({ kind: 'timeout' }));
      else {
        const win = (this.deps.noOutputWindowMs ?? NO_OUTPUT_WINDOW_MS) as Millis;
        const tick = () => {
          if (!this.active) return;
          const silent = monotonic.now() - lastOutputAt;
          if (silent >= win) resolve({ kind: 'pause' });
          else soft = timers.after((win - silent) as Millis, tick);
        };
        soft = timers.after(win, tick);
      }
      opts.signal?.addEventListener('abort', () => resolve({ kind: 'abort' }), { once: true });
      const clear = () => { hard?.cancel(); soft?.cancel(); };
      void Promise.resolve().then(() => undefined);
      this.clearers.set(nonce, clear);
    });
    this.pendingText = '';
    p.write(`${wrapCommand(this.deps.backend, command, start, end)}\r`);
    const outcome = await done;
    this.clearers.get(nonce)?.();
    this.clearers.delete(nonce);
    this.listeners = this.listeners.filter((l) => l !== listener);
    const finish = (r: Omit<ForegroundResult, 'output' | 'truncated' | 'sessionReinitialized'>, output: string): ForegroundResult => {
      let text = ForegroundSession.clean(output, start, end);
      let cut = truncated;
      if (text.length > FOREGROUND_CAP) { text = text.slice(-FOREGROUND_CAP); cut = true; }
      return { ...r, output: text, truncated: cut, sessionReinitialized: reinit };
    };
    if (outcome.kind === 'exit') {
      this.state = 'idle';
      return finish({ exitCode: outcome.code, timedOut: false, softPaused: false, killStatus: null, error: null }, captured);
    }
    if (outcome.kind === 'pause') {
      // REQ-TOOLS-098: return −1, the process keeps running; a later empty command polls what it produced since.
      this.pausedDone = null;
      this.pausedCommand = { start, end, onEnd: null, captured: '' };
      this.active = null;
      this.state = 'idle';
      const pausedListener = (chunk: string) => { if (this.pausedCommand) this.pausedCommand.captured += chunk; };
      this.listeners.push(pausedListener);
      this.pausedCommand.onEnd = () => { this.listeners = this.listeners.filter((l) => l !== pausedListener); };
      return finish({ exitCode: -1, timedOut: false, softPaused: true, killStatus: null, error: null }, captured);
    }
    // timeout or abort: REQ-TOOLS-097/099 — the whole tree goes, the session restarts, shell state is lost.
    this.active = null;
    this.state = 'resetting';
    const reset = this.resetNow();
    return finish({ exitCode: 124, timedOut: true, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: outcome.kind === 'abort' ? 'the call was cancelled' : null }, captured);
  }

  private readonly clearers = new Map<string, () => void>();

  /** REQ-TOOLS-098's poll: an empty command after a soft pause returns what arrived since, or the final exit. */
  async poll(): Promise<ForegroundResult> {
    const done = this.pausedDone;
    if (done) {
      this.pausedDone = null;
      const lines = stripVt(done.captured).split('\n');
      const endRe = new RegExp(`^${done.end}:-?\\d+`);
      const endAt = lines.findIndex((l) => endRe.test(l.trim()));
      const out = (endAt >= 0 ? lines.slice(0, endAt) : lines).join('\n').replace(/\s+$/, '');
      return { output: out, exitCode: done.code, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated: false, error: null };
    }
    const pc = this.pausedCommand;
    if (!pc) return { output: '', exitCode: 0, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated: false, error: 'No paused command to poll.' };
    const out = stripVt(pc.captured);
    pc.captured = '';
    return { output: out.replace(/\s+$/, ''), exitCode: -1, timedOut: false, softPaused: true, killStatus: null, sessionReinitialized: false, truncated: false, error: null };
  }

  /** Kill the tree and start a fresh shell. True when a fresh shell is up. */
  resetNow(): boolean {
    const old = this.pty;
    this.pty = null;
    this.active = null;
    this.pausedCommand = null;
    this.pendingText = '';
    let killed = true;
    if (old) {
      killed = killTree(old.pid, true);
      try { old.kill(); } catch { /* already gone */ }
    }
    try {
      this.ensure();
      this.reinitialized = true;
      this.state = 'idle';
      return killed;
    } catch (cause) {
      this.deps.warn(`terminal session ${this.id} could not be restarted: ${String(cause)}`);
      this.state = 'idle';
      return false;
    }
  }

  /** REQ-TOOLS-096: keystroke input, a special key or text, written to the PTY as is. */
  sendInput(text: string): void {
    this.ensure().write(text);
  }

  dispose(): void {
    const old = this.pty;
    this.pty = null;
    if (old) { killTree(old.pid, true); try { old.kill(); } catch { /* */ } }
  }
}

/** REQ-TOOLS-096's special keys. */
export const SPECIAL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'C-c': '\x03', 'C-d': '\x04', 'C-z': '\x1a', UP: '\x1b[A', DOWN: '\x1b[B', LEFT: '\x1b[D', RIGHT: '\x1b[C', HOME: '\x1b[H', END: '\x1b[F',
  PGUP: '\x1b[5~', PGDN: '\x1b[6~', TAB: '\t', ESC: '\x1b', BS: '\x7f', ENTER: '\r',
});
export function keystroke(text: string): string {
  const direct = SPECIAL_KEYS[text];
  if (direct !== undefined) return direct;
  const m = /^C-([a-z])$/i.exec(text);
  if (m) return String.fromCharCode(m[1]!.toUpperCase().charCodeAt(0) - 64);
  return text;
}
