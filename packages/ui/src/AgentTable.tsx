import { memo } from 'react';
import { contextPercent, type AgentRecord } from '@rotaris/contracts';
import { clockAdvances, elapsedLabel, elapsedShown } from './AgentTree.js';
import { agentDotState, countNoun, stalledText, tableOrder, TIMED_OUT_TAG, timeoutLine } from './agents.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, EmptyState as DesignEmptyState, StatusDot as DesignStatusDot, Table as DesignTable, Tag as DesignTag } from './design-system/index.js';

/**
 * REQ-MONITOR-274/275/116/281 (Part R; on the Overview since PD-MONITOR-009): the agent activity table — one row per agent in the tree's
 * depth-first order: the state dot with the state as text (REQ-SHELL-149), the name, the persona, the activity
 * text, the tool-call count, the elapsed time advancing once a second while the agent is running, waiting or queued
 * (REQ-MONITOR-107/111, `clockAdvances`, the caller's clock), the context as `{used}/{limit}` with its percent (045), and the
 * agent's compression count (`AgentRecord.compressions`, REQ-MONITOR-086), in its own column whose header names the unit, as the
 * tool-call column's does (281). Until 2026-10-01 that cell read `not recorded`, titled "The record carries no compression
 * count in this build", though the record had carried the count since Part AH
 * (docs/archive/defects/the-mission-table-says-the-record-carries-no-compression-count.md). A row is a memoised component keyed by agent id: only
 * rows whose record changed re-render (275's row-by-row refresh); the elapsed cell is the one that changes on
 * the tick, and only for rows whose clock advances. Structure from docs/spec; language from docs/design/system.
 *
 * PD-MONITOR-009 clause 3: in a card too narrow for one line a row, the row takes three lines and keeps every value
 * (`shell.css`, the `@container` rule on `.mission__table`). The table, its rows and its cells then stand as boxes of a
 * grid, which would cost them their table semantics, so each carries its role in the markup; and since the header row is
 * out of sight in that form, the three figures that would stand unnamed carry their column's words as `data-label`.
 */
export interface AgentTableProps {
  readonly agents: readonly AgentRecord[];
  readonly selected: string | null;
  readonly nowIso: string | null;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (agent: AgentRecord) => void;
  readonly onPopOut: (agent: AgentRecord) => void;
}

/** The table's columns, in order (REQ-MONITOR-274, -116, -281); the last heads the row's two controls and is named for assistive technology alone. */
export const AGENT_TABLE_COLUMNS = ['State', 'Agent', 'Persona', 'Activity', 'Tool calls', 'Elapsed', 'Context (used/limit)', 'Compressions', 'Actions'] as const;
const COLUMNS = AGENT_TABLE_COLUMNS;

/** A token figure, grouped as the Overview's other figures are (`en-US`, as `formatTokens` and the Tokens card write theirs) and never by the host's locale (UIR-301 of the critique of 2026-11-11: `0/265.000` beside the Tokens card's `1,024`). */
const figure = (n: number): string => n.toLocaleString('en-US');

const Row = memo(function Row({ a, selected, elapsed, onSelect, onOpen, onPopOut }: { a: AgentRecord; selected: boolean; elapsed: string; onSelect: (id: string) => void; onOpen: (a: AgentRecord) => void; onPopOut: (a: AgentRecord) => void }) {
  const percent = contextPercent(a.contextUsed, a.contextLimit);
  return (
    <tr role="row" className={`agent-table__row${selected ? ' is-selected' : ''}`} data-agent-id={a.id} data-state={a.presentationState} aria-selected={selected} onClick={() => onSelect(a.id)}>
      <td role="cell" className="agent-table__state"><DesignStatusDot ref={(element) => { if (element && a.live) markMotionStart(element); }} state={agentDotState(a.presentationState)} pulse={a.presentationState === 'running'} /><span className="agent-table__state-text">{a.presentationState}</span>{a.stalledSeconds !== null && <>{' '}<DesignTag kind="wait" className="agent-row__stalled" data-testid="agent-stalled">{stalledText(a.stalledSeconds)}</DesignTag></>}{a.timedOut !== null && <>{' '}<DesignTag kind="fail" className="agent-row__timed-out" data-testid="agent-timed-out" title={timeoutLine(a.timedOut)} aria-description={timeoutLine(a.timedOut)}>{TIMED_OUT_TAG}</DesignTag></>}</td>
      <td role="cell" className="agent-table__name"><span className="agent-table__given">{a.givenName}</span><span className="agent-table__canonical mono text-secondary">{a.name}</span></td>
      <td role="cell" className="agent-table__persona" title={a.persona}>{a.persona}</td>
      <td role="cell" className="agent-table__activity" title={a.delegationTask || a.activity}>{a.activity || '—'}</td>
      <td role="cell" className="agent-table__calls mono" data-label="tool calls">{a.toolCalls}</td>
      <td role="cell" className="agent-table__elapsed mono" data-testid="agent-elapsed">{elapsed}</td>
      <td role="cell" className="agent-table__context mono" data-label="context" title={`${figure(a.contextUsed)} of ${figure(a.contextLimit)} tokens`}>{figure(a.contextUsed)}/{figure(a.contextLimit)} <span className="text-secondary">({percent}%)</span></td>
      <td role="cell" className="agent-table__compressions mono" data-label="compressions" title={countNoun(a.compressions, 'compression')}>{a.compressions}</td>
      <td role="cell" className="agent-table__actions">
        <DesignButton type="button" className="btn btn-ghost btn-compact" onClick={(e) => { e.stopPropagation(); onOpen(a); }} title="Open this agent in the inspector, or in its persona window when the agent pop-out preference is on.">Open</DesignButton>
        <DesignButton type="button" className="btn btn-ghost btn-compact" onClick={(e) => { e.stopPropagation(); onPopOut(a); }} title="Open this agent's persona window.">Pop out</DesignButton>
      </td>
    </tr>
  );
});

export function AgentTable({ agents, selected, nowIso, onSelect, onOpen, onPopOut }: AgentTableProps) {
  const ordered = tableOrder(agents);
  if (ordered.length === 0) {
    return (
      <DesignEmptyState className="empty-state agent-table__empty" data-testid="agent-table-empty">
        <span className="empty-state-title">No agents are working.</span>
        <span className="empty-state-hint">Start a run from the Workspace view, or resume a stored session from the title bar's Sessions browser; every delegated agent lands here as it is spawned.</span>
      </DesignEmptyState>
    );
  }
  return (
    <DesignTable role="table" className="table agent-table" aria-label="Agent activity">
      <thead role="rowgroup">
        <tr role="row">{COLUMNS.map((column) => <th key={column} role="columnheader">{column === 'Actions' ? <span className="visually-hidden">Actions</span> : column}</th>)}</tr>
      </thead>
      <tbody role="rowgroup">
        {ordered.map((a) => (
          // A terminal row's elapsed is fixed (REQ-MONITOR-107), so its props do not change on the tick and it does not re-render.
          <Row key={a.id} a={a} selected={a.id === selected} elapsed={elapsedShown(a) ? elapsedLabel(a, clockAdvances(a) ? nowIso : a.completedAt) : '—'} onSelect={onSelect} onOpen={onOpen} onPopOut={onPopOut} />
        ))}
      </tbody>
    </DesignTable>
  );
}
