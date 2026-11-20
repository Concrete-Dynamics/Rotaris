import { expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { wrapCommand, type ShellBackend } from './foreground.js';
import { execFileSync } from 'node:child_process';
import { findShell, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import type { ToolContext } from '../tools/types.js';
/**
 * ADR-0020's first execution, against a REAL shell through a REAL pseudo-terminal (REQ-TOOLS-104: the
 * PowerShell backend on Windows). Skipped where no shell is present. Time is the node clocks: the marker
 * protocol and the process tree are the things under test, and they do not run on a fake clock.
 */
export const shell = findShell();

/**
 * Whether a pid still runs. `kill(pid, 0)` alone reads a process that has exited but is not yet reaped (a zombie) as
 * alive for as long as nothing reaps it — and in a container whose PID 1 does not reap, that can outlast a case's own
 * bound (measured here: 20 s and counting, `docs/archive/defects/the-signal-test-gives-a-dead-proofs-launch-two-and-a-half-seconds-to-be-gone.md`).
 * So on Linux `/proc/<pid>/stat` decides, where a dead process reads `Z`; Windows keeps `tasklist`; anywhere else
 * `kill(pid, 0)` is all there is. This is the reading `apps/desktop/scripts/lib/bounded-launch.test.ts` already uses,
 * and the reason its process-death check has never flaked where these assertions did
 * (`docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md`).
 */
export const PROC = process.platform === 'linux' && existsSync('/proc/self/stat');
export const procState = (pid: number): string | null => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2, s.lastIndexOf(')') + 3); } catch { return null; } };
export const processAlive = (pid: number): boolean => {
  if (process.platform === 'win32') return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', windowsHide: true }).includes(String(pid));
  if (PROC) { const state = procState(pid); return state !== null && state !== 'Z' && state !== 'X'; }
  try { process.kill(pid, 0); return true; } catch { return false; }
};
/** What each pid read, and how, at the moment a death check gave up: `pid state` pairs, so a red names its survivor. */
export const deathReading = (pids: readonly number[]): string => pids.map((pid) => `${pid} ${procState(pid) ?? (processAlive(pid) ? 'alive' : 'gone')}`).join(', ');

/**
 * REQ-TOOLS-104 sends Windows to PowerShell and every other host to a POSIX shell, so every proof below is
 * spelled in the shell the host actually runs. What is under test is the marker protocol, the capture, the
 * emulated screen and the process tree, and none of those is a property of either language — the two spellings
 * are the SAME observable behaviour, and the assertions after them are byte-identical.
 *
 * ADR-0020's note recorded the POSIX branch of `wrapCommand` as reasoned but never executed, because no POSIX
 * shell ran on the host it was built on. This is that branch's first execution.
 */
