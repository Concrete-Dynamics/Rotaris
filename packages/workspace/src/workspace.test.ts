import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, millis, mintMachineId, mintWorkspaceId, type MachineId, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { forgetSpelling, openStore, openWorkspaceStore, readWorkspaceId, restoreStore, SIDECAR_PATTERN, StoreDal, storeFile, takeBackup, type RunHostControl } from '@rotaris/store';
import { assessRestore, backupWorkspace, decisionAllowed, performRestore } from './index.js';

const M = mintMachineId('0000000000000000000000000000000a');
const OTHER = mintMachineId('0000000000000000000000000000000b');
const A = mintWorkspaceId('000000000000000000000000000000aa');
const B = mintWorkspaceId('000000000000000000000000000000bb');
const clocks = nodeClocks();

let root: string;
let ws: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-wsroot-')); ws = mkdtempSync(join(tmpdir(), 'rotaris-ws-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(ws, { recursive: true, force: true }); });

function seed(workspacesRoot: string, id: WorkspaceId, sids: string[], lock?: { sid: string; pid: number; host: MachineId }): void {
  const r = openWorkspaceStore(workspacesRoot, id, ws);
  const dal = new StoreDal(r.db);
  for (const sid of sids) {
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: ws, created_at: 't', updated_at: 't' });
    dal.appendRow(asSessionId(sid), 0, 'user', true, `row of ${sid}`);
  }
  if (lock) dal.claimLock(asSessionId(lock.sid), lock.pid, lock.host, 't');
  r.db.close();
  forgetSpelling(r.dir);
}
function artifactOf(id: WorkspaceId, sids: string[], lock?: { sid: string; pid: number; host: MachineId }): string {
  const src = mkdtempSync(join(tmpdir(), 'rotaris-src-'));
  seed(src, id, sids, lock);
  const file = join(root, `backup-${id}.tar`);
  takeBackup(src, id, file, '2026-09-03T00:00:00.000Z', 'D:/origin-project');
  rmSync(src, { recursive: true, force: true });
  return file;
}
function writeId(id: string): void {
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  writeFileSync(join(ws, '.rotaris', 'workspace-id'), `${id}\n`);
}
function sids(id: WorkspaceId): string[] {
  const db = openStore(storeFile(root, id), { readonly: true, mustExist: true });
  const s = new StoreDal(db).listSessions().map((r) => r.session_id).sort();
  db.close();
  forgetSpelling(join(root, id));
  return s;
}
const runHost = (): RunHostControl & { log: string[] } => {
  const log: string[] = [];
  return { log, async refuseRuns() { log.push('refuse'); }, async closeStore() { log.push('close'); }, async release() { log.push('release'); }, async reopen() { log.push('reopen'); } };
};
const deps = (artifact: string) => ({ workspacesRoot: root, workspaceRoot: ws, artifact, thisMachine: M, probe: () => 'dead' as const });

describe('workspace — the backup (REQ-SESSION-201)', () => {
  it('produces one artifact holding the whole store, and reports its counts', () => {
    seed(root, A, ['S1', 'S2']);
    const dest = join(root, 'out', 'b.tar');
    mkdirSync(join(root, 'out'));
    const r = backupWorkspace({ workspacesRoot: root, id: A, destination: dest, takenAtUtc: '2026-09-03T01:00:00.000Z', lastSeenPath: ws });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.sessions).toBe(2); expect(r.value.bytes).toBeGreaterThan(0); }
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(`${dest}.part-${process.pid}`)).toBe(false);
  });
  it('a failure leaves nothing at the destination', () => {
    const r = backupWorkspace({ workspacesRoot: root, id: B, destination: join(root, 'missing', 'x.tar'), takenAtUtc: 't', lastSeenPath: null });
    expect(r.ok).toBe(false);
    expect(existsSync(join(root, 'missing', 'x.tar'))).toBe(false);
  });
});

