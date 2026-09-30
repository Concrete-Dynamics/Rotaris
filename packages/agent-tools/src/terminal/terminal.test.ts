import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, type Clocks } from '@rotaris/kernel';
import { foregroundStreamId } from '@rotaris/contracts';
import { nodeClocks } from '@rotaris/platform';
import { classifyOutcome, diagnosticBlock, outputWarnings, stripVt } from './classify.js';
import { CommandRegion, parseSnapshot, snapshotCommand, wrapCommand } from './foreground.js';
import { endOfExit } from './background.js';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { findShell, nodePtyFactory, seconds, TerminalManager, terminalDescription, terminalTool, TERMINAL_DEFAULTS, type BackgroundSession } from './index.js';
import type { ToolContext } from '../tools/types.js';

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
const ctx = (signal = new AbortController().signal): ToolContext => ({ workspaceRoot: root, sessionId: 's1', agentName: 'orchestrator', persona: 'orchestrator', monotonic: clocks.monotonic, wall: clocks.wall, signal, warn: () => undefined });
let manager: TerminalManager | null = null;
async function tool(over: Partial<typeof TERMINAL_DEFAULTS> = {}) {
  manager ??= new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
  return terminalTool(manager, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over });
}
const diag = (text: string) => JSON.parse(text.slice(text.indexOf('[terminal_diagnostic] ') + '[terminal_diagnostic] '.length)) as Record<string, unknown>;
const output = (text: string) => { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(text); return m ? m[1] : ''; };
const args = (a: Record<string, unknown>) => ({ command: '', is_input: false, reset: false, background: false, ...a }) as Parameters<Awaited<ReturnType<typeof tool>>['execute']>[0];

afterAll(async () => { await manager?.dispose(); rmSync(root, { recursive: true, force: true }); });

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
  it('strips VT sequences and carriage returns', () => {
    expect(stripVt('\x1b[32mhi\x1b[0m\r\n\x1b]0;title\x07x')).toBe('hi\nx');
  });
  it('the wrapper brackets the command with the two markers and recovers the exit status', () => {
    const w = wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E');
    expect(w).toContain("Write-Output 'S'; git status; Write-Output ('E:'");
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

  it('refuses a capture that names no variable, rather than restoring an empty environment over the fresh shell', () => {
    const cwdOnly = Buffer.from(`${root}\0`, 'utf8').toString('base64');
    expect(parseSnapshot(`__rot_b64__:${cwdOnly}\n`)).toBeNull();
  });
});

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
  // soft-pause path (a 1.5 s window here) the unguarded wrapper fell into. dash, `/bin/sh` on this host, is the shell a
  // model writes bash for; bash in POSIX mode abandons the line the same way.
  it.skipIf(PS)('REQ-TOOLS-097/098/179 (live-run L1): a command sh cannot expand or parse ends with its own exit status, never a soft pause', async () => {
    const t = await tool();
    const expand = await t.execute(args({ command: 'export ROTARIS_L1=kept; printf \'%s\\n\' ran; echo "EXIT=${PIPESTATUS[0]}"' }), ctx());
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
    // A single-line command keeps today's wrapper, byte for byte.
    expect(wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E')).toContain("Write-Output 'S'; git status; Write-Output ('E:'");
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
    expect(rows[0]).toBe('Count             : 2');
    expect(rows).toContain('Property          :');
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
    const r = await t.execute(args({ command: 'git diff --no-index -- a b || true; git diff --no-index -- a b', timeout: 15 }), ctx());
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
    // (docs/defects/fixed/a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md); what the window still
    // costs the product, outside this case, is recorded open (docs/defects/a-sigint-that-reaches-a-command-as-sh-starts-
    // it-does-not-stop-the-session.md, OQ-135).
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

  it('REQ-TOOLS-104 (live-run L1): the description names the shell the host runs — PowerShell on Windows, the POSIX shell elsewhere', () => {
    const posix = terminalDescription({ kind: 'posix', file: '/bin/sh' });
    expect(posix).toContain('The shell is `/bin/sh`, a POSIX shell that may not be bash');
    expect(posix).toContain('`${PIPESTATUS[…]}`');
    expect(posix).not.toContain('PowerShell');
    const windows = terminalDescription({ kind: 'powershell', file: 'pwsh.exe' });
    // REQ-TOOLS-104's four warnings and four statements, on the host it binds.
    for (const text of ['PowerShell, not bash', '`&&`', '`;`', '`2>&1`', '`$env:VAR`', 'heredoc never returns', 'bash arrays', '`[[ … ]]`', '`source`']) expect(windows).toContain(text);
    expect(windows).not.toContain('/bin/sh');
    // The executor names the manager's own shell.
    expect(terminalTool(new TerminalManager({ factory: { spawn: () => { throw new Error('unused'); } }, backend: { kind: 'posix', file: '/bin/sh' }, clocks, config: TERMINAL_DEFAULTS, env: {}, warn: () => undefined }), TERMINAL_DEFAULTS).description).toBe(posix);
  });
});
