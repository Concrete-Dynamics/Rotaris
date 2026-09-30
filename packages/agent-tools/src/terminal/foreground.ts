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
  /** PD-TOOLS-001: what the post-reset restore did — carried into the observation's detail. */
  readonly restore: RestoreOutcome;
  /**
   * REQ-TOOLS-098 (live-run L2): what a poll of a command still running actually measured, on the monotonic clock —
   * the time since the previous observation of the command (its soft pause, or the poll before this one), and the time
   * since the command last wrote anything. Absent on every other result.
   */
  readonly waited?: { readonly sinceObservedMs: number; readonly silentMs: number };
}

export const FOREGROUND_CAP = 100_000;
/**
 * A10 / OQ-144: the reason a poll gives for a soft-paused command that ended with no end frame of its own — the shell
 * abandoned the rest of its line, as it does on an interrupt, and went on to the next call's.
 */
const PAUSED_ENDED_WITHOUT_STATUS = 'the paused command ended without an exit status of its own: the shell abandoned the rest of its line, as an interrupt (C-c) makes it do, before the next command ran';
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
  /** The exit status its own end frame carried; null while it runs, and for a call that ended with no frame (`until`). */
  code: number | null;
  /**
   * Set when the call was closed by the NEXT call's end frame because its own never printed — an interrupt (`C-c`) makes
   * an interactive `sh` abandon the rest of the wrapper's line (A10): the next call's start marker, where what the
   * paused call collected stops.
   */
  until: string | null;
  /** Monotonic time the command last wrote anything (live-run L2). */
  lastOutputAt: number;
  /** Monotonic time of the previous observation of the command: its soft pause, then each poll (live-run L2). */
  observedAt: number;
}

/**
 * REQ-TOOLS-127 (live-run finding L9): what the live stream is given of one call — the bytes the COMMAND wrote, which
 * lie between the start marker the wrapper prints and the end frame it prints after. The PTY carries more than that: the
 * shell's echo of the whole wrapped line, which names both markers; the prompt; and, after the command, the product's
 * own PD-TOOLS-001 snapshot of the shell's environment. The agent's capture has always dropped them (ADR-0020
 * consequence 2); the live tap forwarded every byte, so the preview showed `printf …` and `__rot_…_s` above the output.
 *
 * The PRINTED start marker is told from its echo by what follows it: the echo quotes it (`'__rot_…_s'`), the printed
 * one ends its row. Everything up to and including that row is withheld. From there bytes pass through, less a tail
 * that could still be the beginning of the end frame, which is held until the next chunk decides it; the end frame is
 * cut at its first occurrence, as the capture cuts it, and nothing after it passes. The markers are per-call nonces, so
 * no command can spell one to hide its own output.
 */
