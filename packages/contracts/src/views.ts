/**
 * The single definition of the primary views and their order: six, under PD-SHELL-015, in the order PD-SHELL-016 gives
 * them — Workspace, Overview, Requirements, Git, Library, Settings. PD-SHELL-016 narrows REQ-SHELL-023 (the order),
 * REQ-SHELL-026 (the window opens on the Workspace), REQ-SHELL-027 (the navigation is a sidebar: a view's icon stands
 * beside its label, under a group heading) and REQ-SHELL-049 (Ctrl+1..6 follow this order, so Ctrl+1 is the Workspace
 * and Ctrl+2 the Overview). Mission is not a primary view: its identifier `mission` is retired and never reassigned,
 * and what the view held stands on the Overview (PD-MONITOR-009).
 *
 * `group` is the sidebar heading a view stands under (PD-SHELL-016 clause 2): `work` is the session in hand, `project`
 * is what belongs to the repository whichever session is shown, `system` is the application itself and stands at the
 * sidebar's foot with no heading.
 *
 * The navigation takes its items from the caller, and the caller takes them from here (docs/design/README.md §2: the
 * information architecture is the record's — the specification and the directives over it — never the design
 * material's).
 */
export const PRIMARY_VIEWS = [
  { id: 'workspace', label: 'Workspace', icon: 'ph-chats', group: 'work' },
  { id: 'overview', label: 'Overview', icon: 'ph-squares-four', group: 'work' },
  { id: 'requirements', label: 'Requirements', icon: 'ph-list-checks', group: 'project' },
  { id: 'git', label: 'Git', icon: 'ph-git-branch', group: 'project' },
  { id: 'library', label: 'Library', icon: 'ph-books', group: 'project' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear', group: 'system' },
] as const;
export type ViewGroup = (typeof PRIMARY_VIEWS)[number]['group'];
/** PD-SHELL-016 clause 2: the sidebar's groups in order; `work` leads with no heading and `system` stands at the foot with none. */
export const VIEW_GROUPS: readonly { readonly id: ViewGroup; readonly label: string | null }[] = [
  { id: 'work', label: null },
  { id: 'project', label: 'Project' },
  { id: 'system', label: null },
];
export type ViewId = (typeof PRIMARY_VIEWS)[number]['id'];
/** PD-SHELL-016 clause 4 (narrowing REQ-SHELL-026, ruling OQ-548): the window opens on the Workspace. */
export const STARTUP_VIEW: ViewId = 'workspace';
/** PD-SHELL-015 clause 2: identifiers that named a primary view once. A request for one is REQ-SHELL-025's silent no-op, and none is ever reassigned. */
export const RETIRED_VIEW_IDS = ['mission'] as const;

export function isViewId(s: string): s is ViewId {
  return PRIMARY_VIEWS.some((v) => v.id === s);
}

/** The 1-based place of a view in the navigation, which is also the digit of its Ctrl+<digit> shortcut (PD-SHELL-015 clause 3, in PD-SHELL-016's order). */
export function viewPosition(id: ViewId): number {
  return PRIMARY_VIEWS.findIndex((v) => v.id === id) + 1;
}
