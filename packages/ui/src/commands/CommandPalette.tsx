import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { Kbd } from './Kbd.js';
import { activateCommand, COMMANDS, filterCommands, type Command, type CommandContext, type KeyboardPlatform } from './registry.js';
import { useApplicationModal } from './useApplicationModal.js';

/**
 * REQ-SHELL-051/052/053 — the command palette: an application-modal dialog titled "Rotaris commands", 560×420 (the
 * spec's figure, fixed in `shell.css` under `.cmdk--palette`), accessible name "Rotaris command palette", a heading
 * "Commands", a filter field (placeholder "Type an action…", accessible name "Filter commands") and a results list
 * (accessible name "Available commands"). Rows show the label then the chord as keycaps; keywords are matched and never
 * displayed. The first row is auto-selected whenever results exist; Up/Down move; Return activates — the dialog closes
 * FIRST (a flushed render, focus restored to the element that had it) and the command runs after; Escape closes with
 * nothing run. Focus is trapped in the dialog while it is open. Craft: the design system's `.cmdk-*` as a flat list
 * (no groups: the vocabulary is one list, REQ-SHELL-048). Modality across windows: `useApplicationModal`.
 */
export interface CommandPaletteProps {
  readonly open: boolean;
  readonly ctx: CommandContext;
  readonly onClose: () => void;
  readonly onModality?: ((active: boolean) => void) | undefined;
  readonly platform?: KeyboardPlatform | undefined;
  readonly commands?: readonly Command[] | undefined;
}

export function CommandPalette({ open, ctx, onClose, onModality, platform, commands = COMMANDS }: CommandPaletteProps) {
  useApplicationModal(open, onModality);
  if (!open) return null;
  return <PaletteDialog ctx={ctx} onClose={onClose} platform={platform} commands={commands} />;
}

function PaletteDialog({ ctx, onClose, platform, commands }: { ctx: CommandContext; onClose: () => void; platform: KeyboardPlatform | undefined; commands: readonly Command[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const headingId = useId();
  const listId = useId();
  const results = useMemo(() => filterCommands(query, commands).filter((c) => c.available(ctx)), [query, commands, ctx]);
  // REQ-SHELL-052: the first row is auto-selected whenever there are results; the selection never points past the list.
  const current = results.length === 0 ? -1 : Math.min(selected, results.length - 1);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    input.current?.focus();
    // Focus trapped: whatever tries to leave the dialog lands back in the filter field.
    const onFocusIn = (e: FocusEvent) => { if (dialog.current && !dialog.current.contains(e.target as Node)) input.current?.focus(); };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  /** Closes synchronously — the dialog is out of the document when this returns — and gives focus back (REQ-SHELL-052). */
  const close = () => {
    flushSync(() => onClose());
    const previous = restoreTo.current;
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
  const activate = (command: Command) => activateCommand(command, ctx, close);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length > 0) setSelected((current + 1) % results.length); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length > 0) setSelected((current - 1 + results.length) % results.length); return; }
    if (e.key === 'Enter') { e.preventDefault(); const c = results[current]; if (c) activate(c); return; }
    if (e.key === 'Tab') { e.preventDefault(); input.current?.focus(); }
  };
  const activeRowId = current >= 0 ? `${listId}-${current}` : undefined;

  return (
    <div className="cmdk-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialog} className="cmdk cmdk--palette" role="dialog" aria-modal="true" aria-label="Rotaris command palette" aria-describedby={headingId} data-testid="command-palette" data-title="Rotaris commands" onKeyDown={onKeyDown}>
        <div className="cmdk-head">
          <span className="cmdk-title mono" data-testid="command-palette-title">Rotaris commands</span>
          <input
            ref={input}
            className="cmdk-input"
            type="text"
            role="combobox"
            aria-label="Filter commands"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeRowId}
            placeholder="Type an action…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => { setQuery(e.currentTarget.value); setSelected(0); }}
            data-testid="command-palette-filter"
          />
          <Kbd chord="Esc" platform={platform} />
        </div>
        <h2 id={headingId} className="cmdk-group cmdk-heading">Commands</h2>
        <ul id={listId} className="cmdk-list" role="listbox" aria-label="Available commands" data-testid="command-palette-list">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={`cmdk-item${i === current ? ' is-active' : ''}`}
              data-command={c.id}
              onMouseMove={() => { if (i !== current) setSelected(i); }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(c)}
            >
              <span className="cmdk-item-label">{c.label}</span>
              {c.shortcut && <Kbd chord={c.shortcut} platform={platform} className="cmdk-item-hint" />}
            </li>
          ))}
          {results.length === 0 && <li className="cmdk-empty text-secondary" role="presentation" data-testid="command-palette-empty">No matching command.</li>}
        </ul>
      </div>
    </div>
  );
}
