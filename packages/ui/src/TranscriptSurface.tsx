import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AgentRecord, EntryRoot, TranscriptRow } from '@rotaris/contracts';
import { elapsedLabel } from './AgentTree.js';
import { countNoun, ownRow } from './agents.js';
import {
  Row, TranscriptSurfaceProvider, defaultExpanded, delegationSummary, expansionKey, placements, rowKey as memberRowKey, rowMenuEntries,
  type DisplayRow, type RowMenuEntry, type RowMenuRequest, type TranscriptSurface,
} from './transcript/Row.js';
import { Button as DesignButton } from './design-system/index.js';

/**
 * Part AA — everything ONE row is not: the surface that holds a set of rows, the single context menu, the
 * keyboard navigation, the delegation-context header and the scope toggle. `Row` stays a pure function of its
 * props; every piece of state a transcript needs lives here, at the surface, where a recycled slot cannot
 * reach it (ADR-0045).
 *
 * `RowList` is the **plain-list** surface. Part Z's recycled pool replaces it in the Workspace transcript;
 * **the persona window keeps this list rather than the pool**, deliberately: it is a small agent-scoped
 * transcript (REQ-MONITOR-071) whose rows are one agent's, and ADR-0045's invariance claim is about the main
 * window's transcript — the pool exists to keep the structural count flat while a conversation grows without
 * bound, which is not a property a per-agent window has to hold. Both surfaces draw the same `Row`, which is
 * Part R's rule (one renderer for every transcript surface) and the reason `TranscriptRows.tsx` is gone.
 */

// ── REQ-CHAT-077: keyboard navigation, as a DOM function so Part Z's pool can bind the same one ────────────

/** The rows of one container, in document order. Both surfaces mark a row with `data-key`. */
function rowsIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(':scope > .row, :scope > * > .row')];
}

/**
 * REQ-CHAT-077: arrow keys, PageUp/PageDown and Home/End all move the current row. The current row is the
 * focused one — there is no second notion of "current" to keep in step with focus, and no per-row prop, so a
 * recycled slot has nothing to carry. Returns whether the key was consumed.
 */
export const PAGE_ROWS = 8;
export function moveCurrentRow(container: HTMLElement, key: string): boolean {
  const rows = rowsIn(container);
  if (rows.length === 0) return false;
  const active = document.activeElement;
  const at = rows.findIndex((r) => r === active || r.contains(active));
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'PageDown' ? PAGE_ROWS : key === 'PageUp' ? -PAGE_ROWS : 0;
  let next = -1;
  if (key === 'Home') next = 0;
  else if (key === 'End') next = rows.length - 1;
  else if (step !== 0) next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
  if (next < 0) return false;
  const target = rows[next]!;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest' });
  return true;
}

// ── REQ-CHAT-075: copying, acknowledged when it works and reported when it does not ────────────────────────

export type Acknowledger = (kind: 'ok' | 'fail' | 'info' | 'warn', title: string, body?: string) => void;

/**
 * REQ-CHAT-075: "A copy the platform refuses MUST be reported as a failure naming what could not be copied and
 * MUST NOT be reported as a success; a copy that succeeds MUST be acknowledged." Both halves go through here,
 * so neither can be forgotten at one call site. The text copied is the row's SOURCE, never its rendered output
 * (ADR-0051), and a group yields its summary rather than raw tool input or output (REQ-CHAT-065).
 */
export async function copyRowEntry(entry: RowMenuEntry, acknowledge: Acknowledger | undefined): Promise<boolean> {
  const what = entry.key === 'message' ? 'the message' : entry.key === 'input' ? 'the tool input' : 'the tool output';
  if (entry.disabled || entry.text === '') {
    acknowledge?.('fail', `Could not copy ${what}`, 'It is empty.');
    return false;
  }
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard) throw new Error('The clipboard is not available in this window.');
    await clipboard.writeText(entry.text);
  } catch (cause) {
    acknowledge?.('fail', `Could not copy ${what}`, cause instanceof Error ? cause.message : String(cause));
    return false;
  }
  acknowledge?.('ok', `Copied ${what}`, `${countNoun(entry.text.length, 'character')}.`);
  return true;
}

