import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { CaptureHost } from './host.js';
import { submitEvents, textEvents } from './probe.js';
import { installSeams } from './seams.js';

/**
 * The scriptable seams, driven against a window stand-in whose document is a small model: the few facts a seam reads
 * (a point, a class) answered from state the stand-in's own input events change, so a press lands where the model's
 * layout says it lands and not where the seam hoped it would.
 */

const VARIABLES = ['ROTARIS_CAPTURE_VIEW', 'ROTARIS_CAPTURE_VIEW_MS', 'ROTARIS_CAPTURE_SETTINGS', 'ROTARIS_CAPTURE_TYPE', 'ROTARIS_CAPTURE_TYPE_AT'] as const;
const saved = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
afterEach(() => {
  for (const v of VARIABLES) { if (saved[v] === undefined) delete process.env[v]; else process.env[v] = saved[v]; }
});

/** Settings' categories in their drawn order (`SETTINGS_CATEGORIES`), one 40 px row each. */
const CATEGORIES = ['Models', 'Personas', 'Runtime', 'Interface', 'Display', 'Skills', 'Instructions', 'Hooks', 'MCP Servers', 'Plugins', 'Tools', 'Project', 'About'];
const ROW = 40;
const TOP = 100;

/**
 * Settings as the seam meets it: Ctrl+7 opens it on Models, a press selects the category under the pointer, and a
 * notice banner drawn above the view moves the whole list down by `shiftBy` — in the SAME instant as the seam's
 * first read, which is what `code-intel-proof`'s `setup-again` met on 2026-09-29.
 */
function settings(options: { shiftOnFirstRead: number; deflectEveryRead?: boolean }) {
  const clock = new FakeClock();
  const lines: string[] = [];
  let open = false;
  let selected = 'Models';
  let shift = 0;
  let reads = 0;
  const presses: { x: number; y: number; landed: string | null }[] = [];
  const rowAt = (y: number) => { const i = Math.floor((y - TOP - shift) / ROW); return i >= 0 && i < CATEGORIES.length ? CATEGORIES[i]! : null; };
  const webContents = {
    sendInputEvent: (event: { type: string; keyCode?: string; modifiers?: string[]; x?: number; y?: number }) => {
      if (event.type === 'keyDown' && event.keyCode === '7' && event.modifiers?.includes('control')) open = true;
      if (event.type === 'mouseUp' && event.y !== undefined) {
        const landed = rowAt(event.y);
        presses.push({ x: event.x ?? 0, y: event.y, landed });
        if (landed) selected = landed;
      }
    },
    executeJavaScript: (script: string) => {
      if (!open || !script.includes('.nav-list__item')) return Promise.resolve(null);
      const label = CATEGORIES.find((c) => script.includes(JSON.stringify(c)));
      if (!label) return Promise.resolve(null);
      const answer = { x: 80, y: TOP + shift + CATEGORIES.indexOf(label) * ROW + ROW / 2, selected: selected === label };
      reads += 1;
      if (reads === 1) shift += options.shiftOnFirstRead;
      else if (options.deflectEveryRead) shift += ROW;
      return Promise.resolve(answer);
    },
  };
  const host = { win: { webContents }, clocks: clock, log: (m: string) => { lines.push(m); }, personaWindows: { list: () => [] } } as unknown as CaptureHost;
  return { host, clock, lines, presses, selected: () => selected };
}

/** Advances the fake clock in small steps, letting the seam's awaited renderer answers settle between them. */
async function run(clock: FakeClock, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 10) {
    clock.advance(10);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  }
}

