import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, millis, mintMachineId, mintWorkspaceId, type MachineId, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { claimAsideName, CURRENT_SCHEMA_VERSION, establishWorkspaceId, expandArtifact as expandArtifactInto, migrateStore, openStore, openWorkspaceStore, restoreStore, SIDECAR_PATTERN, StoreDal, storeDir, storeFile, takeBackup, forgetSpelling, type RunHostControl } from './index.js';

const M = mintMachineId('0000000000000000000000000000000a') as MachineId;
const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
const clocks = nodeClocks();

let root: string;
let ws: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-store-')); ws = mkdtempSync(join(tmpdir(), 'rotaris-ws-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

/** Hash a directory's content, excluding -wal/-shm which any open connection creates (D8). */
function treeHash(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string, rel: string) => {
    for (const n of readdirSync(d).sort()) {
      if (SIDECAR_PATTERN.test(n)) continue;
      const full = join(d, n);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, `${rel}${n}/`);
      else { h.update(`${rel}${n}\n`); h.update(readFileSync(full)); }
    }
  };
  walk(dir, '');
  return h.digest('hex');
}

function seed(workspacesRoot: string, id: WorkspaceId, sessions: { sid: string; rows: number; lock?: { pid: number; host: MachineId } }[]): void {
  const r = openWorkspaceStore(workspacesRoot, id, 'C:\\ws');
  const dal = new StoreDal(r.db);
  for (const s of sessions) {
    dal.upsertSession({ session_id: s.sid, execution_status: 'completed', workspace_root: 'C:\\ws', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z' });
    for (let i = 0; i < s.rows; i++) dal.appendRow(asSessionId(s.sid), i, 'text', true, `row ${i} of ${s.sid}`);
    if (s.lock) dal.claimLock(asSessionId(s.sid), s.lock.pid, s.lock.host, '2026-09-02T00:00:00.000Z');
  }
  r.db.close();
  forgetSpelling(r.dir);
}

function counts(workspacesRoot: string, id: WorkspaceId): { sessions: number; rows: number; sids: string[] } {
  const db = openStore(storeFile(workspacesRoot, id), { readonly: true, mustExist: true });
  const dal = new StoreDal(db);
  const t = dal.totals();
  const sids = dal.listSessions().map((s) => s.session_id);
  db.close();
  return { ...t, sids };
}

/** A run host model with the knobs IC-1 needed: where a raced run takes its lock, and whether the close answers. */
function fakeRunHost(workspacesRoot: string, id: WorkspaceId, knobs: { raceAtStep: 'none' | 'between-2-and-4'; closeAnswers: boolean }): RunHostControl & { log: string[]; racedSid?: string } {
  const log: string[] = [];
  const rh: RunHostControl & { log: string[]; racedSid?: string } = {
    log,
    async refuseRuns() { log.push('refuse'); },
    async closeStore() {
      if (knobs.raceAtStep === 'between-2-and-4') {
        // A launch admitted before the refusal bit takes its lock now — after the first liveness
        // evaluation has passed and before this close acknowledges. The exact position spike 22 destroyed.
        const db = openStore(storeFile(workspacesRoot, id), { mustExist: true });
        const dal = new StoreDal(db);
        dal.upsertSession({ session_id: 'S-raced', execution_status: 'running', workspace_root: 'C:\\ws', created_at: '2026-09-02T00:00:01.000Z', updated_at: '2026-09-02T00:00:01.000Z' });
        dal.claimLock(asSessionId('S-raced'), process.pid, M, '2026-09-02T00:00:01.000Z');
        dal.appendRow(asSessionId('S-raced'), 0, 'text', true, 'written by the raced run');
        dal.appendRow(asSessionId('S-raced'), 1, 'text', true, 'still writing');
        db.close();
        forgetSpelling(storeDir(workspacesRoot, id));
        rh.racedSid = 'S-raced';
      }
      log.push('close');
      if (!knobs.closeAnswers) return new Promise<void>(() => { /* never */ });
    },
    async release() { log.push('release'); },
    async reopen() { log.push('reopen'); },
  };
  return rh;
}

function makeArtifact(workspacesRoot: string, id: WorkspaceId, sessions: { sid: string; rows: number; lock?: { pid: number; host: MachineId } }[]): string {
  const src = mkdtempSync(join(tmpdir(), 'rotaris-src-'));
  seed(src, id, sessions);
  const artifact = join(workspacesRoot, 'backup.tar');
  takeBackup(src, id, artifact, '2026-09-02T00:00:00.000Z', 'C:\\ws');
  rmSync(src, { recursive: true, force: true });
  return artifact;
}

describe('store — open (ADR-0058 rule 3, rule 6)', () => {
  it('opens with write-ahead logging read back, and migrates to the current schema', () => {
    const id = mintWorkspaceId('00000000000000000000000000000001');
    const r = openWorkspaceStore(root, id, ws);
    expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
    expect(r.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(migrateStore(r.db)).toEqual({ kind: 'unchanged', version: CURRENT_SCHEMA_VERSION });
    expect(readFileSync(join(r.dir, 'origin.txt'), 'utf8').trim()).toBe(ws);
    r.db.close();
  });
  it('W-27 / rule 6: whatever spelling a caller passes, the engine is opened by the ONE canonical spelling', () => {
    if (process.platform !== 'win32') return;
    const id = mintWorkspaceId('00000000000000000000000000000002');
    const r = openWorkspaceStore(root, id, ws);
    const second = openStore(storeFile(root, id).toLowerCase());
    expect(second.name).toBe(r.db.name);
    expect(second.name).not.toBe(storeFile(root, id).toLowerCase());
    second.close();
    r.db.close();
  });
});

describe('store — the workspace identifier (REQ-SESSION-197, D-29)', () => {
  it('is minted once by exclusive create and read back; never minted over a readable one', () => {
    const a = establishWorkspaceId(ws);
    const b = establishWorkspaceId(ws);
    expect(a.state === 'readable' && a.minted).toBe(true);
    expect(b.state === 'readable' && !b.minted && b.id).toBe(a.state === 'readable' ? a.id : '');
  });
  it('present but unreadable is reported, byte-unchanged, and not repaired', () => {
    mkdirSync(join(ws, '.rotaris'));
    writeFileSync(join(ws, '.rotaris', 'workspace-id'), 'not-an-id\n');
    const r = establishWorkspaceId(ws);
    expect(r.state).toBe('unreadable');
    expect(readFileSync(join(ws, '.rotaris', 'workspace-id'), 'utf8')).toBe('not-an-id\n');
  });
});

describe('store — the session lock (REQ-SESSION-046)', () => {
  it('two claims on one session can never both succeed, and the loser is told the holder', () => {
    const id = mintWorkspaceId('00000000000000000000000000000003');
    const r = openWorkspaceStore(root, id, ws);
    const dal = new StoreDal(r.db);
    dal.upsertSession({ session_id: 'S', execution_status: 'running', workspace_root: ws, created_at: 'x', updated_at: 'x' });
    const a = dal.claimLock(asSessionId('S'), 100, M, 't');
    const b = dal.claimLock(asSessionId('S'), 200, M, 't');
    expect(a.claimed).toBe(true);
    expect(b.claimed === false && b.holder.pid).toBe(100);
    expect(dal.releaseLock(asSessionId('S'), 200, M)).toBe(false);
    expect(dal.releaseLock(asSessionId('S'), 100, M)).toBe(true);
    r.db.close();
  });
});

describe('store — the corrected restore, re-measured (IC-1)', () => {
  const id = mintWorkspaceId('00000000000000000000000000000010');
  const ctx = (rh: RunHostControl, artifact: string) => ({
    workspacesRoot: root, id, artifact, thisMachine: M, originLabel: 'C:\\ws', runHost: rh, timers: clocks.timers, wall: clocks.wall,
  });

  it('E1: a run raced into the window is caught by the SECOND liveness evaluation; its session and rows survive; the run host is released', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 5 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const rh = fakeRunHost(root, id, { raceAtStep: 'between-2-and-4', closeAnswers: true });
    const before = counts(root, id);
    const r = await restoreStore(ctx(rh, artifact), { ackBoundMs: millis(2_000) });
    expect(r.abandoned).toBe(true);
    expect(r.refusal).toEqual({ why: 'sessions-live', step: 4, sessions: ['S-raced'] });
    expect(r.steps).toContain('4-liveness');
    expect(rh.log).toEqual(['refuse', 'close', 'release']);
    const after = counts(root, id);
    expect(after.sids).toEqual(expect.arrayContaining([...before.sids, 'S-raced']));
    expect(after.rows).toBe(before.rows + 2);
    expect(readdirSync(root).filter((n) => n.includes('.displaced-') || n.includes('.restoring-'))).toEqual([]);
  });

  it('E1c (counterfactual): with ONE liveness evaluation the restore completes and the raced session is destroyed', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 5 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const rh = fakeRunHost(root, id, { raceAtStep: 'between-2-and-4', closeAnswers: true });
    const r = await restoreStore(ctx(rh, artifact), { singleLiveness: true });
    expect(r.ok).toBe(true);
    const after = counts(root, id);
    expect(after.sids).not.toContain('S-raced');
    expect(after.sids).toEqual(['S-from-backup']);
  });

  it('E2: the install rename forced to fail on an occupied name — displace-then-rename returns the target byte-identical', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 5 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const hashBefore = treeHash(storeDir(root, id));
    const r = await restoreStore(ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { forceInstallFail: 'target-exists' });
    expect(r.ok).toBe(false);
    expect(r.reversal?.mode).toBe('displace-then-rename');
    expect(r.reversal?.ok).toBe(true);
    expect(treeHash(storeDir(root, id))).toBe(hashBefore);
    expect(existsSync(storeFile(root, id))).toBe(true);
    expect(counts(root, id).sids).toEqual(['S-1']);
    // Two leftovers, both observed on every run — D5 on the corrected path (ADR-0058 consequence 5).
    expect(r.leftovers.some((l) => l.includes('.restoring-'))).toBe(true);
    expect(r.leftovers.some((l) => l.includes('.obstruction-'))).toBe(true);
  });

  it('E2c (counterfactual): the single-rename reversal reaches the forbidden empty-store-directory state and the error names both paths', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 5 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const r = await restoreStore(ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { forceInstallFail: 'target-exists', oldReversal: true });
    expect(r.ok).toBe(false);
    expect(r.reversal).toEqual({ mode: 'single-rename', ok: false });
    expect(existsSync(storeDir(root, id))).toBe(true);
    expect(existsSync(storeFile(root, id))).toBe(false);
    expect(r.error).toContain(r.displaced!);
    expect(r.error).toContain(storeDir(root, id));
  });

  it('E3a: an unanswered close REFUSES within the bound rather than proceeding, with the target untouched and no staging left', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 5 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const hashBefore = treeHash(storeDir(root, id));
    const rh = fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: false });
    const t0 = Date.now();
    const r = await restoreStore(ctx(rh, artifact), { ackBoundMs: millis(300) });
    const elapsed = Date.now() - t0;
    expect(r.abandoned).toBe(true);
    expect(r.refusal).toEqual({ why: 'ack-timeout', step: 3, boundMs: 300 });
    expect(elapsed).toBeGreaterThanOrEqual(290);
    expect(elapsed).toBeLessThan(2_000);
    expect(rh.log).toContain('release');
    expect(treeHash(storeDir(root, id))).toBe(hashBefore);
    expect(readdirSync(root).filter((n) => n.includes('.restoring-'))).toEqual([]);
  });

  it('D9: a lock naming another machine is reported together as one condition with the risk stated; confirmed, the restore proceeds', async () => {
    seed(root, id, [{ sid: 'S-a', rows: 1, lock: { pid: 1, host: OTHER } }, { sid: 'S-b', rows: 1, lock: { pid: 2, host: OTHER } }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3, lock: { pid: 3, host: OTHER } }]);
    const refused = await restoreStore(ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact));
    expect(refused.refusal?.why).toBe('foreign-locks');
    if (refused.refusal?.why === 'foreign-locks') {
      expect([...refused.refusal.sessions].sort()).toEqual(['S-a', 'S-b']);
      expect(refused.refusal.risk).toMatch(/another machine/);
    }
    const ok = await restoreStore(ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { proceedWithForeignLocks: true });
    expect(ok.ok).toBe(true);
    // ADR-0005 consequence 11: the foreign lock row from the artifact was dropped on the way in.
    const db = openStore(storeFile(root, id), { readonly: true, mustExist: true });
    expect(new StoreDal(db).listLocks()).toEqual([]);
    db.close();
  });

  it('IC-5: an artifact in the CONTAINER layout restores into the STORE layout — workspace.db under its name, no manifest inside, origin.txt naming the project', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 2 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    // The container layout genuinely differs from the store's: store.db + manifest.json, and a stray sidecar.
    const peek = mkdtempSync(join(tmpdir(), 'rotaris-peek-'));
    expandArtifactInto(artifact, peek);
    expect(readdirSync(peek).sort()).toEqual(['manifest.json', 'sessions', 'store.db'].filter((n) => existsSync(join(peek, n))).sort());
    rmSync(peek, { recursive: true, force: true });
    const r = await restoreStore({ ...ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), originLabel: 'D:/the-right-project' });
    expect(r.ok).toBe(true);
    const dir = storeDir(root, id);
    expect(existsSync(join(dir, 'workspace.db'))).toBe(true);
    expect(existsSync(join(dir, 'store.db'))).toBe(false);
    expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
    expect(readFileSync(join(dir, 'origin.txt'), 'utf8').trim()).toBe('D:/the-right-project');
    expect(counts(root, id).sids).toEqual(['S-from-backup']);
  });
  it('IC-5 (counterfactual): D7 as it was — the container installed as the store — opens, works, and is missing all three', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 2 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
    const r = await restoreStore({ ...ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), originLabel: 'D:/the-right-project' }, { skipArrange: true });
    expect(r.ok).toBe(true);
    const dir = storeDir(root, id);
    expect(existsSync(join(dir, 'workspace.db'))).toBe(false);
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'origin.txt'))).toBe(false);
  });
  it('a restore into a store this machine never held (case (c) outcome 2, case (b)) has nothing to judge or displace and installs whole', async () => {
    const fresh = mintWorkspaceId('00000000000000000000000000000011');
    const artifact = makeArtifact(root, fresh, [{ sid: 'S-from-backup', rows: 3 }]);
    expect(existsSync(storeDir(root, fresh))).toBe(false);
    const rh = fakeRunHost(root, fresh, { raceAtStep: 'none', closeAnswers: true });
    const r = await restoreStore({ ...ctx(rh, artifact), id: fresh });
    expect(r.ok).toBe(true);
    expect(r.displaced).toBeUndefined();
    expect(r.steps).toContain('8-displace(skipped)');
    expect(counts(root, fresh).sids).toEqual(['S-from-backup']);
  });

  it('E4 (D6): under a forced stamp collision the counter is what makes the aside-name safe; both displaced stores survive', () => {
    const stamp = '2026-09-02T00-00-00-000Z';
    seed(root, id, [{ sid: 'S-1', rows: 1 }]);
    const first = claimAsideName(root, id, stamp, 'displaced', storeDir(root, id));
    expect(first.ok && first.attempts).toBe(1);
    seed(root, id, [{ sid: 'S-2', rows: 1 }]);
    const second = claimAsideName(root, id, stamp, 'displaced', storeDir(root, id));
    expect(second.ok && second.attempts).toBe(2);
    const displaced = readdirSync(root).filter((n) => n.includes('.displaced-'));
    expect(displaced).toHaveLength(2);
    for (const d of displaced) expect(existsSync(join(root, d, 'workspace.db'))).toBe(true);
  });
});

