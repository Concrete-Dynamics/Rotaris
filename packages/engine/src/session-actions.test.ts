import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, RING_CAPS, StoreDal } from '@rotaris/store';
import { batchDocument, readRecords, readTrajectory, renderExport, Sessions, summariseTrajectory, timelineId, trajectoryWarnings, writeExport, DELETE_LIVE_REFUSAL, DELETE_LIVENESS_UNKNOWN_REFUSAL, type JsonValue } from './index.js';

/**
 * The immutable-attribute refusal, for the uid that ignores mode bits. Root bypasses DAC, so a write-denied
 * parent does not refuse its rename; a file marked immutable it cannot rename over either — EPERM, the transient
 * class the ladder retries. Setting the flag needs exactly that privilege, so an unprivileged user cannot set it
 * and does not need to: for that uid the parent's mode still refuses the staging write. `chattr` is Linux,
 * `chflags` macOS; anywhere else, or without the privilege, this returns false and the caller falls back.
 */
const IMMUTABLE_SET = process.platform === 'linux' ? (['chattr', '+i'] as const) : process.platform === 'darwin' ? (['chflags', 'uchg'] as const) : null;
const IMMUTABLE_CLEAR = process.platform === 'linux' ? (['chattr', '-i'] as const) : process.platform === 'darwin' ? (['chflags', 'nouchg'] as const) : null;
function makeImmutable(path: string): boolean {
  if (!IMMUTABLE_SET) return false;
  try { execFileSync(IMMUTABLE_SET[0], [IMMUTABLE_SET[1], path], { stdio: 'ignore' }); return true; } catch { return false; }
}
function clearImmutable(path: string): void {
  if (!IMMUTABLE_CLEAR) return;
  try { execFileSync(IMMUTABLE_CLEAR[0], [IMMUTABLE_CLEAR[1], path], { stdio: 'ignore' }); } catch { /* best effort */ }
}

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
const WS = 'C:/ws';

/**
 * Part U — the session browser's actions on the engine side: REQ-SESSION-060's explicit repair as one unit, REQ-SESSION-166's
 * delete, REQ-SESSION-199's records export and REQ-SESSION-153/189's trajectory export. Sessions are PLANTED as rows (a dead
 * process leaves exactly rows), never run.
 */
