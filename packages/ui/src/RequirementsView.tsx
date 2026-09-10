import { useEffect, useMemo, useState } from 'react';
import {
  COLUMN_TOKENS,
  HEALTH_TOKENS,
  type BoardCard,
  type BoardProjection,
  type ColumnToken,
  type ReqId,
  type RequirementDetail,
} from '@rotaris/contracts';
import {
  AXES,
  EMPTY_AXIS_SENTENCE,
  EMPTY_COLUMN_SENTENCE,
  EMPTY_FILTER,
  SORT_ORDERS,
  columnHeader,
  columnLabel,
  columnsFor,
  describeFilter,
  distribute,
  epicProgressLine,
  evidenceSegments,
  evidenceSummary,
  executionLine,
  filterCards,
  sortCards,
  type BoardFilter,
  type GroupingAxis,
  type SortOrder,
} from '@rotaris/ui-core';

export type RequirementDetailResult =
  | { readonly ok: true; readonly detail: RequirementDetail }
  | { readonly ok: false; readonly reason: string };

export interface RequirementsViewProps {
  readonly workspaceRoot: string;
  readonly board: BoardProjection | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
  readonly onOpenRequirement: (id: ReqId) => Promise<RequirementDetailResult>;
}

function optionValues(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value !== ''))].sort();
}

function isColumnToken(value: string): value is ColumnToken {
  return (COLUMN_TOKENS as readonly string[]).includes(value);
}

function columnEmptySentence(axis: GroupingAxis, key: string): string {
  return axis === 'delivery' && isColumnToken(key) ? EMPTY_COLUMN_SENTENCE[key] : EMPTY_AXIS_SENTENCE;
}

function RequirementCard({ card, board, now, onOpen }: {
  readonly card: BoardCard;
  readonly board: BoardProjection;
  readonly now: string;
  readonly onOpen: (id: ReqId) => void;
}) {
  const evidence = evidenceSegments(card);
  const epic = board.epics.find((candidate) => candidate.id === card.id);
  return (
    <button type="button" className="requirement-card" data-health={card.health} data-column={card.column}
      aria-label={`Open ${card.id}: ${card.title}`} onClick={() => onOpen(card.id)}>
      <span className="requirement-card__topline">
        <span className="mono requirement-card__id">{card.id}</span>
        <span className="tag tag-outline requirement-card__health" title={`Health: ${columnLabel(card.health)}`}>{columnLabel(card.health)}</span>
      </span>
      <span className="requirement-card__title">{card.title}</span>
      <span className="requirement-card__meta">
        <span>{card.priority ?? 'No priority'}</span>
        <span>{card.lifecycle}</span>
        <span>{card.kind}</span>
      </span>
      {epic && <span className="requirement-card__progress">{epicProgressLine(epic)}</span>}
      <span className="requirement-card__evidence" aria-label={evidenceSummary(evidence)}>
        {evidence.length === 0
          ? <span className="requirement-card__evidence-empty">No evidence owed</span>
          : evidence.map((segment) => <span key={segment.kind} className="requirement-card__evidence-segment" data-state={segment.state} title={`${segment.label}: ${segment.stateLabel}`}>{segment.label}</span>)}
      </span>
      <span className="requirement-card__execution">{executionLine(card, now)}</span>
      {card.inFlight && <span className="requirement-card__in-flight">{card.inFlight.label}</span>}
      {card.alerts[0] && <span className="requirement-card__alert">{card.alerts[0]}</span>}
    </button>
  );
}

