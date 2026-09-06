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
