import { useEffect } from 'react';

/**
 * ADR-0048's application modality, second execution (Part W). An application-modal surface is rendered in-window as an
 * overlay AND registered with main's window registry, which disables input in every other window of this main
 * window's family for as long as the surface is open. The platform has no application-modal primitive (its modal flag
 * is window-modal against a parent), so the registration is ours: `onModality(true)` on open, `onModality(false)` on
 * close or unmount, and main's registry pairs them. The renderer root supplies `onModality` as the `window.modality`
 * command; a surface outside the main window supplies nothing and the hook is inert.
 *
 * Used by the command palette and the keyboard help (REQ-SHELL-051/054) and by nothing else: the pause dialog, the
 * approval dialog and the confirmations stay window-modal, as ADR-0048 says.
 */
export function useApplicationModal(active: boolean, onModality: ((active: boolean) => void) | undefined): void {
  useEffect(() => {
    if (!active || !onModality) return;
    onModality(true);
    return () => onModality(false);
  }, [active, onModality]);
}
