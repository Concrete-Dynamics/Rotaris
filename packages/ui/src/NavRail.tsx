import { Fragment } from 'react';
import type { SessionListItemPayload, ViewGroup, ViewId } from '@rotaris/contracts';
import { describeWithShortcut, type KeyboardPlatform } from './commands/registry.js';
import { Button as DesignButton } from './design-system/index.js';
import { sessionDot } from './OverviewView.js';

/**
 * The navigation sidebar (PD-SHELL-016), fed its views by the caller from REQ-SHELL-023's single definition and its
 * sessions from the caller's own `session.list` read.
 *
 * It has two forms and one markup. **Open**, it is a column of the sidebar's width: the start control; Workspace and
 * Overview, the two faces of the session in hand; under them the workspace's sessions; then, at the foot, the project's
 * views and Settings. **Folded**, it is the rail REQ-SHELL-027 described — one button per view, icon above label — with
 * one control between the session views and the project's that stands for the list and opens the browser. The window's width folds it
 * (`AppShell` resolves it, below `SIDEBAR_FOLD_BELOW`) and the fold control overrides the width either way.
 *
 * REQ-SHELL-028: the view buttons are mutually exclusive (`aria-checked` on `role="radio"` inside one
 * `role="radiogroup"`) but NOT arrow-navigable: each is its own tab stop, so `tabIndex=0` on every item and no roving
 * index; tooltip and accessible description "Open {Label}"; click, Space and Return switch the view. Arrow keys are
 * swallowed, because the browser default for `role="radio"` would move the selection.
 * REQ-SHELL-029: a label is never elided in either form — the open form's column is wider than the longest label and
 * the folded form sizes to it.
 * REQ-SHELL-058: where an item carries a chord, the accessible description is the tooltip sentence with the
 * platform-formatted chord in parentheses; the tooltip itself stays REQ-SHELL-028's exact sentence.
 *
 * The sessions list is OQ-506's surface for the returning operator, carried from the Overview's card to every view
 * (PD-SHELL-016 clause 3): a row focuses its session and shows the Workspace. It lists and never manages — repair,
 * delete and export stay the session browser's, reached by "List sessions" (REQ-MONITOR-164's label, so the browser has
 * one name on a screen). It stands between the session views and the project views in the document as it does on
 * screen, so the focus order is the reading order. The followed row is marked by its ink and `aria-current`, never by
 * the selection fill, which is the active view's alone.
 */
export interface NavRailItem {
  readonly id: ViewId;
  readonly label: string;
  readonly icon: string;
  readonly group?: ViewGroup | undefined;
  readonly shortcut?: string | undefined;
}

export interface NavRailSessions {
  readonly rows: readonly SessionListItemPayload[];
  readonly state: 'idle' | 'loading' | 'error';
  /** The session this window follows, or null. */
  readonly currentId: string | null;
  readonly onOpen: (sessionId: string) => void;
  /** Opens the session browser (REQ-SHELL-126). */
  readonly onBrowse: () => void;
  /** Opens the start-session dialog (REQ-SHELL-125). */
  readonly onNew: () => void;
}

export interface NavRailProps {
  readonly items: readonly NavRailItem[];
  readonly active: ViewId;
  readonly onSelect: (id: ViewId) => void;
  readonly platform?: KeyboardPlatform | undefined;
  /** The groups in order, each with its heading or none; absent draws the items as one unheaded group. */
  readonly groups?: readonly { readonly id: ViewGroup; readonly label: string | null }[] | undefined;
  /** Absent in a window with no workspace bridge (tests, the rows proof): the sidebar then draws its views alone. */
  readonly sessions?: NavRailSessions | undefined;
  /** Whether the sidebar is drawn as the rail; the shell resolves the user's choice against the window's width. */
  readonly folded?: boolean | undefined;
  /** Receives whether the sidebar is folded at the moment of the press. */
  readonly onToggleFold?: ((foldedNow: boolean) => void) | undefined;
}

/** How many sessions the sidebar lists before it leaves the rest to the browser; the remainder is counted under the list. */
export const SIDEBAR_SESSION_LIMIT = 12;

function ViewButton({ it, active, onSelect, platform }: { it: NavRailItem; active: ViewId; onSelect: (id: ViewId) => void; platform: KeyboardPlatform }) {
  const checked = it.id === active;
  const title = `Open ${it.label}`;
  return (
    <DesignButton
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={it.label}
      aria-description={describeWithShortcut(title, it.shortcut, platform)}
      title={title}
      tabIndex={0}
      data-view={it.id}
      className={checked ? 'nav-item is-active' : 'nav-item'}
      onClick={() => onSelect(it.id)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect(it.id); }
        if (e.key.startsWith('Arrow')) e.preventDefault();
      }}
    >
      <i className={`ph ${it.icon}`} aria-hidden="true" />
      <span>{it.label}</span>
    </DesignButton>
  );
}

/** What stands under a session's label: what it is doing while that matters now, and otherwise when it last moved. */
function sessionMeta(row: SessionListItemPayload): string {
  if (row.awaitingInput) return 'needs you';
  if (row.busy) return 'running';
  return row.relativeTime;
}

