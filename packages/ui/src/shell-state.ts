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
}

export const useShellState = create<ShellState>((set) => ({
  activeView: STARTUP_VIEW,
  switchView(id) {
    if (!isViewId(id)) return;
    set({ activeView: id });
  },
  settingsCategory: null,
  openSettings(category) {
    set({ activeView: 'settings', settingsCategory: category });
  },
  takeSettingsCategory() {
    set({ settingsCategory: null });
  },
}));
