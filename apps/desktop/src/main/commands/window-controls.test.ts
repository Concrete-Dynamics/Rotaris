import { describe, expect, it, vi } from 'vitest';
import { windowCommands } from './windows.js';

function harness(maximized = false, mainSender = true) {
  const minimize = vi.fn();
  const maximize = vi.fn();
  const unmaximize = vi.fn();
  const close = vi.fn();
  const win = {
    isDestroyed: () => false,
    isMaximized: () => maximized,
    minimize,
    maximize,
    unmaximize,
    close,
  };
  const handlers = windowCommands({ windowFor: () => mainSender ? ({ win } as never) : undefined, reloadWindow: () => true });
  const at = { w: { win }, senderId: 7, awaitWorkspace: async () => undefined } as never;
  return { handlers, at, minimize, maximize, unmaximize, close };
}

describe('PD-SHELL-003 main window commands', () => {
  it('reports the current maximized state', () => {
    const normal = harness(false);
    const maximized = harness(true);

    expect(normal.handlers['window.state']({ kind: 'window.state' }, normal.at)).toEqual({ ok: true, value: { maximized: false } });
    expect(maximized.handlers['window.state']({ kind: 'window.state' }, maximized.at)).toEqual({ ok: true, value: { maximized: true } });
  });

  it('minimizes and toggles maximize or restore on the requesting window', () => {
    const normal = harness(false);
    const maximized = harness(true);

    expect(normal.handlers['window.minimize']({ kind: 'window.minimize' }, normal.at)).toEqual({ ok: true });
    expect(normal.minimize).toHaveBeenCalledOnce();
    expect(normal.handlers['window.toggleMaximize']({ kind: 'window.toggleMaximize' }, normal.at)).toEqual({ ok: true, value: { maximized: true } });
    expect(normal.maximize).toHaveBeenCalledOnce();
    expect(maximized.handlers['window.toggleMaximize']({ kind: 'window.toggleMaximize' }, maximized.at)).toEqual({ ok: true, value: { maximized: false } });
    expect(maximized.unmaximize).toHaveBeenCalledOnce();
  });

  it('closes through the BrowserWindow close event so the existing guard stays authoritative', () => {
    const h = harness();

    expect(h.handlers['window.close']({ kind: 'window.close' }, h.at)).toEqual({ ok: true });
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('refuses every window-frame command from an auxiliary renderer', () => {
    const h = harness(false, false);
    const refused = { ok: false, code: 'window.notMain', headline: 'Only a main window controls its frame' };

    expect(h.handlers['window.state']({ kind: 'window.state' }, h.at)).toEqual(refused);
    expect(h.handlers['window.minimize']({ kind: 'window.minimize' }, h.at)).toEqual(refused);
    expect(h.handlers['window.toggleMaximize']({ kind: 'window.toggleMaximize' }, h.at)).toEqual(refused);
    expect(h.handlers['window.close']({ kind: 'window.close' }, h.at)).toEqual(refused);
    expect(h.minimize).not.toHaveBeenCalled();
    expect(h.maximize).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
  });
});

/** R-091 (hardening §3.2 row 4): the render-failure boundary's "Reload this window" reloads the sender, any window. */
describe('window.reload', () => {
  it('reloads the window that sent it, a dialog as well as a main window, and refuses a sender with no live window', () => {
    const reloaded: number[] = [];
    const handlers = windowCommands({ windowFor: () => undefined, reloadWindow: (senderId) => { reloaded.push(senderId); return senderId !== 404; } });
    const from = (senderId: number) => ({ w: {}, senderId, awaitWorkspace: async () => undefined }) as never;
    expect(handlers['window.reload']({ kind: 'window.reload' }, from(12))).toEqual({ ok: true });
    expect(handlers['window.reload']({ kind: 'window.reload' }, from(404))).toEqual({ ok: false, code: 'window.gone', headline: 'This window can no longer be reloaded' });
    expect(reloaded).toEqual([12, 404]);
  });
});
