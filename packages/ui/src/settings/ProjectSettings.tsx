import { useState } from 'react';
import type { ChangeEntry, Finding, InitializationStateView, ParseError, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { RESOLUTION_FAILED_DETAIL, RESOLUTION_FAILED_HEADLINE } from '@rotaris/contracts';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput } from '../design-system/index.js';
import { projectInitCard } from './project-init.js';

/**
 * Part AJ2 — the Project category's traceability card: the four toolchain operations of spec 08 §Toolchain
 * operations (REQ-TRACE-508 check, REQ-TRACE-509 regenerate, REQ-TRACE-510 update baselines, REQ-TRACE-511 compare)
 * reached from the desktop, each against the repository root of the open workspace and never one the user nominates
 * (REQ-TRACE-512), each off the interface thread through `requirements.operation`, and each able to be stopped
 * through `requirements.cancel` (REQ-TRACE-226).
 *
 * **Structure** is the specification's: REQ-CONFIG-390 fixes the shape of a Project-category card — a status
 * headline, a mouse-selectable detail, a progress indicator hidden by default and deliberately indeterminate (the
 * pass reports discrete phases, REQ-TRACE-211, not a fraction), and an action row whose disabled action names its
 * condition (REQ-NOTIFY-008). `docs/design/mockup` draws no Project category (README §3.2), so the craft is the
 * adopted language as the neighbouring Settings cards already apply it: a `card` with a kicker and a compact action
 * row, prose in the secondary colour, the selectable detail in the raw block the Config category uses, nothing
 * invented. No colour and no size is written here.
 *
 * **What the result states** is §1481's list, and `describeOperation` is the one pure mapping from an operation's
 * reply to those sentences, so the proof can assert every one of them without a window: no violations; a violation
 * count; each error and each warning; a parse error; a configuration error naming the path and the cause; an
 * unanticipated failure naming what failed; the regeneration outcome with the artifact path, which of the two
 * outcomes was observed and the count; the three baselines with a path and an entry count each; the statistics;
 * "no base artifact to compare against"; "no requirement changes"; the per-change entries in the Data & Formats
 * line form with their sites; the count of unpropagated requirements and the drift finding stated apart; and the
 * empty-store warning, which arrives as a finding naming the directory and which of the three cases holds.
 *
 * NOT BUILT, stated: the pass's progress protocol (REQ-TRACE-210..215) reaches the workspace service's log by phase
 * name and not this card, so the indicator says only that the operation runs; and the requirements view's own
 * control for the check (REQ-TRACE-508: "reachable from the requirements view") is not drawn — the board shows the
 * check's findings on its cards through the projection the service rebuilds after a check, and this card is the one
 * place the four operations are invoked in this build.
 */
export type TraceabilityOperation = 'check' | 'regenerate' | 'baselines' | 'compare';

/** The workspace service's reply to `requirements.operation`, exactly the shape `traceability.operate` answers with. */
export interface OperationReply {
  readonly kind: 'traceability.result';
  readonly operation: TraceabilityOperation;
  readonly root: string;
  readonly elapsedMs: number;
  readonly result: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: TraceabilityFailure };
}
export type OperationOutcome = { readonly ok: true; readonly reply: unknown } | { readonly ok: false; readonly reason: string };

export interface TraceabilitySettingsProps {
  readonly workspace: string | null;
  /** REQ-TRACE-508..511 through `requirements.operation`; main confines the root to the open workspace and stamps the actor. */
  readonly onOperate: (operation: TraceabilityOperation, base?: string) => Promise<OperationOutcome>;
  /** REQ-TRACE-226 through `requirements.cancel`; answers whether anything was in flight to stop. */
  readonly onCancel: (operation: TraceabilityOperation) => Promise<{ readonly ok: true; readonly cancelled: boolean } | { readonly ok: false; readonly reason: string }>;
}

