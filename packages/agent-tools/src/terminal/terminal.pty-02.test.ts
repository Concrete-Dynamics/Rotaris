import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { foregroundStreamId } from '@rotaris/contracts';
import { nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, processAlive, deathReading, PS, SH, clocks, root, ctx, tool, diag, output, args, backendSession, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 2 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  // docs/archive/defects/the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md: `killActive` acted
  // only on a call still `running`, a soft-paused command is not one, and the stream dropped the answer, so the window's kill
  // answered ok while the shell, the command and its grandchild all ran on, and the next call queued behind them to its cap.
  describe('REQ-SHELL-092, REQ-TOOLS-098: the window\'s kill of a soft-paused command', () => {
    // `processAlive` above: the zombie-aware reading. With `kill(pid, 0)` alone the four `goneWithin` assertions below
    // read a just-killed tree whose members are still unreaped zombies as `[true, true]`/`[false, true]` and go red on an
    // unladen host — the flake `docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md` records.
    const alive = processAlive;
    const goneWithin = async (pids: readonly number[], boundMs: number): Promise<boolean[]> => {
      const by = Date.now() + boundMs;
      while (pids.some(alive) && Date.now() < by) await new Promise((res) => setTimeout(res, 200));
      const reading = pids.map(alive);
      // A red here used to say only `[false, true]`; the reading names which pid survived and in what state.
      if (reading.some(Boolean)) expect(reading, `death reading: ${deathReading(pids)}`).toEqual([false, false]);
      return reading;
    };
    /** A soft-paused command that starts a grandchild and waits, as the note measured it; its two pids once both are up. */
    const pausedWithGrandchild = async (t: Awaited<ReturnType<typeof backendSession>>['t'], tag: string) => {
      const pidFile = join(root, `${tag}.pid`);
      const js = join(root, `${tag}.cjs`);
      writeFileSync(js, `const { spawn } = require('child_process'); spawn(process.execPath, ['-e', "require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)", ${JSON.stringify(pidFile)}], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(`${pidFile}.parent`)}, String(process.pid)); setInterval(() => {}, 1000);`);
      const paused = await t.execute(args({ command: `node '${js}'` }), ctx());
      expect(diag(paused.text)['outcome_kind']).toBe('soft_pause');
      const by = Date.now() + 10_000;
      while (!(existsSync(pidFile) && existsSync(`${pidFile}.parent`)) && Date.now() < by) await new Promise((res) => setTimeout(res, 100));
      return [Number(readFileSync(`${pidFile}.parent`, 'utf8')), Number(readFileSync(pidFile, 'utf8'))];
    };
    const setUp = async (t: Awaited<ReturnType<typeof backendSession>>['t'], tag: string): Promise<string> => {
      const sub = (PS ? realpathSync.native : realpathSync)(mkdtempSync(join(root, `${tag}-`)));
      expect(diag((await t.execute(args({ command: `${SH.setVar('ROTARIS_PAUSED_KEPT', 'kept')}; ${SH.cd(sub)}`, timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0 });
      return sub;
    };
    it('terminates it and its grandchild, restarts the session with its state re-applied, and the poll is told it was killed from the window', async () => {
      const { m, t } = await backendSession(shell!);
      try {
        const sub = await setUp(t, 'killed-paused-poll');
        const pids = await pausedWithGrandchild(t, 'killed-paused-poll');
        expect(pids.map(alive)).toEqual([true, true]);
        // Before the repair: `{ ok: true }`, and two seconds later the shell, the command and its grandchild all still ran.
        expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: true, value: undefined });
        expect(await goneWithin(pids, 5_000)).toEqual([false, false]);
        // A second kill has nothing left to terminate, and says so, though the stream still shows the command until the poll.
        expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: false, error: 'ended' });
        const poll = await t.execute(args({ command: '' }), ctx());
        expect(diag(poll.text)).toMatchObject({ exit_code: -1, failure_kind: 'execution_error', kill_status: 'session_reset', session_reinitialized: true });
        const detail = String(diag(poll.text)['detail']);
        expect(detail).toContain('the paused command was killed from the terminal window');
        expect(detail).toContain('shell state (working directory, variables, aliases, background jobs) was lost');
        expect(detail).toMatch(/The working directory and \d+ exported variables? were restored/);
        // The session is the restarted one, with the directory and the variable re-applied, and the poll reported it.
        const next = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_PAUSED_KEPT')}; ${SH.pwd()}`, timeout: 15 }), ctx());
        expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
        expect(diag(next.text)['session_reinitialized'] ?? false).toBe(false);
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['[kept]', sub]);
        expect(next.text).not.toContain('soft-paused command');
      } finally { await m.dispose(); }
    }, 90_000);
    it('the next command instead of a poll runs at once in the restarted session and reports the kill, the loss and the restore', async () => {
      const { m, t } = await backendSession(shell!);
      try {
        const sub = await setUp(t, 'killed-paused-call');
        const pids = await pausedWithGrandchild(t, 'killed-paused-call');
        expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: true, value: undefined });
        const began = Date.now();
        const next = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_PAUSED_KEPT')}; ${SH.pwd()}`, timeout: 15 }), ctx());
        // Before the repair the call queued behind the paused command and ran to its own cap (124).
        expect(Date.now() - began).toBeLessThan(10_000);
        expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success', session_reinitialized: true });
        const detail = String(diag(next.text)['detail']);
        expect(detail).toMatch(/The soft-paused command `node '[^`]+'` had ended .* before this command was submitted, by a kill from the terminal window, with no exit code/);
        expect(detail).toContain('shell state (working directory, variables, aliases, background jobs) was lost');
        expect(detail).toMatch(/The working directory and \d+ exported variables? were restored/);
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['[kept]', sub]);
        expect(await goneWithin(pids, 5_000)).toEqual([false, false]);
        expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
      } finally { await m.dispose(); }
    }, 90_000);
    it('a soft-paused command queued behind the one killed never ran: the poll says so with no exit code, and reports the kill ahead of it (OQ-164)', async () => {
      const { m, t } = await backendSession(shell!);
      try {
        const sub = await setUp(t, 'killed-paused-queued');
        const pids = await pausedWithGrandchild(t, 'killed-paused-queued');
        // Issued while the first is paused, it waits behind it and soft-pauses in turn, never started.
        const queued = await t.execute(args({ command: SH.echo('queued-ran') }), ctx());
        expect(diag(queued.text)['outcome_kind']).toBe('soft_pause');
        expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: true, value: undefined });
        expect(await goneWithin(pids, 5_000)).toEqual([false, false]);
        const poll = await t.execute(args({ command: '' }), ctx());
        expect(diag(poll.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset', session_reinitialized: true });
        expect(diag(poll.text)).not.toHaveProperty('exit_code');
        const detail = String(diag(poll.text)['detail']);
        expect(detail).toMatch(/The soft-paused command `node '[^`]+'` ahead of the polled one ended .* ago, by a kill from the terminal window, with no exit code\./);
        expect(detail).toContain('the paused command never ran, so it has no exit code: the soft-paused command ahead of it was killed from the terminal window');
        expect(detail).toMatch(/The working directory and \d+ exported variables? were restored/);
        expect(output(poll.text)).not.toContain('queued-ran');
        const next = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_PAUSED_KEPT')}; ${SH.pwd()}`, timeout: 15 }), ctx());
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['[kept]', sub]);
        expect(next.text).not.toContain('queued-ran');
      } finally { await m.dispose(); }
    }, 90_000);
    // The review of `loc1-terminal-kill` (2026-10-21): with a timed call waiting behind the paused command, the call is the
    // session's running one, so the kill took the running path, which reported neither the paused command's kill nor that the
    // waiting call's line was never reached.
    it('a kill while a timed call waits behind the soft-paused command ends the paused one, which the call reports as killed from the window, and the call never ran (OQ-164)', async () => {
      const { m, t } = await backendSession(shell!);
      try {
        const sub = await setUp(t, 'killed-paused-waiting');
        const pids = await pausedWithGrandchild(t, 'killed-paused-waiting');
        setTimeout(() => { void m.streams.kill(foregroundStreamId('orchestrator')); }, 2_000);
        const began = Date.now();
        const waiting = await t.execute(args({ command: SH.echo('waiting-ran'), timeout: 30 }), ctx());
        expect(Date.now() - began).toBeLessThan(15_000);
        expect(await goneWithin(pids, 5_000)).toEqual([false, false]);
        expect(diag(waiting.text)).toMatchObject({ failure_kind: 'execution_error', kill_status: 'session_reset' });
        expect(diag(waiting.text)).not.toHaveProperty('exit_code');
        const detail = String(diag(waiting.text)['detail']);
        // Before the repair: exit −1 "killed … so it has no exit status of its own" for a line the shell never reached, and
        // the paused command reported as ended "when the terminal session was reset".
        expect(detail).toMatch(/waited behind it: that command ended .* by a kill from the terminal window, with no exit code/);
        expect(detail).toContain('the command never ran, so it has no exit code: the soft-paused command ahead of it was killed from the terminal window');
        expect(detail).toMatch(/The working directory and \d+ exported variables? were restored/);
        expect(output(waiting.text) ?? '').not.toContain('waiting-ran');
        const next = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_PAUSED_KEPT')}; ${SH.pwd()}`, timeout: 15 }), ctx());
        expect((output(next.text) ?? '').split('\n').map((l) => l.trim())).toEqual(['[kept]', sub]);
      } finally { await m.dispose(); }
    }, 90_000);
    it('a kill after the paused command ended on its own terminates nothing and answers `ended`; the poll reports the command\'s own end', async () => {
      const { m, t } = await backendSession(shell!);
      try {
        await setUp(t, 'killed-paused-ended');
        expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-alone')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
        await new Promise((res) => setTimeout(res, 3_000));
        // Before the repair: `{ ok: true }` for a kill that did nothing.
        expect(await m.streams.kill(foregroundStreamId('orchestrator'))).toEqual({ ok: false, error: 'ended' });
        const poll = await t.execute(args({ command: '' }), ctx());
        expect(diag(poll.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
        expect(output(poll.text)).toContain('done-alone');
        expect(poll.text).not.toContain('killed from the terminal window');
      } finally { await m.dispose(); }
    }, 60_000);
  });
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
});
