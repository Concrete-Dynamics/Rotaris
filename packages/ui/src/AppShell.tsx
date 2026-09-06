import { useMemo, type ReactNode } from 'react';
import { PRIMARY_VIEWS, type ViewId } from '@rotaris/contracts';
import { NavRail } from './NavRail.js';
import { useShellState } from './shell-state.js';
import { markMotionStart } from './motion.js';
import { CommandPalette } from './commands/CommandPalette.js';
import { KeyboardHelp } from './commands/KeyboardHelp.js';
import { commandById, detectPlatform, type CommandContext } from './commands/registry.js';
import { useCommandShortcuts } from './commands/useCommandShortcuts.js';

/**
 * REQ-SHELL-024 — vertical layout, top to bottom: title bar; a
 * persistent-notice banner slot; the navigation rail beside the active view;
 * status strip. REQ-SHELL-048/049 (Part W): the ONE shortcut handler is
 * `useCommandShortcuts` over the command registry — Ctrl+1..7, Ctrl+K, Ctrl+,,
 * Ctrl+L, Ctrl+Return, F1 — and the two application-modal dialogs (the
 * palette, the keyboard help) are mounted here, once per main window.
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

/** REQ-SHELL-038: a strip item is text; one carrying an accessible name, a tooltip and a state (the branch, REQ-GIT-122/161) is a record. */
export type StatusItem = string | { readonly text: string; readonly name: string; readonly title?: string | undefined; readonly state?: string | undefined; readonly testId?: string | undefined };

export interface AppShellProps {
  readonly version: string;
  readonly workspaceLabel: string;
  readonly statusItems: readonly StatusItem[];
  readonly views?: Partial<Record<ViewId, ReactNode>>;
  readonly notice?: ShellNotice | null;
  readonly onAcknowledge?: ((id: number) => void) | undefined;
  readonly onRecover?: ((command: string) => void) | undefined;
  readonly onOpenSessions?: (() => void) | undefined;
  /** ADR-0048 (Part W): the application-modal registration with main's window registry (`window.modality`). */
  readonly onModality?: ((active: boolean) => void) | undefined;
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

/**
 * Runs `fn` now if it can do its work now, and otherwise two frames on, once a view switch has painted and the surface
 * it needs is mounted. The immediate attempt is not an optimisation: Ctrl+L and Ctrl+Return are usually pressed while
 * the Workspace view is already showing, and deferring them there would let the very next keystroke reach whatever
 * held focus before — the caret has to arrive within the same turn the chord did (REQ-CHAT-002).
 */
function nowOrAfterMount(fn: () => boolean): void {
  if (fn()) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { fn(); }));
}

/** The composer's input, once the Workspace view holds it. */
function composerInput(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('.composer__input');
}

/**
 * The command context over the shell state — the registry's commands run against this. `focusComposer` and
 * `submitRun` wait for the Workspace view to mount (the views are mounted by name); `submitRun` submits only while
 * the composer's registration says its send control is enabled (REQ-SHELL-049), otherwise it does nothing.
 */
export function useCommandContext(): CommandContext {
  const activeView = useShellState((s) => s.activeView);
  return useMemo<CommandContext>(() => ({
    activeView,
    switchView: (id) => useShellState.getState().switchView(id),
    openSettings: (category) => useShellState.getState().openSettings(category),
    openPalette: () => useShellState.getState().openPalette(),
    openKeyboardHelp: () => useShellState.getState().openKeyboardHelp(),
    focusComposer: () => nowOrAfterMount(() => { const input = composerInput(); if (!input) return false; input.focus(); return true; }),
    submitRun: () => nowOrAfterMount(() => { const composer = useShellState.getState().composer; if (!composer) return false; if (composer.enabled) composer.submit(); return true; }),
  }), [activeView]);
}

export function AppShell({ version, workspaceLabel, statusItems, views = {}, notice = null, onAcknowledge, onRecover, onOpenSessions, onModality }: AppShellProps) {
  const activeView = useShellState((s) => s.activeView);
  const switchView = useShellState((s) => s.switchView);
  const paletteOpen = useShellState((s) => s.paletteOpen);
  const helpOpen = useShellState((s) => s.helpOpen);
  const closePalette = useShellState((s) => s.closePalette);
  const closeKeyboardHelp = useShellState((s) => s.closeKeyboardHelp);
  const ctx = useCommandContext();
  const platform = useMemo(() => detectPlatform(), []);
  useCommandShortcuts(ctx, platform);
  // REQ-SHELL-028 + REQ-SHELL-058: the rail's tooltip stays "Open {Label}"; its accessible description adds the chord.
  const railItems = useMemo(() => PRIMARY_VIEWS.map((v) => ({ ...v, shortcut: commandById(`view.${v.id}`)?.shortcut })), []);

  const active = PRIMARY_VIEWS.find((v) => v.id === activeView)!;
  const body = views[activeView];

  return (
    <div className="app-shell" data-view={activeView}>
      <CommandPalette open={paletteOpen} ctx={ctx} onClose={closePalette} onModality={onModality} platform={platform} />
      <KeyboardHelp open={helpOpen} onClose={closeKeyboardHelp} onModality={onModality} platform={platform} />
      <header className="title-bar">
        <span className="brand-mark" aria-hidden="true" />
        <span className="title-bar__name">Rotaris</span>
        <span className="title-bar__version mono">{version}</span>
        <span className="title-bar__spacer" />
        {onOpenSessions && <button type="button" className="btn btn-ghost title-bar__sessions" onClick={onOpenSessions}>Sessions</button>}
        <span className="title-bar__workspace">{workspaceLabel}</span>
      </header>
      <div className="notice-slot" aria-live="polite">
        {notice && <NoticeBanner notice={notice} onAcknowledge={onAcknowledge} onRecover={onRecover} />}
      </div>
      <div className="body">
        <NavRail items={railItems} active={activeView} onSelect={(id: ViewId) => switchView(id)} platform={platform} />
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
    </div>
  );
}
