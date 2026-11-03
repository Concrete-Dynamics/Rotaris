import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { asSessionId, mintMachineId, mintWorkspaceId } from '@rotaris/kernel';
import { CONTAINER_MANIFEST, CONTAINER_STORE_FILE, CURRENT_SCHEMA_VERSION, expandArtifact, forgetSpelling, openStore, openWorkspaceStore, SESSIONS_DIR, StoreDal, storeDir, takeBackup, type BackupManifest } from './index.js';

/**
 * Hardening C2 (`docs/architecture/hardening.md` §3.3 row 4; REQ-SESSION-201): the backup's staging, measured beside
 * `backup.ts` — `VACUUM INTO` a snapshot inside `<destination>.part-<pid>`, the per-session file bodies copied from the
 * store's `sessions/`, the manifest sealed, the archive written to `<destination>.tmp-<pid>`, flushed and renamed onto the
 * destination, the staging removed. The flush order has its own case in `store.test.ts`; the workspace service's wrapper
 * (`packages/workspace/src/backup.ts`) removes the two staging names on a failure, which is why the failure case here pins
 * exactly those names.
 *
 * The manifest holds counts, the schema version, the identifier and the sessions whose bodies were absent; it carries no
 * per-file digest (REQ-SESSION-201 asks for none), so the bodies are compared here by digest against the store they came
 * from.
 */
const id = mintWorkspaceId('000000000000000000000000000000ca');
const ELSEWHERE = mintMachineId('000000000000000000000000000000cb');
let root: string;
let out: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-backup-')); out = mkdtempSync(join(tmpdir(), 'rotaris-backup-out-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); });

/** Every file under `dir`, by its path relative to `dir` (forward slashes), to the SHA-256 of its bytes. */
function digests(dir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else found[relative(dir, full).split(sep).join('/')] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  if (existsSync(dir)) walk(dir);
  return found;
}

/** A store holding three sessions with transcript rows and a lock; two of them have file bodies, `S-3` has none. */
function storeWithBodies(): void {
  const r = openWorkspaceStore(root, id, 'C:/ws');
  const dal = new StoreDal(r.db);
  for (const [sid, rows] of [['S-1', 3], ['S-2', 1], ['S-3', 2]] as const) {
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    for (let i = 0; i < rows; i++) dal.appendRow(asSessionId(sid), i, 'text', true, `row ${i} of ${sid}`);
  }
  dal.claimLock(asSessionId('S-2'), 4242, ELSEWHERE, 't');
  r.db.close();
  forgetSpelling(r.dir);
  const bodies = join(storeDir(root, id), SESSIONS_DIR);
  mkdirSync(join(bodies, 'S-1', 'diffs'), { recursive: true });
  writeFileSync(join(bodies, 'S-1', 'session.log'), 'line one\nline two\n');
  writeFileSync(join(bodies, 'S-1', 'diffs', '0001.diff'), Buffer.from([0, 1, 2, 3, 255]));
  mkdirSync(join(bodies, 'S-2'), { recursive: true });
  writeFileSync(join(bodies, 'S-2', 'summary.md'), '# S-2\n');
}

const staged = (destination: string) => [`${destination}.part-${process.pid}`, `${destination}.tmp-${process.pid}`];

