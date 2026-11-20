import { afterAll, describe, expect, it } from 'vitest';
import { foregroundStreamId } from '@rotaris/contracts';
import { shell, SH, ctx, manager, tool, diag, output, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 3 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
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
    // docs/archive/defects/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md (OQ-134, pinned below).
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
});
