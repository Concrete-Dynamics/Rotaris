import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
   * OQ-168 (ruled 2026-10-06, R-071): a poll of a paused command an interrupt (`C-c`) reached, on a host that cannot
   * see whether the shell holds its terminal again — Windows and macOS, where nothing like Linux's `/proc` says. Nothing
   * was written into the session to find out, so the command may have ended; the next command run in the session reports
   * how (OQ-164's `earlier`). Absent on every other result.
   */
  readonly interruptUnseen?: true;
  /**
   * OQ-144 (the shell-exit case): the command — or, on a poll, the paused command — ended the session's shell (`exit`, a
   * signal to it), `'command'`; or the shell ended before the command ran, a soft-paused command ahead of it having ended
   * it, `'before'` (OQ-164). The shell was respawned with PD-TOOLS-001's snapshot re-applied, or, on a poll whose session
   * had been respawned already by a later call, nothing more was done (`killStatus` null).
   */
  readonly shellEnded?: 'command' | 'before';
  /**
   * OQ-164: the soft-paused commands this call's observation reports beside its own outcome, oldest first — each one still
   * open, or ended and not yet reported, when the call returned. A call issued while a command is soft-paused is queued
   * behind it by the shell; its observation says so and carries that command's end, so no paused command's end is left
   * to a poll nobody makes, nor lost when a later soft pause takes the paused slot.
   */
  readonly earlier?: readonly PausedEnd[];
  /**
   * PD-TOOLS-013 (OQ-226): the run cancelled the call (its tool context's signal) — before the command was written, so it
   * never ran (`'before'`), or while it ran (`'during'`). The process tree was ended and the session restarted with
   * PD-TOOLS-001's snapshot re-applied, as on a hard timeout, but the call is no hard timeout: no exit code, `timedOut`
   * false. Absent on every other result.
   */
  readonly cancelled?: 'before' | 'during';
  /**
   * OQ-144 (the shell-exit case): the session's shell had ended between calls — no call was waiting on it — so this call
   * respawned it, re-applied PD-TOOLS-001's snapshot, and ran in the fresh shell; what the restore did.
   */
  readonly respawned?: RestoreOutcome;
}

/**
 * OQ-164: what an observation reports of a soft-paused command other than its own subject. `end` says how it ended: its
 * own exit status (`exit`); none of its own, the shell having abandoned its line (`no-status`, OQ-147); by ending the
 * session's shell (`shell`); by the session's reset (`reset`); never having run, the shell being gone before its line
 * (`never-ran`), the session reset before its line (`reset-before`), or its line gone unread — an interrupt discards what
 * the shell has not read (`discarded`); or not yet (`running`).
 */
export interface PausedEnd {
  /** The command as the agent issued it. */
  readonly label: string;
  readonly end: 'exit' | 'no-status' | 'shell' | 'reset' | 'never-ran' | 'reset-before' | 'discarded' | 'running';
  /**
   * True when an interrupt (`C-c`) had been sent to it before the reporting call was submitted, and it ended with no status
   * of its own (`no-status`): it ended at that interrupt or after it, and the call did not simply wait behind it.
   */
  readonly interruptedBefore: boolean;
  readonly exitCode: number | null;
  /**
   * Monotonic ms from the reporting call's submission to the paused command's end — negative when it had ended before the
   * call was submitted. Null on a poll's report and while the command runs.
   */
  readonly endedAfterSubmitMs: number | null;
  /** Monotonic ms from the paused command's end to this report; null while it runs. */
  readonly endedAgoMs: number | null;
  /** What it wrote since the previous observation of it. */
  readonly output: string;
  readonly truncated: boolean;
}

/**
 * OQ-144 (acceptance finding A9): what the process behind a pid is running — its executable and its argument vector —
 * read from `/proc`, so an `exec` that keeps the pid and replaces the program is visible. Null where `/proc` does not
 * say: every host but Linux, or a process that has gone. The kernel marks an executable whose file was replaced on
 * disk since it started — a package upgrade of the shell — ` (deleted)`; that is the same program, so the mark is cut.
 *
 * A process on its way out has none either. Between the kernel releasing an exiting process's memory and its reaping,
 * `exe` can still read while `cmdline` reads empty (the argument vector lived in that memory); read as an identity, that
 * pair named another program, so a shell a soft-paused `exit 4` ended was taken for one an `exec` replaced, and the call
 * waiting behind it was told it had replaced the shell
 * (`docs/defects/fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md`;
 * in 122 of 300 exits read in a tight loop, the first reading that was not the process's own was that pair). The shell is
 * started with an argument vector (`posixShellArgs`), so an empty one there is the exiting shell's, never another program.
 *
 * Not reached, so not watched — one more beside the cases the replaces-the-shell note lists as "Not reached"
 * (`docs/defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`): a program in the shell's place that
 * runs with an EMPTY argument vector of its own, one `execve`d with argc 0. No shell's `exec` makes one (`exec -a ''`
 * passes one empty argument), but a program the command `exec`s may start one in its own place before the watch's next
 * reading. On a Linux kernel before 5.18 its `cmdline` reads empty, so it reads as no identity, and the call goes
 * unwatched: it soft-pauses (or, where the call names a timeout, reaches that hard timeout), as a replacement did before OQ-144's
 * watch. From 5.18 the kernel gives an argc-0 `execve` one
 * empty argument, its `cmdline` reads one NUL byte, and that is an identity the watch tells apart (measured on 6.18;
 * "OQ-144: a program run with an empty argument vector …" in `terminal.test.ts`).
 */
