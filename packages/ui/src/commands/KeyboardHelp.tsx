import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { Kbd } from './Kbd.js';
import { COMMANDS, shortcutCommands, type Command, type KeyboardPlatform } from './registry.js';
import { useApplicationModal } from './useApplicationModal.js';

/**
 * REQ-SHELL-054 — the keyboard-help dialog (design gap G13; `Kbd` is its primitive): an informational,
 * application-modal dialog titled "Rotaris keyboard help" listing "{shortcut} — {label}" (the shortcut emphasised as
 * keycaps) for every registered command that has a shortcut, from the ONE registry (REQ-SHELL-048). Escape is not a row
 * (REQ-SHELL-048): a prose line says what Escape does and where — it closes the overlay in front, and only on the
 * Workspace view (REQ-SHELL-055). Its only answer is acknowledgement: Escape or the Close control (REQ-SHELL-055).
 */
export const ESCAPE_HELP_LINE = 'Escape closes the overlay in front of you — the search panel, then the side drawers — and only while the Workspace view is showing. On the other views Escape does nothing.';

export interface KeyboardHelpProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onModality?: ((active: boolean) => void) | undefined;
  readonly platform?: KeyboardPlatform | undefined;
  readonly commands?: readonly Command[] | undefined;
}

export function KeyboardHelp({ open, onClose, onModality, platform, commands = COMMANDS }: KeyboardHelpProps) {
  useApplicationModal(open, onModality);
  if (!open) return null;
  return <HelpDialog onClose={onClose} platform={platform} commands={commands} />;
}

function HelpDialog({ onClose, platform, commands }: { onClose: () => void; platform: KeyboardPlatform | undefined; commands: readonly Command[] }) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  useEffect(() => {
    restoreTo.current = document.activeElement;
    closeButton.current?.focus();
    const onFocusIn = (e: FocusEvent) => { if (dialog.current && !dialog.current.contains(e.target as Node)) closeButton.current?.focus(); };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  const close = () => {
    flushSync(() => onClose());
    const previous = restoreTo.current;
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); closeButton.current?.focus(); }
  };
  const rows = shortcutCommands(commands);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialog} className="dialog keyboard-help" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="keyboard-help" onKeyDown={onKeyDown}>
        <h2 id={titleId} className="dialog-title">Rotaris keyboard help</h2>
        <ul className="keyboard-help__rows" aria-label="Shortcuts">
          {rows.map((c) => (
            <li key={c.id} className="keyboard-help__row" data-command={c.id} data-chord={c.shortcut}>
              <Kbd chord={c.shortcut} platform={platform} className="keyboard-help__chord" />
              <span className="keyboard-help__dash" aria-hidden="true">—</span>
              <span className="keyboard-help__label">{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="dialog-body keyboard-help__escape" data-testid="keyboard-help-escape">{ESCAPE_HELP_LINE}</p>
        <div className="dialog-actions">
          <button ref={closeButton} type="button" className="btn btn-primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
