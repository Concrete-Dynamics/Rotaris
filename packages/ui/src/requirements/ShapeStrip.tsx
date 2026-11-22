import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressReport, ShapeAcceptOutcome, ShapeExportOutcome, ShapeView, SurveyOutcome, SurveyPreview } from '@rotaris/contracts';
import { Button as DesignButton, TextArea as DesignTextArea } from '../design-system/index.js';
import { deltaLines } from './adoption-model.js';
import { ACCEPT_LABEL, acceptSentence, ANSWER_LABEL, ANSWER_PLACEHOLDER, DISCARD_LABEL, driftSentence, EXPORT_DESCRIPTION, EXPORT_LABEL, exportSentence, previewLead, previewWrites, RESURVEY_LABEL, SHAPE_RECORD_DESCRIPTION, SHAPE_RECORD_LABEL, shapeSentence, SURVEY_DESCRIPTION, SURVEY_LABEL, SURVEY_STAGES, SURVEYING_SENTENCE, elapsedClock, surveyFigures, surveyProgressOf } from './shape-model.js';
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
  /** REQ-ADOPT-026 (R-123): the survey's progress reports as channel 10 carries them; absent, the strip states only that a survey runs. */
  readonly onProgress?: (listener: (report: ProgressReport) => void) => () => void;
}

export function ShapeStrip({ armed, generation, readShape, survey, acceptShape, recordShape, exportShape, onProgress }: ShapeStripProps) {
  const [view, setView] = useState<ShapeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'survey' | 'other' | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [preview, setPreview] = useState<SurveyPreview | null>(null);
  const [answer, setAnswer] = useState('');
  const [details, setDetails] = useState(false);
  /** R-123: the reports of the survey in flight, the moment it started, and whether it continues a preview from an answer. */
  const [reports, setReports] = useState<readonly ProgressReport[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const [continuing, setContinuing] = useState(false);
  const surveying = busy === 'survey';
  useEffect(() => {
    if (!surveying || onProgress === undefined) return;
    return onProgress((r) => setReports((list) => [...list, r]));
  }, [surveying, onProgress]);
  useEffect(() => {
    if (!surveying) return;
    const tick = () => setElapsed(performance.now() - started.current);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [surveying]);

  const read = useCallback(() => {
    void readShape().then((r) => { if (r.ok) { setView(r.value); setError(null); } else setError(r.reason); });
  }, [readShape]);
  useEffect(() => { if (armed) read(); }, [armed, generation, read]);

  const runSurvey = (token?: string, words?: string) => {
    started.current = performance.now();
    setContinuing(token !== undefined);
    setReports([]);
    setElapsed(0);
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
      {surveying && <span className="visually-hidden" role="status" data-testid="req-survey-running">{SURVEYING_SENTENCE}</span>}
      {surveying && <SurveyProgressView reports={reports} continuing={continuing} elapsed={elapsed} />}
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

/**
 * R-123 (REQ-ADOPT-026): where a survey in flight stands. Four stages in the survey's own order — the script's draft, the
 * agent reading, its proposals (a first and at most three repairs, REQ-ADOPT-038), the preview — each a segment that is
 * done, current or to come, the current one in the running colour and named in words beside it (state said twice). Under
 * them the step in progress with the path it reads, and the figures and the clock. The stages are a list a screen reader
 * walks with the current one marked; the strip's own status line already announces that a survey runs, so nothing here
 * is a live region that would speak at every step.
 */
function SurveyProgressView({ reports, continuing, elapsed }: { readonly reports: readonly ProgressReport[]; readonly continuing: boolean; readonly elapsed: number }) {
  const p = surveyProgressOf(reports, continuing);
  const at = SURVEY_STAGES.findIndex((s) => s.key === p.stage);
  const figures = surveyFigures(p);
  return (
    <div className="req-survey-progress" data-testid="req-survey-progress" data-stage={p.stage}>
      <ol className="req-survey-progress__stages" aria-label="Survey stages">
        {SURVEY_STAGES.map((s, i) => (
          <li key={s.key} className="req-survey-progress__stage" data-state={i < at ? 'done' : i === at ? 'current' : 'next'} aria-current={i === at ? 'step' : undefined}>{s.label}</li>
        ))}
      </ol>
      <p className="req-survey-progress__now">
        <span className="req-survey-progress__action" data-testid="req-survey-action">{p.action}{p.path === undefined ? '' : ' '}{p.path !== undefined && <span className="mono">{p.path}</span>}</span>
        <span className="req-survey-progress__figures card-meta" data-testid="req-survey-figures">{figures}{figures === '' ? '' : ' · '}<span className="mono">{elapsedClock(elapsed)}</span></span>
      </p>
    </div>
  );
}
