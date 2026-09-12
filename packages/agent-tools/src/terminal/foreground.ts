import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { MonotonicClock, Timers, TimerHandle, Millis } from '@rotaris/kernel';
import { stripVt } from './classify.js';
import type { EmulatorFactory, ScreenEmulator } from './emulator.js';

/**
 * ADR-0020 foreground: one long-lived PTY-hosted interactive shell per terminal session, a command
 * submitted as a line, completion and exit status recovered by an OUT-OF-BAND MARKER PROTOCOL — a start
 * marker and an end marker carrying the shell's exit-status variable, each a nonce unguessable per
 * session AND per call, scanned for in the byte stream. The session is a small machine — idle, running,
 * resetting — with a queue of one, so a second foreground call waits (REQ-TOOLS-187). Shell state persists
 * across calls and is OBSERVABLY lost on a hard timeout, which kills the process tree and restarts the
 * session (REQ-TOOLS-097, REQ-TOOLS-099). REQ-TOOLS-097's two bounds hold TOGETHER, first to fire governing:
 * the hard wall clock is the call's own timeout when it supplied one and `runtime.shell_command_timeout`
 * when it did not (REQ-CONFIG-116), and REQ-TOOLS-098's soft pause arms BESIDE it, only for a call that
 * supplied no timeout.
 *
 * The PTY is `node-pty` (ConPTY on Windows, `pwsh` else `powershell` — REQ-TOOLS-104; `/bin/sh` else the
 * login shell elsewhere). Time comes from the clock ports. What the agent reads is ADR-0021's headless
 * SCREEN — the same emulator the live stream runs — with the echoed wrapper and both marker frames removed
 * (ADR-0020 c.2). `stripVt` survives for the marker scan, which works on the raw stream by design.
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
/**
 * The retained-line budget of a call's screen. A screen retains LINES where REQ-TOOLS-097's cap counts
 * CHARACTERS, so the budget must be the number of lines that leaves 100,000 characters reachable, and it was
 * measured rather than guessed (2026-09-12). `pnpm terminal-proof`'s flood — `1..10000 | ForEach-Object
 * { "line $_" }` — is 10,000 lines and 98,893 characters, sized deliberately just inside the cap: at a
 * 1,000-line budget the agent got the last 999 lines of it, at 10,000 it got 9,999 (one short — the echo and
 * the frames take room too), at 12,500 it got all 10,000, for 35–43 ms of parsing and 16–28 MB held for the
 * duration of the call. The proof is what caught the too-small first choice.
 *
 * 12,500 lines leaves the cap reachable for output whose retained lines average 8 characters or more; the
 * flood averages 9.9. SHORTER lines still meet the line budget first — 12,500 one-character lines deliver
 * 24,997 characters where the cap would allow 100,000 — and closing that needs 100,000 retained lines, which
 * measured 249.5 MB and 1.1 s per call and is not a price to pay per concurrent agent. That residue is a
 * REQ-TOOLS-097 question recorded in ADR-0020's note, and NOT a lower cap: the 100,000-character slice runs.
 */
export const FOREGROUND_SCREEN_LINES = 12_500;

export interface SessionDeps {
  readonly factory: PtyFactory;
  readonly backend: ShellBackend;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly monotonic: MonotonicClock;
  readonly timers: Timers;
  readonly noOutputWindowMs?: number;
  /** ADR-0021's emulator, the same adapter the live stream runs: what a call's capture is read off. */
  readonly emulator: EmulatorFactory;
  readonly warn: (m: string) => void;
}

/**
 * The PTY chunks a call has taken but not yet given to its screen, bounded from the OLDEST end. The bound is
 * what a screen of `FOREGROUND_SCREEN_LINES` rows can hold at the session's width — feeding more than that
 * cannot add anything the screen would still be retaining — so a command that prints without stopping is
 * bounded in memory while it runs, as the raw capture this replaced was (`REQ-TOOLS-097`).
 */
class HeldBytes {
  private chunks: string[] = [];
  private chars = 0;
  private readonly limit: number;
  /** True once bytes were dropped from the front: the call's capture is truncated whatever the screen says. */
  dropped = false;
  constructor(cols: number) {
    this.limit = FOREGROUND_SCREEN_LINES * Math.max(1, cols);
  }
  push(chunk: string): void {
    this.chunks.push(chunk);
    this.chars += chunk.length;
    while (this.chars > this.limit && this.chunks.length > 1) {
      this.chars -= this.chunks.shift()!.length;
      this.dropped = true;
    }
  }
  take(): string {
    const all = this.chunks.join('');
    this.chunks = [];
    this.chars = 0;
    return all;
  }
  get empty(): boolean {
    return this.chunks.length === 0;
  }
}

