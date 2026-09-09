import type { Statement } from 'better-sqlite3';
import type { StoreHandle } from '../open.js';

/**
 * The delivery store's data-access module (Part AK; ADR-0041 B′, first execution). Every SQL string over the
 * seven `delivery*` tables lives HERE and nowhere else — `workspace/src/delivery/guard.test.ts` sweeps the
 * repository to say so (REQ-TRACE-399) — every statement is prepared once and retained (ADR-0058 consequence 16),
 * and nothing above this module knows the engine.
 *
 * This module knows NOTHING of the board's vocabularies: `state`, `action`, `actor` and `kind` are strings here,
 * because `store` may import only `kernel` and `platform` (the component view's matrix) and the closed sets are
 * `contracts`'. The transition function in `workspace/src/delivery/transition.ts` is the one caller that writes
 * through `transition()`, and it is the one place the vocabularies are checked.
 *
 * REQ-CONFIG-192's version rule is implemented on the READ side and nowhere else: `readAll` hands back a row as
 * `record` (decoded), `unsupported` (a version above `DELIVERY_RECORD_VERSION`, body untouched and not decoded) or
 * `unreadable` (a version below 1, absent or not an integer, or a body that will not decode). No statement in this
 * module rewrites, migrates or deletes such a row; the only UPDATE of `delivery` is the transition's own upsert.
 */

/**
 * REQ-CONFIG-192: "the reader supports exactly the versions 1 through the configured `schema_version`, which as
 * shipped is the single version 1". This is the version every record this build writes carries, and the highest it
 * interprets. It is the RECORD's version and has nothing to do with the table schema's `user_version` (ADR-0041
 * commitment 1).
 */
export const DELIVERY_RECORD_VERSION = 1;
/**
 * REQ-CONFIG-192's `history_limit` default: 200 entries kept per requirement, older entries pruned. The figure lives
 * beside the DELETE that enforces it (as `PROMPT_CAPS` and `RING_CAPS` do), and the transition takes it as an argument
 * so a configured value reaches the same statement.
 */
export const DELIVERY_HISTORY_LIMIT = 200;

/** The decoded version-1 record: what `body` holds, and what the queried columns beside it mirror. */
export interface DeliveryRecord {
  readonly schemaVersion: 1;
  readonly state: string;
  readonly returnTo: string | null;
  readonly acceptedHash: string | null;
  readonly snapshotHash: string | null;
  readonly snapshotAt: string | null;
  readonly acceptedAt: string | null;
  readonly updatedAt: string;
  readonly units: number;
}
/** One row of `delivery` as stored; `schema_version` is `unknown` because it is read back exactly as it was written. */
export interface DeliveryRow {
  readonly req_id: string;
  readonly schema_version: unknown;
  readonly state: string;
  readonly return_to: string | null;
  readonly accepted_hash: string | null;
  readonly snapshot_hash: string | null;
  readonly transitions_ever: number;
  readonly updated_at: string;
  readonly body: string;
}
/** REQ-CONFIG-192's three outcomes of reading one record. */
export type DeliveryReadRow =
  | { readonly kind: 'record'; readonly id: string; readonly record: DeliveryRecord; readonly transitionsEver: number }
  | { readonly kind: 'unsupported'; readonly id: string; readonly version: number; readonly raw: string }
  | { readonly kind: 'unreadable'; readonly id: string; readonly version: unknown; readonly raw: string };

export interface DeliveryHistoryRow {
  readonly req_id: string;
  readonly seq: number;
  readonly at: string;
  readonly action: string;
  readonly actor: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly hash: string;
  readonly reason: string | null;
  readonly override: number;
}
export interface DeliveryAuditRow extends Omit<DeliveryHistoryRow, 'seq'> {
  readonly seq: number;
}
export interface DeliveryRunRow {
  readonly req_id: string;
  readonly unit: string;
  readonly session_id: string | null;
  readonly worktree_ref: string | null;
  readonly permissions: string;
  readonly status: string;
  readonly stage: string | null;
  readonly outcome: string | null;
  readonly started_at: string;
  readonly ended_at: string | null;
}
export interface DeliveryWorktreeRow {
  readonly ref: string;
  readonly req_id: string;
  readonly unit: string;
  readonly path: string;
  readonly branch: string;
  readonly created_at: string;
  readonly kept: number;
}
export interface DeliveryBlockerRow {
  readonly req_id: string;
  readonly seq: number;
  readonly kind: string;
  readonly reason: string;
  /** JSON array of `{ key, label?, consequence? }` — the engine's named options (REQ-TRACE-449 path 1). */
  readonly options: string;
  /** JSON array of requirement identifiers holding this one (REQ-TRACE-449 path 2). */
  readonly blocking_ids: string;
  readonly run_unit: string | null;
  readonly raised_at: string;
  readonly answered_at: string | null;
  readonly answer: string | null;
}
export interface DeliveryTombstoneRow {
  readonly req_id: string;
  readonly retired_at: string;
  readonly last_hash: string | null;
}

