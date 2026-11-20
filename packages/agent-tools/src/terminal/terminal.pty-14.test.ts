import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backgroundStreamId } from '@rotaris/contracts';
import { stripVt } from './classify.js';
import { killTree } from './foreground.js';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS, type BackgroundSession } from './index.js';
import { shell, PS, SH, clocks, root, ctx, manager, tool, diag, output, args, disposeTerminalFixture } from './terminal.test-support.js';

/**
 * Part 14 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it('REQ-TOOLS-098: a call with no timeout that produces nothing for the no-output window returns −1 while the process keeps running; an empty command polls', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx());
    expect(diag(r.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause', outcome_severity: 'warning' });
    expect(diag(r.text)['failure_kind']).toBeUndefined();
    expect(r.text).toContain('No output for 1.5 seconds in the merged terminal stream; stdout and stderr are both captured.');
    expect(r.text).toContain('Poll by calling the tool again with an empty command');
    expect(r.text).not.toContain('re-run the command with 2>&1');
    await new Promise((res) => setTimeout(res, 3_500));
    const poll = await t.execute(args({ command: '' }), ctx());
    expect(output(poll.text)).toContain('done-later');
  }, 20_000);
  // Live-run L2: five polls in 21.6 s each said "No output for 30 seconds" after under a millisecond, and the model counted
  // thirty seconds a poll. A poll returns at once; what it states is what it measured.
  it('REQ-TOOLS-098 (live-run L2): an empty poll states the time it actually waited, not the no-output window it did not wait out', async () => {
    const t = await tool();
    const r = await t.execute(args({ command: `${SH.sleep(4)}; ${SH.echo('late')}` }), ctx());
    expect(diag(r.text)['outcome_kind']).toBe('soft_pause');
    const t0 = performance.now();
    const poll = await t.execute(args({ command: '' }), ctx());
    const took = performance.now() - t0;
    expect(diag(poll.text)).toMatchObject({ exit_code: -1, outcome_kind: 'soft_pause' });
    expect(output(poll.text)).toBe('(no output)');
    expect(poll.text).not.toContain('No output for 1.5 seconds');
    const since = /No new output in (under 0\.1|\d+\.\d) seconds since the previous observation, and none for (\d+\.\d) seconds in the merged terminal stream; stdout and stderr are both captured\./.exec(poll.text);
    expect(since, poll.text).not.toBeNull();
    // What it states it waited is no more than the call took (plus the stated precision), and the silence is at least the window.
    if (since![1] !== 'under 0.1') expect(Number(since![1]) * 1000).toBeLessThanOrEqual(took + 100);
    expect(Number(since![2])).toBeGreaterThanOrEqual(1.5);
    expect(poll.text).toContain('The process may still be running. Poll by calling the tool again with an empty command, or interrupt by sending C-c with is_input=true.');
    await new Promise((res) => setTimeout(res, 3_000));
    const done = await t.execute(args({ command: '' }), ctx());
    expect(output(done.text)).toContain('late');
    expect(diag(done.text)['exit_code']).toBe(0);
  }, 20_000);
  it('REQ-TOOLS-127 (live-run L9): the tap a live stream reads carries what the command wrote, and none of the wrapper, the markers or the snapshot', async () => {
    const t = await tool();
    const session = manager!.session('s1:orchestrator', root);
    let tapped = '';
    const untap = session.onOutput((chunk) => { tapped += chunk; });
    const r = await t.execute(args({ command: `${SH.echo('first-line')}; ${SH.echo('second-line')}`, timeout: 15 }), ctx());
    untap();
    expect(output(r.text)).toBe('first-line\nsecond-line');
    expect(stripVt(tapped).split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['first-line', 'second-line']);
    expect(tapped).not.toContain('__rot_');
  }, 20_000);
  it('REQ-TOOLS-101/102: validation refusals and the reset confirmation', async () => {
    const t = await tool();
    expect(diag((await t.execute(args({ command: 'x', reset: true, is_input: true }), ctx())).text)).toMatchObject({ failure_kind: 'invalid_request', outcome_kind: 'invalid_request' });
    expect((await t.execute(args({ command: '', background: true }), ctx())).text).toContain('A command is required when background=True.');
    expect((await t.execute(args({ session_action: 'send_input', session_id: 'ts_00000000' }), ctx())).text).toContain('send_input requires input_data.');
    const reset = await t.execute(args({ command: '', reset: true }), ctx());
    expect(reset.text).toContain('The terminal session has been reset');
    expect(reset.label).toBe('$ [RESET]');
  }, 20_000);
  it('a real diff-with-differences reads success, not shell_failure, end to end', async () => {
    const t = await tool();
    // The two files are WRITTEN, and they differ. Without them git exits 1 saying `Could not access 'a'` —
    // an error that happens to share the status the carve-out is about, so the case would pass while proving
    // nothing about a diff. Their content differs on one line, so exit 1 carries a real hunk.
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'a'), 'one\ntwo\nthree\n');
    writeFileSync(join(root, 'b'), 'one\nTWO\nthree\n');
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    // The run's shape: `git diff --no-index` with differences exits 1 carrying the payload.
    // Windows PowerShell 5.1 has no `||`, and a line it cannot parse is now its own exit-1 parse error
    // (docs/archive/defects/a-single-line-powershell-command-that-throws-loses-its-end-frame.md), so PowerShell's spelling
    // is the `;` both shells read; the second diff's status is the call's either way.
    const twice = PS ? 'git diff --no-index -- a b; git diff --no-index -- a b' : 'git diff --no-index -- a b || true; git diff --no-index -- a b';
    const r = await t.execute(args({ command: twice, timeout: 15 }), ctx());
    expect(diag(r.text)['exit_code']).toBe(1);
    expect(diag(r.text)).toMatchObject({ outcome_kind: 'success', outcome_severity: 'info' });
    expect(r.isError).toBe(false);
    // The payload, not just the status: a pager left to start would have eaten this and the status both.
    expect(output(r.text)).toContain('-two');
    expect(output(r.text)).toContain('+TWO');
    // And a no-match search answers rather than fails — `findstr` on Windows, `grep` on POSIX.
    const search = PS ? 'findstr /C:definitely-not-here-xyz src\\a.ts; echo "search said $LASTEXITCODE"' : 'grep definitely-not-here-xyz src/a.ts; echo "grep said $?"';
    const g = await t.execute(args({ command: search, timeout: 15 }), ctx());
    expect(output(g.text)).toContain('said 1');
  }, 30_000);
  it('REQ-TOOLS-107..110: a background session returns at once, is queried for new output only, listed, and killed', async () => {
    const t = await tool();
    const ticks = PS
      ? '1..3 | ForEach-Object { Write-Output "tick $_"; Start-Sleep -Milliseconds 300 }; Write-Output end'
      : `for i in 1 2 3; do printf 'tick %s\\n' "$i"; sleep 1; done; ${SH.echo('end')}`;
    const started = await t.execute(args({ command: ticks, background: true }), ctx());
    expect(started.text).toMatch(/^Background session started: ts_[0-9a-f]{8}/);
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    // Wait for the subprocess to FINISH, by listing — which consumes no output, unlike `query` — rather than by
    // sleeping a span guessed for an idle machine. The guess was 2.5 s against ~0.9 s of work, and under
    // full-suite load the query came back `(no new output since last poll)` before the first tick.
    for (let i = 0; i < 80; i += 1) {
      if ((await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✓ ${id}`)) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const q = await t.execute(args({ session_id: id }), ctx());
    expect(output(q.text)).toContain('tick 1');
    expect(output(q.text)).toContain('end');
    const again = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(output(again.text)).toBe('(no new output since last poll)');
    expect(diag(again.text)).toMatchObject({ session_status: 'completed', exit_code: 0, outcome_kind: 'background_terminal', outcome_severity: 'info' });
    const long = await t.execute(args({ command: SH.sleep(30), background: true }), ctx());
    const id2 = /ts_[0-9a-f]{8}/.exec(long.text)![0];
    const list = await t.execute(args({ session_action: 'list' }), ctx());
    expect(list.text).toContain(`▶ ${id2}`);
    expect(list.text).toContain(`✓ ${id}`);
    const killed = await t.execute(args({ session_id: id2, session_action: 'kill' }), ctx());
    expect(diag(killed.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_severity: 'warning' });
    expect((await t.execute(args({ session_id: 'ts_0badf00d' }), ctx())).text).toContain("Unknown background session: 'ts_0badf00d'");
  }, 30_000);
  it('REQ-TOOLS-109/110: a kill of a session that has already ended says so, kills nothing, and agrees with its status — after completion and after failure', async () => {
    const t = await tool();
    const ended = async (command: string, glyph: string): Promise<string> => {
      const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command, background: true }), ctx())).text)![0];
      const endedBy = (clocks.monotonic.now() as number) + 15_000;
      while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`${glyph} ${id}`)) {
        expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
        await new Promise((res) => setTimeout(res, 50));
      }
      return id;
    };
    // Before the repair both answered `Session ts_… was killed.` beside a block reporting `completed` or `failed`.
    const done = await ended(SH.echo('finished'), '✓');
    const k1 = await t.execute(args({ session_id: done, session_action: 'kill' }), ctx());
    expect(k1.text).not.toContain(`Session ${done} was killed`);
    expect(k1.text).toContain(`Session ${done} had already ended; nothing was killed. It is completed (exit 0).`);
    // REQ-TOOLS-110: the final output all the same.
    expect(output(k1.text)).toContain('finished');
    expect(diag(k1.text)).toMatchObject({ session_status: 'completed', exit_code: 0, outcome_kind: 'background_terminal', outcome_severity: 'info' });
    expect(diag(k1.text)['detail']).toBe(`Session ${done} had already ended; nothing was killed. It is completed (exit 0).`);
    const failed = await ended('exit 3', '✗');
    const k2 = await t.execute(args({ session_id: failed, session_action: 'kill' }), ctx());
    expect(k2.text).toContain(`Session ${failed} had already ended; nothing was killed. It is failed (exit 3).`);
    expect(diag(k2.text)).toMatchObject({ session_status: 'failed', exit_code: 3, outcome_kind: 'background_terminal', outcome_severity: 'error' });
    // A kill of a session a kill already ended says the same: the second kill ended nothing.
    const long = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command: SH.sleep(30), background: true }), ctx())).text)![0];
    expect((await t.execute(args({ session_id: long, session_action: 'kill' }), ctx())).text).toContain(`Session ${long} was killed.`);
    const again = await t.execute(args({ session_id: long, session_action: 'kill' }), ctx());
    expect(again.text).toContain(`Session ${long} had already ended; nothing was killed. It is killed (exit -1).`);
    expect(diag(again.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_severity: 'warning' });
  }, 40_000);
  it('OQ-10 (R-044): send_signal SIGINT stops a background session instead of refusing it', async () => {
    const t = await tool();
    // The command prints a marker and THEN becomes the long-lived process. On POSIX `exec sleep`
    // replaces the shell, so the group's one process is `sleep` with SIGINT at its default disposition
    // and no shell left to absorb the signal; on Windows there is no exec idiom and none is needed, as
    // OQ-10's win32 mapping terminates the tree (`end`) rather than delivering a signal. Signalling only
    // AFTER the marker is observed is what makes the case deterministic. `/bin/sh` here is `dash`, which catches
    // SIGINT under `-c` and launches a command with `vfork`; until the child `exec`s it runs dash's handler, which
    // returns at once in a vforked child, so a SIGINT that reaches the group in that instant is discarded by the
    // command, and the shell acts on its own copy only when the command ends — `sleep 30` outlived the poll.
    // Sent the instant `start` returned, 38 of 200 such sessions survived under load (0 of 150 under `bash`, 0 of
    // 150 with `exec`); gated on the marker, with `exec`, none does. The product's delivery reaches every process of
    // the group and reports it sent in every one of those runs
    // (docs/archive/defects/a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md). What the window cost
    // the product outside this case is repaired by re-delivery to a member that never received the signal, and is
    // pinned in background.test.ts (OQ-135;
    // docs/archive/defects/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md).
    const command = PS ? `Write-Output 'up'; ${SH.sleep(30)}` : `printf 'up\\n'; exec sleep 30`;
    const started = await t.execute(args({ command, background: true }), ctx());
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    // Poll until the session is observably running its command (its marker has reached the buffer),
    // bounded by a deadline read from the clock port rather than a fixed iteration count.
    const runningBy = (clocks.monotonic.now() as number) + 15_000;
    for (;;) {
      if ((output((await t.execute(args({ session_id: id, session_action: 'query' }), ctx())).text) ?? '').includes('up')) break;
      expect(clocks.monotonic.now() as number).toBeLessThan(runningBy);
      await new Promise((res) => setTimeout(res, 25));
    }
    const stopped = await t.execute(args({ session_id: id, session_action: 'send_signal', signal: 'SIGINT' }), ctx());
    expect(stopped.text).toContain(`Sent SIGINT to session ${id}.`);
    expect(stopped.text).not.toContain('could not be delivered');
    // The session is ended, not refused: poll the list until it shows the ended glyph, bounded by the clock.
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while ((clocks.monotonic.now() as number) < endedBy) {
      if ((await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    expect((await t.execute(args({ session_action: 'list' }), ctx())).text).toContain(`✗ ${id}`);
  }, 40_000);
  it('REQ-TOOLS-109/179, OQ-133 (live-run L4): a session the agent ends with send_signal SIGINT reads killed (−1) at warning, not an error', async () => {
    const t = await tool();
    // As in the OQ-10 case above: the command becomes the long-lived process, and the signal waits for its marker.
    const command = PS ? `Write-Output 'up'; ${SH.sleep(30)}` : `printf 'up\\n'; exec sleep 30`;
    const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command, background: true }), ctx())).text)![0];
    const runningBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(output((await t.execute(args({ session_id: id, session_action: 'query' }), ctx())).text) ?? '').includes('up')) {
      expect(clocks.monotonic.now() as number).toBeLessThan(runningBy);
      await new Promise((res) => setTimeout(res, 25));
    }
    expect((await t.execute(args({ session_id: id, session_action: 'send_signal', signal: 'SIGINT' }), ctx())).text).toContain(`Sent SIGINT to session ${id}.`);
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
      expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
      await new Promise((res) => setTimeout(res, 50));
    }
    // The live run read `Session ts_… is failed (exit -1).` here: an error, and a `tool_error` issue the gate files
    // for any observation that is one. `killed` is REQ-TOOLS-112's `warning`: the agent ended it deliberately.
    const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(q.text).toContain(`Session ${id} is killed (exit -1).`);
    expect(diag(q.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_kind: 'background_terminal', outcome_severity: 'warning' });
    expect(q.isError).toBe(false);
  }, 40_000);
  /**
   * B8 of the Windows ARM64 session (2026-10-20): on Windows every signal `send_signal` offers, `session_action: kill` and the
   * terminal window's interrupt end the session's own tree (OQ-10's win32 mapping): `taskkill /T`, which the pipe session's
   * PowerShell does not answer, then `taskkill /T /F` after REQ-TOOLS-109's 5 s. The command starts a node grandchild that
   * writes its parent's pid and its own, so both are watched until they have gone.
   */
  describe.runIf(PS && process.platform === 'win32')('on Windows: the background tree ends whole, whatever ends it (OQ-10, REQ-TOOLS-109, REQ-TOOLS-110)', () => {
    const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
    const startTree = async (t: Awaited<ReturnType<typeof tool>>, tag: string): Promise<{ id: string; pids: number[] }> => {
      const file = join(mkdtempSync(join(tmpdir(), `rotaris-b8-${tag}-`)), 'pids');
      const node = process.execPath.replace(/'/g, "''");
      const script = `require('fs').writeFileSync(process.argv[1], process.ppid + ' ' + process.pid); setTimeout(() => {}, 60000)`;
      const command = `Write-Output 'up'; & '${node}' -e "${script}" '${file.replace(/'/g, "''")}'`;
      const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command, background: true }), ctx())).text)![0];
      const by = (clocks.monotonic.now() as number) + 15_000;
      while (!existsSync(file) || readFileSync(file, 'utf8').split(' ').length !== 2) {
        expect(clocks.monotonic.now() as number).toBeLessThan(by);
        await new Promise((res) => setTimeout(res, 50));
      }
      return { id, pids: readFileSync(file, 'utf8').split(' ').map(Number) };
    };
    const goneWithin = async (pids: readonly number[], ms: number): Promise<number> => {
      const started = performance.now();
      while (pids.some(alive) && performance.now() - started < ms) await new Promise((res) => setTimeout(res, 50));
      expect(pids.filter(alive), `still running ${Math.round(performance.now() - started)} ms after`).toEqual([]);
      return performance.now() - started;
    };
    const killedAtWarning = async (t: Awaited<ReturnType<typeof tool>>, id: string): Promise<void> => {
      const by = (clocks.monotonic.now() as number) + 15_000;
      while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
        expect(clocks.monotonic.now() as number).toBeLessThan(by);
        await new Promise((res) => setTimeout(res, 50));
      }
      const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
      expect(q.text).toContain(`Session ${id} is killed (exit -1).`);
      expect(diag(q.text)).toMatchObject({ session_status: 'killed', exit_code: -1, outcome_kind: 'background_terminal', outcome_severity: 'warning' });
      expect(q.isError).toBe(false);
    };
    for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGKILL'] as const) {
      it(`send_signal ${signal}: sent, killed (exit -1) at warning, the shell and its grandchild gone within 6 s`, async () => {
        const t = await tool();
        const { id, pids } = await startTree(t, signal.toLowerCase());
        expect(pids.every(alive)).toBe(true);
        const sent = await t.execute(args({ session_id: id, session_action: 'send_signal', signal }), ctx());
        expect(sent.text).toContain(`Sent ${signal} to session ${id}.`);
        await goneWithin(pids, 6_000);
        await killedAtWarning(t, id);
      }, 40_000);
    }
    it('session_action kill: killed (exit -1) at warning, the shell and its grandchild gone within 6 s', async () => {
      const t = await tool();
      const { id, pids } = await startTree(t, 'kill');
      expect((await t.execute(args({ session_id: id, session_action: 'kill' }), ctx())).text).toContain(`Session ${id} was killed.`);
      await goneWithin(pids, 6_000);
      await killedAtWarning(t, id);
    }, 40_000);
    it("the terminal window's interrupt on a background stream ends the same tree", async () => {
      const t = await tool();
      const { id, pids } = await startTree(t, 'interrupt');
      expect(manager!.streams.interrupt(backgroundStreamId(id)).ok).toBe(true);
      await goneWithin(pids, 6_000);
      await killedAtWarning(t, id);
    }, 40_000);
    it("the foreground's killTree ends a PowerShell and the node it started, forced, at once", async () => {
      const dir = mkdtempSync(join(tmpdir(), 'rotaris-b8-killtree-'));
      const file = join(dir, 'pids');
      const script = `require('fs').writeFileSync(process.argv[1], process.ppid + ' ' + process.pid); setTimeout(() => {}, 60000)`;
      const ps = spawn(shell!.file, ['-NoProfile', '-NonInteractive', '-Command', `& '${process.execPath.replace(/'/g, "''")}' -e "${script}" '${file.replace(/'/g, "''")}'`], { stdio: 'ignore', windowsHide: true });
      const started = performance.now();
      while ((!existsSync(file) || readFileSync(file, 'utf8').split(' ').length !== 2) && performance.now() - started < 15_000) await new Promise((res) => setTimeout(res, 50));
      const pids = readFileSync(file, 'utf8').split(' ').map(Number);
      expect(pids[0]).toBe(ps.pid);
      expect(killTree(ps.pid!, true)).toBe(true);
      expect(await goneWithin(pids, 2_000)).toBeLessThan(2_000);
    }, 30_000);
  });
  it.skipIf(PS)('OQ-133: a signal death the product did not send reads failed with 128 + n, never the −1 of killed', async () => {
    const t = await tool();
    // The shell ends itself by SIGTERM: a death by a signal no `send_signal` delivered.
    const id = /ts_[0-9a-f]{8}/.exec((await t.execute(args({ command: 'kill -TERM $$', background: true }), ctx())).text)![0];
    const endedBy = (clocks.monotonic.now() as number) + 15_000;
    while (!(await t.execute(args({ session_action: 'list' }), ctx())).text.includes(`✗ ${id}`)) {
      expect(clocks.monotonic.now() as number).toBeLessThan(endedBy);
      await new Promise((res) => setTimeout(res, 50));
    }
    const q = await t.execute(args({ session_id: id, session_action: 'query' }), ctx());
    expect(diag(q.text)).toMatchObject({ session_status: 'failed', exit_code: 143, outcome_kind: 'background_terminal', outcome_severity: 'error' });
  }, 30_000);
  it('PD-ORCH-005 clause 10: a background session is attributed to the agent that started it, recorded at its start and at an end it reaches by itself, and listed by its session', async () => {
    const recorded: { id: string; status: string; tail: string }[] = [];
    const record = (b: BackgroundSession) => { recorded.push({ id: b.id, status: b.status, tail: b.tail() }); };
    await tool();
    const t = terminalTool(manager!, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, undefined, { owner: { sessionId: 's-attr', taskId: 'bg_agent01' }, onStarted: record, onEnded: record });
    const started = await t.execute(args({ command: SH.echo('attributed'), background: true }), ctx());
    const id = /ts_[0-9a-f]{8}/.exec(started.text)![0];
    expect(recorded[0]).toMatchObject({ id, status: 'running' });
    for (let i = 0; i < 80 && recorded.length < 2; i += 1) await new Promise((res) => setTimeout(res, 100));
    expect(recorded[1]).toMatchObject({ id, status: 'completed' });
    expect(recorded[1]!.tail).toContain('attributed');
    const owned = manager!.backgroundOwnedBy('s-attr');
    expect(owned.map((b) => [b.id, b.owner])).toEqual([[id, { sessionId: 's-attr', taskId: 'bg_agent01' }]]);
    expect(manager!.backgroundOwnedBy('s-other')).toEqual([]);
  }, 30_000);
  it('REQ-TOOLS-108: the background cap is an execution_error naming the count', async () => {
    const t = await tool({ maxBackgroundSessions: 1 });
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
    const t1 = terminalTool(m, { ...TERMINAL_DEFAULTS, maxBackgroundSessions: 1 });
    const a = await t1.execute(args({ command: SH.sleep(20), background: true }), ctx());
    const b = await t1.execute(args({ command: SH.sleep(20), background: true }), ctx());
    expect(b.text).toContain('Maximum background terminal sessions (1) reached. Kill or wait for existing sessions before starting new ones.');
    expect(diag(b.text)).toMatchObject({ failure_kind: 'execution_error' });
    void a; void t;
    await m.dispose();
  }, 20_000);
});
