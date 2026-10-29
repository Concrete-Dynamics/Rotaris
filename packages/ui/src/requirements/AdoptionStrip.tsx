import { useCallback, useEffect, useState } from 'react';
import type { AdoptionOutcome, AdoptionView } from '@rotaris/contracts';
import { Button as DesignButton, Checkbox as DesignCheckbox } from '../design-system/index.js';
import { adoptionSentence, deltaLines, LAYOUT_DESCRIPTION, LAYOUT_LABEL, outcomeSentence, RECORD_DESCRIPTION, RECORD_LABEL, RERUN_LABEL, RUN_DESCRIPTION, RUN_LABEL, RUNNING_SENTENCE } from './adoption-model.js';
import type { HostResult } from './RequirementsView.js';

/**
 * Domain 22 (PD-TRACE-001) — the adoption strip (REQ-ADOPT-001 to REQ-ADOPT-004), beneath the board's header and not
 * part of it: REQ-TRACE-491's one primary control stays the re-evaluation, so every control here is a secondary one of
 * the ordinary height. Mounting reads the comparison (`requirements.adoption`) — a read that writes nothing and consults
 * no model (REQ-ADOPT-022). A run or a recording starts only when its button is pressed (REQ-ADOPT-003).
 */
export interface AdoptionStripProps {
  readonly readAdoption: () => Promise<HostResult<AdoptionView>>;
  readonly adopt: (mode: 'run' | 'record', writeLayout: boolean) => Promise<HostResult<AdoptionOutcome>>;
}

export function AdoptionStrip({ readAdoption, adopt }: AdoptionStripProps) {
  const [view, setView] = useState<AdoptionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [writeLayout, setWriteLayout] = useState(false);

  const read = useCallback(() => {
    void readAdoption().then((r) => { if (r.ok) { setView(r.value); setError(null); } else setError(r.reason); });
  }, [readAdoption]);
  useEffect(read, [read]);

  const press = (mode: 'run' | 'record') => {
    setRunning(true);
    setOutcome(null);
    void adopt(mode, writeLayout).then((r) => {
      setRunning(false);
      setOutcome(r.ok ? outcomeSentence(r.value) : r.reason);
      read();
    });
  };

  const adopted = view?.state === 'adopted';
  const sentence = error !== null ? `The adoption state could not be read: ${error}` : view === null ? 'Reading the adoption state…' : adoptionSentence(view);
  return (
    <section className="req-adoption" data-testid="req-adoption" aria-label="Requirements adoption" aria-busy={running}>
      <div className="req-adoption__row">
        <span className="req-adoption__state" data-testid="req-adoption-state" data-state={view?.state ?? 'reading'}>{sentence}</span>
        <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-adoption-run" disabled={running} onClick={() => press('run')} title={RUN_DESCRIPTION} aria-description={RUN_DESCRIPTION}>{adopted ? RERUN_LABEL : RUN_LABEL}</DesignButton>
        {adopted && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-adoption-record" disabled={running} onClick={() => press('record')} title={RECORD_DESCRIPTION} aria-description={RECORD_DESCRIPTION}>{RECORD_LABEL}</DesignButton>}
        <DesignCheckbox className="check req-adoption__check" data-testid="req-adoption-layout" disabled={running} checked={writeLayout} onChange={(e) => setWriteLayout(e.currentTarget.checked)} title={LAYOUT_DESCRIPTION} aria-description={LAYOUT_DESCRIPTION} label={LAYOUT_LABEL} />
      </div>
      {view?.state === 'adopted' && deltaLines(view.delta).map((l) => (
        <p key={l.kind} className="req-adoption__delta card-meta" data-testid={`req-adoption-${l.kind}`}><span className="req-adoption__label">{l.label}</span> <span className="mono">{l.ids}</span></p>
      ))}
      {view?.state !== undefined && view.state !== 'adopted' && view.detection.undecided.length > 0 && (
        <p className="req-adoption__delta card-meta" data-testid="req-adoption-undecided"><span className="req-adoption__label">Undecided</span> {view.detection.undecided.map((u) => u.detail).join('; ')}</p>
      )}
      {running && <p className="req-adoption__outcome card-meta" role="status" data-testid="req-adoption-running">{RUNNING_SENTENCE}</p>}
      {!running && outcome !== null && <p className="req-adoption__outcome card-meta" role="status" data-testid="req-adoption-outcome">{outcome}</p>}
    </section>
  );
}
