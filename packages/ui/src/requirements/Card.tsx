import { memo } from 'react';
import type { BoardCard, ReqId } from '@rotaris/contracts';
import { HEALTH_GLOSS, cardFacts, columnLabel, evidenceSegments, evidenceSummary, executionLine, joinCapped } from '@rotaris/ui-core';
import { EvidenceIndicator } from './EvidenceIndicator.js';
import { ALERT_GLYPH, DISMISS_FEEDBACK, PRIVATE_TRANSFER_TYPE, SELECTED_EXPLANATION, SELECTED_WORD, alertSeverity } from './model.js';
import { Button as DesignButton, Tag as DesignTag } from '../design-system/index.js';

/**
 * Part AK2 — the requirement card (REQ-TRACE-242..257). The seven facts every card carries: identifier, title,
 * lifecycle badge, delivery condition (needs-update and blocked included), the evidence indicator, the execution
 * units and the last run's age — the last two as ONE sentence (REQ-TRACE-249) — then the optional facts in their
 * fixed order, omitted cleanly (REQ-TRACE-243), the alerts in the projection's order with a severity glyph
 * (REQ-TRACE-244/245/247), the health word with its gloss as the tooltip (REQ-TRACE-252) and the selection stated
 * in a word (REQ-TRACE-255). Health, evidence and delivery state are printed exactly as the projection supplied
 * them (REQ-TRACE-254): nothing here recomputes any of the four.
 *
 * Time is injected (`now`, `localOffsetMinutes`; REQ-TRACE-250/251): the card reads no clock. The card is memoised
 * so a state update that does not name it does not repaint it (REQ-TRACE-374); the affected-only merge keeps the
 * `card` identity of every card it does not touch.
 *
 * Craft from the mockup's Kanban card: mono identifier, outline lifecycle tag, the ring at the head's right, the
 * title in the body face at medium weight, alert lines in the small size carrying their own colour, the meta line.
 */
