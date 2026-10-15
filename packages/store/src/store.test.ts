import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, fileStamp, millis, mintMachineId, mintWorkspaceId, type MachineId, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { checkEmptyPlace, establishInEmptyPlace, firstStoreSibling, legacyFirstStoreSibling, plannedAsideName } from './index.js';
import { CutRestoreError, recoverCutRestore, RestorePendingError, restoreJournal, StorePlaceEmptyError, writeRestoreJournal } from './index.js';
import { claimAsideName, CURRENT_SCHEMA_VERSION, MIGRATIONS, establishWorkspaceId, expandArtifact as expandArtifactInto, migrateStore, FILE_STAMP_LENGTH, openStore, openStoreForInspection, openWorkspaceStore, PROMPT_CAPS, restoreStore, SIDECAR_PATTERN, StoreDal, storeDir, storeFile, storePathLimit, takeBackup, forgetSpelling, type RunHostControl } from './index.js';

/** PD-ORCH-005 clause 9 / REQ-SESSION-031: what v35 added, undone before v34's so a test that lowers `user_version` below 35 can climb it again. */
const UNDO_V35 = 'ALTER TABLE sessions DROP COLUMN pending_questions;';
/** PD-TOOLS-006 revision 6 (OQ-220): what v34 added, undone before v33's so a test that lowers `user_version` below 34 can climb it again. v35's goes first. */
const UNDO_V34 = `${UNDO_V35} ALTER TABLE children DROP COLUMN todo_item;`;
/** REQ-SESSION-140 with REQ-MONITOR-102: what v33 added, undone before v32's so a test that lowers `user_version` below 33 can climb it again. v34's goes first. */
const UNDO_V33 = `${UNDO_V34} ALTER TABLE plan_roots DROP COLUMN tool_calls;`;
/** REQ-MONITOR-102 (OQ-116, R-071): what v32 added, undone before v31's so a test that lowers `user_version` below 32 can climb it again. v33's goes first. */
const UNDO_V32 = `${UNDO_V33} ALTER TABLE sessions DROP COLUMN plan_root_tool_calls;`;
/** REQ-SANDBOX-121: what v31 added, undone before v30's so a test that lowers `user_version` below 31 can climb it again. v32's goes first. */
const UNDO_V31 = `${UNDO_V32} ALTER TABLE sessions DROP COLUMN sandbox_backend;`;
/** REQ-MONITOR-044 with REQ-ORCH-153 (R-067): what v30 added, undone before v29's so a test that lowers `user_version` below 30 can climb it again. v31's goes first. */
const UNDO_V30 = `${UNDO_V31} DROP TABLE plan_roots;`;
/** REQ-MONITOR-102 with REQ-ORCH-153 (R-067): what v29 added, undone before v28's so a test that lowers `user_version` below 29 can climb it again. v30's goes first. */
const UNDO_V29 = `${UNDO_V30} ALTER TABLE sessions DROP COLUMN plan_root_task_id; ALTER TABLE sessions DROP COLUMN plan_root_persona;`;
/** REQ-LIBRARY-098 / REQ-TOOLS-152 (R-067): what v28 added, undone before v27's so a test that lowers `user_version` below 28 can climb it again. v29's goes first. */
const UNDO_V28 = `${UNDO_V29} ALTER TABLE children DROP COLUMN attach_artifacts; ALTER TABLE children DROP COLUMN inherited_context_block;`;
/** PD-ORCH-005 clause 3 (OQ-103, R-067): what v27 added, undone before v26's so a test that lowers `user_version` below 27 can climb it again. v28's goes first. */
const UNDO_V27 = `${UNDO_V28} ALTER TABLE iterations DROP COLUMN cancel_accepted_at;`;
/** REQ-MONITOR-102 (R-067): what v26 added, undone before v25's so a test that lowers `user_version` below 26 can climb it again. v27's goes first. */
const UNDO_V26 = `${UNDO_V27} ALTER TABLE iterations DROP COLUMN root_tool_calls;`;
/** REQ-TOOLS-152 (R-067): what v25 added, undone before v24's so a test that lowers `user_version` below 25 can climb it again. v26's goes first. */
const UNDO_V25 = `${UNDO_V26} ALTER TABLE children DROP COLUMN suppress_auto_context;`;
/** PD-ORCH-005 revision 4 clause 14: what v24 added, undone before v23's so a test that lowers `user_version` below 24 can climb it again. v25's goes first. */
const UNDO_V24 = `${UNDO_V25} DROP TABLE agent_fingerprints;`;
/** PD-ORCH-005: what v23 added, undone so a test that lowers `user_version` below 23 can migrate forward through it again. v24's goes first. */
const UNDO_V23 = `${UNDO_V24} ALTER TABLE children DROP COLUMN interruption; ALTER TABLE children DROP COLUMN resume_state; ALTER TABLE children DROP COLUMN write_scope; DROP TABLE iterations; DROP TABLE agent_messages; DROP TABLE agent_terminals;`;

const M = mintMachineId('0000000000000000000000000000000a') as MachineId;
/**
 * The archiver the product's backup uses (`backup.ts`, `tarBin`): a bare `tar` launched from Git Bash is Git's GNU tar, which
 * reads `C:` as a remote host (docs/defects/fixed/two-store-cases-pack-their-artifact-with-whichever-tar-path-finds-first.md).
 */
