import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { SlashCommand, SlashContext } from './types.js';
import { Tag as DesignTag } from '../design-system/index.js';

/**
 * Part AN — REQ-CHAT-024/025/026: the slash suggestion popup.
 *
 * It NEVER takes keyboard focus (no focusable element, `mousedown` prevented so a click leaves the caret in the
 * composer); it is anchored directly above the composer's input at the input's width, measured from the input's own
 * rectangle because the composer block scrolls (REQ-CHAT-010) and would clip a child positioned inside it; it shows at
 * most eight rows and scrolls beyond, the cap taken from the measured height of one row so the number is the
 * requirement's and the row's height is the design's. Every key it answers to is handled by the composer's own
 * keydown (REQ-CHAT-026) and reaches it as `selected`; the composer owns the text.
 *
 * Craft is the command palette's (`docs/design/mockup` → WORKSPACE → queue + composer): the design system's
 * `.cmdk-list` / `.cmdk-item` rows, the name in the mono face at a fixed column, the description in tertiary text, the
 * design's foot naming the keys — and, as the design writes it, that `"/ "` escapes to a plain prompt. The rows are one
 * flat list in REQ-CHAT-022's rank order rather than the design's grouped headings, because the ranking IS the order
 * and a heading would break it (the palette made the same call under REQ-SHELL-048).
 *
 * Each row renders `/name — description [argument hint]` plus a kind badge from the closed set `action | skill | prompt`
 * (REQ-CHAT-025). An unavailable command stays listed, styled as disabled text, its reason the tooltip AND the
 * accessible description; the reason is also written in the row's tail, because a keyboard user has no tooltip.
 */
export const SLASH_POPUP_MAX_ROWS = 8;

export interface SlashPopupProps {
  readonly commands: readonly SlashCommand[];
  readonly selected: number;
  readonly ctx: SlashContext;
  readonly listId: string;
  /** The composer's input — the anchor (REQ-CHAT-024: directly above, at its width); a ref, read in effects and never during render. */
  readonly anchor: RefObject<HTMLTextAreaElement | null>;
  readonly onHover: (index: number) => void;
  /** REQ-CHAT-026: clicking a row activates it — the same act as Enter on the highlighted row. */
  readonly onActivate: (command: SlashCommand) => void;
}

export function slashRowId(listId: string, index: number): string {
  return `${listId}-${index}`;
}

export function SlashPopup({ commands, selected, ctx, listId, anchor, onHover, onActivate }: SlashPopupProps) {
  const list = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);

  // Anchored to the input's rectangle; re-measured when the window resizes or the composer's divider moves the input.
  useLayoutEffect(() => {
    const field = anchor.current;
    if (!field) return;
    const measure = () => {
      const r = field.getBoundingClientRect();
      setBox({ left: r.left, width: r.width, bottom: window.innerHeight - r.top });
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(field);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [anchor]);

  // REQ-CHAT-024: at most eight rows on screen — the cap from one measured row, then the list scrolls.
  useLayoutEffect(() => {
    const el = list.current;
    const row = el?.querySelector<HTMLElement>('[role="option"]');
    if (!el || !row) return;
    el.style.maxHeight = `${row.offsetHeight * SLASH_POPUP_MAX_ROWS}px`;
  }, [commands.length]);

  // The highlighted row is kept in view as Up and Down move it past the eighth.
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(`[id="${slashRowId(listId, selected)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selected, listId]);

  if (commands.length === 0) return null;
  return (
    <div
      className="slash-popup"
      data-testid="slash-popup"
      style={box ? { left: box.left, width: box.width, bottom: box.bottom } : undefined}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={list} id={listId} className="cmdk-list slash-popup__list" role="listbox" aria-label="Slash commands" data-testid="slash-popup-list">
        {commands.map((c, i) => {
          const availability = c.availability(ctx);
          const reason = availability.ok ? null : availability.reason;
          const active = i === selected;
          return (
            <div
              key={c.name}
              id={slashRowId(listId, i)}
              role="option"
              aria-selected={active}
              aria-disabled={reason !== null}
              aria-describedby={reason === null ? undefined : `${slashRowId(listId, i)}-reason`}
              title={reason ?? undefined}
              className={`cmdk-item slash-popup__row${active ? ' is-active' : ''}${reason !== null ? ' is-unavailable' : ''}`}
              data-command={c.name}
              data-kind={c.kind}
              data-available={reason === null ? '1' : '0'}
              onMouseMove={() => { if (!active) onHover(i); }}
              onClick={() => onActivate(c)}
            >
              {/* The spaces between the spans are text: a flex container lays out none of them, and the row's text content reads as REQ-CHAT-025 writes it. */}
              <span className="slash-popup__name mono">/{c.name}</span>{' '}
              <span className="slash-popup__sep">—</span>{' '}
              <span className="slash-popup__desc">{c.description}</span>{' '}
              {c.argumentHint && <><span className="slash-popup__hint mono">[{c.argumentHint}]</span>{' '}</>}
              <DesignTag kind="neutral" className="slash-popup__kind" data-testid="slash-kind">{c.kind}</DesignTag>
              {reason !== null && <>{' '}<span className="slash-popup__reason" id={`${slashRowId(listId, i)}-reason`}>{reason}</span></>}
            </div>
          );
        })}
      </div>
      {/* The design's `.cmdk-foot`, hidden from assistive technology: the listbox announces its own navigation. */}
      <div className="cmdk-foot slash-popup__foot" aria-hidden="true">
        <span><span className="kbd">↑↓</span>navigate</span>
        <span><span className="kbd">Tab</span>complete</span>
        <span><span className="kbd">↵</span>complete or submit</span>
        <span><span className="kbd">Esc</span>close</span>
        <span className="slash-popup__escape">"/ " escapes to a plain prompt</span>
      </div>
    </div>
  );
}
