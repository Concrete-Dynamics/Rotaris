import { useState } from 'react';
import { DELEGATION_STRATEGY_NAMES, isBusy, presentationStatus, RUN_AGENT_ID, STATUS_LABELS, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';
import { AgentTree } from './AgentTree.js';
import { CANCEL_RUN_TEXT, cancelCascade, cancelConfirmation, cancelOffered, cancelUnavailableReason, cascadeNote, pauseAvailability } from './agents.js';
import { RUN_STATE_LABELS } from './composer.js';
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
  /**
   * PD-ORCH-005 clause 16 (OQ-101): the session rests with an iteration open (`runLevelResting`, asked by the caller, which
   * alone knows REQ-CHAT-008's recovery state) — when a `paused` child offers "Cancel selection".
   */
  readonly resting: boolean;
  /**
   * REQ-CHAT-008's recovery state (PD-ORCH-005 clause 13, OQ-100): the persisted status reads busy but no run is under way
   * here, so the run is not active — no Pause and no live Cancel beside a run-level agent drawn `paused`, as the Workspace
   * reads `runActive`.
   */
  readonly recovery: boolean;
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
 * paused child is final and says so, and counts its paused descendants (PD-ORCH-005 clauses 3 and 16, OQ-101); a live
 * one counts the paused descendants its cancel also ends (clause 13, OQ-100).
 */
export function missionCancelBody(agent: Pick<AgentRecord, 'name' | 'persona' | 'presentationState'>, cascade: readonly Pick<AgentRecord, 'presentationState'>[]): string {
  const paused = agent.presentationState === 'paused';
  return `${agent.name} (${agent.persona}) will be cancelled${paused ? ' and will not resume' : ''}. ${cascadeNote(cascade) || 'Nothing cascades.'}`;
}

/**
 * REQ-MONITOR-055/126/128: what the Mission view's confirmation states for the agent it cancels — the run's own final
 * cancel, or one agent named with its persona and one line per agent cancelled with it. The title and both buttons are
 * `cancelConfirmation`'s, so the dismissal reads as every other surface's — "Keep it paused" for a paused child
 * (PD-ORCH-005 clause 16, OQ-101), "Keep running" otherwise.
 */
export function missionConfirmation(agent: AgentRecord, cascade: readonly AgentRecord[], agents: readonly AgentRecord[]): { title: string; body: string; lines: string[]; confirmLabel: string; cancelLabel: string } {
  const shared = cancelConfirmation(agent, agents);
  return { ...shared, body: agent.id === RUN_AGENT_ID ? CANCEL_RUN_TEXT : missionCancelBody(agent, cascade), lines: cascade.map((a) => a.name) };
}

export function MissionView(props: MissionViewProps) {
  const { session, sessionLabel, runLevel, resting, recovery, selectedAgentId, onSelect, nowIso, strategy, maxDepth, onSetStrategy, onSetDepth, onPause, onCancelAgent, onCancelRun, onOpen, onPopOut, refresh = null } = props;
  const agents = session?.agents ?? [];
  // PD-ORCH-005 clause 13 (OQ-100): a busy status in REQ-CHAT-008's recovery state is no active run (the Workspace's reading).
  const runActive = session !== null && isBusy(session.executionStatus) && !recovery;
  const pause = pauseAvailability(selectedAgentId, runActive, session?.executionStatus ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ agent: AgentRecord; cascade: AgentRecord[] } | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const selectedAgent = selectedAgentId === RUN_AGENT_ID ? runLevel : agents.find((a) => a.id === selectedAgentId) ?? null;
  // PD-ORCH-005 clause 16: a paused child is cancellable while its session rests (OQ-101); the run and a live agent while
  // the run is active — never the run-level agent presenting `paused`, which in REQ-CHAT-008's recovery state is a run the
  // persisted status still calls busy (clause 13, OQ-100).
  const cancelable = cancelOffered(selectedAgent, runActive, resting);
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
  // REQ-CHAT-008: a busy status with no run here reads as the recovery state, as the Workspace's run header reads it, never
  // as running beside a run-level agent drawn `paused` (PD-ORCH-005 clause 13, OQ-100).
  const statusLabel = session === null ? null : recovery && isBusy(session.executionStatus) ? RUN_STATE_LABELS.recovery : STATUS_LABELS[presentationStatus(session.executionStatus)];
  const subtitle = session ? `delegation tree · ${sessionLabel ?? session.id.slice(0, 8)} · ${statusLabel}` : 'No session is active.';
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
            <span className="mission__run-state mono text-secondary">{statusLabel ?? 'no session'}</span>
          </div>
          <AgentTree agents={agents} selected={selectedAgentId} onSelect={onSelect} nowIso={nowIso} />
          <div className="mission__actions" aria-label="Selection actions">
            <DesignButton type="button" className="btn btn-secondary" aria-disabled={!pause.enabled || pausePending} aria-describedby="mission-pause-reason" data-testid="mission-pause" data-enabled={pause.enabled && !pausePending ? '1' : '0'} onClick={() => { void requestPause(); }}>{pausePending || session?.executionStatus === 'pausing' ? 'Pausing…' : 'Pause'}</DesignButton>
            <span id="mission-pause-reason" className="text-secondary mission__reason" data-testid="mission-pause-reason">{pause.reason}</span>
            <DesignButton type="button" className="btn btn-danger" disabled={!cancelable} data-testid="mission-cancel" title={cancelable ? `Cancel ${selectedAgent?.name ?? ''}` : cancelUnavailableReason(selectedAgent)} onClick={() => { if (selectedAgent) setConfirming({ agent: selectedAgent, cascade: cancelCascade(agents, selectedAgent) }); }}>Cancel selection</DesignButton>
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
          {...missionConfirmation(confirming.agent, confirming.cascade, agents)} destructive
          onConfirm={() => { void confirmCancel(); }} onCancel={() => setConfirming(null)} testId="mission-confirm"
        />
      )}
    </div>
  );
}
