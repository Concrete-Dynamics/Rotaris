import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROPOSAL_STATUSES,
  type ImprovementArtifactRecord,
  type ImprovementProposal,
  type ImprovementRollbackPreview,
  type ImprovementRollbackResult,
  type ProposalStatus,
  type RecordedImprovementVersion,
} from '@rotaris/contracts';
import type { LibraryTabProps } from './types.js';
import {
  Button as DesignButton,
  Checkbox as DesignCheckbox,
  EmptyState as DesignEmptyState,
  Input as DesignInput,
  Table as DesignTable,
  Tag as DesignTag,
  TextArea as DesignTextArea,
  layoutContractAttributes,
  type UiLayoutContract,
} from '../design-system/index.js';
import { useShellState } from '../shell-state.js';
import { startRetrospective } from '../workspace-host.js';

/**
 * PD-LIBRARY-002's gesture, on the first of its three surfaces. It is disabled only while an analysis is
 * already running — one FIFO orders both passes (REQ-LIBRARY-123), so a second gesture would queue rather
 * than start — and states that as its reason. Everything the gesture can be refused for afterwards (no model
 * configured, nothing in the workspace to read) arrives as the notice REQ-LIBRARY-037's shape fixes.
 */
export const RETROSPECTIVE_LABEL = 'Run retrospective';

/** The proposals surface stays inside the view and never scrolls the window; published by the one publisher. */
export const PROPOSALS_LAYOUT: UiLayoutContract = {
  id: 'library-proposals',
  relations: [{ kind: 'containment' }, { kind: 'viewport-scroll', axis: 'both', expected: false }],
};
export const RETROSPECTIVE_DESCRIPTION = "Look back over this workspace's own history and propose improvements.";
export const RETROSPECTIVE_BUSY_REASON = 'An improvement analysis is already running.';

export interface ImprovementHistoryPayload {
  readonly versions: readonly RecordedImprovementVersion[];
  readonly skipped: readonly number[];
  readonly versionsPruned: number;
  readonly versionsNeverRecorded: number;
}

export interface ProposalMutationResult {
  readonly record: ImprovementArtifactRecord;
  readonly changed: boolean;
}

export interface ProposalReviewResult extends ProposalMutationResult {
  readonly previous: ProposalStatus;
  readonly current: ProposalStatus;
}

export interface ProposalsTabProps extends LibraryTabProps {
  readonly focusedProposalId?: string | null;
  readonly onConsumeFocusedProposal?: () => void;
  readonly onRead: () => Promise<{ ok: true; records: readonly ImprovementArtifactRecord[] } | { ok: false; reason: string }>;
  readonly onHistory: (artifactId: string) => Promise<{ ok: true; history: ImprovementHistoryPayload } | { ok: false; reason: string }>;
  readonly onReview: (artifactId: string, proposalId: string, status: ProposalStatus, expectedVersionsDue: number) => Promise<{ ok: true; result: ProposalReviewResult } | { ok: false; reason: string }>;
  readonly onEdit: (artifactId: string, proposalId: string, summary: string, recommendedAction: string, expectedVersionsDue: number) => Promise<{ ok: true; result: ProposalMutationResult } | { ok: false; reason: string }>;
  readonly onDelete: (artifactId: string, proposalId: string, expectedVersionsDue: number) => Promise<{ ok: true; result: ProposalMutationResult } | { ok: false; reason: string }>;
  readonly onExport: (artifactId?: string) => Promise<{ ok: true; cancelled: boolean; destination?: string } | { ok: false; reason: string }>;
  readonly onStart?: (artifactId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onRollbackPreview?: (artifactId: string) => Promise<{ ok: true; preview: ImprovementRollbackPreview } | { ok: false; reason: string }>;
  readonly onRollback?: (artifactId: string, force: boolean) => Promise<{ ok: true; result: ImprovementRollbackResult } | { ok: false; reason: string }>;
}

export interface ProposalRow {
  readonly artifactId: string;
  readonly versionsDue: number;
  readonly proposal: ImprovementProposal;
}

export const categoryLabel = (value: string): string => value.replaceAll('_', ' ');
export const statusLabel = (value: ProposalStatus): string => value === 'pending_review' ? 'pending' : value;

export function relativeCreatedLabel(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return 'now';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function proposalRows(records: readonly ImprovementArtifactRecord[]): readonly ProposalRow[] {
  return records.flatMap((record) => record.artifact.proposals.map((proposal) => ({ artifactId: record.artifact.artifact_id, versionsDue: record.versions_due, proposal })));
}

export function proposalMatches(row: ProposalRow, query: string): boolean {
  if (query === '') return true;
  const proposal = row.proposal;
  return `${proposal.summary} ${proposal.category} ${proposal.status} ${proposal.recommended_action}`.toLowerCase().includes(query);
}

export function artifactCounts(record: ImprovementArtifactRecord): string {
  const counts = new Map(PROPOSAL_STATUSES.map((status) => [status, 0]));
  for (const proposal of record.artifact.proposals) counts.set(proposal.status, (counts.get(proposal.status) ?? 0) + 1);
  const labels = PROPOSAL_STATUSES.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count === 0 ? [] : [`${count} ${statusLabel(status)}`];
  });
  return labels.length === 0 ? 'no proposals' : labels.join(' · ');
}

