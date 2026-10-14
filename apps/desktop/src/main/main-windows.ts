import type { AcknowledgementAction, CommandOutcome } from '@rotaris/contracts';
import type { HandOver } from '@rotaris/platform';
import type { BrowserWindow, BrowserWindowConstructorOptions, OpenDialogOptions } from 'electron';
import { PersonaWindows, TerminalWindows } from './windows.js';
import { onConsoleWarning } from './capture/console-relay.js';

export type MainWindowOrigin = 'launch' | 'open-request' | 'hand-over';

export interface MainWindowTimer {
  cancel(): void;
}

export interface MainWindowAdapter<TWindow, TPersonaWindows, TTerminalWindows> {
  readonly create: (input: { readonly workspace: string; readonly origin: MainWindowOrigin }) => Promise<{
    readonly win: TWindow;
    readonly wcId: number;
    readonly personaWindows: TPersonaWindows;
    readonly terminalWindows: TTerminalWindows;
    readonly load: () => Promise<void>;
  }>;
  readonly isDestroyed: (win: TWindow) => boolean;
  readonly isMinimized: (win: TWindow) => boolean;
  readonly isVisible: (win: TWindow) => boolean;
  readonly show: (win: TWindow) => void;
  readonly focus: (win: TWindow) => void;
  readonly restore: (win: TWindow) => void;
  readonly close: (win: TWindow) => Promise<boolean>;
  readonly destroy: (win: TWindow) => void;
  readonly onFocus: (win: TWindow, listener: () => void) => void;
  readonly onClosed: (win: TWindow, listener: () => void) => void;
  /** Fires once, when the window becomes visible — the moment REQ-STARTUP-043's post-show activation may begin. */
  readonly onShown: (win: TWindow, listener: () => void) => void;
  readonly ownsAuxiliary: (personaWindows: TPersonaWindows, terminalWindows: TTerminalWindows, senderId: number) => boolean;
  readonly disposeResources: (win: TWindow, wcId: number, personaWindows: TPersonaWindows, terminalWindows: TTerminalWindows) => void;
}

export interface MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> {
  readonly win: TWindow;
  readonly wcId: number;
  readonly workspace: string;
  readonly workspaceId: string | undefined;
  readonly followedSessionId: string | null;
  readonly personaWindows: TPersonaWindows;
  readonly terminalWindows: TTerminalWindows;
}

/**
 * A request main sends ONE main window's renderer on its own account, after a notice action reached that window: focus a
 * session (channel 16, PD-SHELL-001 revision 3, OQ-292) or open Settings › Project (channel 15, PD-WORKSPACE-005). A window
 * the reach has just added may not have registered its listener yet, so the request is held on the window's record until its
 * renderer says it listens (`sessionFocusReady`, `projectInitReady`), and is then delivered once.
 */
export type WindowRequest =
  | { readonly kind: 'session-focus'; readonly sessionId: string }
  | { readonly kind: 'project-init' };
type WindowRequestKind = WindowRequest['kind'];
/** What became of a window request: sent to a listening renderer, held for one still loading, or no such window. */
export type WindowRequestOutcome = 'sent' | 'held' | 'gone';

type WorkspaceGate =
  | { readonly ok: true }
  | { readonly ok: false; readonly outcome: CommandOutcome };

export interface MainWindowsDependencies<TWindow, TPersonaWindows, TTerminalWindows, TApproval = never> {
  readonly adapter: MainWindowAdapter<TWindow, TPersonaWindows, TTerminalWindows>;
  readonly timers: { readonly after: (delayMs: number, callback: () => void) => MainWindowTimer };
  readonly currentDirectory: () => string;
  readonly rememberedWorkspace: () => string | undefined;
  readonly isDirectory: (path: string) => boolean;
  readonly canonicalPath: (path: string) => string;
  readonly samePath: (left: string, right: string) => boolean;
  readonly chooseProjectFolder: (win: TWindow, startAt: string | undefined) => Promise<string | null>;
  readonly openWorkspace: (
    workspace: string,
    owner: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>,
  ) => Promise<{ readonly workspaceId: string; readonly storeFile: string } | undefined>;
  readonly closeGuard: (owner: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>) => Promise<boolean>;
  readonly activeRunCount: (workspaceId: string) => Promise<number | null>;
  readonly persistWorkspace: (workspace: string) => Promise<void>;
  readonly raiseTransient: (
    windowId: number,
    kind: 'info' | 'ok' | 'warn' | 'fail',
    title: string,
    body?: string,
    action?: AcknowledgementAction,
  ) => void;
  readonly reportFailure: (windowId: number, title: string, audience: 'window' | 'application') => void;
  readonly log: (message: string) => void;
  /**
   * REQ-TOOLS-063/064: the requests still queued for a window's dialog when the window closes. Each was acknowledged as
   * queued (`approval.queued`), so the run host no longer bounds its wait: main must say it was never shown, or it hangs.
   */
  readonly unshownApprovals?: (approvals: readonly TApproval[]) => void;
  /**
   * REQ-STARTUP-043 / REQ-STARTUP-114 / REQ-STARTUP-047: the post-show activation of ONE main window — where the update
   * check is initiated, and the only place it is. Called once per window, after that window is shown and never during
   * its construction, for every main window built here: the launch's, a replacement's, an added one's, a hand-over's.
   */
  readonly postShowActivation?: (window: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>) => void;
  /**
   * REQ-WORKSPACE-013: the last live main window holding `workspace` has closed — a switch's outgoing window, a vetoed
   * replacement, or one of several windows. Main cancels that workspace's initialization run here; nothing else did.
   */
  readonly workspaceClosed?: (workspace: string) => void;
  /**
   * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): a main window now holds a workspace it opened — a launch's, an added
   * window's, a replacement's, a hand-over's, or a reopen of the same one. Called after the window has loaded (every path
   * builds and loads it first) and its workspace id is set, so main can send it the state it would otherwise learn only at
   * the next publication — the improvement activity, its own workspace's pending retrospective among it.
   */
  readonly workspaceOpened?: (window: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>) => void;
  /** Sends a window request to the window's renderer on its channel (`WindowRequest`); called only once it listens. */
  readonly deliver?: (window: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>, request: WindowRequest) => void;
}

