/**
 * The `terminal` scenario's readers, pinned where they can fail loudly.
 *
 * The scenario itself cannot run here — it needs a real endpoint, a real model and the built application — but
 * the part of it that can be silently wrong can. A `match` that no longer matches its own command turns every
 * assertion in that scenario into "the model never attempted it": a NOTE, a green run, and a question that
 * stopped being asked without anybody being told. That is the failure this file exists to make impossible, and
 * it is the same shape as the finding `codebase.md` records for 2026-09-12 — **a proof that cannot fail is a
 * finding**, not a pass.
 *
 * Two directions are pinned, because one alone proves nothing: every shape matches its OWN command, and no
 * shape matches ANOTHER's. The second is what stops one shape's checks running against another shape's call.
 *
 * The long-output reading is verified against a real shell, so the arithmetic the scenario asserts is measured
 * rather than assumed. So is the `failed-word` shape's command, whose printed line the PD-TOOLS-003 guard depends
 * on, and `outputOf` is pinned to read that printed output and never the command the diagnostic repeats.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error — the shapes are plain ESM beside the script that replays them.
import { DEFAULT_SHELL_COMMAND_TIMEOUT_S, GATE_REFUSALS, LONG_OUTPUT_LINES, PTY_INPUT_LINE_BYTES, STEADY_INTERVAL_MS, STEADY_TICKS, attemptCount, diagnosticOf, endedShellReading, hardCapReading, hereStringLinesReturned, interruptedPollReading, longCommandReading, longOutputReading, notReachedNote, outputOf, pairNotReachedNote, pausedBehindReading, reachedShape, replacedShellReading, shapeSends, terminalRunEndReading, terminalShapes, terminalWaitMs, unexpandableReading } from './terminal-shapes.mjs';

interface Shape { readonly id: string; readonly match: RegExp; readonly command: string; readonly prompt?: string }

const PLATFORMS = ['win32', 'linux'] as const;

describe('the terminal shapes the live run replays', () => {
  for (const platform of PLATFORMS) {
    describe(platform, () => {
      const shapes: Shape[] = terminalShapes(platform);

      it('carries every shape of its platform, each named once', () => {
        // Live-run L1's `unexpandable` is POSIX only: PowerShell has no such expansion. So is acceptance A9's
        // `replaces-shell` (PowerShell has no `exec`), and it comes first so `unexpandable` shows which shell followed it.
        // Live-run L2's `poll` follows the wedge on both.
        // The interrupt (OQ-147) follows the poll on both, and its prompt asks for the poll after it.
        // `ends-shell` (OQ-144's sibling case) is POSIX only here, and the wedge after it is the call that must report the
        // respawn. `wedge-again` and the command issued behind it (OQ-164) follow the interrupt on both. Live-run M1's
        // `long-command` is POSIX only, ahead of `replaces-shell` so it meets the session's own `/bin/sh`. `steady`, the
        // default hard cap's shape, is last on both: the cap resets the shell, and no shape after it should meet a fresh one.
        expect(shapes.map((s) => s.id)).toEqual(platform === 'win32'
          ? ['here-string', 'long-output', 'wedge', 'poll', 'interrupt', 'wedge-again', 'behind-paused', 'failed-word', 'diff-exit-1', 'pipe-to-shell', 'steady']
          : ['here-string', 'long-output', 'long-command', 'replaces-shell', 'unexpandable', 'ends-shell', 'wedge', 'poll', 'interrupt', 'wedge-again', 'behind-paused', 'failed-word', 'diff-exit-1', 'pipe-to-shell', 'steady']);
      });

      it('matches its own command — the round trip the scenario depends on', () => {
        for (const shape of shapes) {
          expect(shape.match.test(shape.command), `${shape.id} does not match its own command: ${shape.command}`).toBe(true);
        }
      });

      it('matches no other shape\'s command, so one shape\'s checks cannot read another\'s call', () => {
        for (const shape of shapes) {
          for (const other of shapes) {
            if (other.id === shape.id) continue;
            expect(shape.match.test(other.command), `${shape.id} also matches ${other.id}: ${other.command}`).toBe(false);
          }
        }
      });

      it('sends the here-string as a genuinely multi-line command', () => {
        const hereString = shapes.find((s) => s.id === 'here-string');
        expect(hereString?.command.split('\n').length).toBeGreaterThan(2);
      });

      /*
       * The wedge must outlast the product's own no-output window (30 s, `config.noOutputWindowMs`), or a bound
       * firing would be the command ending on its own rather than the product bounding it — and the scenario
       * would report a hard cap that was never tested. The caller's `timeout` argument is what the PROMPT
       * forbids and what the scenario reads off `args.timeout`; the command itself cannot express it.
       */
      it('wedges for longer than the soft pause, so a bound that fires is the product\'s', () => {
        const wedge = shapes.find((s) => s.id === 'wedge');
        const ms = Number(/,\s*(\d+)\s*\)/.exec(wedge?.command ?? '')?.[1] ?? 0);
        expect(ms).toBeGreaterThan(30_000);
        // OQ-164: the second wedge soft-pauses at 30 s and is still running when the next command is issued.
        const again = Number(/(\d+)/.exec(shapes.find((s) => s.id === 'wedge-again')?.command ?? '')?.[1] ?? 0);
        expect(again * 1000).toBeGreaterThan(30_000);
      });

      /*
       * `docs/defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`: the silent wedge soft-pauses
       * at 30 s, 70 s before REQ-CONFIG-116's 100 s cap, so the cap was never reached. `steady` prints more often than the
       * no-output window, so the soft pause never fires, and for longer than the cap, so the cap is the bound that ends it.
       */
      it('prints more often than the no-output window and for longer than the default hard cap', () => {
        const steady = shapes.find((s) => s.id === 'steady')!;
        expect(steady.command).toContain(`n === ${STEADY_TICKS}`);
        expect(steady.command).toContain(`}, ${STEADY_INTERVAL_MS})`);
        expect(STEADY_INTERVAL_MS).toBeLessThan(30_000);
        expect(STEADY_INTERVAL_MS * STEADY_TICKS).toBeGreaterThan(DEFAULT_SHELL_COMMAND_TIMEOUT_S * 1000 + 20_000);
        // PowerShell expands `$` inside double quotes; the command has none, so it reaches node as written on both.
        expect(steady.command).not.toContain('$');
      });
    });
  }
});

