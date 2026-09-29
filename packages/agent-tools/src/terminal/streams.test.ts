import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FakeClock, type Clocks } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { backgroundStreamId, foregroundStreamId, TERMINAL_COALESCE_FLOOR_MS, type TerminalFrame } from '@rotaris/contracts';
import type { EmulatorFactory } from './emulator.js';
import { xtermEmulatorFactory } from './emulator.js';
import { RETAINED_ENDED_PER_SESSION, TerminalStreams, type StreamSpec } from './streams.js';
import { findShell, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from './index.js';
import type { ToolContext } from '../tools/types.js';

/**
 * ADR-0021's first execution (Part AL). Two halves:
 *  - the registry on a FAKE clock and a fake emulator — the ceiling, the armed flush, the 20 ms floor, the closing
 *    burst, retention, the refusals, streaming off;
 *  - the same registry behind the REAL terminal tool, the host's REAL shell through a REAL PTY, on the node clocks —
 *    what `pnpm terminal-stream-proof` asserts over. Skipped where no shell is present (REQ-TOOLS-104).
 * With ROTARIS_TERMINAL_PROOF_DIR set, the real half writes its measurements there for the proof script.
 */
const fakeEmulator: EmulatorFactory = (spec) => {
  let text = '';
  let cols = spec.cols;
  let rows = spec.rows;
  return {
    get cols() { return cols; }, get rows() { return rows; },
    write: async (d) => { text += d; },
    resize: (c, r) => { cols = c; rows = r; },
    serialize: () => `SCREEN<${text}>`,
    text: () => text,
    truncated: false,
    dispose: () => undefined,
  };
};

function harness(settings: Partial<{ enabled: boolean; intervalMs: number; bufferKb: number }> = {}) {
  const clock = new FakeClock();
  const streams = new TerminalStreams({ clocks: clock, emulator: fakeEmulator, warn: () => undefined });
  streams.settings = () => ({ enabled: true, intervalMs: 100, bufferKb: 256, ...settings });
  const frames: TerminalFrame[] = [];
  streams.onFrame((f) => frames.push(f));
  const control = { writes: [] as string[], resized: [] as [number, number][], interrupted: 0, ended: 0, killed: 0 };
  const spec = (over: Partial<StreamSpec> = {}): StreamSpec => ({
    sessionId: 's1', streamId: 'fg:orchestrator', kind: 'agent', agentId: 'orchestrator', displayName: 'orchestrator', command: 'echo hi', cols: 80, rows: 24, workspaceRoot: 'D:/w',
    control: { write: (b) => { control.writes.push(b); return true; }, resize: (c, r) => { control.resized.push([c, r]); }, interrupt: () => { control.interrupted += 1; return true; }, endInput: () => { control.ended += 1; return true; }, kill: () => { control.killed += 1; } },
    ...over,
  });
  return { clock, streams, frames, control, spec };
}

describe('TerminalStreams — the sampling period is a ceiling (ADR-0021 Decision; REQ-TOOLS-126/127; REQ-SHELL-104)', () => {
  it('opens with a meta frame at seq 1, withholds output up to the interval, then frames it as one delta', () => {
    const h = harness();
    expect(h.streams.begin(h.spec())).toBe(true);
    expect(h.frames.map((f) => [f.seq, f.kind])).toEqual([[1, 'meta']]);
    expect(h.frames[0]!.meta).toMatchObject({ streamId: 'fg:orchestrator', sessionId: 's1', kind: 'agent', running: true, command: 'echo hi', acceptsInput: true, canKill: true, truncated: false, cols: 80, rows: 24 });
    h.streams.data('fg:orchestrator', 'a');
    h.clock.advance(50);
    h.streams.data('fg:orchestrator', 'b');
    h.clock.advance(49);
    expect(h.frames).toHaveLength(1);
    h.clock.advance(1);
    expect(h.frames.map((f) => [f.seq, f.kind, f.payload])).toEqual([[1, 'meta', ''], [2, 'delta', 'ab']]);
  });

  it('a keystroke arms a flush of the next output, no sooner than 20 ms after the previous frame, whatever the interval', () => {
    const h = harness({ intervalMs: 2000 });
    h.streams.begin(h.spec());
    h.clock.advance(1000);
    h.streams.data('fg:orchestrator', 'x');
    h.clock.advance(5);
    expect(h.frames).toHaveLength(1);
    // The previous frame (the meta) is 1005 ms old: the armed flush is immediate.
    h.streams.keystroke('fg:orchestrator');
    h.clock.advance(0);
    expect(h.frames.map((f) => f.kind)).toEqual(['meta', 'delta']);
    // A second keystroke 3 ms later with fresh output waits for the floor: 20 ms after the delta above, not 2000.
    h.clock.advance(3);
    h.streams.data('fg:orchestrator', 'y');
    h.streams.keystroke('fg:orchestrator');
    h.clock.advance(TERMINAL_COALESCE_FLOOR_MS - 4);
    expect(h.frames).toHaveLength(2);
    h.clock.advance(1);
    expect(h.frames.map((f) => [f.seq, f.kind, f.payload])).toEqual([[1, 'meta', ''], [2, 'delta', 'x'], [3, 'delta', 'y']]);
    expect(h.streams.counters.armedFlushes).toBe(2);
  });

  it('an armed stream whose output arrives later frames that output at the floor, not at the ceiling', () => {
    const h = harness({ intervalMs: 2000 });
    h.streams.begin(h.spec());
    h.streams.keystroke('fg:orchestrator');
    h.clock.advance(500);
    h.streams.data('fg:orchestrator', 'echo');
    h.clock.advance(0);
    expect(h.frames.map((f) => f.payload)).toEqual(['', 'echo']);
  });

  it('at the floor a stream emits at most 50 frames per second even when armed every millisecond (obligation 1)', () => {
    const h = harness({ intervalMs: 20 });
    h.streams.begin(h.spec());
    for (let t = 0; t < 1000; t += 1) { h.streams.data('fg:orchestrator', 'z'); h.streams.keystroke('fg:orchestrator'); h.clock.advance(1); }
    const deltas = h.frames.filter((f) => f.kind === 'delta');
    expect(deltas.length).toBeLessThanOrEqual(50);
    expect(deltas.map((f) => f.payload).join('')).toBe('z'.repeat(1000 - (h.frames.at(-1)?.kind === 'delta' ? 0 : 0)).slice(0, deltas.map((f) => f.payload).join('').length));
    for (let i = 1; i < h.frames.length; i += 1) expect(h.frames[i]!.seq).toBe(h.frames[i - 1]!.seq + 1);
  });

  it('the end of a command is the pending delta, the closing screen with the observation text, then the closing meta', () => {
    const h = harness();
    h.streams.begin(h.spec());
    h.streams.data('fg:orchestrator', 'partial');
    h.streams.end('fg:orchestrator', { exitCode: 3, finalText: 'final text' });
    expect(h.frames.map((f) => [f.seq, f.kind, f.payload, f.closing ?? null])).toEqual([[1, 'meta', '', null], [2, 'delta', 'partial', null], [3, 'screen', 'final text', true], [4, 'meta', '', null]]);
    expect(h.frames[3]!.meta).toMatchObject({ running: false, exitCode: 3, acceptsInput: false, canKill: false });
    // Ended twice is ended once (REQ-SHELL-105: running → closed exactly once).
    h.streams.end('fg:orchestrator', { exitCode: 9, finalText: 'again' });
    expect(h.frames).toHaveLength(4);
    expect(h.streams.list('s1')).toMatchObject([{ running: false, exitCode: 3 }]);
  });

  it('the next command on the same stream re-opens it in place: the counter and the screen continue', () => {
    const h = harness();
    h.streams.begin(h.spec());
    h.streams.data('fg:orchestrator', 'one');
    h.streams.end('fg:orchestrator', { exitCode: 0, finalText: 'one' });
    expect(h.streams.begin(h.spec({ command: 'echo two' }))).toBe(true);
    expect(h.frames.at(-1)).toMatchObject({ seq: 5, kind: 'meta', meta: { running: true, command: 'echo two' } });
    expect(h.frames.at(-1)!.meta!.exitCode).toBeUndefined();
    expect(h.streams.list('s1')).toHaveLength(1);
  });

  it('resync gives a late attacher one screen frame per stream — the serialisation while live, the final text once ended', async () => {
    const h = harness();
    h.streams.begin(h.spec());
    h.streams.data('fg:orchestrator', 'live bytes');
    h.streams.begin(h.spec({ streamId: 'bg:ts_00000001', kind: 'background', command: 'sleep' }));
    h.streams.end('bg:ts_00000001', { exitCode: 0, finalText: 'bg done' });
    const before = h.frames.length;
    expect(await h.streams.resync('s1')).toBe(2);
    const added = h.frames.slice(before);
    // The live stream's pending delta is flushed ahead of its screen so nothing is shown twice or out of order.
    expect(added.map((f) => [f.streamId, f.kind, f.payload, f.closing ?? null])).toEqual([
      ['fg:orchestrator', 'delta', 'live bytes', null], ['fg:orchestrator', 'screen', 'SCREEN<live bytes>', null], ['bg:ts_00000001', 'screen', 'bg done', true],
    ]);
  });

  it('REQ-SHELL-106: a resize always resizes the emulated screen, and the real terminal whenever one is registered (defect fifty)', () => {
    const h = harness();
    h.streams.begin(h.spec());
    expect(h.streams.resize('fg:orchestrator', 100, 30)).toEqual({ ok: true, value: undefined });
    expect(h.control.resized).toEqual([[100, 30]]);
    h.streams.end('fg:orchestrator', { exitCode: 0, finalText: '' });
    // The foreground shell outlives its command: a resize between commands reaches the PTY, so the next command runs in the new size.
    expect(h.streams.resize('fg:orchestrator', 60, 20)).toEqual({ ok: true, value: undefined });
    expect(h.control.resized).toEqual([[100, 30], [60, 20]]);
    expect(h.streams.list('s1')[0]).toMatchObject({ cols: 60, rows: 20 });
    expect(h.frames.at(-1)).toMatchObject({ kind: 'meta', meta: { cols: 60, rows: 20 } });
  });

  it('the controls: keys, interrupt and end-input arm the flush; every one refuses `ended` after exit; kill needs a capability', async () => {
    const h = harness();
    h.streams.begin(h.spec());
    expect(h.streams.sendKeys('fg:orchestrator', 'ls\r').ok).toBe(true);
    expect(h.control.writes).toEqual(['ls\r']);
    expect(h.streams.interrupt('fg:orchestrator').ok).toBe(true);
    expect(h.streams.endInput('fg:orchestrator').ok).toBe(true);
    expect(h.streams.counters.armedFlushes).toBe(3);
    expect(await h.streams.kill('fg:orchestrator')).toEqual({ ok: true, value: undefined });
    expect(h.control.killed).toBe(1);
    h.streams.end('fg:orchestrator', { exitCode: -1, finalText: '' });
    expect(h.streams.sendKeys('fg:orchestrator', 'x')).toEqual({ ok: false, error: 'ended' });
    expect(h.streams.interrupt('fg:orchestrator')).toEqual({ ok: false, error: 'ended' });
    expect(h.streams.endInput('fg:orchestrator')).toEqual({ ok: false, error: 'ended' });
    expect(await h.streams.kill('fg:orchestrator')).toEqual({ ok: false, error: 'ended' });
    expect(h.streams.sendKeys('fg:nobody', 'x')).toEqual({ ok: false, error: 'unknown-stream' });
    h.streams.begin(h.spec({ streamId: 'bg:ts_0000000a', kind: 'background', control: { write: () => true } }));
    expect(await h.streams.kill('bg:ts_0000000a')).toEqual({ ok: false, error: 'no-kill-capability' });
  });

  it('REQ-TOOLS-126: streaming off publishes nothing, lists nothing, and every control says so', () => {
    const h = harness({ enabled: false });
    expect(h.streams.begin(h.spec())).toBe(false);
    h.streams.data('fg:orchestrator', 'never');
    h.streams.end('fg:orchestrator', { exitCode: 0, finalText: 'never' });
    expect(h.frames).toEqual([]);
    expect(h.streams.list('s1')).toEqual([]);
    expect(h.streams.sendKeys('fg:orchestrator', 'x')).toEqual({ ok: false, error: 'streaming-disabled' });
  });

  it('REQ-SHELL-111: a stream of another session clears every earlier session; only ENDED streams are capped, never a live one', () => {
    const h = harness();
    h.streams.begin(h.spec());
    h.streams.begin(h.spec({ sessionId: 's2', streamId: 'fg:orchestrator' }));
    expect(h.streams.list('s1')).toEqual([]);
    expect(h.streams.list('s2')).toHaveLength(1);
    // Many LIVE streams in one session all coexist (the shipped ~40 of ADR-0021 obligation 2 exceeds nothing here).
    for (let i = 0; i < 50; i += 1) h.streams.begin(h.spec({ sessionId: 's2', streamId: backgroundStreamId(`live${String(i).padStart(6, '0')}`), kind: 'background' }));
    expect(h.streams.list('s2').filter((m) => m.running).length).toBe(51);
    // Ended streams beyond the cap are evicted oldest-first; a live stream is never dropped.
    for (let i = 0; i < RETAINED_ENDED_PER_SESSION + 5; i += 1) {
      const id = backgroundStreamId(`ended${String(i).padStart(6, '0')}`);
      h.streams.begin(h.spec({ sessionId: 's2', streamId: id, kind: 'background' }));
      h.streams.end(id, { exitCode: 0, finalText: '' });
    }
    expect(h.streams.list('s2').filter((m) => !m.running).length).toBeLessThanOrEqual(RETAINED_ENDED_PER_SESSION);
    expect(h.streams.list('s2').filter((m) => m.running).length).toBe(51);
    expect(h.streams.list('s2').some((m) => m.streamId === 'fg:orchestrator')).toBe(true);
  });

  it('the interval is clamped to REQ-TOOLS-126\'s range and the scrollback follows `terminal_stream_buffer_kb`', () => {
    const specs: { cols: number; rows: number; scrollback: number }[] = [];
    const clock = new FakeClock();
    const streams = new TerminalStreams({ clocks: clock, emulator: (s) => { specs.push(s); return fakeEmulator(s); }, warn: () => undefined });
    const frames: TerminalFrame[] = [];
    streams.onFrame((f) => frames.push(f));
    streams.settings = () => ({ enabled: true, intervalMs: 5, bufferKb: 0 });
    streams.begin({ sessionId: 's', streamId: 'fg:a', kind: 'agent', displayName: 'a', cols: 80, rows: 24, workspaceRoot: 'w', control: {} });
    streams.data('fg:a', 'q');
    clock.advance(19);
    expect(frames).toHaveLength(1);
    clock.advance(1);
    expect(frames).toHaveLength(2);
    streams.settings = () => ({ enabled: true, intervalMs: 100, bufferKb: 256 });
    streams.begin({ sessionId: 's', streamId: 'fg:b', kind: 'agent', displayName: 'b', cols: 80, rows: 24, workspaceRoot: 'w', control: {} });
    expect(specs.map((s) => s.scrollback)).toEqual([0, Math.floor((256 * 1024) / 80)]);
  });
});

describe('TerminalManager — REQ-TOOLS-108: the configured background limits reach the manager (defect fifty-two)', () => {
  it('takes `shell_max_background_sessions` and `shell_background_timeout` from the run, applies them to open managers, and defaults until then', () => {
    const clock = new FakeClock();
    const factory = { spawn: () => { throw new Error('no PTY is spawned here'); } };
    const m = new TerminalManager({ factory, backend: { kind: 'powershell', file: 'pwsh' }, clocks: clock, config: TERMINAL_DEFAULTS, env: {}, warn: () => undefined, emulator: fakeEmulator });
    const early = m.backgroundFor('D:/one');
    expect(early.max).toBe(20);
    expect(m.backgroundTimeoutS).toBeNull();
    m.setBackgroundLimits({ maxSessions: 3, timeoutS: 90 });
    expect(early.max).toBe(3);
    expect(m.backgroundFor('D:/two').max).toBe(3);
    expect(m.backgroundTimeoutS).toBe(90);
    expect(m.maxBackgroundSessions).toBe(3);
    // The minimum is 1 (REQ-TOOLS-108); a value below it is clamped, never zero.
    m.setBackgroundLimits({ maxSessions: 0, timeoutS: 0 });
    expect(early.max).toBe(1);
    expect(m.backgroundTimeoutS).toBe(1);
  });
});

describe('the xterm adapter — a screen, not a log (ADR-0021; REQ-SHELL-095)', () => {
  it('overwrites addressed cells, serialises a replayable screen, and reports truncation once a line leaves retention', async () => {
    const e = xtermEmulatorFactory({ cols: 10, rows: 3, scrollback: 2 });
    await e.write('hello\r\nworld\r\n');
    await e.write('\x1b[1;1Hjello');
    expect(e.text()).toBe('jello\nworld');
    expect(e.serialize()).toContain('jello');
    expect(e.truncated).toBe(false);
    await e.write('a\r\nb\r\nc\r\nd\r\ne\r\n');
    expect(e.truncated).toBe(true);
    e.resize(20, 4);
    expect([e.cols, e.rows]).toEqual([20, 4]);
    e.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The real half: the host's real shell through a real PTY, the node clocks, the real xterm emulator.
// ---------------------------------------------------------------------------------------------------------------------
const shell = findShell();
/**
 * REQ-TOOLS-104 sends Windows to PowerShell and every other host to a POSIX shell, so each command below is spelled
 * in the shell the host actually runs, as `terminal.test.ts` already does. This half was first written against
 * PowerShell alone, and on a POSIX host every command came back `not found`, exit 127, so nothing was measured there
 * (docs/defects/fixed/terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md). What is under
 * test is the stream: its frames, its counter, its armed flush, its resize and its kill. None of that belongs to
 * either language. The two spellings produce the same output, and the assertions after them are identical.
 */
const PS = shell?.kind === 'powershell';
const SH = {
  /** `line 1` … `line <n>`, one per line (`<word> <i>` for another word). */
  count: (n: number, word = 'line') => (PS ? `1..${n} | ForEach-Object { "${word} $_" }` : `i=1; while [ "$i" -le ${n} ]; do printf '${word} %s\\n' "$i"; i=$((i+1)); done`),
  /** One line on stdout. */
  echo: (text: string) => (PS ? `Write-Output ${text}` : `printf '%s\\n' ${text}`),
  /** Read one line typed at the terminal and print it back behind `got:`. */
  readBack: () => (PS ? '$typed = Read-Host; Write-Output "got:$typed"' : `read typed; printf 'got:%s\\n' "$typed"`),
  /** A native process's exit status, in a shell that keeps running (`exit` alone would end the persistent shell itself, ADR-0020). */
  exit: (code: number) => (PS ? `cmd /c "exit ${code}"` : `sh -c 'exit ${code}'`),
  /** The grid size the process itself reads from its terminal, as `cols=<c> rows=<r>`. */
  size: () => (PS ? 'Write-Output "cols=$($Host.UI.RawUI.WindowSize.Width) rows=$($Host.UI.RawUI.WindowSize.Height)"' : `stty size | { read r c; printf 'cols=%s rows=%s\\n' "$c" "$r"; }`),
  /** A word from `size()`'s own text that its output never contains: finding it would mean the echoed command leaked into the observation. */
  sizeWord: PS ? 'Write-Output' : 'stty',
  sleep: (seconds: number) => (PS ? `Start-Sleep -Seconds ${seconds}` : `sleep ${seconds}`),
};
const clocks: Clocks = nodeClocks();
const root = mkdtempSync(join(tmpdir(), 'rotaris-stream-'));
const measurements: Record<string, unknown> = {};
// The real-PTY half runs under the proof (`pnpm terminal-stream-proof`), which sets this and runs the suites serially,
// so it never contends with another PTY suite under the ordinary parallel `pnpm test` (codebase.md's known signature).
const proofDir = process.env['ROTARIS_TERMINAL_PROOF_DIR'];
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ workspaceRoot: root, sessionId: 'sess-1', agentName: 'orchestrator', persona: 'orchestrator', monotonic: clocks.monotonic, wall: clocks.wall, signal: new AbortController().signal, warn: () => undefined, ...over });
const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
const managers: TerminalManager[] = [];
async function realManager(over: Partial<typeof TERMINAL_DEFAULTS> = {}): Promise<TerminalManager> {
  const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 10_000, ...over }, env, warn: () => undefined });
  managers.push(m);
  return m;
}
const args = (a: Record<string, unknown>) => ({ command: '', is_input: false, reset: false, background: false, ...a }) as Parameters<ReturnType<typeof terminalTool>['execute']>[0];
const diag = (text: string) => JSON.parse(text.slice(text.indexOf('[terminal_diagnostic] ') + '[terminal_diagnostic] '.length)) as Record<string, unknown>;
const output = (text: string) => { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(text); return m ? m[1]! : ''; };
const gapless = (frames: readonly TerminalFrame[]): boolean => frames.every((f, i) => f.seq === i + 1);
const until = (pred: () => boolean, ms: number) => new Promise<boolean>((resolve) => { const t0 = performance.now(); const tick = () => { if (pred()) resolve(true); else if (performance.now() - t0 > ms) resolve(false); else setTimeout(tick, 5); }; tick(); });

