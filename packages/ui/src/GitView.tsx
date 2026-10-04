import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { presentationStatus, type CheckpointListPayload, type CheckpointPreviewPayload, type CheckpointRestoreOutcomePayload, type GitViewState, type GitWorktreeRow, type PaneLayout, type PresentationStatus, type SessionListItemPayload } from '@rotaris/contracts';
import { ConfirmDialog } from './ConfirmDialog.js';
import { WorktreeDialog } from './WorktreeDialog.js';
import { CheckpointProgressDialog, checkpointsEmptyText, RESTORE_CANCELLED, RestoreConfirmDialog, restoreDisabledReason, TREE_UNCHANGED, type ListingState } from './CheckpointDialogs.js';
import { Button as DesignButton, EmptyState as DesignEmptyState, PageHeader as DesignPageHeader, Select as DesignSelect, Table as DesignTable, Tag as DesignTag } from './design-system/index.js';

/**
 * REQ-SHELL-023's fifth view. Structure from the specification — REQ-GIT-075 (the header row), 076 (two resizable
 * columns of at least 280 px under the `git` layout key, the four cards), 077/079/085 (the worktrees table and its
 * per-row delete), 078/108 (the history table with the local tint), 080/081/083 (the three buttons' states and
 * tooltips), 086..090 (the checkpoints card — ADR-0039's first execution, Part P: rows from the listing, single-row
 * selection, the reading state on every request, the picker's rebuild rules), 091..100 (the restore flow: preview
 * first, the three refusals, the confirmation, the progress, the notices), 109 (bindings joined by resolved path),
 * 115..117 (the two dialogs), 152 (the visual properties named here are the only ones fixed).
 * Language from docs/design/system: Card, Table/TableCard, EmptyState, Button, Tag, Dialog, the G8 divider; tokens by name.
 */
export const GIT_PANE_MIN = 280;
export const GIT_RIGHT_DEFAULT = 480;
export const GIT_RIGHT_MAX = 900;
export const MERGE_DISABLED_TOOLTIP = 'Select one or more completed isolated session worktrees to merge.';
export const MERGE_ENABLED_TOOLTIP = 'Merge selected completed worktrees into base.';
export const NEW_WORKTREE_DISABLED_TOOLTIP = 'Open a Git repository before creating a worktree.';
export const NOT_A_REPOSITORY = 'not a git repository';
export const REFRESHING_LABEL = 'Refreshing repository state…';
export const CHECKPOINTS_NO_SESSION = 'Start or open a session to see the checkpoints recorded for it.';
export const CHECKPOINTS_EMPTY = 'No checkpoints are recorded for this session. Rotaris records one after each iteration of a worktree-isolated run.';
export const RESTORE_NO_SESSION = 'Select a session to restore one of its checkpoints.';
export const RESTORE_NO_ROW = 'Select a checkpoint in the list to restore it.';
export const COMMIT_POLICY = 'Agents may create local commits only through the git_commit tool — no push, pull, rebase or amend. Reviewing and pushing remain your job; nothing here contacts a remote.';
/** REQ-GIT-095: the one retry, 150 ms later, against whichever session is selected then. */
export const CHECKPOINT_LISTING_RETRY_MS = 150;

export type CommandFailure = { readonly ok: false; readonly code: string; readonly reason: string };
/** ADR-0039's three desktop commands as the view sees them; every refusal is a value (REQ-GIT-052). */
export interface CheckpointOps {
  readonly list: (sessionId: string) => Promise<{ ok: true; listing: CheckpointListPayload } | CommandFailure>;
  readonly preview: (sessionId: string, sequence: number) => Promise<{ ok: true; preview: CheckpointPreviewPayload } | CommandFailure>;
  readonly restore: (sessionId: string, sequence: number, force: boolean) => Promise<{ ok: true; outcome: CheckpointRestoreOutcomePayload } | CommandFailure>;
}

