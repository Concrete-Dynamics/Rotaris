import { useCallback, useEffect, useState } from 'react';
import type { ShapeAcceptOutcome, ShapeExportOutcome, ShapeView, SurveyOutcome, SurveyPreview } from '@rotaris/contracts';
import { Button as DesignButton, TextArea as DesignTextArea } from '../design-system/index.js';
import { deltaLines } from './adoption-model.js';
import { ACCEPT_LABEL, acceptSentence, ANSWER_LABEL, ANSWER_PLACEHOLDER, DISCARD_LABEL, driftSentence, EXPORT_DESCRIPTION, EXPORT_LABEL, exportSentence, previewLead, previewWrites, RESURVEY_LABEL, SHAPE_RECORD_DESCRIPTION, SHAPE_RECORD_LABEL, shapeSentence, SURVEY_DESCRIPTION, SURVEY_LABEL, SURVEYING_SENTENCE } from './shape-model.js';
import type { HostResult } from './RequirementsView.js';

/**
 * PD-TRACE-002 (REQ-ADOPT-036, REQ-ADOPT-039 to REQ-ADOPT-042, REQ-ADOPT-052) — the survey strip, beneath the board's header and not part of it (REQ-ADOPT-001): REQ-TRACE-491's one
 * primary control stays the re-evaluation, so every control here is a secondary one of the ordinary height. Mounting
 * reads the shape (`requirements.shape`), a read that writes nothing and consults no model (REQ-ADOPT-022). A survey
 * starts only when its control is pressed (REQ-ADOPT-003) and ends in a preview; nothing is recorded until the preview
 * is accepted, and the user may answer it in words instead (clause 2). Drift is stated once, with the control that
 * surveys again (clause 11).
 */
export interface ShapeStripProps {
  /** Read once the board has arrived, never beside the board's own read (REQ-TRACE-239's budget; see AdoptionStrip's measurement). */
  readonly armed: boolean;
  /** Moves when the board's generation moves, so the strip reads again after a watcher's re-read or an accept. */
  readonly generation: number;
  readonly readShape: () => Promise<HostResult<ShapeView>>;
  readonly survey: (token?: string, answer?: string) => Promise<HostResult<SurveyOutcome>>;
  readonly acceptShape: (token: string) => Promise<HostResult<ShapeAcceptOutcome>>;
  readonly recordShape: () => Promise<HostResult<ShapeAcceptOutcome>>;
  readonly exportShape: () => Promise<HostResult<ShapeExportOutcome>>;
}

