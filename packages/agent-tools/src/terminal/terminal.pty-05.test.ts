import { afterAll, describe, expect, it } from 'vitest';
import { foregroundStreamId } from '@rotaris/contracts';
import { stripVt } from './classify.js';
import { INTERRUPT_UNSEEN_NOTE, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, PS, SH, clocks, root, ctx, diag, output, earlierOutput, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 5 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  // docs/archive/defects/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md: the
  // OQ-38 case above types `x` and `y` with no Enter while its `sleep 3` runs soft-paused. The line discipline held them,
  // the next wrapped line was appended to them, `xyprintf: not found` replaced the start marker, and with no start marker
  // the capture kept the whole screen — `done-later`, the paused call's own `__rot_…_e:0`, the shell's error — while the
  // live stream, which opens only at the printed start marker (L9), carried nothing. POSIX only: the kill character is the
  // POSIX line discipline's, and PowerShell's first statement already takes a prefix without losing the start marker.
  it('REQ-TOOLS-096/097/127 (A10): keystrokes left without Enter under a soft-paused command neither leak its end frame and late output into the next call nor blank that call\'s live stream', async () => {
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
  it('REQ-TOOLS-098/179 (A10): a soft-paused command that ends behind the next call reports its own exit status, not the next call\'s', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('failed-later')}; ${SH.fails()}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      const next = await t.execute(args({ command: SH.echo('next-ok'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('next-ok');
      // OQ-164: the call that waited behind it reports the paused command's end — its own output and its own status, 1.
      // PowerShell's failing `Get-Item` prints its error after the line, where `false` prints nothing (run on PowerShell since
      // 2026-10-15, the Windows ARM64 session's B5).
      if (PS) expect(earlierOutput(next.text)?.startsWith('failed-later\n')).toBe(true);
      else expect(earlierOutput(next.text)).toBe('failed-later');
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

  // A10 on PowerShell (the Windows ARM64 session's B5, 2026-10-15; pwsh 7.6.6 and 5.1). The case above stays POSIX-only:
  // it writes its next line in the same tick as the C-c, and PowerShell discards a line that arrives with the interrupt
  // (docs/defects/on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md).
  it.runIf(PS)('REQ-TOOLS-096/098/179 (A10, OQ-146): on PowerShell, typeahead under a paused command leaks nothing, and no stale native exit status reaches the next call', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      for (const [then, expectedExit] of [[SH.echo('own-output'), 0], [`${SH.echo('own-output')}; ${SH.fails()}`, 1]] as const) {
        // A native command leaves `$LASTEXITCODE` at 3: the next call's status must be its own.
        expect(diag((await t.execute(args({ command: SH.exit(3), timeout: 15 }), ctx())).text)['exit_code']).toBe(3);
        expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
        expect(diag((await t.execute(args({ command: 'x', is_input: true }), ctx())).text)['exit_code']).toBe(0);
        expect(m.streams.sendKeys(foregroundStreamId('orchestrator'), 'y').ok).toBe(true);
        const session = m.session('s1:orchestrator', root);
        let tapped = '';
        const untap = session.onOutput((chunk) => { tapped += chunk; });
        const r = await t.execute(args({ command: then, timeout: 15 }), ctx());
        untap();
        expect(diag(r.text)['exit_code'], then).toBe(expectedExit);
        expect((output(r.text) ?? '').split('\n')[0], then).toBe('own-output');
        expect(r.text, then).not.toContain('__rot_');
        expect(r.text, then).not.toMatch(/not recognized/i);
        expect(stripVt(tapped).split('\n').map((l) => l.trim()).filter((l) => l !== '')[0], then).toBe('own-output');
        expect(earlierOutput(r.text), then).toBe('done-later');
      }
    } finally { await m.dispose(); }
  }, 60_000);
  it.runIf(PS)('REQ-TOOLS-098/127 (A10, OQ-147, OQ-168): on PowerShell a poll at once after C-c is OQ-168\'s soft pause, and the next calls report the end once, each with its own output', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
      const poll = await t.execute(args({ command: '' }), ctx());
      expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
      expect(String(diag(poll.text)['detail']).startsWith(INTERRUPT_UNSEEN_NOTE)).toBe(true);
      // The poll writes nothing and returns at once; a line written within the C-c's own tick would be discarded with it, which
      // no agent's next call can be (see the note above), so the next command comes a little later, as a model's does.
      await new Promise((res) => setTimeout(res, 200));
      const aaa = await t.execute(args({ command: SH.echo('AAA'), timeout: 15 }), ctx());
      expect(output(aaa.text)).toBe('AAA');
      expect(String(diag(aaa.text)['detail'])).toContain('with no exit status of its own');
      for (const leaked of ['__rot_', 'AAA', 'done-later', '__rot_b64__']) expect(earlierOutput(aaa.text) ?? '').not.toContain(leaked);
      const bbb = await t.execute(args({ command: SH.echo('BBB'), timeout: 15 }), ctx());
      expect(output(bbb.text)).toBe('BBB');
      expect(String(diag(bbb.text)['detail'])).toBe('The command exited with code 0.');
      expect((await t.execute(args({ command: '' }), ctx())).text).toContain('No paused command to poll.');
    } finally { await m.dispose(); }
  }, 60_000);

  // docs/archive/defects/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md: REQ-TOOLS-098's advice is to poll
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
});