export function rollbackLabel(record: ImprovementArtifactRecord): string {
  return record.artifact.checkpoints.some((checkpoint) => checkpoint.kind === 'pre_improvement') ? 'rollback point recorded' : 'no rollback point';
}

export function ProposalDecisionDialog({ proposal, status, onConfirm, onCancel }: { proposal: ImprovementProposal; status: ProposalStatus; onConfirm: () => void; onCancel: () => void }) {
  const titles: Record<ProposalStatus, string> = {
    approved: 'Approve proposal?',
    rejected: 'Reject proposal?',
    deferred: 'Defer proposal?',
    pending_review: 'Reset proposal to pending review?',
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog proposal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="proposal-decision-title">
        <h2 id="proposal-decision-title" className="dialog-title">{titles[status]}</h2>
        <p className="dialog-body">{proposal.summary}</p>
        <p className="dialog-body">Category: {categoryLabel(proposal.category)}</p>
        <p className="dialog-body">This records a review decision; it does not execute workspace changes.</p>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-primary" onClick={onConfirm}>Yes</DesignButton>
        </div>
      </div>
    </div>
  );
}

function ProposalEditor({ proposal, onSave, onCancel }: { proposal: ImprovementProposal; onSave: (summary: string, action: string) => void; onCancel: () => void }) {
  const [summary, setSummary] = useState(proposal.summary);
  const [action, setAction] = useState(proposal.recommended_action);
  const summaryError = summary.trim() === '';
  const actionError = !summaryError && action.trim() === '';
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog proposal-dialog proposal-dialog--edit" role="dialog" aria-modal="true" aria-labelledby="proposal-edit-title">
        <h2 id="proposal-edit-title" className="dialog-title">Edit improvement proposal</h2>
        <label className="field"><span className="field-label">Summary</span><DesignInput className="input" aria-label="Proposal summary" value={summary} onChange={(event) => setSummary(event.currentTarget.value)} /></label>
        <label className="field"><span className="field-label">Recommended action</span><DesignTextArea className="input proposal-dialog__action" aria-label="Proposal recommended action" value={action} onChange={(event) => setAction(event.currentTarget.value)} /></label>
        <div className="proposal-dialog__validation" role="status">{summaryError ? 'Summary cannot be empty.' : actionError ? 'Recommended action cannot be empty.' : ''}</div>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-primary" disabled={summaryError || actionError} onClick={() => onSave(summary.trim(), action.trim())}>Save changes</DesignButton>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ proposal, onConfirm, onCancel }: { proposal: ImprovementProposal; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog proposal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="proposal-delete-title">
        <h2 id="proposal-delete-title" className="dialog-title">Delete proposal?</h2>
        <p className="dialog-body">{proposal.summary}</p>
        <p className="dialog-body">This permanently removes the proposal. This cannot be undone.</p>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-warning" onClick={onConfirm}>Yes</DesignButton>
        </div>
      </div>
    </div>
  );
}

