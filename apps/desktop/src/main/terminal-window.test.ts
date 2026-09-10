import { describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { TerminalWindows } from './windows.js';

/**
 * Part AL2 — the terminal window's registry (REQ-SHELL-081/085/086/109/110/111) against a fake BrowserWindow: one per
 * main window, a raise as a request, rebuild-not-hide, an automatic open shown without focus, the session-change
 * rules as read on `TerminalWindows.onSessionChange`. Electron-free: the window is a counting fake.
 */
interface FakeWindow {
  readonly calls: string[];
  destroyed: boolean;
  visible: boolean;
  minimized: boolean;
  readonly listeners: Map<string, (() => void)[]>;
  readonly win: BrowserWindow;
}
let nextId = 100;
function fakeWindow(): FakeWindow {
  const id = nextId++;
  const f: FakeWindow = { calls: [], destroyed: false, visible: false, minimized: false, listeners: new Map(), win: null as unknown as BrowserWindow };
  const fire = (event: string) => { for (const l of f.listeners.get(event) ?? []) l(); };
  const win = {
    webContents: { id },
    isDestroyed: () => f.destroyed,
    isVisible: () => f.visible,
    isMinimized: () => f.minimized,
    restore: () => { f.calls.push('restore'); f.minimized = false; },
    show: () => { f.calls.push('show'); f.visible = true; },
    showInactive: () => { f.calls.push('showInactive'); f.visible = true; },
    focus: () => { f.calls.push('focus'); },
    destroy: () => { f.calls.push('destroy'); f.destroyed = true; f.visible = false; fire('closed'); },
    getSize: () => [900, 620],
    on: (event: string, cb: () => void) => { f.listeners.set(event, [...(f.listeners.get(event) ?? []), cb]); return win; },
    once: (event: string, cb: () => void) => { f.listeners.set(event, [...(f.listeners.get(event) ?? []), () => { cb(); }]); return win; },
    /** The harness's own trigger: the platform's `ready-to-show`. */
    ready: () => fire('ready-to-show'),
  };
  (f as { win: BrowserWindow }).win = win as unknown as BrowserWindow;
  return f;
}

function harness() {
  const windows: FakeWindow[] = [];
  const focused: string[] = [];
  const destroyed: number[] = [];
  const log: string[] = [];
  const registry = new TerminalWindows({
    create: () => { const f = fakeWindow(); windows.push(f); return f.win; },
    load: async (win) => { (win as unknown as { ready: () => void }).ready(); },
    focusStream: async (_win, streamId) => { focused.push(streamId); },
    onCreated: () => undefined,
    onDestroyed: (id) => { destroyed.push(id); },
    log: (m) => { log.push(m); },
  });
  return { registry, windows, focused, destroyed, log };
}

describe('TerminalWindows — one terminal window per main window (REQ-SHELL-081)', () => {
  it('a user open creates, shows and focuses; a second request raises the existing window rather than opening another', async () => {
    const h = harness();
    expect(await h.registry.open({ automatic: false })).toEqual({ reused: false });
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]!.calls).toEqual(['show', 'focus']);
    expect(await h.registry.open({ automatic: false })).toEqual({ reused: true });
    expect(h.windows).toHaveLength(1);
    // REQ-SHELL-161: one request each — show when hidden, focus when visible; never retried.
    expect(h.windows[0]!.calls).toEqual(['show', 'focus', 'focus']);
    h.windows[0]!.minimized = true;
    await h.registry.open({ automatic: false });
    expect(h.windows[0]!.calls.slice(-2)).toEqual(['restore', 'focus']);
  });

  it('an automatic open shows the window WITHOUT taking focus (REQ-SHELL-081/109/161), and never raises an existing one', async () => {
    const h = harness();
    await h.registry.open({ automatic: true, streamId: 'fg:coder-1' });
    expect(h.windows[0]!.calls).toEqual(['showInactive']);
    expect(h.registry.current()?.automatic).toBe(true);
    await h.registry.open({ automatic: true, streamId: 'fg:coder-2' });
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]!.calls).toEqual(['showInactive']);
  });

  it('REQ-SHELL-085: a stream to bring forward is held until the renderer boots, then handed over once; a booted window takes it at once', async () => {
    const h = harness();
    await h.registry.open({ automatic: false, streamId: 'fg:a' });
    const wcId = h.windows[0]!.win.webContents.id;
    expect(h.focused).toEqual([]);
    expect(h.registry.takeFocus(wcId)).toBe('fg:a');
    expect(h.registry.takeFocus(wcId)).toBeNull();
    expect(h.registry.current()?.booted).toBe(true);
    await h.registry.open({ automatic: false, streamId: 'fg:b' });
    expect(h.focused).toEqual(['fg:b']);
    // A stranger's webContents id is not the terminal window.
    expect(h.registry.bySender(wcId + 1)).toBeNull();
    expect(h.registry.takeFocus(wcId + 1)).toBeNull();
  });

  it('REQ-SHELL-086: a close DESTROYS the window and the next open rebuilds it fresh — never a hide', async () => {
    const h = harness();
    await h.registry.open({ automatic: false });
    const first = h.windows[0]!;
    expect(h.registry.close('the user closed it')).toBe(true);
    expect(first.calls).toContain('destroy');
    expect(h.registry.isOpen()).toBe(false);
    expect(h.destroyed).toEqual([first.win.webContents.id]);
    await h.registry.open({ automatic: false });
    expect(h.windows).toHaveLength(2);
    expect(h.registry.current()?.wcId).toBe(h.windows[1]!.win.webContents.id);
    expect(h.registry.close('nothing open')).toBe(true);
    expect(h.registry.close('nothing open')).toBe(false);
  });

  it('the platform closing the window (the user\'s X) leaves the registry empty, so the next open rebuilds', async () => {
    const h = harness();
    await h.registry.open({ automatic: false });
    h.windows[0]!.win.destroy();
    expect(h.registry.isOpen()).toBe(false);
    await h.registry.open({ automatic: false });
    expect(h.windows).toHaveLength(2);
  });

  it('REQ-SHELL-110: a focus change from one session to another closes the window and reopens it for the new session without focus, when it had been open', async () => {
    const h = harness();
    expect(await h.registry.onSessionChange('s1')).toBe(false);
    expect(h.registry.followed()).toBe('s1');
    await h.registry.open({ automatic: false });
    expect(await h.registry.onSessionChange('s2')).toBe(true);
    expect(h.windows).toHaveLength(2);
    expect(h.windows[0]!.destroyed).toBe(true);
    expect(h.windows[1]!.calls).toEqual(['showInactive']);
    expect(h.registry.followed()).toBe('s2');
    // The same session again changes nothing.
    expect(await h.registry.onSessionChange('s2')).toBe(false);
    expect(h.windows).toHaveLength(2);
  });

  it('REQ-SHELL-110: focusing an empty session identifier leaves everything closed; a closed window never reopens', async () => {
    const h = harness();
    await h.registry.onSessionChange('s1');
    await h.registry.open({ automatic: false });
    expect(await h.registry.onSessionChange(null)).toBe(false);
    expect(h.registry.isOpen()).toBe(false);
    expect(h.windows[0]!.destroyed).toBe(true);
    // Closed before the change: nothing to reopen.
    expect(await h.registry.onSessionChange('s3')).toBe(false);
    expect(h.registry.isOpen()).toBe(false);
  });

  it('REQ-SHELL-111: a session starting from none closes and discards the window and does NOT reopen it (the reading on onSessionChange)', async () => {
    const h = harness();
    await h.registry.open({ automatic: false });
    expect(await h.registry.onSessionChange('s-new')).toBe(false);
    expect(h.registry.isOpen()).toBe(false);
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0]!.destroyed).toBe(true);
  });

  it('REQ-SHELL-081: the window goes with its main window', async () => {
    const h = harness();
    await h.registry.open({ automatic: false });
    h.registry.destroyWithOwner();
    expect(h.registry.isOpen()).toBe(false);
    expect(h.windows[0]!.destroyed).toBe(true);
  });
});
