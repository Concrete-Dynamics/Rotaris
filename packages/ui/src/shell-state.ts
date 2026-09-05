import { create } from 'zustand';
import { isViewId, STARTUP_VIEW, type ViewId } from '@rotaris/contracts';

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
  /** REQ-CONFIG-286/287: the unsaved-settings guard; asked before a view switch away from Settings while dirty. */
  readonly navigationGuard: ((next: ViewId) => Promise<boolean>) | null;
  setNavigationGuard(guard: ((next: ViewId) => Promise<boolean>) | null): void;
  /** REQ-SHELL-125: the accepted launch dialog's choices, held for the composer's NEXT submission and consumed by it. */
  readonly launchOptions: LaunchChoices | null;
  setLaunchOptions(options: LaunchChoices | null): void;
  takeLaunchOptions(): LaunchChoices | null;
}

export interface LaunchChoices {
  readonly isolation: { readonly branch: string } | null;
  readonly attach: { readonly path: string; readonly branch: string } | null;
  readonly sandboxMode: 'off' | 'workspace-write' | 'read-only';
}

export const useShellState = create<ShellState>((set, get) => ({
  activeView: STARTUP_VIEW,
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
  launchOptions: null,
  setLaunchOptions(options) {
    set({ launchOptions: options });
  },
  takeLaunchOptions() {
    const options = get().launchOptions;
    if (options !== null) set({ launchOptions: null });
    return options;
  },
}));
