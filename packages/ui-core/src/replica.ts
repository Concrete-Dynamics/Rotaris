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

/**
 * ADR-0046 step 3 — the ROW-LEVEL classification, and the six cumulative counters REQ-UIBENCH-064 fixes exactly.
 * The seven `ApplyClass` counters above classify PUBLICATIONS; these classify ROWS, which is what the benchmark
 * reads, and the two sets are not the same thing:
 *
 *  - one `insert` per row added, one `remove` per row removed, one `update` per retained row whose content changed;
 *  - **if nothing changed at all, one `noop` and NO row counters** — `noop` is the whole publication's verdict;
 *  - `refused` and `noop` both leave the view unchanged and are distinguished by whether the application was
 *    VALID, never by whether pixels changed; `refused` therefore also covers the decline of REQ-SESSION-161;
 *  - `reset` is one per whole-session update.
 *
 * They are cumulative for the life of the process, never reset between phases, and survive a `reset`
 * (ADR-0046's "notes that follow from the constraints"). REQ-UIBENCH-083 requires them to be BYTE-IDENTICAL
 * across two fresh processes replaying one fixture, which is why the classification is a pure function of
 * (displayed rows, incoming rows, earliest-changed index) and reads no clock, no random source and no arrival
 * time — and why exactly one `refused` and one `reset` are counted per recovery episode however many
 * publications arrive inside the recovery window (they are dropped by the handler and never reach this stage).
 */
export type RowOp = 'noop' | 'insert' | 'remove' | 'update' | 'refused' | 'reset';
export const ROW_OPS: readonly RowOp[] = ['noop', 'insert', 'remove', 'update', 'refused', 'reset'];

/**
 * Step 3 itself: compare the state being applied with the state currently displayed, from the earliest-changed
 * index. Pure and total; exported so it is unit-testable without a store, which is the point of ADR-0046's
 * alternative B. `held` and `incoming` are both in index order.
 */
export function classifyRows(held: readonly TranscriptRow[], earliestChanged: number, incoming: readonly TranscriptRow[]): { insert: number; remove: number; update: number; noop: boolean } {
  const before = held.filter((r) => r.index >= earliestChanged);
  const byIndex = new Map(before.map((r) => [r.index, r]));
  let insert = 0;
  let update = 0;
  for (const row of incoming) {
    const prior = byIndex.get(row.index);
    if (prior === undefined) { insert += 1; continue; }
    if (!sameRow(prior, row)) update += 1;
    byIndex.delete(row.index);
  }
  const remove = byIndex.size;
  return { insert, remove, update, noop: insert === 0 && remove === 0 && update === 0 };
}

/** Content equality over the row's own fields; key order is never read, so two processes agree byte for byte. */
function sameRow(a: TranscriptRow, b: TranscriptRow): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
  }
  return true;
}

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
  /** ADR-0046 step 3 / REQ-UIBENCH-064: the six cumulative row-level counters. */
  readonly rowOps: Readonly<Record<RowOp, number>>;
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
const zeroOps = (): Record<RowOp, number> => ({ noop: 0, insert: 0, remove: 0, update: 0, refused: 0, reset: 0 });

export interface ReplicaDeps {
  /** Called on a gap or a decline; must request a whole read (REQ-MONITOR-226). No timer sits behind it. */
  readonly requestReconcile: (sessionId: string) => void;
  readonly onDiagnostic?: (message: string) => void;
}

function bump(c: Readonly<Record<ApplyClass, number>>, k: ApplyClass): Record<ApplyClass, number> {
  return { ...c, [k]: c[k] + 1 };
}

/** Step 3's counters advance by the classification, never by one; `noop` is the publication's verdict and is one. */
function addOps(c: Readonly<Record<RowOp, number>>, add: Partial<Record<RowOp, number>>): Record<RowOp, number> {
  const out = { ...c };
  for (const k of ROW_OPS) out[k] = c[k] + (add[k] ?? 0);
  return out;
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
    rowOps: zeroOps(),

    follow(sessionId) {
      // Both counter sets are cumulative for the life of the process and are deliberately NOT cleared here
      // (ADR-0046: "they belong to the view-model stage, not to a component instance, and must survive a reset").
      set({ sessionId, expect: null, reconciling: false, session: null, rows: [], reachedOldest: false });
    },

    applySnapshot(raw) {
      const s = get();
      const p = raw as SessionSnapshot;
      if (!p || p.sessionId !== s.sessionId) { set({ counters: bump(s.counters, 'foreign') }); return 'foreign'; }
      if (p.v !== CONTRACT_SCHEMA_VERSION) {
        deps.onDiagnostic?.(`snapshot with unknown schema version ${String(p.v)}`);
        set({ counters: bump(s.counters, 'refused'), rowOps: addOps(s.rowOps, { refused: 1 }) });
        return 'refused';
      }
      // A whole-session update always SETS the expectation and replaces the session. The transcript is
      // re-delivered by the increment that follows it (REQ-SESSION-161), so it is cleared here.
      // REQ-MONITOR-216: the whole-session update OMITS the transcript, so it cannot say which rows survived —
      // the rows are kept and the increment that follows an attach or a reconcile upserts over them. (The
      // first form of this line cleared the rows; the first run loop's status saves, each a snapshot, then
      // emptied a transcript that was still being written. ADR-0043's first-execution note records both.)
      set({ expect: p.seq + 1, session: p.session, reconciling: false, counters: bump(s.counters, 'reset'), rowOps: addOps(s.rowOps, { reset: 1 }) });
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
        set({ reconciling: true, counters: bump(s.counters, 'refused'), rowOps: addOps(s.rowOps, { refused: 1 }) });
        deps.requestReconcile(p.sessionId);
        return 'refused';
      }
      if (p.seq < s.expect) { set({ counters: bump(s.counters, 'superseded') }); return 'superseded'; }
      const oldestHeld = s.rows.length === 0 ? null : s.rows[0]!.index;
      if (oldestHeld !== null && p.earliestChanged < oldestHeld && p.earliestChanged !== 0) {
        // REQ-SESSION-161 / REQ-CHAT-052: decline rather than fit; the rows on display are unchanged.
        deps.onDiagnostic?.(`declined increment on ${p.sessionId}: earliest-changed ${p.earliestChanged} precedes oldest held ${oldestHeld}`);
        set({ reconciling: true, expect: p.seq + 1, counters: bump(s.counters, 'declined'), rowOps: addOps(s.rowOps, { refused: 1 }) });
        deps.requestReconcile(p.sessionId);
        return 'declined';
      }
      // ADR-0046 step 3: classify the incoming rows against the displayed ones BEFORE they are applied.
      const c = classifyRows(s.rows, p.earliestChanged, p.rows);
      const ops = c.noop ? { noop: 1 } : { insert: c.insert, remove: c.remove, update: c.update };
      set({ expect: p.seq + 1, rows: projectIncrement(s.rows, p.earliestChanged, p.rows), counters: bump(s.counters, 'applied'), rowOps: addOps(s.rowOps, ops) });
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
