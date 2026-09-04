import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionListItemPayload } from '@rotaris/contracts';

export interface SessionBrowserProps {
  readonly sessions: readonly SessionListItemPayload[];
  readonly loading: boolean;
  readonly error?: string | null | undefined;
  readonly onOpen: (sessionId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onDismiss: () => void;
}

/** REQ-SHELL-126: local search spans every piece of text presented in a browser row. */
export function filterSessions(sessions: readonly SessionListItemPayload[], query: string): readonly SessionListItemPayload[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return sessions;
  return sessions.filter((session) => [session.label, session.status, session.branch, session.relativeTime, session.detail, session.sessionId, ...(session.stale ? ['stale'] : []), ...(session.awaitingInput ? ['awaiting input'] : [])]
    .some((value) => value.toLocaleLowerCase().includes(needle)));
}

/** REQ-SHELL-126/127, REQ-SESSION-117/118: the window-modal browser and its single Open action. */
export function SessionBrowser({ sessions, loading, error = null, onOpen, onDismiss }: SessionBrowserProps) {
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => filterSessions(sessions, query), [sessions, query]);

  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && opening === null) onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, opening]);

  const open = async (sessionId: string) => {
    setOpening(sessionId);
    setLocalError(null);
    const result = await onOpen(sessionId);
    setOpening(null);
    if (!result.ok) setLocalError(result.reason);
  };

  return (
    <div className="dialog-backdrop session-browser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && opening === null) onDismiss(); }}>
      <section className="dialog session-browser" role="dialog" aria-modal="true" aria-labelledby="session-browser-title">
        <header className="session-browser__head">
          <div>
            <h2 id="session-browser-title" className="dialog-title">Sessions</h2>
            <p className="dialog-body">Open a stored session in this workspace and continue its conversation.</p>
          </div>
          <button type="button" className="btn btn-ghost" aria-label="Close sessions" onClick={onDismiss} disabled={opening !== null}>Close</button>
        </header>
        <label className="session-browser__search">
          <span className="session-browser__label">Search sessions</span>
          <input ref={search} className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {(error || localError) && <p className="session-browser__error" role="alert">{localError ?? error}</p>}
        <div className="session-browser__table-wrap">
          <table className="table session-browser__table">
            <thead><tr><th>Session</th><th>Status</th><th>Branch</th><th>Updated</th><th><span className="visually-hidden">Action</span></th></tr></thead>
            <tbody>
              {shown.map((session) => (
                <tr key={session.sessionId} data-session-id={session.sessionId}>
                  <td><span className="session-browser__name">{session.label}</span><span className="session-browser__detail mono">{session.detail}</span></td>
                  <td>{session.status}{session.stale && <span className="tag session-browser__stale">stale</span>}{session.awaitingInput && <span className="tag">awaiting input</span>}</td>
                  <td className="mono">{session.branch}</td>
                  <td>{session.relativeTime}</td>
                  <td><button type="button" className="btn btn-secondary" disabled={opening !== null} onClick={() => { void open(session.sessionId); }}>{opening === session.sessionId ? 'Opening…' : 'Open'}</button></td>
                </tr>
              ))}
              {!loading && shown.length === 0 && <tr><td colSpan={5} className="session-browser__empty">No sessions match this search.</td></tr>}
            </tbody>
          </table>
          {loading && <p className="session-browser__loading" role="status">Loading sessions…</p>}
        </div>
      </section>
    </div>
  );
}
