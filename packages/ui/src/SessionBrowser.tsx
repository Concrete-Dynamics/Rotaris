import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RepairReportPayload, SessionListItemPayload } from '@rotaris/contracts';
import { ConfirmDialog } from './ConfirmDialog.js';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Table as DesignTable, Tag as DesignTag } from './design-system/index.js';

/** Every action answers a value or a reason; nothing throws across the bridge (ADR-0044). */
export type ActionOutcome<T = unknown> = { readonly ok: true; readonly value?: T } | { readonly ok: false; readonly reason: string };
export interface ExportOutcome { readonly cancelled?: boolean; readonly destination?: string; readonly documents?: number; readonly warnings?: readonly string[] }
export interface DeleteOutcome { readonly existed: boolean; readonly refsDeleted: number; readonly refsLeft: string | null; readonly filesRemoved: boolean; readonly unreadable: boolean }

export interface SessionBrowserProps {
  readonly sessions: readonly SessionListItemPayload[];
  readonly loading: boolean;
  readonly error?: string | null | undefined;
  readonly onOpen: (sessionId: string) => Promise<ActionOutcome>;
  readonly onDismiss: () => void;
  /** Part U (REQ-SESSION-182): the actions. Absent handlers hide their controls, so the browser still lists and opens alone. */
  readonly onRefresh?: (() => Promise<void>) | undefined;
  readonly onRepair?: ((sessionId: string | null) => Promise<ActionOutcome<{ report: RepairReportPayload }>>) | undefined;
  readonly onDelete?: ((sessionId: string) => Promise<ActionOutcome<DeleteOutcome>>) | undefined;
  readonly onExportRecords?: ((sessionId: string) => Promise<ActionOutcome<ExportOutcome>>) | undefined;
  readonly onExportTrajectory?: ((sessionIds: readonly string[]) => Promise<ActionOutcome<ExportOutcome>>) | undefined;
  readonly onOpenLog?: ((sessionId: string) => Promise<ActionOutcome>) | undefined;
  readonly onRevealFiles?: ((sessionId: string) => Promise<ActionOutcome>) | undefined;
  readonly onBackup?: (() => Promise<ActionOutcome>) | undefined;
  readonly onRestore?: (() => Promise<ActionOutcome>) | undefined;
}

/** REQ-SHELL-126: local search spans every piece of text presented in a browser row. */
export function filterSessions(sessions: readonly SessionListItemPayload[], query: string): readonly SessionListItemPayload[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return sessions;
  return sessions.filter((session) => [session.label, session.status, session.branch, session.relativeTime, session.detail, session.sessionId, ...(session.stale ? ['stale'] : []), ...(session.awaitingInput ? ['awaiting input'] : []), ...(session.unreadable ? ['unreadable', session.unreadable] : [])]
    .some((value) => value.toLocaleLowerCase().includes(needle)));
}

/** REQ-SESSION-182's repair report as lines: per session the id, the stuck status, `interrupted`, the reason; or the one sentence. */
export function repairReportLines(report: RepairReportPayload): string[] {
  const lines = report.repaired.map((r) => `Session ${r.sessionId} was stuck at '${r.from}' and is now '${r.to}': ${r.reason}.`);
  if (report.nothingStale) lines.unshift(NOTHING_STALE);
  for (const s of report.skipped) lines.push(`Session ${s.sessionId} was not repaired: ${s.reason}.`);
  return lines;
}
export const NOTHING_STALE = 'Nothing was stale: every session either asserts no run in progress or is still held by a live process.';

/** REQ-SESSION-200: the disclosure's substance — what a workspace backup does not carry, what it does, and the two remedies. */
export const BACKUP_DISCLOSURE = {
  title: 'What a workspace backup does not carry',
  notCarried: 'Sessions are kept in a store on this machine, not inside the workspace. Backing up, copying, cloning or synchronising the workspace does not carry its session history: not the resumable state, the transcript and its released pages, the durable event history, the timeline, the issues record, the metrics document or the evidence records with the permission audit among them; not the workspace-scoped improvement library; and not the per-session files held with the store — the session log, the summary, and the artifact, attachment and image bodies.',
  carried: 'Your own material travels exactly as you left it: the repository, the requirement documents, the configuration, the personas and the model slots. The workspace identifier travels with the workspace, so a workspace moved, renamed or restored on this machine finds its own sessions again, and checkpoints are objects in your repository.',
  remedies: 'To carry the store itself, use Back up store… here (and Restore store… to put it back). To carry individual records into a form other software can read, use Export records… and Export trajectory… on a session.',
} as const;

