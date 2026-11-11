/**
 * The single definition of the primary views and their order: six, under PD-SHELL-015, which narrows REQ-SHELL-023 (the
 * views and their order), REQ-SHELL-027 (the labels) and REQ-SHELL-049 (Ctrl+1..6 in this order). The six keep the order
 * they had; Mission, which stood third, is not a primary view: its identifier `mission` is retired and never reassigned,
 * and what the view held stands on the Overview (PD-MONITOR-009). REQ-SHELL-026 still makes Overview the startup view.
 *
 * The design system's NavRail takes its items from the caller, and the caller takes them from here
 * (docs/design/README.md §2: the information architecture is the record's — the specification and the directives over
 * it — never the design material's).
 */
export const PRIMARY_VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { id: 'workspace', label: 'Workspace', icon: 'ph-chats' },
  { id: 'requirements', label: 'Requirements', icon: 'ph-list-checks' },
  { id: 'git', label: 'Git', icon: 'ph-git-branch' },
  { id: 'library', label: 'Library', icon: 'ph-books' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
] as const;
export type ViewId = (typeof PRIMARY_VIEWS)[number]['id'];
export const STARTUP_VIEW: ViewId = 'overview';
/** PD-SHELL-015 clause 2: identifiers that named a primary view once. A request for one is REQ-SHELL-025's silent no-op, and none is ever reassigned. */
export const RETIRED_VIEW_IDS = ['mission'] as const;

export function isViewId(s: string): s is ViewId {
  return PRIMARY_VIEWS.some((v) => v.id === s);
}

/** The 1-based place of a view in the rail, which is also the digit of its Ctrl+<digit> shortcut (PD-SHELL-015 clause 3). */
export function viewPosition(id: ViewId): number {
  return PRIMARY_VIEWS.findIndex((v) => v.id === id) + 1;
}