/** What one transition writes, all of it in one transaction (REQ-CONFIG-192 "together, indivisibly"). */
export interface TransitionWrite {
  readonly id: string;
  readonly record: DeliveryRecord;
  readonly entry: {
    readonly at: string;
    readonly action: string;
    readonly actor: string;
    readonly from: string;
    readonly to: string;
    readonly hash: string;
    readonly reason: string | null;
    readonly override: boolean;
  };
  /** REQ-CONFIG-192's `history_limit`; `DELIVERY_HISTORY_LIMIT` when the caller states none. */
  readonly historyLimit?: number;
  /**
   * What the SAME transaction must also carry, when the transition entails it: the run row a start writes with its
   * session id (REQ-TRACE-464 "in the same transaction that records the run as started"), the run row an end settles,
   * the blocker a hold raises (REQ-TRACE-445 "written to the record"), and the answer a resume gives every open blocker.
   */
  readonly runStart?: { readonly unit: string; readonly sessionId: string | null; readonly worktreeRef: string | null; readonly permissions: string; readonly stage?: string };
  readonly runEnd?: { readonly unit: string; readonly status: string; readonly outcome: string };
  readonly raiseBlocker?: { readonly kind: string; readonly reason: string; readonly options: readonly unknown[]; readonly blockingIds: readonly string[]; readonly runUnit: string | null };
  readonly answerBlockers?: { readonly answer: string };
}

export class DeliveryDal {
  private readonly stmts: Record<string, Statement>;