describe('store — v3: what a run records (REQ-SESSION-138, REQ-SESSION-168, REQ-ORCH-139)', () => {
  it('a v2 store migrates to v3 keeping its rows; the run columns read their defaults', () => {
    const id = mintWorkspaceId('00000000000000000000000000000088');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-v3');
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: '2026-09-03T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z' });
    const s = dal.getSession(sid)!;
    expect([s.stop_reason, s.iterations_completed, s.tokens_input, s.cost, s.todo, s.summary_status]).toEqual([null, 0, 0, '0', null, null]);
    dal.appendRow(sid, 0, 'agent', false, 'hel', '2026-09-03T00:00:01.000Z', { persona: 'orchestrator', name: 'orchestrator', ts: '02:00:01' });
    const row = dal.residentRows(sid)[0]!;
    expect([row.persona, row.name, row.ts]).toEqual(['orchestrator', 'orchestrator', '02:00:01']);
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the launch audit is written exactly once: the second insert is refused by the statement, not by a check', () => {
    const id = mintWorkspaceId('00000000000000000000000000000089');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-audit');
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    expect(dal.getLaunchAudit(sid)).toBeUndefined();
    expect(dal.insertLaunchAudit(sid, 't1', '{"run_intent":"moderate_feature"}')).toBe(true);
    expect(dal.insertLaunchAudit(sid, 't2', '{"run_intent":"rewritten"}')).toBe(false);
    expect(dal.getLaunchAudit(sid)?.payload).toContain('moderate_feature');
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('a save patch copies the aggregates it names and keeps every column it does not; the timeline is append-ordered', () => {
    const id = mintWorkspaceId('00000000000000000000000000000090');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-agg');
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    dal.updateSessionRun(sid, { tokens_input: 12, tokens_output: 34, cost: '0.001', run_started_at: 't0' });
    dal.updateSessionRun(sid, { stop_reason: 'tasks_complete', iterations_completed: 1 });
    const s = dal.getSession(sid)!;
    expect([s.tokens_input, s.tokens_output, s.cost, s.run_started_at, s.stop_reason, s.iterations_completed]).toEqual([12, 34, '0.001', 't0', 'tasks_complete', 1]);
    expect(dal.nextTimelineOrdinal(sid)).toBe(1);
    dal.insertTimeline(sid, 1, 't1', 'run_start', 'rotaris', 'a run is starting for S-agg', '{"workspace_root":"C:/ws"}');
    dal.insertTimeline(sid, 2, 't2', 'run_end', 'rotaris', 'the run ended', '{"execution_status":"completed"}');
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(['run_start', 'run_end']);
    expect(dal.nextTimelineOrdinal(sid)).toBe(3);
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store - a declared index is a claim about a query plan; the plan is asserted (spike 8)', () => {
  it('every budgeted query names its index in EXPLAIN QUERY PLAN', () => {
    const id = mintWorkspaceId('00000000000000000000000000000077');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const plan = (sql: string, ...args: unknown[]) => (r.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((p) => p.detail).join(' | ');
    // REQ-SESSION-042: the listing reads the listing index.
    expect(plan('SELECT * FROM sessions ORDER BY updated_at DESC')).toContain('sessions_by_updated');
    // REQ-EVENTS-117's axes (REQ-EVENTS-175: 100 ms): each is an index read, never a scan.
    expect(plan("SELECT * FROM events WHERE session_id = 's' AND kind = 'tool.start' ORDER BY ordinal")).toContain('events_by_kind');
    expect(plan("SELECT * FROM events WHERE session_id = 's' AND iteration = 3 ORDER BY ordinal")).toContain('events_by_iteration');
    expect(plan("SELECT * FROM events WHERE session_id = 's' AND at >= ? AND at <= ? ORDER BY ordinal", 'a', 'b')).toContain('events_by_at');
    // REQ-SESSION-192: the resident window is read through its partial index.
    expect(plan("SELECT * FROM transcript_rows WHERE session_id = 's' AND page IS NULL ORDER BY row_index")).toContain('transcript_resident');
    r.db.close();
    forgetSpelling(r.dir);
  });
});
