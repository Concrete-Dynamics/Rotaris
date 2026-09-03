/**
 * REQ-SHELL-023 — the single definition of the seven primary views and their
 * order. REQ-SHELL-027 fixes the labels; REQ-SHELL-049 binds Ctrl+1..7 in
 * this order; REQ-SHELL-026 makes Overview the startup view.
 *
 * The design system's NavRail takes its items from the caller, and the caller
 * takes them from here (docs/design/README.md §2: the information
 * architecture is the specification's, never the design's).
 */
export const PRIMARY_VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { id: 'workspace', label: 'Workspace', icon: 'ph-chats' },
  { id: 'mission', label: 'Mission', icon: 'ph-tree-structure' },
  { id: 'requirements', label: 'Requirements', icon: 'ph-list-checks' },
  { id: 'git', label: 'Git', icon: 'ph-git-branch' },
  { id: 'library', label: 'Library', icon: 'ph-books' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
] as const;
export type ViewId = (typeof PRIMARY_VIEWS)[number]['id'];
export const STARTUP_VIEW: ViewId = 'overview';

export function isViewId(s: string): s is ViewId {
  return PRIMARY_VIEWS.some((v) => v.id === s);
}
