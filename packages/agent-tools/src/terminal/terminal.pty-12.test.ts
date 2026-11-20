import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { shell, PS, SH, clocks, root, ctx, diag, output, earlierOutput, args, disposeTerminalFixture, pausedSession } from './terminal.test-support.js';

/**
 * Part 12 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
});