export class CommandRegion {
  private phase: 'before' | 'inside' | 'after' = 'before';
  private held = '';
  private readonly endFrame: string;
  constructor(private readonly start: string, end: string) {
    this.endFrame = `${end}:`;
  }
  /** True once the end frame has been seen: nothing more passes. */
  get ended(): boolean {
    return this.phase === 'after';
  }
  /** The part of `chunk` (with whatever an earlier chunk left undecided) that the command wrote; '' when none. */
  push(chunk: string): string {
    if (this.phase === 'after') return '';
    this.held += chunk;
    if (this.phase === 'before') {
      let from = 0;
      for (;;) {
        const at = this.held.indexOf(this.start, from);
        if (at < 0) {
          // Keep only what could be the start of a marker split across two chunks.
          this.held = this.held.slice(Math.max(0, this.held.length - (this.start.length - 1)));
          return '';
        }
        const after = at + this.start.length;
        if (after >= this.held.length) { this.held = this.held.slice(at); return ''; }
        if (this.held[after] === "'") { from = after; continue; }
        const nl = this.held.indexOf('\n', after);
        if (nl < 0) { this.held = this.held.slice(at); return ''; }
        this.held = this.held.slice(nl + 1);
        this.phase = 'inside';
        break;
      }
    }
    const at = this.held.indexOf(this.endFrame);
    if (at >= 0) {
      const out = this.held.slice(0, at);
      this.held = '';
      this.phase = 'after';
      return out;
    }
    let keep = Math.min(this.held.length, this.endFrame.length - 1);
    while (keep > 0 && !this.endFrame.startsWith(this.held.slice(this.held.length - keep))) keep -= 1;
    const out = this.held.slice(0, this.held.length - keep);
    this.held = this.held.slice(this.held.length - keep);
    return out;
  }
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
 * A pager is a hang, not a convenience, in a session no one can press RETURN in. The shell runs under a REAL
 * pseudo-terminal, so `isatty(stdout)` is true and git sets its pager up BEFORE it writes a byte — measured
 * 2026-09-22, `git diff --no-index` in the product's own PTY answered
 * `WARNING: terminal is not fully functional` / `Press RETURN to continue` and then nothing, because `TERM`
 * is `dumb` and `less` waits for a keystroke that only a human sends. The command never reaches its end
 * marker and the call dies at the hard timeout with exit 124 (REQ-TOOLS-099) whatever it was going to say.
 * Naming the pager `cat` is the one thing that makes `git diff`, `git log` and `git show` answerable here;
 * `GIT_PAGER` covers git even where a user's `core.pager` names something else, and `PAGER` covers the rest.
 */
const NO_PAGER: Record<string, string> = { GIT_PAGER: 'cat', PAGER: 'cat' };

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
  // FALSIFIED, kept beside its replacement (ADR-0020's note, POSIX first execution 2026-09-16): "a real pty's
  // line discipline passes a newline through as a line terminator rather than swallowing it, so `sh` reads a
  // multi-line command across lines as written". The line discipline does pass the newlines — and that is the
  // problem, not the remedy. A command whose first line does not parse to completion puts the shell on its
  // continuation prompt, so the pty ECHOES the remaining lines, and the echo of the line carrying the start
  // marker then lands INSIDE the captured region. Measured: a here-string's capture came back
  // `LINE TWO"\n> <marker>\n$ LINE ONE\nLINE TWO` where `LINE ONE\nLINE TWO` was the whole of the output.
  //
  // So the posix branch does what the PowerShell branch does, for the same reason: a multi-line command is
  // carried across as ONE physical line and rebuilt on the far side, where its newlines are intact. `%b` is
  // POSIX printf's own escape-expanding conversion, `eval` runs the result in THIS shell — not a subshell, so
  // what the command sets persists into the next call — and `$?` after it is the payload's own status.
  //
  // FALSIFIED, kept beside its replacement (live-run finding L1, 2026-09-29): "the single-line path keeps today's
  // wrapper byte for byte" — `printf <start>; <command>; printf <end>`, nothing guarding the command. An interactive
  // `sh` that meets an error in the LINE it is running — an expansion it cannot perform (`${PIPESTATUS[0]}` under
  // dash: `Bad substitution`), a syntax it does not have (`<(…)`: `Syntax error: "(" unexpected`), an unterminated
  // quote — abandons the rest of that line; a trailing `# note` comments it out. Either way the end frame never
  // printed, and a command that finished in 0.1 s read as a soft pause, exit −1. Plain `eval` is no guard: an error
  // inside a SPECIAL built-in abandons the line the same way (measured under dash and bash). `command eval` is:
  // POSIX's `command` takes a special built-in's special properties away, so the error becomes that utility's own
  // nonzero status and the shell goes on to the end frame — dash reports 2. This is the posix twin of the PowerShell
  // branch's `try`. The command reaches `eval` single-quoted, one physical line either way, and still runs in THIS
  // shell, so what it sets persists as before.
  const payload = command.includes('\n')
    ? `"$(printf '%b' '${command.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/'/g, `'\\''`)}')"`
    : `'${command.replace(/'/g, `'\\''`)}'`;
  return `printf '%s\\n' '${start}'; command eval ${payload}; printf '${end}:%s\\n' "$?"`;
}

/**
 * PD-TOOLS-001 — the shell state a hard-timeout reset re-applies: the working directory and the
 * exported variables. The snapshot is taken after a completed command, when the shell is idle and
 * responsive; the restore runs after the reset respawned a fresh shell. Both are best effort: a
 * snapshot that cannot be parsed keeps the previous capture, and a restore that fails is reported in
 * the observation's detail while the REQ-TOOLS-099 contract (124/session_reset/state lost) stands.
 * Aliases, functions and background jobs are captured by neither — they cannot be enumerated reliably
 * from outside the shell that held them — and the detail says so.
 *
 * A snapshot whose own capture times out leaves the session freshly reset with the PREVIOUS capture
 * still held (stale by one command); the next completed command refreshes it. The direction is
 * deliberate: a stale restore that fails is reported, while no restore abandons the directory.
 */
export interface ShellState {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export type RestoreOutcome =
  | { readonly status: 'restored'; readonly cwd: string; readonly vars: number }
  | { readonly status: 'none' }
  | { readonly status: 'failed' };

/** Bound on the snapshot/restore round trip: the shell just proved responsive (or just respawned). */
export const SNAPSHOT_TIMEOUT_MS = 15_000;

/**
 * PD-TOOLS-001's capture line: the shell's own cwd plus every exported variable, one per line. The
 * marker literals are assembled through variables (`$__p`, `$P`) rather than written inline, so the
 * PTY's echo of this command can never itself match the parse below however the screen wraps it.
 */
export function snapshotCommand(backend: ShellBackend): string {
  if (backend.kind === 'powershell') {
    return `$__p = '__rot_cwd__'; Write-Output ($__p + ':' + (Get-Location).Path); $__q = '__rot_env__'; Get-ChildItem Env: | ForEach-Object { Write-Output ($__q + ':' + $_.Name + '=' + $_.Value) }`;
  }
  // POSIX: the directory and `env -0`, NUL-separated, as base64 folded to 64 columns. The capture is the EMULATED
  // screen (ADR-0021), which wraps a line at its width, and a wrapped line cannot be told from a value's own newline:
  // a PATH longer than the 240 columns came back with a newline inside it and the restore broke every command lookup
  // (`sleep: not found`), measured on Linux 2026-09-24. A 64-column line never wraps, and NUL separates entries even
  // where a value holds a newline.
  return `Q='__rot_b64__'; { printf '%s\\0' "$PWD"; env -0; } | base64 | fold -w 64 | sed "s/^/$Q:/"`;
}

/** PD-TOOLS-001, POSIX: the decoded capture — the directory, then `NAME=value` entries, NUL-separated. */
function parseEncodedSnapshot(chunks: readonly string[]): ShellState | null {
  const [cwd, ...entries] = Buffer.from(chunks.join(''), 'base64').toString('utf8').split('\0');
  const env: Record<string, string> = {};
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  // A capture with no variables is a shell that could not list them (no `env -0`), never an empty environment:
  // restoring it would unset every variable the fresh shell has, so it is refused and the previous capture kept.
  if (cwd === undefined || cwd === '' || Object.keys(env).length === 0) return null;
  return { cwd, env };
}

/** PD-TOOLS-001's parse: POSIX's encoded capture when present; otherwise (PowerShell) the last cwd line wins, env lines after it, continuations rejoin. */
export function parseSnapshot(output: string): ShellState | null {
  const encoded = output.split('\n').filter((line) => line.startsWith('__rot_b64__:')).map((line) => line.slice('__rot_b64__:'.length).trim());
  if (encoded.length > 0) return parseEncodedSnapshot(encoded);
  let cwd: string | null = null;
  let env: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('__rot_cwd__:')) {
      cwd = line.slice('__rot_cwd__:'.length);
      env = {};
      cur = null;
      continue;
    }
    if (line.startsWith('__rot_env__:')) {
      const rest = line.slice('__rot_env__:'.length);
      const eq = rest.indexOf('=');
      if (eq >= 0) {
        cur = rest.slice(0, eq);
        env[cur] = rest.slice(eq + 1);
      } else {
        cur = null;
      }
      continue;
    }
    if (cur !== null) env[cur] += `\n${line}`;
  }
  if (cwd === null) return null;
  return { cwd, env };
}

function psQuote(s: string): string {
  return `'${s.replace(/'/g, `''`)}'`;
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Shell-managed variables no restore may set: the directory arrives via cd, the rest are per-process. */
const POSIX_RESTORE_SKIP: ReadonlySet<string> = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