interface WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog> {
  readonly win: TWindow;
  readonly wcId: number;
  workspace: string;
  workspaceId: string | undefined;
  followedSessionId: string | null;
  /** REQ-NOTIFY-032: the session this window asked to start and has not yet subscribed to (`beginStart`), or null. */
  startingSessionId: string | null;
  readonly personaWindows: TPersonaWindows;
  readonly terminalWindows: TTerminalWindows;
  readonly approvals: TApproval[];
  openDialog: TDialog | null;
  mintedSessionId: string | null;
  /**
   * Settles once the window's workspace open has settled. Pending from `build` — every path that builds a window opens its
   * workspace next or destroys it — so a reach meeting a window still opening its workspace waits for that open rather than
   * answering with no workspace id (docs/defects/fixed/a-notice-action-reaching-a-window-still-opening-its-workspace-is-refused.md).
   */
  workspaceReady: Promise<unknown>;
  /** Settles the readiness `build` set; called when the first open settles and when the window is forgotten. */
  settleReady: () => void;
  questionAnswered: boolean;
  deferredOffer: MainWindowTimer | null;
  /** The window requests its renderer has registered for; none at `build`, so a request to a loading window is held. */
  readonly listening: Set<WindowRequestKind>;
  /** At most one request of each kind held for a renderer not yet listening; the later of two replaces the earlier. */
  readonly pending: Map<WindowRequestKind, WindowRequest>;
}

export class MainWindows<TWindow, TPersonaWindows, TTerminalWindows, TApproval = never, TDialog = never> {
  readonly #records = new Map<number, WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>>();
  readonly #focusOrder: number[] = [];

  constructor(private readonly dependencies: MainWindowsDependencies<TWindow, TPersonaWindows, TTerminalWindows, TApproval>) {}

  async build(input: { readonly workspace: string; readonly origin: MainWindowOrigin }): Promise<MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>> {
    const built = await this.dependencies.adapter.create(input);
    let settleReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => { settleReady = resolve; });
    const record: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog> = {
      win: built.win,
      wcId: built.wcId,
      personaWindows: built.personaWindows,
      terminalWindows: built.terminalWindows,
      workspace: input.workspace,
      workspaceId: undefined,
      followedSessionId: null,
      startingSessionId: null,
      approvals: [],
      openDialog: null,
      mintedSessionId: null,
      workspaceReady: ready,
      settleReady,
      questionAnswered: false,
      deferredOffer: null,
      listening: new Set(),
      pending: new Map(),
    };
    this.#records.set(record.wcId, record);
    this.#rememberFocus(record.wcId);
    this.dependencies.adapter.onFocus(record.win, () => this.#rememberFocus(record.wcId));
    this.dependencies.adapter.onClosed(record.win, () => this.#forget(record.wcId));
    // REQ-STARTUP-043: the update check is initiated from the post-show activation and never during construction —
    // registered here, fired by the adapter when the window is shown, once for this window.
    let activated = false;
    this.dependencies.adapter.onShown(record.win, () => {
      if (activated || this.dependencies.adapter.isDestroyed(record.win)) return;
      activated = true;
      this.dependencies.postShowActivation?.(this.#view(record));
    });
    try {
      await built.load();
    } catch (error) {
      this.#forget(record.wcId);
      this.dependencies.adapter.destroy(record.win);
      throw error;
    }
    return this.#view(record);
  }

  forSender(senderId: number): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    return this.#live(senderId);
  }

  active(): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    for (const id of this.#focusOrder) {
      const record = this.#liveRecord(id);
      if (record) return this.#view(record);
    }
    for (const record of this.#records.values()) {
      if (!this.dependencies.adapter.isDestroyed(record.win)) return this.#view(record);
    }
    return undefined;
  }

  /**
   * The live main windows holding `workspace` (REQ-STARTUP-163 keeps it to one; a switch's two windows hold two roots).
   * A message about one workspace's state goes to these and to no other window (REQ-WORKSPACE-105, PD-SHELL-001).
   */
  holding(workspace: string): readonly MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>[] {
    const holders: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>[] = [];
    for (const record of this.#records.values()) {
      if (this.dependencies.adapter.isDestroyed(record.win) || record.workspace === '(no workspace)') continue;
      if (this.dependencies.samePath(workspace, record.workspace)) holders.push(this.#view(record));
    }
    return holders;
  }

  ordered(): readonly MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>[] {
    const ordered: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>[] = [];
    const seen = new Set<number>();
    for (const id of this.#focusOrder) {
      const record = this.#liveRecord(id);
      if (record) { ordered.push(this.#view(record)); seen.add(id); }
    }
    for (const [id, record] of this.#records) {
      if (!seen.has(id) && !this.dependencies.adapter.isDestroyed(record.win)) ordered.push(this.#view(record));
    }
    return ordered;
  }

  ownerOfAuxiliary(senderId: number): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    for (const record of this.#records.values()) {
      if (this.dependencies.adapter.ownsAuxiliary(record.personaWindows, record.terminalWindows, senderId)) return this.#view(record);
    }
    return undefined;
  }

  /**
   * The main window a command speaks for (REQ-SHELL-020: the window that raised it). A main window answers for itself; a
   * persona or terminal window answers for the main window that owns it (ADR-0048 B, REQ-SHELL-072), so its configuration,
   * session list and artifacts are its owner's workspace and not the active window's when two main windows hold two
   * workspaces (REQ-STARTUP-163; REQ-MONITOR-069's "the same resolved set the inspector shows"); any other sender — an
   * approval dialog, a verification seam, the driver — answers for the active window.
   */
  forCommand(senderId: number): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    return this.forSender(senderId) ?? this.ownerOfAuxiliary(senderId) ?? this.active();
  }

  ownerOfSession(sessionId: string, subscriberIds: readonly number[]): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    return this.followerOfSession(sessionId, subscriberIds) ?? this.active();
  }

  /**
   * REQ-NOTIFY-030/032: the main window following the session — the session is on screen there — or undefined where none
   * does. Unlike `ownerOfSession` there is no fallback to the active window: a session no main window follows is not focused.
   */
  followerOfSession(sessionId: string, subscriberIds: readonly number[]): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    for (const id of subscriberIds) {
      const record = this.#liveRecord(id);
      if (record?.followedSessionId === sessionId) return this.#view(record);
    }
    return undefined;
  }