export interface GitViewProps {
  readonly workspaceRoot: string;
  /** null: not read yet. */
  readonly state: GitViewState | null;
  readonly refreshing: boolean;
  /** REQ-GIT-109: the session list, whose bindings are joined onto the worktree rows by resolved path. */
  readonly sessions: readonly SessionListItemPayload[];
  readonly layout: PaneLayout | undefined;
  readonly onLayout: (layout: PaneLayout) => void;
  readonly onRefresh: () => void;
  readonly onCreateWorktree: (branch: string, path: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onDeleteWorktree: (path: string, force: boolean) => Promise<{ ok: true } | { ok: false; reason: string; needsForce: boolean }>;
  readonly probePath?: ((path: string) => Promise<{ exists: boolean; nonEmpty: boolean } | null>) | undefined;
  /** REQ-NOTIFY-013 / REQ-SHELL-113: raise a transient on the window's ONE stack; this view owns no surface of its own. */
  readonly onAcknowledge?: ((message: string) => void) | undefined;
  /** ADR-0039: absent means the card stays in its empty states (the listing is never requested). */
  readonly checkpoints?: CheckpointOps | undefined;
  /** REQ-GIT-100: after a successful restore the Git state and the session list are refreshed. */
  readonly onRestored?: (() => void) | undefined;
  /** The focused session, the picker's second fallback (REQ-GIT-088). */
  readonly focusedSessionId?: string | null | undefined;
}

/** The empty value of REQ-GIT-112 renders as an em dash; REQ-GIT-077 fixes the shape of the Files cell. */
export const emptyOr = (n: number | null): string => (n === null ? '—' : String(n));
export function filesCell(row: Pick<GitWorktreeRow, 'additions' | 'deletions' | 'files'>): string {
  return row.additions === null || row.deletions === null || row.files === null ? '—' : `+${row.additions} -${row.deletions} / ${row.files}`;
}
/** REQ-GIT-075: the monospace sync label, or REQ-GIT-081's refreshing text. */
export function syncLabel(state: GitViewState | null, refreshing: boolean): string {
  if (refreshing) return REFRESHING_LABEL;
  if (!state || !state.isRepository) return 'ahead —  behind —';
  return `ahead ${state.ahead}  behind ${state.behind}`;
}
/** REQ-GIT-075/161: the branch text — the literal for a non-repository, a distinct marker for a detached checkout. */
export function headerBranch(state: GitViewState | null): string {
  if (!state) return 'reading…';
  if (!state.isRepository) return NOT_A_REPOSITORY;
  if (state.detached) return 'detached HEAD';
  return state.branch ?? '—';
}
/** The renderer's path key: separators to `/`, no trailing one, case folded (the join must survive Windows spellings). */
export const pathKey = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * `status` is the session's PERSISTED execution status, as the session listing carries it (REQ-SESSION-073): what
 * eligibility reads (REQ-GIT-083). It is never drawn as is — `statePhrase` presents it (REQ-NOTIFY-048/049).
 */
export interface RowBinding { readonly sessionId: string; readonly status: string; readonly mergeStatus: string }
/** REQ-GIT-109: bindings joined by resolved path; the latest-updated session wins a tree two sessions name. The status is copied persisted; drawing presents it. */
export function joinBindings(sessions: readonly SessionListItemPayload[]): Map<string, RowBinding> {
  const out = new Map<string, RowBinding>();
  for (const s of sessions) {
    if (!s.worktree) continue;
    const key = pathKey(s.worktree.worktree_path);
    if (!out.has(key)) out.set(key, { sessionId: s.sessionId, status: s.status, mergeStatus: s.worktree.merge_status });
  }
  return out;
}
/**
 * REQ-GIT-109: a worktree row's State cell — the session's execution status, then the binding's merge status (`idle` and
 * `ready` where nothing is bound). One phrase, drawn on one line and never shortened, so both statuses stay legible.
 *
 * The status is the member of REQ-NOTIFY-048 the persisted value presents as (REQ-NOTIFY-049), never the persisted word:
 * until 2026-10-04 a bound row drew it raw, `awaiting_plan_decision · ready` where every other surface reads `paused`
 * (docs/defects/fixed/the-git-views-state-cell-renders-the-raw-persisted-execution-status.md).
 */
export const statePhrase = (b: RowBinding | undefined): { readonly status: PresentationStatus; readonly merge: string } => ({ status: b === undefined ? 'idle' : presentationStatus(b.status), merge: b?.mergeStatus ?? 'ready' });
/**
 * REQ-GIT-109: the State column's width — the widest phrase the table draws plus the cell's own padding, in CSS px; `null`
 * when nothing was measured (a renderer that lays nothing out reports zero), which leaves the column at its CSS floor.
 *
 * Until 2026-10-04 the column was a fixed `10ch`, sized for `idle · ready`; a bound row's `completed · ready` is wider and
 * ran on under the Ahead figure (`docs/defects/fixed/the-git-views-worktree-state-cell-overruns-the-ahead-column.md`). Both
 * vocabularies are closed but their longest pairing (`awaiting_plan_decision · merge_failed`) would take a third of the
 * pane from every table, so the column is as wide as the phrases actually shown and no wider.
 */
export function stateColumnFit(phraseWidths: readonly number[], cellPadding: number): number | null {
  const widest = Math.max(0, ...phraseWidths.filter((w) => Number.isFinite(w)));
  return widest > 0 ? Math.ceil(widest + Math.max(0, cellPadding)) : null;
}
/**
 * REQ-GIT-077, UIR-002: the least one Branch cell's line can be drawn in, in CSS px — the name at its floor (`min-width`,
 * its first character and the elision marker), every tag whole, and the gaps between them. The tags hold and the name
 * elides (the design material draws a name whole beside its tag, never a tag shortened or dropped), so this is what the
 * Branch column must keep at the minimum window. Until 2026-10-04 nothing kept it: at 1000x680 the base row's `base` and
 * `active` took the column's 9ch, `main` was given no pixel and `active` lay past the cell's edge
 * (docs/defects/fixed/the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md).
 */
export function branchLineFloor(nameFloor: number, tagWidths: readonly number[], gap: number): number {
  const finite = (w: number): number => (Number.isFinite(w) ? Math.max(0, w) : 0);
  return [nameFloor, ...tagWidths].reduce((sum, w) => sum + finite(w), 0) + finite(gap) * tagWidths.length;
}
/**
 * The Branch column's floor — the widest line `branchLineFloor` measured plus the cell's padding, in CSS px; `null` when
 * nothing was measured, which leaves the column at its CSS floor (the heading's 9ch). Same rule as `stateColumnFit`.
 */
export const branchColumnFit = (lineFloors: readonly number[], cellPadding: number): number | null => stateColumnFit(lineFloors, cellPadding);
/** The worktree table's measured column floors, as the custom properties shell.css reads; none when nothing was measured. */
export function tableFit(stateFit: number | null, branchFit: number | null): CSSProperties | undefined {
  if (stateFit === null && branchFit === null) return undefined;
  return { ...(stateFit === null ? {} : { '--git-state-fit': `${stateFit}px` }), ...(branchFit === null ? {} : { '--git-branch-fit': `${branchFit}px` }) } as CSSProperties;
}
/** REQ-GIT-083: eligible = a selected row whose session is `completed` and whose binding is `ready` or `merge_failed`. */
export function mergeEligible(rows: readonly GitWorktreeRow[], selected: ReadonlySet<string>, join: Map<string, RowBinding>): GitWorktreeRow[] {
  return rows.filter((r) => selected.has(r.path)).filter((r) => { const b = join.get(pathKey(r.path)); return b !== undefined && b.status === 'completed' && (b.mergeStatus === 'ready' || b.mergeStatus === 'merge_failed'); });
}
/** REQ-GIT-076: the right column clamped so neither column drops below its minimum. */
export function clampGitRight(right: number, containerWidth: number, dividerWidth = 8): number {
  const maxByLeft = containerWidth - GIT_PANE_MIN - dividerWidth;
  return Math.round(Math.max(GIT_PANE_MIN, Math.min(GIT_RIGHT_MAX, right, Math.max(GIT_PANE_MIN, maxByLeft))));
}
/** REQ-GIT-086: the picker's entries. */
export const pickerLabel = (s: SessionListItemPayload): string => (s.worktree ? `${s.sessionId} · ${s.worktree.branch}` : s.sessionId);
/** REQ-GIT-088: the previous choice when it still exists, else the focused session, else the first entry, else none. */
export function effectivePicked(entries: readonly SessionListItemPayload[], picked: string | null, focused: string | null | undefined): string | null {
  if (picked !== null && entries.some((s) => s.sessionId === picked)) return picked;
  if (focused && entries.some((s) => s.sessionId === focused)) return focused;
  return entries[0]?.sessionId ?? null;
}

/**
 * REQ-WORKSPACE-020's three sentences, each closed by its full stop. REQ-SHELL-042, which owns the item, leaves the wording to
 * the implementation; REQ-GIT-122's backticked `Branch this workspace is on: <branch>` with `, N commit(s) ahead` is read as a
 * template, since REQ-SHELL-044 forbids rendering `(s)` as written — the noun agrees with the count instead.
 */
function branchSentence(branch: string, ahead: number): string {
  return `Branch this workspace is on: ${branch}${ahead > 0 ? `, ${ahead} commit${ahead === 1 ? '' : 's'} ahead` : ''}.`;
}
/** REQ-WORKSPACE-020: what the accessible description adds, and only it, while the item names an isolated worktree's branch. */
export const WORKTREE_BRANCH_NOTE = 'It belongs to the isolated worktree the active run is using, not to the folder this window is open on.';

/**
 * REQ-GIT-122/161: the status strip's branch item — the focused session's worktree branch when set, else the
 * workspace's checked-out branch with `↑<n>` when ahead; a detached checkout and a non-repository are each conveyed
 * in words distinct from a branch name and from each other; an unread repository takes the empty value. Those three
 * states follow REQ-GIT-161, where REQ-WORKSPACE-020 would render the item empty with no tooltip (OQ-193, open).
 *
 * REQ-WORKSPACE-020: a worktree branch is "rendered exactly as any other branch name is" — its ` ↑{n}` and its sentences are
 * the base checkout's, the count read against THAT branch's upstream (the snapshot row's `upstreamAhead`, never the base
 * checkout's `ahead` nor the row's base-branch `ahead`); only the accessible `description` adds that the branch is the
 * isolated worktree's. Elsewhere the tooltip and the description are one and the same string. Until the acceptance repair
 * (F8, 2026-10-03) the worktree branch had no marker and one sentence of its own for both, "Branch this session's worktree is
 * on: {branch}".
 */
export function branchStripItem(state: GitViewState | null, focusedWorktreeBranch: string | null): { text: string; suffix?: string; title: string; description: string; state: 'branch' | 'detached' | 'none' | 'unknown' } {
  // REQ-WORKSPACE-149 rule 2 shortens the branch NAME; the ` ↑{n}` marker is drawn after it, whole (`suffix`).
  const named = (branch: string, ahead: number) => ({ text: branch, ...(ahead > 0 ? { suffix: ` ↑${ahead}` } : {}), title: branchSentence(branch, ahead), state: 'branch' as const });
  if (focusedWorktreeBranch !== null) {
    // Before the first read, or with the tree not listed, the comparison cannot be made: 0 (REQ-WORKSPACE-029).
    const ahead = state?.worktrees.find((w) => w.branch === focusedWorktreeBranch)?.upstreamAhead ?? 0;
    const item = named(focusedWorktreeBranch, ahead);
    return { ...item, description: `${item.title} ${WORKTREE_BRANCH_NOTE}` };
  }
  const plain = <T extends { title: string }>(item: T) => ({ ...item, description: item.title });
  if (state === null) return plain({ text: '—', title: 'Branch this workspace is on: not read yet', state: 'unknown' as const });
  if (!state.isRepository) return plain({ text: state.gitAvailable ? 'no git repository' : 'no git', title: state.gitAvailable ? 'This folder is not a Git repository.' : 'Git is not installed or not on PATH.', state: 'none' as const });
  if (state.detached) return plain({ text: 'detached HEAD', title: 'This workspace is on no branch (detached HEAD).', state: 'detached' as const });
  return plain(named(state.branch ?? '—', state.ahead));
}

const NO_ROWS: readonly GitWorktreeRow[] = [];

type Dialog =
  | { kind: 'create' }
  | { kind: 'confirm', row: GitWorktreeRow }
  | { kind: 'confirm-force', row: GitWorktreeRow, reason: string }
  | { kind: 'failure', title: string, text: string }
  | null;

/** REQ-GIT-096..100: the restore flow's one state at a time. */
type Flow =
  | { kind: 'inspecting'; sessionId: string; sequence: number }
  | { kind: 'confirm'; preview: CheckpointPreviewPayload }
  | { kind: 'restoring'; sessionId: string; sequence: number }
  | { kind: 'message'; title: string; text: string }
  | null;

function Card({ kicker, children, className = '', actions, testId }: { kicker: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; testId?: string }) {
  return (
    <section className={`card git-card ${className}`} aria-label={kicker} data-testid={testId}>
      <div className="git-card__head"><span className="card-kicker">{kicker}</span>{actions}</div>
      {children}
    </section>
  );
}

export function GitView(props: GitViewProps) {
  const { workspaceRoot, state, refreshing, sessions, layout, onLayout, checkpoints, onRestored, focusedSessionId } = props;
  const join = useMemo(() => joinBindings(sessions), [sessions]);
  // A stable empty list: a fresh `[]` per render would make the selection reconciliation below loop (React's "too many re-renders", found on first execution).
  const rows = useMemo(() => state?.worktrees ?? NO_ROWS, [state]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  /**
   * REQ-SHELL-113: the window has no second transient surface. This view used to draw its own fixed toast; it now
   * raises the ONE acknowledgement stack of REQ-NOTIFY-013 through the callback the root supplies, and draws nothing.
   */
  const setToast = props.onAcknowledge ?? (() => undefined);
  const [pickedSession, setPickedSession] = useState<string | null>(null);
  // A selection survives a refresh only for rows that still exist (REQ-GIT-079: rebuilt each refresh, nothing stale).
  const [seenRows, setSeenRows] = useState(rows);
  if (seenRows !== rows) { setSeenRows(rows); const alive = new Set(rows.map((r) => r.path)); if ([...selected].some((p) => !alive.has(p))) setSelected(new Set([...selected].filter((p) => alive.has(p)))); }
  // The G8 divider: pointer drag and Left/Right/Home/End; the split persists under `panels/git` (REQ-GIT-153).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [right, setRight] = useState<number>(() => layout?.sizes[1] ?? GIT_RIGHT_DEFAULT);
  const [seenLayout, setSeenLayout] = useState(layout);
  if (seenLayout !== layout) { setSeenLayout(layout); if (layout) setRight(layout.sizes[1] ?? GIT_RIGHT_DEFAULT); }
  const commit = useCallback((value: number) => {
    const width = bodyRef.current?.clientWidth ?? 1280;
    const next = clampGitRight(value, width);
    setRight(next);
    onLayout({ version: 1, panes: 2, sizes: [Math.max(GIT_PANE_MIN, width - next - 8), next] });
  }, [onLayout]);
  const drag = useRef<{ startX: number; startRight: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => { drag.current = { startX: e.clientX, startRight: right }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => { if (drag.current) setRight(clampGitRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280)); };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => { if (!drag.current) return; const v = clampGitRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280); drag.current = null; commit(v); };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(right + step); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commit(right - step); }
    else if (e.key === 'Home') { e.preventDefault(); commit(GIT_RIGHT_DEFAULT); }
    else if (e.key === 'End') { e.preventDefault(); commit(GIT_PANE_MIN); }
  };