function RollbackDialog({ preview, busy, onConfirm, onCancel }: { preview: ImprovementRollbackPreview; busy: boolean; onConfirm: (force: boolean) => void; onCancel: () => void }) {
  const [force, setForce] = useState(false);
  const refused = preview.blocked_reason !== null && !preview.dirty_only;
  const canConfirm = !refused && (preview.blocked_reason === null || force);
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog proposal-dialog proposal-dialog--rollback" role="alertdialog" aria-modal="true" aria-labelledby="proposal-rollback-title">
        <h2 id="proposal-rollback-title" className="dialog-title">Roll back improvement?</h2>
        {preview.blocked_reason !== null && <p className="dialog-body proposal-dialog__warning" role="alert">{preview.blocked_reason}</p>}
        {preview.entries.length === 0 && preview.blocked_reason === null
          ? <p className="dialog-body">This rollback would change nothing.</p>
          : preview.entries.length > 0 && <div className="proposal-dialog__paths"><span className="field-label">Workspace changes</span>{preview.entries.map((entry) => <div key={entry.path}><DesignTag className="tag tag-outline">{entry.action}</DesignTag><span className="mono">{entry.path}</span></div>)}</div>}
        {preview.dirty.length > 0 && <div className="proposal-dialog__paths"><span className="field-label">Work made since the run ({preview.dirty.length})</span>{preview.dirty.map((path) => <div key={path}><span className="mono">{path}</span></div>)}</div>}
        {preview.dirty_only && <DesignCheckbox checked={force} onChange={(event) => setForce(event.currentTarget.checked)} label="Overwrite work made since the improvement run" />}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus disabled={busy} onClick={onCancel}>Cancel</DesignButton>
          {!refused && <DesignButton type="button" className="btn btn-warning" disabled={!canConfirm || busy} onClick={() => onConfirm(force)}>Confirm rollback</DesignButton>}
        </div>
      </div>
    </div>
  );
}

