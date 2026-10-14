import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { forgetSpelling, openWorkspaceStore, storeDir, storeFile, type IdentifierRead } from '@rotaris/store';
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
