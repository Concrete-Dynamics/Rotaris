import { describe, expect, it } from 'vitest';
import { anotherMainWindowStays, confirmActiveRunClose } from './close-confirmation.js';
import { closeThroughGuards } from './exit.js';
import {
  askRendererGuard,
  guardClose,
  MainWindows,
  RENDERER_CLOSE_GUARD_SCRIPT,
  RENDERER_LIVENESS_BOUND_MS,
  RENDERER_LIVENESS_PROBE,
  type GuardedContents,
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
  /** The run host's count for a workspace id, as REQ-SHELL-021's gate 3 asks it (PD-SHELL-009: keyed by workspace). */
  readonly runsIn?: (workspaceId: string) => number;
} = {}) {
  const actions: string[] = [];
  const workspacesOpened: string[] = [];
  const delivered: string[] = [];
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
    activeRunCount: async (workspaceId) => options.runsIn?.(workspaceId) ?? 0,
    persistWorkspace: async (workspace) => { actions.push(`persist:${workspace}`); },
    raiseTransient: (windowId, _kind, title, _body, action) => {
      notices.push({ windowId, title, ...(action === undefined ? {} : { action: action.label }) });
    },
    reportFailure: (windowId, title) => notices.push({ windowId, title }),
    log: (message) => actions.push(`log:${message}`),
    unshownApprovals: (approvals) => { actions.push(`unshown:${approvals.join(',')}`); },
    workspaceClosed: (workspace) => { actions.push(`workspace-closed:${workspace}`); },
    workspaceOpened: (window) => { workspacesOpened.push(`${window.workspace}:${window.workspaceId ?? 'none'}:after-${actions.length}`); },
    deliver: (window, request) => { delivered.push(`${window.wcId}:${request.kind}${request.kind === 'session-focus' ? `:${request.sessionId}` : ''}`); },
    ...(options.postShowActivation === undefined ? {} : { postShowActivation: (window) => { actions.push(`activate:${window.workspace}`); options.postShowActivation!(window.wcId); } }),
  };

  const mainWindows = new MainWindows<MemoryWindow, string, string, string, string>(dependencies);
  return {
    mainWindows, actions, workspacesOpened, delivered, notices, folders, windows, openFailures,
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

  // PD-LIBRARY-002 revision 2 (e): a window that opens a workspace is handed to main once its workspace id is set, after it
  // has loaded, on every path — so main can send it the improvement activity it would otherwise learn only at the next
  // publication (docs/defects/fixed/a-window-opened-while-a-retrospective-is-pending-shows-it-as-not-pending-until-the-next-publication.md).
  it('tells main each time a window has opened a workspace, after its load and with its workspace id, and never on a failed open', async () => {
    const h = harness();
    const first = await h.mainWindows.launch('C:/a');
    const opened = () => h.workspacesOpened.map((o) => o.replace(/:after-\d+$/, ''));
    expect(opened()).toEqual(['C:/a:id:C:/a']);
    // Told after the window's load and its workspace's open, both of which come before it in the actions.
    const at = Number(h.workspacesOpened[0]!.split(':after-')[1]);
    expect(h.actions.indexOf(`load:${first.wcId}`)).toBeLessThan(at);
    expect(h.actions.indexOf('open:C:/a')).toBeLessThan(at);
    h.folders.push('C:/b');
    await h.mainWindows.choose(first.wcId, { newWindow: true });
    h.folders.push('C:/c');
    await h.mainWindows.choose(first.wcId, { newWindow: false });
    expect(opened()).toEqual(['C:/a:id:C:/a', 'C:/b:id:C:/b', 'C:/c:id:C:/c']);
    h.openFailures.add('C:/d');
    h.folders.push('C:/d');
    await h.mainWindows.choose(h.mainWindows.ordered()[0]!.wcId, { newWindow: true });
    expect(opened()).toHaveLength(3);
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

  // ESC-34 / REQ-NOTIFY-044 (docs/defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md): a notice action
  // naming a workspace reaches that workspace, from whichever window it was activated in, without asking anything.
  it('reaches a named workspace: surfaces the window holding it, else adds one for it with no gate, and closes nothing', async () => {
    const h = harness({ runsIn: () => 1 });
    const first = await h.mainWindows.launch('C:/a');
    h.folders.push('C:/b');
    await h.mainWindows.choose(first.wcId, { newWindow: true });
    expect(h.mainWindows.active()?.workspace).toBe('C:/b');

    // Held by another window: that window is surfaced and returned, and nothing is built.
    h.actions.length = 0;
    const held = await h.mainWindows.reach('c:/a');
    expect(held.ok && held.window.wcId).toBe(first.wcId);
    expect(held.ok && held.window.workspaceId).toBe('id:C:/a');
    expect(held.ok && held.added).toBe(false);
    expect(h.actions.filter((action) => !action.startsWith('log:'))).toEqual(['show:C:/a', 'focus:C:/a']);
    expect(h.mainWindows.active()?.wcId).toBe(first.wcId);

    // Held by nobody: a window is added on PD-SHELL-001's route and opened, though a run is active (no REQ-SHELL-021 gate),
    // and no window is closed and no chooser asked.
    h.actions.length = 0;
    const reached = await h.mainWindows.reach('C:/c');
    expect(reached.ok && reached.added).toBe(true);
    expect(reached.ok && reached.window.workspace).toBe('C:/c');
    expect(reached.ok && reached.window.workspaceId).toBe('id:C:/c');
    expect(h.actions.filter((action) => action.startsWith('close:') || action.startsWith('destroy:'))).toEqual([]);
    expect(h.actions).toContain('open:C:/c');
    expect(h.notices).toEqual([]);
    expect(h.mainWindows.ordered().map((window) => window.workspace).sort()).toEqual(['C:/a', 'C:/b', 'C:/c']);
    expect(h.mainWindows.active()?.workspace).toBe('C:/c');

    // A folder that cannot be opened is answered as a refusal, and the window built for it does not survive.
    h.openFailures.add('C:/d');
    const failed = await h.mainWindows.reach('C:/d');
    expect(failed.ok).toBe(false);
    expect(!failed.ok && failed.outcome.ok).toBe(false);
    expect(h.mainWindows.ordered().map((window) => window.workspace).sort()).toEqual(['C:/a', 'C:/b', 'C:/c']);
  });

  // PD-WORKSPACE-005 revision 3 (OQ-294, ruled 2026-10-14 under R-072): a project-setup banner's action takes the reach, and
  // Settings › Project opens in the reached window — sent to a renderer listening on channel 15, held for one still loading
  // until its `projectInit.ready`. (Revision 2's `surfaceHolding`, which added nothing for a project no window held, is gone.)
  describe('a project-setup banner\'s Settings › Project reaches its window (PD-WORKSPACE-005 revision 3)', () => {
    it('an added window that is not yet listening holds the request, and its ready call returns it once', async () => {
      const h = harness();
      await h.mainWindows.launch('C:/b');
      const reached = await h.mainWindows.reach('C:/closed');
      expect(reached.ok && reached.added).toBe(true);
      const added = reached.ok ? reached.window.wcId : -1;
      expect(h.mainWindows.openProjectInit(added)).toBe('held');
      expect(h.delivered).toEqual([]);
      expect(h.mainWindows.projectInitReady(added)).toBe(true);
      expect(h.mainWindows.projectInitReady(added)).toBe(false);
    });

    it('a listening holder is sent channel 15 directly, surfaced on REQ-SHELL-161\'s terms', async () => {
      const h = harness();
      const first = await h.mainWindows.launch('C:/a');
      expect(h.mainWindows.projectInitReady(first.wcId)).toBe(false);
      h.folders.push('C:/b');
      await h.mainWindows.choose(first.wcId, { newWindow: true });
      h.windows.get(first.wcId)!.minimized = true;
      h.actions.length = 0;
      const reached = await h.mainWindows.reach('c:/a');
      expect(reached.ok && reached.window.wcId).toBe(first.wcId);
      expect(h.actions.filter((action) => !action.startsWith('log:'))).toEqual(['restore:C:/a', 'show:C:/a', 'focus:C:/a']);
      expect(h.mainWindows.openProjectInit(first.wcId)).toBe('sent');
      expect(h.delivered).toEqual([`${first.wcId}:project-init`]);
    });

    it('a second press during a deferred open sets the request once and does not refuse', async () => {
      const h = harness();
      await h.mainWindows.launch('C:/b');
      h.deferOpens();
      const first = h.mainWindows.reach('C:/closed');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const second = h.mainWindows.reach('C:/closed');
      h.resolveOpen('C:/closed');
      const [a, b] = await Promise.all([first, second]);
      expect(a.ok && b.ok).toBe(true);
      const wcId = a.ok ? a.window.wcId : -1;
      expect(b.ok && b.window.wcId).toBe(wcId);
      expect(h.mainWindows.openProjectInit(wcId)).toBe('held');
      expect(h.mainWindows.openProjectInit(wcId)).toBe('held');
      expect(h.mainWindows.projectInitReady(wcId)).toBe(true);
      expect(h.mainWindows.projectInitReady(wcId)).toBe(false);
      expect(h.actions.filter((action) => action.startsWith('build:'))).toEqual(['build:C:/b:launch', 'build:C:/closed:open-request']);
    });
  });

  // docs/defects/fixed/a-notice-action-reaching-a-window-still-opening-its-workspace-is-refused.md: a second press while the window
  // the first press added is still opening its workspace reaches that window, and is answered once the workspace is open —
  // with its workspace id — rather than at once with none, which the hook review read as "Open a workspace before reviewing
  // its hooks".
  it('answers a reach of a window still opening its workspace once the open has settled, with the workspace id, and builds once', async () => {
    const h = harness();
    await h.mainWindows.launch('C:/a');
    h.deferOpens();
    const settledWith = (pending: ReturnType<typeof h.mainWindows.reach>) => pending.then((r) => (r.ok ? { added: r.added, workspaceId: r.window.workspaceId } : { refused: r.outcome }));
    const first = settledWith(h.mainWindows.reach('C:/c'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.actions).toContain('open:C:/c');
    let secondAnswer: unknown = 'pending';
    const second = settledWith(h.mainWindows.reach('c:/c')).then((answer) => { secondAnswer = answer; return answer; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondAnswer).toBe('pending');

    h.resolveOpen('C:/c');
    expect(await first).toEqual({ added: true, workspaceId: 'id:C:/c' });
    expect(await second).toEqual({ added: false, workspaceId: 'id:C:/c' });
    expect(h.actions.filter((action) => action.startsWith('build:'))).toEqual(['build:C:/a:launch', 'build:C:/c:open-request']);
  });

  it('answers a reach of a window whose open then failed as a refusal, and adds no second window for it', async () => {
    const h = harness();
    await h.mainWindows.launch('C:/a');
    h.deferOpens();
    const first = h.mainWindows.reach('C:/c');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = h.mainWindows.reach('C:/c');
    h.resolveOpen('C:/c', false);
    expect((await first).ok).toBe(false);
    const answered = await second;
    expect(answered.ok).toBe(false);
    expect(h.actions.filter((action) => action.startsWith('build:'))).toEqual(['build:C:/a:launch', 'build:C:/c:open-request']);
    expect(h.mainWindows.ordered().map((window) => window.workspace)).toEqual(['C:/a']);
  });

  // PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): a `focus-session` notice reaches the window holding the
  // session's workspace and asks THAT window to focus the session; a window the reach added holds the request until its renderer
  // is ready for it, and is given it once.
  describe('a notice\'s session focus reaches the window holding its workspace (PD-SHELL-001 revision 3)', () => {
    it('held elsewhere: the holder is surfaced and, listening, is sent the focus at once', async () => {
      const h = harness();
      const a = await h.mainWindows.launch('C:/a');
      h.folders.push('C:/b');
      await h.mainWindows.choose(a.wcId, { newWindow: true });
      expect(h.mainWindows.sessionFocusReady(a.wcId)).toBeNull();
      const reached = await h.mainWindows.reach('c:/a');
      expect(reached.ok && reached.window.wcId).toBe(a.wcId);
      expect(h.mainWindows.active()?.wcId).toBe(a.wcId);
      expect(h.mainWindows.focusSession(a.wcId, 'S-A')).toBe('sent');
      expect(h.delivered).toEqual([`${a.wcId}:session-focus:S-A`]);
      expect(h.mainWindows.sessionFocusReady(a.wcId)).toBeNull();
    });

    it('held nowhere: the window the reach added is not listening yet, holds the focus, and is given it once when ready', async () => {
      const h = harness();
      await h.mainWindows.launch('C:/b');
      const reached = await h.mainWindows.reach('C:/a');
      expect(reached.ok && reached.added).toBe(true);
      const added = reached.ok ? reached.window.wcId : -1;
      expect(h.mainWindows.focusSession(added, 'S-A')).toBe('held');
      expect(h.delivered).toEqual([]);
      expect(h.mainWindows.sessionFocusReady(added)).toBe('S-A');
      expect(h.mainWindows.sessionFocusReady(added)).toBeNull();
      // Listening from then on: the next request is sent, not held.
      expect(h.mainWindows.focusSession(added, 'S-A2')).toBe('sent');
      expect(h.delivered).toEqual([`${added}:session-focus:S-A2`]);
    });

    it('a second request while one is held replaces it, and a window gone answers so', async () => {
      const h = harness();
      const b = await h.mainWindows.launch('C:/b');
      expect(h.mainWindows.focusSession(b.wcId, 'S-1')).toBe('held');
      expect(h.mainWindows.focusSession(b.wcId, 'S-2')).toBe('held');
      expect(h.mainWindows.sessionFocusReady(b.wcId)).toBe('S-2');
      expect(h.mainWindows.focusSession(999, 'S-3')).toBe('gone');
    });
  });

  it('answers a reach with no main window open as a refusal and builds nothing', async () => {
    const empty = harness({ cwd: 'C:/startup' });
    const reached = await empty.mainWindows.reach('C:/a');
    expect(reached.ok).toBe(false);
    expect(empty.actions.filter((action) => action.startsWith('build:'))).toEqual([]);
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

/**
 * The main-window timers port, by hand (`rotaris/no-bare-timers`): `advance` moves its time and fires what fell due, a timer
 * armed by a firing included; `pending` counts the timers armed and neither fired nor cancelled.
 */
function clock() {
  let now = 0;
  const armed: { due: number; callback: () => void; done: boolean }[] = [];
  return {
    after: (delayMs: number, callback: () => void): MainWindowTimer => {
      const timer = { due: now + delayMs, callback, done: false };
      armed.push(timer);
      return { cancel: () => { timer.done = true; } };
    },
    advance: (ms: number): void => {
      const until = now + ms;
      for (;;) {
        const next = armed.filter((t) => !t.done && t.due <= until).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        now = next.due;
        next.done = true;
        next.callback();
      }
      now = until;
    },
    pending: (): number => armed.filter((t) => !t.done).length,
  };
}

describe('a main window whose renderer is gone cannot hold its close or the application\'s quit (REQ-SHELL-119, PD-ORCH-005 clause 9)', () => {
  /*
   * docs/defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md: Electron's
   * `executeJavaScript` on a renderer that is gone neither resolves nor rejects, so the guard asked through it never
   * answered and the quit waited on it with no bound. The fake keeps that shape: its `executeJavaScript` never settles.
   */
  function contents(state: { crashed: boolean; destroyed?: boolean; answer?: Promise<unknown>; probe?: 'answer' | 'silent' }) {
    const listeners = new Map<string, Set<() => void>>();
    const asked: string[] = [];
    const probes: string[] = [];
    const wc: GuardedContents & { go(event: 'render-process-gone' | 'destroyed' | 'unresponsive'): void; listening(): number; asked: string[]; probes: string[] } = {
      executeJavaScript: (code) => {
        // PD-SHELL-010: main's liveness probe is a question of its own, answered by a live renderer and by no hung one.
        if (code === RENDERER_LIVENESS_PROBE) { probes.push(code); return state.probe === 'silent' ? new Promise<unknown>(() => undefined) : Promise.resolve(true); }
        asked.push(code);
        return state.answer ?? new Promise<unknown>(() => undefined);
      },
      isCrashed: () => state.crashed,
      isDestroyed: () => state.destroyed === true,
      once: (event: string, listener: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); return wc; },
      removeListener: (event: string, listener: () => void) => { listeners.get(event)?.delete(listener); return wc; },
      go: (event) => { for (const l of [...(listeners.get(event) ?? [])]) { listeners.get(event)?.delete(l); l(); } },
      listening: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
      asked,
      probes,
    };
    return wc;
  }
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
  /** Settles within `ms`, or answers 'held' — so a hang fails the test rather than timing it out. */
  const within = <T>(promise: Promise<T>, ms = 200): Promise<T | 'held'> => Promise.race([promise, new Promise<'held'>((r) => setTimeout(() => r('held'), ms))]);
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('the application\'s quit closes a window whose renderer crashed: its guard cannot answer, so it allows', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    const wc = contents({ crashed: true });
    const guard = guardClose(win, () => askRendererGuard(wc, { timers: clock() }), () => log.push('confirmed'));
    expect(await within(closeThroughGuards([guard]))).toBe(true);
    expect(log).toEqual(['confirmed', 'close', 'passed']);
    expect(wc.asked).toEqual([]);
  });

  it('a person\'s close of a window whose renderer crashed passes', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    guardClose(win, () => askRendererGuard(contents({ crashed: true }), { timers: clock() }), () => log.push('confirmed'));
    win.attempt();
    await settle();
    expect(log).toEqual(['held', 'confirmed', 'close', 'passed']);
  });

  it('a renderer that goes while its guard is asked releases the question, and the quit goes on', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    const wc = contents({ crashed: false });
    const guard = guardClose(win, () => askRendererGuard(wc, { timers: clock() }), () => log.push('confirmed'));
    const closing = closeThroughGuards([guard]);
    await settle();
    expect(wc.asked).toHaveLength(1);
    expect(await within(closing, 20)).toBe('held');
    wc.go('render-process-gone');
    expect(await within(closing)).toBe(true);
    expect(log).toEqual(['confirmed', 'close', 'passed']);
    expect(wc.listening()).toBe(0);
  });

  it('a window whose contents are destroyed while its guard is asked releases the question too', async () => {
    const wc = contents({ crashed: false });
    const asking = askRendererGuard(wc, { timers: clock() }).then(() => 'answered', () => 'cannot answer');
    await settle();
    wc.go('destroyed');
    expect(await within(asking)).toBe('cannot answer');
    expect(wc.listening()).toBe(0);
  });

  it('a live renderer\'s answer still decides, and nothing is left listening once it has', async () => {
    const refused = contents({ crashed: false, answer: Promise.resolve(false) });
    expect(await askRendererGuard(refused, { timers: clock() })).toBe(false);
    expect(refused.listening()).toBe(0);
    const log: string[] = [];
    const win = fakeWindow(log);
    const guard = guardClose(win, () => askRendererGuard(contents({ crashed: false, answer: Promise.resolve(false) }), { timers: clock() }), () => log.push('confirmed'));
    expect(await within(closeThroughGuards([guard]))).toBe(false);
    expect(log).toEqual([]);
  });

  it('a renderer still deciding is waited for: the guard\'s question has no time bound of its own', async () => {
    let answer!: (proceed: boolean) => void;
    const wc = contents({ crashed: false, answer: new Promise<boolean>((r) => { answer = r; }) });
    const asking = askRendererGuard(wc, { timers: clock() });
    expect(await within(asking, 50)).toBe('held');
    answer(true);
    expect(await within(asking)).toBe(true);
  });

  /*
   * PD-SHELL-010 (OQ-297, the consortium's HR1): a renderer that is alive but hung — its main thread looping or stopped — is
   * not gone, so until 2026-10-14 its guard's question was waited for with no bound and held a person's close and the
   * application's quit (docs/defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md). Main now
   * asks a liveness probe of its own beside the guard's question, every RENDERER_LIVENESS_BOUND_MS while it is out; a probe
   * unanswered at its bound, or Chromium's `unresponsive`, means the renderer cannot answer, and a guard that cannot answer
   * allows. A renderer that answers its probes is still waited for without bound: its guard may be a person deciding.
   */
  it('the application\'s quit closes a window whose renderer answers no liveness probe: its guard cannot answer, so it allows', async () => {
    const log: string[] = [];
    const warned: string[] = [];
    const win = fakeWindow(log);
    const timers = clock();
    const wc = contents({ crashed: false, probe: 'silent' });
    const guard = guardClose(win, () => askRendererGuard(wc, { timers, warn: (m) => warned.push(m) }), () => log.push('confirmed'));
    const closing = closeThroughGuards([guard]);
    await settle();
    expect(wc.asked).toEqual([RENDERER_CLOSE_GUARD_SCRIPT]);
    expect(wc.probes).toHaveLength(1);
    timers.advance(RENDERER_LIVENESS_BOUND_MS - 1);
    expect(await within(closing, 20)).toBe('held');
    timers.advance(1);
    expect(await within(closing)).toBe(true);
    expect(log).toEqual(['confirmed', 'close', 'passed']);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/cannot answer: unresponsive/);
    expect(warned[0]).toMatch(/liveness probe/);
    expect(wc.listening()).toBe(0);
    expect(timers.pending()).toBe(0);
  });

  it('a person\'s close of a window whose renderer answers no liveness probe passes', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    const timers = clock();
    const wc = contents({ crashed: false, probe: 'silent' });
    guardClose(win, () => askRendererGuard(wc, { timers }), () => log.push('confirmed'));
    win.attempt();
    await settle();
    expect(log).toEqual(['held']);
    timers.advance(RENDERER_LIVENESS_BOUND_MS);
    await settle();
    expect(log).toEqual(['held', 'confirmed', 'close', 'passed']);
    expect(wc.listening()).toBe(0);
    expect(timers.pending()).toBe(0);
  });

  it('Chromium\'s `unresponsive` while the question is out releases the quit and a person\'s close alike', async () => {
    const quitLog: string[] = [];
    const warned: string[] = [];
    const quitWc = contents({ crashed: false });
    const quitTimers = clock();
    const guard = guardClose(fakeWindow(quitLog), () => askRendererGuard(quitWc, { timers: quitTimers, warn: (m) => warned.push(m) }), () => quitLog.push('confirmed'));
    const closing = closeThroughGuards([guard]);
    await settle();
    expect(await within(closing, 20)).toBe('held');
    quitWc.go('unresponsive');
    expect(await within(closing)).toBe(true);
    expect(quitLog).toEqual(['confirmed', 'close', 'passed']);
    expect(warned).toEqual([expect.stringMatching(/cannot answer: unresponsive/)]);
    expect(warned[0]).toMatch(/Chromium/);
    expect(quitWc.listening()).toBe(0);
    expect(quitTimers.pending()).toBe(0);

    const closeLog: string[] = [];
    const win = fakeWindow(closeLog);
    const closeWc = contents({ crashed: false });
    const closeTimers = clock();
    guardClose(win, () => askRendererGuard(closeWc, { timers: closeTimers }), () => closeLog.push('confirmed'));
    win.attempt();
    await settle();
    closeWc.go('unresponsive');
    await settle();
    expect(closeLog).toEqual(['held', 'confirmed', 'close', 'passed']);
    expect(closeWc.listening()).toBe(0);
    expect(closeTimers.pending()).toBe(0);
  });

  it('a renderer that answers its probes while its guard stays pending is held past many bounds: a person is deciding', async () => {
    let answer!: (proceed: boolean) => void;
    const timers = clock();
    const wc = contents({ crashed: false, probe: 'answer', answer: new Promise<boolean>((r) => { answer = r; }) });
    const log: string[] = [];
    const guard = guardClose(fakeWindow(log), () => askRendererGuard(wc, { timers }), () => log.push('confirmed'));
    const closing = closeThroughGuards([guard]);
    for (let bound = 0; bound < 24; bound += 1) {
      await settle();
      timers.advance(RENDERER_LIVENESS_BOUND_MS);
    }
    await settle();
    expect(await within(closing, 20)).toBe('held');
    expect(wc.probes.length).toBeGreaterThanOrEqual(24);
    expect(log).toEqual([]);
    answer(false);
    expect(await within(closing)).toBe(false);
    expect(log).toEqual([]);
    expect(wc.listening()).toBe(0);
    expect(timers.pending()).toBe(0);
  });

  it('a person\'s close still meets guard (3) after a hung guard (1) allows', async () => {
    const log: string[] = [];
    const win = fakeWindow(log);
    const timers = clock();
    guardClose(win, () => askRendererGuard(contents({ crashed: false, probe: 'silent' }), { timers }), () => log.push('confirmed'), async () => { log.push('runs'); return false; });
    win.attempt();
    await settle();
    timers.advance(RENDERER_LIVENESS_BOUND_MS);
    await settle();
    expect(log).toEqual(['held', 'runs']);
  });

  it('every listener and timer is removed whichever way the question settles, and a late answer is ignored', async () => {
    type Way = 'answer' | 'refusal' | 'error' | 'gone' | 'destroyed' | 'unresponsive' | 'probe';
    const ways: Way[] = ['answer', 'refusal', 'error', 'gone', 'destroyed', 'unresponsive', 'probe'];
    for (const way of ways) {
      let settleQuestion!: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
      const question = new Promise<unknown>((resolve, reject) => { settleQuestion = { resolve, reject }; });
      const timers = clock();
      const warned: string[] = [];
      const wc = contents({ crashed: false, answer: question, probe: way === 'probe' ? 'silent' : 'answer' });
      const asking = askRendererGuard(wc, { timers, warn: (m) => warned.push(m) }).then((v) => ({ v }), (e: unknown) => ({ e: String(e) }));
      await settle();
      expect(wc.listening(), way).toBeGreaterThan(0);
      expect(timers.pending(), way).toBe(1);
      if (way === 'answer') settleQuestion.resolve(true);
      else if (way === 'refusal') settleQuestion.resolve(false);
      else if (way === 'error') settleQuestion.reject(new Error('the script threw'));
      else if (way === 'gone') wc.go('render-process-gone');
      else if (way === 'destroyed') wc.go('destroyed');
      else if (way === 'unresponsive') wc.go('unresponsive');
      else timers.advance(RENDERER_LIVENESS_BOUND_MS);
      const outcome = await within(asking);
      expect(outcome, way).not.toBe('held');
      expect(wc.listening(), way).toBe(0);
      expect(timers.pending(), way).toBe(0);
      // A late answer, and a later signal, change nothing: the question has settled.
      settleQuestion.resolve(false);
      wc.go('unresponsive');
      timers.advance(RENDERER_LIVENESS_BOUND_MS * 3);
      await settle();
      expect(await asking, way).toEqual(outcome);
      expect(warned.length, way).toBe(['gone', 'destroyed', 'unresponsive', 'probe'].includes(way) ? 1 : 0);
    }
  });

  it('a renderer gone before the question is asked arms nothing, and says which signal it was', async () => {
    const timers = clock();
    const warned: string[] = [];
    const wc = contents({ crashed: true });
    await expect(askRendererGuard(wc, { timers, warn: (m) => warned.push(m) })).rejects.toThrow(/cannot answer: gone/);
    expect(warned).toEqual([expect.stringMatching(/cannot answer: gone/)]);
    expect(wc.probes).toEqual([]);
    expect(timers.pending()).toBe(0);
    expect(wc.listening()).toBe(0);
  });
});

describe("REQ-SHELL-021's gate 3 counts the requesting window's own workspace (PD-SHELL-009)", () => {
  it('an idle window opens another project while another window\'s project runs; the window holding the run is declined', async () => {
    const h = harness({ runsIn: (workspaceId) => (workspaceId === 'id:C:/a' ? 1 : 0) });
    const running = await h.mainWindows.build({ workspace: 'C:/a', origin: 'launch' });
    await h.mainWindows.open(running.wcId, 'C:/a');
    const idle = await h.mainWindows.build({ workspace: 'C:/b', origin: 'open-request' });
    await h.mainWindows.open(idle.wcId, 'C:/b');
    h.folders.push('C:/c');
    const switched = await h.mainWindows.choose(idle.wcId, { newWindow: false });
    expect(switched.ok && (switched.value as { workspace?: string }).workspace).toBe('C:/c');
    h.folders.push('C:/d');
    const declined = await h.mainWindows.choose(running.wcId, { newWindow: false });
    expect(declined).toEqual({ ok: true, value: { cancelled: true, declined: 'Finish the active run before opening another project.' } });
    expect(h.notices).toContainEqual({ windowId: running.wcId, title: 'Finish the active run before opening another project.' });
    expect(h.mainWindows.ordered().map((w) => w.workspace).sort()).toEqual(['C:/a', 'C:/c']);
  });
});

describe('two main windows closed in one gesture each ask about their own project alone (PD-SHELL-009, REQ-STARTUP-046)', () => {
  /** Two guarded windows over one QuitState-like closing set: `a` holds a running workspace, `b` an idle one. */
  function pair(answerA: number) {
    const log: string[] = [];
    const closing = new Set<number>();
    const listeners = new Map<number, (event: { preventDefault(): void }) => void>();
    const destroyed = new Set<number>();
    const windows = [1, 2].map((wcId) => {
      const win: GuardedWindow & { attempt(): void } = {
        on: (_e, l) => { listeners.set(wcId, l); },
        isDestroyed: () => destroyed.has(wcId),
        close: () => { win.attempt(); },
        attempt: () => { let held = false; listeners.get(wcId)?.({ preventDefault: () => { held = true; } }); if (!held) { destroyed.add(wcId); log.push(`closed ${wcId === 1 ? 'a' : 'b'}`); } },
      };
      return { wcId, win };
    });
    const runs = new Map([[1, 1], [2, 0]]);
    for (const { wcId, win } of windows) {
      const name = wcId === 1 ? 'a' : 'b';
      guardClose(win, async () => true, () => closing.add(wcId), () => confirmActiveRunClose({
        othersStaying: () => anotherMainWindowStays(windows, wcId, (id) => closing.has(id)),
        activeRuns: async () => [...runs.values()].reduce((x, y) => x + y, 0),
        workspaceRuns: async () => runs.get(wcId)!,
        stopWorkspaceRuns: async () => { log.push(`stop ${name}`); runs.set(wcId, 0); },
        ask: async (box) => { log.push(`ask ${name}: ${box.message}`); return wcId === 1 ? answerA : 0; },
        log: () => undefined,
      }));
    }
    return { log, attemptBoth: () => { for (const { win } of windows) win.attempt(); }, destroyed };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('the running window asks the window box and the idle one closes unasked; Cancel keeps the running window and ends no run', async () => {
    const p = pair(0);
    p.attemptBoth();
    await settle(); await settle();
    expect(p.log).toEqual(['ask a: Close this window while a run is active?', 'closed b']);
    expect(p.destroyed.has(1)).toBe(false);
  });

  it('Yes there stops that project\'s run before its window closes', async () => {
    const p = pair(1);
    p.attemptBoth();
    await settle(); await settle();
    expect(p.log.filter((l) => l.startsWith('ask'))).toEqual(['ask a: Close this window while a run is active?']);
    expect(p.log).toContain('closed b');
    expect(p.log.indexOf('stop a')).toBeGreaterThan(-1);
    expect(p.log.indexOf('stop a')).toBeLessThan(p.log.indexOf('closed a'));
  });
});
