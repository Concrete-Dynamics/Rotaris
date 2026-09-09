import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION, bytesFor, describeKey, encodeKey, isNavigationKey, NAMED_KEY_LIST, THEMES, TERM_ANSI_NAMES, type EncodedKey, type KeyEvent, type TerminalStreamMeta } from '@rotaris/contracts';
import { AuditBuffer } from './audit.js';
import { applyFrame, createStreamDisplay } from './emulator.js';
import type { DisplayFrame } from './frames.js';
import { GeometryReporter, MIN_COLS, MIN_ROWS, proposeGeometry, TERM_GUTTER_PX } from './geometry.js';
import { headlessEmulator, parsed } from './headless.js';
import { decideKey } from './keys.js';
import { BANNERS, backgroundDisplayName, commandLabel, elide, KILL_DIALOG, outcomeLabel, tabLabel, tabTooltip, terminalWindowTitle } from './labels.js';
import { copyText, extractSelection, normaliseRange } from './selection.js';
import { TerminalStreamSet } from './streams.js';
import { DELTA_LINE, DELTA_PAGE, DELTA_PIXEL, WheelAccumulator } from './wheel.js';

const key = (k: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

// ── REQ-SHELL-096: the closed vocabulary ─────────────────────────────────────────────────────────────────────
describe('terminal-keys — the closed encoding vocabulary (REQ-SHELL-096, ADR-0047)', () => {
  it('names the twelve named keys and the control chords, and nothing else', () => {
    const expected: Record<string, string> = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', Tab: 'TAB', Backspace: 'BS', Escape: 'ESC', Enter: 'ENTER' };
    for (const [dom, named] of Object.entries(expected)) expect(encodeKey(key(dom))).toEqual({ kind: 'named', key: named });
    expect(NAMED_KEY_LIST).toEqual(Object.values(expected));
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(encodeKey(key(letter, { ctrlKey: true }))).toEqual({ kind: 'named', key: `C-${letter}` });
    expect(encodeKey(key('C', { ctrlKey: true }))).toEqual({ kind: 'named', key: 'C-c' });
  });
  it('sends printable text verbatim, a surrogate pair included, and AltGr printables as text', () => {
    expect(encodeKey(key('a'))).toEqual({ kind: 'text', text: 'a' });
    expect(encodeKey(key('A', { shiftKey: true }))).toEqual({ kind: 'text', text: 'A' });
    expect(encodeKey(key('😀'))).toEqual({ kind: 'text', text: '😀' });
    expect(encodeKey(key('@', { ctrlKey: true, altKey: true }))).toEqual({ kind: 'text', text: '@' });
  });
  it('transmits NOTHING for a key outside the vocabulary — no substitute sequence', () => {
    for (const k of ['F5', 'Insert', 'Delete', 'F1', 'Shift', 'Control', 'CapsLock', 'Unidentified']) expect(encodeKey(key(k))).toBeNull();
    expect(encodeKey(key('ArrowUp', { altKey: true }))).toBeNull();
    expect(encodeKey(key('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(encodeKey(key('ArrowUp', { shiftKey: true }))).toBeNull();
    expect(encodeKey(key('Tab', { shiftKey: true }))).toBeNull();
    expect(encodeKey(key('a', { metaKey: true }))).toBeNull();
    expect(encodeKey(key('1', { ctrlKey: true }))).toBeNull();
  });
  it('carries one PTY byte table beside the encoder', () => {
    const b = (k: EncodedKey) => Array.from(bytesFor(k));
    expect(b({ kind: 'named', key: 'UP' })).toEqual([0x1b, 0x5b, 0x41]);
    expect(b({ kind: 'named', key: 'PGDN' })).toEqual([0x1b, 0x5b, 0x36, 0x7e]);
    expect(b({ kind: 'named', key: 'BS' })).toEqual([0x7f]);
    expect(b({ kind: 'named', key: 'ENTER' })).toEqual([0x0d]);
    expect(b({ kind: 'named', key: 'C-c' })).toEqual([0x03]);
    expect(b({ kind: 'named', key: 'C-d' })).toEqual([0x04]);
    expect(b({ kind: 'text', text: 'é' })).toEqual([0xc3, 0xa9]);
    for (const named of NAMED_KEY_LIST) expect(bytesFor({ kind: 'named', key: named }).length).toBeGreaterThan(0);
  });
  it('phrases a refused key for REQ-SHELL-094 and knows which keys are navigation for REQ-SHELL-107', () => {
    expect(describeKey({ kind: 'named', key: 'UP' })).toBe('send UP');
    expect(describeKey({ kind: 'named', key: 'C-c' })).toBe('send C-c');
    expect(describeKey({ kind: 'text', text: 'x' })).toBe('send that key');
    expect(isNavigationKey({ kind: 'named', key: 'PGUP' })).toBe(true);
    expect(isNavigationKey({ kind: 'named', key: 'ENTER' })).toBe(false);
    expect(isNavigationKey({ kind: 'named', key: 'C-c' })).toBe(false);
  });
});

// ── REQ-SHELL-097: the five ordered rules ────────────────────────────────────────────────────────────────────
describe('keys — the five-rule priority (REQ-SHELL-097, REQ-SHELL-089/090/091)', () => {
  const unarmed = { armed: false, running: true, hasSelection: false };
  const armed = { armed: true, running: true, hasSelection: false };
  it('(1) copy beats interrupt: Ctrl+C with a selection, Ctrl+Shift+C always', () => {
    expect(decideKey({ ...armed, hasSelection: true }, key('c', { ctrlKey: true }))).toEqual({ kind: 'copy' });
    expect(decideKey(armed, key('C', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'copy' });
    expect(decideKey(unarmed, key('C', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'copy' });
    expect(decideKey(armed, key('c', { ctrlKey: true }))).toEqual({ kind: 'send', key: { kind: 'named', key: 'C-c' } });
  });
  it('(2) Shift+Tab always leaves and is never forwarded; plain Tab traverses while unarmed and is TAB while armed', () => {
    expect(decideKey(armed, key('Tab', { shiftKey: true }))).toEqual({ kind: 'leave' });
    expect(decideKey(unarmed, key('Tab', { shiftKey: true }))).toEqual({ kind: 'leave' });
    expect(decideKey(unarmed, key('Tab'))).toEqual({ kind: 'traverse' });
    expect(decideKey(armed, key('Tab'))).toEqual({ kind: 'send', key: { kind: 'named', key: 'TAB' } });
  });
  it('(3) scrollback keys scroll locally while unarmed; armed, the Shift/Ctrl forms scroll and the plain forms go to the process', () => {
    expect(decideKey(unarmed, key('PageUp'))).toEqual({ kind: 'scroll', to: 'page-up' });
    expect(decideKey(unarmed, key('End'))).toEqual({ kind: 'scroll', to: 'bottom' });
    expect(decideKey(armed, key('PageUp', { shiftKey: true }))).toEqual({ kind: 'scroll', to: 'page-up' });
    expect(decideKey(armed, key('Home', { ctrlKey: true }))).toEqual({ kind: 'scroll', to: 'top' });
    expect(decideKey(armed, key('PageDown'))).toEqual({ kind: 'send', key: { kind: 'named', key: 'PGDN' } });
    expect(decideKey(armed, key('Home'))).toEqual({ kind: 'send', key: { kind: 'named', key: 'HOME' } });
  });
  it('(4) unarmed, any printable or named key is rejected — never silently discarded — and a modifier alone is not', () => {
    expect(decideKey(unarmed, key('x'))).toEqual({ kind: 'rejected' });
    expect(decideKey(unarmed, key('ArrowUp'))).toEqual({ kind: 'rejected' });
    expect(decideKey(unarmed, key('Enter'))).toEqual({ kind: 'rejected' });
    expect(decideKey(unarmed, key('Delete'))).toEqual({ kind: 'rejected' });
    expect(decideKey(unarmed, key('c', { ctrlKey: true }))).toEqual({ kind: 'rejected' });
    expect(decideKey(unarmed, key('Shift', { shiftKey: true }))).toEqual({ kind: 'ignore' });
  });
  it('(5) armed, keys are forwarded per REQ-SHELL-096 and an unmapped key transmits nothing', () => {
    expect(decideKey(armed, key('x'))).toEqual({ kind: 'send', key: { kind: 'text', text: 'x' } });
    expect(decideKey(armed, key('ArrowUp'))).toEqual({ kind: 'send', key: { kind: 'named', key: 'UP' } });
    expect(decideKey(armed, key('F5'))).toEqual({ kind: 'ignore' });
    expect(decideKey(armed, key('ArrowUp', { altKey: true }))).toEqual({ kind: 'ignore' });
  });
  it('REQ-SHELL-091: once the process has exited nothing is sent and nothing is rejected, but copy and scrolling still work', () => {
    const ended = { ...armed, running: false };
    expect(decideKey(ended, key('x'))).toEqual({ kind: 'ignore' });
    expect(decideKey({ ...unarmed, running: false }, key('x'))).toEqual({ kind: 'ignore' });
    expect(decideKey({ ...ended, hasSelection: true }, key('c', { ctrlKey: true }))).toEqual({ kind: 'copy' });
    expect(decideKey(ended, key('PageUp', { shiftKey: true }))).toEqual({ kind: 'scroll', to: 'page-up' });
  });
});

// ── REQ-SHELL-101: the wheel ─────────────────────────────────────────────────────────────────────────────────
describe('wheel — three rows per notch with the fractional remainder carried (REQ-SHELL-101, ADR-0047 c.4)', () => {
  it('one standard notch scrolls exactly three rows in the wheel\'s direction', () => {
    const w = new WheelAccumulator();
    expect(w.rows(100, DELTA_PIXEL, 24)).toBe(3);
    expect(w.rows(-100, DELTA_PIXEL, 24)).toBe(-3);
    expect(w.pending).toBe(0);
  });
  it('ten tenths of a notch make three rows, arriving on the fourth, seventh and tenth events', () => {
    const w = new WheelAccumulator();
    const arrivals: number[] = [];
    for (let i = 1; i <= 10; i += 1) if (w.rows(10, DELTA_PIXEL, 24) !== 0) arrivals.push(i);
    expect(arrivals).toEqual([4, 7, 10]);
    expect(w.pending).toBeCloseTo(0, 9);
  });
  it('a third of a notch three times advances, and a reversal cancels the remainder first', () => {
    const w = new WheelAccumulator();
    expect(w.rows(33.3, DELTA_PIXEL, 24)).toBe(0);
    expect(w.rows(33.3, DELTA_PIXEL, 24)).toBe(1);
    expect(w.rows(-33.3, DELTA_PIXEL, 24)).toBe(0);
    expect(w.pending).toBeCloseTo(0.999 - 1, 9);
  });
  it('line and page delta modes scroll proportionally', () => {
    const w = new WheelAccumulator();
    expect(w.rows(3, DELTA_LINE, 24)).toBe(3);
    expect(w.rows(1, DELTA_PAGE, 24)).toBe(24);
  });
});

// ── REQ-SHELL-101: the selection ─────────────────────────────────────────────────────────────────────────────
describe('selection — whole cells, direction-independent, right-trimmed, newline-joined (REQ-SHELL-101)', () => {
  const rows = ['first row     ', 'second   ', '', 'fourth row here'];
  const read = (y: number, from: number, to: number) => (rows[y] ?? '').padEnd(20).slice(from, to);
  it('yields the same range whichever way it was dragged', () => {
    expect(normaliseRange({ x: 3, y: 2 }, { x: 1, y: 0 })).toEqual(normaliseRange({ x: 1, y: 0 }, { x: 3, y: 2 }));
    expect(normaliseRange({ x: 5, y: 1 }, { x: 2, y: 1 })).toEqual({ start: { x: 2, y: 1 }, end: { x: 5, y: 1 } });
  });
  it('right-trims each row and joins with newlines, an empty row in the middle included', () => {
    expect(extractSelection(read, { start: { x: 6, y: 0 }, end: { x: 7, y: 3 } }, 20)).toBe('row\nsecond\n\nfourth');
    expect(extractSelection(read, { start: { x: 0, y: 1 }, end: { x: 20, y: 1 } }, 20)).toBe('second');
  });
  it('an empty selection copies nothing and reports failure', () => {
    expect(copyText('')).toEqual({ ok: false, reason: 'Nothing is selected.' });
    expect(copyText('x')).toEqual({ ok: true, text: 'x' });
  });
});

// ── REQ-SHELL-107: the audit buffer ──────────────────────────────────────────────────────────────────────────
describe('audit — one entry per submitted line, chords flush, navigation unlogged (REQ-SHELL-107)', () => {
  const text = (t: string): EncodedKey => ({ kind: 'text', text: t });
  const named = (k: 'UP' | 'BS' | 'ENTER' | 'C-c' | 'ESC'): EncodedKey => ({ kind: 'named', key: k });
  it('accumulates a held key into one line and writes it on Enter', () => {
    const a = new AuditBuffer();
    const out = ['l', 's', ' ', '-', 'l', 'a'].flatMap((c) => [...a.onKey(text(c))]);
    expect(out).toEqual([]);
    expect(a.onKey(named('ENTER'))).toEqual([{ kind: 'line', text: 'ls -la' }]);
    expect(a.onKey(named('ENTER'))).toEqual([]);
  });
  it('Backspace removes from the pending buffer; arrows and Escape are never logged', () => {
    const a = new AuditBuffer();
    a.onKey(text('a')); a.onKey(text('b')); a.onKey(named('BS')); a.onKey(named('UP')); a.onKey(named('ESC'));
    expect(a.pendingLine).toBe('a');
  });
  it('a control chord flushes the pending line and then logs itself; the buttons log the same way', () => {
    const a = new AuditBuffer();
    a.onKey(text('y'));
    expect(a.onKey(named('C-c'))).toEqual([{ kind: 'line', text: 'y' }, { kind: 'control', text: 'C-c' }]);
    expect(a.control('C-d')).toEqual([{ kind: 'control', text: 'C-d' }]);
    expect(a.tookControl()).toEqual([{ kind: 'took-control' }]);
    a.onKey(text('q'));
    expect(a.releasedControl()).toEqual([{ kind: 'line', text: 'q' }, { kind: 'released-control' }]);
    expect(a.kill()).toEqual([{ kind: 'kill' }]);
  });
});

// ── REQ-SHELL-100: the geometry guard ────────────────────────────────────────────────────────────────────────
describe('geometry — the 6 px gutter, the 20×4 floor, and never a placeholder-size report (REQ-SHELL-100, ADR-0047)', () => {
  const cell = { cellWidth: 8, cellHeight: 16 };
  it('derives the grid from the host less the gutter', () => {
    expect(TERM_GUTTER_PX).toBe(6);
    expect(proposeGeometry({ ...cell, hostWidth: 8 * 80 + 12, hostHeight: 16 * 24 + 12, visible: true })).toEqual({ cols: 80, rows: 24 });
  });
  it('reports nothing for a hidden, unmeasured, zero-size or below-minimum host', () => {
    expect(proposeGeometry({ ...cell, hostWidth: 900, hostHeight: 600, visible: false })).toBeNull();
    expect(proposeGeometry({ cellWidth: 0, cellHeight: 0, hostWidth: 900, hostHeight: 600, visible: true })).toBeNull();
    expect(proposeGeometry({ ...cell, hostWidth: 0, hostHeight: 0, visible: true })).toBeNull();
    expect(proposeGeometry({ ...cell, hostWidth: 8 * (MIN_COLS - 1) + 12, hostHeight: 16 * MIN_ROWS + 12, visible: true })).toBeNull();
    expect(proposeGeometry({ ...cell, hostWidth: 8 * MIN_COLS + 12, hostHeight: 16 * MIN_ROWS + 12, visible: true })).toEqual({ cols: 20, rows: 4 });
  });
  it('reports only when the geometry changes', () => {
    const reports: { cols: number; rows: number }[] = [];
    const r = new GeometryReporter((g) => reports.push(g));
    expect(r.offer(null)).toBe(false);
    expect(r.offer({ cols: 80, rows: 24 })).toBe(true);
    expect(r.offer({ cols: 80, rows: 24 })).toBe(false);
    expect(r.offer({ cols: 100, rows: 30 })).toBe(true);
    expect(reports).toEqual([{ cols: 80, rows: 24 }, { cols: 100, rows: 30 }]);
  });
});

// ── REQ-SHELL-082/087/092/081: the labels ────────────────────────────────────────────────────────────────────
describe('labels — tab, header, tooltip, dialog and title text (REQ-SHELL-081/082/087/092)', () => {
  const meta = (over: Partial<TerminalStreamMeta>): TerminalStreamMeta => ({ streamId: 'fg:agent-1', sessionId: 's', kind: 'agent', displayName: 'Coder 1', running: true, truncated: false, cols: 80, rows: 24, acceptsInput: true, canKill: true, ...over });
  it('labels a tab with the command elided to 28, else the display name, never the raw id', () => {
    expect(tabLabel(meta({ command: 'pytest -q tests/billing --maxfail=1 --durations=5' }))).toBe('pytest -q tests/billing --m…');
    expect(tabLabel(meta({ command: 'pytest -q tests/billing --m…' })).length).toBe(28);
    expect(tabLabel(meta({}))).toBe('Coder 1');
    expect(tabLabel(meta({ displayName: '' }))).toBe('Terminal');
    expect(tabLabel(null)).toBe('Terminal');
    expect(backgroundDisplayName('bg-0123456789abcdef')).toBe('Background session bg-01234567…');
  });
  it('tooltips and outcomes', () => {
    expect(tabTooltip(meta({}))).toBe('Coder 1 · running');
    expect(tabTooltip(meta({ running: false, exitCode: 130 }))).toBe('Coder 1 · exit 130');
    expect(outcomeLabel(meta({ running: false }))).toBe('exited');
    expect(commandLabel(meta({ command: 'x'.repeat(200) })).text.length).toBe(92);
    expect(commandLabel(meta({ command: 'ls' }))).toEqual({ text: '$ ls', full: '$ ls' });
    expect(elide('a b', 3)).toBe('a b');
  });
  it('the kill dialog names the command or the fallback, then the two consequences', () => {
    expect(KILL_DIALOG.lines('make test')).toEqual(['$ make test', "The agent reads the killed command's output as its result.", 'Anything the command had not written yet is lost.']);
    expect(KILL_DIALOG.lines(undefined)[0]).toBe('The command running in this terminal');
    expect(KILL_DIALOG.title).toBe('Kill this command?');
    expect(KILL_DIALOG.confirm).toBe('Kill command');
  });
  it('the window title and the banners', () => {
    expect(terminalWindowTitle(null)).toBe('Rotaris · Terminal');
    expect(terminalWindowTitle('billing fixes')).toBe('Rotaris · Terminal — billing fixes');
    expect(BANNERS.refused('send UP').body).toBe('Rotaris could not send UP. The process may have ended already.');
    expect(BANNERS.exited('exit 3').body).toBe('exit 3. The output stays readable and copyable.');
    expect(BANNERS.readOnly().action).toBe('Take control');
  });
});

// ── REQ-SHELL-095/104/105: the display emulator over frames ──────────────────────────────────────────────────
const META: TerminalStreamMeta = { streamId: 'fg:a', sessionId: 's', kind: 'agent', displayName: 'Coder 1', command: 'demo', running: true, truncated: false, cols: 40, rows: 6, acceptsInput: true, canKill: true };
const frame = (seq: number, kind: DisplayFrame['kind'], payload: string, extra: Partial<DisplayFrame> = {}): DisplayFrame => ({ v: CONTRACT_SCHEMA_VERSION, sessionId: 's', streamId: 'fg:a', seq, kind, payload, ...extra });

describe('emulator — a character grid, not a log (REQ-SHELL-095), applied by sequence (REQ-SHELL-104/105)', () => {
  it('cursor addressing overwrites the cells it addresses instead of appending', async () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'screen', 'line one\r\nline two\r\nline three', { meta: META }));
    set.apply(frame(2, 'delta', '\x1b[2;6HTWO!'));
    const e = set.get('fg:a')!.emulator;
    await parsed(e);
    expect(e.snapshot().lines.slice(0, 3)).toEqual(['line one', 'line TWO!', 'line three']);
    expect(e.snapshot().lines.length).toBe(6);
  });
  it('entering the alternate screen replaces the visible content and leaving it restores what was there', async () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'screen', 'main content', { meta: META }));
    set.apply(frame(2, 'delta', '\x1b[?1049h\x1b[HFULL SCREEN APP'));
    const e = set.get('fg:a')!.emulator;
    await parsed(e);
    expect(e.snapshot().alternate).toBe(true);
    expect(e.snapshot().lines[0]).toBe('FULL SCREEN APP');
    set.apply(frame(3, 'delta', '\x1b[?1049l'));
    await parsed(e);
    expect(e.snapshot().alternate).toBe(false);
    expect(e.snapshot().lines[0]).toBe('main content');
  });
  it('a progress indicator that rewrites its own line is seen updating in place', async () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'screen', '', { meta: META }));
    for (let i = 1; i <= 5; i += 1) set.apply(frame(1 + i, 'delta', `\rprogress ${i * 20}%`));
    const e = set.get('fg:a')!.emulator;
    await parsed(e);
    expect(e.snapshot().lines.filter((l) => l !== '')).toEqual(['progress 100%']);
  });
  it('an already-applied sequence number is never applied twice, and a screen frame after deltas never doubles a line', async () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'screen', 'a', { meta: META }));
    expect(set.apply(frame(2, 'delta', '\r\nb'))).toBe('applied');
    expect(set.apply(frame(2, 'delta', '\r\nb'))).toBe('stale');
    expect(set.apply(frame(1, 'screen', 'a'))).toBe('stale');
    // A resync: the authoritative screen re-sent as one `screen` frame. Deltas 1–2 were queued before it and must land before it.
    set.apply(frame(3, 'screen', 'a\r\nb'));
    const e = set.get('fg:a')!.emulator;
    await parsed(e);
    expect(e.snapshot().lines.filter((l) => l !== '')).toEqual(['a', 'b']);
    expect(set.get('fg:a')!.lastSeq).toBe(3);
    expect(set.get('fg:a')!.framesApplied).toBe(3);
  });
  it('meta frames synchronise idempotently, resize the screen, and run to closed exactly once', () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'meta', '', { meta: META }));
    expect(set.get('fg:a')!.emulator.cols).toBe(40);
    set.apply(frame(2, 'meta', '', { meta: { ...META, cols: 100, rows: 30, truncated: true } }));
    expect(set.get('fg:a')!.emulator.cols).toBe(100);
    expect(set.get('fg:a')!.meta.truncated).toBe(true);
    expect(set.running()).toBe(1);
    set.apply(frame(3, 'meta', '', { meta: { ...META, running: false, exitCode: 2 } }));
    expect(set.get('fg:a')!.closed).toBe(true);
    expect(set.get('fg:a')!.meta.exitCode).toBe(2);
    expect(set.running()).toBe(0);
    // A late `running: true` cannot reopen it (REQ-SHELL-105: running → closed exactly once).
    set.apply(frame(4, 'meta', '', { meta: { ...META, running: true } }));
    expect(set.get('fg:a')!.meta.running).toBe(false);
    expect(set.get('fg:a')!.meta.exitCode).toBe(2);
  });
  it('the closing frame is a literal replacement (OQ-5 reading): plain text, newlines carried to column 0', async () => {
    const set = new TerminalStreamSet(headlessEmulator);
    set.apply(frame(1, 'screen', 'vt \x1b[31mred\x1b[0m', { meta: META }));
    set.apply(frame(2, 'screen', 'final\noutput\ntext', { closing: true, meta: { ...META, running: false, exitCode: 0 } }));
    const e = set.get('fg:a')!.emulator;
    await parsed(e);
    expect(e.snapshot().lines.slice(0, 3)).toEqual(['final', 'output', 'text']);
    expect(set.previewOf('fg:a')).toMatchObject({ lines: ['final', 'output', 'text'], running: false, exitCode: 0, command: 'demo', displayName: 'Coder 1' });
  });
  it('an unknown stream displays "Terminal" until a meta frame names it; a stream exists only once a frame arrived; clear() empties everything', () => {
    const set = new TerminalStreamSet(headlessEmulator);
    expect(set.list()).toEqual([]);
    expect(set.previewOf('fg:a')).toBeNull();
    set.apply(frame(1, 'delta', 'x'));
    expect(set.previewOf('fg:a')?.displayName).toBe('Terminal');
    expect(set.totalSeen).toBe(1);
    const seen: string[] = [];
    set.subscribe((id, outcome) => seen.push(`${id}:${outcome}`));
    set.clear();
    expect(set.list()).toEqual([]);
    expect(set.totalSeen).toBe(0);
    expect(seen).toEqual(['fg:a:cleared']);
  });
  it('a stand-alone display refuses a frame for another stream', () => {
    const d = createStreamDisplay(frame(1, 'screen', ''), headlessEmulator);
    expect(applyFrame(d, { ...frame(2, 'delta', 'x'), streamId: 'bg:other' }).outcome).toBe('wrong-stream');
  });
});

// ── REQ-SHELL-098: the sixteen colours as tokens, in every palette ───────────────────────────────────────────
describe('theme — the terminal tokens exist in every palette (REQ-SHELL-098, ADR-0050 note)', () => {
  it('declares the ground, the ink, the cursor, the selection and the sixteen ANSI colours for all three themes', () => {
    for (const theme of THEMES) {
      const c = theme.tokens.color;
      for (const name of ['bg', 'fg', 'cursor', 'selection', ...TERM_ANSI_NAMES]) expect(c[`--rt-term-${name}`], `${theme.name} --rt-term-${name}`).toMatch(/^oklch\(/);
    }
    expect(TERM_ANSI_NAMES).toHaveLength(16);
  });
});