export function processIdentity(pid: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    const exe = readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '');
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'latin1');
    return argv === '' ? null : `${exe}\0${argv}`;
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
export function shellHoldsTerminal(pid: number, platform: NodeJS.Platform = process.platform): boolean | null {
  if (platform !== 'linux') return null;
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
/**
 * Live-run M1 (the fin23 verifier's optional finding): the error a call carries when its command was too long for one PTY
 * line and could not be staged in a script (`carry`): an unwritable temporary directory, a full disk. Nothing was written
 * to the shell, so the session is left as it was and the next call runs normally.
 */
export const STAGING_FAILED_ERROR = 'the command is too long for one terminal line and could not be staged in a script';
/** OQ-144 (the shell-exit case): the error a call carries when its command ended the session's shell. */
export const SHELL_ENDED_ERROR = 'the command ended the session\'s shell';
/** OQ-144 (the shell-exit case): the error a poll carries when the soft-paused command ended the session's shell. */
export const PAUSED_SHELL_ENDED_ERROR = 'the paused command ended the session\'s shell';
/** OQ-164: the error a call carries when the session's shell ended before its line ran — a paused command ahead of it ended it. */
export const SHELL_ENDED_BEFORE_ERROR = 'the session\'s shell ended before the command ran';
/**
 * OQ-164 (the verifier's finding on its repair): why a line queued behind a soft-paused one can vanish unread — an interrupt
 * (`C-c`) makes the terminal discard the input the shell has not read, and a command reading its input takes it.
 */
const LINE_GONE = 'its line was gone before the shell reached it (an interrupt (C-c) discards a line the shell has not read yet, and a command that reads its input takes it)';
/** OQ-164: the error a poll carries for a paused command whose line never ran (`LINE_GONE`). */
export const PAUSED_NEVER_RAN_ERROR = `the paused command never ran, so it has no exit code: ${LINE_GONE}`;
/**
 * OQ-164: the error a call carries when it waited behind a soft-paused command and an interrupt sent to that command — the
 * terminal window's (REQ-SHELL-093) — discarded its line before the shell read it.
 */
export const NEVER_RAN_ERROR = `the command never ran, so it has no exit code: it waited behind a soft-paused command, and ${LINE_GONE}`;

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
  /**
   * The host the session runs on, `process.platform` where absent. OQ-168's ruling decides by it whether a poll after
   * an interrupt may write the product's own no-op line (Linux, once `/proc` says the shell holds its terminal again) or
   * writes nothing (Windows, macOS); a test names another host to pin that branch on this one.
   */
  readonly platform?: NodeJS.Platform;
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
  /**
   * OQ-144 (the shell-exit case): the session's shell ended while this call was waiting on it — `exit`, a signal to the
   * shell. `ran` is false when a soft-paused command ahead of this call's line was still running (OQ-164): it ended the shell,
   * and this call's line never ran.
   */
  readonly onShellExit?: (ran: boolean) => void;
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
   * Set when the call was closed by a later line's printed start marker because its own end frame never printed — an
   * interrupt (`C-c`) makes an interactive `sh` abandon the rest of the wrapper's line (A10): the marker that printed first,
   * where what the paused call collected stops (every later line's, when it closed on a later end frame alone).
   */
  until: readonly string[] | null;
  /**
   * OQ-164: false while the shell has not started the call's line — it was queued behind an earlier paused line — and so
   * nothing of the stream is its own yet (`unstartedShare`); true once its start marker printed, and for every other pause.
   */
  started: boolean;
  /**
   * True once keystrokes carrying an interrupt (`C-c`, REQ-TOOLS-098's advice) were written while the call was paused: a
   * poll may then look for the end of its line (`findInterruptedEnd`).
   */
  interrupted: boolean;
  /** OQ-164: monotonic time of the first such interrupt; null when none was written. */
  interruptedAt: number | null;
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
  /**
   * How the call closed when not by its own end frame (OQ-164): the session's shell ended while its command ran (`shell`,
   * OQ-144's shell-exit case), or before its line ran (`never-ran`); the session was reset under it (`reset`), or before its
   * line ran (`reset-before`); or a later line started though its own never had, its line gone unread (`discarded`,
   * `unstartedShare`). Null while open, and when it closed on its own frame or at a later line's start marker.
   */
  endedBy: 'shell' | 'never-ran' | 'reset' | 'reset-before' | 'discarded' | null;
  /** OQ-164: the command as the agent issued it, for the observation that reports its end. */
  readonly label: string;
  /** OQ-164: monotonic time the call closed; null while open. */
  endedAt: number | null;
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
  /** OQ-164: true once the printed start marker has been seen — the shell has started the call's line. */
  get started(): boolean {
    return this.phase !== 'before';
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
 * Where `marker` first PRINTS in `text`, told from the shell's echo of its line — which quotes it — as `CommandRegion` tells
 * it: its index (`at`, −1 when it has not printed), and `hold`, the index from which a tail of `text` could still be the
 * marker — an occurrence at the very end, or the beginning of one split across two chunks — for the next chunk to decide.
 */
function printedAt(text: string, marker: string): { readonly at: number; readonly hold: number } {
  for (let from = 0; ;) {
    const at = text.indexOf(marker, from);
    if (at < 0) break;
    const after = at + marker.length;
    if (after >= text.length) return { at: -1, hold: at };
    if (text[after] === "'") { from = after; continue; }
    return { at, hold: text.length };
  }
  let keep = Math.min(text.length, marker.length - 1);
  while (keep > 0 && !marker.startsWith(text.slice(text.length - keep))) keep -= 1;
  return { at: -1, hold: text.length - keep };
}

/** The first of `markers` to print in `text` (`printedAt`), and the earliest index any of them could still begin at. */
function firstPrinted(text: string, markers: readonly string[]): { readonly at: number; readonly marker: string | null; readonly hold: number } {
  let at = -1;
  let marker: string | null = null;
  let hold = text.length;
  for (const m of markers) {
    const r = printedAt(text, m);
    if (r.at >= 0 && (at < 0 || r.at < at)) { at = r.at; marker = m; }
    hold = Math.min(hold, r.hold);
  }
  return { at, marker, hold };
}

/** What `pausedShare` decided of one chunk; `marker` is the later line's printed start marker it stopped at (`stop: 'next'`). */
export interface PausedShare {
  readonly take: string;
  readonly undecided: string;
  readonly stop: 'own' | 'next' | null;
  readonly marker: string | null;
}

/**
 * A10: the share of one PTY chunk that belongs to a soft-paused call, while it is still open. The shell runs its lines in
 * order, so the paused call's bytes end at the first of two things: its OWN end frame, when the line reaches it, or the
 * printed start marker of ANY line written after it, which the shell writes only once the paused line is done — with or
 * without its frame, since an interrupt (`C-c`) makes an interactive `sh` abandon the rest of that line. Nothing after either
 * is the paused call's, and none of it is given to its screen: the next call's output, however long, cannot scroll the
 * boundary off the screen the paused call's poll is read from. The printed start marker is told from the shell's echo of a
 * later wrapper as `CommandRegion` tells it — the echo quotes it — and a marker at the very end of a chunk, which the next
 * chunk decides, is held back as `undecided` with nothing after it given away. The own frame needs no hold: the capture cuts
 * it on the screen, and with no later line only the prompt follows it.
 *
 * FALSIFIED, kept beside its replacement (OQ-164's verification, 2026-10-01): "the NEXT call's printed start marker" — the
 * line written directly after. An interrupt makes the terminal discard every line the shell has not read yet, so a line
 * queued behind the interrupted one never runs and its marker never prints; the interrupted call then collected the next
 * call's marker, output and end frame, and its capture was cut at a marker that never appeared. Every later line's marker
 * counts now (`later`): the shell runs them in order, so whichever prints first is past the paused line.
 */
export function pausedShare(undecided: string, chunk: string, ownEnd: string, later: string | readonly string[] | null): PausedShare {
  const text = undecided + chunk;
  const markers = later === null ? [] : typeof later === 'string' ? [later] : later;
  const own = new RegExp(`${ownEnd}:-?\\d+`).exec(text);
  const ownAt = own ? own.index + own[0].length : -1;
  const next = firstPrinted(text, markers);
  const nextAt = next.marker === null ? -1 : next.at + next.marker.length;
  if (ownAt >= 0 && (nextAt < 0 || ownAt <= nextAt)) return { take: text.slice(0, ownAt), undecided: '', stop: 'own', marker: null };
  if (nextAt >= 0) return { take: text.slice(0, nextAt), undecided: '', stop: 'next', marker: next.marker };
  return { take: text.slice(0, next.hold), undecided: text.slice(next.hold), stop: null, marker: null };
}

/**
 * OQ-164 (the verifier's finding on its repair): the share of one chunk that belongs to a soft-paused call whose line the
 * shell has NOT STARTED — one queued behind an earlier paused line. Until its own start marker prints, every byte is the
 * earlier command's, which that command's own share carries, so nothing is taken; a poll before then handed the earlier
 * command's output over as the queued one's own. From its printed start marker on it is `pausedShare`. A later line's marker
 * printing first means its line never ran: the terminal discarded it unread — an interrupt (`C-c`) discards whatever the shell
 * has not read — or a command reading its input took it (`stop: 'next'`, `started` false).
 */
export function unstartedShare(undecided: string, chunk: string, ownStart: string, ownEnd: string, later: readonly string[]): PausedShare & { readonly started: boolean } {
  const text = undecided + chunk;
  const own = printedAt(text, ownStart);
  const next = firstPrinted(text, later);
  if (next.marker !== null && (own.at < 0 || next.at < own.at)) return { started: false, take: '', undecided: '', stop: 'next', marker: next.marker };
  if (own.at >= 0) return { started: true, ...pausedShare('', text.slice(own.at), ownEnd, later) };
  return { started: false, take: '', undecided: text.slice(Math.min(own.hold, next.hold)), stop: null, marker: null };
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
 * The head of a POSIX wrapper's echo up to the first character of its start marker (`wrapCommand`). Behind a paused call's
 * own start frame, an echo of a wrapper is a later call's, and a paused call closed by that call is cut where it begins
 * (`cleanLines`, `until`).
 */
const ECHOED_POSIX_HEAD = "printf '%s\\n' '_";

/**
 * Rows read as one text: joined with no separator, so a frame or an echo the screen broke across rows is met whole, with
 * the row each offset falls on. The emulator gives the screen's rows (`ScreenEmulator.text`), and a row wraps wherever the
 * screen's width falls (REQ-TOOLS-128: the display resizes the foreground PTY, down to its 20-column floor); the markers
 * are per-call nonces, so no join of two rows a command printed spells one.
 */
function joinedRows(rows: readonly string[]): { readonly text: string; readonly rowAt: (offset: number) => number; readonly rowEnd: (row: number) => number } {
  const ends: number[] = [];
  let seen = 0;
  for (const row of rows) { seen += row.length; ends.push(seen); }
  const rowAt = (offset: number): number => {
    let row = 0;
    while (row < rows.length - 1 && ends[row]! <= offset) row += 1;
    return row;
  };
  return { text: rows.join(''), rowAt, rowEnd: (row) => ends[row] ?? 0 };
}

/**
 * The row on which the first occurrence of `marker` that ENDS a row ends, or -1: a printed frame is its own line (`printf
 * '%s\n'`), whatever the shell's prompt put in front of it, while the echo of a wrapper carries it followed by `'`.
 */
function firstRowEnd(rows: ReturnType<typeof joinedRows>, marker: string): number {
  for (let at = rows.text.indexOf(marker); at >= 0; at = rows.text.indexOf(marker, at + 1)) {
    const row = rows.rowAt(at + marker.length - 1);
    if (rows.text.slice(at + marker.length, rows.rowEnd(row)).trim() === '') return row;
  }
  return -1;
}

/**
 * A10: every row the echo of a POSIX wrapper occupies, dropped whole. The line discipline echoes what the product writes
 * as it arrives, onto whatever screen is collecting — the next call's wrapper lands on a soft-paused call's screen — and a
 * wrapper wider than the screen wraps. Dropping only the row that begins it (`printf '%s`) left its continuation rows,
 * the command's text and `printf '__rot_…_e:%s\n' "$?"`, in what the agent read. The rows are matched joined, with no
 * separator, so a break anywhere in the wrapper is no obstacle; the markers are per-call nonces, so no command spells one.
 * A row a shell's own line editor drew of a wrapper, scrolled sideways (`scrolledEcho`), is dropped too.
 */
function withoutEchoedWrappers(rows: readonly string[]): string[] {
  const { text, rowAt } = joinedRows(rows);
  const drop = new Set<number>();
  for (const m of text.matchAll(ECHOED_POSIX_WRAPPER)) {
    for (let r = rowAt(m.index); r <= rowAt(m.index + m[0].length - 1); r += 1) drop.add(r);
  }
  rows.forEach((row, i) => { if (scrolledEcho(row)) drop.add(i); });
  return drop.size === 0 ? [...rows] : rows.filter((_, i) => !drop.has(i));
}

/**
 * The echo of a POSIX wrapper as a shell's own line editor draws a line wider than the screen when the editor cannot wrap
 * it (readline on a `dumb` terminal): one row, scrolled sideways, its head replaced by `<` and the rest the line's tail up
 * to the cursor, which stands at the line's end — so the rest ends where the wrapper ends, in its end statement
 * (`printf '__rot_…_e:%s\n' "$?"`). Where the screen is wide enough the rest carries that whole statement
 * (`ECHOED_POSIX_END`); where it is not — below about 50 columns at bash's window — the rest is a TAIL of the statement
 * (`<74a244a85f47_e:%s\n' "$?"` at 40 columns, `<:%s\n' "$?"` at 20), which is matched against the statement's template
 * character by character, a hex digit where the nonce stands. Either way the row is dropped whole, at any width.
 *
 * FALSIFIED, kept beside its replacement (fin15's verification, 2026-10-04): "a row an editor still draws is dropped by
 * the end statement it carries" — true only while the row is wide enough to carry the whole statement. Measured with a
 * `sh` link to bash 5.2 and an `$ENV` file that turns emacs editing back on: at 40 and 50 columns the scrolled row reached
 * the interrupted call's poll; at 80 and 240 it did not.
 *
 * The printed end frame is `__rot_…_e:<status>`, never quoted, and the printed start frame carries no `%s`, so a row the
 * command printed matches neither form unless it prints this session's own wrappers: a `history` (bash) or `fc -l` listing
 * loses each row that carries a quoted end statement, and a printed row that is `<` followed by the exact tail of one is
 * taken for the echo. Both are the price of reading the echo by its shape; neither is a row any other command prints.
 */
function scrolledEcho(row: string): boolean {
  if (ECHOED_POSIX_END.test(row)) return true;
  const r = row.trimEnd();
  if (r.length < 2 || r[0] !== '<' || r.length - 1 > ECHOED_POSIX_END_TEMPLATE.length) return false;
  const tail = ECHOED_POSIX_END_TEMPLATE.slice(ECHOED_POSIX_END_TEMPLATE.length - (r.length - 1));
  for (let i = 0; i < tail.length; i += 1) {
    const c = r[i + 1]!;
    if (tail[i] === NONCE_DIGIT ? !/[0-9a-f]/.test(c) : tail[i] !== c) return false;
  }
  return true;
}
const ECHOED_POSIX_END = /'__rot_[0-9a-f]{24}_e:%s\\n' ?"\$\?"/;
const NONCE_DIGIT = '#';
/** `wrapCommand`'s POSIX end statement, its 24 nonce digits stood in for by `NONCE_DIGIT`. */
const ECHOED_POSIX_END_TEMPLATE = `printf '__rot_${NONCE_DIGIT.repeat(24)}_e:%s\\n' "$?"`;

/**
 * REQ-TOOLS-097/098/179, REQ-TOOLS-127 (`two-terminal-pty-tests-fail-on-main-in-this-environment`, 2026-10-04): the
 * arguments the session's POSIX shell is started with: interactive, and with its own line editor off where the shell
 * accepts `+o emacs +o vi`, so what the PTY echoes of a wrapper is the line discipline's echo, which wraps at the screen's
 * width like any output and which `withoutEchoedWrappers` reads joined across its rows.
 *
 * Where `/bin/sh` is `bash` (Fedora, RHEL, Arch), `bash -i` reads its input through readline, and readline on a `dumb`
 * terminal does not wrap a line wider than the screen: it scrolls it sideways on one row (`<…; printf '__rot_…_e:%s\n'
 * "$?"`), redrawn in place. The joined-rows match never met that row, and the next call's wrapper reached a soft-paused
 * call's poll (A10's case; measured with a `sh` link to `/usr/bin/bash` 5.2 at 240 and 80 columns, while at 1,000 columns,
 * where the wrapper fits on one row, nothing leaked). `dash` has no line editor and takes the two options as a no-op.
 * Whether a shell accepts them is asked once per shell file, with the same arguments; one that refuses them is started
 * with `-i` alone, as before, and a row its editor draws is still dropped (`scrolledEcho`, at any width). A startup file
 * that turns an editor back on (`$ENV`) meets the same drop.
 */
export function posixShellArgs(file: string): readonly string[] {
  let off = EDITOR_OFF.get(file);
  if (off === undefined) {
    try {
      execFileSync(file, [...LINE_EDITOR_OFF, '-c', ':'], { stdio: 'ignore', timeout: 5_000, env: {}, windowsHide: true });
      off = true;
    } catch {
      off = false;
    }
    EDITOR_OFF.set(file, off);
  }
  return off ? [...LINE_EDITOR_OFF, '-i'] : ['-i'];
}
const LINE_EDITOR_OFF: readonly string[] = ['+o', 'emacs', '+o', 'vi'];
const EDITOR_OFF = new Map<string, boolean>();

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
 * ADR-0020's exit-status expression, over the flag that carried "the last statement succeeded": the payload's own
 * flag (until 2026-10-15 also `$?` on a single-line path, which no longer exists: `wrapCommand`). A native command's
 * status is in `$LASTEXITCODE` either way (REQ-TOOLS-179).
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
    //
    // FALSIFIED, kept beside its replacement (the Windows ARM64 session's B3, 2026-10-15): "a single-line command keeps
    // today's wrapper, byte for byte" — `…; Write-Output '<start>'; <command>; Write-Output ('<end>:' + …)`, the command
    // spliced into the line with no `try`. A terminating error in it (`throw`, `-ErrorAction Stop`, a `Stop` preference)
    // abandoned the rest of the line, and a line that did not parse (`if (`, and `&&`/`||` under Windows PowerShell 5.1)
    // ran none of it, so the end frame never printed: measured under pwsh 7.6.6 and 5.1, every such command read 124 at the
    // hard cap with its session reset, where the same command over two lines reported exit 1 in about 0.1 s; and 5.1's
    // error text quoted the wrapper's own exit expression to the agent
    // (docs/defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md). Every command now takes
    // the guarded path, one line or many. An `exit` in the payload still ends the session's shell (measured, both shells),
    // so a command that ends the shell reads as OQ-144 ruled it (R-071), unchanged.
    //
    // The command is parsed ALONE before it runs with the flag's line after it: a command that does not parse (`if (`)
    // otherwise ran the parser on into that line, and the error the agent read quoted `$global:<nonce>_ok = $?`. The
    // decoded text sits in a nonce-named global for the two parses and is removed before the end frame.
    const flag = `$global:${end}_ok`;
    const source = `$global:${end}_src`;
    const payload = Buffer.from(command, 'utf8').toString('base64');
    return `$global:LASTEXITCODE = $null; ${flag} = $true; Write-Output '${start}'; `
      + `try { ${source} = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')); $null = [scriptblock]::Create(${source}); `
      + `. ([scriptblock]::Create(${source} + [char]10 + '${flag} = $?')) } `
      + `catch { ${flag} = $false; Write-Output ($_ | Out-String).TrimEnd() }; `
      + `Remove-Variable -Name '${end}_src' -Scope Global -ErrorAction SilentlyContinue; `
      + `Write-Output ('${end}:' + ${powershellExit(flag)})`;
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
  //
  // FALSIFIED, kept beside its replacement (live-run finding M1, 2026-10-06): "ONE physical line" carries any command. The
  // shell reads the line through the PTY's canonical-mode line discipline, which keeps 4,095 characters of a line on Linux
  // (termios(3)); a 3,700-character heredoc wrapped to about 4,304 bytes reached `sh` cut inside its `'%b'` quote, the shell
  // stood on its continuation prompt, and the call read as a soft pause with `>` for its output. This function still
  // builds the one line; `ForegroundSession.carry` stages a command whose line is longer than `POSIX_LINE_BYTES` in a
  // script and wraps `. '<script>'` here instead.
  const payload = command.includes('\n')
    ? `"$(printf '%b' '${command.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/'/g, `'\\''`)}')"`
    : `'${command.replace(/'/g, `'\\''`)}'`;
  return `printf '%s\\n' '${start}'; command eval ${payload}; printf '${end}:%s\\n' "$?"`;
}

/**
 * The longest line the POSIX wrapper may be, its CR included, before the command is staged instead (live-run finding M1,
 * docs/defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md). The shell reads
 * the wrapper through the PTY's canonical-mode line discipline, which keeps 4,095 characters of one line on Linux and
 * discards the rest up to the line end (termios(3)); macOS keeps `MAX_CANON`, 1,024. This stays under both.
 */
export const POSIX_LINE_BYTES = 1_000;

/**
 * Live-run finding M1: the script a POSIX command too long for one line is staged in, at `file`, which the session's shell
 * dot-sources through the ordinary wrapper (`command eval '. <file>'`). Its first line removes the file before the
 * command runs (the shell holds it open; `command` and the redirect keep a missing `rm` silent), so a staged command
 * leaves nothing behind once the shell has read it, and the command keeps its own line numbers: it starts on line 1.
 */
export function stagedScript(file: string, command: string): string {
  return `command rm -f -- ${shQuote(file)} 2>/dev/null; ${command}\n`;
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

/** PD-TOOLS-001: the marker each capture row begins with (the colon follows it), and the base64 characters a row carries. */
const SNAPSHOT_MARK = '__rot_b64__';
const SNAPSHOT_ROW = 64;
/**
 * PD-TOOLS-001, PowerShell: the NUL-terminated field the encoded capture opens with. A Windows directory has no single
 * leading character to tell a whole capture from one that lost its top rows (POSIX's `/`), so the capture names itself:
 * a decode that does not begin with this field began mid-entry and is refused.
 */
const PS_SNAPSHOT_TAG = '__rot_ps__';

/**
 * PD-TOOLS-001's capture line: the shell's own cwd plus every exported variable. The marker is never written next to the
 * colon that follows it in the command itself: PowerShell assembles it through variables (`$__p`, `$__q`), and POSIX
 * assigns it to `Q` and prints it as `$Q:`, so in the PTY's echo the marker is followed by `'`, never `:`, and the echo
 * can never itself match the parse below however the screen wraps it.
 */
export function snapshotCommand(backend: ShellBackend): string {
  if (backend.kind === 'powershell') {
    // The POSIX capture's rows, spelled in PowerShell: the tag, the directory and every `NAME=value`, each NUL-terminated,
    // UTF-8, base64, cut into 64-character rows behind the marker. Until 2026-10-06 it printed one plain row per variable
    // and the parse took a row the screen wrapped for a newline inside the value — a `Path` past the 240 columns, every
    // row at the 20 the display may narrow to — and cut a directory wider than the screen at its edge
    // (docs/defects/fixed/the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md). Read from the
    // POSIX repair and pinned over the parse on Linux; executing it needs a Windows host. Executed 2026-10-15 on Windows 11
    // ARM64 under pwsh 7.6.6 and 5.1: read whole and restored byte for byte at 34 to 240 columns (B2 of that session's
    // record, ADR-0020); below 34 no call ends at all (docs/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md).
    return `$__m = '${SNAPSHOT_MARK}'; $__s = '${PS_SNAPSHOT_TAG}' + [char]0 + (Get-Location).Path + [char]0 + ((Get-ChildItem Env: | ForEach-Object { $_.Name + '=' + $_.Value + [char]0 }) -join ''); $__b = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($__s)); for ($__i = 0; $__i -lt $__b.Length; $__i += ${SNAPSHOT_ROW}) { Write-Output ($__m + ':' + $__b.Substring($__i, [Math]::Min(${SNAPSHOT_ROW}, $__b.Length - $__i))) }`;
  }
  // POSIX: the directory and `env -0`, NUL-separated, as base64 folded to 64 columns. The capture is the EMULATED
  // screen (ADR-0021), which wraps a line at its width, and a wrapped line cannot be told from a value's own newline:
  // a PATH longer than the 240 columns came back with a newline inside it and the restore broke every command lookup
  // (`sleep: not found`), measured on Linux 2026-09-24. Base64 holds no newline of its own, so a row break inside the
  // capture is always the screen's, and the parse (`encodedSnapshot`) joins the rows back with nothing between them; NUL
  // separates entries even where a value holds a newline.
  // FALSIFIED, kept beside its replacement (docs/defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md,
  // 2026-10-04): "a 64-column line never wraps". A row is the 12-column marker and 64 characters, 76 columns, and the
  // display narrows the screen to as few as 20 (REQ-TOOLS-128); the parse kept only the rows that began with the marker,
  // and at 40 columns fin15 read back three entries, PATH and HOME gone, one name spliced from two and a value cut.
  // The encoder's own line breaks (76 columns in GNU and busybox `base64`, none in BSD's) are taken out and one put back at
  // the end, so every row but the last carries exactly 64 characters on every host, which the parse checks.
  return `Q='${SNAPSHOT_MARK}'; { { printf '%s\\0' "$PWD"; env -0; } | base64 | tr -d '\\n'; echo; } | fold -w ${SNAPSHOT_ROW} | sed "s/^/$Q:/"`;
}

/**
 * PD-TOOLS-001, both backends: the base64 text of the capture, read off screen rows of any width, or null when there is none or it
 * is not whole. The rows are joined with nothing between them, so the continuation a narrow screen wrapped onto the next
 * row rejoins its head, and each marker then opens one of `snapshotCommand`'s rows. A stray line between rows (a job
 * notice) ends the row before it at its first character outside the alphabet. Whatever the joining could still get
 * wrong is refused, never decoded into a spliced environment: every row but the last carries exactly 64 characters, the
 * last 1 to 64, the whole is valid padded base64, and its decoded text ends with the NUL `env -0` writes after each entry.
 */
function encodedSnapshot(output: string): string | null {
  const joined = joinedRows(output.split('\n')).text;
  if (!joined.includes(`${SNAPSHOT_MARK}:`)) return null;
  const rows = [...joined.matchAll(new RegExp(`${SNAPSHOT_MARK}:([A-Za-z0-9+/=]*)`, 'g'))].map((m) => m[1]!);
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1]!;
  if (rows.slice(0, -1).some((r) => r.length !== SNAPSHOT_ROW) || last.length === 0 || last.length > SNAPSHOT_ROW) return '';
  const text = rows.join('');
  return text.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(text) ? text : '';
}

/**
 * PD-TOOLS-001: the decoded capture — the directory, then `NAME=value` entries, each NUL-terminated; PowerShell's opens
 * with `PS_SNAPSHOT_TAG`'s field.
 */
function parseEncodedSnapshot(encoded: string, kind: ShellBackend['kind']): ShellState | null {
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  if (!decoded.endsWith('\0')) return null;
  const fields = decoded.slice(0, -1).split('\0');
  const powershell = kind === 'powershell';
  // PowerShell's capture is whole only when it opens with its tag. The backend decides which rule applies, never the
  // capture: read without it, a PowerShell capture that lost its top rows and happened to resume at a `/` (inside a URL
  // or a POSIX-style path in a value) passed as a POSIX one.
  if (powershell && fields[0] !== PS_SNAPSHOT_TAG) return null;
  const [cwd, ...entries] = powershell ? fields.slice(1) : fields;
  const env: Record<string, string> = {};
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  // A capture with no variables is a shell that could not list them (no `env -0`), never an empty environment:
  // restoring it would unset every variable the fresh shell has, so it is refused and the previous capture kept.
  // `$PWD` is always absolute, so a directory that does not start with `/` is a capture that lost whole rows from its top
  // (the emulator's scrollback overflowed under a very large environment at a narrow width): every row still carries 64
  // characters, so the checks in `encodedSnapshot` pass, and the decode starts mid-entry. It is refused the same way.
  // PowerShell's capture is told whole by its tag instead; its directory is whatever `Get-Location` named, never empty.
  if (cwd === undefined || (powershell ? cwd === '' : !cwd.startsWith('/')) || Object.keys(env).length === 0) return null;
  return { cwd, env };
}

/**
 * PD-TOOLS-001's parse, both backends: the encoded capture's rows, joined across the screen's wraps, decoded; null when
 * there is none or it is not whole (`encodedSnapshot`, `parseEncodedSnapshot`). `kind` is the backend that ran the
 * capture, which decides how a whole one is told.
 */
export function parseSnapshot(output: string, kind: ShellBackend['kind'] = 'posix'): ShellState | null {
  const encoded = encodedSnapshot(output);
  if (encoded === null || encoded === '') return null;
  return parseEncodedSnapshot(encoded, kind);
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
   * OQ-164: soft-paused calls still open AHEAD of `pausedCommand`, oldest first. A call issued while a command is
   * soft-paused is queued behind it by the shell, and when that call soft-pauses too it takes the paused slot; the call it
   * waited behind is kept here, still fed its share of the stream, instead of being disposed with its end unreported. The
   * first is the line the shell is running.
   */
  private pausedAhead: PausedCall[] = [];
  /**
   * OQ-164: paused calls that have closed and have not been reported, oldest first — those that were ahead of
   * `pausedCommand`, and any the session's reset or the shell's end closed. The next observation reports them
   * (`drainEarlier`).
   */
  private pausedEnded: PausedCall[] = [];
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
  /**
   * Live-run finding M1: the private directory a POSIX command too long for one PTY line is staged in (`carry`), made on
   * the first such command and removed with the session; `staged` numbers its scripts.
   */
  private stagingDir: string | null = null;
  private staged = 0;

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
      : posixShellArgs(backend.file);
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
    // OQ-164: the shell runs paused lines in order, so the first open one is the command that ended it; any queued behind
    // it, and the running call itself, never ran.
    const chain = this.openPaused();
    const now = this.deps.monotonic.now();
    chain.forEach((paused, i) => {
      if (paused.undecided !== '' && paused.started) paused.hold.push(paused.undecided);
      paused.undecided = '';
      paused.code = null;
      paused.endedBy = i === 0 && paused.started ? 'shell' : 'never-ran';
      paused.endedAt = now;
      paused.onClose?.();
    });
    this.pausedEnded.push(...this.pausedAhead);
    this.pausedAhead = [];
    if (this.pausedCommand) {
      this.pausedDone = this.pausedCommand;
      this.pausedCommand = null;
    }
    const a = this.active;
    if (a) {
      this.active = null;
      a.onShellExit?.(chain.length === 0);
    }
  }

  /** OQ-164: every soft-paused call still open, oldest first — the line the shell is running, then those queued behind it. */
  private openPaused(): PausedCall[] {
    return this.pausedCommand === null ? [...this.pausedAhead] : [...this.pausedAhead, this.pausedCommand];
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
    // OQ-164: every open paused call, oldest first — the one the shell is running, then any whose lines are queued behind it.
    const chain = this.openPaused();
    const active = this.active;
    if (!active && chain.length === 0) return;
    // A soft-paused call and the calls queued behind it share the stream, and the shell runs their lines in order. What the
    // paused call collects is its share of each chunk (`pausedShare`), which ends at its own end frame or at the printed start
    // marker of any line written after it, whichever the shell reaches (A10). A paused call queued behind another (OQ-164)
    // collects nothing until its own start marker prints (`unstartedShare`).
    // FALSIFIED, kept beside its replacement (OQ-164's verification, 2026-10-01): "the next line's start marker" alone — the
    // queued line's, else the no-op line's, else the running call's. An interrupt discards every line the shell has not read,
    // so the queued line's marker never printed, and nothing cut the interrupted call's share short of the next call's frame.
    const later = (i: number): string[] => {
      const out: string[] = [];
      const add = (m: string | null | undefined) => { if (m) out.push(m); };
      // The no-op line a poll after an interrupt submitted (`closer`) was written after its call's line and before any later
      // call's.
      add(chain[i]!.closer);
      for (const behind of chain.slice(i + 1)) { add(behind.start); add(behind.closer); }
      add(active?.start);
      add(active?.closer);
      return out;
    };
    const shares = chain.map((paused, i) => {
      const share = paused.started ? pausedShare(paused.undecided, chunk, paused.end, later(i)) : unstartedShare(paused.undecided, chunk, paused.start, paused.end, later(i));
      if ('started' in share && share.started) paused.started = true;
      if (share.take !== '') { paused.hold.push(share.take); paused.lastOutputAt = this.deps.monotonic.now(); }
      paused.undecided = share.undecided;
      return share;
    });
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
    const activeCode = active ? frame(active.end) : null;
    // OQ-164: a later line's end frame — a paused call's queued behind it, or the running call's — closes an open paused
    // call the same way, the shell having gone past its line.
    const laterFrame = (i: number): boolean => activeCode !== null || chain.slice(i + 1).some((later) => frame(later.end) !== null);
    chain.forEach((paused, i) => {
      const pausedCode = paused.started ? frame(paused.end) : null;
      const share = shares[i]!;
      if (!(pausedCode !== null || share.stop === 'next' || laterFrame(i))) return;
      // Closed without a decision on the raw stream: whatever it still held back was its own — once its line had started.
      if (paused.undecided !== '' && paused.started) paused.hold.push(paused.undecided);
      paused.undecided = '';
      paused.code = pausedCode;
      // OQ-164: a later line started and this one never had — its line was gone unread (`unstartedShare`).
      if (!paused.started) paused.endedBy = 'discarded';
      else if (pausedCode === null) paused.until = share.marker !== null ? [share.marker] : later(i);
      paused.endedAt = this.deps.monotonic.now();
      if (paused === this.pausedCommand) {
        this.pausedDone = paused;
        this.pausedCommand = null;
      } else {
        this.pausedAhead = this.pausedAhead.filter((p) => p !== paused);
        this.pausedEnded.push(paused);
      }
      paused.onClose?.();
    });
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
    if (!this.active && this.openPaused().length === 0) this.pendingText = '';
  }

  /** The capture: the emulated screen with the echoed command line and both marker frames removed. */
  static clean(screenText: string, start: string, end: string, until: string | readonly string[] | null = null): string {
    return ForegroundSession.cleanLines(screenText, start, end, until).join('\n').replace(/\s+$/, '');
  }

  private static cleanLines(screenText: string, start: string, end: string, until: string | readonly string[] | null = null): string[] {
    // The echoed wrapper is dropped BEFORE the start marker is looked for, not only after it. The marker's own
    // line can carry the shell's PROMPT in front of it: the line discipline echoes what we wrote as soon as it
    // arrives, and the shell prints its prompt when it reads — so when the write lands first, the screen reads
    // `<echo>` on one row and `$ <marker>` on the next. The old reading required a row that was EXACTLY the
    // marker, found none, kept the whole screen, and handed the agent `$ <marker>` as though the command had
    // printed it. Rare, load-dependent and real: measured under a concurrently running suite on Linux,
    // 2026-09-16. A row that ENDS with the marker is the marker's row whatever stands in front of it, and the
    // marker is a per-call nonce, so no command can spell one to cut its own capture short (consequence 1).
    const unmatched = withoutEchoedWrappers(screenText.split('\n'));
    const strayEcho = (l: string): boolean => l.includes('Write-Output (') || l.includes("printf '%s");
    const keptIndex = unmatched.flatMap((l, i) => (strayEcho(l) ? [] : [i]));
    const lines = keptIndex.map((i) => unmatched[i] as string);
    // Every marker below is looked for across row breaks (`joinedRows`), never within one row: a frame is as wide as its
    // nonce (`__rot_` + 24 digits + `_s` is 32 columns, the end frame 34 or more), and the display may narrow the screen
    // to 20 columns (REQ-SHELL-100), where every frame wraps.
    // FALSIFIED, kept beside its replacement (fin15's verification, 2026-10-04): "a frame is one row: a row that ends with
    // the start marker, a row that carries a later marker, the end frame within one line". Measured under dash at 20 and
    // 30 columns: every call's capture began with its own wrapped start frame and ended with its wrapped end frame and the
    // prompt, and a paused call's poll carried its own end frame or the next call's start frame; at 34 columns and wider
    // nothing leaked.
    const rows = joinedRows(lines);
    const startAt = firstRowEnd(rows, start);
    let kept = startAt >= 0 ? lines.slice(startAt + 1) : lines;
    // A paused call closed with no frame of its own (A10) stops where the next call begins — its start marker in any form,
    // printed or in an echo of its wrapper that escaped the removal above — since what follows is the next call's, and
    // after that the product's snapshot. It is looked for in the rows BEFORE the stray-echo filter: the row carrying an
    // unmatched echo's head (`printf '%s\n' '__r`) carries the first characters of that marker, and dropping the row
    // first left a marker nobody could find (docs/defects/fixed/at-the-20-column-floor-an-interrupted-calls-poll-intermittently-carries-the-next-calls-wrapper-echo.md).
    // The echo goes unmatched when the shell's own output lands inside it: after C-c, dash prints a line end and its
    // prompt when it takes the interrupt, and when the next call's wrapper is written first the line discipline is
    // already echoing it, so the prompt splits the echo (measured at 20 columns, before the end statement's closing
    // `"`). The echo's head and the first character of its marker (`printf '%s\n' '_`) are cut at the column they begin,
    // which keeps the `^C` the echo shares a row with; a marker that stands whole is cut at its row, which drops the
    // prompt in front of a printed one. Between them they find the echo wherever one prompt splits it, at most its first
    // sixteen characters left behind where the prompt lands among them. A paused command that itself prints that head
    // loses the rest of this poll from there, where the stray-echo filter already dropped the row.
    if (until !== null) {
      const markers = typeof until === 'string' ? [until] : until;
      const firstKept = startAt >= 0 ? (keptIndex[startAt] as number) + 1 : 0;
      const tail = unmatched.slice(firstKept);
      const tailRows = joinedRows(tail);
      const marked = markers.map((m) => tailRows.text.indexOf(m)).filter((at) => at >= 0);
      const markerRow = marked.length > 0 ? tailRows.rowAt(Math.min(...marked)) : tail.length;
      const head = tailRows.text.indexOf(ECHOED_POSIX_HEAD);
      const headRow = head >= 0 ? tailRows.rowAt(head) : tail.length;
      if (head >= 0 && headRow <= markerRow) {
        const lead = (tail[headRow] as string).slice(0, head - (headRow === 0 ? 0 : tailRows.rowEnd(headRow - 1))).trimEnd();
        kept = [...tail.slice(0, headRow), ...(lead === '' ? [] : [lead])].filter((l) => !strayEcho(l));
      } else if (markerRow < tail.length) {
        kept = tail.slice(0, markerRow).filter((l) => !strayEcho(l));
      }
    }
    let body = kept.join('\n');
    // The end frame is cut at its FIRST occurrence, wherever it sits. Removing whole LINES that began with it
    // left the marker in what the agent read whenever the command's last write had no trailing newline and the
    // frame landed mid-line — `Property          : __rot_…_e:0`, verbatim from the run of 2026-09-12. Detection
    // in `onData` has always been unanchored; this is its sibling on the removal side (ADR-0020's note). A row break
    // may fall anywhere in it.
    const at = body.search(new RegExp(`${[...`${end}:`].join('\\n?')}\\n?-?\\n?\\d`));
    if (at >= 0) body = body.slice(0, at);
    return body.split('\n');
  }

  /** ADR-0021's emulator for one call's capture, sized by REQ-TOOLS-097's cap (`FOREGROUND_SCREEN_LINES`). */
  private newScreen(): ScreenEmulator {
    return this.deps.emulator({ cols: this.size.cols, rows: this.size.rows, scrollback: Math.max(0, FOREGROUND_SCREEN_LINES - this.size.rows) });
  }

  /** REQ-TOOLS-187: a queue of one — a second foreground call waits for the first. */
  run(command: string, opts: { timeoutMs: number | null; hardMs?: number; signal?: AbortSignal; label?: string }): Promise<ForegroundResult> {
    const next = this.chain.then(() => this.executeReporting(command, opts));
    this.chain = next.catch(() => undefined);
    return next;
  }

  /**
   * OQ-164 (`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced`, live-run finding a71-8): a call issued
   * while a command is soft-paused is queued behind it by the shell. Its observation said only its own outcome, and the paused
   * command's end waited for a poll nobody made; a later soft pause disposed of the paused call and its end was never
   * reported. Every call now reports, beside its own outcome, each paused command that ended and was not reported, and each
   * still running ahead of it (`drainEarlier`).
   */
  private async executeReporting(command: string, opts: { timeoutMs: number | null; hardMs?: number; signal?: AbortSignal; label?: string }): Promise<ForegroundResult> {
    const submittedAt = this.deps.monotonic.now();
    const r = await this.execute(command, opts);
    // A call that soft-paused may have closed during its own handover (`pausedDone` is then its own): it is no earlier one.
    const earlier = await this.drainEarlier(submittedAt, !r.softPaused);
    return earlier.length === 0 ? r : { ...r, earlier };
  }

  /**
   * OQ-164: what the next observation reports of paused commands other than its subject, and their release. Every closed
   * one not yet reported (and, for a call, a `pausedDone` a poll never took) is handed over with its output since it was
   * last observed, and its screen disposed; every one still open ahead of `pausedCommand` is reported as running, with
   * what it wrote since, and kept.
   */
  private async drainEarlier(submittedAt: number | null, includeDone: boolean): Promise<PausedEnd[]> {
    const closed = [...this.pausedEnded, ...(includeDone && this.pausedDone !== null ? [this.pausedDone] : [])];
    this.pausedEnded = [];
    if (includeDone) this.pausedDone = null;
    const now = this.deps.monotonic.now();
    const out: PausedEnd[] = [];
    for (const p of closed) {
      const output = await ForegroundSession.sincePoll(p);
      const truncated = p.screen.truncated || p.hold.dropped;
      p.screen.dispose();
      const endedAt = p.endedAt ?? now;
      const end: PausedEnd['end'] = p.endedBy ?? (p.code === null ? 'no-status' : 'exit');
      const interruptedBefore = end === 'no-status' && submittedAt !== null && p.interruptedAt !== null && p.interruptedAt <= submittedAt;
      out.push({ label: p.label, end, interruptedBefore, exitCode: p.code, endedAfterSubmitMs: submittedAt === null ? null : endedAt - submittedAt, endedAgoMs: Math.max(0, now - endedAt), output, truncated });
    }
    for (const p of this.pausedAhead) {
      const output = await ForegroundSession.sincePoll(p);
      p.observedAt = now;
      out.push({ label: p.label, end: 'running', interruptedBefore: false, exitCode: null, endedAfterSubmitMs: null, endedAgoMs: null, output, truncated: p.screen.truncated || p.hold.dropped });
    }
    return out;
  }

  private async execute(command: string, opts: { timeoutMs: number | null; hardMs?: number; signal?: AbortSignal; label?: string }): Promise<ForegroundResult> {
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
      // PD-TOOLS-013 (OQ-226): no exit code and no timeout. FALSIFIED, kept beside its replacement: this returned 124 and
      // `timedOut: true`, so a cancel read as REQ-TOOLS-099's hard timeout (live-run P2 at a68f121).
      this.active = null;
      this.state = 'resetting';
      const reset = this.resetNow();
      const restore: RestoreOutcome = reset ? await this.restoreState() : { status: 'failed' };
      return withRespawn({ output: '', exitCode: null, timedOut: false, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: CANCELLED_ERROR, sessionReinitialized: reinit, truncated: false, restore, cancelled: 'before' });
    }
    const nonce = randomBytes(12).toString('hex');
    const start = `__rot_${nonce}_s`;
    const end = `__rot_${nonce}_e`;
    // Staged BEFORE any of the call's state exists (a listener, `region`, `active`): a staging that throws leaves the session
    // exactly as it was, the call an `execution_error` that never ran, rather than a call whose state was set and never cleared.
    let carried: string;
    try {
      carried = this.carry(command, start, end);
    } catch (cause) {
      this.state = 'idle';
      return withRespawn({ output: '', exitCode: null, timedOut: false, softPaused: false, killStatus: null, error: `${STAGING_FAILED_ERROR}: ${cause instanceof Error ? cause.message : String(cause)}`, sessionReinitialized: reinit, truncated: false, restore: { status: 'none' } });
    }
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
    // there with OQ-147's reading, confirmed 2026-10-06 by R-071. Where `/proc` does not say who holds the terminal nothing is written while the call
    // runs; the mark is carried into the soft pause, and a poll after it reads it as a C-c sent after the pause.
    let interrupted = false;
    let interruptedAt: number | null = null;
    let closer: string | null = null;
    const done = new Promise<{ kind: 'exit'; code: number } | { kind: 'timeout' } | { kind: 'pause' } | { kind: 'abort' } | { kind: 'kill'; reset: boolean } | { kind: 'replaced' } | { kind: 'ended' } | { kind: 'shellEnded'; ran: boolean }>((resolve) => {
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
          interruptedAt = monotonic.now();
          const look = () => {
            lookForEnd = null;
            if (this.active !== active || active.closer !== null) return;
            const holds = shellHoldsTerminal(p.pid, this.deps.platform ?? process.platform);
            if (holds === null) return;
            if (holds) { closer = this.submitCloser(p); active.closer = closer; return; }
            lookForEnd = timers.after(INTERRUPT_WATCH_MS as Millis, look);
          };
          lookForEnd = timers.after(INTERRUPT_WATCH_MS as Millis, look);
        },
        onCloser: () => resolve({ kind: 'ended' }),
        onShellExit: (ran) => resolve({ kind: 'shellEnded', ran }),
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
    // OQ-164: such a call is queued behind the paused line, and until its own start marker prints (`region.started`) nothing
    // the stream carries is its own: the earlier command's output is that command's report, never this call's capture.
    const queuedBehind = this.openPaused().length > 0;
    if (!queuedBehind) this.pendingText = '';
    const region = new CommandRegion(start, end);
    this.region = region;
    this.submit(p, carried);
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
    // OQ-164: a soft pause while an earlier paused call is still open means this call's line has not started: the shell is
    // still running the earlier one. It has written nothing of its own.
    const queued = outcome.kind === 'pause' && this.openPaused().length > 0;
    // A call the shell never started has nothing of its own on its screen: whatever is there is an earlier command's.
    const ranLine = !queuedBehind || region.started;
    if (outcome.kind === 'pause') {
      // FALSIFIED, kept beside its replacement (OQ-164, 2026-10-01): "a pause nobody ever polled is replaced here: release
      // its screen rather than leave it". The replaced call was still running, or had ended with nothing yet reported, so
      // its end was lost with its screen. A closed one now waits to be reported by this call's observation, and an open one
      // is kept ahead of this call, still fed its share of the stream, until it ends and the next observation reports it.
      if (this.pausedDone !== null) this.pausedEnded.push(this.pausedDone);
      this.pausedDone = null;
      if (this.pausedCommand !== null) this.pausedAhead.push(this.pausedCommand);
      // It is fed by `onData` from here, its share of each chunk only (`pausedShare`), until its own frame or the next
      // call's start marker closes it (A10). `delivered` is what this call returns, set once the screen has it.
      // An interrupt that reached it while it ran is carried (OQ-147), and so is the no-op line already submitted for it,
      // whose printed marker then closes the paused call as a poll's own would.
      // A queued one starts from an empty hold, so the earlier command's bytes count against neither its bound nor its
      // truncation, and is fed from its own start marker on (`unstartedShare`).
      paused = { start, end, screen, hold: queued ? new HeldBytes(this.size.cols) : hold, delivered: '', undecided: '', code: null, until: null, started: ranLine && !queued, interrupted, interruptedAt, closer, onClose: null, lastOutputAt, observedAt: monotonic.now(), endedBy: null, label: opts.label ?? command, endedAt: null };
      this.pausedCommand = paused;
      this.active = null;
      this.state = 'idle';
    }
    this.listeners = this.listeners.filter((l) => l !== listener);
    const taken = hold.take();
    if (paused !== null && !paused.started) {
      // Only a tail that could still be its start marker is kept; the rest is the earlier command's.
      const share = unstartedShare('', taken, start, end, closer === null ? [] : [closer]);
      if (share.started) { paused.started = true; if (share.take !== '') paused.hold.push(share.take); }
      paused.undecided = share.undecided;
    } else if (ranLine) {
      await screen.write(taken);
    }
    // A call ended by the product's own no-op line (OQ-147) stops where that line begins.
    const lines = ranLine && !queued ? ForegroundSession.cleanLines(screen.text(), start, end, outcome.kind === 'ended' ? closer : null) : [];
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
      // OQ-164: a call that waited behind a soft-paused command never ran when the interrupt reached that command first —
      // the terminal discarded its line unread — so it has no exit status at all.
      const r = finish(ranLine
        ? { exitCode: -1, timedOut: false, softPaused: false, killStatus: null, error: ENDED_WITHOUT_STATUS }
        : { exitCode: null, timedOut: false, softPaused: false, killStatus: null, error: NEVER_RAN_ERROR });
      screen.dispose();
      await this.refreshState();
      return r;
    }
    if (paused !== null) {
      // REQ-TOOLS-098: return −1, the process keeps running; a later empty command polls what it produced since.
      // The call's screen is kept and keeps filling, so the poll reads the same emulated screen further along.
      // A call queued behind a paused one (OQ-164) has written nothing, and its screen is given nothing before its own start
      // marker prints: what came before is the earlier command's, which that command's report carries.
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
      const r: ForegroundResult = { ...finish({ exitCode: null, timedOut: false, softPaused: false, killStatus: reset ? 'session_reset' : 'reset_failed', error: outcome.ran ? SHELL_ENDED_ERROR : SHELL_ENDED_BEFORE_ERROR }), restore, shellEnded: outcome.ran ? 'command' : 'before' };
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
    // The REQ-TOOLS-099 contract stands for the hard timeout — 124, session_reset, state lost — and the detail says both.
    // PD-TOOLS-013 (OQ-226): an abort is the run's cancel, not the hard bound, so it carries no exit code and no timeout;
    // whichever bound settled the call first (`outcome.kind`) decides. FALSIFIED, kept beside its replacement: both read
    // 124 and `timedOut: true`, and a quit's cancel after 3,505 ms was recorded as a 100 s timeout (live-run P2 at a68f121).
    this.active = null;
    this.state = 'resetting';
    const reset = this.resetNow();
    const restore: RestoreOutcome = reset ? await this.restoreState() : { status: 'failed' };
    const killStatus = reset ? 'session_reset' as const : 'reset_failed' as const;
    const r: ForegroundResult = outcome.kind === 'abort'
      ? { ...finish({ exitCode: null, timedOut: false, softPaused: false, killStatus, error: CANCELLED_ERROR }), restore, cancelled: 'during' }
      : { ...finish({ exitCode: 124, timedOut: true, softPaused: false, killStatus, error: null }), restore };
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
    // OQ-164 (the verifier's finding on its repair): the interrupt reaches the line the shell is running — the oldest open
    // paused call's — and the polled call may be queued behind it. The no-op line goes after every open paused line, on the
    // polled one (`closer`), so its printed marker closes them all: the interrupted one with OQ-147's reading (confirmed 2026-10-06 by R-071), and any whose
    // line the interrupt discarded as never having run. Looking only at the polled call, nothing was ever written and every
    // poll read "still running" over a dead command and an idle prompt.
    const chain = this.openPaused();
    const open = this.pausedCommand;
    const pty = this.pty;
    let unseen = false;
    if (open !== null && chain.some((c) => c.interrupted) && chain.every((c) => c.closer === null) && this.active === null && pty !== null) {
      // A poll made at once after the `C-c` can meet a shell still waiting on the dying program; it waits a short, bounded
      // while for the shell to take its terminal back (`INTERRUPT_SETTLE_MS`).
      const platform = this.deps.platform ?? process.platform;
      let holds = shellHoldsTerminal(pty.pid, platform);
      const by = this.deps.monotonic.now() + INTERRUPT_SETTLE_MS;
      while (holds === false && this.deps.monotonic.now() < by) {
        await new Promise<void>((res) => { this.deps.timers.after(25 as Millis, res); });
        holds = shellHoldsTerminal(pty.pid, platform);
      }
      // OQ-168 (ruled 2026-10-06, R-071): the product's own no-op line is written only once the host says the shell
      // holds its terminal again (Linux's `/proc`). Where nothing says who holds it — Windows and macOS — nothing is written:
      // a line written there could become the input of a program that survived the interrupt, and how PowerShell treats
      // `C-c` mid-line is unmeasured. The poll says instead that the command may have ended and that the next command run in
      // the session reports how (`interruptUnseen`). Before the ruling a poll there wrote the line whatever held the
      // terminal (`holds !== false`), the build's reading while OQ-168 was open.
      if (holds === true && this.pausedCommand === open && open.closer === null && this.active === null && this.pty === pty) await this.findInterruptedEnd(open, pty);
      else if (holds === null) unseen = true;
    }
    // OQ-164: paused commands ahead of the polled one — ended and not reported, or still running — are reported beside it.
    const earlier = await this.drainEarlier(null, false);
    const withEarlier = (r: ForegroundResult): ForegroundResult => (earlier.length === 0 ? r : { ...r, earlier });
    const subject = await this.pollSubject();
    return withEarlier(unseen && subject.softPaused ? { ...subject, interruptUnseen: true } : subject);
  }

  /** REQ-TOOLS-098's poll of the paused command itself (`poll`). */
  private async pollSubject(): Promise<ForegroundResult> {
    const done = this.pausedDone;
    if (done) {
      this.pausedDone = null;
      const out = await ForegroundSession.sincePoll(done);
      const truncated = done.screen.truncated || done.hold.dropped;
      done.screen.dispose();
      if (done.endedBy === 'shell' || done.endedBy === 'never-ran') {
        // OQ-144 (the shell-exit case): the paused command ended the session's shell. It has no exit status of its own, and
        // the poll that hands it over respawns the shell, as the call that was running would have; a later call that met
        // the ended shell first has respawned it already, and the poll reports that nothing more was done. One queued behind
        // another paused command that ended the shell never ran (OQ-164).
        const respawn = this.shellEnded ? await this.respawnAfterShellEnded() : null;
        const ran = done.endedBy === 'shell';
        return { output: out, exitCode: null, timedOut: false, softPaused: false, killStatus: respawn === null ? null : respawn.reset ? 'session_reset' : 'reset_failed', sessionReinitialized: false, truncated, error: ran ? PAUSED_SHELL_ENDED_ERROR : SHELL_ENDED_BEFORE_ERROR, restore: respawn?.restore ?? { status: 'none' }, shellEnded: ran ? 'command' : 'before' };
      }
      // OQ-164: its line was gone unread — an interrupt sent to the command ahead of it discarded it — so it never ran.
      if (done.endedBy === 'discarded') return { output: out, exitCode: null, timedOut: false, softPaused: false, killStatus: null, sessionReinitialized: false, truncated, error: PAUSED_NEVER_RAN_ERROR, restore: { status: 'none' } };
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
   * interrupt, once the shell holds its terminal again (`shellHoldsTerminal`; never where `/proc` does not say, OQ-168's ruling), submits
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
    // OQ-164: a call the shell has not started has written nothing (`unstartedShare`).
    if (!p.started) return '';
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
    // OQ-164: the paused calls go with the tree, and the next observation says so: the one the shell was running ended by
    // the reset, any queued behind it never ran. Their screens are kept for that report (`drainEarlier`).
    const now = this.deps.monotonic.now();
    this.openPaused().forEach((paused, i) => {
      paused.code = null;
      paused.endedBy = i === 0 && paused.started ? 'reset' : 'reset-before';
      paused.endedAt = now;
      paused.onClose?.();
    });
    this.pausedEnded.push(...this.openPaused(), ...(this.pausedDone === null ? [] : [this.pausedDone]));
    this.pausedAhead = [];
    this.pausedCommand = null;
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
    // OQ-164: the interrupt reaches the line the shell is running — the oldest open paused call's — and the terminal discards
    // every line the shell has not read yet: every paused call queued behind it, and a call waiting behind them. Each is
    // marked, so a poll writes the closer whichever of them is still open once the shell holds its terminal again, and a
    // call waiting looks for the end of the line ahead of it as a running call does; a discarded line reads as never run.
    // FALSIFIED, kept beside its replacement (OQ-164's second verification, 2026-10-01): "the head alone is marked". A
    // command that handles or ignores SIGINT ends on its own frame, the head closes with its own status, and the queued
    // call — its line discarded by the same interrupt — was left the only open paused call, unmarked: no poll wrote a
    // closer, and every poll read it "still running" over an idle prompt until the next command.
    const at = this.deps.monotonic.now();
    for (const paused of this.openPaused()) {
      paused.interrupted = true;
      paused.interruptedAt ??= at;
    }
    this.active?.onInterrupt?.();
  }

  /**
   * The wrapped line that carries `command` to the shell (`wrapCommand`). A POSIX line longer than `POSIX_LINE_BYTES`
   * never reaches the shell whole (live-run finding M1): the command is written to a script of its own instead
   * (`stagedScript`), in a directory only this user can read, and the line carries `. '<script>'`, which the ordinary
   * wrapper runs in THIS shell under `command eval` as before. What the command sets persists, its status is `$?` at the end
   * frame, and an error in it is the script's nonzero status, as on the one line.
   */
  private carry(command: string, start: string, end: string): string {
    const line = wrapCommand(this.deps.backend, command, start, end);
    if (this.deps.backend.kind !== 'posix' || Buffer.byteLength(line) + 1 <= POSIX_LINE_BYTES) return line;
    this.stagingDir ??= mkdtempSync(join(tmpdir(), 'rotaris-command-'));
    this.staged += 1;
    // Named by a count, never by the call's nonce: the echo of a line that carried the marker followed by anything but a
    // quote would read as the marker printed (`printedAt`).
    const file = join(this.stagingDir, `${this.staged}.sh`);
    writeFileSync(file, stagedScript(file, command), { mode: 0o600 });
    return wrapCommand(this.deps.backend, `. ${shQuote(file)}`, start, end);
  }

  /**
   * One wrapped line, submitted. Keystrokes written with no line end after them (REQ-TOOLS-096) wait in the shell's input
   * as a partial line when nothing reads them — a soft-paused `sleep` does not — and the wrapped line was APPENDED to
   * them: `xy` + `printf '%s\n' '<start>'; …` ran `xyprintf`, which is not found, so the start marker never printed; the
   * capture kept the whole screen, the paused call's late output and its own `__rot_…_e` frame with it, and the live
   * stream, which opens at the printed start marker (L9), stayed blank (A10). The partial line is cleared first with
   * the POSIX line discipline's kill character — `^U`, which node-pty sets as `VKILL` and an interactive shell's own line
   * editor binds to the same — so the wrapper is the whole of the line the shell reads. The keystrokes were written as
   * is; what is cleared is a line no one ended, as OQ-146's ruling of 2026-10-06 (R-071) confirmed as built, the
   * PowerShell backend unchanged. PowerShell is left as it was: its wrapper's
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
      return parseSnapshot(r.output, this.deps.backend.kind);
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
    // Staged before the round trip's state exists, as `execute` does; a staging that throws is this promise's rejection.
    let carried: string;
    try { carried = this.carry(line, start, end); } catch (cause) { return Promise.reject(cause instanceof Error ? cause : new Error(String(cause))); }
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
      this.submit(p, carried);
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
    for (const p of [...this.pausedAhead, ...this.pausedEnded]) p.screen.dispose();
    this.pausedAhead = [];
    this.pausedEnded = [];
    if (old) { killTree(old.pid, true); try { old.kill(); } catch { /* */ } }
    // Live-run finding M1: a staged script its shell never read (a line an interrupt discarded) goes with the session.
    if (this.stagingDir !== null) { try { rmSync(this.stagingDir, { recursive: true, force: true }); } catch { /* */ } this.stagingDir = null; }
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