  /**
   * REQ-NOTIFY-030/032 — the focus test of a run's ending (`RunFailurePublisher`): the main window the session is on screen
   * in. That is the window following it among its subscribers (`followerOfSession`), else the window that is starting it and
   * has not subscribed yet (`beginStart`); undefined where neither holds — the session is not focused.
   */
  showingSession(sessionId: string, subscriberIds: readonly number[]): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    const follower = this.followerOfSession(sessionId, subscriberIds);
    if (follower !== undefined) return follower;
    for (const record of this.#records.values()) {
      if (record.startingSessionId === sessionId && !this.dependencies.adapter.isDestroyed(record.win)) return this.#view(record);
    }
    return undefined;
  }

  /**
   * REQ-NOTIFY-030/032: the window that starts a session follows it from the moment it asks the run host for it. The renderer
   * follows every session it starts (`session-actions.ts`), but its `session.subscribe` reaches main only after the start has
   * answered, and until 2026-10-06 a run that failed in between — 30 ms after the start in resilience-proof's
   * `auth-fallback-plan` — was read as another session's failure and raised REQ-NOTIFY-032's warning about the session on
   * screen (docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md).
   * Until the window's subscription arrives (`setFollowedSession`), it stops following the session
   * (`clearFollowedSession`) or the start is refused (`endStart`), `showingSession` names it for that session whatever the
   * session's subscribers.
   */
  beginStart(senderId: number, sessionId: string): void {
    const record = this.#liveRecord(senderId);
    if (record) record.startingSessionId = sessionId;
  }

  /** The start `beginStart` marked was refused: the window does not follow that session. */
  endStart(senderId: number, sessionId: string): void {
    const record = this.#liveRecord(senderId);
    if (record?.startingSessionId === sessionId) record.startingSessionId = null;
  }

  setFollowedSession(senderId: number, sessionId: string): void {
    const record = this.#liveRecord(senderId);
    if (!record) return;
    record.followedSessionId = sessionId;
    // The window subscribed (to its started session, or to another it switched to): the ordinary rule holds from here.
    record.startingSessionId = null;
  }

  clearFollowedSession(senderId: number, sessionId: string): void {
    const record = this.#liveRecord(senderId);
    if (record?.followedSessionId === sessionId) record.followedSessionId = null;
    if (record?.startingSessionId === sessionId) record.startingSessionId = null;
  }

  setWorkspaceId(senderId: number, workspaceId: string | undefined): void {
    const record = this.#liveRecord(senderId);
    if (record) record.workspaceId = workspaceId;
  }

  setWorkspace(senderId: number, workspace: string): void {
    const record = this.#liveRecord(senderId);
    if (record) record.workspace = workspace;
  }

  setMintedSession(senderId: number, sessionId: string | null): void {
    const record = this.#liveRecord(senderId);
    if (record) record.mintedSessionId = sessionId;
  }

  takeMintedSession(senderId: number): string | null {
    const record = this.#liveRecord(senderId);
    if (!record) return null;
    const sessionId = record.mintedSessionId;
    record.mintedSessionId = null;
    return sessionId;
  }

  /**
   * REQ-TOOLS-063: queue a request for this window's one dialog. Answers whether it waits behind another: a dialog is
   * open, or requests are queued ahead of it. Main tells the run host so (`approval.queued`), which then stops bounding
   * the wait for `approval.shown`. Otherwise a request left queued past that bound was denied unshown.
   */
  enqueueApproval(senderId: number, approval: TApproval): boolean {
    const record = this.#liveRecord(senderId);
    if (!record) return false;
    const waits = record.openDialog !== null || record.approvals.length > 0;
    record.approvals.push(approval);
    return waits;
  }

  approvalQueue(senderId: number): readonly TApproval[] {
    return this.#liveRecord(senderId)?.approvals ?? [];
  }

  takeApproval(senderId: number, compare: (left: TApproval, right: TApproval) => number): TApproval | undefined {
    const record = this.#liveRecord(senderId);
    if (!record) return undefined;
    record.approvals.sort(compare);
    return record.approvals.shift();
  }

  removeApproval(predicate: (approval: TApproval) => boolean): void {
    for (const record of this.#records.values()) {
      const index = record.approvals.findIndex(predicate);
      if (index >= 0) record.approvals.splice(index, 1);
    }
  }

  openDialog(senderId: number): TDialog | null {
    return this.#liveRecord(senderId)?.openDialog ?? null;
  }

  setOpenDialog(senderId: number, dialog: TDialog | null): void {
    const record = this.#liveRecord(senderId);
    if (record) record.openDialog = dialog;
  }

  forEach(visitor: (window: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>) => void): void {
    for (const record of this.#records.values()) if (!this.dependencies.adapter.isDestroyed(record.win)) visitor(this.#view(record));
  }

  async open(senderId: number, workspace: string): Promise<{ readonly workspaceId: string; readonly storeFile: string } | undefined> {
    const record = this.#liveRecord(senderId);
    if (!record) return undefined;
    const opening = this.dependencies.openWorkspace(workspace, this.#view(record));
    record.workspaceReady = opening.catch(() => undefined);
    let opened: Awaited<typeof opening>;
    try {
      opened = await opening;
    } finally {
      // A waiter that read the build-time readiness (a reach, a view's start-time read) is released whatever the outcome.
      record.settleReady();
    }
    if (opened) {
      record.workspace = workspace;
      record.workspaceId = opened.workspaceId;
      if (!this.dependencies.adapter.isDestroyed(record.win)) this.dependencies.workspaceOpened?.(this.#view(record));
    }
    return opened;
  }

  async awaitWorkspace(senderId: number): Promise<void> {
    const record = this.#liveRecord(senderId);
    if (!record) return;
    let timeout: MainWindowTimer | undefined;
    const timedOut = new Promise<void>((resolve) => { timeout = this.dependencies.timers.after(30_000, resolve); });
    await Promise.race([record.workspaceReady, timedOut]);
    timeout?.cancel();
  }

  resolveStartup(explicitWorkspace?: string): { readonly workspace: string; readonly prompt: boolean; readonly persist: boolean } {
    if (explicitWorkspace) return { workspace: this.dependencies.canonicalPath(explicitWorkspace), prompt: false, persist: true };
    const remembered = this.dependencies.rememberedWorkspace();
    if (remembered) {
      if (this.dependencies.isDirectory(remembered)) return { workspace: this.dependencies.canonicalPath(remembered), prompt: false, persist: false };
      this.dependencies.log(`the remembered workspace ${remembered} cannot be opened; leaving the stored value alone (REQ-WORKSPACE-007)`);
    }
    return { workspace: this.dependencies.canonicalPath(this.dependencies.currentDirectory()), prompt: true, persist: false };
  }

  async launch(explicitWorkspace?: string, origin: MainWindowOrigin = 'launch'): Promise<MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>> {
    const startup = this.resolveStartup(explicitWorkspace);
    const built = await this.build({ workspace: startup.workspace, origin });
    await this.open(built.wcId, startup.workspace);
    if (startup.persist) await this.dependencies.persistWorkspace(startup.workspace);
    if (startup.prompt) this.deferProjectOffer(built.wcId, 650);
    return this.forSender(built.wcId)!;
  }

  deferProjectOffer(senderId: number, delayMs: number): void {
    const record = this.#liveRecord(senderId);
    if (!record) return;
    record.deferredOffer?.cancel();
    record.deferredOffer = this.dependencies.timers.after(delayMs, () => {
      record.deferredOffer = null;
      if (record.questionAnswered || this.dependencies.adapter.isDestroyed(record.win)) {
        this.dependencies.log(`the first-launch project chooser for window ${record.wcId} was abandoned unshown (REQ-SHELL-011)`);
        return;
      }
      this.dependencies.log(`offering the first-launch project chooser for window ${record.wcId}`);
      void this.choose(record.wcId, { newWindow: false });
    });
  }

  async choose(senderId: number, options: { readonly newWindow: boolean }): Promise<CommandOutcome> {
    const requester = this.#liveRecord(senderId);
    if (!requester) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
    requester.questionAnswered = true;
    requester.deferredOffer?.cancel();
    requester.deferredOffer = null;

    if (!options.newWindow) {
      const gated = await this.#workspaceOpenGates(requester);
      if (!gated.ok) return gated.outcome;
    }
    const chosen = await this.dependencies.chooseProjectFolder(
      requester.win,
      requester.workspace === '(no workspace)' ? undefined : requester.workspace,
    );
    if (chosen === null) {
      this.dependencies.raiseTransient(
        requester.wcId,
        'info',
        'Open a project folder when you\'re ready by selecting the workspace path in the title bar.',
      );
      return { ok: true, value: { cancelled: true } };
    }
    const holder = this.#windowHolding(chosen);
    if (holder?.wcId === requester.wcId) return this.#offerNewSession(requester, chosen);
    if (holder) {
      this.dependencies.log(`the chosen folder ${chosen} is already open in window ${holder.wcId}; surfacing it and building nothing (REQ-STARTUP-163)`);
      this.#surface(holder);
      return { ok: true, value: { unchanged: true, workspace: holder.workspace, surfaced: holder.wcId } };
    }
    return options.newWindow
      ? this.#addWindow(requester, chosen, 'open-request')
      : this.#replace(requester, chosen);
  }

  async handOver(handOver: HandOver): Promise<void> {
    const workspace = handOver.workspace === undefined ? undefined : this.dependencies.canonicalPath(handOver.workspace);
    if (workspace) {
      const holder = this.#windowHolding(workspace);
      if (holder) {
        this.#surface(holder);
        this.dependencies.log(`hand-over surfaced window ${holder.wcId} for ${workspace} (REQ-STARTUP-162/163)`);
        return;
      }
      const active = this.#activeRecord();
      if (active) {
        await this.#addWindow(active, workspace, 'hand-over');
        return;
      }
      await this.launch(workspace, 'hand-over');
      return;
    }
    const active = this.#activeRecord();
    if (active) {
      this.#surface(active);
      this.dependencies.log(`hand-over surfaced window ${active.wcId} (REQ-STARTUP-162)`);
      return;
    }
    await this.launch(undefined, 'hand-over');
  }

  /**
   * ESC-34 / REQ-NOTIFY-044: a notice action naming a workspace reaches THAT workspace "without asking the user anything
   * further". Notices are application-wide (every main window shows the one slot), so the action may be activated in a
   * window holding another workspace, or after the window that raised it switched away. The window holding the workspace
   * is surfaced (REQ-STARTUP-163's rule, as the chooser and the hand-over take it); where none holds it, a window is added
   * for it on PD-SHELL-001's add route — no gate evaluated and no window closed, so nothing is asked and nothing the user
   * has open is lost. Replacing the activating window instead would run REQ-SHELL-021's gates, whose unsaved-settings
   * guard asks. That is PD-SHELL-001 revision 2's reach (OQ-267, ruled 2026-10-13 under R-072), which binds every
   * REQ-NOTIFY-044 member naming a workspace; the project-setup action takes `surfaceHolding` instead (PD-WORKSPACE-005
   * revision 2, OQ-262), and which of the two governs that member for a workspace no window holds is OQ-294.
   */
  async reach(workspace: string): Promise<
    | { readonly ok: true; readonly window: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>; readonly added: boolean }
    | { readonly ok: false; readonly outcome: CommandOutcome }
  > {
    const target = this.dependencies.canonicalPath(workspace);
    const holder = this.#windowHolding(target);
    if (holder) {
      this.#surface(holder);
      this.dependencies.log(`notice action reached ${target}: surfaced window ${holder.wcId} (ESC-34, REQ-STARTUP-163)`);
      if (holder.workspaceId === undefined) {
        /*
         * The holder names the workspace from `build`, but its open has not settled — a second press while the window the
         * first press added is still loading. The action acts on the workspace (REQ-NOTIFY-044), so it waits, bounded, for the
         * open rather than answering with no workspace id; an open that failed destroyed the window, and the press is refused
         * (the failure was already reported under REQ-SHELL-019). Until 2026-10-14 it answered at once, and the hook review
         * said "Open a workspace before reviewing its hooks"
         * (docs/defects/fixed/a-notice-action-reaching-a-window-still-opening-its-workspace-is-refused.md).
         */
        this.dependencies.log(`notice action reached ${target}: window ${holder.wcId} is still opening it; waiting for the open`);
        await this.awaitWorkspace(holder.wcId);
        if (this.#liveRecord(holder.wcId) === undefined || holder.workspaceId === undefined) {
          return { ok: false, outcome: { ok: false, code: 'workspace.openFailed', headline: `Could not open the selected project: ${target} could not be opened as a workspace.` } };
        }
      }
      return { ok: true, window: this.#view(holder), added: false };
    }
    const requester = this.#activeRecord();
    if (!requester) return { ok: false, outcome: { ok: false, code: 'window.notMain', headline: 'No main window is open' } };
    const outcome = await this.#addWindow(requester, target, 'open-request');
    const wcId = outcome.ok ? (outcome.value as { wcId?: number } | undefined)?.wcId : undefined;
    const added = wcId === undefined ? undefined : this.#liveRecord(wcId);
    if (!added) return { ok: false, outcome };
    this.dependencies.log(`notice action reached ${target}: added window ${added.wcId} for it (ESC-34, PD-SHELL-001)`);
    return { ok: true, window: this.#view(added), added: true };
  }

  /**
   * PD-WORKSPACE-005 revision 2 (OQ-262, ruled 2026-10-13 under R-072): a project-setup banner's `open-project-init` action
   * surfaces the main window holding the named workspace — REQ-STARTUP-163's rule for which window that is, surfaced on
   * REQ-SHELL-161's terms (restored if minimised, shown, focused) — and hands back its view. Where no window holds it, nothing
   * is surfaced and nothing is built: the ruling has the activating window say so instead (`projectInit.open`). Unlike `reach`,
   * this never adds a window.
   */
  surfaceHolding(workspace: string): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    const holder = this.#windowHolding(this.dependencies.canonicalPath(workspace));
    if (!holder) return undefined;
    this.#surface(holder);
    return this.#view(holder);
  }

  /**
   * PD-SHELL-001 revision 3 (OQ-292): ask the main window `wcId` to focus `sessionId` through its own load (channel 16). Sent
   * at once to a renderer listening for it; held for one still loading — a window the reach added — until `sessionFocusReady`.
   */
  focusSession(wcId: number, sessionId: string): WindowRequestOutcome {
    return this.#request(wcId, { kind: 'session-focus', sessionId });
  }

  /** The main window `wcId`'s renderer listens on channel 16 from now on: the session focus held for it, delivered once, or null. */
  sessionFocusReady(wcId: number): string | null {
    const held = this.#ready(wcId, 'session-focus');
    return held?.kind === 'session-focus' ? held.sessionId : null;
  }

  /**
   * PD-WORKSPACE-005 revision 3 (OQ-294): ask the main window `wcId` to open Settings › Project (channel 15). Sent at once to a
   * renderer listening for it; held for one still loading until `projectInitReady`. A second press while held sets nothing new.
   */
  openProjectInit(wcId: number): WindowRequestOutcome {
    return this.#request(wcId, { kind: 'project-init' });
  }

  /** The main window `wcId`'s renderer listens on channel 15 from now on; true when an open was held for it (delivered once). */
  projectInitReady(wcId: number): boolean {
    return this.#ready(wcId, 'project-init') !== undefined;
  }

  dispose(): void {
    for (const record of [...this.#records.values()]) {
      record.deferredOffer?.cancel();
      if (!this.dependencies.adapter.isDestroyed(record.win)) this.dependencies.adapter.destroy(record.win);
      else this.#forget(record.wcId);
    }
  }

  async #addWindow(
    requester: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>,
    chosen: string,
    origin: 'open-request' | 'hand-over',
  ): Promise<CommandOutcome> {
    let added: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>;
    try {
      added = await this.build({ workspace: chosen, origin });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.dependencies.reportFailure(requester.wcId, `Could not open the selected project: ${reason}`, 'window');
      return { ok: false, code: 'workspace.buildFailed', headline: `Could not open the selected project: ${reason}` };
    }
    const opened = await this.open(added.wcId, chosen).catch(() => undefined);
    if (!opened) {
      const reason = `${chosen} could not be opened as a workspace.`;
      this.dependencies.reportFailure(requester.wcId, `Could not open the selected project: ${reason}`, 'window');
      const record = this.#liveRecord(added.wcId);
      if (record) this.dependencies.adapter.destroy(record.win);
      return { ok: false, code: 'workspace.openFailed', headline: `Could not open the selected project: ${reason}` };
    }
    const record = this.#liveRecord(added.wcId)!;
    this.#surface(record);
    await this.dependencies.persistWorkspace(chosen);
    this.dependencies.log(`added main window ${record.wcId} on ${chosen}; ${this.#records.size} main windows open (PD-SHELL-001)`);
    return { ok: true, value: { workspace: chosen, wcId: record.wcId, added: true } };
  }

  async #replace(
    outgoing: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>,
    chosen: string,
  ): Promise<CommandOutcome> {
    let replacement: MainWindowView<TWindow, TPersonaWindows, TTerminalWindows>;
    try {
      replacement = await this.build({ workspace: chosen, origin: 'open-request' });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.dependencies.reportFailure(outgoing.wcId, `Could not open the selected project: ${reason}`, 'application');
      return { ok: false, code: 'workspace.buildFailed', headline: `Could not open the selected project: ${reason}` };
    }
    const opened = await this.open(replacement.wcId, chosen).catch(() => undefined);
    if (!opened) {
      const reason = `${chosen} could not be opened as a workspace.`;
      this.dependencies.reportFailure(outgoing.wcId, `Could not open the selected project: ${reason}`, 'application');
      const record = this.#liveRecord(replacement.wcId);
      if (record) this.dependencies.adapter.destroy(record.win);
      return { ok: false, code: 'workspace.openFailed', headline: `Could not open the selected project: ${reason}` };
    }
    const replacementRecord = this.#liveRecord(replacement.wcId)!;
    this.dependencies.adapter.show(replacementRecord.win);
    const closed = await this.dependencies.adapter.close(outgoing.win);
    if (!closed) {
      this.dependencies.log('the outgoing window vetoed its close; discarding the replacement and changing nothing (REQ-SHELL-018)');
      this.dependencies.adapter.destroy(replacementRecord.win);
      return { ok: true, value: { cancelled: true, vetoed: true } };
    }
    await this.dependencies.persistWorkspace(chosen);
    if (!this.dependencies.adapter.isDestroyed(replacementRecord.win)) this.dependencies.adapter.focus(replacementRecord.win);
    this.dependencies.log(`workspace switched to ${chosen} in window ${replacementRecord.wcId} (REQ-SHELL-017)`);
    return { ok: true, value: { workspace: chosen, wcId: replacementRecord.wcId } };
  }

  #offerNewSession(
    requester: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>,
    chosen: string,
  ): CommandOutcome {
    this.dependencies.log(`the chosen folder ${chosen} is already open in window ${requester.wcId}; offering a new session (PD-WORKSPACE-001)`);
    this.dependencies.raiseTransient(
      requester.wcId,
      'info',
      'That project folder is already open in this window.',
      undefined,
      { kind: 'start-session', label: 'Start a new session' },
    );
    return { ok: true, value: { unchanged: true, workspace: requester.workspace, offered: 'start-session' } };
  }

  async #workspaceOpenGates(
    requester: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>,
  ): Promise<WorkspaceGate> {
    if (!await this.dependencies.closeGuard(this.#view(requester))) {
      this.dependencies.log('workspace open ended by the unsaved-settings guard (REQ-SHELL-021 gate 1)');
      return { ok: false, outcome: { ok: true, value: { cancelled: true } } };
    }
    if (requester.workspaceId) {
      const count = await this.dependencies.activeRunCount(requester.workspaceId);
      if (count !== null && count > 0) {
        const headline = 'Finish the active run before opening another project.';
        this.dependencies.raiseTransient(requester.wcId, 'fail', headline);
        this.dependencies.log(`workspace open declined: ${headline} (REQ-SHELL-021 gate 3)`);
        return { ok: false, outcome: { ok: true, value: { cancelled: true, declined: headline } } };
      }
    }
    return { ok: true };
  }

  #request(wcId: number, request: WindowRequest): WindowRequestOutcome {
    const record = this.#liveRecord(wcId);
    if (!record) return 'gone';
    if (record.listening.has(request.kind) && this.dependencies.deliver) {
      this.dependencies.deliver(this.#view(record), request);
      return 'sent';
    }
    record.pending.set(request.kind, request);
    this.dependencies.log(`window ${wcId} is not listening for ${request.kind} yet; the request is held until its renderer is ready`);
    return 'held';
  }

  #ready(wcId: number, kind: WindowRequestKind): WindowRequest | undefined {
    const record = this.#liveRecord(wcId);
    if (!record) return undefined;
    record.listening.add(kind);
    const held = record.pending.get(kind);
    record.pending.delete(kind);
    if (held) this.dependencies.log(`window ${wcId} is ready for ${kind}; the held request is delivered`);
    return held;
  }

  #windowHolding(workspace: string): WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog> | undefined {
    for (const record of this.#records.values()) {
      if (this.dependencies.adapter.isDestroyed(record.win) || record.workspace === '(no workspace)') continue;
      if (this.dependencies.samePath(workspace, record.workspace)) return record;
    }
    return undefined;
  }

  #surface(record: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>): void {
    if (this.dependencies.adapter.isDestroyed(record.win)) return;
    if (this.dependencies.adapter.isMinimized(record.win)) this.dependencies.adapter.restore(record.win);
    this.dependencies.adapter.show(record.win);
    this.dependencies.adapter.focus(record.win);
  }

  #activeRecord(): WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog> | undefined {
    const active = this.active();
    return active ? this.#liveRecord(active.wcId) : undefined;
  }

  #live(senderId: number): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> | undefined {
    const record = this.#liveRecord(senderId);
    return record ? this.#view(record) : undefined;
  }

  #liveRecord(senderId: number): WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog> | undefined {
    const record = this.#records.get(senderId);
    return record && !this.dependencies.adapter.isDestroyed(record.win) ? record : undefined;
  }

  #view(record: WindowRecord<TWindow, TPersonaWindows, TTerminalWindows, TApproval, TDialog>): MainWindowView<TWindow, TPersonaWindows, TTerminalWindows> {
    const lookup = (wcId: number) => this.#records.get(wcId);
    return {
      win: record.win,
      wcId: record.wcId,
      get workspace() { return lookup(record.wcId)?.workspace ?? record.workspace; },
      get workspaceId() { return lookup(record.wcId)?.workspaceId; },
      get followedSessionId() { return lookup(record.wcId)?.followedSessionId ?? null; },
      personaWindows: record.personaWindows,
      terminalWindows: record.terminalWindows,
    };
  }

  #rememberFocus(id: number): void {
    const index = this.#focusOrder.indexOf(id);
    if (index >= 0) this.#focusOrder.splice(index, 1);
    this.#focusOrder.unshift(id);
  }

  #forget(id: number): void {
    const record = this.#records.get(id);
    if (!record) return;
    record.deferredOffer?.cancel();
    record.settleReady();
    this.#records.delete(id);
    const index = this.#focusOrder.indexOf(id);
    if (index >= 0) this.#focusOrder.splice(index, 1);
    this.dependencies.adapter.disposeResources(record.win, record.wcId, record.personaWindows, record.terminalWindows);
    const unshown = record.approvals.splice(0);
    if (unshown.length > 0) this.dependencies.unshownApprovals?.(unshown);
    if (record.workspace !== '(no workspace)' && this.#windowHolding(record.workspace) === undefined) this.dependencies.workspaceClosed?.(record.workspace);
  }
}

