import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, millis, mintMachineId, mintWorkspaceId, type MachineId, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { forgetSpelling, openStore, openWorkspaceStore, readWorkspaceId, SIDECAR_PATTERN, StoreDal, storeFile, takeBackup, type RunHostControl } from '@rotaris/store';
import { assessRestore, backupWorkspace, decisionAllowed, performRestore } from './index.js';

const M = mintMachineId('0000000000000000000000000000000a') as MachineId;
const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
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
    expect(a.target).toEqual({ exists: true, sessions: 1, foreignLocks: [], liveLocks: [] });
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
