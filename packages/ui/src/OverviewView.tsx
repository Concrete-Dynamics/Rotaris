import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { isBusy, presentationChildState, presentationStatus, STATUS_LABELS, type AgentRecord, type PaneLayout, type RepositoryState, type SessionListItemPayload, type SessionRecord } from '@rotaris/contracts';
import { AgentTree } from './AgentTree.js';

/**
 * REQ-SHELL-026's startup view. Structure from the specification — REQ-MONITOR-164 (the header), 165 (the two
 * resizable columns, the metric grid's reflow, the onboarding empty state), 166 (tokens, the sparkline the RUN
 * sampled, the cost label with its qualifier), 167 (tool calls), 168 (repository), 169 (agents), 170 (the total's
 * fallback), 171/172 (the sessions card as a run switcher, no requirement tag when none exists), 173 (the right
 * column's four tiles in order), 174 (refresh from notifications, nothing while hidden — this component is mounted
 * only while shown) — and REQ-MONITOR-038 (the agent tree is the SAME component the Workspace sidebar uses).
 * Language from docs/design/system: Card, KPI, Tag, Status dot, Empty state; tokens by name.
 */
export const OVERVIEW_RIGHT_DEFAULT = 340;
export const OVERVIEW_RIGHT_MIN = 260;
export const OVERVIEW_RIGHT_MAX = 560;
export const OVERVIEW_LEFT_MIN = 320;

export interface OverviewProps {
  readonly session: SessionRecord | null;
  /** The label the sessions list gives the followed session (its first prompt); the id stands in until it is known. */
  readonly sessions: readonly SessionListItemPayload[];
  readonly sessionsState: 'idle' | 'loading' | 'error';
  readonly sessionsError?: string | null | undefined;
  /** null: not read yet. */
  readonly repository: RepositoryState | null;
  /** REQ-MONITOR-169: the configured delegation caps, from the configuration snapshot. */
  readonly caps: { readonly depth: number; readonly fanOut: number } | null;
  readonly layout: PaneLayout | undefined;
  readonly onLayout: (layout: PaneLayout) => void;
  readonly nowIso?: string | null | undefined;
  readonly onListSessions: () => void;
  /** REQ-SHELL-125: refused with its sentence while a run is active; the reason is shown under the header. */
  readonly onNewSession: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onContinueSession: (sessionId: string) => void;
  readonly onGoTo: (view: 'workspace' | 'mission' | 'library') => void;
  readonly reducedMotion?: boolean | undefined;
}

/** REQ-MONITOR-166: thousands-separated with the `tok` suffix; REQ-MONITOR-170: the aggregate total, else input + output. */
export function tokenTotal(session: Pick<SessionRecord, 'tokenUsage' | 'usageHistory'>): number {
  const last = session.usageHistory.at(-1);
  return last ? Math.max(last[1], session.tokenUsage.input + session.tokenUsage.output) : session.tokenUsage.input + session.tokenUsage.output;
}
export const formatTokens = (n: number): string => `${n.toLocaleString('en-US')} tok`;