export interface ElectronMainWindowAdapterDependencies {
  readonly createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly themeBackground: () => string;
  readonly capturing: boolean;
  readonly timers: { readonly after: (delayMs: number, callback: () => void) => MainWindowTimer };
  readonly loadMainWindow: (win: BrowserWindow) => Promise<void>;
  readonly loadPersonaWindow: (win: BrowserWindow, persona: string) => Promise<void>;
  readonly loadTerminalWindow: (win: BrowserWindow) => Promise<void>;
  readonly relayAttach: (win: BrowserWindow) => void;
  readonly relayDetach: (wcId: number) => void;
  readonly registerPresenter: (wcId: number) => void;
  readonly revokePresenter: (wcId: number) => void;
  readonly forgetTerminalFrames: (wcId: number) => void;
  /** A main window's close was confirmed and is now under way: what an application quit is recognised by (`exit.ts`). */
  readonly closeConfirmed?: ((wcId: number) => void) | undefined;
  /** REQ-STARTUP-046 / REQ-SHELL-119 guard 3: a person's close of this window, asked once the renderer's guard allows. */
  readonly confirmRunsAtClose?: ((wcId: number, win: BrowserWindow) => Promise<boolean>) | undefined;
  /** Each main window's close guard as it is built, and `null` once the window has closed. */
  readonly closeGuard?: ((wcId: number, guard: CloseGuard | null) => void) | undefined;
  readonly log: (message: string) => void;
}