/*
 * Live-run finding M1: a command past the PTY's input line never reached the shell and read as a soft pause with `>`.
 * The shape must be long enough to ask that question, its count must be what a real shell prints for it, and the reader
 * must fail the signature and pass only a count that matches the command the model sent.
 */
describe('the long-command check (live-run M1)', () => {
  const command = terminalShapes('linux').find((s: Shape) => s.id === 'long-command')!.command;
  const observe = (printed: string, diagnostic: Record<string, unknown>) => [
    'The command exited.',
    '[terminal_output]',
    printed,
    `[terminal_diagnostic] ${JSON.stringify({ command, warnings: [], ...diagnostic })}`,
  ].join('\n');

  it('is longer than the PTY\'s input line on its own, before any wrapper', () => {
    expect(Buffer.byteLength(command)).toBeGreaterThan(PTY_INPUT_LINE_BYTES);
    expect(command.split('\n').length).toBeGreaterThan(40);
  });

  it.skipIf(!existsSync('/bin/sh'))('expects the count a real shell prints for it', () => {
    const run = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    const reading = longCommandReading(command, observe(run.stdout.trim(), { exit_code: 0, outcome_kind: 'success' }), 120);
    expect(reading).toMatchObject({ kind: 'whole', counted: reading.expected });
    expect(reading.expected).toBeGreaterThan(4_000);
  });

  it('reads M1\'s signature, a soft pause with only the continuation prompt, as paused', () => {
    expect(longCommandReading(command, observe('>', { exit_code: -1, outcome_kind: 'soft_pause' }), 30_016).kind).toBe('paused');
    // A late end, past the no-output window, is the same signature even with a status.
    expect(longCommandReading(command, observe('4472', { exit_code: 0, outcome_kind: 'success' }), 30_500).kind).toBe('paused');
  });

  it('credits only the count of the command as sent: a cut body is other, a short command is unasked', () => {
    const reading = longCommandReading(command, observe('17', { exit_code: 0, outcome_kind: 'success' }), 200);
    expect(reading.kind).toBe('other');
    const short = "wc -c <<'ROWS'\nrow-01 a\nROWS";
    expect(longCommandReading(short, observe('9', { exit_code: 0, outcome_kind: 'success' }), 100)).toMatchObject({ kind: 'short', expected: 9, counted: 9 });
    const unclosed = command.replace(/\nROWS$/, '');
    expect(longCommandReading(unclosed, observe('4472', { exit_code: 0, outcome_kind: 'success' }), 100)).toMatchObject({ kind: 'other', expected: null });
  });
});

describe('the terminal diagnostic reader', () => {
  it('reads the block a terminal observation ends with', () => {
    const observation = [
      'The command exited with code 1.',
      '[terminal_output]',
      'diff --git a/x b/y',
      '[terminal_diagnostic] {"backend":"pty","command":"git diff","exit_code":1,"outcome_kind":"success_with_output","warnings":[]}',
    ].join('\n');
    expect(diagnosticOf(observation)).toMatchObject({ exit_code: 1, outcome_kind: 'success_with_output' });
  });

  it('answers null rather than throwing on an observation that carries none', () => {
    expect(diagnosticOf('the tool was blocked before it ran')).toBeNull();
    expect(diagnosticOf('[terminal_diagnostic] {not json}')).toBeNull();
    expect(diagnosticOf(undefined)).toBeNull();
  });

  it('reads the LAST block when an observation quotes an earlier one in its own output', () => {
    const nested = [
      '[terminal_output]',
      '[terminal_diagnostic] {"exit_code":0,"outcome_kind":"success"}',
      '[terminal_diagnostic] {"exit_code":124,"outcome_kind":"timeout"}',
    ].join('\n');
    expect(diagnosticOf(nested)).toMatchObject({ exit_code: 124 });
  });
});