/** REQ-MONITOR-171: the sessions card's runtime and the header's, `m:ss` or `h:mm:ss`. */
export function runElapsedLabel(startedAt: string | null, nowIso: string): string {
  if (!startedAt) return '';
  const ms = Math.max(0, new Date(nowIso).getTime() - new Date(startedAt).getTime());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** REQ-MONITOR-166: the sparkline's path over the samples; fewer than two is EMPTY, never a flat line. */
export function sparklinePath(samples: readonly (readonly [string, number])[], width: number, height: number): string | null {
  if (samples.length < 2) return null;
  const values = samples.map((s) => s[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (samples.length - 1);
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 2) - 1).toFixed(1)}`).join(' ');
}

/** REQ-MONITOR-169: waiting = waiting + queued; failed = failed + cancelled (+ blocked, which presents as failed). */
export function agentCounts(agents: readonly AgentRecord[]): { running: number; waiting: number; done: number; failed: number; depth: number } {
  const c = { running: 0, waiting: 0, done: 0, failed: 0, depth: 0 };
  for (const a of agents) {
    const p = presentationChildState(a.state);
    if (p === 'running') c.running += 1;
    else if (p === 'waiting' || p === 'queued') c.waiting += 1;
    else if (p === 'done') c.done += 1;
    else c.failed += 1;
    c.depth = Math.max(c.depth, a.depth);
  }
  return c;
}

/** REQ-MONITOR-171's dot: attached → run; background → informational; other busy → pulsing run; failed → failure; else idle. */
export function sessionDot(row: SessionListItemPayload, attached: boolean): { tone: 'run' | 'info' | 'fail' | 'idle'; pulse: boolean; text: string } {
  const p = presentationStatus(row.status);
  if (attached && isBusy(row.status)) return { tone: 'run', pulse: false, text: 'attached' };
  if (p === 'running') return { tone: 'info', pulse: false, text: 'background' };
  if (isBusy(row.status)) return { tone: 'run', pulse: true, text: STATUS_LABELS[p].toLowerCase() };
  if (p === 'failed') return { tone: 'fail', pulse: false, text: 'failed' };
  return { tone: 'idle', pulse: false, text: STATUS_LABELS[p].toLowerCase() };
}

/** REQ-MONITOR-165: the right column clamped to its bounds and the left column to its minimum. */
export function clampRight(right: number, containerWidth: number, dividerWidth = 8): number {
  const maxByLeft = containerWidth - OVERVIEW_LEFT_MIN - dividerWidth;
  return Math.round(Math.max(OVERVIEW_RIGHT_MIN, Math.min(OVERVIEW_RIGHT_MAX, right, Math.max(OVERVIEW_RIGHT_MIN, maxByLeft))));
}

function Card({ kicker, title, children, className = '', actions }: { kicker: string; title?: string | undefined; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`card ov-card ${className}`} aria-label={kicker}>
      <div className="ov-card__head">
        <span className="card-kicker">{kicker}</span>
        {actions}
      </div>
      {title && <h2 className="card-title ov-card__title">{title}</h2>}
      {children}
    </section>
  );
}

export function OverviewView(props: OverviewProps) {
  const { session, sessions, sessionsState, sessionsError = null, repository, caps, layout, onLayout, nowIso = null, reducedMotion = false } = props;
  const now = nowIso ?? new Date().toISOString();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [right, setRight] = useState<number>(() => layout?.sizes[1] ?? OVERVIEW_RIGHT_DEFAULT);
  // A layout arriving from the preference store (REQ-SHELL-069) replaces the split: derived during render, not in an effect.
  const [seenLayout, setSeenLayout] = useState(layout);
  if (seenLayout !== layout) { setSeenLayout(layout); if (layout) setRight(layout.sizes[1] ?? OVERVIEW_RIGHT_DEFAULT); }
  const commit = useCallback((value: number) => {
    const width = bodyRef.current?.clientWidth ?? 1280;
    const next = clampRight(value, width);
    setRight(next);
    onLayout({ version: 1, panes: 2, sizes: [Math.max(OVERVIEW_LEFT_MIN, width - next - 8), next] });
  }, [onLayout]);
  // The divider: pointer drag, and Left/Right/Home/End on the keyboard (REQ-SHELL-032's tab-stop rule applies to it too).
  const drag = useRef<{ startX: number; startRight: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startRight: right };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setRight(clampRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const value = clampRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280);
    drag.current = null;
    commit(value);
  };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(right + step); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commit(right - step); }
    else if (e.key === 'Home') { e.preventDefault(); commit(OVERVIEW_RIGHT_MAX); }
    else if (e.key === 'End') { e.preventDefault(); commit(OVERVIEW_RIGHT_MIN); }
  };

  const attachedRow = session ? sessions.find((s) => s.sessionId === session.id) ?? null : null;
  const headerLabel = session
    ? `session ${attachedRow?.label ?? session.id.slice(0, 8)} · ${STATUS_LABELS[presentationStatus(session.executionStatus)]} · ${runElapsedLabel(session.runStartedAt, isBusy(session.executionStatus) ? now : session.updatedAt) || '—'}`
    : 'No session is active';
  const empty = session === null && sessions.length === 0 && sessionsState !== 'loading';
  const counts = useMemo(() => agentCounts(session?.agents ?? []), [session]);
  const total = session ? tokenTotal(session) : 0;
  const path = useMemo(() => (session ? sparklinePath(session.usageHistory, 160, 36) : null), [session]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [newSessionError, setNewSessionError] = useState<string | null>(null);
  const newSession = async () => { const r = await props.onNewSession(); setNewSessionError(r.ok ? null : r.reason); };

  return (
    <div className="overview" data-testid="overview">
      <header className="overview__header page-header">
        <h1 className="display overview__title">Overview</h1>
        <span className="page-header-sub overview__session mono" data-testid="overview-session">{headerLabel}</span>
        <span className="overview__spacer" />
        <button type="button" className="btn btn-secondary" onClick={props.onListSessions}>List sessions</button>
        <button type="button" className="btn btn-primary" onClick={() => { void newSession(); }}>New session</button>
      </header>
      {newSessionError && <p className="overview__error" role="alert" data-testid="overview-new-session-error">{newSessionError}</p>}
      {empty ? (
        <div className="empty-state overview__empty" data-testid="overview-empty">
          <span className="empty-state-title">Nothing to show yet</span>
          <span className="empty-state-hint">Start a run from the Workspace view. Finished and suspended runs, their tokens, tool calls and agents will be summarised here.</span>
          <button type="button" className="btn btn-primary" onClick={() => props.onGoTo('workspace')}>Open Workspace</button>
        </div>
      ) : (
        <div className="overview__body" ref={bodyRef} style={{ gridTemplateColumns: `minmax(${OVERVIEW_LEFT_MIN}px, 1fr) 8px ${right}px` }}>
          <div className="overview__left">
            <div className="overview__metrics">
              <Card kicker="Tokens" className="ov-card--tokens">
                <div className="ov-kpi"><span className="kpi-value" data-testid="overview-tokens">{total.toLocaleString('en-US')}</span><span className="kpi-unit">tok</span></div>
                <svg className="ov-spark" viewBox="0 0 160 36" width="160" height="36" role="img" aria-label={path ? `token history, ${session?.usageHistory.length ?? 0} samples` : 'no token history yet'} data-samples={session?.usageHistory.length ?? 0}>
                  {path ? <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" /> : <line x1="0" y1="35" x2="160" y2="35" stroke="currentColor" strokeDasharray="2 3" opacity="0.5" />}
                </svg>
                <div className="card-meta"><span data-testid="overview-cost" data-qualifier={session?.costLabel.qualifier ?? 'unknown'}>{path ? '' : 'no history yet · '}{session?.costLabel.text ?? 'price not established'}</span></div>
              </Card>
              <Card kicker="Tool calls">
                <div className="ov-kpi"><span className="kpi-value" data-testid="overview-tool-calls">{session?.toolCalls.total ?? 0}</span></div>
                <div className="card-meta">across {session?.toolCalls.agents ?? 0} agent{(session?.toolCalls.agents ?? 0) === 1 ? '' : 's'}</div>
                <div className="ov-chips" data-testid="overview-tool-chips">
                  {(session?.toolCalls.byTool ?? []).slice(0, 5).map((t) => <span key={t.tool} className="tag tag-neutral mono">{t.tool} {t.count}</span>)}
                </div>
              </Card>
              <Card kicker="Repository">
                {repository === null ? <div className="card-body">Reading the repository…</div>
                  : !repository.gitAvailable ? <div className="card-body" data-testid="overview-repo-state">Git is not available on this machine.</div>
                    : !repository.isRepository ? <div className="card-body" data-testid="overview-repo-state">Not a Git repository.</div>
                      : (<>
                        <div className="ov-kpi mono" data-testid="overview-repo-counts"><span className="kpi-value">↑{repository.ahead}</span><span className="kpi-unit">ahead</span><span className="kpi-value">↓{repository.behind}</span><span className="kpi-unit">behind</span></div>
                        <div className="card-meta mono" data-testid="overview-repo-branch">{repository.base ?? 'no base'} → {repository.branch ?? '—'}</div>
                        <div className="card-meta">{repository.touched} file{repository.touched === 1 ? '' : 's'} touched · {repository.uncommitted} uncommitted{repository.failed.length > 0 ? ` · not read: ${repository.failed.join(', ')}` : ''}</div>
                      </>)}
              </Card>
              <Card kicker="Agents">
                <div className="ov-kpi"><span className="kpi-value" data-testid="overview-agent-count">{session?.agents.length ?? 0}</span></div>
                <div className="card-meta mono" data-testid="overview-agent-caps">depth {counts.depth} / {caps?.depth ?? '—'} · fan-out {counts.running} / {caps?.fanOut ?? '—'}</div>
                <div className="card-meta mono" data-testid="overview-agent-states">running {counts.running} · waiting {counts.waiting} · done {counts.done} · failed {counts.failed}</div>
              </Card>
            </div>
            <Card kicker="Sessions" className="ov-card--sessions" actions={<span className="card-meta">{sessions.length} listed</span>}>
              {sessionsState === 'loading' && sessions.length === 0 ? <div className="card-body">Loading sessions…</div>
                : sessionsState === 'error' ? <div className="card-body" role="alert">{sessionsError ?? 'The session list could not be loaded.'}</div>
                  : sessions.length === 0 ? <div className="card-body" data-testid="overview-sessions-empty">Finished and suspended runs will be listed here once they exist.</div>
                    : (
                      <ul className="ov-sessions" data-testid="overview-sessions">
                        {sessions.map((row) => {
                          const attached = session?.id === row.sessionId;
                          const dot = sessionDot(row, attached);
                          return (
                            <li key={row.sessionId} className="ov-session" data-session={row.sessionId} data-busy={row.busy ? '1' : '0'}>
                              <span className={`status-dot ov-dot ov-dot--${dot.tone}${dot.pulse && !reducedMotion ? ' is-pulsing' : ''}`} aria-hidden="true" />
                              <span className="visually-hidden">{dot.text}</span>
                              <button type="button" className="btn btn-link ov-session__name" title={`${row.sessionId}${row.requirementId ? ` · ${row.requirementId}` : ''}`} onClick={() => props.onOpenSession(row.sessionId)}>{row.label}</button>
                              {row.requirementId && <span className="tag tag-outline">{row.requirementId}</span>}
                              {attached && <span className="tag tag-accent" data-testid="overview-focused">focused</span>}
                              <span className="ov-session__detail text-secondary">{row.detail}</span>
                              {!row.busy && <button type="button" className="btn btn-link" onClick={() => props.onContinueSession(row.sessionId)}>Continue run</button>}
                              <span className="ov-session__meta mono">{row.branch} · {formatTokens(row.tokens)} · {row.durationLabel || '—'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
            </Card>
          </div>
          <div className="overview__divider" role="separator" aria-orientation="vertical" aria-label="Resize the right column" aria-valuemin={OVERVIEW_RIGHT_MIN} aria-valuemax={OVERVIEW_RIGHT_MAX} aria-valuenow={right} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onDividerKey} data-testid="overview-divider" />
          <aside className="overview__right" style={{ width: right }}>
            <Card kicker="Cloud credit" className="ov-card--credit">
              <div className="ov-kpi"><span className="kpi-value">—</span><span className="kpi-unit">credit</span></div>
              <div className="card-meta">No hosted account is connected in this build; a balance appears here once one is.</div>
            </Card>
            <Card kicker="Subscription limits">
              <div className="card-body">No usage figures for the signed-in providers yet.</div>
            </Card>
            <Card kicker="Agents" className="ov-card--tree" actions={<button type="button" className="btn btn-link" onClick={() => props.onGoTo('mission')}>Open Mission</button>}>
              <AgentTree agents={session?.agents ?? []} selected={selectedAgent} onSelect={setSelectedAgent} nowIso={nowIso} />
            </Card>
            <Card kicker="Improvement proposals" actions={<span className="tag tag-neutral">0 pending</span>}>
              <div className="card-body">No proposals exist yet. <button type="button" className="btn btn-link" onClick={() => props.onGoTo('library')}>Open Library</button></div>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
