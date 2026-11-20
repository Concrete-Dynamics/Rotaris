import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foregroundStreamId } from '@rotaris/contracts';
import { nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import type { ConfinementPort } from '../confinement/index.js';
import { shell, PS, SH, clocks, root, bashAsSh, ctx, manager, tool, diag, output, args, posixSession, backendSession, disposeTerminalFixture, l1Case, slowStart } from './terminal.test-support.js';

/**
 * Part 1 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

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
  // PowerShell's branch since 2026-10-15 (the Windows ARM64 session's B6): `exit 3`, a bare `exit`, `Stop-Process` on the
  // shell's own pid, and `exit` after output on one line and over two. ConPTY reports the shell's end in about 1.5 s
  // (measured under pwsh 7.6.6 and 5.1), inside a 3 s soft-pause window, so PowerShell's bound is the window itself.
  it('REQ-TOOLS-097/098/100/103 (OQ-144): a command that ends the session\'s shell ends at once as an execution_error, never a soft pause, and the next call reports the respawn with the shell state restored', async () => {
    const window = PS ? 6_000 : 3_000;
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: window }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: window });
    // The directory as the shell names it: Windows' native spelling (case, 8.3) is what `Get-Location` prints.
    const sub = (PS ? realpathSync.native : realpathSync)(mkdtempSync(join(root, 'ends-')));
    const enders: string[] = PS ? ['exit 3', 'exit', 'Stop-Process -Id $PID -Force', "Write-Output 'bye'\nexit 3", "Write-Output 'bye'; exit 3"] : ['exit 3', 'kill -9 $$'];
    try {
      for (const [i, command] of enders.entries()) {
        const value = `kept${i}`;
        expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_ENDS', value)}; ${SH.cd(sub)}`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
        // It names no timeout, so the soft pause is armed, as it is for a model's call.
        const began = clocks.monotonic.now() as number;
        const r = await t.execute(args({ command }), ctx());
        const took = (clocks.monotonic.now() as number) - began;
        // Before the repair: `soft_pause`, exit −1, after the whole 3 s window.
        expect(diag(r.text)['outcome_kind'], command).not.toBe('soft_pause');
        expect(took, `${command}: ${took} ms`).toBeLessThan(PS ? 5_000 : 1_500);
        if (command.includes('bye')) expect(r.text, command).toContain('bye');
        expect(r).toMatchObject({ isError: true, failureKind: 'execution_error', outcomeKind: 'execution_error' });
        expect(diag(r.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset', error_class: 'ExecutionError' });
        expect(diag(r.text)).not.toHaveProperty('exit_code');
        expect(r.text).toContain('Terminal execution failed before completion');
        expect(r.text).toContain('ended the session\'s shell');
        expect(r.text).toContain(`were restored (${sub})`);
        expect(r.text).not.toContain('__rot_');
        // The next call runs in the respawned shell, says so, and finds the directory and the variable re-applied.
        const next = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; ${SH.pwd()}`, timeout: 15 }), ctx());
        expect(diag(next.text), command).toMatchObject({ exit_code: 0, session_reinitialized: true });
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual([value, sub]);
        // And only that call: the one after it is in the same shell.
        expect(diag((await t.execute(args({ command: SH.noop(), timeout: 15 }), ctx())).text)['session_reinitialized'] ?? false).toBe(false);
      }
    } finally { await m.dispose(); }
  }, 90_000);
  it('REQ-TOOLS-098/100/103 (OQ-144): a soft-paused command that ends the shell is handed over by the poll as an execution_error, and a shell that ended between calls is respawned, restored and reported', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 });
    const sub = (PS ? realpathSync.native : realpathSync)(mkdtempSync(join(root, 'ends-paused-')));
    try {
      expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_ENDS', 'paused')}; ${SH.cd(sub)}`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      const paused = await t.execute(args({ command: `${SH.sleep(2)}; exit 4` }), ctx());
      expect(diag(paused.text)['outcome_kind']).toBe('soft_pause');
      await new Promise((res) => setTimeout(res, 2_500));
      // Before the repair: −1, `soft_pause`, "The process may still be running", on every poll after the shell had gone.
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)['outcome_kind']).not.toBe('soft_pause');
      expect(diag(poll.text)).toMatchObject({ failure_kind: 'execution_error', outcome_kind: 'execution_error' });
      expect(diag(poll.text)).not.toHaveProperty('exit_code');
      expect(poll.text).toContain('ended the session\'s shell');
      const next = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; ${SH.pwd()}`, timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['paused', sub]);
      // A shell ended between calls — keystrokes the agent wrote to it — is respawned by the next call, which says so.
      expect(diag((await t.execute(args({ command: 'exit\r', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      await new Promise((res) => setTimeout(res, PS ? 3_000 : 1_000));
      const after = await t.execute(args({ command: `${SH.echoVar('ROTARIS_ENDS')}; ${SH.pwd()}`, timeout: 15 }), ctx());
      expect(diag(after.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(after.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['paused', sub]);
    } finally { await m.dispose(); }
  }, 40_000);
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
  // docs/archive/defects/a-kill-from-the-terminal-window-resets-the-session-without-restoring-its-state.md: every reset path
  // re-applied PD-TOOLS-001's snapshot except the window's kill, which only finished the call; the next call read the
  // variable empty and stood in the spawn directory, and the kill's detail named no restore and no loss.
  it('PD-TOOLS-001, REQ-SHELL-092: a kill from the terminal window re-applies the directory and the exported variables, and the observation names the loss and the restore', async () => {
    const { m, t } = await backendSession(shell!);
    const sub = (PS ? realpathSync.native : realpathSync)(mkdtempSync(join(root, 'killed-running-')));
    try {
      expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_KILL_KEPT', 'kept')}; ${SH.cd(sub)}`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      setTimeout(() => { void m.streams.kill(foregroundStreamId('orchestrator')); }, 2_000);
      const r = await t.execute(args({ command: `${SH.echo('before-kill')}; ${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 30 }), ctx());
      expect(diag(r.text)).toMatchObject({ exit_code: -1, failure_kind: 'execution_error', kill_status: 'session_reset' });
      expect(r.text).toContain('killed from the terminal window');
      // Before the repair: "Terminal execution failed before completion: the command was killed from the terminal window",
      // and nothing more — no loss, no restore.
      expect(String(diag(r.text)['detail'])).toContain('shell state (working directory, variables, aliases, background jobs) was lost');
      expect(String(diag(r.text)['detail'])).toMatch(/The working directory and \d+ exported variables? were restored/);
      expect(output(r.text)).toContain('before-kill');
      expect(output(r.text)).not.toContain('late');
      // The next call runs in the restarted session, says so, and finds the directory and the variable re-applied.
      const next = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_KILL_KEPT')}; ${SH.pwd()}`, timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['[kept]', sub]);
    } finally { await m.dispose(); }
  }, 60_000);
});