describe('the terminal output reader', () => {
  const observe = (command: string, printed: string) => [
    'The command exited with code 0.',
    '[terminal_output]',
    printed,
    `[terminal_diagnostic] ${JSON.stringify({ command, exit_code: 0, outcome_kind: 'success', warnings: [] })}`,
  ].join('\n');

  /*
   * The reason it exists: the diagnostic repeats the command, so a pattern taken from the command matches the
   * whole result even when the command printed nothing — and a check reading the whole result cannot fail.
   */
  it('reads what the command printed, never the command the diagnostic repeats', () => {
    const command = "node -e \"console.log('failed to connect to the docker API')\"";
    expect(outputOf(observe(command, 'failed to connect to the docker API'))).toBe('failed to connect to the docker API');
    expect(outputOf(observe(command, '(no output)'))).toBe('(no output)');
    expect(observe(command, '(no output)')).toMatch(/failed to connect to the docker API/);
  });

  it('keeps every printed line, a quoted observation included, and answers null where there is no section', () => {
    const quoting = observe('cat log', ['a', '[terminal_output]', 'b', '[terminal_diagnostic] {"exit_code":1}'].join('\n'));
    expect(outputOf(quoting)).toBe(['a', '[terminal_output]', 'b', '[terminal_diagnostic] {"exit_code":1}'].join('\n'));
    expect(outputOf('the tool was blocked before it ran')).toBeNull();
    expect(outputOf(undefined)).toBeNull();
  });
});

describe('the here-string check', () => {
  const observe = (platform: 'win32' | 'linux', printed: string) => {
    const command = terminalShapes(platform).find((s) => s.id === 'here-string')!.command;
    return [
      'The command exited with code 0.',
      '[terminal_output]',
      printed,
      `[terminal_diagnostic] ${JSON.stringify({ command, exit_code: 0, outcome_kind: 'success', warnings: [] })}`,
    ].join('\n');
  };

  /*
   * The defect: the command carries both words and the diagnostic repeats the command, so a check over the whole
   * result passed for a shell that printed nothing. This is the observation it passed on, and it must fail now.
   */
  it('fails an observation whose output is (no output), although the diagnostic repeats both words', () => {
    for (const platform of PLATFORMS) {
      const observation = observe(platform, '(no output)');
      expect(observation).toMatch(/alpha-one/);
      expect(observation).toMatch(/beta-two/);
      expect(hereStringLinesReturned(observation), `${platform}: a no-output observation passed`).toBe(false);
    }
  });

  it('passes only when both lines were printed, and fails on one line or no output section at all', () => {
    for (const platform of PLATFORMS) {
      expect(hereStringLinesReturned(observe(platform, 'alpha-one\nbeta-two'))).toBe(true);
      expect(hereStringLinesReturned(observe(platform, 'alpha-one'))).toBe(false);
    }
    expect(hereStringLinesReturned('the tool was blocked before it ran')).toBe(false);
    expect(hereStringLinesReturned(undefined)).toBe(false);
  });
});

describe('the docker line the failed-word shape replays', () => {
  /*
   * PD-TOOLS-003's guard asserts that this line does NOT warn, which is only a guard while the command prints the
   * record's line in lower case and exits 0. Run for real, as the long-output shape is, so that is measured.
   */
  it('prints run 2e21e324\'s docker line in lower case and exits 0, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'failed-word')!.command;
    const run = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 60_000 })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    expect(run.status, String(run.error ?? run.stderr)).toBe(0);
    expect(run.stdout.trim()).toBe('failed to connect to the docker API');
  });
});

