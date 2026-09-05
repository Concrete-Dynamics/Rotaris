import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { isBusy, PERMISSION_PRESETS, RUN_AGENT_ID, type AgentRecord, type ApprovalPayload, type PermissionPreset, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { AgentTree } from './AgentTree.js';
import { liveDescendants, runLevelAgent } from './agents.js';
import { Inspector, type PersonaEntry } from './Inspector.js';
import { useShellState } from './shell-state.js';
import { TranscriptRows, rowRole, rowTime, toolOutcome } from './TranscriptRows.js';

// The row helpers moved to TranscriptRows.tsx in Part R (one renderer for every transcript surface); re-exported so nothing that named them here breaks.
export { rowRole, rowTime, toolOutcome };

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
  readonly onSubmit: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
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
  /** REQ-MONITOR-123/125: pause the whole run; continue a paused session from the composer. */
  readonly onPause?: (() => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onContinue?: (() => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-133/137: steer one live agent (`run` for the entry role). */
  readonly onSteer?: ((agentId: string, text: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-142/144: the run header's model and reasoning switch, next-iteration changes. */
  readonly onSetModel?: ((model: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetReasoning?: ((level: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly models?: readonly string[] | undefined;
  /** Part R — the inspector (REQ-MONITOR-050..067): the configured personas, the entry role's facts for the run-level agent, the compression threshold. */
  readonly personas?: readonly PersonaEntry[] | undefined;
  readonly entry?: { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] } | undefined;
  readonly compressionThresholdPercent?: number | undefined;
  /** REQ-SHELL-073 / REQ-MONITOR-072: a tree click selects (the shared selection) and, with the preference on, the caller opens the window; `key` moves select only. */
  readonly onSelectAgent?: ((id: string | null, source?: 'click' | 'key') => void) | undefined;
  /** REQ-SHELL-072/073, REQ-MONITOR-137: open or raise the persona window; `focusSteer` when the inspector's Steer asked for it. */
  readonly onOpenPersona?: ((agent: AgentRecord, focusSteer: boolean) => void) | undefined;
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

/** REQ-CHAT-004: the four placeholders, first condition wins. */
export function composerPlaceholder(session: SessionRecord | null, runActive: boolean): string {
  if (runActive) return 'Run active — the composer unlocks when it ends…';
  if (session && isBusy(session.executionStatus)) return 'Describe how to continue this session…';
  if (session) return 'Message orchestrator — type / for commands, ↑ for history…';
  return 'Describe the outcome you want…';
}
/** REQ-CHAT-005: the primary action states the mode. */
export function composerAction(session: SessionRecord | null, runActive: boolean): 'Queue' | 'Continue run' | 'Start run' {
  if (runActive) return 'Queue';
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
/** `m:ss` / `h:mm:ss` of a remaining span, never negative. */
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
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
/** REQ-CHAT-051: one trailer row per pending approval, after every recorded row. */
function ApprovalTrailerRow({ p }: { p: ApprovalPayload }) {
  return (
    <article className="row row--approval" data-request-id={p.request_id}>
      <header className="row__head"><span className="row__role">{p.agent_id || p.persona}</span></header>
      <div className="row__body">Approval needed — {p.command !== '' ? p.command : p.tool_name}</div>
    </article>
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
    <div className="mode" aria-label="Permission mode">
      <span className="mode__label text-secondary">mode</span>
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

export function WorkspaceView({ session, rows, onSubmit, onStop, onSetMode, onCancelAgent, nowIso = null, onQueue, onEditQueued, onRemoveQueued, onPause, onContinue, onSteer, onSetModel, onSetReasoning, models = [], personas = [], entry, compressionThresholdPercent = 60, onSelectAgent, onOpenPersona }: WorkspaceViewProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [confirming, setConfirming] = useState<'stop' | { agent: { id: string; name: string }; descendants: string[] } | null>(null);
  const [steering, setSteering] = useState<{ id: string; name: string } | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const runActive = session !== null && isBusy(session.executionStatus);
  // A pending stop is one requested against the run that is still active; a new run begins from a submit, which resets it.
  const stopPending = runActive && stopRequested;
  const lastBodyLength = rows.at(-1)?.body.length ?? 0;
  const pending = session?.pendingApprovals ?? [];

  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [rows.length, lastBodyLength, pending.length]);

  const submit = async () => {
    const value = text;
    // REQ-CHAT-003: empty or whitespace-only does nothing but return focus.
    if (value.trim().length === 0) { area.current?.focus(); return; }
    setBusy(true);
    setText('');
    setStatus(null);
    if (runActive && onQueue) {
      // REQ-CHAT-035: during a run an ordinary submission is queued for the running session.
      const q = await onQueue(value);
      setBusy(false);
      if (q.ok) { setError(null); setStatus('Message queued for the next iteration.'); }
      else { setText(value); setError('Message could not be queued because the run is no longer active.'); }
      area.current?.focus();
      return;
    }
    setStopRequested(false);
    const r = await onSubmit(value);
    setBusy(false);
    if (!r.ok) {
      // REQ-CHAT-012: the typed text is restored unchanged and the reason is raised.
      setText(value);
      setError(r.reason);
    } else {
      setError(null);
    }
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

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // REQ-CHAT-001: Enter submits, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
  };

  const mode = (session?.permissionMode ?? null) as PermissionPreset | null;
  // REQ-MONITOR-042 (Part R): the selection is the shell's, shared by every surface; `run` is the run-level selection.
  const selectedAgent = useShellState((st) => st.selectedAgentId);
  const selectAgentShared = useShellState((st) => st.selectAgent);
  const select = (id: string | null, source?: 'click' | 'key') => { selectAgentShared(id); onSelectAgent?.(id, source); };
  const agents = session?.agents ?? [];
  const runLevel = useMemo(() => (entry ? runLevelAgent(session, entry) : null), [session, entry]);
  const selected = selectedAgent === RUN_AGENT_ID ? runLevel : agents.find((a) => a.id === selectedAgent) ?? null;
  // REQ-MONITOR-051: below 1180 px the agents panel and the inspector are overlay drawers, mutually exclusive; choosing an agent opens the inspector's.
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState<'agents' | 'inspector' | null>(null);
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
  const switchable = session !== null && (session.executionStatus === 'running' || session.executionStatus === 'waiting');
  const queued = session?.queuedPrompts ?? [];
  return (
    <div className={`workspace${agents.length > 0 ? ' workspace--with-agents' : ''}${narrow ? ' workspace--narrow' : ''}`} data-drawer={drawer ?? ''}>
      {narrow && (
        <div className="workspace__drawer-bar" aria-label="Panels">
          {agents.length > 0 && <button type="button" className={`btn btn-ghost btn-compact${drawer === 'agents' ? ' is-active' : ''}`} aria-pressed={drawer === 'agents'} onClick={() => setDrawer(drawer === 'agents' ? null : 'agents')}>Agents</button>}
          <button type="button" className={`btn btn-ghost btn-compact${drawer === 'inspector' ? ' is-active' : ''}`} aria-pressed={drawer === 'inspector'} onClick={() => setDrawer(drawer === 'inspector' ? null : 'inspector')}>Inspector</button>
        </div>
      )}
      {agents.length > 0 && (!narrow || drawer === 'agents') && (
        <aside className={`agents${narrow ? ' agents--drawer' : ''}`} aria-label="Delegation">
          <div className="agents__header">
            <span className="agents__title">Agents</span>
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onSteer && runActive && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setSteering({ id: selected.id, name: selected.name })}>Steer {selected.name}</button>
            )}
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onCancelAgent && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setConfirming({ agent: { id: selected.id, name: selected.name }, descendants: descendantsOf(selected.id) })}>Cancel {selected.name}</button>
            )}
          </div>
          <AgentTree agents={agents} selected={selectedAgent} onSelect={select} nowIso={nowIso} />
        </aside>
      )}
      <div className="transcript" role="log" aria-label="Transcript" aria-live="polite">
        {intentStatusText(session?.intent ?? null) && (
          <div className="intent-status mono" role="status" aria-live="polite" data-phase={session?.intent?.phase}>{intentStatusText(session?.intent ?? null)}</div>
        )}
        {session?.wait && runActive && (
          <WaitHeader key={`${session.wait.agent}:${session.wait.attempt}:${session.wait.provider}:${session.wait.model}:${session.wait.rejection ?? ''}`} wait={session.wait} models={models} onSetModel={onSetModel} onCancel={() => setConfirming('stop')} />
        )}
        {rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">{session ? 'No rows yet' : 'Describe the outcome you want…'}</span>
          </div>
        )}
        <TranscriptRows rows={rows} />
        {pending.map((p) => <ApprovalTrailerRow key={p.request_id} p={p} />)}
        <div ref={tail} />
      </div>
      {(!narrow || drawer === 'inspector') && inspector}
      <QueuePanel prompts={queued} onEdit={onEditQueued} onRemove={onRemoveQueued} onError={setError} />
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {error && <div className="composer__error" role="alert">{error}</div>}
        {status && !error && <div className="composer__hint" role="status">{status}</div>}
        <textarea
          ref={area}
          className="input composer__input"
          aria-label="Composer"
          placeholder={runActive ? 'Queue a message for the next iteration…' : composerPlaceholder(session, runActive)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          aria-disabled={busy}
          rows={3}
        />
        <div className="composer__actions">
          {onSetMode && <ModeSelector current={mode} enabled={runActive} onSetMode={onSetMode} />}
          {switchable && (onSetModel || onSetReasoning) && (
            <div className="run-controls" aria-label="Active run model and reasoning">
              {onSetModel && models.length > 0 && (
                <select className="input select" aria-label="Active run model" defaultValue="" onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetModel(v).then((r) => { if (!r.ok) setError(r.reason); }); }}>
                  <option value="">Switch model…</option>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              {onSetReasoning && (
                <select className="input select" aria-label="Active run reasoning" defaultValue="" onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetReasoning(v).then((r) => { if (!r.ok) setError(r.reason); }); }}>
                  <option value="">Switch reasoning…</option>
                  {['low', 'medium', 'high'].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              )}
            </div>
          )}
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