/** PD-SHELL-003: auto-hide is not removal — null is what suppresses Electron's default app menu on every host. */
export function removeApplicationMenu(menu: { setApplicationMenu: (value: null) => void }): void {
  menu.setApplicationMenu(null);
}

/** PD-SHELL-003: only the main window replaces the host frame, consistently on every supported desktop. */
export function mainWindowOptions(backgroundColor: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor,
    title: 'Rotaris',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  };
}

/** The part of a main window its close guard needs. */
export interface GuardedWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown;
  isDestroyed(): boolean;
  close(): void;
}

/** A main window's close guard, as the application's quit drives it (`exit.ts`, `closeThroughGuards`). */
export interface CloseGuard {
  /** Asks the renderer's guard; a guard that cannot answer allows. Nothing closes. */
  ask(): Promise<boolean>;
  /** Marks the close as confirmed and reports it; the next close of the window passes. */
  confirm(): void;
  close(): void;
}

/**
 * The main window's close guard. The first close is held while the renderer's guard is asked; a close it allows — or
 * one it cannot answer — is reported as confirmed and then made, and that second close passes. Reporting before closing
 * is what lets main tell the application's quit from a person closing a dialog (PD-ORCH-005 clause 9, `exit.ts`): the
 * window's modal dialogs close as the window does, after the report. The guard is returned so the application's quit
 * can ask every window's guard before confirming any.
 *
 * A person's close asks REQ-SHELL-119's guards in their order: the renderer's (unsaved settings, guard 1), then, once
 * that allows, `confirmRuns` (the active-run confirmation, guard 3; REQ-STARTUP-046, `close-confirmation.ts`), which
 * declines when it cannot answer. A declined close changes nothing. A close attempted while the guards are still being
 * asked is held and adds no second question. The application's quit asks `ask` alone (`closeThroughGuards`): it is not
 * a person's close of the window (PD-SHELL-009). Under PD-SHELL-009 a `confirmRuns` that allows the close of one of several
 * windows has already stopped the window's own runs, so the stop precedes `confirmed` and the presenter's revoke.
 */
