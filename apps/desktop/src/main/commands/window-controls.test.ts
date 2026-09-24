import { describe, expect, it, vi } from 'vitest';
import { windowCommands } from './windows.js';

function harness(maximized = false) {
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
  const handlers = windowCommands();
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
});
