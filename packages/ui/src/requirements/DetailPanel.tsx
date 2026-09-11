import { useEffect, useId } from 'react';
import type { BoardCard, BoardProjection, RelationToken, ReqId, RequirementDetail } from '@rotaris/contracts';
import { RELATION_TOKENS } from '@rotaris/contracts';
import { HEALTH_DERIVATION_SENTENCE, HEALTH_GLOSS, RELATION_LABEL, absoluteMoment, columnLabel, evidenceSegments, executionLine, relativeAge } from '@rotaris/ui-core';

/**
 * Part AK2 — the requirement detail view (REQ-TRACE-271..280, 276/277): exactly five sections, every one built on
 * every render including when it holds nothing, each with its own empty message (271/272), degrading individually.
 * The revision-history panel of REQ-TRACE-278/280 sits below them and is NOT a sixth section — see the note at its
 * site; `DETAIL_SECTIONS` is the list, and `[data-testid="req-section"]` counts five.
 * The card and the detail report the same lifecycle, delivery state, health and evidence because the detail's card
 * IS the board's card for that generation (276; the service reads both against one projection, REQ-TRACE-348). The
 * description is rendered from the source (275): `prose` is what the engine read, never a local copy. Every related
 * requirement navigates to its own detail and a dangling one is shown unresolved with its target (273). Escape
 * closes and focus returns to the control it was opened from (277; the caller restores it).
 *
 * What the projection does not carry is STATED in the section that would show it rather than left blank: the
 * current hash (REQ-TRACE-256 puts it on the card value; `BoardCard` has no field — handoff §3), the eight relation
 * tokens the document format cannot express (ADR-0041's reading), the commit a revision landed in (278) and the
 * source's own revisions (279, the engine's — `history` here is the delivery history in its three states, 280).
 *
 * Craft from the mockup's detail panel: an aside on the chrome ground, the head with the mono identifier, tags and
 * the display-face title, then kicker-headed sections on a 74 px label grid.
 */
export interface DetailPanelProps {
  readonly card: BoardCard;
  readonly detail: RequirementDetail | null;
  readonly board: BoardProjection;
  readonly now: string;
  readonly localOffsetMinutes: number;
  readonly onClose: () => void;
  readonly onNavigate: (id: ReqId) => void;
  readonly onOpenEvidence: (id: ReqId) => void;
  readonly onOpenSession: ((sessionId: string) => void) | undefined;
  /** Part R2 — the per-requirement panes (REQ-TRACE-375); absent, the control is not offered (REQ-TRACE-372). */
  readonly onOpenPane?: ((key: 'review' | 'blockers' | 'editor') => void) | undefined;
  /** Part R2 — REQ-TRACE-322: centre the relationship graph on this requirement. */
  readonly onOpenGraph?: ((id: ReqId) => void) | undefined;
}

export const DETAIL_SECTIONS = ['requirement', 'relations', 'execution', 'traceability', 'verification'] as const;
export const SECTION_EMPTY: Readonly<Record<(typeof DETAIL_SECTIONS)[number], string>> = Object.freeze({
  requirement: 'The requirement carries no description.',
  relations: 'This requirement relates to no other requirement.',
  execution: 'No execution unit has been released for this requirement; nothing has run and no worktree belongs to it.',
  traceability: 'No implementation site or test site references this requirement, and it owes no evidence.',
  verification: 'No verification result, build result or requirement-check finding is recorded for this requirement.',
});
export const HISTORY_UNAVAILABLE = 'Source history was not reported for this requirement, so the delivery history is what can be shown; whether the source keeps revisions is not known here.';
export const HISTORY_READING = 'The history is being read…';
export const HISTORY_NONE = 'No delivery action has been recorded for this requirement yet; the current revision is its only one.';
const RELATION_NO_SOURCE: readonly RelationToken[] = ['supersedes', 'superseded-by', 'depends-on', 'blocks', 'refines', 'refined-by', 'conflicts-with', 'related-to'];