describe('the bash-ism the unexpandable shape replays (live-run L1)', () => {
  /*
   * The shape is a guard only while it carries the input that failed: an expansion the host's `/bin/sh` cannot
   * perform. Measured where that shell is dash, as it was on the live run's host; a `/bin/sh` that is bash expands
   * it, and there the shape asks nothing of the wrapper's guard.
   */
  const dash = process.platform !== 'win32' && existsSync('/bin/sh') && realpathSync('/bin/sh').endsWith('dash');
  it.skipIf(!dash)('fails to expand under a dash /bin/sh, after printing its first line, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'unexpandable')!.command;
    const run = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    expect(run.stdout.trim()).toBe('ran');
    expect(run.stderr).toMatch(/Bad substitution/);
    expect(run.status).not.toBe(0);
  });

  /*
   * What the scenario credits (the verifier's second round). Two observations recorded verbatim from the live runs of
   * 2026-09-29: the builder's (pack `2026-09-29T21-26-58-720Z`, call #6), where dash refused the line, and the
   * verifier's (pack `2026-09-29T22-08-13-005Z`, call #8), where the model had run `exec bash` first and bash expanded
   * it. The second passed all three of the scenario's checks before, with the guard never asked.
   */
  const command = `printf '%s\\n' ran; echo \\"EXIT=\${PIPESTATUS[0]}\\"`;
  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command, timeout: false, timeout_seconds: 100, warnings: [], ...fields })}`;
  const refusedByDash = `The command exited with code 2.\n[terminal_output]\nran\n/bin/sh: 1: eval: Bad substitution\n${diagnostic({ detail: 'The command exited with code 2.', exit_code: 2, outcome_kind: 'shell_failure', outcome_severity: 'error' })}`;
  const expandedByBash = `The command exited with code 0.\n[terminal_output]\nran\nEXIT=0\n${diagnostic({ detail: 'The command exited with code 0.', exit_code: 0, outcome_kind: 'success', outcome_severity: 'info' })}`;
  const softPaused = `No output for 30 seconds …\n[terminal_output]\nran\n${diagnostic({ detail: 'The command is still running; this is the output so far. Poll again with an empty command.', exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' })}`;
  it('credits the guard only where the shell refused the expansion; an expansion is unasked, and L1\'s soft pause is a failure', () => {
    expect(unexpandableReading(refusedByDash, 14)).toMatchObject({ kind: 'refused', exit: 2, badSubstitution: true });
    expect(unexpandableReading(expandedByBash, 21)).toMatchObject({ kind: 'expanded', exit: 0, badSubstitution: false });
    expect(unexpandableReading(softPaused, 30_027)).toMatchObject({ kind: 'paused', exit: -1 });
    // A refusal that took the whole window is L1's signature too, whatever the exit code says.
    expect(unexpandableReading(refusedByDash, 30_000).kind).toBe('paused');
    // The diagnostic repeats the command, which carries `EXIT=`; the reading looks at what the shell printed alone.
    expect(unexpandableReading(`[terminal_output]\n(no output)\n${diagnostic({ exit_code: 0, outcome_kind: 'success' })}`, 5).kind).toBe('other');
  });
});

describe('the shell replacement the replaces-shell shape replays (acceptance A9, OQ-144)', () => {
  /*
   * The verifier's live run of 2026-09-29 (pack `2026-09-29T22-08-13-005Z`, call #5) recorded `exec bash` as a soft pause
   * after 30,027 ms. The repaired product ends such a call at once as an `execution_error` with no exit code; a host with
   * no bash answers 127 and replaces nothing.
   */
  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command: 'exec bash', timeout: false, timeout_seconds: 100, warnings: [], ...fields })}`;
  const detail = "Terminal execution failed before completion: the command replaced the session's shell (as `exec <program>` does), so the command never returned and has no exit code.";
  const restarted = `${detail}\n[terminal_output]\n#\n${diagnostic({ detail, error_class: 'ExecutionError', failure_kind: 'execution_error', kill_status: 'session_reset', outcome_kind: 'execution_error', outcome_severity: 'error' })}`;
  const softPaused = `No output for 30 seconds …\n[terminal_output]\n(no output)\n${diagnostic({ detail: 'No output for 30 seconds in the merged terminal stream.', exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning', session_reinitialized: true })}`;
  const notFound = `The command exited with code 127.\n[terminal_output]\n/bin/sh: 1: exec: bash: not found\n${diagnostic({ detail: 'The command exited with code 127.', exit_code: 127, outcome_kind: 'shell_failure', outcome_severity: 'error' })}`;
  it('credits the repair only for an at-once execution_error that says the shell was replaced; A9\'s soft pause is a failure', () => {
    expect(replacedShellReading(restarted, 215)).toMatchObject({ kind: 'restarted', exit: null, killStatus: 'session_reset' });
    expect(replacedShellReading(softPaused, 30_027)).toMatchObject({ kind: 'paused', exit: -1 });
    // The right words after the whole window are A9's signature all the same.
    expect(replacedShellReading(restarted, 30_000).kind).toBe('paused');
    expect(replacedShellReading(notFound, 12)).toMatchObject({ kind: 'not-replaced', exit: 127 });
    expect(replacedShellReading(`[terminal_output]\n(no output)\n${diagnostic({ failure_kind: 'execution_error', outcome_kind: 'execution_error' })}`, 5).kind).toBe('other');
  });
});