export const OPERATION_LABEL: Readonly<Record<TraceabilityOperation, string>> = {
  check: 'Check traceability',
  regenerate: 'Regenerate requirement symbols',
  baselines: 'Update baselines',
  compare: 'Compare against a base',
};
const OPERATION_NOUN: Readonly<Record<TraceabilityOperation, string>> = { check: 'check', regenerate: 'regeneration', baselines: 'baseline update', compare: 'comparison' };
const OPERATION_HINT: Readonly<Record<TraceabilityOperation, string>> = {
  check: 'Runs the verification pass over one reading of the store and one of the repository, states every finding in the fixed order with the statistics, and writes nothing; no control here suppresses a finding.',
  regenerate: 'Brings the generated requirement-symbol artifact up to date, writing the retired-identifier log first; a run that rewrote the artifact is told apart from one that found it already up to date.',
  baselines: 'Rewrites the three shrink-only baselines in their fixed order — only entries now satisfied are removed, never one added. Deliberate: never a consequence of opening or reading the board.',
  compare: 'Lists the requirement changes since a base revision with the obligation each carries and every annotation site, and states drift apart from the changes. Writes nothing.',
};

/** One operation's result as the sentences §1481 requires a surface to be able to state. */
export interface OperationStatement {
  readonly headline: string;
  readonly lines: readonly string[];
  readonly tone: 'ok' | 'warning' | 'error';
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function describeFailure(operation: TraceabilityOperation, error: TraceabilityFailure): OperationStatement {
  const noun = OPERATION_NOUN[operation];
  switch (error.kind) {
    case 'configuration':
      // REQ-TRACE-046 / REQ-TRACE-512: the configuration path and the cause; no operation performed, nothing written.
      return { tone: 'error', headline: `The layout configuration ${error.path} cannot be used: ${error.cause}`, lines: ['No operation was performed and nothing was written.'] };
    case 'parse': {
      // REQ-TRACE-509: each parse error reported, nothing written, the artifact left exactly as it stood.
      const lines = error.errors.map(describeParseError);
      lines.push(operation === 'regenerate' ? 'Nothing was written; the artifact was left exactly as it stood.' : 'Nothing was written.');
      return { tone: 'error', headline: `The requirement store does not parse: ${plural(error.errors.length, 'parse error')}.`, lines };
    }
    case 'busy':
      // REQ-TRACE-512: at most one operation of a kind per workspace; a second is refused with the reason, never queued.
      return { tone: 'warning', headline: `A ${noun} is already in flight for this workspace; this request was refused rather than queued or raced.`, lines: [] };
    case 'cancelled':
      return { tone: 'warning', headline: `The ${noun} was cancelled; nothing was written.`, lines: [] };
    case 'failed':
      // REQ-TRACE-512: a failure the operation did not anticipate is stated, naming what failed.
      return { tone: 'error', headline: `${error.what} failed: ${error.cause}`, lines: ['The failure is stated rather than reduced to a code; nothing further was done.'] };
  }
}

const describeParseError = (e: ParseError): string => `parse error: ${e.path}${e.line === undefined ? '' : `:${e.line}`}: ${e.message}`;

function describeCheck(value: { readonly report: VerificationReport; readonly parseErrorsOnly: boolean }): OperationStatement {
  const { report, parseErrorsOnly } = value;
  if (parseErrorsOnly) {
    return { tone: 'error', headline: `The requirement store does not parse: ${plural(report.findings.length, 'parse error')}.`, lines: [...report.findings.map((f) => `parse error: ${f.message}`), 'Nothing else was checked; the parse errors are the whole report.'] };
  }
  const errors = report.findings.filter((f) => f.severity === 'error').length;
  const warnings = report.findings.filter((f) => f.severity === 'warning').length;
  const s = report.statistics;
  const lines = report.findings.map((f: Finding) => `${f.severity}: ${f.message}`);
  // REQ-TRACE-101: the statistics, stated on every check.
  lines.push(`Statistics: ${plural(s.total, 'requirement')}; ${s.approved} approved, ${s.traced} traced, ${s.testCovered} test-covered; baselined debt — trace ${s.debt.trace}, test ${s.debt.test}, orphan ${s.debt.orphan}, orphan-test ${s.debt.orphanTest}.`);
  const tail = warnings === 0 ? '' : ` ${plural(warnings, 'warning')}.`;
  return errors === 0
    ? { tone: warnings === 0 ? 'ok' : 'warning', headline: `No violations.${tail}`, lines }
    : { tone: 'error', headline: `${plural(errors, 'violation')}.${tail}`, lines };
}

function describeRegenerate(value: { readonly artifactPath: string; readonly outcome: 'regenerated' | 'already up to date'; readonly count: number }): OperationStatement {
  // REQ-TRACE-509: the path, which of the two outcomes, the count — a rewrite distinguishable from nothing to do.
  return { tone: 'ok', headline: `${value.artifactPath}: ${value.outcome} (${plural(value.count, 'requirement')}).`, lines: [value.outcome === 'regenerated' ? 'The retired-identifier log was written before the artifact.' : 'Nothing was written.'] };
}

function describeBaselines(value: readonly { readonly path: string; readonly entries: number }[]): OperationStatement {
  // REQ-TRACE-510 / REQ-TRACE-123: each baseline, the file written and the resulting entry count.
  return { tone: 'ok', headline: `${plural(value.length, 'baseline')} written.`, lines: value.map((b) => `${b.path}: ${plural(b.entries, 'entry', 'entries')}`) };
}

/** The Data & Formats line form of a change-comparison entry (REQ-TRACE-164/165/166), sites beneath it. */
export function changeEntryLines(e: ChangeEntry): string[] {
  const transition = e.from !== undefined && e.to !== undefined ? ` (${e.from} -> ${e.to})` : '';
  const lines = [`${e.kind.toUpperCase()} ${e.id} '${e.title}'${transition}: ${e.obligation}${e.drift ? '  [drift]' : ''}`];
  if (e.sites.length > 0) for (const s of e.sites) lines.push(`    ${s.path}:${s.line} (${s.kind})`);
  else if (e.kind === 'added' || e.kind === 'modified') lines.push('    no annotation sites yet');
  return lines;
}

function describeCompare(value: { readonly entries: readonly ChangeEntry[]; readonly drift: boolean; readonly noBase: boolean; readonly unpropagated: number }): OperationStatement {
  if (value.noBase) return { tone: 'warning', headline: 'No base artifact to compare against.', lines: ['The base revision holds no generated requirement-symbol artifact, so there is nothing to classify changes against (REQ-TRACE-158).'] };
  if (value.entries.length === 0) return { tone: 'ok', headline: 'No requirement changes.', lines: [] };
  const lines = value.entries.flatMap(changeEntryLines);
  // REQ-TRACE-511: the drift finding presented distinctly from the changes themselves; the unpropagated count stated.
  lines.push(`${plural(value.unpropagated, 'unpropagated requirement')}.`);
  if (value.drift) lines.push('Drift: at least one changed requirement has annotation sites untouched since the base (REQ-TRACE-168); those sites are marked [drift] above.');
  return { tone: value.drift ? 'warning' : 'ok', headline: `${plural(value.entries.length, 'requirement change')}; ${value.unpropagated} unpropagated${value.drift ? '; drift found' : ''}.`, lines };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * ADR-0064 — REQ-WORKSPACE-114's "Project initialization" card: exactly one of six states at a time,
 * chosen in the fixed order *running, failed, pending, deferred, completed, empty*. The reading is
 * `projectInitCard`, a pure function of REQ-WORKSPACE-105's nine values, so this component decides
 * nothing and the proof can assert every sentence without a window.
 *
 * REQ-WORKSPACE-115's refresh is the `initialization.read` behind the "Refresh" control: it shows the
 * persisted section as it is on disk at that moment and disturbs nothing else — a setting edited and
 * not yet saved is still there afterwards, because nothing here touches the settings store.
 */
export interface ProjectInitSettingsProps {
  readonly state: InitializationStateView | null;
  readonly onInitialize: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  readonly onRefresh: () => Promise<void>;
  /** REQ-WORKSPACE-102: "Check again" resolves once more; it does not consume the automatic resolution. */
  readonly onCheckAgain: () => Promise<void>;
}

export function ProjectInitSettings({ state, onInitialize, onRefresh, onCheckAgain }: ProjectInitSettingsProps) {
  const [message, setMessage] = useState<string | null>(null);
  if (state === null) return null;
  const card = projectInitCard(state.view, state.labels);
  const start = async () => { setMessage(null); const r = await onInitialize(); if (!r.ok) setMessage(r.message); };
  return (
    <DesignCard className="card settings__card" data-project-init data-init-state={card.state}>
      <div className="providers-card__head">
        <div className="card-kicker">Project initialization</div>
        <div className="providers-card__actions">
          <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void onRefresh(); }} data-action="init-refresh">Refresh</DesignButton>
          <DesignButton type="button" className="btn btn-primary btn-compact" disabled={card.buttonDisabled} title={card.buttonReason === '' ? undefined : card.buttonReason} onClick={() => { void start(); }} data-action="init-run">{card.button}</DesignButton>
        </div>
      </div>
      <p role="status" data-init-headline><strong>{card.headline}</strong></p>
      {card.busy ? <p className="text-secondary" role="status" aria-busy="true" data-init-progress>Running the pending setup tasks. Each step is reported in the setup window.</p> : null}
      {card.lines.map((line, i) => <p key={i} className="text-secondary" data-init-detail>{line}</p>)}
      {card.buttonDisabled && card.buttonReason !== '' ? <p className="text-tertiary settings__hint" data-init-reason>{card.buttonReason}</p> : null}
      {state.resolutionFailed ? (
        <div data-init-resolution-failed>
          <p role="alert" className="composer__error">{RESOLUTION_FAILED_HEADLINE}</p>
          <p className="text-secondary">{RESOLUTION_FAILED_DETAIL}</p>
          <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void onCheckAgain(); }} data-action="init-check-again">Check again</DesignButton>
        </div>
      ) : null}
      {message !== null ? <p className="composer__error" role="alert" data-init-refused>{message}</p> : null}
    </DesignCard>
  );
}