export const PS = shell?.kind === 'powershell';
export const SH = {
  /** One line on stdout. */
  echo: (text: string) => (PS ? `Write-Output '${text}'` : `printf '%s\\n' '${text}'`),
  /** One line on stderr. */
  echoErr: (text: string) => (PS ? `[Console]::Error.WriteLine('${text}')` : `printf '%s\\n' '${text}' 1>&2`),
  /** Text with no trailing newline at all — ADR-0020 c.1's case. */
  echoNoNewline: (text: string) => (PS ? `Write-Host -NoNewline '${text}'` : `printf '%s' '${text}'`),
  /** The COMMAND exits with a status of its own; the session's shell keeps running. */
  exit: (code: number) => (PS ? `cmd /c exit ${code}` : `(exit ${code})`),
  /** A command that simply fails, without naming a status. */
  fails: () => (PS ? 'Get-Item C:\\definitely\\not\\here.txt' : 'false'),
  sleep: (seconds: number) => (PS ? `Start-Sleep -Seconds ${seconds}` : `sleep ${seconds}`),
  /** A variable the NEXT call must still see. */
  // Exported on POSIX, as `$env:` is on PowerShell: PD-TOOLS-001 restores the shell's EXPORTED variables.
  setVar: (name: string, value: string) => (PS ? `$env:${name} = '${value}'` : `export ${name}='${value}'`),
  /** The variable's value, alone. */
  echoVar: (name: string) => (PS ? `Write-Output $env:${name}` : `printf '%s\\n' "$${name}"`),
  /** The variable's value in brackets, so an empty one is still visible. */
  bracketVar: (name: string) => (PS ? `Write-Output "[$env:${name}]"` : `printf '[%s]\\n' "$${name}"`),
  /** The variable's value written to a file, so a case can see it from outside the terminal. */
  writeVar: (name: string, path: string) => (PS ? `Set-Content -NoNewline -Path '${path}' -Value $env:${name}` : `printf '%s' "$${name}" > '${path}'`),
  /** Into a directory, by its literal path. */
  cd: (dir: string) => (PS ? `Set-Location -LiteralPath '${dir}'` : `cd '${dir}'`),
  /** The shell's own directory, alone on a line. */
  pwd: () => (PS ? '(Get-Location).Path' : 'pwd'),
  /** A command that does nothing and succeeds. */
  noop: () => (PS ? '$null' : 'true'),
};
export const clocks: Clocks = nodeClocks();
export const root = mkdtempSync(join(tmpdir(), 'rotaris-term-'));
/**
 * `two-terminal-pty-tests-fail-on-main-in-this-environment`: where `/bin/sh` is `bash` (Fedora, RHEL, Arch) the session's
 * shell is `bash` in POSIX mode, and two cases failed there that passed where it is `dash`. Where bash is installed, a `sh`
 * link to it reproduces that host on any Linux one, as OQ-135's measurement did; null where there is no bash.
 */
export const bashAsSh: string | null = (() => {
  if (process.platform === 'win32') return null;
  const bash = ['/usr/bin/bash', '/bin/bash'].find((f) => existsSync(f));
  if (!bash) return null;
  const link = join(mkdtempSync(join(tmpdir(), 'rotaris-bash-sh-')), 'sh');
  symlinkSync(bash, link);
  return link;
})();
export const ctx = (signal = new AbortController().signal): ToolContext => ({ workspaceRoot: root, sessionId: 's1', agentName: 'orchestrator', persona: 'orchestrator', monotonic: clocks.monotonic, wall: clocks.wall, signal, warn: () => undefined });
export let manager: TerminalManager | null = null;
export async function tool(over: Partial<typeof TERMINAL_DEFAULTS> = {}) {
  manager ??= new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
  return terminalTool(manager, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500, ...over });
}
export const diag = (text: string) => JSON.parse(text.slice(text.indexOf('[terminal_diagnostic] ') + '[terminal_diagnostic] '.length)) as Record<string, unknown>;
export const output = (text: string) => { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(text); return m ? m[1] : ''; };
/**
 * OQ-164: what an observation carries of a soft-paused command other than its own subject — the block between its detail and
 * its own output section ('' when there is none), which a next call or a poll now reports in place of a later poll.
 */
export const earlierOutput = (text: string) => { const m = /since it was last observed(?: \(truncated\))?:\n([\s\S]*?)\n\[(?:partial_)?terminal_output\]/.exec(text); return m ? m[1]! : ''; };
export const args = (a: Record<string, unknown>) => ({ command: '', is_input: false, reset: false, background: false, ...a }) as Parameters<Awaited<ReturnType<typeof tool>>['execute']>[0];
/**
 * A session of its own on the POSIX shell `file`, with a 1.5 s no-output window; `env` is added to the host's environment,
 * and `cols` is the width the display resized its PTY to before its first call (REQ-TOOLS-128).
 */
export async function posixSession(file: string, opts: { env?: Record<string, string>; cols?: number } = {}) {
  return backendSession({ kind: 'posix', file }, opts);
}
/** The same on any backend: PowerShell's PD-TOOLS-001 cases need the width and the spawn environment too. */
export async function backendSession(backend: ShellBackend, opts: { env?: Record<string, string>; cols?: number } = {}) {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), ...opts.env };
  const m = new TerminalManager({ factory: await nodePtyFactory(), backend, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }, env, warn: () => undefined });
  if (opts.cols !== undefined) m.session(`${ctx().sessionId}:${ctx().agentName}`, root).resize(opts.cols, 50);
  return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_500 }), env };
}

