import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wrapCommand } from './foreground.js';
import { performance } from 'node:perf_hooks';
import { shell, PS, SH, root, bashAsSh, ctx, tool, diag, output, args, posixSession, disposeTerminalFixture, wideEchoCase } from './terminal.test-support.js';

/**
 * Part 9 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  // fin15's verification: where a startup file turns bash's readline back on, the sideways row it draws of the next call's
  // wrapper is too narrow below about 50 columns to carry the whole end statement, and it reached the interrupted call's
  // poll at 40 columns (`scrolledEcho` reads its tail).
  it.runIf(bashAsSh !== null)('REQ-TOOLS-127/128 (A10): under bash as `/bin/sh` with its line editor turned back on by `$ENV`, no width lets the echo of a next call reach the paused call\'s poll', async () => {
    const envFile = join(root, 'editor-on.sh');
    writeFileSync(envFile, 'set -o emacs\n');
    for (const cols of [20, 40, 240]) {
      const { m, t } = await posixSession(bashAsSh!, { env: { ENV: envFile }, cols });
      try {
        expect(output((await t.execute(args({ command: 'set -o', timeout: 15 }), ctx())).text)).toMatch(/^emacs\s+on$/m);
        await wideEchoCase(t);
      } finally { await m.dispose(); }
    }
  }, 240_000);

  /**
   * ADR-0020's second first execution, 2026-09-12: four defects a real 22-minute run found. Each proof
   * below was RED against the code that run exercised.
   */
  it('REQ-TOOLS-097/099, REQ-CONFIG-116: a call that supplies NO timeout is still bounded by runtime.shell_command_timeout', async () => {
    // REQ-TOOLS-097's two bounds hold TOGETHER and the first REACHED governs. This call names no `timeout`
    // of its own, so BOTH arm: a 1 s `runtime.shell_command_timeout` and the shared session's 1.5 s no-output
    // window. Both timers start in the same turn, so which one is nearer is fixed by the two numbers and not
    // by how quickly the shell answers — full-suite load delays both and cannot reorder them.
    const t1 = await tool({ commandTimeoutS: 1 });
    const r = await t1.execute(args({ command: `${SH.sleep(40)}; ${SH.echo('late')}` }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: 124, timeout: true, failure_kind: 'timeout', kill_status: 'session_reset', outcome_kind: 'timeout', timeout_seconds: 1 });
    expect(r.text).toContain('the terminal session was forcibly restarted to terminate the process tree');
    expect(r.text).toContain('[partial_terminal_output]');
  }, 25_000);

  // The three proofs below name a `timeout`, which is the agent declaring how long it will wait and takes the
  // no-output window out of the picture (REQ-TOOLS-097). What they are about is the wrapper, the capture and the
  // marker, not the pause, and under full-suite load a real shell can take longer than the window to answer.
  it('REQ-TOOLS-097/179 (ADR-0020, amended): a multi-line command keeps its newlines, and the exit status still comes out of it', async () => {
    const t = await tool();
    const heredoc = PS ? '$t = @"\nLINE ONE\nLINE TWO\n"@\nWrite-Output $t' : 't="LINE ONE\nLINE TWO"\nprintf \'%s\\n\' "$t"';
    const here = await t.execute(args({ command: heredoc, timeout: 10 }), ctx());
    expect(diag(here.text)['exit_code']).toBe(0);
    expect(output(here.text)).toBe('LINE ONE\nLINE TWO');
    const loop = PS
      ? 'foreach ($i in 1..3) {\n  if ($i -eq 2) { Write-Output "two" }\n  else { Write-Output "n$i" }\n}'
      : 'for i in 1 2 3; do\n  if [ "$i" -eq 2 ]; then printf \'two\\n\'\n  else printf \'n%s\\n\' "$i"; fi\ndone';
    const block = await t.execute(args({ command: loop, timeout: 10 }), ctx());
    expect(diag(block.text)['exit_code']).toBe(0);
    expect(output(block.text)).toBe('n1\ntwo\nn3');
    // REQ-TOOLS-179: a native non-zero status and a failing cmdlet both still reach the observation.
    const native = await t.execute(args({ command: `${SH.echo('before')}\n${SH.exit(9)}`, timeout: 10 }), ctx());
    expect(diag(native.text)['exit_code']).toBe(9);
    expect(output(native.text)).toBe('before');
    const cmdlet = await t.execute(args({ command: `${SH.echo('before')}\n${SH.fails()}`, timeout: 10 }), ctx());
    expect(diag(cmdlet.text)['exit_code']).toBe(1);
    // A terminating error inside the payload returns its own failure rather than wedging until the hard cap.
    // A terminating error in PowerShell; a subshell that writes the same word and fails, in sh. Both must come
    // back as the payload's own failure rather than wedging the session until the hard cap.
    const raise = PS ? "Write-Output 'a'\nthrow 'boom'" : `${SH.echo('a')}\n(${SH.echoErr('boom')}; exit 1)`;
    const thrown = await t.execute(args({ command: raise, timeout: 10 }), ctx());
    expect(diag(thrown.text)['exit_code']).toBe(1);
    expect(output(thrown.text)).toContain('boom');
    // The tool's own promise: what a command sets persists into the next call, multi-line payload included.
    const keep = PS ? "$rotMulti = 'kept'\n$null = 1" : "rotMulti='kept'\n:";
    await t.execute(args({ command: keep, timeout: 10 }), ctx());
    const kept = PS ? 'Write-Output "[$rotMulti]"' : 'printf \'[%s]\\n\' "$rotMulti"';
    expect(output((await t.execute(args({ command: kept, timeout: 10 }), ctx())).text)).toBe('[kept]');
    // FALSIFIED, kept: "A single-line command keeps today's wrapper, byte for byte." A single line spliced raw lost its end
    // frame to a terminating or parse error (the case below); since 2026-10-15 one line takes the multi-line path too.
    expect(wrapCommand({ kind: 'powershell', file: 'pwsh' }, 'git status', 'S', 'E')).toContain('FromBase64String');
  }, 60_000);

  // docs/archive/defects/a-single-line-powershell-command-that-throws-loses-its-end-frame.md (Windows ARM64 session B3, 2026-10-15): on
  // one line, a terminating error abandoned the rest of the wrapper's line and a parse error ran none of it, so the end
  // frame never printed and a command that failed at once read as the hard timeout, 124, with its session reset.
  it.runIf(PS)('REQ-TOOLS-097/179: a single-line command that throws or does not parse ends with exit 1 and its own error, never at the hard cap, and the session keeps its state', async () => {
    const t = await tool();
    await t.execute(args({ command: "$env:ROTARIS_B3_KEPT = 'kept'", timeout: 10 }), ctx());
    const failing: [string, string | null][] = [
      ["Write-Output 'a'; throw 'boom'", 'boom'],
      ["throw 'boom'", 'boom'],
      ["Write-Error 'boom' -ErrorAction Stop", 'boom'],
      ["$ErrorActionPreference = 'Stop'; Get-Item C:\\definitely\\not\\here.txt", 'here.txt'],
      // A line that does not parse: nothing of it runs, and the parser's own message is the output.
      ["Write-Output 'x'; if (", null],
    ];
    for (const [command, says] of failing) {
      const started = performance.now();
      const r = await t.execute(args({ command, timeout: 10 }), ctx());
      expect(performance.now() - started, command).toBeLessThan(5_000);
      expect(diag(r.text), command).toMatchObject({ exit_code: 1, outcome_kind: 'shell_failure' });
      expect(diag(r.text)['kill_status'], command).toBeUndefined();
      if (says !== null) expect(output(r.text), command).toContain(says);
      else expect((output(r.text) ?? '').trim(), command).not.toBe('');
      // A parse error names the command alone, never the flag's line appended after it.
      if (says === null) expect(output(r.text), command).not.toContain('_ok = $?');
      // pwsh's concise error view names the command, never the wrapper around it. Windows PowerShell 5.1's error record
      // quotes the wrapper's line and the script block's text however the command is carried
      // (docs/defects/windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md), so that half is pwsh's only.
      if (/pwsh\.exe$/i.test(shell!.file)) {
        expect(output(r.text), command).not.toContain('LASTEXITCODE');
        expect(output(r.text), command).not.toContain('__rot_');
      }
    }
    // Nothing was reset: what the session set before the failures is still set, and the session was not reinitialized.
    const kept = await t.execute(args({ command: "$ErrorActionPreference = 'Continue'; Write-Output \"[$env:ROTARIS_B3_KEPT]\"", timeout: 10 }), ctx());
    expect(output(kept.text)).toBe('[kept]');
    expect(diag(kept.text)['session_reinitialized']).not.toBe(true);
  }, 60_000);
  // M1's PowerShell half, measured 2026-10-15 on Windows 11 ARM64 under pwsh 7.6.6 and Windows PowerShell 5.1: ConPTY and the
  // console host cap no submitted line short of 87 KB (a 64 KB command carried as base64), so PowerShell keeps its one line.
  // One case well over Linux's 4,095-character line pins it.
  it.runIf(PS)('REQ-TOOLS-096/098/179 (live-run M1): on PowerShell a command far longer than a POSIX PTY\'s line reaches the shell whole, one line or many', async () => {
    const t = await tool();
    const raw = `$x = '${'a'.repeat(16 * 1024)}'; Write-Output $x.Length`;
    const a = await t.execute(args({ command: raw, timeout: 60 }), ctx());
    expect(diag(a.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
    expect(output(a.text)).toBe('16384');
    // A here-string with the characters a carrier could mangle, written and read back byte for byte.
    const body = Array.from({ length: 128 }, (_, i) => `${String(i).padStart(5, '0')} quote' "dq" back\`tick $dollar %pct% é 中 ${'z'.repeat(20)}`).join('\n');
    const file = join(root, 'm1-ps.txt');
    const b = await t.execute(args({ command: `$t = @'\n${body}\n'@\nSet-Content -LiteralPath '${file}' -Value $t -NoNewline -Encoding utf8`, timeout: 60 }), ctx());
    expect(diag(b.text)['exit_code']).toBe(0);
    expect(readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')).toBe(body);
    // What a long command sets reaches the next call; a long multi-line command reports its native status.
    await t.execute(args({ command: `$env:ROTARIS_M1_LONG = '${'L'.repeat(8 * 1024)}'`, timeout: 60 }), ctx());
    expect(output((await t.execute(args({ command: 'Write-Output $env:ROTARIS_M1_LONG.Length', timeout: 30 }), ctx())).text)).toBe('8192');
    const d = await t.execute(args({ command: `$y = '${'d'.repeat(8 * 1024)}'\nWrite-Output $y.Length\ncmd /c exit 7`, timeout: 60 }), ctx());
    expect(diag(d.text)).toMatchObject({ exit_code: 7, outcome_kind: 'shell_failure' });
    for (const r of [a, b, d]) {
      expect(r.text).not.toContain('__rot_');
      expect(output(r.text)).not.toMatch(/^>> /m);
    }
  }, 120_000);
});
