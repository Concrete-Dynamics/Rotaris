import type { BrowserWindow } from 'electron';

/**
 * ADR-0048's window registry, first executed (Part R): per main window, the persona windows — at most one per
 * persona (REQ-SHELL-072), created on first request and REUSED after, titled `Rotaris · {persona}`, 820×620 by
 * default; a close HIDES the window (REQ-SHELL-076, REQ-MONITOR-073 — the `close` event is intercepted and the window
 * hidden, so reopening is immediate and the renderer's own hide handling cancels its timers, the zero-work rule);
 * every persona window is destroyed when its main window closes and when a new session starts (REQ-SHELL-078).
 *
 * A show/raise/activate is a REQUEST to the host window manager (REQ-SHELL-161): `show()` then `focus()` are
 * called once, nothing is retried, no error is raised and no notification appears whatever the manager did, and
 * no focus is taken in compensation. On Windows, Electron's `focus()` on a window another application holds the
 * foreground of ends as a taskbar flash (the platform's own "attention" hint) rather than a foreground switch —
 * the outcome REQ-SHELL-161 names as supported; the window still exists, is not minimized (`restore()` when it
 * was) and is not hidden, which is what the requirement guarantees regardless of the answer.
 *
 * Application-modality across windows (ADR-0048's registry disabling input routing in every other window of the
 * family) was NOT built in Part R — no application-modal surface existed then — and IS built here since Part W, when
 * the command palette and the keyboard help (REQ-SHELL-051/054) became the first such surfaces: `setFamilyModal(true)`
 * disables input in every persona window of this main window (`BrowserWindow.setEnabled(false)` — the platform's
 * window-level input block; on Windows `EnableWindow(FALSE)`, so a click or a key aimed at the window is dropped by the
 * host before the renderer sees it) and `setFamilyModal(false)` restores it; a persona window created while the modal
 * is up is created disabled; the main window's navigation, reload, crash or close restores every window (the caller's
 * duty, `main/index.ts`). The palette proof observed the block with operating-system input, not injected events,
 * because injected events (`webContents.sendInputEvent`) bypass the host's block — ADR-0048's note records it.
 */
export interface PersonaWindowDeps {
  readonly create: (persona: string) => BrowserWindow;
  readonly load: (win: BrowserWindow, persona: string) => Promise<void>;
  /** Tell an existing window which instance to show (the renderer's `__rotarisPersonaSelect`). */
  readonly select: (win: BrowserWindow, agentId: string, focusSteer: boolean) => Promise<void>;
  readonly onCreated: (win: BrowserWindow, persona: string) => void;
  readonly onDestroyed: (wcId: number, persona: string) => void;
  readonly log: (message: string) => void;
}

export interface PersonaWindowEntry {
  readonly persona: string;
  readonly win: BrowserWindow;
  readonly wcId: number;
  /** The instance to select when the renderer next asks (boot, or a show after a hide). */
  pendingSelect: { agentId: string; focusSteer: boolean } | null;
  /** Set once the renderer booted and asked for its payload; before that a select is held, not pushed. */
  booted: boolean;
}

export class PersonaWindows {
  private readonly byPersona = new Map<string, PersonaWindowEntry>();
  private destroyingAll = false;
  private modal = false;

  constructor(private readonly deps: PersonaWindowDeps) {}

  /** For the persona window's own payload command: the entry by its webContents id. */
  bySender(wcId: number): PersonaWindowEntry | undefined {
    for (const e of this.byPersona.values()) if (e.wcId === wcId) return e;
    return undefined;
  }
  list(): { persona: string; title: string; visible: boolean; minimized: boolean; enabled: boolean; width: number; height: number; wcId: number }[] {
    return [...this.byPersona.values()].filter((e) => !e.win.isDestroyed()).map((e) => { const [width, height] = e.win.getSize(); return { persona: e.persona, title: e.win.getTitle(), visible: e.win.isVisible(), minimized: e.win.isMinimized(), enabled: e.win.isEnabled(), width: width ?? 0, height: height ?? 0, wcId: e.wcId }; });
  }

  /**
   * ADR-0048's application modality (Part W): while a main window's application-modal surface is open, every persona
   * window of the family takes no input; after, every one takes input again. Idempotent — a second `true` or a second
   * `false` changes nothing — so an open and a close always pair whatever the renderer's render order did.
   */
  setFamilyModal(active: boolean): number {
    this.modal = active;
    let n = 0;
    for (const e of this.byPersona.values()) if (!e.win.isDestroyed()) { e.win.setEnabled(!active); n += 1; }
    return n;
  }
  isFamilyModal(): boolean {
    return this.modal;
  }
  count(): number {
    return [...this.byPersona.values()].filter((e) => !e.win.isDestroyed()).length;
  }
  entry(persona: string): PersonaWindowEntry | undefined {
    const e = this.byPersona.get(persona);
    return e && !e.win.isDestroyed() ? e : undefined;
  }