function RequirementDetailPane({ selected, detail, loading, error, onClose }: {
  readonly selected: ReqId;
  readonly detail: RequirementDetail | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
}) {
  return (
    <aside className="requirements__detail" aria-label={`Requirement ${selected} details`} data-testid="requirement-detail">
      <div className="requirements__detail-head">
        <div>
          <span className="eyebrow">Requirement detail</span>
          <h2 className="display">{detail?.card.id ?? selected}</h2>
        </div>
        <button type="button" className="btn btn-ghost" aria-label="Close requirement detail" onClick={onClose}>Close</button>
      </div>
      {loading && <div className="empty-state"><span className="empty-state-hint">Reading requirement…</span></div>}
      {error && <div className="requirements__error" role="alert">{error}</div>}
      {detail && (
        <div className="requirements__detail-scroll">
          <h3>{detail.card.title}</h3>
          <p className="requirements__prose">{detail.prose}</p>
          <dl className="requirements__facts">
            <div><dt>Delivery</dt><dd>{columnLabel(detail.card.column)}</dd></div>
            <div><dt>Health</dt><dd>{columnLabel(detail.card.health)}</dd></div>
            <div><dt>Source</dt><dd className="mono">{detail.card.sourcePath}</dd></div>
          </dl>
          {detail.card.blocker && (
            <section className="requirements__detail-section">
              <h3>Blocker</h3>
              <p>{detail.card.blocker.reason}</p>
            </section>
          )}
          <section className="requirements__detail-section">
            <h3>Relations · {detail.card.relations.length}</h3>
            {detail.card.relations.length === 0
              ? <p className="text-secondary">No recorded relations.</p>
              : <ul>{detail.card.relations.map((relation) => <li key={`${relation.kind}:${relation.id}`}><span>{columnLabel(relation.kind)}</span> <span className="mono">{relation.id}</span></li>)}</ul>}
          </section>
          <section className="requirements__detail-section">
            <h3>Evidence sites · {detail.evidenceDetail.length}</h3>
            {detail.evidenceDetail.length === 0
              ? <p className="text-secondary">No evidence sites recorded.</p>
              : <ul className="requirements__paths">{detail.evidenceDetail.map((site) => <li key={`${site.kind}:${site.path}:${site.line}`}><span>{columnLabel(site.kind)}</span> <span className="mono">{site.path}:{site.line}</span></li>)}</ul>}
          </section>
          <section className="requirements__detail-section">
            <h3>Runs · {detail.runs.length}</h3>
            {detail.runs.length === 0
              ? <p className="text-secondary">No execution units yet.</p>
              : <ul>{detail.runs.map((run, index) => <li key={`${run.unit}:${index}`}><span className="mono">{run.unit}</span> · {run.status}</li>)}</ul>}
          </section>
          <section className="requirements__detail-section">
            <h3>Findings · {detail.findings.length}</h3>
            {detail.findings.length === 0
              ? <p className="text-secondary">No current findings.</p>
              : <ul>{detail.findings.map((finding, index) => <li key={`${finding.code}:${index}`}><span className="mono">{finding.code}</span> · {finding.severity}</li>)}</ul>}
          </section>
        </div>
      )}
    </aside>
  );
}

/**
 * REQ-SHELL-023 / REQ-TRACE-232..316: the fourth primary view, drawn from the workspace service's immutable
 * board projection. Filtering, sorting, grouping, evidence wording and epic progress all remain in ui-core.
 */