const TAR = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
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
  it('REQ-SESSION-202 / W-31 (1): a place that exists and holds no store is refused, never opened by a call that creates; nothing is put there', () => {
    const id = mintWorkspaceId('00000000000000000000000000000004');
    const dir = storeDir(root, id);
    mkdirSync(dir, { recursive: true });
    expect(() => openWorkspaceStore(root, id, ws)).toThrow(StorePlaceEmptyError);
    expect(readdirSync(dir)).toEqual([]);
    // What a copy, a move or a hand tidy that took `workspace.db` and left its directory leaves: refused the same way.
    writeFileSync(join(dir, 'origin.txt'), `${ws}\n`);
    mkdirSync(join(dir, 'sessions'));
    let thrown: unknown;
    try { openWorkspaceStore(root, id, ws); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(StorePlaceEmptyError);
    expect((thrown as Error).message).toBe(`the place for this workspace's session store exists (${dir}) and the store is not in it`);
    expect(readdirSync(dir).sort()).toEqual(['origin.txt', 'sessions']);
    // REQ-SESSION-043 is unchanged: where nothing is kept for the workspace, the open creates the store.
    rmSync(dir, { recursive: true });
    const r = openWorkspaceStore(root, id, ws);
    expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
    r.db.close();
    forgetSpelling(r.dir);
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

describe('store — OQ-281 (ruled 2026-10-14 under R-072): a first store is made beside its place and renamed in (REQ-SESSION-202, REQ-SESSION-043)', () => {
  const id = mintWorkspaceId('000000000000000000000000000002f2');
  const cut = (at: string[]) => ({ betweenCreateAndRename: (sibling: string) => { at.push(sibling); throw new Error('killed between create and rename'); } });

  it('a cut between create and rename leaves the place absent, never empty, and the next open installs a store', () => {
    const seen: string[] = [];
    let placeAtCut: boolean | undefined;
    expect(() => openWorkspaceStore(root, id, ws, { betweenCreateAndRename: (sibling) => { seen.push(sibling); placeAtCut = existsSync(storeDir(root, id)); throw new Error('killed'); } })).toThrow('killed');
    // At the cut the store is whole in its sibling, origin.txt beside it, and the place has never existed.
    expect(seen).toEqual([firstStoreSibling(root, id)]);
    expect(placeAtCut).toBe(false);
    expect(existsSync(storeDir(root, id))).toBe(false);
    expect(readdirSync(seen[0]!).sort()).toEqual(['origin.txt', 'workspace.db']);
    // REQ-SESSION-043: an absent place is the ordinary first open — not REQ-SESSION-202's condition.
    const r = openWorkspaceStore(root, id, ws);
    expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
    expect(readFileSync(join(r.dir, 'origin.txt'), 'utf8').trim()).toBe(ws);
    r.db.close();
    forgetSpelling(r.dir);
    expect(existsSync(firstStoreSibling(root, id))).toBe(false);
  });

  it('a workspaces root that does not exist yet is made, as the place once was', () => {
    const fresh = join(root, 'not-yet', 'workspaces');
    const r = openWorkspaceStore(fresh, id, ws);
    expect(readdirSync(fresh)).toEqual([id]);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('a stray sibling for the identifier — a store never installed — is swept at its next open, whatever it holds', () => {
    const sibling = firstStoreSibling(root, id);
    // Two characters shorter than the place, so the sibling's database never crosses D11's limit first; it was
    // `.<id>.new`, five longer, until 2026-10-15
    // (docs/defects/fixed/a-first-store-at-247-to-251-characters-cannot-be-created-on-windows.md).
    expect(sibling).toBe(join(root, `.${id.slice('v1-'.length)}`));
    expect(sibling.length - join(root, id).length).toBe(-2);
    mkdirSync(join(sibling, 'sessions'), { recursive: true });
    writeFileSync(join(sibling, 'workspace.db'), 'half a store');
    const r = openWorkspaceStore(root, id, ws);
    expect(counts(root, id).sessions).toBe(0);
    r.db.close();
    forgetSpelling(r.dir);
    expect(existsSync(sibling)).toBe(false);
    expect(readdirSync(root)).toEqual([id]);
  });

  it('a stray sibling under its earlier name, `.<id>.new`, is swept at the identifier\'s next open too', () => {
    const legacy = legacyFirstStoreSibling(root, id);
    expect(legacy).toBe(join(root, `.${id}.new`));
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'workspace.db'), 'half a store');
    const r = openWorkspaceStore(root, id, ws);
    r.db.close();
    forgetSpelling(r.dir);
    expect(existsSync(legacy)).toBe(false);
    expect(readdirSync(root)).toEqual([id]);
  });

  it('a stray sibling is swept at the identifier\'s next open even where the place came back by another way, and the store there is untouched', () => {
    // A cut first create left `.<id>.new`; the place then reappeared without an open making it (a restore, a person).
    expect(() => openWorkspaceStore(root, id, ws, cut([]))).toThrow();
    const other = mintWorkspaceId('000000000000000000000000000002f6');
    seed(root, other, [{ sid: 'S-back', rows: 1 }]);
    renameSync(storeDir(root, other), storeDir(root, id));
    expect(existsSync(firstStoreSibling(root, id))).toBe(true);
    const r = openWorkspaceStore(root, id, ws);
    expect(new StoreDal(r.db).listSessions().map((x) => x.session_id)).toEqual(['S-back']);
    r.db.close();
    forgetSpelling(r.dir);
    expect(existsSync(firstStoreSibling(root, id))).toBe(false);
    expect(readdirSync(root)).toEqual([id]);
  });

  it('a place that appeared meanwhile is never written over: a store there is opened, an empty one refused, and the sibling discarded', () => {
    const other = mintWorkspaceId('000000000000000000000000000002f3');
    seed(root, other, [{ sid: 'S-there', rows: 1 }]);
    const r = openWorkspaceStore(root, id, ws, { betweenCreateAndRename: () => { renameSync(storeDir(root, other), storeDir(root, id)); } });
    expect(new StoreDal(r.db).listSessions().map((x) => x.session_id)).toEqual(['S-there']);
    r.db.close();
    forgetSpelling(r.dir);
    expect(existsSync(firstStoreSibling(root, id))).toBe(false);
    const empty = mintWorkspaceId('000000000000000000000000000002f4');
    expect(() => openWorkspaceStore(root, empty, ws, { betweenCreateAndRename: () => { mkdirSync(storeDir(root, empty)); } })).toThrow(StorePlaceEmptyError);
    expect(readdirSync(storeDir(root, empty))).toEqual([]);
    expect(existsSync(firstStoreSibling(root, empty))).toBe(false);
  });

  it('a rename the platform refuses transiently is retried, boundedly; one it keeps refusing leaves the place absent and no sibling', () => {
    let refusals = 2;
    const flaky = ((from: string, to: string) => { if (refusals-- > 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); renameSync(from, to); }) as typeof renameSync;
    const r = openWorkspaceStore(root, id, ws, { rename: flaky });
    expect(refusals).toBe(-1);
    r.db.close();
    forgetSpelling(r.dir);
    const stuck = mintWorkspaceId('000000000000000000000000000002f5');
    let tries = 0;
    const refusing = (() => { tries++; throw Object.assign(new Error('denied'), { code: 'EPERM' }); }) as typeof renameSync;
    expect(() => openWorkspaceStore(root, stuck, ws, { rename: refusing })).toThrow('denied');
    expect(tries).toBe(5);
    expect(existsSync(storeDir(root, stuck))).toBe(false);
    expect(existsSync(firstStoreSibling(root, stuck))).toBe(false);
  });

  it('a dot-prefixed entry beside the place is never taken for a store set aside', () => {
    const at: string[] = [];
    expect(() => openWorkspaceStore(root, id, ws, cut(at))).toThrow();
    writeRestoreJournal(root, id, { stamp: 'S', stagingN: 1, targetExisted: true });
    mkdirSync(join(root, `.${id}.displaced-S`));
    expect(() => recoverCutRestore(root, id)).toThrow(CutRestoreError);
  });
});

describe('store — OQ-281 (ruled 2026-10-14 under R-072): the deliberate new store in a place that holds none (REQ-SESSION-202)', () => {
  const id = mintWorkspaceId('00000000000000000000000000000281');
  const stamp = '2026-10-14T05-00-00-000Z';
  it('re-checks the condition, moves the found place aside whole and keeps it, then creates the store as an absent place\'s open does', () => {
    const place = storeDir(root, id);
    mkdirSync(join(place, 'sessions', 'S-gone'), { recursive: true });
    writeFileSync(join(place, 'origin.txt'), `${ws}\n`);
    const before = treeHash(place);
    expect(checkEmptyPlace(root, id)).toEqual({ ok: true, place });
    const planned = plannedAsideName(root, id, stamp);
    expect(planned).toBe(join(root, `${id}.displaced-${stamp}`));
    const r = establishInEmptyPlace(root, id, ws, stamp);
    expect(r).toEqual({ ok: true, place, kept: planned, migratedTo: CURRENT_SCHEMA_VERSION });
    // Kept exactly as found — never read, judged or deleted.
    expect(treeHash(planned)).toBe(before);
    // The new store opens, and lists empty: it opened (REQ-SESSION-202, "what this does not reach").
    expect(counts(root, id).sessions).toBe(0);
    const again = openWorkspaceStore(root, id, ws);
    expect(again.migration).toEqual({ kind: 'unchanged', version: CURRENT_SCHEMA_VERSION });
    again.db.close();
    forgetSpelling(again.dir);
  });
  it('a taken aside name is passed over by the counter, and the kept path says which was taken', () => {
    mkdirSync(storeDir(root, id), { recursive: true });
    mkdirSync(join(root, `${id}.displaced-${stamp}`));
    const planned = plannedAsideName(root, id, stamp);
    expect(planned).toBe(join(root, `${id}.displaced-${stamp}.1`));
    const r = establishInEmptyPlace(root, id, ws, stamp);
    expect(r.ok && r.kept).toBe(planned);
  });
  it('refuses, changing nothing, where the condition no longer holds: the place gone, the store back, a restore\'s journal beside it', () => {
    expect(establishInEmptyPlace(root, id, ws, stamp)).toMatchObject({ ok: false, why: 'place-absent' });
    expect(existsSync(storeDir(root, id))).toBe(false);
    seed(root, id, [{ sid: 'S-back', rows: 1 }]);
    const present = treeHash(storeDir(root, id));
    expect(establishInEmptyPlace(root, id, ws, stamp)).toMatchObject({ ok: false, why: 'store-present' });
    expect(treeHash(storeDir(root, id))).toBe(present);
    rmSync(storeFile(root, id));
    writeRestoreJournal(root, id, { stamp, stagingN: 1, targetExisted: true });
    expect(establishInEmptyPlace(root, id, ws, stamp)).toMatchObject({ ok: false, why: 'restore-pending' });
    expect(readdirSync(root).filter((n) => n.includes('.displaced-'))).toEqual([]);
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
    // D5 on the corrected path (ADR-0058 consequence 5): the obstruction aside is kept and listed; since OQ-265 (ruled
    // 2026-10-13 under R-072) the staging copy is deleted once the store is back, and is neither on disk nor listed.
    expect(r.leftovers.some((l) => l.includes('.restoring-'))).toBe(false);
    expect(readdirSync(root).filter((n) => n.includes('.restoring-'))).toEqual([]);
    expect(r.leftovers.some((l) => l.includes('.obstruction-'))).toBe(true);
  });

  describe('OQ-265 (ruled 2026-10-13 under R-072): a restore that fails safely deletes its own staging copy', () => {
    const rh = () => fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true });
    const staged = () => readdirSync(root).filter((n) => n.includes('.restoring-'));
    /** An artifact whose store opens and fails `quick_check`: two pages appended that the header counts and no tree uses. */
    const corruptArtifact = (artifact: string): void => {
      const dir = mkdtempSync(join(tmpdir(), 'rotaris-corrupt-'));
      try {
        expandArtifactInto(artifact, dir);
        const file = join(dir, 'store.db');
        const bytes = readFileSync(file);
        const pageSize = bytes.readUInt16BE(16) === 1 ? 65_536 : bytes.readUInt16BE(16);
        bytes.writeUInt32BE(bytes.readUInt32BE(28) + 2, 28);
        writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(pageSize * 2)]));
        rmSync(artifact);
        const t = spawnSync(TAR, ['-cf', artifact, '-C', dir, '.']);
        expect(t.status).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it('a staging store that fails quick_check: the store byte-identical, no staging copy on disk or listed', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      corruptArtifact(artifact);
      const before = treeHash(storeDir(root, id));
      const r = await restoreStore(ctx(rh(), artifact));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^staging store failed quick_check: /);
      expect(treeHash(storeDir(root, id))).toBe(before);
      expect(staged()).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('an expansion that fails (a truncated artifact) is a returned failure, not a throw, and leaves no staging copy', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      writeFileSync(artifact, 'not an archive');
      const before = treeHash(storeDir(root, id));
      const r = await restoreStore(ctx(rh(), artifact));
      expect(r.ok).toBe(false);
      expect(r.abandoned).toBe(false);
      expect(r.error).toMatch(/^staging store could not be prepared: /);
      expect(treeHash(storeDir(root, id))).toBe(before);
      expect(staged()).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('a step-8 claim that finds every aside name taken leaves no staging copy, and the store where it was', async () => {
      const stamp = '2026-10-13T00-00-00-000Z';
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      for (const n of ['', '.1', '.2', '.3', '.4']) mkdirSync(join(root, `${id}.displaced-${stamp}${n}`));
      const before = treeHash(storeDir(root, id));
      const r = await restoreStore(ctx(rh(), artifact), { stamp });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('step 8 failed: ENAMETAKEN');
      expect(treeHash(storeDir(root, id))).toBe(before);
      expect(staged()).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('a step-9 failure with no previous store leaves no staging copy', async () => {
      const fresh = mintWorkspaceId('00000000000000000000000000000013');
      const artifact = makeArtifact(root, fresh, [{ sid: 'S-from-backup', rows: 3 }]);
      const r = await restoreStore({ ...ctx(fakeRunHost(root, fresh, { raceAtStep: 'none', closeAnswers: true }), artifact), id: fresh }, { forceInstallFail: 'target-exists' });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/there was no previous store to put back$/);
      expect(staged()).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('a reversal that fails keeps the staging copy and lists it, beside the displaced store the error names', async () => {
      const stamp = '2026-10-13T00-00-00-000Z';
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      // R1 cannot claim an obstruction name, so R2 is not attempted: the store stays displaced.
      for (const n of ['', '.1', '.2', '.3', '.4']) mkdirSync(join(root, `${id}.obstruction-${stamp}${n}`));
      const r = await restoreStore(ctx(rh(), artifact), { forceInstallFail: 'target-exists', stamp });
      expect(r.reversal).toEqual({ mode: 'displace-then-rename', ok: false });
      expect(staged()).toEqual([`${id}.restoring-1`]);
      expect(r.leftovers).toContain(join(root, `${id}.restoring-1`));
      expect(r.error).toContain(r.displaced!);
    });

    it('a delete that fails is listed in leftovers and named, in one sentence, in the error', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      const stage = join(root, `${id}.restoring-1`);
      const r = await restoreStore(ctx(rh(), artifact), { forceInstallFail: 'target-exists', removeStaging: (() => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); }) as never });
      expect(r.reversal?.ok).toBe(true);
      expect(r.leftovers).toContain(stage);
      // Step 9's code is the host's own for a rename onto a store that exists: ENOTEMPTY on POSIX, EPERM on Windows
      // (`docs/defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
      const installCode = process.platform === 'win32' ? 'EPERM' : 'ENOTEMPTY';
      expect(r.error).toBe(`restore failed at step 9 (${installCode}); the previous store was put back. A working copy of the backup could not be removed and is at ${stage}; it holds nothing the backup file does not, and it can be deleted.`);
      expect(staged()).toEqual([`${id}.restoring-1`]);
    });
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
    // REQ-SESSION-202: the next open meets the place with no store in it and refuses, creating nothing there.
    expect(() => openWorkspaceStore(root, id, 'C:/ws')).toThrow(StorePlaceEmptyError);
    expect(existsSync(storeFile(root, id))).toBe(false);
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

  it('the kill-in-the-gap state (README B2; OQ-266, ruled 2026-10-13 under R-072): cut after the displacement and before the install, both stores are whole beside an empty target name, and the next open puts back the store the restore displaced and creates nothing', async () => {
    seed(root, id, [{ sid: 'S-1', rows: 3 }, { sid: 'S-2', rows: 2 }]);
    const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 4 }]);
    const cut = restoreStore(ctx(fakeRunHost(root, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { betweenRenames: async () => { throw new Error('cut'); } });
    await expect(cut).rejects.toThrow('cut');
    expect(existsSync(storeDir(root, id))).toBe(false);
    const aside = readdirSync(root).filter((n) => n.startsWith(`${id}.`)).sort();
    expect(aside.map((n) => n.replace(/displaced-.*$/, 'displaced-<stamp>'))).toEqual([`${id}.displaced-<stamp>`, `${id}.restore-pending`, `${id}.restoring-1`]);
    const sessionsIn = (dir: string): string[] => {
      const db = openStore(join(root, dir, 'workspace.db'), { readonly: true, mustExist: true });
      const s = new StoreDal(db).listSessions().map((r) => r.session_id).sort();
      expect(db.pragma('quick_check', { simple: true })).toBe('ok');
      db.close();
      return s;
    };
    expect(sessionsIn(aside[0]!)).toEqual(['S-1', 'S-2']);
    expect(sessionsIn(aside[2]!)).toEqual(['S-from-backup']);
    const displacedBytes = readFileSync(join(root, aside[0]!, 'workspace.db'));
    // What the workspace service's open does next (`openOwn` → `openWorkspaceStore`): the displaced store put back, nothing created.
    const reopened = openWorkspaceStore(root, id, 'C:/ws');
    expect(reopened.migration).toEqual({ kind: 'unchanged', version: CURRENT_SCHEMA_VERSION });
    expect(new StoreDal(reopened.db).listSessions().map((r) => r.session_id).sort()).toEqual(['S-1', 'S-2']);
    expect(reopened.cutRestore).toEqual({ reversed: join(root, aside[0]!), hadStore: true, staging: join(root, `${id}.restoring-1`), stamp: aside[0]!.replace(`${id}.displaced-`, '') });
    reopened.db.close();
    forgetSpelling(reopened.dir);
    expect(readFileSync(storeFile(root, id))).toEqual(displacedBytes);
    expect(readdirSync(root).filter((n) => n.startsWith(`${id}.`))).toEqual([`${id}.restoring-1`]);
  });

  describe('OQ-266 (ruled 2026-10-13 under R-072): the restore journal, and the next open that acts on it', () => {
    const rh = (wid: WorkspaceId = id) => fakeRunHost(root, wid, { raceAtStep: 'none', closeAnswers: true });
    const journal = () => restoreJournal(root, id);

    it('the journal is absent after a successful restore and after a successful in-process reversal', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 1 }]);
      const ok = await restoreStore(ctx(rh(), artifact));
      expect(ok.ok).toBe(true);
      expect(ok.steps).toContain('8-journal');
      expect(existsSync(journal())).toBe(false);
      const reversed = await restoreStore(ctx(rh(), artifact), { forceInstallFail: 'target-exists' });
      expect(reversed.reversal?.ok).toBe(true);
      expect(existsSync(journal())).toBe(false);
    });

    it('a journal that cannot be written is a returned failure that leaves the store as it was and deletes the staging copy (OQ-265 over OQ-266\'s step)', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      // Something other than a file at the journal's name: the write fails (EISDIR) as a full disk or a refused create would.
      mkdirSync(journal());
      const before = treeHash(storeDir(root, id));
      const r = await restoreStore(ctx(rh(), artifact));
      expect(r.ok).toBe(false);
      expect(r.abandoned).toBe(false);
      expect(r.error).toMatch(/^the restore's journal could not be written: /);
      expect(r.steps).not.toContain('8-journal');
      expect(treeHash(storeDir(root, id))).toBe(before);
      expect(readdirSync(root).filter((n) => n.includes('.restoring-') || n.includes('.displaced-'))).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('an origin.txt that cannot be written (step 9a) is a returned failure that leaves the store as it was and deletes the staging copy (OQ-265)', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      // An artifact whose container also carries a directory at origin.txt's name: step 9a's write fails (EISDIR) after the
      // run host has closed its store, as a full disk or a refused create would. Before the guard it rejected the restore.
      const unpacked = mkdtempSync(join(tmpdir(), 'rotaris-origin-dir-'));
      try {
        expandArtifactInto(artifact, unpacked);
        mkdirSync(join(unpacked, 'origin.txt'));
        writeFileSync(join(unpacked, 'origin.txt', 'x'), 'x');
        rmSync(artifact);
        expect(spawnSync(TAR, ['-cf', artifact, '-C', unpacked, '.']).status).toBe(0);
      } finally {
        rmSync(unpacked, { recursive: true, force: true });
      }
      const before = treeHash(storeDir(root, id));
      const r = await restoreStore(ctx(rh(), artifact));
      expect(r.ok).toBe(false);
      expect(r.abandoned).toBe(false);
      expect(r.error).toMatch(/^the restored store's origin could not be written: /);
      expect(r.steps).not.toContain('9a-origin');
      expect(r.steps).not.toContain('8-journal');
      expect(treeHash(storeDir(root, id))).toBe(before);
      expect(existsSync(journal())).toBe(false);
      expect(readdirSync(root).filter((n) => n.includes('.restoring-') || n.includes('.displaced-'))).toEqual([]);
      expect(r.leftovers).toEqual([]);
    });

    it('a journal that cannot be removed does not turn an open into a throw', () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      // A journal the remove cannot take (a non-empty directory in its place): the open still opens, reversing nothing.
      mkdirSync(journal());
      writeFileSync(join(journal(), 'x'), 'x');
      expect(() => recoverCutRestore(root, id)).not.toThrow();
      const r = openWorkspaceStore(root, id, 'C:/ws');
      expect(r.cutRestore).toBeUndefined();
      expect(new StoreDal(r.db).listSessions().map((x) => x.session_id)).toEqual(['S-1']);
      r.db.close();
      forgetSpelling(r.dir);
    });

    it('a stale journal beside a present store acts on nothing and is removed; a .displaced-* beside it is never touched', () => {
      const stamp = '2026-10-13T00-00-00-000Z';
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const old = join(root, `${id}.displaced-${stamp}`);
      mkdirSync(old);
      writeFileSync(join(old, 'marker'), 'kept');
      writeRestoreJournal(root, id, { stamp, stagingN: 1, targetExisted: true });
      const r = openWorkspaceStore(root, id, 'C:/ws');
      expect(r.cutRestore).toBeUndefined();
      expect(new StoreDal(r.db).listSessions().map((x) => x.session_id)).toEqual(['S-1']);
      r.db.close();
      forgetSpelling(r.dir);
      expect(existsSync(journal())).toBe(false);
      expect(readFileSync(join(old, 'marker'), 'utf8')).toBe('kept');
    });

    it('an older .displaced-* and a .restoring-1 with no journal, the target absent: an ordinary empty open, nothing reinstated', () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const c = claimAsideName(root, id, '2026-10-01T00-00-00-000Z', 'displaced', storeDir(root, id));
      expect(c.ok).toBe(true);
      mkdirSync(join(root, `${id}.restoring-1`));
      const r = openWorkspaceStore(root, id, 'C:/ws');
      expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
      expect(r.cutRestore).toBeUndefined();
      expect(new StoreDal(r.db).listSessions()).toEqual([]);
      r.db.close();
      forgetSpelling(r.dir);
      expect(existsSync(join(c.ok ? c.to : '', 'workspace.db'))).toBe(true);
    });

    it('a cut restore whose prepared copy was deleted by hand before the next open reports no kept copy (staging null)', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 2 }]);
      const cut = restoreStore(ctx(rh(), artifact), { betweenRenames: async () => { throw new Error('cut'); } });
      await expect(cut).rejects.toThrow('cut');
      rmSync(join(root, `${id}.restoring-1`), { recursive: true, force: true });
      const r = openWorkspaceStore(root, id, 'C:/ws');
      expect(r.cutRestore).toMatchObject({ hadStore: true, staging: null });
      expect(new StoreDal(r.db).listSessions().map((x) => x.session_id)).toEqual(['S-1']);
      r.db.close();
      forgetSpelling(r.dir);
    });

    it('a cut restore into a workspace that had no store here reinstates nothing, sets the notice field, and creates the ordinary store', async () => {
      const fresh = mintWorkspaceId('00000000000000000000000000000015');
      const artifact = makeArtifact(root, fresh, [{ sid: 'S-from-backup', rows: 2 }]);
      const cut = restoreStore({ ...ctx(rh(fresh), artifact), id: fresh }, { betweenRenames: async () => { throw new Error('cut'); } });
      await expect(cut).rejects.toThrow('cut');
      expect(existsSync(restoreJournal(root, fresh))).toBe(true);
      const r = openWorkspaceStore(root, fresh, 'C:/ws');
      expect(r.cutRestore).toEqual({ reversed: null, hadStore: false, staging: join(root, `${fresh}.restoring-1`), stamp: expect.any(String) });
      expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
      expect(new StoreDal(r.db).listSessions()).toEqual([]);
      r.db.close();
      forgetSpelling(r.dir);
      expect(existsSync(restoreJournal(root, fresh))).toBe(false);
    });

    it('a reversal whose R2 failed keeps the journal, says the next open will retry, and the next open puts the store back', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 2 }, { sid: 'S-2', rows: 1 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 3 }]);
      const r = await restoreStore(ctx(rh(), artifact), { forceInstallFail: 'target-exists', forceReversalFail: true });
      expect(r.reversal).toEqual({ mode: 'displace-then-rename', ok: false, obstruction: expect.any(String) });
      expect(existsSync(storeDir(root, id))).toBe(false);
      expect(existsSync(journal())).toBe(true);
      expect(r.error).toMatch(/; the next open of this workspace will try that rename again$/);
      const reopened = openWorkspaceStore(root, id, 'C:/ws');
      expect(reopened.cutRestore?.reversed).toBe(r.displaced);
      expect(new StoreDal(reopened.db).listSessions().map((x) => x.session_id).sort()).toEqual(['S-1', 'S-2']);
      reopened.db.close();
      forgetSpelling(reopened.dir);
      expect(existsSync(journal())).toBe(false);
    });

    it('a rename back that fails keeps the journal and refuses the open, naming both paths, with nothing created', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 1 }]);
      await expect(restoreStore(ctx(rh(), artifact), { betweenRenames: async () => { throw new Error('cut'); } })).rejects.toThrow('cut');
      const displaced = readdirSync(root).find((n) => n.includes('.displaced-'))!;
      const refusing = () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
      expect(() => recoverCutRestore(root, id, { rename: refusing as never })).toThrow(CutRestoreError);
      try { recoverCutRestore(root, id, { rename: refusing as never }); } catch (e) {
        expect((e as Error).message).toBe(`the store for this workspace is at ${join(root, displaced)} and must be renamed to ${storeDir(root, id)} (EPERM)`);
      }
      expect(existsSync(journal())).toBe(true);
      expect(existsSync(storeDir(root, id))).toBe(false);
      // A displaced store that is not there is refused the same way: nothing is created over the condition.
      rmSync(join(root, displaced), { recursive: true });
      expect(() => openWorkspaceStore(root, id, 'C:/ws')).toThrow(CutRestoreError);
      expect(existsSync(storeDir(root, id))).toBe(false);
      expect(existsSync(journal())).toBe(true);
    });

    it('an open that skips the check while its own restore is in flight creates nothing where the journal stands beside an absent store', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 1 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 1 }]);
      await expect(restoreStore(ctx(rh(), artifact), { betweenRenames: async () => { throw new Error('cut'); } })).rejects.toThrow('cut');
      expect(() => openWorkspaceStore(root, id, 'C:/ws', { recover: false })).toThrow(RestorePendingError);
      expect(existsSync(storeDir(root, id))).toBe(false);
      expect(existsSync(journal())).toBe(true);
    });

    it('(counterfactual, the journal not written) the cut is the case as it was: the next open creates an empty store', async () => {
      seed(root, id, [{ sid: 'S-1', rows: 3 }, { sid: 'S-2', rows: 2 }]);
      const artifact = makeArtifact(root, id, [{ sid: 'S-from-backup', rows: 4 }]);
      await expect(restoreStore(ctx(rh(), artifact), { skipJournal: true, betweenRenames: async () => { throw new Error('cut'); } })).rejects.toThrow('cut');
      expect(existsSync(journal())).toBe(false);
      const reopened = openWorkspaceStore(root, id, 'C:/ws');
      expect(reopened.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
      expect(new StoreDal(reopened.db).listSessions()).toEqual([]);
      expect(reopened.cutRestore).toBeUndefined();
      reopened.db.close();
      forgetSpelling(reopened.dir);
    });
  });

  it('D8 (ADR-0058 consequence 18): an inspection of a cleanly closed store leaves its directory holding what it found; the read-only open (counterfactual, D8 as it was) leaves -wal and -shm', () => {
    seed(root, id, [{ sid: 'S-1', rows: 1 }]);
    const dir = storeDir(root, id);
    const before = readdirSync(dir).sort();
    expect(before.filter((n) => SIDECAR_PATTERN.test(n))).toEqual([]);
    const insp = openStoreForInspection(storeFile(root, id));
    expect(new StoreDal(insp).listSessions().map((s) => s.session_id)).toEqual(['S-1']);
    insp.close();
    forgetSpelling(dir);
    expect(readdirSync(dir).sort()).toEqual(before);
    const ro = openStore(storeFile(root, id), { readonly: true, mustExist: true });
    expect(new StoreDal(ro).listSessions()).toHaveLength(1);
    ro.close();
    expect(readdirSync(dir).filter((n) => SIDECAR_PATTERN.test(n)).sort()).toEqual(['workspace.db-shm', 'workspace.db-wal']);
  });
  it('D8: an inspection while another connection holds the store reads its logged rows and leaves its two files to it', () => {
    seed(root, id, [{ sid: 'S-1', rows: 1 }]);
    const holder = openStore(storeFile(root, id), { mustExist: true });
    holder.pragma('wal_autocheckpoint = 0');
    new StoreDal(holder).upsertSession({ session_id: 'S-held', execution_status: 'running', workspace_root: 'C:\\ws', created_at: 't', updated_at: 't' });
    const insp = openStoreForInspection(storeFile(root, id));
    expect(insp.readonly).toBe(true);
    expect(new StoreDal(insp).listSessions().map((s) => s.session_id).sort()).toEqual(['S-1', 'S-held']);
    insp.close();
    expect(readdirSync(storeDir(root, id)).filter((n) => SIDECAR_PATTERN.test(n)).sort()).toEqual(['workspace.db-shm', 'workspace.db-wal']);
    holder.close();
    forgetSpelling(storeDir(root, id));
    expect(readdirSync(storeDir(root, id)).filter((n) => SIDECAR_PATTERN.test(n))).toEqual([]);
  });
});