export interface RestorePlan {
  readonly line: string;
  readonly vars: number;
}

/**
 * PD-TOOLS-001's re-apply: every variable that differs from the spawn environment, removals for spawn
 * variables the snapshot no longer holds, and the directory change LAST so the exit status reports it.
 * Null when there is nothing to do — the snapshot already matches the fresh shell.
 */
export function restoreCommand(backend: ShellBackend, snap: ShellState, spawn: { cwd: string; env: Readonly<Record<string, string>> }): RestorePlan | null {
  if (backend.kind === 'powershell') {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(snap.env)) {
      if (spawn.env[k] !== v) parts.push(`Set-Item -LiteralPath ${psQuote(`Env:${k}`)} -Value ${psQuote(v)}`);
    }
    for (const k of Object.keys(spawn.env)) {
      if (!(k in snap.env)) parts.push(`Remove-Item -LiteralPath ${psQuote(`Env:${k}`)} -ErrorAction SilentlyContinue`);
    }
    if (parts.length === 0 && snap.cwd === spawn.cwd) return null;
    parts.push(`Set-Location -LiteralPath ${psQuote(snap.cwd)}`);
    return { line: parts.join('; '), vars: parts.length - 1 };
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(snap.env)) {
    if (POSIX_RESTORE_SKIP.has(k)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    if (spawn.env[k] !== v) parts.push(`export ${k}=${shQuote(v)}`);
  }
  for (const k of Object.keys(spawn.env)) {
    if (POSIX_RESTORE_SKIP.has(k)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    if (!(k in snap.env)) parts.push(`unset ${k}`);
  }
  if (parts.length === 0 && snap.cwd === spawn.cwd) return null;
  parts.push(`cd ${shQuote(snap.cwd)}`);
  return { line: parts.join(' && '), vars: parts.length - 1 };
}

export class ForegroundSession {
  readonly id: string;
  private pty: PtyLike | null = null;
  private state: 'idle' | 'running' | 'resetting' = 'idle';
  private chain: Promise<unknown> = Promise.resolve();
  private listeners: ((chunk: string) => void)[] = [];
  /**
   * Part AL: the live stream's taps, ahead of the capture (REQ-TOOLS-127). Since live-run L9 they are given what the
   * running call's command wrote — `region` — and not every byte the PTY produces.
   */
  private taps: ((chunk: string) => void)[] = [];
  /** The call whose output the taps are given; null between calls, and during the product's own snapshot and restore. */
  private region: CommandRegion | null = null;
  private size = { cols: 240, rows: 50 };
  private active: { readonly start: string; readonly end: string; readonly onEnd: (code: number) => void; readonly onKill: (reset: boolean) => void } | null = null;
  private pendingText = '';
  /**
   * True while keystrokes the session wrote (REQ-TOOLS-096: an agent's `is_input`, a control surface's send-keys) may
   * still sit in the shell's input as a partial line — their last byte was not a line end. The next line the product
   * submits clears that line first (`submit`), so the keystrokes cannot prefix the wrapper (A10).
   */
  private typeahead = false;
  private reinitialized = false;
  private pausedCommand: PausedCall | null = null;
  /** A paused command that has since finished: its output and exit status wait for the next poll. */
  private pausedDone: PausedCall | null = null;
  /**
   * PD-TOOLS-001's last-known shell state: the cwd and exported variables of the most recent
   * COMPLETED command, refreshed after every exit. The reset path re-applies it to the respawned
   * shell; a snapshot that cannot be parsed keeps the previous capture rather than clearing it.
   */
  private lastState: ShellState | null = null;

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

  /**
   * Part AL: a tap on what the running command writes, in arrival order, ahead of the capture — the wrapper's echo, its
   * markers, the prompt and the product's own snapshot withheld (live-run L9); the returned function removes it.
   */
  onOutput(cb: (chunk: string) => void): () => void {
    this.taps.push(cb);
    return () => { this.taps = this.taps.filter((t) => t !== cb); };
  }
  /** REQ-SHELL-093/100/106: the real terminal follows the grid; a later spawn takes the last size asked for. */
  resize(cols: number, rows: number): void {
    this.size = { cols: Math.max(1, cols), rows: Math.max(1, rows) };
    try { this.pty?.resize(this.size.cols, this.size.rows); } catch (cause) { this.deps.warn(`terminal session ${this.id}: resize refused: ${String(cause)}`); }
  }
  /**
   * REQ-SHELL-093: interrupt is the Ctrl-C control byte, end-input Ctrl-D, both written to the PTY as is. Neither sets
   * `typeahead`, deliberately: `^C` makes the line discipline discard its pending input and `^D` submits it, so neither
   * leaves a partial line behind. `sendInput` sets it for any text not ending in a line end, control bytes included, so
   * an agent's `C-c` costs the next line one `^U` over an empty line, which erases nothing (A10).
   */
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
    const p = this.deps.factory.spawn(backend.file, args, { cwd: this.deps.cwd, env: { ...this.deps.env, ...NO_PAGER, TERM: 'dumb', PSModuleAnalysisCachePath: '' }, cols: this.size.cols, rows: this.size.rows, name: 'dumb' });
    // A fresh shell's input holds nothing: whatever was typed into the last one went with it.
    this.typeahead = false;
    p.onData((d) => this.onData(d));
    p.onExit(() => { if (this.pty === p) this.pty = null; });
    this.pty = p;
    return p;
  }

  private onData(chunk: string): void {
    const shown = this.region?.push(chunk) ?? '';
    if (shown !== '') for (const t of this.taps) { try { t(shown); } catch (cause) { this.deps.warn(`terminal session ${this.id}: an output tap raised: ${String(cause)}`); } }
    for (const l of this.listeners) l(chunk);
    if (!this.active && !this.pausedCommand) return;
    this.pendingText += chunk;
    // The echoed wrapper carries the marker text too (`'__rot_x_e:' + $(...`), so the match is the marker
    // FOLLOWED BY DIGITS on the VT-stripped stream — only the shell's own Write-Output produces that.
    const text = stripVt(this.pendingText);
    const frame = (end: string): number | null => {
      const m = new RegExp(`${end}:(-?\\d+)`).exec(text);
      return m ? Number(m[1]) : null;
    };
    // A soft-paused call and the call queued behind it share the stream, and the shell runs their lines in order, so the
    // paused call's frame, when it prints, comes first. The active call's frame means the shell has finished the paused
    // line whether or not that line reached its own frame: a paused command interrupted with `C-c` (REQ-TOOLS-098's
    // advice) makes an interactive `sh` abandon the rest of the line, frame and all. So the paused call closes on its own
    // frame, with its own status, and otherwise on the active call's frame, with NO status; what it collected is read up
    // to the next call's printed start marker (`until`), so nothing the later calls or the snapshot write is ever read as
    // the paused command's (A10). Its listener goes with it: left, it kept filling the closed call's hold until the poll,
    // bounded by `HeldBytes` alone, which could mark the poll `truncated` for bytes that were never the command's.
    //
    // FALSIFIED, kept beside its replacement (A10's verification, 2026-09-30): "the active call's end marker, else the
    // paused call's; a match closes both". The paused call took the ACTIVE call's exit status — a paused `false` behind a
    // `true` read 0 — and its listener stayed, so after a `C-c` its poll read the later calls' marker frames and the
    // PD-TOOLS-001 snapshot's `__rot_b64__` lines, which encode the shell's whole environment.
    // FALSIFIED in turn, kept beside it (A10's first repair, 2026-09-30, corrected before its merge): "the paused call
    // closes on its own frame only". It rested on the claim that the old form never matched the paused frame while a
    // call ran and so read "still running" — untrue, the old form closed it, with the wrong status. And a paused call
    // interrupted with `C-c` prints no frame, so under that reading it read "still running" on every poll after its
    // process was gone, and its listener collected every later call's output and snapshot.
    const paused = this.pausedCommand;
    const active = this.active;
    const pausedCode = paused ? frame(paused.end) : null;
    const activeCode = active ? frame(active.end) : null;
    if (paused && (pausedCode !== null || activeCode !== null)) {
      paused.code = pausedCode;
      if (pausedCode === null && active) paused.until = active.start;
      this.pausedDone = paused;
      this.pausedCommand = null;
      paused.onEnd?.(pausedCode ?? -1);
    }
    if (active && activeCode !== null) {
      this.active = null;
      active.onEnd(activeCode);
    }
    if (!this.active && !this.pausedCommand) this.pendingText = '';
  }

  /** The capture: the emulated screen with the echoed command line and both marker frames removed. */
  static clean(screenText: string, start: string, end: string, until: string | null = null): string {
    return ForegroundSession.cleanLines(screenText, start, end, until).join('\n').replace(/\s+$/, '');
  }

  private static cleanLines(screenText: string, start: string, end: string, until: string | null = null): string[] {
    // The echoed wrapper is dropped BEFORE the start marker is looked for, not only after it. The marker's own
    // line can carry the shell's PROMPT in front of it: the line discipline echoes what we wrote as soon as it
    // arrives, and the shell prints its prompt when it reads — so when the write lands first, the screen reads
    // `<echo>` on one row and `$ <marker>` on the next. The old reading required a row that was EXACTLY the
    // marker, found none, kept the whole screen, and handed the agent `$ <marker>` as though the command had
    // printed it. Rare, load-dependent and real: measured under a concurrently running suite on Linux,
    // 2026-09-16. A row that ENDS with the marker is the marker's row whatever stands in front of it, and the
    // marker is a per-call nonce, so no command can spell one to cut its own capture short (consequence 1).
    const lines = screenText.split('\n').filter((l) => !l.includes('Write-Output (') && !l.includes("printf '%s"));
    const startAt = lines.findIndex((l) => l.trimEnd().endsWith(start));
    let kept = startAt >= 0 ? lines.slice(startAt + 1) : lines;
    // A paused call closed with no frame of its own (A10) stops at the next call's PRINTED start marker, found on the
    // same terms as its own: what follows is the next call's, and after that the product's snapshot.
    if (until !== null) {
      const next = kept.findIndex((l) => l.trimEnd().endsWith(until));
      if (next >= 0) kept = kept.slice(0, next);
    }
    let body = kept.join('\n');
    // The end frame is cut at its FIRST occurrence, wherever it sits. Removing whole LINES that began with it
    // left the marker in what the agent read whenever the command's last write had no trailing newline and the
    // frame landed mid-line — `Property          : __rot_…_e:0`, verbatim from the run of 2026-09-12. Detection
    // in `onData` has always been unanchored; this is its sibling on the removal side (ADR-0020's note).
    const at = body.search(new RegExp(`${end}:-?\\d+`));
    if (at >= 0) body = body.slice(0, at);
    return body.split('\n');
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
    this.region = new CommandRegion(start, end);
    this.submit(p, wrapCommand(this.deps.backend, command, start, end));
    const outcome = await done;
    // Only a soft-paused command keeps writing to its stream; after any other outcome what the PTY carries is the
    // product's own — the snapshot, the reset, the restore — and none of it is the command's (live-run L9).
    if (outcome.kind !== 'pause') this.region = null;
    this.clearers.get(nonce)?.();
    this.clearers.delete(nonce);
    this.listeners = this.listeners.filter((l) => l !== listener);
    await screen.write(hold.take());
    const lines = ForegroundSession.cleanLines(screen.text(), start, end);
    const finish = (r: Omit<ForegroundResult, 'output' | 'truncated' | 'sessionReinitialized' | 'restore'>): ForegroundResult => {
      let text = lines.join('\n').replace(/\s+$/, '');
      // REQ-TOOLS-097's 100,000-character cap, truncated from the OLDEST end, over what the screen retained.
      let cut = screen.truncated || hold.dropped;
      if (text.length > FOREGROUND_CAP) { text = text.slice(-FOREGROUND_CAP); cut = true; }
      return { ...r, output: text, truncated: cut, sessionReinitialized: reinit, restore: { status: 'none' } };
    };
    if (outcome.kind === 'exit') {
      this.state = 'idle';
      const r = finish({ exitCode: outcome.code, timedOut: false, softPaused: false, killStatus: null, error: null });
      screen.dispose();
      // PD-TOOLS-001: the shell proved responsive and idle — refresh the snapshot for the next reset.
      // Awaited, not fired-and-forgotten: the refresh rides the session's own marker scan, and a
      // concurrent next command would overwrite `active` and wedge until the hard cap. One quick
      // round trip per completed command is the cost of a snapshot that is never stale by more than one.
      await this.refreshState();
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
      const paused: PausedCall = { start, end, screen, hold, delivered: lines.join('\n').replace(/\s+$/, ''), onEnd: null, code: null, until: null, lastOutputAt, observedAt: monotonic.now() };
      this.pausedCommand = paused;
      this.active = null;
      this.state = 'idle';
      const pausedListener = (chunk: string) => { paused.hold.push(chunk); paused.lastOutputAt = monotonic.now(); };
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
    // PD-TOOLS-001 narrows what "lost" means afterwards: the cwd and exported variables snapshotted after
    // the last completed command are re-applied to the fresh shell, and the outcome names what was restored.
    // The REQ-TOOLS-099 contract stands — 124, session_reset, state lost — and the detail says both.
    this.active = null;
    this.state = 'resetting';
    const reset = this.resetNow();
    const restore: RestoreOutcome = reset ? await this.restoreState() : { status: 'failed' };
    const r = { ...finish({ exitCode: 124, timedOut: true, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: outcome.kind === 'abort' ? 'the call was cancelled' : null }), restore };
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
      // A paused call that ended with no frame of its own has no exit status to report (OQ-144): it is reported as the
      // terminal window's kill is, −1 with the reason, and never with a status another command produced (A10).
      if (done.code === null) return { output: out, exitCode: -1, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated, error: PAUSED_ENDED_WITHOUT_STATUS, restore: { status: 'none' } };
      return { output: out, exitCode: done.code, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated, error: null, restore: { status: 'none' } };
    }
    const pc = this.pausedCommand;
    if (!pc) return { output: '', exitCode: 0, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated: false, error: 'No paused command to poll.', restore: { status: 'none' } };
    // Live-run L2: a poll returns at once with what has arrived. What it states is what it measured — the time since
    // the previous observation and since the command last wrote — never the no-output window it did not wait out.
    const output = await ForegroundSession.sincePoll(pc);
    const now = this.deps.monotonic.now();
    const waited = { sinceObservedMs: Math.max(0, now - pc.observedAt), silentMs: Math.max(0, now - pc.lastOutputAt) };
    pc.observedAt = now;
    return { output, exitCode: -1, timedOut: false, softPaused: true, killStatus: null, sessionReinitialized: false, truncated: pc.screen.truncated || pc.hold.dropped, error: null, restore: { status: 'none' }, waited };
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
    const text = ForegroundSession.clean(p.screen.text(), p.start, p.end, p.until);
    const from = p.delivered !== '' && text.startsWith(p.delivered) ? p.delivered.length : 0;
    p.delivered = text;
    return text.slice(from).replace(/^\n+/, '').replace(/\s+$/, '');
  }

  /** Kill the tree and start a fresh shell. True when a fresh shell is up. */
  resetNow(): boolean {
    const old = this.pty;
    this.pty = null;
    this.active = null;
    this.region = null;
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

  /** PD-TOOLS-001: an explicit reset clears the snapshot — the user asked for a clean shell. */
  clearSnapshot(): void {
    this.lastState = null;
  }

  /** REQ-TOOLS-096: keystroke input, a special key or text, written to the PTY as is. */
  sendInput(text: string): void {
    this.ensure().write(text);
    if (text !== '') this.typeahead = !/[\r\n]$/.test(text);
  }

  /**
   * One wrapped line, submitted. Keystrokes written with no line end after them (REQ-TOOLS-096) wait in the shell's input
   * as a partial line when nothing reads them — a soft-paused `sleep` does not — and the wrapped line was APPENDED to
   * them: `xy` + `printf '%s\n' '<start>'; …` ran `xyprintf`, which is not found, so the start marker never printed; the
   * capture kept the whole screen, the paused call's late output and its own `__rot_…_e` frame with it, and the live
   * stream, which opens at the printed start marker (L9), stayed blank (A10). The partial line is cleared first with
   * the POSIX line discipline's kill character — `^U`, which node-pty sets as `VKILL` and an interactive shell's own line
   * editor binds to the same — so the wrapper is the whole of the line the shell reads. The keystrokes were written as
   * is; what is cleared is a line no one ended, which is OQ-143's reading. PowerShell is left as it was: its wrapper's
   * first statement is the exit-status reset, not the start marker, so a prefix costs that statement and, by construction,
   * not the marker (reasoned; no Windows host has run it), and ConPTY's cooked input has no `^U`.
   */
  private submit(p: PtyLike, wrapped: string): void {
    const clear = this.typeahead && this.deps.backend.kind === 'posix' ? '\x15' : '';
    this.typeahead = false;
    p.write(`${clear}${wrapped}\r`);
  }

  /**
   * PD-TOOLS-001's snapshot: run the capture line on the idle shell and parse it. Best effort —
   * a capture that cannot be parsed keeps the previous state, and a capture that times out leaves
   * the session freshly reset with that previous capture still held (stale by one command).
   */
  private async captureState(): Promise<ShellState | null> {
    try {
      const r = await this.runRaw(snapshotCommand(this.deps.backend), SNAPSHOT_TIMEOUT_MS);
      if (r.exitCode !== 0) return null;
      return parseSnapshot(r.output);
    } catch {
      return null;
    }
  }

  /** Refresh the snapshot after a completed command; a failure keeps the previous capture. */
  private async refreshState(): Promise<void> {
    const snap = await this.captureState();
    if (snap) this.lastState = snap;
  }

  /**
   * PD-TOOLS-001's restore: re-apply the last snapshot to the respawned shell. Null when there is
   * nothing to restore (no completed command yet, or the snapshot already matches the fresh shell).
   */
  private async restoreState(): Promise<RestoreOutcome> {
    const snap = this.lastState;
    if (!snap) return { status: 'none' };
    const plan = restoreCommand(this.deps.backend, snap, { cwd: this.deps.cwd, env: this.deps.env });
    if (!plan) return { status: 'none' };
    try {
      const r = await this.runRaw(plan.line, SNAPSHOT_TIMEOUT_MS);
      if (r.exitCode !== 0) return { status: 'failed' };
      return { status: 'restored', cwd: snap.cwd, vars: plan.vars };
    } catch {
      return { status: 'failed' };
    }
  }

  /**
   * One raw round trip on the idle shell, outside the queue-of-one: the snapshot and the restore
   * run when no command is active (after an exit, after a reset), so they must not wait behind the
   * chain a wedged call may still hold. The markers are the same nonce protocol `execute` uses.
   *
   * The round trip rides the session's own `onData` marker scan rather than a private poll: the
   * scan resolves the pending marker, clears `pendingText`, and hands the exit code to the handler
   * it finds. A private poll racing that scan would consume the frame first and leave the scan's
   * handler waiting until the hard cap — the shape that wedged the first draft of this restore.
   */
  private runRaw(line: string, timeoutMs: number): Promise<{ exitCode: number; output: string }> {
    const p = this.ensure();
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    const end = `__rot_${nonce}_e`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const buf: string[] = [];
      const listener = (chunk: string) => { buf.push(chunk); };
      this.listeners.push(listener);
      const timer = this.deps.timers.after(timeoutMs as Millis, () => {
        if (settled) return;
        settled = true;
        this.listeners = this.listeners.filter((l) => l !== listener);
        this.active = null;
        reject(new Error('snapshot timed out'));
      });
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        timer.cancel();
        this.listeners = this.listeners.filter((l) => l !== listener);
        const screen = this.newScreen();
        void screen.write(buf.join('')).then(() => {
          const text = ForegroundSession.clean(screen.text(), start, end);
          screen.dispose();
          resolve({ exitCode: code, output: text });
        });
      };
      this.pendingText = '';
      this.active = { start, end, onEnd: finish, onKill: () => finish(-1) };
      this.submit(p, wrapCommand(this.deps.backend, line, start, end));
    });
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
