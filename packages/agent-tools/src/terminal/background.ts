import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import type { Millis, MonotonicClock, TimerHandle, Timers, WallClock } from '@rotaris/kernel';
import { COMM_MAX_CHARS, linuxProcessTable, spawnChild, type GroupMember, type ProcessTable } from '@rotaris/platform';
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

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128), the reading built: a SIGINT to a session's group is preceded by one reading of
 * the group, and when the session is found still running after it, a member is sent SIGINT once more, alone, exactly
 * when that reading found it the SHELL — its name the shell's, so not yet replaced by the command — holding SIGINT off
 * (catching it, blocking it, or holding it pending), and it has since replaced its image (its name or its arguments
 * changed), whatever it now does with SIGINT; with it, each of its descendants the reading did not find, which the command
 * started after the signal and which so never received it either.
 *
 * Why exactly those: `dash` catches SIGINT under `-c`, and blocks signals across its `vfork`; the command it is starting
 * runs the shell's image, handler included, until its `exec` (the reading of an aimed signal found both the shell and its
 * child standing `blocked`). A SIGINT landing there is taken by that handler and lost with the image; the command that
 * replaces it never receives one, and the shell holds its own copy until that command ends, which for a server is never.
 * What the command does with SIGINT says nothing about whether it received one: Node, Python and a shell install their
 * own handler as they start, so a command that missed the signal stands `caught` as often as at the default. The name
 * alone misses a shell `exec`ing a shell (`sh -c '…'`, `sh script.sh`), whose name stays `sh`; its arguments change.
 * A process the reading found already running the command is never sent a second SIGINT, whatever it did with the
 * first — one that catches it, and one whose handler restored the default as it ran (`process.once`, `SA_RESETHAND`).
 * A process started after the reading by a member that did receive the signal is never sent one, so a clean-up the
 * command starts on its way out is not interrupted. All of this holds for `dash` alone, so only a session whose shell is
 * `dash` is read (`hasVforkWindow`): `bash` as `/bin/sh` absorbs a SIGINT its command handled, goes on, and `exec`s the
 * clean-up that follows in place, which by name and arguments is a shell replaced after the signal.
 *
 * The residue: a member that `exec`s between the reading and the delivery (one synchronous step) received the signal as
 * the command, and is sent a second if it is still alive at the check; and a script that traps SIGINT and then `exec`s
 * (`trap … INT; …; exec server`) chose to absorb the signal, and its command is sent one all the same; and a shell
 * other than `dash` that loses a SIGINT across its fork, if one does, is not read — nor is a `dash` the command starts
 * itself where the session's shell is another.
 */
export const SIGINT_RECHECK_AFTER_MS: readonly number[] = [250, 1_500];

/**
 * OQ-135: whether the session's shell has the vfork window — the check is armed only where it does. `dash` has it: it
 * catches SIGINT under `-c` and blocks signals across its `vfork`. It is told by the shell file's real path, since
 * `/bin/sh` is a link to it on Debian and Ubuntu. Any other shell has not been measured to have it and is not read.
 *
 * The reason it was armed on every Linux host, falsified and kept beside its replacement: "a member that was the shell
 * took the signal into the shell's handler if it took it at all, and a new image it runs afterwards never received it".
 * Where `/bin/sh` is `bash` (Fedora, RHEL, Arch), bash waits on a command that handles SIGINT, goes on when that command
 * exits 0, and `exec`s the last command of its `-c` list in place (bash 5.1 on). That clean-up replaced the shell after
 * the signal, and was sent a second SIGINT that killed it, under a false "vfork window" warning (acceptance finding A8,
 * round 4, measured through this manager with a `sh` link to `/bin/bash`, signalled 1 s and 5 s after the start).
 */
export function hasVforkWindow(backend: ShellBackend, realpath: (file: string) => string = realpathSync): boolean {
  if (backend.kind !== 'posix') return false;
  try { return shellComm(realpath(backend.file)) === 'dash'; } catch { return false; }
}

