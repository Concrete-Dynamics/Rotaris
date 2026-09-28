import { describe, expect, it } from 'vitest';
import {
  guardClose,
  MainWindows,
  type GuardedWindow,
  type MainWindowAdapter,
  type MainWindowsDependencies,
  type MainWindowTimer,
} from './main-windows.js';

interface MemoryWindow {
  readonly id: number;
  readonly workspace: string;
  destroyed: boolean;
  visible: boolean;
  minimized: boolean;
  closeAllowed: boolean;
  readonly focusListeners: (() => void)[];
  readonly closedListeners: (() => void)[];
}

interface PendingTimer {
  cancelled: boolean;
  readonly callback: () => void;
}

function harness(options: {
  readonly cwd?: string;
  readonly remembered?: string;
  readonly failLoads?: ReadonlySet<number>;
} = {}) {
  const actions: string[] = [];
  const notices: { windowId: number; title: string; action?: string }[] = [];
  const folders: (string | null)[] = [];
  const timers: PendingTimer[] = [];
  const windows = new Map<number, MemoryWindow>();
  const openResolvers = new Map<string, (opened: { workspaceId: string; storeFile: string } | undefined) => void>();
  const openFailures = new Set<string>();
  let nextId = 1;
  let deferOpens = false;

  const adapter: MainWindowAdapter<MemoryWindow, string, string> = {
    create: async ({ workspace, origin }) => {
      const win: MemoryWindow = {
        id: nextId++, workspace, destroyed: false, visible: false, minimized: false, closeAllowed: true,
        focusListeners: [], closedListeners: [],
      };
      windows.set(win.id, win);
      actions.push(`build:${workspace}:${origin}`);
      return {
        win,
        wcId: win.id,
        personaWindows: `personas:${win.id}`,
        terminalWindows: `terminal:${win.id}`,
        load: async () => {
          actions.push(`load:${win.id}`);
          if (options.failLoads?.has(win.id)) throw new Error(`load-failed:${win.id}`);
        },
      };
    },
    isDestroyed: (win) => win.destroyed,
    isMinimized: (win) => win.minimized,
    isVisible: (win) => win.visible,
    show: (win) => { win.visible = true; actions.push(`show:${win.workspace}`); },
    focus: (win) => { actions.push(`focus:${win.workspace}`); for (const listener of win.focusListeners) listener(); },
    restore: (win) => { win.minimized = false; actions.push(`restore:${win.workspace}`); },
    close: async (win) => {
      actions.push(`close:${win.workspace}`);
      if (!win.closeAllowed) return false;
      win.destroyed = true;
      for (const listener of win.closedListeners) listener();
      return true;
    },
    destroy: (win) => {
      if (win.destroyed) return;
      win.destroyed = true;
      actions.push(`destroy:${win.workspace}`);
      for (const listener of win.closedListeners) listener();
    },
    onFocus: (win, listener) => { win.focusListeners.push(listener); },
    onClosed: (win, listener) => { win.closedListeners.push(listener); },
    ownsAuxiliary: (_personaWindows, terminalWindows, senderId) => terminalWindows === `terminal:${senderId - 100}`,
    disposeResources: (_win, _wcId, personaWindows, terminalWindows) => actions.push(`dispose:${personaWindows}:${terminalWindows}`),
  };

  const after = (_delayMs: number, callback: () => void): MainWindowTimer => {
    const pending = { cancelled: false, callback };
    timers.push(pending);
    return { cancel: () => { pending.cancelled = true; } };
  };

  const dependencies: MainWindowsDependencies<MemoryWindow, string, string> = {
    adapter,
    timers: { after },
    currentDirectory: () => options.cwd ?? 'C:/cwd',
    rememberedWorkspace: () => options.remembered,
    isDirectory: (path) => path !== 'C:/gone',
    canonicalPath: (path) => path,
    samePath: (left, right) => left.toLowerCase() === right.toLowerCase(),
    chooseProjectFolder: async () => folders.shift() ?? null,
    openWorkspace: async (workspace) => {
      actions.push(`open:${workspace}`);
      if (openFailures.has(workspace)) return undefined;
      if (!deferOpens) return { workspaceId: `id:${workspace}`, storeFile: `${workspace}/store.db` };
      return new Promise((resolve) => { openResolvers.set(workspace, resolve); });
    },
    closeGuard: async () => true,
    activeRunCount: async () => 0,
    persistWorkspace: async (workspace) => { actions.push(`persist:${workspace}`); },
    raiseTransient: (windowId, _kind, title, _body, action) => {
      notices.push({ windowId, title, ...(action === undefined ? {} : { action: action.label }) });
    },
    reportFailure: (windowId, title) => notices.push({ windowId, title }),
    log: (message) => actions.push(`log:${message}`),
  };

  const mainWindows = new MainWindows<MemoryWindow, string, string, string, string>(dependencies);
  return {
    mainWindows, actions, notices, folders, windows, openFailures,
    deferOpens: () => { deferOpens = true; },
    resolveOpen: (workspace: string, opened = true) => openResolvers.get(workspace)?.(opened ? { workspaceId: `id:${workspace}`, storeFile: `${workspace}/store.db` } : undefined),
    advanceTimers: () => { for (const timer of timers.splice(0)) if (!timer.cancelled) timer.callback(); },
  };
}

