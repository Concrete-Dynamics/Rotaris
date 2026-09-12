import { useEffect, useMemo, type ReactNode } from 'react';
import { PRIMARY_VIEWS, type Notice, type NoticeAction, type ViewId } from '@rotaris/contracts';
import type { AcknowledgementStore } from '@rotaris/ui-core';
import { NavRail } from './NavRail.js';
import { WorkspaceChip } from './WorkspaceChip.js';
import { useShellState } from './shell-state.js';
import { Acknowledgements } from './Acknowledgements.js';
import { NoticeBanner } from './Notice.js';
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
/** REQ-SHELL-038: a strip item is text; one carrying an accessible name, a tooltip and a state (the branch, REQ-GIT-122/161) is a record. */
export type StatusItem = string | { readonly text: string; readonly name: string; readonly title?: string | undefined; readonly state?: string | undefined; readonly testId?: string | undefined };

export interface AppShellProps {
  readonly version: string;
  /**
   * Stage B — the ABSOLUTE workspace path, as main resolved it, not a label: REQ-WORKSPACE-149's
   * rules 1 and 2 are display rules, and the tooltip, the accessible description and anything handed
   * to the platform must carry the full path, so the collapsing and the shortening happen at the
   * surface that draws them rather than before they get here.
   */
  readonly workspacePath: string;
  /** The user's home directory, from `shell.hello` — rule 1's `~`; absent means no collapsing. */
  readonly home?: string | undefined;
  /** REQ-WORKSPACE-017's session half; `—` is drawn for its absence, which is all this product has. */
  readonly sessionName?: string | null | undefined;
  /**
   * REQ-SHELL-035: activating the chip opens the chooser flow of REQ-SHELL-021 (`workspace.choose`).
   * `newWindow` is `PD-SHELL-001`'s add route, true when the secondary-activation modifier was held.
   */
  readonly onChooseWorkspace?: ((newWindow: boolean) => void) | undefined;
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
  /** ADR-0048 (Part W): the application-modal registration with main's window registry (`window.modality`). */
  readonly onModality?: ((active: boolean) => void) | undefined;
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

export function AppShell({ version, workspacePath, home, sessionName, onChooseWorkspace, statusItems, views = {}, notice = null, onAcknowledge, onAction, acknowledgements, onOpenSessions, onModality }: AppShellProps) {
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

  // REQ-NOTIFY-021: changing view performs the clear operation, so nothing from the previous view lingers over the new one.
  useEffect(() => { acknowledgements?.getState().clearAll(); }, [activeView, acknowledgements]);

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
        {/* REQ-SHELL-033's order — brand, wordmark, version, the workspace chip in a CENTRED region,
            then the session control. The slot is what the chip measures its label against; see
            `WorkspaceChip.tsx` and the `.title-bar__workspace-slot` rule for why it has a zero basis. */}
        <div className="title-bar__workspace-slot">
          <WorkspaceChip path={workspacePath} home={home} sessionName={sessionName} onChoose={onChooseWorkspace} />
        </div>
        {onOpenSessions && <button type="button" className="btn btn-ghost title-bar__sessions" onClick={onOpenSessions}>Sessions</button>}
      </header>
      <div className="notice-slot" aria-live="polite">
        {notice && <NoticeBanner notice={notice} onAcknowledge={onAcknowledge} onAction={onAction} />}
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
      <footer className="status-strip" aria-label="Status" aria-description="Scroll horizontally to view every status item." tabIndex={0}>
        {statusItems.map((s, i) => (typeof s === 'string'
          ? <span key={i} className="status-strip__item">{s}</span>
          : <span key={i} className="status-strip__item" aria-label={s.name} title={s.title} data-branch-state={s.state} data-testid={s.testId}>{s.text}</span>
        ))}
      </footer>
      {acknowledgements && <Acknowledgements store={acknowledgements} />}
    </div>
  );
}
