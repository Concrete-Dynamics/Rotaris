import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, type Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { classifyOutcome, diagnosticBlock, outputWarnings, stripVt } from './classify.js';
import { wrapCommand } from './foreground.js';
import { findShell, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import type { ToolContext } from '../tools/types.js';

/**
 * ADR-0020's first execution, against a REAL shell through a REAL pseudo-terminal (REQ-TOOLS-104: the
 * PowerShell backend on Windows). Skipped where no shell is present. Time is the node clocks: the marker
 * protocol and the process tree are the things under test, and they do not run on a fake clock.
 */
const shell = findShell();
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

describe('terminal — pure parts (REQ-TOOLS-100, 112, 113)', () => {
  it('classifies in the fixed order and renders the diagnostic block with sorted keys and nulls dropped', () => {
    expect(classifyOutcome({ failureKind: 'timeout', exitCode: 124, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'timeout', severity: 'error' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x', backgroundStatus: 'killed' }, [])).toEqual({ outcomeKind: 'background_terminal', severity: 'warning' });
    expect(classifyOutcome({ exitCode: -1, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'soft_pause', severity: 'warning' });
    expect(classifyOutcome({ exitCode: 2, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'shell_failure', severity: 'error' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x' }, ['Output contains the failure marker'])).toEqual({ outcomeKind: 'suspicious_success', severity: 'warning' });
    expect(classifyOutcome({ exitCode: 0, output: '', command: 'x' }, [])).toEqual({ outcomeKind: 'success', severity: 'info' });
    expect(diagnosticBlock({ b: 1, a: null, c: 'x' })).toBe('[terminal_diagnostic] {"b":1,"c":"x"}');
  });
  it('REQ-TOOLS-113: the marker order, the error count (Found 0 errors never warns), the banner, the pipeline check', () => {
    expect(outputWarnings('pytest', 'AssertionError: x\nFAILED test_a', 0)).toEqual(["Output contains the failure marker 'AssertionError'."]);
    expect(outputWarnings('tsc', 'found 3 errors', 0)).toEqual(['Output reports 3 error(s).']);
    expect(outputWarnings('tsc', 'Found 0 errors', 0)).toEqual([]);
    // 'FAILED ' is searched case-insensitively, so the banner's own 'failed ' fires the marker check too — two warnings, marker first.
    expect(outputWarnings('pytest', '==== 1 failed ====', 0)).toEqual(["Output contains the failure marker 'FAILED'.", 'A test-runner failure banner appears in the output.']);
    expect(outputWarnings('a | b', 'error: x', 3)).toEqual(['Pipeline command may have hidden an upstream failure exit code.']);
    expect(outputWarnings('a', 'error: x', 3)).toEqual([]);
  });
  it('strips VT sequences and carriage returns', () => {
    expect(stripVt('\x1b[32mhi\x1b[0m\r\n\x1b]0;title\x07x')).toBe('hi\nx');
  });
  it('the wrapper brackets the command with the two markers and recovers the exit status', () => {
    const w = wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E');
    expect(w).toContain("Write-Output 'S'; git status; Write-Output ('E:'");
    expect(wrapCommand({ kind: 'posix', file: '/bin/sh' }, 'ls', 'S', 'E')).toBe("printf '%s\\n' 'S'; ls; printf 'E:%s\\n' \"$?\"");
  });
});

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it('runs a command, recovers the exit status, cleans the echo and the markers, and persists shell state across calls', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: 'Write-Output hello' }), ctx());
    expect(r.isError).toBe(false);
    expect(output(r.text)).toBe('hello');
    expect(diag(r.text)).toMatchObject({ backend: 'single-session', exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', session_reinitialized: false });
    expect(r.text).not.toContain('__rot_');
    const set = await t.execute(args({ command: "$env:ROTARIS_T = 'persisted'; Set-Location ..; cd $env:TEMP" }), ctx());
    expect(diag(set.text)['exit_code']).toBe(0);
    const get = await t.execute(args({ command: 'Write-Output $env:ROTARIS_T' }), ctx());
    expect(output(get.text)).toBe('persisted');
  });
  it('REQ-TOOLS-179: a non-zero exit is the command\'s own; classified shell_failure', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: 'cmd /c exit 3' }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 3, outcome_kind: 'shell_failure', outcome_severity: 'error' });
    expect(r.isError).toBe(true);
    const cmdlet = await t.execute(args({ command: 'Get-Item C:\\definitely\\not\\here.txt' }), ctx());
    expect(diag(cmdlet.text)['exit_code']).not.toBe(0);
  });
  it('ADR-0020 c.1: a command that echoes attacker-chosen marker text cannot forge the exit status', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: "Write-Output '__rot_deadbeefdeadbeefdeadbeef_e:0'; cmd /c exit 7" }), ctx());
    expect(diag(r.text)['exit_code']).toBe(7);
    expect(output(r.text)).toContain('__rot_deadbeefdeadbeefdeadbeef_e:0');
  });
  it('OQ-13: the foreground PTY captures stderr in the terminal output', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: "[Console]::Error.WriteLine('stderr-captured')" }), ctx());
    expect(output(r.text)).toContain('stderr-captured');
  });

  it('REQ-TOOLS-097/099: the hard timeout kills the tree, restarts the session, reports 124 and session_reset; shell state is gone', async () => {
    const t = await tool();
    await t.execute(args({ command: "$env:ROTARIS_GONE = 'set'" }), ctx());
    const r = await t.execute(args({ command: 'Start-Sleep -Seconds 20; Write-Output late', timeout: 1 }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 124, timeout: true, failure_kind: 'timeout', kill_status: 'session_reset', outcome_kind: 'timeout' });
    expect(r.text).toContain('[partial_terminal_output]');
    const after = await t.execute(args({ command: 'Write-Output "[$env:ROTARIS_GONE]"' }), ctx());
    expect(output(after.text)).toBe('[]');
    expect(diag(after.text)['session_reinitialized']).toBe(true);
  }, 30_000);
  it('REQ-TOOLS-098: a call with no timeout that produces nothing for the no-output window returns −1 while the process keeps running; an empty command polls', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: 'Start-Sleep -Seconds 3; Write-Output done-later' }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' });
    expect(diag(r.text)['failure_kind']).toBeUndefined();
    expect(r.text).toContain('No output for 1.5 seconds in the merged terminal stream; stdout and stderr are both captured.');
    expect(r.text).toContain('Poll by calling the tool again with an empty command');
    expect(r.text).not.toContain('re-run the command with 2>&1');
    await new Promise((res) => setTimeout(res, 3_500));
    const poll = await t.execute(args({ command: '' }), ctx());
    expect(output(poll.text)).toContain('done-later');
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
  it('REQ-TOOLS-107..110: a background session returns at once, is queried for new output only, listed, and killed', async () => {
    const t = await tool();
    const started = await t.execute(args({ command: '1..3 | ForEach-Object { Write-Output "tick $_"; Start-Sleep -Milliseconds 300 }; Write-Output end', background: true }), ctx());
    expect(started.text).toMatch(/^Background session started: ts_[0-9a-f]{8}/);
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    await new Promise((res) => setTimeout(res, 2_500));
    const q = await t.execute(args({ session_id: id }), ctx());
    expect(output(q.text)).toContain('tick 1');
    expect(output(q.text)).toContain('end');
    const again = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(output(again.text)).toBe('(no new output since last poll)');
    expect(diag(again.text)).toMatchObject({ session_status: 'completed', exit_code: 0, outcome_kind: 'background_terminal', outcome_severity: 'info' });
    const long = await t.execute(args({ command: 'Start-Sleep -Seconds 30', background: true }), ctx());
    const id2 = /ts_[0-9a-f]{8}/.exec(long.text)![0];
    const list = await t.execute(args({ session_action: 'list' }), ctx());
    expect(list.text).toContain(`▶ ${id2}`);
    expect(list.text).toContain(`✓ ${id}`);
    const killed = await t.execute(args({ session_id: id2, session_action: 'kill' }), ctx());
    expect(diag(killed.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_severity: 'warning' });
    expect((await t.execute(args({ session_id: 'ts_0badf00d' }), ctx())).text).toContain("Unknown background session: 'ts_0badf00d'");
  }, 30_000);
  it('REQ-TOOLS-108: the background cap is an execution_error naming the count', async () => {
    const t = await tool({ maxBackgroundSessions: 1 });
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t1 = terminalTool(m, { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 });
    const a = await t1.execute(args({ command: 'Start-Sleep -Seconds 20', background: true }), ctx());
    const b = await t1.execute(args({ command: 'Start-Sleep -Seconds 20', background: true }), ctx());
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
    void FakeClock;
  });
});