/** A call that soft-paused (REQ-TOOLS-098): its screen keeps filling and a later poll reads what is new. */
interface PausedCall {
  readonly start: string;
  readonly end: string;
  readonly screen: ScreenEmulator;
  /** Chunks the screen has not been given yet; the next poll feeds them in one write. */
  readonly hold: HeldBytes;
  /** The cleaned text an earlier poll already handed over; a poll returns what follows it. */
  delivered: string;
  onEnd: ((code: number) => void) | null;
  code: number | null;
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

/**
 * ADR-0020's exit-status expression, over whichever flag carried "the last statement succeeded": `$?` on the
 * single-line path, and the payload's own flag on the multi-line one. A native command's status is in
 * `$LASTEXITCODE` either way (REQ-TOOLS-179).
 */
function powershellExit(ok: string): string {
  return `$(if (${ok}) { if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 } } else { if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 } })`;
}

/** The two shells' one-liners that bracket a command with the markers and recover the exit status. */
export function wrapCommand(backend: ShellBackend, command: string, start: string, end: string): string {
  if (backend.kind === 'powershell') {
    // ConPTY SWALLOWS the newlines of a submitted line, so a multi-line command arrived folded — a here-string
    // ran together into one unterminated line, a `foreach` body became arguments to whatever preceded it, and
    // the call either parsed as something else entirely or never terminated (ADR-0020's note, 2026-09-12). Such
    // a command is carried across as base64 and rebuilt as a script block on the far side, where its newlines
    // are intact. DOT-SOURCED, not `&`-invoked: measured, `&` runs the payload in a child scope and what the
    // command sets is gone by the next call, which is the persistence this tool promises. Measured too, neither
    // form propagates `$?` out of the payload — a failing cmdlet reported 0 — so the payload records `$?` into
    // a flag named for this call's nonce, and the exit expression reads that instead. The `try` is what keeps a
    // terminating error from eating the end frame and wedging the session until the hard cap.
    if (command.includes('\n')) {
      const flag = `$global:${end}_ok`;
      const payload = Buffer.from(`${command}\n${flag} = $?`, 'utf8').toString('base64');
      return `$global:LASTEXITCODE = $null; ${flag} = $true; Write-Output '${start}'; `
        + `try { . ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))) } `
        + `catch { ${flag} = $false; Write-Output ($_ | Out-String).TrimEnd() }; `
        + `Write-Output ('${end}:' + ${powershellExit(flag)})`;
    }
    // `$?` says whether the last statement succeeded; a native command's status is in $LASTEXITCODE.
    return `$global:LASTEXITCODE = $null; Write-Output '${start}'; ${command}; Write-Output ('${end}:' + ${powershellExit('$?')})`;
  }
  // The posix branch is left as it stands: a real pty's line discipline passes a newline through as a line
  // terminator rather than swallowing it, so `sh` reads a multi-line command across lines as written. That is
  // reasoning, not measurement — no POSIX shell runs on the host this was built on, and REQ-TOOLS-104 sends
  // Windows to PowerShell — and it is recorded as owed in ADR-0020's note.
  return `printf '%s\\n' '${start}'; ${command}; printf '${end}:%s\\n' "$?"`;
}

export class ForegroundSession {
  readonly id: string;
  private pty: PtyLike | null = null;
  private state: 'idle' | 'running' | 'resetting' = 'idle';
  private chain: Promise<unknown> = Promise.resolve();
  private listeners: ((chunk: string) => void)[] = [];
  /** Part AL: the live stream's taps — every byte the PTY produces, before the capture reads it (REQ-TOOLS-127). */
  private taps: ((chunk: string) => void)[] = [];
  private size = { cols: 240, rows: 50 };
  private active: { readonly start: string; readonly end: string; readonly onEnd: (code: number) => void; readonly onKill: (reset: boolean) => void } | null = null;
  private pendingText = '';
  private reinitialized = false;
  private pausedCommand: PausedCall | null = null;
  /** A paused command that has since finished: its output and exit status wait for the next poll. */
  private pausedDone: PausedCall | null = null;