/** REQ-CHAT-075: the one context menu of a surface. It is the surface's, not a row's — a row holds no state. */
export function RowContextMenu({ request, acknowledge, onClose }: { request: RowMenuRequest; acknowledge: Acknowledger | undefined; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const away = () => onClose();
    window.addEventListener('pointerdown', away, { capture: true });
    return () => window.removeEventListener('pointerdown', away, { capture: true });
  }, [onClose]);
  return (
    <div
      ref={box}
      className="row__menu"
      role="menu"
      aria-label="Row actions"
      data-testid="row-menu"
      style={{ left: `${request.x}px`, top: `${request.y}px` }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      {request.entries.map((entry) => (
        <DesignButton
          key={entry.key}
          type="button"
          role="menuitem"
          className="row__menu-item"
          data-entry={entry.key}
          disabled={entry.disabled}
          onClick={() => { void copyRowEntry(entry, acknowledge); onClose(); }}
        >{entry.label}</DesignButton>
      ))}
    </div>
  );
}

// ── REQ-CHAT-068: the delegation-context header ────────────────────────────────────────────────────────────

/**
 * REQ-CHAT-068: selecting a CHILD agent places a collapsible delegation-context header above that agent's
 * transcript; selecting a root agent produces none. One of the four row categories of REQ-CHAT-046 with **no
 * persisted row at all**, which is why it is drawn by the surface and never appears in a `DisplayRow`.
 *
 * Expanded: the task name, the persona, the task category, whether it runs in the background or blocks its
 * parent, the full task text, the dependencies and the context inherited from the parent. Collapsed: one line
 * conveying exactly three facts, the task compacted to 110 characters with an ellipsis where it is cut. A
 * payload whose fields are missing or unreadable shows the fields that could be read, surfaces no error and
 * does not prevent the rest of the transcript from rendering.
 *
 * REQ-CHAT-059 keys this expansion by AGENT, which is why the open set is a map rather than a boolean: an
 * opened header stays open while other rows arrive and while the selection moves away and back.
 */
export function DelegationHeader({ agent }: { agent: AgentRecord }) {
  const [open, setOpen] = useState<Readonly<Record<string, boolean>>>({});
  const expanded = open[agent.id] === true;
  const summary = delegationSummary(agent);
  const task = agent.delegationTask !== '' ? agent.delegationTask : agent.activity;
  return (
    <article className="row row--delegation" data-testid="row-delegation" data-agent-id={agent.id} tabIndex={-1}>
      <div className="row__grid">
        <time className="row__time mono" />
        <span className="row__attribution"><span className="row__role">delegation</span></span>
        <div className="row__main">
          <DesignButton
            type="button"
            className="tool__header mono"
            aria-expanded={expanded}
            aria-description={summary}
            data-testid="delegation-header"
            onClick={() => setOpen((o) => ({ ...o, [agent.id]: !expanded }))}
          >
            <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            <span className="tool__name">{summary}</span>
          </DesignButton>
          {expanded && (
            <dl className="row__delegation" data-testid="delegation-detail">
              {agent.name !== '' && (<><dt>Task</dt><dd>{agent.name}</dd></>)}
              {agent.persona !== '' && (<><dt>Persona</dt><dd>{agent.persona}</dd></>)}
              {agent.category !== '' && (<><dt>Category</dt><dd>{agent.category}</dd></>)}
              <dt>Runs</dt><dd>{agent.background ? 'in the background' : 'blocking its parent'}</dd>
              {task !== '' && (<><dt>Task text</dt><dd className="row__delegation-text">{task}</dd></>)}
              {agent.dependencies.length > 0 && (<><dt>Depends on</dt><dd className="mono">{agent.dependencies.join(', ')}</dd></>)}
              {agent.inheritedContext !== '' && (<><dt>Inherited context</dt><dd className="row__delegation-text">{agent.inheritedContext}</dd></>)}
            </dl>
          )}
        </div>
      </div>
    </article>
  );
}