describe('the shell exit the ends-shell shape replays (OQ-144\'s sibling case)', () => {
  /*
   * `docs/defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md`: `exit 3` read as a soft pause after
   * the whole no-output window (3,007 ms against a 3 s window, measured when it was recorded). The repaired product ends
   * such a call at once as an `execution_error` with no exit code, and respawns the shell.
   */
  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command: 'exit 3', timeout: false, timeout_seconds: 100, warnings: [], ...fields })}`;
  const detail = "Terminal execution failed before completion: the command ended the session's shell (as `exit` or a signal to the shell does), so the command never returned and has no exit code. The terminal session was restarted with `/bin/sh`.";
  const restarted = `${detail}\n[terminal_output]\n(no output)\n${diagnostic({ detail, error_class: 'ExecutionError', failure_kind: 'execution_error', kill_status: 'session_reset', outcome_kind: 'execution_error', outcome_severity: 'error' })}`;
  const softPaused = `No output for 30 seconds …\n[terminal_output]\n(no output)\n${diagnostic({ detail: 'No output for 30 seconds in the merged terminal stream.', exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' })}`;
  const ownExit = `The command exited with code 3.\n[terminal_output]\n(no output)\n${diagnostic({ detail: 'The command exited with code 3.', exit_code: 3, outcome_kind: 'shell_failure', outcome_severity: 'error' })}`;
  it('credits the repair only for an at-once execution_error that says the shell ended; the defect\'s soft pause is a failure', () => {
    expect(endedShellReading(restarted, 31)).toMatchObject({ kind: 'restarted', exit: null, killStatus: 'session_reset' });
    expect(endedShellReading(softPaused, 30_007)).toMatchObject({ kind: 'paused', exit: -1 });
    expect(endedShellReading(restarted, 30_000).kind).toBe('paused');
    expect(endedShellReading(ownExit, 12)).toMatchObject({ kind: 'other', exit: 3 });
    // The replaced shell's words are not this shape's: an `exit 3` told it replaced the shell read the exiting shell's `/proc`
    // entry as another program's (docs/defects/fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md).
    expect(endedShellReading(restarted.replaceAll('ended the session', 'replaced the session'), 31).kind).toBe('replaced');
  });
});

describe('the command issued behind a soft-paused one (OQ-164)', () => {
  /*
   * `docs/defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md`: in the autopsy's run the
   * command issued behind the wedge said only "The command exited with code 0." The repaired product names the paused
   * command and its end in the detail.
   */
  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command: "printf '%s\\n' behind-the-wedge", exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', timeout: false, timeout_seconds: 100, warnings: [], ...fields })}`;
  const observation = (detail: string) => `${detail}\n[terminal_output]\nbehind-the-wedge\n${diagnostic({ detail })}`;
  const waited = observation("This command was submitted while the soft-paused command `sleep 45; printf '%s\\n' slept` was still running, and waited behind it: that command ended 5.9 seconds after this command was submitted, with exit code 0. The command exited with code 0.");
  const before = observation("The soft-paused command `sleep 45; printf '%s\\n' slept` had ended 2.0 seconds before this command was submitted, with exit code 0, and no poll had reported it. The command exited with code 0.");
  const running = observation("This command was submitted while the soft-paused command `sleep 45; printf '%s\\n' slept` was still running, and that command is still running: the shell has not started this command yet, and runs it once that command ends. No output for 30 seconds …");
  const silent = observation('The command exited with code 0.');
  it('credits only a report of the paused command\'s end; the autopsy\'s silence is a failure', () => {
    expect(pausedBehindReading(waited)).toMatchObject({ kind: 'reported', waited: true, exit: 0 });
    expect(pausedBehindReading(before)).toMatchObject({ kind: 'reported', waited: false });
    expect(pausedBehindReading(running).kind).toBe('still-running');
    expect(pausedBehindReading(silent).kind).toBe('silent');
    expect(pausedBehindReading('the tool was blocked before it ran').kind).toBe('other');
  });
});

describe('the poll after the interrupt shape (OQ-147)', () => {
  /*
   * `docs/defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md`: before the repair the poll
   * after `C-c` read a soft pause over a process the interrupt had ended. The repaired product reports OQ-147's reading, confirmed 2026-10-06 by R-071.
   */
  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command: '', timeout: false, timeout_seconds: 100, warnings: [], ...fields })}`;
  const detail = 'Terminal execution failed before completion: the paused command ended without an exit status of its own: the shell abandoned the rest of its line, as an interrupt (C-c) makes it do, before the next command ran';
  const ended = `${detail}\n[terminal_output]\n^C\n${diagnostic({ detail, error_class: 'ExecutionError', exit_code: -1, failure_kind: 'execution_error', outcome_kind: 'execution_error', outcome_severity: 'error' })}`;
  const stillRunning = `No new output …\n[terminal_output]\n^C\n#\n${diagnostic({ detail: 'The command is still running; this is the output so far. Poll again with an empty command.', exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' })}`;
  const endedOwn = `The command exited with code 0.\n[terminal_output]\n(no output)\n${diagnostic({ detail: 'The command exited with code 0.', exit_code: 0, outcome_kind: 'success', outcome_severity: 'info' })}`;
  it('credits only OQ-147\'s reading; the defect\'s soft pause is a failure, and a command that ended on its own is unasked', () => {
    expect(interruptedPollReading(ended)).toMatchObject({ kind: 'ended', exit: -1 });
    expect(interruptedPollReading(stillRunning)).toMatchObject({ kind: 'still-running', exit: -1 });
    expect(interruptedPollReading(endedOwn)).toMatchObject({ kind: 'ended-own', exit: 0 });
    expect(interruptedPollReading('the tool was blocked before it ran').kind).toBe('other');
  });
});

