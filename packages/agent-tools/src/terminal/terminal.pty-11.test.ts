import { afterAll, describe, expect, it } from 'vitest';
import { textOf } from '@rotaris/kernel';
import { shell, PS, SH, clocks, ctx, diag, output, args, disposeTerminalFixture, pausedSession, carried } from './terminal.test-support.js';

/**
 * Part 11 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
      expect(textOf(diag((await t.execute(args({ command: '' }), ctx())).text)['detail'] ?? '')).not.toMatch(/exit code 5/);
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
});
