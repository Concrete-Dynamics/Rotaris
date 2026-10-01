import { createStore, type StoreApi } from 'zustand/vanilla';
import { isBusy, RUN_AGENT_ID, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
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
 * an acceptance pins it to the records held up to that moment, and the first whole-session update after it overwrites it.
 * An agent the authoritative record already shows finished is never overlaid.
 *
 * "Up to that moment" is an order, not an identity. A reader need not draw the replica's newest record: a persona window
 * draws a copy coalesced up to one 120 ms interval behind it (REQ-SHELL-076), and the engine commonly publishes its
 * cancelled record and answers the control inside that interval. Pinned to the one record the replica held at the answer,
 * the overlay stopped covering the older record that window still drew, and its agents read `running` again until the
 * next delivery. So the store numbers every record the replica takes, in the order it takes them (`witness`, called from
 * the replica's own subscription), and an accepted overlay covers every record of its session numbered at or below the
 * newest one witnessed when the engine answered — any record a lagging reader can still be drawing — and none after.
 *
 * REQ-MONITOR-127 / REQ-MONITOR-130 — the optimistic cancel of the whole run (acceptance A35). On confirmation "the session
 * status is optimistically set to `cancelling`", and a refusal restores it. Before this only the Workspace set anything —
 * its stop button's "Force stop" — and no surface showed `cancelling`, because the engine writes no `cancelling` for the
 * explicit cancel: the reserved run id's `cancelAgent` raises the final stop in memory, and the run's records keep reading
 * `running` (or `waiting`) through the graceful stop until the teardown writes the run's end. So a run overlay (`run` set,
 * no agent ids) covers every ACTIVE record of the run it was confirmed against, unanswered or accepted, and none at rest:
 * the run's own final read overwrites it (REQ-MONITOR-296), and a lagging reader's older record of that run is still
 * covered. The session's status is shown `cancelling`; no agent is shown cancelled by it, since the engine settles them in
 * the teardown (OQ-158).
 *
 * "The run it was confirmed against" is an order too, not the `runStartedAt` alone. The engine saves a new run `starting`
 * before it writes that run's `runStartedAt` (after the pre-flight), and the store keeps the column until then, so a
 * follow-up's or a continue's pre-flight records carry the cancelled run's key and are active. Keyed on it alone, the
 * overlay showed the next run `cancelling` through its whole pre-flight and the composer refused input (the verifier's
 * finding on A35). So `witness` ends the overlay at the first record of its session at rest taken after the confirmation
 * (`restedAt`): it covers active records taken before that one and none taken after. Before it, a record taken after the
 * confirmation is the run being cancelled whatever key it carries (a session runs one run at a time), so a run confirmed
 * during its pre-flight is still covered once it writes its own key.
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
   * `undefined` until the engine answers; then the number of the newest record witnessed when it accepted. The overlay
   * covers every record of its session numbered at or below it, and none taken after (the note above).
   */
  readonly acceptedThrough?: number;
  /**
   * REQ-MONITOR-127: set on the run's own cancel — the `runStartedAt` of the run it was confirmed against. Such an overlay
   * names no agent (`agentIds` is empty) and shows the session's status `cancelling` (the note above).
   */
  readonly run?: {
    readonly startedAt: string;
    /** The number of the record held at the confirmation: a record taken after it, before the rest, is of this run. */
    readonly confirmedAt: number;
    /** The number of the first record of the session at rest taken after the confirmation; nothing taken after it is covered. */
    readonly restedAt?: number;
  };
}

/** REQ-MONITOR-128's activity line: the user cancelled the agent, or the agent was cancelled with the one the user cancelled. */
export const cancelledByUser = (agentName: string, own: boolean): string => (own ? 'The user cancelled this agent.' : `Cancelled with ${agentName}, which the user cancelled.`);

const FINISHED: ReadonlySet<AgentRecord['presentationState']> = new Set(['done', 'failed', 'cancelled']);

/** The order the store has witnessed records in: a record's number, or `undefined` for one it never took. */
export type RecordOrder = (session: SessionRecord) => number | undefined;

/**
 * REQ-MONITOR-127 / REQ-MONITOR-296: a run cancel covers an active record of the run it was confirmed against — one carrying
 * that run's key or taken after the confirmation — and, once the run has rested, only a record taken before the rest. A
 * record never witnessed is judged by its key until the rest, and is not covered after it (the authoritative read).
 */
function coversRun(run: NonNullable<CancelOverlay['run']>, session: SessionRecord, orderOf: RecordOrder): boolean {
  if (!isBusy(session.executionStatus)) return false;
  const n = orderOf(session);
  if (run.restedAt !== undefined && (n === undefined || n >= run.restedAt)) return false;
  return session.runStartedAt === run.startedAt || (n !== undefined && n > run.confirmedAt);
}

/**
 * Whether an overlay still covers `session`: the same session, and either unanswered or a record witnessed no later than
 * the engine's acceptance. A record the store never witnessed is not covered once the engine has answered — the
 * authoritative read is shown.
 */
function covers(overlay: CancelOverlay, session: SessionRecord, orderOf: RecordOrder): boolean {
  if (overlay.sessionId !== session.id) return false;
  // REQ-MONITOR-127: the run's cancel covers its run's active records, answered or not, until the run's final read.
  if (overlay.run !== undefined) return coversRun(overlay.run, session, orderOf);
  if (overlay.acceptedThrough === undefined) return true;
  const n = orderOf(session);
  return n !== undefined && n <= overlay.acceptedThrough;
}