  constructor(private readonly deps: SessionDeps, id?: string) {
    this.id = id ?? `ts_${randomBytes(4).toString('hex')}`;
  }

  get pid(): number | null {
    return this.pty?.pid ?? null;
  }
  get isRunning(): boolean {
    return this.state === 'running';
  }
  get cols(): number {
    return this.size.cols;
  }
  get rows(): number {
    return this.size.rows;
  }

  /** Part AL: a tap on the PTY's output, in arrival order, ahead of the capture; the returned function removes it. */
  onOutput(cb: (chunk: string) => void): () => void {
    this.taps.push(cb);
    return () => { this.taps = this.taps.filter((t) => t !== cb); };
  }
  /** REQ-SHELL-093/100/106: the real terminal follows the grid; a later spawn takes the last size asked for. */
  resize(cols: number, rows: number): void {
    this.size = { cols: Math.max(1, cols), rows: Math.max(1, rows) };
    try { this.pty?.resize(this.size.cols, this.size.rows); } catch (cause) { this.deps.warn(`terminal session ${this.id}: resize refused: ${String(cause)}`); }
  }
  /** REQ-SHELL-093: interrupt is the Ctrl-C control byte, end-input Ctrl-D, both written to the PTY as is. */
  interrupt(): void {
    this.ensure().write('\x03');
  }
  endInput(): void {
    this.ensure().write('\x04');
  }
  /**
   * REQ-SHELL-092 / REQ-TOOLS-128: the user's kill. The process tree behind the running command is terminated and
   * the session restarted — the same reset a hard timeout performs (REQ-TOOLS-099) — and the running call returns
   * exit −1 (REQ-TOOLS-179: killed) with the reason stated. False when nothing is running.
   */
  killActive(): boolean {
    const a = this.active;
    if (!a || this.state !== 'running') return false;
    this.active = null;
    this.state = 'resetting';
    const reset = this.resetNow();
    a.onKill(reset);
    return true;
  }

  private ensure(): PtyLike {
    if (this.pty) return this.pty;
    const { backend } = this.deps;
    const args = backend.kind === 'powershell'
      ? ['-NoLogo', '-NoProfile', '-NoExit', '-Command', "Remove-Module PSReadLine -ErrorAction SilentlyContinue; function prompt { '' }; $ProgressPreference = 'SilentlyContinue'"]
      : ['-i'];
    const p = this.deps.factory.spawn(backend.file, args, { cwd: this.deps.cwd, env: { ...this.deps.env, TERM: 'dumb', PSModuleAnalysisCachePath: '' }, cols: this.size.cols, rows: this.size.rows, name: 'dumb' });
    p.onData((d) => this.onData(d));
    p.onExit(() => { if (this.pty === p) this.pty = null; });
    this.pty = p;
    return p;
  }

  private onData(chunk: string): void {
    for (const t of this.taps) { try { t(chunk); } catch (cause) { this.deps.warn(`terminal session ${this.id}: an output tap raised: ${String(cause)}`); } }
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
    if (this.pausedCommand) { this.pausedCommand.code = code; this.pausedDone = this.pausedCommand; this.pausedCommand = null; }
    handler?.(code);
  }

  /** The capture: the emulated screen with the echoed command line and both marker frames removed. */
  static clean(screenText: string, start: string, end: string): string {
    return ForegroundSession.cleanLines(screenText, start, end).join('\n').replace(/\s+$/, '');
  }

  private static cleanLines(screenText: string, start: string, end: string): string[] {
    const lines = screenText.split('\n');
    // Everything up to and including the line that is exactly the start marker is echo/prompt.
    const startAt = lines.findIndex((l) => l.trim() === start);
    let body = (startAt >= 0 ? lines.slice(startAt + 1) : lines).join('\n');
    // The end frame is cut at its FIRST occurrence, wherever it sits. Removing whole LINES that began with it
    // left the marker in what the agent read whenever the command's last write had no trailing newline and the
    // frame landed mid-line — `Property          : __rot_…_e:0`, verbatim from the run of 2026-09-12. Detection
    // in `onData` has always been unanchored; this is its sibling on the removal side (ADR-0020's note).
    const at = body.search(new RegExp(`${end}:-?\\d+`));
    if (at >= 0) body = body.slice(0, at);
    // The echoed wrapper can spill after the start marker when the line wrapped: drop lines that are fragments of it.
    return body.split('\n').filter((l) => !l.includes('Write-Output (') && !l.includes("printf '%s"));
  }