  constructor(private readonly db: StoreHandle) {
    this.stmts = {
      readAll: db.prepare('SELECT * FROM delivery ORDER BY req_id'),
      read: db.prepare('SELECT * FROM delivery WHERE req_id = ?'),
      upsert: db.prepare(`
        INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body)
        VALUES (@req_id, @schema_version, @state, @return_to, @accepted_hash, @snapshot_hash, @transitions_ever, @updated_at, @body)
        ON CONFLICT(req_id) DO UPDATE SET
          schema_version = excluded.schema_version, state = excluded.state, return_to = excluded.return_to,
          accepted_hash = excluded.accepted_hash, snapshot_hash = excluded.snapshot_hash,
          transitions_ever = excluded.transitions_ever, updated_at = excluded.updated_at, body = excluded.body
      `),
      transitionsEver: db.prepare('SELECT transitions_ever AS n FROM delivery WHERE req_id = ?'),
      insertHistory: db.prepare('INSERT INTO delivery_history (req_id, seq, at, action, actor, from_state, to_state, hash, reason, override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      // REQ-CONFIG-192: the prune is a DELETE in the transition's own transaction, never a rewrite (ADR-0041).
      pruneHistory: db.prepare('DELETE FROM delivery_history WHERE req_id = ? AND seq <= ?'),
      historyOf: db.prepare('SELECT * FROM delivery_history WHERE req_id = ? ORDER BY seq'),
      countHistory: db.prepare('SELECT count(*) AS c FROM delivery_history WHERE req_id = ?'),
      insertAudit: db.prepare('INSERT INTO delivery_audit (at, req_id, action, actor, from_state, to_state, hash, reason, override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      auditAll: db.prepare('SELECT * FROM delivery_audit ORDER BY seq'),
      auditOf: db.prepare('SELECT * FROM delivery_audit WHERE req_id = ? ORDER BY seq'),
      countAudit: db.prepare('SELECT count(*) AS c FROM delivery_audit'),
      insertRun: db.prepare('INSERT INTO delivery_runs (req_id, unit, session_id, worktree_ref, permissions, status, stage, outcome, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)'),
      endRun: db.prepare('UPDATE delivery_runs SET status = ?, outcome = ?, ended_at = ?, stage = NULL WHERE req_id = ? AND unit = ?'),
      stageRun: db.prepare("UPDATE delivery_runs SET stage = ? WHERE req_id = ? AND unit = ? AND status = 'running'"),
      runsOf: db.prepare('SELECT * FROM delivery_runs WHERE req_id = ? ORDER BY started_at, unit'),
      runsAll: db.prepare('SELECT * FROM delivery_runs ORDER BY req_id, started_at, unit'),
      runsWithStatus: db.prepare('SELECT * FROM delivery_runs WHERE status = ? ORDER BY req_id, started_at, unit'),
      upsertWorktree: db.prepare(`
        INSERT INTO delivery_worktrees (ref, req_id, unit, path, branch, created_at, kept) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ref) DO UPDATE SET kept = excluded.kept
      `),
      worktreesOf: db.prepare('SELECT * FROM delivery_worktrees WHERE req_id = ? ORDER BY created_at, ref'),
      worktree: db.prepare('SELECT * FROM delivery_worktrees WHERE ref = ?'),
      insertBlocker: db.prepare('INSERT INTO delivery_blockers (req_id, seq, kind, reason, options, blocking_ids, run_unit, raised_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
      maxBlockerSeq: db.prepare('SELECT max(seq) AS m FROM delivery_blockers WHERE req_id = ?'),
      answerBlocker: db.prepare('UPDATE delivery_blockers SET answered_at = ?, answer = ? WHERE req_id = ? AND seq = ? AND answered_at IS NULL'),
      openBlockersOf: db.prepare('SELECT * FROM delivery_blockers WHERE req_id = ? AND answered_at IS NULL ORDER BY seq'),
      openBlockersAll: db.prepare('SELECT * FROM delivery_blockers WHERE answered_at IS NULL ORDER BY req_id, seq'),
      blockersOf: db.prepare('SELECT * FROM delivery_blockers WHERE req_id = ? ORDER BY seq'),
      insertTombstone: db.prepare('INSERT OR IGNORE INTO delivery_tombstones (req_id, retired_at, last_hash) VALUES (?, ?, ?)'),
      tombstones: db.prepare('SELECT * FROM delivery_tombstones ORDER BY req_id'),
    };
  }

  // ---- reads (REQ-CONFIG-192's three outcomes) ----

  readAll(): DeliveryReadRow[] {
    return (this.stmts['readAll']!.all() as DeliveryRow[]).map((r) => classify(r));
  }
  read(id: string): DeliveryReadRow | undefined {
    const r = this.stmts['read']!.get(id) as DeliveryRow | undefined;
    return r === undefined ? undefined : classify(r);
  }
  historyOf(id: string): DeliveryHistoryRow[] {
    return this.stmts['historyOf']!.all(id) as DeliveryHistoryRow[];
  }
  /** REQ-TRACE-405 / ADR-0041 commitment 3: the number of entries retention has dropped, from the counter, never from a guess. */
  droppedHistory(id: string): number {
    const ever = (this.stmts['transitionsEver']!.get(id) as { n: number } | undefined)?.n ?? 0;
    const held = (this.stmts['countHistory']!.get(id) as { c: number }).c;
    return Math.max(0, ever - held);
  }
  auditAll(): DeliveryAuditRow[] {
    return this.stmts['auditAll']!.all() as DeliveryAuditRow[];
  }
  auditOf(id: string): DeliveryAuditRow[] {
    return this.stmts['auditOf']!.all(id) as DeliveryAuditRow[];
  }
  countAudit(): number {
    return (this.stmts['countAudit']!.get() as { c: number }).c;
  }

  // ---- the one write unit (REQ-CONFIG-192 "together, indivisibly") ----

  /**
   * The delivery state, the history entry, the prune and the audit entry in ONE transaction, with the per-requirement
   * counter incremented inside it. Returns the entry's sequence number (1-based, never reused: a pruned number is not
   * handed out again because the counter only rises) and how many entries the prune removed. A failure anywhere inside
   * rolls the whole unit back — `delivery.test.ts` proves it with an entry the audit statement refuses.
   */
  transition(w: TransitionWrite): { readonly seq: number; readonly pruned: number } {
    const limit = w.historyLimit ?? DELIVERY_HISTORY_LIMIT;
    return this.db.transaction(() => {
      const ever = (this.stmts['transitionsEver']!.get(w.id) as { n: number } | undefined)?.n ?? 0;
      const seq = ever + 1;
      this.stmts['upsert']!.run({
        req_id: w.id, schema_version: w.record.schemaVersion, state: w.record.state, return_to: w.record.returnTo,
        accepted_hash: w.record.acceptedHash, snapshot_hash: w.record.snapshotHash, transitions_ever: seq,
        updated_at: w.record.updatedAt, body: JSON.stringify(w.record),
      });
      this.stmts['insertHistory']!.run(w.id, seq, w.entry.at, w.entry.action, w.entry.actor, w.entry.from, w.entry.to, w.entry.hash, w.entry.reason, w.entry.override ? 1 : 0);
      const pruned = this.stmts['pruneHistory']!.run(w.id, seq - limit).changes;
      if (w.runStart) this.stmts['insertRun']!.run(w.id, w.runStart.unit, w.runStart.sessionId, w.runStart.worktreeRef, w.runStart.permissions, 'running', w.runStart.stage ?? null, w.entry.at);
      if (w.runEnd) this.stmts['endRun']!.run(w.runEnd.status, w.runEnd.outcome, w.entry.at, w.id, w.runEnd.unit);
      if (w.raiseBlocker) {
        const b = w.raiseBlocker;
        const bseq = ((this.stmts['maxBlockerSeq']!.get(w.id) as { m: number | null }).m ?? 0) + 1;
        this.stmts['insertBlocker']!.run(w.id, bseq, b.kind, b.reason, JSON.stringify(b.options), JSON.stringify(b.blockingIds), b.runUnit, w.entry.at);
      }
      if (w.answerBlockers) for (const b of this.openBlockersOf(w.id)) this.stmts['answerBlocker']!.run(w.entry.at, w.answerBlockers.answer, w.id, b.seq);
      this.stmts['insertAudit']!.run(w.entry.at, w.id, w.entry.action, w.entry.actor, w.entry.from, w.entry.to, w.entry.hash, w.entry.reason, w.entry.override ? 1 : 0);
      return { seq, pruned };
    }).immediate();
  }

  // ---- runs and worktrees (REQ-TRACE-464/476; the rows AP writes through the writer handle) ----

  recordRunStarted(r: { readonly id: string; readonly unit: string; readonly sessionId: string | null; readonly worktreeRef: string | null; readonly permissions: string; readonly startedAt: string; readonly stage?: string }): void {
    this.stmts['insertRun']!.run(r.id, r.unit, r.sessionId, r.worktreeRef, r.permissions, 'running', r.stage ?? null, r.startedAt);
  }
  recordRunEnded(r: { readonly id: string; readonly unit: string; readonly status: string; readonly outcome: string; readonly endedAt: string }): boolean {
    return this.stmts['endRun']!.run(r.status, r.outcome, r.endedAt, r.id, r.unit).changes === 1;
  }
  setRunStage(id: string, unit: string, stage: string | null): void {
    this.stmts['stageRun']!.run(stage, id, unit);
  }
  runsOf(id: string): DeliveryRunRow[] {
    return this.stmts['runsOf']!.all(id) as DeliveryRunRow[];
  }
  runsAll(): DeliveryRunRow[] {
    return this.stmts['runsAll']!.all() as DeliveryRunRow[];
  }
  runsWithStatus(status: string): DeliveryRunRow[] {
    return this.stmts['runsWithStatus']!.all(status) as DeliveryRunRow[];
  }
  upsertWorktree(w: { readonly ref: string; readonly id: string; readonly unit: string; readonly path: string; readonly branch: string; readonly createdAt: string; readonly kept: boolean }): void {
    this.stmts['upsertWorktree']!.run(w.ref, w.id, w.unit, w.path, w.branch, w.createdAt, w.kept ? 1 : 0);
  }
  worktreesOf(id: string): DeliveryWorktreeRow[] {
    return this.stmts['worktreesOf']!.all(id) as DeliveryWorktreeRow[];
  }
  worktree(ref: string): DeliveryWorktreeRow | undefined {
    return this.stmts['worktree']!.get(ref) as DeliveryWorktreeRow | undefined;
  }

  // ---- blockers (REQ-TRACE-445..454) ----

  raiseBlocker(b: { readonly id: string; readonly kind: string; readonly reason: string; readonly options: readonly unknown[]; readonly blockingIds: readonly string[]; readonly runUnit: string | null; readonly raisedAt: string }): number {
    return this.db.transaction(() => {
      const seq = ((this.stmts['maxBlockerSeq']!.get(b.id) as { m: number | null }).m ?? 0) + 1;
      this.stmts['insertBlocker']!.run(b.id, seq, b.kind, b.reason, JSON.stringify(b.options), JSON.stringify(b.blockingIds), b.runUnit, b.raisedAt);
      return seq;
    }).immediate();
  }
  answerBlocker(id: string, seq: number, answeredAt: string, answer: string): boolean {
    return this.stmts['answerBlocker']!.run(answeredAt, answer, id, seq).changes === 1;
  }
  /** Answers every open blocker of a requirement at once — what `resume` does (REQ-TRACE-453: the answer carries only the record's own state). */
  answerOpenBlockers(id: string, answeredAt: string, answer: string): number {
    return this.db.transaction(() => {
      let n = 0;
      for (const b of this.openBlockersOf(id)) if (this.answerBlocker(id, b.seq, answeredAt, answer)) n += 1;
      return n;
    }).immediate();
  }
  openBlockersOf(id: string): DeliveryBlockerRow[] {
    return this.stmts['openBlockersOf']!.all(id) as DeliveryBlockerRow[];
  }
  openBlockersAll(): DeliveryBlockerRow[] {
    return this.stmts['openBlockersAll']!.all() as DeliveryBlockerRow[];
  }
  blockersOf(id: string): DeliveryBlockerRow[] {
    return this.stmts['blockersOf']!.all(id) as DeliveryBlockerRow[];
  }

  // ---- tombstones (REQ-CONFIG-192 `retain_tombstones`) ----

  tombstone(id: string, retiredAt: string, lastHash: string | null): void {
    this.stmts['insertTombstone']!.run(id, retiredAt, lastHash);
  }
  tombstones(): DeliveryTombstoneRow[] {
    return this.stmts['tombstones']!.all() as DeliveryTombstoneRow[];
  }
}

/** REQ-CONFIG-192: read the version as stored; interpret the body only when the version is one this build supports. */
function classify(r: DeliveryRow): DeliveryReadRow {
  const v = r.schema_version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { kind: 'unreadable', id: r.req_id, version: v, raw: r.body };
  if (v > DELIVERY_RECORD_VERSION) return { kind: 'unsupported', id: r.req_id, version: v, raw: r.body };
  let parsed: unknown;
  try { parsed = JSON.parse(r.body); } catch { return { kind: 'unreadable', id: r.req_id, version: v, raw: r.body }; }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'unreadable', id: r.req_id, version: v, raw: r.body };
  const p = parsed as Partial<DeliveryRecord>;
  if (typeof p.state !== 'string' || typeof p.updatedAt !== 'string') return { kind: 'unreadable', id: r.req_id, version: v, raw: r.body };
  return {
    kind: 'record',
    id: r.req_id,
    transitionsEver: r.transitions_ever,
    record: {
      schemaVersion: 1,
      state: p.state,
      returnTo: typeof p.returnTo === 'string' ? p.returnTo : null,
      acceptedHash: typeof p.acceptedHash === 'string' ? p.acceptedHash : null,
      snapshotHash: typeof p.snapshotHash === 'string' ? p.snapshotHash : null,
      snapshotAt: typeof p.snapshotAt === 'string' ? p.snapshotAt : null,
      acceptedAt: typeof p.acceptedAt === 'string' ? p.acceptedAt : null,
      updatedAt: p.updatedAt,
      units: typeof p.units === 'number' ? p.units : 0,
    },
  };
}
