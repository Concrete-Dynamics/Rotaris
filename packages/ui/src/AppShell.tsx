import { useEffect, type ReactNode } from 'react';
import { PRIMARY_VIEWS, type Notice, type NoticeAction, type ViewId } from '@rotaris/contracts';
import type { AcknowledgementStore } from '@rotaris/ui-core';
import { NavRail } from './NavRail.js';
import { useShellState } from './shell-state.js';
import { Acknowledgements } from './Acknowledgements.js';
import { NoticeBanner } from './Notice.js';

/**
 * REQ-SHELL-024 — vertical layout, top to bottom: title bar; a
 * persistent-notice banner slot; the navigation rail beside the active view;
 * status strip. REQ-SHELL-049: Ctrl+1..7 open the seven views in order.
 *
 * REQ-SHELL-114 / REQ-SHELL-116 / REQ-NOTIFY-005: one persistent notice at a
 * time, inline under the title bar, carrying severity (a rule and a glyph,
 * never a filled background — design G1), a headline that is one plain
 * sentence, optional selectable detail with a copy control, and a dismiss
 * control. The structure is the specification's, the language the design
 * system's. A view body is supplied by the caller through `views`.
 */
/** REQ-SHELL-038: a strip item is text; one carrying an accessible name, a tooltip and a state (the branch, REQ-GIT-122/161) is a record. */
export type StatusItem = string | { readonly text: string; readonly name: string; readonly title?: string | undefined; readonly state?: string | undefined; readonly testId?: string | undefined };

export interface AppShellProps {
  readonly version: string;
  readonly workspaceLabel: string;
  readonly statusItems: readonly StatusItem[];
  readonly views?: Partial<Record<ViewId, ReactNode>>;
  /** ADR-0049: the one current notice, mirrored from main's store; the banner itself is `Notice.tsx`. */
  readonly notice?: Notice | null;
  readonly onAcknowledge?: ((id: number) => void) | undefined;
  /** REQ-NOTIFY-044: the closed action vocabulary; the renderer root dispatches a member. */
  readonly onAction?: ((action: NoticeAction) => void) | undefined;
  /** REQ-NOTIFY-013 / REQ-SHELL-112: this window's ONE transient stack. */
  readonly acknowledgements?: AcknowledgementStore | undefined;
  readonly onOpenSessions?: (() => void) | undefined;
}

export function AppShell({ version, workspaceLabel, statusItems, views = {}, notice = null, onAcknowledge, onAction, acknowledgements, onOpenSessions }: AppShellProps) {
  const activeView = useShellState((s) => s.activeView);
  const switchView = useShellState((s) => s.switchView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 7) {
        e.preventDefault();
        switchView(PRIMARY_VIEWS[n - 1]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchView]);

  // REQ-NOTIFY-021: changing view performs the clear operation, so nothing from the previous view lingers over the new one.
  useEffect(() => { acknowledgements?.getState().clearAll(); }, [activeView, acknowledgements]);

  const active = PRIMARY_VIEWS.find((v) => v.id === activeView)!;
  const body = views[activeView];

  return (
    <div className="app-shell" data-view={activeView}>
      <header className="title-bar">
        <span className="brand-mark" aria-hidden="true" />
        <span className="title-bar__name">Rotaris</span>
        <span className="title-bar__version mono">{version}</span>
        <span className="title-bar__spacer" />
        {onOpenSessions && <button type="button" className="btn btn-ghost title-bar__sessions" onClick={onOpenSessions}>Sessions</button>}
        <span className="title-bar__workspace">{workspaceLabel}</span>
      </header>
      <div className="notice-slot" aria-live="polite">
        {notice && <NoticeBanner notice={notice} onAcknowledge={onAcknowledge} onAction={onAction} />}
      </div>
      <div className="body">
        <NavRail items={PRIMARY_VIEWS} active={activeView} onSelect={(id: ViewId) => switchView(id)} />
        <main className="view" aria-label={active.label}>
          {body ?? (
            <div className="view__empty">
              <h1 className="display">{active.label}</h1>
              <p className="text-secondary">Not drawn yet. Structure from REQ-SHELL-023; language from docs/design/system.</p>
            </div>
          )}
        </main>
      </div>
      <footer className="status-strip" aria-label="Status">
        {statusItems.map((s, i) => (typeof s === 'string'
          ? <span key={i} className="status-strip__item">{s}</span>
          : <span key={i} className="status-strip__item" aria-label={s.name} title={s.title} data-branch-state={s.state} data-testid={s.testId}>{s.text}</span>
        ))}
      </footer>
      {acknowledgements && <Acknowledgements store={acknowledgements} />}
    </div>
  );
}