describe('takeBackup — the staging, the manifest and the archive (REQ-SESSION-201)', () => {
  it('stages a snapshot with every session body, seals a manifest that says what it holds, archives it whole and leaves no staging behind', () => {
    storeWithBodies();
    const before = digests(storeDir(root, id));
    const destination = join(out, 'backup.tar');
    const r = takeBackup(root, id, destination, '2026-11-03T00:00:00.000Z', 'C:/ws');

    const expected: BackupManifest = {
      artifact_format_version: 1,
      workspace_identifier: id,
      taken_at_utc: '2026-11-03T00:00:00.000Z',
      store_user_version: CURRENT_SCHEMA_VERSION,
      counts: { sessions: 3, rows: 6, locks: 1 },
      last_seen_workspace_path: 'C:/ws',
      absent_bodies: ['S-3'],
    };
    expect(r.manifest).toEqual(expected);
    expect(r.bytes).toBe(statSync(destination).size);
    // Nothing of the staging is left beside the destination, and the destination is the one file there.
    expect(readdirSync(out)).toEqual(['backup.tar']);
    for (const leftover of staged(destination)) expect(existsSync(leftover)).toBe(false);

    // The archive opens: the snapshot, the manifest as returned, and every body byte for byte.
    const into = join(out, 'expanded');
    expandArtifact(destination, into);
    expect(readdirSync(into).sort()).toEqual([CONTAINER_MANIFEST, SESSIONS_DIR, CONTAINER_STORE_FILE].sort());
    expect(JSON.parse(readFileSync(join(into, CONTAINER_MANIFEST), 'utf8'))).toEqual(expected);
    const bodies = digests(join(storeDir(root, id), SESSIONS_DIR));
    expect(Object.keys(bodies)).toEqual(['S-1/diffs/0001.diff', 'S-1/session.log', 'S-2/summary.md']);
    expect(digests(join(into, SESSIONS_DIR))).toEqual(bodies);
    const snap = openStore(join(into, CONTAINER_STORE_FILE), { readonly: true, mustExist: true });
    try {
      const dal = new StoreDal(snap);
      expect(dal.listSessions().map((s) => s.session_id).sort()).toEqual(['S-1', 'S-2', 'S-3']);
      expect(dal.totals()).toEqual({ sessions: 3, rows: 6 });
      expect(dal.getLock(asSessionId('S-2'))).toMatchObject({ pid: 4242, host: ELSEWHERE });
      expect(snap.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      snap.close();
    }
    // The store it was taken from is as it was: the same files, the same bytes (its log checkpointed by the close).
    const after = digests(storeDir(root, id));
    expect(Object.keys(after).filter((f) => !/-(wal|shm)$/.test(f))).toEqual(Object.keys(before).filter((f) => !/-(wal|shm)$/.test(f)));
    for (const f of Object.keys(bodies)) expect(after[`${SESSIONS_DIR}/${f}`]).toBe(before[`${SESSIONS_DIR}/${f}`]);
  });

  it('starts from an empty staging directory: what an earlier attempt of this process left there never reaches the archive', () => {
    storeWithBodies();
    const destination = join(out, 'backup.tar');
    const [part] = staged(destination);
    mkdirSync(join(part!, SESSIONS_DIR, 'S-ghost'), { recursive: true });
    writeFileSync(join(part!, SESSIONS_DIR, 'S-ghost', 'left.txt'), 'from an attempt that was cut');
    writeFileSync(join(part!, CONTAINER_STORE_FILE), 'not a database');
    takeBackup(root, id, destination, 't', null);
    const into = join(out, 'expanded');
    expandArtifact(destination, into);
    expect(readdirSync(join(into, SESSIONS_DIR)).sort()).toEqual(['S-1', 'S-2']);
    expect(existsSync(part!)).toBe(false);
  });

  it('a failure after staging leaves nothing at the destination and the store as it was; the staging is exactly the two names the workspace service removes', () => {
    storeWithBodies();
    const before = digests(join(storeDir(root, id), SESSIONS_DIR));
    const destination = join(out, 'backup.tar');
    const refused = Object.assign(new Error('EACCES: refused'), { code: 'EACCES' });
    expect(() => takeBackup(root, id, destination, 't', null, { rename: () => { throw refused; } })).toThrow(refused);
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(out).sort()).toEqual(staged(destination).map((p) => p.slice(out.length + 1)).sort());
    // The store answers as before, with every session.
    const r = openWorkspaceStore(root, id, 'C:/ws');
    expect(new StoreDal(r.db).listSessions().map((s) => s.session_id).sort()).toEqual(['S-1', 'S-2', 'S-3']);
    r.db.close();
    forgetSpelling(r.dir);
    expect(digests(join(storeDir(root, id), SESSIONS_DIR))).toEqual(before);
  });
});
