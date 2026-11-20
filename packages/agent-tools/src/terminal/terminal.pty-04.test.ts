import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import { shell, SH, clocks, root, ctx, diag, output, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 4 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it('PD-TOOLS-001 (OQ-134): a reset restores the snapshot of the last command the product saw complete, so a soft-paused command that completed unseen is not in it', async () => {
    // A session of its own, so no other case's snapshot or paused command stands in it.
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 });
    // The variable's command also writes the variable's value to this file, so the case can see, from outside the
    // terminal, that the shell ran it and held the variable — before the reset, which is what OQ-134 is about.
    const marker = join(root, 'oq133-unseen.txt');
    rmSync(marker, { force: true });
    try {
      await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
      // A quiet command soft-pauses at ~1.5 s and keeps running; the next call queues behind it in the shell's input.
      expect(diag((await t.execute(args({ command: SH.sleep(8) }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      // Named no timeout, the variable's call meets 1.5 s more of silence and soft-pauses at ~3 s, long before the
      // `sleep 8` ends: the command has not run yet, so the file is absent, and its completion will never be seen.
      const unseen = await t.execute(args({ command: `${SH.setVar('ROTARIS_UNSEEN', 'set')}; ${SH.writeVar('ROTARIS_UNSEEN', marker)}` }), ctx());
      expect(diag(unseen.text)['outcome_kind']).toBe('soft_pause');
      expect(existsSync(marker)).toBe(false);
      // The `sleep 8` ends and the queued command runs, unseen. Wait for its file rather than for a time.
      const ranBy = (clocks.monotonic.now() as number) + 20_000;
      while (!existsSync(marker) || readFileSync(marker, 'utf8').trim() === '') {
        expect(clocks.monotonic.now() as number).toBeLessThan(ranBy);
        await new Promise((res) => setTimeout(res, 50));
      }
      // The shell held the variable before the respawn.
      expect(readFileSync(marker, 'utf8').trim()).toBe('set');
      const r = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx());
      expect(diag(r.text)).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
      expect(r.text).toContain('were restored');
      // What was restored is the `ready` call's snapshot, the last the product saw complete, which never held it.
      expect(output((await t.execute(args({ command: SH.bracketVar('ROTARIS_UNSEEN'), timeout: 15 }), ctx())).text)).toBe('[]');
      // The same sequence with a call that names its timeout does not pause, is seen to complete, and is restored.
      expect(diag((await t.execute(args({ command: SH.sleep(5) }), ctx())).text)['outcome_kind']).toBe('soft_pause');
      expect(diag((await t.execute(args({ command: SH.setVar('ROTARIS_SEEN', 'set'), timeout: 15 }), ctx())).text)['outcome_kind']).toBe('success');
      expect((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx())).text).toContain('were restored');
      expect(output((await t.execute(args({ command: SH.bracketVar('ROTARIS_SEEN'), timeout: 15 }), ctx())).text)).toBe('[set]');
    } finally { await m.dispose(); rmSync(marker, { force: true }); }
  }, 60_000);
});
