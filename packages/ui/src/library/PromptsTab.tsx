import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PaneLayout, PromptList } from '@rotaris/contracts';
import { matchesQuery } from './LibraryView.js';
import type { LibraryTabProps } from './types.js';
import { Button as DesignButton, EmptyState as DesignEmptyState } from '../design-system/index.js';

/**
 * REQ-LIBRARY-106's Prompts tab: two side-by-side cards in a drag-resizable split whose position persists across
 * restarts (REQ-SHELL-069's `panels/library/state`), the splitter's accessible name fixed by the requirement, minimum
 * column width 240 px. Left, accented, the stash with "Use" and "Use and remove"; right, the history with "Use
 * selected" and no removal at all (REQ-LIBRARY-107: "the stash is the column that can be emptied").
 *
 * Every action carries the entry's ORIGINAL index — its position in the whole list, newest first — so a filtered
 * view (REQ-LIBRARY-104) acts on the row the user chose and not on the row at that screen position
 * (REQ-LIBRARY-107, in those words).
 */
export const PROMPT_COLUMN_MIN = 240;
export const PROMPT_SPLITTER_NAME = 'Resize the prompt stash and history columns';
export const STASH_EMPTY = 'No stashed prompts.';
export const HISTORY_EMPTY = 'Prompt history is empty.';

/** REQ-LIBRARY-104 over the prompt lists: "for prompts and stash entries, the prompt text itself". */
export interface PromptRow {
  readonly text: string;
  /** The entry's index in the whole list, newest first — what a take is keyed by (REQ-LIBRARY-107). */
  readonly index: number;
}
export function filterPrompts(entries: readonly string[], query: string): PromptRow[] {
  return entries.map((text, index) => ({ text, index })).filter((row) => matchesQuery(query, row.text));
}

/**
 * REQ-LIBRARY-106: both columns at least 240 px. The split is stored as the two sizes; the left is what the
 * divider moves and the right takes the rest, so a window narrower than both minimums still yields a
 * determinate, clamped split rather than a zero-width column (REQ-SHELL-071's rule applied to two panes).
 */
export function clampPromptSplit(left: number, containerWidth: number, dividerWidth = 8): number {
  const maxByRight = containerWidth - PROMPT_COLUMN_MIN - dividerWidth;
  return Math.round(Math.max(PROMPT_COLUMN_MIN, Math.min(left, Math.max(PROMPT_COLUMN_MIN, maxByRight))));
}

export interface PromptsTabProps extends LibraryTabProps {
  readonly history: readonly string[];
  readonly stash: readonly string[];
  readonly layout: PaneLayout | undefined;
  readonly onLayout: (layout: PaneLayout) => void;
  /** REQ-LIBRARY-107: load the text into the composer, switch to Workspace, focus it; `remove` decides whether the entry survives. */
  readonly onUse: (list: PromptList, index: number, remove: boolean) => void;
}

function EntryList({ rows, listName, emptyLabel, selected, onSelect, onUse, testId }: {
  rows: readonly PromptRow[];
  listName: string;
  emptyLabel: string;
  selected: number | null;
  onSelect: (index: number) => void;
  onUse: (index: number) => void;
  testId: string;
}) {
  if (rows.length === 0) return <DesignEmptyState className="empty-state library__empty" data-testid={`${testId}-empty`}><span className="empty-state-hint">{emptyLabel}</span></DesignEmptyState>;
  return (
    <ul className="library-list" aria-label={listName} data-testid={testId}>
      {rows.map((row) => (
        <li key={row.index}>
          <DesignButton
            type="button"
            className={`library-list__row${selected === row.index ? ' is-selected' : ''}`}
            aria-selected={selected === row.index}
            data-index={row.index}
            data-testid={`${testId}-row`}
            title={row.text}
            onClick={() => onSelect(row.index)}
            // REQ-LIBRARY-107: a double-click copies and keeps, on both lists.
            onDoubleClick={() => { onSelect(row.index); onUse(row.index); }}
          >{row.text}</DesignButton>
        </li>
      ))}
    </ul>
  );
}