// ── REQ-CHAT-069: the transcript scope toggle ──────────────────────────────────────────────────────────────

export const SCOPE_NO_AGENT = 'Select an agent to scope the transcript to its task.';
/** REQ-CHAT-069: the run-owned kinds a scoped transcript always keeps; a verifier row is never filtered out per agent. */
export const RUN_OWNED_KINDS = new Set(['user', 'system', 'question', 'approval', 'verifier']);

/**
 * REQ-CHAT-069: the run-owned rows plus the selected agent's own (`ownRow`); the run-level agent owns the rows named for
 * its persona and for any of the session's roots (`roots`, `SessionRecord.entryRoots`: a root resumed as the entry role
 * keeps its own persona's name, PD-ORCH-005 clause 4 with OQ-97). **This is the requirement's one implementation.** The
 * projection held a second one that no surface ever reached and that kept three kinds of the five; it is gone
 * (docs/defects/fixed/the-in-projection-scope-filter-is-never-reached.md).
 */
export function scopedRows(rows: readonly TranscriptRow[], agent: AgentRecord | null, roots: readonly EntryRoot[] = []): readonly TranscriptRow[] {
  if (!agent) return rows;
  return rows.filter((r) => RUN_OWNED_KINDS.has(r.kind) || ownRow(r, agent, roots));
}

/**
 * REQ-CHAT-069's state and elapsed time for "This task" (REQ-MONITOR-111). A `paused` agent — and only a `paused` one —
 * reads its state alone (PD-ORCH-005 clause 13, OQ-100): it is neither live nor ended, and in REQ-CHAT-008's recovery
 * state, whose busy status keeps the clock ticking, its figure would count up while nothing runs. Every other agent,
 * a waiting or queued one included, keeps its time as REQ-CHAT-069 asks.
 */
export function scopeDetail(agent: AgentRecord, nowIso: string | null): string {
  return agent.presentationState === 'paused' ? agent.presentationState : `${agent.presentationState} · ${elapsedLabel(agent, nowIso)}`;
}

/**
 * REQ-CHAT-069: "All activity" / "This task", the second naming the agent it refers to and showing that
 * agent's state and its live elapsed wall-clock time, so the reader can tell whose output is being shown
 * without leaving the transcript. With no agent selected "This task" is unavailable **with that as its stated
 * reason** rather than filtering the transcript to nothing.
 */
export function ScopeToggle({ scope, agent, nowIso, onScope }: { scope: 'all' | 'task'; agent: AgentRecord | null; nowIso: string | null; onScope: (s: 'all' | 'task') => void }) {
  const available = agent !== null;
  const label = agent === null ? 'This task' : `This task · ${agent.name}`;
  const detail = agent === null ? SCOPE_NO_AGENT : scopeDetail(agent, nowIso);
  return (
    <div className="seg row__scope" role="radiogroup" aria-label="Transcript scope" data-testid="scope-toggle" data-scope={scope}>
      <DesignButton type="button" role="radio" aria-checked={scope === 'all'} className={`seg-opt${scope === 'all' ? ' is-active' : ''}`} onClick={() => onScope('all')}>All activity</DesignButton>
      <DesignButton
        type="button"
        role="radio"
        aria-checked={scope === 'task' && available}
        className={`seg-opt${scope === 'task' && available ? ' is-active' : ''}`}
        disabled={!available}
        title={detail}
        aria-description={detail}
        data-testid="scope-task"
        onClick={() => onScope('task')}
      >{label}</DesignButton>
      <span className="row__scope-detail text-secondary mono" data-testid="scope-detail">{detail}</span>
    </div>
  );
}

// ── The plain-list surface ─────────────────────────────────────────────────────────────────────────────────

