import { useState, type KeyboardEvent } from 'react';
import type { AgentRecord } from '@rotaris/contracts';
import { markMotionStart } from './motion.js';

/**
 * REQ-MONITOR-036..047, REQ-MONITOR-304: the delegation tree — a depth-first list of rows with box-drawing
 * prefixes (`├─ `, `└─ `, `│  `, three spaces), a state-coloured dot that pulses while the agent is live,
 * the persona (brighter while live) with the task name beneath, the meta label (elapsed, else the state),
 * a tooltip carrying the full task, selection on click, and the keyboard model — Up/Down through the
 * depth-first order, Left collapses or goes to the parent, Right expands or goes to the first child,
 * Home/End, no-ops at a boundary. The run's synthetic root is never a row (REQ-MONITOR-043). State is
 * always text as well as colour (REQ-SHELL-149). Structure from docs/spec; language from the design system.
 */
export interface TreeRow {
  readonly agent: AgentRecord;
  readonly prefix: string;
  readonly depth: number;
  readonly hasChildren: boolean;
}

/** REQ-MONITOR-036/037: depth-first; an agent whose parent is unknown or the run itself is a root row. */
export function treeRows(agents: readonly AgentRecord[], collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
  const ids = new Set(agents.map((a) => a.id));
  const byParent = new Map<string, AgentRecord[]>();
  for (const a of agents) {
    const parent = ids.has(a.parentId) ? a.parentId : '';
    byParent.set(parent, [...(byParent.get(parent) ?? []), a]);
  }
  const out: TreeRow[] = [];
  const visit = (parent: string, depth: number, ancestorLines: boolean[]) => {
    const kids = byParent.get(parent) ?? [];
    kids.forEach((a, i) => {
      const last = i === kids.length - 1;
      const prefix = depth === 0 ? '' : `${ancestorLines.map((l) => (l ? '│  ' : '   ')).join('')}${last ? '└─ ' : '├─ '}`;
      const hasChildren = (byParent.get(a.id) ?? []).length > 0;
      out.push({ agent: a, prefix, depth, hasChildren });
      if (hasChildren && !collapsed.has(a.id)) visit(a.id, depth + 1, [...ancestorLines, !last]);
    });
  };
  visit('', 0, []);
  return out;
}

/**
 * REQ-MONITOR-107/110/111 (resolution item 25; the note "a waiting agent's elapsed time is not shown", R-067, OQ-122): the
 * agent's elapsed clock advances — every agent neither ended nor `paused` that holds a spawn timestamp, so running,
 * waiting or queued (REQ-MONITOR-064's "live (running, waiting, or queued)"). It is NOT `AgentRecord.live`: that is
 * REQ-MONITOR-045's running-only sense, which drives the pulse and the inspector's writability and stays as it is. A
 * `paused` agent keeps OQ-100's reading — neither live nor ended, no figure — since nothing runs for it and in
 * REQ-CHAT-008's recovery state the busy status keeps the tick going.
 */
export function clockAdvances(agent: Pick<AgentRecord, 'presentationState' | 'completedAt' | 'spawnedAt'>): boolean {
  const s = agent.presentationState;
  return agent.completedAt === null && (s === 'running' || s === 'waiting' || s === 'queued') && !Number.isNaN(Date.parse(agent.spawnedAt));
}
/** REQ-MONITOR-107/111: the figure is shown — fixed once the agent ended, advancing while `clockAdvances`; else the fallback. */
export function elapsedShown(agent: Pick<AgentRecord, 'presentationState' | 'completedAt' | 'spawnedAt'>): boolean {
  return agent.completedAt !== null || clockAdvances(agent);
}

export function elapsedLabel(a: AgentRecord, nowIso: string | null): string {
  if (!nowIso) return a.presentationState;
  const from = new Date(a.spawnedAt).getTime();
  const to = new Date(a.completedAt ?? nowIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return a.presentationState;
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export interface AgentTreeProps {
  readonly agents: readonly AgentRecord[];
  readonly selected: string | null;
  /** `source` says whether a pointer click or a key move selected the row: REQ-SHELL-073's pop-out-on-click follows a click only. */
  readonly onSelect: (id: string | null, source?: 'click' | 'key') => void;
  readonly nowIso?: string | null | undefined;
}

export function AgentTree({ agents, selected, onSelect, nowIso = null }: AgentTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = treeRows(agents, collapsed);
  const index = rows.findIndex((r) => r.agent.id === selected);
  const move = (to: number) => { const r = rows[to]; if (r) onSelect(r.agent.id, 'key'); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const i = index < 0 ? 0 : index;
    const row = rows[i]!;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (i < rows.length - 1) move(i + 1); break;
      case 'ArrowUp': e.preventDefault(); if (i > 0) move(i - 1); break;
      case 'Home': e.preventDefault(); move(0); break;
      case 'End': e.preventDefault(); move(rows.length - 1); break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (row.hasChildren && !collapsed.has(row.agent.id)) setCollapsed(new Set([...collapsed, row.agent.id]));
        else { const parent = rows.findIndex((r) => r.agent.id === row.agent.parentId); if (parent >= 0) move(parent); }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (row.hasChildren && collapsed.has(row.agent.id)) { const next = new Set(collapsed); next.delete(row.agent.id); setCollapsed(next); }
        else if (row.hasChildren) move(i + 1);
        break;
      }
      default: break;
    }
  };
  if (agents.length === 0) return <div className="agent-tree agent-tree--empty text-secondary" aria-label="Agents">No delegated agents.</div>;
  return (
    <div className="agent-tree" role="tree" aria-label="Agents" tabIndex={0} onKeyDown={onKey}>
      {rows.map((r) => {
        const a = r.agent;
        const isSelected = a.id === selected;
        return (
          <div
            key={a.id}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={r.hasChildren ? !collapsed.has(a.id) : undefined}
            aria-level={r.depth + 1}
            className={`agent-row agent-row--${a.presentationState}${isSelected ? ' is-selected' : ''}${a.live ? ' is-live' : ''}`}
            title={a.delegationTask || a.activity || a.name}
            onClick={() => onSelect(a.id, 'click')}
            data-task-id={a.id}
            data-state={a.presentationState}
          >
            <span className="agent-row__prefix mono" aria-hidden="true">{r.prefix}</span>
            <span ref={(element) => { if (element && a.presentationState === 'running') markMotionStart(element); }} className={`agent-row__dot agent-row__dot--${a.presentationState}`} aria-hidden="true" />
            <span className="agent-row__main">
              <span className="agent-row__persona">{a.persona}</span>
              <span className="agent-row__task">{a.givenName}</span>
            </span>
            <span className="agent-row__meta mono">{a.presentationState}{elapsedShown(a) ? ` · ${elapsedLabel(a, nowIso)}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
