import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, type Clocks } from '@rotaris/kernel';
import { foregroundStreamId } from '@rotaris/contracts';
import { nodeClocks } from '@rotaris/platform';
import { classifyOutcome, diagnosticBlock, outputWarnings, stripVt } from './classify.js';
import { CommandRegion, ForegroundSession, parseSnapshot, pausedShare, POSIX_LINE_BYTES, posixShellArgs, printsMarker, processIdentity, restoreCommand, shellHoldsTerminal, snapshotCommand, stagedScript, unstartedShare, wrapCommand, type PtyFactory, type ShellBackend } from './foreground.js';
import { xtermEmulatorFactory, type EmulatorFactory } from './emulator.js';
import { endOfExit } from './background.js';
import { execFileSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { findShell, INTERRUPT_UNSEEN_NOTE, nodePtyFactory, seconds, TerminalManager, terminalDescription, terminalTool, TERMINAL_DEFAULTS, type BackgroundSession } from './index.js';
import type { ToolContext } from '../tools/types.js';
import type { ConfinementPort } from '../confinement/index.js';

/**
 * ADR-0020's first execution, against a REAL shell through a REAL pseudo-terminal (REQ-TOOLS-104: the
 * PowerShell backend on Windows). Skipped where no shell is present. Time is the node clocks: the marker
 * protocol and the process tree are the things under test, and they do not run on a fake clock.
 */
const shell = findShell();

/**
 * REQ-TOOLS-104 sends Windows to PowerShell and every other host to a POSIX shell, so every proof below is
 * spelled in the shell the host actually runs. What is under test is the marker protocol, the capture, the
 * emulated screen and the process tree, and none of those is a property of either language — the two spellings
 * are the SAME observable behaviour, and the assertions after them are byte-identical.
 *
 * ADR-0020's note recorded the POSIX branch of `wrapCommand` as reasoned but never executed, because no POSIX
 * shell ran on the host it was built on. This is that branch's first execution.
 */
const PS = shell?.kind === 'powershell';
const SH = {
  /** One line on stdout. */
  echo: (text: string) => (PS ? `Write-Output '${text}'` : `printf '%s\\n' '${text}'`),
  /** One line on stderr. */
  echoErr: (text: string) => (PS ? `[Console]::Error.WriteLine('${text}')` : `printf '%s\\n' '${text}' 1>&2`),
  /** Text with no trailing newline at all — ADR-0020 c.1's case. */
  echoNoNewline: (text: string) => (PS ? `Write-Host -NoNewline '${text}'` : `printf '%s' '${text}'`),
  /** The COMMAND exits with a status of its own; the session's shell keeps running. */
  exit: (code: number) => (PS ? `cmd /c exit ${code}` : `(exit ${code})`),
  /** A command that simply fails, without naming a status. */
  fails: () => (PS ? 'Get-Item C:\\definitely\\not\\here.txt' : 'false'),
  sleep: (seconds: number) => (PS ? `Start-Sleep -Seconds ${seconds}` : `sleep ${seconds}`),
  /** A variable the NEXT call must still see. */
  // Exported on POSIX, as `$env:` is on PowerShell: PD-TOOLS-001 restores the shell's EXPORTED variables.
  setVar: (name: string, value: string) => (PS ? `$env:${name} = '${value}'` : `export ${name}='${value}'`),
  /** The variable's value, alone. */
  echoVar: (name: string) => (PS ? `Write-Output $env:${name}` : `printf '%s\\n' "$${name}"`),
  /** The variable's value in brackets, so an empty one is still visible. */
  bracketVar: (name: string) => (PS ? `Write-Output "[$env:${name}]"` : `printf '[%s]\\n' "$${name}"`),
  /** The variable's value written to a file, so a case can see it from outside the terminal. */
  writeVar: (name: string, path: string) => (PS ? `Set-Content -NoNewline -Path '${path}' -Value $env:${name}` : `printf '%s' "$${name}" > '${path}'`),
};
const clocks: Clocks = nodeClocks();
const root = mkdtempSync(join(tmpdir(), 'rotaris-term-'));
/**
 * `two-terminal-pty-tests-fail-on-main-in-this-environment`: where `/bin/sh` is `bash` (Fedora, RHEL, Arch) the session's
 * shell is `bash` in POSIX mode, and two cases failed there that passed where it is `dash`. Where bash is installed, a `sh`
 * link to it reproduces that host on any Linux one, as OQ-135's measurement did; null where there is no bash.
 */
const bashAsSh: string | null = (() => {
  if (process.platform === 'win32') return null;
  const bash = ['/usr/bin/bash', '/bin/bash'].find((f) => existsSync(f));
  if (!bash) return null;
  const link = join(mkdtempSync(join(tmpdir(), 'rotaris-bash-sh-')), 'sh');
  symlinkSync(bash, link);
  return link;
})();
const ctx = (signal = new AbortController().signal): ToolContext => ({ workspaceRoot: root, sessionId: 's1', agentName: 'orchestrator', persona: 'orchestrator', monotonic: clocks.monotonic, wall: clocks.wall, signal, warn: () => undefined });
let manager: TerminalManager | null = null;
async function tool(over: Partial<typeof TERMINAL_DEFAULTS> = {}) {
  manager ??= new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
  return terminalTool(manager, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over });
}
const diag = (text: string) => JSON.parse(text.slice(text.indexOf('[terminal_diagnostic] ') + '[terminal_diagnostic] '.length)) as Record<string, unknown>;
const output = (text: string) => { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(text); return m ? m[1] : ''; };
/**
 * OQ-164: what an observation carries of a soft-paused command other than its own subject — the block between its detail and
 * its own output section ('' when there is none), which a next call or a poll now reports in place of a later poll.
 */
const earlierOutput = (text: string) => { const m = /since it was last observed(?: \(truncated\))?:\n([\s\S]*?)\n\[(?:partial_)?terminal_output\]/.exec(text); return m ? m[1]! : ''; };
const args = (a: Record<string, unknown>) => ({ command: '', is_input: false, reset: false, background: false, ...a }) as Parameters<Awaited<ReturnType<typeof tool>>['execute']>[0];
/**
 * A session of its own on the POSIX shell `file`, with a 1.5 s no-output window; `env` is added to the host's environment,
 * and `cols` is the width the display resized its PTY to before its first call (REQ-TOOLS-128).
 */
async function posixSession(file: string, opts: { env?: Record<string, string>; cols?: number } = {}) {
  return backendSession({ kind: 'posix', file }, opts);
}
/** The same on any backend: PowerShell's PD-TOOLS-001 cases need the width and the spawn environment too. */
async function backendSession(backend: ShellBackend, opts: { env?: Record<string, string>; cols?: number } = {}) {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), ...opts.env };
  const m = new TerminalManager({ factory: await nodePtyFactory(), backend, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env, warn: () => undefined });
  if (opts.cols !== undefined) m.session(`${ctx().sessionId}:${ctx().agentName}`, root).resize(opts.cols, 50);
  return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }), env };
}