export function DetailPanel({ card, detail, board, now, localOffsetMinutes, onClose, onNavigate, onOpenEvidence, onOpenSession, onOpenPane, onOpenGraph }: DetailPanelProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const onBoard = (id: ReqId) => board.cards.some((c) => c.id === id);
  const isEpic = board.epics.some((e) => e.id === card.id);
  const segments = evidenceSegments(card);
  const sites = detail?.evidenceDetail ?? card.evidence.sites;
  const implementation = sites.filter((s) => s.kind === 'implementation');
  const tests = sites.filter((s) => s.kind !== 'implementation');
  const missing = segments.filter((s) => s.state === 'missing');
  const stale = segments.filter((s) => s.state === 'stale');
  const findings = detail?.findings ?? [];
  const verification = segments.find((s) => s.kind === 'verification');
  const units = card.facts.find((f) => f.label === 'Units')?.value ?? '0';
  const lastChange = card.facts.find((f) => f.label === 'Last change')?.value;
  const relationsByKind = RELATION_TOKENS.map((kind) => ({ kind, ids: card.relations.filter((r) => r.kind === kind).map((r) => r.id) })).filter((g) => g.ids.length > 0);
  const history = detail === null ? 'reading' : detail.history;

  return (
    <aside className="req-detail" data-testid="req-detail" data-req={card.id} role="dialog" aria-labelledby={titleId} aria-description={`Source ${card.sourcePath}. Hash not carried by the board value.`}>
      <div className="req-detail__head">
        <div className="req-detail__ids">
          <span className="req-card__id mono">{card.id}</span>
          <span className="tag tag-outline">{card.lifecycle}</span>
          <span className="tag tag-neutral" data-testid="req-detail-column">{columnLabel(card.column).toLowerCase()}</span>
          {isEpic && <span className="tag tag-accent">epic</span>}
          <span className="req-detail__spacer" />
          <button type="button" className="btn btn-ghost btn-compact" onClick={onClose} aria-label={`Close the detail of ${card.id}`}>Close</button>
        </div>
        <h2 id={titleId} className="req-detail__title display">{card.title}</h2>
        <div className="req-detail__actions">
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenEvidence(card.id)}>Evidence</button>
          {/* Part R2 — the per-requirement panes of REQ-TRACE-375 are reached from the requirement, which is the only
              place that knows which one they would open against. Review is offered wherever the requirement stands and
              names the state instead of hiding (REQ-TRACE-424); blockers likewise (REQ-TRACE-447's positive statement). */}
          {onOpenPane !== undefined && <button type="button" className="btn btn-secondary btn-compact" data-testid="req-detail-review" onClick={() => onOpenPane('review')} aria-label={`Review the delivery of ${card.id}`}>Review</button>}
          {onOpenPane !== undefined && <button type="button" className="btn btn-secondary btn-compact" data-testid="req-detail-blockers" onClick={() => onOpenPane('blockers')} aria-label={`What is holding ${card.id}`}>Blockers</button>}
          {onOpenGraph !== undefined && <button type="button" className="btn btn-secondary btn-compact" data-testid="req-detail-graph" onClick={() => onOpenGraph(card.id)} aria-label={`Centre the relationship graph on ${card.id}`}>Graph</button>}
          {/* REQ-TRACE-276/498: whether the requirement can be edited is a fact the detail carries, and where the source
              cannot be written the sentence says so — never a disabled field. An earlier build said here that writing
              into the source was "Part AP's and not built in this version"; Part AP built it and Part R2 hosts it, so
              that reason is falsified and is recorded as such in ADR-0041's third execution rather than kept here. */}
          {onOpenPane !== undefined && board.source.kind === 'store' && board.source.writable && <button type="button" className="btn btn-secondary btn-compact" data-testid="req-detail-edit" onClick={() => onOpenPane('editor')} aria-label={`Edit ${card.id} in its own source document`}>Edit</button>}
          <span className="card-meta" data-testid="req-detail-editable">{board.source.kind === 'store' && board.source.writable ? 'Editable in place: the edit is written into this requirement\'s own source document.' : `Read-only here: this account cannot write into the requirement source, so ${card.id} is changed by editing ${card.sourcePath} directly and re-evaluating.`}</span>
        </div>
      </div>
      <div className="req-detail__body">
        <section className="req-detail__section" data-testid="req-section" data-section="requirement" aria-label="Requirement">
          <span className="card-kicker">Requirement</span>
          {detail === null ? <p className="req-detail__empty">{HISTORY_READING}</p> : detail.prose.trim() === '' ? <p className="req-detail__empty">{SECTION_EMPTY.requirement}</p> : <p className="req-detail__prose">{detail.prose}</p>}
          <dl className="req-detail__grid">
            <dt>Source</dt><dd className="mono">{card.sourceKey === '' ? 'unset' : card.sourceKey}</dd>
            <dt>Path</dt><dd className="mono">{card.sourcePath}</dd>
            <dt>Hash</dt><dd>The board value does not carry the current hash; the engine compares it on every action (REQ-TRACE-402).</dd>
            <dt>Lifecycle</dt><dd>{card.lifecycle}</dd>
            <dt>Delivery</dt><dd>{columnLabel(card.column)}{card.returnTo ? ` (returns to ${columnLabel(card.returnTo)})` : ''}</dd>
            <dt>Health</dt><dd><span className="mono">{card.health}</span> — {HEALTH_GLOSS[card.health]} {HEALTH_DERIVATION_SENTENCE}</dd>
            {card.priority !== undefined && (<><dt>Priority</dt><dd>{card.priority}</dd></>)}
            {card.epic !== undefined && (<><dt>Epic</dt><dd className="mono">{card.epic}</dd></>)}
            <dt>Kind</dt><dd>{card.kind}{isEpic ? ', an epic' : ''}</dd>
            {lastChange !== undefined && (<><dt>Last change</dt><dd>{relativeAge(lastChange, now)} · {absoluteMoment(lastChange, localOffsetMinutes)}</dd></>)}
          </dl>
          {card.blocker && <p className="req-alert req-alert--stopped"><span className="req-alert__glyph" aria-hidden="true">■</span>Blocked ({card.blocker.kind}): {card.blocker.reason}</p>}
        </section>
        <section className="req-detail__section" data-testid="req-section" data-section="relations" aria-label="Relations">
          <span className="card-kicker">Relations</span>
          {relationsByKind.length === 0 ? <p className="req-detail__empty">{SECTION_EMPTY.relations}</p> : (
            <dl className="req-detail__grid">
              {relationsByKind.map((g) => (<div key={g.kind} className="req-detail__row"><dt>{RELATION_LABEL[g.kind]}</dt><dd>
                {g.ids.map((id) => (onBoard(id)
                  ? <button key={id} type="button" className="btn btn-link req-detail__relation mono" onClick={() => onNavigate(id)} aria-label={`${RELATION_LABEL[g.kind]}: open ${id}`}>{id}</button>
                  : <span key={id} className="req-detail__dangling mono" title="Unresolved: this identifier is not in the requirement store">{id} (unresolved)</span>))}
              </dd></div>))}
            </dl>
          )}
          <p className="card-meta">{RELATION_NO_SOURCE.map((k) => RELATION_LABEL[k]).join(', ')}: the requirement document format declares none of these, so the projection emits none.</p>
        </section>
        <section className="req-detail__section" data-testid="req-section" data-section="execution" aria-label="Execution">
          <span className="card-kicker">Execution</span>
          <p className="card-meta">{executionLine(card, now)} · {units} {units === '1' ? 'unit' : 'units'}</p>
          {(detail?.runs.length ?? 0) === 0
            ? <p className="req-detail__empty">{SECTION_EMPTY.execution}</p>
            : (<ul className="req-detail__runs">{detail!.runs.map((r) => (
              <li key={`${r.unit}-${r.sessionId ?? ''}`} className="req-detail__run">
                <span className="mono">{r.unit}</span> · {r.status}{r.branch ? <> · <span className="mono">{r.branch}</span></> : null}{r.worktree ? <> · <span className="mono">{r.worktree}</span></> : null}
                {r.sessionId && (onOpenSession
                  ? <button type="button" className="btn btn-link" onClick={() => onOpenSession(r.sessionId!)} aria-label={`Open the session of unit ${r.unit}`}>open session</button>
                  : <span className="card-meta"> session {r.sessionId.slice(0, 8)} (no session opener is offered on this surface)</span>)}
              </li>))}</ul>)}
          <p className="card-meta">Commits belonging to a run are not reported by the projection in this build.</p>
        </section>
        <section className="req-detail__section" data-testid="req-section" data-section="traceability" aria-label="Traceability">
          <span className="card-kicker">Traceability</span>
          {implementation.length === 0 && tests.length === 0 && missing.length === 0 && stale.length === 0
            ? <p className="req-detail__empty">{SECTION_EMPTY.traceability}</p>
            : (<>
              {implementation.length > 0 && <p className="card-meta">{implementation.length} implementation {implementation.length === 1 ? 'site' : 'sites'}</p>}
              <ul className="req-detail__sites">{implementation.map((s) => <li key={`${s.path}:${s.line}`} className="mono">{s.path}:{s.line}</li>)}</ul>
              {tests.length > 0 && <p className="card-meta">{tests.length} test {tests.length === 1 ? 'site' : 'sites'}</p>}
              <ul className="req-detail__sites">{tests.map((s) => <li key={`${s.path}:${s.line}`} className="mono">{s.path}:{s.line}{s.testNode ? ` (${s.testNode})` : ''}</li>)}</ul>
              {missing.length > 0 && <p className="req-alert req-alert--attention"><span className="req-alert__glyph" aria-hidden="true">▲</span>Missing evidence: {missing.map((m) => m.label).join(', ')}.</p>}
              {stale.length > 0 && <p className="req-alert req-alert--attention"><span className="req-alert__glyph" aria-hidden="true">▲</span>Stale evidence: {stale.map((m) => m.label).join(', ')}.</p>}
            </>)}
        </section>
        <section className="req-detail__section" data-testid="req-section" data-section="verification" aria-label="Verification">
          <span className="card-kicker">Verification</span>
          {findings.length === 0 && verification === undefined
            ? <p className="req-detail__empty">{SECTION_EMPTY.verification}</p>
            : (<>
              {verification && <p className="card-meta">Requirement check: {verification.stateLabel}.</p>}
              <ul className="req-detail__findings">{findings.map((f, i) => <li key={`${f.code}-${i}`} className={`req-alert req-alert--${f.severity === 'error' ? 'failure' : 'attention'}`}><span className="req-alert__glyph" aria-hidden="true">{f.severity === 'error' ? '✕' : '▲'}</span><span className="mono">{f.code}</span> {f.message}{f.path ? <> — <span className="mono">{f.path}{f.line === undefined ? '' : `:${f.line}`}</span></> : null}</li>)}</ul>
            </>)}
          <p className="card-meta">Test results, build results and the last successful verification are not reported by the projection in this build.</p>
        </section>
        {/*
          * REQ-TRACE-271 fixes the detail at EXACTLY FIVE sections and spec 08's vocabulary list names them:
          * requirement, relations, execution, traceability, verification. REQ-TRACE-278/280 separately require a
          * revision-HISTORY PANEL with its three states. The first build drew the panel as a sixth peer of the five —
          * same `data-testid`, same class, same kicker — so anything counting the detail's sections found six where
          * the specification says five, and the file contradicted its own `DETAIL_SECTIONS`. The reading taken here
          * is that REQ-TRACE-280's "history panel" is its own surface within the detail view and not a section of
          * REQ-TRACE-271's five: it keeps its own test identifier and its own class, and the five sections stay five.
          * (Defect AK2-4, ADR-0041's second execution.)
          */}
        <section className="req-detail__history-panel" data-testid="req-history-panel" data-section="history" aria-label="Revision history">
          <span className="card-kicker">History</span>
          {history === 'reading' ? <p className="req-detail__empty" data-testid="req-history-state" data-state="reading">{HISTORY_READING}</p>
            : history === 'unavailable' ? <p className="req-detail__empty" data-testid="req-history-state" data-state="unavailable">{HISTORY_UNAVAILABLE}</p>
              : history.length === 0 ? <p className="req-detail__empty" data-testid="req-history-state" data-state="empty">{HISTORY_NONE}</p>
                : (<ol className="req-detail__history" data-testid="req-history-state" data-state="available">
                  {[...history].reverse().map((h, i) => <li key={`${h.at}-${i}`} className={h.current ? 'is-current' : ''}>{relativeAge(h.at, now)} — {h.action.replaceAll('-', ' ')} by {h.actor.kind === 'user' ? h.actor.person : 'the system'}: {columnLabel(h.from)} → {columnLabel(h.to)}{h.current ? ' (current)' : ''}</li>)}
                </ol>)}
        </section>
      </div>
    </aside>
  );
}