/** What a file that used this fixture leaves behind: its manager, its scratch root and the bash link. Each registers it in an `afterAll`. */
export const disposeTerminalFixture = async (): Promise<void> => { await manager?.dispose(); rmSync(root, { recursive: true, force: true }); if (bashAsSh) rmSync(join(bashAsSh, '..'), { recursive: true, force: true }); };

// Live-run finding L1: `sh` abandons the rest of a line it cannot expand or parse, so the unguarded wrapper's end frame
// never ran and a command that finished at once read as a soft pause, exit −1. The call names no timeout, so it is the
// soft-pause path (a 1.5 s window here) the unguarded wrapper fell into. dash, `/bin/sh` on Debian and Ubuntu, is the
// shell a model writes bash for; bash in POSIX mode, `/bin/sh` on Fedora, RHEL and Arch, abandons the line the same way,
// and the case runs under both where bash is installed.
export const l1Case = async (t: Awaited<ReturnType<typeof tool>>): Promise<void> => {
  // `${PIPESTATUS[0]}` is what dash cannot expand; bash can, so the line ends on `${a b}`, which no POSIX shell expands
  // (`two-terminal-pty-tests-fail-on-main-in-this-environment`: the case read dash's error as every shell's).
  const expand = await t.execute(args({ command: 'export ROTARIS_L1=kept; printf \'%s\\n\' ran; echo "EXIT=${PIPESTATUS[0]}"; echo "${a b}"' }), ctx());
  expect(diag(expand.text)['outcome_kind']).not.toBe('soft_pause');
  expect(diag(expand.text)['exit_code']).toBeGreaterThan(0);
  expect(output(expand.text)).toContain('ran');
  expect(output(expand.text)).toMatch(/bad substitution/i);
  expect(expand.text).not.toContain('__rot_');
  // The shell is the same one, and what the line did before its error persists.
  const after = await t.execute(args({ command: SH.echoVar('ROTARIS_L1') }), ctx());
  expect(output(after.text)).toBe('kept');
  // A syntax `sh` does not have — bash's process substitution, the sibling note's `comm … <(…)` — and an unterminated
  // quote, which put the shell on its continuation prompt until the hard cap. Each ends with a status of its own.
  for (const command of ['comm -13 <(printf \'a\\n\') <(printf \'b\\n\')', 'echo "unterminated']) {
    const r = await t.execute(args({ command }), ctx());
    expect(diag(r.text)['outcome_kind']).not.toBe('soft_pause');
    expect(diag(r.text)['exit_code']).not.toBe(-1);
    expect(r.text).not.toContain('__rot_');
  }
  // A trailing comment no longer comments the end frame out.
  const comment = await t.execute(args({ command: 'printf \'%s\\n\' commented # a note' }), ctx());
  expect(diag(comment.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
  expect(output(comment.text)).toBe('commented');
};

// OQ-144's first-call handshake is one no-op round trip on a fresh shell before the command is written: an await before
// the call's own abort listener and kill handler exist. Both cases give the fresh shell a startup that takes a second
// (`ENV`, which an interactive POSIX shell reads), so the cancel and the kill land inside the handshake on any host.
// `startupS` is the fresh shell's startup. The cancel case takes three seconds, longer than its bound, so that only the
// handshake's own abort meets the bound: with one second, the check made after the handshake ended the call inside it
// too, and the case passed with the signal taken off the handshake (acceptance round 1's second verifier).
export const slowStart = async (tag: string, startupS = 1) => {
  const dir = mkdtempSync(join(tmpdir(), `rotaris-${tag}-`));
  const rc = join(dir, 'rc');
  writeFileSync(rc, `sleep ${startupS}\n`);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), ENV: rc };
  const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 }, env, warn: () => undefined });
  return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 }), marker: join(dir, 'ran'), dir };
};


