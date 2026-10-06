import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect as connectSocket, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { FakeClock } from '@rotaris/kernel';
import { namesAuxiliary, PAINT_BOUND_MS, PAINTED_SCRIPT, startDriver, type AuxiliaryWindow, type Driver, type DriverDeps } from './driver.js';

/**
 * The driver seam over a real loopback socket, with a stand-in window and the clock ports faked. Verification tooling:
 * no requirement names the driver, so these name the defect notes they pin.
 */

interface FakeWindow {
  readonly calls: string[];
  /** Settles the paint the window was asked to confirm; `null` until one is asked. */
  paint: (() => void) | null;
  /** Every input event the window was sent, in order. */
  readonly inputs: { type: string; keyCode?: string; modifiers?: string[] }[];
}

/** What a stand-in window answers to a script other than the paint wait; `undefined` falls back to `null`. */
type Answer = (script: string) => unknown;

function fakeWindow(paints: 'at-once' | 'never', id = 7, answer: Answer = () => null): { win: BrowserWindow; state: FakeWindow } {
  const state: FakeWindow = { calls: [], paint: null, inputs: [] };
  const webContents = {
    id,
    executeJavaScript: (script: string): Promise<unknown> => {
      state.calls.push(script === PAINTED_SCRIPT ? 'paint' : 'script');
      if (script !== PAINTED_SCRIPT) return Promise.resolve(answer(script) ?? null);
      if (paints === 'at-once') return Promise.resolve(true);
      return new Promise((resolve) => { state.paint = () => resolve(true); });
    },
    sendInputEvent: (event: { type: string; keyCode?: string; modifiers?: string[] }) => { state.inputs.push(event); },
    capturePage: (): Promise<{ toPNG: () => Buffer }> => {
      state.calls.push('capture');
      return Promise.resolve({ toPNG: () => Buffer.from('png') });
    },
  };
  return { win: { isDestroyed: () => false, webContents } as unknown as BrowserWindow, state };
}

const open: { driver: Driver; socket: Socket; dir: string }[] = [];
afterEach(() => {
  for (const o of open.splice(0)) { o.socket.destroy(); o.driver.close(); rmSync(o.dir, { recursive: true, force: true }); }
});

async function harness(paints: 'at-once' | 'never' = 'at-once', auxiliary: () => readonly AuxiliaryWindow[] = () => [], answer?: Answer) {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-driver-'));
  const endpointFile = join(dir, 'endpoint.json');
  const clock = new FakeClock();
  const ended: string[] = [];
  const deferred: number[] = [];
  const commanded: number[] = [];
  const { win, state } = fakeWindow(paints, 7, answer);
  const deps: DriverDeps = {
    // The one main window, by index 0, by a suffix of its workspace path, or as the active window.
    window: (which) => (which === undefined || which === '0' || '/w'.endsWith(which) ? win : null),
    windows: () => [{ index: 0, workspace: '/w', wcId: 7 }],
    auxiliary,
    timers: clock,
    monotonic: clock,
    log: () => undefined,
    command: (_request, target) => { commanded.push(target.webContents.id); return Promise.resolve({ ok: true }); },
    deferProjectOffer: (target) => { deferred.push(target.webContents.id); },
    quit: () => { ended.push('quit'); },
    exit: () => { ended.push('exit'); },
  };
  const driver = startDriver(endpointFile, deps);
  while (!existsSync(endpointFile)) await new Promise((r) => setTimeout(r, 5));
  const { port, token } = JSON.parse(readFileSync(endpointFile, 'utf8')) as { port: number; token: string };
  const socket = await new Promise<Socket>((resolve) => { const s = connectSocket({ port, host: '127.0.0.1' }, () => resolve(s)); });
  socket.setEncoding('utf8');
  open.push({ driver, socket, dir });
  let buffer = '';
  const waiting = new Map<number, (reply: { ok: boolean; value?: unknown; error?: string }) => void>();
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const reply = JSON.parse(buffer.slice(0, at)) as { id: number; ok: boolean; value?: unknown; error?: string };
      buffer = buffer.slice(at + 1);
      waiting.get(reply.id)?.(reply);
    }
  });
  let nextId = 1;
  const send = (op: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; value?: unknown; error?: string }> => {
    const id = nextId++;
    return new Promise((resolve) => { waiting.set(id, resolve); socket.write(`${JSON.stringify({ id, token, op, ...args })}\n`); });
  };
  return { send, clock, ended, state, endpointFile, dir, deferred, commanded };
}

