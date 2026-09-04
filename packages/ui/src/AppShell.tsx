import { useEffect, type ReactNode } from 'react';
import { PRIMARY_VIEWS, type ViewId } from '@rotaris/contracts';
import { NavRail } from './NavRail.js';
import { useShellState } from './shell-state.js';
import { markMotionStart } from './motion.js';

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
export interface ShellNotice {
  readonly id: number;
  readonly severity: 'info' | 'warning' | 'error';
  readonly headline: string;
  readonly detail?: string | undefined;
  /** REQ-NOTIFY-223/224: an action the notice offers, by the identifier the renderer root resolves. */
  readonly recovery?: readonly { readonly label: string; readonly command: string }[] | undefined;
}

export interface AppShellProps {
  readonly version: string;
  readonly workspaceLabel: string;
  readonly statusItems: readonly string[];
  readonly views?: Partial<Record<ViewId, ReactNode>>;
  readonly notice?: ShellNotice | null;
  readonly onAcknowledge?: ((id: number) => void) | undefined;
  readonly onRecover?: ((command: string) => void) | undefined;
}

const GLYPH: Record<ShellNotice['severity'], string> = { info: 'i', warning: '!', error: '×' };

export function NoticeBanner({ notice, onAcknowledge, onRecover }: { notice: ShellNotice; onAcknowledge?: ((id: number) => void) | undefined; onRecover?: ((command: string) => void) | undefined }) {
  return (
    <div ref={(element) => { if (element) markMotionStart(element); }} className={`notice notice--${notice.severity}`} role={notice.severity === 'error' ? 'alert' : 'status'}>
      <span className="notice__glyph" aria-hidden="true">{GLYPH[notice.severity]}</span>
      <div className="notice__text">
        <span className="notice__headline">{notice.headline}</span>
        {notice.detail && (
          <details className="notice__details">
            <summary>Details</summary>
            <pre className="notice__detail mono">{notice.detail}</pre>
            <button type="button" className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(notice.detail ?? ''); }}>Copy</button>
          </details>
        )}
      </div>
      {(notice.recovery ?? []).map((r) => (
        <button key={r.command} type="button" className="btn btn-secondary notice__action" onClick={() => onRecover?.(r.command)}>{r.label}</button>
      ))}
      <button type="button" className="btn btn-ghost notice__dismiss" aria-label="Dismiss notice" onClick={() => onAcknowledge?.(notice.id)}>Dismiss</button>
    </div>
  );
}

export function AppShell({ version, workspaceLabel, statusItems, views = {}, notice = null, onAcknowledge, onRecover }: AppShellProps) {
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
      <div className="notice-slot" aria-live="polite">
        {notice && <NoticeBanner notice={notice} onAcknowledge={onAcknowledge} onRecover={onRecover} />}
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
        {statusItems.map((s, i) => (
          <span key={i} className="status-strip__item">{s}</span>
        ))}
      </footer>
    </div>
  );
}
