import { afterAll, describe, expect, it } from 'vitest';
import { foregroundStreamId } from '@rotaris/contracts';
import { INTERRUPT_UNSEEN_NOTE, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, PS, SH, clocks, root, ctx, diag, output, earlierOutput, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 7 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
      began = clocks.monotonic.now();
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
});
