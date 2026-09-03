import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SessionRecord, TranscriptRow } from '@rotaris/contracts';

/**
 * The Workspace view's conversation surface, at the point the mechanism has
 * reached: the transcript rows the replica holds and the composer
 * (REQ-CHAT-001, -003, -004, -005, -011). Structure from docs/spec; language
 * from docs/design/system (`.input`, `.btn`, tokens). What is NOT here yet is
 * every row kind but `user`, streaming, the trailer rows, search, paging on
 * scroll and the draggable divider (REQ-CHAT-010): they land with the run loop.
 */
export interface WorkspaceViewProps {
  readonly session: SessionRecord | null;
  readonly rows: readonly TranscriptRow[];
  readonly runActive: boolean;
  readonly onSubmit: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** REQ-CHAT-004: the four placeholders, first condition wins. */
export function composerPlaceholder(session: SessionRecord | null, runActive: boolean): string {
  if (runActive) return 'Run active — write a follow-up for the next iteration…';
  if (session && session.executionStatus === 'busy') return 'Describe how to continue this session…';
  if (session) return 'Message orchestrator — type / for commands, ↑ for history…';
  return 'Describe the outcome you want…';
}
/** REQ-CHAT-005: the primary action states the mode. */
export function composerAction(session: SessionRecord | null, runActive: boolean): 'Queue' | 'Continue run' | 'Start run' {
  if (runActive) return 'Queue';
  return session ? 'Continue run' : 'Start run';
}
/** REQ-CHAT-011: displayed role `you`, timestamp HH:MM:SS 24-hour. */
export function rowRole(kind: string): string {
  return kind === 'user' ? 'you' : kind;
}
export function rowTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function WorkspaceView({ session, rows, runActive, onSubmit }: WorkspaceViewProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [rows.length]);

  const submit = async () => {
    const value = text;
    // REQ-CHAT-003: empty or whitespace-only does nothing but return focus.
    if (value.trim().length === 0) { area.current?.focus(); return; }
    setBusy(true);
    setText('');
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
          <article key={r.index} className={`row row--${r.kind}`} data-index={r.index} data-settled={r.settled}>
            <header className="row__head">
              <span className="row__role">{rowRole(r.kind)}</span>
              <time className="row__time mono" dateTime={r.at}>{rowTime(r.at)}</time>
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
          disabled={busy}
          rows={3}
        />
        <div className="composer__actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{composerAction(session, runActive)}</button>
        </div>
      </form>
    </div>
  );
}