export function PromptsTab({ query, history, stash, layout, onLayout, onUse }: PromptsTabProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [left, setLeft] = useState<number>(() => layout?.sizes[0] ?? PROMPT_COLUMN_MIN * 2);
  // A layout arriving from the preference store replaces the split: derived during render, not in an effect.
  const [seenLayout, setSeenLayout] = useState(layout);
  if (seenLayout !== layout) { setSeenLayout(layout); if (layout) setLeft(layout.sizes[0] ?? PROMPT_COLUMN_MIN * 2); }
  const [stashSelected, setStashSelected] = useState<number | null>(null);
  const [historySelected, setHistorySelected] = useState<number | null>(null);

  const commit = useCallback((value: number) => {
    const width = bodyRef.current?.clientWidth ?? 1280;
    const next = clampPromptSplit(value, width);
    setLeft(next);
    onLayout({ version: 1, panes: 2, sizes: [next, Math.max(PROMPT_COLUMN_MIN, width - next - 8)] });
  }, [onLayout]);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startLeft: left };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setLeft(clampPromptSplit(drag.current.startLeft + (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const value = clampPromptSplit(drag.current.startLeft + (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280);
    drag.current = null;
    commit(value);
  };
  // REQ-SHELL-068: every divider is keyboard-operable, 16 px a press; Home restores the declared default.
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(left - 16); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commit(left + 16); }
    else if (e.key === 'Home') { e.preventDefault(); commit(PROMPT_COLUMN_MIN * 2); }
  };

  const stashRows = filterPrompts(stash, query);
  const historyRows = filterPrompts(history, query);
  const stashRow = stashRows.some((r) => r.index === stashSelected) ? stashSelected : null;
  const historyRow = historyRows.some((r) => r.index === historySelected) ? historySelected : null;

  return (
    <div className="library-prompts" ref={bodyRef} data-testid="prompts-tab" style={{ gridTemplateColumns: `${left}px 8px minmax(${PROMPT_COLUMN_MIN}px, 1fr)` }}>
      <section className="card card-accented library-card" aria-label="Prompt stash">
        <div className="library-card__head">
          <span className="card-kicker">Prompt stash</span>
          <span className="card-meta" data-testid="stash-count">{stash.length}</span>
        </div>
        <EntryList rows={stashRows} listName="Stashed prompts" emptyLabel={STASH_EMPTY} selected={stashRow} testId="library-stash"
          onSelect={setStashSelected} onUse={(index) => onUse('stash', index, false)} />
        <div className="library-card__actions">
          <DesignButton type="button" className="btn btn-secondary" disabled={stashRow === null} data-testid="stash-use" onClick={() => { if (stashRow !== null) onUse('stash', stashRow, false); }}>Use</DesignButton>
          <DesignButton type="button" className="btn btn-primary" disabled={stashRow === null} data-testid="stash-use-remove" onClick={() => { if (stashRow !== null) { onUse('stash', stashRow, true); setStashSelected(null); } }}>Use and remove</DesignButton>
        </div>
      </section>
      <div className="library-prompts__divider" role="separator" aria-orientation="vertical" aria-label={PROMPT_SPLITTER_NAME}
        aria-valuemin={PROMPT_COLUMN_MIN} aria-valuenow={left} tabIndex={0} data-testid="library-divider"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onDividerKey} />
      <section className="card library-card" aria-label="Prompt history">
        <div className="library-card__head">
          <span className="card-kicker">Prompt history</span>
          <span className="card-meta" data-testid="history-count">{history.length}</span>
        </div>
        <EntryList rows={historyRows} listName="Prompt history" emptyLabel={HISTORY_EMPTY} selected={historyRow} testId="library-history"
          onSelect={setHistorySelected} onUse={(index) => onUse('history', index, false)} />
        <div className="library-card__actions">
          {/* REQ-LIBRARY-107: history offers no removal at all — one control, and it copies. */}
          <DesignButton type="button" className="btn btn-secondary" disabled={historyRow === null} data-testid="history-use" onClick={() => { if (historyRow !== null) onUse('history', historyRow, false); }}>Use selected</DesignButton>
        </div>
      </section>
    </div>
  );
}