describe('the steady shape and its hard-cap reading (REQ-TOOLS-097, REQ-CONFIG-116)', () => {
  /*
   * `docs/defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`. Run for real for a few
   * seconds, so the line it prints is measured rather than assumed; it is ended long before its 130 s.
   */
  it('prints one tick line per interval, run for real', () => {
    const command = terminalShapes().find((s: Shape) => s.id === 'steady')!.command;
    const run = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: STEADY_INTERVAL_MS * 2 + 1_500 })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8', timeout: STEADY_INTERVAL_MS * 2 + 1_500 });
    expect(run.stdout.split('\n').filter((line) => /^tick-\d+$/.test(line)).slice(0, 2)).toEqual(['tick-1', 'tick-2']);
  }, 20_000);

  const diagnostic = (fields: Record<string, unknown>) => `[terminal_diagnostic] ${JSON.stringify({ backend: 'single-session', command: 'node -e "…"', warnings: [], ...fields })}`;
  const ticks = Array.from({ length: 50 }, (_, i) => `tick-${i + 1}`).join('\n');
  const capped = (seconds: number) => `Command timed out after ${seconds} seconds; the terminal session was forcibly restarted to terminate the process tree.\n[partial_terminal_output]\n${ticks}\n${diagnostic({ exit_code: 124, timeout: true, timeout_seconds: seconds, failure_kind: 'timeout', kill_status: 'session_reset', outcome_kind: 'timeout', outcome_severity: 'error' })}`;
  const paused = `No output for 30 seconds …\n[terminal_output]\n${ticks}\n${diagnostic({ exit_code: -1, timeout: false, timeout_seconds: 100, outcome_kind: 'soft_pause', outcome_severity: 'warning' })}`;
  const ended = `The command exited with code 0.\n[terminal_output]\n${ticks}\n${diagnostic({ exit_code: 0, timeout: false, timeout_seconds: 100, outcome_kind: 'success', outcome_severity: 'info' })}`;

  it('credits only a hard timeout at the configured cap, on a call that supplied no timeout', () => {
    expect(hardCapReading({ args: { command: 'x' }, result: capped(100), elapsedMs: 100_400 })).toMatchObject({ kind: 'capped', ticks: 50, killStatus: 'session_reset', timeoutSeconds: 100, exit: 124 });
    expect(hardCapReading({ args: { command: 'x' }, result: capped(4), elapsedMs: 4_100 }, { capSeconds: 4 }).kind).toBe('capped');
  });

  it('fails a soft pause, another bound, and a command that ran past the cap to its own end; a supplied timeout is unasked', () => {
    expect(hardCapReading({ args: { command: 'x' }, result: paused, elapsedMs: 30_000 }).kind).toBe('paused');
    expect(hardCapReading({ args: { command: 'x' }, result: capped(4), elapsedMs: 4_100 }).kind).toBe('other-cap');
    expect(hardCapReading({ args: { command: 'x' }, result: ended, elapsedMs: 130_200 }).kind).toBe('uncapped');
    expect(hardCapReading({ args: { command: 'x', timeout: 120 }, result: capped(120), elapsedMs: 120_000 }).kind).toBe('supplied');
    expect(hardCapReading({ args: { command: 'x' }, result: 'the tool was blocked before it ran', elapsedMs: 3 }).kind).toBe('other');
    expect(hardCapReading({ args: { command: 'x' }, result: ended, elapsedMs: 5_000 }).kind).toBe('other');
  });
});

describe('the long-output reading', () => {
  const line = (n: number) => `LINE-${String(n).padStart(3, '0')} ${'x'.repeat(100)}`;

  it('counts every distinct marker of a healthy capture', () => {
    const healthy = Array.from({ length: LONG_OUTPUT_LINES }, (_, i) => line(i + 1)).join('\n');
    const reading = longOutputReading(healthy);
    expect(reading.distinct).toBe(LONG_OUTPUT_LINES);
    expect(reading.doubled).toHaveLength(0);
    expect(reading.escaped).toBe(false);
  });

  /*
   * The counterfactual. Without this the healthy case above could pass for a reader that never looks — these
   * three are the defects the scenario claims to catch, and each must move the reading it is about.
   */
  it('sees a concatenation, a lost line and a surviving escape sequence', () => {
    const rows = Array.from({ length: LONG_OUTPUT_LINES }, (_, i) => line(i + 1));
    const concatenated = [...rows.slice(0, 10), `${rows[10]}${rows[11]}`, ...rows.slice(12)].join('\n');
    expect(longOutputReading(concatenated).doubled).toHaveLength(1);
    expect(longOutputReading(rows.slice(0, 39).join('\n')).distinct).toBe(39);
    expect(longOutputReading(`${String.fromCharCode(27)}[0m${rows[0]}`).escaped).toBe(true);
  });

  /*
   * And the shape's own command, run by a real shell, so the forty the scenario asserts is a measurement of
   * this command rather than a number somebody liked. Skipped where the platform's shell is absent.
   */
  it('reads forty lines out of the shape\'s own command, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'long-output')!.command;
    const run = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 60_000 })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    if (run.status !== 0) {
      expect(run.error ?? run.stderr, 'the shell refused the shape; nothing is asserted about its output').toBeTruthy();
      return;
    }
    const reading = longOutputReading(run.stdout);
    expect(reading.distinct).toBe(LONG_OUTPUT_LINES);
    expect(reading.doubled).toHaveLength(0);
  });
});

describe('how the terminal run ended (docs/defects/fixed/a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400.md)', () => {
  it('a run that ended failed before any terminal call is a failure, not a green run of NOTEs', () => {
    // the 2026-10-01 pack: two calls, neither terminal, the endpoint's 400 ended the run, and live-run printed PASSED
    expect(terminalRunEndReading({ execution_status: 'failed', stop_reason: 'agent_session_aborted' }, 0)).toEqual({ kind: 'died-early', detail: 'failed (agent_session_aborted) after 0 terminal call(s)' });
  });
  it('a run that failed after reaching the terminal is a NOTE; a completed or stopped run is an end; no session is a failure', () => {
    expect(terminalRunEndReading({ execution_status: 'failed', stop_reason: 'x' }, 3).kind).toBe('failed-later');
    expect(terminalRunEndReading({ execution_status: 'completed', stop_reason: null }, 0).kind).toBe('ended');
    expect(terminalRunEndReading({ execution_status: 'completed', stop_reason: null }, 12).kind).toBe('ended');
    expect(terminalRunEndReading(null, 0).kind).toBe('absent');
  });
  it('a run stopped or interrupted before any terminal call is a NOTE, never a silent end; after a terminal call it is an end', () => {
    expect(terminalRunEndReading({ execution_status: 'stopped', stop_reason: 'user_cancelled' }, 0)).toEqual({ kind: 'ended-early', detail: 'stopped (user_cancelled) after 0 terminal call(s)' });
    expect(terminalRunEndReading({ execution_status: 'interrupted', stop_reason: null }, 0).kind).toBe('ended-early');
    expect(terminalRunEndReading({ execution_status: 'stopped', stop_reason: 'user_cancelled' }, 2).kind).toBe('ended');
  });
});