  /** ADR-0021's emulator for one call's capture, sized by REQ-TOOLS-097's cap (`FOREGROUND_SCREEN_LINES`). */
  private newScreen(): ScreenEmulator {
    return this.deps.emulator({ cols: this.size.cols, rows: this.size.rows, scrollback: Math.max(0, FOREGROUND_SCREEN_LINES - this.size.rows) });
  }

  /** REQ-TOOLS-187: a queue of one — a second foreground call waits for the first. */
  run(command: string, opts: { timeoutMs: number | null; hardMs?: number; signal?: AbortSignal }): Promise<ForegroundResult> {
    const next = this.chain.then(() => this.execute(command, opts));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async execute(command: string, opts: { timeoutMs: number | null; hardMs?: number; signal?: AbortSignal }): Promise<ForegroundResult> {
    const { timers, monotonic } = this.deps;
    const p = this.ensure();
    this.state = 'running';
    const reinit = this.reinitialized;
    this.reinitialized = false;
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    const end = `__rot_${nonce}_e`;
    const screen = this.newScreen();
    // The chunks are HELD and given to the screen in ONE write when the call ends, not fed as they arrive.
    // Fed as they arrived — `writes = writes.then(() => screen.write(chunk))` — each awaited write cost a whole
    // `@xterm/headless` write-buffer turn, and the 10,000-line flood of `pnpm terminal-stream-proof` went from
    // 2,965 ms to over 30,000 ms and timed the proof out. Batched it is 3,911 ms for the same flood. Nothing
    // watches this screen while the call runs — the LIVE stream is the tap in `streams.ts`, which is separate
    // and still incremental (REQ-TOOLS-127) — so there is nothing to pay that per-chunk turn for.
    // Held, but never without a bound: a command that prints without stopping used to be capped at twice
    // REQ-TOOLS-097's character cap while it ran, and holding the chunks instead must not give that up.
    const hold = new HeldBytes(this.size.cols);
    let lastOutputAt = monotonic.now();
    const listener = (chunk: string) => {
      lastOutputAt = monotonic.now();
      hold.push(chunk);
    };
    this.listeners.push(listener);
    const done = new Promise<{ kind: 'exit'; code: number } | { kind: 'timeout' } | { kind: 'pause' } | { kind: 'abort' } | { kind: 'kill'; reset: boolean }>((resolve) => {
      this.active = { start, end, onEnd: (code) => resolve({ kind: 'exit', code }), onKill: (reset) => resolve({ kind: 'kill', reset }) };
      let hard: TimerHandle | null = null;
      let soft: TimerHandle | null = null;
      // REQ-TOOLS-097: the two bounds are armed TOGETHER and whichever is reached first governs the call. The
      // hard one is the call's own timeout, else `runtime.shell_command_timeout` (REQ-CONFIG-116) as `hardMs`.
      // Written as `if (timeout) {hard} else {soft}`, the default path — the one an agent takes when it names no
      // timeout — carried NO hard cap at all, and a wedged command sat until someone killed it by hand.
      const hardMs = opts.timeoutMs ?? opts.hardMs ?? null;
      if (hardMs !== null) hard = timers.after(hardMs as Millis, () => resolve({ kind: 'timeout' }));
      // REQ-TOOLS-098's soft pause is for a call that supplied no timeout, and only for one.
      if (opts.timeoutMs === null) {
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
    await screen.write(hold.take());
    const lines = ForegroundSession.cleanLines(screen.text(), start, end);
    const finish = (r: Omit<ForegroundResult, 'output' | 'truncated' | 'sessionReinitialized'>): ForegroundResult => {
      let text = lines.join('\n').replace(/\s+$/, '');
      // REQ-TOOLS-097's 100,000-character cap, truncated from the OLDEST end, over what the screen retained.
      let cut = screen.truncated || hold.dropped;
      if (text.length > FOREGROUND_CAP) { text = text.slice(-FOREGROUND_CAP); cut = true; }
      return { ...r, output: text, truncated: cut, sessionReinitialized: reinit };
    };
    if (outcome.kind === 'exit') {
      this.state = 'idle';
      const r = finish({ exitCode: outcome.code, timedOut: false, softPaused: false, killStatus: null, error: null });
      screen.dispose();
      return r;
    }
    if (outcome.kind === 'pause') {
      // REQ-TOOLS-098: return −1, the process keeps running; a later empty command polls what it produced since.
      // The call's screen is kept and keeps filling, so the poll reads the same emulated screen further along.
      this.pausedDone?.screen.dispose();
      this.pausedDone = null;
      // A pause nobody ever polled is replaced here: release its listener and its screen rather than leave both.
      this.pausedCommand?.onEnd?.(-1);
      this.pausedCommand?.screen.dispose();
      const paused: PausedCall = { start, end, screen, hold, delivered: lines.join('\n').replace(/\s+$/, ''), onEnd: null, code: null };
      this.pausedCommand = paused;
      this.active = null;
      this.state = 'idle';
      const pausedListener = (chunk: string) => { paused.hold.push(chunk); };
      this.listeners.push(pausedListener);
      paused.onEnd = () => { this.listeners = this.listeners.filter((l) => l !== pausedListener); };
      return finish({ exitCode: -1, timedOut: false, softPaused: true, killStatus: null, error: null });
    }
    if (outcome.kind === 'kill') {
      // Part AL / REQ-SHELL-092: killed from the terminal window; the tree is gone and the session was restarted by `killActive`.
      const r = finish({ exitCode: -1, timedOut: false, softPaused: false, killStatus: outcome.reset ? 'session_reset' : 'reset_failed', error: 'the command was killed from the terminal window' });
      screen.dispose();
      return r;
    }
    // timeout or abort: REQ-TOOLS-097/099 — the whole tree goes, the session restarts, shell state is lost.
    this.active = null;
    this.state = 'resetting';
    const reset = this.resetNow();
    const r = finish({ exitCode: 124, timedOut: true, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: outcome.kind === 'abort' ? 'the call was cancelled' : null });
    screen.dispose();
    return r;
  }

  private readonly clearers = new Map<string, () => void>();

  /**
   * REQ-TOOLS-098's poll: an empty command after a soft pause returns what arrived since, or the final exit.
   * Read off the paused call's own screen, past the lines an earlier poll already handed over, and cut at the
   * end frame on the same unanchored terms as the capture — the anchored form left the marker here too.
   */
  async poll(): Promise<ForegroundResult> {
    const done = this.pausedDone;
    if (done) {
      this.pausedDone = null;
      const out = await ForegroundSession.sincePoll(done);
      const truncated = done.screen.truncated || done.hold.dropped;
      done.screen.dispose();
      return { output: out, exitCode: done.code ?? 0, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated, error: null };
    }
    const pc = this.pausedCommand;
    if (!pc) return { output: '', exitCode: 0, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated: false, error: 'No paused command to poll.' };
    return { output: await ForegroundSession.sincePoll(pc), exitCode: -1, timedOut: false, softPaused: true, killStatus: null, sessionReinitialized: false, truncated: pc.screen.truncated || pc.hold.dropped, error: null };
  }

  /**
   * The paused call's retained screen beyond what an earlier poll already returned. The already-delivered
   * text is matched as a PREFIX rather than counted in lines: at the moment of the pause the body is often a
   * single empty line that the command then fills, and counting lines consumed it — the output the poll owed
   * came back as `(no output)`. A screen that rewrote what it had already shown fails the prefix and the whole
   * retained text is returned, which is the safe direction.
   */
  private static async sincePoll(p: PausedCall): Promise<string> {
    if (!p.hold.empty) await p.screen.write(p.hold.take());
    const text = ForegroundSession.clean(p.screen.text(), p.start, p.end);
    const from = p.delivered !== '' && text.startsWith(p.delivered) ? p.delivered.length : 0;
    p.delivered = text;
    return text.slice(from).replace(/^\n+/, '').replace(/\s+$/, '');
  }

  /** Kill the tree and start a fresh shell. True when a fresh shell is up. */
  resetNow(): boolean {
    const old = this.pty;
    this.pty = null;
    this.active = null;
    this.pausedCommand?.screen.dispose();
    this.pausedCommand = null;
    this.pausedDone?.screen.dispose();
    this.pausedDone = null;
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
    this.pausedCommand?.screen.dispose();
    this.pausedCommand = null;
    this.pausedDone?.screen.dispose();
    this.pausedDone = null;
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
