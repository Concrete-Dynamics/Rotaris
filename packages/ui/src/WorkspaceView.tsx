import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { isBusy, PERMISSION_PRESETS, RUN_AGENT_ID, type AgentRecord, type ImageAttachment, type ImageAttachmentInput, type PermissionPreset, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import {
  clampComposerHeight, composerChipReason, composerPlaceholderFor, COMPOSER_DEFAULT_HEIGHT, COMPOSER_MIN_HEIGHT, DEFAULT_REASONING,
  DRAFT_PUBLISH_MS, DRAFT_WRITE_MS, formatDuration, historyDown, historyUp, modelCallStartedAt, modelChipLabel, reasoningChipLabel,
  REASONING_LEVELS, runHeaderControlReason, RUN_STATE_TAGS, runStateLabel, runStateOf, runTimingLabel, runTimingSeconds, sendRefusal,
  type HistoryWalk, type RunState,
} from './composer.js';
import { markMotionStart } from './motion.js';
import { AgentTree } from './AgentTree.js';
import { liveDescendants, runLevelAgent } from './agents.js';
import { Inspector, type PersonaEntry } from './Inspector.js';
import { useShellState } from './shell-state.js';
import { DelegationHeader, ScopeToggle, scopedRows, type Acknowledger } from './TranscriptSurface.js';
import { TranscriptPane } from './transcript/TranscriptPane.js';
import type { DisplayCaps } from './transcript/project.js';
import type { TrailerRow } from './transcript/types.js';
import { TodoPane, type TodoEdit } from './TodoPane.js';
import { addImageBytes, composerTokenEstimate } from './attachments.js';
import './attachments.css';

// Part AA: the row helpers moved to `transcript/Row.tsx`, the ONE row renderer, and are exported from the package
// root through that module alone (`TranscriptRows.tsx` is deleted). Re-exporting them here as well would make the
// name ambiguous across two `export *` sources and silently drop it — the merge defect Parts X and Y met.

/**
 * The Workspace view's conversation surface, at the point the mechanism has
 * reached: the transcript rows the replica holds and the composer
 * (REQ-CHAT-001, -003, -004, -005, -011, -012); `user`, `agent`, `system`,
 * `tool` (REQ-CHAT-060/061) and `diff` (REQ-CHAT-050) rows, an unsettled row
 * shown as still growing; the trailer rows for pending approvals
 * (REQ-CHAT-051); the stop control of REQ-SESSION-186 while a run is busy;
 * the permission-mode selector of REQ-TOOLS-077, strictest-first, with a
 * confirmation before `autonomous`. Structure from docs/spec; language from
 * docs/design/system. Not here yet: thinking rows, folding, the display caps,
 * search, paging on scroll, the draggable divider (REQ-CHAT-010).
 */
export interface WorkspaceViewProps {
  readonly session: SessionRecord | null;
  readonly rows: readonly TranscriptRow[];
  readonly onSubmit: (text: string, attachments: readonly ImageAttachmentInput[]) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-SESSION-186: first activation graceful, the second forces. */
  readonly onStop: (force: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-TOOLS-077 / REQ-MONITOR-150: forwarded to the running session; applies from the next tool call. */
  readonly onSetMode?: ((mode: PermissionPreset) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-009 / REQ-ORCH-133: cancel one child from the tree's run header. */
  readonly onCancelAgent?: ((id: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** For the tree's elapsed labels; the surface's own clock, never a run's. */
  readonly nowIso?: string | null | undefined;
  /** REQ-CHAT-035/037: the queue during a run — create, edit, remove; the panel shows the session's QUEUED prompts. */
  readonly onQueue?: ((text: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onEditQueued?: ((id: string, text: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onRemoveQueued?: ((id: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-CHAT-090: the optimistic pane writes through to the source named by the published plan. */
  readonly onEditTodo?: ((edit: TodoEdit) => Promise<{ ok: true; value?: string } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-123/125: pause the whole run; continue a paused session from the composer. */
  readonly onPause?: (() => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onContinue?: (() => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-133/137: steer one live agent (`run` for the entry role). */
  readonly onSteer?: ((agentId: string, text: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-142/144: the run header's model and reasoning switch, next-iteration changes. */
  readonly onSetModel?: ((model: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetReasoning?: ((level: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly models?: readonly string[] | undefined;
  /** REQ-CHAT-171/172: explicit capability declarations for the model selection surface. */
  readonly imageInputModels?: readonly string[] | undefined;
  /** Part R — the inspector (REQ-MONITOR-050..067): the configured personas, the entry role's facts for the run-level agent, the compression threshold. */
  readonly personas?: readonly PersonaEntry[] | undefined;
  readonly entry?: { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] } | undefined;
  readonly compressionThresholdPercent?: number | undefined;
  /** REQ-SHELL-073 / REQ-MONITOR-072: a tree click selects (the shared selection) and, with the preference on, the caller opens the window; `key` moves select only. */
  readonly onSelectAgent?: ((id: string | null, source?: 'click' | 'key') => void) | undefined;
  /** REQ-SHELL-072/073, REQ-MONITOR-137: open or raise the persona window; `focusSteer` when the inspector's Steer asked for it. */
  readonly onOpenPersona?: ((agent: AgentRecord, focusSteer: boolean) => void) | undefined;
  /** REQ-LIBRARY-140 / REQ-CHAT-042 (Part X): the composer's Stash control — pushes the TRIMMED composer text and clears the composer. */
  readonly onStash?: ((text: string) => void) | undefined;
  /** REQ-LIBRARY-140: the transcript toolbar's "Apply stash (n)"; the count is live, and the control is drawn only where an opener exists. */
  readonly stashCount?: number | undefined;
  readonly onOpenStash?: (() => void) | undefined;
  /** REQ-LIBRARY-137: a prompt that was sent or queued is front-inserted into the history; nothing else is. */
  readonly onRecordPrompt?: ((text: string) => void) | undefined;
  /** REQ-CHAT-165 (Part Z): the next older span, fetched off the interface thread; false when the load failed. */
  readonly onPageOlder?: ((beforeIndex: number) => Promise<boolean>) | undefined;
  /** REQ-CHAT-165: the first recorded row is among those held, which is distinguishable from a failed load. */
  readonly reachedOldest?: boolean | undefined;
  /** REQ-CHAT-067: the tool-grouping display preference, default ON, from the desktop preference store. */
  readonly groupTools?: boolean | undefined;
  /** REQ-CHAT-166: the four display caps, from the workspace `agents.yaml` `display` section. */
  readonly displayCaps?: DisplayCaps | undefined;
  /** Part AA — REQ-CHAT-076: `http(s)` links open in the system browser through `shell.openExternal`; without an opener a link is inert (ADR-0051). */
  readonly onOpenLink?: ((href: string) => void) | undefined;
  readonly onReadAttachment?: ((attachment: ImageAttachment) => Promise<string | null>) | undefined;
  /** Part AA — REQ-CHAT-075/076: a copy or an open is acknowledged when it works and reported when it does not; this window's own stack (ADR-0049). */
  readonly onAcknowledge?: Acknowledger | undefined;
  /** Part AA — REQ-CHAT-167 (`display/showReasoning`) and REQ-CHAT-067 (`display/autoCollapseTools`), both default OFF. */
  readonly showReasoning?: boolean | undefined;
  readonly autoCollapseTools?: boolean | undefined;
  /**
   * Part AB — REQ-CHAT-008: the persisted session claims busy but no local run exists. Decided upstream by the ONE
   * liveness predicate (REQ-SESSION-171, `Sessions.list`'s `stale`), never by this view guessing from silence.
   */
  readonly needsRecovery?: boolean | undefined;
  /**
   * Part AB — REQ-CHAT-007's second limb: an unanswered project-setup prompt gates execution. **Nothing in this
   * build can set it**: the only project setup that exists is Part T's code-intelligence setup (REQ-MCP-099/112),
   * a settings-category action that gates nothing. The refusal is implemented and unreachable, and that is recorded.
   */
  readonly projectSetupPending?: boolean | undefined;
  /** Part AB — REQ-CHAT-009: whether the model options have arrived, which is not the same as there being any. */
  readonly modelsLoaded?: boolean | undefined;
  /**
   * Part AB — REQ-CHAT-009: the chip is labelled `mode: <name>`, and with no session loaded the name is the
   * CONFIGURED mode (REQ-CONFIG-288's "the next run starts from it"), not a placeholder — the chip chooses what
   * the next run starts with, so it must name what that would be.
   */
  readonly configuredMode?: string | undefined;
  /** Part AB — REQ-CHAT-006/009: the three chips that choose what the NEXT run starts with (Tier A, REQ-CONFIG-441). */
  readonly onSetNextPersona?: ((persona: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetNextModel?: ((model: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetNextReasoning?: ((level: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** Part AB — REQ-CHAT-016: the workspace's prompt history, newest first (REQ-LIBRARY-137's list). */
  readonly history?: readonly string[] | undefined;
  /** Part AB — REQ-CHAT-014 (200 ms) and REQ-SHELL-159 (400 ms): two debounces over one keystroke stream, never chained. */
  readonly draft?: string | undefined;
  readonly onPublishDraft?: ((text: string) => void) | undefined;
  readonly onWriteDraft?: ((text: string) => void) | undefined;
  /** Part AB — REQ-CHAT-010 / REQ-SHELL-069: the transcript/composer divider, persisted per user under `panels/workspace`. */
  readonly composerHeight?: number | undefined;
  readonly onComposerHeight?: ((sizes: readonly [number, number]) => void) | undefined;
  /** Part AC — REQ-CHAT-098/103: clicking a trailer row opens the question stepper or raises the approval dialog. */
  readonly onOpenTrailer?: ((trailer: TrailerRow) => void) | undefined;
}

/** REQ-LIBRARY-140: the toolbar control's exact label, with its live count. */
export function applyStashLabel(count: number): string {
  return `Apply stash (${count})`;
}
/**
 * REQ-CHAT-044: an entry going into a non-empty composer is appended after one blank line; into an empty one it
 * replaces the text. Pure, so the rule is checkable without a DOM.
 */
export function composeWithStashed(current: string, incoming: string): string {
  return current === '' ? incoming : `${current}\n\n${incoming}`;
}

/** REQ-MONITOR-051: below 1180 px the inspector and the agents panel are overlay drawers, one open at a time. */
function useNarrow(): boolean {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 1179px)') : null;
  const [narrow, setNarrow] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = () => setNarrow(query.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

/** REQ-CHAT-036/037: the queued messages panel, above the composer, hidden while the queue is empty. */
function QueuePanel({ prompts, onEdit, onRemove, onError }: { prompts: SessionRecord['queuedPrompts']; onEdit?: WorkspaceViewProps['onEditQueued']; onRemove?: WorkspaceViewProps['onRemoveQueued']; onError: (m: string | null) => void }) {
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  if (prompts.length === 0) return null;
  const save = async () => {
    if (!editing || !onEdit) return;
    const original = prompts.find((p) => p.id === editing.id)?.content ?? '';
    // REQ-CHAT-037: emptied text reverts; unchanged text is a no-op.
    if (editing.text.trim() === '' || editing.text === original) { setEditing(null); return; }
    const r = await onEdit(editing.id, editing.text);
    setEditing(null);
    onError(r.ok ? null : r.reason);
  };
  return (
    <section className="queue" aria-label="Queued messages">
      <div className="queue__head"><span>Queued messages ({prompts.length})</span><span className="queue__hint">Sent after current iteration</span></div>
      <ul className="queue__list">
        {prompts.map((p) => (
          <li key={p.id} className="queue__row" data-prompt-id={p.id}>
            {editing?.id === p.id ? (
              <>
                <input className="input queue__editor" aria-label="Edit queued message" value={editing.text} onChange={(e) => setEditing({ id: p.id, text: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } if (e.key === 'Escape') setEditing(null); }} />
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => { void save(); }}>Save</button>
              </>
            ) : (
              <>
                <span className="queue__text" title={p.content}>{p.content}</span>
                {onEdit && <button type="button" className="btn btn-ghost btn-compact" onClick={() => setEditing({ id: p.id, text: p.content })}>Edit</button>}
                {onRemove && <button type="button" className="btn btn-ghost btn-compact" onClick={() => { void onRemove(p.id).then((r) => onError(r.ok ? null : r.reason)); }}>Delete</button>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A warning prompt in the design's dialog language; the confirm label is explicit (REQ-MONITOR-126/128). */
function ConfirmDialog({ title, body, confirmLabel, lines = [], onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; lines?: readonly string[]; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="ws-confirm-title">
        <h2 id="ws-confirm-title" className="dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        {lines.length > 0 && <ul className="dialog-body">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>Keep running</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** REQ-MONITOR-137: the steer card — a text for one live agent. */
function SteerDialog({ target, onSteer, onClose }: { target: { id: string; name: string }; onSteer: NonNullable<WorkspaceViewProps['onSteer']>; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (text.trim() === '') { setError('Steering is unavailable for this run: the text is empty.'); return; }
    const r = await onSteer(target.id, text);
    if (r.ok) onClose(); else setError(r.reason);
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog steer" role="dialog" aria-modal="true" aria-labelledby="steer-title">
        <h2 id="steer-title" className="dialog-title">Steer {target.name}</h2>
        <p className="dialog-body">The text reaches the agent at its next step as an instruction from you.</p>
        <textarea className="input" aria-label="Steering text" rows={3} value={text} autoFocus onChange={(e) => setText(e.currentTarget.value)} />
        {error && <p className="composer__error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => { void send(); }}>Steer</button>
        </div>
      </div>
    </div>
  );
}

/**
 * REQ-CHAT-004: the four placeholders, first condition wins, each word for word.
 *
 * **Two defects of the built version are repaired here (Part AB) and the falsified readings kept beside them.**
 * (1) String (1) read "Run active — the composer unlocks when it ends…", which is not one of the four the
 * requirement lists AND says the opposite of REQ-CHAT-006 and REQ-CHAT-156 — the composer does not lock while a
 * run is active; it queues. (2) The second condition was unreachable: both it and the first were computed from
 * `session !== null && isBusy(status)`, so a session busy with no local run took branch (1). The distinction is
 * REQ-CHAT-008's recovery condition, and it now comes in as `localRunActive` rather than being derived twice.
 */
export function composerPlaceholder(session: SessionRecord | null, localRunActive: boolean, busy = localRunActive): string {
  return composerPlaceholderFor(session !== null, localRunActive, busy);
}
/** REQ-CHAT-005: the primary action states the mode; `Queue` needs a LOCAL run, not merely a busy session. */
export function composerAction(session: SessionRecord | null, localRunActive: boolean): 'Queue' | 'Continue run' | 'Start run' {
  if (localRunActive) return 'Queue';
  return session ? 'Continue run' : 'Start run';
}
/** REQ-SESSION-186: the control says which of the two the next activation will do. */
export function stopLabel(stopPending: boolean): 'Stop run' | 'Force stop' {
  return stopPending ? 'Force stop' : 'Stop run';
}
/** REQ-ORCH-014: the transient status, then the classified one in its place — the category identifier exact, never colour alone. */
export function intentStatusText(intent: SessionRecord['intent']): string | null {
  if (!intent) return null;
  if (intent.phase === 'classifying') return 'Classifying intent…';
  const extras = [
    ...(intent.carried_over ? ['continued from the previous run'] : []),
    ...(intent.fallback ? [`fallback${intent.reason ? `: ${intent.reason}` : ''}`] : []),
  ];
  return `Intent: ${intent.category}${extras.length > 0 ? ` (${extras.join('; ')})` : ''}`;
}
/**
 * `m:ss` / `h:mm:ss` of a remaining span, never negative. Part AB moved the arithmetic to `composer.ts`, where
 * REQ-CHAT-158's run-timing indicator also reads it: the two render the same shape and one implementation is
 * what stops them drifting apart.
 */
export function formatRemaining(seconds: number): string {
  return formatDuration(seconds);
}
/**
 * REQ-NOTIFY-263: the run header's wait text — the run is waiting on a provider limit; the provider and the model;
 * whether the provider is marked exhausted (REQ-NOTIFY-088); the remaining time counted down against the surface's
 * own clock, or that the run resumes only when the user decides. Every state is text as well as colour.
 */
export function waitHeaderText(wait: NonNullable<SessionRecord['wait']>, nowMs: number): { headline: string; timing: string; remainingS: number | null } {
  const headline = `Waiting on a provider limit: ${wait.provider} / ${wait.model} (${wait.agent}) — ${wait.exhausted ? 'provider marked exhausted' : 'provider not marked exhausted'}, attempt ${wait.attempt}.`;
  if (wait.resumeAt === null) return { headline, timing: 'Resumes only when you decide.', remainingS: null };
  const remainingS = Math.max(0, Math.ceil((Date.parse(wait.resumeAt) - nowMs) / 1000));
  return { headline, timing: `Resumes automatically in ${formatRemaining(remainingS)}.`, remainingS };
}

/**
 * The wait as the user sees it (REQ-NOTIFY-263, REQ-ORCH-091 d): the header and its exactly three choices, here and on no
 * other surface — keep waiting (the absence of a decision: the control acknowledges and changes nothing), change model
 * (the existing model list of REQ-NOTIFY-074, pinned through `setModel`, REQ-NOTIFY-089), cancel the run (`cancel`).
 * The countdown ticks once a second on the surface's own clock, as the Overview's runtime label does.
 */
function WaitHeader({ wait, models, onSetModel, onCancel }: { wait: NonNullable<SessionRecord['wait']>; models: readonly string[]; onSetModel?: WorkspaceViewProps['onSetModel']; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [choosing, setChoosing] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // A new wait (or a refusal) remounts the header through its key at the render site, so the local choices start clean.
  const text = waitHeaderText(wait, now);
  return (
    <div className="wait-header" role="status" aria-live="polite" data-exhausted={wait.exhausted ? '1' : '0'} data-remaining={text.remainingS === null ? '' : String(text.remainingS)} data-agent={wait.agent}>
      <div className="wait-header__text">
        <span className="wait-header__headline">{text.headline}</span>
        <span className="wait-header__timing mono">{text.timing}</span>
        {wait.reason && <span className="wait-header__reason text-secondary">{wait.reason}</span>}
        {wait.rejection && <span className="wait-header__rejection" role="alert">{wait.rejection}</span>}
        {acknowledged && !wait.rejection && <span className="wait-header__ack text-secondary">Still waiting.</span>}
        {error && <span className="composer__error" role="alert">{error}</span>}
      </div>
      <div className="wait-header__actions" aria-label="Wait choices">
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => { setAcknowledged(true); setChoosing(false); }}>Keep waiting</button>
        {onSetModel && models.length > 0 && (choosing ? (
          <select className="input select" aria-label="Change model" defaultValue="" autoFocus onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetModel(v).then((r) => { setError(r.ok ? null : r.reason); setChoosing(false); }); }}>
            <option value="">Choose a model…</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => { setAcknowledged(false); setChoosing(true); }}>Change model</button>
        ))}
        <button type="button" className="btn btn-danger btn-compact" onClick={onCancel}>Cancel the run</button>
      </div>
    </div>
  );
}
/*
 * REQ-CHAT-051's trailer rows were drawn here as `ApprovalTrailerRow`, appended by the view after the recorded
 * rows. They are now computed by ADR-0046 step 4 (`transcript/project.ts`, `trailerRows`) and are DisplayRows like
 * any other, which is what makes them appear identically on the whole-state and the incremental paths
 * (REQ-MONITOR-230) and searchable by REQ-CHAT-074 rather than invisible to it.
 */

/**
 * Part AB — REQ-CHAT-006/007: a control that is disabled MUST publish its reason through **both** its tooltip
 * and its accessible description; "greying the control alone does not satisfy this". One component owns both,
 * so a control cannot acquire one and not the other. The description is a `visually-hidden` element referenced
 * by `aria-describedby`, which is the form every assistive technology in use reads; `title` is the tooltip.
 */
function ChipShell({ id, label, reason, testId, children }: { id: string; label: string; reason: string | null; testId: string; children?: ReactNode }) {
  return (
    <div className="chip-control" data-testid={testId} data-disabled={reason === null ? '0' : '1'}>
      <span className="visually-hidden" id={`${id}-reason`}>{reason ?? ''}</span>
      {children ?? <span className="chip-control__label">{label}</span>}
    </div>
  );
}

/**
 * REQ-CHAT-009's selector chips. Each is a `select` so the chip both states the current choice in its label and
 * offers the alternatives without a second surface; the label is the requirement's own (`mode: <name>`,
 * `reasoning: <level>`). A disabled chip carries the reason twice (REQ-CHAT-006/007) through `ChipShell`.
 */
function SelectorChip({ id, testId, label, ariaLabel, value, options, reason, onChoose }: {
  id: string; testId: string; label: string; ariaLabel: string; value: string; options: readonly string[]; reason: string | null;
  onChoose: (value: string) => void;
}) {
  return (
    <ChipShell id={id} label={label} reason={reason} testId={testId}>
      <label className="chip-control__label" htmlFor={id}>{label}</label>
      <select
        id={id} className="input select chip-control__select" aria-label={ariaLabel} value={value} disabled={reason !== null}
        aria-disabled={reason !== null} title={reason ?? `Chosen for the next run.`} aria-describedby={`${id}-reason`}
        onChange={(e) => { const v = e.currentTarget.value; if (v !== '') onChoose(v); }}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </ChipShell>
  );
}

/**
 * REQ-CHAT-158's run-timing indicator, and REQ-CHAT-008's run-state label, in the run header.
 *
 * The tick is the surface's own once-a-second interval and **writes nothing**: it sets no session state, sends
 * no command and causes no transcript publication (REQ-MONITOR-108). The value it renders is a pure function of
 * the record the surface already holds, so a tick that renders the same string changes nothing at all.
 */
function RunTiming({ session, busy, stepStartedAt }: { session: SessionRecord | null; busy: boolean; stepStartedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const seconds = session === null ? null : runTimingSeconds({ runStartedAt: session.runStartedAt, updatedAt: session.updatedAt, busy, stepStartedAt }, now);
  const label = runTimingLabel(seconds);
  return (
    <span className="run-header__timing mono" data-testid="run-timing" data-seconds={seconds === null ? '' : String(Math.floor(seconds))} data-frozen={busy ? '0' : '1'}>
      {label ?? ''}
    </span>
  );
}

/** REQ-TOOLS-077: strictest-first; `autonomous` needs an explicit confirmation; declining restores the previous selection. */
function ModeSelector({ current, enabled, onSetMode }: { current: PermissionPreset | null; enabled: boolean; onSetMode: (m: PermissionPreset) => Promise<{ ok: true } | { ok: false; reason: string }> }) {
  const [confirming, setConfirming] = useState<PermissionPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = async (m: PermissionPreset) => {
    setConfirming(null);
    const r = await onSetMode(m);
    setError(r.ok ? null : r.reason);
  };
  return (
    <div className="mode chip-control" data-testid="chip-mode" aria-label="Permission mode">
      {/* REQ-CHAT-009: the chip is labelled `mode: <name>`. REQ-CHAT-006: it stays enabled in EVERY run state. */}
      <span className="mode__label text-secondary" data-testid="chip-mode-label">mode: {current ?? 'default'}</span>
      <div className="seg" role="radiogroup" aria-label="Permission mode, strictest first">
        {PERMISSION_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={current === m}
            className={`seg-opt${current === m ? ' is-active' : ''}`}
            title={enabled ? `Switch the active run to '${m}' from the next tool call, and write it as the configured mode.` : `Write '${m}' as the configured permission mode; the next run starts from it (REQ-CONFIG-288).`}
            onClick={() => { if (m === 'autonomous') setConfirming(m); else void apply(m); }}
          >{m}</button>
        ))}
      </div>
      {error && <span className="composer__error" role="alert">{error}</span>}
      {confirming && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="mode-confirm-title">
            <h2 id="mode-confirm-title" className="dialog-title">Run without asking?</h2>
            <p className="dialog-body">In 'autonomous' mode the agent runs commands and edits files without asking, except for the destructive commands the starter rules always deny.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" autoFocus onClick={() => setConfirming(null)}>Keep current mode</button>
              <button type="button" className="btn btn-danger" onClick={() => { void apply(confirming); }}>Switch to autonomous</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkspaceView({ session, rows, onSubmit, onStop, onSetMode, onCancelAgent, nowIso = null, onQueue, onEditQueued, onRemoveQueued, onEditTodo, onPause, onContinue, onSteer, onSetModel, onSetReasoning, models = [], imageInputModels = [], personas = [], entry, compressionThresholdPercent = 60, onSelectAgent, onOpenPersona, onStash, stashCount = 0, onOpenStash, onRecordPrompt, onPageOlder, reachedOldest = false, groupTools = true, displayCaps, onOpenLink, onReadAttachment, onAcknowledge, showReasoning = false, autoCollapseTools = false, needsRecovery = false, projectSetupPending = false, modelsLoaded = false, configuredMode, onSetNextPersona, onSetNextModel, onSetNextReasoning, history = [], draft, onPublishDraft, onWriteDraft, composerHeight, onComposerHeight , onOpenTrailer}: WorkspaceViewProps) {
  const [text, setText] = useState(draft ?? '');
  // REQ-CHAT-069: the transcript's scope. "This task" needs a selected agent, so it falls back to "All activity".
  const [scope, setScope] = useState<'all' | 'task'>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachmentInput[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [confirming, setConfirming] = useState<'stop' | { agent: { id: string; name: string }; descendants: string[] } | null>(null);
  const [steering, setSteering] = useState<{ id: string; name: string } | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  /**
   * REQ-CHAT-004/005/006/008 (Part AB): `busy` is what the persisted session claims; `runActive` is a run this
   * instance actually owns. They differ in exactly one case — REQ-CHAT-008's synthetic recovery state — and the
   * composer's mode, its placeholder, its primary action and its chips all read the one they mean rather than
   * both reading the same predicate, which is how the second placeholder became unreachable.
   */
  const sessionBusy = session !== null && isBusy(session.executionStatus);
  const runActive = sessionBusy && !needsRecovery;
  const runState: RunState = runStateOf(session?.executionStatus ?? null, needsRecovery);
  // A pending stop is one requested against the run that is still active; a new run begins from a submit, which resets it.
  const stopPending = runActive && stopRequested;
  const pending = session?.pendingApprovals ?? [];
  /** REQ-CHAT-006: one reason, shown by all three chips, published through tooltip AND accessible description. */
  const chipReason = composerChipReason(runState);
  /** REQ-CHAT-007: the two refusals, decided before anything is sent. */
  const refusal = sendRefusal(runState, projectSetupPending);
  const acceptsImages = entry !== undefined && imageInputModels.includes(entry.model);
  const attachmentReason = acceptsImages ? null : 'The selected model does not declare image input support.';
  const estimate = composerTokenEstimate(text, attachments);

  const addFiles = async (files: readonly File[]) => {
    if (!acceptsImages) { setError(attachmentReason); return; }
    const next = [...attachments];
    for (const file of files) {
      const added = addImageBytes(next, file.name, new Uint8Array(await file.arrayBuffer()));
      if (!added.ok) { setError(added.reason); return; }
      next.push(added.value);
    }
    setAttachments(next);
    setError(null);
  };

  /**
   * REQ-CHAT-016's shell recall. `null` is "not walking"; any keypress that is not Up or Down resets it, which is
   * why nothing here persists it beyond the walk. The saved draft is the text the composer held at the first Up.
   */
  const [walk, setWalk] = useState<HistoryWalk | null>(null);
  const caretToEnd = useCallback(() => {
    const el = area.current;
    if (!el) return;
    requestAnimationFrame(() => { const end = el.value.length; el.focus(); el.setSelectionRange(end, end); });
  }, []);

  /**
   * REQ-CHAT-014 and REQ-SHELL-159: 200 ms to application state, 400 ms to the preference store, both measured
   * from the last keystroke and neither chained to the other (ADR-0042 consequence 5). REQ-SHELL-159's four flush
   * points — focus loss, view change, workspace replacement, window close — are flushed without waiting the
   * interval out; the last two reach here as the component unmounting, which is what a view change also does.
   */
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The text as the timers will find it when they fire, maintained in an effect (a ref is not written during render).
  const latest = useRef(draft ?? '');
  useEffect(() => { latest.current = text; }, [text]);
  const flushDraft = useCallback((value?: string) => {
    if (publishTimer.current !== null) { clearTimeout(publishTimer.current); publishTimer.current = null; }
    if (writeTimer.current !== null) { clearTimeout(writeTimer.current); writeTimer.current = null; }
    // A flush caused BY a change carries the new text with it: the effect that mirrors it has not run yet.
    const now = value ?? latest.current;
    onPublishDraft?.(now);
    onWriteDraft?.(now);
  }, [onPublishDraft, onWriteDraft]);
  const noteKeystroke = useCallback(() => {
    if (publishTimer.current !== null) clearTimeout(publishTimer.current);
    if (writeTimer.current !== null) clearTimeout(writeTimer.current);
    publishTimer.current = setTimeout(() => { publishTimer.current = null; onPublishDraft?.(latest.current); }, DRAFT_PUBLISH_MS);
    writeTimer.current = setTimeout(() => { writeTimer.current = null; onWriteDraft?.(latest.current); }, DRAFT_WRITE_MS);
  }, [onPublishDraft, onWriteDraft]);
  // REQ-SHELL-159: the window closing and the workspace being replaced both end this component; the draft is flushed then.
  useEffect(() => () => { flushDraft(); }, [flushDraft]);
  /**
   * REQ-CHAT-015: the stored draft reappears character for character. It arrives after the first paint (a command
   * round trip), so it is adopted when it lands — derived during render rather than in an effect — and only into
   * a composer the user has not already typed into, because a draft that overwrote live typing would lose text.
   */
  const [seenDraft, setSeenDraft] = useState(draft);
  if (seenDraft !== draft) {
    setSeenDraft(draft);
    if (draft !== undefined && draft !== '' && text === '') setText(draft);
  }

  const submit = async () => {
    // REQ-CHAT-006: the text area stays editable while a submission is in flight, so a second Enter can arrive
    // before the first is answered; one submission at a time, and the text is not sent twice.
    if (busy) return;
    const value = text;
    // REQ-CHAT-003: empty or whitespace-only does nothing but return focus.
    if (value.trim().length === 0 && attachments.length === 0) { area.current?.focus(); return; }
    // REQ-CHAT-007: refused with its reason readable, and nothing sent; the typed text is untouched.
    if (refusal !== null) { setError(refusal); area.current?.focus(); return; }
    setWalk(null);
    setBusy(true);
    setText('');
    setStatus(null);
    if (runActive && onQueue) {
      if (attachments.length > 0) { setBusy(false); setText(value); setError('Images can be sent when starting or continuing a session.'); area.current?.focus(); return; }
      // REQ-CHAT-035: during a run an ordinary submission is queued for the running session.
      const q = await onQueue(value);
      setBusy(false);
      // REQ-CHAT-017 / REQ-LIBRARY-137: recorded on a SUCCESSFUL queue and on nothing else; the head dedupe is the list's.
      if (q.ok) { setError(null); setStatus('Message queued for the next iteration.'); onRecordPrompt?.(value); }
      else { setText(value); setError('Message could not be queued because the run is no longer active.'); }
      flushDraft(q.ok ? '' : value);
      area.current?.focus();
      return;
    }
    setStopRequested(false);
    const r = await onSubmit(value, attachments);
    setBusy(false);
    if (!r.ok) {
      // REQ-CHAT-012: the typed text is restored unchanged and the reason is raised.
      setText(value);
      setError(r.reason);
    } else {
      setError(null);
      setAttachments([]);
      // REQ-CHAT-017 / REQ-LIBRARY-137: recorded on run start and on continue, once the prompt was actually sent.
      onRecordPrompt?.(value);
    }
    // REQ-CHAT-014 / REQ-SHELL-159: submit is a flush point — an emptied composer empties the stored draft at once,
    // and a restored one stores exactly what was restored rather than what was typed before it.
    flushDraft(r.ok ? '' : value);
    area.current?.focus();
  };

  /** REQ-CHAT-042 / REQ-LIBRARY-140: the trimmed text onto the top of the stash, and the composer cleared. */
  const stash = () => {
    if (!onStash) return;
    const trimmed = text.trim();
    if (trimmed === '') { area.current?.focus(); return; }
    onStash(trimmed);
    setText('');
    setWalk(null);
    flushDraft('');
    area.current?.focus();
  };

  const stop = async () => {
    const force = stopPending;
    setStopRequested(true);
    const r = await onStop(force);
    // REQ-MONITOR-006: on a refusal the state is rolled back and the refusal named.
    if (!r.ok) { setStopRequested(false); setError(r.reason); }
  };
  // REQ-MONITOR-296: `pausing` is shown only after the run accepted the pause.
  const pause = async () => {
    if (!onPause) return;
    const r = await onPause();
    if (r.ok) setPausePending(true); else setError(r.reason);
  };
  const continueRun = async () => {
    if (!onContinue) return;
    const r = await onContinue();
    if (!r.ok) setError(r.reason); else setError(null);
  };
  // REQ-MONITOR-064: the live descendants, by the one rule every agent surface applies.
  const descendantsOf = (id: string): string[] => liveDescendants(session?.agents ?? [], id).map((a) => a.name);

  /**
   * REQ-CHAT-001: Enter submits, Shift+Enter inserts a newline.
   * REQ-CHAT-016: Up and Down walk the history; **every other keypress resets the walk**, which is why the reset
   * is the last statement here rather than an arm of its own — a key that is not Up or Down has already ended it,
   * whatever else it does. Every recall places the caret at the end of the text.
   */
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const step = e.key === 'ArrowUp' ? historyUp(walk, history, text) : historyDown(walk, history, text);
      if (step.moved) {
        e.preventDefault();
        setWalk(step.walk);
        setText(step.text);
        noteKeystroke();
        caretToEnd();
      }
      return;
    }
    if (walk !== null) setWalk(null);
  };

  // REQ-CHAT-009: the effective mode of the loaded session, else the configured one the next run would start from.
  const mode = ((session?.permissionMode ?? configuredMode) ?? null) as PermissionPreset | null;
  // REQ-MONITOR-042 (Part R): the selection is the shell's, shared by every surface; `run` is the run-level selection.
  const selectedAgent = useShellState((st) => st.selectedAgentId);
  const selectAgentShared = useShellState((st) => st.selectAgent);
  const select = (id: string | null, source?: 'click' | 'key') => { selectAgentShared(id); onSelectAgent?.(id, source); };
  const agents = session?.agents ?? [];
  const runLevel = useMemo(() => (entry ? runLevelAgent(session, entry) : null), [session, entry]);
  const selected = selectedAgent === RUN_AGENT_ID ? runLevel : agents.find((a) => a.id === selectedAgent) ?? null;
  /** REQ-CHAT-088: the engine has already resolved each source; scope chooses the matching published plan. */
  const todoPlan = selected !== null && selected.id !== RUN_AGENT_ID ? session?.childTodos[selected.id] ?? session?.todo ?? null : session?.todo ?? null;
  // REQ-CHAT-069: "This task" keeps the run-owned kinds plus the selected agent's rows; with no agent selected it is
  // unavailable with that as its stated reason, so the transcript is never filtered to nothing.
  const shownRows = useMemo(() => (scope === 'task' && selected !== null ? scopedRows(rows, selected) : rows), [scope, selected, rows]);
  // REQ-MONITOR-051: below 1180 px the agents panel and the inspector are overlay drawers, mutually exclusive; choosing an agent opens the inspector's.
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState<'agents' | 'plan' | 'inspector' | null>(null);
  // REQ-SHELL-049/050 (Part W): Ctrl+Return is the window-wide fallback submit — the registration says whether the send control is enabled.
  const registerComposer = useShellState((st) => st.registerComposer);
  const registerOverlay = useShellState((st) => st.registerOverlay);
  useEffect(() => {
    registerComposer({
      submit: () => { void submit(); },
      enabled: !busy,
      // REQ-LIBRARY-107 through REQ-CHAT-044: append after one blank line into a non-empty composer, replace an
      // empty one, and take focus. The Library and the stash dialog reach the composer through this and nothing else.
      setText: (incoming: string) => { setText((current) => composeWithStashed(current, incoming)); requestAnimationFrame(() => area.current?.focus()); },
    });
  });
  useEffect(() => () => registerComposer(null), [registerComposer]);
  // REQ-SHELL-055 (2): window-level Escape on this view closes both compact overlay drawers; nothing to close is nothing done.
  const drawerOpen = drawer !== null;
  useEffect(() => {
    registerOverlay('drawers', narrow ? () => { if (!drawerOpen) return false; setDrawer(null); return true; } : null);
    return () => registerOverlay('drawers', null);
  }, [registerOverlay, narrow, drawerOpen]);
  const [seenSelection, setSeenSelection] = useState(selectedAgent);
  if (seenSelection !== selectedAgent) { setSeenSelection(selectedAgent); if (narrow && selectedAgent !== null) setDrawer('inspector'); }
  const inspectorCancel = (agent: AgentRecord) => {
    if (agent.id === RUN_AGENT_ID) { setConfirming('stop'); return; }
    setConfirming({ agent: { id: agent.id, name: agent.name }, descendants: descendantsOf(agent.id) });
  };
  const inspector = (
    <Inspector session={session} rows={rows} personas={personas} runLevel={runLevel} selectedAgentId={selectedAgent} onSelect={(id) => select(id, 'click')} models={models}
      compressionThresholdPercent={compressionThresholdPercent} runActive={runActive} nowIso={nowIso}
      onSteer={(agent) => { if (onOpenPersona) onOpenPersona(agent, true); else setSteering({ id: agent.id, name: agent.name }); }}
      onCancel={inspectorCancel} onPopOut={(agent) => onOpenPersona?.(agent, false)} onSetModel={onSetModel} onSetReasoning={onSetReasoning}
      drawer={narrow} onCloseDrawer={narrow ? () => setDrawer(null) : undefined} />
  );
  const paused = session !== null && (session.executionStatus === 'paused' || session.executionStatus === 'paused_message_limit');
  /**
   * REQ-CHAT-078 / REQ-CHAT-006's closing sentence: the run header's own model and reasoning selectors change the
   * LIVE run, and follow the opposite rule to the composer's chips — enabled only while a run is running and
   * locally owned, and stating one of the four reason texts whenever they are not.
   */
  const headerReason = runHeaderControlReason(runState);
  const queued = session?.queuedPrompts ?? [];
  // REQ-CHAT-158: the step the run is inside now, from the newest row it produced (live one first). See `composer.ts`.
  const stepStartedAt = useMemo(() => modelCallStartedAt(rows), [rows]);

  /**
   * REQ-CHAT-010 / REQ-SHELL-069: the divider between transcript and composer. Its position is per USER, keyed
   * `panels/workspace`, and the declared defaults are the requirement's own figures — 150 px, never below 110 px,
   * and never so tall that the transcript falls below 180 px.
   */
  const shell = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState(720);
  const [height, setHeight] = useState(composerHeight ?? COMPOSER_DEFAULT_HEIGHT);
  const [seenHeight, setSeenHeight] = useState(composerHeight);
  if (seenHeight !== composerHeight) { setSeenHeight(composerHeight); if (composerHeight !== undefined) setHeight(composerHeight); }
  useEffect(() => {
    const measure = () => setBox(shell.current?.clientHeight ?? 720);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const commitHeight = useCallback((value: number) => {
    const container = shell.current?.clientHeight ?? 720;
    const next = clampComposerHeight(value, container);
    setHeight(next);
    onComposerHeight?.([Math.max(0, container - next - 8), next]);
  }, [onComposerHeight]);
  const dividerDrag = useRef<{ startY: number; startHeight: number } | null>(null);
  const onDividerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dividerDrag.current = { startY: e.clientY, startHeight: height };
    // A synthetic pointer id (a scripted click) has nothing to capture; the drag still works without the capture.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const onDividerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dividerDrag.current) return;
    setHeight(clampComposerHeight(dividerDrag.current.startHeight - (e.clientY - dividerDrag.current.startY), shell.current?.clientHeight ?? 720));
  };
  const onDividerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dividerDrag.current) return;
    const value = dividerDrag.current.startHeight - (e.clientY - dividerDrag.current.startY);
    dividerDrag.current = null;
    commitHeight(value);
  };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowUp') { e.preventDefault(); commitHeight(height + step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); commitHeight(height - step); }
    else if (e.key === 'Home') { e.preventDefault(); commitHeight(box); }
    else if (e.key === 'End') { e.preventDefault(); commitHeight(COMPOSER_MIN_HEIGHT); }
  };
  return (
    <div ref={shell} style={{ ['--rt-composer-height' as string]: `${height}px` }} className={`workspace workspace--with-sidebar${narrow ? ' workspace--narrow' : ''}`} data-drawer={drawer ?? ''}>
      {narrow && (
        <div className="workspace__drawer-bar" aria-label="Panels">
          {agents.length > 0 && <button type="button" className={`btn btn-ghost btn-compact${drawer === 'agents' ? ' is-active' : ''}`} aria-pressed={drawer === 'agents'} onClick={() => setDrawer(drawer === 'agents' ? null : 'agents')}>Agents</button>}
          <button type="button" className={`btn btn-ghost btn-compact${drawer === 'plan' ? ' is-active' : ''}`} aria-pressed={drawer === 'plan'} onClick={() => setDrawer(drawer === 'plan' ? null : 'plan')}>Task plan</button>
          <button type="button" className={`btn btn-ghost btn-compact${drawer === 'inspector' ? ' is-active' : ''}`} aria-pressed={drawer === 'inspector'} onClick={() => setDrawer(drawer === 'inspector' ? null : 'inspector')}>Inspector</button>
        </div>
      )}
      {(!narrow || drawer === 'agents' || drawer === 'plan') && (
        <aside className={`agents${narrow ? ' agents--drawer' : ''}`} aria-label="Delegation">
          {(!narrow || drawer === 'agents') && <><div className="agents__header">
            <span className="agents__title">Agents</span>
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onSteer && runActive && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setSteering({ id: selected.id, name: selected.name })}>Steer {selected.name}</button>
            )}
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onCancelAgent && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setConfirming({ agent: { id: selected.id, name: selected.name }, descendants: descendantsOf(selected.id) })}>Cancel {selected.name}</button>
            )}
          </div>
          <AgentTree agents={agents} selected={selectedAgent} onSelect={select} nowIso={nowIso} />
          </>}
          {(!narrow || drawer === 'plan') && <TodoPane plan={todoPlan} onEdit={onEditTodo} onError={setError} />}
        </aside>
      )}
      {/*
        * Part AB — the run header. REQ-CHAT-008's run-state label in its own fixed vocabulary, REQ-CHAT-158's
        * timing indicator, and REQ-CHAT-078's live-run selectors, which are the run header's own controls and
        * follow the OPPOSITE enablement rule to the composer's chips (REQ-CHAT-006's closing sentence).
        */}
      <div className="run-header" role="group" aria-label="Run" data-state={runState} data-testid="run-header">
        {/* The design's Tag with a status dot, which is how the material draws a run's state (README §7). */}
        <span className={`tag ${RUN_STATE_TAGS[runState].tone} run-header__state`} data-testid="run-state">
          <span ref={(element) => { if (element && RUN_STATE_TAGS[runState].live) markMotionStart(element); }}
            className={`status-dot${RUN_STATE_TAGS[runState].live ? ' is-pulsing' : ''}`} aria-hidden="true" />
          {runStateLabel(runState)}
        </span>
        <RunTiming session={session} busy={runActive} stepStartedAt={stepStartedAt} />
        {(onSetModel || onSetReasoning) && (
          <div className="run-controls" aria-label="Active run model and reasoning">
            <span className="visually-hidden" id="run-controls-reason">{headerReason ?? ''}</span>
            {onSetModel && models.length > 0 && (
              <select className="input select" aria-label="Active run model" data-testid="run-model" defaultValue="" disabled={headerReason !== null} aria-disabled={headerReason !== null}
                title={headerReason ?? 'Switch the live run to another model from its next iteration.'} aria-describedby="run-controls-reason"
                onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetModel(v).then((r) => { if (!r.ok) setError(r.reason); }); }}>
                <option value="">Switch model…</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {onSetReasoning && (
              <select className="input select" aria-label="Active run reasoning" data-testid="run-reasoning" defaultValue="" disabled={headerReason !== null} aria-disabled={headerReason !== null}
                title={headerReason ?? 'Switch the live run to another reasoning effort from its next iteration.'} aria-describedby="run-controls-reason"
                onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetReasoning(v).then((r) => { if (!r.ok) setError(r.reason); }); }}>
                <option value="">Switch reasoning…</option>
                {REASONING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
      <div className="transcript" role="log" aria-label="Transcript" aria-live="polite">
        {/* REQ-LIBRARY-140 (Part X): the transcript toolbar and, so far, its one control — the stash opener with its live count. */}
        {(onOpenStash || agents.length > 0) && (
          <div className="transcript__toolbar" role="toolbar" aria-label="Transcript actions">
            {onOpenStash && (
              <button type="button" className="btn btn-ghost btn-compact" aria-label="Manage prompt stash" title="Apply or pop a stashed prompt"
                data-testid="transcript-stash" data-count={stashCount} onClick={onOpenStash}>{applyStashLabel(stashCount)}</button>
            )}
            {/* Part AA — REQ-CHAT-069: the scope toggle, naming the agent "This task" refers to and showing its state and live elapsed time. */}
            {agents.length > 0 && <ScopeToggle scope={scope} agent={selected} nowIso={nowIso} onScope={setScope} />}
          </div>
        )}
        {intentStatusText(session?.intent ?? null) && (
          <div className="intent-status mono" role="status" aria-live="polite" data-phase={session?.intent?.phase}>{intentStatusText(session?.intent ?? null)}</div>
        )}
        {session?.wait && runActive && (
          <WaitHeader key={`${session.wait.agent}:${session.wait.attempt}:${session.wait.provider}:${session.wait.model}:${session.wait.rejection ?? ''}`} wait={session.wait} models={models} onSetModel={onSetModel} onCancel={() => setConfirming('stop')} />
        )}
        {/* Part AA — REQ-CHAT-068: above the shown transcript, and only for a CHILD agent; a root agent produces none. */}
        {scope === 'task' && selected !== null && selected.id !== RUN_AGENT_ID && <DelegationHeader agent={selected} />}
        {/*
          * ADR-0045's recycled pool and ADR-0046's steps 4 and 5. The empty state (REQ-CHAT-073), the projection,
          * the trailer rows (REQ-CHAT-051), tail-follow (REQ-CHAT-070), the anchor (REQ-CHAT-071), "N new updates"
          * (REQ-CHAT-072), search (REQ-CHAT-074) and paging (REQ-CHAT-165) are all the pane's. Part AA's `Row` is
          * what a bound slot draws, and the pane is the surface that supplies it its services.
          */}
        <TranscriptPane
          rows={shownRows}
          running={runActive}
          groupTools={groupTools}
          caps={displayCaps}
          pendingQuestions={session?.pendingQuestions ?? []}
          pendingApprovals={pending}
          questionAgent={session?.agents[0]?.name}
          onPageOlder={onPageOlder}
          reachedOldest={reachedOldest}
          onFocusComposer={() => area.current?.focus()}
          showReasoning={showReasoning}
          autoCollapseTools={autoCollapseTools}
          onOpenLink={onOpenLink}
          onReadAttachment={onReadAttachment}
          onAcknowledge={onAcknowledge}
          onOpenTrailer={onOpenTrailer}
          nowMs={nowIso === null ? 0 : Date.parse(nowIso)}
        />
      </div>
      {(!narrow || drawer === 'inspector') && inspector}
      <QueuePanel prompts={queued} onEdit={onEditQueued} onRemove={onRemoveQueued} onError={setError} />
      {/* REQ-CHAT-010: the divider between transcript and composer — draggable, keyboard-reachable, position persisted. */}
      <div className="composer__divider" role="separator" aria-orientation="horizontal" aria-label="Resize the composer" tabIndex={0}
        aria-valuemin={COMPOSER_MIN_HEIGHT} aria-valuemax={Math.max(COMPOSER_MIN_HEIGHT, box - 188)} aria-valuenow={height} data-testid="composer-divider"
        onPointerDown={onDividerDown} onPointerMove={onDividerMove} onPointerUp={onDividerUp} onKeyDown={onDividerKey} />
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {error && <div className="composer__error" role="alert">{error}</div>}
        {status && !error && <div className="composer__hint" role="status">{status}</div>}
        <textarea
          ref={area}
          className="input composer__input"
          aria-label="Composer"
          /* REQ-CHAT-004: one of exactly four strings, chosen by the first condition that holds. */
          placeholder={composerPlaceholder(session, runActive, sessionBusy)}
          value={text}
          /* REQ-CHAT-006 / REQ-CHAT-156: editable in EVERY run state — a running agent never locks the user out of typing. */
          onChange={(e) => { setText(e.target.value); setWalk(null); noteKeystroke(); }}
          onKeyDown={onKey}
          /* REQ-SHELL-159: focus loss is one of the four flush points — the write does not wait the interval out. */
          onBlur={() => flushDraft()}
          rows={3}
        />
        <div className="composer__attachments" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles([...e.dataTransfer.files]); }} data-testid="composer-attachments">
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void addFiles([...(e.currentTarget.files ?? [])]); e.currentTarget.value = ''; }} />
          <button type="button" className="btn btn-ghost" disabled={!acceptsImages} title={attachmentReason ?? 'Attach images'} aria-describedby="attachment-capability" onClick={() => fileInput.current?.click()}>Attach images</button>
          <span id="attachment-capability" className="composer__hint">{attachmentReason ?? 'Drop PNG, JPEG, WebP, or GIF images here.'}</span>
          {attachments.length > 0 && <ol className="composer__attachment-list">{attachments.map((a, i) => <li key={`${a.name}-${i}`}><span>{a.name}</span><span className="mono">{Math.ceil(a.size / 1024)} KiB</span><button type="button" className="btn btn-ghost" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((xs) => xs.filter((_, x) => x !== i))}>Remove</button></li>)}</ol>}
          <span className="composer__estimate mono" data-lower-bound={estimate.lowerBound ? '1' : '0'}>{estimate.label}</span>
        </div>
        <div className="composer__actions">
          {/*
            * REQ-CHAT-009's four selector chips. The three that choose what the NEXT run starts with are disabled in
            * exactly REQ-CHAT-006's six states and each publishes its reason through both its tooltip and its
            * accessible description; the permission-mode chip and Stash are enabled in every state.
            */}
          <div className="composer__chips" aria-label="Next run">
            {onSetNextPersona && (
              <SelectorChip id="chip-persona" testId="chip-persona" label="persona" ariaLabel="Persona for the next run" reason={chipReason}
                value={entry?.persona ?? ''} options={personas.length > 0 ? personas.map((p) => p.role) : entry ? [entry.persona] : []}
                onChoose={(v) => { void onSetNextPersona(v).then((r) => { if (!r.ok) setError(r.reason); }); }} />
            )}
            {onSetNextModel && (
              <ChipShell id="chip-model" testId="chip-model" label={modelChipLabel(modelsLoaded, models, entry?.model ?? null)} reason={modelsLoaded ? chipReason : 'Model options are still loading.'}>
                <label className="chip-control__label" htmlFor="chip-model">{modelChipLabel(modelsLoaded, models, entry?.model ?? null)}</label>
                <select id="chip-model" className="input select chip-control__select" aria-label="Model for the next run"
                  value={entry?.model && models.includes(entry.model) ? entry.model : ''}
                  /* REQ-CHAT-009: disabled while the neutral loading label is showing, so no run starts against a model nobody chose. */
                  disabled={!modelsLoaded || chipReason !== null} aria-disabled={!modelsLoaded || chipReason !== null}
                  title={modelsLoaded ? chipReason ?? 'Chosen for the next run.' : 'Model options are still loading.'} aria-describedby="chip-model-reason"
                  onChange={(e) => { const v = e.currentTarget.value; if (v !== '' && attachments.length > 0 && !imageInputModels.includes(v)) { setError(`${v} does not declare image input support. Remove the images before selecting it.`); return; } if (v !== '') void onSetNextModel(v).then((r) => { if (!r.ok) setError(r.reason); }); }}>
                  <option value="">—</option>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </ChipShell>
            )}
            {onSetNextReasoning && (
              <SelectorChip id="chip-reasoning" testId="chip-reasoning" label={reasoningChipLabel(entry?.reasoning ?? null)} ariaLabel="Reasoning effort for the next run"
                reason={chipReason} value={(REASONING_LEVELS as readonly string[]).includes(entry?.reasoning ?? '') ? entry!.reasoning : DEFAULT_REASONING}
                options={REASONING_LEVELS}
                onChoose={(v) => { void onSetNextReasoning(v).then((r) => { if (!r.ok) setError(r.reason); }); }} />
            )}
          </div>
          {onSetMode && <ModeSelector current={mode} enabled={runActive} onSetMode={onSetMode} />}
          {/* REQ-LIBRARY-140 / REQ-CHAT-042: a ghost control beside the composer; it stashes whatever is typed, run or no run. */}
          {onStash && <button type="button" className="btn btn-ghost" title="Stash prompt for later" data-testid="composer-stash" onClick={stash}>Stash</button>}
          {runActive && onSteer && <button type="button" className="btn btn-secondary" onClick={() => setSteering({ id: 'run', name: 'the run' })}>Steer</button>}
          {runActive && onPause && <button type="button" className="btn btn-secondary" disabled={pausePending || session?.executionStatus === 'pausing'} onClick={() => { void pause(); }}>{pausePending || session?.executionStatus === 'pausing' ? 'Pausing…' : 'Pause'}</button>}
          {runActive ? (
            <>
              <button type="button" className="btn btn-danger" onClick={() => setConfirming('stop')} aria-describedby="stop-hint">{stopLabel(stopPending)}</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>Queue</button>
            </>
          ) : paused && onContinue ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => { void continueRun(); }}>Continue run</button>
              <button type="submit" className="btn btn-secondary" disabled={busy}>Continue with a message</button>
            </>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={busy}>{composerAction(session, runActive)}</button>
          )}
          {runActive && <span id="stop-hint" className="composer__hint">{stopPending ? 'The stop is pending; the next activation forces it.' : 'Stops gracefully; a second activation forces.'}</span>}
          {paused && <span className="composer__hint">Paused. Run controls need the run continued before they can be used.</span>}
        </div>
      </form>
      {confirming === 'stop' && (
        <ConfirmDialog title="Cancel the run?" body="Cancellation cannot be undone in this session. The active run and every active task agent will be cancelled." confirmLabel="Cancel the run" onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); void stop(); }} />
      )}
      {confirming !== null && confirming !== 'stop' && (
        <ConfirmDialog title={`Cancel ${confirming.agent.name}?`} body={confirming.descendants.length > 0 ? 'Its live descendants will be cancelled with it:' : 'The agent will be cancelled.'} lines={confirming.descendants} confirmLabel={`Cancel ${confirming.agent.name}`} onCancel={() => setConfirming(null)} onConfirm={() => { const target = confirming.agent; setConfirming(null); void onCancelAgent?.(target.id).then((r) => { if (!r.ok) setError(r.reason); }); }} />
      )}
      {steering && onSteer && <SteerDialog target={steering} onSteer={onSteer} onClose={() => setSteering(null)} />}
    </div>
  );
}
