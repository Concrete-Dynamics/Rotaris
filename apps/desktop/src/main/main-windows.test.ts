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
  readonly shownListeners: (() => void)[];
}

interface PendingTimer {
  cancelled: boolean;
  readonly callback: () => void;
}

function harness(options: {
  readonly cwd?: string;
  readonly remembered?: string;
  readonly failLoads?: ReadonlySet<number>;
  readonly postShowActivation?: (wcId: number) => void;
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
        focusListeners: [], closedListeners: [], shownListeners: [],
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
    show: (win) => { win.visible = true; actions.push(`show:${win.workspace}`); for (const listener of win.shownListeners.splice(0)) listener(); },
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
    onShown: (win, listener) => { win.shownListeners.push(listener); },
    ownsAuxiliary: (personaWindows, terminalWindows, senderId) => terminalWindows === `terminal:${senderId - 100}` || personaWindows === `personas:${senderId - 200}`,
    disposeResources: (_win, _wcId, personaWindows, terminalWindows) => actions.push(`dispose:${personaWindows}:${terminalWindows}`),
  };

  const after = (_delayMs: number, callback: () => void): MainWindowTimer => {
    const pending = { cancelled: false, callback };
    timers.push(pending);
    return { cancel: () => { pending.cancelled = true; } };
  };

  const dependencies: MainWindowsDependencies<MemoryWindow, string, string, string> = {
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
    unshownApprovals: (approvals) => { actions.push(`unshown:${approvals.join(',')}`); },
    workspaceClosed: (workspace) => { actions.push(`workspace-closed:${workspace}`); },
    ...(options.postShowActivation === undefined ? {} : { postShowActivation: (window) => { actions.push(`activate:${window.workspace}`); options.postShowActivation!(window.wcId); } }),
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
  it('runs the post-show activation once per window, after the window is shown and never during construction (REQ-STARTUP-043, REQ-STARTUP-114, REQ-STARTUP-047)', async () => {
    const activated: number[] = [];
    const h = harness({ postShowActivation: (wcId) => activated.push(wcId) });
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    // Built and loaded, not shown: nothing has been activated.
    expect(activated).toEqual([]);
    expect(h.actions.filter((a) => a.startsWith('activate:'))).toEqual([]);
    const win = h.windows.get(first.wcId)!;
    win.visible = true;
    for (const listener of win.shownListeners.splice(0)) listener();
    expect(activated).toEqual([first.wcId]);
    // A second show of the same window activates nothing again.
    for (const listener of win.shownListeners.splice(0)) listener();
    expect(activated).toEqual([first.wcId]);
    // A replacement window goes through the same activation — a fresh check for that window (REQ-STARTUP-047).
    await h.mainWindows.open(first.wcId, 'C:/a');
    h.folders.push('C:/b');
    await h.mainWindows.choose(first.wcId, { newWindow: false });
    expect(activated).toHaveLength(2);
    expect(activated[1]).not.toBe(first.wcId);
    expect(h.actions.indexOf('show:C:/b')).toBeLessThan(h.actions.indexOf('activate:C:/b'));
  });

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
      'build:C:/b:open-request', 'load:2', 'open:C:/b', 'show:C:/b', 'close:C:/a', 'workspace-closed:C:/a', 'persist:C:/b', 'focus:C:/b',
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

  it('REQ-TOOLS-063/064: a closing window hands over the requests still queued for its dialog, so none is left to hang', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    h.mainWindows.enqueueApproval(first.wcId, 'shown');
    h.mainWindows.takeApproval(first.wcId, () => 0);
    h.mainWindows.setOpenDialog(first.wcId, 'dialog of shown');
    h.mainWindows.enqueueApproval(first.wcId, 'queued-1');
    h.mainWindows.enqueueApproval(first.wcId, 'queued-2');
    h.windows.get(first.wcId)!.destroyed = true;
    h.windows.get(first.wcId)!.closedListeners[0]!();
    expect(h.actions.filter((action) => action.startsWith('unshown:'))).toEqual(['unshown:queued-1,queued-2']);
    expect(h.mainWindows.approvalQueue(first.wcId)).toEqual([]);
    // A window that closes with nothing queued hands over nothing.
    h.windows.get(second.wcId)!.destroyed = true;
    h.windows.get(second.wcId)!.closedListeners[0]!();
    expect(h.actions.filter((action) => action.startsWith('unshown:'))).toHaveLength(1);
  });

  /**
   * REQ-WORKSPACE-013: the outgoing window of a switch hands its workspace back, so main can cancel that workspace's
   * initialization run; nothing did before (`docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`).
   * A workspace still held by another window is not handed back, and neither is the sentinel.
   */
  it('reports a workspace no window holds any more once its last window closes, on a switch and on a vetoed replacement (REQ-WORKSPACE-013, REQ-WORKSPACE-102)', async () => {
    const replace = harness();
    const outgoing = await replace.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await replace.mainWindows.open(outgoing.wcId, 'C:/a');
    replace.folders.push('C:/b');
    await replace.mainWindows.choose(outgoing.wcId, { newWindow: false });
    const relevant = (actions: readonly string[]): string[] => actions.filter((action) => action.startsWith('workspace-closed:') || action.startsWith('close:') || action.startsWith('open:'));
    expect(relevant(replace.actions)).toEqual(['open:C:/a', 'open:C:/b', 'close:C:/a', 'workspace-closed:C:/a']);

    // A vetoed close discards the replacement, whose workspace was opened for it and is now no window's.
    const vetoed = harness();
    const kept = await vetoed.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await vetoed.mainWindows.open(kept.wcId, 'C:/a');
    vetoed.windows.get(kept.wcId)!.closeAllowed = false;
    vetoed.folders.push('C:/b');
    await vetoed.mainWindows.choose(kept.wcId, { newWindow: false });
    expect(vetoed.actions.filter((action) => action.startsWith('workspace-closed:'))).toEqual(['workspace-closed:C:/b']);

    // Two windows: closing one hands back its own workspace only.
    const two = harness();
    const first = await two.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await two.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    two.windows.get(second.wcId)!.destroyed = true;
    two.windows.get(second.wcId)!.closedListeners[0]!();
    expect(two.actions.filter((action) => action.startsWith('workspace-closed:'))).toEqual(['workspace-closed:C:/b']);
    two.windows.get(first.wcId)!.destroyed = true;
    two.windows.get(first.wcId)!.closedListeners[0]!();
    expect(two.actions.filter((action) => action.startsWith('workspace-closed:'))).toEqual(['workspace-closed:C:/b', 'workspace-closed:C:/a']);

    const none = harness();
    const sentinel = await none.mainWindows.build({ workspace: '(no workspace)', origin: 'launch' });
    none.windows.get(sentinel.wcId)!.destroyed = true;
    none.windows.get(sentinel.wcId)!.closedListeners[0]!();
    expect(none.actions.filter((action) => action.startsWith('workspace-closed:'))).toEqual([]);
  });

  it('answers a command for the sender\'s main window, else the main window owning the persona or terminal window that sent it, else the active window (REQ-MONITOR-069, REQ-STARTUP-163, REQ-SHELL-020)', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    // The first window is the active one; the persona (id + 200) and terminal (id + 100) windows are the second's.
    h.windows.get(first.wcId)!.focusListeners[0]!();
    expect(h.mainWindows.active()?.wcId).toBe(first.wcId);
    expect(h.mainWindows.forCommand(second.wcId + 200)?.workspace).toBe('C:/b');
    expect(h.mainWindows.forCommand(second.wcId + 100)?.workspace).toBe('C:/b');
    expect(h.mainWindows.forCommand(second.wcId)?.wcId).toBe(second.wcId);
    expect(h.mainWindows.forCommand(first.wcId)?.wcId).toBe(first.wcId);
    // A sender that is neither a main window nor an auxiliary one (an approval dialog, a verification seam) answers for the active window.
    expect(h.mainWindows.forCommand(9_999)?.wcId).toBe(first.wcId);
    // The owner gone, its auxiliary windows' commands fall back to the active window rather than to a closed one.
    h.windows.get(second.wcId)!.destroyed = true;
    h.windows.get(second.wcId)!.closedListeners[0]!();
    expect(h.mainWindows.forCommand(second.wcId + 200)?.wcId).toBe(first.wcId);
  });

  it('names the live windows holding a workspace, and no other, so one workspace\'s state reaches its own window only (REQ-WORKSPACE-105, PD-SHELL-001)', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    const none = await h.mainWindows.build({ workspace: '(no workspace)', origin: 'open-request' });
    expect(h.mainWindows.holding('c:/a').map((window) => window.wcId)).toEqual([first.wcId]);
    expect(h.mainWindows.holding('C:/b').map((window) => window.wcId)).toEqual([second.wcId]);
    expect(h.mainWindows.holding('(no workspace)')).toEqual([]);
    expect(h.mainWindows.holding('C:/c')).toEqual([]);
    h.windows.get(second.wcId)!.destroyed = true;
    expect(h.mainWindows.holding('C:/b')).toEqual([]);
    expect(none.wcId).not.toBe(first.wcId);
  });

  it('REQ-NOTIFY-030/032: a session is focused only where a main window subscribed to it follows it; the owner falls back to the active window, the follower does not', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    h.mainWindows.setFollowedSession(first.wcId, 'S1');
    expect(h.mainWindows.followerOfSession('S1', [first.wcId, second.wcId])?.wcId).toBe(first.wcId);
    // Followed, but by a window that is not among the session's subscribers: not on screen there.
    expect(h.mainWindows.followerOfSession('S1', [second.wcId])).toBeUndefined();
    expect(h.mainWindows.followerOfSession('S2', [first.wcId, second.wcId])).toBeUndefined();
    expect(h.mainWindows.ownerOfSession('S2', [first.wcId, second.wcId])?.wcId).toBe(second.wcId);
    h.mainWindows.clearFollowedSession(first.wcId, 'S1');
    expect(h.mainWindows.followerOfSession('S1', [first.wcId])).toBeUndefined();
  });

  /*
   * docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md:
   * a run that failed before the starting window's `session.subscribe` reached main was read as another session's failure.
   */
  it('REQ-NOTIFY-030/032: the window starting a session shows it before it subscribes, until it subscribes, stops following it or the start is refused', async () => {
    const h = harness();
    const first = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    const second = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    // Not yet a subscriber of the session it asked for: the focus test still names it.
    h.mainWindows.beginStart(first.wcId, 'S1');
    expect(h.mainWindows.showingSession('S1', [])?.wcId).toBe(first.wcId);
    expect(h.mainWindows.showingSession('S2', [])).toBeUndefined();
    // The subscription and routing rules are unchanged: a start is not a follow among the subscribers.
    expect(h.mainWindows.followerOfSession('S1', [first.wcId, second.wcId])).toBeUndefined();
    // Subscribed: the ordinary rule from here — followed among its subscribers.
    h.mainWindows.setFollowedSession(first.wcId, 'S1');
    expect(h.mainWindows.showingSession('S1', [first.wcId])?.wcId).toBe(first.wcId);
    expect(h.mainWindows.showingSession('S1', [second.wcId])).toBeUndefined();
    // A refused start: not on screen.
    h.mainWindows.beginStart(second.wcId, 'S3');
    h.mainWindows.endStart(second.wcId, 'S3');
    expect(h.mainWindows.showingSession('S3', [])).toBeUndefined();
    // Released or unsubscribed before its subscription arrived: not on screen.
    h.mainWindows.beginStart(second.wcId, 'S4');
    h.mainWindows.clearFollowedSession(second.wcId, 'S4');
    expect(h.mainWindows.showingSession('S4', [])).toBeUndefined();
    // Switched to another session before subscribing to the started one: the started one is not on screen there.
    h.mainWindows.beginStart(second.wcId, 'S5');
    h.mainWindows.setFollowedSession(second.wcId, 'S6');
    expect(h.mainWindows.showingSession('S5', [])).toBeUndefined();
    // A closed window shows nothing.
    h.mainWindows.beginStart(second.wcId, 'S7');
    h.windows.get(second.wcId)!.destroyed = true;
    expect(h.mainWindows.showingSession('S7', [])).toBeUndefined();
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

describe('a person\'s close asks the active-run confirmation after the renderer\'s guard (REQ-STARTUP-046, REQ-SHELL-119)', () => {
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

  it('declined, the close is aborted: nothing is reported or closed, and the window stays', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => { log.push('settings'); return true; }, () => log.push('confirmed'), async () => { log.push('runs'); return false; });
    win.attempt();
    await settle();
    expect(log).toEqual(['settings', 'held', 'runs']);
  });

  it('accepted, the close is reported, made and passes', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => { log.push('settings'); return true; }, () => log.push('confirmed'), async () => { log.push('runs'); return true; });
    win.attempt();
    await settle();
    expect(log).toEqual(['settings', 'held', 'runs', 'confirmed', 'close', 'passed']);
  });

  it('the unsaved-settings guard comes first: refused there, the run confirmation is never asked', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => { log.push('settings'); return false; }, () => log.push('confirmed'), async () => { log.push('runs'); return true; });
    win.attempt();
    await settle();
    expect(log).toEqual(['settings', 'held']);
  });

  it('a confirmation that cannot be asked is the returning answer', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, async () => true, () => log.push('confirmed'), async () => { throw new Error('no box'); });
    win.attempt();
    await settle();
    expect(log).toEqual(['held']);
  });

  it('a second close while the confirmation is open is held and asks nothing more', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    let answer!: (proceed: boolean) => void;
    guardClose(win, async () => true, () => log.push('confirmed'), () => { log.push('runs'); return new Promise<boolean>((r) => { answer = r; }); });
    win.attempt();
    await settle();
    win.attempt();
    await settle();
    expect(log).toEqual(['held', 'runs', 'held']);
    answer(false);
    await settle();
    win.attempt();
    await settle();
    expect(log).toEqual(['held', 'runs', 'held', 'held', 'runs']);
  });

  it('the application\'s quit asks the renderer\'s guard alone', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    const guard = guardClose(win, async () => { log.push('settings'); return true; }, () => log.push('confirmed'), async () => { log.push('runs'); return false; });
    expect(await guard.ask()).toBe(true);
    expect(log).toEqual(['settings']);
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
