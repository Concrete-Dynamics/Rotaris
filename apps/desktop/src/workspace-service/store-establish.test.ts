import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { forgetSpelling, openStore, openWorkspaceStore, StoreDal, storeDir, storeFile, type IdentifierRead } from '@rotaris/store';
import { assessEstablish, performEstablish, type EstablishDeps } from './store-establish.js';

/**
 * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202: the workspace service's two phases of "Start a new session store".
 * The assessment names the place and the kept path the user is told; the perform re-checks the condition and keeps the place.
 */
const id = mintWorkspaceId('000000000000000000000000000002f1');
const stamp = '2026-10-14T06-00-00-000Z';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-establish-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const readable = (): IdentifierRead => ({ state: 'readable', id });
const deps = (over: Partial<EstablishDeps> = {}): EstablishDeps => ({ workspacesRoot: root, workspaceRoot: '/work/a', readId: readable, restoreInFlight: false, stamp, ...over });

describe('the workspace service\'s new store in an empty place (OQ-281)', () => {
  it('assesses the place and the kept path, then performs exactly that: the place kept whole, a store created', () => {
    mkdirSync(join(storeDir(root, id), 'sessions'), { recursive: true });
    writeFileSync(join(storeDir(root, id), 'origin.txt'), '/work/a\n');
    const kept = join(root, `${id}.displaced-${stamp}`);
    expect(assessEstablish(deps())).toEqual({ kind: 'workspace.store.establishable', place: storeDir(root, id), kept, stamp });
    // The assessment changed nothing.
    expect(existsSync(storeFile(root, id))).toBe(false);
    expect(performEstablish(deps())).toEqual({ kind: 'workspace.store.established', place: storeDir(root, id), kept });
    expect(readdirSync(kept).sort()).toEqual(['origin.txt', 'sessions']);
    expect(existsSync(storeFile(root, id))).toBe(true);
  });

  it('re-checks at the perform: a store put back in the meantime is refused and left exactly as it is', () => {
    mkdirSync(storeDir(root, id), { recursive: true });
    expect(assessEstablish(deps()).kind).toBe('workspace.store.establishable');
    rmSync(storeDir(root, id), { recursive: true });
    const s = openWorkspaceStore(root, id, '/work/a');
    s.db.close();
    forgetSpelling(s.dir);
    expect(performEstablish(deps())).toMatchObject({ kind: 'refused', code: 'workspace.store-store-present', headline: 'A new session store was not started' });
    expect(readdirSync(root).filter((n) => n.includes('.displaced-'))).toEqual([]);
  });

  it('refuses with nothing changed while a restore is in flight, and for an identifier it cannot read — it never mints one', () => {
    mkdirSync(storeDir(root, id), { recursive: true });
    expect(performEstablish(deps({ restoreInFlight: true }))).toMatchObject({ kind: 'refused', code: 'workspace.restore-in-flight' });
    expect(performEstablish(deps({ readId: () => ({ state: 'absent' }) }))).toMatchObject({ kind: 'refused', code: 'workspace.identifier-unreadable' });
    expect(assessEstablish(deps({ readId: () => ({ state: 'unreadable', raw: 'garbage' }) }))).toMatchObject({ kind: 'refused', code: 'workspace.identifier-unreadable' });
    expect(readdirSync(storeDir(root, id))).toEqual([]);
    expect(readdirSync(root)).toEqual([id]);
  });
});

/**
 * OQ-477 (ruled 2026-11-04 under R-072): the same two phases set aside a store that failed C1's integrity check. The fixture is
 * the disk a killed process leaves — the file with the `sessions` table's root page header overwritten, and a write-ahead log
 * holding a committed transaction, with no `-shm` — the case in which any read-write open of the target would checkpoint the
 * log into the damaged file on close, or create the `-shm`.
 */
