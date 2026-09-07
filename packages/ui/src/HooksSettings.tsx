import type { HookAgentId, HookRow, HooksSummary } from '@rotaris/contracts';

/**
 * Settings → Hooks (REQ-HOOKS-103..105, REQ-HOOKS-109, REQ-HOOKS-136, REQ-HOOKS-137; REQ-CONFIG-354..359):
 * the hierarchical `Lifecycle hooks` table — one row per owning agent, that agent's hooks beneath —
 * with name, event, matcher, source and status; the trust summary in the closed four-statement
 * vocabulary (REQ-NOTIFY-227/228); the review, clear and re-read controls; the invocations of the
 * session being looked at. No command text anywhere on this surface (REQ-HOOKS-102, REQ-CONFIG-355):
 * the review dialog the user opens is the only place one is displayed. Structure from the
 * specification; language from the design system (`.table`, `.tag-*`, `.empty-state`, `.btn-*`).
 */
export interface HooksSettingsProps {
  readonly summary: HooksSummary | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
  readonly onReview: () => void;
  readonly onClear: () => void;
  readonly onToggle: (agent: HookAgentId, hookId: string | null, on: boolean) => void;
}

const AGENT_LABELS: Record<HookAgentId, string> = { rotaris: 'Rotaris', 'claude-code': 'Claude Code' };
const STATUS_TAG: Record<HookRow['status'], string> = { superseded: 'tag-neutral', inactive: 'tag-neutral', 'disabled by agent': 'tag-outline', disabled: 'tag-outline', 'blocked — not reviewed': 'tag-wait', active: 'tag-done' };

/** REQ-NOTIFY-227: exactly one of the four statements. */
export function trustStatement(s: HooksSummary): string {
  const n = s.declaredCount;
  const hooks = n === 1 ? '1 hook' : `${n} hooks`;
  switch (s.status) {
    case 'none': return 'This workspace declares no hooks of its own.';
    case 'review': return `This workspace declares ${hooks} that ${n === 1 ? 'has' : 'have'} not been reviewed. Workspace hooks stay skipped until you review and allow them.`;
    case 'trusted': return `This workspace's ${hooks} ${n === 1 ? 'has' : 'have'} been reviewed and allowed.`;
    case 'refused': return `This workspace's ${hooks} ${n === 1 ? 'has' : 'have'} been reviewed and will not run.`;
  }
}

