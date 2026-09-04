import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isBusy, PERMISSION_PRESETS, type ApprovalPayload, type PermissionPreset, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { AgentTree } from './AgentTree.js';
import { markMotionStart } from './motion.js';

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
/** REQ-CHAT-011/047: displayed role `you`; an agent row shows its persona; a system row is the product's; a tool row its agent. */
export function rowRole(row: Pick<TranscriptRow, 'kind' | 'persona' | 'name'>): string {
  if (row.kind === 'user') return 'you';
  if (row.kind === 'system') return 'rotaris';
  if (row.kind === 'diff') return 'edit';
  return row.persona ?? row.name ?? row.kind;
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
export function rowTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
/** REQ-CHAT-060: `ok · 3.2s`, `failed`, `blocked · 0.0s`, a pulsing `◉ running…`; a value outside the four reads as failed. */
export function toolOutcome(row: Pick<TranscriptRow, 'toolStatus' | 'durationMs' | 'settled'>): { text: string; state: 'running' | 'ok' | 'failed' | 'blocked' | 'none' } {
  const s = row.toolStatus;
  if (s === undefined || s === '') return { text: '', state: 'none' };
  const secs = `${((row.durationMs ?? 0) / 1000).toFixed(1)}s`;
  if (s === 'running') return row.settled ? { text: '', state: 'none' } : { text: '◉ running…', state: 'running' };
  if (s === 'ok') return { text: `ok · ${secs}`, state: 'ok' };
  if (s === 'blocked') return { text: `blocked · ${secs}`, state: 'blocked' };
  return { text: 'failed', state: 'failed' };
}

function ToolRow({ row }: { row: TranscriptRow }) {
  const [open, setOpen] = useState(false);
  const outcome = toolOutcome(row);
  const expandable = (row.input !== undefined && row.input !== '') || (row.output !== undefined && row.output !== '');
  const description = outcome.state === 'blocked' ? `Blocked: ${row.blockedReason ?? row.output ?? 'the call was not executed'}` : undefined;
  return (
    <article className={`row row--tool tool tool--${outcome.state}${row.settled ? '' : ' row--streaming'}`} data-index={row.index} data-settled={row.settled} data-call-key={row.callKey}>
      <header className="row__head">
        <span className="row__role">{rowRole(row)}</span>
        <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>
      </header>
      <button
        type="button"
        className={`tool__header mono${expandable ? '' : ' tool__header--static'}`}
        onClick={() => { if (expandable) setOpen((o) => !o); }}
        aria-expanded={expandable ? open : undefined}
        aria-description={description}
        disabled={!expandable}
      >
        <span className="tool__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="tool__name">{row.body}</span>
        {outcome.text && <span ref={(element) => { if (element && outcome.state === 'running') markMotionStart(element); }} className={`tool__outcome tool__outcome--${outcome.state}`}>{outcome.text}</span>}
      </button>
      {!open && expandable && <div className="tool__preview text-secondary mono">⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</div>}
      {open && (
        <div className="tool__card">
          {row.input !== undefined && row.input !== '' && (<><div className="tool__caption">INPUT</div><pre className="tool__pre mono">{row.input}</pre></>)}
          {row.output !== undefined && row.output !== '' && (<><div className="tool__caption">OUTPUT</div><pre className="tool__pre mono">{row.output}</pre></>)}
          {outcome.state === 'blocked' && row.blockedReason && <div className="tool__blocked">{row.blockedReason}</div>}
        </div>
      )}
    </article>
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

export function WorkspaceView({ session, rows, onSubmit, onStop, onSetMode, onCancelAgent, nowIso = null, onQueue, onEditQueued, onRemoveQueued, onPause, onContinue, onSteer, onSetModel, onSetReasoning, models = [] }: WorkspaceViewProps) {
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
  const descendantsOf = (id: string): string[] => {
    const all = session?.agents ?? [];
    const out: string[] = [];
    const walk = (parent: string) => { for (const a of all) if (a.parentId === parent && !['done', 'failed', 'cancelled'].includes(a.presentationState)) { out.push(a.name); walk(a.id); } };
    walk(id);
    return out;
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // REQ-CHAT-001: Enter submits, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
  };

  const mode = (session?.permissionMode ?? null) as PermissionPreset | null;
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const agents = session?.agents ?? [];
  const selected = agents.find((a) => a.id === selectedAgent) ?? null;
  const paused = session !== null && (session.executionStatus === 'paused' || session.executionStatus === 'paused_message_limit');
  const switchable = session !== null && (session.executionStatus === 'running' || session.executionStatus === 'waiting');
  const queued = session?.queuedPrompts ?? [];
  return (
    <div className={`workspace${agents.length > 0 ? ' workspace--with-agents' : ''}`}>
      {agents.length > 0 && (
        <aside className="agents" aria-label="Delegation">
          <div className="agents__header">
            <span className="agents__title">Agents</span>
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onSteer && runActive && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setSteering({ id: selected.id, name: selected.name })}>Steer {selected.name}</button>
            )}
            {selected && !['done', 'failed', 'cancelled'].includes(selected.presentationState) && onCancelAgent && (
              <button type="button" className="btn btn-ghost agents__cancel" onClick={() => setConfirming({ agent: { id: selected.id, name: selected.name }, descendants: descendantsOf(selected.id) })}>Cancel {selected.name}</button>
            )}
          </div>
          <AgentTree agents={agents} selected={selectedAgent} onSelect={setSelectedAgent} nowIso={nowIso} />
        </aside>
      )}
      <div className="transcript" role="log" aria-label="Transcript" aria-live="polite">
        {intentStatusText(session?.intent ?? null) && (
          <div className="intent-status mono" role="status" aria-live="polite" data-phase={session?.intent?.phase}>{intentStatusText(session?.intent ?? null)}</div>
        )}
        {rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">{session ? 'No rows yet' : 'Describe the outcome you want…'}</span>
          </div>
        )}
        {rows.map((r) => (r.kind === 'tool' ? <ToolRow key={r.index} row={r} /> : (
          <article key={r.index} className={`row row--${r.kind}${r.settled ? '' : ' row--streaming'}`} data-index={r.index} data-settled={r.settled}>
            <header className="row__head">
              <span className="row__role">{rowRole(r)}</span>
              <time className="row__time mono" dateTime={r.at}>{r.ts || rowTime(r.at)}</time>
              {!r.settled && <span ref={(element) => { if (element) markMotionStart(element); }} className="row__streaming" aria-label="still being written">…</span>}
            </header>
            <div className={`row__body${r.kind === 'diff' ? ' mono row__body--diff' : ''}`}>{r.body}</div>
          </article>
        )))}
        {pending.map((p) => <ApprovalTrailerRow key={p.request_id} p={p} />)}
        <div ref={tail} />
      </div>
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
