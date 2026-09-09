import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { CURRENT_SCHEMA_VERSION, DELIVERY_HISTORY_LIMIT, DELIVERY_RECORD_VERSION, DeliveryDal, forgetSpelling, openWorkspaceStore, type DeliveryRecord, type ResolvedStore } from '../index.js';

/**
 * Store v15 and the delivery DAL (Part AK; ADR-0041's first execution; REQ-CONFIG-192, REQ-TRACE-405).
 * The rows, the one transaction, the prune, the counter, the append-only audit, and REQ-CONFIG-192's three
 * outcomes of reading a record — each proved against the real engine, never a mock of it.
 */
const A = mintWorkspaceId('000000000000000000000000000000aa');
let root: string;
let r: ResolvedStore;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-delivery-'));
  r = openWorkspaceStore(root, A, 'C:\\ws');
});
afterEach(() => {
  r.db.close();
  forgetSpelling(r.dir);
  rmSync(root, { recursive: true, force: true });
});

const record = (state: string, over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  schemaVersion: 1, state, returnTo: null, acceptedHash: null, snapshotHash: null, snapshotAt: null, acceptedAt: null, updatedAt: '2026-09-09T00:00:00.000Z', units: 0, ...over,
});
const entry = (action: string, from: string, to: string, over: Partial<{ actor: string; reason: string | null; override: boolean }> = {}) => ({
  at: '2026-09-09T00:00:00.000Z', action, actor: 'user:owner', from, to, hash: 'a'.repeat(32), reason: null, override: false, ...over,
});

