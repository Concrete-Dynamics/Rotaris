import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isBusy, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';

/**
 * The Workspace view's conversation surface, at the point the mechanism has
 * reached: the transcript rows the replica holds and the composer
 * (REQ-CHAT-001, -003, -004, -005, -011, -012), the `user`, `agent` and
 * `system` rows with an unsettled row shown as still growing, and the stop
 * control of REQ-SESSION-186 while a run is busy (REQ-NOTIFY-050), whose
 * label says whether the next activation stops gracefully or forces.
 * Structure from docs/spec; language from docs/design/system (`.input`,
 * `.btn`, tokens). Not here yet: thinking/tool rows, the trailer rows,
 * search, paging on scroll, the draggable divider (REQ-CHAT-010).
 */
export interface WorkspaceViewProps {
  readonly session: SessionRecord | null;
  readonly rows: readonly TranscriptRow[];
  readonly onSubmit: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-SESSION-186: first activation graceful, the second forces. */
  readonly onStop: (force: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
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
/** REQ-CHAT-011: displayed role `you`; an agent row shows its persona; a system row is the product's. */
export function rowRole(row: Pick<TranscriptRow, 'kind' | 'persona' | 'name'>): string {
  if (row.kind === 'user') return 'you';
  if (row.kind === 'system') return 'rotaris';
  return row.persona ?? row.name ?? row.kind;
}
export function rowTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function WorkspaceView({ session, rows, onSubmit, onStop }: WorkspaceViewProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const runActive = session !== null && isBusy(session.executionStatus);
  // A pending stop is one requested against the run that is still active; a new run begins from a submit, which resets it.
  const stopPending = runActive && stopRequested;
  const lastBodyLength = rows.at(-1)?.body.length ?? 0;

  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [rows.length, lastBodyLength]);

  const submit = async () => {
    const value = text;
    // REQ-CHAT-003: empty or whitespace-only does nothing but return focus.
    if (value.trim().length === 0) { area.current?.focus(); return; }
    setBusy(true);
    setText('');
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

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // REQ-CHAT-001: Enter submits, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
  };

  return (
    <div className="workspace">
      <div className="transcript" role="log" aria-label="Transcript" aria-live="polite">
        {rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">{session ? 'No rows yet' : 'Describe the outcome you want…'}</span>
          </div>
        )}
        {rows.map((r) => (
          <article key={r.index} className={`row row--${r.kind}${r.settled ? '' : ' row--streaming'}`} data-index={r.index} data-settled={r.settled}>
            <header className="row__head">
              <span className="row__role">{rowRole(r)}</span>
              <time className="row__time mono" dateTime={r.at}>{r.ts || rowTime(r.at)}</time>
              {!r.settled && <span className="row__streaming" aria-label="still being written">…</span>}
            </header>
            <div className="row__body">{r.body}</div>
          </article>
        ))}
        <div ref={tail} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {error && <div className="composer__error" role="alert">{error}</div>}
        <textarea
          ref={area}
          className="input composer__input"
          aria-label="Composer"
          placeholder={composerPlaceholder(session, runActive)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={busy || runActive}
          aria-disabled={busy || runActive}
          title={runActive ? 'A run is active; the composer unlocks when it ends.' : undefined}
          rows={3}
        />
        <div className="composer__actions">
          {runActive ? (
            <button type="button" className="btn btn-danger" onClick={() => { void stop(); }} aria-describedby="stop-hint">{stopLabel(stopPending)}</button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={busy}>{composerAction(session, runActive)}</button>
          )}
          {runActive && <span id="stop-hint" className="composer__hint">{stopPending ? 'The stop is pending; the next activation forces it.' : 'Stops gracefully; a second activation forces.'}</span>}
        </div>
      </form>
    </div>
  );
}