// A10's second verification: the line discipline echoes the next call's wrapper onto the paused call's screen, and a
// wrapper wider than the screen (240 columns) wraps. Only the echo's FIRST row was dropped; its continuation rows — the
// command's text and `printf '__rot_…_e:%s\n' "$?"` — reached the paused call's poll, on both roads: the paused
// command ending on its own behind the next call (present on origin/main too), and the paused command interrupted.
// Where `/bin/sh` is `bash` the same case failed on both roads' wide echo (`two-terminal-pty-tests-fail-on-main-in-this-environment`):
// bash reads its input through readline, which on a `dumb` terminal scrolls a line wider than the screen sideways on one
// row instead of wrapping it. The shell now starts with its line editor off (`posixShellArgs`), so the echo is the line
// discipline's again, and a row an editor still draws is dropped (`ECHOED_POSIX_END`).
// `width` past `POSIX_LINE_BYTES` makes the next call one the session stages in a script (live-run M1,
// `ForegroundSession.carry`): what reaches the PTY is one short line, `. '<script>'` in the ordinary wrapper, written while
// the paused command holds the terminal, and neither road's poll may carry a row of its echo.
// FALSIFIED, kept beside its replacement (the rejected first carrier, 2026-10-06): "makes the next call's wrapper several
// physical lines, and the shell's continuation prompt, printed once per line, stands between their echo and the next
// call's start marker" — the backslash-continued lines overran the 4,096-byte input buffer behind the paused command and
// their echo leaked into its poll, which is why the shipped carrier stages the command instead.
export const wideEchoCase = async (t: Awaited<ReturnType<typeof tool>>, width = 300): Promise<void> => {
  const wide = 'Q'.repeat(width);
  await t.execute(args({ command: SH.echo('ready'), timeout: 15 }), ctx());
  // Road one: the paused command ends on its own, behind the wide call.
  expect(diag((await t.execute(args({ command: `${SH.sleep(3)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
  // The call's own output wraps at the screen's width like any other line the screen keeps.
  const next = await t.execute(args({ command: SH.echo(wide), timeout: 15 }), ctx());
  expect((output(next.text) ?? '').replace(/\n/g, '')).toBe(wide);
  // OQ-164: the wide call reports the paused command's end; what it carries of it holds no row of the wide call's echo.
  expect(String(diag(next.text)['detail'])).toMatch(/that command ended .* with exit code 0\./);
  expect(earlierOutput(next.text)).toBe('done-later');
  for (const leaked of ['__rot_', 'QQQ', '"$?"']) expect(earlierOutput(next.text)).not.toContain(leaked);
  expect(next.text).not.toContain('__rot_');
  // Road two: the paused command is interrupted, and the wide call closes it.
  expect(diag((await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('done-later')}` }), ctx())).text)['outcome_kind']).toBe('soft_pause');
  expect(diag((await t.execute(args({ command: 'C-c', is_input: true }), ctx())).text)['exit_code']).toBe(0);
  const closing = await t.execute(args({ command: SH.echo(wide), timeout: 15 }), ctx());
  expect((output(closing.text) ?? '').replace(/\n/g, '')).toBe(wide);
  expect(String(diag(closing.text)['detail'])).toContain('with no exit status of its own');
  for (const leaked of ['__rot_', 'QQQ', '"$?"', 'done-later']) expect(earlierOutput(closing.text)).not.toContain(leaked);
  expect(closing.text).not.toContain('__rot_');
};


// docs/archive/defects/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md (live-run M1, 2026-10-06):
// the POSIX wrapper was ONE physical line of any length, and the shell reads it through the PTY's canonical-mode line
// discipline, which keeps 4,095 characters of a line on Linux (termios(3)) and 1,024 on macOS. A 3,700-character heredoc
// wrapped to about 4,304 bytes reached the shell cut with its `'%b'` quote open: the shell stood on its continuation
// prompt, the command never ran, and the call read as a soft pause, exit −1, with `>` for its output.
// Where this test's session staged its long commands (`ForegroundSession.carry`), read off the session.
export let stagedAt: string | null = null;

