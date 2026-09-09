import { useEffect, useId, useRef, useState } from 'react';

/**
 * REQ-LIBRARY-141 / REQ-CHAT-043 — the prompt stash dialog, reached from the transcript toolbar's
 * "Apply stash (n)" (REQ-LIBRARY-140) and, since Part AN, from the composer's `/pop` (REQ-LIBRARY-142): the command
 * opens this dialog and removes nothing itself; Apply or Pop inside it decides whether the entry stays.
 *
 * Every string here is the requirement's own. The first row is pre-selected, so Pop is a two-gesture act and
 * never a one-gesture accident on the wrong entry; with an empty stash the list is disabled, carries the stated
 * sentence, and both actions are disabled. Apply copies and keeps; Pop copies and removes — the same pair of
 * deliberate acts the Prompts tab draws (REQ-LIBRARY-107).
 *
 * Part AN: the dialog takes keyboard focus when it opens (the primary action, or Close when there is nothing to
 * pop) and gives it back to what had it when it closes, so `/pop` — typed, completed and submitted from the
 * keyboard (REQ-CHAT-026) — continues on the keyboard, and a keystroke meant for the dialog never lands in the
 * composer behind it. Pop and Apply already return focus to the composer through the load (REQ-CHAT-044).
 */
export const STASH_DIALOG_TITLE = 'Prompt stash';
export const STASH_DIALOG_INTRO = 'Apply copies the selected prompt into the composer and keeps it in the stash. Pop copies it and removes it from the stash.';
export const STASH_DIALOG_EMPTY = 'No stashed prompts. Use Stash beside the composer first.';
/** REQ-LIBRARY-141: minimum 560×360, as logical pixels; the dialog never opens smaller. */
export const STASH_DIALOG_MIN_WIDTH = 560;
export const STASH_DIALOG_MIN_HEIGHT = 360;

export interface StashDialogProps {
  readonly stash: readonly string[];
  /** REQ-LIBRARY-141: Apply keeps (`remove: false`), Pop removes (`remove: true`); both copy into the composer. */
  readonly onTake: (index: number, remove: boolean) => void;
  readonly onClose: () => void;
}

export function StashDialog({ stash, onTake, onClose }: StashDialogProps) {
  const titleId = useId();
  // REQ-LIBRARY-141: the first row is pre-selected. Newest first, so that is index 0.
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Part AN (REQ-LIBRARY-142 / REQ-CHAT-026): focus arrives with the dialog and leaves with it.
  const primary = useRef<HTMLButtonElement>(null);
  const closeControl = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    (primary.current?.disabled ? closeControl.current : primary.current)?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected && document.activeElement === document.body) previous.focus(); };
  }, []);
  const empty = stash.length === 0;
  const index = selected < stash.length ? selected : 0;
  const take = (remove: boolean) => { if (!empty) { onTake(index, remove); onClose(); } };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog stash-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="stash-dialog"
        style={{ minWidth: STASH_DIALOG_MIN_WIDTH, minHeight: STASH_DIALOG_MIN_HEIGHT }}>
        <h2 id={titleId} className="dialog-title">{STASH_DIALOG_TITLE}</h2>
        <p className="dialog-body">{STASH_DIALOG_INTRO}</p>
        {empty ? (
          <ul className="library-list stash-dialog__list is-disabled" aria-label="Stashed prompts" aria-disabled="true" data-testid="stash-dialog-empty">
            <li><span className="library-list__row is-disabled">{STASH_DIALOG_EMPTY}</span></li>
          </ul>
        ) : (
          <ul className="library-list stash-dialog__list" aria-label="Stashed prompts" data-testid="stash-dialog-list">
            {stash.map((text, i) => (
              <li key={i}>
                <button type="button" className={`library-list__row${index === i ? ' is-selected' : ''}`} aria-selected={index === i} data-index={i}
                  data-testid="stash-dialog-row" title={text} onClick={() => setSelected(i)} onDoubleClick={() => { setSelected(i); onTake(i, false); onClose(); }}>{text}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button ref={closeControl} type="button" className="btn btn-ghost" data-testid="stash-dialog-close" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-secondary" disabled={empty} data-testid="stash-dialog-apply" onClick={() => take(false)}>Apply</button>
          <button ref={primary} type="button" className="btn btn-primary" disabled={empty} data-testid="stash-dialog-pop" onClick={() => take(true)}>Pop</button>
        </div>
      </div>
    </div>
  );
}
