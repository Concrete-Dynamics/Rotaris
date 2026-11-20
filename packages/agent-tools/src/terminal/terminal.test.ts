import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { findExecutable } from '@rotaris/platform';
import { classifyOutcome, diagnosticBlock, outputWarnings, rejoinConptyWraps, stripVt } from './classify.js';
import { CommandRegion, ForegroundSession, parseSnapshot, pausedShare, POSIX_LINE_BYTES, posixShellArgs, printsMarker, processIdentity, restoreCommand, snapshotCommand, stagedScript, unstartedShare, wrapCommand, type PtyFactory, type ShellBackend } from './foreground.js';
import { xtermEmulatorFactory, type EmulatorFactory } from './emulator.js';
import { endOfExit } from './background.js';
import { execFileSync, spawn } from 'node:child_process';
import { findShell, nodePtyFactory, seconds, TerminalManager, terminalDescription, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, PROC, procState, processAlive, clocks, root, bashAsSh, ctx, diag, output, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * How long the OQ-144 argc-0 case waits for an exec'd program's argument area once `/proc/<pid>/exe` names it: on a kernel before
 * 5.18 `cmdline` stays empty, so this bound is what ends the wait there.
 */
const ARGV_SETTLE_MS = 1_000;
/**
 * `/proc/<pid>/cmdline` once the exec has laid out the new image's arguments: the first non-empty read, or the last read when
 * `boundMs` passes with none (a program run with argc 0 before Linux 5.18 reads empty for good).
 */
async function settledCmdline(read: () => string, boundMs: number, pause: () => Promise<void> = () => new Promise((r) => setTimeout(r, 5))): Promise<string> {
  const began = Date.now();
  let value = read();
  while (value === '' && Date.now() - began < boundMs) {
    await pause();
    value = read();
  }
  return value;
}

afterAll(disposeTerminalFixture);

it.each([
  { reset: true, is_input: true },
  { command: 'x', background: true, is_input: true },
  { command: 'x', background: true, reset: true },
  { background: true },
  { session_action: 'send_input' },
])('OQ-15: validation preserves stable diagnostic labels: %j', async (input) => {
  const t = terminalTool({} as TerminalManager, TERMINAL_DEFAULTS);
  const r = await t.execute(args(input), ctx());
  expect(r).toMatchObject({ isError: true, failureKind: 'invalid_request', outcomeKind: 'invalid_request' });
  expect(diag(r.text)).toMatchObject({ error_class: 'ValueError', failure_kind: 'invalid_request', outcome_kind: 'invalid_request' });
  expect(output(r.text)).toBe('(no output)');
});

describe('terminal — pure parts (REQ-TOOLS-100, 112, 113; PD-TOOLS-003)', () => {
  it('classifies in the fixed order and renders the diagnostic block with sorted keys and nulls dropped', () => {
    expect(classifyOutcome({ failureKind: 'timeout', exitCode: 124, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'timeout', severity: 'error' });
    // PD-TOOLS-013 (OQ-226): a call its run cancelled is test 1's `interrupted` / warning, whatever else it carries.
    expect(classifyOutcome({ failureKind: 'interrupted', exitCode: null, output: 'partial', command: 'x' }, [])).toEqual({ outcomeKind: 'interrupted', severity: 'warning' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x', backgroundStatus: 'killed' }, [])).toEqual({ outcomeKind: 'background_terminal', severity: 'warning' });
    expect(classifyOutcome({ exitCode: -1, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'soft_pause', severity: 'warning' });
    expect(classifyOutcome({ exitCode: 2, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'shell_failure', severity: 'error' });
    // The run's `git diff --no-index` with differences: exit 1 is the payload, not a failure.
    expect(classifyOutcome({ exitCode: 1, output: 'a\nb', command: 'git diff --no-index a b' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    expect(classifyOutcome({ exitCode: 1, output: 'a\nb', command: 'git --no-pager diff' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    expect(classifyOutcome({ exitCode: 1, output: '', command: 'grep needle src/a.ts' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    expect(classifyOutcome({ exitCode: 1, output: '', command: 'diff a b' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    // Anything else at exit 1 is still a failure — and a real failure kind still outranks the map.
    expect(classifyOutcome({ exitCode: 1, output: '', command: 'pytest -q' }, [])).toEqual({ outcomeKind: 'shell_failure', severity: 'error' });
    expect(classifyOutcome({ failureKind: 'timeout', exitCode: 1, output: '', command: 'git diff' }, [])).toEqual({ outcomeKind: 'timeout', severity: 'error' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x' }, ['Output contains the failure marker'])).toEqual({ outcomeKind: 'suspicious_success', severity: 'warning' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    expect(diagnosticBlock({ b: 1, a: null, c: 'x' })).toBe('[terminal_diagnostic] {"b":1,"c":"x"}');
  });
  it('REQ-TOOLS-113: the marker order, the error count (Found 0 errors never warns), the banner, the pipeline check', () => {
    expect(outputWarnings('pytest', 'AssertionError: x\nFAILED test_a', 0)).toEqual(["Output contains the failure marker 'AssertionError', in: AssertionError: x"]);
    expect(outputWarnings('tsc', 'found 3 errors', 0)).toEqual(['Output reports 3 errors.']);
    expect(outputWarnings('tsc', 'Found 0 errors', 0)).toEqual([]);
    // A banner carrying 'FAILED ' in capitals fires the marker check too — two warnings, marker first.
    expect(outputWarnings('pytest', '==== 1 FAILED ====', 0)).toEqual(["Output contains the failure marker 'FAILED', in: ==== 1 FAILED ====", 'A test-runner failure banner appears in the output.']);
    // The line the marker matched on is quoted, and capped.
    expect(outputWarnings('x', `FAILED ${'y'.repeat(300)}`, 0)[0]).toMatch(/, in: FAILED y{112}…$/);
    expect(outputWarnings('a | b', 'error: x', 3)).toEqual(['Pipeline command may have hidden an upstream failure exit code.']);
    expect(outputWarnings('a', 'error: x', 3)).toEqual([]);
  });
  it('PD-TOOLS-003 / REQ-TOOLS-113: the FAILED marker warns in capitals only, and the line quoted is the one that matched', () => {
    expect(outputWarnings('pytest', 'collected 2 items\nFAILED test_a.py::test_x - assert 1 == 2\n', 0)).toEqual(["Output contains the failure marker 'FAILED', in: FAILED test_a.py::test_x - assert 1 == 2"]);
    for (const casing of ['failed ', 'Failed ', 'fAILED ']) expect(outputWarnings('x', `step one ${casing}to connect`, 0)).toEqual([]);
    // A lower-case line ahead of the capital one: the capital line is quoted, not the first line a lower-cased search would reach.
    expect(outputWarnings('pytest', 'retry: failed to connect\nFAILED test_b\n', 0)).toEqual(["Output contains the failure marker 'FAILED', in: FAILED test_b"]);
  });
  it('PD-TOOLS-003 / REQ-TOOLS-113: every other check keeps its casing — the four other markers, the banner and the pipeline match in any case', () => {
    expect(outputWarnings('x', 'traceback (most recent call last):', 0)).toEqual(["Output contains the failure marker 'Traceback (most recent call last):', in: traceback (most recent call last):"]);
    expect(outputWarnings('x', 'error: FILE OR DIRECTORY NOT FOUND', 0)).toEqual(["Output contains the failure marker 'ERROR: file or directory not found', in: error: FILE OR DIRECTORY NOT FOUND"]);
    expect(outputWarnings('x', 'No Tests Ran', 0)).toEqual(["Output contains the failure marker 'no tests ran', in: No Tests Ran"]);
    expect(outputWarnings('x', 'assertionerror: x', 0)).toEqual(["Output contains the failure marker 'AssertionError', in: assertionerror: x"]);
    expect(outputWarnings('pytest', '=== 1 failed in 0.1s ===', 0)).toEqual(['A test-runner failure banner appears in the output.']);
    expect(outputWarnings('make | tee build.log', 'step one failed to connect', 0)).toEqual(['Pipeline command may have hidden an upstream failure exit code.']);
  });
  it('PD-TOOLS-003 / REQ-TOOLS-113: run `2e21e324`\'s docker line no longer warns, so its exit-0 command reads success', () => {
    const command = 'docker info; docker compose version';
    const text = 'Client: ok\nfailed to connect to the docker API\n';
    const warnings = outputWarnings(command, text, 0);
    expect(warnings).toEqual([]);
    expect(classifyOutcome({ exitCode: 0, output: text, command }, warnings)).toEqual({ outcomeKind: 'success', severity: 'info' });
  });
  it.runIf(process.platform === 'linux')('OQ-144: a process\'s identity is its executable and its argument vector; a process that has gone has none', () => {
    const self = processIdentity(process.pid);
    expect(self).not.toBeNull();
    const [exe, argv] = self!.split('\0', 2) as [string, string];
    expect(exe).toBe(realpathSync(process.execPath));
    expect(argv).toBe(process.argv0);
    // A pid past the kernel's pid_max names no process.
    expect(processIdentity(2 ** 22 + 1)).toBeNull();
  });
  // The note `a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md`
  // (docs/archive/defects/): between the kernel releasing an exiting process's memory and the process's reaping, `/proc/<pid>/exe`
  // can still read while `/proc/<pid>/cmdline` reads empty, and that pair read as another program — so a shell ended by a
  // soft-paused `exit 4` was taken for one an `exec` replaced, and the call waiting behind it was told it had replaced the
  // shell. Measured before the repair: in 122 of 300 exits read in a tight loop, the first reading that was not the
  // process's own was that pair, not "gone". Each child here is read from its start to its end, and no reading may name
  // a program other than the one it was running.
  it.runIf(process.platform === 'linux')('OQ-144 / OQ-164: a process on its way out reads no identity, never another program\'s', async () => {
    const program = realpathSync('/bin/sh');
    const foreign: string[] = [];
    let measured = 0;
    for (let i = 0; i < 60; i += 1) {
      const child = spawn('/bin/sh', ['-c', 'i=0; while [ $i -lt 300 ]; do i=$((i+1)); done; exit 4'], { stdio: 'ignore' });
      const exited = new Promise((resolve) => { child.once('exit', resolve); });
      const pid = child.pid!;
      const began = Date.now();
      let own: string | null = null;
      // Its own identity, once it is running `sh` (a reading taken between the fork and the exec is node's).
      while (Date.now() - began < 2_000) {
        const id = processIdentity(pid);
        if (id === null) break;
        if (id.startsWith(`${program}\0`)) { own = id; break; }
      }
      // Then every reading to its end; the event loop is held, so the child stays unreaped and the end reads null.
      while (own !== null && Date.now() - began < 4_000) {
        const id = processIdentity(pid);
        if (id === null) break;
        if (id !== own) { foreign.push(JSON.stringify(id)); break; }
      }
      if (own !== null) measured += 1;
      await exited;
    }
    expect(measured).toBeGreaterThanOrEqual(20);
    expect(foreign).toEqual([]);
  }, 60_000);
  // `docs/archive/defects/processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched.md`: the
  // empty-argument-vector rule above reads a program run with argc 0 the way it reads an exiting shell, on the kernels where
  // its `cmdline` reads empty. `processIdentity`'s comment states the reach by kernel; this pins it on the kernel that runs
  // the suite: before 5.18 such a program reads no identity (unwatched), from 5.18 it reads one empty argument (watched).
  it.runIf(process.platform === 'linux')('OQ-144: a program run with an empty argument vector reads an identity only where the kernel gives it one empty argument (Linux 5.18 and later)', async () => {
    const [major = 0, minor = 0] = execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim().split(/[.-]/).map(Number);
    const givesOneEmpty = major > 5 || (major === 5 && minor >= 18);
    const cat = realpathSync('/bin/cat');
    // Node execs `cat` in its own place with argc 0; `cat` then waits on its standard input, held open here.
    const child = spawn(process.execPath, ['--no-warnings', '-e', `process.execve(${JSON.stringify(cat)}, [], {})`], { stdio: ['pipe', 'ignore', 'ignore'] });
    const exited = new Promise((resolve) => { child.once('exit', resolve); });
    try {
      const pid = child.pid!;
      const began = Date.now();
      let exe = '';
      while (exe !== cat && Date.now() - began < 10_000) {
        try { exe = readlinkSync(`/proc/${pid}/exe`); } catch { exe = ''; }
        if (exe !== cat) await new Promise((r) => setTimeout(r, 20));
      }
      expect(exe).toBe(cat);
      // `exe` switches before the new image's arguments are laid out, so a read between the two finds `cmdline` empty on any
      // kernel: wait for the arguments, bounded, before asserting (below; on a kernel before 5.18 they stay empty).
      expect(await settledCmdline(() => readFileSync(`/proc/${pid}/cmdline`, 'latin1'), ARGV_SETTLE_MS)).toBe(givesOneEmpty ? '\0' : '');
      expect(processIdentity(pid)).toBe(givesOneEmpty ? `${cat}\0\0` : null);
    } finally {
      child.kill();
      await exited;
    }
  }, 20_000);
  /*
   * docs/archive/defects/the-argc-0-identity-test-reads-cmdline-before-the-exec-has-set-its-arguments.md: the case above read
   * `cmdline` once, as soon as `exe` named `cat`, and failed once in a loaded gate on kernel 6.18 with `expected '' to be '\0'`.
   * The kernel installs the new image (and with it `exe`) in `begin_new_exec`, and sets the bounds of its argument area later,
   * when the loader lays out the new stack; a read between the two reads an empty `cmdline`. The wait reads past it.
   */
  it('OQ-144: the argc-0 case reads past an empty cmdline the exec has not yet filled, and stops at its bound where it stays empty', async () => {
    const reads = ['', '', '\0'];
    let read = 0;
    expect(await settledCmdline(() => reads[Math.min(read++, reads.length - 1)]!, 1_000, async () => undefined)).toBe('\0');
    // Three reads: the single read the case made until 2026-10-15 would have taken the first, the empty area in between.
    expect(read).toBe(3);
    let reads2 = 0;
    const started = Date.now();
    expect(await settledCmdline(() => { reads2 += 1; return ''; }, 60)).toBe('');
    expect(reads2).toBeGreaterThan(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
  it.runIf(process.platform !== 'linux')('OQ-144: off Linux there is no /proc, and no identity to watch', () => {
    expect(processIdentity(process.pid)).toBeNull();
  });
  // docs/archive/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md: ConPTY writes a row the screen
  // wraps as the row, a hard line end, a move back to the row's last column and that column's character again; the frame
  // scan rejoins it, and nothing else that looks like it.
  it('REQ-TOOLS-128: ConPTY\'s wrapped rows are rejoined for the marker scan, the repainted character once', () => {
    // As recorded from the product's own PTY at 33 columns, 2026-10-15.
    const raw = '__rot_6cb32f31ee7df0909f2e3dc6_e:\r\n\x1b[49;33H:0\r\nPS>';
    expect(stripVt(rejoinConptyWraps(raw))).toBe('__rot_6cb32f31ee7df0909f2e3dc6_e:0\nPS>');
    // A colour between the character and the line end, or after the move, is kept for `stripVt` to remove.
    expect(stripVt(rejoinConptyWraps('ab\x1b[m\r\n\x1b[12;20H\x1b[93mbc'))).toBe('abc');
    // Windows PowerShell 5.1 at 20 columns hides the cursor before the line end, as recorded the same day.
    expect(stripVt(rejoinConptyWraps('__rot_e8834d85d32919\x1b[?25l\r\n\x1b[49;20H9e4c0113237_e:0      \x1b[50;15H\x1b[?25h\r\nPS>'))).toBe('__rot_e8834d85d32919e4c0113237_e:0      \nPS>');
    // An ordinary line end is left alone: the next row does not start with a move, or the move does not repaint the character.
    expect(rejoinConptyWraps('ab\r\ncd')).toBe('ab\r\ncd');
    expect(rejoinConptyWraps('ab\r\n\x1b[12;20Hcd')).toBe('ab\r\n\x1b[12;20Hcd');
  });
  it('strips VT sequences and carriage returns', () => {
    expect(stripVt('\x1b[32mhi\x1b[0m\r\n\x1b]0;title\x07x')).toBe('hi\nx');
  });
  it('the wrapper brackets the command with the two markers and recovers the exit status', () => {
    const w = wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E');
    // One line or many, the command is carried as base64 into a guarded script block between the two markers
    // (docs/archive/defects/a-single-line-powershell-command-that-throws-loses-its-end-frame.md); it was spliced raw
    // into the line, `Write-Output 'S'; git status; Write-Output ('E:'…`, until 2026-10-15.
    expect(w).toMatch(/^\$global:LASTEXITCODE = \$null; \$global:E_ok = \$true; Write-Output 'S'; try \{ \$global:E_src = /);
    // The command alone is carried, parsed once by itself and then run with the flag's line after it.
    expect(Buffer.from(/FromBase64String\('([^']+)'\)/.exec(w)![1]!, 'base64').toString('utf8')).toBe('git status');
    expect(w).toContain("$null = [scriptblock]::Create($global:E_src); . ([scriptblock]::Create($global:E_src + [char]10 + '$global:E_ok = $?'))");
    expect(w).toMatch(/Remove-Variable -Name 'E_src' -Scope Global -ErrorAction SilentlyContinue; Write-Output \('E:' \+ \$\(if \(\$global:E_ok\)/);
    // Live-run L1: the command runs under `command eval`, so an error `sh` meets in it cannot abandon the end frame.
    expect(wrapCommand({ kind: 'posix', file: '/bin/sh' }, 'ls', 'S', 'E')).toBe("printf '%s\\n' 'S'; command eval 'ls'; printf 'E:%s\\n' \"$?\"");
    expect(wrapCommand({ kind: 'posix', file: '/bin/sh' }, "echo 'q'", 'S', 'E')).toBe("printf '%s\\n' 'S'; command eval 'echo '\\''q'\\'''; printf 'E:%s\\n' \"$?\"");
    // A multi-line command reaches the shell as ONE physical line and is rebuilt on the far side, so the shell
    // never reaches its continuation prompt and never echoes a line into the captured region (ADR-0020's note,
    // POSIX first execution 2026-09-16).
    expect(wrapCommand({ kind: 'posix', file: '/bin/sh' }, 'a\nb', 'S', 'E')).toBe("printf '%s\\n' 'S'; command eval \"$(printf '%b' 'a\\nb')\"; printf 'E:%s\\n' \"$?\"");
    expect(wrapCommand({ kind: 'posix', file: '/bin/sh' }, "x='q'\ny", 'S', 'E')).toContain(`'x='\\''q'\\''\\ny'`);
  });
  it('REQ-TOOLS-127 (live-run L9): the live stream is given what the command wrote — not the echo, the markers, the prompt or what follows', () => {
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const pty = [
      `# printf '%s\\n' '${S}'; command eval 'ls'; printf '${E}:%s\\n' "$?"\r\n`,
      `${S}\r\n`,
      'alpha\r\nbeta_\r\n',
      `${E}:0\r\n# `,
      "Q='__rot_b64__'; … the snapshot's own echo and output\r\n",
    ].join('');
    // Every way the bytes can arrive: whole, one character at a time, and split at every boundary in two.
    const splits: string[][] = [[pty], [...pty]];
    for (let i = 1; i < pty.length; i += 1) splits.push([pty.slice(0, i), pty.slice(i)]);
    for (const chunks of splits) {
      const region = new CommandRegion(S, E);
      const shown = chunks.map((c) => region.push(c)).join('');
      expect(shown).toBe('alpha\r\nbeta_\r\n');
      expect(region.ended).toBe(true);
    }
    // A command that prints the marker text of ANOTHER call is output like any other.
    const region = new CommandRegion(S, E);
    expect(region.push(`${S}\r\n__rot_deadbeefdeadbeefdeadbeef_e:0\r\n`)).toBe('__rot_deadbeefdeadbeefdeadbeef_e:0\r\n');
  });
  it('OQ-147: a running call\'s no-op line ends it at its PRINTED start marker only, never at the echo that quotes it, and a marker at the end of the text waits for the next chunk', () => {
    const C = '__rot_cccccccccccccccccccccccc_s';
    const echo = `^C\r\n# printf '%s\\n' '${C}'; command eval ':'; printf '__rot_cccccccccccccccccccccccc_e:%s\\n' "$?"\r\n`;
    expect(printsMarker(echo, C)).toBe(false);
    expect(printsMarker(`${echo}${C}`, C)).toBe(false);
    expect(printsMarker(`${echo}${C}\r\n`, C)).toBe(true);
    expect(printsMarker('', C)).toBe(false);
  });
  it('REQ-TOOLS-127 (OQ-147): the no-op line a poll after an interrupt submits reaches the live stream in no row, however the bytes arrive', () => {
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const C = '__rot_fedcba9876543210fedcba98_';
    const before = `${S}\r\nearly\r\n`;
    const after = [
      'late\r\n^C\r\n',
      `# printf '%s\\n' '${C}s'; command eval ':'; printf '${C}e:%s\\n' "$?"\r\n`,
      `${C}s\r\n`,
      `${C}e:0\r\n# `,
    ].join('');
    const splits: string[][] = [[after], [...after]];
    for (let i = 1; i < after.length; i += 1) splits.push([after.slice(0, i), after.slice(i)]);
    for (const chunks of splits) {
      const region = new CommandRegion(S, E);
      expect(region.push(before)).toBe('early\r\n');
      region.withholdRowsWith(C);
      expect(chunks.map((c) => region.push(c)).join('')).toBe('late\r\n^C\r\n');
    }
    // The paused call's own end frame still ends the region, and the row it ends is given whole.
    const own = new CommandRegion(S, E);
    own.push(before);
    own.withholdRowsWith(C);
    expect(own.push('tail')).toBe('');
    expect(own.push(`-no-newline${E}:0\r\n`)).toBe('tail-no-newline');
    expect(own.ended).toBe(true);
  });
  it('REQ-TOOLS-098/127 (A10): a soft-paused call collects up to its own end frame or the next call\'s printed start marker, and nothing after either, however the bytes arrive', () => {
    const P = '__rot_aaaaaaaaaaaaaaaaaaaaaaaa_e';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb_s';
    const collect = (chunks: readonly string[], nextStart: string | null) => {
      let undecided = '';
      let taken = '';
      let stop: 'own' | 'next' | null = null;
      for (const c of chunks) {
        const s = pausedShare(undecided, c, P, nextStart);
        taken += s.take;
        undecided = s.undecided;
        if (s.stop !== null) { stop = s.stop; break; }
      }
      return { taken, stop };
    };
    const splitsOf = (pty: string): string[][] => {
      const all: string[][] = [[pty], [...pty]];
      for (let i = 1; i < pty.length; i += 1) all.push([pty.slice(0, i), pty.slice(i)]);
      return all;
    };
    // Interrupted: `^C`, the prompt, the echo of the next call's wrapper (which quotes its marker), then that marker
    // printed and 20,000 lines the paused call must never be given.
    const interrupted = `^C\r\n# printf '%s\\n' '${N}'; command eval 'seq 1 20000'; printf '__rot_bbbbbbbbbbbbbbbbbbbbbbbb_e:%s\\n' "$?"\r\n${N}\r\n1\r\n2\r\n`;
    for (const chunks of splitsOf(interrupted)) {
      expect(collect(chunks, N)).toEqual({ taken: interrupted.slice(0, interrupted.indexOf(`${N}\r\n1`) + N.length), stop: 'next' });
    }
    // Ended on its own behind the next call: its frame comes first and is collected whole — the capture cuts it, and
    // `onData` reads its status off the scan — and nothing of the next call's output ever is.
    const ended = `late\r\n${P}:1\r\n# ${N}\r\nnext\r\n`;
    for (const chunks of splitsOf(ended)) {
      const { taken, stop } = collect(chunks, N);
      expect(taken.startsWith(`late\r\n${P}:1`)).toBe(true);
      expect(taken).not.toContain('next');
      expect(stop).not.toBeNull();
    }
    expect(collect([ended], N)).toEqual({ taken: `late\r\n${P}:1`, stop: 'own' });
    // With no next call there is no marker to wait for: every byte is given at once, a trailing `_` included.
    expect(pausedShare('', 'progress__', P, null)).toEqual({ take: 'progress__', undecided: '', stop: null, marker: null });
    // A command that prints ANOTHER call's marker text is output like any other.
    expect(pausedShare('', '__rot_deadbeefdeadbeefdeadbeef_s\r\n', P, N)).toEqual({ take: '__rot_deadbeefdeadbeefdeadbeef_s\r\n', undecided: '', stop: null, marker: null });
  });
  // OQ-164's verification: an interrupt discards every line the shell has not read, so the line queued directly behind the
  // paused one may never print its marker. Whichever later line's marker prints first ends the paused call's share.
  it('REQ-TOOLS-098/127 (OQ-164): a paused call\'s share ends at the first later line\'s printed marker, the queued line\'s discarded or not, however the bytes arrive', () => {
    const P = '__rot_aaaaaaaaaaaaaaaaaaaaaaaa_e';
    const Q = '__rot_cccccccccccccccccccccccc_s';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb_s';
    const collect = (chunks: readonly string[]) => {
      let undecided = '';
      let taken = '';
      for (const c of chunks) {
        const s = pausedShare(undecided, c, P, [Q, N]);
        taken += s.take;
        undecided = s.undecided;
        if (s.stop !== null) return { taken, stop: s.stop, marker: s.marker };
      }
      return { taken, stop: null, marker: null };
    };
    // The queued line Q was echoed while the paused command ran and then discarded by the C-c; the next call N runs.
    const pty = `out\r\n# printf '%s\\n' '${Q}'; command eval 'echo queued'\r\n^C\r\n# printf '%s\\n' '${N}'; command eval 'echo next'\r\n${N}\r\nnext\r\n`;
    const want = { taken: pty.slice(0, pty.indexOf(`${N}\r\nnext`) + N.length), stop: 'next', marker: N };
    expect(collect([pty])).toEqual(want);
    for (let i = 1; i < pty.length; i += 1) expect(collect([pty.slice(0, i), pty.slice(i)])).toEqual(want);
    // The queued call itself never started: nothing is its own, and the next line's marker printing first says it never ran.
    for (let i = 0; i <= pty.length; i += 1) {
      let undecided = '';
      let result: ReturnType<typeof unstartedShare> | null = null;
      for (const c of i === 0 ? [pty] : [pty.slice(0, i), pty.slice(i)]) {
        const r = unstartedShare(undecided, c, Q, '__rot_cccccccccccccccccccccccc_e', [N]);
        expect(r.take).toBe('');
        undecided = r.undecided;
        if (r.stop !== null) { result = r; break; }
      }
      expect(result).toMatchObject({ started: false, stop: 'next', marker: N });
    }
    // A queued call that does start takes from its own printed marker on, and nothing the earlier command wrote before it.
    const ran = `a1\r\n# printf '%s\\n' '${Q}'; command eval 'echo queued'\r\na2\r\n${Q}\r\nqueued\r\n__rot_cccccccccccccccccccccccc_e:0\r\n# `;
    for (let i = 0; i <= ran.length; i += 1) {
      let undecided = '';
      let taken = '';
      let started = false;
      for (const c of i === 0 ? [ran] : [ran.slice(0, i), ran.slice(i)]) {
        const r = unstartedShare(undecided, c, Q, '__rot_cccccccccccccccccccccccc_e', [N]);
        const s = started ? pausedShare(undecided, c, '__rot_cccccccccccccccccccccccc_e', [N]) : r;
        if (!started && r.started) started = true;
        taken += s.take;
        undecided = s.undecided;
        if (s.stop !== null) break;
      }
      expect(started).toBe(true);
      // Its frame is not held across chunks (`pausedShare`: the capture cuts it, and `onData`'s scan reads its status).
      expect(taken.startsWith(`${Q}\r\nqueued\r\n__rot_cccccccccccccccccccccccc_e:0`)).toBe(true);
      expect(taken).not.toMatch(/a1|a2/);
    }
  });
  it('REQ-TOOLS-127 (A10): the echo of a POSIX wrapper wider than the screen is dropped whole from the capture, wherever its rows break', () => {
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb';
    const wide = 'Q'.repeat(300);
    const echo = `printf '%s\\n' '${N}_s'; command eval 'printf '\\''%s\\n'\\'' '\\''${wide}'\\'''; printf '${N}_e:%s\\n' "$?"`;
    // Every width the screen might break it at, with the trailing space of a row trimmed as the emulator trims it.
    for (const cols of [40, 80, 239, 240, 241]) {
      const rows: string[] = [];
      for (let i = 0; i < echo.length; i += cols) rows.push(echo.slice(i, i + cols).trimEnd());
      const screen = [`${S}`, 'own-line', ...rows, 'done-later', `${E}:0`, '# '].join('\n');
      expect(ForegroundSession.clean(screen, S, E)).toBe('own-line\ndone-later');
    }
  });
  /*
   * docs/archive/defects/at-the-20-column-floor-an-interrupted-calls-poll-intermittently-carries-the-next-calls-wrapper-echo.md:
   * after C-c, dash prints a line end and its prompt (`\n# `) when it takes the interrupt, and the line discipline echoes
   * the next call's wrapper as it arrives. When the wrapper is written first, the echo begins on the `^C` row and the
   * prompt lands INSIDE it — measured at 20 columns, before the end statement's closing `"`. The joined match no longer
   * met the wrapper, the row carrying its head (`printf '%s`) was dropped by the stray-echo filter and took the leading
   * `__r` of the next call's start marker with it, so the cut at that marker (`until`) never happened and the rest of
   * the echo reached the interrupted call's poll.
   */
  it('REQ-TOOLS-127/128: the next call\'s echo is cut from a paused call\'s poll wherever the shell\'s prompt lands inside it', () => {
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb';
    const wide = 'Q'.repeat(300);
    const echo = `printf '%s\\n' '${N}_s'; command eval 'printf '\\''%s\\n'\\'' '\\''${wide}'\\'''; printf '${N}_e:%s\\n' "$?"`;
    /** What a `cols`-wide screen keeps of a stream: a row per line end, each line broken at the width, trimmed as the emulator trims. */
    const screenOf = (stream: string, cols: number): string => stream.split('\n').flatMap((line) => {
      const rows: string[] = [];
      for (let i = 0; i < Math.max(1, line.length); i += cols) rows.push(line.slice(i, i + cols).trimEnd());
      return rows;
    }).join('\n');
    for (const cols of [20, 30, 80]) {
      for (let k = 0; k < echo.length; k += 1) {
        const stream = `${S}\n^C${echo.slice(0, k)}\n# ${echo.slice(k)}\n${N}_s\nQQ\n${N}_e:0\n# `;
        const poll = ForegroundSession.clean(screenOf(stream, cols), S, E, [`${N}_s`]);
        for (const leaked of ['__rot_', 'QQQ', '"$?"', 'command eval']) expect(poll, `${cols} columns, prompt at ${k}`).not.toContain(leaked);
        // Past the head and its first marker character nothing of the echo is left. The `^C` it shares a row with is kept
        // where the cut falls at the head's column, and goes with the row where the joined match still meets the echo
        // (a prompt inside the command's own text, which the match's body takes in). A prompt inside the first sixteen
        // characters of an echo leaves at most that much of it behind the `^C`.
        if (k >= 16) expect(['^C', ''], `${cols} columns, prompt at ${k}: ${JSON.stringify(poll)}`).toContain(poll);
      }
    }
    // The observed shape, verbatim in form: at 20 columns, the prompt one character before the end statement's last.
    const observed = `${S}\n^C${echo.slice(0, -1)}\n# ${echo.slice(-1)}\n${N}_s`;
    expect(ForegroundSession.clean(screenOf(observed, 20), S, E, [`${N}_s`])).toBe('^C');
  });
  it('REQ-TOOLS-127 (A10): the echo a shell\'s own line editor draws of a wrapper wider than the screen — one row, scrolled sideways — is dropped from the capture', () => {
    // `two-terminal-pty-tests-fail-on-main-in-this-environment`: bash's readline on a `dumb` terminal does not wrap a wide
    // line, it scrolls it on one row whose head is `<`, so the joined match never met it. The row, verbatim in shape from
    // a `sh` link to bash 5.2 at 240 columns, carries the next call's end statement and neither of its start statements.
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb';
    for (const cols of [80, 240]) {
      const tail = `${'Q'.repeat(300)}'\\'''; printf '${N}_e:%s\\n' "$?"`;
      const scrolled = `<${tail.slice(tail.length - (cols - 2))}`;
      const screen = [`${S}`, 'done-later', '^C', scrolled].join('\n');
      expect(ForegroundSession.clean(screen, S, E, `${N}_s`)).toBe('done-later\n^C');
    }
    // The printed end frame is never quoted, so a row the command printed is never mistaken for that echo.
    expect(ForegroundSession.clean([S, `${N}_e:%s ran`, `${E}:0`].join('\n'), S, E)).toBe(`${N}_e:%s ran`);
  });
  it('REQ-TOOLS-127/128 (A10): the sideways-scrolled row is dropped at any width, also where it is too narrow to carry the whole end statement', () => {
    // fin15's verification: at 40 and 50 columns, bash's readline (turned back on by an `$ENV` file) drew
    // `<74a244a85f47_e:%s\n' "$?"` — a TAIL of the end statement, its nonce cut — and the interrupted call's poll read it.
    // The rows below are the shapes measured at 20, 30, 40 and 50 columns, and every narrower tail down to one character.
    const S = '__rot_0123456789abcdef01234567_s';
    const E = '__rot_0123456789abcdef01234567_e';
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb';
    const statement = `printf '${N}_e:%s\\n' "$?"`;
    const measured = [`<:%s\\n' "$?"`, `<9e4b_e:%s\\n' "$?"`, `<6e1d01fbe65d_e:%s\\n' "$?"`, `<029724bbbeb5de911f_e:%s\\n' "$?"`];
    const tails = Array.from({ length: statement.length }, (_, i) => `<${statement.slice(i)}`);
    for (const scrolled of [...measured, ...tails]) {
      expect(ForegroundSession.clean([S, 'done-later', '^C', scrolled].join('\n'), S, E, `${N}_s`)).toBe('done-later\n^C');
    }
    // What a command prints is kept: a row that only begins with `<`, a tail that is not the statement's, a nonce digit
    // that is not hex.
    for (const own of ['<', '<html>', `<${statement.slice(4, -2)}`, `<Z_e:%s\\n' "$?"`]) {
      expect(ForegroundSession.clean([S, own, `${E}:0`].join('\n'), S, E)).toBe(own);
    }
  });
  it('REQ-TOOLS-097/127/128: a frame the screen wraps — the display narrows it to 20 columns — is found across its rows, never handed over', () => {
    // fin15's verification, measured under dash at 20 and 30 columns: every call's capture began with its own start frame
    // and ended with its end frame and the prompt, broken across rows; a paused call's poll carried its own end frame or
    // the next call's start frame. A frame is 32 or more columns wide, so below that width every frame wraps.
    const nonce = '0123456789abcdef01234567';
    const S = `__rot_${nonce}_s`;
    const E = `__rot_${nonce}_e`;
    const N = '__rot_bbbbbbbbbbbbbbbbbbbbbbbb';
    const rowsOf = (line: string, cols: number): string[] => {
      const out: string[] = [];
      for (let i = 0; i < Math.max(1, line.length); i += cols) out.push(line.slice(i, i + cols).trimEnd());
      return out;
    };
    for (const cols of [10, 20, 30, 33]) {
      const screen = (lines: string[]) => lines.flatMap((l) => rowsOf(l, cols)).join('\n');
      // A call's own capture: the start frame behind the prompt, the output, the end frame, the next prompt.
      expect(ForegroundSession.clean(screen([`# ${S}`, 'ready', 'ready2', `${E}:0`, '# ']), S, E)).toBe('ready\nready2');
      // Its last write had no newline: the end frame begins mid-row and wraps.
      expect(ForegroundSession.clean(screen([S, `Property : ${E}:0`, '# ']), S, E)).toBe('Property :');
      // A paused call closed by the next call's printed start frame, behind the prompt.
      expect(ForegroundSession.clean(screen([S, 'done-later', '^C', `# ${N}_s`, 'next', `${N}_e:0`]), S, E, `${N}_s`)).toBe('done-later\n^C');
    }
  });
  it.runIf(process.platform !== 'win32')('REQ-TOOLS-097/127: the POSIX shell is started interactive with its own line editor off where it takes the options, and with -i alone where it does not', () => {
    if (bashAsSh) expect(posixShellArgs(bashAsSh)).toEqual(['+o', 'emacs', '+o', 'vi', '-i']);
    // `/bin/sh` only where it is one of the two shells known to take them: a busybox `sh` may not, and is then started
    // with `-i` alone, which is the product's fallback rather than a failure.
    if (existsSync('/bin/sh') && /\/(?:dash|bash)$/.test(realpathSync('/bin/sh'))) expect(posixShellArgs('/bin/sh')).toEqual(['+o', 'emacs', '+o', 'vi', '-i']);
    expect(posixShellArgs(join(root, 'no-such-shell'))).toEqual(['-i']);
    // A shell that refuses the options: `false` exits nonzero whatever it is given.
    for (const f of ['/bin/false', '/usr/bin/false']) if (existsSync(f)) expect(posixShellArgs(f)).toEqual(['-i']);
  });
  it('REQ-TOOLS-098 (live-run L2): a measured span is stated in tenths of a second, truncated, so it never states more than was measured', () => {
    expect(seconds(0.6)).toBe('under 0.1 seconds');
    expect(seconds(99.9)).toBe('under 0.1 seconds');
    expect(seconds(100)).toBe('0.1 seconds');
    expect(seconds(1_486)).toBe('1.4 seconds');
    expect(seconds(1_686)).toBe('1.6 seconds');
    expect(seconds(1_999.9)).toBe('1.9 seconds');
    expect(seconds(31_240)).toBe('31.2 seconds');
  });
  it('OQ-133: a signal death\'s status — killed (−1) for a signal the session delivered, failed (128 + n) for one it did not, an exit code as ever (REQ-TOOLS-109/179, live-run L4)', () => {
    const none = new Set<string>();
    expect(endOfExit(0, null, none)).toEqual({ status: 'completed', exitCode: 0 });
    expect(endOfExit(3, null, none)).toEqual({ status: 'failed', exitCode: 3 });
    // An exit code wins even after a signal was sent: a command that handles SIGINT and exits reports its own outcome.
    expect(endOfExit(130, null, new Set(['SIGINT']))).toEqual({ status: 'failed', exitCode: 130 });
    expect(endOfExit(0, null, new Set(['SIGINT']))).toEqual({ status: 'completed', exitCode: 0 });
    // The live run's shape: the agent's own SIGINT, and the shell died of it. It read `failed (exit -1)`.
    expect(endOfExit(null, 'SIGINT', new Set(['SIGINT']))).toEqual({ status: 'killed', exitCode: -1 });
    expect(endOfExit(null, 'SIGKILL', new Set(['SIGTERM', 'SIGKILL']))).toEqual({ status: 'killed', exitCode: -1 });
    // A signal nobody here sent — a crash, another process's kill — is a failure, and −1 stays `killed`'s alone.
    expect(endOfExit(null, 'SIGTERM', none)).toEqual({ status: 'failed', exitCode: 143 });
    expect(endOfExit(null, 'SIGSEGV', new Set(['SIGINT']))).toEqual({ status: 'failed', exitCode: 139 });
  });
  // docs/archive/defects/output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md: at the soft pause `execute` removed
  // the call's listener, awaited the emulator's write of what it held, and only then opened the paused call that `onData`
  // feeds. A chunk the PTY delivered inside that await reached neither, so no poll returned it; a chunk carrying the
  // command's own end frame resolved the already-settled call instead, and the paused call read "still running" with no
  // status. The double delivers its chunk from inside that very write.
  it('REQ-TOOLS-098/179: output and the end frame a command writes while its soft pause is handed over reach the poll, with the command\'s own status', async () => {
    const session = (late: (nonce: string) => string) => {
      let emit: (d: string) => void = () => undefined;
      let nonce: string | null = null;
      let armed = true;
      const factory: PtyFactory = {
        spawn: () => ({
          // Never disposed: `dispose` signals the pid's process group, and this PTY has no process behind it.
          pid: 2 ** 30, onData: (cb) => { emit = cb; }, onExit: () => undefined, resize: () => undefined, kill: () => undefined,
          write: (data) => {
            nonce = /__rot_([0-9a-f]+)_s/.exec(data)?.[1] ?? nonce;
            // The command prints its start marker and then nothing, so the call soft-pauses.
            if (nonce) setImmediate(() => emit(`__rot_${nonce}_s\r\n`));
          },
        }),
      };
      // The call's screen is first written at the pause; the PTY's next chunk arrives while that write is in flight.
      const emulator: EmulatorFactory = (spec) => {
        const inner = xtermEmulatorFactory(spec);
        return {
          get cols() { return inner.cols; }, get rows() { return inner.rows; }, get truncated() { return inner.truncated; },
          resize: (c, r) => inner.resize(c, r), serialize: () => inner.serialize(), text: () => inner.text(), dispose: () => inner.dispose(),
          write: (data) => {
            if (armed && nonce !== null && data.includes(`__rot_${nonce}_s`)) { armed = false; emit(late(nonce)); }
            return inner.write(data);
          },
        };
      };
      return new ForegroundSession({ factory, backend: { kind: 'posix', file: '/bin/sh' }, cwd: root, env: {}, monotonic: clocks.monotonic, timers: clocks.timers, noOutputWindowMs: 100, emulator, warn: () => undefined });
    };
    // The command ends inside the handover: its output and its own status reach the poll.
    const ended = session((n) => `late-output\r\n__rot_${n}_e:7\r\n`);
    expect(await ended.run('sleep 1; echo late-output; exit 7', { timeoutMs: null, hardMs: 5_000 })).toMatchObject({ softPaused: true, exitCode: -1 });
    expect(await ended.poll()).toMatchObject({ output: 'late-output', exitCode: 7, softPaused: false, error: null });
    // It keeps running: what it wrote inside the handover is what the next poll returns.
    const running = session(() => 'late-output\r\n');
    expect(await running.run('sleep 1; echo late-output; sleep 60', { timeoutMs: null, hardMs: 5_000 })).toMatchObject({ softPaused: true, output: '' });
    expect(await running.poll()).toMatchObject({ output: 'late-output', exitCode: -1, softPaused: true });
  });
  it('REQ-TOOLS-096 (A10): keystrokes with no line end after them are cleared from the shell\'s input before the next POSIX line, and only then', async () => {
    // A PTY that answers every wrapped line with its two frames at once, and remembers what was written to it.
    const session = (backend: ShellBackend) => {
      const writes: string[] = [];
      let emit: (d: string) => void = () => undefined;
      const factory: PtyFactory = {
        spawn: () => ({
          // Never disposed: `dispose` signals the pid's process group, and this PTY has no process behind it.
          pid: 2 ** 30, onData: (cb) => { emit = cb; }, onExit: () => undefined, resize: () => undefined, kill: () => undefined,
          write: (data) => {
            writes.push(data);
            const nonce = /__rot_([0-9a-f]+)_s/.exec(data)?.[1];
            if (nonce) setImmediate(() => emit(`__rot_${nonce}_s\r\n__rot_${nonce}_e:0\r\n`));
          },
        }),
      };
      const s = new ForegroundSession({ factory, backend, cwd: root, env: {}, monotonic: clocks.monotonic, timers: clocks.timers, emulator: xtermEmulatorFactory, warn: () => undefined });
      return { s, writes, lines: () => writes.filter((w) => w.includes('__rot_')) };
    };
    const posix = session({ kind: 'posix', file: '/bin/sh' });
    await posix.s.run('true', { timeoutMs: 5_000 });
    expect(posix.lines().every((w) => w.startsWith('printf'))).toBe(true);
    posix.s.sendInput('x');
    posix.writes.length = 0;
    await posix.s.run('true', { timeoutMs: 5_000 });
    // The command's line clears the partial one (`^U`, node-pty's VKILL); the snapshot after it has nothing left to clear.
    expect(posix.lines()[0]!.startsWith('\x15printf')).toBe(true);
    expect(posix.lines().slice(1).every((w) => w.startsWith('printf'))).toBe(true);
    // Keystrokes that end their own line leave nothing behind, and nothing is cleared.
    posix.s.sendInput('x\r');
    posix.writes.length = 0;
    await posix.s.run('true', { timeoutMs: 5_000 });
    expect(posix.lines().every((w) => w.startsWith('printf'))).toBe(true);
    // PowerShell's line is never prefixed with the POSIX kill character.
    const pwsh = session({ kind: 'powershell', file: 'pwsh' });
    pwsh.s.sendInput('x');
    await pwsh.s.run('$true', { timeoutMs: 5_000 });
    expect(pwsh.lines().every((w) => w.startsWith('$global:LASTEXITCODE'))).toBe(true);
  });
  // docs/archive/defects/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md (live-run M1).
  it('REQ-TOOLS-096 (live-run M1): a POSIX command too long for one PTY line is staged in a script the line dot-sources; a short one keeps its line', async () => {
    const session = (backend: ShellBackend) => {
      const writes: string[] = [];
      let emit: (d: string) => void = () => undefined;
      const factory: PtyFactory = {
        spawn: () => ({
          // Never disposed: `dispose` signals the pid's process group, and this PTY has no process behind it.
          pid: 2 ** 30, onData: (cb) => { emit = cb; }, onExit: () => undefined, resize: () => undefined, kill: () => undefined,
          write: (data) => {
            writes.push(data);
            const nonce = /__rot_([0-9a-f]+)_s/.exec(data)?.[1];
            if (nonce) setImmediate(() => emit(`__rot_${nonce}_s\r\n__rot_${nonce}_e:0\r\n`));
          },
        }),
      };
      const s = new ForegroundSession({ factory, backend, cwd: root, env: {}, monotonic: clocks.monotonic, timers: clocks.timers, emulator: xtermEmulatorFactory, warn: () => undefined });
      return { s, lines: () => writes.filter((w) => w.includes('__rot_') && !w.includes('__rot_b64__')) };
    };
    const long = `cat > /dev/null <<'EOF'\n${"it's \\ $x\n".repeat(400)}EOF`;
    const posix = session({ kind: 'posix', file: '/bin/sh' });
    await posix.s.run('true', { timeoutMs: 5_000 });
    expect(posix.lines()[0]).toBe(wrapCommand({ kind: 'posix', file: '/bin/sh' }, 'true', /__rot_[0-9a-f]+_s/.exec(posix.lines()[0]!)![0], /__rot_[0-9a-f]+_e/.exec(posix.lines()[0]!)![0]) + '\r');
    const before = posix.lines().length;
    await posix.s.run(long, { timeoutMs: 5_000 });
    const line = posix.lines()[before]!;
    expect(Buffer.byteLength(line)).toBeLessThanOrEqual(POSIX_LINE_BYTES);
    // The script's directory is the host's temporary directory, spelled with backslashes when this pure case runs on a
    // Windows host (`docs/archive/defects/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
    expect(line).toMatch(/^printf '%s\\n' '__rot_[0-9a-f]+_s'; command eval '\. '\\''[^']+[\\/]1\.sh'\\'''; printf '__rot_[0-9a-f]+_e:%s\\n' "\$\?"\r$/);
    const file = /'\\''([^']+[\\/]1\.sh)'\\''/.exec(line)![1]!;
    // The script holds the command as written, after the line that removes the script; only its user may read it.
    expect(readFileSync(file, 'utf8')).toBe(stagedScript(file, long));
    expect(readFileSync(file, 'utf8')).toBe(`command rm -f -- '${file}' 2>/dev/null; ${long}\n`);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    // The nonce is never part of the script's name: its echo would read as the marker printed.
    expect(file).not.toContain('__rot_');
    rmSync(join(file, '..'), { recursive: true, force: true });
    // PowerShell keeps its one base64 line: no Windows host here measures whether ConPTY caps a line (ADR-0020's M1 note).
    // (Measured 2026-10-15 on Windows 11 ARM64: no cap short of about 87 KB, pwsh or 5.1; the M1 PowerShell case pins it.)
    const pwsh = session({ kind: 'powershell', file: 'pwsh' });
    await pwsh.s.run(long, { timeoutMs: 5_000 });
    const psLine = pwsh.lines().find((w) => w.includes('FromBase64String'))!;
    const payload = /FromBase64String\('([^']+)'\)/.exec(psLine)![1]!;
    // The command alone since 2026-10-15; the flag's line is appended on the far side, after the command has parsed.
    expect(Buffer.from(payload, 'base64').toString('utf8')).toBe(long);
  });
});

describe.skipIf(process.platform === 'win32')('PD-TOOLS-001: the POSIX shell-state capture survives a screen that wraps', () => {
  it('reads the directory and every variable back exactly — a value longer than the 240-column screen, and one holding a newline', () => {
    const long = `/opt/${'x'.repeat(600)}/bin`;
    const out = execFileSync('/bin/sh', ['-c', snapshotCommand({ kind: 'posix', file: '/bin/sh' })], { cwd: root, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', LONG_PATHISH: long, MULTI: 'first\nsecond' } });
    // Every captured line fits well inside the screen, so the emulator never wraps one.
    expect(Math.max(...out.split('\n').map((l) => l.length))).toBeLessThanOrEqual(80);
    const snap = parseSnapshot(out);
    expect(snap?.cwd).toBe(root);
    expect(snap?.env['LONG_PATHISH']).toBe(long);
    expect(snap?.env['MULTI']).toBe('first\nsecond');
  });

  // docs/archive/defects/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md: the capture is read off
  // an emulated screen of the session's own width, which the display may narrow to 20 columns (REQ-TOOLS-128). Each row
  // is `__rot_b64__:` and 64 characters, 76 columns, so below 76 every row wraps; the parse kept only the rows that began
  // with the marker, and at 40 columns fin15 measured three entries back, PATH and HOME gone and one name spliced from two.
  it('reads the same directory and variables back off an emulated screen at every width the display may give it (REQ-TOOLS-128)', async () => {
    const env = { PATH: process.env['PATH'] ?? '', HOME: '/home/probe', PROBE_VAR: 'hello-there', LONG_PATHISH: `/opt/${'y'.repeat(300)}/bin`, MULTI: 'first\nsecond' };
    const out = execFileSync('/bin/sh', ['-c', snapshotCommand({ kind: 'posix', file: '/bin/sh' })], { cwd: root, encoding: 'utf8', env });
    const wide = parseSnapshot(out);
    expect(wide?.cwd).toBe(root);
    for (const [k, v] of Object.entries(env)) expect(wide?.env[k]).toBe(v);
    for (const cols of [20, 33, 40, 64, 75, 76, 77, 240]) {
      const screen = xtermEmulatorFactory({ cols, rows: 50, scrollback: 5_000 });
      try {
        await screen.write(out.replace(/\n/g, '\r\n'));
        expect({ cols, snap: parseSnapshot(screen.text()) }).toEqual({ cols, snap: wide });
      } finally { screen.dispose(); }
    }
  });

  it('refuses a capture that lost or gained characters, rather than decoding the pieces into a spliced environment', () => {
    const env = { PATH: '/usr/bin:/bin', HOME: '/home/probe', PROBE_VAR: 'hello-there' };
    const out = execFileSync('/bin/sh', ['-c', snapshotCommand({ kind: 'posix', file: '/bin/sh' })], { cwd: root, encoding: 'utf8', env });
    const rows = out.trimEnd().split('\n');
    expect(rows.length).toBeGreaterThan(2);
    expect(parseSnapshot(rows.join('\n'))?.env['PROBE_VAR']).toBe('hello-there');
    // A row whose continuation was dropped, as the old parse dropped every wrapped one.
    expect(parseSnapshot(rows.map((r, i) => (i === 0 ? r.slice(0, 40) : r)).join('\n'))).toBeNull();
    // A stray row of base64's own letters between two rows (a shell's `Terminated`, say) is not read as capture.
    expect(parseSnapshot([rows[0], 'Terminated', ...rows.slice(1)].join('\n'))).toBeNull();
    // A stray row after the last one that would decode past its final separator.
    expect(parseSnapshot([...rows, 'Terminated'].join('\n'))).toBeNull();
    // A stray line that is no part of the alphabet, between rows, is left out and the capture still reads whole.
    expect(parseSnapshot([rows[0], '[1]+ Done   sleep 5', ...rows.slice(1)].join('\n'))?.env).toEqual(parseSnapshot(out)?.env);
  });

  it('refuses a capture that lost whole rows from its top, whose decode starts mid-entry, rather than restoring it', () => {
    const encoded = Buffer.from(`/w\0A=${'x'.repeat(120)}\0B=two\0`, 'utf8').toString('base64');
    const rows = (encoded.match(/.{1,64}/g) ?? []).map((r) => `__rot_b64__:${r}`);
    expect(rows.length).toBeGreaterThan(2);
    expect(parseSnapshot(rows.join('\n'))).toEqual({ cwd: '/w', env: { A: 'x'.repeat(120), B: 'two' } });
    // The first row scrolled off the emulator's screen: every row left is still 64 characters and decodes, from `xxx…`.
    expect(parseSnapshot(rows.slice(1).join('\n'))).toBeNull();
  });

  it('refuses a capture that names no variable, rather than restoring an empty environment over the fresh shell', () => {
    const cwdOnly = Buffer.from(`${root}\0`, 'utf8').toString('base64');
    expect(parseSnapshot(`__rot_b64__:${cwdOnly}\n`)).toBeNull();
  });
});

// docs/archive/defects/the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md: PowerShell's capture printed
// one plain row per variable and the parse rejoined a row the screen wrapped with a newline, so a `Path` wider than the
// screen came back with newlines in it and a directory wider than the screen was cut at its edge. It now prints the POSIX
// capture's encoded rows. No PowerShell runs on this host: `powershellCapture` prints what the command's loop prints
// (the tag, the directory and each `NAME=value`, NUL-terminated, UTF-8, base64, 64 characters a row behind the marker),
// and the parse is read off the emulated screen at every width the display may give it. The Windows run is owed.
// Run 2026-10-15 on Windows 11 ARM64 (pwsh 7.6.6 and 5.1): the real-PTY case "at every width from 20 to 240 columns a
// hard-timeout reset restores PowerShell's directory and environment byte for byte" below; below 34 columns no call ended
// until the same day's repair (docs/archive/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md).
describe('PD-TOOLS-001: the PowerShell shell-state capture survives a screen that wraps (REQ-TOOLS-104, REQ-TOOLS-128)', () => {
  const ps: ShellBackend = { kind: 'powershell', file: 'pwsh' };
  const powershellCapture = (cwd: string, env: Readonly<Record<string, string>>): string => {
    const text = `__rot_ps__\0${cwd}\0${Object.entries(env).map(([k, v]) => `${k}=${v}\0`).join('')}`;
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    return (encoded.match(/.{1,64}/g) ?? []).map((r) => `__rot_b64__:${r}`).join('\n');
  };
  const cwd = `C:\\Users\\probe\\${'d'.repeat(260)}\\src`;
  const env = {
    Path: Array.from({ length: 24 }, (_, i) => `C:\\Program Files\\Tool${i}\\bin`).join(';'),
    USERPROFILE: 'C:\\Users\\probe',
    PROBE_VAR: 'héllo-there',
    EMPTYISH: ' ',
  };

  it('the command never writes the marker next to its colon, so its own echo is never read as a capture', () => {
    const command = snapshotCommand(ps);
    expect(command).not.toContain('__rot_b64__:');
    expect(command).toContain('[System.Text.Encoding]::UTF8.GetBytes');
    expect(command).toContain('$__i += 64');
    expect(parseSnapshot(`PS C:\\> ${command}\n`, 'powershell')).toBeNull();
  });

  it('reads the directory and every variable back exactly off an emulated screen at every width the display may give it', async () => {
    expect(env.Path.length).toBeGreaterThan(240);
    expect(cwd.length).toBeGreaterThan(240);
    const out = `PS C:\\> ${snapshotCommand(ps)}\n${powershellCapture(cwd, env)}\n`;
    expect(parseSnapshot(out, 'powershell')).toEqual({ cwd, env });
    for (const cols of [20, 33, 40, 64, 75, 76, 77, 240]) {
      const screen = xtermEmulatorFactory({ cols, rows: 50, scrollback: 5_000 });
      try {
        await screen.write(out.replace(/\n/g, '\r\n'));
        expect({ cols, snap: parseSnapshot(screen.text(), 'powershell') }).toEqual({ cols, snap: { cwd, env } });
      } finally { screen.dispose(); }
    }
  });

  it('the restore built from the read sets the long Path whole, with no newline in it, and the directory last', () => {
    const snap = parseSnapshot(powershellCapture(cwd, env), 'powershell');
    expect(snap).not.toBeNull();
    const plan = restoreCommand(ps, snap!, { cwd: 'C:\\', env: { Path: 'C:\\Windows', USERPROFILE: 'C:\\Users\\probe' } });
    expect(plan?.line).toContain(`Set-Item -LiteralPath 'Env:Path' -Value '${env.Path}'`);
    expect(plan?.line).not.toContain('\n');
    expect(plan?.line.endsWith(`Set-Location -LiteralPath '${cwd}'`)).toBe(true);
  });

  it('refuses a capture that lost its top rows, one that lost a row\'s continuation, and one with no variable or no directory', () => {
    const rows = powershellCapture(cwd, env).split('\n');
    expect(rows.length).toBeGreaterThan(3);
    expect(parseSnapshot(rows.slice(1).join('\n'), 'powershell')).toBeNull();
    // A row whose continuation was lost: the rows no longer carry 64 characters each.
    expect(parseSnapshot(rows.map((r, i) => (i === 1 ? r.slice(0, 40) : r)).join('\n'), 'powershell')).toBeNull();
    expect(parseSnapshot(powershellCapture(cwd, {}), 'powershell')).toBeNull();
    expect(parseSnapshot(powershellCapture('', env), 'powershell')).toBeNull();
  });

  it('a PowerShell capture that lost its top rows and resumes at a `/` is refused, never read as a POSIX capture', () => {
    // The tag, NUL, `C:\w` and NUL are 16 bytes and `X=` two more, so a value of 30 characters puts its `/` at byte 48:
    // the first 64-character row is exactly 48 bytes, and the rows after it decode to `/usr/bin\0B=two\0`, a POSIX
    // directory and one variable.
    const rows = powershellCapture('C:\\w', { X: `${'a'.repeat(30)}/usr/bin`, B: 'two' }).split('\n');
    const lost = rows.slice(1).join('\n');
    expect(parseSnapshot(lost, 'posix')).toEqual({ cwd: '/usr/bin', env: { B: 'two' } });
    expect(parseSnapshot(lost, 'powershell')).toBeNull();
  });
});


describe('terminal — a background command whose process could not be started (REQ-TOOLS-100, 103, 109, 112, 179)', () => {
  it('REQ-TOOLS-100/103/179: a spawn that fails after start returns reads failed with no exit code and failure_kind execution_error, never the −1 of killed', async () => {
    // Node reports ENOENT and EACCES asynchronously, through the child's `error` event and never its `exit`: `start`
    // returns a session, and the failure first shows at the poll. A shell file that does not exist is that case.
    const missing = join(root, 'no-such-shell');
    const m = new TerminalManager({ factory: { spawn: () => { throw new Error('unused'); } }, backend: { kind: shell?.kind ?? 'posix', file: missing }, clocks, config: TERMINAL_DEFAULTS, env: {}, warn: () => undefined });
    try {
      const t = terminalTool(m, TERMINAL_DEFAULTS);
      const started = await t.execute(args({ command: 'printf never', background: true }), ctx());
      const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
      const endedBy = (clocks.monotonic.now() as number) + 10_000;
      while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
        expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
        await new Promise((res) => setTimeout(res, 20));
      }
      const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
      // Before the repair: `Session ts_… is failed (exit -1).`, `background_terminal`, and no failure_kind.
      expect(q.text).not.toContain('exit -1');
      expect(q.text).toContain('Terminal execution failed before completion');
      expect(q.text).toContain('ENOENT');
      const d = diag(q.text);
      expect(d).toMatchObject({ session_id: id, session_status: 'failed', failure_kind: 'execution_error', outcome_kind: 'execution_error', outcome_severity: 'error', error_class: 'ExecutionError' });
      expect(d).not.toHaveProperty('exit_code');
      expect(q).toMatchObject({ isError: true, failureKind: 'execution_error', outcomeKind: 'execution_error', exitCode: null });
      // The list's structured entry carries no exit code either.
      const list = await t.execute(args({ session_action: 'list' }), ctx());
      expect((diag(list.text)['sessions'] as { session_id: string; exit_code: unknown }[]).find((e) => e.session_id === id)).toMatchObject({ status: 'failed', exit_code: null });
      // A kill of it kills nothing, says the session had already ended, and keeps OQ-143's execution_error detail.
      // Before the repair: `Session ts_… was killed. Terminal execution failed before completion: …`.
      const k = await t.execute(args({ session_id: id, session_action: 'kill' }), ctx());
      expect(k.text).not.toContain(`Session ${id} was killed`);
      expect(k.text).toContain(`Session ${id} had already ended; nothing was killed. It is failed. Terminal execution failed before completion: the background command could not be started:`);
      const kd = diag(k.text);
      expect(kd).toMatchObject({ session_status: 'failed', failure_kind: 'execution_error', outcome_kind: 'execution_error', outcome_severity: 'error', error_class: 'ExecutionError' });
      expect(kd).not.toHaveProperty('exit_code');
    } finally { await m.dispose(); }
  }, 20_000);
});

describe('terminal — availability (REQ-TOOLS-104)', () => {
  it('is decided by presence on PATH alone', () => {
    expect(findShell({ PATH: '' }, 'win32')).toBeNull();
    const here = findShell(process.env, 'win32');
    if (process.platform === 'win32') expect(here?.kind).toBe('powershell');
    // REQ-TOOLS-104's other half: every non-Windows platform is answered by a POSIX shell, and `/bin/sh` is
    // what makes it available there.
    if (process.platform !== 'win32') expect(findShell(process.env, process.platform)?.kind).toBe('posix');
    void FakeClock;
  });

  // docs/archive/defects/the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md: a pwsh installed from its MSIX
  // package (winget's choice on Windows 11 ARM64, measured 2026-10-15) is reached through an App Execution Alias, a reparse
  // point Node cannot `stat` (EACCES) though it starts when run, and `findShell` passed over it to Windows PowerShell 5.1.
  // Run where this host has such an alias; skipped elsewhere, since no test can make one.
  const aliasDir = join(process.env['LOCALAPPDATA'] ?? '', 'Microsoft', 'WindowsApps');
  const pwshAlias = join(aliasDir, 'pwsh.exe');
  const hasPwshAlias = process.platform === 'win32' && (() => { try { return lstatSync(pwshAlias).isSymbolicLink(); } catch { return false; } })();
  it.runIf(hasPwshAlias)('REQ-TOOLS-104: a pwsh on PATH as an App Execution Alias is present, taken before powershell, and runs a call', async () => {
    expect(findShell({ PATH: `${aliasDir};C:\\Windows\\System32\\WindowsPowerShell\\v1.0` }, 'win32')).toEqual({ kind: 'powershell', file: pwshAlias });
    // Spelled with PATHEXT's extension (`pwsh.EXE`): the same file on Windows.
    expect(findExecutable('pwsh', { PATH: aliasDir, PATHEXT: '.COM;.EXE' }, 'win32')?.toLowerCase()).toBe(pwshAlias.toLowerCase());
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: { kind: 'powershell', file: pwshAlias }, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    try {
      const r = await terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }).execute(args({ command: 'Write-Output $PSVersionTable.PSEdition', timeout: 30 }), ctx());
      expect(diag(r.text)['exit_code']).toBe(0);
      expect(output(r.text)).toBe('Core');
    } finally { await m.dispose(); }
  }, 60_000);

  it("splits a Windows PATH on the platform's separator, not the host's (R3 separator residue)", () => {
    // Found 2026-09-22 by sweeping every platform-parameterised function for a host-bound `node:path`
    // export. The win32 branch split on `delimiter`, which is `:` off Windows — so every entry of a
    // Windows PATH was cut at its drive letter and the lookup searched `C`, `\dir`, `C` again.
    //
    // Decidable on EVERY host, which is the whole point of the class: the fixture is two real
    // directories of the host's own, named in one `;`-separated PATH. A `:` split cuts that list
    // wrongly on either operating system — at the drive letter on Windows, and into a single
    // non-existent entry on POSIX, where `;` is an ordinary character in a path. Only the `;` split
    // reaches the directory that holds the file, so the ANSWER differs, not just the spelling.
    const base = mkdtempSync(join(tmpdir(), 'rotaris-findshell-'));
    try {
      const a = join(base, 'a');
      const b = join(base, 'b');
      mkdirSync(a);
      mkdirSync(b);
      writeFileSync(join(b, 'pwsh.exe'), '');
      expect(findShell({ PATH: `${a};${b}` }, 'win32')).toEqual({ kind: 'powershell', file: join(b, 'pwsh.exe') });
      expect(findShell({ PATH: `${a};${a}` }, 'win32')).toBeNull();
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  // Live-run finding Q1 (552d346): a `send_signal` sent with `background: true` was read as a new spawn and refused as a missing
  // command, twice, because the description named only `query` / `kill` and never said how a session action is sent
  // (docs/archive/defects/a-session-action-sent-with-background-true-is-refused-as-a-missing-command.md).
  it('REQ-TOOLS-110 (live-run Q1): the description says a session action is sent with session_id and background false or absent', () => {
    for (const d of [terminalDescription({ kind: 'posix', file: '/bin/sh' }), terminalDescription({ kind: 'powershell', file: 'pwsh.exe' })]) {
      for (const action of ['`query`', '`kill`', '`send_input`', '`send_signal`', '`list`']) expect(d).toContain(action);
      expect(d).toContain('with `background` false or absent');
      expect(d).toContain('`background=true` always starts a new command');
    }
  });

  it('REQ-TOOLS-104 (live-run L1): the description names the shell the host runs — PowerShell on Windows, the POSIX shell elsewhere', () => {
    const posix = terminalDescription({ kind: 'posix', file: '/bin/sh' });
    expect(posix).toContain('The shell is `/bin/sh`, a POSIX shell that may not be bash');
    expect(posix).toContain('`${PIPESTATUS[…]}`');
    expect(posix).not.toContain('PowerShell');
    // OQ-144 (acceptance A9): the POSIX description says the shell is not to be replaced, and what a call that does meets.
    expect(posix).toContain('Do not replace the shell with `exec <program>`');
    // The consequence is the one the host meets: the watch reads /proc, so only Linux ends the program and restarts the shell.
    expect(terminalDescription({ kind: 'posix', file: '/bin/sh' }, 'linux')).toContain('such a call normally fails, and the program is ended and the shell restarted');
    const mac = terminalDescription({ kind: 'posix', file: '/bin/sh' }, 'darwin');
    expect(mac).toContain('Do not replace the shell with `exec <program>`: such a call reads as still running, and every later call runs in that program.');
    expect(mac).not.toContain('the shell restarted');
    const windows = terminalDescription({ kind: 'powershell', file: 'pwsh.exe' });
    // REQ-TOOLS-104's four warnings and four statements, on the host it binds.
    for (const text of ['PowerShell, not bash', '`&&`', '`;`', '`2>&1`', '`$env:VAR`', 'heredoc never returns', 'bash arrays', '`[[ … ]]`', '`source`']) expect(windows).toContain(text);
    expect(windows).not.toContain('/bin/sh');
    expect(windows).not.toContain('exec <program>');
    // OQ-164: the third move after a soft pause, as the build answers it, is stated beside REQ-TOOLS-098's two.
    for (const d of [posix, windows]) expect(d).toContain('a new command issued meanwhile waits behind it, and its result reports how the paused one ended');
    // The executor names the manager's own shell.
    expect(terminalTool(new TerminalManager({ factory: { spawn: () => { throw new Error('unused'); } }, backend: { kind: 'posix', file: '/bin/sh' }, clocks, config: TERMINAL_DEFAULTS, env: {}, warn: () => undefined }), TERMINAL_DEFAULTS).description).toBe(posix);
  });
});

// docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md: the four `goneWithin` assertions of the
// soft-paused kill suite used `kill(pid, 0)`, which finds a process that has exited but is not yet reaped (a zombie).
// Where PID 1 reaps slowly, that reading waits on the host rather than on the tree and the case goes red even unladen.
// This pins the reading the suite now uses: a zombie is gone, a running process is not.
describe.runIf(PROC)('the process-death reading counts an exited-but-unreaped process as gone (the check `goneWithin` uses)', () => {
  it('reads a zombie as gone where `kill(pid, 0)` still finds it, and a running process as alive', async () => {
    // `sh` starts a child and execs into `sleep`, which never waits for it: once the child exits it stays a zombie until
    // PID 1 reaps it, which this container's init does not promptly (measured: still a zombie 20 s on). The child blocks
    // on a pipe from the test (fd 3) so it cannot exit before the exec — a shell that is still a shell would reap it.
    const holder = spawn('sh', ['-c', '(read _ <&3) & echo $!; exec sleep 30'], { stdio: ['ignore', 'pipe', 'ignore', 'pipe'] });
    const until = async (done: () => boolean, ms = 10_000): Promise<void> => { for (const deadline = Date.now() + ms; !done() && Date.now() < deadline;) await new Promise((r) => setTimeout(r, 20)); };
    try {
      const child = await new Promise<number>((resolve) => holder.stdout!.once('data', (d) => resolve(Number(String(d).trim()))));
      expect(child).toBeGreaterThan(0);
      await until(() => procState(holder.pid!) === 'sleep');
      expect(processAlive(child)).toBe(true); // still blocked on the pipe: running, so not gone
      (holder.stdio[3] as NodeJS.WritableStream & { destroy(): void }).destroy(); // EOF: the child's `read` returns and it exits
      await until(() => procState(child) === 'Z');
      expect(procState(child)).toBe('Z');
      expect(() => process.kill(child, 0)).not.toThrow(); // what the check used to ask — and why it waited on PID 1
      expect(processAlive(child)).toBe(false); // the reading that makes the four assertions above host-independent
    } finally { holder.kill('SIGKILL'); }
  }, 20_000);
});