describe('ROTARIS_CAPTURE_VIEW=7 selects the Settings category it names, and says so (seams.ts)', () => {
  it('presses again when a notice drawn in the same instant deflects the first press onto the category above', async () => {
    process.env['ROTARIS_CAPTURE_VIEW'] = '7';
    process.env['ROTARIS_CAPTURE_SETTINGS'] = 'MCP Servers';
    delete process.env['ROTARIS_CAPTURE_VIEW_MS'];
    const s = settings({ shiftOnFirstRead: ROW });
    installSeams(s.host, { prompt: undefined, resumeWanted: undefined });
    await run(s.clock, 3_000);
    // The first press went where the list WAS: one row above here (the recorded red, under a taller banner, two).
    expect(s.presses[0]?.landed).toBe('Hooks');
    expect(s.selected()).toBe('MCP Servers');
    expect(s.presses).toHaveLength(2);
    expect(s.lines.some((l) => /Settings category "MCP Servers" selected after 2 presses/.test(l))).toBe(true);
  });

  it('presses once when nothing moves, and not at all when the category is already the selected one', async () => {
    process.env['ROTARIS_CAPTURE_VIEW'] = '7';
    process.env['ROTARIS_CAPTURE_SETTINGS'] = 'Runtime';
    const once = settings({ shiftOnFirstRead: 0 });
    installSeams(once.host, { prompt: undefined, resumeWanted: undefined });
    await run(once.clock, 3_000);
    expect(once.presses.map((p) => p.landed)).toEqual(['Runtime']);
    expect(once.lines.some((l) => /Settings category "Runtime" selected after 1 press /.test(l))).toBe(true);

    process.env['ROTARIS_CAPTURE_SETTINGS'] = 'Models';
    const none = settings({ shiftOnFirstRead: 0 });
    installSeams(none.host, { prompt: undefined, resumeWanted: undefined });
    await run(none.clock, 3_000);
    expect(none.presses).toEqual([]);
    expect(none.selected()).toBe('Models');
  });

  it('logs that the category never became selected when every press is deflected, and stops pressing at the deadline', async () => {
    process.env['ROTARIS_CAPTURE_VIEW'] = '7';
    process.env['ROTARIS_CAPTURE_SETTINGS'] = 'Project';
    const s = settings({ shiftOnFirstRead: ROW, deflectEveryRead: true });
    installSeams(s.host, { prompt: undefined, resumeWanted: undefined });
    await run(s.clock, 10_000);
    expect(s.selected()).not.toBe('Project');
    expect(s.lines.some((l) => /Settings category "Project" never selected within 5000 ms/.test(l))).toBe(true);
    const pressed = s.presses.length;
    await run(s.clock, 2_000);
    expect(s.presses).toHaveLength(pressed);
  });
});

/** A window that records the input events it is sent, and nothing else. */
function typing() {
  const clock = new FakeClock();
  const sent: { type: string; keyCode: string; modifiers?: string[] }[] = [];
  const host = { win: { webContents: { sendInputEvent: (e: { type: string; keyCode: string; modifiers?: string[] }) => { sent.push(e); }, executeJavaScript: () => Promise.resolve(null) } }, clocks: clock, log: () => undefined, personaWindows: { list: () => [] } } as unknown as CaptureHost;
  for (const v of VARIABLES) delete process.env[v];
  return { host, clock, sent };
}

describe('the TYPE and TYPE_AT seams type a line break as Shift+Enter (REQ-CHAT-001; docs/defects/fixed/the-driver-and-the-type-seams-type-a-newline-as-a-character.md)', () => {
  it('REQ-CHAT-001: ROTARIS_CAPTURE_TYPE sends no `\\n` character, keeps each break as Shift+Enter, and submits once at the end', () => {
    const t = typing();
    process.env['ROTARIS_CAPTURE_TYPE'] = 'one\ntwo@100';
    installSeams(t.host, { prompt: undefined, resumeWanted: undefined });
    t.clock.advance(100);
    expect(t.sent).toEqual(submitEvents('one\ntwo', 'char'));
    expect(t.sent.some((e) => e.keyCode === '\n')).toBe(false);
    expect(t.sent.filter((e) => e.type === 'char' && e.keyCode === 'Return' && e.modifiers?.includes('shift'))).toHaveLength(1);
  });

  it('REQ-CHAT-001: `>>no-enter` leaves the multi-line text in the control, unsubmitted', () => {
    const t = typing();
    process.env['ROTARIS_CAPTURE_TYPE'] = 'one\ntwo>>no-enter@100';
    installSeams(t.host, { prompt: undefined, resumeWanted: undefined });
    t.clock.advance(100);
    expect(t.sent).toEqual(textEvents('one\ntwo', 'char'));
    expect(t.sent.some((e) => e.keyCode === 'Return' && e.modifiers === undefined)).toBe(false);
  });

  it('REQ-CHAT-001: ROTARIS_CAPTURE_TYPE_AT keeps its keyDown/char/keyUp per character and sends a break as Shift+Enter', () => {
    const t = typing();
    process.env['ROTARIS_CAPTURE_TYPE_AT'] = 'a\r\nb@100';
    installSeams(t.host, { prompt: undefined, resumeWanted: undefined });
    t.clock.advance(100);
    expect(t.sent).toEqual([
      { type: 'keyDown', keyCode: 'a' }, { type: 'char', keyCode: 'a' }, { type: 'keyUp', keyCode: 'a' },
      ...['keyDown', 'char', 'keyUp'].map((type) => ({ type, keyCode: 'Return', modifiers: ['shift'] })),
      { type: 'keyDown', keyCode: 'b' }, { type: 'char', keyCode: 'b' }, { type: 'keyUp', keyCode: 'b' },
    ]);
  });
});