export function guardClose(win: GuardedWindow, ask: () => Promise<unknown>, confirmed: () => void, confirmRuns?: () => Promise<boolean>): CloseGuard {
  let closeConfirmed = false;
  let asking = false;
  const guard: CloseGuard = {
    ask: () => ask().then((proceed) => proceed !== false, () => true),
    confirm: () => { if (closeConfirmed) return; closeConfirmed = true; confirmed(); },
    close: () => { if (!win.isDestroyed()) win.close(); },
  };
  win.on('close', (event) => {
    if (closeConfirmed || win.isDestroyed()) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    void guard.ask()
      .then((allowed) => (allowed && confirmRuns ? confirmRuns().catch(() => false) : allowed))
      .then((allowed) => { asking = false; if (allowed) { guard.confirm(); guard.close(); } });
  });
  return guard;
}

/** The renderer's own guard, asked through `executeJavaScript` (the renderer's unsaved-settings guard, REQ-SHELL-119 guard 1). */
export const RENDERER_CLOSE_GUARD_SCRIPT = 'typeof window.__rotarisCloseGuard === "function" ? window.__rotarisCloseGuard() : true';

/** The part of a main window's `webContents` its close guard's question needs. */
export interface GuardedContents {
  executeJavaScript(code: string): Promise<unknown>;
  isCrashed(): boolean;
  isDestroyed(): boolean;
  once(event: 'render-process-gone', listener: () => void): unknown;
  once(event: 'destroyed', listener: () => void): unknown;
  removeListener(event: 'render-process-gone', listener: () => void): unknown;
  removeListener(event: 'destroyed', listener: () => void): unknown;
}