function sessionsEmptySentence(state: NavRailSessions['state']): string {
  if (state === 'loading') return 'Reading sessions…';
  if (state === 'error') return 'The session list could not be read. List sessions shows why.';
  return 'No sessions yet. A run you start is kept here.';
}

export function NavRail({ items, active, onSelect, platform = 'windows', groups, sessions, folded = false, onToggleFold }: NavRailProps) {
  const headed = groups ? groups.filter((g) => g.id !== 'system') : [{ id: 'work' as ViewGroup, label: null }];
  const members = (group: ViewGroup) => (groups ? items.filter((it) => it.group === group) : items);
  const foot = groups ? items.filter((it) => it.group === 'system') : [];
  const listed = sessions ? sessions.rows.slice(0, SIDEBAR_SESSION_LIMIT) : [];
  // The folded form's one sessions control: `needs` outranks `running`, and the followed session is not counted, since its state is the view's own.
  const others = sessions ? sessions.rows.filter((row) => row.sessionId !== sessions.currentId) : [];
  const attention = others.some((row) => row.awaitingInput) ? 'needs' : others.some((row) => row.busy) ? 'running' : 'none';
  const followed = sessions ? sessions.rows.find((row) => row.sessionId === sessions.currentId) ?? null : null;
  const browseTitle = `List sessions${followed ? ` — following ${followed.label}` : ''}${attention === 'needs' ? '; another session needs you' : attention === 'running' ? '; another session is running' : ''}`;
  return (
    <nav className="nav-rail" aria-label="Primary" data-folded={folded ? '1' : '0'}>
      {sessions && (
        <DesignButton type="button" className="btn btn-secondary nav-rail__new" title="Start a new session" aria-label="New session" onClick={sessions.onNew} data-testid="sidebar-new-session">
          <i className="ph ph-plus" aria-hidden="true" />
          <span>New session</span>
        </DesignButton>
      )}
      <div className="nav-rail__views" role="radiogroup" aria-label="Primary views">
        {headed.map((g, index) => (
          <Fragment key={g.id}>
            <div className="nav-rail__group" role="presentation" data-group={g.id}>
              {g.label !== null && <span className="nav-rail__heading" aria-hidden="true">{g.label}</span>}
              {members(g.id).map((it) => <ViewButton key={it.id} it={it} active={active} onSelect={onSelect} platform={platform} />)}
            </div>
            {index === 0 && sessions && (
              <>
                {/* Folded, the list is one control: it names the followed session to assistive technology, shows the most urgent state of the others, and opens the browser. */}
                <DesignButton type="button" className="nav-rail__browse" data-testid="sidebar-sessions-button" data-attention={attention} title={browseTitle} aria-label={browseTitle} onClick={sessions.onBrowse}>
                  <i className="ph ph-stack" aria-hidden="true" />
                  <span>Sessions</span>
                </DesignButton>
                <section className="nav-rail__sessions" aria-label="Sessions" data-testid="sidebar-sessions" data-state={sessions.state}>
                  <header className="nav-rail__sessions-head">
                    <span className="nav-rail__heading">Sessions</span>
                    <DesignButton type="button" className="btn btn-link nav-rail__all" onClick={sessions.onBrowse} title="Open the session browser: search, repair, export and delete">List sessions</DesignButton>
                  </header>
                  {listed.length === 0
                    ? <p className="nav-rail__sessions-empty" data-testid="sidebar-sessions-empty">{sessionsEmptySentence(sessions.state)}</p>
                    : (
                      <ul className="nav-rail__session-list">
                        {listed.map((row) => {
                          const current = row.sessionId === sessions.currentId;
                          const dot = sessionDot(row, current);
                          return (
                            <li key={row.sessionId}>
                              <DesignButton
                                type="button" className="nav-session" data-session={row.sessionId} data-current={current ? '1' : '0'}
                                aria-current={current ? 'true' : undefined}
                                title={`${row.label} — ${sessionMeta(row)}`}
                                onClick={() => sessions.onOpen(row.sessionId)}
                              >
                                <span className={`status-dot ov-dot--${dot.tone}${dot.pulse ? ' is-pulsing' : ''}`} aria-hidden="true" />
                                <span className="nav-session__label">{row.label}</span>
                                <span className="nav-session__meta">{sessionMeta(row)}</span>
                              </DesignButton>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  {sessions.rows.length > listed.length && <p className="nav-rail__sessions-more">{sessions.rows.length - listed.length} more in List sessions.</p>}
                </section>
              </>
            )}
          </Fragment>
        ))}
        {foot.length > 0 && (
          <div className="nav-rail__group nav-rail__foot" role="presentation" data-group="system">
            {foot.map((it) => <ViewButton key={it.id} it={it} active={active} onSelect={onSelect} platform={platform} />)}
          </div>
        )}
      </div>
      {onToggleFold && (
        <DesignButton
          type="button" className="nav-rail__fold" data-testid="sidebar-fold"
          aria-label={folded ? 'Open the sidebar' : 'Fold the sidebar'} aria-expanded={!folded} title={folded ? 'Open the sidebar' : 'Fold the sidebar'}
          onClick={() => onToggleFold(folded)}
        >
          <i className="ph ph-sidebar-simple" aria-hidden="true" />
        </DesignButton>
      )}
    </nav>
  );
}