/** The one pure mapping from an operation's reply to the sentences a surface must be able to state (§1481). */
export function describeOperation(operation: TraceabilityOperation, reply: unknown): OperationStatement {
  if (!isRecord(reply) || reply['kind'] !== 'traceability.result' || !isRecord(reply['result'])) {
    return { tone: 'error', headline: `The ${OPERATION_NOUN[operation]} answered in a form this build does not read.`, lines: [JSON.stringify(reply).slice(0, 400)] };
  }
  const result = reply['result'] as OperationReply['result'];
  if (!result.ok) return describeFailure(operation, result.error);
  const value = result.value;
  switch (operation) {
    case 'check': return describeCheck(value as { report: VerificationReport; parseErrorsOnly: boolean });
    case 'regenerate': return describeRegenerate(value as { artifactPath: string; outcome: 'regenerated' | 'already up to date'; count: number });
    case 'baselines': return describeBaselines(value as readonly { path: string; entries: number }[]);
    case 'compare': return describeCompare(value as { entries: readonly ChangeEntry[]; drift: boolean; noBase: boolean; unpropagated: number });
  }
}

const OPERATIONS: readonly TraceabilityOperation[] = ['check', 'regenerate', 'baselines', 'compare'];

export function TraceabilitySettings({ workspace, onOperate, onCancel }: TraceabilitySettingsProps) {
  const [inFlight, setInFlight] = useState<TraceabilityOperation | null>(null);
  const [base, setBase] = useState('');
  const [last, setLast] = useState<{ operation: TraceabilityOperation; statement: OperationStatement; elapsedMs: number | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const unavailable = workspace === null ? 'Open a workspace first.' : inFlight !== null ? `Wait for the running ${OPERATION_NOUN[inFlight]} to finish, or stop it.` : null;

  const run = async (operation: TraceabilityOperation) => {
    setMessage(null);
    setInFlight(operation);
    try {
      const r = await onOperate(operation, operation === 'compare' && base.trim() !== '' ? base.trim() : undefined);
      if (!r.ok) { setMessage(r.reason); return; }
      const elapsed = isRecord(r.reply) && typeof r.reply['elapsedMs'] === 'number' ? (r.reply['elapsedMs'] as number) : null;
      setLast({ operation, statement: describeOperation(operation, r.reply), elapsedMs: elapsed });
    } finally {
      setInFlight(null);
    }
  };
  const stop = async () => {
    if (inFlight === null) return;
    const r = await onCancel(inFlight);
    if (!r.ok) setMessage(r.reason);
    else if (!r.cancelled) setMessage('There was nothing to stop: the operation had already finished.');
  };

  return (
    <DesignCard className="card settings__card" data-traceability-card data-traceability-state={inFlight ?? 'idle'}>
      <div className="providers-card__head">
        <div className="card-kicker">Requirement traceability</div>
        <div className="providers-card__actions">
          {inFlight !== null ? <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void stop(); }} data-action="traceability-stop">Stop</DesignButton> : null}
        </div>
      </div>
      <p className="text-secondary">
        The four operations of the requirement toolchain, run against the repository root this workspace resolves to and the layout
        configuration found there — never a root or a configuration you nominate. A check writes nothing and gates nothing by itself;
        regenerate writes the requirement-symbol artifact and the retired-identifier log; a baseline update writes the three baselines;
        a comparison writes nothing. At most one operation of a kind runs at a time; a second is refused, not queued.
      </p>
      <div className="settings__actions">
        {OPERATIONS.map((operation) => (
          <div key={operation} className="settings__action">
            <DesignButton type="button" className={`btn ${operation === 'check' ? 'btn-primary' : 'btn-secondary'} btn-compact`} disabled={unavailable !== null} title={unavailable ?? undefined} onClick={() => { void run(operation); }} data-action={`traceability-${operation}`}>
              {inFlight === operation ? `${OPERATION_LABEL[operation]}…` : OPERATION_LABEL[operation]}
            </DesignButton>
            {operation === 'compare' ? (
              <DesignInput className="input settings__number" aria-label="Base revision" placeholder="HEAD" value={base} disabled={unavailable !== null} onChange={(event) => setBase(event.currentTarget.value)} data-traceability-base />
            ) : null}
            <span className="text-secondary settings__hint">{OPERATION_HINT[operation]}{operation === 'compare' ? ' The base defaults to the revision the working tree sits on.' : ''}{unavailable === null ? '' : ` ${unavailable}`}</span>
          </div>
        ))}
      </div>
      {inFlight !== null ? (
        // REQ-CONFIG-390: an indeterminate indicator — the pass reports phases, not a fraction — shown only while something runs.
        <p role="status" className="text-secondary" aria-busy="true" data-traceability-progress>Running the {OPERATION_NOUN[inFlight]}… Phases are reported to the workspace service's log; this card states the result when the pass returns.</p>
      ) : null}
      {message !== null ? <p className="composer__error" role="alert" data-traceability-refused>{message}</p> : null}
      {last !== null ? (
        <div data-traceability-result data-traceability-tone={last.statement.tone}>
          <p role="status" data-traceability-headline>
            <strong>{OPERATION_LABEL[last.operation]}: {last.statement.headline}</strong>
            {last.elapsedMs === null ? null : <span className="text-secondary"> ({last.elapsedMs} ms)</span>}
          </p>
          {last.statement.lines.length > 0 ? <pre className="settings__raw" aria-label={`${OPERATION_LABEL[last.operation]} detail`} data-traceability-lines>{last.statement.lines.join('\n')}</pre> : null}
        </div>
      ) : null}
      <p className="text-tertiary settings__hint">
        Progress by phase reaches the workspace service's log, not this card. The check's findings also reach the requirements view's cards
        through the board's next reading; the view's own control for the check is not built in this version.
      </p>
    </DesignCard>
  );
}