/** Let the socket and the seam's promise chain run. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe("the driver's quit (docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md)", () => {
  it("sends the application's quit by default — never the immediate exit — and leaves the seam up for will-quit to close", async () => {
    const h = await harness();
    const reply = await h.send('quit');
    expect(reply).toMatchObject({ ok: true, value: { quitting: true, how: 'quit' } });
    expect(h.ended).toEqual([]);
    h.clock.advance(50);
    expect(h.ended).toEqual(['quit']);
    // A close guard may keep the application; the driver must still answer so the dialog can be seen and answered.
    expect(existsSync(h.endpointFile)).toBe(true);
    expect(await h.send('ping')).toMatchObject({ ok: true });
  });

  it('sends the immediate exit only when asked for it, after the reply and after the seam is down', async () => {
    const h = await harness();
    const reply = await h.send('quit', { immediate: true });
    expect(reply).toMatchObject({ ok: true, value: { quitting: true, how: 'immediate' } });
    expect(h.ended).toEqual([]);
    h.clock.advance(50);
    expect(h.ended).toEqual(['exit']);
    expect(existsSync(h.endpointFile)).toBe(false);
  });
});

describe("the driver's shot (docs/defects/fixed/the-drivers-shot-can-return-a-stale-frame.md)", () => {
  it('waits for the renderer to present a frame before it captures, and says the paint was confirmed', async () => {
    const h = await harness('at-once');
    const path = join(h.dir, 'shot.png');
    const reply = await h.send('screenshot', { path });
    expect(reply).toMatchObject({ ok: true, value: { path, painted: true } });
    expect(h.state.calls).toEqual(['paint', 'capture']);
    expect(readFileSync(path, 'utf8')).toBe('png');
  });

  it('captures a window that presents no frame after the bound, and does not claim the paint', async () => {
    const h = await harness('never');
    const path = join(h.dir, 'shot.png');
    const pending = h.send('screenshot', { path });
    await settle();
    expect(h.state.calls).toEqual(['paint']);
    h.clock.advance(PAINT_BOUND_MS - 1);
    await settle();
    expect(h.state.calls).toEqual(['paint']);
    h.clock.advance(1);
    expect(await pending).toMatchObject({ ok: true, value: { path, painted: false } });
    expect(h.state.calls).toEqual(['paint', 'capture']);
  });
});

describe('the driver addresses persona, approval and terminal windows (docs/defects/fixed/the-driver-cannot-address-persona-or-approval-windows.md)', () => {
  function auxiliaryWindows() {
    const persona = fakeWindow('at-once', 21);
    const approval = fakeWindow('at-once', 22);
    const terminal = fakeWindow('at-once', 23);
    const listed: AuxiliaryWindow[] = [
      { selector: 'persona:coding-agent', role: 'persona', owner: 0, wcId: 21, visible: true, win: persona.win },
      { selector: 'approval', role: 'approval', owner: 0, wcId: 22, visible: true, win: approval.win },
      { selector: 'terminal', role: 'terminal', owner: 0, wcId: 23, visible: false, win: terminal.win },
    ];
    return { listed, persona: persona.state, approval: approval.state, terminal: terminal.state };
  }

  it('reads a role selector as a role, and anything else as a main window', () => {
    expect(['persona:coding-agent', 'approval', 'terminal', 'auth-recovery'].map(namesAuxiliary)).toEqual([true, true, true, true]);
    expect(['0', '/w', 'w', '/terminal', 'personas'].map(namesAuxiliary)).toEqual([false, false, false, false, false]);
  });

  it('lists the auxiliary windows beside the main ones, without the window objects (PD-ORCH-005 clause 13\'s persona window)', async () => {
    const aux = auxiliaryWindows();
    const h = await harness('at-once', () => aux.listed);
    const reply = await h.send('windows');
    expect(reply).toEqual({
      id: expect.any(Number) as number, ok: true,
      value: {
        windows: [{ index: 0, workspace: '/w', wcId: 7 }],
        auxiliary: [
          { selector: 'persona:coding-agent', role: 'persona', owner: 0, wcId: 21, visible: true },
          { selector: 'approval', role: 'approval', owner: 0, wcId: 22, visible: true },
          { selector: 'terminal', role: 'terminal', owner: 0, wcId: 23, visible: false },
        ],
        selected: null,
      },
    });
  });

  it('points the ops after useWindow at a persona window, and back at the main window when told nothing', async () => {
    const aux = auxiliaryWindows();
    const h = await harness('at-once', () => aux.listed);
    expect(await h.send('useWindow', { window: 'persona:coding-agent' })).toMatchObject({ ok: true, value: { selected: 'persona:coding-agent' } });
    await h.send('probe', { selector: '[data-testid=persona-agent-state]' });
    expect(aux.persona.calls).toEqual(['script']);
    expect(h.state.calls).toEqual([]);
    expect(await h.send('ping')).toMatchObject({ ok: true, value: { window: true } });
    await h.send('useWindow');
    await h.send('eval', { expression: '1' });
    expect(h.state.calls).toEqual(['script']);
  });

  it("lets one request's own window name the approval dialog for that op alone (REQ-TOOLS-063's dialog)", async () => {
    const aux = auxiliaryWindows();
    const h = await harness('at-once', () => aux.listed);
    const path = join(h.dir, 'dialog.png');
    expect(await h.send('screenshot', { path, window: 'approval' })).toMatchObject({ ok: true, value: { path, painted: true } });
    expect(aux.approval.calls).toEqual(['paint', 'capture']);
    await h.send('command', { request: { kind: 'noop' }, window: 'approval' });
    expect(h.commanded).toEqual([22]);
    await h.send('eval', { expression: '1' });
    expect(h.state.calls).toEqual(['script']);
  });

  it('refuses a role selector that names no open window, says what is open, and keeps the selection it had', async () => {
    const aux = auxiliaryWindows();
    const h = await harness('at-once', () => aux.listed);
    const refused = await h.send('useWindow', { window: 'persona:nobody' });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/^no window matches "persona:nobody"; open: /);
    expect(refused.error).toContain('"selector":"persona:coding-agent"');
    expect(await h.send('windows')).toMatchObject({ value: { selected: null } });
    const none = await harness('at-once', () => []);
    expect(await none.send('probe', { selector: 'x', window: 'approval' })).toMatchObject({ ok: false, error: expect.stringMatching(/^no window matches "approval"/) as string });
  });

  it("refuses REQ-SHELL-011's deferred offer for a window that is not a main window", async () => {
    const aux = auxiliaryWindows();
    const h = await harness('at-once', () => aux.listed);
    expect(await h.send('deferProjectOffer', { window: 'terminal' })).toMatchObject({ ok: false, error: 'deferProjectOffer needs a main window; "terminal" is not one' });
    expect(h.deferred).toEqual([]);
    expect(await h.send('deferProjectOffer')).toMatchObject({ ok: true });
    expect(h.deferred).toEqual([7]);
  });
});

describe("the driver's type (REQ-CHAT-001; docs/defects/fixed/the-driver-and-the-type-seams-type-a-newline-as-a-character.md)", () => {
  const key = (ch: string) => [{ type: 'keyDown', keyCode: ch }, { type: 'char', keyCode: ch }, { type: 'keyUp', keyCode: ch }];
  const shiftEnter = ['keyDown', 'char', 'keyUp'].map((type) => ({ type, keyCode: 'Return', modifiers: ['shift'] }));
  const enter = ['keyDown', 'char', 'keyUp'].map((type) => ({ type, keyCode: 'Return' }));

  it('REQ-CHAT-001: types a line break as Shift+Enter and never as a `\\n` key, so a multi-line text keeps its breaks and does not submit', async () => {
    const h = await harness();
    const reply = await h.send('type', { text: 'a\nb\r\nc' });
    expect(reply).toMatchObject({ ok: true, value: { enter: false } });
    expect(h.state.inputs).toEqual([...key('a'), ...shiftEnter, ...key('b'), ...shiftEnter, ...key('c')]);
    expect(h.state.inputs.some((e) => e.keyCode === '\n' || e.keyCode === '\r')).toBe(false);
  });

  it('REQ-CHAT-001: with `enter`, the one unmodified Enter is the last thing sent', async () => {
    const h = await harness();
    await h.send('type', { text: 'one\ntwo', enter: true });
    expect(h.state.inputs).toEqual([...'one'].flatMap(key).concat(shiftEnter, [...'two'].flatMap(key), enter));
  });
});

describe("the driver's settled click (docs/defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md)", () => {
  const box = (y: number) => ({ x: 1312, y, width: 61, height: 24, text: 'Pop out' });
  /** The window as driver-proof's 13c met it: each settle measurement answered in turn, then what the press landed on. */
  function window13c(settles: unknown[], landing: unknown = { landed: true, hit: 'button.btn "Pop out"' }) {
    const scripts: string[] = [];
    const answer: Answer = (script) => {
      if (script.startsWith('/* driver:settle */')) { scripts.push('settle'); return settles.length > 1 ? settles.shift() : settles[0]; }
      if (script.startsWith('/* driver:landing */')) { scripts.push('landing'); return landing; }
      scripts.push('locate');
      return box(199);
    };
    return { answer, scripts };
  }
  const presses = (inputs: FakeWindow['inputs']) => inputs.filter((e) => e.type === 'mouseDown').map((e) => (e as unknown as { y: number }).y);
  /** Let the poll fire and the socket answer, `n` times. */
  async function polls(h: Awaited<ReturnType<typeof harness>>, n: number) {
    await settle();
    for (let i = 0; i < n; i += 1) { h.clock.advance(100); await settle(); }
  }

  it('presses only once the target has held still, at the box it settled at — not where it was first measured', async () => {
    const w = window13c([{ ...box(274), settled: false, why: 'moved from {"y":199}' }, { ...box(296), settled: true, why: '' }]);
    const h = await harness('at-once', () => [], w.answer);
    const pending = h.send('click', { selector: '.agent-table__row .btn', text: 'Pop out', settle: true });
    await polls(h, 2);
    expect(await pending).toMatchObject({ ok: true, value: { x: 1343, y: 308, landed: true } });
    expect(presses(h.state.inputs)).toEqual([308]);
    expect(w.scripts).toEqual(['settle', 'settle', 'landing']);
  });

  it('refuses a press that met something other than its target, naming what it met', async () => {
    const w = window13c([{ ...box(296), settled: true, why: '' }], { landed: false, hit: 'div.mission__header' });
    const h = await harness('at-once', () => [], w.answer);
    const pending = h.send('click', { selector: '.agent-table__row .btn', text: 'Pop out', settle: true });
    await polls(h, 1);
    const reply = await pending;
    expect(reply.ok).toBe(false);
    expect(reply.error).toBe('the click at (1343, 308) on ".agent-table__row .btn" with text "Pop out" did not land: the press met div.mission__header');
  });

  it('never presses a target that is covered, and says what covers it when the wait runs out', async () => {
    const w = window13c([{ ...box(296), settled: false, why: 'covered by div.notice' }]);
    const h = await harness('at-once', () => [], w.answer);
    const pending = h.send('click', { selector: '.agent-table__row .btn', text: 'Pop out', settle: true, timeoutMs: 250 });
    await polls(h, 4);
    const reply = await pending;
    expect(reply).toMatchObject({ ok: false, error: '".agent-table__row .btn" with text "Pop out" matched but did not settle within 250 ms: last covered by div.notice' });
    expect(presses(h.state.inputs)).toEqual([]);
  });

  it('reads a press whose window could not answer as unknown, not as a miss', async () => {
    const w = window13c([{ ...box(296), settled: true, why: '' }], { landed: null, hit: null });
    const h = await harness('at-once', () => [], w.answer);
    const pending = h.send('click', { selector: '.agent-table__row .btn', text: 'Pop out', settle: true });
    await polls(h, 1);
    expect(await pending).toMatchObject({ ok: true, value: { landed: null } });
  });

  it('leaves a plain click as it was: one measurement, pressed at once, nothing read back', async () => {
    const w = window13c([]);
    const h = await harness('at-once', () => [], w.answer);
    const pending = h.send('click', { selector: '.agent-table__row .btn', text: 'Pop out' });
    await polls(h, 1);
    expect(await pending).toMatchObject({ ok: true, value: { x: 1343, y: 211 } });
    expect(presses(h.state.inputs)).toEqual([211]);
    expect(w.scripts).toEqual(['locate']);
  });
});
