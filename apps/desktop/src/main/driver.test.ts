import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect as connectSocket, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { FakeClock } from '@rotaris/kernel';
import { PAINT_BOUND_MS, PAINTED_SCRIPT, startDriver, type Driver, type DriverDeps } from './driver.js';

/**
 * The driver seam over a real loopback socket, with a stand-in window and the clock ports faked. Verification tooling:
 * no requirement names the driver, so these name the defect notes they pin.
 */

interface FakeWindow {
  readonly calls: string[];
  /** Settles the paint the window was asked to confirm; `null` until one is asked. */
  paint: (() => void) | null;
}

function fakeWindow(paints: 'at-once' | 'never'): { win: BrowserWindow; state: FakeWindow } {
  const state: FakeWindow = { calls: [], paint: null };
  const webContents = {
    id: 7,
    executeJavaScript: (script: string): Promise<unknown> => {
      state.calls.push(script === PAINTED_SCRIPT ? 'paint' : 'script');
      if (script !== PAINTED_SCRIPT) return Promise.resolve(null);
      if (paints === 'at-once') return Promise.resolve(true);
      return new Promise((resolve) => { state.paint = () => resolve(true); });
    },
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

async function harness(paints: 'at-once' | 'never' = 'at-once') {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-driver-'));
  const endpointFile = join(dir, 'endpoint.json');
  const clock = new FakeClock();
  const ended: string[] = [];
  const { win, state } = fakeWindow(paints);
  const deps: DriverDeps = {
    window: () => win,
    windows: () => [{ index: 0, workspace: '/w', wcId: 7 }],
    timers: clock,
    monotonic: clock,
    log: () => undefined,
    command: () => Promise.resolve({ ok: true }),
    deferProjectOffer: () => undefined,
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
  return { send, clock, ended, state, endpointFile, dir };
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