describe('which send of a shape the scenario reads (docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md)', () => {
  const shapes: Shape[] = terminalShapes('linux');
  const shape = (id: string): Shape => shapes.find((s) => s.id === id)!;
  const awk = shape('long-output').command;
  const lines = Array.from({ length: LONG_OUTPUT_LINES }, (_, i) => `LINE-${String(i + 1).padStart(3, '0')} ${'x'.repeat(100)}`).join('\n');
  // The 0bc3eee pack's terminal session, as `readToolCalls` gives it: ordinal 2 refused by REQ-ORCH-029's todo gate before
  // it ran (the refusal's text, no marker), the list written, ordinal 5 the same command, run, with all forty lines.
  const refusedAtGate = { ordinal: 2, tool_name: 'terminal', agent_name: 'Orchestrator', status: 'blocked', failureKind: 'todo_list_owed', args: { command: awk }, result: 'This call was not run: this task now spans more than one step and you keep no todo list for it (REQ-ORCH-029).' };
  const ranAfterList = { ordinal: 5, tool_name: 'terminal', agent_name: 'Orchestrator', status: 'ok', failureKind: null, args: { command: awk }, result: `[terminal_output]\n${lines}\n[terminal_diagnostic] {"exit_code":0,"outcome_kind":"success"}` };

  it('a todo_list_owed send followed by the same command run selects the run, and the forty lines are read from it', () => {
    const sends = shapeSends(shape('long-output'), [refusedAtGate, ranAfterList]);
    expect(sends.kind).toBe('reached');
    expect(sends.reached.map((call: { ordinal: number }) => call.ordinal)).toEqual([5]);
    expect(sends.refused.map((call: { ordinal: number }) => call.ordinal)).toEqual([2]);
    // The FAIL of 0bc3eee: the first matching send was the refused one, and it carried no marker at all.
    expect(longOutputReading(refusedAtGate.result).distinct).toBe(0);
    expect(longOutputReading(sends.reached[0].result).distinct).toBe(LONG_OUTPUT_LINES);
    expect(attemptCount('long-output', sends)).toBe('long-output×1 (+1 refused at the gate)');
  });

  it('a schema refusal never runs either; a permission-blocked pipe-to-shell is still the send it is measured by', () => {
    expect(reachedShape({ failureKind: 'invalid_request' })).toBe(false);
    expect(reachedShape({ failureKind: 'todo_list_owed' })).toBe(false);
    // Ordinal 33 of the same session: `blocked` by the deny, no failure_kind. Dropping every `blocked` call, as
    // coordinator-todo's `ran` does, would read the shape as not attempted.
    const piped = { ordinal: 33, tool_name: 'terminal', agent_name: 'Orchestrator', status: 'blocked', failureKind: null, args: { command: shape('pipe-to-shell').command }, result: 'Denied by starter:deny-pipe-to-shell (pipe to shell).' };
    const sends = shapeSends(shape('pipe-to-shell'), [piped]);
    expect(sends.kind).toBe('reached');
    expect(sends.reached[0]).toBe(piped);
    expect(attemptCount('pipe-to-shell', sends)).toBe('pipe-to-shell×1');
  });

  it('a shape whose every send was refused at the gate is NOT REACHED, a NOTE that names the refusals; one never sent is not attempted', () => {
    const sends = shapeSends(shape('long-output'), [refusedAtGate]);
    expect(sends.kind).toBe('not-reached');
    expect(sends.reached).toEqual([]);
    expect(notReachedNote('long-output', sends.refused, 'the concatenation and VT questions are unasked')).toEqual({
      title: 'long-output was not reached: refused at the todo gate',
      detail: '1 send(s) refused before running (REQ-ORCH-029) and not re-sent (#2 todo_list_owed); the concatenation and VT questions are unasked',
    });
    expect(notReachedNote('wedge', [{ ordinal: 7, failureKind: 'invalid_request' }], 'the hard cap is unasked').title).toBe('wedge was not reached: refused at the tool gate');
    expect(shapeSends(shape('long-output'), []).kind).toBe('not-attempted');
    expect(shapeSends(shape('here-string'), [refusedAtGate, ranAfterList]).kind).toBe('not-attempted');
  });
});

