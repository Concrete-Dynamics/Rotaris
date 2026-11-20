import { afterAll, describe, expect, it } from 'vitest';
import { foregroundStreamId } from '@rotaris/contracts';
import { shell, PS, SH, clocks, ctx, diag, output, args, disposeTerminalFixture, pausedSession, carried } from './terminal.test-support.js';

/**
 * Part 13 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
});
