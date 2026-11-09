import { useEffect, useState } from 'react';
import { Button as DesignButton } from '../design-system/index.js';

/** REQ-CONFIG-327: a warning prompt with Yes and Cancel, Cancel as the default. Shared with the Security policy card (REQ-SANDBOX-117),
 * which `ConfigSettings.tsx` draws: kept apart from both so neither imports the other back (an import cycle, R-091).
 *
 * REQ-SHELL-055 (`docs/spec/12-desktop-shell-windows/02-title-bar.md`): a modal surface answers Escape ITSELF and always before the
 * window sees it, and every confirmation treats Escape as identical to its declining answer. Until 2026-11-09 this prompt drew the
 * dialog markup and registered nothing, so the delete confirmation on the `web_search` card stayed open under both Escape routes —
 * a `keydown` on `document` and the driver's `chord Escape`; the UI review measured 0 of 2, while the design system's own
 * `ConfirmDialog.tsx` had answered Escape and returned the focus since PD-ORCH-005 phase 5. On the Settings view the window-level
 * handler is not a second route (REQ-SHELL-055 makes it live only on the Workspace, and it stands down while any `aria-modal` surface
 * is open), so the dialog's own listener is the only one: no caller of this prompt registers an Escape of its own.
 */
export function Confirm({ title, body, onYes, onCancel, busy = false }: { title: string; body: string; onYes: () => void; onCancel: () => void; busy?: boolean | undefined }) {
  // The same contract as `ConfirmDialog.tsx`, and the same effects: Escape answers with the declining answer while the prompt can
  // still be answered, and closing by any route hands focus back to the control that opened it. WAI-ARIA's dialog pattern: focus
  // never falls to `body` — the UI review measured it there after Cancel, on a button that had been focused before the prompt opened.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  // The opener is read on the first render, before `autoFocus` moves focus into the dialog at commit.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); }, [opener]);
  /**
   * R4-FND-1 (Opus 5.5 review, round 4, 2026-11-09): the answers are held while `busy`, but NOT with `disabled`.
   * Disabling the button that holds focus makes the browser drop focus to `body` — and since the `web_search` card now
   * keeps this dialog open for the length of the delete (R3-FND-1), that would park focus on `body` for the whole
   * write-and-re-read window, which is exactly what the fix set out to prevent. `aria-disabled` states the same thing
   * to assistive technology, keeps the button focusable so focus stays inside the dialog, and each handler ignores a
   * press while `busy` — so no second answer can be taken and Escape stays suppressed. This is the pattern the design
   * system's own controls use for a held action.
   */
  const held = busy;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title">
        <h2 id="settings-confirm-title" className="dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus aria-disabled={held || undefined} onClick={() => { if (!held) onCancel(); }}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-warning" aria-disabled={held || undefined} onClick={() => { if (!held) onYes(); }}>Yes</DesignButton>
        </div>
      </div>
    </div>
  );
}
