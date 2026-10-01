import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readlinkSync } from 'node:fs';
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
  /** Null for a call that ended with no exit status of its own: a command that replaced the session's shell (OQ-144). */
  readonly exitCode: number | null;
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
  /** OQ-144: the command replaced the session's shell; the program was ended and the shell restarted. */
  readonly replaced?: true;
  /**
   * OQ-144 (the shell-exit case): the command — or, on a poll, the paused command — ended the session's shell (`exit`, a
   * signal to it); the shell was respawned with PD-TOOLS-001's snapshot re-applied, or, on a poll whose session had been
   * respawned already by a later call, nothing more was done (`killStatus` null).
   */
  readonly shellEnded?: true;
  /**
   * OQ-144 (the shell-exit case): the session's shell had ended between calls — no call was waiting on it — so this call
   * respawned it, re-applied PD-TOOLS-001's snapshot, and ran in the fresh shell; what the restore did.
   */
  readonly respawned?: RestoreOutcome;
}

/**
 * OQ-144 (acceptance finding A9): what the process behind a pid is running — its executable and its argument vector —
 * read from `/proc`, so an `exec` that keeps the pid and replaces the program is visible. Null where `/proc` does not
 * say: every host but Linux, or a process that has gone. The kernel marks an executable whose file was replaced on
 * disk since it started — a package upgrade of the shell — ` (deleted)`; that is the same program, so the mark is cut.
 */
export function processIdentity(pid: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    return `${readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '')}\0${readFileSync(`/proc/${pid}/cmdline`, 'latin1')}`;
  } catch {
    return null;
  }
}

/**
 * The repair of `a-poll-after-c-c-says-the-interrupted-command-is-still-running` (OQ-147): whether the session's shell holds
 * its terminal — the terminal's foreground process group is the shell's own — read from `/proc/<pid>/stat` (`pgrp` and
 * `tpgid`). An interactive shell gives the terminal to the job it runs and takes it back when the job is done, so after an
 * interrupt this says whether the interrupted program has gone or is still reading the terminal (a REPL that caught the
 * `C-c`). Null where `/proc` does not say: every host but Linux, or a process that has gone.
 */
export function shellHoldsTerminal(pid: number): boolean | null {
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'latin1');
    // `pid (comm) state ppid pgrp session tty_nr tpgid …` — `comm` may hold spaces and parentheses, so the fields are
    // counted from the last `)`.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const pgrp = Number(fields[2]);
    const tpgid = Number(fields[5]);
    if (!Number.isInteger(pgrp) || !Number.isInteger(tpgid) || tpgid <= 0) return null;
    return tpgid === pgrp;
  } catch {
    return null;
  }
}

/** How a raw round trip was ended before the shell answered it: its call's cancel, or a kill from the terminal window. */
type RawCut = { readonly kind: 'abort' } | { readonly kind: 'kill'; readonly reset: boolean };

/** OQ-144: how often a running foreground call looks for its shell having been replaced. */
export const REPLACED_WATCH_MS = 200;
/** OQ-144: the error a call carries when its command replaced the session's shell. */
export const REPLACED_ERROR = 'the command replaced the session\'s shell';
/** REQ-SHELL-092: the error a call carries when the user killed it from the terminal window. */
const KILLED_ERROR = 'the command was killed from the terminal window';
/** The error a call carries when its run cancelled it (the tool context's signal). */
const CANCELLED_ERROR = 'the call was cancelled';
/** OQ-144 (the shell-exit case): the error a call carries when its command ended the session's shell. */
export const SHELL_ENDED_ERROR = 'the command ended the session\'s shell';
/** OQ-144 (the shell-exit case): the error a poll carries when the soft-paused command ended the session's shell. */
export const PAUSED_SHELL_ENDED_ERROR = 'the paused command ended the session\'s shell';

export const FOREGROUND_CAP = 100_000;
/**
 * A10 / OQ-147: the reason a poll gives for a soft-paused command that ended with no end frame of its own — the shell
 * abandoned the rest of its line, as it does on an interrupt, and went on to the next call's.
 */
const PAUSED_ENDED_WITHOUT_STATUS = 'the paused command ended without an exit status of its own: the shell abandoned the rest of its line, as an interrupt (C-c) makes it do, before the next command ran';
export const NO_OUTPUT_WINDOW_MS = 30_000;
/**
 * OQ-147: how long a poll after an interrupt waits for the shell to answer the no-op line that finds the paused line's end
 * (`findInterruptedEnd`). The shell already holds its terminal then, so the round trip is one line through an idle shell;
 * a poll that outwaits the bound answers "still running", and the next poll reads the end the line found meanwhile.
 */
export const INTERRUPTED_END_WAIT_MS = 2_000;
/**
 * OQ-147 (the repair's first verification, VS1): how long a poll after an interrupt waits for the shell to take its terminal
 * back before it looks for the paused line's end. A poll made at once after the `C-c` — no model round trip between them —
 * otherwise met a shell still waiting on the dying program and answered "still running". A program that survives the
 * interrupt keeps the terminal past this bound, and the poll answers "still running" as before, having written nothing.
 */
export const INTERRUPT_SETTLE_MS = 500;
/**
 * OQ-147 (the repair's first verification): how often a call that an interrupt reached while it RAN looks for its shell
 * holding the terminal again, the moment the product's own no-op line can find where the abandoned line ended.
 */
