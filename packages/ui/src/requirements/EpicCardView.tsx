import { memo } from 'react';
import type { BoardCard, EpicCard } from '@rotaris/contracts';
import { HEALTH_GLOSS, epicProgressLine } from '@rotaris/ui-core';
import { ALERT_GLYPH, SELECTED_EXPLANATION, SELECTED_WORD, alertSeverity, epicSummary, epicSummaryLine } from './model.js';
import { Button as DesignButton, Tag as DesignTag } from '../design-system/index.js';

/**
 * Part AK2 — the epic card (REQ-TRACE-281..286): a DISTINCT widget kind from the requirement card, a grouping
 * element and not a work item. It summarises its children on five counts (REQ-TRACE-282), prints the progress
 * line exactly as the projection supplied it (REQ-TRACE-254: `epicProgressLine` formats `done`/`total` and
 * recomputes nothing), offers a filter to its children that leaves the epic itself on screen (REQ-TRACE-283), and
 * has NO delivery-action container at all — the element is omitted, not disabled (REQ-TRACE-284) — and is not
 * draggable (REQ-TRACE-497's last line). An epic with no children states that (REQ-TRACE-285).
 *
 * Craft from the mockup's epic card: the mono identifier, the accent `epic` tag, the title, a thin progress bar
 * over the card's surface-2, the meta line beneath.
 */
export interface EpicCardViewProps {
  readonly card: BoardCard;
  readonly epic: EpicCard;
  readonly cards: readonly BoardCard[];
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onFilterToEpic: (id: string) => void;
  readonly onKeyNavigate: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export const EpicCardView = memo(function EpicCardView({ card, epic, cards, selected, onSelect, onOpen, onFilterToEpic, onKeyNavigate }: EpicCardViewProps) {
  const summary = epicSummary(epic, cards);
  const progress = epicProgressLine(epic);
  const ratio = epic.total === 0 ? 0 : epic.done / epic.total;
  const description = `Epic. ${card.column}. Health ${card.health}: ${HEALTH_GLOSS[card.health]} ${progress}. ${epicSummaryLine(summary)}.`;
  return (
    <article
      className={`req-card req-card--epic${selected ? ' is-selected' : ''}`}
      data-testid="req-epic"
      data-req-card={card.id}
      data-column={card.column}
      data-health={card.health}
      tabIndex={0}
      aria-label={`${card.id} ${card.title}, epic`}
      aria-description={description}
      onFocus={() => onSelect(card.id)}
      onClick={() => onSelect(card.id)}
      onDoubleClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); onOpen(card.id); return; }
        onKeyNavigate(event);
      }}
    >
      <div className="req-card__head">
        <span className="req-card__id mono">{card.id}</span>
        <DesignTag className="tag tag-accent">epic</DesignTag>
        <DesignTag className="tag tag-outline" data-testid="req-lifecycle">{card.lifecycle}</DesignTag>
      </div>
      <span className="req-card__title">{card.title}</span>
      {selected && <span className="req-card__selected" data-testid="req-selected">{SELECTED_WORD} — {SELECTED_EXPLANATION}</span>}
      <div className="req-epic__bar" role="img" aria-label={progress}><div className="req-epic__fill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
      <span className="card-meta req-epic__progress" data-testid="req-epic-progress">{progress}</span>
      <span className="card-meta req-epic__summary">{epicSummaryLine(summary)}</span>
      {card.alerts.length > 0 && (
        <ul className="req-card__alerts">
          {card.alerts.map((a) => { const s = alertSeverity(a); return <li key={a} className={`req-alert req-alert--${s}`}><span className="req-alert__glyph" aria-hidden="true">{ALERT_GLYPH[s]}</span>{a}</li>; })}
        </ul>
      )}
      <div className="req-card__foot">
        <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-epic-filter" onClick={(event) => { event.stopPropagation(); onFilterToEpic(card.id); }} aria-label={`Filter the board to ${card.id} and its children`}>Filter to children</DesignButton>
        <DesignButton type="button" className="btn btn-ghost btn-compact" onClick={(event) => { event.stopPropagation(); onOpen(card.id); }} aria-label={`Open ${card.id}`}>Open</DesignButton>
      </div>
    </article>
  );
});
