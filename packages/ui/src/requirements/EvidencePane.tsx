import { useEffect, useId } from 'react';
import type { BoardCard, ReqId, RequirementDetail } from '@rotaris/contracts';
import { EVIDENCE_EXPLANATION, NOTHING_OWED, evidenceSegments, evidenceSummary } from '@rotaris/ui-core';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * Part AK2 — the evidence view (REQ-TRACE-265..270): opened by activating the indicator, or from the keyboard while
 * the card holds focus. What it shows is determined entirely by two values the board already holds — the card and
 * the detail (269) — with no file read, no repository access and no engine call of its own. Every implementation
 * site and every covering test is listed as a file and a line, ordered by path then line, beneath a stated count per
 * kind, and the view scrolls rather than paginating (265). Where the evidence is incomplete it NAMES what is missing
 * (267). Escape closes it and the caller returns focus to the indicator (487).
 *
 * Two things the projection does not carry are stated where they would show rather than invented: a site's own pass
 * state (an `AnnotationSite` has none; the state printed beside a site is its obligation's, as the projection
 * reports it) and the most recent verification's verdict, commit and hash. Activating a site is a REQUEST the
 * surrounding application carries out (266/269); this build offers no file-at-line opener on the command surface,
 * so a site is printed as text rather than as a control that would be enabled and inert (372).
 */
export interface EvidencePaneProps {
  readonly card: BoardCard;
  readonly detail: RequirementDetail | null;
  readonly onClose: () => void;
  readonly onOpenSession: ((sessionId: string) => void) | undefined;
}

export function EvidencePane({ card, detail, onClose, onOpenSession }: EvidencePaneProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const segments = evidenceSegments(card);
  const sites = detail?.evidenceDetail ?? [...card.evidence.sites].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  const byKind = [
    { kind: 'implementation', label: 'Implementation sites', sites: sites.filter((s) => s.kind === 'implementation'), state: segments.find((s) => s.kind === 'implementation-trace') },
    { kind: 'test', label: 'Covering tests', sites: sites.filter((s) => s.kind === 'test'), state: segments.find((s) => s.kind === 'covering-test') },
    { kind: 'covers', label: 'Coverage comments', sites: sites.filter((s) => s.kind === 'covers'), state: segments.find((s) => s.kind === 'covering-test') },
  ];
  const missing = segments.filter((s) => s.state === 'missing');
  const runs = detail?.runs ?? [];
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog req-evidence-pane" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="req-evidence-pane" data-req={card.id}>
        <h2 id={titleId} className="dialog-title">Evidence of {card.id}</h2>
        <p className="dialog-body">{evidenceSummary(segments)}</p>
        <p className="card-meta">{EVIDENCE_EXPLANATION}</p>
        <div className="req-evidence-pane__body">
          {segments.length === 0 && <p className="req-detail__empty">{NOTHING_OWED}</p>}
          {missing.length > 0 && <p className="req-alert req-alert--attention" data-testid="req-evidence-missing"><span className="req-alert__glyph" aria-hidden="true">▲</span>Missing: {missing.map((m) => m.label).join(', ')}.</p>}
          {byKind.map((group) => (
            <section key={group.kind} className="req-evidence-pane__group" aria-label={group.label}>
              <span className="card-kicker">{group.label} · {group.sites.length}</span>
              {group.sites.length === 0
                ? <p className="req-detail__empty">No {group.label.toLowerCase()} recorded.</p>
                : (<ul className="req-detail__sites">{group.sites.map((s) => (
                  <li key={`${s.path}:${s.line}`} className="req-evidence-pane__site" data-testid="req-site" aria-label={`${s.kind} site ${s.path} line ${s.line}, ${group.state?.stateLabel ?? 'not owed'}`}>
                    <span className="mono">{s.path}:{s.line}</span>{s.testNode ? <span className="mono"> {s.testNode}</span> : null} <span className="card-meta">{group.state?.stateLabel ?? 'not owed'}{s.ids.length > 1 ? ` · also ${s.ids.filter((i) => i !== card.id).join(', ')}` : ''}</span>
                  </li>))}</ul>)}
            </section>
          ))}
          <section className="req-evidence-pane__group" aria-label="Most recent verification">
            <span className="card-kicker">Most recent verification</span>
            <p className="req-detail__empty">{segments.find((s) => s.kind === 'verification') ? `Requirement check: ${segments.find((s) => s.kind === 'verification')!.stateLabel}. The verdict's commit and the requirement hash it was taken over are not reported by the projection in this build.` : 'No verification is owed or recorded for this requirement.'}</p>
          </section>
          <section className="req-evidence-pane__group" aria-label="Execution and integration records">
            <span className="card-kicker">Execution · {runs.length}</span>
            {runs.length === 0 ? <p className="req-detail__empty">No run has been recorded for this requirement.</p> : (
              <ul className="req-detail__runs">{runs.map((r) => (
                <li key={`${r.unit}-${r.sessionId ?? ''}`}><span className="mono">{r.unit}</span> · {r.status}{r.sessionId && onOpenSession ? <DesignButton type="button" className="btn btn-link" onClick={() => onOpenSession(r.sessionId!)} aria-label={`Open the session of unit ${r.unit}`}>open session</DesignButton> : null}</li>))}</ul>)}
            <p className="card-meta">Integration records are not reported by the projection in this build.</p>
          </section>
        </div>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={onClose}>Close</DesignButton>
        </div>
      </div>
    </div>
  );
}

/** For the caller: which requirement an evidence view is about, so focus can return to that card's indicator. */
export function evidenceOpenerSelector(id: ReqId): string {
  return `[data-req-card="${id}"] [data-testid="req-evidence"]`;
}
