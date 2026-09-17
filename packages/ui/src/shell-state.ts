import { create } from 'zustand';
import { isViewId, LIBRARY_TABS, STARTUP_VIEW, type AnalysisPass, type ViewId } from '@rotaris/contracts';

/**
 * Local-only interface state (ADR-0043, ADR-0057): the active view, and later
 * the scroll anchor, expansion map, composer text, search query, drawer
 * state. A SEPARATE store from the replica so a snapshot replacement cannot
 * clear it.
 *
 * REQ-SHELL-025: switching to an unknown view identifier is a silent no-op.
 * REQ-SHELL-026: the startup view is Overview.
 */
export interface ShellState {
  readonly activeView: ViewId;
  switchView(id: string): void;
  /** A category the Settings view should select next (a notice action, REQ-NOTIFY-223); consumed once. */
  readonly settingsCategory: string | null;
  openSettings(category: string): void;
  takeSettingsCategory(): void;
  /**
   * Part AS — ADR-0064 / REQ-WORKSPACE-106: the project setup dialog is a WINDOW-level surface, so its
   * open state lives here rather than inside a view; navigating away does not dismiss a decision the
   * product is waiting on. `auto` marks the one automatic opening a workspace open may make
   * (REQ-WORKSPACE-105); `manual` is whenever the user asked, and REQ-WORKSPACE-107 turns on the
   * difference — a manually opened dialog is never auto-closed.
   */
  readonly projectSetup: 'auto' | 'manual' | null;
  openProjectSetup(): void;
  autoOpenProjectSetup(): void;
  closeProjectSetup(): void;
  /**
   * REQ-LIBRARY-102 / REQ-SHELL-115 (Part X): a Library tab a notice action asked for, consumed once — the same
   * shape `settingsCategory` takes for REQ-NOTIFY-223. REQ-LIBRARY-103 closes the tab names and says activating
   * an unknown one is ignored, so `openLibrary` switches the view but records no tab it does not recognise.
   */
  readonly libraryTab: string | null;
  readonly libraryProposalId: string | null;
  openLibrary(tab: string, proposalId?: string): void;
  takeLibraryTab(): void;
  takeLibraryProposalId(): void;
  /** REQ-CONFIG-286/287: the unsaved-settings guard; asked before a view switch away from Settings while dirty. */
  readonly navigationGuard: ((next: ViewId) => Promise<boolean>) | null;
  setNavigationGuard(guard: ((next: ViewId) => Promise<boolean>) | null): void;
  /** REQ-SHELL-125: the accepted launch dialog's choices, held for the composer's NEXT submission and consumed by it. */
  readonly launchOptions: LaunchChoices | null;
  setLaunchOptions(options: LaunchChoices | null): void;
  takeLaunchOptions(): LaunchChoices | null;
  /** REQ-MONITOR-042 (Part R): ONE selected agent for every surface — the Workspace sidebar tree, the Overview card, Mission, the inspector; `run` names the run-level selection (REQ-MONITOR-274), null nothing. */
  readonly selectedAgentId: string | null;
  selectAgent(id: string | null): void;
  /** REQ-SHELL-051 / REQ-SHELL-054 (Part W): the two application-modal dialogs; at most one is open, the other closes first. */
  readonly paletteOpen: boolean;
  readonly helpOpen: boolean;
  openPalette(): void;
  closePalette(): void;
  openKeyboardHelp(): void;
  closeKeyboardHelp(): void;
  /** REQ-SHELL-049's Ctrl+Return: the composer registers its submit and whether its send control is enabled; null while unmounted. */
  readonly composer: ComposerRegistration | null;
  registerComposer(registration: ComposerRegistration | null): void;
  /**
   * REQ-SHELL-055's window-level Escape on the Workspace view, in its fixed order: the slash suggestion popup
   * (REQ-CHAT-002/026), then the transcript search panel, then both compact overlay drawers. Each surface registers a
   * closer that returns whether it closed anything; an unregistered slot is a surface that is not built, and is skipped.
   */
  readonly overlays: Readonly<Record<OverlayKind, OverlayCloser | null>>;
  registerOverlay(kind: OverlayKind, close: OverlayCloser | null): void;
  /**
   * REQ-CHAT-034 (ADR-0063): a counter the Settings Skills tab bumps after a rescan or a hand-loaded skill, so
   * the composer's catalogue lists **exactly** the rescanned set. It lives in this store because the two
   * surfaces are siblings in the view map — Settings replaces Workspace among REQ-SHELL-023's seven views —
   * and a counter is the smallest thing that can cross between them without one owning the other's data.
   *
   * It carries no payload by design: the composer re-reads the catalog itself, so a rescan and a hand-loaded
   * skill need no separate signal and nothing here can go stale against what the run host actually holds.
   */
  readonly skillsRevision: number;
  skillsChanged(): void;
  /**
   * REQ-LIBRARY-125/126 with PD-LIBRARY-002: whether an improvement analysis is running anywhere, and which
   * pass it is. It lives here because the two indicators that show it sit in two different surfaces — the
   * title bar and the workspace run header — and neither owns the other. The coordinator is
   * application-wide and runs one pass at a time, so "at least one session's analysis is in progress"
   * (REQ-LIBRARY-126) is exactly `active`, and shutdown's last publication clears it (REQ-LIBRARY-127).
   */
  readonly improvementAnalysis: ImprovementAnalysisActivity;
  setImprovementAnalysis(activity: ImprovementAnalysisActivity): void;
}