export function HooksSettings({ summary, loading, error, onRefresh, onReview, onClear, onToggle }: HooksSettingsProps) {
  const agents: HookAgentId[] = ['rotaris', 'claude-code'];
  return (
    <div className="settings__section hooks">
      <h1 className="display">Hooks</h1>
      <p className="text-secondary">Processes started by a hook can survive its timeout and application exit. Hook timeout handling stops the hook's own process and bounds output collection. Terminal-tool process trees follow the terminal cleanup policy.</p>
      <p className="text-secondary">
        A hook is a shell command of your own that runs at a named point of a run — around tool calls and at session, iteration, child-agent and verifier
        boundaries. It runs on this machine under your own account and is not subject to the agent permission policy. Hooks are declared in
        <code className="mono"> agents.yaml</code>; this screen switches them on and off and decides whether a workspace's hooks may run — it does not author them.
      </p>
      {error && <div className="composer__error" role="alert">{error}</div>}
      {summary?.loadError ? <div className="composer__error" role="alert">The hook configuration could not be read: {summary.loadError}</div> : null}

      <h2 className="settings__heading">Workspace trust</h2>
      {summary ? (
        <>
          <p className="hooks__summary" data-status={summary.status}>{trustStatement(summary)}</p>
          {summary.status === 'review' && (
            <div className="notice notice--warning hooks__pending" role="status">
              <span className="notice__glyph" aria-hidden="true">!</span>
              <div className="notice__text"><span className="notice__headline">Unreviewed workspace hooks</span><span className="text-secondary">Workspace hooks run shell commands supplied by the repository's own authors. Review them to decide.</span></div>
            </div>
          )}
          <div className="settings__actions hooks__actions">
            <div className="settings__action">
              <button type="button" className="btn btn-primary" disabled={loading || summary.declaredCount === 0} onClick={onReview} aria-description="Opens a dialog showing each command this workspace declares, to allow or refuse them.">Review workspace hooks…</button>
              <span className="text-secondary settings__hint">{summary.declaredCount === 0 ? 'Nothing to review: this workspace declares no hooks.' : 'The only place a hook command is shown.'}</span>
            </div>
            {summary.decisionStored && (
              <div className="settings__action">
                <button type="button" className="btn btn-secondary" disabled={loading} onClick={onClear} aria-description="Removes the stored decision; the workspace's hooks stay withheld until allowed again.">Clear the stored decision</button>
                <span className="text-secondary settings__hint">Re-applies the gate at once; the hooks stay withheld until you allow them again.</span>
              </div>
            )}
            <div className="settings__action">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={onRefresh} aria-description="Re-reads the hook sources and redraws this table; starts no hook and changes no decision.">{loading ? 'Reading…' : 'Re-read hook sources'}</button>
              <span className="text-secondary settings__hint">Starts no hook and changes no decision; governs runs started afterwards.</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-secondary">{loading ? 'Reading the hook sources…' : 'Open a workspace to see its hooks.'}</p>
      )}

      <h2 className="settings__heading">Lifecycle hooks</h2>
      {summary && summary.rows.length > 0 ? (
        <table className="table hooks__table" aria-label="Lifecycle hooks" role="treegrid">
          <thead>
            <tr><th scope="col">Hook</th><th scope="col">Event</th><th scope="col">Matches</th><th scope="col">Source</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const rows = summary.rows.filter((r) => r.agent === agent);
              if (rows.length === 0 && agent === 'claude-code') return null;
              const agentChecked = rows.every((r) => !r.checkable || r.checked) && rows.some((r) => r.checkable);
              return [
                <tr key={agent} className="hooks__agent" role="row" aria-level={1} aria-expanded="true">
                  <td>
                    <label className="hooks__check">
                      <input type="checkbox" checked={rows.length === 0 ? true : agentChecked} disabled={rows.length === 0} onChange={(e) => onToggle(agent, null, e.currentTarget.checked)} title={`Controls ${AGENT_LABELS[agent]}'s hooks for future sessions.`} aria-label={`${AGENT_LABELS[agent]} hooks, for future sessions`} />
                      <strong>{AGENT_LABELS[agent]}</strong>
                    </label>
                  </td>
                  <td /><td /><td className="text-secondary">Global runtime policy</td><td />
                </tr>,
                ...rows.map((r) => (
                  <tr key={r.id} className="hooks__row" role="row" aria-level={2}>
                    <td className="hooks__name">
                      {r.checkable ? (
                        <label className="hooks__check">
                          <input type="checkbox" checked={r.checked} onChange={(e) => onToggle(agent, r.id, e.currentTarget.checked)} title="Takes effect for runs started afterwards; the run already executing keeps its hook set." aria-label={`${r.name}, for future sessions`} />
                          <span>{r.name}</span>
                        </label>
                      ) : <span className="hooks__name--static">{r.name}</span>}
                    </td>
                    <td className="mono">{r.event}</td>
                    <td className="mono">{r.matcher === '' ? <span className="text-secondary">every matching call</span> : r.matcher}</td>
                    <td className="text-secondary">{r.sourceLabel}</td>
                    <td><span className={`tag ${STATUS_TAG[r.status]}`} title={r.statusReason} aria-description={r.statusReason}>{r.status}</span></td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <span className="empty-state-title">No hooks are declared.</span>
          <span className="empty-state-hint">Declare them under <code className="mono">hooks:</code> in your global <code className="mono">agents.yaml</code> or in this workspace's <code className="mono">.rotaris/agents.yaml</code>.</span>
        </div>
      )}
      <p className="text-secondary settings__hint">A checkbox cleared here takes effect for runs started afterwards; a run already executing keeps the hook set it started with.</p>

      <h2 className="settings__heading">Invocations in this session</h2>
      {summary && summary.invocations.length > 0 ? (
        <ol className="hooks__invocations">
          {summary.invocations.map((inv, i) => (
            <li key={`${inv.hookId}-${i}`} className="hooks__invocation">
              <div className="hooks__invocation-head">
                <span className="hooks__invocation-name">{inv.name}</span>
                <span className="mono text-secondary">{inv.event}{inv.toolName ? ` · ${inv.toolName}` : ''}</span>
                {inv.withheld ? <span className="tag tag-wait">withheld: {inv.reason}</span> : (
                  <>
                    <span className="mono text-secondary">exit {inv.exitCode} · {inv.durationMs} ms</span>
                    {inv.timedOut && <span className="tag tag-fail">timed out</span>}
                    {inv.blocked && <span className="tag tag-run">stopped the call</span>}
                    {inv.switchedOff && <span className="tag tag-neutral">switched off after this</span>}
                  </>
                )}
              </div>
              {(inv.stdout !== '' || inv.stderr !== '') && (
                <details className="hooks__output">
                  <summary>Output</summary>
                  {inv.stdout !== '' && <pre className="mono hooks__stream" aria-label="standard output">{inv.stdout}</pre>}
                  {inv.stderr !== '' && <pre className="mono hooks__stream hooks__stream--err" aria-label="standard error">{inv.stderr}</pre>}
                </details>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state"><span className="empty-state-title">No hook has run in this session.</span><span className="empty-state-hint">Invocations appear here as they happen, with their exit status, duration and captured output.</span></div>
      )}
    </div>
  );
}
