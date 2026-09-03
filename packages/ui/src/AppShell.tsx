import { useEffect, type ReactNode } from 'react';
import { PRIMARY_VIEWS, type ViewId } from '@rotaris/contracts';
import { NavRail } from './NavRail.js';
import { useShellState } from './shell-state.js';

/**
 * REQ-SHELL-024 — vertical layout, top to bottom: title bar; a
 * persistent-notice banner slot; the navigation rail beside the active view;
 * status strip. REQ-SHELL-049: Ctrl+1..7 open the seven views in order.
 *
 * The structure is the specification's, the language is the design
 * system's. A view body is supplied by the caller through `views`; a view
 * without one is empty. The views' contents are drawing work against
 * docs/design/README.md §3.2.
 */
export interface AppShellProps {
  readonly version: string;
  readonly workspaceLabel: string;
  readonly statusItems: readonly string[];
  readonly views?: Partial<Record<ViewId, ReactNode>>;
}

export function AppShell({ version, workspaceLabel, statusItems, views = {} }: AppShellProps) {
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

  const active = PRIMARY_VIEWS.find((v) => v.id === activeView)!;
  const body = views[activeView];

  return (
    <div className="app-shell" data-view={activeView}>
      <header className="title-bar">
        <span className="brand-mark" aria-hidden="true" />
        <span className="title-bar__name">Rotaris</span>
        <span className="title-bar__version mono">{version}</span>
        <span className="title-bar__spacer" />
        <span className="title-bar__workspace">{workspaceLabel}</span>
      </header>
      <div className="notice-slot" role="status" aria-live="polite" />
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
        {statusItems.map((s, i) => (
          <span key={i} className="status-strip__item">{s}</span>
        ))}
      </footer>
    </div>
  );
}