function corruptInPlace(): { readonly file: string; readonly db: Buffer; readonly wal: Buffer } {
  const built = mkdtempSync(join(tmpdir(), 'rotaris-establish-built-'));
  try {
    const r = openWorkspaceStore(built, id, '/work/a');
    const dal = new StoreDal(r.db);
    for (let n = 0; n < 400; n++) dal.upsertSession({ session_id: `S-${n}`, execution_status: 'completed', workspace_root: '/work/a', created_at: 't', updated_at: 't' });
    r.db.pragma('wal_checkpoint(TRUNCATE)');
    r.db.pragma('wal_autocheckpoint = 0');
    r.db.prepare('INSERT INTO prompt_history(text, at) VALUES (?, ?)').run('logged after the checkpoint', 't');
    const rootPage = (r.db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'sessions'").get() as { rootpage: number }).rootpage;
    const pageSize = r.db.pragma('page_size', { simple: true }) as number;
    mkdirSync(storeDir(root, id), { recursive: true });
    const file = storeFile(root, id);
    copyFileSync(r.file, file);
    copyFileSync(`${r.file}-wal`, `${file}-wal`);
    writeFileSync(join(storeDir(root, id), 'origin.txt'), '/work/a\n');
    r.db.close();
    forgetSpelling(r.dir);
    const fd = openSync(file, 'r+');
    try { writeSync(fd, Buffer.alloc(12, 0xa5), 0, 12, (rootPage - 1) * pageSize); } finally { closeSync(fd); }
    return { file, db: readFileSync(file), wal: readFileSync(`${file}-wal`) };
  } finally {
    rmSync(built, { recursive: true, force: true });
  }
}

describe('the workspace service\'s "Set the damaged store aside and start a new one" (OQ-477)', () => {
  const corrupt = (over: Partial<EstablishDeps> = {}) => deps({ held: 'corrupt', ...over });

  it('assesses with SQLite\'s report and opens nothing: the store\'s files are byte for byte as found, no -shm made, no scratch left', () => {
    const found = corruptInPlace();
    const kept = join(root, `${id}.displaced-${stamp}`);
    const a = assessEstablish(corrupt());
    expect(a).toMatchObject({ kind: 'workspace.store.establishable', place: storeDir(root, id), kept, stamp });
    expect(a.kind === 'workspace.store.establishable' ? a.report?.length ?? 0 : 0).toBeGreaterThan(0);
    expect(readdirSync(storeDir(root, id)).sort()).toEqual(['origin.txt', 'workspace.db', 'workspace.db-wal']);
    expect(readFileSync(found.file).equals(found.db)).toBe(true);
    expect(readFileSync(`${found.file}-wal`).equals(found.wal)).toBe(true);
    expect(readdirSync(root)).toEqual([id]);
  });

  it('performs exactly that: the directory moved aside whole, byte for byte, a new store created in its place', () => {
    const found = corruptInPlace();
    const kept = join(root, `${id}.displaced-${stamp}`);
    expect(performEstablish(corrupt())).toEqual({ kind: 'workspace.store.established', place: storeDir(root, id), kept });
    expect(readdirSync(kept).sort()).toEqual(['origin.txt', 'workspace.db', 'workspace.db-wal']);
    expect(readFileSync(join(kept, 'workspace.db')).equals(found.db)).toBe(true);
    expect(readFileSync(join(kept, 'workspace.db-wal')).equals(found.wal)).toBe(true);
    const fresh = openStore(storeFile(root, id), { mustExist: true, checkIntegrity: true });
    expect(new StoreDal(fresh).listSessions()).toEqual([]);
    fresh.close();
    forgetSpelling(storeDir(root, id));
  });

  it('re-checks at the perform: a store repaired by hand in the meantime passes and is refused, left exactly as it is', () => {
    corruptInPlace();
    expect(assessEstablish(corrupt()).kind).toBe('workspace.store.establishable');
    rmSync(storeDir(root, id), { recursive: true });
    const s = openWorkspaceStore(root, id, '/work/a');
    s.db.close();
    forgetSpelling(s.dir);
    const before = readFileSync(storeFile(root, id));
    expect(performEstablish(corrupt())).toMatchObject({ kind: 'refused', code: 'workspace.store-store-sound', headline: 'A new session store was not started' });
    expect(readFileSync(storeFile(root, id)).equals(before)).toBe(true);
    expect(readdirSync(root).filter((n) => n.includes('.displaced-'))).toEqual([]);
  });

  it('a damaged store taken out of its place by hand meanwhile is refused as no longer there; the place is left as found', () => {
    const found = corruptInPlace();
    rmSync(found.file);
    rmSync(`${found.file}-wal`);
    expect(performEstablish(corrupt())).toMatchObject({ kind: 'refused', code: 'workspace.store-store-absent' });
    expect(readdirSync(storeDir(root, id))).toEqual(['origin.txt']);
  });

  it('(counterfactual) the empty-place action is not this one: with the default condition a damaged store in its place is refused as present', () => {
    corruptInPlace();
    expect(performEstablish(deps())).toMatchObject({ kind: 'refused', code: 'workspace.store-store-present' });
    expect(readdirSync(root).filter((n) => n.includes('.displaced-'))).toEqual([]);
  });
});