export function RequirementsView({ workspaceRoot, board, loading, error, onRefresh, onOpenRequirement }: RequirementsViewProps) {
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [axis, setAxis] = useState<GroupingAxis>('delivery');
  const [sort, setSort] = useState<SortOrder>('priority');
  const [folds, setFolds] = useState<Readonly<Record<string, boolean>>>({});
  const [selected, setSelected] = useState<ReqId | null>(null);
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const visible = useMemo(() => board ? sortCards(filterCards(board.cards, filter, board.epics), sort) : [], [board, filter, sort]);
  const columns = useMemo(() => board ? columnsFor(axis, visible, board.epics, true) : [], [axis, board, visible]);
  const distributed = useMemo(() => board ? distribute(axis, visible, board.epics, true) : new Map<string, readonly BoardCard[]>(), [axis, board, visible]);
  const sources = useMemo(() => optionValues(board?.cards.map((card) => card.sourceKey) ?? []), [board]);
  const priorities = useMemo(() => optionValues(board?.cards.map((card) => card.priority) ?? []), [board]);

  useEffect(() => {
    if (selected === null) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected]);

  const open = (id: ReqId) => {
    setSelected(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void onOpenRequirement(id).then((result) => {
      if (result.ok) setDetail(result.detail);
      else setDetailError(result.reason);
      setDetailLoading(false);
    });
  };
  const patchFilter = (patch: Partial<BoardFilter>) => setFilter((current) => ({ ...current, ...patch }));
  const hasWorkspace = workspaceRoot !== '(no workspace)';

  return (
    <section className="requirements" data-testid="requirements-view">
      <header className="requirements__header">
        <div>
          <span className="eyebrow">Traceability</span>
          <h1 className="display">Requirements</h1>
          <p className="requirements__summary">
            {board ? `${visible.length} of ${board.cards.length} requirements · generation ${board.generation}` : 'Delivery state, trace evidence, and execution readiness.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={!hasWorkspace || loading} onClick={onRefresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <div className="requirements__toolbar" aria-label="Requirements board controls">
        <label className="requirements__search">
          <span className="visually-hidden">Search requirements</span>
          <input className="input" type="search" placeholder="Search identifier or title" value={filter.text} onChange={(event) => patchFilter({ text: event.currentTarget.value })} />
        </label>
        <label><span>Group</span><select className="input select" value={axis} onChange={(event) => { setAxis(event.currentTarget.value as GroupingAxis); setFolds({}); }}>{AXES.map((value) => <option key={value} value={value}>{columnLabel(value)}</option>)}</select></label>
        <label><span>Sort</span><select className="input select" value={sort} onChange={(event) => setSort(event.currentTarget.value as SortOrder)}>{SORT_ORDERS.map((value) => <option key={value} value={value}>{columnLabel(value)}</option>)}</select></label>
        <details className="requirements__filters">
          <summary>Filters</summary>
          <div className="requirements__filter-grid">
            <label><span>Epic</span><select className="input select" value={filter.epic} onChange={(event) => patchFilter({ epic: event.currentTarget.value })}><option value="">All</option>{board?.epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.id}</option>)}</select></label>
            <label><span>Source</span><select className="input select" value={filter.source} onChange={(event) => patchFilter({ source: event.currentTarget.value })}><option value="">All</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
            <label><span>Lifecycle</span><select className="input select" value={filter.lifecycle} onChange={(event) => patchFilter({ lifecycle: event.currentTarget.value })}><option value="">All</option>{['draft', 'approved', 'deprecated'].map((value) => <option key={value} value={value}>{columnLabel(value)}</option>)}</select></label>
            <label><span>Health</span><select className="input select" value={filter.health} onChange={(event) => patchFilter({ health: event.currentTarget.value })}><option value="">All</option>{HEALTH_TOKENS.map((value) => <option key={value} value={value}>{columnLabel(value)}</option>)}</select></label>
            <label><span>Priority</span><select className="input select" value={filter.priority} onChange={(event) => patchFilter({ priority: event.currentTarget.value })}><option value="">All</option>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <button type="button" className="btn btn-ghost" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
          </div>
        </details>
      </div>
      <p className="requirements__filter-summary" aria-live="polite">{describeFilter(filter)}</p>

      {!hasWorkspace && <div className="empty-state requirements__empty"><span className="empty-state-title">Open a workspace to read its requirements.</span><span className="empty-state-hint">The board follows the workspace shown in the title bar.</span></div>}
      {hasWorkspace && loading && board === null && <div className="empty-state requirements__empty"><span className="empty-state-title">Reading the requirement store…</span></div>}
      {hasWorkspace && error && <div className="requirements__error" role="alert">{error}</div>}
      {hasWorkspace && board && (
        <>
          <div className="requirements__source" data-source={board.source.kind}>
            <span>{board.source.kind === 'store' ? `Source · ${board.source.dir}` : 'No requirement store discovered'}</span>
            <span>{board.source.kind === 'store' ? (board.source.writable ? 'Writable source' : 'Read-only source') : 'Add the configured requirement directory to this workspace.'}</span>
            <span>{board.queue.entries.length} queued · concurrency {board.queue.concurrency}</span>
          </div>
          {board.parseErrors.length > 0 && <div className="requirements__parse-errors" role="alert"><strong>{board.parseErrors.length} source issue{board.parseErrors.length === 1 ? '' : 's'}</strong><ul>{board.parseErrors.slice(0, 4).map((issue, index) => <li key={`${issue.path}:${issue.line ?? 0}:${index}`}><span className="mono">{issue.path}{issue.line ? `:${issue.line}` : ''}</span> · {issue.message}</li>)}</ul></div>}
          {board.cards.length === 0
            ? <div className="empty-state requirements__empty"><span className="empty-state-title">No requirements are available.</span><span className="empty-state-hint">Refresh after the requirement store contains a valid document.</span></div>
            : <div className="requirements__board" aria-label="Requirements board" data-axis={axis}>
                {columns.map((key) => {
                  const cards = distributed.get(key) ?? [];
                  const folded = folds[key] === true;
                  return (
                    <section className="requirements__column" key={key} data-folded={folded ? '1' : '0'}>
                      <button type="button" className="requirements__column-head" aria-expanded={!folded} onClick={() => setFolds((current) => ({ ...current, [key]: !folded }))}>
                        <span>{columnHeader(key, cards.length, axis === 'epic' || axis === 'source')}</span><span aria-hidden="true">{folded ? '＋' : '−'}</span>
                      </button>
                      {!folded && <div className="requirements__column-body">
                        {cards.length === 0
                          ? <p className="requirements__column-empty">{columnEmptySentence(axis, key)}</p>
                          : cards.map((card) => <RequirementCard key={card.id} card={card} board={board} now={board.producedAt} onOpen={open} />)}
                      </div>}
                    </section>
                  );
                })}
              </div>}
        </>
      )}
      {selected && <RequirementDetailPane selected={selected} detail={detail} loading={detailLoading} error={detailError} onClose={() => setSelected(null)} />}
    </section>
  );
}