afterAll(async () => {
  await Promise.all(managers.map((m) => m.dispose()));
  rmSync(root, { recursive: true, force: true });
  if (proofDir) {
    mkdirSync(proofDir, { recursive: true });
    const file = join(proofDir, 'measurements.json');
    const prior = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
    writeFileSync(file, JSON.stringify({ ...prior, ...measurements }, null, 2));
  }
});

describe.skipIf(!shell || !proofDir)('the live stream behind a real PTY (ADR-0021 first execution; REQ-TOOLS-127, REQ-SHELL-103/104)', () => {
  it('10,000 lines: the frames are gapless, the deltas concatenate to what the command wrote (live-run L9), the closing frame is the observation text', async () => {
    const m = await realManager();
    const tool = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 10_000 });
    const c = ctx();
    const frames: TerminalFrame[] = [];
    // What the session's tap carries (`CommandRegion`'s span since live-run L9), not every byte the PTY produced.
    let raw = '';
    let stop = false;
    m.streams.onFrame((f) => { frames.push(f); if (f.kind === 'screen' && f.closing) stop = true; });
    const session = m.session(`${c.sessionId}:${c.agentName}`, root);
    const untap = session.onOutput((chunk) => { if (!stop) raw += chunk; });
    const t0 = performance.now();
    const r = await tool.execute(args({ command: SH.count(10_000) }), c);
    const elapsed = performance.now() - t0;
    untap();
    expect(r.isError).toBe(false);
    expect(diag(r.text)['exit_code']).toBe(0);
    const text = output(r.text);
    expect(text.split('\n')).toHaveLength(10_000);
    expect(text.endsWith('line 10000')).toBe(true);
    const own = frames.filter((f) => f.streamId === foregroundStreamId('orchestrator'));
    expect(own).toEqual(frames);
    expect(gapless(own)).toBe(true);
    expect(own[0]!.kind).toBe('meta');
    const deltas = own.filter((f) => f.kind === 'delta');
    expect(deltas.map((f) => f.payload).join('')).toBe(raw);
    // Live-run L9 (REQ-TOOLS-127): the tap carries what the command wrote — the wrapper's echo, its two markers, the
    // prompt and the product's own environment snapshot after the command are withheld — so the deltas start at the
    // command's first line and end at its last.
    const written = deltas.map((f) => f.payload).join('');
    expect(written).not.toContain('__rot_');
    expect(written.startsWith('line 1\r\n') || written.startsWith('line 1\n')).toBe(true);
    expect(written.trimEnd().endsWith('line 10000')).toBe(true);
    const closing = own.find((f) => f.kind === 'screen' && f.closing);
    expect(closing?.payload).toBe(text);
    expect(own.at(-1)).toMatchObject({ kind: 'meta', meta: { running: false, exitCode: 0 } });
    expect(own.indexOf(closing!)).toBe(own.length - 2);
    // The ceiling: at the 100 ms default no two deltas of one stream are closer than the floor.
    measurements['tenThousandLines'] = { frames: own.length, deltas: deltas.length, bytes: raw.length, elapsedMs: Math.round(elapsed), gapless: gapless(own), deltasEqualTap: deltas.map((f) => f.payload).join('') === raw, deltasCarryNoMarker: !written.includes('__rot_'), closingEqualsObservation: closing?.payload === text };
  });

  it('a background session publishes on its own `bg:<id>` stream with its own counter, and the foreground keeps its own', async () => {
    const m = await realManager();
    const tool = terminalTool(m, TERMINAL_DEFAULTS);
    const c = ctx();
    const frames: TerminalFrame[] = [];
    m.streams.onFrame((f) => frames.push(f));
    const r = await tool.execute(args({ command: SH.count(50, 'bg'), background: true }), c);
    const id = String(diag(r.text)['session_id']);
    const streamId = backgroundStreamId(id);
    expect(await until(() => frames.some((f) => f.streamId === streamId && f.kind === 'meta' && f.meta?.running === false), 20_000)).toBe(true);
    const bg = frames.filter((f) => f.streamId === streamId);
    expect(gapless(bg)).toBe(true);
    expect(bg[0]!.meta).toMatchObject({ kind: 'background', displayName: `Background session ${id}`, running: true, canKill: true, acceptsInput: true });
    expect(bg.filter((f) => f.kind === 'delta').map((f) => f.payload).join('')).toContain('bg 50');
    expect(bg.find((f) => f.closing)?.payload).toContain('bg 50');
    await tool.execute(args({ command: SH.echo('fg') }), c);
    const fg = frames.filter((f) => f.streamId === foregroundStreamId('orchestrator'));
    expect(gapless(fg)).toBe(true);
    expect(m.streams.list('sess-1').map((s) => s.streamId).sort()).toEqual([streamId, 'fg:orchestrator'].sort());
    measurements['backgroundStream'] = { streamId, frames: bg.length, gapless: gapless(bg), foregroundFrames: fg.length };
  });

  it('with the interval at 2,000 ms a keystroke arms a flush: the echo is framed within the floor, not the ceiling', async () => {
    const m = await realManager();
    m.streams.settings = () => ({ enabled: true, intervalMs: 2000, bufferKb: 256 });
    const tool = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 10_000 });
    const c = ctx();
    const frames: (TerminalFrame & { at: number })[] = [];
    m.streams.onFrame((f) => frames.push({ ...f, at: performance.now() }));
    const running = tool.execute(args({ command: SH.readBack() }), c);
    const streamId = foregroundStreamId('orchestrator');
    // Let the prompt's own output settle behind the 2 s ceiling before the keystroke, so the flush measured is the armed one.
    await new Promise((r) => setTimeout(r, 2_300));
    const before = frames.length;
    const pressedAt = performance.now();
    expect(m.streams.sendKeys(streamId, 'abc').ok).toBe(true);
    expect(await until(() => frames.slice(before).some((f) => f.kind === 'delta' && f.payload.includes('abc')), 1_500)).toBe(true);
    const echo = frames.slice(before).find((f) => f.kind === 'delta' && f.payload.includes('abc'))!;
    const echoMs = echo.at - pressedAt;
    expect(echoMs).toBeLessThan(500);
    expect(m.streams.sendKeys(streamId, '\r').ok).toBe(true);
    const r = await running;
    expect(output(r.text)).toContain('got:abc');
    measurements['armedFlush'] = { intervalMs: 2000, keyToFrameMs: Number(echoMs.toFixed(1)), floorMs: TERMINAL_COALESCE_FLOOR_MS };
  });

  it('REQ-TOOLS-126: streaming off publishes nothing and changes nothing the agent sees — same exit code, same output', async () => {
    const on = await realManager();
    const off = await realManager();
    off.streams.settings = () => ({ enabled: false, intervalMs: 100, bufferKb: 256 });
    const onFrames: TerminalFrame[] = [];
    const offFrames: TerminalFrame[] = [];
    on.streams.onFrame((f) => onFrames.push(f));
    off.streams.onFrame((f) => offFrames.push(f));
    // A native exit status (`exit` alone would end the persistent shell itself, ADR-0020).
    const command = `${SH.count(200)}; ${SH.exit(3)}`;
    const a = await terminalTool(on, TERMINAL_DEFAULTS).execute(args({ command }), ctx());
    const b = await terminalTool(off, TERMINAL_DEFAULTS).execute(args({ command }), ctx());
    expect(onFrames.length).toBeGreaterThan(2);
    expect(offFrames).toEqual([]);
    expect(diag(a.text)['exit_code']).toBe(3);
    expect(diag(b.text)['exit_code']).toBe(3);
    expect(output(a.text)).toBe(output(b.text));
    expect(off.streams.list('sess-1')).toEqual([]);
    expect(off.streams.sendKeys('fg:orchestrator', 'x')).toEqual({ ok: false, error: 'streaming-disabled' });
    measurements['streamingOff'] = { onFrames: onFrames.length, offFrames: offFrames.length, exitOn: diag(a.text)['exit_code'], exitOff: diag(b.text)['exit_code'], outputEqual: output(a.text) === output(b.text) };
  });

  it('a grid resize to 80×24 reaches the process, and the observation stays clean of the wrapped wrapper (ADR-0020 c.2)', async () => {
    const m = await realManager();
    const tool = terminalTool(m, TERMINAL_DEFAULTS);
    const c = ctx();
    await tool.execute(args({ command: SH.echo('warm') }), c);
    expect(m.streams.resize(foregroundStreamId('orchestrator'), 80, 24).ok).toBe(true);
    const r = await tool.execute(args({ command: `${SH.size()}; ${SH.echo('second')}` }), c);
    expect(diag(r.text)['exit_code']).toBe(0);
    const text = output(r.text);
    expect(text).toContain('cols=80 rows=24');
    expect(text.split('\n').at(-1)).toBe('second');
    expect(text).not.toContain(SH.sizeWord);
    expect(text).not.toContain('__rot_');
    measurements['resize'] = { reported: /cols=\d+ rows=\d+/.exec(text)?.[0] ?? null, clean: !text.includes('__rot_') && !text.includes(SH.sizeWord) };
  });

  it('kill from the terminal window ends the running command with exit −1 and a stated reason, and closes the stream', async () => {
    const m = await realManager();
    const tool = terminalTool(m, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 20_000 });
    const c = ctx();
    const frames: TerminalFrame[] = [];
    m.streams.onFrame((f) => frames.push(f));
    const running = tool.execute(args({ command: `${SH.sleep(30)}; ${SH.echo('never')}` }), c);
    const streamId = foregroundStreamId('orchestrator');
    expect(await until(() => frames.some((f) => f.streamId === streamId), 5_000)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(await m.streams.kill(streamId)).toEqual({ ok: true, value: undefined });
    const r = await running;
    expect(diag(r.text)).toMatchObject({ exit_code: -1, kill_status: 'session_reset' });
    expect(r.text).toContain('killed from the terminal window');
    expect(frames.at(-1)).toMatchObject({ kind: 'meta', meta: { running: false, exitCode: -1 } });
  });
});