export interface FeedbackLine { readonly text: string }
export interface CardProps {
  readonly card: BoardCard;
  readonly now: string;
  readonly localOffsetMinutes: number;
  readonly selected: boolean;
  readonly draggable: boolean;
  readonly inFlightLabel: string | undefined;
  readonly feedback: readonly string[];
  readonly onSelect: (id: ReqId) => void;
  readonly onOpen: (id: ReqId) => void;
  readonly onOpenEvidence: (id: ReqId) => void;
  readonly onDismissFeedback: (id: ReqId) => void;
  readonly onDragStart: (id: ReqId, transfer: DataTransfer) => void;
  readonly onDragRefused: (id: ReqId) => void;
  readonly onDragEnd: () => void;
  readonly onKeyNavigate: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/** REQ-TRACE-485: the accessible description carries the delivery-state word, the health token and the rendered health label. */
export function cardDescription(card: BoardCard, execution: string): string {
  const summary = evidenceSummary(evidenceSegments(card));
  return `${columnLabel(card.column)}. Health ${card.health}: ${HEALTH_GLOSS[card.health]} ${execution}. ${summary}${card.alerts.length > 0 ? ` ${card.alerts.join(' ')}` : ''}`;
}

export const RequirementCard = memo(function RequirementCard({ card, now, localOffsetMinutes, selected, draggable, inFlightLabel, feedback, onSelect, onOpen, onOpenEvidence, onDismissFeedback, onDragStart, onDragRefused, onDragEnd, onKeyNavigate }: CardProps) {
  const execution = executionLine(card, now);
  // REQ-TRACE-243/256: the dependencies holding it, read off the card's own relations here so the memo's inputs are the card and nothing derived per render.
  const dependencies = card.relations.filter((r) => r.kind === 'depends-on').map((r) => r.id);
  const facts = cardFacts(card, now, localOffsetMinutes);
  const summary = evidenceSummary(evidenceSegments(card));
  const condition = card.column === 'blocked' ? 'blocked' : card.column;
  return (
    <article
      className={`req-card${selected ? ' is-selected' : ''}${inFlightLabel ? ' is-in-flight' : ''}`}
      data-testid="req-card"
      data-req-card={card.id}
      data-column={card.column}
      data-health={card.health}
      data-lifecycle={card.lifecycle}
      tabIndex={0}
      aria-label={`${card.id} ${card.title}`}
      aria-description={cardDescription(card, execution)}
      draggable={draggable}
      onFocus={() => onSelect(card.id)}
      onClick={() => onSelect(card.id)}
      onDoubleClick={() => onOpen(card.id)}
      onDragStart={(event) => {
        if (!draggable) { event.preventDefault(); onDragRefused(card.id); return; }
        event.dataTransfer.setData(PRIVATE_TRANSFER_TYPE, card.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(card.id, event.dataTransfer);
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); onOpen(card.id); return; }
        // REQ-TRACE-486: the platform's primary modifier with E opens the evidence view. Stated at the site: the
        // row allows this part ONE registry entry, taken by Ctrl+M; registering this chord through the registry
        // too is owed (handoff §8), so here it is bound on the focused card, which is where the requirement puts it.
        if ((event.ctrlKey || event.metaKey) && (event.key === 'e' || event.key === 'E')) { event.preventDefault(); onOpenEvidence(card.id); return; }
        onKeyNavigate(event);
      }}
    >
      <div className="req-card__head">
        <span className="req-card__id mono">{card.id}</span>
        <DesignTag kind="outline" data-testid="req-lifecycle">{card.lifecycle}</DesignTag>
        <span className={`tag ${condition === 'blocked' ? 'tag-fail' : condition === 'running' ? 'tag-run' : condition === 'needs-update' || condition === 'review' ? 'tag-wait' : condition === 'done' ? 'tag-done' : 'tag-neutral'}`} data-testid="req-condition">{columnLabel(condition).toLowerCase()}</span>
        <EvidenceIndicator card={card} onOpen={onOpenEvidence} />
      </div>
      <span className="req-card__title">{card.title}</span>
      <span className="req-card__health" data-testid="req-health" data-health={card.health} title={HEALTH_GLOSS[card.health]}>health: <span className="mono">{card.health}</span></span>
      {selected && <span className="req-card__selected" data-testid="req-selected">{SELECTED_WORD} — {SELECTED_EXPLANATION}</span>}
      {inFlightLabel && <DesignTag kind="run" className="req-card__in-flight" role="status" data-testid="req-in-flight">{inFlightLabel}</DesignTag>}
      <span className="card-meta req-card__evidence-summary" data-testid="req-evidence-summary">{summary}</span>
      <span className="card-meta req-card__execution" data-testid="req-execution">{execution}</span>
      {(facts.length > 0 || dependencies.length > 0) && (
        <dl className="req-card__facts">
          {facts.map((f) => (f.label === 'Last change'
            ? <div key={f.label} className="req-card__fact"><dt>{f.label}</dt><dd title={f.detail} aria-description={f.detail}>{f.value}</dd></div>
            : <div key={f.label} className="req-card__fact"><dt>{f.label}</dt><dd>{f.value}</dd></div>))}
          {dependencies.length > 0 && <div className="req-card__fact"><dt>Dependencies</dt><dd className="mono">{joinCapped(dependencies)}</dd></div>}
        </dl>
      )}
      {card.alerts.length > 0 && (
        <ul className="req-card__alerts" aria-label={`Alerts for ${card.id}`}>
          {card.alerts.map((a) => { const s = alertSeverity(a); return <li key={a} className={`req-alert req-alert--${s}`} data-severity={s}><span className="req-alert__glyph" aria-hidden="true">{ALERT_GLYPH[s]}</span>{a}</li>; })}
        </ul>
      )}
      {feedback.length > 0 && (
        <div className="req-card__feedback" role="alert" data-testid="req-feedback">
          <ul className="req-card__feedback-lines">{feedback.map((line) => <li key={line}>{line}</li>)}</ul>
          <DesignButton type="button" className="btn btn-ghost btn-compact" onClick={(event) => { event.stopPropagation(); onDismissFeedback(card.id); }} aria-label={`${DISMISS_FEEDBACK} for ${card.id}`}>{DISMISS_FEEDBACK}</DesignButton>
        </div>
      )}
      <div className="req-card__foot">
        <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-card-open" onClick={(event) => { event.stopPropagation(); onOpen(card.id); }} aria-label={`Open ${card.id}`}>Open</DesignButton>
        <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-card-evidence" onClick={(event) => { event.stopPropagation(); onOpenEvidence(card.id); }} aria-label={`Open the evidence of ${card.id}`}>Evidence</DesignButton>
      </div>
    </article>
  );
});
