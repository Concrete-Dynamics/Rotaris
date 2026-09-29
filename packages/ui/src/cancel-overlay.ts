import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentRecord, SessionRecord } from '@rotaris/contracts';
import { cancelCascade } from './agents.js';

/**
 * REQ-MONITOR-128 / REQ-MONITOR-296 — the optimistic cancel of one agent. On confirmation "that agent together with each
 * of its live descendants is optimistically shown as cancelled, with an activity line stating that the user cancelled
 * them"; on a refusal "the prior state is restored"; and the optimistic view is "eventually overwritten by the
 * authoritative final read". Before this, every surface sent `cancelAgent` and waited for the engine's republished session
 * record, so nothing was shown until the engine answered (the note "cancelling one agent is not shown cancelled until the
 * engine answers").
 *
 * The replica keeps its two writers (ADR-0043): nothing here writes it. An overlay is local interface state held beside
 * it, and a surface reads the session through `shownSession`, which lays the overlay over the replica's record. The set
 * shown cancelled is `cancelCascade`'s — the agent and every unfinished descendant, live or paused, which is the set the
 * engine ends and the set the confirmation named (OQ-100, OQ-101) — so a paused child's at-rest cancel (PD-ORCH-005
 * clause 16) is shown at once too, and the Continue action's count drops with it.
 *
 * An overlay lives from the confirmation to the authoritative read: while the engine has not answered it is laid over
 * whatever the replica holds, so an unrelated publication in flight does not bring the agents back; a refusal removes it;
 * an acceptance pins it to the record held at that moment, and the first whole-session update after it — a different
 * record — overwrites it. An agent the authoritative record already shows finished is never overlaid.
 */
export interface CancelOverlay {
  readonly token: number;
  readonly sessionId: string;
  /** The agent the user cancelled. */
  readonly agentId: string;
  readonly agentName: string;
  /** The agent and each descendant cancelled with it, as the confirmation named them. */
  readonly agentIds: readonly string[];
  readonly at: string;
  /**
   * `undefined` until the engine answers; then the session record the replica held when it accepted, which the overlay
   * covers until a newer record replaces it.
   */
  readonly acceptedOver?: SessionRecord | null;
}

/** REQ-MONITOR-128's activity line: the user cancelled the agent, or the agent was cancelled with the one the user cancelled. */
export const cancelledByUser = (agentName: string, own: boolean): string => (own ? 'The user cancelled this agent.' : `Cancelled with ${agentName}, which the user cancelled.`);

const FINISHED: ReadonlySet<AgentRecord['presentationState']> = new Set(['done', 'failed', 'cancelled']);

/** Whether an overlay still covers `session`: the same session, and either unanswered or the record it was accepted over. */
function covers(overlay: CancelOverlay, session: SessionRecord): boolean {
  return overlay.sessionId === session.id && (overlay.acceptedOver === undefined || overlay.acceptedOver === session);
}

/**
 * The session as a surface shows it: the replica's record with every covering overlay laid over it. The record itself is
 * returned, unchanged and identical, when no overlay covers it or none changes an agent, so a surface memoised on it does
 * not redraw for nothing.
 */
export function shownSession(session: SessionRecord | null, overlays: readonly CancelOverlay[]): SessionRecord | null {
  if (session === null) return null;
  const covering = overlays.filter((o) => covers(o, session));
  if (covering.length === 0) return session;
  const byAgent = new Map<string, CancelOverlay>();
  for (const o of covering) for (const id of o.agentIds) if (!byAgent.has(id)) byAgent.set(id, o);
  let changed = false;
  let pausedCancelled = 0;
  const agents = session.agents.map((a) => {
    const o = byAgent.get(a.id);
    if (!o || FINISHED.has(a.presentationState)) return a;
    changed = true;
    if (a.presentationState === 'paused') pausedCancelled += 1;
    return { ...a, state: 'cancelled' as const, presentationState: 'cancelled' as const, activity: cancelledByUser(o.agentName, a.id === o.agentId), activeTools: [], live: false, completedAt: a.completedAt ?? o.at };
  });
  if (!changed) return session;
  // PD-ORCH-005 clause 16: the Continue action's count drops by as many paused agents as were cancelled.
  const resumable = session.resumable && pausedCancelled > 0 ? { ...session.resumable, agents: Math.max(0, session.resumable.agents - pausedCancelled) } : session.resumable;
  return { ...session, agents, resumable };
}

export interface CancelOverlayState {
  readonly overlays: readonly CancelOverlay[];
}
export interface CancelOverlayActions {
  /**
   * The confirmation: `agentId` and each unfinished descendant are shown cancelled from now. Returns the token the answer
   * settles, or null when the session or the agent is not held (nothing is shown then).
   */
  begin(session: SessionRecord | null, agentId: string, nowIso: string): number | null;
  /** The engine refused: the overlay is removed, so the prior state shows again (REQ-MONITOR-128). */
  refuse(token: number): void;
  /** The engine accepted: the overlay covers `current`, the record held now, until a newer record replaces it. */
  accept(token: number, current: SessionRecord | null): void;
}
export type CancelOverlayStore = StoreApi<CancelOverlayState & CancelOverlayActions>;

export function createCancelOverlayStore(): CancelOverlayStore {
  let next = 1;
  return createStore<CancelOverlayState & CancelOverlayActions>((set, get) => ({
    overlays: [],
    begin(session, agentId, nowIso) {
      if (session === null) return null;
      const agent = session.agents.find((a) => a.id === agentId);
      if (!agent) return null;
      const token = next++;
      const agentIds = [agentId, ...cancelCascade(session.agents, agent).map((a) => a.id)];
      // An accepted overlay no record covers any longer has been overwritten, and is dropped as the next one begins.
      const kept = get().overlays.filter((o) => o.acceptedOver === undefined || (o.acceptedOver !== null && o.acceptedOver === session));
      set({ overlays: [...kept, { token, sessionId: session.id, agentId, agentName: agent.name, agentIds, at: nowIso }] });
      return token;
    },
    refuse(token) {
      set({ overlays: get().overlays.filter((o) => o.token !== token) });
    },
    accept(token, current) {
      set({ overlays: get().overlays.map((o) => (o.token === token ? { ...o, acceptedOver: current } : o)) });
    },
  }));
}
