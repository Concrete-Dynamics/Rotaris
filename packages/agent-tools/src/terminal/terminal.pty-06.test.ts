import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { foregroundStreamId } from '@rotaris/contracts';
import { shellHoldsTerminal, type PtyFactory } from './foreground.js';
import { execFileSync } from 'node:child_process';
import { INTERRUPT_UNSEEN_NOTE, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, PS, SH, clocks, root, ctx, diag, output, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 6 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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

  // OQ-168's Windows reading on a real PowerShell and ConPTY (the Windows ARM64 session's B7, 2026-10-15; pwsh 7.6.6 and 5.1):
  // the two cases above act Windows out through a POSIX shell. A factory records every byte the session writes and every kill
  // it asks of node-pty.
  describe.runIf(PS)('OQ-168 / OQ-147 / OQ-10 on PowerShell and ConPTY (REQ-TOOLS-096/098, REQ-SHELL-092/093)', () => {
    const recorded = async () => {
      const base = await nodePtyFactory();
      const writes: string[] = [];
      const kills: (string | undefined)[] = [];
      const factory: PtyFactory = { spawn: (f, a, o) => { const p = base.spawn(f, a, o); return { pid: p.pid, onData: (cb) => p.onData(cb), onExit: (cb) => p.onExit(cb), resize: (c, r) => p.resize(c, r), write: (d) => { writes.push(d); p.write(d); }, kill: (s) => { kills.push(s); p.kill(s); } }; } };
      const m = new TerminalManager({ factory, backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
      return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }), writes, kills };
    };
    const tasklistHas = (pid: number): boolean => execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', windowsHide: true }).includes(String(pid));
    it('the agent\'s C-c on a soft-paused command writes nothing after it; the poll says it may have ended, and the next command reports how', async () => {
      const { m, t, writes } = await recorded();
      try {
        await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
        expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
        expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
        const after = writes.length;
        await new Promise((res) => setTimeout(res, 1_500));
        const poll = await t.execute(args({ command: '' }), ctx());
        expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
        expect(String(diag(poll.text)['detail']).startsWith(INTERRUPT_UNSEEN_NOTE)).toBe(true);
        expect(writes.slice(after)).toEqual([]);
        const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
        expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
        expect(String(diag(next.text)['detail'])).toContain('with no exit status of its own');
        // PowerShell ends the line at the C-c: what followed the sleep never ran.
        expect(output(next.text)).toBe('after');
        expect(output(poll.text)).not.toContain('done-later');
      } finally { await m.dispose(); }
    }, 60_000);
    it('a program that ignores the interrupt and reads its input is written nothing after the C-c, and takes the next line; the paused line stays unseen', async () => {
      const { m, t, writes } = await recorded();
      const js = join(root, 'ignores-int.cjs');
      writeFileSync(js, "process.on('SIGINT', () => {}); process.stdin.setEncoding('utf8'); process.stdin.once('data', (d) => { console.log('got:' + String(d).trim()); process.exit(0); });");
      try {
        await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
        expect(diag((await t.execute(args({ command: `node '${js}'` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
        await t.execute(args({ command: 'C-c', is_input: true }), ctx());
        const after = writes.length;
        await new Promise((res) => setTimeout(res, 1_000));
        expect(diag((await t.execute(args({ command: '' }), ctx())).text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
        expect(writes.slice(after)).toEqual([]);
        await t.execute(args({ command: 'hello\r', is_input: true }), ctx());
        await new Promise((res) => setTimeout(res, 1_500));
        const answered = await t.execute(args({ command: '' }), ctx());
        expect(output(answered.text)).toContain('got:hello');
        // PowerShell abandoned the wrapper's line at the C-c, so no end frame follows the program's own exit: the poll stays
        // OQ-168's soft pause, and the next command reports how the paused one ended.
        expect(diag(answered.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
        expect(answered.text).not.toContain('__rot_');
      } finally { await m.dispose(); }
    }, 60_000);
    it('the window\'s interrupt ends a running ping and a running node at once; the call itself runs out its cap, and the reset restores the shell\'s state', async () => {
      for (const kind of ['ping', 'node'] as const) {
        const { m, t } = await recorded();
        const pidFile = join(root, `${kind}-running.pid`);
        try {
          await t.execute(args({ command: SH.setVar('ROTARIS_KEPT', 'kept'), timeout: 15 }), ctx());
          const command = kind === 'ping' ? 'ping -t 127.0.0.1' : `node -e "require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)" '${pidFile}'`;
          let gone: boolean | null = null;
          setTimeout(() => {
            const pid = kind === 'ping'
              ? Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-CimInstance Win32_Process -Filter \"Name like 'ping%'\" | Sort-Object CreationDate | Select-Object -Last 1).ProcessId"], { encoding: 'utf8', windowsHide: true }).trim())
              : Number(readFileSync(pidFile, 'utf8'));
            m.streams.interrupt(foregroundStreamId('orchestrator'));
            setTimeout(() => { gone = !tasklistHas(pid); }, 1_000);
          }, 2_000);
          const r = await t.execute(args({ command, timeout: 6 }), ctx());
          expect(gone, kind).toBe(true);
          // Off Linux nothing says the shell holds its terminal again, so a timed call runs out its cap (OQ-168, as ruled).
          expect(diag(r.text), kind).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
          expect(output((await t.execute(args({ command: SH.bracketVar('ROTARIS_KEPT'), timeout: 15 }), ctx())).text), kind).toBe('[kept]');
        } finally { await m.dispose(); }
      }
    }, 90_000);
    it('the window\'s kill of a running command ends it and its grandchild, asks node-pty for no signal, and the next call is in a fresh shell', async () => {
      const { m, t, kills } = await recorded();
      const pidFile = join(root, 'grandchild.pid');
      const js = join(root, 'with-grandchild.cjs');
      writeFileSync(js, `const { spawn } = require('child_process'); spawn(process.execPath, ['-e', "require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)", ${JSON.stringify(pidFile)}], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(`${pidFile}.parent`)}, String(process.pid)); setInterval(() => {}, 1000);`);
      try {
        await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
        let pids: number[] = [];
        setTimeout(() => {
          pids = [Number(readFileSync(`${pidFile}.parent`, 'utf8')), Number(readFileSync(pidFile, 'utf8'))];
          void m.streams.kill(foregroundStreamId('orchestrator'));
        }, 2_500);
        const r = await t.execute(args({ command: `node '${js}'`, timeout: 20 }), ctx());
        expect(diag(r.text)).toMatchObject({ exit_code: -1, failure_kind: 'execution_error', kill_status: 'session_reset' });
        expect(r.text).toContain('killed from the terminal window');
        await new Promise((res) => setTimeout(res, 2_000));
        expect(pids.map(tasklistHas)).toEqual([false, false]);
        expect(kills.every((s) => s === undefined)).toBe(true);
        expect(diag((await t.execute(args({ command: SH.echo('next'), timeout: 15 }), ctx())).text)).toMatchObject({ exit_code: 0, session_reinitialized: true });
      } finally { await m.dispose(); }
    }, 60_000);
  });
});