const sentence = (o: ExportOutcome, what: string): string => {
  if (o.cancelled) return `${what}: no destination was chosen, nothing was written.`;
  const n = o.documents ?? 1;
  return `Wrote ${n} ${what}${n === 1 ? '' : 's'} to ${o.destination ?? 'the chosen file'}.${o.warnings && o.warnings.length > 0 ? ` ${o.warnings.join(' ')}` : ''}`;
};

/** REQ-SHELL-126/127, REQ-SESSION-117/118/182/191/041/200: the window-modal browser and its actions (Part U). */
export function SessionBrowser({ sessions, loading, error = null, onOpen, onDismiss, onRefresh, onRepair, onDelete, onExportRecords, onExportTrajectory, onOpenLog, onRevealFiles, onBackup, onRestore }: SessionBrowserProps) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [report, setReport] = useState<readonly string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SessionListItemPayload | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [disclosure, setDisclosure] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => filterSessions(sessions, query), [sessions, query]);
  const stale = useMemo(() => sessions.filter((s) => s.stale).length, [sessions]);

  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy !== null) return;
      if (confirmDelete) return; // the dialog owns Escape
      if (menuFor !== null) { event.preventDefault(); setMenuFor(null); return; }
      onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, busy, menuFor, confirmDelete]);

  const run = useCallback(async <T,>(key: string, action: () => Promise<ActionOutcome<T>>, done: (value: T | undefined) => readonly string[] | null): Promise<void> => {
    setBusy(key);
    setLocalError(null);
    setMenuFor(null);
    try {
      const r = await action();
      if (!r.ok) { setLocalError(r.reason); return; }
      const lines = done(r.value);
      if (lines) setReport(lines);
      if (onRefresh) await onRefresh();
    } finally { setBusy(null); }
  }, [onRefresh]);

  const open = (sessionId: string) => run(`open:${sessionId}`, () => onOpen(sessionId), () => null);
  const repair = (sessionId: string | null) => onRepair && run(`repair:${sessionId ?? 'all'}`, () => onRepair(sessionId), (v) => (v ? repairReportLines(v.report) : [NOTHING_STALE]));
  const exportRecords = (sessionId: string) => onExportRecords && run(`records:${sessionId}`, () => onExportRecords(sessionId), (v) => [sentence(v ?? {}, 'records document')]);
  const exportTrajectories = (ids: readonly string[]) => onExportTrajectory && run(`trajectory:${ids.join(',')}`, () => onExportTrajectory(ids), (v) => [sentence(v ?? {}, 'trajectory document')]);
  const openLog = (sessionId: string) => onOpenLog && run(`log:${sessionId}`, () => onOpenLog(sessionId), () => [`Opened the log of session ${sessionId}.`]);
  const revealFiles = (sessionId: string) => onRevealFiles && run(`files:${sessionId}`, () => onRevealFiles(sessionId), () => [`Revealed the files of session ${sessionId}.`]);
  const doDelete = (session: SessionListItemPayload) => onDelete && run(`delete:${session.sessionId}`, () => onDelete(session.sessionId), (v) => {
    setSelected((s) => s.filter((id) => id !== session.sessionId));
    if (!v) return [`Deleted session ${session.sessionId}.`];
    if (!v.existed) return [`Session ${session.sessionId} was already gone; nothing was deleted.`];
    return [`Deleted session ${session.sessionId} permanently${v.unreadable ? ' (its stored state was unreadable)' : ''}: ${v.refsDeleted} checkpoint ref${v.refsDeleted === 1 ? '' : 's'} removed${v.refsLeft ? `; refs remain under ${v.refsLeft}` : ''}; files ${v.filesRemoved ? 'removed' : 'absent'}.`];
  });
  const toggleSelected = (sessionId: string) => setSelected((s) => (s.includes(sessionId) ? s.filter((id) => id !== sessionId) : [...s, sessionId]));

  const modal = busy !== null;
  return (
    <div className="dialog-backdrop session-browser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !modal && !confirmDelete) onDismiss(); }}>
      <section className="dialog session-browser" role="dialog" aria-modal="true" aria-labelledby="session-browser-title" aria-busy={modal}>
        <header className="session-browser__head">
          <div>
            <h2 id="session-browser-title" className="dialog-title">Sessions</h2>
            <p className="dialog-body">Open, repair, export or delete this workspace's stored sessions; back up or restore the whole store.</p>
          </div>
          <DesignButton type="button" className="btn btn-ghost" aria-label="Close sessions" onClick={onDismiss} disabled={modal}>Close</DesignButton>
        </header>
        <div className="session-browser__toolbar">
          <label className="session-browser__search">
            <span className="session-browser__label">Search sessions</span>
            <DesignInput ref={search} className="input" type="search" placeholder="Filter by name, status, or branch…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="session-browser__actions" role="group" aria-label="Workspace actions">
            {onRepair && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="session-repair-all" disabled={modal} title={stale === 0 ? 'No session is marked stale; the answer says so.' : `${stale} stale session${stale === 1 ? '' : 's'}`} onClick={() => { void repair(null); }}>{busy === 'repair:all' ? 'Repairing…' : `Repair all stale${stale > 0 ? ` (${stale})` : ''}`}</DesignButton>}
            {onExportTrajectory && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="session-export-selected" disabled={modal || selected.length === 0} title={selected.length === 0 ? 'Select sessions with the checkboxes to export their trajectories together, in the order selected.' : `${selected.length} selected, in selection order`} onClick={() => { void exportTrajectories(selected); }}>Export selected trajectories…{selected.length > 0 ? ` (${selected.length})` : ''}</DesignButton>}
            {onBackup && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="session-backup" disabled={modal} onClick={() => { void run('backup', onBackup, () => ['The store was backed up to the file you chose.']); }}>Back up store…</DesignButton>}
            {onRestore && <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="session-restore" disabled={modal} onClick={() => { void run('restore', onRestore, () => ['The restore finished; the list below is read again.']); }}>Restore store…</DesignButton>}
            <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="session-disclosure-toggle" aria-expanded={disclosure} aria-controls="session-browser-disclosure" onClick={() => setDisclosure((d) => !d)}>About backups</DesignButton>
          </div>
        </div>
        {disclosure && (
          <section id="session-browser-disclosure" className="session-browser__disclosure card" data-testid="session-disclosure" aria-label={BACKUP_DISCLOSURE.title}>
            <h3 className="session-browser__disclosure-title">{BACKUP_DISCLOSURE.title}</h3>
            <p data-testid="session-disclosure-not-carried">{BACKUP_DISCLOSURE.notCarried}</p>
            <p data-testid="session-disclosure-carried">{BACKUP_DISCLOSURE.carried}</p>
            <p data-testid="session-disclosure-remedies">{BACKUP_DISCLOSURE.remedies}</p>
          </section>
        )}
        {(error || localError) && <p className="session-browser__error" role="alert" data-testid="session-browser-error">{localError ?? error}</p>}
        {report.length > 0 && (
          <ul className="session-browser__report" role="status" data-testid="session-report" aria-label="Last action">
            {report.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
          </ul>
        )}
        <div className="session-browser__table-wrap">
          <DesignTable className="table session-browser__table">
            <thead><tr><th><span className="visually-hidden">Select for export</span></th><th>Session</th><th>Status</th><th>Branch</th><th>Updated</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((session) => {
                const unreadable = session.unreadable !== null;
                const rowBusy = busy !== null && busy.endsWith(`:${session.sessionId}`);
                return (
                  <tr key={session.sessionId} data-session-id={session.sessionId} data-stale={session.stale ? 'true' : 'false'} data-unreadable={unreadable ? 'true' : 'false'}>
                    <td className="session-browser__select">
                      {onExportTrajectory && <DesignInput type="checkbox" className="session-browser__check" aria-label={`Select session ${session.label} for trajectory export`} checked={selected.includes(session.sessionId)} disabled={modal} onChange={() => toggleSelected(session.sessionId)} />}
                    </td>
                    <td><span className="session-browser__name">{session.label}</span><span className="session-browser__detail mono">{session.detail}</span></td>
                    <td>
                      {session.status}
                      {session.stale && <DesignTag className="tag session-browser__stale">stale</DesignTag>}
                      {session.awaitingInput && <DesignTag className="tag">awaiting input</DesignTag>}
                      {session.status === 'waiting' && <DesignTag className="tag tag-wait">waiting on a provider limit</DesignTag>}
                      {/* REQ-SESSION-041: listed, said to be unreadable, with the parse detail; Open refused, Delete offered. */}
                      {unreadable && <><DesignTag className="tag tag-fail session-browser__unreadable-tag">unreadable</DesignTag><span className="session-browser__unreadable mono" data-testid="session-unreadable-detail">{session.unreadable}</span></>}
                    </td>
                    {/* REQ-GIT-122: the row's `<branch or —> · <state>` text. */}
                    <td className="mono" data-testid="session-row-branch">{`${session.branch} · ${session.status}`}</td>
                    <td>{session.relativeTime}</td>
                    <td className="session-browser__row-cell">
                      <div className="session-browser__row-actions">
                      {/* Open stays the row's FIRST button: main's resume seam clicks it by position (ROTARIS_CAPTURE_RESUME). */}
                      <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="session-open" disabled={modal || unreadable} aria-disabled={unreadable} data-refused={unreadable ? 'true' : 'false'} title={unreadable ? `This session cannot be opened: ${session.unreadable}` : undefined} onClick={() => { void open(session.sessionId); }}>{busy === `open:${session.sessionId}` ? 'Opening…' : 'Open'}</DesignButton>
                      {(onRepair || onDelete || onExportRecords || onExportTrajectory || onOpenLog || onRevealFiles) && (
                        <span className="session-browser__menu-anchor">
                          <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="session-actions" aria-haspopup="true" aria-expanded={menuFor === session.sessionId} aria-label={`Actions for session ${session.label}`} disabled={modal} onClick={() => setMenuFor((m) => (m === session.sessionId ? null : session.sessionId))}>{rowBusy ? 'Working…' : 'Actions'}</DesignButton>
                          {menuFor === session.sessionId && (
                            <DesignCard className="session-browser__menu card elev-md" role="group" aria-label={`Actions for session ${session.label}`} data-testid="session-actions-menu">
                              {onRepair && session.stale && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item" data-testid="session-repair" onClick={() => { void repair(session.sessionId); }}>Repair</DesignButton>}
                              {onExportRecords && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item" data-testid="session-export-records" onClick={() => { void exportRecords(session.sessionId); }}>Export records…</DesignButton>}
                              {onExportTrajectory && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item" data-testid="session-export-trajectory" onClick={() => { void exportTrajectories([session.sessionId]); }}>Export trajectory…</DesignButton>}
                              {onOpenLog && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item" data-testid="session-open-log" onClick={() => { void openLog(session.sessionId); }}>Open log</DesignButton>}
                              {onRevealFiles && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item" data-testid="session-reveal-files" onClick={() => { void revealFiles(session.sessionId); }}>Reveal files</DesignButton>}
                              {onDelete && <DesignButton type="button" className="btn btn-ghost btn-compact session-browser__menu-item session-browser__menu-item--danger" data-testid="session-delete" onClick={() => { setMenuFor(null); setConfirmDelete(session); }}>Delete…</DesignButton>}
                            </DesignCard>
                          )}
                        </span>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && shown.length === 0 && <tr><td colSpan={6} className="session-browser__empty">{sessions.length === 0 ? 'This workspace has no stored sessions here.' : 'No sessions match this search.'}</td></tr>}
            </tbody>
          </DesignTable>
          {loading && <p className="session-browser__loading" role="status">Loading sessions…</p>}
        </div>
      </section>
      {confirmDelete && (
        <ConfirmDialog
          testId="session-delete-confirm"
          title={`Delete session ${confirmDelete.label}?`}
          body="This deletes the session permanently: its record, its transcript, its event history, its timeline, its issues, its permission audit, its checkpoint refs and its files. It cannot be undone, and no backup is taken first."
          lines={[`Session ${confirmDelete.sessionId}`, `Status: ${confirmDelete.status}${confirmDelete.stale ? ' (stale)' : ''}`, `Branch: ${confirmDelete.branch}`, ...(confirmDelete.unreadable ? [`Its stored state is unreadable: ${confirmDelete.unreadable}`] : [])]}
          confirmLabel="Delete permanently"
          destructive
          busy={busy === `delete:${confirmDelete.sessionId}`}
          onConfirm={() => { const s = confirmDelete; setConfirmDelete(null); void doDelete(s); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