describe('workspace — the restore assessment: everything the user is told before anything changes', () => {
  it('case same: the artifact is described, the target counted, no refusal', () => {
    writeId(A);
    seed(root, A, ['S-old']);
    const a = assessRestore(deps(artifactOf(A, ['S-new-1', 'S-new-2'])));
    expect(a.refusal).toBeNull();
    expect(a.artifact).toMatchObject({ workspaceId: A, sessions: 2, lastSeenWorkspacePath: 'D:/origin-project', takenAtUtc: '2026-09-03T00:00:00.000Z' });
    expect(a.identifier).toEqual({ case: 'same', current: A });
    expect(a.target).toEqual({ exists: true, placeEmpty: false, sessions: 1, foreignLocks: [], liveLocks: [] });
  });
  it('case absent, case different, and the unreadable identifier that is reported and never repaired', () => {
    const art = artifactOf(A, ['S']);
    expect(assessRestore(deps(art)).identifier).toEqual({ case: 'absent', current: null });
    writeId(B);
    expect(assessRestore(deps(art)).identifier).toEqual({ case: 'different', current: B });
    writeFileSync(join(ws, '.rotaris', 'workspace-id'), 'garbage\n');
    const u = assessRestore(deps(art));
    expect(u.refusal?.why).toBe('unreadable-identifier');
    expect(readFileSync(join(ws, '.rotaris', 'workspace-id'), 'utf8')).toBe('garbage\n');
  });
  it('gates 1 and 2: a file that is not a backup, a corrupt store, a newer schema', () => {
    const notTar = join(root, 'no.tar');
    writeFileSync(notTar, 'this is not an archive');
    expect(assessRestore(deps(notTar)).refusal?.why).toBe('unreadable-artifact');
    // Newer schema: bump user_version inside a real artifact's store before packing it.
    const src = mkdtempSync(join(tmpdir(), 'rotaris-src-'));
    seed(src, A, ['S']);
    const db = openStore(storeFile(src, A), { mustExist: true });
    db.pragma('user_version = 99');
    db.close();
    forgetSpelling(join(src, A));
    const newer = join(root, 'newer.tar');
    takeBackup(src, A, newer, 't', null);
    rmSync(src, { recursive: true, force: true });
    const n = assessRestore(deps(newer));
    expect(n.refusal?.why).toBe('newer-schema');
    expect(n.refusal?.detail).toContain('99');
  });
  it('D9 / IC-4: lock rows naming another machine are reported together as one condition; a live lock on this machine is a refusal', () => {
    writeId(A);
    seed(root, A, ['S-a', 'S-b'], { sid: 'S-a', pid: 1, host: OTHER });
    const a = assessRestore(deps(artifactOf(A, ['S'])));
    expect(a.target.foreignLocks).toEqual(['S-a']);
    expect(a.target.liveLocks).toEqual([]);
    seed(root, B, ['S-live'], { sid: 'S-live', pid: process.pid, host: M });
    const live = assessRestore({ ...deps(artifactOf(B, ['S'])), probe: () => 'alive' });
    expect(live.target.liveLocks).toEqual(['S-live']);
  });
});