  /**
   * REQ-SHELL-072: reuse the persona's window or create it, select the instance's tab, then show/raise/activate as a
   * request. Returns the entry; the caller has already checked the agent id (an unknown id never reaches here).
   */
  async open(persona: string, agentId: string, focusSteer: boolean): Promise<PersonaWindowEntry> {
    let entry = this.entry(persona);
    if (!entry) {
      const win = this.deps.create(persona);
      const wcId = win.webContents.id;
      entry = { persona, win, wcId, pendingSelect: { agentId, focusSteer }, booted: false };
      this.byPersona.set(persona, entry);
      // REQ-SHELL-076 / REQ-MONITOR-073: a user close hides; only the registry destroys (main window closed, new session).
      win.on('close', (event) => {
        if (this.destroyingAll || win.isDestroyed()) return;
        event.preventDefault();
        win.hide();
        this.deps.log(`persona window "${persona}" hidden on close (retained; REQ-SHELL-076)`);
      });
      win.on('closed', () => {
        if (this.byPersona.get(persona)?.wcId === wcId) this.byPersona.delete(persona);
        this.deps.onDestroyed(wcId, persona);
      });
      this.deps.onCreated(win, persona);
      // A persona window created while the main window's modal surface is up is created without input (ADR-0048).
      if (this.modal) win.setEnabled(false);
      await this.deps.load(win, persona);
      this.deps.log(`persona window "${persona}" created (${win.getTitle()}, ${win.getSize().join('×')}) for ${agentId}`);
    } else {
      entry.pendingSelect = { agentId, focusSteer };
      // A window already booted takes the selection at once; a hidden one re-reads its payload when shown (visibilitychange).
      if (entry.booted && entry.win.isVisible()) { await this.deps.select(entry.win, agentId, focusSteer).catch(() => undefined); entry.pendingSelect = null; }
      this.deps.log(`persona window "${persona}" reused for ${agentId}`);
    }
    const win = entry.win;
    // REQ-SHELL-161: one request each; whatever the window manager answers is accepted. Never retried, never reported.
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show(); else win.focus();
    return entry;
  }

  /** The renderer's boot or re-show asks: hand over the pending selection once. */
  takeSelection(wcId: number): { agentId: string; focusSteer: boolean } | null {
    const e = this.bySender(wcId);
    if (!e) return null;
    e.booted = true;
    const s = e.pendingSelect;
    e.pendingSelect = null;
    return s;
  }

  /** REQ-SHELL-078: every persona window goes with its main window and with a new session; the cache goes too. */
  destroyAll(reason: string): number {
    const entries = [...this.byPersona.values()];
    this.byPersona.clear();
    this.destroyingAll = true;
    let n = 0;
    try {
      for (const e of entries) if (!e.win.isDestroyed()) { e.win.destroy(); n += 1; }
    } finally {
      this.destroyingAll = false;
    }
    if (n > 0) this.deps.log(`${n} persona window(s) destroyed: ${reason} (REQ-SHELL-078)`);
    return n;
  }
}

// Part AL2 — the terminal window (REQ-SHELL-079..111; ADR-0021's and ADR-0047's window, first executed together here).
// ONE per main window (REQ-SHELL-081): a second request raises the existing window rather than opening another; the
// title is the renderer's (`document.title` from `terminalWindowTitle`, REQ-SHELL-081) and main seeds "Rotaris · Terminal";
// the initial size is 900×620. A close DESTROYS the window and the next open rebuilds it fresh (REQ-SHELL-086) — the
// deliberate difference from the persona window above, which hides (ADR-0047 consequence 3; the two are not unified). An
// automatic open (REQ-SHELL-109's auto-open and REQ-SHELL-110's reopen; REQ-SHELL-108's toolbar never is) shows the
// window WITHOUT taking keyboard focus (`showInactive`; REQ-SHELL-081, REQ-SHELL-161's last sentence); a user's open
// shows and focuses, as a request. The window goes with its main window and on the session changes REQ-SHELL-110/111
// name (`onSessionChange`), which the main window's renderer reports through `window.terminalSession`.
export interface TerminalWindowDeps {
  readonly create: () => BrowserWindow;
  readonly load: (win: BrowserWindow) => Promise<void>;
  /** Tell an open, booted window to bring a stream forward (the renderer's `__rotarisTerminalFocus`; REQ-SHELL-085). */
  readonly focusStream: (win: BrowserWindow, streamId: string) => Promise<void>;
  readonly onCreated: (win: BrowserWindow) => void;
  readonly onDestroyed: (wcId: number) => void;
  readonly log: (message: string) => void;
}

export interface TerminalWindowEntry {
  readonly win: BrowserWindow;
  readonly wcId: number;
  /** The stream to bring forward when the renderer next asks (its boot). */
  pendingFocus: string | null;
  /** Set once the renderer booted and took its payload; before that a focus request is held, not pushed. */
  booted: boolean;
  /** How it was opened — an automatic open never took focus (REQ-SHELL-081/109/110). */
  readonly automatic: boolean;
}

export class TerminalWindows {
  private entry: TerminalWindowEntry | null = null;
  /** The session the main window follows, as its renderer last reported it; null when none. */
  private sessionId: string | null = null;

  constructor(private readonly deps: TerminalWindowDeps) {}