/**
 * The session as a surface shows it: the record the surface draws with every covering overlay laid over it. The record
 * itself is returned, unchanged and identical, when no overlay covers it or none changes an agent, so a surface memoised on
 * it does not redraw for nothing.
 */
export function shownSession(session: SessionRecord | null, held: Pick<CancelOverlayState, 'overlays' | 'orderOf'>): SessionRecord | null {
  if (session === null) return null;
  const covering = held.overlays.filter((o) => covers(o, session, held.orderOf));
  if (covering.length === 0) return session;
  const byAgent = new Map<string, CancelOverlay>();
  for (const o of covering) for (const id of o.agentIds) if (!byAgent.has(id)) byAgent.set(id, o);
  // REQ-MONITOR-127: the run's confirmed cancel shows the session cancelling.
  const cancellingRun = covering.some((o) => o.run !== undefined) && session.executionStatus !== 'cancelling';
  let changed = cancellingRun;
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
  return { ...session, ...(cancellingRun ? { executionStatus: 'cancelling' } : {}), agents, resumable };
}

export interface CancelOverlayState {
  readonly overlays: readonly CancelOverlay[];
  /** The number the store gave a record when it witnessed it; stable for the store's life. */
  readonly orderOf: RecordOrder;
}
export interface CancelOverlayActions {
  /**
   * The replica took `session`: it is numbered after every record taken before it (once — a record seen again keeps its
   * number). Nothing is drawn again for it, except that a record of a session at rest ends that session's open run cancels
   * (`restedAt`), and a record of another session ends every other session's; the window's replica subscription calls it
   * on every change.
   */
  witness(session: SessionRecord | null): void;
  /**
   * The confirmation: `agentId` and each unfinished descendant are shown cancelled from now. Returns the token the answer
   * settles, or null when the session or the agent is not held (nothing is shown then).
   */
  begin(session: SessionRecord | null, agentId: string, nowIso: string): number | null;
  /**
   * REQ-MONITOR-127: the confirmation of the run's own cancel — the session is shown `cancelling` from now. Returns the token
   * the answer settles, or null when no session is held or its run is not active (nothing is shown then).
   */
  beginRun(session: SessionRecord | null, nowIso: string): number | null;
  /** The engine refused: the overlay is removed, so the prior state shows again (REQ-MONITOR-127, REQ-MONITOR-128). */
  refuse(token: number): void;
  /**
   * The engine accepted: the overlay covers `current`, the record held now, and every record witnessed before it — what a
   * lagging reader can still draw — until a record taken after it replaces them.
   */
  accept(token: number, current: SessionRecord | null): void;
}
export type CancelOverlayStore = StoreApi<CancelOverlayState & CancelOverlayActions>;

export function createCancelOverlayStore(): CancelOverlayStore {
  let next = 1;
  const order = new WeakMap<SessionRecord, number>();
  let newest = 0;
  const witness = (session: SessionRecord | null): void => {
    if (session === null || order.has(session)) return;
    const n = ++newest;
    order.set(session, n);
    // REQ-MONITOR-296: the session at rest is the run's final read — it ends the session's run cancels still open, which is
    // the one change drawn again for (the note above). A record of ANOTHER session ends them too: the window has followed
    // away and will not take that run's final read, and on its return every record it takes is newer than the confirmation,
    // so a run started meanwhile would read `cancelling` until it rested. It is shown as the engine writes it instead, as a
    // window that never confirmed the cancel shows it (the verifier's optional finding on A35, OQ-158).
    const ends = (o: CancelOverlay): o is CancelOverlay & { readonly run: NonNullable<CancelOverlay['run']> } => o.run !== undefined && o.run.restedAt === undefined && (o.sessionId === session.id ? !isBusy(session.executionStatus) : true);
    const { overlays } = store.getState();
    if (overlays.some(ends)) store.setState({ overlays: overlays.map((o) => (ends(o) ? { ...o, run: { ...o.run, restedAt: n } } : o)) });
  };
  const orderOf: RecordOrder = (session) => order.get(session);
  const store = createStore<CancelOverlayState & CancelOverlayActions>((set, get) => ({
    overlays: [],
    orderOf,
    witness,
    begin(session, agentId, nowIso) {
      if (session === null) return null;
      const agent = session.agents.find((a) => a.id === agentId);
      if (!agent) return null;
      witness(session);
      const token = next++;
      const agentIds = [agentId, ...cancelCascade(session.agents, agent).map((a) => a.id)];
      // An accepted overlay is kept, inert once every reader has drawn a later record: it is a handful of numbers and
      // names, it holds no record, and the window knows no bound on how far behind a reader may draw.
      set({ overlays: [...get().overlays, { token, sessionId: session.id, agentId, agentName: agent.name, agentIds, at: nowIso }] });
      return token;
    },
    beginRun(session, nowIso) {
      if (session === null || session.runStartedAt === null || !isBusy(session.executionStatus)) return null;
      witness(session);
      const token = next++;
      const run = { startedAt: session.runStartedAt, confirmedAt: order.get(session) ?? newest };
      set({ overlays: [...get().overlays, { token, sessionId: session.id, agentId: RUN_AGENT_ID, agentName: 'the run', agentIds: [], at: nowIso, run }] });
      return token;
    },
    refuse(token) {
      set({ overlays: get().overlays.filter((o) => o.token !== token) });
    },
    accept(token, current) {
      witness(current);
      set({ overlays: get().overlays.map((o) => (o.token === token ? { ...o, acceptedThrough: newest } : o)) });
    },
  }));
  return store;
}