describe('Part U — repair, delete and the exports', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-actions-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const alive = new Set<number>();
  const sessions = (pid = 500) => new Sessions({
    clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid, host: HOST,
    retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-new', model: null,
    sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
    isProcessAlive: (p) => alive.has(p),
  });
  const plant = (raw: string, status: string, extra: { lock?: { pid: number; host?: MachineId }; progress?: string; worktree?: string | null } = {}): SessionId => {
    const sid = asSessionId(raw);
    dal.upsertSession({ session_id: raw, execution_status: status, workspace_root: WS, created_at: '2026-09-05T10:00:00.000Z', updated_at: '2026-09-05T10:05:00.000Z', worktree: extra.worktree ?? null });
    if (extra.progress !== undefined) dal.updateSessionRun(sid, { progress: extra.progress });
    if (extra.lock) dal.claimLock(sid, extra.lock.pid, extra.lock.host ?? HOST, '2026-09-05T10:00:00.000Z');
    dal.appendRow(sid, 0, 'user', true, `prompt of ${raw}`);
    return sid;
  };

  describe('REQ-SESSION-057/059/060/182: the explicit repair', () => {
    it('a running session whose lock names a dead pid is repaired: interrupted first and durable, the timeline entry, the lock released, the reason naming the pid', () => {
      const sid = plant('S-dead', 'running', { lock: { pid: 4242 } });
      const s = sessions();
      expect(s.list(dal, WS).find((r) => r.sessionId === 'S-dead')?.stale).toBe(true);
      const report = s.repair(dal, WS, { sessionId: 'S-dead' });
      expect(report.nothingStale).toBe(false);
      expect(report.repaired).toEqual([{ sessionId: 'S-dead', from: 'running', to: 'interrupted', reason: 'the lock names this machine and its process (pid 4242) is gone' }]);
      expect(dal.getSession(sid)?.execution_status).toBe('interrupted');
      expect(dal.getLock(sid)).toBeUndefined();
      // REQ-SESSION-062 fixes the entry exactly: type, severity, actor, message and the three metadata keys.
      const t = dal.timelineOf(sid).filter((e) => e.name === 'session.interrupted_recovered');
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({ severity: 'warning', actor: 'rotaris', message: "Session was still marked 'running' but the lock names this machine and its process (pid 4242) is gone; status set to 'interrupted'." });
      expect(JSON.parse(t[0]!.metadata)).toEqual({ previous_execution_status: 'running', execution_status: 'interrupted', reason: 'the lock names this machine and its process (pid 4242) is gone' });
      expect(s.list(dal, WS).find((r) => r.sessionId === 'S-dead')).toMatchObject({ status: 'interrupted', stale: false });
    });

    it('a running session with no lock at all is stale for that reason; a live lock is never repaired; a terminal status is not stale', () => {
      alive.add(777);
      plant('S-nolock', 'running');
      plant('S-live', 'running', { lock: { pid: 777 } });
      plant('S-done', 'completed');
      const s = sessions();
      const rows = Object.fromEntries(s.list(dal, WS).map((r) => [r.sessionId, r.stale]));
      expect(rows).toEqual({ 'S-nolock': true, 'S-live': false, 'S-done': false });
      const one = s.repair(dal, WS, { sessionId: 'S-live' });
      expect(one.repaired).toEqual([]);
      expect(one.nothingStale).toBe(true);
      expect(one.skipped[0]?.reason).toContain('still holds its lock');
      expect(dal.getSession(asSessionId('S-live'))?.execution_status).toBe('running');
      expect(dal.getLock(asSessionId('S-live'))?.pid).toBe(777);
      const all = s.repair(dal, WS, { all: true });
      expect(all.repaired.map((r) => [r.sessionId, r.reason])).toEqual([['S-nolock', 'no process holds a lock for it']]);
      expect(dal.getSession(asSessionId('S-live'))?.execution_status).toBe('running');
      expect(dal.getSession(asSessionId('S-done'))?.execution_status).toBe('completed');
      alive.delete(777);
    });

    it('OQ-46 / REQ-SESSION-062/063: a run-host crash stales several sessions at once — every one of them is repaired inside the one call and every one gets its own entry', () => {
      // ADR-0002's accepted consequence: one stale session per in-flight run.
      for (const id of ['S-c1', 'S-c2', 'S-c3']) plant(id, 'running', { lock: { pid: 4242 } });
      const s = sessions();
      const all = s.repair(dal, WS, { all: true });
      expect(all.repaired.map((r) => r.sessionId)).toEqual(['S-c1', 'S-c2', 'S-c3']);
      // The batch has settled when the call returns: nothing is left in an active status for the caller to act on.
      expect(s.list(dal, WS).map((r) => [r.sessionId, r.status, r.stale])).toEqual([
        ['S-c1', 'interrupted', false], ['S-c2', 'interrupted', false], ['S-c3', 'interrupted', false],
      ]);
      // REQ-SESSION-062: one entry per session, in that session's own record — never folded into a neighbour's.
      for (const id of ['S-c1', 'S-c2', 'S-c3']) {
        const entries = dal.timelineOf(asSessionId(id)).filter((e) => e.name === 'session.interrupted_recovered');
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ severity: 'warning', actor: 'rotaris' });
        expect(JSON.parse(entries[0]!.metadata)).toMatchObject({ previous_execution_status: 'running', execution_status: 'interrupted' });
      }
      // REQ-SESSION-063: a second pass repairs nothing and writes nothing.
      const again = s.repair(dal, WS, { all: true });
      expect(again.repaired).toEqual([]);
      expect(dal.timelineOf(asSessionId('S-c1')).filter((e) => e.name === 'session.interrupted_recovered')).toHaveLength(1);
    });

    it('nothing stale is an explicit answer; a missing id and a foreign-host lock are skipped with reasons, untouched', () => {
      plant('S-done', 'completed');
      plant('S-foreign', 'running', { lock: { pid: 1, host: OTHER } });
      const s = sessions();
      const all = s.repair(dal, WS, { all: true });
      expect(all).toEqual({ repaired: [], skipped: [], nothingStale: true });
      const missing = s.repair(dal, WS, { sessionId: 'S-none' });
      expect(missing.nothingStale).toBe(true);
      expect(missing.skipped).toEqual([{ sessionId: 'S-none', reason: 'no session exists under that id in this workspace' }]);
      const foreign = s.repair(dal, WS, { sessionId: 'S-foreign' });
      expect(foreign.skipped[0]?.reason).toContain('still holds its lock');
      expect(dal.getLock(asSessionId('S-foreign'))?.host).toBe(OTHER);
    });

    it('REQ-SESSION-041: unreadable stored state is "nothing to do" for the repair and the row says so in the listing', () => {
      plant('S-corrupt', 'running', { progress: '{not json' });
      const s = sessions();
      const row = s.list(dal, WS).find((r) => r.sessionId === 'S-corrupt');
      expect(row?.stale).toBe(true);
      expect(row?.unreadable).toContain('unreadable stored state');
      const r = s.repair(dal, WS, { sessionId: 'S-corrupt' });
      expect(r.repaired).toEqual([]);
      expect(r.skipped[0]?.reason).toContain('cannot be read');
      expect(dal.getSession(asSessionId('S-corrupt'))?.execution_status).toBe('running');
    });

    it('REQ-SESSION-171 (defect 40): the listing and liveness() agree on a lock this process holds with no run behind it — a loaded session left running by a crash is stale, and repaired with that reason', () => {
      // The route ADR-0039's note described: a resume reaps the dead lock and claims it, but the status stays `running`.
      const sid = plant('S-mine', 'running', { lock: { pid: 4242 } });
      const s = sessions(500);
      const resumed = s.resume(dal, WS, sid);
      expect(resumed.ok).toBe(true);
      expect(dal.getLock(sid)?.pid).toBe(500);
      expect(s.liveness(dal, sid)).toBe('not-live');
      // Before Part U the listing's own predicate answered "live" here (its own pid probes alive) while liveness() answered not-live.
      expect(s.list(dal, WS).find((r) => r.sessionId === 'S-mine')?.stale).toBe(true);
      const r = s.repair(dal, WS, { sessionId: 'S-mine' });
      expect(r.repaired[0]?.reason).toBe('this application holds its lock but runs nothing for it');
      expect(dal.getSession(sid)?.execution_status).toBe('interrupted');
      expect(s.list(dal, WS).find((r) => r.sessionId === 'S-mine')?.stale).toBe(false);
    });
  });

  describe('REQ-SESSION-166 / REQ-GIT-069: the delete', () => {
    it('prepares with the tree of the binding, else the workspace root; refuses a live and an unknown session with distinct sentences; a missing one is missing', () => {
      plant('S-root', 'completed');
      plant('S-bound', 'completed', { worktree: JSON.stringify({ worktree_path: 'C:/ws/.rotaris/worktrees/S-bound', branch: 'feat/x', base_branch: 'main', base_revision: 'abc', created_at: '2026-09-05T10:00:00.000Z', mode: 'isolated' }) });
      alive.add(777);
      plant('S-live', 'running', { lock: { pid: 777 } });
      const s = sessions();
      expect(s.prepareDelete(dal, WS, asSessionId('S-root'))).toMatchObject({ kind: 'ready', treeRoot: WS, unreadable: null, checkpoints: 0 });
      const bound = s.prepareDelete(dal, WS, asSessionId('S-bound'));
      expect(bound.kind === 'ready' ? bound.treeRoot : null).toBe('C:/ws/.rotaris/worktrees/S-bound');
      expect(s.prepareDelete(dal, WS, asSessionId('S-live'))).toEqual({ kind: 'live', reason: DELETE_LIVE_REFUSAL });
      expect(s.prepareDelete(dal, WS, asSessionId('S-none'))).toEqual({ kind: 'missing' });
      alive.delete(777);
      // No probe at all → liveness unknown → the second sentence, never a delete.
      const blind = new Sessions({ clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 1, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'x', model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid) });
      expect(blind.prepareDelete(dal, WS, asSessionId('S-live'))).toEqual({ kind: 'live', reason: DELETE_LIVENESS_UNKNOWN_REFUSAL });
    });

    it('completes in one transaction: the row, its checkpoints, events and timeline gone, the files gone, the other session intact; an unreadable session still deletes; a second delete is a no-op', () => {
      const gone = plant('S-gone', 'interrupted', { progress: '{broken' });
      const kept = plant('S-kept', 'completed');
      for (const sid of [gone, kept]) {
        dal.insertCheckpoint({ session_id: sid, sequence: 1, ref: `refs/rotaris/checkpoints/${sid}/1`, commit_id: 'c1', created_at: 't', iteration: 1, child_name: '', files: '["a"]', kind: 'iteration' });
        dal.insertCheckpoint({ session_id: sid, sequence: 2, ref: `refs/rotaris/checkpoints/${sid}/2`, commit_id: 'c2', created_at: 't', iteration: 2, child_name: '', files: '["b"]', kind: 'iteration' });
        dal.insertEvent(sid, 1, 'session.start', 't', 1, null, '{"event":"session.start"}');
        dal.insertTimeline(sid, 1, 't', 'run_start', 'rotaris', 'started', '{}', timelineId(), 'info');
        mkdirSync(join(dir, 'sessions', sid), { recursive: true });
        writeFileSync(join(dir, 'sessions', sid, 'summary.md'), '# summary\n');
      }
      const s = sessions();
      const prepared = s.prepareDelete(dal, WS, gone);
      expect(prepared).toMatchObject({ kind: 'ready', checkpoints: 2 });
      expect(prepared.kind === 'ready' ? prepared.unreadable : null).toContain('unreadable stored state');
      const done = s.completeDelete(dal, gone);
      expect(done).toEqual({ existed: true, filesRemoved: true, filesDetail: null });
      expect(dal.getSession(gone)).toBeUndefined();
      expect(dal.listCheckpoints(gone)).toEqual([]);
      expect(dal.eventCount(gone)).toBe(0);
      expect(dal.timelineOf(gone)).toEqual([]);
      expect(dal.rowCount(gone)).toBe(0);
      expect(existsSync(join(dir, 'sessions', gone))).toBe(false);
      expect(dal.getSession(kept)).toBeDefined();
      expect(dal.listCheckpoints(kept)).toHaveLength(2);
      expect(existsSync(join(dir, 'sessions', kept, 'summary.md'))).toBe(true);
      expect(s.list(dal, WS).map((r) => r.sessionId)).toEqual(['S-kept']);
      expect(s.completeDelete(dal, gone)).toEqual({ existed: false, filesRemoved: false, filesDetail: null });
    });
  });

  describe('REQ-SESSION-199 / ADR-0024: the four records', () => {
    it('an empty session exports four empty records, never nothing; the rings say complete', () => {
      const sid = plant('S-empty', 'completed');
      const r = readRecords(dal, sid, clock.wall)!;
      const doc = r.document as { timeline: unknown[]; issues: { entries: unknown[]; complete: boolean; dropped: number }; permission_audit: { entries: unknown[]; complete: boolean; cap: number }; metrics: { session_id: string; tool_call_records: number } };
      expect(Object.keys(doc).sort()).toEqual(['issues', 'metrics', 'permission_audit', 'timeline']);
      expect(doc.timeline).toEqual([]);
      expect(doc.issues).toMatchObject({ entries: [], complete: true, dropped: 0 });
      expect(doc.permission_audit).toMatchObject({ entries: [], complete: true, cap: RING_CAPS.permission_audit });
      expect(doc.metrics).toMatchObject({ session_id: 'S-empty', tool_call_records: 0 });
      expect(readRecords(dal, asSessionId('S-none'), clock.wall)).toBeUndefined();
    });

    it('a capped audit exports complete:false with the drop count, entries in stored order, and the arithmetic a stock parser can check', () => {
      const sid = plant('S-capped', 'completed');
      const cap = RING_CAPS.permission_audit;
      const total = cap + 3;
      dal.transaction(() => {
        for (let i = 1; i <= total; i++) {
          dal.ringInsert('permission_audit', sid, (ordinal) => dal.insertAudit({ session_id: sid, ordinal, recorded_at: `2026-09-05T10:00:${String(i % 60).padStart(2, '0')}.000Z`, kind: i === 2 ? 'mode_change' : 'decision', entry: JSON.stringify({ id: ordinal, tool_name: `t${i}`, decision: i % 7 === 0 ? 'deny' : 'allow', source: 'policy', summary: 's' }), agent_id: 'a', persona: 'p', tool_name: `t${i}`, decision: i % 7 === 0 ? 'deny' : 'allow', rule_id: 'r', source: 'policy' }));
        }
        dal.ringInsert('issues', sid, (ordinal) => dal.insertIssue({ session_id: sid, ordinal, id: 'abcdefabcdef', recorded_at: 't', kind: 'permission_denied', severity: 'warning', actor: 'gate', message: 'denied', evidence_ref: 'permission_audit#7', metadata: '{}' }));
        dal.insertTimeline(sid, 1, 't1', 'run_start', 'rotaris', 'started', '{"a":1}', 'aaaaaaaaaaaa', 'info');
        dal.insertTimeline(sid, 2, 't2', 'issue', 'gate', 'denied', '{}', 'bbbbbbbbbbbb', 'warning');
        // An entry as a store written before schema v10 holds one: no id, the severity column at its default.
        dal.db.exec("INSERT INTO timeline (session_id, ordinal, at, name, actor, message, metadata) VALUES ('" + sid + "', 3, 't3', 'run_end', 'rotaris', 'ended', '{}')");
      });
      const r = readRecords(dal, sid, clock.wall)!;
      const audit = (r.document as { permission_audit: { cap: number; dropped: number; retained: number; oldest_ordinal: number; newest_ordinal: number; complete: boolean; entries: { ordinal: number; kind: string; entry: { id: number; tool_name: string } }[] } }).permission_audit;
      expect(audit.complete).toBe(false);
      expect(audit.dropped).toBe(3);
      expect(audit.retained).toBe(cap);
      expect(audit.entries).toHaveLength(cap);
      // ADR-0024's arithmetic: dropped + retained == newest, contiguous from oldest, oldest - 1 == dropped.
      expect(audit.dropped + audit.retained).toBe(audit.newest_ordinal);
      expect(audit.oldest_ordinal - 1).toBe(audit.dropped);
      expect(audit.entries.every((e, i) => e.ordinal === audit.oldest_ordinal + i)).toBe(true);
      expect(audit.entries[0]!.entry.tool_name).toBe('t4');
      expect(audit.entries[0]!.entry.id).toBe(4);
      // The one locator carried in the issues record is carried, not resolved.
      const issues = (r.document as { issues: { entries: { entry: { evidence_ref: string; id: string } }[] } }).issues;
      expect(issues.entries[0]!.entry).toMatchObject({ id: 'abcdefabcdef', evidence_ref: 'permission_audit#7' });
      const timeline = (r.document as { timeline: { ordinal: number; id?: string; severity: string; type: string; metadata: unknown }[] }).timeline;
      expect(timeline.map((t) => [t.ordinal, t.type])).toEqual([[1, 'run_start'], [2, 'issue'], [3, 'run_end']]);
      expect(timeline[0]!.metadata).toEqual({ a: 1 });
      // REQ-SESSION-134 / REQ-SESSION-199 (the repair of defect 42): the id and severity are exported for an entry that
      // has them, and the id — never the severity — is omitted for an entry recorded before the columns existed.
      expect(timeline.map((t) => [t.id, t.severity])).toEqual([['aaaaaaaaaaaa', 'info'], ['bbbbbbbbbbbb', 'warning'], [undefined, 'info']]);
      expect(Object.keys(timeline[2]!)).not.toContain('id');
      const metrics = (r.document as { metrics: { permission_decisions: number; permission_denials: number; mode_changes: number; issues_by_kind: Record<string, number> } }).metrics;
      expect(metrics.mode_changes).toBe(0); // ordinal 2 was displaced by the cap: counts describe what is stored (REQ-SESSION-139)
      expect(metrics.permission_decisions).toBe(cap);
      expect(metrics.issues_by_kind).toEqual({ permission_denied: 1 });
      expect(r.counts.audit_dropped).toBe(3);
    });
  });

  describe('REQ-SESSION-153/189/193, REQ-EVENTS-132/144/145: the trajectory', () => {
    const event = (sid: string, ordinal: number, kind: string, payload: Record<string, unknown>) => dal.insertEvent(asSessionId(sid), ordinal, kind, `2026-09-05T10:00:${String(ordinal).padStart(2, '0')}.000Z`, 1, null, JSON.stringify({ ...payload, event: kind, session_id: sid, timestamp: `2026-09-05T10:00:${String(ordinal).padStart(2, '0')}.000Z`, schema_version: 1 }));

    it('one session: the fixed key inventory, identity from the latest session.start, events in stored order, the summary from the events alone', () => {
      const sid = plant('S-traj', 'completed');
      dal.updateSessionRun(sid, { stop_reason: 'tasks_complete' });
      event('S-traj', 1, 'session.start', { task: 'first', workspace_root: 'D:/elsewhere/ws', persona: 'orchestrator', permission_mode: 'ask', sandbox: { enabled: false, backend: '' }, max_iterations: 3 });
      event('S-traj', 2, 'iteration.start', { iteration: 1, task: 'first' });
      event('S-traj', 3, 'tool.start', { tool_name: 'glob', call_id: 'c1', arguments: {} });
      event('S-traj', 4, 'tool.finish', { tool_name: 'glob', call_id: 'c1', status: 'completed', duration_ms: 3, error: null });
      event('S-traj', 5, 'permission.decision', { tool_name: 'glob', decision: 'deny', source: 'policy', rule_id: 'r', summary: 's', request_id: '' });
      event('S-traj', 6, 'error', { message: 'x', error_class: 'tool_error', detail: 'issues#abc', fatal: false });
      event('S-traj', 7, 'session.end', { status: 'interrupted', stop_reason: 'user_cancelled', iterations_completed: 1, duration_seconds: 6, tokens: { input: 5, output: 2, total: 7 }, cost: { total: '0.1' } });
      event('S-traj', 8, 'session.start', { task: 'second', workspace: 'D:/elsewhere/ws', persona: 'orchestrator', permission_mode: 'autonomous', sandboxed: false, max_iterations: 3 });
      event('S-traj', 9, 'made.up', { anything: true });
      event('S-traj', 10, 'usage.update', { tokens: { input: 9, output: 4, total: 13 }, cost: { total: '0.25' } });
      dal.insertEvent(sid, 11, 'result', 't', 1, null, '{not json');
      const t = readTrajectory(dal, sid)!;
      const doc = t.document as Record<string, unknown>;
      expect(Object.keys(doc).sort()).toEqual(['dropped_events', 'duration_seconds', 'ended_at', 'events', 'permission_mode', 'session_id', 'started_at', 'status', 'stop_reason', 'summary', 'task', 'trajectory_version', 'truncated', 'workspace']);
      expect(doc).toMatchObject({ trajectory_version: 1, session_id: 'S-traj', task: 'second', workspace: 'D:/elsewhere/ws', permission_mode: 'autonomous', status: 'unknown', stop_reason: '', truncated: false, dropped_events: 0, started_at: '2026-09-05T10:00:08.000Z', ended_at: '', duration_seconds: 0 });
      expect((doc['events'] as unknown[]).length).toBe(10);
      expect(doc['summary']).toMatchObject({ events: 10, unknown_events: 1, warnings: 1, runs: 2, iterations: 1, tool_calls: 1, tool_failures: 0, permission_decisions: 1, permission_denials: 1, child_agents: 0, errors: 1, fatal_errors: 0, tokens: { input: 9, output: 4, total: 13 }, cost: '0.25' });
      expect((doc['summary'] as { event_types: Record<string, number> }).event_types['made.up']).toBe(1);
      expect(trajectoryWarnings('S-traj', t)).toEqual([
        'Session S-traj was resumed: the document spans 2 runs and its identity fields describe the most recent one.',
        'Session S-traj: 1 stored line could not be decoded and is not in the document.',
      ]);
      expect(JSON.stringify(doc)).not.toContain(dir.replace(/\\/g, '/'));
    });

    it('derives terminal outcome within the latest run and falls back to its result', () => {
      const sid = plant('S-segment', 'completed');
      event('S-segment', 1, 'session.start', { task: 'old' });
      event('S-segment', 2, 'session.end', { status: 'completed', stop_reason: 'old', duration_seconds: 99 });
      event('S-segment', 3, 'result', { status: 'completed', stop_reason: 'old' });
      event('S-segment', 4, 'session.start', { task: 'new' });
      expect(readTrajectory(dal, sid)!.document).toMatchObject({ task: 'new', status: 'unknown', stop_reason: '', ended_at: '', duration_seconds: 0 });
      event('S-segment', 5, 'result', { result: { status: 'interrupted', stop_reason: 'user_cancelled' } });
      expect(readTrajectory(dal, sid)!.document).toMatchObject({ status: 'interrupted', stop_reason: 'user_cancelled', ended_at: '2026-09-05T10:00:05.000Z', duration_seconds: 1 });
      event('S-segment', 6, 'session.end', { status: 'failed', stop_reason: 'failure', duration_seconds: 1.5 });
      event('S-segment', 7, 'usage.update', { tokens: { total: 5 } });
      expect(readTrajectory(dal, sid)!.document).toMatchObject({ status: 'failed', stop_reason: 'failure', ended_at: '2026-09-05T10:00:06.000Z', duration_seconds: 1.5 });
    });

    it("A6 / REQ-EVENTS-138: a duration is only ever the outcome's own — an end with no status supplies neither, and a result that supplies the status supplies its duration too", () => {
      // An end carrying the figure but no status: the segment is unfinished, so status is unknown and the duration is zero.
      const unfinished = plant('S-nostatus', 'running');
      event('S-nostatus', 1, 'session.start', { task: 't' });
      event('S-nostatus', 2, 'session.end', { stop_reason: 'partway', duration_seconds: 77 });
      expect(readTrajectory(dal, unfinished)!.document).toMatchObject({ status: 'unknown', stop_reason: '', ended_at: '', duration_seconds: 0 });
      // A result supplying the outcome supplies its duration: it takes precedence over the two timestamps' elapsed time.
      const viaResult = plant('S-viaresult', 'completed');
      event('S-viaresult', 1, 'session.start', { task: 't' });
      event('S-viaresult', 5, 'result', { result: { status: 'completed', stop_reason: 'tasks_complete', duration_seconds: 2.5 } });
      expect(readTrajectory(dal, viaResult)!.document).toMatchObject({ status: 'completed', stop_reason: 'tasks_complete', ended_at: '2026-09-05T10:00:05.000Z', duration_seconds: 2.5 });
    });

    /**
     * A9 / REQ-EVENTS-145 / REQ-TRACE-061: the destination-failure half. The refusal is REAL — a reader's open
     * descriptor on Windows (constraint D-06, the condition the ladder exists for), an immutable target for a
     * uid that ignores mode bits (root), a write-denied parent for an unprivileged uid — never a stubbed `fs`,
     * because what is under test is that the previous export survives the refusal and that the refusal is
     * recoverable, and a stub proves nothing about either.
     *
     * The refusals do not all land in the same place, and the test says which rather than pretending they do.
     * An open descriptor, and an immutable target, leave ADR-0004's STAGING write untouched and refuse only the
     * rename — the ladder's own condition, so the exhaustion is observable and the error is `document.replace`
     * "after 5 attempts". A write-denied parent refuses BOTH, and the staging write is the first to be refused
     * — `document.stage`, ADR-0004's own separate outcome, reached before any rename is attempted; no unprivileged
     * POSIX permission can deny the rename while allowing the staging write into the same directory, so that uid
     * takes the staging path (found on Linux, 2026-09-16). Root ignores those mode bits, so a `chmod 0o555`
     * refusal it silently rename-through was the defect this test's two notes recorded; the immutable attribute,
     * which root cannot set aside for a rename, restores a real laddered refusal for it.
     */
    const refuseReplacement = (target: string): { readonly release: () => void; readonly code: string; readonly laddered: boolean } => {
      if (process.platform === 'win32') {
        const fd = fs.openSync(target, 'r');
        return { release: () => fs.closeSync(fd), code: 'document.replace', laddered: true };
      }
      if (makeImmutable(target)) {
        return { release: () => clearImmutable(target), code: 'document.replace', laddered: true };
      }
      const parent = join(target, '..');
      const before = fs.statSync(parent).mode;
      fs.chmodSync(parent, 0o555);
      return { release: () => fs.chmodSync(parent, before), code: 'document.stage', laddered: false };
    };

    it('A9 / REQ-EVENTS-145 / REQ-TRACE-061: a destination that cannot be replaced exhausts the ladder, reports recoverably and leaves the previous export exactly as it was', async () => {
      const target = join(dir, 'exports', 'previous.json');
      const first = await writeExport(target, { generation: 1 } as unknown as JsonValue, clock.timers);
      expect(first.ok).toBe(true);
      const before = readFileSync(target, 'utf8');
      const refusal = refuseReplacement(target);
      let failed;
      try {
        const attempt = writeExport(target, { generation: 2 } as unknown as JsonValue, clock.timers);
        // REQ-TRACE-061's ladder: four waits of 0.05 / 0.1 / 0.2 / 0.4 s behind five attempts in total.
        for (let i = 0; i < 6; i += 1) { for (let j = 0; j < 8; j += 1) await Promise.resolve(); clock.advance(400); }
        failed = await attempt;
      } finally { refusal.release(); }
      expect(failed.ok).toBe(false);
      if (failed.ok) throw new Error('unreachable');
      expect(failed.error.code).toBe(refusal.code);
      if (refusal.laddered) expect(failed.error.detail).toContain('after 5 attempts');
      // The previous export is byte-identical and no staged leftover sits beside it.
      expect(readFileSync(target, 'utf8')).toBe(before);
      expect(readdirSync(join(dir, 'exports'))).toEqual(['previous.json']);
    });

    it('A9 / REQ-EVENTS-145: a destination whose parent cannot be created is a recoverable refusal, not a raised exception', async () => {
      // A file standing where the export's parent directory would go: the create fails, and the caller must still get a Result.
      const blocked = join(dir, 'blocked');
      writeFileSync(blocked, 'not a directory');
      const r = await writeExport(join(blocked, 'nested', 'export.json'), { a: 1 } as unknown as JsonValue, clock.timers);
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error('unreachable');
      expect(r.error.code).toBe('document.parent');
      expect(readFileSync(blocked, 'utf8')).toBe('not a directory');
    });

    it('a capped history reports its drop count and the warning; a batch keeps selection order under the three-key wrapper', async () => {
      plant('S-a', 'completed');
      plant('S-b', 'completed');
      event('S-a', 1, 'session.start', { task: 'a', workspace_root: 'w' });
      event('S-b', 1, 'session.start', { task: 'b', workspace_root: 'w' });
      dal.recordTrim(asSessionId('S-b'), 12, 100, 't');
      const b = readTrajectory(dal, asSessionId('S-b'))!;
      expect(b.document).toMatchObject({ truncated: true, dropped_events: 12 });
      expect(trajectoryWarnings('S-b', b)).toEqual(["Session S-b's history is capped: 12 events were dropped, so the document does not cover the whole run."]);
      const a = readTrajectory(dal, asSessionId('S-a'))!;
      const batch = batchDocument([b.document, a.document]) as { trajectory_version: number; count: number; trajectories: { task: string }[] };
      expect(Object.keys(batch).sort()).toEqual(['count', 'trajectories', 'trajectory_version']);
      expect(batch.count).toBe(2);
      expect(batch.trajectories.map((d) => d.task)).toEqual(['b', 'a']);
      expect(summariseTrajectory([], 0).runs).toBe(0);
      // REQ-EVENTS-145: sorted keys, two-space indentation, a trailing newline; written whole through ADR-0004's primitive.
      const text = renderExport({ z: 1, a: { d: [3, { y: 1, x: 2 }], b: null } });
      expect(text).toBe('{\n  "a": {\n    "b": null,\n    "d": [\n      3,\n      {\n        "x": 2,\n        "y": 1\n      }\n    ]\n  },\n  "z": 1\n}\n');
      const target = join(dir, 'exports', 'nested', 'batch.json');
      const w = await writeExport(target, batch as unknown as JsonValue, clock.timers);
      expect(w.ok).toBe(true);
      expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(JSON.parse(JSON.stringify(batch)));
    });
  });
});
