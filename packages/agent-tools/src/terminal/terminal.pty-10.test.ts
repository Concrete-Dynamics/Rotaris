import { afterAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { shell, PS, SH, root, bashAsSh, ctx, tool, diag, output, args, posixSession, disposeTerminalFixture, stagedAt, longCase } from './terminal.test-support.js';

/**
 * Part 10 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it.skipIf(PS)('REQ-TOOLS-096/098/179 (live-run M1): a command whose wrapper is longer than the PTY\'s input line reaches the shell whole', async () => {
    const { m, t } = await posixSession(shell!.file);
    try { await longCase(m, t, 'sh'); } finally { await m.dispose(); }
    // The staging directory goes with the session.
    expect(stagedAt).not.toBeNull();
    expect(existsSync(stagedAt!)).toBe(false);
  }, 90_000);
  it.runIf(bashAsSh !== null)('REQ-TOOLS-096/098/179 (live-run M1): under bash as `/bin/sh`, a command whose wrapper is longer than the PTY\'s input line reaches the shell whole', async () => {
    const { m, t } = await posixSession(bashAsSh!);
    try { await longCase(m, t, 'bash'); } finally { await m.dispose(); }
  }, 90_000);
  it.skipIf(PS)('REQ-TOOLS-096 (live-run M1): at the display\'s 20-column floor, a long command\'s capture carries no echo of its wrapper', async () => {
    const { m, t } = await posixSession(shell!.file, { cols: 20 });
    try { await longCase(m, t, 'narrow'); } finally { await m.dispose(); }
  }, 90_000);

  // The fin23 verifier's optional finding: a staging that throws (an unwritable temporary directory, a full disk) threw out
  // of the call after its state was set, which could leave the session waiting on a line it never wrote. It is now an
  // `execution_error` that never ran, and the session takes the next call as before.
  it.skipIf(PS)('REQ-TOOLS-096 (live-run M1): a long command that cannot be staged is an execution_error and leaves the session usable', async () => {
    const { m, t } = await posixSession(shell!.file);
    const saved = process.env['TMPDIR'];
    try {
      expect(diag((await t.execute(args({ command: SH.echo('warm'), timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
      process.env['TMPDIR'] = join(root, 'no-such-temporary-directory');
      const refused = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\nprintf 'ran\\n'`, timeout: 15 }), ctx());
      expect(diag(refused.text)).toMatchObject({ outcome_kind: 'execution_error', failure_kind: 'execution_error' });
      expect(refused.text).toContain('could not be staged in a script');
      expect(output(refused.text) ?? '').not.toContain('ran');
      if (saved === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = saved;
      const next = await t.execute(args({ command: SH.echo('after'), timeout: 15 }), ctx());
      expect(diag(next.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(next.text)).toBe('after');
      const long = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\nprintf 'ran\\n'`, timeout: 15 }), ctx());
      expect(diag(long.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
      expect(output(long.text)).toBe('ran');
    } finally {
      if (saved === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = saved;
      await m.dispose();
    }
  }, 60_000);

  it('ADR-0021 / REQ-TOOLS-097/113: the capture is the emulated screen, not a VT strip', async () => {
    const t = await tool();
    // ConPTY expresses a tab stop as a cursor-forward sequence; deleting it ran the columns together.
    const tabs = await t.execute(args({ command: PS ? "Write-Host ('a' + [char]9 + 'b')" : "printf 'a\\tb\\n'", timeout: 10 }), ctx());
    expect(output(tabs.text)).toBe('a       b');
    // A screen clear is a screen clear, not the rows of the screen left behind as blank lines.
    const clear = PS ? 'Clear-Host' : "printf '\\033[2J\\033[H'";
    const cleared = await t.execute(args({ command: `${SH.echo('BEFORE')}; ${clear}; ${SH.echo('AFTER')}`, timeout: 10 }), ctx());
    expect(output(cleared.text)).toBe('AFTER');
    // The 2026-09-12 run's OWN symptom, reproduced: an EMPTY write between two non-empty ones. The strip
    // returned `Total Endpoints: 0Resource Sections: 0File Size: 58 KB` — the production string byte for
    // byte, from a command carrying no newline at all. This is the trigger, and the one the 60 runs above
    // missed; see this ADR's note, where the reading it falsifies is kept beside it.
    const empties = await t.execute(args({ command: [SH.echo('Total Endpoints: 0'), SH.echo(''), SH.echo('Resource Sections: 0'), SH.echo(''), SH.echo('File Size: 58 KB')].join('; '), timeout: 10 }), ctx());
    expect(output(empties.text)).not.toContain('Total Endpoints: 0Resource Sections: 0');
    expect((output(empties.text) ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['Total Endpoints: 0', 'Resource Sections: 0', 'File Size: 58 KB']);
    // The same shape through `&&` and `echo`, which is how the run's other concatenation arrived.
    const chained = await t.execute(args({ command: 'echo "VERIFICATION: created successfully" && echo "" && echo "File exists:"', timeout: 10 }), ctx());
    expect(output(chained.text)).not.toContain('successfullyFile exists:');
    // A formatted table's rows stay on separate lines — true before this change and it must stay true.
    const file = join(root, 'measure.txt').replace(/\\/g, '\\\\');
    // PowerShell's own formatter produces the aligned rows; `printf` produces the same shape where there is no
    // `Measure-Object`. What is under test either way is that the rows reach the agent on separate lines.
    const measure = PS
      ? `Set-Content -LiteralPath '${file}' -Value 'alpha','beta','alpha'; Select-String 'alpha' -LiteralPath '${file}' | Measure-Object`
      : "printf 'Count             : 2\\nAverage           :\\nSum               :\\nMaximum           :\\nMinimum           :\\nProperty          :\\n'";
    const measured = await t.execute(args({ command: measure, timeout: 10 }), ctx());
    const rows = (output(measured.text) ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    // `Format-List` pads to its longest property: pwsh 7 lists `StandardDeviation`, Windows PowerShell 5.1 does not, so the
    // width is the shell's and the rows are what is under test
    // (`docs/archive/defects/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
    expect(rows[0]).toMatch(/^Count +: 2$/);
    expect(rows.some((r) => /^Property +:$/.test(r))).toBe(true);
    // REQ-TOOLS-113's checks read the cleaned text, never the echoed command line.
    expect(diag(measured.text)['warnings']).toEqual([]);
  }, 40_000);

  it('ADR-0020 c.1: the end marker never reaches the agent, not even when the output does not end in a newline', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: SH.echoNoNewline('Property          : '), timeout: 10 }), ctx());
    expect(r.text).not.toContain('__rot_');
    expect(output(r.text)).toBe('Property          :');
    const c = await t.execute(args({ command: PS ? "[Console]::Write('tail-no-newline')" : SH.echoNoNewline('tail-no-newline'), timeout: 10 }), ctx());
    expect(c.text).not.toContain('__rot_');
    expect(output(c.text)).toBe('tail-no-newline');
  }, 30_000);
});