afterAll(async () => { await manager?.dispose(); rmSync(root, { recursive: true, force: true }); if (bashAsSh) rmSync(join(bashAsSh, '..'), { recursive: true, force: true }); });

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
  // (docs/defects/fixed/): between the kernel releasing an exiting process's memory and the process's reaping, `/proc/<pid>/exe`
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
  // `docs/defects/fixed/processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched.md`: the
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
      expect(readFileSync(`/proc/${pid}/cmdline`, 'latin1')).toBe(givesOneEmpty ? '\0' : '');
      expect(processIdentity(pid)).toBe(givesOneEmpty ? `${cat}\0\0` : null);
    } finally {
      child.kill();
      await exited;
    }
  }, 20_000);
  it.runIf(process.platform !== 'linux')('OQ-144: off Linux there is no /proc, and no identity to watch', () => {
    expect(processIdentity(process.pid)).toBeNull();
  });
  it('strips VT sequences and carriage returns', () => {
    expect(stripVt('\x1b[32mhi\x1b[0m\r\n\x1b]0;title\x07x')).toBe('hi\nx');
  });
  it('the wrapper brackets the command with the two markers and recovers the exit status', () => {
    const w = wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E');
    // One line or many, the command is carried as base64 into a guarded script block between the two markers
    // (docs/defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md); it was spliced raw
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
   * docs/defects/fixed/at-the-20-column-floor-an-interrupted-calls-poll-intermittently-carries-the-next-calls-wrapper-echo.md:
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
  // docs/defects/fixed/output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md: at the soft pause `execute` removed
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
  // docs/defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md (live-run M1).
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
    // Windows host (`docs/defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
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

  // docs/defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md: the capture is read off
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

// docs/defects/fixed/the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md: PowerShell's capture printed
// one plain row per variable and the parse rejoined a row the screen wrapped with a newline, so a `Path` wider than the
// screen came back with newlines in it and a directory wider than the screen was cut at its edge. It now prints the POSIX
// capture's encoded rows. No PowerShell runs on this host: `powershellCapture` prints what the command's loop prints
// (the tag, the directory and each `NAME=value`, NUL-terminated, UTF-8, base64, 64 characters a row behind the marker),
// and the parse is read off the emulated screen at every width the display may give it. The Windows run is owed.
// Run 2026-10-15 on Windows 11 ARM64 (pwsh 7.6.6 and 5.1): the real-PTY case "at every width from 34 to 240 columns a
// hard-timeout reset restores PowerShell's directory and environment byte for byte" below; below 34 columns no call ends
// (docs/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md).
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

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it('REQ-SANDBOX-077, -078, -083: under bubblewrap a root missing a protected name refuses the command, runs nothing and creates neither name', async () => {
    await tool();
    const bare = mkdtempSync(join(tmpdir(), 'rotaris-absent-'));
    try {
      const confinement: ConfinementPort = { resolve: (executionRoot) => ({ spec: { mode: 'workspace-write', executionRoot, writableRoots: [], allowNetwork: false }, verdict: { available: true, backend: 'bubblewrap', reason: '', remediation: '' } }) };
      const t = terminalTool(manager!, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, confinement);
      const at = { ...ctx(), workspaceRoot: bare, sessionId: 's-absent' };
      const marker = join(bare, 'ran.txt');
      for (const background of [false, true]) {
        const r = await t.execute(args({ command: SH.writeVar('HOME', marker), background }), at);
        expect(r).toMatchObject({ isError: true, failureKind: 'sandbox_unavailable', outcomeKind: 'sandbox_unavailable', exitCode: 126 });
        expect(diag(r.text)).toMatchObject({ error_class: 'SandboxUnavailableError', exit_code: 126 });
        expect(r.text).toContain(`${bare}/.git and ${bare}/.rotaris do not exist`);
      }
      // Nothing reached the shell or the background registry, and the host holds what it held before.
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(bare, '.git'))).toBe(false);
      expect(existsSync(join(bare, '.rotaris'))).toBe(false);
    } finally { rmSync(bare, { recursive: true, force: true }); }
  });
  it('runs a command, recovers the exit status, cleans the echo and the markers, and persists shell state across calls', async () => {
    const t = await tool();
    // The FIRST call on a session pays `pwsh`'s cold start, which under full-suite load can outlast the 1.5 s
    // no-output window; it came back `(no output)` and read as a failure of the marker protocol. Every later
    // call here answers in a fraction of the window and is left on the default path deliberately.
    const r = await t.execute(args({ command: SH.echo('hello'), timeout: 15 }), ctx());
    expect(r.isError).toBe(false);
    expect(output(r.text)).toBe('hello');
    expect(diag(r.text)).toMatchObject({ backend: 'single-session', exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', session_reinitialized: false });
    expect(r.text).not.toContain('__rot_');
    // A variable AND a working directory, both of which the next call must still see.
    const set = await t.execute(args({ command: `${SH.setVar('ROTARIS_T', 'persisted')}; cd ..` }), ctx());
    expect(diag(set.text)['exit_code']).toBe(0);
    const get = await t.execute(args({ command: SH.echoVar('ROTARIS_T') }), ctx());
    expect(output(get.text)).toBe('persisted');
  });
  it('REQ-TOOLS-179: a non-zero exit is the command\'s own; classified shell_failure', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: SH.exit(3) }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 3, outcome_kind: 'shell_failure', outcome_severity: 'error' });
    expect(r.isError).toBe(true);
    const cmdlet = await t.execute(args({ command: SH.fails() }), ctx());
    expect(diag(cmdlet.text)['exit_code']).not.toBe(0);
  });
  // Live-run finding L1: `sh` abandons the rest of a line it cannot expand or parse, so the unguarded wrapper's end frame
  // never ran and a command that finished at once read as a soft pause, exit −1. The call names no timeout, so it is the
  // soft-pause path (a 1.5 s window here) the unguarded wrapper fell into. dash, `/bin/sh` on Debian and Ubuntu, is the
  // shell a model writes bash for; bash in POSIX mode, `/bin/sh` on Fedora, RHEL and Arch, abandons the line the same way,
  // and the case runs under both where bash is installed.
  const l1Case = async (t: Awaited<ReturnType<typeof tool>>): Promise<void> => {
    // `${PIPESTATUS[0]}` is what dash cannot expand; bash can, so the line ends on `${a b}`, which no POSIX shell expands
    // (`two-terminal-pty-tests-fail-on-main-in-this-environment`: the case read dash's error as every shell's).
    const expand = await t.execute(args({ command: 'export ROTARIS_L1=kept; printf \'%s\\n\' ran; echo "EXIT=${PIPESTATUS[0]}"; echo "${a b}"' }), ctx());
    expect(diag(expand.text)['outcome_kind']).not.toBe('soft_pause');
    expect(diag(expand.text)['exit_code']).toBeGreaterThan(0);
    expect(output(expand.text)).toContain('ran');
    expect(output(expand.text)).toMatch(/bad substitution/i);
    expect(expand.text).not.toContain('__rot_');
    // The shell is the same one, and what the line did before its error persists.
    const after = await t.execute(args({ command: SH.echoVar('ROTARIS_L1') }), ctx());
    expect(output(after.text)).toBe('kept');
    // A syntax `sh` does not have — bash's process substitution, the sibling note's `comm … <(…)` — and an unterminated
    // quote, which put the shell on its continuation prompt until the hard cap. Each ends with a status of its own.
    for (const command of ['comm -13 <(printf \'a\\n\') <(printf \'b\\n\')', 'echo "unterminated']) {
      const r = await t.execute(args({ command }), ctx());
      expect(diag(r.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(r.text)['exit_code']).not.toBe(-1);
      expect(r.text).not.toContain('__rot_');
    }
    // A trailing comment no longer comments the end frame out.
    const comment = await t.execute(args({ command: 'printf \'%s\\n\' commented # a note' }), ctx());
    expect(diag(comment.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
    expect(output(comment.text)).toBe('commented');
  };
  it.skipIf(PS)('REQ-TOOLS-097/098/179 (live-run L1): a command sh cannot expand or parse ends with its own exit status, never a soft pause', async () => {
    await l1Case(await tool());
  }, 30_000);
  it.runIf(bashAsSh !== null)('REQ-TOOLS-097/098/179 (live-run L1): under bash as `/bin/sh`, a command sh cannot expand or parse ends with its own exit status, never a soft pause', async () => {
    const { m, t } = await posixSession(bashAsSh!);
    try { await l1Case(t); } finally { await m.dispose(); }
  }, 30_000);
  it.runIf(process.platform === 'linux' && shell?.kind === 'posix')('REQ-TOOLS-097/098/103/104 (OQ-144, acceptance A9): a command that replaces the session\'s shell ends at once as an execution_error, never a soft pause, and the next call runs in the shell the description names', async () => {
    // A session of its own: this case restarts its shell. The window is long enough that a soft pause cannot be
    // mistaken for the replacement being noticed, and short enough that the old reading fails in seconds.
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 3_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 3_000 });
    const cmdline = "tr '\\0' ' ' < /proc/$$/cmdline";
    try {
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_A9', 'kept'), timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      const ours = output((await t.execute(args({ command: cmdline, timeout: 15 }), ctx())).text);
      expect(ours).toContain(shell!.file);
      // The live run's call #5 was `exec bash`; `exec sh` is the same replacement with no dependency on bash. It names no
      // timeout, so the soft pause is armed, as it was for the model's call.
      const began = clocks.monotonic.now() as number;
      const r = await t.execute(args({ command: 'exec sh' }), ctx());
      const took = (clocks.monotonic.now() as number) - began;
      // Before the repair: `soft_pause`, exit −1, "The command is still running", after the whole no-output window.
      expect(diag(r.text)['outcome_kind']).not.toBe('soft_pause');
      expect(took).toBeLessThan(3_000);
      expect(r).toMatchObject({ isError: true, failureKind: 'execution_error', outcomeKind: 'execution_error' });
      expect(diag(r.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset', error_class: 'ExecutionError' });
      expect(diag(r.text)).not.toHaveProperty('exit_code');
      expect(r.text).toContain('Terminal execution failed before completion');
      expect(r.text).toContain('replaced the session\'s shell');
      expect(r.text).not.toContain('__rot_');
      // The session is back on the shell the description names, and PD-TOOLS-001's snapshot came with it.
      const after = await t.execute(args({ command: cmdline, timeout: 15 }), ctx());
      expect(output(after.text)).toBe(ours);
      expect(diag(after.text)['session_reinitialized']).toBe(true);
      expect(output((await t.execute(args({ command: SH.echoVar('ROTARIS_A9'), timeout: 15 }), ctx())).text)).toBe('kept');
      // `exec` with redirections alone keeps the shell, and is an ordinary command.
      const redirect = await t.execute(args({ command: `exec 3>/dev/null; ${SH.echo('still')}` }), ctx());
      expect(diag(redirect.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(redirect.text)).toBe('still');
      expect(output((await t.execute(args({ command: cmdline, timeout: 15 }), ctx())).text)).toBe(ours);
    } finally { await m.dispose(); }
  }, 40_000);
  // `a-command-that-exits-the-session-shell-reads-as-a-soft-pause` (OQ-144's sibling): a command that ENDS the session's
  // shell — `exit 3`, `kill -9 $$` — never prints the end frame either, because the shell that would print it is gone.
  // Before the repair the call waited out the no-output window and read as a soft pause, exit −1, "may still be running";
  // the next call ran in a fresh shell with the directory and variables gone, and reported `session_reinitialized` false.
  it.skipIf(PS)('REQ-TOOLS-097/098/100/103 (OQ-144): a command that ends the session\'s shell ends at once as an execution_error, never a soft pause, and the next call reports the respawn with the shell state restored', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 3_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 3_000 });
    const sub = realpathSync(mkdtempSync(join(root, 'ends-')));
    try {
      for (const [i, command] of ['exit 3', 'kill -9 $$'].entries()) {
        const value = `kept${i}`;
        expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_ENDS', value)}; cd '${sub}'`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
        // It names no timeout, so the soft pause is armed, as it is for a model's call.
        const began = clocks.monotonic.now() as number;
        const r = await t.execute(args({ command }), ctx());
        const took = (clocks.monotonic.now() as number) - began;
        // Before the repair: `soft_pause`, exit −1, after the whole 3 s window.
        expect(diag(r.text)['outcome_kind'], command).not.toBe('soft_pause');
        expect(took, command).toBeLessThan(1_500);
        expect(r).toMatchObject({ isError: true, failureKind: 'execution_error', outcomeKind: 'execution_error' });
        expect(diag(r.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset', error_class: 'ExecutionError' });
        expect(diag(r.text)).not.toHaveProperty('exit_code');
        expect(r.text).toContain('Terminal execution failed before completion');
        expect(r.text).toContain('ended the session\'s shell');
        expect(r.text).toContain(`were restored (${sub})`);
        expect(r.text).not.toContain('__rot_');
        // The next call runs in the respawned shell, says so, and finds the directory and the variable re-applied.
        const next = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; pwd`, timeout: 15 }), ctx());
        expect(diag(next.text), command).toMatchObject({ exit_code: 0, session_reinitialized: true });
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual([value, sub]);
        // And only that call: the one after it is in the same shell.
        expect(diag((await t.execute(args({ command: 'true', timeout: 15 }), ctx())).text)['session_reinitialized'] ?? false).toBe(false);
      }
    } finally { await m.dispose(); }
  }, 40_000);
  it.skipIf(PS)('REQ-TOOLS-098/100/103 (OQ-144): a soft-paused command that ends the shell is handed over by the poll as an execution_error, and a shell that ended between calls is respawned, restored and reported', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 });
    const sub = realpathSync(mkdtempSync(join(root, 'ends-paused-')));
    try {
      expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_ENDS', 'paused')}; cd '${sub}'`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      const paused = await t.execute(args({ command: 'sleep 2; exit 4' }), ctx());
      expect(diag(paused.text)['outcome_kind']).toBe('soft_pause');
      await new Promise((res) => setTimeout(res, 2_500));
      // Before the repair: −1, `soft_pause`, "The process may still be running", on every poll after the shell had gone.
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ failure_kind: 'execution_error', outcome_kind: 'execution_error' });
      expect(diag(poll.text)).not.toHaveProperty('exit_code');
      expect(poll.text).toContain('ended the session\'s shell');
      const next = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; pwd`, timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['paused', sub]);
      // A shell ended between calls — keystrokes the agent wrote to it — is respawned by the next call, which says so.
      expect(diag((await t.execute(args({ command: 'exit\r', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_000));
      const after = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; pwd`, timeout: 15 }), ctx());
      expect(diag(after.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(after.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['paused', sub]);
    } finally { await m.dispose(); }
  }, 40_000);
  // OQ-144's first-call handshake is one no-op round trip on a fresh shell before the command is written: an await before
  // the call's own abort listener and kill handler exist. Both cases give the fresh shell a startup that takes a second
  // (`ENV`, which an interactive POSIX shell reads), so the cancel and the kill land inside the handshake on any host.
  // `startupS` is the fresh shell's startup. The cancel case takes three seconds, longer than its bound, so that only the
  // handshake's own abort meets the bound: with one second, the check made after the handshake ended the call inside it
  // too, and the case passed with the signal taken off the handshake (acceptance round 1's second verifier).
  const slowStart = async (tag: string, startupS = 1) => {
    const dir = mkdtempSync(join(tmpdir(), `rotaris-${tag}-`));
    const rc = join(dir, 'rc');
    writeFileSync(rc, `sleep ${startupS}\n`);
    const env = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), ENV: rc };
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 }, env, warn: () => undefined });
    return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 }), marker: join(dir, 'ran'), dir };
  };
  it.runIf(process.platform === 'linux' && shell?.kind === 'posix')('REQ-TOOLS-097/099 (OQ-144, acceptance round 1): a run\'s cancel that lands while a fresh shell answers the first call\'s handshake ends the call at once, and the command never runs', async () => {
    const { m, t, marker, dir } = await slowStart('a9-abort', 3);
    try {
      const stop = new AbortController();
      const began = clocks.monotonic.now() as number;
      const call = t.execute(args({ command: `printf ran > '${marker}'; sleep 4`, timeout: 20 }), ctx(stop.signal));
      setTimeout(() => stop.abort(), 300);
      const r = await call;
      const took = (clocks.monotonic.now() as number) - began;
      // Before the repair: 5 s and `success`, exit 0 — the cancel was lost and the command ran to its end. With the
      // signal off the handshake alone, the call waits out the three-second startup before it is cancelled.
      expect(took).toBeLessThan(1_500);
      // PD-TOOLS-013 (OQ-226): a cancel is no hard timeout. Before it: 124, `timeout` and "exceeded its timeout".
      expect(diag(r.text)).toMatchObject({ kill_status: 'session_reset', failure_kind: 'interrupted', outcome_kind: 'interrupted', outcome_severity: 'warning', error_class: 'InterruptedError', timeout: false });
      expect(diag(r.text)).not.toHaveProperty('exit_code');
      expect(r).toMatchObject({ isError: true, failureKind: 'interrupted', outcomeKind: 'interrupted', exitCode: null });
      expect(r.text).toContain('cancelled by the run before the command was written, so it never ran');
      expect(r.text).not.toContain('exceeded its timeout');
      expect(existsSync(marker)).toBe(false);
      // The session is usable after it: the next call runs on the restarted shell.
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect(output(next.text)).toBe('after');
    } finally { await m.dispose(); rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);
  it.runIf(process.platform === 'linux' && shell?.kind === 'posix')('REQ-SHELL-092 (OQ-144, acceptance round 1): a kill from the terminal window that lands during the first call\'s handshake ends the call as killed, and the command is never written to the dead shell', async () => {
    const { m, t, marker, dir } = await slowStart('a9-kill');
    try {
      const began = clocks.monotonic.now() as number;
      const call = t.execute(args({ command: `printf ran > '${marker}'; sleep 4`, timeout: 6 }), ctx());
      await new Promise((res) => setTimeout(res, 300));
      expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: true, value: undefined });
      const r = await call;
      const took = (clocks.monotonic.now() as number) - began;
      // Before the repair: the command went to the PTY the kill had just ended, and the call waited out its 6 s timeout.
      expect(took).toBeLessThan(1_500);
      expect(diag(r.text)).toMatchObject({ exit_code: -1, kill_status: 'session_reset' });
      expect(r.text).toContain('killed from the terminal window');
      expect(existsSync(marker)).toBe(false);
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect(output(next.text)).toBe('after');
      expect(existsSync(marker)).toBe(false);
    } finally { await m.dispose(); rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);
  it.skipIf(PS)('PD-TOOLS-013 (OQ-226): a call its run cancels mid-command reads `interrupted`, names the restore and no timeout, and the next call runs in the restarted session', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 });
    const sub = realpathSync(mkdtempSync(join(root, 'cancelled-')));
    try {
      expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_CANCELLED', 'kept')}; cd '${sub}'`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      const stop = new AbortController();
      const call = t.execute(args({ command: `${SH.echo('before-cancel')}; ${SH.sleep(5)}; ${SH.echo('late')}`, timeout: 20 }), ctx(stop.signal));
      setTimeout(() => stop.abort(), 300);
      const r = await call;
      // Before the repair: exit 124, `timeout` / error, `TimeoutError`, "The command exceeded its timeout of 20 seconds".
      expect(r).toMatchObject({ isError: true, failureKind: 'interrupted', outcomeKind: 'interrupted', exitCode: null });
      expect(diag(r.text)).toMatchObject({ failure_kind: 'interrupted', outcome_kind: 'interrupted', outcome_severity: 'warning', error_class: 'InterruptedError', kill_status: 'session_reset', timeout: false });
      expect(diag(r.text)).not.toHaveProperty('exit_code');
      expect(r.text).toContain('Terminal execution was cancelled by the run before the command completed, so it has no exit code');
      expect(r.text).toContain('were restored');
      expect(r.text).not.toContain('exceeded its timeout');
      expect(r.text).toContain('[terminal_output]');
      expect(r.text).not.toContain('[partial_terminal_output]');
      expect(output(r.text)).toContain('before-cancel');
      // The session restarted with PD-TOOLS-001's snapshot: the next call runs, in the directory and with the variable.
      const next = await t.execute(args({ command: `${SH.echoVar('ROTARIS_CANCELLED')}; pwd`, timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['kept', sub]);
    } finally { await m.dispose(); }
  }, 30_000);
  it('ADR-0020 c.1: a command that echoes attacker-chosen marker text cannot forge the exit status', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: `${SH.echo('__rot_deadbeefdeadbeefdeadbeef_e:0')}; ${SH.exit(7)}` }), ctx());
    expect(diag(r.text)['exit_code']).toBe(7);
    expect(output(r.text)).toContain('__rot_deadbeefdeadbeefdeadbeef_e:0');
  });
  it('OQ-13: the foreground PTY captures stderr in the terminal output', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: SH.echoErr('stderr-captured') }), ctx());
    expect(output(r.text)).toContain('stderr-captured');
  });

  it('OQ-38 ruled 2026-09-11: an agent keystroke does not arm the flush, and the control surface still does', async () => {
    const t = await tool();
    const streamId = foregroundStreamId('orchestrator');
    // A call that supplies no timeout and then goes quiet soft-pauses and returns while the process keeps running, so
    // the stream is still open and still framing (REQ-TOOLS-098) and the counter below is read against a live stream.
    await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx());
    const before = manager!.streams.counters.armedFlushes;
    await t.execute(args({ command: 'x', is_input: true }), ctx());
    expect(manager!.streams.counters.armedFlushes).toBe(before);
    // REQ-CONFIG-117 gives the licence to beat the period to the person who took control, and it is still spent there.
    expect(manager!.streams.sendKeys(streamId, 'y').ok).toBe(true);
    expect(manager!.streams.counters.armedFlushes).toBe(before + 1);
  }, 20_000);

  it('REQ-TOOLS-097/099: the hard timeout kills the tree, restarts the session, reports 124 and session_reset; shell state is gone', async () => {
    const t = await tool();
    // The variable is set by a call that names its own timeout, so it cannot soft-pause (REQ-TOOLS-098). The case
    // before this one leaves `sleep 3` running soft-paused in this shared session, and a call that named none queued
    // behind it for ~1.45 s against the 1.5 s no-output window. Under load it paused, the product never saw it
    // complete, and the reset restored an older snapshot without the variable: the `[]` of
    // docs/defects/fixed/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md (OQ-134, pinned below).
    const set = await t.execute(args({ command: SH.setVar('ROTARIS_GONE', 'set'), timeout: 15 }), ctx());
    expect(diag(set.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
    const r = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 124, timeout: true, failure_kind: 'timeout', kill_status: 'session_reset', outcome_kind: 'timeout' });
    expect(r.text).toContain('[partial_terminal_output]');
    // PD-TOOLS-001: the reset re-applies the snapshot — the variable the timed-out command inherited
    // survives the respawn, and the detail names what was restored beside the REQ-TOOLS-099 loss sentence.
    expect(r.text).toContain('were restored');
    // This one reads a SHELL THAT HAS JUST BEEN RESPAWNED, and a cold `pwsh` under full-suite load can take
    // longer to answer than the 1.5 s no-output window; the read then came back `(no output)` and the test read
    // as a failure of the reset. It names its own timeout, which is what takes the window out of the question.
    const after = await t.execute(args({ command: SH.bracketVar('ROTARIS_GONE'), timeout: 15 }), ctx());
    expect(output(after.text)).toBe('[set]');
    expect(diag(after.text)['session_reinitialized']).toBe(true);
  }, 30_000);
  it('PD-TOOLS-001 (OQ-134): a reset restores the snapshot of the last command the product saw complete, so a soft-paused command that completed unseen is not in it', async () => {
    // A session of its own, so no other case's snapshot or paused command stands in it.
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    // The variable's command also writes the variable's value to this file, so the case can see, from outside the
    // terminal, that the shell ran it and held the variable — before the reset, which is what OQ-134 is about.
    const marker = join(root, 'oq133-unseen.txt');
    rmSync(marker, { force: true });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      // A quiet command soft-pauses at ~1.5 s and keeps running; the next call queues behind it in the shell's input.
      expect(diag((await t.execute(args({ command: SH.sleep(8) }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      // Named no timeout, the variable's call meets 1.5 s more of silence and soft-pauses at ~3 s, long before the
      // `sleep 8` ends: the command has not run yet, so the file is absent, and its completion will never be seen.
      const unseen = await t.execute(args({ command: `${SH.setVar('ROTARIS_UNSEEN', 'set')}; ${SH.writeVar('ROTARIS_UNSEEN', marker)}` }), ctx());
      expect(diag(unseen.text)['outcome_kind']).toBe('soft_pause');
      expect(existsSync(marker)).toBe(false);
      // The `sleep 8` ends and the queued command runs, unseen. Wait for its file rather than for a time.
      const ranBy = (clocks.monotonic.now() as number) + 20_000;
      while (!existsSync(marker) || readFileSync(marker, 'utf8').trim() === '') {
        expect(clocks.monotonic.now() as number).toBeLessThan(ranBy);
        await new Promise((res) => setTimeout(res, 50));
      }
      // The shell held the variable before the respawn.
      expect(readFileSync(marker, 'utf8').trim()).toBe('set');
      const r = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx());
      expect(diag(r.text)).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
      expect(r.text).toContain('were restored');
      // What was restored is the `ready` call's snapshot, the last the product saw complete, which never held it.
      expect(output((await t.execute(args({ command: SH.bracketVar('ROTARIS_UNSEEN'), timeout: 15 }), ctx())).text)).toBe('[]');
      // The same sequence with a call that names its timeout does not pause, is seen to complete, and is restored.
      expect(diag((await t.execute(args({ command: SH.sleep(5) }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_SEEN', 'set'), timeout: 15 }), ctx())).text)['outcome_kind']).toBe('success');
      expect((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx())).text).toContain('were restored');
      expect(output((await t.execute(args({ command: SH.bracketVar('ROTARIS_SEEN'), timeout: 15 }), ctx())).text)).toBe('[set]');
    } finally { await m.dispose(); rmSync(marker, { force: true }); }
  }, 60_000);

  // docs/defects/fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md: the
  // OQ-38 case above types `x` and `y` with no Enter while its `sleep 3` runs soft-paused. The line discipline held them,
  // the next wrapped line was appended to them, `xyprintf: not found` replaced the start marker, and with no start marker
  // the capture kept the whole screen — `done-later`, the paused call's own `__rot_…_e:0`, the shell's error — while the
  // live stream, which opens only at the printed start marker (L9), carried nothing. POSIX only: the kill character is the
  // POSIX line discipline's, and PowerShell's first statement already takes a prefix without losing the start marker.
  it.skipIf(PS)('REQ-TOOLS-096/097/127 (A10): keystrokes left without Enter under a soft-paused command neither leak its end frame and late output into the next call nor blank that call\'s live stream', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      // Both roads the note names: the agent's own `is_input`, and the control surface's send-keys.
      expect(diag((await t.execute(args({ command: 'x', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      expect(m.streams.sendKeys(foregroundStreamId('orchestrator'), 'y').ok).toBe(true);
      const session = m.session('s1:orchestrator', root);
      let tapped = '';
      const untap = session.onOutput((chunk) => { tapped += chunk; });
      const r = await t.execute(args({ command: SH.echo('own-output'), timeout: 15 }), ctx());
      untap();
      expect(diag(r.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(r.text)).toBe('own-output');
      expect(r.text).not.toContain('__rot_');
      expect(output(r.text)).not.toContain('done-later');
      expect(r.text).not.toContain('not found');
      // The live stream carries the call's own output again, and nothing of the wrapper or the paused call.
      expect(stripVt(tapped).split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['own-output']);
      // The paused call's end frame is its own: its late output and the exit status it ended with. Since OQ-164's reading (the rule since R-071, 2026-10-06)
      // they are reported by the call that waited behind it, not left for a poll.
      expect(earlierOutput(r.text)).toBe('done-later');
      expect(String(diag(r.text)['detail'])).toMatch(/waited behind it: that command ended .* with exit code 0\./);
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
    } finally { await m.dispose(); }
  }, 30_000);

  // A10's verification: a soft-paused command that ends while the next call is already queued behind it. Before the
  // repair the paused call was closed by the NEXT call's end frame and took that call's exit status, so a paused command
  // that failed read as a success. The paused call's own frame is read now, and so is its own status.
  it.skipIf(PS)('REQ-TOOLS-098/179 (A10): a soft-paused command that ends behind the next call reports its own exit status, not the next call\'s', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('failed-later')}; ${SH.fails()}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const next = await t.execute(args({ command: SH.echo('next-ok'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('next-ok');
      // OQ-164: the call that waited behind it reports the paused command's end — its own output and its own status, 1.
      expect(earlierOutput(next.text)).toBe('failed-later');
      expect(String(diag(next.text)['detail'])).toMatch(/that command ended .* with exit code 1\./);
      expect(next.text).not.toContain('__rot_');
    } finally { await m.dispose(); }
  }, 30_000);

  // A10's verification: REQ-TOOLS-098 tells the agent to interrupt a paused command with `C-c` and `is_input=true`. An
  // interactive `sh` that takes the SIGINT abandons the rest of the wrapper's line, so the paused call's end frame never
  // prints. The shell reaches the next call's line only once the paused one is done, so that call's frame closes the
  // paused call — with no exit status of its own (OQ-147's reading, confirmed 2026-10-06 by R-071), never the next call's — and what the paused call
  // collected ends where the next call begins: before the repair the poll read the later calls' marker frames and the
  // PD-TOOLS-001 snapshot's `__rot_b64__` lines, which encode the shell's whole environment, or "still running" forever.
  it.skipIf(PS)('REQ-TOOLS-098/127/179 (A10): a soft-paused command interrupted with C-c is closed by the next call, with no status borrowed and nothing of the later calls or the snapshot in its poll', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      const aaa = await t.execute(args({ command: SH.echo('AAA'), timeout: 15 }), ctx());
      expect(output(aaa.text)).toBe('AAA');
      // OQ-164: the call that closed it reports the paused command's end, with no status borrowed from its own exit, and
      // nothing of its own output, the later calls or the snapshot in what it carries of the paused command.
      expect(String(diag(aaa.text)['detail'])).toContain('with no exit status of its own');
      expect(String(diag(aaa.text)['detail'])).not.toMatch(/sleep.*with exit code/);
      for (const leaked of ['__rot_', 'AAA', 'BBB', 'done-later', '__rot_b64__']) expect(earlierOutput(aaa.text)).not.toContain(leaked);
      expect(aaa.text).not.toContain('__rot_');
      const bbb = await t.execute(args({ command: SH.echo('BBB'), timeout: 15 }), ctx());
      expect(output(bbb.text)).toBe('BBB');
      // Reported once: BBB says nothing of it.
      expect(String(diag(bbb.text)['detail'])).toBe('The command exited with code 0.');
      // The paused call was handed over once; there is nothing left to poll.
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
    } finally { await m.dispose(); }
  }, 60_000);

  // docs/defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md: REQ-TOOLS-098's advice is to poll
  // or to interrupt with `C-c` and `is_input=true`. The interrupt makes an interactive `sh` abandon the rest of the wrapper's
  // line, so the paused call's end frame never prints, and before the repair nothing else in the stream said the line was
  // done: every poll between the interrupt and the next command read −1, `soft_pause`, "The process may still be running",
  // over a process that had died. A poll after an interrupt now hands the call over as OQ-147's reading, confirmed 2026-10-06 by R-071, reports it.
  it.skipIf(PS)('REQ-TOOLS-098/179 (OQ-147): a poll after C-c reports the interrupted command as ended, not as still running, and leaves the session answering', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const session = m.session('s1:orchestrator', root);
      let tapped = '';
      const untap = session.onOutput((chunk) => { tapped += chunk; });
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_500));
      const poll = await t.execute(args({ command: '' }), ctx());
      untap();
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'execution_error' });
      expect(poll.text).toContain('without an exit status of its own');
      expect(poll.text).not.toContain('may still be running');
      for (const leaked of ['__rot_', 'done-later', "printf '%s"]) expect(poll.text).not.toContain(leaked);
      // The product's own line that found the end is in neither the poll nor the live stream (live-run L9).
      expect(tapped).not.toContain('__rot_');
      // The paused call was handed over once, and the session answers the next command with its own output alone.
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('after');
      // The terminal window's interrupt (REQ-SHELL-093) sent AFTER the soft pause is the same interrupt, and a poll after it
      // finds the end the same way. Sent while the call still runs, it is the case "… the terminal window's interrupt while
      // the call still runs …" below.
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(m.streams.interrupt(foregroundStreamId('orchestrator')).ok).toBe(true);
      await new Promise((res) => setTimeout(res, 1_000));
      const windowPoll = await t.execute(args({ command: '' }), ctx());
      expect(diag(windowPoll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'execution_error' });
      for (const leaked of ['__rot_', 'done-later']) expect(windowPoll.text).not.toContain(leaked);
    } finally { await m.dispose(); }
  }, 60_000);

  // The other half of that repair: the no-op line is written only once the shell holds its terminal again. A program that
  // survives the interrupt and reads its input — here a child `sh` that ignores SIGINT and waits in `read` — keeps the
  // terminal, so the poll after the `C-c` answers "still running" and writes nothing: a line written then would have been
  // that program's input (`got:printf …`), and the agent's own answer would have gone to the shell as a command.
  it.skipIf(PS)('REQ-TOOLS-096/098 (OQ-147): a poll after C-c writes nothing into a program that survived the interrupt and still reads its input', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `sh -c 'trap "" INT; read line; printf "got:%s\\n" "$line"'` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_000));
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
      expect(diag((await t.execute(args({ command: 'hello\r', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_000));
      const answered = await t.execute(args({ command: '' }), ctx());
      expect(diag(answered.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(answered.text)).toContain('got:hello');
      expect(answered.text).not.toContain('__rot_');
    } finally { await m.dispose(); }
  }, 60_000);

  // OQ-168 (ruled 2026-10-06, R-071): only where the host says the shell holds its terminal again (Linux's
  // `/proc`) does a poll after an interrupt write the product's own no-op line. On Windows and macOS nothing says who holds
  // it, and before the ruling the poll wrote the line whatever held the terminal; now it writes nothing and says the command
  // may have ended and that the next command reports how. This host is Linux, so the session is told it runs on the other
  // host (`TerminalManagerDeps.platform`) and the same PTY and shell exercise that branch.
  it('OQ-168: only Linux can say whether the shell holds its terminal; Windows and macOS cannot', () => {
    expect(shellHoldsTerminal(process.pid, 'win32')).toBeNull();
    expect(shellHoldsTerminal(process.pid, 'darwin')).toBeNull();
  });

  it.skipIf(PS).each(['win32', 'darwin'] as const)('REQ-TOOLS-096/098 (OQ-168, ruled): on %s a poll after C-c writes nothing, says the command may have ended, and the next command reports how it ended', async (platform) => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined, platform });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const session = m.session('s1:orchestrator', root);
      let tapped = '';
      const untap = session.onOutput((chunk) => { tapped += chunk; });
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_500));
      const poll = await t.execute(args({ command: '' }), ctx());
      untap();
      // Still the soft pause, in the ruling's words, and nothing of the product's own reached the session.
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
      // The ruling's sentence leads; with an empty capture REQ-TOOLS-098's explanation follows it whole, and with output (the
      // echoed `^C`) nothing says the command is still running.
      const detail = String(diag(poll.text)['detail']);
      expect(detail.startsWith(`${INTERRUPT_UNSEEN_NOTE} `)).toBe(true);
      if (output(poll.text) === '(no output)') for (const kept of ['stdout and stderr are both captured', 'The process may still be running', 'Poll by calling the tool again with an empty command, or interrupt by sending C-c with is_input=true.']) expect(detail).toContain(kept);
      else expect(detail).not.toContain('is still running');
      expect(String(diag((await t.execute(args({ command: '' }), ctx())).text)['detail'])).toContain('The process may still be running');
      expect(poll.text).not.toContain('without an exit status of its own');
      expect(tapped).not.toContain('__rot_');
      // A second poll says the same: no line is ever written for it.
      expect(String(diag((await t.execute(args({ command: '' }), ctx())).text)['detail']).startsWith(INTERRUPT_UNSEEN_NOTE)).toBe(true);
      // The next command reports how the paused one ended, beside its own outcome.
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(String(diag(next.text)['detail'])).toContain('with no exit status of its own');
      expect(output(next.text)).toContain('after');
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
    } finally { await m.dispose(); }
  }, 60_000);

  it.skipIf(PS)('REQ-TOOLS-096/098 (OQ-168, ruled): on Windows a poll after C-c writes nothing into a program that survived the interrupt and still reads its input', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined, platform: 'win32' });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `sh -c 'trap "" INT; read line; printf "got:%s\\n" "$line"'` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_000));
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
      expect(String(diag(poll.text)['detail']).startsWith(INTERRUPT_UNSEEN_NOTE)).toBe(true);
      expect(diag((await t.execute(args({ command: 'hello\r', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, 1_000));
      const answered = await t.execute(args({ command: '' }), ctx());
      expect(diag(answered.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(answered.text)).toContain('got:hello');
      expect(answered.text).not.toContain('__rot_');
    } finally { await m.dispose(); }
  }, 60_000);

  // The repair's first verification (2026-10-01): the terminal window's interrupt (REQ-SHELL-093) can arrive while the call
  // still RUNS — the natural moment for a user watching a long command — and the shell abandons the wrapper's line just as
  // it does under a paused call. Only the paused call was marked, so the running call waited out the no-output window and
  // soft-paused over a dead process, every poll after it reading "still running", or, given a timeout, waited out the
  // hard cap and reset the session — shell state lost — for a process that had died at the interrupt. A call interrupted
  // while it runs now ends there, with OQ-147's reading (confirmed 2026-10-06 by R-071), once the shell holds its terminal again.
  it.skipIf(PS)('REQ-SHELL-093/REQ-TOOLS-098/179 (OQ-147): the terminal window\'s interrupt while the call still runs ends it with OQ-147\'s reading, neither a soft pause nor a wait for the hard cap', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 4_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 4_000 });
    const interruptAfter = (ms: number) => setTimeout(() => { m.streams.interrupt(foregroundStreamId('orchestrator')); }, ms);
    try {
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_KEPT', 'kept'), timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      const session = m.session('s1:orchestrator', root);
      let tapped = '';
      const untap = session.onOutput((chunk) => { tapped += chunk; });
      // No timeout: the interrupt at 0.8 s, well inside the 4 s no-output window.
      let began = clocks.monotonic.now() as number;
      interruptAfter(800);
      const open = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx());
      expect(diag(open.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(open.text)).toMatchObject({ exit_code: -1, outcome_kind: 'execution_error' });
      expect(open.text).toContain('without an exit status of its own');
      expect((clocks.monotonic.now() as number) - began).toBeLessThan(4_000);
      // The diagnostic names the command the agent sent; what the call captured holds nothing of the product's own line.
      expect(open.text).not.toContain('__rot_');
      for (const leaked of ['done-later', "printf '%s"]) expect(output(open.text)).not.toContain(leaked);
      // A timeout of 8 s: the call ends at the interrupt, and the session is not reset under it.
      began = clocks.monotonic.now() as number;
      interruptAfter(1_000);
      const timed = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}`, timeout: 8 }), ctx());
      expect(diag(timed.text)).toMatchObject({ exit_code: -1, outcome_kind: 'execution_error' });
      expect(diag(timed.text)['kill_status'] ?? null).toBeNull();
      expect((clocks.monotonic.now() as number) - began).toBeLessThan(6_000);
      expect(timed.text).not.toContain('__rot_');
      for (const leaked of ['done-later', "printf '%s"]) expect(output(timed.text)).not.toContain(leaked);
      untap();
      // The product's own line that found the end is in no call's live stream (live-run L9).
      expect(tapped).not.toContain('__rot_');
      // Nothing was left to poll, and the shell that took both interrupts is the one that held the variable.
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
      const after = await t.execute(args({ command: SH.bracketVar('ROTARIS_KEPT'), timeout: 15 }), ctx());
      expect(output(after.text)).toBe('[kept]');
      expect(diag(after.text)['session_reinitialized'] ?? false).toBe(false);
    } finally { await m.dispose(); }
  }, 60_000);

  // The other ordering of the same finding: the interrupt reaches the running call, but the program it interrupts lives on
  // past the soft pause — here a child `sh` that runs an INT trap for 4 s and then dies of the interrupt, so the shell
  // abandons the line only after the pause. The interrupt is carried into the paused call, and the poll after the program
  // died finds the line's end as it does for a C-c sent after the pause.
  it.skipIf(PS)('REQ-SHELL-093/REQ-TOOLS-098 (OQ-147): an interrupt that reached the call before its soft pause is carried into the paused call, and a poll after the program died reads it as ended', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      setTimeout(() => { m.streams.interrupt(foregroundStreamId('orchestrator')); }, 500);
      const paused = await t.execute(args({ command: `sh -c 'trap "sleep 4; trap - INT; kill -INT $$" INT; while :; do sleep 0.1; done'; ${SH.echo('done-later')}` }), ctx());
      expect(diag(paused.text)['outcome_kind']).toBe('soft_pause');
      await new Promise((res) => setTimeout(res, 5_000));
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'execution_error' });
      for (const leaked of ['__rot_', 'done-later']) expect(poll.text).not.toContain(leaked);
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(output(next.text)).toBe('after');
    } finally { await m.dispose(); }
  }, 60_000);

  // The repair's first verification, optional finding VS1: a poll made at once after the C-c — no model round trip between
  // them — met a shell that had not taken its terminal back yet and answered "still running". The poll now waits a short,
  // bounded while (`INTERRUPT_SETTLE_MS`) for the shell to hold its terminal before it looks for the line's end.
  it.skipIf(PS)('REQ-TOOLS-098/179 (OQ-147): a poll made at once after C-c reads the interrupted command as ended', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const session = m.session('s1:orchestrator', root);
      session.sendInput('\x03');
      const poll = await session.poll();
      expect(poll.softPaused).toBe(false);
      expect(poll.exitCode).toBe(-1);
      expect(poll.error).toContain('without an exit status of its own');
    } finally { await m.dispose(); }
  }, 30_000);

  // A10's second verification: the first repair cut the C-c'd call's capture at the next call's printed start marker, but
  // kept feeding the paused screen until the next call's END frame. A next call longer than the screen keeps
  // (`FOREGROUND_SCREEN_LINES`) scrolled that marker off, nothing was cut, and the poll read the next call's output, its
  // end frame and a false truncation. What the paused call collects now stops where the next call's start marker prints.
  it.skipIf(PS)('REQ-TOOLS-098/127 (A10): after C-c, a next call longer than the paused screen keeps adds nothing of its own to the paused call\'s poll', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      const long = await t.execute(args({ command: 'seq 1 20000', timeout: 30 }), ctx());
      expect(diag(long.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect((output(long.text) ?? '').trimEnd().endsWith('\n20000')).toBe(true);
      // OQ-164: the long call reports the paused command's end, and what it carries of that command holds nothing of its
      // own output, no end frame and no false truncation.
      expect(String(diag(long.text)['detail'])).toContain('with no exit status of its own');
      const paused = earlierOutput(long.text);
      for (const leaked of ['__rot_', '20000', '7503', 'done-later']) expect(paused).not.toContain(leaked);
      expect(long.text).not.toContain('__rot_');
      expect(long.text).not.toContain('since it was last observed (truncated)');
      expect(paused.split('\n').filter((l) => /^\d+$/.test(l.trim()))).toEqual([]);
    } finally { await m.dispose(); }
  }, 90_000);

  // A10's second verification: the line discipline echoes the next call's wrapper onto the paused call's screen, and a
  // wrapper wider than the screen (240 columns) wraps. Only the echo's FIRST row was dropped; its continuation rows — the
  // command's text and `printf '__rot_…_e:%s\n' "$?"` — reached the paused call's poll, on both roads: the paused
  // command ending on its own behind the next call (present on origin/main too), and the paused command interrupted.
  // Where `/bin/sh` is `bash` the same case failed on both roads' wide echo (`two-terminal-pty-tests-fail-on-main-in-this-environment`):
  // bash reads its input through readline, which on a `dumb` terminal scrolls a line wider than the screen sideways on one
  // row instead of wrapping it. The shell now starts with its line editor off (`posixShellArgs`), so the echo is the line
  // discipline's again, and a row an editor still draws is dropped (`ECHOED_POSIX_END`).
  // `width` past `POSIX_LINE_BYTES` makes the next call one the session stages in a script (live-run M1,
  // `ForegroundSession.carry`): what reaches the PTY is one short line, `. '<script>'` in the ordinary wrapper, written while
  // the paused command holds the terminal, and neither road's poll may carry a row of its echo.
  // FALSIFIED, kept beside its replacement (the rejected first carrier, 2026-10-06): "makes the next call's wrapper several
  // physical lines, and the shell's continuation prompt, printed once per line, stands between their echo and the next
  // call's start marker" — the backslash-continued lines overran the 4,096-byte input buffer behind the paused command and
  // their echo leaked into its poll, which is why the shipped carrier stages the command instead.
  const wideEchoCase = async (t: Awaited<ReturnType<typeof tool>>, width = 300): Promise<void> => {
    const wide = 'Q'.repeat(width);
    await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
    // Road one: the paused command ends on its own, behind the wide call.
    expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
    // The call's own output wraps at the screen's width like any other line the screen keeps.
    const next = await t.execute(args({ command: SH.echo(wide), timeout: 15 }), ctx());
    expect((output(next.text) ?? '').replace(/\n/g, '')).toBe(wide);
    // OQ-164: the wide call reports the paused command's end; what it carries of it holds no row of the wide call's echo.
    expect(String(diag(next.text)['detail'])).toMatch(/that command ended .* with exit code 0\./);
    expect(earlierOutput(next.text)).toBe('done-later');
    for (const leaked of ['__rot_', 'QQQ', '"$?"']) expect(earlierOutput(next.text)).not.toContain(leaked);
    expect(next.text).not.toContain('__rot_');
    // Road two: the paused command is interrupted, and the wide call closes it.
    expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
    expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
    const closing = await t.execute(args({ command: SH.echo(wide), timeout: 15 }), ctx());
    expect((output(closing.text) ?? '').replace(/\n/g, '')).toBe(wide);
    expect(String(diag(closing.text)['detail'])).toContain('with no exit status of its own');
    for (const leaked of ['__rot_', 'QQQ', '"$?"', 'done-later']) expect(earlierOutput(closing.text)).not.toContain(leaked);
    expect(closing.text).not.toContain('__rot_');
  };
  it.skipIf(PS)('REQ-TOOLS-127 (A10): the echo of a next call wider than the screen reaches neither road\'s poll of the paused call', async () => {
    const { m, t } = await posixSession(shell!.file);
    try { await wideEchoCase(t); } finally { await m.dispose(); }
  }, 90_000);
  it.runIf(bashAsSh !== null)('REQ-TOOLS-127 (A10): under bash as `/bin/sh`, the echo of a next call wider than the screen reaches neither road\'s poll of the paused call, and the shell\'s line editor is off', async () => {
    const { m, t } = await posixSession(bashAsSh!);
    try {
      const options = output((await t.execute(args({ command: 'set -o', timeout: 15 }), ctx())).text);
      expect(options).toMatch(/^emacs\s+off$/m);
      expect(options).toMatch(/^vi\s+off$/m);
      await wideEchoCase(t);
    } finally { await m.dispose(); }
  }, 90_000);

  // fin15's verification, 2026-10-04: the display narrows the PTY (REQ-TOOLS-128, down to REQ-SHELL-100's 20 columns),
  // and below 34 columns every frame wraps. Under dash at 20 columns each call's capture carried its own frames broken
  // across rows, and a paused call's poll carried its own end frame or the next call's start frame.
  it.skipIf(PS)('REQ-TOOLS-097/127/128: at the display\'s 20-column floor a call\'s capture and a paused call\'s poll carry no frame and no echo', async () => {
    const { m, t } = await posixSession(shell!.file, { cols: 20 });
    try {
      const own = await t.execute(args({ command: `${SH.echo('ready')}; ${SH.echo('ready2')}`, timeout: 15 }), ctx());
      expect(diag(own.text)['exit_code']).toBe(0);
      expect(output(own.text)).toBe('ready\nready2');
      await wideEchoCase(t);
    } finally { await m.dispose(); }
  }, 90_000);
  // docs/defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md, through a real PTY: below
  // 76 columns the snapshot's rows wrap, and the reset restored a spliced environment and named it restored.
  it.skipIf(PS)('PD-TOOLS-001, REQ-TOOLS-128: at 20 and 40 columns a hard-timeout reset restores the directory and every exported variable whole', async () => {
    const dir = join(root, 'narrow-cwd');
    mkdirSync(dir, { recursive: true });
    for (const cols of [20, 40]) {
      const { m, t } = await posixSession(shell!.file, { cols });
      try {
        const value = `hello-there-${'v'.repeat(90)}-${cols}`;
        expect(diag((await t.execute(args({ command: `cd '${dir}' && ${SH.setVar('ROTARIS_NARROW', value)}`, timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
        const r = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx());
        expect(diag(r.text)).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
        expect(r.text).toContain('were restored');
        const after = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_NARROW')}; pwd; printf '%s\\n' "$PATH" "$HOME"; command -v sleep`, timeout: 15 }), ctx());
        expect(diag(after.text)['exit_code']).toBe(0);
        // The capture is read off a 20-column screen too, so its rows are rejoined before they are compared.
        const lines = (output(after.text) ?? '').split('\n');
        const joined = lines.join('');
        expect(joined).toContain(`[${value}]`);
        expect(joined).toContain(`${dir}`);
        expect(joined).toContain(process.env['PATH'] ?? '');
        expect(joined).toContain(process.env['HOME'] ?? '');
        expect(joined).toMatch(/\/sleep$/);
      } finally { await m.dispose(); }
    }
  }, 90_000);
  // PD-TOOLS-001's PowerShell capture and restore over a real PTY, first run on a Windows host 2026-10-15 (Windows 11 ARM64,
  // the session's B2): the POSIX case above at the widths the display may give, a directory and a `Path` wider than the
  // screen, a value of 600 characters, a non-ASCII one, one PowerShell would read as code, and a spawn variable the
  // command removed. The environment and the directory are dumped from inside the shell before the hard cap and after
  // the reset, and compared here.
  it.runIf(PS)('PD-TOOLS-001, REQ-TOOLS-099/128: at every width from 34 to 240 columns a hard-timeout reset restores PowerShell\'s directory and environment byte for byte', async () => {
    let dir = join(root, 'ps-wide-cwd');
    while (dir.length < 170) dir = join(dir, 'segment-of-a-long-directory');
    mkdirSync(dir, { recursive: true });
    const dumps = join(root, 'ps-dumps');
    mkdirSync(dumps, { recursive: true });
    const dumpOf = (tag: string) =>
      `Get-ChildItem Env: | Sort-Object Name | ForEach-Object { $_.Name + '=' + $_.Value } | Set-Content -LiteralPath '${join(dumps, `${tag}.env`)}' -Encoding utf8; `
      + `Set-Content -LiteralPath '${join(dumps, `${tag}.cwd`)}' -Value (Get-Location).Path -Encoding utf8`;
    const read = (tag: string): { env: Map<string, string>; cwd: string } => {
      const text = (f: string) => readFileSync(join(dumps, f), 'utf8').replace(/^\uFEFF/, '');
      const env = new Map<string, string>();
      for (const line of text(`${tag}.env`).split(/\r?\n/)) { const eq = line.indexOf('='); if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1)); }
      return { env, cwd: text(`${tag}.cwd`).replace(/\r?\n$/, '') };
    };
    const dummies = Array.from({ length: 24 }, (_, i) => `C:\\Program Files\\Tool${i + 1}\\bin`).join(';');
    const nonAscii = 'héllo-ü-日本-€';
    const asCode = "O'Brien $(whoami) `tick";
    // From 34 columns: below that every PowerShell call runs to its hard cap
    // (docs/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md), so 20 and 33 are owed to its repair.
    for (const cols of [34, 40, 64, 75, 76, 77, 120, 240]) {
      const { m, t } = await backendSession(shell!, { cols, env: { ROTARIS_SPAWN_ONLY: 'present' } });
      try {
        const setup = await t.execute(args({ command: `Set-Location -LiteralPath '${dir}'; $env:Path = '${dummies};' + $env:Path; `
          + `$env:ROTARIS_NONASCII = '${nonAscii}'; $env:ROTARIS_LONG = 'v' * 600; $env:ROTARIS_ASCODE = '${asCode.replace(/'/g, "''")}'; `
          + `Remove-Item Env:ROTARIS_SPAWN_ONLY; ${dumpOf(`before-${cols}`)}`, timeout: 15 }), ctx());
        expect(diag(setup.text)['exit_code'], `setup at ${cols}`).toBe(0);
        // The capture is the product's own command read off this width's screen, and it parses whole.
        const captured = await t.execute(args({ command: snapshotCommand(shell!), timeout: 15 }), ctx());
        expect(parseSnapshot(output(captured.text) ?? '', 'powershell'), `parse at ${cols}`).not.toBeNull();
        const r = await t.execute(args({ command: "Start-Sleep -Seconds 20; Write-Output 'late'", timeout: 1 }), ctx());
        expect(diag(r.text), `reset at ${cols}`).toMatchObject({ exit_code: 124, failure_kind: 'timeout', kill_status: 'session_reset' });
        expect(r.text, `reset at ${cols}`).toContain('were restored');
        const after = await t.execute(args({ command: `${dumpOf(`after-${cols}`)}; (Get-Command cmd.exe).Source; cmd /c ver`, timeout: 15 }), ctx());
        expect(diag(after.text), `after at ${cols}`).toMatchObject({ exit_code: 0, session_reinitialized: true });
        const before = read(`before-${cols}`);
        const restored = read(`after-${cols}`);
        expect(restored.cwd, `cwd at ${cols}`).toBe(dir);
        // A Windows variable's name is matched without case: the spawn environment spells `Path` or `PATH` by whoever made it.
        const pathName = [...before.env.keys()].find((k) => k.toLowerCase() === 'path')!;
        expect(before.env.get(pathName)!.startsWith(dummies), `Path at ${cols}`).toBe(true);
        for (const name of [pathName, 'ROTARIS_NONASCII', 'ROTARIS_LONG', 'ROTARIS_ASCODE']) {
          const value = restored.env.get(name);
          expect(value, `${name} at ${cols}`).toBe(before.env.get(name));
          expect(value ?? '', `${name} at ${cols}`).not.toMatch(/[\r\n]/);
        }
        expect(restored.env.get('ROTARIS_NONASCII')).toBe(nonAscii);
        expect(restored.env.get('ROTARIS_ASCODE')).toBe(asCode);
        expect(restored.env.get('ROTARIS_LONG')).toBe('v'.repeat(600));
        expect(restored.env.has('ROTARIS_SPAWN_ONLY'), `spawn-only at ${cols}`).toBe(false);
        // Every other variable survives the reset as it stood.
        // One exclusion, under Windows PowerShell 5.1 only: the product's own empty `PSModuleAnalysisCachePath` (the spawn
        // environment's) reads present before the reset and absent after
        // (docs/defects/windows-powershell-5-1-loses-the-spawn-environments-empty-psmoduleanalysiscachepath-across-a-reset.md).
        const excluded = /pwsh\.exe$/i.test(shell!.file) ? [] : ['PSModuleAnalysisCachePath'];
        const lost = [...before.env.keys()].filter((k) => !excluded.includes(k) && restored.env.get(k) !== before.env.get(k));
        const gained = [...restored.env.keys()].filter((k) => !before.env.has(k));
        expect({ lost, gained }, `variables at ${cols}`).toEqual({ lost: [], gained: [] });
      } finally { await m.dispose(); }
    }
  }, 240_000);
  // fin15's verification: where a startup file turns bash's readline back on, the sideways row it draws of the next call's
  // wrapper is too narrow below about 50 columns to carry the whole end statement, and it reached the interrupted call's
  // poll at 40 columns (`scrolledEcho` reads its tail).
  it.runIf(bashAsSh !== null)('REQ-TOOLS-127/128 (A10): under bash as `/bin/sh` with its line editor turned back on by `$ENV`, no width lets the echo of a next call reach the paused call\'s poll', async () => {
    const envFile = join(root, 'editor-on.sh');
    writeFileSync(envFile, 'set -o emacs\n');
    for (const cols of [20, 40, 240]) {
      const { m, t } = await posixSession(bashAsSh!, { env: { ENV: envFile }, cols });
      try {
        expect(output((await t.execute(args({ command: 'set -o', timeout: 15 }), ctx())).text)).toMatch(/^emacs\s+on$/m);
        await wideEchoCase(t);
      } finally { await m.dispose(); }
    }
  }, 240_000);

  /**
   * ADR-0020's second first execution, 2026-09-12: four defects a real 22-minute run found. Each proof
   * below was RED against the code that run exercised.
   */
  it('REQ-TOOLS-097/099, REQ-CONFIG-116: a call that supplies NO timeout is still bounded by runtime.shell_command_timeout', async () => {
    // REQ-TOOLS-097's two bounds hold TOGETHER and the first REACHED governs. This call names no `timeout`
    // of its own, so BOTH arm: a 1 s `runtime.shell_command_timeout` and the shared session's 1.5 s no-output
    // window. Both timers start in the same turn, so which one is nearer is fixed by the two numbers and not
    // by how quickly the shell answers — full-suite load delays both and cannot reorder them.
    const t1 = await tool({ commandTimeoutS: 1 });
    const r = await t1.execute(args({ command: `${SH.sleep(40)}; ${SH.echo('late')}` }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 124, timeout: true, failure_kind: 'timeout', kill_status: 'session_reset', outcome_kind: 'timeout', timeout_seconds: 1 });
    expect(r.text).toContain('the terminal session was forcibly restarted to terminate the process tree');
    expect(r.text).toContain('[partial_terminal_output]');
  }, 25_000);

  // The three proofs below name a `timeout`, which is the agent declaring how long it will wait and takes the
  // no-output window out of the picture (REQ-TOOLS-097). What they are about is the wrapper, the capture and the
  // marker, not the pause, and under full-suite load a real shell can take longer than the window to answer.
  it('REQ-TOOLS-097/179 (ADR-0020, amended): a multi-line command keeps its newlines, and the exit status still comes out of it', async () => {
    const t = await tool();
    const heredoc = PS ? '$t = @"\nLINE ONE\nLINE TWO\n"@\nWrite-Output $t' : 't="LINE ONE\nLINE TWO"\nprintf \'%s\\n\' "$t"';
    const here = await t.execute(args({ command: heredoc, timeout: 10 }), ctx());
    expect(diag(here.text)['exit_code']).toBe(0);
    expect(output(here.text)).toBe('LINE ONE\nLINE TWO');
    const loop = PS
      ? 'foreach ($i in 1..3) {\n  if ($i -eq 2) { Write-Output "two" }\n  else { Write-Output "n$i" }\n}'
      : 'for i in 1 2 3; do\n  if [ "$i" -eq 2 ]; then printf \'two\\n\'\n  else printf \'n%s\\n\' "$i"; fi\ndone';
    const block = await t.execute(args({ command: loop, timeout: 10 }), ctx());
    expect(diag(block.text)['exit_code']).toBe(0);
    expect(output(block.text)).toBe('n1\ntwo\nn3');
    // REQ-TOOLS-179: a native non-zero status and a failing cmdlet both still reach the observation.
    const native = await t.execute(args({ command: `${SH.echo('before')}\n${SH.exit(9)}`, timeout: 10 }), ctx());
    expect(diag(native.text)['exit_code']).toBe(9);
    expect(output(native.text)).toBe('before');
    const cmdlet = await t.execute(args({ command: `${SH.echo('before')}\n${SH.fails()}`, timeout: 10 }), ctx());
    expect(diag(cmdlet.text)['exit_code']).toBe(1);
    // A terminating error inside the payload returns its own failure rather than wedging until the hard cap.
    // A terminating error in PowerShell; a subshell that writes the same word and fails, in sh. Both must come
    // back as the payload's own failure rather than wedging the session until the hard cap.
    const raise = PS ? "Write-Output 'a'\nthrow 'boom'" : `${SH.echo('a')}\n(${SH.echoErr('boom')}; exit 1)`;
    const thrown = await t.execute(args({ command: raise, timeout: 10 }), ctx());
    expect(diag(thrown.text)['exit_code']).toBe(1);
    expect(output(thrown.text)).toContain('boom');
    // The tool's own promise: what a command sets persists into the next call, multi-line payload included.
    const keep = PS ? "$rotMulti = 'kept'\n$null = 1" : "rotMulti='kept'\n:";
    await t.execute(args({ command: keep, timeout: 10 }), ctx());
    const kept = PS ? 'Write-Output "[$rotMulti]"' : 'printf \'[%s]\\n\' "$rotMulti"';
    expect(output((await t.execute(args({ command: kept, timeout: 10 }), ctx())).text)).toBe('[kept]');
    // FALSIFIED, kept: "A single-line command keeps today's wrapper, byte for byte." A single line spliced raw lost its end
    // frame to a terminating or parse error (the case below); since 2026-10-15 one line takes the multi-line path too.
    expect(wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E')).toContain('FromBase64String');
  }, 60_000);

  // docs/defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md (Windows ARM64 session B3, 2026-10-15): on
  // one line, a terminating error abandoned the rest of the wrapper's line and a parse error ran none of it, so the end
  // frame never printed and a command that failed at once read as the hard timeout, 124, with its session reset.
  it.runIf(PS)('REQ-TOOLS-097/179: a single-line command that throws or does not parse ends with exit 1 and its own error, never at the hard cap, and the session keeps its state', async () => {
    const t = await tool();
    await t.execute(args({ command: "$env:ROTARIS_B3_KEPT = 'kept'", timeout: 10 }), ctx());
    const failing: [string, string | null][] = [
      ["Write-Output 'a'; throw 'boom'", 'boom'],
      ["throw 'boom'", 'boom'],
      ["Write-Error 'boom' -ErrorAction Stop", 'boom'],
      ["$ErrorActionPreference = 'Stop'; Get-Item C:\\definitely\\not\\here.txt", 'here.txt'],
      // A line that does not parse: nothing of it runs, and the parser's own message is the output.
      ["Write-Output 'x'; if (", null],
    ];
    for (const [command, says] of failing) {
      const started = performance.now();
      const r = await t.execute(args({ command, timeout: 10 }), ctx());
      expect(performance.now() - started, command).toBeLessThan(5_000);
      expect(diag(r.text), command).toMatchObject({ exit_code: 1, outcome_kind: 'shell_failure' });
      expect(diag(r.text)['kill_status'], command).toBeUndefined();
      if (says !== null) expect(output(r.text), command).toContain(says);
      else expect((output(r.text) ?? '').trim(), command).not.toBe('');
      // A parse error names the command alone, never the flag's line appended after it.
      if (says === null) expect(output(r.text), command).not.toContain('_ok = $?');
      // pwsh's concise error view names the command, never the wrapper around it. Windows PowerShell 5.1's error record
      // quotes the wrapper's line and the script block's text however the command is carried
      // (docs/defects/windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md), so that half is pwsh's only.
      if (/pwsh\.exe$/i.test(shell!.file)) {
        expect(output(r.text), command).not.toContain('LASTEXITCODE');
        expect(output(r.text), command).not.toContain('__rot_');
      }
    }
    // Nothing was reset: what the session set before the failures is still set, and the session was not reinitialized.
    const kept = await t.execute(args({ command: "$ErrorActionPreference = 'Continue'; Write-Output \"[$env:ROTARIS_B3_KEPT]\"", timeout: 10 }), ctx());
    expect(output(kept.text)).toBe('[kept]');
    expect(diag(kept.text)['session_reinitialized']).not.toBe(true);
  }, 60_000);

  // docs/defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md (live-run M1, 2026-10-06):
  // the POSIX wrapper was ONE physical line of any length, and the shell reads it through the PTY's canonical-mode line
  // discipline, which keeps 4,095 characters of a line on Linux (termios(3)) and 1,024 on macOS. A 3,700-character heredoc
  // wrapped to about 4,304 bytes reached the shell cut with its `'%b'` quote open: the shell stood on its continuation
  // prompt, the command never ran, and the call read as a soft pause, exit −1, with `>` for its output.
  // Where this test's session staged its long commands (`ForegroundSession.carry`), read off the session.
  let stagedAt: string | null = null;
  const staging = (m: TerminalManager): string | null => {
    stagedAt = (m.session(`${ctx().sessionId}:${ctx().agentName}`, root) as unknown as { stagingDir: string | null }).stagingDir;
    return stagedAt;
  };
  const longCase = async (m: TerminalManager, t: Awaited<ReturnType<typeof tool>>, label: string) => {
    const file = join(root, `long-${label}.txt`);
    // Quotes, backslashes, `$`, a `%`, and multi-byte characters, so a cut inside an escape or a character would show.
    const body = Array.from({ length: 90 }, (_, i) => `line ${String(i).padStart(2, '0')}: it's \\ "q" $HOME % é 中 ${'x'.repeat(10)}`);
    const text = `${body.join('\n')}\n`;
    const heredoc = `cat > '${file}' <<'EOF'\n${text}EOF\nrotLong='${label}-kept'\nwc -c < '${file}'`;
    expect(Buffer.byteLength(wrapCommand({ kind: 'posix', file: '/bin/sh' }, heredoc, '__rot_0123456789abcdef01234567_s', '__rot_0123456789abcdef01234567_e'))).toBeGreaterThan(4_096);
    const multi = await t.execute(args({ command: heredoc, timeout: 15 }), ctx());
    expect(diag(multi.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
    expect(readFileSync(file, 'utf8')).toBe(text);
    expect(output(multi.text)).toBe(String(Buffer.byteLength(text)));
    expect(multi.text).not.toContain('__rot_');
    // The staged script removed itself once the shell had read it.
    expect(readdirSync(staging(m)!)).toEqual([]);
    // The single-line path has the same cap: a one-line command past it.
    const wide = `${'y'.repeat(2_500)}'${'z'.repeat(2_500)}`;
    const single = await t.execute(args({ command: `printf '%s' '${wide.replace(/'/g, `'\\''`)}' | wc -c`, timeout: 15 }), ctx());
    expect(diag(single.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
    expect(output(single.text)).toBe(String(wide.length));
    // What the long command set persists into the next call, and its own status still comes out of it.
    expect(output((await t.execute(args({ command: 'printf \'[%s]\\n\' "$rotLong"', timeout: 15 }), ctx())).text)).toBe(`[${label}-kept]`);
    const failing = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\n(exit 7)`, timeout: 15 }), ctx());
    expect(diag(failing.text)['exit_code']).toBe(7);
    // A long call queued behind a soft-paused one: neither road's poll of the paused call carries a row of the staged line's
    // echo. (The rejected continuation-line carrier also put a continuation prompt per line before its start marker; the
    // staged line is one short line and puts none.)
    await wideEchoCase(t, 6_000);
  };
  it.skipIf(PS)('REQ-TOOLS-096/098/179 (live-run M1): a command whose wrapper is longer than the PTY\'s input line reaches the shell whole', async () => {
    const { m, t } = await posixSession(shell!.file);
    try { await longCase(m, t, 'sh'); } finally { await m.dispose(); }
    // The staging directory goes with the session.
    expect(stagedAt).not.toBeNull();
    expect(existsSync(stagedAt!)).toBe(false);
  }, 90_000);
  it.runIf(bashAsSh !== null)('REQ-TOOLS-096/098/179 (live-run M1): under bash as `/bin/sh`, a command whose wrapper is longer than the PTY\'s input line reaches the shell whole', async () => {
    const { m, t } = await posixSession(bashAsSh!);
    try { await longCase(m, t, 'bash'); } finally { await m.dispose(); }
  }, 90_000);
  it.skipIf(PS)('REQ-TOOLS-096 (live-run M1): at the display\'s 20-column floor, a long command\'s capture carries no echo of its wrapper', async () => {
    const { m, t } = await posixSession(shell!.file, { cols: 20 });
    try { await longCase(m, t, 'narrow'); } finally { await m.dispose(); }
  }, 90_000);

  // The fin23 verifier's optional finding: a staging that throws (an unwritable temporary directory, a full disk) threw out
  // of the call after its state was set, which could leave the session waiting on a line it never wrote. It is now an
  // `execution_error` that never ran, and the session takes the next call as before.
  it.skipIf(PS)('REQ-TOOLS-096 (live-run M1): a long command that cannot be staged is an execution_error and leaves the session usable', async () => {
    const { m, t } = await posixSession(shell!.file);
    const saved = process.env['TMPDIR'];
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      process.env['TMPDIR'] = join(root, 'no-such-temporary-directory');
      const refused = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\nprintf 'ran\\n'`, timeout: 15 }), ctx());
      expect(diag(refused.text)).toMatchObject({ outcome_kind: 'execution_error', failure_kind: 'execution_error' });
      expect(refused.text).toContain('could not be staged in a script');
      expect(output(refused.text) ?? '').not.toContain('ran');
      if (saved === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = saved;
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('after');
      const long = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\nprintf 'ran\\n'`, timeout: 15 }), ctx());
      expect(diag(long.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(long.text)).toBe('ran');
    } finally {
      if (saved === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = saved;
      await m.dispose();
    }
  }, 60_000);

  it('ADR-0021 / REQ-TOOLS-097/113: the capture is the emulated screen, not a VT strip', async () => {
    const t = await tool();
    // ConPTY expresses a tab stop as a cursor-forward sequence; deleting it ran the columns together.
    const tabs = await t.execute(args({ command: PS ? "Write-Host ('a' + [char]9 + 'b')" : "printf 'a\\tb\\n'", timeout: 10 }), ctx());
    expect(output(tabs.text)).toBe('a       b');
    // A screen clear is a screen clear, not the rows of the screen left behind as blank lines.
    const clear = PS ? 'Clear-Host' : "printf '\\033[2J\\033[H'";
    const cleared = await t.execute(args({ command: `${SH.echo('BEFORE')}; ${clear}; ${SH.echo('AFTER')}`, timeout: 10 }), ctx());
    expect(output(cleared.text)).toBe('AFTER');
    // The 2026-09-12 run's OWN symptom, reproduced: an EMPTY write between two non-empty ones. The strip
    // returned `Total Endpoints: 0Resource Sections: 0File Size: 58 KB` — the production string byte for
    // byte, from a command carrying no newline at all. This is the trigger, and the one the 60 runs above
    // missed; see this ADR's note, where the reading it falsifies is kept beside it.
    const empties = await t.execute(args({ command: [SH.echo('Total Endpoints: 0'), SH.echo(''), SH.echo('Resource Sections: 0'), SH.echo(''), SH.echo('File Size: 58 KB')].join('; '), timeout: 10 }), ctx());
    expect(output(empties.text)).not.toContain('Total Endpoints: 0Resource Sections: 0');
    expect((output(empties.text) ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['Total Endpoints: 0', 'Resource Sections: 0', 'File Size: 58 KB']);
    // The same shape through `&&` and `echo`, which is how the run's other concatenation arrived.
    const chained = await t.execute(args({ command: 'echo "VERIFICATION: created successfully" && echo "" && echo "File exists:"', timeout: 10 }), ctx());
    expect(output(chained.text)).not.toContain('successfullyFile exists:');
    // A formatted table's rows stay on separate lines — true before this change and it must stay true.
    const file = join(root, 'measure.txt').replace(/\\/g, '\\\\');
    // PowerShell's own formatter produces the aligned rows; `printf` produces the same shape where there is no
    // `Measure-Object`. What is under test either way is that the rows reach the agent on separate lines.
    const measure = PS
      ? `Set-Content -LiteralPath '${file}' -Value 'alpha','beta','alpha'; Select-String 'alpha' -LiteralPath '${file}' | Measure-Object`
      : "printf 'Count             : 2\\nAverage           :\\nSum               :\\nMaximum           :\\nMinimum           :\\nProperty          :\\n'";
    const measured = await t.execute(args({ command: measure, timeout: 10 }), ctx());
    const rows = (output(measured.text) ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    // `Format-List` pads to its longest property: pwsh 7 lists `StandardDeviation`, Windows PowerShell 5.1 does not, so the
    // width is the shell's and the rows are what is under test
    // (`docs/defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
    expect(rows[0]).toMatch(/^Count +: 2$/);
    expect(rows.some((r) => /^Property +:$/.test(r))).toBe(true);
    // REQ-TOOLS-113's checks read the cleaned text, never the echoed command line.
    expect(diag(measured.text)['warnings']).toEqual([]);
  }, 40_000);

  it('ADR-0020 c.1: the end marker never reaches the agent, not even when the output does not end in a newline', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: SH.echoNoNewline('Property          : '), timeout: 10 }), ctx());
    expect(r.text).not.toContain('__rot_');
    expect(output(r.text)).toBe('Property          :');
    const c = await t.execute(args({ command: PS ? "[Console]::Write('tail-no-newline')" : SH.echoNoNewline('tail-no-newline'), timeout: 10 }), ctx());
    expect(c.text).not.toContain('__rot_');
    expect(output(c.text)).toBe('tail-no-newline');
  }, 30_000);

  // `a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced` (live-run finding a71-8, OQ-164): a new command
  // issued while an earlier one is soft-paused is queued behind it by the shell. Before the repair its observation said only
  // its own exit, and the paused command's end waited for a poll nobody made; a second soft pause replaced the first paused
  // call and its end was never reported at all. Its own session, window 1 s, so the timings are this case's.
  const pausedSession = async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }) };
  };
  it('REQ-TOOLS-098/179 (OQ-164): a command issued behind a still-running soft-paused one says it waited, and carries that command\'s end and output', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      const wedge = await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('wedge-done')}; ${SH.exit(5)}` }), ctx());
      expect(diag(wedge.text)['outcome_kind']).toBe('soft_pause');
      // Issued at once, with a timeout of its own: the shell runs it once the wedge ends, about two seconds later.
      const began = clocks.monotonic.now() as number;
      const behind = await t.execute(args({ command: SH.echo('behind'), timeout: 15 }), ctx());
      const took = (clocks.monotonic.now() as number) - began;
      expect(took).toBeGreaterThan(1_000);
      expect(diag(behind.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(behind.text)).toBe('behind');
      // Before the repair: "The command exited with code 0." and nothing of the wedge.
      const detail = String(diag(behind.text)['detail']);
      expect(detail).toMatch(/submitted while the soft-paused command `.*sleep.*` was still running/i);
      expect(detail).toMatch(/ended (\d+\.\d|under 0\.1) seconds? after this command was submitted, with exit code 5/);
      expect(behind.text).toContain('wedge-done');
      expect(behind.text).not.toContain('__rot_');
      // Handed over, so nothing waits for a poll.
      expect(String(diag((await t.execute(args({ command: '' }), ctx())).text)['detail'] ?? '')).not.toMatch(/exit code 5/);
    } finally { await m.dispose(); }
  }, 30_000);
  it('REQ-TOOLS-098/179 (OQ-164): a paused command that ended unpolled is reported by the next command, and a second soft pause no longer loses the first one\'s end', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      // Ended before the next command was issued, and never polled.
      expect(diag((await t.execute(args({ command: `${SH.sleep(2)}; ${SH.exit(6)}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      await new Promise((res) => setTimeout(res, 2_000));
      const next = await t.execute(args({ command: SH.echo('next'), timeout: 15 }), ctx());
      expect(output(next.text)).toBe('next');
      expect(String(diag(next.text)['detail'])).toMatch(/had ended (\d+\.\d|under 0\.1) seconds? before this command was submitted, with exit code 6/);
      // The worse case the code showed: a command issued behind a silent paused one, with no timeout, soft-pauses in turn.
      expect(diag((await t.execute(args({ command: `${SH.sleep(4)}; ${SH.exit(7)}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const queued = await t.execute(args({ command: SH.echo('queued') }), ctx());
      expect(diag(queued.text)['outcome_kind']).toBe('soft_pause');
      expect(String(diag(queued.text)['detail'])).toMatch(/still running: the shell has not started this command yet/);
      await new Promise((res) => setTimeout(res, 3_500));
      // Before the repair the first paused call was disposed by the second pause, and this poll said nothing of exit 7.
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)).toMatchObject({ exit_code: 0 });
      expect(output(poll.text)).toBe('queued');
      expect(String(diag(poll.text)['detail'])).toMatch(/ahead of the polled one ended (\d+\.\d|under 0\.1) seconds? ago, with exit code 7/);
    } finally { await m.dispose(); }
  }, 40_000);

  // The verifier's findings on the repair above (repair round 1). An interrupt (`C-c`) makes the terminal discard the input the
  // shell has not read, so a line queued behind the interrupted one never runs and its start marker never prints. The
  // interrupted call was closed only by a later call's END frame, its capture cut at a marker that never appeared, and the
  // next call carried its own start marker, its output and its end frame as the paused command's; the queued call read as
  // abandoned by the shell, and both as having made the next call wait.
  const carried = (text: string) => text.slice(0, text.indexOf('[terminal_output]')).split('\n').map((l) => l.trim());
  it.skipIf(PS)('REQ-TOOLS-098/127/179 (OQ-164, OQ-147): after C-c, a soft pause queued behind the interrupted one never ran, and the next call carries nothing of its own as the interrupted command\'s', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('wedge-done')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.echo('queued') }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      const next = await t.execute(args({ command: SH.echo('next'), timeout: 10 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('next');
      expect(next.text).not.toContain('__rot_');
      // Nothing of the next call's own in what it carries of the paused commands, and nothing of the wedge's line after the C-c.
      expect(carried(next.text)).not.toContain('next');
      expect(carried(next.text)).not.toContain('wedge-done');
      const detail = String(diag(next.text)['detail']);
      expect(detail).toMatch(/`sleep 20.*` .*with no exit status of its own/);
      expect(detail).toMatch(/`printf '%s\\n' 'queued'` never ran/);
      expect(detail).not.toContain('waited behind');
      expect(detail).not.toMatch(/queued.*abandoned the rest of its line/);
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
    } finally { await m.dispose(); }
  }, 40_000);

  // OQ-147 in the same arrangement: the interrupt marked the line the shell was running, and the poll looked for the end only
  // of the polled call, which is queued behind it, so no closer was ever written and every poll read "still running" over a
  // dead command and an idle prompt.
  it.skipIf(PS)('REQ-TOOLS-098/179 (OQ-147, OQ-164): a poll after C-c with a soft pause queued behind the interrupted one reads both as ended, not as still running', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('wedge-done')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.echo('queued') }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ outcome_kind: 'execution_error' });
      expect(diag(poll.text)['exit_code'] ?? null).toBeNull();
      expect(poll.text).not.toContain('still running');
      const detail = String(diag(poll.text)['detail']);
      expect(detail).toMatch(/`sleep 20.*` ahead of the polled one ended .*with no exit status of its own/);
      expect(detail).toContain('never ran');
      // The command labels name `wedge-done`; no line of output does.
      expect(poll.text).not.toContain('__rot_');
      expect(carried(poll.text)).not.toContain('wedge-done');
      expect(output(poll.text)).toBe('(no output)');
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
      const after = await t.execute(args({ command: SH.echo('after'), timeout: 10 }), ctx());
      expect(output(after.text)).toBe('after');
      expect(String(diag(after.text)['detail'])).toBe('The command exited with code 0.');
    } finally { await m.dispose(); }
  }, 40_000);

  // OQ-147/OQ-164, the verifier's finding on the repair above: the interrupt's mark went on the line the shell was running
  // only. A command that handles or ignores SIGINT ends on its own frame, the shell goes on, and the queued line — which the
  // same interrupt discarded — was left the only open paused call, unmarked: no poll wrote a closer, and every poll read it
  // "still running" over an idle prompt until the next command.
  it.skipIf(PS)('REQ-TOOLS-098/179 (OQ-147, OQ-164): after C-c, a command that survives the interrupt ends with its own status, and the soft pause queued behind it reads never run on the next poll', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      const ended = join(root, 'survived-interrupt.done');
      rmSync(ended, { force: true });
      const head = await t.execute(args({ command: `(trap '' INT; ${SH.sleep(5)}); ${SH.echo('a-done')}; : > '${ended}'` }), ctx());
      expect(diag(head.text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.echo('queued') }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      // The head ignores the interrupt and ends on its own, a few seconds later. No poll is made before: wait for its
      // file, then for its frame to reach the session, rather than for a time.
      const by = (clocks.monotonic.now() as number) + 15_000;
      while (!existsSync(ended)) {
        expect(clocks.monotonic.now() as number).toBeLessThan(by);
        await new Promise((res) => setTimeout(res, 50));
      }
      await new Promise((res) => setTimeout(res, 500));
      const poll = await t.execute(args({ command: '' }), ctx());
      const detail = String(diag(poll.text)['detail']);
      expect(detail).toMatch(/`\(trap '' INT; sleep 5\).*` ahead of the polled one ended .*with exit code 0/);
      expect(poll.text).toContain('a-done');
      // The queued line never ran: the same interrupt discarded it.
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ outcome_kind: 'execution_error' });
      expect(detail).toContain('never ran');
      expect(poll.text).not.toContain('still running');
      expect(poll.text).not.toContain('__rot_');
      expect(output(poll.text)).toBe('(no output)');
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
      const after = await t.execute(args({ command: SH.echo('after'), timeout: 10 }), ctx());
      expect(output(after.text)).toBe('after');
      expect(String(diag(after.text)['detail'])).toBe('The command exited with code 0.');
    } finally { await m.dispose(); }
  }, 40_000);

  // A poll of a call queued behind a paused one, before the shell has started it: its screen held the earlier command's
  // output, and with no start marker of its own on it the whole screen was handed over as the queued command's.
  it.skipIf(PS)('REQ-TOOLS-098 (OQ-164): a poll of a soft pause the shell has not started yet hands over nothing of the earlier command\'s as its own', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: `${SH.sleep(1.5)}; ${SH.echo('a1')}; ${SH.sleep(1.5)}; ${SH.echo('a2')}; ${SH.sleep(4)}; ${SH.echo('a3')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const queued = await t.execute(args({ command: SH.echo('queued') }), ctx());
      expect(diag(queued.text)['outcome_kind']).toBe('soft_pause');
      expect(output(queued.text)).toBe('(no output)');
      await new Promise((res) => setTimeout(res, 1_200));
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)['outcome_kind']).toBe('soft_pause');
      expect(String(diag(poll.text)['detail'])).toMatch(/has not started the polled command yet/);
      expect(output(poll.text)).toBe('(no output)');
      expect(earlierOutput(poll.text)).toContain('a2');
      expect(diag(poll.text)['output_truncated'] ?? null).toBeNull();
      // Once the earlier command ends and the shell runs the queued one, the poll reads the queued command's own output.
      await new Promise((res) => setTimeout(res, 5_000));
      const done = await t.execute(args({ command: '' }), ctx());
      expect(diag(done.text)).toMatchObject({ exit_code: 0 });
      expect(output(done.text)).toBe('queued');
      expect(earlierOutput(done.text)).toBe('a3');
      expect(String(diag(done.text)['detail'])).toMatch(/ahead of the polled one ended .* with exit code 0/);
    } finally { await m.dispose(); }
  }, 40_000);

  // The verifier's optional finding: a soft-paused command that ends the session's shell while a call waits behind it, or while
  // a soft pause is queued behind it. Neither line ever ran — the shell that would have read it is gone — and each is reported
  // so, with the shell respawned and PD-TOOLS-001's snapshot re-applied (OQ-144's shell-exit case).
  it.skipIf(PS)('REQ-TOOLS-098/100/103 (OQ-144, OQ-164): a soft-paused command that ends the shell ends a call waiting behind it as never run, and a soft pause queued behind it reads never run on its poll', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_KEPT', 'kept'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: 'sleep 2; exit 4' }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const behind = await t.execute(args({ command: SH.echo('behind'), timeout: 10 }), ctx());
      expect(diag(behind.text)).toMatchObject({ failure_kind: 'execution_error', outcome_kind: 'execution_error', kill_status: 'session_reset' });
      expect(diag(behind.text)).not.toHaveProperty('exit_code');
      const detail = String(diag(behind.text)['detail']);
      expect(detail).toContain('the session\'s shell ended before the command ran (a soft-paused command ahead of it ended the shell), so the command never ran');
      expect(detail).toMatch(/`sleep 2; exit 4` .*by ending the session's shell, with no exit code/);
      expect(output(behind.text)).toBe('(no output)');
      const next = await t.execute(args({ command: SH.bracketVar('ROTARIS_KEPT'), timeout: 10 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect(output(next.text)).toBe('[kept]');
      // A soft pause queued behind it: its poll hands it over as never run, and respawns the shell. `sleep 4`, so the queued
      // call's own 1 s window ends well before the shell does.
      expect(diag((await t.execute(args({ command: 'sleep 4; exit 4' }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.echo('queued') }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      await new Promise((res) => setTimeout(res, 3_000));
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset' });
      expect(diag(poll.text)).not.toHaveProperty('exit_code');
      expect(String(diag(poll.text)['detail'])).toContain('the session\'s shell ended before the command ran');
      expect(String(diag(poll.text)['detail'])).toMatch(/`sleep 4; exit 4` ahead of the polled one ended .*by ending the session's shell/);
      expect(output(poll.text)).toBe('(no output)');
      const after = await t.execute(args({ command: SH.bracketVar('ROTARIS_KEPT'), timeout: 10 }), ctx());
      expect(diag(after.text)).toMatchObject({ exit_code: 0 });
      expect(output(after.text)).toBe('[kept]');
    } finally { await m.dispose(); }
  }, 40_000);

  // The same discard in the other order: the terminal window's interrupt (REQ-SHELL-093) while a call waits behind a soft-paused
  // command. The interrupt reached the paused line and discarded the waiting call's, so that call could only wait out its
  // timeout and reset the session.
  it.skipIf(PS)('REQ-SHELL-093/REQ-TOOLS-098 (OQ-164, OQ-147): the window\'s interrupt while a call waits behind a soft-paused command ends that call as never run, at once, with no reset', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_KEPT', 'kept'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('wedge-done')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      setTimeout(() => { m.streams.interrupt(foregroundStreamId('orchestrator')); }, 700);
      const began = clocks.monotonic.now() as number;
      const waiting = await t.execute(args({ command: SH.echo('waiting'), timeout: 10 }), ctx());
      expect((clocks.monotonic.now() as number) - began).toBeLessThan(5_000);
      expect(diag(waiting.text)).toMatchObject({ outcome_kind: 'execution_error' });
      expect(diag(waiting.text)['exit_code'] ?? null).toBeNull();
      expect(diag(waiting.text)['kill_status'] ?? null).toBeNull();
      expect(String(diag(waiting.text)['detail'])).toContain('never ran');
      expect(String(diag(waiting.text)['detail'])).toMatch(/`sleep 20.*` .*with no exit status of its own/);
      expect(output(waiting.text)).toBe('(no output)');
      expect(waiting.text).not.toContain('__rot_');
      expect(carried(waiting.text)).not.toContain('wedge-done');
      const after = await t.execute(args({ command: SH.bracketVar('ROTARIS_KEPT'), timeout: 10 }), ctx());
      expect(output(after.text)).toBe('[kept]');
      expect(String(diag(after.text)['detail'])).toBe('The command exited with code 0.');
    } finally { await m.dispose(); }
  }, 40_000);

  // OQ-164's second verification: a soft pause queued behind a running one, closed by the session's reset before its line
  // ran, was reported as "submitted while … was still running, and waited behind it: that command ended … without having
  // run, the session's shell being gone before it" — a command that never ran called still running, and the shell blamed
  // where the reset ended it.
  it.skipIf(PS)('REQ-TOOLS-098/099 (OQ-164): a soft pause queued behind a running one that a reset closes is reported as never run, by the reset', async () => {
    const { m, t } = await pausedSession();
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('wedge-done')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.echo('q1') }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const r = await t.execute(args({ command: SH.echo('late'), timeout: 2 }), ctx());
      expect(diag(r.text)).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
      const detail = String(diag(r.text)['detail']);
      expect(detail).toMatch(/`sleep 20.*` .*when the terminal session was reset/);
      expect(detail).toContain("`printf '%s\\n' 'q1'` never ran, so it has no exit code: the terminal session was reset before its shell reached that line.");
      expect(detail).not.toMatch(/q1'` was still running/);
      expect(detail).not.toContain('the session\'s shell being gone');
    } finally { await m.dispose(); }
  }, 40_000);

  it('REQ-TOOLS-098: a call with no timeout that produces nothing for the no-output window returns −1 while the process keeps running; an empty command polls', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' });
    expect(diag(r.text)['failure_kind']).toBeUndefined();
    expect(r.text).toContain('No output for 1.5 seconds in the merged terminal stream; stdout and stderr are both captured.');
    expect(r.text).toContain('Poll by calling the tool again with an empty command');
    expect(r.text).not.toContain('re-run the command with 2>&1');
    await new Promise((res) => setTimeout(res, 3_500));
    const poll = await t.execute(args({ command: '' }), ctx());
    expect(output(poll.text)).toContain('done-later');
  }, 20_000);
  // Live-run L2: five polls in 21.6 s each said "No output for 30 seconds" after under a millisecond, and the model counted
  // thirty seconds a poll. A poll returns at once; what it states is what it measured.
  it('REQ-TOOLS-098 (live-run L2): an empty poll states the time it actually waited, not the no-output window it did not wait out', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: `${SH.sleep(4)}; ${SH.echo('late')}` }), ctx());
    expect(diag(r.text)['outcome_kind']).toBe('soft_pause');
    const t0 = performance.now();
    const poll = await t.execute(args({ command: '' }), ctx());
    const took = performance.now() - t0;
    expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
    expect(output(poll.text)).toBe('(no output)');
    expect(poll.text).not.toContain('No output for 1.5 seconds');
    const since = /No new output in (under 0\.1|\d+\.\d) seconds since the previous observation, and none for (\d+\.\d) seconds in the merged terminal stream; stdout and stderr are both captured\./.exec(poll.text);
    expect(since, poll.text).not.toBeNull();
    // What it states it waited is no more than the call took (plus the stated precision), and the silence is at least the window.
    if (since![1] !== 'under 0.1') expect(Number(since![1]) * 1000).toBeLessThanOrEqual(took + 100);
    expect(Number(since![2])).toBeGreaterThanOrEqual(1.5);
    expect(poll.text).toContain('The process may still be running. Poll by calling the tool again with an empty command, or interrupt by sending C-c with is_input=true.');
    await new Promise((res) => setTimeout(res, 3_000));
    const done = await t.execute(args({ command: '' }), ctx());
    expect(output(done.text)).toContain('late');
    expect(diag(done.text)['exit_code']).toBe(0);
  }, 20_000);
  it('REQ-TOOLS-127 (live-run L9): the tap a live stream reads carries what the command wrote, and none of the wrapper, the markers or the snapshot', async () => {
    const t = await tool();
    const session = manager!.session('s1:orchestrator', root);
    let tapped = '';
    const untap = session.onOutput((chunk) => { tapped += chunk; });
    const r = await t.execute(args({ command: `${SH.echo('first-line')}; ${SH.echo('second-line')}`, timeout: 15 }), ctx());
    untap();
    expect(output(r.text)).toBe('first-line\nsecond-line');
    expect(stripVt(tapped).split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['first-line', 'second-line']);
    expect(tapped).not.toContain('__rot_');
  }, 20_000);
  it('REQ-TOOLS-101/102: validation refusals and the reset confirmation', async () => {
    const t = await tool();
    expect(diag((await t.execute(args({ command: 'x', reset: true, is_input: true }), ctx())).text)).toMatchObject({ failure_kind: 'invalid_request', outcome_kind: 'invalid_request' });
    expect((await t.execute(args({ command: '', background: true }), ctx())).text).toContain('A command is required when background=True.');
    expect((await t.execute(args({ session_action: 'send_input', session_id: 'ts_00000000' }), ctx())).text).toContain('send_input requires input_data.');
    const reset = await t.execute(args({ command: '', reset: true }), ctx());
    expect(reset.text).toContain('The terminal session has been reset');
    expect(reset.label).toBe('$ [RESET]');
  }, 20_000);
  it('a real diff-with-differences reads success, not shell_failure, end to end', async () => {
    const t = await tool();
    // The two files are WRITTEN, and they differ. Without them git exits 1 saying `Could not access 'a'` —
    // an error that happens to share the status the carve-out is about, so the case would pass while proving
    // nothing about a diff. Their content differs on one line, so exit 1 carries a real hunk.
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'a'), 'one\ntwo\nthree\n');
    writeFileSync(join(root, 'b'), 'one\nTWO\nthree\n');
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    // The run's shape: `git diff --no-index` with differences exits 1 carrying the payload.
    // Windows PowerShell 5.1 has no `||`, and a line it cannot parse is now its own exit-1 parse error
    // (docs/defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md), so PowerShell's spelling
    // is the `;` both shells read; the second diff's status is the call's either way.
    const twice = PS ? 'git diff --no-index -- a b; git diff --no-index -- a b' : 'git diff --no-index -- a b || true; git diff --no-index -- a b';
    const r = await t.execute(args({ command: twice, timeout: 15 }), ctx());
    expect(diag(r.text)['exit_code']).toBe(1);
    expect(diag(r.text)).toMatchObject({ outcome_kind: 'success', outcome_severity: 'info' });
    expect(r.isError).toBe(false);
    // The payload, not just the status: a pager left to start would have eaten this and the status both.
    expect(output(r.text)).toContain('-two');
    expect(output(r.text)).toContain('+TWO');
    // And a no-match search answers rather than fails — `findstr` on Windows, `grep` on POSIX.
    const search = PS ? 'findstr /C:definitely-not-here-xyz src\\a.ts; echo "search said $LASTEXITCODE"' : 'grep definitely-not-here-xyz src/a.ts; echo "grep said $?"';
    const g = await t.execute(args({ command: search, timeout: 15 }), ctx());
    expect(output(g.text)).toContain('said 1');
  }, 30_000);
  it('REQ-TOOLS-107..110: a background session returns at once, is queried for new output only, listed, and killed', async () => {
    const t = await tool();
    const ticks = PS
      ? '1..3 | ForEach-Object { Write-Output "tick $_"; Start-Sleep -Milliseconds 300 }; Write-Output end'
      : `for i in 1 2 3; do printf 'tick %s\\n' "$i"; sleep 1; done; ${SH.echo('end')}`;
    const started = await t.execute(args({ command: ticks, background: true }), ctx());
    expect(started.text).toMatch(/^Background session started: ts_[0-9a-f]{8}/);
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    // Wait for the subprocess to FINISH, by listing — which consumes no output, unlike `query` — rather than by
    // sleeping a span guessed for an idle machine. The guess was 2.5 s against ~0.9 s of work, and under
    // full-suite load the query came back `(no new output since last poll)` before the first tick.
    for (let i = 0; i < 80; i += 1) {
      if ((await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✓ ${id}`)) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const q = await t.execute(args({ session_id: id }), ctx());
    expect(output(q.text)).toContain('tick 1');
    expect(output(q.text)).toContain('end');
    const again = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(output(again.text)).toBe('(no new output since last poll)');
    expect(diag(again.text)).toMatchObject({ session_status: 'completed', exit_code: 0, outcome_kind: 'background_terminal', outcome_severity: 'info' });
    const long = await t.execute(args({ command: SH.sleep(30), background: true }), ctx());
    const id2 = /ts_[0-9a-f]{8}/.exec(long.text)![0];
    const list = await t.execute(args({ session_action: 'list' }), ctx());
    expect(list.text).toContain(`▶ ${id2}`);
    expect(list.text).toContain(`✓ ${id}`);
    const killed = await t.execute(args({ session_id: id2, session_action: 'kill' }), ctx());
    expect(diag(killed.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_severity: 'warning' });
    expect((await t.execute(args({ session_id: 'ts_0badf00d' }), ctx())).text).toContain("Unknown background session: 'ts_0badf00d'");
  }, 30_000);
  it('REQ-TOOLS-109/110: a kill of a session that has already ended says so, kills nothing, and agrees with its status — after completion and after failure', async () => {
    const t = await tool();
    const ended = async (command: string, glyph: string): Promise<string> => {
      const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command, background: true }), ctx())).text)![0];
      const endedBy = (clocks.monotonic.now() as number) + 15_000;
      while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`${glyph} ${id}`)) {
        expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
        await new Promise((res) => setTimeout(res, 50));
      }
      return id;
    };
    // Before the repair both answered `Session ts_… was killed.` beside a block reporting `completed` or `failed`.
    const done = await ended(SH.echo('finished'), '✓');
    const k1 = await t.execute(args({ session_id: done, session_action: 'kill' }), ctx());
    expect(k1.text).not.toContain(`Session ${done} was killed`);
    expect(k1.text).toContain(`Session ${done} had already ended; nothing was killed. It is completed (exit 0).`);
    // REQ-TOOLS-110: the final output all the same.
    expect(output(k1.text)).toContain('finished');
    expect(diag(k1.text)).toMatchObject({ session_status: 'completed', exit_code: 0, outcome_kind: 'background_terminal', outcome_severity: 'info' });
    expect(diag(k1.text)['detail']).toBe(`Session ${done} had already ended; nothing was killed. It is completed (exit 0).`);
    const failed = await ended('exit 3', '✗');
    const k2 = await t.execute(args({ session_id: failed, session_action: 'kill' }), ctx());
    expect(k2.text).toContain(`Session ${failed} had already ended; nothing was killed. It is failed (exit 3).`);
    expect(diag(k2.text)).toMatchObject({ session_status: 'failed', exit_code: 3, outcome_kind: 'background_terminal', outcome_severity: 'error' });
    // A kill of a session a kill already ended says the same: the second kill ended nothing.
    const long = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command: SH.sleep(30), background: true }), ctx())).text)![0];
    expect((await t.execute(args({ session_id: long, session_action: 'kill' }), ctx())).text).toContain(`Session ${long} was killed.`);
    const again = await t.execute(args({ session_id: long, session_action: 'kill' }), ctx());
    expect(again.text).toContain(`Session ${long} had already ended; nothing was killed. It is killed (exit -1).`);
    expect(diag(again.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_severity: 'warning' });
  }, 40_000);
  it('OQ-10 (R-044): send_signal SIGINT stops a background session instead of refusing it', async () => {
    const t = await tool();
    // The command prints a marker and THEN becomes the long-lived process. On POSIX `exec sleep`
    // replaces the shell, so the group's one process is `sleep` with SIGINT at its default disposition
    // and no shell left to absorb the signal; on Windows there is no exec idiom and none is needed, as
    // OQ-10's win32 mapping terminates the tree (`end`) rather than delivering a signal. Signalling only
    // AFTER the marker is observed is what makes the case deterministic. `/bin/sh` here is `dash`, which catches
    // SIGINT under `-c` and launches a command with `vfork`; until the child `exec`s it runs dash's handler, which
    // returns at once in a vforked child, so a SIGINT that reaches the group in that instant is discarded by the
    // command, and the shell acts on its own copy only when the command ends — `sleep 30` outlived the poll.
    // Sent the instant `start` returned, 38 of 200 such sessions survived under load (0 of 150 under `bash`, 0 of
    // 150 with `exec`); gated on the marker, with `exec`, none does. The product's delivery reaches every process of
    // the group and reports it sent in every one of those runs
    // (docs/defects/fixed/a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md). What the window cost
    // the product outside this case is repaired by re-delivery to a member that never received the signal, and is
    // pinned in background.test.ts (OQ-135;
    // docs/defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md).
    const command = PS ? `Write-Output 'up'; ${SH.sleep(30)}` : `printf 'up\\n'; exec sleep 30`;
    const started = await t.execute(args({ command, background: true }), ctx());
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    // Poll until the session is observably running its command (its marker has reached the buffer),
    // bounded by a deadline read from the clock port rather than a fixed iteration count.
    const runningBy = (clocks.monotonic.now() as number) + 15_000;
    for (;;) {
      if ((output((await t.execute(args({ session_id: id, session_action: 'query' }), ctx())).text) ?? '').includes('up')) break;
      expect(clocks.monotonic.now() as number).toBeLessThan(runningBy);
      await new Promise((res) => setTimeout(res, 25));
    }
    const stopped = await t.execute(args({ session_id: id, session_action: 'send_signal', signal: 'SIGINT' }), ctx());
    expect(stopped.text).toContain(`Sent SIGINT to session ${id}.`);
    expect(stopped.text).not.toContain('could not be delivered');
    // The session is ended, not refused: poll the list until it shows the ended glyph, bounded by the clock.
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while ((clocks.monotonic.now() as number) < endedBy) {
      if ((await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    expect((await t.execute(args({ session_action: 'list' }), ctx())).text).toContain(`✗ ${id}`);
  }, 40_000);
  it('REQ-TOOLS-109/179, OQ-133 (live-run L4): a session the agent ends with send_signal SIGINT reads killed (−1) at warning, not an error', async () => {
    const t = await tool();
    // As in the OQ-10 case above: the command becomes the long-lived process, and the signal waits for its marker.
    const command = PS ? `Write-Output 'up'; ${SH.sleep(30)}` : `printf 'up\\n'; exec sleep 30`;
    const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command, background: true }), ctx())).text)![0];
    const runningBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(output((await t.execute(args({ session_id: id, session_action: 'query' }), ctx())).text) ?? '').includes('up')) {
      expect(clocks.monotonic.now() as number).toBeLessThan(runningBy);
      await new Promise((res) => setTimeout(res, 25));
    }
    expect((await t.execute(args({ session_id: id, session_action: 'send_signal', signal: 'SIGINT' }), ctx())).text).toContain(`Sent SIGINT to session ${id}.`);
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
      expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
      await new Promise((res) => setTimeout(res, 50));
    }
    // The live run read `Session ts_… is failed (exit -1).` here: an error, and a `tool_error` issue the gate files
    // for any observation that is one. `killed` is REQ-TOOLS-112's `warning`: the agent ended it deliberately.
    const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(q.text).toContain(`Session ${id} is killed (exit -1).`);
    expect(diag(q.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_kind: 'background_terminal', outcome_severity: 'warning' });
    expect(q.isError).toBe(false);
  }, 40_000);
  it.skipIf(PS)('OQ-133: a signal death the product did not send reads failed with 128 + n, never the −1 of killed', async () => {
    const t = await tool();
    // The shell ends itself by SIGTERM: a death by a signal no `send_signal` delivered.
    const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command: 'kill -TERM $$', background: true }), ctx())).text)![0];
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
      expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
      await new Promise((res) => setTimeout(res, 50));
    }
    const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(diag(q.text)).toMatchObject({ session_status: 'failed', exit_code: 143, outcome_kind: 'background_terminal', outcome_severity: 'error' });
  }, 30_000);
  it('PD-ORCH-005 clause 10: a background session is attributed to the agent that started it, recorded at its start and at an end it reaches by itself, and listed by its session', async () => {
    const recorded: { id: string; status: string; tail: string }[] = [];
    const record = (b: BackgroundSession) => { recorded.push({ id: b.id, status: b.status, tail: b.tail() }); };
    manager ??= new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(manager, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, undefined, { owner: { sessionId: 's-attr', taskId: 'bg_agent01' }, onStarted: record, onEnded: record });
    const started = await t.execute(args({ command: SH.echo('attributed'), background: true }), ctx());
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    expect(recorded[0]).toMatchObject({ id, status: 'running' });
    for (let i = 0; i < 80 && recorded.length < 2; i += 1) await new Promise((res) => setTimeout(res, 100));
    expect(recorded[1]).toMatchObject({ id, status: 'completed' });
    expect(recorded[1]!.tail).toContain('attributed');
    const owned = manager.backgroundOwnedBy('s-attr');
    expect(owned.map((b) => [b.id, b.owner])).toEqual([[id, { sessionId: 's-attr', taskId: 'bg_agent01' }]]);
    expect(manager.backgroundOwnedBy('s-other')).toEqual([]);
  }, 30_000);
  it('REQ-TOOLS-108: the background cap is an execution_error naming the count', async () => {
    const t = await tool({ maxBackgroundSessions: 1 });
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t1 = terminalTool(m, { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 });
    const a = await t1.execute(args({ command: SH.sleep(20), background: true }), ctx());
    const b = await t1.execute(args({ command: SH.sleep(20), background: true }), ctx());
    expect(b.text).toContain('Maximum background terminal sessions (1) reached. Kill or wait for existing sessions before starting new ones.');
    expect(diag(b.text)).toMatchObject({ failure_kind: 'execution_error' });
    void a; void t;
    await m.dispose();
  }, 20_000);
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
  // (docs/defects/fixed/a-session-action-sent-with-background-true-is-refused-as-a-missing-command.md).
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