describe('store v15 — the delivery tables (ADR-0041)', () => {
  it('is the current schema and lands the seven delivery tables, none referencing sessions', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(15);
    const tables = (r.db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'delivery%' ORDER BY name").all() as { name: string; sql: string }[]);
    expect(tables.map((t) => t.name)).toEqual(['delivery', 'delivery_audit', 'delivery_blockers', 'delivery_history', 'delivery_runs', 'delivery_tombstones', 'delivery_worktrees']);
    for (const t of tables) expect(t.sql, t.name).not.toMatch(/REFERENCES sessions/);
    // REQ-TRACE-480: neither queue control nor a stop is persisted here — the two controls are configuration (Part AP's), a stop is never persisted.
    expect(tables.some((t) => t.name.includes('queue'))).toBe(false);
  });

  it('REQ-CONFIG-192: a transition writes the state, one history entry and one audit entry together, and the counter rises with them', () => {
    const dal = new DeliveryDal(r.db);
    const out = dal.transition({ id: 'REQ-101', record: record('ready'), entry: entry('release', 'backlog', 'ready') });
    expect(out).toEqual({ seq: 1, pruned: 0 });
    const row = dal.read('REQ-101');
    expect(row?.kind).toBe('record');
    if (row?.kind !== 'record') throw new Error('unreachable');
    expect(row.record.state).toBe('ready');
    expect(row.transitionsEver).toBe(1);
    expect(dal.historyOf('REQ-101')).toHaveLength(1);
    expect(dal.auditAll()).toHaveLength(1);
    expect(dal.auditAll()[0]).toMatchObject({ req_id: 'REQ-101', action: 'release', actor: 'user:owner', from_state: 'backlog', to_state: 'ready', override: 0 });
  });

  it('REQ-CONFIG-192 "together, indivisibly": a failure at the audit insert leaves no state and no history behind', () => {
    const dal = new DeliveryDal(r.db);
    // The fault is injected at the LAST statement of the unit, so the state upsert, the history insert and the prune
    // have all run by the time it fires; only a transaction leaves nothing behind.
    r.db.exec("CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON delivery_audit BEGIN SELECT RAISE(ABORT, 'injected fault'); END;");
    expect(() => dal.transition({ id: 'REQ-102', record: record('ready'), entry: entry('release', 'backlog', 'ready') })).toThrow(/injected fault/);
    r.db.exec('DROP TRIGGER temp.fail_audit');
    expect(dal.read('REQ-102')).toBeUndefined();
    expect(dal.historyOf('REQ-102')).toHaveLength(0);
    expect(dal.auditAll()).toHaveLength(0);
    // And the same unit succeeds once the fault is gone: nothing half-written was left to collide with.
    expect(dal.transition({ id: 'REQ-102', record: record('ready'), entry: entry('release', 'backlog', 'ready') })).toEqual({ seq: 1, pruned: 0 });
  });

  it('REQ-CONFIG-192 history_limit: the prune is a DELETE inside the transaction, the counter says how many went (REQ-TRACE-405)', () => {
    const dal = new DeliveryDal(r.db);
    for (let i = 0; i < DELIVERY_HISTORY_LIMIT + 7; i++) dal.transition({ id: 'REQ-103', record: record(i % 2 ? 'ready' : 'backlog'), entry: entry(i % 2 ? 'release' : 'return', i % 2 ? 'backlog' : 'ready', i % 2 ? 'ready' : 'backlog') });
    const kept = dal.historyOf('REQ-103');
    expect(kept).toHaveLength(DELIVERY_HISTORY_LIMIT);
    expect(kept[0]!.seq).toBe(8);
    expect(kept[kept.length - 1]!.seq).toBe(DELIVERY_HISTORY_LIMIT + 7);
    expect(dal.droppedHistory('REQ-103')).toBe(7);
    // The audit is NOT pruned: every transition is there, in the order taken (REQ-TRACE-514's "none omitted").
    expect(dal.auditOf('REQ-103')).toHaveLength(DELIVERY_HISTORY_LIMIT + 7);
    // A configured limit reaches the same statement.
    const before = dal.historyOf('REQ-103').length;
    const out = dal.transition({ id: 'REQ-103', record: record('ready'), entry: entry('release', 'backlog', 'ready'), historyLimit: 10 });
    expect(out.pruned).toBe(before - 9);
    expect(dal.historyOf('REQ-103')).toHaveLength(10);
  });

  it('REQ-TRACE-405: the audit is append-only — an UPDATE is refused by the store itself', () => {
    const dal = new DeliveryDal(r.db);
    dal.transition({ id: 'REQ-104', record: record('ready'), entry: entry('release', 'backlog', 'ready') });
    expect(() => r.db.prepare("UPDATE delivery_audit SET action = 'accept' WHERE req_id = 'REQ-104'").run()).toThrow(/append-only/);
  });

  it('REQ-TRACE-401: an override is marked as one and carries its grounds', () => {
    const dal = new DeliveryDal(r.db);
    dal.transition({ id: 'REQ-105', record: record('done'), entry: entry('accept', 'review', 'done', { override: true, reason: 'The suite is known-flaky on this host; verified by hand.' }) });
    expect(dal.historyOf('REQ-105')[0]).toMatchObject({ override: 1, reason: 'The suite is known-flaky on this host; verified by hand.' });
    expect(dal.auditOf('REQ-105')[0]).toMatchObject({ override: 1 });
  });

  it('REQ-CONFIG-192 forward tolerance: a higher version is unsupported and not interpreted; below 1, absent or non-integer is unreadable; neither is touched by a read', () => {
    const dal = new DeliveryDal(r.db);
    dal.transition({ id: 'REQ-201', record: record('ready'), entry: entry('release', 'backlog', 'ready') });
    const later = JSON.stringify({ schemaVersion: DELIVERY_RECORD_VERSION + 1, state: 'shipped', updatedAt: 'x', newField: true });
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-202', ?, 'shipped', NULL, NULL, NULL, 3, 'x', ?)").run(DELIVERY_RECORD_VERSION + 1, later);
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-203', 'one', 'ready', NULL, NULL, NULL, 0, 'x', '{}')").run();
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-204', NULL, 'ready', NULL, NULL, NULL, 0, 'x', '{}')").run();
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-205', 0, 'ready', NULL, NULL, NULL, 0, 'x', '{}')").run();
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-206', 1, 'ready', NULL, NULL, NULL, 0, 'x', 'not json')").run();
    const before = r.db.prepare('SELECT * FROM delivery ORDER BY req_id').all();
    const rows = dal.readAll();
    expect(rows.map((x) => [x.id, x.kind])).toEqual([['REQ-201', 'record'], ['REQ-202', 'unsupported'], ['REQ-203', 'unreadable'], ['REQ-204', 'unreadable'], ['REQ-205', 'unreadable'], ['REQ-206', 'unreadable']]);
    const unsupported = rows[1]!;
    if (unsupported.kind !== 'unsupported') throw new Error('unreachable');
    expect(unsupported.version).toBe(DELIVERY_RECORD_VERSION + 1);
    expect(unsupported.raw).toBe(later); // exported as it stands (REQ-TRACE-514)
    // No write on read: the rows are byte-identical after the read (ADR-0041 commitment 3).
    expect(r.db.prepare('SELECT * FROM delivery ORDER BY req_id').all()).toEqual(before);
    // The neighbours read normally — a workspace holding an unsupported record still opens and still runs.
    expect(rows[0]!.kind).toBe('record');
  });

  it('runs, worktrees, blockers and tombstones round-trip', () => {
    const dal = new DeliveryDal(r.db);
    dal.recordRunStarted({ id: 'REQ-301', unit: 'u1', sessionId: 'sess-1', worktreeRef: 'wt-1', permissions: 'autonomous+unsandboxed', startedAt: 't1', stage: 'implementing' });
    dal.upsertWorktree({ ref: 'wt-1', id: 'REQ-301', unit: 'u1', path: 'C:\\ws\\.rotaris\\req\\REQ-301-u1', branch: 'req/REQ-301/u1', createdAt: 't1', kept: false });
    expect(dal.runsWithStatus('running')).toHaveLength(1);
    expect(dal.runsOf('REQ-301')[0]).toMatchObject({ session_id: 'sess-1', status: 'running', stage: 'implementing', permissions: 'autonomous+unsandboxed' });
    expect(dal.recordRunEnded({ id: 'REQ-301', unit: 'u1', status: 'interrupted', outcome: 'interrupted, work retained', endedAt: 't2' })).toBe(true);
    expect(dal.runsWithStatus('running')).toHaveLength(0);
    expect(dal.runsOf('REQ-301')[0]).toMatchObject({ status: 'interrupted', outcome: 'interrupted, work retained', stage: null });
    expect(dal.worktreesOf('REQ-301')[0]).toMatchObject({ branch: 'req/REQ-301/u1', kept: 0 });
    const seq = dal.raiseBlocker({ id: 'REQ-301', kind: 'stated', reason: 'Waiting on the licence decision.', options: [], blockingIds: [], runUnit: null, raisedAt: 't2' });
    expect(seq).toBe(1);
    expect(dal.openBlockersOf('REQ-301')).toHaveLength(1);
    expect(dal.answerOpenBlockers('REQ-301', 't3', 'resume')).toBe(1);
    expect(dal.openBlockersOf('REQ-301')).toHaveLength(0);
    expect(dal.blockersOf('REQ-301')[0]).toMatchObject({ answered_at: 't3', answer: 'resume' });
    dal.tombstone('REQ-999', 't4', 'f'.repeat(32));
    dal.tombstone('REQ-999', 't5', null); // OR IGNORE: a retired id is recorded once and never re-issued
    expect(dal.tombstones()).toEqual([{ req_id: 'REQ-999', retired_at: 't4', last_hash: 'f'.repeat(32) }]);
  });

  it('REQ-TRACE-405/476: a run row names its session as a fact and survives that session\'s deletion — no foreign key, no cascade', () => {
    const dal = new DeliveryDal(r.db);
    r.db.prepare("INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at) VALUES ('sess-1', 'completed', 'C:\\ws', 't', 't')").run();
    dal.recordRunStarted({ id: 'REQ-401', unit: 'u1', sessionId: 'sess-1', worktreeRef: null, permissions: '', startedAt: 't' });
    r.db.prepare("DELETE FROM sessions WHERE session_id = 'sess-1'").run();
    expect(dal.runsOf('REQ-401')).toHaveLength(1);
    expect(dal.runsOf('REQ-401')[0]!.session_id).toBe('sess-1');
  });

  it('spike 8\'s rule: the history read and the prune name the primary key in EXPLAIN QUERY PLAN — no scan', () => {
    const plan = (sql: string, ...args: unknown[]) => (r.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((p) => p.detail).join(' | ');
    const read = plan('SELECT * FROM delivery_history WHERE req_id = ? ORDER BY seq', 'REQ-1');
    const prune = plan('DELETE FROM delivery_history WHERE req_id = ? AND seq <= ?', 'REQ-1', 1);
    const open = plan('SELECT * FROM delivery_blockers WHERE req_id = ? AND answered_at IS NULL ORDER BY seq', 'REQ-1');
    for (const p of [read, prune, open]) {
      expect(p).toMatch(/USING (INDEX sqlite_autoindex_delivery_\w+_1|PRIMARY KEY)/);
      expect(p).not.toMatch(/SCAN|TEMP B-TREE/);
    }
  });
});