export const INTERRUPT_WATCH_MS = 100;
/**
 * The reason a RUNNING call gives when an interrupt ended it with no end frame of its own — the window's interrupt
 * (REQ-SHELL-093) while the call still ran: the shell abandoned the rest of its line, so no exit status was ever printed.
 */
const ENDED_WITHOUT_STATUS = 'the command ended without an exit status of its own: the shell abandoned the rest of its line, as an interrupt (C-c) makes it do';
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

/** The call the shell is running: a foreground call (`execute`), or one of the product's own round trips (`runRaw`). */
interface ActiveCall {
  readonly start: string;
  readonly end: string;
  readonly onEnd: (code: number) => void;
  readonly onKill: (reset: boolean) => void;
  /**
   * OQ-147: an interrupt (`C-c`) was written while this call ran — the terminal window's interrupt or send-keys
   * (REQ-SHELL-093). A foreground call's only; the product's own round trips are bounded by their own timeout.
   */
  readonly onInterrupt?: () => void;
  /**
   * The printed start marker of the product's own no-op line submitted after an interrupt reached this call, once its
   * shell held the terminal again; null until then. The shell reaches that line only once this call's line is done, so
   * its printed marker ends the call (`onCloser`) as the next call's marker ends a paused one.
   */
  closer: string | null;
  readonly onCloser?: () => void;
  /** OQ-144 (the shell-exit case): the session's shell ended while this call ran — `exit`, a signal to the shell. */
  readonly onShellExit?: () => void;
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
  /**
   * Bytes taken from the PTY but not yet given to `hold`: a tail that could still be the beginning of the next call's
   * printed start marker, split across two chunks (`pausedShare`). Decided by the next chunk (A10).
   */
  undecided: string;
  /** The exit status its own end frame carried; null while it runs, and for a call that ended with no frame (`until`). */
  code: number | null;
  /**
   * Set when the call was closed by the NEXT call's printed start marker because its own end frame never printed — an
   * interrupt (`C-c`) makes an interactive `sh` abandon the rest of the wrapper's line (A10): that marker, where what the
   * paused call collected stops.
   */
  until: string | null;
  /**
   * True once keystrokes carrying an interrupt (`C-c`, REQ-TOOLS-098's advice) were written while the call was paused: a
   * poll may then look for the end of its line (`findInterruptedEnd`).
   */
  interrupted: boolean;
  /**
   * The printed start marker of the product's own no-op line that a poll after an interrupt submitted to find where the
   * paused line ended; null until one is submitted. The shell reaches it only once the paused line is done, so it closes
   * the paused call as the next call's marker would, and it prints ahead of any later call's.
   */
  closer: string | null;
  /** Called once when `onData` closes the call — what a poll waiting on `closer` resolves on. */
  onClose: (() => void) | null;
  /** Monotonic time the command last wrote anything (live-run L2). */
  lastOutputAt: number;
  /** Monotonic time of the previous observation of the command: its soft pause, then each poll (live-run L2). */
  observedAt: number;
  /** OQ-144 (the shell-exit case): the session's shell ended while the command was paused, so it has no status of its own. */
  endedShell: boolean;
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
  /**
   * OQ-147: rows carrying `fragment` — the product's own no-op line after an interrupt (`findInterruptedEnd`): its echo,
   * which shares a row with the prompt before it, its printed start marker and its end frame — are withheld from here on.
   * A row is passed only once its line end has arrived, so a fragment split across two chunks is decided whole.
   */
  withholdRowsWith(fragment: string): void {
    if (this.phase !== 'after') this.withheld = fragment;
  }
  private withheld: string | null = null;
  /** The row being withheld until its line end decides it (`withholdRowsWith`). */
  private row = '';
  /** The part of `chunk` (with whatever an earlier chunk left undecided) that the command wrote; '' when none. */
  push(chunk: string): string {
    const out = this.pass(chunk);
    const fragment = this.withheld;
    if (fragment === null) return out;
    const text = this.row + out;
    // Whole rows are decided; a partial row waits for its line end, unless the end frame closed the region.
    const cut = this.phase === 'after' ? text.length : text.lastIndexOf('\n') + 1;
    this.row = text.slice(cut);
    return text.slice(0, cut).split(/(?<=\n)/).filter((r) => !r.includes(fragment)).join('');
  }
  private pass(chunk: string): string {
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

/**
 * A10: the share of one PTY chunk that belongs to a soft-paused call, while it is still open. The shell runs its lines in
 * order, so the paused call's bytes end at the first of two things: its OWN end frame, when the line reaches it, or the
 * NEXT call's PRINTED start marker, which the shell writes only once the paused line is done — with or without its frame,
 * since an interrupt (`C-c`) makes an interactive `sh` abandon the rest of that line. Nothing after either is the paused
 * call's, and none of it is given to its screen: the next call's output, however long, cannot scroll the boundary off the
 * screen the paused call's poll is read from. The printed start marker is told from the shell's echo of the next call's
 * wrapper as `CommandRegion` tells it — the echo quotes it — and a marker at the very end of a chunk, which the next chunk
 * decides, is held back as `undecided` with nothing after it given away. The own frame needs no hold: the capture cuts it
 * on the screen, and with no next call only the prompt follows it.
 */
export function pausedShare(undecided: string, chunk: string, ownEnd: string, nextStart: string | null): { readonly take: string; readonly undecided: string; readonly stop: 'own' | 'next' | null } {
  const text = undecided + chunk;
  const own = new RegExp(`${ownEnd}:-?\\d+`).exec(text);
  const ownAt = own ? own.index + own[0].length : -1;
  let nextAt = -1;
  let holdFrom = text.length;
  if (nextStart !== null) {
    for (let from = 0; ;) {
      const at = text.indexOf(nextStart, from);
      if (at < 0) break;
      const after = at + nextStart.length;
      if (after >= text.length) { holdFrom = at; break; }
      if (text[after] === "'") { from = after; continue; }
      nextAt = after;
      break;
    }
    if (nextAt < 0 && holdFrom === text.length) {
      // A tail that could still begin the marker, split across two chunks.
      let keep = Math.min(text.length, nextStart.length - 1);
      while (keep > 0 && !nextStart.startsWith(text.slice(text.length - keep))) keep -= 1;
      holdFrom = text.length - keep;
    }
  }
  if (ownAt >= 0 && (nextAt < 0 || ownAt <= nextAt)) return { take: text.slice(0, ownAt), undecided: '', stop: 'own' };
  if (nextAt >= 0) return { take: text.slice(0, nextAt), undecided: '', stop: 'next' };
  return { take: text.slice(0, holdFrom), undecided: text.slice(holdFrom), stop: null };
}

/**
 * OQ-147: true once `text` carries `marker` as the shell PRINTS it, told from the echo of its line — which quotes it — as
 * `pausedShare` tells it. A marker at the very end of `text` is not decided yet: the next chunk decides it.
 */
export function printsMarker(text: string, marker: string): boolean {
  for (let from = 0; ;) {
    const at = text.indexOf(marker, from);
    if (at < 0) return false;
    const after = at + marker.length;
    if (after >= text.length) return false;
    if (text[after] !== "'") return true;
    from = after;
  }
}

/**
 * The POSIX wrapper as the shell's echo shows it, from its first statement to its last (`wrapCommand`): whatever command
 * it carries between them, and whatever row breaks the screen put in it. Each separator may have lost its space, which
 * `translateToString(true)` trims from the end of a row that wrapped on it.
 */
const ECHOED_POSIX_WRAPPER = /printf ?'%s\\n' ?'__rot_[0-9a-f]{24}_s'; ?command ?eval ?(?:(?!printf ?'%s\\n' ?'__rot_)[\s\S])*?; ?printf ?'__rot_[0-9a-f]{24}_e:%s\\n' ?"\$\?"/g;

/**
 * A10: every row the echo of a POSIX wrapper occupies, dropped whole. The line discipline echoes what the product writes
 * as it arrives, onto whatever screen is collecting — the next call's wrapper lands on a soft-paused call's screen — and a
 * wrapper wider than the screen wraps. Dropping only the row that begins it (`printf '%s`) left its continuation rows,
 * the command's text and `printf '__rot_…_e:%s\n' "$?"`, in what the agent read. The rows are matched joined, with no
 * separator, so a break anywhere in the wrapper is no obstacle; the markers are per-call nonces, so no command spells one.
 */
function withoutEchoedWrappers(rows: readonly string[]): string[] {
  const joined = rows.join('');
  const drop = new Set<number>();
  const rowAt = (offset: number): number => {
    let row = 0;
    for (let seen = 0; row < rows.length - 1 && seen + rows[row]!.length <= offset; row += 1) seen += rows[row]!.length;
    return row;
  };
  for (const m of joined.matchAll(ECHOED_POSIX_WRAPPER)) {
    for (let r = rowAt(m.index); r <= rowAt(m.index + m[0].length - 1); r += 1) drop.add(r);
  }
  return drop.size === 0 ? [...rows] : rows.filter((_, i) => !drop.has(i));
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
  private active: ActiveCall | null = null;
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
  /**
   * OQ-144: `processIdentity` of the session's shell, read when the shell last answered one of the product's own lines
   * (the first-call handshake, the snapshot, the restore), so it is the shell's and not a program an `exec` put in its
   * place. Null for a shell that has not answered yet, and wherever `/proc` does not say; the watch is off then.
   */
  private shellIdentity: string | null = null;
  /**
   * OQ-144 (the shell-exit case, `a-command-that-exits-the-session-shell-reads-as-a-soft-pause`): the session's shell ended
   * on its own — a command's `exit`, a signal to the shell — rather than by `resetNow` or `dispose`, and has not been
   * respawned with PD-TOOLS-001's snapshot yet. Whoever meets it first respawns it (`respawnAfterShellEnded`): the call that
   * was running, the poll that hands the paused command over, or the next call.
   */
  private shellEnded = false;

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
    this.noteInterrupt('\x03');
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
    p.onExit(() => this.shellExited(p));
    this.pty = p;
    this.shellIdentity = null;
    return p;
  }

  /**
   * OQ-144 (the shell-exit case, `a-command-that-exits-the-session-shell-reads-as-a-soft-pause`): the session's shell ended
   * while it was still the session's — `resetNow` and `dispose` forget the PTY before they end it, so theirs never reach
   * here. A command that ends the shell (`exit 3`, `kill -9 $$`) never prints its end frame, because the shell that would
   * print it is gone; before this, only the PTY was forgotten, the running call waited out the no-output window and read as
   * a soft pause about a process that had ended, and the next call ran in a fresh shell with the directory and variables
   * gone while it reported `session_reinitialized` false. node-pty emits the exit once the PTY's output is drained, so what
   * the command wrote before the shell went has been read. The running call ends at once (`onShellExit`); a soft-paused
   * call is closed with no status of its own, for its poll to hand over.
   */
  private shellExited(p: PtyLike): void {
    if (this.pty !== p) return;
    this.pty = null;
    this.shellIdentity = null;
    this.shellEnded = true;
    this.pendingText = '';
    const paused = this.pausedCommand;
    if (paused) {
      if (paused.undecided !== '') paused.hold.push(paused.undecided);
      paused.undecided = '';
      paused.code = null;
      paused.endedShell = true;
      this.pausedDone = paused;
      this.pausedCommand = null;
      paused.onClose?.();
    }
    const a = this.active;
    if (a) {
      this.active = null;
      a.onShellExit?.();
    }
  }

  /**
   * OQ-144 (the shell-exit case): a fresh shell for a session whose shell ended, with PD-TOOLS-001's snapshot re-applied as
   * after a hard-timeout reset, and `reinitialized` set so the call that next runs a command reports it. `reset` is false
   * when no shell could be started.
   */
  private async respawnAfterShellEnded(): Promise<{ readonly reset: boolean; readonly restore: RestoreOutcome }> {
    this.shellEnded = false;
    try {
      this.ensure();
    } catch (cause) {
      this.deps.warn(`terminal session ${this.id} could not be restarted after its shell ended: ${String(cause)}`);
      return { reset: false, restore: { status: 'failed' } };
    }
    this.reinitialized = true;
    return { reset: true, restore: await this.restoreState() };
  }

  private onData(chunk: string): void {
    const shown = this.region?.push(chunk) ?? '';
    if (shown !== '') for (const t of this.taps) { try { t(shown); } catch (cause) { this.deps.warn(`terminal session ${this.id}: an output tap raised: ${String(cause)}`); } }
    for (const l of this.listeners) l(chunk);
    const paused = this.pausedCommand;
    const active = this.active;
    if (!active && !paused) return;
    // A soft-paused call and the call queued behind it share the stream, and the shell runs their lines in order. What the
    // paused call collects is its share of each chunk (`pausedShare`), which ends at its own end frame or at the next call's
    // printed start marker, whichever the shell reaches (A10).
    let share: ReturnType<typeof pausedShare> | null = null;
    if (paused) {
      // The no-op line a poll after an interrupt submitted (`closer`) was written before any later call's, so its marker
      // is the first the shell can print once the paused line is done.
      share = pausedShare(paused.undecided, chunk, paused.end, paused.closer ?? active?.start ?? null);
      if (share.take !== '') { paused.hold.push(share.take); paused.lastOutputAt = this.deps.monotonic.now(); }
      paused.undecided = share.undecided;
    }
    this.pendingText += chunk;
    // The echoed wrapper carries the marker text too (`'__rot_x_e:' + $(...`), so the match is the marker
    // FOLLOWED BY DIGITS on the VT-stripped stream — only the shell's own Write-Output produces that.
    const text = stripVt(this.pendingText);
    const frame = (end: string): number | null => {
      const m = new RegExp(`${end}:(-?\\d+)`).exec(text);
      return m ? Number(m[1]) : null;
    };
    // The paused call closes on its own frame, with its own status. Otherwise it closes where the next call's start marker
    // prints — the shell reaches that line only once the paused one is done, and a paused command interrupted with `C-c`
    // (REQ-TOOLS-098's advice) makes an interactive `sh` abandon the rest of its line, frame and all — with NO status; its
    // capture is cut there too (`until`), so nothing the later calls or the snapshot write is ever read as the paused
    // command's. The next call's end frame closes it the same way, should its start marker not have been seen on the raw
    // stream.
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
    // FALSIFIED a third time, kept beside it (A10's second verification, 2026-09-30, corrected before its merge): "it
    // closes on the active call's END frame, and what it collected is cut at the next call's printed start marker". Its
    // listener fed the paused screen until that end frame, so a next call longer than the screen keeps
    // (`FOREGROUND_SCREEN_LINES`) scrolled the start marker off, nothing was cut, and the poll read that call's output, its
    // end frame and a false truncation. The collection stops at the marker now, not the cut alone.
    const pausedCode = paused ? frame(paused.end) : null;
    const activeCode = active ? frame(active.end) : null;
    if (paused && (pausedCode !== null || share?.stop === 'next' || activeCode !== null)) {
      // Closed without a decision on the raw stream: whatever it still held back was its own.
      if (paused.undecided !== '') paused.hold.push(paused.undecided);
      paused.undecided = '';
      paused.code = pausedCode;
      const next = paused.closer ?? active?.start ?? null;
      if (pausedCode === null && next !== null) paused.until = next;
      this.pausedDone = paused;
      this.pausedCommand = null;
      paused.onClose?.();
    }
    if (active && activeCode !== null) {
      this.active = null;
      active.onEnd(activeCode);
    } else if (active && active.closer !== null && this.active === active && printsMarker(text, active.closer)) {
      // OQ-147: an interrupt reached the running call and the shell abandoned its line; the product's own no-op line,
      // which the shell reaches only once that line is done, printed its start marker. Its own frame, had the line
      // reached it, would have printed first and been read above.
      this.active = null;
      active.onCloser?.();
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
    const lines = withoutEchoedWrappers(screenText.split('\n')).filter((l) => !l.includes('Write-Output (') && !l.includes("printf '%s"));
    const startAt = lines.findIndex((l) => l.trimEnd().endsWith(start));
    let kept = startAt >= 0 ? lines.slice(startAt + 1) : lines;
    // A paused call closed with no frame of its own (A10) stops at the first row that carries the next call's start
    // marker in any form — printed, or in an echo of its wrapper that escaped the removal above: what follows is the
    // next call's, and after that the product's snapshot.
    if (until !== null) {
      const next = kept.findIndex((l) => l.includes(until));
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
    // OQ-144 (the shell-exit case): a shell that ended between calls — no call was waiting on it — is respawned here, with
    // PD-TOOLS-001's snapshot re-applied, and this call says so (`respawned`, `session_reinitialized`).
    const respawned = this.shellEnded ? await this.respawnAfterShellEnded() : null;
    let p = this.ensure();
    this.state = 'running';
    const reinit = this.reinitialized;
    this.reinitialized = false;
    const withRespawn = (r: ForegroundResult): ForegroundResult => (respawned === null ? r : { ...r, respawned: respawned.restore });
    // OQ-144: a shell that has not answered yet has no identity to watch against — a fresh one, before its first
    // command. One no-op round trip on it gives one, read once the shell has printed the end frame and so is ours. A
    // shell busy with a soft-paused command cannot answer, and keeps what it had.
    // The round trip is an await BEFORE the call's own abort listener and kill handler exist, so both are honoured on it
    // (acceptance round 1's verifier): a cancel that landed in it was lost — `addEventListener('abort')` on a signal
    // already aborted never fires — and the call ran to its own end; a kill from the terminal window reset the shell
    // under it, and the command was written to the PTY that had just been killed.
    if (this.deps.backend.kind === 'posix' && this.shellIdentity === null && this.pausedCommand === null && !opts.signal?.aborted && processIdentity(p.pid) !== null) {
      const trip = await this.runRaw(':', SNAPSHOT_TIMEOUT_MS, opts.signal).catch(() => null);
      if (trip?.cut?.kind === 'kill') {
        // `killActive` has ended the tree and restarted the session; the command was never written.
        return withRespawn({ output: '', exitCode: -1, timedOut: false, softPaused: false, killStatus: trip.cut.reset ? 'session_reset' : 'reset_failed', error: KILLED_ERROR, sessionReinitialized: reinit, truncated: false, restore: { status: 'none' } });
      }
      p = this.ensure();
    }
    if (opts.signal?.aborted) {
      // Cancelled before the command was written: the reading of a cancel below — the session restarts, PD-TOOLS-001's
      // snapshot is re-applied — with nothing of the command's to report, because it never ran.
      this.active = null;
      this.state = 'resetting';
      const reset = this.resetNow();
      const restore: RestoreOutcome = reset ? await this.restoreState() : { status: 'failed' };
      return withRespawn({ output: '', exitCode: 124, timedOut: true, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: CANCELLED_ERROR, sessionReinitialized: reinit, truncated: false, restore });
    }
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
    // OQ-147 (the repair's first verification): an interrupt written while this call RUNS — the terminal window's interrupt
    // or send-keys (REQ-SHELL-093), the natural moment for a user watching a long command — makes an interactive `sh`
    // abandon the rest of the wrapper's line just as it does under a paused call, so the end frame never prints. Only a
    // paused call was marked, and the running call waited out the no-output window and soft-paused over a dead process, or
    // waited out its hard cap and reset the session. It is marked now; once its shell holds the terminal again
    // (`shellHoldsTerminal`) the product's own no-op line finds where its line ended (`submitCloser`), and the call ends
    // there with OQ-147's reading. Where `/proc` does not say who holds the terminal nothing is written while the call
    // runs; the mark is carried into the soft pause, and a poll after it reads it as a C-c sent after the pause.
    let interrupted = false;
    let closer: string | null = null;
    const done = new Promise<{ kind: 'exit'; code: number } | { kind: 'timeout' } | { kind: 'pause' } | { kind: 'abort' } | { kind: 'kill'; reset: boolean } | { kind: 'replaced' } | { kind: 'ended' } | { kind: 'shellEnded' }>((resolve) => {
      let hard: TimerHandle | null = null;
      let soft: TimerHandle | null = null;
      let watch: TimerHandle | null = null;
      let lookForEnd: TimerHandle | null = null;
      const active: ActiveCall = {
        start,
        end,
        onEnd: (code) => resolve({ kind: 'exit', code }),
        onKill: (reset) => resolve({ kind: 'kill', reset }),
        closer: null,
        onInterrupt: () => {
          if (interrupted) return;
          interrupted = true;
          const look = () => {
            lookForEnd = null;
            if (this.active !== active || active.closer !== null) return;
            const holds = shellHoldsTerminal(p.pid);
            if (holds === null) return;
            if (holds) { closer = this.submitCloser(p); active.closer = closer; return; }
            lookForEnd = timers.after(INTERRUPT_WATCH_MS as Millis, look);
          };
          lookForEnd = timers.after(INTERRUPT_WATCH_MS as Millis, look);
        },
        onCloser: () => resolve({ kind: 'ended' }),
        onShellExit: () => resolve({ kind: 'shellEnded' }),
      };
      this.active = active;
      // OQ-144 (acceptance A9): a command that replaces the shell — `exec bash` — keeps the pid and never returns to the
      // rest of the wrapped line, so the end frame never comes, and the call used to wait out the no-output window and
      // report a soft pause for a command that had finished at once, leaving every later call in the new program. The
      // process behind the pid is compared with the shell's identity until the call ends; a different one ends the call.
      const expected = this.shellIdentity;
      if (expected !== null) {
        const look = () => {
          if (this.active?.end !== end) return;
          const now = processIdentity(p.pid);
          if (now !== null && now !== expected) { resolve({ kind: 'replaced' }); return; }
          watch = timers.after(REPLACED_WATCH_MS as Millis, look);
        };
        watch = timers.after(REPLACED_WATCH_MS as Millis, look);
      }
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
      const clear = () => { hard?.cancel(); soft?.cancel(); watch?.cancel(); lookForEnd?.cancel(); };
      void Promise.resolve().then(() => undefined);
      this.clearers.set(nonce, clear);
    });
    // The scan's buffer starts afresh with the call — unless a paused call is still open, whose end frame may be split
    // across the chunk already taken and the next one: cleared here, it would lose its status and read as OQ-147's −1.
    if (!this.pausedCommand) this.pendingText = '';
    this.region = new CommandRegion(start, end);
    this.submit(p, wrapCommand(this.deps.backend, command, start, end));
    const outcome = await done;
    // Only a soft-paused command keeps writing to its stream; after any other outcome what the PTY carries is the
    // product's own — the snapshot, the reset, the restore — and none of it is the command's (live-run L9).
    if (outcome.kind !== 'pause') this.region = null;
    this.clearers.get(nonce)?.();
    this.clearers.delete(nonce);
    // REQ-TOOLS-098: a soft-paused call is opened BEFORE its listener goes and before the emulator's write is awaited, in
    // the same turn, so a chunk the PTY delivers during that write is given to the paused call by `onData` — into the same
    // `hold`, which the next poll feeds to the screen — and a chunk carrying the command's own end frame closes it with its
    // own status. Opened after the write, as it was, such a chunk reached neither the listener nor the paused call: no poll
    // returned it, and its end frame resolved the call already settled, so the paused call read "still running" until a
    // later call's marker closed it with no status (`output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll`).
    let paused: PausedCall | null = null;
    if (outcome.kind === 'pause') {
      this.pausedDone?.screen.dispose();
      this.pausedDone = null;
      // A pause nobody ever polled is replaced here: release its screen rather than leave it.
      this.pausedCommand?.screen.dispose();
      // It is fed by `onData` from here, its share of each chunk only (`pausedShare`), until its own frame or the next
      // call's start marker closes it (A10). `delivered` is what this call returns, set once the screen has it.
      // An interrupt that reached it while it ran is carried (OQ-147), and so is the no-op line already submitted for it,
      // whose printed marker then closes the paused call as a poll's own would.
      paused = { start, end, screen, hold, delivered: '', undecided: '', code: null, until: null, interrupted, closer, onClose: null, lastOutputAt, observedAt: monotonic.now(), endedShell: false };
      this.pausedCommand = paused;
      this.active = null;
      this.state = 'idle';
    }
    this.listeners = this.listeners.filter((l) => l !== listener);
    const taken = hold.take();
    await screen.write(taken);
    // A call ended by the product's own no-op line (OQ-147) stops where that line begins.
    const lines = ForegroundSession.cleanLines(screen.text(), start, end, outcome.kind === 'ended' ? closer : null);
    const finish = (r: Omit<ForegroundResult, 'output' | 'truncated' | 'sessionReinitialized' | 'restore'>): ForegroundResult => {
      let text = lines.join('\n').replace(/\s+$/, '');
      // REQ-TOOLS-097's 100,000-character cap, truncated from the OLDEST end, over what the screen retained.
      let cut = screen.truncated || hold.dropped;
      if (text.length > FOREGROUND_CAP) { text = text.slice(-FOREGROUND_CAP); cut = true; }
      return withRespawn({ ...r, output: text, truncated: cut, sessionReinitialized: reinit, restore: { status: 'none' } });
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
    if (outcome.kind === 'ended') {
      // OQ-147: an interrupt ended the running command and its shell abandoned the rest of the line, so it has no exit
      // status of its own; it is reported as the paused call's is, −1 with the reason. The shell answered the no-op line,
      // so it is idle and the session is not reset: what the command's line changed before the interrupt stays.
      this.state = 'idle';
      const r = finish({ exitCode: -1, timedOut: false, softPaused: false, killStatus: null, error: ENDED_WITHOUT_STATUS });
      screen.dispose();
      await this.refreshState();
      return r;
    }
    if (paused !== null) {
      // REQ-TOOLS-098: return −1, the process keeps running; a later empty command polls what it produced since.
      // The call's screen is kept and keeps filling, so the poll reads the same emulated screen further along.
      paused.delivered = lines.join('\n').replace(/\s+$/, '');
      return finish({ exitCode: -1, timedOut: false, softPaused: true, killStatus: null, error: null });
    }
    if (outcome.kind === 'kill') {
      // Part AL / REQ-SHELL-092: killed from the terminal window; the tree is gone and the session was restarted by `killActive`.
      const r = finish({ exitCode: -1, timedOut: false, softPaused: false, killStatus: outcome.reset ? 'session_reset' : 'reset_failed', error: KILLED_ERROR });
      screen.dispose();
      return r;
    }
    if (outcome.kind === 'shellEnded') {
      // OQ-144 (the shell-exit case): the command ended the session's shell — `exit 3`, `kill -9 $$` — so it never returned
      // to the line that would have printed its status. The call is REQ-TOOLS-103's failure before completion, as a
      // replaced shell's is, and the session restarts on a fresh shell with PD-TOOLS-001's snapshot re-applied. Nothing is
      // killed: the shell has gone already.
      this.active = null;
      this.state = 'resetting';
      const { reset, restore } = await this.respawnAfterShellEnded();
      this.state = 'idle';
      const r: ForegroundResult = { ...finish({ exitCode: null, timedOut: false, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: SHELL_ENDED_ERROR }), restore, shellEnded: true };
      screen.dispose();
      return r;
    }
    if (outcome.kind === 'replaced') {
      // OQ-144: the program the command put in the shell's place is ended with its tree, and the session restarts on the
      // shell the tool description names, with PD-TOOLS-001's snapshot re-applied as after a hard-timeout reset. The
      // command has no exit status of its own — it never returned to the line that would have reported one — so the
      // call is REQ-TOOLS-103's failure before completion, not a soft pause and not REQ-TOOLS-099's timeout.
      this.active = null;
      this.state = 'resetting';
      const reset = this.resetNow();
      const restore: RestoreOutcome = reset ? await this.restoreState() : { status: 'failed' };
      const r: ForegroundResult = { ...finish({ exitCode: null, timedOut: false, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: REPLACED_ERROR }), restore, replaced: true };
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
    const r = { ...finish({ exitCode: 124, timedOut: true, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: outcome.kind === 'abort' ? CANCELLED_ERROR : null }), restore };
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
    const open = this.pausedCommand;
    const pty = this.pty;
    if (open !== null && open.interrupted && open.closer === null && this.active === null && pty !== null) {
      // A poll made at once after the `C-c` can meet a shell still waiting on the dying program; it waits a short, bounded
      // while for the shell to take its terminal back (`INTERRUPT_SETTLE_MS`).
      let holds = shellHoldsTerminal(pty.pid);
      const by = this.deps.monotonic.now() + INTERRUPT_SETTLE_MS;
      while (holds === false && this.deps.monotonic.now() < by) {
        await new Promise<void>((res) => { this.deps.timers.after(25 as Millis, res); });
        holds = shellHoldsTerminal(pty.pid);
      }
      if (holds !== false && this.pausedCommand === open && open.closer === null && this.active === null && this.pty === pty) await this.findInterruptedEnd(open, pty);
    }
    const done = this.pausedDone;
    if (done) {
      this.pausedDone = null;
      const out = await ForegroundSession.sincePoll(done);
      const truncated = done.screen.truncated || done.hold.dropped;
      done.screen.dispose();
      if (done.endedShell) {
        // OQ-144 (the shell-exit case): the paused command ended the session's shell. It has no exit status of its own, and
        // the poll that hands it over respawns the shell, as the call that was running would have; a later call that met
        // the ended shell first has respawned it already, and the poll reports that nothing more was done.
        const respawn = this.shellEnded ? await this.respawnAfterShellEnded() : null;
        return { output: out, exitCode: null, timedOut: false, softPaused: false, killStatus: respawn === null ? null : respawn.reset ? 'session_reset' : 'reset_failed', sessionReinitialized: false, truncated, error: PAUSED_SHELL_ENDED_ERROR, restore: respawn?.restore ?? { status: 'none' }, shellEnded: true };
      }
      // A paused call that ended with no frame of its own has no exit status to report (OQ-147): it is reported as the
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
   * The repair of `a-poll-after-c-c-says-the-interrupted-command-is-still-running` (OQ-147). An interrupt makes an
   * interactive `sh` abandon the rest of the paused call's line, so its end frame never prints, and until the next call's
   * printed start marker closed it every poll read "still running" over a process that had died. A poll after an
   * interrupt, once the shell holds its terminal again (`shellHoldsTerminal`; unknown where `/proc` does not say), submits
   * one no-op line of the product's own, as OQ-144's handshake does: the shell reaches it only once the paused line is
   * done, so its printed start marker closes the paused call (`onData`, `closer`) and the poll hands it over with OQ-147's
   * reading. Its echo and its frames are dropped from the poll (`until`, `withoutEchoedWrappers`) and from the live stream
   * (`withholdRowsWith`). The wait is bounded (`INTERRUPTED_END_WAIT_MS`); a line still running then — the shell between
   * two of its commands — answers "still running", and the no-op runs after it. That is harmless unless what runs next
   * reads the terminal — `a; cat`, or an INT trap in the session's shell that goes on to `read` — which takes the line as
   * its input: a narrow window, stated in OQ-168, and not closed by anything here.
   */
  private async findInterruptedEnd(pc: PausedCall, p: PtyLike): Promise<void> {
    const closed = new Promise<void>((resolve) => {
      const bound = this.deps.timers.after(INTERRUPTED_END_WAIT_MS as Millis, () => { pc.onClose = null; resolve(); });
      pc.onClose = () => { bound.cancel(); pc.onClose = null; resolve(); };
    });
    pc.closer = this.submitCloser(p);
    await closed;
  }

  /**
   * OQ-147: the product's own no-op line after an interrupt, submitted; returns its start marker, which the shell prints
   * only once the interrupted line is done. Its echo and frames are withheld from the live stream (`withholdRowsWith`)
   * and cut from the capture (`until`, `withoutEchoedWrappers`).
   */
  private submitCloser(p: PtyLike): string {
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    this.region?.withholdRowsWith(`__rot_${nonce}_`);
    this.submit(p, wrapCommand(this.deps.backend, this.deps.backend.kind === 'powershell' ? '$null' : ':', start, `__rot_${nonce}_e`));
    return start;
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
    this.shellEnded = false;
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
    this.noteInterrupt(text);
  }

  /**
   * OQ-147: an interrupt written while a command is soft-paused — the agent's `C-c` with `is_input` (REQ-TOOLS-098's
   * advice), or the terminal window's interrupt or send-keys (REQ-SHELL-093) — marks the paused call, so the next poll
   * looks for the end of its line (`findInterruptedEnd`). One written while a foreground call still RUNS — the window's
   * interrupt or send-keys; the agent's own calls are sequential — marks the running call (`ActiveCall.onInterrupt`),
   * which finds its line's end once the shell holds its terminal again and carries the mark into its soft pause
   * otherwise. Any other keystroke marks nothing: the product must not write a line of its own into a command that is
   * still reading its input.
   */
  private noteInterrupt(text: string): void {
    if (!text.includes('\x03')) return;
    if (this.pausedCommand !== null) this.pausedCommand.interrupted = true;
    else this.active?.onInterrupt?.();
  }

  /**
   * One wrapped line, submitted. Keystrokes written with no line end after them (REQ-TOOLS-096) wait in the shell's input
   * as a partial line when nothing reads them — a soft-paused `sleep` does not — and the wrapped line was APPENDED to
   * them: `xy` + `printf '%s\n' '<start>'; …` ran `xyprintf`, which is not found, so the start marker never printed; the
   * capture kept the whole screen, the paused call's late output and its own `__rot_…_e` frame with it, and the live
   * stream, which opens at the printed start marker (L9), stayed blank (A10). The partial line is cleared first with
   * the POSIX line discipline's kill character — `^U`, which node-pty sets as `VKILL` and an interactive shell's own line
   * editor binds to the same — so the wrapper is the whole of the line the shell reads. The keystrokes were written as
   * is; what is cleared is a line no one ended, which is OQ-146's reading. PowerShell is left as it was: its wrapper's
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
  private runRaw(line: string, timeoutMs: number, signal?: AbortSignal): Promise<{ exitCode: number; output: string; cut?: RawCut }> {
    const p = this.ensure();
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    const end = `__rot_${nonce}_e`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let cut: RawCut | undefined;
      const buf: string[] = [];
      const listener = (chunk: string) => { buf.push(chunk); };
      this.listeners.push(listener);
      // The first-call handshake carries its call's signal: a cancel ends the round trip where it stands, and the call
      // (which has not written its command yet) takes it from there.
      const onAbort = () => {
        if (settled) return;
        if (this.active?.end === end) this.active = null;
        cut = { kind: 'abort' };
        finish(-1, false);
      };
      const timer = this.deps.timers.after(timeoutMs as Millis, () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        this.listeners = this.listeners.filter((l) => l !== listener);
        this.active = null;
        reject(new Error('snapshot timed out'));
      });
      const finish = (code: number, answered = true) => {
        if (settled) return;
        settled = true;
        timer.cancel();
        signal?.removeEventListener('abort', onAbort);
        this.listeners = this.listeners.filter((l) => l !== listener);
        // OQ-144: the shell printed this line's end frame, so the process behind the pid is the session's own shell.
        if (answered && this.pty === p) { const id = processIdentity(p.pid); if (id !== null) this.shellIdentity = id; }
        const screen = this.newScreen();
        void screen.write(buf.join('')).then(() => {
          const text = ForegroundSession.clean(screen.text(), start, end);
          screen.dispose();
          resolve({ exitCode: code, output: text, ...(cut === undefined ? {} : { cut }) });
        });
      };
      this.pendingText = '';
      this.active = { start, end, onEnd: (code) => finish(code), onKill: (reset) => { cut = { kind: 'kill', reset }; finish(-1, false); }, closer: null, onShellExit: () => finish(-1, false) };
      this.submit(p, wrapCommand(this.deps.backend, line, start, end));
      if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
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