  current(): TerminalWindowEntry | null {
    return this.entry && !this.entry.win.isDestroyed() ? this.entry : null;
  }
  isOpen(): boolean {
    return this.current() !== null;
  }
  /** For the terminal window's own payload command: the entry by its webContents id. */
  bySender(wcId: number): TerminalWindowEntry | null {
    const e = this.current();
    return e && e.wcId === wcId ? e : null;
  }
  followed(): string | null {
    return this.sessionId;
  }

  /**
   * REQ-SHELL-080/081/085: open the window or raise it; bring `streamId` forward when given. An `automatic` open shows the
   * window without focus (REQ-SHELL-109/110) and never raises an existing one — a stream changing while the window is
   * already open is not a request to raise it.
   */
  async open(options: { readonly automatic: boolean; readonly streamId?: string | null | undefined }): Promise<{ readonly reused: boolean }> {
    const existing = this.current();
    if (existing) {
      // REQ-SHELL-085: a booted window takes the stream at once; one still loading takes it from its payload.
      if (options.streamId) {
        if (existing.booted) await this.deps.focusStream(existing.win, options.streamId).catch(() => undefined);
        else existing.pendingFocus = options.streamId;
      }
      // REQ-SHELL-081 / REQ-SHELL-161: a second request raises the existing window — one request each, whatever the window
      // manager answers; nothing is retried and no focus is taken in compensation.
      if (!options.automatic) {
        if (existing.win.isMinimized()) existing.win.restore();
        if (!existing.win.isVisible()) existing.win.show(); else existing.win.focus();
      }
      this.deps.log(`terminal window ${options.automatic ? 'kept' : 'raised'}${options.streamId ? ` for ${options.streamId}` : ''} (REQ-SHELL-081)`);
      return { reused: true };
    }
    const win = this.deps.create();
    const wcId = win.webContents.id;
    const entry: TerminalWindowEntry = { win, wcId, pendingFocus: options.streamId ?? null, booted: false, automatic: options.automatic };
    this.entry = entry;
    win.on('closed', () => {
      if (this.entry?.wcId === wcId) this.entry = null;
      this.deps.onDestroyed(wcId);
      this.deps.log('terminal window closed; the next open rebuilds it fresh (REQ-SHELL-086)');
    });
    this.deps.onCreated(win);
    // Shown once the renderer can paint, so no frame exposes the platform surface; inactive when automatic — the one
    // place the difference between the two kinds of open is made.
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      if (options.automatic) win.showInactive(); else { win.show(); win.focus(); }
    });
    await this.deps.load(win);
    this.deps.log(`terminal window created (${options.automatic ? 'automatically, without focus' : 'by the user'}, ${win.getSize().join('×')}${options.streamId ? `, for ${options.streamId}` : ''})`);
    return { reused: false };
  }

  /** The renderer's boot asks: hand over the pending stream once and mark the window booted. */
  takeFocus(wcId: number): string | null {
    const e = this.bySender(wcId);
    if (!e) return null;
    e.booted = true;
    const s = e.pendingFocus;
    e.pendingFocus = null;
    return s;
  }

  /** REQ-SHELL-086/110/111: the window is destroyed, never hidden; the next open rebuilds it. */
  close(reason: string): boolean {
    const e = this.current();
    this.entry = null;
    if (!e) return false;
    e.win.destroy();
    this.deps.log(`terminal window destroyed: ${reason}`);
    return true;
  }

  /**
   * REQ-SHELL-110/111, as read here — the main window's renderer reports every change of the session it follows:
   *  - to NONE: the window closes and stays closed ("Focusing an empty session identifier leaves everything closed").
   *  - from one session to ANOTHER: the window closes and, when it had been open, reopens for the new session without
   *    taking focus ("a user who was watching a terminal does not silently lose the window").
   *  - from NONE to a session: the window closes and does NOT reopen. This is where REQ-SHELL-111's "starting a new
   *    session closes and discards the terminal window" and REQ-SHELL-110's reopen meet: with no session followed an
   *    open window can only have been on its empty state (no stream exists to retain, REQ-SHELL-104), so nothing was
   *    being watched, and 111's discard is the rule taken. A resume from no session reads the same way, the resumed
   *    session having no retained streams either (REQ-SHELL-104). Recorded as a reading in ADR-0021's note.
   * Returns whether the window was reopened.
   */
  async onSessionChange(sessionId: string | null): Promise<boolean> {
    const previous = this.sessionId;
    if (sessionId === previous) return false;
    this.sessionId = sessionId;
    const wasOpen = this.isOpen();
    if (wasOpen) this.close(sessionId === null ? 'the followed session was released (REQ-SHELL-110)' : previous === null ? 'a session started (REQ-SHELL-111)' : `session focus moved to ${sessionId} (REQ-SHELL-110)`);
    if (wasOpen && previous !== null && sessionId !== null) {
      await this.open({ automatic: true });
      return true;
    }
    return false;
  }

  /** REQ-SHELL-081's "per main window": the window does not outlive the main window that owns it. */
  destroyWithOwner(): void {
    this.close('the main window closed');
  }
}