export function ShapeStrip({ armed, generation, readShape, survey, acceptShape, recordShape, exportShape }: ShapeStripProps) {
  const [view, setView] = useState<ShapeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'survey' | 'other' | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [preview, setPreview] = useState<SurveyPreview | null>(null);
  const [answer, setAnswer] = useState('');
  const [details, setDetails] = useState(false);

  const read = useCallback(() => {
    void readShape().then((r) => { if (r.ok) { setView(r.value); setError(null); } else setError(r.reason); });
  }, [readShape]);
  useEffect(() => { if (armed) read(); }, [armed, generation, read]);

  const runSurvey = (token?: string, words?: string) => {
    setBusy('survey');
    setOutcome(null);
    void survey(token, words).then((r) => {
      setBusy(null);
      if (!r.ok) { setOutcome(r.reason); return; }
      if (!r.value.ok) { setOutcome(r.value.reason); return; }
      setPreview(r.value.preview);
      setAnswer('');
    });
  };
  const accept = () => {
    if (preview === null) return;
    setBusy('other');
    void acceptShape(preview.token).then((r) => {
      setBusy(null);
      setOutcome(r.ok ? acceptSentence(r.value) : r.reason);
      if (r.ok && r.value.ok) setPreview(null);
      read();
    });
  };
  const other = <T,>(run: () => Promise<HostResult<T>>, say: (o: T) => string) => {
    setBusy('other');
    setOutcome(null);
    void run().then((r) => { setBusy(null); setOutcome(r.ok ? say(r.value) : r.reason); read(); });
  };

  const accepted = view?.state === 'accepted';
  const native = view?.state === 'none' && view.native;
  const sentence = error !== null ? `The shape could not be read: ${error}` : view === null ? (armed ? 'Reading how this repository writes its requirements…' : 'The shape is read once the board has arrived.') : shapeSentence(view);
  const drift = view?.state === 'accepted' ? driftSentence(view.drift) : null;
  const lines = view === null ? [] : view.state === 'accepted' ? (view.delta === undefined ? [] : deltaLines(view.delta)) : view.detection.undecided.length > 0 && !native ? [{ kind: 'undecided' as const, label: 'The detection could not decide', ids: view.detection.undecided.map((u) => u.detail).join('; ') }] : [];
  return (
    <section className="req-adoption" data-testid="req-adoption" aria-label="Requirements survey" aria-busy={busy !== null}>
      <div className="req-adoption__row">
        <span className="req-adoption__state" data-testid="req-adoption-state" data-state={view?.state ?? 'reading'} title={sentence}>{busy === 'survey' ? SURVEYING_SENTENCE : sentence}</span>
        {lines.length > 0 && <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-adoption-details" aria-expanded={details} onClick={() => setDetails((d) => !d)}>{details ? 'Hide details' : 'Details'}</DesignButton>}
        {!native && preview === null && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-survey-run" disabled={busy !== null || view === null} onClick={() => runSurvey()} title={SURVEY_DESCRIPTION} aria-description={SURVEY_DESCRIPTION}>{accepted ? RESURVEY_LABEL : SURVEY_LABEL}</DesignButton>}
        {accepted && preview === null && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-survey-record" disabled={busy !== null} onClick={() => other(recordShape, acceptSentence)} title={SHAPE_RECORD_DESCRIPTION} aria-description={SHAPE_RECORD_DESCRIPTION}>{SHAPE_RECORD_LABEL}</DesignButton>}
        {accepted && preview === null && view.origin === 'local' && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-survey-export" disabled={busy !== null} onClick={() => other(exportShape, exportSentence)} title={EXPORT_DESCRIPTION} aria-description={EXPORT_DESCRIPTION}>{EXPORT_LABEL}</DesignButton>}
      </div>
      {drift !== null && preview === null && <p className="req-adoption__outcome card-meta" role="status" data-testid="req-survey-drift">{drift}</p>}
      {details && lines.map((l) => (
        <p key={l.kind} className="req-adoption__delta card-meta" data-testid={`req-adoption-${l.kind}`}><span className="req-adoption__label">{l.label}</span> <span className={l.kind === 'undecided' ? undefined : 'mono'}>{l.ids}</span></p>
      ))}
      {busy === 'survey' && <span className="visually-hidden" role="status" data-testid="req-survey-running">{SURVEYING_SENTENCE}</span>}
      {preview !== null && (
        <div className="req-survey" data-testid="req-survey-preview" role="group" aria-label="The proposed shape">
          <p className="req-survey__lead">{previewLead(preview)}</p>
          <ul className="req-survey__samples">
            {preview.samples.map((s) => (
              <li key={s.id} className="req-survey__sample"><span className="mono">{s.id}</span> <span>{s.title}</span> <span className="card-meta mono">{s.document}:{s.line}</span>{s.status !== undefined && <span className="card-meta"> · status {s.status}</span>}{s.criteria > 0 && <span className="card-meta"> · {s.criteria} {s.criteria === 1 ? 'criterion' : 'criteria'}</span>}</li>
            ))}
          </ul>
          {preview.unread.length > 0 && <ul className="req-survey__unread card-meta" data-testid="req-survey-unread">{preview.unread.map((u, i) => <li key={i}>{u}</li>)}</ul>}
          <p className="card-meta">{previewWrites(preview)}</p>
          <label className="field"><span className="field-label">Correct it in words</span>
            <DesignTextArea className="input req-survey__answer" data-testid="req-survey-answer" value={answer} disabled={busy !== null} onChange={(e) => setAnswer(e.target.value)} placeholder={ANSWER_PLACEHOLDER} aria-label="Correct the proposed shape in words" />
          </label>
          <div className="req-survey__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-survey-accept" disabled={busy !== null} onClick={accept}>{ACCEPT_LABEL}</DesignButton>
            <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-survey-send" disabled={busy !== null || answer.trim() === ''} onClick={() => runSurvey(preview.token, answer)}>{ANSWER_LABEL}</DesignButton>
            <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-survey-discard" disabled={busy !== null} onClick={() => { setPreview(null); setOutcome(null); }}>{DISCARD_LABEL}</DesignButton>
          </div>
        </div>
      )}
      {busy === null && outcome !== null && <p className="req-adoption__outcome card-meta" role="status" data-testid="req-adoption-outcome">{outcome}</p>}
    </section>
  );
}