/**
 * Asks a main window's renderer its close guard. A renderer that is gone cannot answer, and a guard that cannot answer
 * allows (`guardClose`), so the question rejects: at once when the renderer has crashed or its contents are destroyed, and
 * the moment either happens while the question is out. Electron's `executeJavaScript` on a renderer that is gone neither
 * resolves nor rejects ("Render frame was disposed before WebFrameMain could be accessed"), so until 2026-10-14 the
 * question asked of a crashed renderer never answered, and a person's close of its window and the application's quit
 * (`closeThroughGuards`) waited on it with no bound
 * (`docs/defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`). A live renderer is
 * waited for without a bound of its own: its guard may be a person's decision (REQ-SHELL-119).
 */
export function askRendererGuard(contents: GuardedContents): Promise<unknown> {
  if (contents.isDestroyed() || contents.isCrashed()) return Promise.reject(new Error('the renderer is gone'));
  return new Promise<unknown>((resolve, reject) => {
    const gone = (): void => { stop(); reject(new Error('the renderer went while its close guard was asked')); };
    const stop = (): void => { contents.removeListener('render-process-gone', gone); contents.removeListener('destroyed', gone); };
    contents.once('render-process-gone', gone);
    contents.once('destroyed', gone);
    let asked: Promise<unknown>;
    try { asked = contents.executeJavaScript(RENDERER_CLOSE_GUARD_SCRIPT); } catch (error) { asked = Promise.reject(error); }
    asked.then((answer) => { stop(); resolve(answer); }, (error: unknown) => { stop(); reject(error); });
  });
}

