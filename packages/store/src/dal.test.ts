import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, mintMachineId, mintWorkspaceId } from '@rotaris/kernel';
import { isLockForeign, isLockLive, probePid, type Liveness } from '@rotaris/platform';
import { forgetSpelling, openStoreForInspection, openWorkspaceStore, StoreDal, storeDir, storeFile, type ResolvedStore } from './index.js';

/**
 * Hardening C2 (`docs/architecture/hardening.md` §3.3 row 4): two things `dal.ts` holds that were reached only through the
 * workspace package and the proofs — the session lock rows, as written and as `platform`'s `isLockLive` judges them
 * (REQ-SESSION-046, REQ-SESSION-051, REQ-SESSION-056), and the store's side of the two read modes, where a row whose stored
 * state cannot be decoded must never cost the listing the others (REQ-SESSION-040, REQ-SESSION-041, REQ-SESSION-045). The
 * store decodes no JSON column on a listing; the engine marks the unreadable one (`stateUnreadable`, `session-actions.test.ts`).
 */
const id = mintWorkspaceId('000000000000000000000000000000cc');
const HERE = mintMachineId('000000000000000000000000000000cd');
const ELSEWHERE = mintMachineId('000000000000000000000000000000ce');
let root: string;
let r: ResolvedStore;
let dal: StoreDal;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-dal-'));
  r = openWorkspaceStore(root, id, 'C:/ws');
  dal = new StoreDal(r.db);
});
afterEach(() => {
  try { r.db.close(); } catch { /* closed by the case */ }
  forgetSpelling(r.dir);
  rmSync(root, { recursive: true, force: true });
});

const session = (sid: string, updatedAt = 't') => dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: updatedAt });

describe('the session lock rows, as written and as judged (REQ-SESSION-046, REQ-SESSION-051, REQ-SESSION-056)', () => {
  it('a row carries the pid, the host and the time it was taken, and reads back as the record the predicate judges', () => {
    session('S-1');
    expect(dal.claimLock(asSessionId('S-1'), 4242, HERE, '2026-11-03T00:00:00.000Z')).toEqual({ claimed: true });
    expect(dal.getLock(asSessionId('S-1'))).toEqual({ session_id: 'S-1', pid: 4242, host: HERE, acquired_at: '2026-11-03T00:00:00.000Z' });
    expect(dal.listLocks()).toEqual([dal.getLock(asSessionId('S-1'))]);
  });

  it('a row naming this machine and a dead pid is stale; one naming a live pid is not; the probe is asked about the row\u2019s own pid', () => {
    session('S-dead');
    session('S-live');
    dal.claimLock(asSessionId('S-dead'), 4242, HERE, 't');
    dal.claimLock(asSessionId('S-live'), 5151, HERE, 't');
    const asked: number[] = [];
    const probe = (pid: number): Liveness => { asked.push(pid); return pid === 5151 ? 'alive' : 'dead'; };
    expect(isLockLive(dal.getLock(asSessionId('S-dead')), HERE, probe)).toBe(false);
    expect(isLockLive(dal.getLock(asSessionId('S-live')), HERE, probe)).toBe(true);
    expect(asked).toEqual([4242, 5151]);
    // The real probe, on a pid that is certainly alive: this process's own.
    session('S-self');
    dal.claimLock(asSessionId('S-self'), process.pid, HERE, 't');
    expect(isLockLive(dal.getLock(asSessionId('S-self')), HERE)).toBe(true);
  });

  it('a row naming another machine is live by construction and foreign: no probe is asked, whatever its pid would answer here', () => {
    session('S-foreign');
    dal.claimLock(asSessionId('S-foreign'), 4242, ELSEWHERE, 't');
    const lock = dal.getLock(asSessionId('S-foreign'));
    let asked = 0;
    expect(isLockLive(lock, HERE, () => { asked += 1; return 'dead'; })).toBe(true);
    expect(asked).toBe(0);
    expect(isLockForeign(lock, HERE)).toBe(true);
    expect(isLockForeign(dal.getLock(asSessionId('S-foreign')), ELSEWHERE)).toBe(false);
  });

  it('a row the predicate cannot read as a lock (a pid of 0, an empty host) is live, the safe direction; the probe itself answers dead for pid \u2264 0 and never raises', () => {
    session('S-zero');
    session('S-nohost');
    dal.claimLock(asSessionId('S-zero'), 0, HERE, 't');
    dal.claimLock(asSessionId('S-nohost'), 4242, '' as typeof HERE, 't');
    const never = (): Liveness => { throw new Error('a malformed lock is never probed'); };
    expect(isLockLive(dal.getLock(asSessionId('S-zero')), HERE, never)).toBe(true);
    expect(isLockLive(dal.getLock(asSessionId('S-nohost')), HERE, never)).toBe(true);
    for (const pid of [0, -1, Number.NaN, 1.5]) expect(probePid(pid)).toBe('dead');
    expect(probePid(process.pid)).toBe('alive');
  });

  it('a release names its holder by pid and host; a restored store keeps only this machine\u2019s rows', () => {
    for (const sid of ['S-here', 'S-there']) session(sid);
    dal.claimLock(asSessionId('S-here'), 4242, HERE, 't');
    dal.claimLock(asSessionId('S-there'), 4242, ELSEWHERE, 't');
    expect(dal.releaseLock(asSessionId('S-here'), 4242, ELSEWHERE)).toBe(false);
    expect(dal.releaseLock(asSessionId('S-there'), 4242, HERE)).toBe(false);
    expect(dal.deleteLocksNotOnHost(HERE)).toBe(1);
    expect(dal.listLocks().map((l) => l.session_id)).toEqual(['S-here']);
    expect(dal.releaseLock(asSessionId('S-here'), 4242, HERE)).toBe(true);
    expect(dal.listLocks()).toEqual([]);
  });
});

