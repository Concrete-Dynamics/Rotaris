import { useState } from 'react';
import { isBusy, presentationStatus, RUN_AGENT_ID, STATUS_LABELS, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';
import { AgentTree } from './AgentTree.js';
import { agentDotState, CANCEL_RUN_TEXT, cancelCascade, cancelConfirmation, cancelOffered, cancelUnavailableReason, cascadeKind, cascadeNote, PAUSED_CANCEL_ALONE, pauseAvailability, pausedCancelWith } from './agents.js';
import { pausePendingAfter, RUN_STATE_LABELS, type PauseScope } from './composer.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, Card as DesignCard, layoutContractAttributes, StatusDot as DesignStatusDot, type UiLayoutContract } from './design-system/index.js';

/**
 * PD-MONITOR-009: the Overview's two delegation cards — what REQ-MONITOR-274 to -276 gave a mission view, which
 * PD-SHELL-015 no longer makes a primary view (Part R built it as one; REQ-MONITOR-038, 042, 043, 107, 116, 213, 273, 281).
 * `mission` stays the prefix of their classes and test ids: REQ-MONITOR-213 calls this graph the mission graph, and the
 * proof that measures the cards is `pnpm mission-proof`.
 *
 * `DelegationGraphCard` (clause 2) leads the Overview's right column: an explicit, selectable "Run" row above the tree (the
 * tree never selects the synthetic root, 043, and pause is valid for the run-level selection only, 274/276); the same
 * `AgentTree` the Workspace sidebar draws (038 — parity by construction, one replica); under it Pause with its availability
 * explanation as text (273) and Cancel selection marked destructive and confirmed naming the agent with the cascade count
 * (055/064). A pause with any other selection is refused HERE, with the text, and no control is sent (276). Its last line
 * shows the delegation strategy the next run takes and leads to its one editor, Settings › Runtime (clause 6: the selector
 * and the depth control REQ-MONITOR-275 put on a monitoring view are drawn on none).
 *
 * `AgentActivityCard` (clause 3) stands in the left column under the metric cards: the activity table (274/116/281), which
 * gives way to more lines a row where the card is narrow and drops no value (`shell.css`, `.mission__table`).
 */
export interface DelegationProps {
  readonly session: SessionRecord | null;
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
  /** REQ-MONITOR-042: the one shared selection, the Workspace sidebar's and the inspector's too. */
  readonly selectedAgentId: string | null;
  readonly onSelect: (id: string | null, source?: 'click' | 'key') => void;
  readonly nowIso: string | null;
  /** PD-MONITOR-009 clause 6: the configured strategy, shown and never edited here; null until the configuration is read. */
  readonly strategy: string | null;
  /** PD-MONITOR-009 clause 6: opens the strategy's and the depth cap's one editor, the Settings view's Runtime category. */
  readonly onOpenRuntimeSettings: () => void;
  readonly onPause: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onCancelAgent: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onCancelRun: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onOpen: (agent: AgentRecord) => void;
  readonly onPopOut: (agent: AgentRecord) => void;
  /** Verification: the last publication's apply-to-paint time and the agent count it carried, exposed as data attributes for the proof. */
  readonly refresh?: { readonly ms: number; readonly agents: number } | null | undefined;
}

/** PD-MONITOR-009 clause 6: the graph card's last line, and the control that leads to the editor. */
export const NEXT_RUN_STRATEGY_PREFIX = 'Next run: strategy';
export const OPEN_RUNTIME_SETTINGS = 'Open Runtime settings';

/**
 * REQ-MONITOR-055/064: the graph card's confirmation of one agent's cancel names it, its persona and what cascades; a
 * live one counts the paused descendants its cancel also ends (clause 13, OQ-100). A paused child's cancel is final
 * (PD-ORCH-005 clauses 3 and 16, OQ-101), and the card says so in the words the Workspace and a persona window
 * use (`pausedCancelWith`, `PAUSED_CANCEL_ALONE`) — before, it read only "will be cancelled and will not resume", leaving
 * out that the cancel cannot be undone. The lines under the body name each descendant cancelled with it (REQ-MONITOR-128).
 */
export function missionCancelBody(agent: Pick<AgentRecord, 'name' | 'persona' | 'presentationState'>, cascade: readonly Pick<AgentRecord, 'presentationState'>[]): string {
  if (agent.presentationState === 'paused') return `${agent.name} (${agent.persona}) will be cancelled. ${cascade.length > 0 ? pausedCancelWith(cascadeKind(cascade)) : PAUSED_CANCEL_ALONE}`;
  return `${agent.name} (${agent.persona}) will be cancelled. ${cascadeNote(cascade) || 'Nothing cascades.'}`;
}

/**
 * REQ-MONITOR-055/126/128: what the graph card's confirmation states for the agent it cancels — the run's own final
 * cancel, or one agent named with its persona and one line per agent cancelled with it. The title and both buttons are
 * `cancelConfirmation`'s, so the dismissal reads as every other surface's — "Keep it paused" for a paused child
 * (PD-ORCH-005 clause 16, OQ-101), "Keep running" otherwise.
 */
export function missionConfirmation(agent: AgentRecord, cascade: readonly AgentRecord[], agents: readonly AgentRecord[]): { title: string; body: string; lines: string[]; confirmLabel: string; cancelLabel: string } {
  const shared = cancelConfirmation(agent, agents);
  return { ...shared, body: agent.id === RUN_AGENT_ID ? CANCEL_RUN_TEXT : missionCancelBody(agent, cascade), lines: cascade.map((a) => a.name) };
}

export function DelegationGraphCard(props: DelegationProps & { readonly kickerUi?: UiLayoutContract | undefined; readonly runDotUi?: UiLayoutContract | undefined }) {
  const { session, runLevel, resting, recovery, selectedAgentId, onSelect, nowIso, strategy, onOpenRuntimeSettings, onPause, onCancelAgent, onCancelRun, onOpen, kickerUi, runDotUi } = props;
  const agents = session?.agents ?? [];
  // PD-ORCH-005 clause 13 (OQ-100): a busy status in REQ-CHAT-008's recovery state is no active run (the Workspace's reading).
  const runActive = session !== null && isBusy(session.executionStatus) && !recovery;
  const pause = pauseAvailability(selectedAgentId, runActive, session?.executionStatus ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ agent: AgentRecord; cascade: AgentRecord[] } | null>(null);
  const [pausePending, setPausePending] = useState(false);
  // REQ-MONITOR-296: the accepted pause's pending mark belongs to the run that accepted it and ends when that run leaves
  // the busy states (REQ-NOTIFY-050) or another session is shown — the composer's rule (`pausePendingAfter`), derived during
  // render from the scope last seen as the Workspace derives it. Never cleared, the view read `Pausing…` beside a session
  // at rest `paused` for as long as it stayed mounted.
  const pauseScope: PauseScope = { sessionId: session?.id ?? null, busy: session !== null && isBusy(session.executionStatus) };
  const [pauseScopeSeen, setPauseScopeSeen] = useState<PauseScope>(pauseScope);
  if (pauseScopeSeen.sessionId !== pauseScope.sessionId || pauseScopeSeen.busy !== pauseScope.busy) {
    setPauseScopeSeen(pauseScope);
    if (pausePending && !pausePendingAfter(pausePending, pauseScopeSeen, pauseScope)) setPausePending(false);
  }
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
  return (
    <DesignCard className="card ov-card mission__graph" role="region" aria-label="Delegation graph" data-testid="mission-graph" data-selected={selectedAgentId ?? ''}>
      <div className="ov-card__head"><span className="card-kicker" {...layoutContractAttributes(kickerUi)}>Delegation graph</span><span className="card-meta"><span><span className="mono">{agents.length}</span> {agents.length === 1 ? 'agent' : 'agents'}</span></span></div>
      <div className={`mission__run-row${selectedAgentId === RUN_AGENT_ID ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-pressed={selectedAgentId === RUN_AGENT_ID} data-testid="mission-run-row"
        title={runLevel ? `The run: ${runLevel.persona} at depth 0. Select it to pause or cancel the whole run.` : 'No run has started.'}
        onClick={() => onSelect(RUN_AGENT_ID, 'click')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(RUN_AGENT_ID, 'key'); } }}>
        <DesignStatusDot ref={(element) => { if (element && runActive) markMotionStart(element); }} state={agentDotState(runLevel?.presentationState)} pulse={runLevel?.presentationState === 'running'} {...(runDotUi !== undefined ? { ui: runDotUi } : {})} />
        <span className="mission__run-label">Run{runLevel ? ` · ${runLevel.persona}` : ''}</span>
        <span className="mission__run-state mono text-secondary">{statusLabel ?? 'no session'}</span>
      </div>
      <AgentTree agents={agents} selected={selectedAgentId} onSelect={onSelect} nowIso={nowIso} />
      <div className="mission__actions" aria-label="Selection actions">
        <DesignButton type="button" className="btn btn-secondary" aria-disabled={!pause.enabled || pausePending} aria-describedby="mission-pause-reason" data-testid="mission-pause" data-enabled={pause.enabled && !pausePending ? '1' : '0'} onClick={() => { void requestPause(); }}>{pausePending || session?.executionStatus === 'pausing' ? 'Pausing…' : 'Pause'}</DesignButton>
        <DesignButton type="button" className="btn btn-danger" disabled={!cancelable} data-testid="mission-cancel" title={cancelable ? `Cancel ${selectedAgent?.name ?? ''}` : cancelUnavailableReason(selectedAgent)} onClick={() => { if (selectedAgent) setConfirming({ agent: selectedAgent, cascade: cancelCascade(agents, selectedAgent) }); }}>Cancel selection</DesignButton>
        {selectedAgent && <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="mission-open" onClick={() => onOpen(selectedAgent)}>Open {selectedAgent.name}</DesignButton>}
        <span id="mission-pause-reason" className="text-secondary mission__reason" data-testid="mission-pause-reason">{pause.reason}</span>
      </div>
      {message && <div className="composer__hint mission__message" role="status" data-testid="mission-message">{message}</div>}
      {error && <div className="composer__error" role="alert">{error}</div>}
      {/* PD-MONITOR-009 clause 6: the strategy is read here and edited in Settings › Runtime alone. */}
      <div className="mission__next-run" data-testid="mission-next-run">
        <span className="card-meta"><span>{NEXT_RUN_STRATEGY_PREFIX} <span className="mono" data-testid="mission-strategy">{strategy ?? '—'}</span></span></span>
        <DesignButton type="button" className="btn btn-link" data-testid="mission-open-runtime" onClick={onOpenRuntimeSettings}>{OPEN_RUNTIME_SETTINGS}</DesignButton>
      </div>
      {confirming && (
        <ConfirmDialog
          {...missionConfirmation(confirming.agent, confirming.cascade, agents)} destructive
          onConfirm={() => { void confirmCancel(); }} onCancel={() => setConfirming(null)} testId="mission-confirm"
        />
      )}
    </DesignCard>
  );
}

/**
 * PD-MONITOR-009 clause 3: the agent activity table as a card of the Overview's left column. The card is the table's query
 * container, so the rows give way by the card's own width, whatever the window's and wherever the column divider stands.
 */
export function AgentActivityCard({ session, selectedAgentId, onSelect, nowIso, onOpen, onPopOut, refresh = null }: Pick<DelegationProps, 'session' | 'selectedAgentId' | 'onSelect' | 'nowIso' | 'onOpen' | 'onPopOut' | 'refresh'>) {
  const agents = session?.agents ?? [];
  return (
    <DesignCard className="card ov-card mission__table" role="region" aria-label="Agent activity" data-testid="mission-table" data-refresh-ms={refresh ? refresh.ms.toFixed(1) : ''} data-refresh-agents={refresh ? String(refresh.agents) : ''}>
      {/* The refresh figure is verification data: the card carries it as attributes for the proof and draws none of it (UIR-302 of the
          critique of 2026-11-11: "last refresh 30.9 ms · 3 agents" was a third reading of the agent count, and no requirement asks for it). */}
      <div className="ov-card__head"><span className="card-kicker">Agent activity</span></div>
      <AgentTable agents={agents} selected={selectedAgentId} nowIso={nowIso} onSelect={(id) => onSelect(id, 'click')} onOpen={onOpen} onPopOut={onPopOut} />
    </DesignCard>
  );
}
