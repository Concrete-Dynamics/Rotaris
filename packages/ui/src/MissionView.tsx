import { useState } from 'react';
import { DELEGATION_STRATEGY_NAMES, isBusy, presentationStatus, RUN_AGENT_ID, STATUS_LABELS, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';
import { AgentTree } from './AgentTree.js';
import { CANCEL_RUN_TEXT, cancelCascade, cancelOffered, cascadeNote, pauseAvailability } from './agents.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, PageHeader as DesignPageHeader, Select as DesignSelect } from './design-system/index.js';

/**
 * REQ-SHELL-023's third view, Mission (Part R; REQ-MONITOR-274..276, 038, 042, 043, 107, 116, 213, 273, 281,
 * REQ-CONFIG-321, REQ-CONFIG-112). No design exists for it (docs/design/README.md §3.2): the page-header pattern,
 * cards, the table and the chips of the adopted language, the same `AgentTree` the Workspace sidebar and the
 * Overview card draw (038 — parity by construction, one replica). The header; the delegation graph in a card with
 * an explicit, selectable "Run" row above the tree (the tree never selects the synthetic root, 043, and pause is
 * valid for the run-level selection only, 274/276); under it Pause with its availability explanation as text
 * (273) and Cancel selection marked destructive and confirmed naming the agent with the cascade count (055/064);
 * the strategy selector with exactly `orchestrator`, `swarm`, `single` and the depth control bound to
 * `runtime.max_depth`, both the settings' own values written through the per-field path and effective from the
 * next run (275); the activity table (274/116/281). A pause with any other selection is refused HERE, with the
 * text, and no control is sent (276).
 */
export interface MissionViewProps {
  readonly session: SessionRecord | null;
  readonly sessionLabel: string | null;
  readonly runLevel: AgentRecord | null;
  readonly selectedAgentId: string | null;
  readonly onSelect: (id: string | null, source?: 'click' | 'key') => void;
  readonly nowIso: string | null;
  readonly strategy: string | null;
  readonly maxDepth: number | null;
  readonly onSetStrategy: (value: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onSetDepth: (value: number) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onPause: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onCancelAgent: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onCancelRun: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onOpen: (agent: AgentRecord) => void;
  readonly onPopOut: (agent: AgentRecord) => void;
  /** Verification: the last publication's apply-to-paint time and the agent count it carried, exposed as data attributes for the proof. */
  readonly refresh?: { readonly ms: number; readonly agents: number } | null | undefined;
}

export const STRATEGY_NOTE = 'A change takes effect on the next run.';

/**
 * REQ-MONITOR-055/064: the Mission view's confirmation of one agent's cancel names it, its persona and what cascades. A
 * paused child is final and says so, and counts its paused descendants (PD-ORCH-005 clauses 3 and 16, OQ-74).
 */
export function missionCancelBody(agent: Pick<AgentRecord, 'name' | 'persona' | 'presentationState'>, cascade: number): string {
  const paused = agent.presentationState === 'paused';
  return `${agent.name} (${agent.persona}) will be cancelled${paused ? ' and will not resume' : ''}. ${cascadeNote(cascade, paused) || 'Nothing cascades.'}`;
}

export function MissionView(props: MissionViewProps) {
  const { session, sessionLabel, runLevel, selectedAgentId, onSelect, nowIso, strategy, maxDepth, onSetStrategy, onSetDepth, onPause, onCancelAgent, onCancelRun, onOpen, onPopOut, refresh = null } = props;
  const agents = session?.agents ?? [];
  const runActive = session !== null && isBusy(session.executionStatus);
  const pause = pauseAvailability(selectedAgentId, runActive, session?.executionStatus ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ agent: AgentRecord; cascade: AgentRecord[] } | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const selectedAgent = selectedAgentId === RUN_AGENT_ID ? runLevel : agents.find((a) => a.id === selectedAgentId) ?? null;
  // PD-ORCH-005 clause 16: a paused child is cancellable while its session rests (OQ-74); the run and a live agent while the run is active.
  const cancelable = selectedAgent !== null && (selectedAgent.id === RUN_AGENT_ID ? runActive && selectedAgent.presentationState !== 'paused' : cancelOffered(selectedAgent, runActive));
  const requestPause = async () => {
    // REQ-MONITOR-276: refused client-side with the explanation; the control is never sent.
    if (!pause.enabled) { setMessage(pause.reason); return; }
    setMessage(null);
    const r = await onPause();
    if (r.ok) { setPausePending(true); setMessage('Pause accepted: the current step finishes first.'); } else setError(r.reason);
  };
  const confirmCancel = async () => {
    if (!confirming) return;
    const target = confirming.agent;
    setConfirming(null);
    const r = target.id === RUN_AGENT_ID ? await onCancelRun() : await onCancelAgent(target.id);
    setError(r.ok ? null : r.reason);
  };
  const subtitle = session ? `delegation tree · ${sessionLabel ?? session.id.slice(0, 8)} · ${STATUS_LABELS[presentationStatus(session.executionStatus)]}` : 'No session is active.';
  return (
    <div className="mission" data-testid="mission" data-refresh-ms={refresh ? refresh.ms.toFixed(1) : ''} data-refresh-agents={refresh ? String(refresh.agents) : ''} data-selected={selectedAgentId ?? ''}>
      <DesignPageHeader className="mission__header page-header">
        <h1 className="display mission__title">Mission</h1>
        <span className="page-header-sub mission__subtitle mono" data-testid="mission-subtitle">{subtitle}</span>
      </DesignPageHeader>
      <div className="mission__body">
        <section className="card mission__graph" aria-label="Delegation graph" data-testid="mission-graph">
          <div className="ov-card__head"><span className="card-kicker">Delegation graph</span><span className="card-meta">{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</span></div>
          <div className={`mission__run-row${selectedAgentId === RUN_AGENT_ID ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-pressed={selectedAgentId === RUN_AGENT_ID} data-testid="mission-run-row"
            title={runLevel ? `The run: ${runLevel.persona} at depth 0. Select it to pause or cancel the whole run.` : 'No run has started.'}
            onClick={() => onSelect(RUN_AGENT_ID, 'click')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(RUN_AGENT_ID, 'key'); } }}>
            <span ref={(element) => { if (element && runActive) markMotionStart(element); }} className={`agent-row__dot agent-row__dot--${runLevel?.presentationState ?? 'idle'}`} aria-hidden="true" />
            <span className="mission__run-label">Run{runLevel ? ` · ${runLevel.persona}` : ''}</span>
            <span className="mission__run-state mono text-secondary">{session ? STATUS_LABELS[presentationStatus(session.executionStatus)] : 'no session'}</span>
          </div>
          <AgentTree agents={agents} selected={selectedAgentId} onSelect={onSelect} nowIso={nowIso} />
          <div className="mission__actions" aria-label="Selection actions">
            <DesignButton type="button" className="btn btn-secondary" aria-disabled={!pause.enabled || pausePending} aria-describedby="mission-pause-reason" data-testid="mission-pause" data-enabled={pause.enabled && !pausePending ? '1' : '0'} onClick={() => { void requestPause(); }}>{pausePending || session?.executionStatus === 'pausing' ? 'Pausing…' : 'Pause'}</DesignButton>
            <span id="mission-pause-reason" className="text-secondary mission__reason" data-testid="mission-pause-reason">{pause.reason}</span>
            <DesignButton type="button" className="btn btn-danger" disabled={!cancelable} data-testid="mission-cancel" title={cancelable ? `Cancel ${selectedAgent?.name ?? ''}` : 'Select a live agent, a paused one, or the run to cancel it.'} onClick={() => { if (selectedAgent) setConfirming({ agent: selectedAgent, cascade: cancelCascade(agents, selectedAgent) }); }}>Cancel selection</DesignButton>
            {selectedAgent && <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="mission-open" onClick={() => onOpen(selectedAgent)}>Open {selectedAgent.name}</DesignButton>}
          </div>
          {message && <div className="composer__hint mission__message" role="status" data-testid="mission-message">{message}</div>}
          {error && <div className="composer__error" role="alert">{error}</div>}
        </section>
        <section className="card mission__settings" aria-label="Delegation settings" data-testid="mission-settings">
          <div className="ov-card__head"><span className="card-kicker">Delegation settings</span><span className="card-meta">{STRATEGY_NOTE}</span></div>
          <div className="mission__setting">
            <label htmlFor="mission-strategy">Strategy</label>
            <DesignSelect id="mission-strategy" className="input select" aria-label="Delegation strategy" data-testid="mission-strategy" value={strategy ?? ''} disabled={strategy === null} onChange={(e) => { void onSetStrategy(e.currentTarget.value).then((r) => setError(r.ok ? null : r.reason)); }}>
              {strategy === null && <option value="">—</option>}
              {DELEGATION_STRATEGY_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </DesignSelect>
            <span className="text-secondary settings__hint">Stored as rotaris.delegation_strategy.</span>
          </div>
          <div className="mission__setting">
            <label htmlFor="mission-depth">Maximum depth</label>
            <DesignSelect id="mission-depth" className="input select" aria-label="Maximum delegation depth" data-testid="mission-depth" value={maxDepth === null ? '' : String(maxDepth)} disabled={maxDepth === null} onChange={(e) => { void onSetDepth(Number(e.currentTarget.value)).then((r) => setError(r.ok ? null : r.reason)); }}>
              {maxDepth === null && <option value="">—</option>}
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </DesignSelect>
            <span className="text-secondary settings__hint">Stored as runtime.max_depth; at least 1.</span>
          </div>
        </section>
        <section className="card mission__table" aria-label="Agent activity" data-testid="mission-table">
          <div className="ov-card__head"><span className="card-kicker">Agent activity</span>{refresh && <span className="card-meta mono" data-testid="mission-refresh">last refresh {refresh.ms.toFixed(1)} ms · {refresh.agents} agents</span>}</div>
          <AgentTable agents={agents} selected={selectedAgentId} nowIso={nowIso} onSelect={(id) => onSelect(id, 'click')} onOpen={onOpen} onPopOut={onPopOut} />
        </section>
      </div>
      {confirming && (
        <ConfirmDialog
          title={confirming.agent.id === RUN_AGENT_ID ? 'Cancel the run?' : `Cancel ${confirming.agent.name}?`}
          body={confirming.agent.id === RUN_AGENT_ID ? CANCEL_RUN_TEXT : missionCancelBody(confirming.agent, confirming.cascade.length)}
          lines={confirming.cascade.map((a) => a.name)} confirmLabel={confirming.agent.id === RUN_AGENT_ID ? 'Cancel the run' : `Cancel ${confirming.agent.name}`} cancelLabel={confirming.agent.presentationState === 'paused' ? 'Keep it paused' : 'Keep running'} destructive
          onConfirm={() => { void confirmCancel(); }} onCancel={() => setConfirming(null)} testId="mission-confirm"
        />
      )}
    </div>
  );
}