  // REQ-GIT-077: multi-row selection — click selects one, Ctrl toggles, Shift extends from the anchor in table order.
  const selectRow = (e: MouseEvent, path: string) => {
    if (e.shiftKey && anchor.current !== null) {
      const a = rows.findIndex((r) => r.path === anchor.current), b = rows.findIndex((r) => r.path === path);
      if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; setSelected(new Set(rows.slice(lo, hi + 1).map((r) => r.path))); return; }
    }
    if (e.ctrlKey || e.metaKey) { const next = new Set(selected); if (next.has(path)) next.delete(path); else next.add(path); setSelected(next); anchor.current = path; return; }
    setSelected(new Set([path]));
    anchor.current = path;
  };

  // REQ-GIT-109: the State column measured to its widest phrase. Each phrase is an inline-block that never wraps, so its
  // width is its own text's and not the column's: widening the column cannot move the figure that widened it. The
  // observer re-measures when a phrase changes size without the rows changing — a face finishing loading, the type scale.
  const worktreeTable = useRef<HTMLTableElement | null>(null);
  const [stateFit, setStateFit] = useState<number | null>(null);
  const phraseKey = rows.map((r) => { const p = statePhrase(join.get(pathKey(r.path))); return `${p.status}\u0000${p.merge}`; }).join('\u0001');
  useLayoutEffect(() => {
    const table = worktreeTable.current;
    if (!table) return;
    const phrases = Array.from(table.querySelectorAll<HTMLElement>('.git__state-phrase'));
    const measure = () => {
      const cell = phrases[0]?.closest('td');
      const style = cell ? getComputedStyle(cell) : null;
      const padding = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0;
      setStateFit(stateColumnFit(phrases.map((p) => p.getBoundingClientRect().width), padding));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    for (const p of phrases) observer.observe(p);
    return () => { observer.disconnect(); };
  }, [phraseKey]);

  // REQ-GIT-077, UIR-002: the Branch column keeps, at the minimum window, the widest line a row needs with its name at
  // its floor and its tags whole (`branchLineFloor`); a column with more room gives the name the rest. Re-measured when a
  // tag changes size without the rows changing (a face finishing loading, the type scale).
  const [branchFit, setBranchFit] = useState<number | null>(null);
  const branchKey = rows.map((r) => `${r.branch ?? ''}\u0000${r.isBase ? 1 : 0}${r.isActive ? 1 : 0}`).join('\u0001');
  useLayoutEffect(() => {
    const table = worktreeTable.current;
    if (!table) return;
    const lines = Array.from(table.querySelectorAll<HTMLElement>('.git__branch-line'));
    const measure = () => {
      const floors = lines.map((line) => {
        const name = line.querySelector<HTMLElement>('.git__branch-name');
        const tags = Array.from(line.querySelectorAll<HTMLElement>('.tag'));
        const style = getComputedStyle(line);
        return branchLineFloor(name ? parseFloat(getComputedStyle(name).minWidth) : 0, tags.map((t) => t.getBoundingClientRect().width), parseFloat(style.columnGap));
      });
      const cell = lines[0]?.closest('td');
      const style = cell ? getComputedStyle(cell) : null;
      const padding = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0;
      setBranchFit(branchColumnFit(floors, padding));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    for (const tag of table.querySelectorAll<HTMLElement>('.git__branch-line .tag')) observer.observe(tag);
    return () => { observer.disconnect(); };
  }, [branchKey]);

  const eligible = mergeEligible(rows, selected, join);
  const hasBranch = state?.isRepository === true && state.branch !== null;
  const existingBranches = rows.flatMap((r) => (r.branch === null ? [] : [r.branch]));

  // REQ-GIT-117: delete → confirm → attempt without force → on Git's refusal for uncommitted work, the second confirmation.
  const deleteRow = async (row: GitWorktreeRow, force: boolean) => {
    setBusy(true);
    const r = await props.onDeleteWorktree(row.path, force);
    setBusy(false);
    if (r.ok) { setDialog(null); setToast('Worktree deleted.'); return; }
    if (!force && r.needsForce) { setDialog({ kind: 'confirm-force', row, reason: r.reason }); return; }
    setDialog({ kind: 'failure', title: 'Could not delete worktree', text: r.reason });
  };

  // ── The checkpoints card (REQ-GIT-086..090) ──
  const pickerEntries = sessions;
  const effectivePick = effectivePicked(pickerEntries, pickedSession, focusedSessionId);
  const pickRef = useRef<string | null>(effectivePick);
  useEffect(() => { pickRef.current = effectivePick; }, [effectivePick]);
  const [listing, setListing] = useState<ListingState>({ state: 'none' });
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [listingTick, setListingTick] = useState(0);
  const pendingPreview = useRef<{ sessionId: string; sequence: number } | null>(null);
  // A change of effective selection drops the row selection (the derive-during-render pattern, as the worktree rows above).
  const [seenPick, setSeenPick] = useState(effectivePick);
  if (seenPick !== effectivePick) { setSeenPick(effectivePick); setSelectedSeq(null); }
  const requestRef = useRef<(sessionId: string, retried: boolean) => Promise<void>>(async () => undefined);
  const requestListing = async (sessionId: string, retried: boolean): Promise<void> => {
    if (!checkpoints) return;
    // REQ-GIT-095: the reading state on every request, then exactly one settle; a result for another session is stale.
    setListing({ state: 'reading', sessionId });
    const r = await checkpoints.list(sessionId);
    if (pickRef.current !== sessionId) return;
    if (!r.ok && r.code === 'checkpoint.busy' && !retried) {
      // The single retry, 150 ms later, against whichever session is selected at that moment.
      setTimeout(() => { const now = pickRef.current; if (now) void requestRef.current(now, true); }, CHECKPOINT_LISTING_RETRY_MS);
      return;
    }
    if (!r.ok) {
      if (r.code === 'checkpoint.store') { setListing({ state: 'empty', sessionId, reason: null }); setDialog({ kind: 'failure', title: "Could not read this session's checkpoints", text: r.reason }); return; }
      setListing({ state: 'unavailable', sessionId, reason: r.reason });
      return;
    }
    setListing({ state: 'ready', sessionId, listing: r.listing });
  };
  useEffect(() => { requestRef.current = requestListing; });
  // REQ-GIT-088: a change of effective selection requests that session's listing; no session clears the rows.
  useEffect(() => {
    queueMicrotask(() => {
      if (pickRef.current === null) { setListing({ state: 'none' }); return; }
      void requestRef.current(pickRef.current, false);
    });
  }, [effectivePick, listingTick]);
  const listedRows = listing.state === 'ready' && listing.sessionId === effectivePick ? listing.listing.rows : [];
  const emptyText = checkpointsEmptyText(listing, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY);
  const restoreReason = restoreDisabledReason(listing, selectedSeq !== null && listedRows.some((r) => r.sequence === selectedSeq) ? selectedSeq : null, RESTORE_NO_SESSION, RESTORE_NO_ROW);
  const refreshListing = () => setListingTick((t) => t + 1);

  // ── The restore flow (REQ-GIT-096..100) ──
  const startRestore = async () => {
    if (!checkpoints || effectivePick === null || selectedSeq === null || restoreReason !== null || flow !== null) return;
    const sessionId = effectivePick;
    const sequence = selectedSeq;
    pendingPreview.current = { sessionId, sequence };
    setFlow({ kind: 'inspecting', sessionId, sequence });
    const r = await checkpoints.preview(sessionId, sequence);
    // REQ-GIT-096: a preview arriving for a session/sequence no longer pending is ignored.
    if (pendingPreview.current?.sessionId !== sessionId || pendingPreview.current.sequence !== sequence) return;
    pendingPreview.current = null;
    if (!r.ok) {
      if (r.code === 'checkpoint.busy') { setFlow(null); setToast(r.reason); return; }
      if (r.code === 'checkpoint.unrecorded') { setFlow({ kind: 'message', title: `Checkpoint ${sequence} cannot be restored`, text: `Checkpoint ${sequence} is no longer recorded for this session.` }); refreshListing(); return; }
      setFlow({ kind: 'message', title: `Checkpoint ${sequence} cannot be restored`, text: r.reason });
      return;
    }
    if (!r.preview.restorable) { setFlow({ kind: 'message', title: `Checkpoint ${sequence} cannot be restored`, text: r.preview.blockedReason }); return; }
    setFlow({ kind: 'confirm', preview: r.preview });
  };
  const confirmRestore = async (preview: CheckpointPreviewPayload) => {
    if (!checkpoints) return;
    const { sessionId, sequence } = preview;
    setFlow({ kind: 'restoring', sessionId, sequence });
    const r = await checkpoints.restore(sessionId, sequence, preview.dirty.length > 0);
    if (!r.ok) {
      setFlow(r.code === 'checkpoint.busy' ? null : { kind: 'message', title: `Checkpoint ${sequence} was not restored`, text: r.reason });
      if (r.code === 'checkpoint.busy') setToast(r.reason);
      return;
    }
    if (!r.outcome.restored) { setFlow({ kind: 'message', title: `Checkpoint ${sequence} was not restored`, text: r.outcome.blockedReason || TREE_UNCHANGED }); refreshListing(); return; }
    // REQ-GIT-100: the persistent notice is main's; here the Git state and the listing refresh.
    setFlow(null);
    refreshListing();
    onRestored?.();
  };
  const cancelRestore = () => { setFlow(null); setToast(RESTORE_CANCELLED); };

  return (
    <div className="git" data-testid="git">
      <DesignPageHeader className="git__header page-header">
        <h1 className="display git__title">Git workspace</h1>
        <span className="git__branch mono" data-testid="git-branch" data-detached={state?.detached ? '1' : '0'} data-repository={state?.isRepository ? '1' : '0'}>{headerBranch(state)}</span>
        <span className="git__sync mono" data-testid="git-sync" aria-live="polite">{syncLabel(state, refreshing)}</span>
        <span className="git__spacer" />
        <DesignButton type="button" className="btn btn-secondary" data-testid="git-refresh" disabled={refreshing} onClick={props.onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</DesignButton>
        <DesignButton type="button" className="btn btn-primary" data-testid="git-new-worktree" disabled={!hasBranch} title={hasBranch ? undefined : NEW_WORKTREE_DISABLED_TOOLTIP} onClick={() => setDialog({ kind: 'create' })}>New worktree</DesignButton>
        {/* REQ-GIT-083: integration is owed (ADR-0039's neighbour); the button carries the disabled text in this build. */}
        <DesignButton type="button" className="btn btn-secondary" data-testid="git-merge" disabled title={eligible.length > 0 ? MERGE_ENABLED_TOOLTIP : MERGE_DISABLED_TOOLTIP}>Merge selected</DesignButton>
      </DesignPageHeader>
      <div className="git__body" ref={bodyRef} style={{ gridTemplateColumns: `minmax(${GIT_PANE_MIN}px, 1fr) 8px ${right}px` }}>
        <div className="git__column git__left">
          <Card kicker="Worktrees" className="table-card git-card--table" testId="git-worktrees" actions={<span className="card-meta">{rows.length} listed</span>}>
            {rows.length === 0 ? (
              <DesignEmptyState className="empty-state git__empty" data-testid="git-worktrees-empty"><span className="empty-state-title">No Git worktrees found for this workspace.</span></DesignEmptyState>
            ) : (
              <DesignTable ref={worktreeTable} style={tableFit(stateFit, branchFit)} className="table git__table git__worktree-table" aria-multiselectable="true" aria-label="Worktrees" aria-description="Scroll horizontally when the worktree columns exceed the card width.">
                {/* Seven columns whose content floor is wider than this pane at the minimum window. The five
                    that cannot give way take the width they need; Branch and Session elide (UIR-002) and share
                    whatever is left. See `.git__worktree-table` in shell.css for the measured figures. */}
                <colgroup>
                  <col className="git__col-branch" /><col className="git__col-session" /><col className="git__col-state" />
                  <col className="git__col-count" /><col className="git__col-count" /><col className="git__col-files" /><col className="git__col-actions" />
                </colgroup>
                <thead><tr><th>Branch</th><th>Session</th><th>State</th><th>Ahead</th><th>Behind</th><th>Files</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const b = join.get(pathKey(row.path));
                    const phrase = statePhrase(b);
                    const isSelected = selected.has(row.path);
                    return (
                      <tr key={row.path} className={isSelected ? 'git__row is-selected' : 'git__row'} data-path={row.path} data-base={row.isBase ? '1' : '0'} data-active={row.isActive ? '1' : '0'} data-session={b?.sessionId ?? ''} aria-selected={isSelected} title={row.path} onClick={(e) => selectRow(e, row.path)}>
                        <td className="mono git__cell-branch">
                          {/* The line is a flex box INSIDE the cell, so the cell stays a table cell and spans its row
                              (until 2026-10-04 the cell itself was the flex box, wrapped in an anonymous cell and only as
                              tall as its content). UIR-002: the name elides, never fragmented — the full branch is the
                              tooltip — and the tags hold. */}
                          <div className="git__branch-line">
                            <span className="git__branch-name" title={row.branch ?? 'detached'}>{row.branch ?? 'detached'}</span>
                            {row.isBase && <DesignTag kind="outline" data-testid="git-tag-base">base</DesignTag>}
                            {row.isActive && <DesignTag kind="accent" data-testid="git-tag-active">active</DesignTag>}
                          </div>
                        </td>
                        <td className="mono git__cell-session" title={b?.sessionId ?? '-'}>{b?.sessionId ?? '-'}</td>
                        <td className="git__cell-state"><span className="git__state-phrase">{phrase.status}<span className="git__merge-status text-secondary"> · {phrase.merge}</span></span></td>
                        <td className="mono">{emptyOr(row.ahead)}</td>
                        <td className="mono">{emptyOr(row.behind)}</td>
                        <td className="mono">{filesCell(row)}</td>
                        <td className="git__cell-actions">
                          {!row.isBase && !row.isActive && (
                            <DesignButton type="button" className="btn btn-danger btn-compact git__delete" aria-label={`Delete worktree ${row.branch ?? 'detached'}`} title="Delete this worktree" disabled={busy} onClick={(e) => { e.stopPropagation(); setDialog({ kind: 'confirm', row }); }}>Delete</DesignButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DesignTable>
            )}
          </Card>
          <Card kicker="Session checkpoints" testId="git-checkpoints" actions={(
            <div className="git__checkpoint-actions">
              <DesignSelect className="input select git__picker" aria-label="Checkpoint session" data-testid="git-checkpoint-session" disabled={pickerEntries.length === 0} value={effectivePick ?? ''} onChange={(e) => setPickedSession(e.currentTarget.value)}>
                {pickerEntries.map((s) => <option key={s.sessionId} value={s.sessionId}>{pickerLabel(s)}</option>)}
              </DesignSelect>
              <DesignButton type="button" className="btn btn-secondary" disabled={restoreReason !== null || flow !== null} title={restoreReason ?? undefined} data-testid="git-restore" data-reason={restoreReason ?? ''} onClick={() => { void startRestore(); }}>Restore checkpoint</DesignButton>
            </div>
          )}>
            <div className="git__table-scroll" tabIndex={0} aria-label="Checkpoint columns" aria-description="Scroll horizontally when the checkpoint columns exceed the card width.">
              <DesignTable className="table git__table git__checkpoint-table" aria-label="Checkpoints" aria-description="Rows are ordered oldest first." data-testid="git-checkpoint-table" data-state={listing.state}>
                <thead><tr><th>Checkpoint</th><th>Created</th><th>Iteration</th><th>Files changed</th><th>Kind</th></tr></thead>
                <tbody>
                  {listedRows.map((c) => {
                    const isSelected = selectedSeq === c.sequence;
                    return (
                      <tr key={c.sequence} className={isSelected ? 'git__ckpt-row is-selected' : 'git__ckpt-row'} data-testid="git-checkpoint-row" data-sequence={c.sequence} data-kind={c.kind} aria-selected={isSelected} onClick={() => setSelectedSeq(c.sequence)}>
                        <td className="mono">{c.sequence}</td>
                        <td className="mono">{c.createdLabel}</td>
                        <td className="mono">{c.iteration}</td>
                        <td className="mono">{c.files}</td>
                        <td>{c.kind}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DesignTable>
            </div>
            {emptyText !== null && <DesignEmptyState className="empty-state git__empty" data-testid="git-checkpoints-empty" aria-live="polite"><span className="empty-state-hint">{emptyText}</span></DesignEmptyState>}
          </Card>
        </div>
        <div className="git__divider" role="separator" aria-orientation="vertical" aria-label="Resize the commit history column" aria-valuemin={GIT_PANE_MIN} aria-valuemax={GIT_RIGHT_MAX} aria-valuenow={right} tabIndex={0}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onDividerKey} data-testid="git-divider" />
        <div className="git__column git__right" style={{ width: right }}>
          <Card kicker="Commit history" className="table-card git-card--table" testId="git-history" actions={<span className="card-meta">{state?.history.length ?? 0} of {30}</span>}>
            {(state?.history.length ?? 0) === 0 ? (
              <DesignEmptyState className="empty-state git__empty" data-testid="git-history-empty"><span className="empty-state-title">No commit history is available.</span></DesignEmptyState>
            ) : (
              // UIR-012: the list scrolls inside its own card, so a thirty-commit history ends on the
              // card's edge instead of running under the status strip.
              <div className="git__table-body" tabIndex={0} aria-label="Commit history rows" aria-description="Scroll vertically when the history exceeds the card.">
              <DesignTable className="table git__table" aria-label="Commit history">
                <thead><tr><th>Commit</th><th>Message</th><th>Author</th><th>Age</th></tr></thead>
                <tbody>
                  {state!.history.map((c) => (
                    <tr key={c.hash} className={c.local ? 'git__commit is-local' : 'git__commit'} data-local={c.local ? '1' : '0'} data-hash={c.hash} title={c.hash}>
                      <td className="mono">{c.abbrev}{c.local && <span className="visually-hidden"> (local, not on the upstream)</span>}</td>
                      <td className="git__subject">{c.subject}</td>
                      <td>{c.author}</td>
                      <td className="text-secondary">{c.age}</td>
                    </tr>
                  ))}
                </tbody>
              </DesignTable>
              </div>
            )}
          </Card>
          <Card kicker="Agent commit policy" testId="git-policy">
            <p className="card-body git__policy">{COMMIT_POLICY}</p>
          </Card>
        </div>
      </div>
      {dialog?.kind === 'create' && (
        <WorktreeDialog workspaceRoot={workspaceRoot} existingBranches={existingBranches} existingPaths={rows.map((r) => r.path)} probePath={props.probePath} onCreate={props.onCreateWorktree} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog title="Delete worktree?" body={`Remove worktree at ${dialog.row.path}?`} lines={['This deletes the working directory and its Git metadata.']} confirmLabel="Yes" destructive busy={busy} testId="git-confirm-delete"
          onConfirm={() => { void deleteRow(dialog.row, false); }} onCancel={() => { if (!busy) setDialog(null); }} />
      )}
      {dialog?.kind === 'confirm-force' && (
        <ConfirmDialog title="Delete worktree anyway?" body="Git refused because the worktree still holds uncommitted work." destructive busy={busy} testId="git-confirm-force"
          lines={['Deleting anyway discards that work permanently.', `Affected path: ${dialog.row.path}`, `Git reported: ${dialog.reason}`]} confirmLabel="Delete and discard changes"
          onConfirm={() => { void deleteRow(dialog.row, true); }} onCancel={() => { if (!busy) setDialog(null); }} />
      )}
      {dialog?.kind === 'failure' && (
        <ConfirmDialog title={dialog.title} body={dialog.text} confirmLabel="Close" cancelLabel="Dismiss" testId="git-failure" onConfirm={() => setDialog(null)} onCancel={() => setDialog(null)} />
      )}
      {flow?.kind === 'inspecting' && <CheckpointProgressDialog text={`Inspecting checkpoint ${flow.sequence}…`} />}
      {flow?.kind === 'restoring' && <CheckpointProgressDialog text={`Restoring checkpoint ${flow.sequence}…`} />}
      {flow?.kind === 'confirm' && <RestoreConfirmDialog preview={flow.preview} onConfirm={() => { void confirmRestore(flow.preview); }} onCancel={cancelRestore} />}
      {flow?.kind === 'message' && (
        <ConfirmDialog title={flow.title} body={flow.text} confirmLabel="Close" cancelLabel="Dismiss" testId="checkpoint-message" onConfirm={() => setFlow(null)} onCancel={() => setFlow(null)} />
      )}
    </div>
  );
}