describe('workspace — performing the restore into the artifact\'s identifier, then the identifier', () => {
  it('case same → workspace: the store is replaced, the old one displaced and kept, the identifier untouched', async () => {
    writeId(A);
    seed(root, A, ['S-old']);
    const rh = runHost();
    const r = await performRestore({ ...deps(artifactOf(A, ['S-new'])), decisions: { identifier: 'workspace', proceedWithForeignLocks: false }, runHost: rh, timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(r.restoredInto).toBe(A);
    expect(r.identifierEstablished).toBe(false);
    expect(r.displaced).toBeDefined();
    expect(sids(A)).toEqual(['S-new']);
    expect(readWorkspaceId(ws)).toEqual({ state: 'readable', id: A });
    expect(rh.log).toEqual(['refuse', 'close', 'reopen']);
  });
  it('case absent → establish: the identifier is created (replacing nothing) and names the artifact', async () => {
    const r = await performRestore({ ...deps(artifactOf(A, ['S-new'])), decisions: { identifier: 'establish', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(r.identifierEstablished).toBe(true);
    expect(readWorkspaceId(ws)).toEqual({ state: 'readable', id: A });
    expect(sids(A)).toEqual(['S-new']);
  });
  it('case different → artifact-store: the sessions land under the artifact\'s identifier and this workspace keeps its own', async () => {
    writeId(B);
    seed(root, B, ['S-mine']);
    const r = await performRestore({ ...deps(artifactOf(A, ['S-theirs'])), decisions: { identifier: 'artifact-store', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(readWorkspaceId(ws)).toEqual({ state: 'readable', id: B });
    expect(sids(A)).toEqual(['S-theirs']);
    expect(sids(B)).toEqual(['S-mine']);
  });
  it('case different → establish (ESC-26): the identifier is replaced AFTER the store is whole; the old store is intact and writing the old value back undoes it', async () => {
    writeId(B);
    seed(root, B, ['S-mine']);
    const r = await performRestore({ ...deps(artifactOf(A, ['S-theirs'])), decisions: { identifier: 'establish', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(r.identifierEstablished).toBe(true);
    expect(readWorkspaceId(ws)).toEqual({ state: 'readable', id: A });
    expect(sids(B)).toEqual(['S-mine']);
    writeId(B);
    expect(readWorkspaceId(ws)).toEqual({ state: 'readable', id: B });
  });
  it('a decision the case does not admit is refused before any mutation; a foreign lock refuses until confirmed', async () => {
    writeId(A);
    seed(root, A, ['S-old'], { sid: 'S-old', pid: 1, host: OTHER });
    const art = artifactOf(A, ['S-new']);
    expect(decisionAllowed('same', 'establish')).toBe(false);
    const bad = await performRestore({ ...deps(art), decisions: { identifier: 'establish', proceedWithForeignLocks: true }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(bad.ok).toBe(false);
    expect(sids(A)).toEqual(['S-old']);
    const refused = await performRestore({ ...deps(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(refused.refusal?.why).toBe('foreign-locks');
    if (refused.refusal?.why === 'foreign-locks') expect(refused.refusal.risk).toMatch(/may be writing/);
    const ok = await performRestore({ ...deps(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: true }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall, ackBoundMs: millis(2_000) });
    expect(ok.ok).toBe(true);
    expect(sids(A)).toEqual(['S-new']);
  });
});

describe('workspace — OQ-281: a restore into a place that exists and holds no store (REQ-SESSION-202, REQ-SESSION-201)', () => {
  it('the assessment says the place is empty — no store, no sessions — and the restore keeps what was in it and lists the backup\'s sessions', async () => {
    writeId(A);
    mkdirSync(join(root, A, 'sessions'), { recursive: true });
    writeFileSync(join(root, A, 'origin.txt'), 'D:/somewhere-else\n');
    const artifact = artifactOf(A, ['S-1', 'S-2']);
    const a = assessRestore(deps(artifact));
    expect(a.refusal).toBeNull();
    expect(a.identifier).toEqual({ case: 'same', current: A });
    expect(a.target).toEqual({ exists: false, placeEmpty: true, sessions: 0, foreignLocks: [], liveLocks: [] });
    const rh = runHost();
    const r = await performRestore({ ...deps(artifact), decisions: { identifier: 'workspace', proceedWithForeignLocks: false }, runHost: rh, timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(sids(A)).toEqual(['S-1', 'S-2']);
    // What was found in the place is moved aside whole and kept — never deleted.
    expect(r.displaced).toBeDefined();
    expect(readFileSync(join(r.displaced!, 'origin.txt'), 'utf8')).toBe('D:/somewhere-else\n');
    expect(existsSync(join(r.displaced!, 'sessions'))).toBe(true);
  });
  it('a place that is absent is no such condition: nothing is found there, and nothing is said to be', () => {
    writeId(A);
    expect(assessRestore(deps(artifactOf(A, ['S']))).target).toEqual({ exists: false, placeEmpty: false, sessions: 0, foreignLocks: [], liveLocks: [] });
  });
});

describe('workspace — D8: the assessment and a refused restore leave the target directory as they found it (ADR-0058 consequence 18)', () => {
  const listing = (id: WorkspaceId): string[] => readdirSync(join(root, id)).sort();
  const sidecars = (names: string[]): string[] => names.filter((n) => SIDECAR_PATTERN.test(n));

  it('assessing a cleanly closed target creates no write-ahead files beside it and changes no byte of it', () => {
    writeId(A);
    seed(root, A, ['S-old']);
    const before = listing(A);
    expect(sidecars(before)).toEqual([]);
    const bytes = readFileSync(storeFile(root, A));
    const a = assessRestore(deps(artifactOf(A, ['S-new'])));
    expect(a.target.sessions).toBe(1);
    // The read-only open this replaced left `workspace.db-shm` and `workspace.db-wal` here (D8).
    expect(listing(A)).toEqual(before);
    expect(readFileSync(storeFile(root, A)).equals(bytes)).toBe(true);
  });

  it('a restore refused before the swap — on a decision the case does not admit, or on a lock naming another machine — leaves the target listing and bytes exactly as found', async () => {
    writeId(A);
    seed(root, A, ['S-old'], { sid: 'S-old', pid: 1, host: OTHER });
    const art = artifactOf(A, ['S-new']);
    const before = listing(A);
    const bytes = readFileSync(storeFile(root, A));
    // Refused after the assessment and before the mechanism: the assessment's read-only open left both files (D8).
    const bad = await performRestore({ ...deps(art), decisions: { identifier: 'establish', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(bad.steps).toEqual(['assess-refused']);
    expect(listing(A)).toEqual(before);
    // Refused at the mechanism's step 2: its own gate is a read-write connection whose close is the last one.
    const r = await performRestore({ ...deps(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r.refusal?.why).toBe('foreign-locks');
    expect(listing(A)).toEqual(before);
    expect(readFileSync(storeFile(root, A)).equals(bytes)).toBe(true);
  });

  it('a target that already holds both write-ahead files (a writer holds them, or died holding them) keeps them and its bytes', () => {
    writeId(A);
    seed(root, A, ['S-old']);
    // A writer holding the store open with a committed row still in its log: copy the directory as it stands.
    const live = openStore(storeFile(root, A));
    live.pragma('wal_autocheckpoint = 0');
    new StoreDal(live).upsertSession({ session_id: 'S-logged', execution_status: 'completed', workspace_root: ws, created_at: 't', updated_at: 't' });
    const held = mkdtempSync(join(tmpdir(), 'rotaris-held-'));
    for (const n of readdirSync(join(root, A))) if (n !== 'sessions') copyFileSync(join(root, A, n), join(held, n));
    live.close();
    forgetSpelling(join(root, A));
    rmSync(join(root, A), { recursive: true, force: true });
    renameSync(held, join(root, A));
    const before = listing(A);
    expect(sidecars(before)).toEqual(['workspace.db-shm', 'workspace.db-wal']);
    const bytes = readFileSync(storeFile(root, A));
    const wal = readFileSync(`${storeFile(root, A)}-wal`);
    const a = assessRestore(deps(artifactOf(A, ['S-new'])));
    expect(a.target.sessions).toBe(2); // the logged row is read
    expect(listing(A)).toEqual(before);
    expect(readFileSync(storeFile(root, A)).equals(bytes)).toBe(true);
    expect(readFileSync(`${storeFile(root, A)}-wal`).equals(wal)).toBe(true);
  });
});

describe('workspace — D11: a restore whose kept store the engine could not open is refused at the assessment (ADR-0058 consequence 18)', () => {
  it('a target at 230 characters is refused before any confirmation, naming the length and the limit; with no limit it is assessed as before', async () => {
    // A workspaces root that puts the live `workspace.db` at 230 characters.
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'rotaris-long-')));
    const longRoot = join(base, 'p'.repeat(230 - (1 + A.length + 1 + 'workspace.db'.length) - base.length - 1));
    mkdirSync(longRoot);
    try {
      expect(storeFile(longRoot, A).length).toBe(230);
      writeId(A);
      seed(longRoot, A, ['S-old']);
      const art = artifactOf(A, ['S-new']);
      const d = { ...deps(art), workspacesRoot: longRoot };
      const a = assessRestore({ ...d, storePathLimit: 251 });
      expect(a.refusal?.why).toBe('path-too-long');
      expect(a.refusal?.detail).toContain('267 characters');
      expect(a.refusal?.detail).toContain('251');
      expect(assessRestore({ ...d, storePathLimit: null }).refusal).toBeNull();
      const r = await performRestore({ ...d, storePathLimit: 251, decisions: { identifier: 'workspace', proceedWithForeignLocks: false }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
      expect(r.ok).toBe(false);
      expect(r.steps).toEqual(['assess-refused']);
      const sidsAt = (): string[] => { const db = openStore(storeFile(longRoot, A), { readonly: true, mustExist: true }); const s = new StoreDal(db).listSessions().map((x) => x.session_id); db.close(); return s; };
      expect(sidsAt()).toEqual(['S-old']);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

/**
 * OQ-477 (ruled 2026-11-04 by the consortium under R-072, no directive): the restore while main holds this workspace's store
 * as `workspace.store-corrupt`. The fixture is the disk a killed process leaves: the store's file with the `sessions` table's
 * root page header overwritten, and a live write-ahead log holding a committed transaction, with no `-shm` — the case in
 * which the assessment's `openStoreForInspection` opens the target read-write and `restoreStore`'s own gate always does, and
 * either close checkpoints the log into the damaged file and deletes it. It also holds a lock row naming another machine,
 * which the restore must not read.
 */
describe('workspace — OQ-477: a restore over a store that failed its integrity check never opens it (PD-SESSION-005, REQ-SESSION-201, ADR-0058 part 11)', () => {
  const listing = (id: WorkspaceId): string[] => readdirSync(join(root, id)).sort();
  function corruptInPlace(id: WorkspaceId): { readonly db: Buffer; readonly wal: Buffer } {
    const built = mkdtempSync(join(tmpdir(), 'rotaris-corrupt-built-'));
    try {
      const r = openWorkspaceStore(built, id, ws);
      const dal = new StoreDal(r.db);
      for (let n = 0; n < 400; n++) dal.upsertSession({ session_id: `S-old-${n}`, execution_status: 'completed', workspace_root: ws, created_at: 't', updated_at: 't' });
      dal.claimLock(asSessionId('S-old-0'), 1, OTHER, 't');
      r.db.pragma('wal_checkpoint(TRUNCATE)');
      r.db.pragma('wal_autocheckpoint = 0');
      r.db.prepare('INSERT INTO prompt_history(text, at) VALUES (?, ?)').run('logged after the checkpoint', 't');
      const rootPage = (r.db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'sessions'").get() as { rootpage: number }).rootpage;
      const pageSize = r.db.pragma('page_size', { simple: true }) as number;
      mkdirSync(join(root, id), { recursive: true });
      // Copied while the connection is open, so no close has checkpointed the log away.
      copyFileSync(r.file, storeFile(root, id));
      copyFileSync(`${r.file}-wal`, `${storeFile(root, id)}-wal`);
      r.db.close();
      forgetSpelling(r.dir);
      const fd = openSync(storeFile(root, id), 'r+');
      try { writeSync(fd, Buffer.alloc(12, 0xa5), 0, 12, (rootPage - 1) * pageSize); } finally { closeSync(fd); }
      return { db: readFileSync(storeFile(root, id)), wal: readFileSync(`${storeFile(root, id)}-wal`) };
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  }
  const held = (artifact: string) => ({ ...deps(artifact), heldCorrupt: true });

  it('the assessment reports the target present, failed and unreadable — no count, no lock rows — and leaves it byte for byte, no -shm made', () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    const found = corruptInPlace(A);
    const a = assessRestore(held(art));
    expect(a.refusal).toBeNull();
    expect(a.identifier).toEqual({ case: 'same', current: A });
    expect(a.target).toMatchObject({ exists: true, placeEmpty: false, sessions: 0, foreignLocks: [], liveLocks: [] });
    expect(a.target.unreadable?.report.length).toBeGreaterThan(0);
    expect(listing(A)).toEqual(['workspace.db', 'workspace.db-wal']);
    expect(readFileSync(storeFile(root, A)).equals(found.db)).toBe(true);
    expect(readFileSync(`${storeFile(root, A)}-wal`).equals(found.wal)).toBe(true);
  });

  it('(counterfactual) the assessment as it was — no `heldCorrupt` — opens the target, and its close takes the log', () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    const found = corruptInPlace(A);
    try { assessRestore(deps(art)); } catch { /* the damaged page may be met while counting */ }
    forgetSpelling(join(root, A));
    const walKept = existsSync(`${storeFile(root, A)}-wal`) && readFileSync(`${storeFile(root, A)}-wal`).equals(found.wal);
    expect(walKept && readFileSync(storeFile(root, A)).equals(found.db) && !existsSync(`${storeFile(root, A)}-shm`)).toBe(false);
  });

  it('the restore told the target is unreadable displaces the directory whole, byte for byte, never opened, and the backup\'s sessions take its place', async () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    const found = corruptInPlace(A);
    const rh = runHost();
    const r = await performRestore({ ...held(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false, targetUnreadable: true }, runHost: rh, timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(r.refusal).toBeUndefined(); // the foreign lock row on the damaged pages is never read
    expect(r.steps).toContain('0-target-unreadable(not-opened)');
    expect(rh.log).toEqual(['refuse', 'close', 'reopen']);
    expect(r.displaced).toBeDefined();
    expect(readdirSync(r.displaced!).sort()).toEqual(['workspace.db', 'workspace.db-wal']);
    expect(readFileSync(join(r.displaced!, 'workspace.db')).equals(found.db)).toBe(true);
    expect(readFileSync(join(r.displaced!, 'workspace.db-wal')).equals(found.wal)).toBe(true);
    expect(sids(A)).toEqual(['S-new']);
  });

  it('PD-SESSION-005: a foreign lock row on pages the restore never reads — no count stated, the restore proceeding only under the confirmed decision, the target never opened, kept byte for byte', async () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    const found = corruptInPlace(A);
    // The question's ground: the assessment counts nothing, so a "0 lock records" read off damaged pages is never stated.
    const a = assessRestore(held(art));
    expect(a.target.unreadable).toBeDefined();
    expect(a.target.foreignLocks).toEqual([]);
    expect(listing(A)).toEqual(['workspace.db', 'workspace.db-wal']);
    // The perform proceeds on the decision that records the first question's confirmation (`targetUnreadable`), which
    // `restoreFlow` sends only after that question was answered Restore (`store-resolution.test.ts`), and on no second one:
    // `proceedWithForeignLocks` stays false and nothing refuses it, because no lock row is read.
    const rh = runHost();
    const r = await performRestore({ ...held(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false, targetUnreadable: true }, runHost: rh, timers: clocks.timers, wall: clocks.wall });
    expect(r.ok).toBe(true);
    expect(r.refusal).toBeUndefined();
    expect(r.steps).toContain('0-target-unreadable(not-opened)');
    expect(rh.log).toEqual(['refuse', 'close', 'reopen']);
    expect(readFileSync(join(r.displaced!, 'workspace.db')).equals(found.db)).toBe(true);
    expect(readFileSync(join(r.displaced!, 'workspace.db-wal')).equals(found.wal)).toBe(true);
    expect(sids(A)).toEqual(['S-new']);
    // And the store did hold such a record: a scratch copy of what was kept, opened, names another machine. The directive's
    // case is real, not a reading — "where the target store holds such records" was true, and no count was stated.
    const scratch = mkdtempSync(join(tmpdir(), 'rotaris-kept-copy-'));
    try {
      copyFileSync(join(r.displaced!, 'workspace.db'), join(scratch, 'workspace.db'));
      copyFileSync(join(r.displaced!, 'workspace.db-wal'), join(scratch, 'workspace.db-wal'));
      const db = openStore(join(scratch, 'workspace.db'), { mustExist: true });
      try {
        expect(new StoreDal(db).listLocks().filter((l) => l.host === OTHER).map((l) => l.session_id)).toEqual(['S-old-0']);
      } finally {
        db.close();
        forgetSpelling(scratch);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('(counterfactual) the mechanism as it was — no `targetUnreadable` — opens the target and the directory it keeps is not the one found', async () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    const found = corruptInPlace(A);
    const r = await restoreStore(
      { workspacesRoot: root, id: A, artifact: art, thisMachine: M, originLabel: ws, runHost: runHost(), timers: clocks.timers, wall: clocks.wall },
      { proceedWithForeignLocks: true },
    ).catch(() => null);
    forgetSpelling(join(root, A));
    const kept = r?.displaced ?? join(root, A);
    const walKept = existsSync(join(kept, 'workspace.db-wal')) && readFileSync(join(kept, 'workspace.db-wal')).equals(found.wal);
    expect(walKept && readFileSync(join(kept, 'workspace.db')).equals(found.db)).toBe(false);
  });

  it('the perform re-checks: a store repaired by hand since the question is refused as sound, and nothing changes', async () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    corruptInPlace(A);
    expect(assessRestore(held(art)).target.unreadable).toBeDefined();
    rmSync(join(root, A), { recursive: true, force: true });
    seed(root, A, ['S-repaired']);
    const before = listing(A);
    const r = await performRestore({ ...held(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false, targetUnreadable: true }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r).toMatchObject({ ok: false, abandoned: true, steps: ['assess-refused'] });
    expect(r.error).toContain('now passes its integrity check');
    expect(listing(A)).toEqual(before);
    expect(sids(A)).toEqual(['S-repaired']);
    expect(readdirSync(root).filter((n) => n.includes('.displaced-'))).toEqual([]);
  });

  it('a damaged store taken out of its place by hand since the question is refused, and nothing is restored', async () => {
    writeId(A);
    const art = artifactOf(A, ['S-new']);
    corruptInPlace(A);
    rmSync(join(root, A), { recursive: true, force: true });
    const r = await performRestore({ ...held(art), decisions: { identifier: 'workspace', proceedWithForeignLocks: false, targetUnreadable: true }, runHost: runHost(), timers: clocks.timers, wall: clocks.wall });
    expect(r).toMatchObject({ ok: false, steps: ['assess-refused'] });
    expect(existsSync(join(root, A))).toBe(false);
  });

  it('only this workspace\'s own store is checked: a backup of another identifier assesses its own target as before', () => {
    writeId(B);
    corruptInPlace(B);
    const a = assessRestore(held(artifactOf(A, ['S-new'])));
    expect(a.identifier).toEqual({ case: 'different', current: B });
    expect(a.target.unreadable).toBeUndefined();
    expect(listing(B)).toEqual(['workspace.db', 'workspace.db-wal']);
  });
});