export function ProposalsTab(props: ProposalsTabProps) {
  const { focusedProposalId, onConsumeFocusedProposal, onHistory, onRead, revision } = props;
  const [records, setRecords] = useState<readonly ImprovementArtifactRecord[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [history, setHistory] = useState<ImprovementHistoryPayload | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const analysisRunning = useShellState((state) => state.improvementAnalysis.active);
  const [decision, setDecision] = useState<ProposalStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rollbackPreview, setRollbackPreview] = useState<ImprovementRollbackPreview | null>(null);
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  const read = async () => {
    const result = await props.onRead();
    if (!result.ok) { setRecords([]); setError(result.reason); return; }
    setError(null);
    setRecords(result.records);
    setSelectedArtifact((current) => current !== null && result.records.some((record) => record.artifact.artifact_id === current)
      ? current : result.records[0]?.artifact.artifact_id ?? null);
  };

  useEffect(() => { let live = true; void onRead().then((result) => { if (!live) return; if (!result.ok) { setRecords([]); setError(result.reason); return; } setError(null); setRecords(result.records); setSelectedArtifact((current) => current !== null && result.records.some((record) => record.artifact.artifact_id === current) ? current : result.records[0]?.artifact.artifact_id ?? null); }); return () => { live = false; }; }, [onRead, revision]);

  const allRows = useMemo(() => proposalRows(records), [records]);
  const visibleRows = useMemo(() => allRows.filter((row) => (selectedArtifact === null || row.artifactId === selectedArtifact) && proposalMatches(row, props.query)), [allRows, props.query, selectedArtifact]);
  const chosenRow = visibleRows.find((row) => row.proposal.id === selectedProposal) ?? visibleRows[0] ?? null;
  const chosenRecord = records.find((record) => record.artifact.artifact_id === selectedArtifact) ?? null;

  useEffect(() => {
    const focus = focusedProposalId;
    if (!focus) return;
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      const row = allRows.find((candidate) => candidate.proposal.id === focus);
      if (row) { setSelectedArtifact(row.artifactId); setSelectedProposal(focus); requestAnimationFrame(() => selectedRowRef.current?.scrollIntoView({ block: 'nearest' })); }
    onConsumeFocusedProposal?.();
    });
    return () => { live = false; };
  }, [allRows, focusedProposalId, onConsumeFocusedProposal]);

  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      if (!selectedArtifact) { setHistory(null); setSelectedVersion(null); return; }
    void onHistory(selectedArtifact).then((result) => {
        if (!live) return;
        if (!result.ok) { setHistory(null); setError(result.reason); return; }
        setHistory(result.history);
        setSelectedVersion((current) => result.history.versions.some((version) => version.version === current) ? current : result.history.versions[0]?.version ?? null);
      });
    });
    return () => { live = false; };
  }, [onHistory, revision, selectedArtifact, chosenRecord?.versions_due]);

  const mutate = async (work: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.ok) { setError(result.reason); return; }
    await read();
  };
  const review = (status: ProposalStatus) => {
    if (!chosenRow) return;
    void mutate(async () => {
      const result = await props.onReview(chosenRow.artifactId, chosenRow.proposal.id, status, chosenRow.versionsDue);
      return result.ok ? { ok: true } : result;
    });
    setDecision(null);
  };
  const previewRollback = async (artifactId: string) => {
    if (!props.onRollbackPreview) return;
    setBusy(true);
    const result = await props.onRollbackPreview(artifactId);
    setBusy(false);
    if (!result.ok) { setError(result.reason); return; }
    setRollbackPreview(result.preview);
  };

  const selectedHistory = history?.versions.find((version) => version.version === selectedVersion) ?? null;
  const checkpoint = chosenRecord?.artifact.checkpoints.find((item) => item.kind === 'pre_improvement') ?? null;
  return (
    <section className="library-proposals" aria-label="Improvement proposals" data-testid="library-proposals" {...layoutContractAttributes(PROPOSALS_LAYOUT)}>
      <div className="library-proposals__toolbar">
        <span className="card-meta">Workspace-scoped review records stay available across sessions.</span>
        <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="library-retrospective"
          disabled={analysisRunning} aria-disabled={analysisRunning} title={analysisRunning ? RETROSPECTIVE_BUSY_REASON : RETROSPECTIVE_DESCRIPTION}
          onClick={() => { startRetrospective(); }}>{RETROSPECTIVE_LABEL}</DesignButton>
        <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={() => { void props.onExport(); }}>Export all</DesignButton>
      </div>
      {error && <div className="composer__error" role="alert" data-testid="library-proposals-error">{error}</div>}
      {records.length === 0 ? (
        <DesignEmptyState className="empty-state library__empty" data-testid="library-improvements-empty">
          <span className="empty-state-title">No improvement artifacts exist yet.</span>
          <span className="empty-state-hint">Finishing a task run produces them when the improvement collector finds reviewable suggestions, and a retrospective produces them from this workspace&rsquo;s own history.</span>
        </DesignEmptyState>
      ) : (
        <div className="library-proposals__grid">
          <section className="card card--accent library-proposals__artifacts" aria-label="Improvement artifacts" data-ui="library-proposal-artifacts">
            <div className="ov-card__head"><span className="card-kicker">Improvement artifacts</span><DesignButton type="button" className="btn btn-link btn-compact" onClick={() => setSelectedArtifact(null)}>Show all proposals</DesignButton></div>
            <div className="library-proposals__table-wrap">
              <DesignTable className="table library-proposals__table" aria-label="Improvement artifacts">
                <thead><tr><th>Artifact</th><th>Generated</th><th>Rollback</th><th>Proposal counts</th></tr></thead>
                <tbody>{records.map((record) => {
                  const id = record.artifact.artifact_id;
                  return <tr key={id} className={selectedArtifact === id ? 'is-selected' : ''} aria-selected={selectedArtifact === id} onClick={() => setSelectedArtifact(id)}>
                    <td className="mono">{id}</td><td className="mono">{new Date(record.artifact.generated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</td><td>{rollbackLabel(record)}</td><td>{artifactCounts(record)}</td>
                  </tr>;
                })}</tbody>
              </DesignTable>
            </div>
          </section>

          <section className="card card--accent library-proposals__proposals" aria-label="Improvement proposals" data-ui="library-proposal-table">
            <div className="ov-card__head"><span><span className="card-kicker">Improvement proposals</span><span className="card-meta library-proposals__note">Evidence-backed suggestions from the improvement collector after each run.</span></span><span className="card-meta">{visibleRows.length} shown</span></div>
            {visibleRows.length === 0 ? <DesignEmptyState className="empty-state library__empty"><span className="empty-state-title">No proposals yet. They appear here after a run's improvement collector finds signals.</span></DesignEmptyState> : (
              <div className="library-proposals__table-wrap">
                <DesignTable className="table library-proposals__table" aria-label="Improvement proposals">
                  <thead><tr><th>Summary</th><th>Category</th><th>Risk</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>{visibleRows.map((row) => <tr key={`${row.artifactId}:${row.proposal.id}`} ref={row.proposal.id === chosenRow?.proposal.id ? selectedRowRef : undefined} className={row.proposal.id === chosenRow?.proposal.id ? 'is-selected' : ''} aria-selected={row.proposal.id === chosenRow?.proposal.id} onClick={() => setSelectedProposal(row.proposal.id)} onDoubleClick={() => setEditing(true)}>
                    <td title={row.proposal.recommended_action}>{row.proposal.summary}</td><td>{categoryLabel(row.proposal.category)}</td><td><DesignTag className={`tag tag-${row.proposal.risk === 'high' ? 'failure' : row.proposal.risk === 'medium' ? 'outline' : 'neutral'}`}>{row.proposal.risk}</DesignTag></td><td>{statusLabel(row.proposal.status)}</td><td className="mono">{relativeCreatedLabel(row.proposal.created_at)}</td>
                  </tr>)}</tbody>
                </DesignTable>
              </div>
            )}
            <div className="library-proposals__recommendation">{chosenRow ? `Recommended action: ${chosenRow.proposal.recommended_action}` : 'Select a proposal to see its recommended action.'}</div>
            <div className="library-proposals__actions">
              {PROPOSAL_STATUSES.map((status) => <DesignButton key={status} type="button" className="btn btn-secondary btn-compact" disabled={!chosenRow || chosenRow.proposal.status === status || busy} onClick={() => setDecision(status)}>{status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : status === 'deferred' ? 'Defer' : 'Reset to pending'}</DesignButton>)}
              <span className="library-proposals__spacer" />
              <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={!chosenRow || busy} onClick={() => setEditing(true)}>Edit</DesignButton>
              <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={!chosenRow || busy} onClick={() => setDeleting(true)}>Delete</DesignButton>
            </div>
          </section>

          {chosenRecord && <section className="card library-proposals__detail" aria-label={`Improvement artifact ${chosenRecord.artifact.artifact_id}`} data-ui="library-proposal-detail">
            <div className="ov-card__head"><span className="card-kicker">Artifact detail</span><span className="mono card-meta">{chosenRecord.artifact.artifact_id}</span></div>
            <dl className="library-proposals__facts">
              <div><dt>Generated</dt><dd>{new Date(chosenRecord.artifact.generated_at).toLocaleString()}</dd></div>{/* PD-LIBRARY-002: a retrospective belongs to no session, so the cell says what it DOES belong to — an empty
                  cell would read as a session the record failed to name rather than as a pass that never had one. */}
              <div><dt>Source</dt><dd className="mono" data-testid="library-proposal-source">{chosenRecord.artifact.source_kind === 'retrospective' ? `This workspace's history · ${chosenRecord.artifact.considered_session_ids.length} session(s)` : chosenRecord.artifact.source_session_id}</dd></div>
              <div><dt>Proposals</dt><dd>{artifactCounts(chosenRecord)}</dd></div><div><dt>Rollback</dt><dd>{checkpoint ? `${checkpoint.ref} · ${checkpoint.commit.slice(0, 12)}` : 'No rollback point recorded.'}{chosenRecord.artifact.rolled_back_at ? ` Rolled back ${new Date(chosenRecord.artifact.rolled_back_at).toLocaleString()}.` : ''}</dd></div>
            </dl>
            <div className="library-proposals__detail-actions">
              <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void props.onExport(chosenRecord.artifact.artifact_id); }}>Export artifact</DesignButton>
              <DesignButton type="button" className="btn btn-primary btn-compact" disabled={busy || chosenRecord.artifact.proposals.every((proposal) => proposal.status !== 'approved') || props.onStart === undefined} onClick={() => { if (!props.onStart) return; void mutate(() => props.onStart!(chosenRecord.artifact.artifact_id)); }}>Start improvement run</DesignButton>
              <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy || !checkpoint || props.onRollbackPreview === undefined || props.onRollback === undefined} title={!checkpoint ? 'This artifact has no rollback point.' : undefined} onClick={() => { void previewRollback(chosenRecord.artifact.artifact_id); }}>Roll back</DesignButton>
            </div>
            <div className="library-proposals__stored"><span className="field-label">Stored proposal order</span>{chosenRecord.artifact.proposals.map((proposal) => <div key={proposal.id}><span className="mono">{proposal.id}</span> · {statusLabel(proposal.status)} · {proposal.risk} · {proposal.summary}</div>)}</div>
            <div className="library-proposals__history">
              <div className="library-proposals__history-list"><span className="field-label">Recorded history</span>{history?.versions.map((version) => <DesignButton key={version.version} type="button" className={`btn btn-link${version.version === selectedVersion ? ' is-active' : ''}`} onClick={() => setSelectedVersion(version.version)}>v{version.version} · {new Date(version.recorded_at).toLocaleString()} · {version.cause}</DesignButton>)}</div>
              <div className="library-proposals__history-state"><span className="field-label">Version contents</span>{selectedHistory?.artifact.proposals.map((proposal) => <div key={proposal.id} className="library-proposals__history-proposal"><span className="mono">{proposal.id}</span><strong>{proposal.summary}</strong><span>{proposal.recommended_action}</span></div>)}{history && <span className="card-meta">Retention pruned {history.versionsPruned}; never recorded {history.versionsNeverRecorded}; unreadable versions {history.skipped.length === 0 ? 'none' : history.skipped.join(', ')}.</span>}</div>
            </div>
          </section>}
        </div>
      )}
      {decision && chosenRow && <ProposalDecisionDialog proposal={chosenRow.proposal} status={decision} onCancel={() => setDecision(null)} onConfirm={() => review(decision)} />}
      {editing && chosenRow && <ProposalEditor proposal={chosenRow.proposal} onCancel={() => setEditing(false)} onSave={(summary, action) => { setEditing(false); void mutate(async () => { const result = await props.onEdit(chosenRow.artifactId, chosenRow.proposal.id, summary, action, chosenRow.versionsDue); return result.ok ? { ok: true } : result; }); }} />}
      {deleting && chosenRow && <DeleteDialog proposal={chosenRow.proposal} onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); void mutate(async () => { const result = await props.onDelete(chosenRow.artifactId, chosenRow.proposal.id, chosenRow.versionsDue); return result.ok ? { ok: true } : result; }); }} />}
      {rollbackPreview && <RollbackDialog preview={rollbackPreview} busy={busy} onCancel={() => setRollbackPreview(null)} onConfirm={(force) => { if (!props.onRollback) return; const artifactId = rollbackPreview.artifact_id; void mutate(async () => { const result = await props.onRollback!(artifactId, force); if (result.ok) setRollbackPreview(null); return result.ok ? { ok: true } : result; }); }} />}
    </section>
  );
}