export const staging = (m: TerminalManager): string | null => {
  stagedAt = (m.session(`${ctx().sessionId}:${ctx().agentName}`, root) as unknown as { stagingDir: string | null }).stagingDir;
  return stagedAt;
};

export const longCase = async (m: TerminalManager, t: Awaited<ReturnType<typeof tool>>, label: string) => {
  const file = join(root, `long-${label}.txt`);
  // Quotes, backslashes, `$`, a `%`, and multi-byte characters, so a cut inside an escape or a character would show.
  const body = Array.from({ length: 90 }, (_, i) => `line ${String(i).padStart(2, '0')}: it's \\ "q" $HOME % é 中 ${'x'.repeat(10)}`);
  const text = `${body.join('\n')}\n`;
  const heredoc = `cat > '${file}' <<'EOF'\n${text}EOF\nrotLong='${label}-kept'\nwc -c < '${file}'`;
  expect(Buffer.byteLength(wrapCommand({ kind: 'posix', file: '/bin/sh' }, heredoc, '__rot_0123456789abcdef01234567_s', '__rot_0123456789abcdef01234567_e'))).toBeGreaterThan(4_096);
  const multi = await t.execute(args({ command: heredoc, timeout: 15 }), ctx());
  expect(diag(multi.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
  expect(readFileSync(file, 'utf8')).toBe(text);
  expect(output(multi.text)).toBe(String(Buffer.byteLength(text)));
  expect(multi.text).not.toContain('__rot_');
  // The staged script removed itself once the shell had read it.
  expect(readdirSync(staging(m)!)).toEqual([]);
  // The single-line path has the same cap: a one-line command past it.
  const wide = `${'y'.repeat(2_500)}'${'z'.repeat(2_500)}`;
  const single = await t.execute(args({ command: `printf '%s' '${wide.replace(/'/g, `'\\''`)}' | wc -c`, timeout: 15 }), ctx());
  expect(diag(single.text)).toMatchObject({ exit_code: 0, outcome_kind: 'success' });
  expect(output(single.text)).toBe(String(wide.length));
  // What the long command set persists into the next call, and its own status still comes out of it.
  expect(output((await t.execute(args({ command: 'printf \'[%s]\\n\' "$rotLong"', timeout: 15 }), ctx())).text)).toBe(`[${label}-kept]`);
  const failing = await t.execute(args({ command: `: '${'w'.repeat(5_000)}'\n(exit 7)`, timeout: 15 }), ctx());
  expect(diag(failing.text)['exit_code']).toBe(7);
  // A long call queued behind a soft-paused one: neither road's poll of the paused call carries a row of the staged line's
  // echo. (The rejected continuation-line carrier also put a continuation prompt per line before its start marker; the
  // staged line is one short line and puts none.)
  await wideEchoCase(t, 6_000);
};


// `a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced` (live-run finding a71-8, OQ-164): a new command
// issued while an earlier one is soft-paused is queued behind it by the shell. Before the repair its observation said only
// its own exit, and the paused command's end waited for a poll nobody made; a second soft pause replaced the first paused
// call and its end was never reported at all. Its own session, window 1 s, so the timings are this case's.
export const pausedSession = async () => {
  const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }, env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')), warn: () => undefined });
  return { m, t: terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 1_000 }) };
};


// The verifier's findings on the repair above (repair round 1). An interrupt (`C-c`) makes the terminal discard the input the
// shell has not read, so a line queued behind the interrupted one never runs and its start marker never prints. The
// interrupted call was closed only by a later call's END frame, its capture cut at a marker that never appeared, and the
// next call carried its own start marker, its output and its end frame as the paused command's; the queued call read as
// abandoned by the shell, and both as having made the next call wait.
export const carried = (text: string) => text.slice(0, text.indexOf('[terminal_output]')).split('\n').map((l) => l.trim());