// docs/defects/fixed/the-live-runs-terminal-reader-counts-a-send-the-gate-refused-for-another-reason-as-reached.md (fin40's
// reviewer, item N92): every refusal the tool gate settles before a call runs leaves the shape's question unasked, not only
// the todo gate's and the schema check's.
describe('the gate refusals that leave a shape unasked, all of them (N92)', () => {
  const shapes: Shape[] = terminalShapes('linux');
  const wedge = shapes.find((s) => s.id === 'wedge')!;
  const send = (ordinal: number, status: string, failureKind: string | null, result = 'refused') => ({ ordinal, tool_name: 'terminal', agent_name: 'Orchestrator', status, failureKind, args: { command: wedge.command }, result });

  it('names every refusal packages/agent-tools/src/gate.ts settles before a call runs', () => {
    // plan_gate_withheld (the run held at the plan gate), write_scope_claimed (inside another agent's live write scope: never a
    // terminal call, kept so the set is the gate's whole list), hook_blocked (a pre_tool hook), beside the two it held.
    expect([...GATE_REFUSALS].sort()).toEqual(['hook_blocked', 'invalid_request', 'plan_gate_withheld', 'todo_list_owed', 'write_scope_claimed']);
    for (const kind of ['plan_gate_withheld', 'write_scope_claimed', 'hook_blocked']) expect(reachedShape({ status: 'blocked', failureKind: kind }), kind).toBe(false);
  });

  it('reads an approval withdrawn before the call ran as not reached, and a call the run cut while it ran as reached', () => {
    // PD-ORCH-005 clause 9: the approval withdrawn when the run came to rest settles `blocked`, `interrupted`; never run.
    expect(reachedShape({ status: 'blocked', failureKind: 'interrupted' })).toBe(false);
    // PD-TOOLS-013 revision 2: a call cut in flight is `failed`, `interrupted`, and it RAN; its output is the shape's answer.
    expect(reachedShape({ status: 'failed', failureKind: 'interrupted' })).toBe(true);
    const sends = shapeSends(wedge, [send(3, 'blocked', 'interrupted'), send(4, 'failed', 'interrupted', '[terminal_output]\n')]);
    expect(sends.reached.map((c: { ordinal: number }) => c.ordinal)).toEqual([4]);
    expect(sends.refused.map((c: { ordinal: number }) => c.ordinal)).toEqual([3]);
    expect(notReachedNote('wedge', [send(3, 'blocked', 'interrupted')], 'the hard cap is unasked').title).toBe('wedge was not reached: refused at the tool gate');
    expect(shapeSends(wedge, [send(5, 'blocked', 'hook_blocked'), send(6, 'blocked', 'plan_gate_withheld')]).kind).toBe('not-reached');
  });

  it('names the shape of a pair that was never sent beside the one the gate refused', () => {
    const again = shapes.find((s) => s.id === 'wedge-again')!;
    const behind = shapes.find((s) => s.id === 'behind-paused')!;
    const refused = { ordinal: 9, tool_name: 'terminal', agent_name: 'Orchestrator', status: 'blocked', failureKind: 'todo_list_owed', args: { command: again.command }, result: 'refused' };
    const note = pairNotReachedNote([['wedge-again', shapeSends(again, [refused])], ['behind-paused', shapeSends(behind, [refused])]], 'OQ-164\'s report is unasked');
    expect(note).toEqual({
      title: 'wedge-again was not reached: refused at the todo gate',
      detail: '1 send(s) refused before running (REQ-ORCH-029) and not re-sent (#9 todo_list_owed); behind-paused was never sent; OQ-164\'s report is unasked',
    });
    // Both refused: both named in the title, nothing said never sent.
    const behindRefused = { ...refused, ordinal: 10, args: { command: behind.command } };
    expect(pairNotReachedNote([['wedge-again', shapeSends(again, [refused])], ['behind-paused', shapeSends(behind, [behindRefused])]], 'unasked')?.title).toBe('wedge-again and behind-paused were not reached: refused at the todo gate');
    // Neither refused: not this NOTE.
    expect(pairNotReachedNote([['wedge-again', shapeSends(again, [])], ['behind-paused', shapeSends(behind, [])]], 'unasked')).toBeNull();
  });
});

/*
 * Acceptance finding L7 (fin46, the default run at 3c3f447): the `terminal` scenario's role is coordinator_only, so the root
 * delegates the shapes; its tester ran the steady printer with a timeout it was told not to add, the coordinator followed it
 * up once to run it again without, and the 550 s wait (420 s plus one steady) ran out 64.8 s into that re-run.
 */
describe('the terminal scenario\'s wait (L7)', () => {
  const steadyMs = STEADY_INTERVAL_MS * STEADY_TICKS;
  it('carries the steady shape twice and a follow-up turn on top of the common wait', () => {
    expect(terminalWaitMs(420_000)).toBeGreaterThanOrEqual(420_000 + 2 * steadyMs + 60_000);
    // It grows with the common wait, so LIVE_RUN_WAIT_MS still scales it.
    expect(terminalWaitMs(600_000) - terminalWaitMs(420_000)).toBe(180_000);
  });
  it('covers the 3c3f447 timeline: the re-run to its default cap, the child\'s report and the coordinator\'s answer', () => {
    const cutAt = 550_000; // the wait that ran out, 16:14:21 to 16:23:31
    const rerunLeft = DEFAULT_SHELL_COMMAND_TIMEOUT_S * 1000 - 64_802; // the re-run, cut 64.8 s in, ends at the default cap
    const reportAndAnswer = 60_000; // the child's report and the coordinator's closing answer
    expect(terminalWaitMs(420_000)).toBeGreaterThan(cutAt + rerunLeft + reportAndAnswer);
  });
  it('is the wait the live run\'s terminal launch uses', () => {
    const source = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const block = source.slice(source.indexOf("if (wanted.includes('terminal'))"), source.indexOf("const log = await launch('terminal'"));
    expect(block).toContain('const TERMINAL_WAIT_MS = terminalWaitMs(RUN_WAIT_MS);');
  });
});
