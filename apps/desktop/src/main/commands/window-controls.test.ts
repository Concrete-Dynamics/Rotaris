import { describe, expect, it, vi } from 'vitest';
import { createNoticeStore, type NoticeRecord } from '../notices.js';
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
  const handlers = windowCommands({ log: () => undefined, windowFor: () => mainSender ? ({ win } as never) : undefined, reloadWindow: () => true });
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
    const handlers = windowCommands({ log: () => undefined, windowFor: () => undefined, reloadWindow: (senderId) => { reloaded.push(senderId); return senderId !== 404; } });
    const from = (senderId: number) => ({ w: {}, senderId, awaitWorkspace: async () => undefined }) as never;
    expect(handlers['window.reload']({ kind: 'window.reload' }, from(12))).toEqual({ ok: true });
    expect(handlers['window.reload']({ kind: 'window.reload' }, from(404))).toEqual({ ok: false, code: 'window.gone', headline: 'This window can no longer be reloaded' });
    expect(reloaded).toEqual([12, 404]);
  });
});

/**
 * OQ-475 (ruled 2026-11-04; REQ-NOTIFY-003, REQ-NOTIFY-024, REQ-NOTIFY-268, PD-MONITOR-002): an error React recovered from is
 * ONE `warning` line in main's log and nothing else. Until the ruling it arrived as a persistent `warning` notice, which took
 * the one slot from whatever stood there and wrote a redraw nobody saw into the focused run's timeline. The store here is the
 * real one, holding a refusal and following a run, so a handler that touched it would show.
 */
describe('window.recovered', () => {
  it('writes exactly one warning line naming the window, the error and the detail, and leaves the notice and the record untouched', async () => {
    const recorded: NoticeRecord[] = [];
    const notices = createNoticeStore({ broadcast: () => undefined, pushAcknowledgement: () => undefined, record: async (entry) => { recorded.push(entry); return true; }, log: () => undefined, focusedSession: () => 's-focused' });
    await notices.report({ severity: 'error', title: 'The run was refused', sessionId: 's-focused' });
    const before = notices.current();
    recorded.length = 0;
    const lines: { message: string; level: string | undefined }[] = [];
    const handlers = windowCommands({ log: (message, level) => { lines.push({ message, level }); }, windowFor: () => undefined, reloadWindow: () => true });
    const at = { w: {}, senderId: 12, awaitWorkspace: async () => undefined } as never;
    const detail = 'Window: main\n\nHow it was reported: recovered by React, which drew the tree again\n\nComponent stack:\n    at Rows';
    expect(await handlers['window.recovered']({ kind: 'window.recovered', error: 'TypeError: drawn again', detail }, at)).toEqual({ ok: true });
    expect(lines).toEqual([{ level: 'warn', message: `window 12 recovered from a drawing error; React drew it again and nothing is shown (OQ-475): TypeError: drawn again\n${detail}` }]);
    await notices.settled();
    expect(notices.current()).toEqual(before);
    expect(recorded).toEqual([]);
  });

  it('masks a credential the renderer sent before the line is written (REQ-TOOLS-171), and writes no empty detail', async () => {
    const lines: string[] = [];
    const handlers = windowCommands({ log: (message) => { lines.push(message); }, windowFor: () => undefined, reloadWindow: () => true });
    const at = { w: {}, senderId: 3, awaitWorkspace: async () => undefined } as never;
    await handlers['window.recovered']({ kind: 'window.recovered', error: 'Error: api_key=sk-live-recovered', detail: '' }, at);
    expect(lines).toEqual(['window 3 recovered from a drawing error; React drew it again and nothing is shown (OQ-475): Error: api_key=***']);
  });
});