describe('MainWindows', () => {
  it('tracks focus order, removes closed windows, and attributes senders', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });

    expect(h.mainWindows.active()?.wcId).toBe(second.wcId);
    expect(h.mainWindows.forSender(first.wcId)?.workspace).toBe('C:/a');
    h.windows.get(first.wcId)!.focusListeners[0]!();
    expect(h.mainWindows.ordered().map((window) => window.wcId)).toEqual([first.wcId, second.wcId]);

    h.windows.get(first.wcId)!.destroyed = true;
    h.windows.get(first.wcId)!.closedListeners[0]!();
    expect(h.mainWindows.forSender(first.wcId)).toBeUndefined();
    expect(h.mainWindows.active()?.wcId).toBe(second.wcId);
    expect(h.mainWindows.ownerOfAuxiliary(second.wcId + 100)?.wcId).toBe(second.wcId);
  });

  it('keeps concurrent workspace readiness per window', async () => {
    const h = harness();
    h.deferOpens();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    const openingFirst = h.mainWindows.open(first.wcId, 'C:/a');
    const openingSecond = h.mainWindows.open(second.wcId, 'C:/b');
    let secondReady = false;
    void h.mainWindows.awaitWorkspace(second.wcId).then(() => { secondReady = true; });

    h.resolveOpen('C:/a');
    await openingFirst;
    await Promise.resolve();
    expect(secondReady).toBe(false);

    h.resolveOpen('C:/b');
    await openingSecond;
    await h.mainWindows.awaitWorkspace(second.wcId);
    expect(secondReady).toBe(true);
  });

  it('preserves add and replacement ordering', async () => {
    const add = harness();
    const original = await add.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await add.mainWindows.open(original.wcId, 'C:/a');
    add.actions.length = 0;
    add.folders.push('C:/b');
    await add.mainWindows.choose(original.wcId, { newWindow: true });
    expect(add.actions.filter((action) => !action.startsWith('log:'))).toEqual([
      'build:C:/b:open-request', 'load:2', 'open:C:/b', 'show:C:/b', 'focus:C:/b', 'persist:C:/b',
    ]);

    const replace = harness();
    const outgoing = await replace.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await replace.mainWindows.open(outgoing.wcId, 'C:/a');
    replace.actions.length = 0;
    replace.folders.push('C:/b');
    await replace.mainWindows.choose(outgoing.wcId, { newWindow: false });
    expect(replace.actions.filter((action) => !action.startsWith('log:') && !action.startsWith('dispose:'))).toEqual([
      'build:C:/b:open-request', 'load:2', 'open:C:/b', 'show:C:/b', 'close:C:/a', 'persist:C:/b', 'focus:C:/b',
    ]);
  });

  it('rolls back failed opens and vetoed replacements', async () => {
    const failed = harness();
    const original = await failed.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    failed.openFailures.add('C:/b');
    failed.folders.push('C:/b');
    const failedOutcome = await failed.mainWindows.choose(original.wcId, { newWindow: false });
    expect(failedOutcome.ok).toBe(false);
    expect(failed.mainWindows.ordered().map((window) => window.workspace)).toEqual(['C:/a']);
    expect(failed.actions).toContain('destroy:C:/b');

    const vetoed = harness();
    const vetoedOriginal = await vetoed.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    vetoed.windows.get(vetoedOriginal.wcId)!.closeAllowed = false;
    vetoed.folders.push('C:/b');
    const vetoedOutcome = await vetoed.mainWindows.choose(vetoedOriginal.wcId, { newWindow: false });
    expect(vetoedOutcome).toEqual({ ok: true, value: { cancelled: true, vetoed: true } });
    expect(vetoed.mainWindows.ordered().map((window) => window.workspace)).toEqual(['C:/a']);
    expect(vetoed.actions).not.toContain('persist:C:/b');
  });

  it('offers a session for the requester workspace and surfaces another holder', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    h.folders.push('c:/a');
    const same = await h.mainWindows.choose(first.wcId, { newWindow: true });
    expect(same).toEqual({ ok: true, value: { unchanged: true, workspace: 'C:/a', offered: 'start-session' } });
    expect(h.notices).toEqual([{ windowId: first.wcId, title: 'That project folder is already open in this window.', action: 'Start a new session' }]);

    h.actions.length = 0;
    h.folders.push('c:/a');
    const held = await h.mainWindows.choose(second.wcId, { newWindow: false });
    expect(held).toEqual({ ok: true, value: { unchanged: true, workspace: 'C:/a', surfaced: first.wcId } });
    expect(h.actions.filter((action) => !action.startsWith('log:'))).toEqual(['show:C:/a', 'focus:C:/a']);
  });

  it('routes hand-over to a holder, adds a different workspace, and recovers with no window', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await h.mainWindows.open(first.wcId, 'C:/a');
    h.actions.length = 0;
    await h.mainWindows.handOver({ workspace: 'c:/a' });
    expect(h.actions.filter((action) => !action.startsWith('log:'))).toEqual(['show:C:/a', 'focus:C:/a']);

    h.actions.length = 0;
    await h.mainWindows.handOver({ workspace: 'C:/b' });
    expect(h.mainWindows.ordered().map((window) => window.workspace).sort()).toEqual(['C:/a', 'C:/b']);
    expect(h.actions.filter((action) => !action.startsWith('log:'))).toEqual([
      'build:C:/b:hand-over', 'load:2', 'open:C:/b', 'show:C:/b', 'focus:C:/b', 'persist:C:/b',
    ]);

    const empty = harness({ cwd: 'C:/startup' });
    await empty.mainWindows.handOver({});
    expect(empty.mainWindows.active()?.workspace).toBe('C:/startup');
    expect(empty.actions).toContain('build:C:/startup:hand-over');
  });

  it('cancels only the answered window deferred offer', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    h.mainWindows.deferProjectOffer(first.wcId, 650);
    h.mainWindows.deferProjectOffer(second.wcId, 650);
    h.folders.push(null, null);

    await h.mainWindows.choose(first.wcId, { newWindow: false });
    h.advanceTimers();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(h.actions.filter((action) => action.startsWith('log:offering'))).toEqual([
      `log:offering the first-launch project chooser for window ${second.wcId}`,
    ]);
    expect(h.notices.map((notice) => notice.windowId)).toEqual([first.wcId, second.wcId]);
  });

  it('REQ-TOOLS-063: answers whether a queued approval waits behind an open dialog or requests ahead of it', async () => {
    const h = harness();
    const win = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    expect(h.mainWindows.enqueueApproval(win.wcId, 'first')).toBe(false);
    h.mainWindows.takeApproval(win.wcId, () => 0);
    h.mainWindows.setOpenDialog(win.wcId, 'dialog of first');
    expect(h.mainWindows.enqueueApproval(win.wcId, 'second')).toBe(true);
    h.mainWindows.setOpenDialog(win.wcId, null);
    expect(h.mainWindows.enqueueApproval(win.wcId, 'third')).toBe(true);
    expect(h.mainWindows.enqueueApproval(win.wcId + 999, 'nobody')).toBe(false);
  });

  it('destroys and cleans up a window if loading fails after registration', async () => {
    const h = harness({ failLoads: new Set([1]) });
    await expect(h.mainWindows.build({ workspace: 'C:/broken', origin: 'launch' })).rejects.toThrow('load-failed:1');
    expect(h.mainWindows.ordered()).toHaveLength(0);
    expect(h.actions).toContain('destroy:C:/broken');
    expect(h.actions).toContain('dispose:personas:1:terminal:1');
  });
});
describe('the main window\'s close guard reports a confirmed close before it closes (PD-ORCH-005 clause 9)', () => {
  function fakeWindow(log: string[]) {
    let listener: ((event: { preventDefault(): void }) => void) | null = null;
    const win: GuardedWindow & { attempt(): void } = {
      on: (_event, l) => { listener = l; },
      isDestroyed: () => false,
      close: () => { log.push('close'); win.attempt(); },
      attempt: () => { let prevented = false; listener?.({ preventDefault: () => { prevented = true; } }); log.push(prevented ? 'held' : 'passed'); },
    };
    return win;
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('a close the guard allows is reported, then made, and passes', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => true, () => log.push('confirmed'));
    win.attempt();
    await settle();
    expect(log).toEqual(['held', 'confirmed', 'close', 'passed']);
  });

  it('a close the guard refuses is never reported, and the window stays', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => false, () => log.push('confirmed'));
    win.attempt();
    await settle();
    expect(log).toEqual(['held']);
  });

  it('a guard that cannot answer lets the close through, reported first', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => { throw new Error('the renderer is gone'); }, () => log.push('confirmed'));
    win.attempt();
    await settle();
    expect(log).toEqual(['held', 'confirmed', 'close', 'passed']);
  });
});

describe('a main window\'s close guard, as the application\'s quit drives it (PD-ORCH-005 clause 9)', () => {
  it('asking closes nothing; a confirmed guard lets the window\'s next close pass, and one that cannot answer allows', async () => {
    const log: string[] = [];
    let listener: ((event: { preventDefault(): void }) => void) | null = null;
    const win: GuardedWindow = { on: (_e, l) => { listener = l; }, isDestroyed: () => false, close: () => { log.push('close'); let held = false; listener?.({ preventDefault: () => { held = true; } }); log.push(held ? 'held' : 'passed'); } };
    const guard = guardClose(win, async () => { throw new Error('gone'); }, () => log.push('confirmed'));
    expect(await guard.ask()).toBe(true);
    expect(log).toEqual([]);
    guard.confirm();
    guard.close();
    expect(log).toEqual(['confirmed', 'close', 'passed']);
  });
});
