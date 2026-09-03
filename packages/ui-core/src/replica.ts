import { createStore, type StoreApi } from 'zustand/vanilla';
import { CONTRACT_SCHEMA_VERSION, type SessionSnapshot, type TranscriptIncrement, type TranscriptRow } from '@rotaris/contracts';

/**
 * ADR-0043 / ADR-0046 / ADR-0057 — the renderer's replica of run-derived
 * state, with exactly two writers: `applySnapshot` (which REPLACES, so a
 * field the new whole-session payload does not carry cannot survive —
 * REQ-MONITOR-217) and `applyIncrement`. Local-only interface state lives in
 * a separate store so a replacement of this one cannot clear it.
 *
 * Step 0 of the apply stage is the sequence check (REQ-MONITOR-214/226):
 *  - an expectation is created by a whole-session update and by NOTHING else;
 *    a surface with no expectation cannot observe a gap;
 *  - a whole-session update always SETS the expectation (classified `reset`);
 *  - a number at or below the expectation is a superseded publication —
 *    discarded, no counter movement;
 *  - a number above it is a GAP: classify `refused`, apply nothing, stop
 *    consuming increments, and request a whole read at once with no timer.
 *  - while a reconcile is in flight, publications are DROPPED, not queued.
 *  - a schema version this build does not understand takes the gap path.
 *
 * REQ-SESSION-161: an increment whose earliest-changed index falls before the
 * oldest row this surface holds from its last whole read is DECLINED — it
 * costs one further whole read and leaves the rows on display unchanged.
 *
 * Written against the vanilla store; imports nothing from React.
 */
export type ApplyClass = 'applied' | 'reset' | 'superseded' | 'refused' | 'dropped' | 'foreign' | 'declined';

export interface ReplicaState {
  readonly sessionId: string | null;
  /** The number the next publication must bear, or null when no expectation exists. */
  readonly expect: number | null;
  readonly reconciling: boolean;
  readonly session: SessionSnapshot['session'] | null;
  readonly rows: readonly TranscriptRow[];
  /** REQ-CHAT-165: whether the first recorded row is among those held (paging has reached the top). */
  readonly reachedOldest: boolean;
  readonly counters: Readonly<Record<ApplyClass, number>>;
}

export interface ReplicaActions {
  /** Begin following `sessionId`. Clears the expectation: the next snapshot creates one. */
  follow(sessionId: string | null): void;
  applySnapshot(p: unknown): ApplyClass;
  applyIncrement(p: unknown): ApplyClass;
  /** REQ-CHAT-165: a span older than what is held, placed above it; rows identical to those released. */
  prependOlder(rows: readonly TranscriptRow[], oldest: boolean): void;
  /** The reconcile response has landed (it arrives as ordinary traffic); resume consuming. */
  reconcileSettled(): void;
}

export type ReplicaStore = StoreApi<ReplicaState & ReplicaActions>;

const zero = (): Record<ApplyClass, number> => ({ applied: 0, reset: 0, superseded: 0, refused: 0, dropped: 0, foreign: 0, declined: 0 });

export interface ReplicaDeps {
  /** Called on a gap or a decline; must request a whole read (REQ-MONITOR-226). No timer sits behind it. */
  readonly requestReconcile: (sessionId: string) => void;
  readonly onDiagnostic?: (message: string) => void;
}

function bump(c: Readonly<Record<ApplyClass, number>>, k: ApplyClass): Record<ApplyClass, number> {
  return { ...c, [k]: c[k] + 1 };
}

/** REQ-EVENTS-052: upsert by index, never append; rows from `earliestChanged` onward are the update's. */
export function projectIncrement(held: readonly TranscriptRow[], earliestChanged: number, rows: readonly TranscriptRow[]): TranscriptRow[] {
  const kept = held.filter((r) => r.index < earliestChanged);
  return [...kept, ...[...rows].sort((a, b) => a.index - b.index)];
}

export function createReplicaStore(deps: ReplicaDeps): ReplicaStore {
  return createStore<ReplicaState & ReplicaActions>((set, get) => ({
    sessionId: null,
    expect: null,
    reconciling: false,
    session: null,
    rows: [],
    reachedOldest: false,
    counters: zero(),

    follow(sessionId) {
      set({ sessionId, expect: null, reconciling: false, session: null, rows: [], reachedOldest: false });
    },

    applySnapshot(raw) {
      const s = get();
      const p = raw as SessionSnapshot;
      if (!p || p.sessionId !== s.sessionId) { set({ counters: bump(s.counters, 'foreign') }); return 'foreign'; }
      if (p.v !== CONTRACT_SCHEMA_VERSION) {
        deps.onDiagnostic?.(`snapshot with unknown schema version ${String(p.v)}`);
        set({ counters: bump(s.counters, 'refused') });
        return 'refused';
      }
      // A whole-session update always SETS the expectation and replaces the session. The transcript is
      // re-delivered by the increment that follows it (REQ-SESSION-161), so it is cleared here.
      set({ expect: p.seq + 1, session: p.session, rows: [], reachedOldest: false, reconciling: false, counters: bump(s.counters, 'reset') });
      return 'reset';
    },

    applyIncrement(raw) {
      const s = get();
      const p = raw as TranscriptIncrement;
      if (!p || p.sessionId !== s.sessionId) { set({ counters: bump(s.counters, 'foreign') }); return 'foreign'; }
      if (s.reconciling) { set({ counters: bump(s.counters, 'dropped') }); return 'dropped'; }
      if (s.expect === null) { set({ counters: bump(s.counters, 'dropped') }); return 'dropped'; }
      if (p.v !== CONTRACT_SCHEMA_VERSION || p.seq > s.expect) {
        deps.onDiagnostic?.(`gap on ${p.sessionId}: expected ${s.expect}, got ${p.seq}`);
        set({ reconciling: true, counters: bump(s.counters, 'refused') });
        deps.requestReconcile(p.sessionId);
        return 'refused';
      }
      if (p.seq < s.expect) { set({ counters: bump(s.counters, 'superseded') }); return 'superseded'; }
      const oldestHeld = s.rows.length === 0 ? null : s.rows[0]!.index;
      if (oldestHeld !== null && p.earliestChanged < oldestHeld && p.earliestChanged !== 0) {
        // REQ-SESSION-161 / REQ-CHAT-052: decline rather than fit; the rows on display are unchanged.
        deps.onDiagnostic?.(`declined increment on ${p.sessionId}: earliest-changed ${p.earliestChanged} precedes oldest held ${oldestHeld}`);
        set({ reconciling: true, expect: p.seq + 1, counters: bump(s.counters, 'declined') });
        deps.requestReconcile(p.sessionId);
        return 'declined';
      }
      set({ expect: p.seq + 1, rows: projectIncrement(s.rows, p.earliestChanged, p.rows), counters: bump(s.counters, 'applied') });
      return 'applied';
    },

    prependOlder(rows, oldest) {
      const s = get();
      const have = new Set(s.rows.map((r) => r.index));
      const fresh = rows.filter((r) => !have.has(r.index));
      set({ rows: [...fresh, ...s.rows].sort((a, b) => a.index - b.index), reachedOldest: oldest });
    },

    reconcileSettled() {
      set({ reconciling: false });
    },
  }));
}
