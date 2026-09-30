import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { CaptureHost } from './host.js';
import { installFinish, installPromptSeam, promptEvents, submitEvents, textEvents } from './probe.js';

/**
 * How a capture ends (`installFinish`): the immediate exit once what it waited for has happened, the application's quit
 * when its wait timed out — `docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md`, the duress live
 * run's deadline quit (PD-ORCH-005 clause 3: a quit brings a live run to rest).
 */

const VARIABLES = ['ROTARIS_CAPTURE_AFTER_MS', 'ROTARIS_CAPTURE_WAIT', 'ROTARIS_CAPTURE_WAIT_MS', 'ROTARIS_CAPTURE_END_VIEW', 'ROTARIS_CAPTURE_PROBE'] as const;
const saved = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
const dirs: string[] = [];
afterEach(() => {
  for (const v of VARIABLES) { if (saved[v] === undefined) delete process.env[v]; else process.env[v] = saved[v]; }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function host(resultSeen: () => boolean) {
  const clock = new FakeClock();
  const ended: string[] = [];
  const lines: string[] = [];
  const stub = {
    win: { webContents: { capturePage: () => Promise.resolve({ toPNG: () => Buffer.from('png') }), executeJavaScript: () => Promise.resolve(null), sendInputEvent: () => undefined } },
    clocks: clock,
    log: (m: string) => { lines.push(m); },
    resultSeen,
    exit: (code: number) => { ended.push(`exit ${code}`); },
    quit: () => { ended.push('quit'); },
  };
  return { host: stub as unknown as CaptureHost, clock, ended, lines };
}

function environment(wait: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-probe-'));
  dirs.push(dir);
  for (const v of VARIABLES) delete process.env[v];
  process.env['ROTARIS_CAPTURE_WAIT'] = wait;
  process.env['ROTARIS_CAPTURE_WAIT_MS'] = '2000';
  process.env['ROTARIS_CAPTURE_AFTER_MS'] = '100';
  return join(dir, 'capture.png');
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('a capture ends by the immediate exit or by the application\'s quit (probe.ts, installFinish)', () => {
  it("ends through the application's quit when its wait timed out — a run may still be live (PD-ORCH-005 clause 3)", async () => {
    const png = environment('result');
    const h = host(() => false);
    installFinish(h.host, png, 'a prompt');
    h.clock.advance(2_500);
    h.clock.advance(100);
    await settle();
    expect(h.lines).toContain('capture: wait for result timed out after 2000 ms');
    expect(h.ended).toEqual(['quit']);
  });

  it('ends by the immediate exit when what it waited for happened', async () => {
    const png = environment('result');
    let seen = false;
    const h = host(() => seen);
    installFinish(h.host, png, 'a prompt');
    h.clock.advance(500);
    seen = true;
    h.clock.advance(500);
    h.clock.advance(100);
    await settle();
    expect(h.ended).toEqual(['exit 0']);
  });
});

/**
 * How the prompt is typed (`promptEvents`, `installPromptSeam`): the duress live run of 2026-09-29 built its prompt with
 * `join('\n')`, and the model received "in order,each waiting" — one `char` event per character, the `\n` inserting
 * nothing (live-run finding H-e). A line break is typed as REQ-CHAT-001's Shift+Enter, which inserts a newline and never
 * submits; the one unmodified Enter is the last thing sent.
 */
describe('the capture seam types a multi-line prompt as a person types it (REQ-CHAT-001, probe.ts)', () => {
  const shiftEnter = [
    { type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] },
    { type: 'char', keyCode: 'Return', modifiers: ['shift'] },
    { type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] },
  ];
  const enter = [{ type: 'keyDown', keyCode: 'Return' }, { type: 'char', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }];

  it('REQ-CHAT-001: each line break is Shift+Enter, never a bare `char` of `\n`, and one unmodified Enter submits at the end', () => {
    expect(promptEvents('in order,\neach')).toEqual([
      ...[...'in order,'].map((ch) => ({ type: 'char', keyCode: ch })),
      ...shiftEnter,
      ...[...'each'].map((ch) => ({ type: 'char', keyCode: ch })),
      ...enter,
    ]);
    expect(promptEvents('a\nb').some((e) => e.keyCode === '\n')).toBe(false);
  });

  it('REQ-CHAT-001: no unmodified Enter is sent before the last line is typed, so a multi-line prompt cannot submit early', () => {
    const events = promptEvents('one\n\ntwo\nthree');
    const submits = events.map((e, i) => (e.keyCode === 'Return' && e.modifiers === undefined ? i : -1)).filter((i) => i >= 0);
    expect(submits).toEqual([events.length - 3, events.length - 2, events.length - 1]);
    expect(events.filter((e) => e.type === 'char' && e.keyCode === 'Return' && e.modifiers?.includes('shift'))).toHaveLength(3);
  });

  it('drops a carriage return, so a CRLF prompt breaks each line once', () => {
    expect(promptEvents('a\r\nb')).toEqual(promptEvents('a\nb'));
  });

  it('sends exactly those events after Ctrl+2 and Ctrl+L, at the seam\'s time', () => {
    const clock = new FakeClock();
    const sent: unknown[] = [];
    const stub = { win: { webContents: { sendInputEvent: (e: unknown) => { sent.push(e); } } }, clocks: clock };
    const before = process.env['ROTARIS_CAPTURE_PROMPT_MS'];
    delete process.env['ROTARIS_CAPTURE_PROMPT_MS'];
    try {
      installPromptSeam(stub as unknown as CaptureHost, 'first line\nsecond line', false);
      clock.advance(800);
      clock.advance(200);
    } finally {
      if (before === undefined) delete process.env['ROTARIS_CAPTURE_PROMPT_MS']; else process.env['ROTARIS_CAPTURE_PROMPT_MS'] = before;
    }
    expect(sent.slice(0, 4)).toEqual([
      { type: 'keyDown', keyCode: '2', modifiers: ['control'] }, { type: 'keyUp', keyCode: '2', modifiers: ['control'] },
      { type: 'keyDown', keyCode: 'L', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'L', modifiers: ['control'] },
    ]);
    expect(sent.slice(4)).toEqual(promptEvents('first line\nsecond line'));
  });
});

/**
 * The one decision about a typed line break, shared by the driver's `type` and the TYPE / TYPE_AT seams
 * (`docs/defects/fixed/the-driver-and-the-type-seams-type-a-newline-as-a-character.md`): each site keeps its own shape
 * for an ordinary character, and none of them sends a `\n` as one.
 */
describe('typed text carries its line breaks as Shift+Enter at every site (REQ-CHAT-001, probe.ts textEvents)', () => {
  const shiftEnter = ['keyDown', 'char', 'keyUp'].map((type) => ({ type, keyCode: 'Return', modifiers: ['shift'] }));

  it('REQ-CHAT-001: `char` sends one char per character, `key` a keyDown/char/keyUp, and a break is Shift+Enter in both', () => {
    expect(textEvents('a\nb', 'char')).toEqual([{ type: 'char', keyCode: 'a' }, ...shiftEnter, { type: 'char', keyCode: 'b' }]);
    expect(textEvents('a\r\nb', 'key')).toEqual([
      { type: 'keyDown', keyCode: 'a' }, { type: 'char', keyCode: 'a' }, { type: 'keyUp', keyCode: 'a' },
      ...shiftEnter,
      { type: 'keyDown', keyCode: 'b' }, { type: 'char', keyCode: 'b' }, { type: 'keyUp', keyCode: 'b' },
    ]);
  });

  it('REQ-CHAT-001: submits nothing by itself; `submitEvents` adds one unmodified Enter, last', () => {
    expect(textEvents('x\ny', 'key').some((e) => e.keyCode === 'Return' && e.modifiers === undefined)).toBe(false);
    const events = submitEvents('x\ny', 'char');
    expect(events.slice(-3)).toEqual([{ type: 'keyDown', keyCode: 'Return' }, { type: 'char', keyCode: 'Return' }, { type: 'keyUp', keyCode: 'Return' }]);
    expect(events.filter((e) => e.keyCode === 'Return' && e.modifiers === undefined)).toHaveLength(3);
    // The prompt seam is this shape exactly.
    expect(promptEvents('x\ny')).toEqual(events);
  });
});
