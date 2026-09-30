import { memo } from 'react';
import { contextPercent, type AgentRecord } from '@rotaris/contracts';
import { clockAdvances, elapsedLabel, elapsedShown } from './AgentTree.js';
import { stalledText, tableOrder } from './agents.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, EmptyState as DesignEmptyState, Table as DesignTable, Tag as DesignTag } from './design-system/index.js';

/**
 * REQ-MONITOR-274/275/116/281 (Part R): the Mission view's agent activity table — one row per agent in the tree's
 * depth-first order: the state dot with the state as text (REQ-SHELL-149), the name, the persona, the activity
 * text, the tool-call count, the elapsed time advancing once a second while the agent is running, waiting or queued
 * (REQ-MONITOR-107/111, `clockAdvances`, the caller's clock), the context as `{used}/{limit}` with its percent (045), and the compression count where the record has
 * one — this record has none, so the cell says so (281). A row is a memoised component keyed by agent id: only
 * rows whose record changed re-render (275's row-by-row refresh); the elapsed cell is the one that changes on
 * the tick, and only for rows whose clock advances. Structure from docs/spec; language from docs/design/system.
 */
export interface AgentTableProps {
  readonly agents: readonly AgentRecord[];
  readonly selected: string | null;
  readonly nowIso: string | null;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (agent: AgentRecord) => void;
  readonly onPopOut: (agent: AgentRecord) => void;
}

const Row = memo(function Row({ a, selected, elapsed, onSelect, onOpen, onPopOut }: { a: AgentRecord; selected: boolean; elapsed: string; onSelect: (id: string) => void; onOpen: (a: AgentRecord) => void; onPopOut: (a: AgentRecord) => void }) {
  const percent = contextPercent(a.contextUsed, a.contextLimit);
  return (
    <tr className={`agent-table__row${selected ? ' is-selected' : ''}`} data-agent-id={a.id} data-state={a.presentationState} aria-selected={selected} onClick={() => onSelect(a.id)}>
      <td className="agent-table__state"><span ref={(element) => { if (element && a.live) markMotionStart(element); }} className={`agent-row__dot agent-row__dot--${a.presentationState}`} aria-hidden="true" /><span className="agent-table__state-text">{a.presentationState}</span>{a.stalledSeconds !== null && <>{' '}<DesignTag className="tag tag-wait agent-row__stalled" data-testid="agent-stalled">{stalledText(a.stalledSeconds)}</DesignTag></>}</td>
      <td className="agent-table__name"><span className="agent-table__given">{a.givenName}</span><span className="agent-table__canonical mono text-secondary">{a.name}</span></td>
      <td className="agent-table__persona">{a.persona}</td>
      <td className="agent-table__activity" title={a.delegationTask || a.activity}>{a.activity || '—'}</td>
      <td className="agent-table__calls mono">{a.toolCalls}</td>
      <td className="agent-table__elapsed mono" data-testid="agent-elapsed">{elapsed}</td>
      <td className="agent-table__context mono" title={`${a.contextUsed.toLocaleString()} of ${a.contextLimit.toLocaleString()} tokens`}>{a.contextUsed.toLocaleString()}/{a.contextLimit.toLocaleString()} <span className="text-secondary">({percent}%)</span></td>
      <td className="agent-table__compressions text-secondary" title="The record carries no compression count in this build (REQ-MONITOR-281).">not recorded</td>
      <td className="agent-table__actions">
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
    <DesignTable className="table agent-table" aria-label="Agent activity">
      <thead>
        <tr><th>State</th><th>Agent</th><th>Persona</th><th>Activity</th><th>Tool calls</th><th>Elapsed</th><th>Context (used/limit)</th><th>Compressions</th><th><span className="visually-hidden">Actions</span></th></tr>
      </thead>
      <tbody>
        {ordered.map((a) => (
          // A terminal row's elapsed is fixed (REQ-MONITOR-107), so its props do not change on the tick and it does not re-render.
          <Row key={a.id} a={a} selected={a.id === selected} elapsed={elapsedShown(a) ? elapsedLabel(a, clockAdvances(a) ? nowIso : a.completedAt) : '—'} onSelect={onSelect} onOpen={onOpen} onPopOut={onPopOut} />
        ))}
      </tbody>
    </DesignTable>
  );
}