export interface RowListProps {
  readonly rows: readonly TranscriptRow[];
  /** The surface's services and the two display preferences; the list adds the menu, the member map and the clock. */
  readonly surface: Omit<TranscriptSurface, 'openMenu' | 'memberExpanded' | 'toggleMember'>;
  readonly acknowledge?: Acknowledger | undefined;
  /** REQ-CHAT-051: the trailer rows this surface appends after every recorded row. */
  readonly trailers?: readonly DisplayRow[] | undefined;
  /**
   * The displayed array outright, replacing what would be derived from `rows`. Part Z's step 4 computes this for the
   * Workspace transcript; until it lands, Part AA's proof harness passes one so a **folded group** — a category with no
   * persisted row of its own — can be drawn and read.
   */
  readonly displays?: readonly DisplayRow[] | undefined;
  readonly label?: string | undefined;
}

/**
 * One transcript surface's rows, in index order, each drawn by the ONE renderer. Holds the expansion map
 * (REQ-CHAT-059, keyed by stable identity), the one context menu (REQ-CHAT-075) and the keyboard navigation
 * (REQ-CHAT-077). Part Z's pool holds the same three for the Workspace transcript; nothing here is a row's.
 */
export function RowList({ rows, surface, acknowledge, trailers, displays: given, label }: RowListProps) {
  const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});
  const [menu, setMenu] = useState<RowMenuRequest | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const displays = useMemo<readonly DisplayRow[]>(
    () => given ?? [...rows.map((row): DisplayRow => ({ shape: 'row', key: memberRowKey(row), row })), ...(trailers ?? [])],
    [given, rows, trailers],
  );
  const places = useMemo(() => placements(displays), [displays]);
  const toggle = useCallback((key: string, fallback: boolean) => setExpanded((e) => ({ ...e, [key]: !(e[key] ?? fallback) })), []);
  const value = useMemo<TranscriptSurface>(() => ({
    ...surface,
    openMenu: (request) => setMenu(request),
    // R0-4: a member's card is `memberKey(member)` — the identity step 4 holds the caps against — so opening
    // the card and lifting its caps are one gesture. The map still never collides with the GROUP's own key:
    // `project.ts` keys a group `group:<first member's key>`, whose `group:` prefix no member key carries.
    // `expansionKey` stays the single definition of the SHAPE part, which is what keeps a group's identity
    // apart from its members' — the two carry the same string under REQ-CHAT-059 and would otherwise open
    // together (recorded as
    // docs/defects/fixed/expanding-a-member-of-an-activity-line-does-not-lift-the-display-caps.md).
    memberExpanded: (key) => expanded[expansionKey('row', key)] === true,
    toggleMember: (key) => toggle(expansionKey('row', key), false),
  }), [surface, expanded, toggle]);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      // REQ-CHAT-075: Ctrl+C copies the selected message. A pointer selection is the platform's to copy; with
      // none, the current row's own text is what "the selected message" means, and either way it is acknowledged.
      const selected = window.getSelection?.()?.toString() ?? '';
      const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.row');
      const key = current?.dataset['key'];
      const display = key === undefined ? undefined : displays.find((d) => d.key === key);
      if (selected !== '') { void copyRowEntry({ key: 'message', label: 'Copy message', text: selected, disabled: false }, acknowledge); e.preventDefault(); return; }
      if (display) { void copyRowEntry(rowMenuEntries(display)[0]!, acknowledge); e.preventDefault(); }
      return;
    }
    if (box.current && moveCurrentRow(box.current, e.key)) e.preventDefault();
  };
  return (
    <div ref={box} className="rowlist" data-testid="rowlist" data-rows={displays.length} aria-label={label} onKeyDown={onKeyDown}>
      <TranscriptSurfaceProvider value={value}>
        {displays.map((display, i) => (
          <Row
            key={display.key}
            display={display}
            expanded={expanded[expansionKey(display.shape, display.key)] ?? defaultExpanded(display, surface)}
            onToggle={() => toggle(expansionKey(display.shape, display.key), defaultExpanded(display, surface))}
            match={null}
            place={places[i]!}
          />
        ))}
      </TranscriptSurfaceProvider>
      {menu && <RowContextMenu request={menu} acknowledge={acknowledge} onClose={() => setMenu(null)} />}
    </div>
  );
}