/** Electron's concrete half of the lifecycle seam. Tests use an in-memory adapter with the same ordering. */
export function createElectronMainWindowAdapter(
  dependencies: ElectronMainWindowAdapterDependencies,
): MainWindowAdapter<BrowserWindow, PersonaWindows, TerminalWindows> {
  const createChildWindow = (options: BrowserWindowConstructorOptions): BrowserWindow => {
    const win = dependencies.createWindow(options);
    win.setMenuBarVisibility(false);
    if (dependencies.capturing) win.webContents.setBackgroundThrottling(false);
    return win;
  };

  return {
    create: async ({ workspace, origin }) => {
      const win = dependencies.createWindow(mainWindowOptions(dependencies.themeBackground()));
      win.setMenuBarVisibility(false);
      const wcId = win.webContents.id;
      if (dependencies.capturing) win.webContents.setBackgroundThrottling(false);
      dependencies.relayAttach(win);
      dependencies.registerPresenter(wcId);

      const personaWindows = new PersonaWindows({
        create: (persona) => createChildWindow({
          width: 820,
          height: 620,
          minWidth: 560,
          minHeight: 420,
          show: false,
          title: `Rotaris · ${persona}`,
          backgroundColor: dependencies.themeBackground(),
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        }),
        load: dependencies.loadPersonaWindow,
        select: (personaWin, agentId, focusSteer) => personaWin.webContents
          .executeJavaScript(`typeof window.__rotarisPersonaSelect === 'function' ? window.__rotarisPersonaSelect(${JSON.stringify(agentId)}, ${focusSteer ? 'true' : 'false'}) : false`)
          .then(() => undefined),
        onCreated: (personaWin, persona) => {
          dependencies.relayAttach(personaWin);
          if (dependencies.capturing) onConsoleWarning(personaWin.webContents, ({ message, sourceId, lineNumber }) => dependencies.log(`capture: persona "${persona}" renderer console: ${message} (${sourceId}:${lineNumber})`));
        },
        onDestroyed: dependencies.relayDetach,
        log: dependencies.log,
      });

      const releaseModality = (why: string): void => {
        if (!personaWindows.isFamilyModal()) return;
        const count = personaWindows.setFamilyModal(false);
        dependencies.log(`application modality released: ${why} (${count} persona window(s) enabled; ADR-0048)`);
      };
      win.webContents.on('did-start-navigation', (details) => {
        if (details.isMainFrame) releaseModality('the main window navigated');
      });
      win.webContents.on('render-process-gone', (_event, details) => {
        releaseModality(`the main window's renderer is gone (${details.reason})`);
        // The renderer is gone but the window is not closed, so `disposeResources` never runs:
        // shed the dead sink now so the next publication does not throw on a disposed frame
        // (REQ-MONITOR-226's intent on the delivery path — drop the vanished view, keep the run).
        dependencies.relayDetach(wcId);
        dependencies.forgetTerminalFrames(wcId);
        dependencies.log(`main window ${wcId} detached from the relay: the renderer is gone (${details.reason})`);
      });

      const terminalWindows = new TerminalWindows({
        create: () => createChildWindow({
          width: 900,
          height: 620,
          minWidth: 560,
          minHeight: 360,
          show: false,
          title: 'Rotaris · Terminal',
          backgroundColor: dependencies.themeBackground(),
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        }),
        load: dependencies.loadTerminalWindow,
        focusStream: (terminalWin, streamId) => terminalWin.webContents
          .executeJavaScript(`typeof window.__rotarisTerminalFocus === 'function' ? window.__rotarisTerminalFocus(${JSON.stringify(streamId)}) : false`)
          .then(() => undefined),
        onCreated: dependencies.relayAttach,
        onDestroyed: (id) => {
          dependencies.relayDetach(id);
          dependencies.forgetTerminalFrames(id);
        },
        log: dependencies.log,
      });

      const guard = guardClose(
        win,
        () => askRendererGuard(win.webContents),
        () => dependencies.closeConfirmed?.(wcId),
        dependencies.confirmRunsAtClose === undefined ? undefined : () => dependencies.confirmRunsAtClose!(wcId, win),
      );
      dependencies.closeGuard?.(wcId, guard);
      win.once('closed', () => dependencies.closeGuard?.(wcId, null));
      win.once('ready-to-show', () => win.show());

      if (__ROTARIS_SEAMS__ && dependencies.capturing && process.env['ROTARIS_CAPTURE_NET'] === '1') {
        win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
          dependencies.log(`capture: net ${details.method} ${details.resourceType} ${details.url}`);
          callback({});
        });
      }
      return {
        win,
        wcId,
        personaWindows,
        terminalWindows,
        load: async () => {
          await dependencies.loadMainWindow(win);
          dependencies.log(`main window ${wcId} loaded for ${workspace} (origin ${origin})`);
        },
      };
    },
    isDestroyed: (win) => win.isDestroyed(),
    isMinimized: (win) => win.isMinimized(),
    isVisible: (win) => win.isVisible(),
    show: (win) => win.show(),
    focus: (win) => win.focus(),
    restore: (win) => win.restore(),
    close: (win) => new Promise<boolean>((resolve) => {
      if (win.isDestroyed()) { resolve(true); return; }
      let settled = false;
      const timeout = dependencies.timers.after(30_000, () => {
        if (settled) return;
        settled = true;
        resolve(win.isDestroyed());
      });
      win.once('closed', () => {
        if (settled) return;
        settled = true;
        timeout.cancel();
        resolve(true);
      });
      win.close();
    }),
    destroy: (win) => win.destroy(),
    onFocus: (win, listener) => { win.on('focus', listener); },
    onClosed: (win, listener) => { win.on('closed', listener); },
    // The window's own `show` event: fired by the `ready-to-show` show above and by `#replace`'s explicit show alike, once.
    onShown: (win, listener) => { win.once('show', listener); },
    ownsAuxiliary: (personaWindows, terminalWindows, senderId) => Boolean(
      personaWindows.bySender(senderId) ?? terminalWindows.bySender(senderId),
    ),
    disposeResources: (_win, _wcId, personaWindows, terminalWindows) => {
      personaWindows.destroyAll('the main window closed');
      terminalWindows.destroyWithOwner();
      dependencies.relayDetach(_wcId);
      dependencies.revokePresenter(_wcId);
    },
  };
}

export interface ElectronProjectFolderChooserDependencies {
  readonly forcedAnswers?: string | undefined;
  readonly homeDirectory: () => string;
  readonly canonicalPath: (path: string) => string;
  readonly showOpenDialog: (parent: BrowserWindow, options: OpenDialogOptions) => Promise<{ readonly canceled: boolean; readonly filePaths: string[] }>;
  readonly log: (message: string) => void;
}

/** REQ-WORKSPACE-009 / REQ-SHELL-164: one asynchronous native directory chooser, including its proof queue. */
export function createElectronProjectFolderChooser(dependencies: ElectronProjectFolderChooserDependencies) {
  const answers = (dependencies.forcedAnswers ?? '').split(';;').filter((answer) => answer !== '');
  return async (parent: BrowserWindow, startAt: string | undefined): Promise<string | null> => {
    if (answers.length > 0) {
      const answer = answers.length > 1 ? answers.shift()! : answers[0]!;
      dependencies.log(`capture: project folder chooser → ${answer}`);
      return answer === '(cancel)' ? null : dependencies.canonicalPath(answer);
    }
    const result = await dependencies.showOpenDialog(parent, {
      title: 'Open a project folder',
      properties: ['openDirectory'],
      defaultPath: startAt ?? dependencies.homeDirectory(),
    });
    return result.canceled || result.filePaths.length === 0 ? null : dependencies.canonicalPath(result.filePaths[0]!);
  };
}