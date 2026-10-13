import { useEffect } from 'react';
import { OVERLAY_ORDER, useShellState } from '../shell-state.js';
import { commandForEvent, detectPlatform, type CommandContext, type KeyboardPlatform } from './registry.js';

/**
 * REQ-SHELL-048/049/055/165 — the ONE window-level keydown handler (Part W). It replaces the Ctrl+1..7 effect that
 * lived in `AppShell` and the Ctrl+L effect that lived in the renderer root; no other window listener binds a chord of
 * REQ-SHELL-049. It does three things and nothing else:
 *
 *  - A chord of the registry runs its command — matched exactly (Ctrl, no Alt, no Meta; Shift only where written).
 *    No `globalShortcut`, no re-registration, no fallback chord: a chord the host or an IME consumed never arrives
 *    here and nothing compensates (REQ-SHELL-165); a chord that arrives is prevented from reaching the browser default.
 *  - While a modal surface is open nothing fires (REQ-SHELL-055): the modal answers first. "A modal surface is open" is
 *    read from the document — any element with `aria-modal="true"` — so every dialog the shell already draws (the
 *    confirmations, the session browser, the launch dialog, the palette and the help themselves) counts without
 *    registering, and a chord pressed over a dialog is neither run nor swallowed: it falls through to the dialog.
 *  - Window-level Escape is live ONLY on the Workspace view and resolves in REQ-SHELL-055's order over the closers the
 *    surfaces registered in `shell-state` (the slash popup and the compact drawers register theirs, `WorkspaceView.tsx`;
 *    the transcript search panel registers nothing and closes on Escape only from its own field, recorded in
 *    `docs/defects/window-level-escape-skips-the-open-transcript-search-panel.md`. Until 2026-10-13 this said the slash
 *    popup and the search panel were not built). On the other six views Escape does nothing. Escape is not a command.
 */
export function useCommandShortcuts(ctx: CommandContext, platform: KeyboardPlatform = detectPlatform()): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (modalSurfaceOpen()) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (useShellState.getState().activeView !== 'workspace') return;
        const overlays = useShellState.getState().overlays;
        for (const kind of OVERLAY_ORDER) {
          const close = overlays[kind];
          if (close && close()) { e.preventDefault(); return; }
        }
        return;
      }
      const command = commandForEvent(e, platform);
      if (command === null || !command.available(ctx)) return;
      e.preventDefault();
      command.run(ctx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, platform]);
}

/** REQ-SHELL-055: a modal surface on screen answers keys before the window sees them. */
export function modalSurfaceOpen(doc: Pick<Document, 'querySelector'> | undefined = globalThis.document): boolean {
  return doc !== undefined && doc.querySelector('[aria-modal="true"]') !== null;
}