/** The name a process running the session's shell carries: the shell file's base name, cut as the kernel cuts it. */
export function shellComm(file: string): string {
  return (file.split(/[\\/]/).pop() ?? file).slice(0, COMM_MAX_CHARS);
}

/**
 * OQ-135: the members of a still-running session's group that never received the SIGINT. `before` is the reading taken
 * the instant before it was sent, `now` the one taken since, and `shell` the shell's name; the shell is `dash`, the one
 * shell read (`hasVforkWindow`). A member `before` found running the shell, and not ignoring SIGINT, took the signal into
 * the shell's handler if it took it at all (at the default it would be gone), and `dash` under `-c` ends on it once its
 * running command ends, starting nothing more. Named, each with its descendants alive `now` that `before` did not hold,
 * since those started after the signal:
 *
 * - such a member alive `now` and running another image — its name or its arguments changed — whatever it does with
 *   SIGINT: the command replaced the shell after the signal, and never received it;
 * - where such a member had started nothing in `before` and is still the shell `now`, each child it has started since:
 *   the shell took the signal as it started, went on, and the command it started never received it.
 *
 * A member already sent it again (`alreadyResent`) is not named, nor are its descendants, which may be the clean-up it
 * started on receiving it.
 */
export function missedSigint(before: readonly GroupMember[], now: readonly GroupMember[], shell: string, alreadyResent: ReadonlySet<number>): number[] {
  const wasShell = new Map(before.filter((m) => m.comm === shell && m.sigint !== 'ignored').map((m) => [m.pid, m]));
  const seen = new Set(before.map((m) => m.pid));
  const startedNothing = (pid: number): boolean => !before.some((m) => m.ppid === pid);
  const alive = now.filter((m) => m.state !== 'Z' && m.state !== 'X');
  // Arguments that cannot be read, or read empty (a process between images, or gone), say nothing either way.
  const known = (c: string | null): c is string => c !== null && c !== '';
  const replaced = (was: GroupMember, is: GroupMember): boolean => is.comm !== was.comm || (known(was.cmdline) && known(is.cmdline) && is.cmdline !== was.cmdline);
  const out: number[] = [];
  const add = (pid: number): void => {
    if (out.includes(pid) || alreadyResent.has(pid)) return;
    out.push(pid);
    for (const c of alive) if (c.ppid === pid && !seen.has(c.pid)) add(c.pid);
  };
  for (const m of alive) {
    const was = wasShell.get(m.pid);
    if (was === undefined || alreadyResent.has(m.pid)) continue;
    if (replaced(was, m)) add(m.pid);
    else if (startedNothing(m.pid)) for (const c of alive) if (c.ppid === m.pid && !seen.has(c.pid)) add(c.pid);
  }
  return out;
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
  /** OQ-135: the process table a SIGINT's delivery is checked against; absent means the host's (Linux only), null none. */
  readonly processes?: ProcessTable | null;
  /** OQ-135: whether the session's shell has the vfork window; absent means its real path decides (`hasVforkWindow`). */
  readonly vforkWindow?: boolean;
  /** The signal primitive, `process.kill` by default — a seam for a test to stand in for a discarded delivery. */
  readonly kill?: (pid: number, signal: NodeJS.Signals) => void;
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
  /** OQ-135: the checks a SIGINT arms, cancelled when the process exits. */
  private sigintChecks: TimerHandle[] = [];

  constructor(readonly command: string, private readonly child: ChildProcess, id: string, startedAt: string, timeoutMs: number, private readonly deps: BackgroundDeps) {
    this.id = id;
    this.startedAt = startedAt;
    const onData = (d: Buffer) => this.append(d.toString('utf8'));
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    this.exited = new Promise<void>((resolve) => {
      child.on('exit', (code, signal) => {
        this.timer?.cancel();
        for (const t of this.sigintChecks) t.cancel();
        this.sigintChecks = [];
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
    const kill = this.deps.kill ?? ((p: number, s: NodeJS.Signals) => { process.kill(p, s); });
    // OQ-135: the group as it stands before a SIGINT lands — which members are still the shell, catching it. Read only
    // where the shell has the vfork window (`dash`): elsewhere a member that was the shell and runs another image since may
    // be a clean-up the shell `exec`d after absorbing the signal (bash as `/bin/sh`).
    const table = name === 'SIGINT' && this.deps.vforkWindow === true ? (this.deps.processes === undefined ? linuxProcessTable() : this.deps.processes) : null;
    const before = table === null ? [] : table.tree(pid);
    try { kill(-pid, name); } catch { return false; }
    this.delivered.add(name);
    if (table !== null && before.length > 0) this.checkSigint(pid, table, before, kill);
    return true;
  }

  /**
   * OQ-135: after a SIGINT, the checks that find a member of the group which never received it — `missedSigint` says
   * which — and send it the signal once, alone. Only SIGINT has the window: `dash` catches it under `-c` and catches no
   * other signal `send_signal` offers. Only `dash` is read (`hasVforkWindow`), and where there is no process table (every
   * host but Linux) nothing is checked.
   *
   * The reason it was not, kept beside its replacement: delivery once to the group, as REQ-TOOLS-110 states, with the
   * session left to report what its process did. Measured through this manager, `/bin/sh -c 'sleep 30'` signalled the
   * instant it started, 45 of 200 sessions were still running 3 s later under six CPU burners. The first repair's reason,
   * falsified and kept: "a process at SIGINT's default that received it is gone", so every member alive at the default and
   * created within 1 s before the signal was sent it again. A command whose one-shot handler restored the default as it
   * ran stands the same way, and was sent a second SIGINT that cut its shutdown off (`process.once`, signalled the instant
   * it was up). The reading taken before the delivery now says which members were still the shell. The second repair's
   * reason, falsified and kept: "a command that missed the signal stands at SIGINT's default, under another name", so a
   * member was sent it again only then. Node installs its own SIGINT handler as it starts, and so do Python and a shell,
   * and a shell `exec`ing a shell keeps its name: measured through this manager under six CPU burners, 27 of 150
   * `node -e "setInterval(…)"` sessions and 39 of 200 `sh -c 'sleep 30; echo x'` sessions signalled the instant they
   * started were still running 3 s later. A member that was the shell is now sent it again whatever its standing, when
   * its name or its arguments changed, and with it what it started since.
   */
  private checkSigint(pid: number, table: ProcessTable, before: readonly GroupMember[], kill: (pid: number, signal: NodeJS.Signals) => void): void {
    const shell = shellComm(this.deps.backend.file);
    const resent = new Set<number>();
    for (const after of SIGINT_RECHECK_AFTER_MS) {
      this.sigintChecks.push(this.deps.timers.after(after as Millis, () => {
        if (this.status !== 'running') return;
        const found = new Set(before.map((m) => m.pid));
        for (const member of missedSigint(before, table.tree(pid), shell, resent)) {
          resent.add(member);
          try { kill(member, 'SIGINT'); } catch { continue; }
          this.deps.warn(found.has(member)
            ? `background session ${this.id}: process ${member} was the shell starting its command as SIGINT was sent and never received it (the shell's vfork window, OQ-135); SIGINT sent to it once more`
            : `background session ${this.id}: process ${member} was started after SIGINT was sent, by a command that never received it (the shell's vfork window, OQ-135); SIGINT sent to it`);
        }
      }));
    }
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
  private readonly deps: BackgroundDeps;
  constructor(deps: BackgroundDeps) {
    // OQ-135: whether the shell has the vfork window is told once, here, so neither a start nor a signal pays for it.
    this.deps = { ...deps, vforkWindow: deps.vforkWindow ?? hasVforkWindow(deps.backend) };
  }

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
