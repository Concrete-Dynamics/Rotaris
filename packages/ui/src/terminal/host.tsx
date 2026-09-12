import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { TerminalStreamSet } from './streams.js';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * Part AL2 — what a renderer that draws transcript previews holds for the terminal, as ONE value the surfaces read:
 * the renderer's subscription point (`TerminalStreamSet`, ADR-0021: the preview, the persona card and the window
 * subscribe at one point) and the way to the pop-out window (`window.openTerminal`, REQ-SHELL-080). The transcript
 * pane reads it for the row previews and the click that requests the pop-out (REQ-CHAT-076); the Workspace toolbar's
 * control reads it for its counts (REQ-SHELL-108); the command registry's `Open terminal` entry reaches it through
 * the module-level opener below, because the registry's context is the shell's and carries no terminal.
 *
 * It is a context and not a prop so that neither `WorkspaceView`'s props nor `TranscriptPane`'s change for the
 * terminal's sake (the plan's slot rule): the renderer root provides it once around the Workspace, and a surface with
 * no provider — a test, the proof page — reads `null` and draws what it drew before.
 */
export interface TerminalHost {
  readonly streams: TerminalStreamSet;
  /** REQ-SHELL-080/085: open the main window's terminal window, bringing `streamId` forward when it is retained. */
  open(streamId?: string): void;
}

const HostContext = createContext<TerminalHost | null>(null);

let opener: ((streamId?: string) => void) | null = null;
/** The registry's `Open terminal` entry (Ctrl+Shift+T) opens through this; the provider registers it. */
export function registerTerminalOpener(fn: ((streamId?: string) => void) | null): void { opener = fn; }
/** Returns false when no terminal host is mounted in this window (the entry then does nothing, stated in `registry.ts`). */
export function openTerminalWindow(streamId?: string): boolean {
  if (opener === null) return false;
  opener(streamId);
  return true;
}

export function TerminalHostProvider({ host, children }: { host: TerminalHost; children: ReactNode }) {
  useEffect(() => { registerTerminalOpener((id) => host.open(id)); return () => registerTerminalOpener(null); }, [host]);
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
export function useTerminalHost(): TerminalHost | null { return useContext(HostContext); }

/**
 * REQ-SHELL-105/108: the running count and the session total, re-rendered only when either changes — the registry's
 * listener fires on every frame, and a snapshot string keeps a stream of deltas from repainting the control.
 */
export function useTerminalCounts(streams: TerminalStreamSet | null): { readonly running: number; readonly total: number } {
  const snapshot = useSyncExternalStore(
    (onChange) => (streams ? streams.subscribe(() => onChange()) : () => undefined),
    () => (streams ? `${streams.running()}:${streams.totalSeen}` : '0:0'),
  );
  const [running, total] = snapshot.split(':').map(Number);
  return { running: running ?? 0, total: total ?? 0 };
}

/** REQ-SHELL-108's strings, in one place. */
export const TOOLBAR = Object.freeze({
  label: (running: number): string => (running > 0 ? `Terminal (${running})` : 'Terminal'),
  name: (running: number): string => (running > 0 ? `Open terminal (${running} running)` : 'Open terminal'),
  description: (running: number, total: number): string => (total > 0
    ? `${total} terminal${total === 1 ? '' : 's'} this session, ${running} running. Opens the terminal window.`
    : 'A terminal appears when an agent runs a command. Opens the terminal window, which is empty until then.'),
});

/**
 * REQ-SHELL-080/108: the Workspace toolbar's terminal control — always enabled, including before any command has run
 * (the window's empty state covers that); "Terminal" or "Terminal ({n})" while streams are live; the accessible name
 * "Open terminal" or "Open terminal ({n} running)"; the description states the counts or explains that a terminal
 * appears when an agent runs a command. Drawn like the control beside it in the toolbar (the stash opener): a compact
 * ghost button, the design's own class, no container of its own.
 */
export function TerminalToolbarControl() {
  const host = useTerminalHost();
  const { running, total } = useTerminalCounts(host?.streams ?? null);
  const description = TOOLBAR.description(running, total);
  return (
    <DesignButton
      type="button"
      className="btn btn-ghost btn-compact"
      aria-label={TOOLBAR.name(running)}
      aria-description={description}
      title={description}
      data-testid="transcript-terminal"
      data-running={running}
      data-total={total}
      onClick={() => { if (host) host.open(); else openTerminalWindow(); }}
    >{TOOLBAR.label(running)}</DesignButton>
  );
}