export interface ImprovementAnalysisActivity {
  readonly active: boolean;
  readonly pass: AnalysisPass;
}

export interface ComposerRegistration {
  readonly submit: () => void;
  readonly enabled: boolean;
  /**
   * REQ-LIBRARY-107 (Part X): load a prompt into the composer from the Library or the stash dialog. It is on the
   * registration and not a DOM lookup so no surface reaches for the textarea; the composer owns its own text.
   *
   * What "load into the composer" means is REQ-CHAT-044's, and it is not a plain replacement: an entry going into
   * a NON-EMPTY composer is appended after one blank line (`<current>\n\n<incoming>`), into an empty one it
   * replaces the text, and the composer takes focus afterwards. REQ-CHAT-044 states that for the stash routes;
   * `REQ-LIBRARY-107` uses the same verb for the history routes and states no different rule, so one rule serves
   * all four and a user never loses text they had already typed. Recorded as a decision taken where the history
   * route is silent.
   */
  readonly setText: (text: string) => void;
}
export type OverlayKind = 'slashPopup' | 'searchPanel' | 'drawers';
export type OverlayCloser = () => boolean;
/** REQ-SHELL-055's order of resolution, fixed. */
export const OVERLAY_ORDER: readonly OverlayKind[] = ['slashPopup', 'searchPanel', 'drawers'];

export interface LaunchChoices {
  readonly isolation: { readonly branch: string } | null;
  readonly attach: { readonly path: string; readonly branch: string } | null;
  readonly sandboxMode: 'off' | 'workspace-write' | 'read-only';
}

export const useShellState = create<ShellState>((set, get) => ({
  activeView: STARTUP_VIEW,
  improvementAnalysis: { active: false, pass: 'post_run' },
  setImprovementAnalysis(activity) { set({ improvementAnalysis: activity }); },
  switchView(id) {
    if (!isViewId(id)) return;
    const state = get();
    // REQ-CONFIG-287: the guard fires when leaving Settings for a different view; Settings-to-Settings is free.
    if (state.activeView === 'settings' && id !== 'settings' && state.navigationGuard) {
      void state.navigationGuard(id).then((proceed) => { if (proceed) set({ activeView: id }); });
      return;
    }
    set({ activeView: id });
  },
  navigationGuard: null,
  setNavigationGuard(guard) {
    set({ navigationGuard: guard });
  },
  settingsCategory: null,
  openSettings(category) {
    set({ activeView: 'settings', settingsCategory: category });
  },
  takeSettingsCategory() {
    set({ settingsCategory: null });
  },
  projectSetup: null,
  openProjectSetup() {
    set({ projectSetup: 'manual' });
  },
  autoOpenProjectSetup() {
    set({ projectSetup: 'auto' });
  },
  closeProjectSetup() {
    set({ projectSetup: null });
  },
  libraryTab: null,
  libraryProposalId: null,
  openLibrary(tab, proposalId) {
    // REQ-LIBRARY-103: an unknown tab name is ignored — the Library still opens, on whichever tab it was showing.
    set({ activeView: 'library', ...(LIBRARY_TABS.includes(tab as (typeof LIBRARY_TABS)[number]) ? { libraryTab: tab, libraryProposalId: proposalId ?? null } : {}) });
  },
  takeLibraryTab() {
    set({ libraryTab: null });
  },
  takeLibraryProposalId() {
    set({ libraryProposalId: null });
  },
  launchOptions: null,
  setLaunchOptions(options) {
    set({ launchOptions: options });
  },
  takeLaunchOptions() {
    const options = get().launchOptions;
    if (options !== null) set({ launchOptions: null });
    return options;
  },
  selectedAgentId: null,
  selectAgent(id) {
    if (get().selectedAgentId !== id) set({ selectedAgentId: id });
  },
  paletteOpen: false,
  helpOpen: false,
  openPalette() {
    set({ paletteOpen: true, helpOpen: false });
  },
  closePalette() {
    if (get().paletteOpen) set({ paletteOpen: false });
  },
  openKeyboardHelp() {
    set({ helpOpen: true, paletteOpen: false });
  },
  closeKeyboardHelp() {
    if (get().helpOpen) set({ helpOpen: false });
  },
  composer: null,
  registerComposer(registration) {
    set({ composer: registration });
  },
  overlays: { slashPopup: null, searchPanel: null, drawers: null },
  registerOverlay(kind, close) {
    set({ overlays: { ...get().overlays, [kind]: close } });
  },
  skillsRevision: 0,
  skillsChanged() {
    set({ skillsRevision: get().skillsRevision + 1 });
  },
}));