describe('store — D11: a restore refuses before step 1 where a store it would create crosses the engine\'s path limit (ADR-0058 consequence 18)', () => {
  const id = mintWorkspaceId('00000000000000000000000000000012');
  const made: string[] = [];
  afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });
  /** A workspaces root whose live `workspace.db` path is exactly `dbLength` characters long. */
  const rootFor = (dbLength: number): string => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'rotaris-long-')));
    made.push(base);
    let dir = base;
    let rem = dbLength - (1 + id.length + 1 + 'workspace.db'.length) - dir.length;
    while (rem > 0) {
      const take = rem >= 103 ? 100 : rem === 102 ? 99 : rem - 1;
      dir = join(dir, 'p'.repeat(take));
      rem -= take + 1;
    }
    mkdirSync(dir, { recursive: true });
    expect(storeFile(dir, id).length).toBe(dbLength);
    return dir;
  };
  const ctxAt = (r: string, rh: RunHostControl, artifact: string) => ({
    workspacesRoot: r, id, artifact, thisMachine: M, originLabel: 'C:\\ws', runHost: rh, timers: clocks.timers, wall: clocks.wall,
  });

  it('the limit is the engine\'s on Windows, 251 characters of database path, and none where none was measured', () => {
    expect(storePathLimit('win32')).toBe(251);
    expect(storePathLimit('linux')).toBeNull();
    expect(storePathLimit('darwin')).toBeNull();
    // The assessment reads no clock, so it measures the kept name with the stamp's fixed length.
    expect(fileStamp(clocks.wall.instant())).toHaveLength(FILE_STAMP_LENGTH);
  });

  for (const live of [215, 230, 251]) {
    it(`a live store at ${live} characters is refused before step 1 — nothing asked of the run host, the target untouched, nothing beside it`, async () => {
      const r0 = rootFor(live);
      seed(r0, id, [{ sid: 'S-1', rows: 2 }]);
      const artifact = makeArtifact(r0, id, [{ sid: 'S-from-backup', rows: 1 }]);
      const before = treeHash(storeDir(r0, id));
      const listing = readdirSync(r0).sort();
      const rh = fakeRunHost(r0, id, { raceAtStep: 'none', closeAnswers: true });
      const r = await restoreStore(ctxAt(r0, rh, artifact), { storePathLimit: 251 });
      expect(r.ok).toBe(false);
      expect(r.abandoned).toBe(true);
      expect(r.steps).toEqual(['0-path-too-long']);
      expect(r.error).toContain(`${live + 37} characters`);
      expect(r.error).toContain('251');
      expect(rh.log).toEqual([]);
      expect(treeHash(storeDir(r0, id))).toBe(before);
      expect(readdirSync(r0).sort()).toEqual(listing);
    });
  }

  it('at 214 characters the widest kept name is 251 and the restore proceeds; the kept store opens', async () => {
    const r0 = rootFor(214);
    seed(r0, id, [{ sid: 'S-1', rows: 2 }]);
    const artifact = makeArtifact(r0, id, [{ sid: 'S-from-backup', rows: 1 }]);
    const r = await restoreStore(ctxAt(r0, fakeRunHost(r0, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { storePathLimit: 251 });
    expect(r.ok).toBe(true);
    expect(join(r.displaced!, 'workspace.db').length).toBeLessThanOrEqual(251);
    expect(counts(r0, id).sids).toEqual(['S-from-backup']);
  });

  it('(counterfactual, D11 as it was) with no limit the same 230-character store is restored and the copy it keeps lands past 251', async () => {
    const r0 = rootFor(230);
    seed(r0, id, [{ sid: 'S-1', rows: 2 }]);
    const artifact = makeArtifact(r0, id, [{ sid: 'S-from-backup', rows: 1 }]);
    const r = await restoreStore(ctxAt(r0, fakeRunHost(r0, id, { raceAtStep: 'none', closeAnswers: true }), artifact), { storePathLimit: null });
    expect(r.ok).toBe(true);
    expect(join(r.displaced!, 'workspace.db').length).toBe(265);
  });

  it('with nothing to displace only the staging store is measured, 12 characters longer: 239 characters proceeds, 240 is refused', async () => {
    const ok = rootFor(239);
    const a1 = makeArtifact(ok, id, [{ sid: 'S-from-backup', rows: 1 }]);
    const r1 = await restoreStore(ctxAt(ok, fakeRunHost(ok, id, { raceAtStep: 'none', closeAnswers: true }), a1), { storePathLimit: 251 });
    expect(r1.ok).toBe(true);
    const no = rootFor(240);
    const a2 = makeArtifact(no, id, [{ sid: 'S-from-backup', rows: 1 }]);
    const r2 = await restoreStore(ctxAt(no, fakeRunHost(no, id, { raceAtStep: 'none', closeAnswers: true }), a2), { storePathLimit: 251 });
    expect(r2.abandoned).toBe(true);
    expect(r2.error).toContain('252 characters');
    expect(existsSync(storeDir(no, id))).toBe(false);
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
  /**
   * PD-LIBRARY-001. The migration is the part of this change that touches data somebody already has, so it is
   * tested against a store stopped at v15 rather than against a fresh one: the column arrives, the row that
   * predates it survives, and it reads `[]` — "this artifact recorded no commands" — because the figure was
   * never captured for it and cannot be recovered. REQ-LIBRARY-090 then omits the section entirely, so an old
   * artifact renders exactly as it did rather than growing a heading that would claim the child ran nothing.
   */
  it('PD-LIBRARY-001: a v15 store migrates forward; an artifact written before it keeps its row and reads no commands', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f1');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
    // Drop back to v15 and remove the column, so what is exercised is the ALTER and not the fresh-create path.
    const sid = asSessionId('S-v16');
    new StoreDal(r.db).upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    // The DAL prepares every statement at construction, so the column goes only after one exists — a DAL built
    // against the v15 shape could not be built at all, which is the point the ALTER is here to cover.
    r.db.exec('ALTER TABLE artifacts DROP COLUMN commands');
    // v17's and v18's objects go with it: a store stopped at v15 has none of them, and the run replays
    // the migrations in order. v18 (ADR-0061) added the two typed-run session columns and the two
    // improvement tables — the improvements tables are dropped whole; the session columns go the way
    // plan_cycle's did, with the CHECK-bearing run_type dropped first.
    r.db.exec('DROP TABLE improvement_artifact_versions');
    r.db.exec('DROP TABLE improvement_artifacts');
    r.db.exec('DROP TABLE plan_cycles');
    r.db.exec('ALTER TABLE sessions DROP COLUMN plan_cycle');
    r.db.exec('ALTER TABLE sessions DROP COLUMN plan_released');
    r.db.exec('ALTER TABLE sessions DROP COLUMN run_type');
    r.db.exec('ALTER TABLE sessions DROP COLUMN improvement_artifact_ids');
    // v21's column goes too: a store stopped at v15 predates PD-MONITOR-001 revision 2's qualifier.
    r.db.exec('ALTER TABLE sessions DROP COLUMN cost_qualifier');
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.pragma('user_version = 15');
    r.db.prepare(`INSERT INTO artifacts (session_id, id, slug, title, kind, source_task_id, canonical_name, source_persona, status, summary, key_findings,
      highlight_paths, snippets, edited_files, created_files, tags, supersedes, superseded_by, created_by, consumed_by, timeline_event_id, conversation_id, importance, created_at, edited_at, body_file)
      VALUES (?, 'art_oldAAAAA', 'old', 't', 'child_report', 'bg_1', 'tester-1', 'tester', 'succeeded', 's', 'k', '[]', '[]', '[]', '[]', '[]', NULL, NULL, 'a', '[]', NULL, NULL, 'normal', 't', NULL, 'artifact-old.md')`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 15, to: CURRENT_SCHEMA_VERSION });
    const after = new StoreDal(r.db).artifactsOf(sid);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe('art_oldAAAAA');
    expect(after[0]!.commands).toBe('[]');
    r.db.close();
    forgetSpelling(r.dir);
  });
  /**
   * REQ-ORCH-153/154 (ADR-0062). The plan gate's durable half, tested from a store stopped at v16: the table and
   * the two session columns arrive, a session that predates them survives with no gate held and no release, and
   * the round trip a park-and-answer performs works over the migrated shape — insert a cycle, edit it, decide it,
   * and see the edit refused once the cycle is decided (REQ-ORCH-154: an answered gate takes no further edit).
   */
  it('REQ-ORCH-153/154: a v16 store migrates to v17; an older session reads no plan gate and no release', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f2');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    expect(r.migration).toEqual({ kind: 'migrated', from: 0, to: CURRENT_SCHEMA_VERSION });
    const sid = asSessionId('S-v17');
    new StoreDal(r.db).upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    // v18's objects go with it: a store stopped at v16 has none of them, and the run replays the
    // migrations in order (see the v15 test above for why the session columns drop last).
    r.db.exec('DROP TABLE improvement_artifact_versions');
    r.db.exec('DROP TABLE improvement_artifacts');
    r.db.exec('DROP TABLE plan_cycles');
    r.db.exec('ALTER TABLE sessions DROP COLUMN plan_cycle');
    r.db.exec('ALTER TABLE sessions DROP COLUMN plan_released');
    r.db.exec('ALTER TABLE sessions DROP COLUMN run_type');
    r.db.exec('ALTER TABLE sessions DROP COLUMN improvement_artifact_ids');
    // v21's column goes too: a store stopped at v16 predates PD-MONITOR-001 revision 2's qualifier.
    r.db.exec('ALTER TABLE sessions DROP COLUMN cost_qualifier');
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.pragma('user_version = 16');
    // The migration ladder is append-only and runs to the build's own top, so the store stopped at
    // v16 climbs every appended rung — 17 and then 18 — not a v16→17 hop that never existed alone.
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 16, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    const before = dal.getSession(sid)!;
    expect(before.plan_cycle).toBeNull();
    expect(before.plan_released).toBe(0);
    expect(dal.planCyclesOf(sid)).toEqual([]);

    dal.insertPlanCycle(sid, 1, 't0', 'the plan, verbatim', 'small_feature', '', '');
    dal.setPlanGate(sid, 'awaiting_plan_decision', 1, 't1');
    expect(dal.getSession(sid)!.plan_cycle).toBe(1);
    expect(dal.editPlanCycle(sid, 1, 'the user edited it')).toBe(true);
    const held = dal.planCycle(sid, 1)!;
    // The role's text is never rewritten; the edit is beside it.
    expect(held.plan).toBe('the plan, verbatim');
    expect(held.edited).toBe('the user edited it');
    expect(dal.decidePlanCycle(sid, 1, 'approve', 't2')).toBe(true);
    // Recorded once: a second answer for the same cycle changes nothing.
    expect(dal.decidePlanCycle(sid, 1, 'cancel', 't3')).toBe(false);
    expect(dal.editPlanCycle(sid, 1, 'too late')).toBe(false);
    dal.setPlanGate(sid, 'idle', null, 't4');
    dal.setPlanReleased(sid, true, 't4');
    const after = dal.getSession(sid)!;
    expect(after.plan_cycle).toBeNull();
    expect(after.plan_released).toBe(1);
    expect(dal.planCycle(sid, 1)).toMatchObject({ decision: 'approve', decided_at: 't2', edited: 'the user edited it' });
    r.db.close();
    forgetSpelling(r.dir);
  });
  /**
   * PD-LIBRARY-002 (ADR-0065): the v18→v19 rebuild. What is asserted here is what nearly went wrong writing it —
   * the recorded VERSIONS survive. `migrateStore` enforces foreign keys, so dropping the parent while the old
   * child still referenced it would have cascaded REQ-LIBRARY-162's whole history away without raising a thing.
   */
  it('PD-LIBRARY-002: a v18 store migrates to v19, keeping every recorded version and stamping every row post_run', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f3');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    // Back to the v18 shape: the two improvement tables as ADR-0061 wrote them, NOT NULL source and no source_kind.
    r.db.exec('DROP TABLE improvement_artifact_versions; DROP TABLE improvement_artifacts;');
    r.db.exec(`
      CREATE TABLE improvement_artifacts (
        artifact_id TEXT PRIMARY KEY, source_session_id TEXT NOT NULL, source_run_type TEXT NOT NULL,
        generated_at TEXT NOT NULL, body TEXT NOT NULL,
        versions_due INTEGER NOT NULL DEFAULT 0 CHECK (versions_due >= 0),
        versions_pruned INTEGER NOT NULL DEFAULT 0 CHECK (versions_pruned >= 0));
      CREATE INDEX improvement_artifacts_newest ON improvement_artifacts(generated_at DESC, artifact_id ASC);
      CREATE INDEX improvement_artifacts_by_session ON improvement_artifacts(source_session_id, generated_at DESC, artifact_id ASC);
      CREATE TABLE improvement_artifact_versions (
        artifact_id TEXT NOT NULL REFERENCES improvement_artifacts(artifact_id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version >= 1), recorded_at TEXT NOT NULL, cause TEXT NOT NULL,
        body TEXT NOT NULL, PRIMARY KEY (artifact_id, version));
    `);
    r.db.exec(`INSERT INTO improvement_artifacts VALUES ('impart_00000001', 'S-old', 'task_run', 't1', '{"a":1}', 2, 0);`);
    r.db.exec(`INSERT INTO improvement_artifact_versions VALUES ('impart_00000001', 1, 't1', 'collected', '{"a":1}'), ('impart_00000001', 2, 't2', 'edit', '{"a":2}');`);
    // v21's column goes too: a store stopped at v18 predates PD-MONITOR-001 revision 2's qualifier.
    r.db.exec('ALTER TABLE sessions DROP COLUMN cost_qualifier');
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.pragma('user_version = 18');

    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 18, to: CURRENT_SCHEMA_VERSION });
    const artifact = r.db.prepare('SELECT * FROM improvement_artifacts').get() as { source_kind: string; source_session_id: string | null; versions_due: number };
    expect([artifact.source_kind, artifact.source_session_id, artifact.versions_due]).toEqual(['post_run', 'S-old', 2]);
    const versions = r.db.prepare('SELECT version, cause FROM improvement_artifact_versions ORDER BY version').all() as { version: number; cause: string }[];
    expect(versions).toEqual([{ version: 1, cause: 'collected' }, { version: 2, cause: 'edit' }]);

    // A retrospective row takes NULL where a post-run row may not, and the CHECK still holds the post-run case.
    r.db.exec(`INSERT INTO improvement_artifacts VALUES ('impart_00000002', NULL, 'retrospective', 'task_run', 't3', '{}', 0, 0);`);
    expect(() => r.db.exec(`INSERT INTO improvement_artifacts VALUES ('impart_00000003', NULL, 'post_run', 'task_run', 't4', '{}', 0, 0);`)).toThrow(/CHECK/);
    expect(() => r.db.exec(`INSERT INTO improvement_artifacts VALUES ('impart_00000004', 'S', 'insight', 'task_run', 't5', '{}', 0, 0);`)).toThrow(/CHECK/);

    // A declared index is not an index the planner uses: both recreated ones are asserted, not assumed.
    const plan = (sql: string, ...args: unknown[]) => (r.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((entry) => entry.detail).join(' | ');
    expect(plan('SELECT * FROM improvement_artifacts ORDER BY generated_at DESC, artifact_id ASC')).toContain('improvement_artifacts_newest');
    expect(plan('SELECT * FROM improvement_artifacts WHERE source_session_id = ? ORDER BY generated_at DESC, artifact_id ASC', 'S-old')).toContain('improvement_artifacts_by_session');
    r.db.close();
    forgetSpelling(r.dir);
  });
  /**
   * REQ-SESSION-166: the v19→v20 rebuild. `plan_cycles` gains REFERENCES sessions(session_id)
   * ON DELETE CASCADE; rows whose session still exists survive VERBATIM, and the orphans v19 let
   * accumulate are dropped — that drop IS the delete the user asked for. The cascade is then
   * measured, not assumed: deleting the session removes its cycles and nothing of another session.
   */
  it('REQ-SESSION-166: a v19 store migrates to v20; live plan cycles survive verbatim, orphans drop, the delete cascades', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f4');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const live = asSessionId('S-live');
    const other = asSessionId('S-other');
    const setup = new StoreDal(r.db);
    for (const sid of [live, other]) setup.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    setup.insertPlanCycle(live, 1, 't0', 'the plan, verbatim', 'small_feature', '', '');
    // Back to the v19 shape: the same columns without the reference, so the orphan below inserts
    // the way v19 allowed — no foreign key to refuse it.
    r.db.exec(`CREATE TABLE plan_cycles_v19 (
        session_id TEXT NOT NULL, cycle INTEGER NOT NULL, opened_at TEXT NOT NULL, plan TEXT NOT NULL,
        intent TEXT NOT NULL, todo TEXT NOT NULL DEFAULT '', changes TEXT NOT NULL DEFAULT '',
        edited TEXT, decision TEXT, decided_at TEXT, PRIMARY KEY (session_id, cycle));
      INSERT INTO plan_cycles_v19 SELECT * FROM plan_cycles;
      DROP TABLE plan_cycles;
      ALTER TABLE plan_cycles_v19 RENAME TO plan_cycles;`);
    r.db.prepare("INSERT INTO plan_cycles (session_id, cycle, opened_at, plan, intent, todo) VALUES ('S-gone', 1, 't0', 'orphan', 'small_feature', '')").run();
    // v21's column goes too: a store stopped at v19 predates PD-MONITOR-001 revision 2's qualifier.
    r.db.exec('ALTER TABLE sessions DROP COLUMN cost_qualifier');
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.pragma('user_version = 19');

    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 19, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    // The live cycle survives VERBATIM (REQ-ORCH-154); the orphan is gone with the session it named.
    expect(dal.planCycle(live, 1)).toMatchObject({ plan: 'the plan, verbatim', intent: 'small_feature' });
    expect(r.db.prepare("SELECT count(*) AS c FROM plan_cycles WHERE session_id = 'S-gone'").get()).toMatchObject({ c: 0 });
    // The reference is declared, not assumed: read it from the schema the delete relies on.
    expect((r.db.prepare("SELECT count(*) AS c FROM pragma_foreign_key_list('plan_cycles') WHERE \"from\" = 'session_id' AND \"table\" = 'sessions'").get() as { c: number }).c).toBe(1);
    // And the delete the requirement names takes the cycles with the session, leaving the other's.
    dal.insertPlanCycle(other, 1, 't0', 'the other plan', 'small_feature', '', '');
    expect(dal.transaction(() => dal.deleteSession(live))).toBe(true);
    expect(dal.planCyclesOf(live)).toEqual([]);
    expect(dal.planCycle(other, 1)!.plan).toBe('the other plan');
    r.db.close();
    forgetSpelling(r.dir);
  });

  /**
   * PD-MONITOR-001 revision 2 (R-049): v20→v21 adds `sessions.cost_qualifier`. Revision 1 produced only reported
   * figures, so a total with any non-zero digit was a reported one and is backfilled so; a zero total at any scale
   * stays `unknown`. The column refuses a qualifier outside the four, and a save writes it like every aggregate.
   */
  it('PD-MONITOR-001: a v20 store migrates to v21; a non-zero total reads reported, a zero one unknown, and a save carries the qualifier', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f5');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const setup = new StoreDal(r.db);
    const costs: Record<string, string> = { 'S-none': '0', 'S-scaled-zero': '0.0000', 'S-priced': '0.00154', 'S-whole': '2' };
    for (const sid of Object.keys(costs)) setup.upsertSession({ session_id: asSessionId(sid), execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    for (const [sid, cost] of Object.entries(costs)) r.db.prepare('UPDATE sessions SET cost = ? WHERE session_id = ?').run(cost, sid);
    r.db.exec('ALTER TABLE sessions DROP COLUMN cost_qualifier');
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.pragma('user_version = 20');

    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 20, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    const qualifier = (sid: string) => dal.getSession(asSessionId(sid))!.cost_qualifier;
    expect(Object.keys(costs).map(qualifier)).toEqual(['unknown', 'unknown', 'reported', 'reported']);
    dal.updateSessionRun(asSessionId('S-none'), { cost: '0.003', cost_qualifier: 'configured' });
    expect(dal.getSession(asSessionId('S-none'))).toMatchObject({ cost: '0.003', cost_qualifier: 'configured' });
    // A patch that does not name the qualifier keeps it, as every aggregate column is kept.
    dal.updateSessionRun(asSessionId('S-none'), { tokens_input: 5 });
    expect(qualifier('S-none')).toBe('configured');
    expect(() => dal.updateSessionRun(asSessionId('S-none'), { cost_qualifier: 'estimated' })).toThrow(/CHECK/);
    r.db.close();
    forgetSpelling(r.dir);
  });

  /** PD-ORCH-004 (R-057): v21→v22 adds `children.continuation_of`; a child written before it was no continuation, so it reads null. */
  it('PD-ORCH-004: a v21 store migrates to v22 and a child written before it reads continuation_of null', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f6');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const setup = new StoreDal(r.db);
    const sid = asSessionId('S-v21');
    setup.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    r.db.exec('ALTER TABLE children DROP COLUMN continuation_of');
    r.db.exec(UNDO_V23);
    r.db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, task, spawned_at)
      VALUES (?, 'bg_00000001', 'old', 'old', 'coding-agent', 'failed', 'root', 1, 1, 'm', 't', 't')`).run(sid);
    r.db.pragma('user_version = 21');

    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 21, to: CURRENT_SCHEMA_VERSION });
    expect(new StoreDal(r.db).getChild(sid, 'bg_00000001')!.continuation_of).toBeNull();
    r.db.close();
    forgetSpelling(r.dir);
  });

  /** PD-ORCH-005 / PD-TOOLS-006 revision 2 (R-060, R-061): v22→v23 — a child written before it was never paused and declared no scope it kept. */
  it('PD-ORCH-005: a v22 store migrates to v23 and a child written before it reads no interruption, no resume state and an empty write scope', () => {
    const id = mintWorkspaceId('000000000000000000000000000000f7');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const setup = new StoreDal(r.db);
    const sid = asSessionId('S-v22');
    setup.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    r.db.exec(UNDO_V23);
    r.db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, task, spawned_at)
      VALUES (?, 'bg_00000001', 'old', 'old', 'coding-agent', 'failed', 'root', 1, 1, 'm', 't', 't')`).run(sid);
    r.db.pragma('user_version = 22');

    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 22, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getChild(sid, 'bg_00000001')).toMatchObject({ interruption: null, resume_state: null, write_scope: '[]' });
    expect(dal.iterationsOf(sid)).toEqual([]);
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
    dal.insertTimeline(sid, 1, 't1', 'run_start', 'rotaris', 'a run is starting for S-agg', '{"workspace_root":"C:/ws"}', 'aaaaaaaaaaaa', 'info');
    dal.insertTimeline(sid, 2, 't2', 'run_end', 'rotaris', 'the run ended', '{"execution_status":"completed"}', 'bbbbbbbbbbbb', 'warning');
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(['run_start', 'run_end']);
    // REQ-SESSION-134 (v10): the id and the severity are the entry's own columns and read back as written.
    expect(dal.timelineOf(sid).map((t) => [t.id, t.severity])).toEqual([['aaaaaaaaaaaa', 'info'], ['bbbbbbbbbbbb', 'warning']]);
    expect(dal.nextTimelineOrdinal(sid)).toBe(3);
    r.db.close();
    forgetSpelling(r.dir);
  });
  // v10 repairs Part U's thirty-second first-execution defect (ADR-0024's note, defect 42): REQ-SESSION-134 fixes the
  // entry's shape with an `id` and a `severity` and the table held neither.
  it('v10: an entry written as a pre-v10 store wrote one keeps an EMPTY id and reads the severity default; nothing is minted for it', () => {
    const id = mintWorkspaceId('00000000000000000000000000000091');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-v10');
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    // The pre-v10 write path exactly: the seven columns that existed before the migration, and no others.
    r.db.exec(`INSERT INTO timeline (session_id, ordinal, at, name, actor, message, metadata) VALUES ('${sid}', 1, 't1', 'run_start', 'rotaris', 'started', '{}')`);
    dal.insertTimeline(sid, 2, 't2', 'hook_run', 'A', 'a hook warned', '{}', 'dddddddddddd', 'warning');
    const rows = dal.timelineOf(sid);
    expect(rows.map((t) => [t.id, t.severity])).toEqual([['', 'info'], ['dddddddddddd', 'warning']]);
    // The columns take the row's ordering with them: neither is a predicate and the read stays under the primary key.
    const plan = (r.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid) as { detail: string }[]).map((p) => p.detail).join(' | ');
    expect(plan).toMatch(/PRIMARY KEY|USING INDEX sqlite_autoindex_timeline_1/);
    expect(plan).not.toMatch(/TEMP B-TREE/);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-ORCH-014: the newest entry of one name is read under the primary key, newest first, with no sort', () => {
    const id = mintWorkspaceId('00000000000000000000000000000092');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-latest');
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    expect(dal.latestTimelineEntry(sid, 'run_continuation_intent')).toBeUndefined();
    dal.insertTimeline(sid, 1, 't1', 'run_continuation_intent', 'rotaris', 'first', '{"n":1}', 'aaaaaaaa', 'info');
    dal.insertTimeline(sid, 2, 't2', 'run_start', 'rotaris', 'started', '{}', 'bbbbbbbb', 'info');
    dal.insertTimeline(sid, 3, 't3', 'run_continuation_intent', 'rotaris', 'second', '{"n":3}', 'cccccccc', 'info');
    dal.insertTimeline(sid, 4, 't4', 'run_start', 'rotaris', 'started', '{}', 'dddddddd', 'info');
    expect(dal.latestTimelineEntry(sid, 'run_continuation_intent')).toMatchObject({ ordinal: 3, metadata: '{"n":3}' });
    const plan = (r.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM timeline WHERE session_id = ? AND name = ? ORDER BY ordinal DESC LIMIT 1').all(sid, 'x') as { detail: string }[]).map((p) => p.detail).join(' | ');
    expect(plan).toMatch(/PRIMARY KEY|USING INDEX sqlite_autoindex_timeline_1/);
    expect(plan).not.toMatch(/TEMP B-TREE/);
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
    // REQ-MONITOR-167: the per-tool counts read one session's calls through the primary key, never a scan.
    expect(plan("SELECT tool_name, COUNT(*) AS count, COUNT(DISTINCT agent_name) AS agents FROM tool_calls WHERE session_id = 's' GROUP BY tool_name")).toContain('sqlite_autoindex_tool_calls_1');
    expect(plan("SELECT * FROM events WHERE session_id = 's' AND at >= ? AND at <= ? ORDER BY ordinal", 'a', 'b')).toContain('events_by_at');
    // REQ-SESSION-192: the resident window is read through its partial index.
    expect(plan("SELECT * FROM transcript_rows WHERE session_id = 's' AND page IS NULL ORDER BY row_index")).toContain('transcript_resident');
    // REQ-LIBRARY-096 (and REQ-SESSION-115's latest artifact): the DAL's own listing reads the session's artifacts in the
    // index's own order, with no sort (found by phase 6's third review: a hand-written copy did not cover the statement).
    const statements = (new StoreDal(r.db) as unknown as { stmts: Record<string, { source: string }> }).stmts;
    expect(plan(statements['artifactsOf']!.source, 's')).toBe('SEARCH artifacts USING INDEX artifacts_by_created (session_id=?)');
    // Live-run finding K1 (REQ-MONITOR-044/052): the agent surfaces' links are read at every snapshot, through the same index.
    expect(plan(statements['artifactLinksOf']!.source, 's')).toBe('SEARCH artifacts USING INDEX artifacts_by_created (session_id=?)');
    // REQ-LIBRARY-093 with OQ-106: so are the publishes that name a root no iteration records — the same index, and each
    // publish's conversation looked up among the session's children and its iterations' roots by primary-key prefix.
    const roots = plan(statements['rootPublishersOf']!.source, 's');
    expect(roots).toContain('SEARCH a USING INDEX artifacts_by_created (session_id=?)');
    expect(roots).toMatch(/SEARCH c USING (COVERING )?INDEX sqlite_autoindex_children_1 \(session_id=\? AND task_id=\?\)/);
    expect(roots).toContain('SEARCH i USING INDEX sqlite_autoindex_iterations_1 (session_id=?)');
    expect(roots).not.toMatch(/SCAN|TEMP B-TREE/);
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store — v4: the evidence rings (ADR-0024, REQ-SESSION-133/135/136/137, REQ-TOOLS-078)', () => {
  function open(n: string) {
    const id = mintWorkspaceId(`000000000000000000000000000000${n}`);
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId(`S-${n}`);
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    return { r, dal, sid };
  }
  it('the schema is v4; the session and row columns read their defaults; a tool row keeps its untruncated input and output', () => {
    const { r, dal, sid } = open('91');
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    const s = dal.getSession(sid)!;
    expect([s.permission_mode, s.sandboxed, s.pending_approvals]).toEqual([null, 0, '[]']);
    dal.appendRow(sid, 0, 'tool', false, 'glob **/*.ts', 't', { tool_name: 'glob', tool_status: 'running', call_key: 'c1', started_at: 't', input: '{"pattern":"**/*.ts"}' });
    expect(dal.settleRow(sid, 0, 'glob **/*.ts', { tool_status: 'ok', duration_ms: 12.5, output: 'x'.repeat(40_000) })).toBe(true);
    const row = dal.residentRows(sid)[0]!;
    expect([row.tool_name, row.tool_status, row.call_key, row.duration_ms, row.input?.length, row.output?.length]).toEqual(['glob', 'ok', 'c1', 12.5, 21, 40_000]);
    dal.updateSessionRun(sid, { permission_mode: 'ask', pending_approvals: '[{"request_id":"r1"}]' });
    expect(dal.getSession(sid)!.pending_approvals).toContain('r1');
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the ring assigns contiguous ordinals, displaces in the insert transaction, never reuses an ordinal, and counts the drops', () => {
    const { r, dal, sid } = open('92');
    const cap = 500; // issues
    for (let i = 1; i <= cap + 3; i += 1) {
      dal.transaction(() => dal.ringInsert('issues', sid, (ordinal) => dal.insertIssue({ session_id: sid, ordinal, id: `i${i}`, recorded_at: 't', kind: 'tool_error', severity: 'warning', actor: 'a', message: 'm', evidence_ref: '', metadata: '{}' })));
    }
    const rows = dal.issuesOf(sid);
    expect(rows).toHaveLength(cap);
    expect(rows[0]!.ordinal).toBe(4);
    expect(rows[rows.length - 1]!.ordinal).toBe(cap + 3);
    const st = dal.ringState(sid, 'issues');
    expect(st).toEqual({ next_ordinal: cap + 4, held: cap, dropped: 3 });
    // the export arithmetic: dropped + retained == newest ordinal, oldest - 1 == dropped
    expect(st.dropped + st.held).toBe(rows[rows.length - 1]!.ordinal);
    expect(rows[0]!.ordinal - 1).toBe(st.dropped);
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('a failed insert rolls the ordinal back with it, so the series stays contiguous', () => {
    const { r, dal, sid } = open('93');
    dal.transaction(() => dal.ringInsert('permission_audit', sid, (ordinal) => dal.insertAudit({ session_id: sid, ordinal, recorded_at: 't', kind: 'decision', entry: '{}', agent_id: 'a', persona: 'p', tool_name: 't', decision: 'allow', rule_id: 'r', source: 'rule' })));
    expect(() => dal.transaction(() => dal.ringInsert('permission_audit', sid, () => { throw new Error('boom'); }))).toThrow('boom');
    expect(dal.ringState(sid, 'permission_audit')).toEqual({ next_ordinal: 2, held: 1, dropped: 0 });
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the store refuses an update of an audit entry or an issue; the tool-call record is settled exactly once', () => {
    const { r, dal, sid } = open('94');
    dal.transaction(() => dal.ringInsert('permission_audit', sid, (ordinal) => dal.insertAudit({ session_id: sid, ordinal, recorded_at: 't', kind: 'decision', entry: '{}', agent_id: 'a', persona: 'p', tool_name: 't', decision: 'allow', rule_id: 'r', source: 'rule' })));
    expect(() => r.db.prepare('UPDATE permission_audit SET decision = ? WHERE session_id = ?').run('deny', sid)).toThrow(/append-only/);
    dal.transaction(() => dal.ringInsert('issues', sid, (ordinal) => dal.insertIssue({ session_id: sid, ordinal, id: 'abc', recorded_at: 't', kind: 'k', severity: 'warning', actor: 'a', message: 'm', evidence_ref: '', metadata: '{}' })));
    expect(() => r.db.prepare('UPDATE issues SET message = ? WHERE session_id = ?').run('x', sid)).toThrow(/append-only/);
    const { ordinal } = dal.transaction(() => dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c1', agent_name: 'a', tool_name: 'glob', status: 'running', started_at: 't', elapsed_ms: null, is_error: 0, entry: '{"status":"running"}' })));
    expect(dal.settleToolCall(sid, ordinal, 'ok', 3.2, false, '{"status":"ok"}')).toBe(true);
    expect(dal.settleToolCall(sid, ordinal, 'failed', 4, true, '{}')).toBe(false);
    expect(() => r.db.prepare('UPDATE tool_calls SET call_id = ? WHERE session_id = ?').run('c2', sid)).toThrow(/settled exactly once/);
    expect(dal.toolCallsOf(sid)[0]).toMatchObject({ status: 'ok', elapsed_ms: 3.2, call_id: 'c1' });
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the summary\'s digest reads two fields of the entry and never the entry; a malformed entry reads NULL (REQ-SESSION-140)', () => {
    const { r, dal, sid } = open('9b');
    const insert = (callId: string, entry: string) => dal.transaction(() => dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: callId, agent_name: 'a', tool_name: 'terminal', status: 'failed', started_at: 't', elapsed_ms: 9, is_error: 1, entry })));
    insert('c1', JSON.stringify({ outcome_kind: 'shell_failure', failure_kind: 'exit', args: { command: 'x'.repeat(5000) } }));
    insert('c2', '{not json');
    insert('c3', JSON.stringify({ outcome_kind: 7, failure_kind: { kind: 'exit' } }));
    const digest = dal.toolCallDigestOf(sid);
    expect(digest.map((d) => [d.call_id, d.outcome_kind, d.failure_kind])).toEqual([['c1', 'shell_failure', 'exit'], ['c2', null, null], ['c3', null, null]]);
    expect(Object.keys(digest[0]!)).not.toContain('entry');
    dal.appendRow(sid, 0, 'user', true, '   ');
    dal.appendRow(sid, 1, 'user', true, 'first');
    dal.appendRow(sid, 2, 'user', true, 'second');
    expect(dal.firstPromptRow(sid)?.body).toBe('first');
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the summary reads each context_selection entry\'s task and elided attachments, in order, over the primary key (PD-SESSION-002)', () => {
    const { r, dal, sid } = open('9c');
    const entry = (ordinal: number, name: string, metadata: string) => dal.insertTimeline(sid, ordinal, `t${ordinal}`, name, 'rotaris', 'm', metadata, String(ordinal).padStart(12, '0'), 'info');
    entry(1, 'context_selection', JSON.stringify({ task_id: 'bg_a', attached_included: 1, attached_elided: ['art_1', 'art_2'] }));
    entry(2, 'run_start', JSON.stringify({ task_id: 'bg_x', attached_elided: ['art_9'] }));
    entry(3, 'context_selection', '{not json');
    entry(4, 'context_selection', JSON.stringify({ task_id: 7, attached_elided: 'art_3' }));
    entry(5, 'context_selection', JSON.stringify({ task_id: 'bg_b', attached_elided: [] }));
    const rows = dal.elidedAttachmentRowsOf(sid);
    expect(rows.map((x) => [x.ordinal, x.task_id, x.attached_elided === null ? null : JSON.parse(x.attached_elided)])).toEqual([
      [1, 'bg_a', ['art_1', 'art_2']], [3, null, null], [4, null, null], [5, 'bg_b', []],
    ]);
    const plan = r.db.prepare("EXPLAIN QUERY PLAN SELECT ordinal FROM timeline WHERE session_id = ? AND name = 'context_selection' ORDER BY ordinal").all(sid) as { detail: string }[];
    expect(plan.map((p) => p.detail).join(' | ')).toMatch(/PRIMARY KEY|USING INDEX sqlite_autoindex/);
    expect(plan.map((p) => p.detail).join(' | ')).not.toMatch(/TEMP B-TREE/);
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the ring reads and the settle are served by the primary key — no index is declared and none is scanned (spike 8)', () => {
    const { r, dal, sid } = open('95');
    for (const sql of ['SELECT * FROM permission_audit WHERE session_id = ? ORDER BY ordinal', 'SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal', 'SELECT * FROM issues WHERE session_id = ? ORDER BY ordinal']) {
      const plan = r.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(sid) as { detail: string }[];
      expect(plan.map((p) => p.detail).join(' | ')).toMatch(/PRIMARY KEY|USING INDEX sqlite_autoindex/);
      expect(plan.map((p) => p.detail).join(' | ')).not.toMatch(/TEMP B-TREE/);
    }
    void dal;
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store — v5: the child ledger (ADR-0012, REQ-ORCH-043/049/050/151)', () => {
  function open(n: string) {
    const id = mintWorkspaceId(`000000000000000000000000000000${n}`);
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId(`S-${n}`);
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    return { r, dal, sid };
  }
  const child = (sid: string, taskId: string, state = 'queued') => ({
    session_id: asSessionId(sid), task_id: taskId, canonical_name: taskId, given_name: taskId, persona: 'coding-agent', state, parent_id: 'root', depth: 1, iteration: 1,
    model_key: 'm', category: '', background: 1, task: 'do it', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't',
  });
  it('PD-TOOLS-006 revision 2 (found by phase 4\'s review): children accepted in the same millisecond are listed in the order they were accepted, not by their random ids', () => {
    const { r, dal, sid } = open('95');
    for (const id of ['bg_0000ffff', 'bg_00000001', 'bg_00008000']) dal.insertChild(child(sid, id));
    expect(dal.childrenOf(sid).map((c) => c.task_id)).toEqual(['bg_0000ffff', 'bg_00000001', 'bg_00008000']);
    expect(dal.childrenOfIteration(sid, 1).map((c) => c.task_id)).toEqual(['bg_0000ffff', 'bg_00000001', 'bg_00008000']);
    r.db.close();
  });
  it('the schema is v19; a child row round-trips with its defaults; the claim is one conditional update that wins exactly once', () => {
    const { r, dal, sid } = open('96');
    // REQ-ORCH-153/154: v17 adds `plan_cycles` and the two session columns; v16 added `artifacts.commands`;
    // v18 (ADR-0061) added the typed-run session columns and the improvement tables; v19 (ADR-0065)
    // rebuilt `improvement_artifacts` for PD-LIBRARY-002's retrospective, which belongs to no session;
    // v20 gives `plan_cycles` the cascade REQ-SESSION-166's delete assumes; v21 records the cost qualifier; v22 the
    // continuation a child was delegated as (PD-ORCH-004); v23 the record a paused run resumes from (PD-ORCH-005); v24 the
    // fingerprint each agent started with (PD-ORCH-005 revision 4 clause 14); v25 the call's `suppress_auto_context` (REQ-TOOLS-152);
    // v26 the root's tool-call count on its iteration (REQ-MONITOR-102); v27 the explicit cancel's mark (PD-ORCH-005 clause 3, OQ-103);
    // v28 the call's attachments and inherited-context block (REQ-LIBRARY-098, REQ-TOOLS-152); v29 the plan cycle's root
    // under way (REQ-MONITOR-102 with REQ-ORCH-153); v30 every plan cycle's root, for good (REQ-MONITOR-044 with REQ-ORCH-153); v31 the
    // backend a confined run used (REQ-SANDBOX-121); v32 the calls of the plan cycle's root under way that the total holds
    // (REQ-MONITOR-102, OQ-116); v33 each plan cycle's root's own count, kept past its release (REQ-SESSION-140); v34 the todo
    // item a delegation serves (PD-TOOLS-006 revision 6); v35 the pending questions' mirror (PD-ORCH-005 clause 9, REQ-SESSION-031).
    expect(CURRENT_SCHEMA_VERSION).toBe(35);
    dal.insertChild(child(sid, 'bg_00000001'));
    const c = dal.getChild(sid, 'bg_00000001')!;
    expect(c).toMatchObject({ state: 'queued', launch_generation: 0, report_stored: 0, observed: 0, context_injected: 0, tool_calls: 0, completed_at: null, report: null, continuation_of: null, interruption: null, resume_state: null, write_scope: '[]', suppress_auto_context: 0, attach_artifacts: '[]', inherited_context_block: '', todo_item: null });
    // PD-ORCH-004: a continuation carries the task id of the child it continues.
    dal.insertChild({ ...child(sid, 'bg_00000002'), continuation_of: 'bg_00000001' });
    expect(dal.getChild(sid, 'bg_00000002')!.continuation_of).toBe('bg_00000001');
    expect(dal.claimChildStart(sid, 'bg_00000001')).toBe(true);
    expect(dal.claimChildStart(sid, 'bg_00000001')).toBe(false);
    expect(dal.getChild(sid, 'bg_00000001')).toMatchObject({ state: 'starting', launch_generation: 1 });
    expect(dal.setChildState(sid, 'bg_00000001', 'running', null)).toBe(true);
    expect(dal.setChildState(sid, 'bg_00000001', 'succeeded', '2026-09-03T00:00:00.000Z')).toBe(true);
    expect(dal.getChild(sid, 'bg_00000001')!.completed_at).toBe('2026-09-03T00:00:00.000Z');
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('the slot queue is FIFO per model key and per session', () => {
    const { r, dal, sid } = open('97');
    dal.enqueueSlot(sid, 'm', 'bg_0000000a');
    dal.enqueueSlot(sid, 'm', 'bg_0000000b');
    dal.enqueueSlot(sid, 'other', 'bg_0000000c');
    expect(dal.slotQueueOf(sid, 'm')).toEqual(['bg_0000000a', 'bg_0000000b']);
    expect(dal.dequeueSlot(sid, 'm', 'bg_0000000a')).toBe(true);
    expect(dal.slotQueueOf(sid, 'm')).toEqual(['bg_0000000b']);
    expect(dal.slotQueueOf(asSessionId('S-elsewhere'), 'm')).toEqual([]);
    r.db.close();
    forgetSpelling(r.dir);
  });
  it('REQ-ORCH-151: every ledger statement carries session_id — read from the DAL source, so a cross-run leak cannot be written unnoticed', () => {
    const src = readFileSync(join(__dirname, 'dal.ts'), 'utf8');
    const statements = [...src.matchAll(/db\.prepare\((`[\s\S]*?`|'[^']*')\)/g)].map((m) => m[1]!).filter((sql) => /\b(children|model_slot_queue)\b/.test(sql));
    expect(statements.length).toBeGreaterThanOrEqual(12);
    for (const sql of statements) expect(sql, sql).toMatch(/session_id/);
  });
});

describe('store — the power-loss writer runs under the settings open.ts applies (OQ-12 harness)', () => {
  it('journal mode, synchronous, busy_timeout and the write probe read back equal from the writer and from openStore', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-pl-probe-'));
    try {
      const writer = join(__dirname, '..', 'spike', 'power-loss-writer.cjs');
      const r = spawnSync(process.execPath, [writer, '--dir', join(dir, 'w'), '--probe'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      const theirs = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)!) as Record<string, unknown>;
      mkdirSync(join(dir, 'o'));
      const db = openStore(join(dir, 'o', 'workspace.db'));
      const ours = { journal_mode: db.pragma('journal_mode', { simple: true }), synchronous: db.pragma('synchronous', { simple: true }), busy_timeout: db.pragma('busy_timeout', { simple: true }), probeTable: (db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE name = '__probe'").get() as { c: number }).c };
      db.close();
      forgetSpelling(join(dir, 'o'));
      expect(theirs).toEqual(ours);
      expect(ours).toEqual({ journal_mode: 'wal', synchronous: 1, busy_timeout: 5000, probeTable: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('store — v8: the worktree binding and the sandbox mode on the session row (REQ-GIT-015/017/022, REQ-SHELL-125)', () => {
  it('a row written with a binding reads it back verbatim; a row written without one reads NULL and the default mode', () => {
    const id = mintWorkspaceId('00000000000000000000000000000098');
    const r = openWorkspaceStore(root, id, ws);
    const dal = new StoreDal(r.db);
    const binding = JSON.stringify({ worktree_path: 'D:/ws/.rotaris/worktrees/s1', branch: 'rotaris/session/s1', base_branch: 'main', base_revision: 'abc', created_by_session: true, merge_status: 'ready', integration_session_id: null });
    dal.upsertSession({ session_id: 's1', execution_status: 'idle', workspace_root: 'D:/ws', created_at: 't', updated_at: 't', worktree: binding, sandbox_mode: 'read-only' });
    dal.upsertSession({ session_id: 's2', execution_status: 'idle', workspace_root: 'D:/ws', created_at: 't', updated_at: 't' });
    expect(dal.getSession('s1' as never)).toMatchObject({ worktree: binding, sandbox_mode: 'read-only' });
    // REQ-GIT-017: an absence is an absence — nothing invented for an older row.
    expect(dal.getSession('s2' as never)).toMatchObject({ worktree: null, sandbox_mode: 'off' });
    // A status touch never moves the binding (REQ-GIT-019: binding a worktree does not move the record, and nothing after creation rewrites it).
    dal.upsertSession({ session_id: 's1', execution_status: 'running', workspace_root: 'D:/ws', created_at: 't', updated_at: 't2' });
    expect(dal.getSession('s1' as never)).toMatchObject({ execution_status: 'running', worktree: binding, sandbox_mode: 'read-only' });
    r.db.close();
  });
});

describe('store — v9: the checkpoint table and the last-restored sequence (ADR-0039, REQ-GIT-016/018/037/046/049/155)', () => {
  it('rows key by (session, sequence); the listing is oldest first under the primary key; a duplicate sequence is refused; the trim keeps the newest by rank', () => {
    const id = mintWorkspaceId('00000000000000000000000000000099');
    const r = openWorkspaceStore(root, id, ws);
    const dal = new StoreDal(r.db);
    const sid = asSessionId('S-ckpt');
    dal.upsertSession({ session_id: sid, execution_status: 'idle', workspace_root: 'D:/ws', created_at: 't', updated_at: 't' });
    expect(dal.getSession(sid)!.last_restored_sequence).toBeNull();
    expect(dal.checkpointCount(sid)).toBe(0);
    expect(dal.maxCheckpointSequence(sid)).toBeNull();
    for (const n of [10, 1, 3, 2]) dal.insertCheckpoint({ session_id: sid, sequence: n, ref: `refs/rotaris/checkpoints/${sid}/${n}`, commit_id: `c${n}`, created_at: 't', iteration: n, child_name: '', files: '["a.txt"]', kind: 'iteration' });
    // Numeric order, not text order: 10 sorts after 3 (REQ-GIT-037 / ADR-0039 "Ordering is a query").
    expect(dal.listCheckpoints(sid).map((c) => c.sequence)).toEqual([1, 2, 3, 10]);
    expect(dal.checkpointCount(sid)).toBe(4);
    expect(dal.maxCheckpointSequence(sid)).toBe(10);
    expect(() => dal.insertCheckpoint({ session_id: sid, sequence: 3, ref: 'x', commit_id: 'y', created_at: 't', iteration: 0, child_name: '', files: '[]', kind: 'manual' })).toThrow(/UNIQUE|PRIMARY/);
    // The trim by rank (sequences are not contiguous): keep 2 → 3 and 10 stay, 1 and 2 come back for their refs.
    const trimmed = dal.transaction(() => dal.trimCheckpoints(sid, 2));
    expect(trimmed.map((c) => [c.sequence, c.commit_id])).toEqual([[1, 'c1'], [2, 'c2']]);
    expect(dal.listCheckpoints(sid).map((c) => c.sequence)).toEqual([3, 10]);
    expect(dal.transaction(() => dal.trimCheckpoints(sid, 2))).toEqual([]);
    dal.setLastRestored(sid, 3, 't2');
    expect(dal.getSession(sid)).toMatchObject({ last_restored_sequence: 3, updated_at: 't2' });
    // Another session's rows are untouched by every statement (REQ-ORCH-151's predicate).
    const other = asSessionId('S-other');
    dal.upsertSession({ session_id: other, execution_status: 'idle', workspace_root: 'D:/ws', created_at: 't', updated_at: 't' });
    dal.insertCheckpoint({ session_id: other, sequence: 1, ref: 'r', commit_id: 'c', created_at: 't', iteration: 1, child_name: '', files: '[]', kind: 'iteration' });
    dal.transaction(() => dal.trimCheckpoints(sid, 0));
    expect(dal.checkpointCount(other)).toBe(1);
    expect(dal.checkpointCount(sid)).toBe(0);
    // The listing's plan: the primary key, never a scan and never a sort (spike 8's rule for a declared index — here the autoindex).
    const plan = r.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence').all(sid) as { detail: string }[];
    expect(plan.map((p) => p.detail).join(' | ')).toMatch(/PRIMARY KEY|USING INDEX sqlite_autoindex_checkpoints_1/);
    expect(plan.map((p) => p.detail).join(' | ')).not.toMatch(/TEMP B-TREE/);
    r.db.close();
  });
});

describe('Part U — the delete and its cascade (REQ-SESSION-166, ADR-0058)', () => {
  it('every writable open enforces foreign keys on ITS connection, read back', () => {
    const id = mintWorkspaceId('00000000000000000000000000000078');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    r.db.close();
    forgetSpelling(r.dir);
    // The run host's path: openStore on a resolved file, never migrateStore (which was the only place the pragma lived).
    const db = openStore(storeFile(root, id), { mustExist: true });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
    forgetSpelling(r.dir);
  });

  it('deleting the session row removes a planted row from EVERY table keyed by session_id, and nothing of another session', () => {
    const id = mintWorkspaceId('00000000000000000000000000000079');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const plant = (raw: string) => {
      const sid = asSessionId(raw);
      dal.upsertSession({ session_id: raw, execution_status: 'completed', workspace_root: 'C:/ws', created_at: '2026-09-05T00:00:00.000Z', updated_at: '2026-09-05T00:00:01.000Z' });
      dal.claimLock(sid, 4242, M, '2026-09-05T00:00:00.000Z');
      dal.appendRow(sid, 0, 'user', true, 'hello');
      dal.insertEvent(sid, 1, 'session.start', '2026-09-05T00:00:00.000Z', 1, null, '{"event":"session.start"}');
      dal.insertLaunchAudit(sid, '2026-09-05T00:00:00.000Z', '{}');
      dal.insertTimeline(sid, 1, '2026-09-05T00:00:00.000Z', 'run_start', 'rotaris', 'started', '{}', 'cccccccccccc', 'info');
      dal.ringInsert('permission_audit', sid, (ordinal) => dal.insertAudit({ session_id: sid, ordinal, recorded_at: 't', kind: 'decision', entry: '{}', agent_id: 'a', persona: 'p', tool_name: 'x', decision: 'allow', rule_id: 'r', source: 'policy' }));
      dal.ringInsert('tool_calls', sid, (ordinal) => dal.insertToolCall({ session_id: sid, ordinal, call_id: 'c', agent_name: 'a', tool_name: 'x', status: 'running', started_at: 't', elapsed_ms: null, is_error: 0, entry: '{}' }));
      dal.ringInsert('issues', sid, (ordinal) => dal.insertIssue({ session_id: sid, ordinal, id: 'abcdefabcdef', recorded_at: 't', kind: 'k', severity: 'warning', actor: 'a', message: 'm', evidence_ref: '', metadata: '{}' }));
      dal.insertChild({ session_id: sid, task_id: 'bg_00000001', canonical_name: 'c', given_name: 'c', persona: 'p', state: 'queued', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      dal.enqueueSlot(sid, 'm', 'bg_00000001');
      dal.insertQueuedPrompt(sid, 'q1', 'later', 't');
      dal.insertCheckpoint({ session_id: sid, sequence: 1, ref: 'refs/rotaris/checkpoints/x/1', commit_id: 'c', created_at: 't', iteration: 1, child_name: '', files: '[]', kind: 'iteration' });
      // v20 (REQ-SESSION-166): the plan cycle goes with its session, so its VERBATIM plan text leaves with the delete.
      dal.insertPlanCycle(sid, 1, 't', 'the plan, verbatim', 'small_feature', '', '');
      // v23 (PD-ORCH-005 clause 12): "The conversation record belongs to its session and is deleted with it" — the
      // iteration, every agent's messages and the background terminals it recorded.
      dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'bg_00000000', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
      dal.insertAgentMessage({ session_id: sid, task_id: 'bg_00000000', iteration: 1, kind: 'message', body: '{"role":"user","content":[]}', at: 't' });
      dal.upsertAgentTerminal({ session_id: sid, terminal_id: 'ts_00000001', task_id: 'bg_00000000', command: 'c', started_at: 't', state: 'running', exit_code: null, output_tail: '', updated_at: 't' });
      // v24 (PD-ORCH-005 revision 4 clause 14): the fingerprint beside the agent's record goes with it.
      dal.insertAgentFingerprint({ session_id: sid, task_id: 'bg_00000000', iteration: 1, instructions: 'i', tools: 't', at: 't' });
      // v30 (REQ-MONITOR-044 with REQ-ORCH-153): a plan cycle's root is part of the session's record and goes with it.
      dal.insertPlanRoot({ session_id: sid, root_task_id: 'bg_0000000f', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', opened_at: 't' });
      // Part Y (v12): the artifact record goes with its session, so its body file is the only thing left to remove.
      dal.insertArtifact({
        session_id: raw, id: `art_${raw.slice(-6)}A`, slug: `slug-${raw.toLowerCase()}`, title: 't', kind: 'agent_published', source_task_id: null, canonical_name: null, source_persona: 'p',
        status: 'published', summary: 's', key_findings: 'k', highlight_paths: '[]', snippets: '[]', edited_files: '[]', created_files: '[]', commands: '[]', tags: '[]', supersedes: null, superseded_by: null,
        created_by: 'a', consumed_by: '[]', timeline_event_id: null, conversation_id: null, importance: 'normal', created_at: 't', edited_at: null, body_file: 'artifact-x.md',
      });
      return sid;
    };
    const gone = plant('S-gone');
    const kept = plant('S-kept');
    // Part AK (v15; plan Reservations, ruled 2026-09-09: this narrowed premise is accepted as ADR-0041's reading, no foreign key on
    // `delivery_runs.session_id`): `delivery_runs` carries a `session_id` as a FACT about the run and deliberately no foreign key — a
    // requirement's run history outlives the session it names (REQ-TRACE-405/476: "no requirement SHALL be silently
    // reset"), so the dependants of the session row are the tables whose session_id column REFERENCES it.
    const tables = (r.db.prepare("SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND (m.name = 'sessions' OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) WHERE \"from\" = 'session_id' AND \"table\" = 'sessions'))").all() as { name: string }[]).map((t) => t.name).sort();
    // Every table whose session_id references the session row is a dependant of it: twenty today (v20's
    // `plan_cycles` cascade, v23's three, v24's one and v30's `plan_roots` among them) plus `sessions` itself. `delivery_runs` names a session and is NOT among them (Part AK).
    expect((r.db.prepare("SELECT count(*) AS c FROM pragma_table_info('delivery_runs') WHERE name = 'session_id'").get() as { c: number }).c).toBe(1);
    expect(tables).toEqual(['agent_fingerprints', 'agent_messages', 'agent_terminals', 'artifacts', 'checkpoints', 'children', 'events', 'issues', 'iterations', 'launch_audits', 'model_slot_queue', 'permission_audit', 'plan_cycles', 'plan_roots', 'queued_prompts', 'ring_state', 'session_locks', 'sessions', 'timeline', 'tool_calls', 'transcript_rows']);
    const count = (table: string, sid: string) => (r.db.prepare(`SELECT count(*) AS c FROM ${table} WHERE session_id = ?`).get(sid) as { c: number }).c;
    for (const t of tables) expect(count(t, gone), `${t} planted`).toBeGreaterThan(0);
    // The delete runs on the RUN HOST's kind of connection — openStore on the resolved file, no migrateStore — which is
    // connection that never ran migrateStore's pragma. The binding's compile-time default (ON) is measured first: the reliance the product had unstated.
    r.db.close();
    forgetSpelling(r.dir);
    const raw = new Database(storeFile(root, id));
    expect(raw.pragma('foreign_keys', { simple: true }), "the bundled binding's compile-time default").toBe(1);
    raw.close();
    const host = openStore(storeFile(root, id), { mustExist: true });
    const hostDal = new StoreDal(host);
    expect(hostDal.transaction(() => hostDal.deleteSession(gone))).toBe(true);
    const after = (table: string, sid: string) => (host.prepare(`SELECT count(*) AS c FROM ${table} WHERE session_id = ?`).get(sid) as { c: number }).c;
    for (const t of tables) expect(after(t, gone), `${t} after delete`).toBe(0);
    for (const t of tables) expect(after(t, kept), `${t} of the other session`).toBeGreaterThan(0);
    // A missing session is a no-op (REQ-SESSION-166), never an error.
    expect(hostDal.deleteSession(gone)).toBe(false);
    host.close();
    forgetSpelling(r.dir);
  });

  it('a read transaction refuses a write inside it only by discipline — it is deferred, so a reader never blocks a writer', () => {
    const id = mintWorkspaceId('0000000000000000000000000000007a');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    dal.upsertSession({ session_id: 'S', execution_status: 'completed', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    for (let i = 1; i <= 3; i++) dal.insertEvent(asSessionId('S'), i, 'usage.update', `2026-09-05T00:00:0${i}.000Z`, 1, null, `{"n":${i}}`);
    const seen = dal.readTransaction(() => dal.eventsOf(asSessionId('S')).map((e) => e.ordinal));
    expect(seen).toEqual([1, 2, 3]);
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store — v11: the saved prompts (Part X; REQ-LIBRARY-137/138/139, REQ-CHAT-045)', () => {
  function open(n: string) {
    const id = mintWorkspaceId(`000000000000000000000000000000${n}`);
    const r = openWorkspaceStore(root, id, 'C:/ws');
    return { r, dal: new StoreDal(r.db) };
  }

  it('front-inserts, suppresses only ADJACENT duplicates, and refuses a blank entry (REQ-LIBRARY-137/139)', () => {
    const { r, dal } = open('60');
    expect(dal.readPrompts()).toEqual({ history: [], stash: [] });
    expect(dal.pushPrompt('history', 'first', 't1').added).toBe(true);
    // Equal to the current front item: not added, and the list does not move.
    expect(dal.pushPrompt('history', 'first', 't2').added).toBe(false);
    expect(dal.pushPrompt('history', 'second', 't3').added).toBe(true);
    // NOT adjacent any more: the same text is added again, which is the whole of "only adjacent".
    expect(dal.pushPrompt('history', 'first', 't4').added).toBe(true);
    expect(dal.readPrompts().history).toEqual(['first', 'second', 'first']);
    // REQ-LIBRARY-139: blank entries are discarded, so a blank push is not a change to either list.
    expect(dal.pushPrompt('stash', '   ', 't5').added).toBe(false);
    expect(dal.readPrompts().stash).toEqual([]);
    // The two lists are independent: a write to one does not touch the other (REQ-LIBRARY-138).
    expect(dal.pushPrompt('stash', 'kept', 't6').lists).toEqual({ history: ['first', 'second', 'first'], stash: ['kept'] });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('enforces REQ-LIBRARY-139\'s caps on SAVE and again on LOAD, silently, oldest first', () => {
    const { r, dal } = open('61');
    for (let n = 1; n <= 201; n += 1) dal.pushPrompt('history', `prompt ${n}`, 't');
    const saved = dal.readPrompts().history;
    expect(saved).toHaveLength(PROMPT_CAPS.history);
    expect(saved[0]).toBe('prompt 201');
    expect(saved.at(-1)).toBe('prompt 2');
    expect(saved).not.toContain('prompt 1');
    expect((r.db.prepare('SELECT count(*) AS c FROM prompt_history').get() as { c: number }).c).toBe(200);
    // The LOAD half, over rows this build did not write: 105 stash rows planted directly, plus two blank ones.
    for (let n = 1; n <= 105; n += 1) r.db.prepare('INSERT INTO prompt_stash (text, at) VALUES (?, ?)').run(`stashed ${n}`, 't');
    r.db.prepare("INSERT INTO prompt_stash (text, at) VALUES ('   ', 't')").run();
    const loaded = dal.readPrompts().stash;
    expect(loaded).toHaveLength(PROMPT_CAPS.stash);
    expect(loaded[0]).toBe('stashed 105');
    expect(loaded).not.toContain('   ');
    // The trim is a WRITE, so the next load has nothing left to discard — the store agrees with the surface.
    expect((r.db.prepare('SELECT count(*) AS c FROM prompt_stash').get() as { c: number }).c).toBe(100);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('takes by the entry\'s ORIGINAL index and answers an out-of-range index with the empty string (REQ-LIBRARY-107/137)', () => {
    const { r, dal } = open('62');
    for (const text of ['alpha', 'beta', 'alpha two', 'gamma']) dal.pushPrompt('stash', text, 't');
    // Newest first: gamma(0), alpha two(1), beta(2), alpha(3). A filter on "alpha" would show indexes 1 and 3.
    expect(dal.readPrompts().stash).toEqual(['gamma', 'alpha two', 'beta', 'alpha']);
    expect(dal.promptAt('stash', 1)).toBe('alpha two');
    // "Use" keeps the entry; only "Use and remove" removes it.
    expect(dal.readPrompts().stash).toHaveLength(4);
    expect(dal.popPrompt('stash', 1)).toBe('alpha two');
    expect(dal.readPrompts().stash).toEqual(['gamma', 'beta', 'alpha']);
    // REQ-LIBRARY-137, word for word: "an out-of-range index returns an empty string without error".
    expect(dal.popPrompt('stash', 99)).toBe('');
    expect(dal.popPrompt('stash', -1)).toBe('');
    expect(dal.promptAt('stash', 99)).toBe('');
    expect(dal.removePrompt('stash', 99)).toBe(false);
    expect(dal.readPrompts().stash).toEqual(['gamma', 'beta', 'alpha']);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('reads both lists newest-first from the primary key, with no sort (spike 8\'s rule)', () => {
    const { r, dal } = open('63');
    dal.pushPrompt('history', 'one', 't');
    dal.pushPrompt('stash', 'two', 't');
    for (const table of ['prompt_history', 'prompt_stash']) {
      const plan = (r.db.prepare(`EXPLAIN QUERY PLAN SELECT text FROM ${table} ORDER BY seq DESC LIMIT 200`).all() as { detail: string }[]).map((p) => p.detail).join(' | ');
      // The order is the b-tree's, read backwards; a TEMP B-TREE here would mean the declared shape bought nothing.
      expect(plan, table).not.toMatch(/TEMP B-TREE/);
      const take = (r.db.prepare(`EXPLAIN QUERY PLAN SELECT seq, text FROM ${table} ORDER BY seq DESC LIMIT 1 OFFSET 3`).all() as { detail: string }[]).map((p) => p.detail).join(' | ');
      expect(take, table).not.toMatch(/TEMP B-TREE/);
    }
    // The prompt tables are workspace-scoped: no session row exists here at all, and neither table names one.
    expect((r.db.prepare('SELECT count(*) AS c FROM sessions').get() as { c: number }).c).toBe(0);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('is v35, and the migration list is append-only with nothing renumbered', () => {
    // Part X reserved v11, Part Y v12, Part AB v13, Part AE v14 and Part AK v15 (plan Reservations, ruled 2026-09-09: the ladder and
    // the pin ride with the v15 reservation) before any of them was written; PD-LIBRARY-001 appended v16; the plan gate appended
    // v17; ADR-0061 appended v18; ADR-0065 appended v19; the plan_cycles cascade appended v20; PD-MONITOR-001 revision 2 appended v21; PD-ORCH-004 appended v22; PD-ORCH-005 appended v23, and its revision 4 v24; REQ-TOOLS-152's `suppress_auto_context` (R-067) appended v25; REQ-MONITOR-102's root count (R-067) appended v26; the explicit cancel's mark (OQ-103, R-067) appended v27; a child's attachments and inherited-context block (REQ-LIBRARY-098, REQ-TOOLS-152, R-067) appended v28; the plan cycle's root under way (REQ-MONITOR-102 with REQ-ORCH-153, R-067) appended v29; every plan cycle's root, kept (REQ-MONITOR-044 with REQ-ORCH-153, R-067), v30; the backend a confined run used (REQ-SANDBOX-121), v31; the calls of the plan cycle's root under way the total holds (REQ-MONITOR-102, OQ-116, R-071), v32; each plan cycle's root's own count (REQ-SESSION-140, fin22), v33; the todo item a delegation serves (PD-TOOLS-006 revision 6, OQ-220), v34; the pending questions' mirror (PD-ORCH-005 clause 9, REQ-SESSION-031, fin41), v35. The ladder is asserted whole rather than at its top, so a later part
    // that renumbers an earlier entry fails here and not on a user's disk.
    expect(MIGRATIONS.map((m) => m.to)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(CURRENT_SCHEMA_VERSION).toBe(35);
  });
});

/** Part AB — REQ-CHAT-038/039 (v13): the optional context snapshot, and the ownership the table itself keeps. */
describe('store — v13: the queued prompt\u2019s context snapshot and its owner (Part AB; REQ-CHAT-038/039)', () => {
  it('stores the snapshot beside the prompt, keeps the owner across edit and trigger, and moves it for exactly one caller', () => {
    const id = mintWorkspaceId('00000000000000000000000000000063');
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const mine = asSessionId('S-mine'), theirs = asSessionId('S-theirs');
    for (const sid of [mine, theirs]) dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    const snapshot = JSON.stringify({ session_id: mine, note: 'from the composer' });
    expect(dal.insertQueuedPrompt(mine, 'p-1', 'scoped', 't1', snapshot).context_snapshot).toBe(snapshot);
    expect(dal.insertQueuedPrompt(mine, 'p-2', 'plain', 't1').context_snapshot).toBeNull();
    // REQ-CHAT-039: the listing is one session's, so a scoped prompt is invisible to any other session's surfaces.
    expect(dal.queuedPromptsOf(mine).map((p) => p.prompt_id)).toEqual(['p-1', 'p-2']);
    expect(dal.queuedPromptsOf(theirs)).toEqual([]);
    // Ownership and the snapshot survive the edit and the trigger; neither statement names `session_id` as a target.
    expect(dal.updateQueuedPrompt(mine, 'p-1', 'scoped, edited')).toBe(true);
    expect(dal.triggerQueuedPrompt(mine, 'p-1', 't2')).toBe(true);
    const row = dal.queuedPromptsOf(mine)[0]!;
    expect([row.session_id, row.content, row.status, row.context_snapshot]).toEqual([mine, 'scoped, edited', 'TRIGGERED', snapshot]);
    // REQ-CHAT-038: a second caller of the same transition observes it is no longer QUEUED and leaves it alone.
    expect(dal.triggerQueuedPrompt(mine, 'p-1', 't3')).toBe(false);
    // And another session cannot reach it at all — the statements are keyed by (session_id, prompt_id).
    expect(dal.triggerQueuedPrompt(theirs, 'p-2', 't4')).toBe(false);
    expect(dal.updateQueuedPrompt(theirs, 'p-2', 'stolen')).toBe(false);
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store — v23: the record a paused run resumes from (PD-ORCH-005, PD-TOOLS-006 revision 2)', () => {
  function open(n: string) {
    const id = mintWorkspaceId(`${"0".repeat(30)}a${n}`);
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId(`S-v23-${n}`);
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    return { r, dal, sid };
  }
  const iteration = (sid: string, n: number, root: string) => ({ session_id: sid, iteration: n, root_task_id: root, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: `${sid}:main:1`, task: 'the task', opened_at: 't' });
  const message = (sid: string, taskId: string, n: number, text: string, kind: 'message' | 'replacement' = 'message') => ({
    session_id: sid, task_id: taskId, iteration: n, kind, at: 't',
    body: JSON.stringify(kind === 'message' ? { role: 'user', content: [{ kind: 'text', text }] } : [{ role: 'user', content: [{ kind: 'text', text }] }]),
  });

  it('clause 1: an iteration is recorded open with its root task id, closed once, and interrupted only while open', () => {
    const { r, dal, sid } = open('1');
    dal.insertIteration(iteration(sid, 1, 'bg_000000a1'));
    expect(dal.openIterationOf(sid)).toMatchObject({ iteration: 1, root_task_id: 'bg_000000a1', state: 'open', outcome: null, interruption: null });
    expect(dal.setIterationInterruption(sid, 1, 'pause')).toBe(true);
    expect(dal.getIteration(sid, 1)!.interruption).toBe('pause');
    expect(dal.closeIteration(sid, 1, 'succeeded', 't2')).toBe(true);
    expect(dal.closeIteration(sid, 1, 'failed', 't3')).toBe(false);
    expect(dal.getIteration(sid, 1)).toMatchObject({ state: 'closed', outcome: 'succeeded', closed_at: 't2' });
    expect(dal.setIterationInterruption(sid, 1, 'stop')).toBe(false);
    expect(dal.openIterationOf(sid)).toBeUndefined();
    // A plan cycle is not an iteration and has no row: 0 is refused by the table itself.
    expect(() => dal.insertIteration(iteration(sid, 0, 'bg_000000a0'))).toThrow(/CHECK/);
    expect(() => r.db.prepare("UPDATE iterations SET interruption = 'cancel' WHERE session_id = ? AND iteration = 1").run(sid)).toThrow(/CHECK/);
    expect(() => r.db.prepare("UPDATE iterations SET outcome = 'done' WHERE session_id = ? AND iteration = 1").run(sid)).toThrow(/CHECK/);
    // At most one iteration is open per session — the table's index enforces it, not a caller.
    dal.insertIteration(iteration(sid, 2, 'bg_000000a2'));
    expect(() => dal.insertIteration(iteration(sid, 3, 'bg_000000a3'))).toThrow(/UNIQUE/);
    dal.closeIteration(sid, 2, 'cancelled', 't');
    dal.insertIteration(iteration(sid, 3, 'bg_000000a3'));
    expect(dal.openIterationOf(sid)!.iteration).toBe(3);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('clause 1 and 12: an agent\'s messages are sequenced per agent, and its conversation is read from its last replacement forward', () => {
    const { r, dal, sid } = open('2');
    dal.insertAgentMessage(message(sid, 'bg_000000a1', 1, 'first'));
    dal.insertAgentMessage(message(sid, 'bg_000000b2', 1, 'other agent'));
    dal.insertAgentMessage(message(sid, 'bg_000000a1', 1, 'second'));
    expect(dal.agentMessagesOf(sid, 'bg_000000a1').map((m) => m.seq)).toEqual([1, 2]);
    expect(dal.agentMessagesOf(sid, 'bg_000000b2').map((m) => m.seq)).toEqual([1]);
    expect(dal.agentConversation(sid, 'bg_000000a1').map((m) => m.seq)).toEqual([1, 2]);
    dal.insertAgentMessage(message(sid, 'bg_000000a1', 1, 'the compressed conversation', 'replacement'));
    dal.insertAgentMessage(message(sid, 'bg_000000a1', 1, 'after'));
    const conversation = dal.agentConversation(sid, 'bg_000000a1');
    expect(conversation.map((m) => [m.seq, m.kind])).toEqual([[3, 'replacement'], [4, 'message']]);
    // The full history stays in the table: a compression replaces what a resume sends, never what was recorded.
    expect(dal.agentMessagesOf(sid, 'bg_000000a1')).toHaveLength(4);
    expect(() => dal.insertAgentMessage({ ...message(sid, 'bg_000000a1', 1, 'x'), kind: 'note' as never })).toThrow(/CHECK/);
    // The DAL's own statements, as prepared, are primary-key prefix reads — the conversation read with its subquery among
    // them; no index was declared for them and none is scanned (spike 8's rule).
    const statements = (dal as unknown as { stmts: Record<string, { source: string }> }).stmts;
    for (const [name, args] of [['agentConversation', [sid, 'bg_000000a1', sid, 'bg_000000a1']], ['agentMessagesOf', [sid, 'bg_000000a1']], ['iterationsOf', [sid]], ['openIterationOf', [sid]]] as const) {
      const plan = (r.db.prepare(`EXPLAIN QUERY PLAN ${statements[name]!.source}`).all(...args) as { detail: string }[]).map((p) => p.detail).join(' | ');
      expect(plan, name).toMatch(/USING INDEX sqlite_autoindex|PRIMARY KEY|USING INDEX iterations_one_open/);
      expect(plan, name).not.toMatch(/TEMP B-TREE|SCAN agent_messages|SCAN iterations/);
    }
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('clause 12: the transcript clear removes the records of closed iterations and keeps the open one\'s; the session delete removes them all', () => {
    const { r, dal, sid } = open('3');
    // Another session with an OPEN iteration of the same number: the clear of this session must not read it as open.
    const other = asSessionId('S-v23-other');
    dal.upsertSession({ session_id: other, execution_status: 'paused', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    dal.insertIteration(iteration(other, 1, 'bg_000000f1'));
    dal.insertAgentMessage(message(other, 'bg_000000f1', 1, 'the other session'));
    dal.insertIteration(iteration(sid, 1, 'bg_000000a1'));
    dal.closeIteration(sid, 1, 'succeeded', 't');
    dal.insertIteration(iteration(sid, 2, 'bg_000000a2'));
    dal.insertAgentMessage(message(sid, 'bg_000000a1', 1, 'closed iteration'));
    dal.insertAgentMessage(message(sid, 'bg_000000a2', 2, 'open iteration'));
    dal.insertAgentMessage(message(sid, 'bg_000000c0', 0, 'a plan cycle, never open'));
    expect(dal.clearClosedAgentMessages(sid)).toBe(2);
    expect(dal.agentMessagesOf(sid, 'bg_000000a2')).toHaveLength(1);
    expect(dal.agentMessagesOf(sid, 'bg_000000a1')).toHaveLength(0);
    expect(dal.agentMessagesOf(other, 'bg_000000f1')).toHaveLength(1);
    dal.upsertAgentTerminal({ session_id: sid, terminal_id: 'ts_00000001', task_id: 'bg_000000a2', command: 'npm run dev', started_at: 't', state: 'running', exit_code: null, output_tail: '', updated_at: 't' });
    dal.insertChild({ session_id: sid, task_id: 'bg_000000d1', canonical_name: 'x', given_name: 'x', persona: 'coding-agent', state: 'queued', parent_id: 'bg_000000a2', depth: 1, iteration: 2, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't', write_scope: '["src/**"]' });
    expect(dal.getChild(sid, 'bg_000000d1')!.write_scope).toBe('["src/**"]');
    expect(dal.deleteSession(sid)).toBe(true);
    for (const table of ['iterations', 'agent_messages', 'agent_terminals', 'children']) expect((r.db.prepare(`SELECT count(*) AS c FROM ${table} WHERE session_id = ?`).get(sid) as { c: number }).c, table).toBe(0);
    expect(dal.agentMessagesOf(other, 'bg_000000f1')).toHaveLength(1);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('clause 2 and 10: a child records its interruption and resume state; a terminal record is updated in place, not appended', () => {
    const { r, dal, sid } = open('4');
    dal.insertChild({ session_id: sid, task_id: 'bg_000000e1', canonical_name: 'x', given_name: 'x', persona: 'coding-agent', state: 'running', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    dal.setChildState(sid, 'bg_000000e1', 'paused', null);
    dal.setChildRest(sid, 'bg_000000e1', 'quit', 'running');
    expect(dal.getChild(sid, 'bg_000000e1')).toMatchObject({ state: 'paused', interruption: 'quit', resume_state: 'running' });
    expect(dal.pausedChildrenOfIteration(sid, 1).map((c) => c.task_id)).toEqual(['bg_000000e1']);
    expect(() => dal.setChildRest(sid, 'bg_000000e1', 'cancel', null)).toThrow(/CHECK/);
    expect(() => dal.setChildRest(sid, 'bg_000000e1', 'pause', 'starting')).toThrow(/CHECK/);
    dal.setChildRest(sid, 'bg_000000e1', null, null);
    expect(dal.getChild(sid, 'bg_000000e1')).toMatchObject({ interruption: null, resume_state: null });
    const t = { session_id: sid, terminal_id: 'ts_00000002', task_id: 'bg_000000e1', command: 'make test', started_at: 't', state: 'running' as const, exit_code: null, output_tail: '', updated_at: 't' };
    expect(dal.upsertAgentTerminal(t)).toBe(true);
    expect(dal.upsertAgentTerminal({ ...t, state: 'quit', output_tail: 'last lines', updated_at: 't2' })).toBe(true);
    expect(dal.agentTerminalsOf(sid)).toEqual([{ ...t, state: 'quit', output_tail: 'last lines', updated_at: 't2' }]);
    // REQ-TOOLS-109's status vocabulary is the column's, with the three rests beside it; nothing else.
    expect(() => dal.upsertAgentTerminal({ ...t, state: 'exited' as never })).toThrow(/CHECK/);
    // The same id from another agent's command is a collision, and the recorded terminal is left as it was.
    expect(dal.upsertAgentTerminal({ ...t, task_id: 'bg_000000e2', command: 'other', state: 'killed' })).toBe(false);
    expect(dal.agentTerminalsOf(sid)[0]!.state).toBe('quit');
    // PD-ORCH-005 clause 10: an end is recorded once — the `killed` the quit's own kill produces does not replace it.
    expect(dal.upsertAgentTerminal({ ...t, state: 'killed', output_tail: 'later', updated_at: 't3' })).toBe(false);
    expect(dal.agentTerminalsOf(sid)[0]).toMatchObject({ state: 'quit', output_tail: 'last lines', updated_at: 't2' });
    r.db.close();
    forgetSpelling(r.dir);
  });
});

describe('store — v24: the fingerprint an agent started with (PD-ORCH-005 revision 4 clause 14)', () => {
  function open(n: string) {
    const id = mintWorkspaceId(`${"0".repeat(30)}b${n}`);
    const r = openWorkspaceStore(root, id, 'C:/ws');
    const dal = new StoreDal(r.db);
    const sid = asSessionId(`S-v24-${n}`);
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    return { r, dal, sid };
  }
  const fingerprint = (sid: string, taskId: string, iteration: number, instructions = 'i1', tools = 't1') => ({ session_id: sid, task_id: taskId, iteration, instructions, tools, at: 't' });

  it('a v23 store migrates to v24, and an agent recorded before it reads no fingerprint (REQ-SESSION-132)', () => {
    const { r, sid } = open('1');
    r.db.exec(UNDO_V24);
    r.db.pragma('user_version = 23');
    r.db.prepare("INSERT INTO agent_messages (session_id, task_id, seq, iteration, kind, body, at) VALUES (?, 'bg_000000a1', 1, 1, 'message', '{}', 't')").run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 23, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.agentMessagesOf(sid, 'bg_000000a1')).toHaveLength(1);
    expect(dal.agentFingerprintOf(sid, 'bg_000000a1')).toBeUndefined();
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-TOOLS-152: a v24 store migrates to v25; a child written before it gives the sibling index, and the flag a delegate set is stored', () => {
    const { r, sid } = open('3');
    r.db.exec(UNDO_V25);
    r.db.pragma('user_version = 24');
    r.db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, task, spawned_at)
      VALUES (?, 'bg_00000001', 'old', 'old', 'coding-agent', 'failed', 'root', 1, 1, 'm', 't', 't')`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 24, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getChild(sid, 'bg_00000001')!.suppress_auto_context).toBe(0);
    const child = { session_id: sid, canonical_name: 'x', given_name: 'x', persona: 'coding-agent', state: 'queued', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' };
    dal.insertChild({ ...child, task_id: 'bg_00000002', suppress_auto_context: 1 });
    dal.insertChild({ ...child, task_id: 'bg_00000003' });
    expect(dal.getChild(sid, 'bg_00000002')!.suppress_auto_context).toBe(1);
    expect(dal.getChild(sid, 'bg_00000003')!.suppress_auto_context).toBe(0);
    expect(() => dal.insertChild({ ...child, task_id: 'bg_00000004', suppress_auto_context: 2 })).toThrow(/CHECK/);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-MONITOR-102: a v25 store migrates to v26; an iteration written before it has no known root count and keeps none, and one opened after starts at 0 and counts', () => {
    const { r, sid } = open('4');
    r.db.exec(UNDO_V26);
    r.db.pragma('user_version = 25');
    r.db.prepare(`INSERT INTO iterations (session_id, iteration, root_task_id, root_canonical_name, root_persona, todo_task_id, task, state, opened_at)
      VALUES (?, 1, 'bg_000000a1', 'orchestrator', 'orchestrator', 't', 't', 'open', 't')`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 25, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getIteration(sid, 1)!.root_tool_calls).toBeNull();
    expect(dal.addIterationRootCalls(sid, 1, 3)).toBe(false);
    expect(dal.getIteration(sid, 1)!.root_tool_calls).toBeNull();
    dal.closeIteration(sid, 1, 'succeeded', 't');
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'bg_000000a2', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    expect(dal.getIteration(sid, 2)!.root_tool_calls).toBe(0);
    expect(dal.addIterationRootCalls(sid, 2, 3)).toBe(true);
    expect(dal.addIterationRootCalls(sid, 2, 2)).toBe(true);
    expect(dal.getIteration(sid, 2)!.root_tool_calls).toBe(5);
    expect(() => r.db.prepare('UPDATE iterations SET root_tool_calls = -1 WHERE session_id = ? AND iteration = 2').run(sid)).toThrow(/CHECK/);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('PD-ORCH-005 clause 3 (OQ-103, R-067): a v26 store migrates to v27; an iteration written before it carries no mark, and the mark lands on the open iteration only, the first acceptance kept', () => {
    const { r, sid } = open('5');
    r.db.exec(UNDO_V27);
    r.db.pragma('user_version = 26');
    r.db.prepare(`INSERT INTO iterations (session_id, iteration, root_task_id, root_canonical_name, root_persona, todo_task_id, task, state, opened_at, root_tool_calls)
      VALUES (?, 1, 'bg_000000a1', 'orchestrator', 'orchestrator', 't', 't', 'closed', 't', 0)`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 26, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getIteration(sid, 1)!.cancel_accepted_at).toBeNull();
    // No iteration open: nothing to mark, and the closed one is left as it is.
    expect(dal.markCancelAccepted(sid, 'a')).toBe(false);
    expect(dal.getIteration(sid, 1)!.cancel_accepted_at).toBeNull();
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'bg_000000a2', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    expect(dal.getIteration(sid, 2)!.cancel_accepted_at).toBeNull();
    expect(dal.markCancelAccepted(sid, 'a')).toBe(true);
    expect(dal.markCancelAccepted(sid, 'b')).toBe(false);
    expect(dal.getIteration(sid, 2)!.cancel_accepted_at).toBe('a');
    // The close keeps it: a closed row's mark is history.
    dal.closeIteration(sid, 2, 'cancelled', 't');
    expect(dal.getIteration(sid, 2)).toMatchObject({ state: 'closed', cancel_accepted_at: 'a' });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-LIBRARY-098 / REQ-TOOLS-152 (R-067): a v27 store migrates to v28; a child written before it carries no attachments and no inherited block, and what a delegate carried is stored', () => {
    const { r, sid } = open('6');
    r.db.exec(UNDO_V28);
    r.db.pragma('user_version = 27');
    r.db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, task, spawned_at)
      VALUES (?, 'bg_00000001', 'old', 'old', 'coding-agent', 'paused', 'root', 1, 1, 'm', 't', 't')`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 27, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getChild(sid, 'bg_00000001')).toMatchObject({ attach_artifacts: '[]', inherited_context_block: '' });
    const child = { session_id: sid, canonical_name: 'x', given_name: 'x', persona: 'coding-agent', state: 'queued', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '["bg_00000001"]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' };
    dal.insertChild({ ...child, task_id: 'bg_00000002', attach_artifacts: '["survey","art_1"]', inherited_context_block: '[Inherited context]\n\nreport' });
    dal.insertChild({ ...child, task_id: 'bg_00000003' });
    expect(dal.getChild(sid, 'bg_00000002')).toMatchObject({ attach_artifacts: '["survey","art_1"]', inherited_context_block: '[Inherited context]\n\nreport' });
    expect(dal.getChild(sid, 'bg_00000003')).toMatchObject({ attach_artifacts: '[]', inherited_context_block: '' });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-MONITOR-102 with REQ-ORCH-153 (R-067): a v28 store migrates to v29; a session written before it names no plan cycle\'s root, one recorded under way is released once', () => {
    const { r, sid } = open('7');
    r.db.exec(UNDO_V29);
    r.db.pragma('user_version = 28');
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 28, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getSession(sid)).toMatchObject({ plan_root_task_id: null, plan_root_persona: null });
    expect(dal.clearPlanRoot(sid, 'bg_000000a1')).toBe(false);
    dal.setPlanRoot(sid, 'bg_000000a1', 'orchestrator');
    expect(dal.getSession(sid)).toMatchObject({ plan_root_task_id: 'bg_000000a1', plan_root_persona: 'orchestrator' });
    // Another root's release leaves it; its own releases it once.
    expect(dal.clearPlanRoot(sid, 'bg_000000a2')).toBe(false);
    expect(dal.clearPlanRoot(sid, 'bg_000000a1')).toBe(true);
    expect(dal.clearPlanRoot(sid, 'bg_000000a1')).toBe(false);
    expect(dal.getSession(sid)).toMatchObject({ plan_root_task_id: null, plan_root_persona: null });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-MONITOR-044 with REQ-ORCH-153 and REQ-LIBRARY-093 (R-067): a v29 store migrates to v30; a session written before it records no plan cycle\'s root, and one recorded is kept once, in start order', () => {
    const { r, sid } = open('8');
    r.db.exec(UNDO_V30);
    r.db.pragma('user_version = 29');
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 29, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.planRootsOf(sid)).toEqual([]);
    const second = { session_id: sid, root_task_id: 'bg_000000b2', root_canonical_name: 'Lead-Planner', root_persona: 'Lead Planner', opened_at: '2026-09-29T02:00:00.000Z' };
    const first = { session_id: sid, root_task_id: 'bg_000000b1', root_canonical_name: 'Lead-Planner', root_persona: 'Lead Planner', opened_at: '2026-09-29T01:00:00.000Z' };
    expect(dal.insertPlanRoot(second)).toBe(true);
    expect(dal.insertPlanRoot(first)).toBe(true);
    // Who the root was is never rewritten: a second write of the same root changes nothing.
    expect(dal.insertPlanRoot({ ...first, root_persona: 'other', opened_at: '2026-09-29T03:00:00.000Z' })).toBe(false);
    // v33: a root recorded now starts its own count at 0.
    expect(dal.planRootsOf(sid)).toEqual([{ ...first, tool_calls: 0 }, { ...second, tool_calls: 0 }]);
    // Unlike v29's pair, the record outlives the root's release.
    dal.setPlanRoot(sid, 'bg_000000b1', 'Lead Planner');
    expect(dal.clearPlanRoot(sid, 'bg_000000b1')).toBe(true);
    expect(dal.planRootsOf(sid)).toEqual([{ ...first, tool_calls: 0 }, { ...second, tool_calls: 0 }]);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-MONITOR-102 (OQ-116 as ruled, PD-ORCH-008): a v31 store migrates to v32; the under-way plan cycle root counts its calls as they complete, and its release or a new root starts it at 0', () => {
    const { r, sid } = open('a');
    r.db.exec(UNDO_V32);
    r.db.pragma('user_version = 31');
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 31, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getSession(sid)!.plan_root_tool_calls).toBe(0);
    // No plan cycle's root under way: nothing to count against.
    expect(dal.addPlanRootCalls(sid, 'bg_000000c1', 1)).toBe(false);
    dal.setPlanRoot(sid, 'bg_000000c1', 'orchestrator');
    expect(dal.addPlanRootCalls(sid, 'bg_000000c1', 1)).toBe(true);
    expect(dal.addPlanRootCalls(sid, 'bg_000000c1', 2)).toBe(true);
    // Another root's calls are not this one's.
    expect(dal.addPlanRootCalls(sid, 'bg_000000c2', 5)).toBe(false);
    expect(dal.getSession(sid)!.plan_root_tool_calls).toBe(3);
    expect(dal.clearPlanRoot(sid, 'bg_000000c1')).toBe(true);
    expect(dal.getSession(sid)!.plan_root_tool_calls).toBe(0);
    dal.setPlanRoot(sid, 'bg_000000c2', 'orchestrator');
    expect(dal.getSession(sid)).toMatchObject({ plan_root_task_id: 'bg_000000c2', plan_root_tool_calls: 0 });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-SESSION-140 with REQ-MONITOR-102: a v32 store migrates to v33; a root recorded before it reads no count, one recorded after counts what is added, kept past its release', () => {
    const { r, sid } = open('b');
    const before = { session_id: sid, root_task_id: 'bg_000000d1', root_canonical_name: 'Ada', root_persona: 'orchestrator', opened_at: '2026-10-06T01:00:00.000Z' };
    r.db.exec(UNDO_V33);
    r.db.pragma('user_version = 32');
    r.db.prepare('INSERT INTO plan_roots (session_id, root_task_id, root_canonical_name, root_persona, opened_at) VALUES (@session_id, @root_task_id, @root_canonical_name, @root_persona, @opened_at)').run(before);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 32, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    // What a root recorded before v33 counted was never kept, so it stays unknown: nothing raises it.
    expect(dal.planRootsOf(sid)).toEqual([{ ...before, tool_calls: null }]);
    expect(dal.countPlanRootCalls(sid, 'bg_000000d1', 2)).toBe(false);
    expect(dal.planRootsOf(sid)[0]!.tool_calls).toBeNull();
    const after = { session_id: sid, root_task_id: 'bg_000000d2', root_canonical_name: 'Bo', root_persona: 'orchestrator', opened_at: '2026-10-06T02:00:00.000Z' };
    expect(dal.insertPlanRoot(after)).toBe(true);
    dal.setPlanRoot(sid, 'bg_000000d2', 'orchestrator');
    expect(dal.countPlanRootCalls(sid, 'bg_000000d2', 2)).toBe(true);
    expect(dal.clearPlanRoot(sid, 'bg_000000d2')).toBe(true);
    expect(dal.countPlanRootCalls(sid, 'bg_000000d2', 3)).toBe(true);
    // A root with no row is no one's count.
    expect(dal.countPlanRootCalls(sid, 'bg_000000d9', 1)).toBe(false);
    expect(dal.planRootsOf(sid)).toEqual([{ ...before, tool_calls: null }, { ...after, tool_calls: 5 }]);
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('PD-TOOLS-006 revision 6 (OQ-220): a v33 store migrates to v34; a child written before it names no todo item, and the item a delegation named is stored', () => {
    const { r, sid } = open('c');
    r.db.exec(UNDO_V34);
    r.db.pragma('user_version = 33');
    r.db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, task, spawned_at)
      VALUES (?, 'bg_00000001', 'old', 'old', 'coding-agent', 'succeeded', 'root', 1, 1, 'm', 't', 't')`).run(sid);
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 33, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getChild(sid, 'bg_00000001')!.todo_item).toBeNull();
    const child = { session_id: sid, canonical_name: 'x', given_name: 'x', persona: 'coding-agent', state: 'queued', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' };
    dal.insertChild({ ...child, task_id: 'bg_00000002', todo_item: '0a1b2c3d' });
    dal.insertChild({ ...child, task_id: 'bg_00000003' });
    expect(dal.getChild(sid, 'bg_00000002')!.todo_item).toBe('0a1b2c3d');
    expect(dal.getChild(sid, 'bg_00000003')!.todo_item).toBeNull();
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('PD-ORCH-005 clause 9 / REQ-SESSION-031: a v34 store migrates to v35; a session written before it lists no pending question, and a save writes the mirror beside the approvals', () => {
    const { r, sid } = open('d');
    r.db.exec(UNDO_V35);
    r.db.pragma('user_version = 34');
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 34, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect(dal.getSession(sid)!.pending_questions).toBe('[]');
    dal.updateSessionRun(sid, { pending_questions: '[{"request_id":"q"}]' });
    dal.updateSessionRun(sid, { pending_approvals: '[]' });
    expect(dal.getSession(sid)!.pending_questions).toBe('[{"request_id":"q"}]');
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('REQ-SANDBOX-121: a v30 store migrates to v31; a confined session takes the backend its start event recorded, any other none, and a save writes it beside the flag', () => {
    const { r, sid } = open('9');
    const plant = (id: string, sandboxed: number, payload: string | null) => {
      const s = asSessionId(id);
      r.db.prepare("INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at, sandboxed) VALUES (?, 'completed', 'C:/ws', 't', 't', ?)").run(s, sandboxed);
      if (payload !== null) r.db.prepare("INSERT INTO events (session_id, ordinal, kind, at, schema_version, iteration, payload) VALUES (?, 1, 'session.start', 't', 1, NULL, ?)").run(s, payload);
      return s;
    };
    r.db.exec(UNDO_V31);
    r.db.pragma('user_version = 30');
    const confined = plant('S-v31-confined', 1, JSON.stringify({ event: 'session.start', sandbox: { enabled: true, backend: 'bubblewrap' } }));
    const open_ = plant('S-v31-open', 0, JSON.stringify({ event: 'session.start', sandbox: { enabled: false, backend: '' } }));
    const trimmed = plant('S-v31-trimmed', 1, null);
    const garbled = plant('S-v31-garbled', 1, '{not json');
    expect(migrateStore(r.db)).toEqual({ kind: 'migrated', from: 30, to: CURRENT_SCHEMA_VERSION });
    const dal = new StoreDal(r.db);
    expect([confined, open_, trimmed, garbled, sid].map((s) => dal.getSession(s)!.sandbox_backend)).toEqual(['bubblewrap', '', '', '', '']);
    // A run's start writes the backend beside the flag; a save that names neither keeps both.
    dal.updateSessionRun(sid, { sandboxed: 1, sandbox_backend: 'bubblewrap' });
    dal.updateSessionRun(sid, { tool_calls: 3 });
    expect(dal.getSession(sid)).toMatchObject({ sandboxed: 1, sandbox_backend: 'bubblewrap' });
    dal.updateSessionRun(sid, { sandboxed: 0, sandbox_backend: '' });
    expect(dal.getSession(sid)).toMatchObject({ sandboxed: 0, sandbox_backend: '' });
    r.db.close();
    forgetSpelling(r.dir);
  });

  it('the first fingerprint is kept; the read is the primary key; the clear keeps an open iteration\'s and the session delete removes them all', () => {
    const { r, dal, sid } = open('2');
    expect(dal.insertAgentFingerprint(fingerprint(sid, 'bg_000000a1', 1))).toBe(true);
    expect(dal.insertAgentFingerprint(fingerprint(sid, 'bg_000000a1', 1, 'i2', 't2'))).toBe(false);
    expect(dal.agentFingerprintOf(sid, 'bg_000000a1')).toEqual(fingerprint(sid, 'bg_000000a1', 1));
    const statements = (dal as unknown as { stmts: Record<string, { source: string }> }).stmts;
    const plan = (r.db.prepare(`EXPLAIN QUERY PLAN ${statements['agentFingerprintOf']!.source}`).all(sid, 'bg_000000a1') as { detail: string }[]).map((p) => p.detail).join(' | ');
    expect(plan).toMatch(/USING INDEX sqlite_autoindex_agent_fingerprints/);
    expect(plan).not.toMatch(/SCAN agent_fingerprints/);
    // Another session with an open iteration of the same number: this session's clear must not read it as open.
    const other = asSessionId('S-v24-other');
    dal.upsertSession({ session_id: other, execution_status: 'paused', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    dal.insertIteration({ session_id: other, iteration: 1, root_task_id: 'bg_000000f1', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.insertAgentFingerprint(fingerprint(other, 'bg_000000f1', 1));
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'bg_000000a1', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.closeIteration(sid, 1, 'succeeded', 't');
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'bg_000000a2', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.insertAgentFingerprint(fingerprint(sid, 'bg_000000a2', 2));
    dal.insertAgentFingerprint(fingerprint(sid, 'bg_000000c0', 0));
    expect(dal.clearClosedAgentFingerprints(sid)).toBe(2);
    expect(dal.agentFingerprintOf(sid, 'bg_000000a1')).toBeUndefined();
    expect(dal.agentFingerprintOf(sid, 'bg_000000c0')).toBeUndefined();
    expect(dal.agentFingerprintOf(sid, 'bg_000000a2')).toBeDefined();
    expect(dal.agentFingerprintOf(other, 'bg_000000f1')).toBeDefined();
    expect(dal.deleteSession(sid)).toBe(true);
    expect((r.db.prepare('SELECT count(*) AS c FROM agent_fingerprints WHERE session_id = ?').get(sid) as { c: number }).c).toBe(0);
    expect(dal.agentFingerprintOf(other, 'bg_000000f1')).toBeDefined();
    r.db.close();
    forgetSpelling(r.dir);
  });
});
