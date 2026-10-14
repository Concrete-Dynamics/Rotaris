import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
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

function host(resultSeen: () => boolean, composer: () => string | null = () => null) {
  const clock = new FakeClock();
  const ended: string[] = [];
  const lines: string[] = [];
  const stub = {
    win: { webContents: { capturePage: () => Promise.resolve({ toPNG: () => Buffer.from('png') }), executeJavaScript: (code: string) => Promise.resolve(code.includes('composer__input') ? composer() : null), sendInputEvent: () => undefined } },
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
 * When the wait starts (live-run finding P6, `docs/defects/fixed/a-captures-wait-starts-before-its-prompt-is-typed.md`): the
 * final default live run at a68f121 typed the terminal scenario's 5,755-character prompt for about 27 s of its 420 s wait.
 * With a typed prompt the bound counts from the submission — the composer that held the text reads empty — and a prompt
 * never submitted is still bounded from the launch.
 */
describe('a capture\'s wait counts from the submission of its typed prompt (probe.ts, installFinish)', () => {
  const tick = async (h: ReturnType<typeof host>, ms: number): Promise<void> => {
    for (let t = 0; t < ms; t += 500) { h.clock.advance(500); await settle(); }
  };

  it('a prompt typed for 1.5 s leaves the whole 2 s bound to the run', async () => {
    const png = environment('result');
    let composer = '';
    let sent: number | null = null;
    const h = host(() => false, () => composer);
    installFinish(h.host, png, 'a prompt', { sentAt: () => sent });
    sent = 0;
    composer = 'a pro';
    await tick(h, 1_500);
    composer = '';
    await tick(h, 500);
    expect(h.lines).toContain('capture: the prompt was submitted 2000 ms after the wait was installed; the wait for result counts from here');
    // Before the change the bound ran out 2 s after the launch, a moment after the prompt was submitted.
    await tick(h, 1_500);
    expect(h.lines.some((l) => l.includes('timed out'))).toBe(false);
    await tick(h, 1_000);
    expect(h.lines).toContain('capture: wait for result timed out after 2000 ms');
  });

  it('a prompt never submitted is bounded from the launch, and the log says so', async () => {
    const png = environment('result');
    const h = host(() => false, () => 'still typing');
    installFinish(h.host, png, 'a prompt', { sentAt: () => 0 });
    await tick(h, 2_500);
    h.clock.advance(100);
    await settle();
    expect(h.lines).toContain('capture: wait for result timed out after 2000 ms (no submission of the typed prompt was seen; counted from the launch)');
    expect(h.ended).toEqual(['quit']);
  });

  it('a short prompt typed between two reads counts as submitted once the composer reads empty a poll later', async () => {
    const png = environment('result');
    let seen = false;
    const h = host(() => seen, () => '');
    installFinish(h.host, png, 'hi', { sentAt: () => 0 });
    await tick(h, 1_000);
    expect(h.lines.some((l) => l.startsWith('capture: the prompt was submitted'))).toBe(true);
    seen = true;
    await tick(h, 500);
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

/**
 * What a probe logs of a long text (`docs/defects/fixed/the-capture-probe-cuts-a-notice-before-the-artifact-its-failure-warning-names.md`,
 * acceptance finding L5): the default live run at b9e3005 probed PD-LIBRARY-005's failure warning, whose parse-failure detail
 * quotes the validator's issues as JSON, and the 400-character cut ended it at "impart_47kGY2xb holds no proposa". The probe's
 * own script is run here over a stand-in document, so what is pinned is what the renderer evaluates.
 */
describe('a probe keeps the end of a long text, where a notice names its artifact (probe.ts, installFinish, PD-LIBRARY-005)', () => {
  const issues = JSON.stringify([{ code: 'unrecognized_keys', keys: ['when', 'check'], path: ['proposals', 0, 'proposed_verifier_section'], message: 'Unrecognized keys: "when", "check"' }], null, 2);
  const warning = `!The retrospective could not be completedDetailsThis workspace's own history was not reviewed: the model's answer could not be read (${issues}). impart_47kGY2xb holds no proposals.`;

  function probed(text: string): Promise<{ text: string }[]> {
    const png = environment('');
    delete process.env['ROTARIS_CAPTURE_WAIT'];
    process.env['ROTARIS_CAPTURE_PROBE'] = '[data-testid="notice"]';
    const element = { textContent: text, tagName: 'DIV', attributes: [{ name: 'data-testid', value: 'notice' }] };
    const h = host(() => true);
    (h.host.win.webContents as unknown as { executeJavaScript: (code: string) => Promise<unknown> }).executeJavaScript = (code: string) =>
      Promise.resolve(runInNewContext(code, { document: { querySelectorAll: () => [element] }, getComputedStyle: () => ({ fontSize: '14px' }) }));
    installFinish(h.host, png, undefined);
    h.clock.advance(100);
    return settle().then(() => {
      const line = h.lines.find((l) => l.startsWith('capture: probe [data-testid="notice"] → '));
      if (line === undefined) throw new Error(`no probe line: ${JSON.stringify(h.lines)}`);
      return JSON.parse(line.slice(line.indexOf('→ ') + 2)) as { text: string }[];
    });
  }

  it('the b9e3005 warning, past 400 characters, is logged whole and still names its artifact', async () => {
    expect(warning.length).toBeGreaterThan(400);
    const [row] = await probed(warning);
    expect(row?.text).toBe(warning);
    expect(row?.text).toMatch(/impart_47kGY2xb holds no proposals\.$/);
  });

  it('a text past the bound keeps its head and its tail with an elision between', async () => {
    const long = `HEAD${'x'.repeat(5_000)}impart_tail holds no proposals.`;
    const [row] = await probed(long);
    expect(row?.text.startsWith('HEAD')).toBe(true);
    expect(row?.text.endsWith('impart_tail holds no proposals.')).toBe(true);
    expect(row?.text).toContain(' … ');
    expect(row?.text.length).toBeLessThan(long.length);
  });
});