describe('the read modes: one unreadable session never costs the listing (REQ-SESSION-040, REQ-SESSION-041, REQ-SESSION-045)', () => {
  /** Four sessions; two carry stored state that cannot be decoded, one in its todo document and one in its progress record. */
  function plantWithCorruptRows(): void {
    session('S-a', '2026-11-03T00:00:04.000Z');
    session('S-bad-progress', '2026-11-03T00:00:03.000Z');
    session('S-bad-todo', '2026-11-03T00:00:02.000Z');
    session('S-b', '2026-11-03T00:00:01.000Z');
    dal.updateSessionRun(asSessionId('S-bad-progress'), { progress: '{"step": 3, "unterminated' });
    r.db.prepare('UPDATE sessions SET todo = ? WHERE session_id = ?').run('[{"id": nope}', 'S-bad-todo');
  }

  it('the full open lists every session, the unreadable ones with their stored text as it is, in the listing\u2019s order', () => {
    plantWithCorruptRows();
    const rows = dal.listSessions();
    expect(rows.map((s) => s.session_id)).toEqual(['S-a', 'S-bad-progress', 'S-bad-todo', 'S-b']);
    expect(rows.find((s) => s.session_id === 'S-bad-progress')?.progress).toBe('{"step": 3, "unterminated');
    expect(rows.find((s) => s.session_id === 'S-bad-todo')?.todo).toBe('[{"id": nope}');
    expect(dal.getSession(asSessionId('S-bad-todo'))?.session_id).toBe('S-bad-todo');
  });

  it('the snapshot read lists the same sessions with no repair and no write: the directory and the store\u2019s bytes are as it found them', () => {
    plantWithCorruptRows();
    r.db.close();
    forgetSpelling(r.dir);
    const dir = storeDir(root, id);
    const file = storeFile(root, id);
    const entries = readdirSync(dir).sort();
    const bytes = createHash('sha256').update(readFileSync(file)).digest('hex');
    const snap = openStoreForInspection(file);
    try {
      expect(new StoreDal(snap).listSessions().map((s) => s.session_id)).toEqual(['S-a', 'S-bad-progress', 'S-bad-todo', 'S-b']);
    } finally {
      snap.close();
    }
    forgetSpelling(dir);
    expect(readdirSync(dir).sort()).toEqual(entries);
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(bytes);
  });
});
