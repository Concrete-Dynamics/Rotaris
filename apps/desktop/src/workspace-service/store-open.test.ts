import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintWorkspaceId } from '@rotaris/kernel';
import { claimAsideName, forgetSpelling, openWorkspaceStore, restoreJournal, StoreDal, storeDir, writeRestoreJournal } from '@rotaris/store';
import { openStoreAtOpen, RestoreInFlight } from './store-open.js';

/**
 * The workspace service's open (`openOwn`) over OQ-266's journal and REQ-SESSION-202's empty place: a restore cut between
 * its two renames is reversed at the open unless this service's own restore is in flight, and a place holding no store is
 * refused with what was found.
 */
const id = mintWorkspaceId('000000000000000000000000000000c1');
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-store-open-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

/** The disk a restore cut between step 8 and step 9 leaves: the journal, the displaced store, no target. */
function cutRestore(): string {
  const seeded = openWorkspaceStore(root, id, '/work/a');
  new StoreDal(seeded.db).upsertSession({ session_id: 'S-1', execution_status: 'completed', workspace_root: '/work/a', created_at: 't', updated_at: 't' });
  seeded.db.close();
  forgetSpelling(seeded.dir);
  const stamp = '2026-10-14T00-00-00-000Z';
  writeRestoreJournal(root, id, { stamp, stagingN: 1, targetExisted: true });
  const c = claimAsideName(root, id, stamp, 'displaced', storeDir(root, id));
  if (!c.ok) throw new Error('the displacement failed');
  return c.to;
}

describe('the workspace service\'s open of a store (OQ-266, REQ-SESSION-202)', () => {
  it('while its own restore is in flight the open neither reverses the cut nor creates; once it is not, the open puts the store back', async () => {
    const displaced = cutRestore();
    const gate = new RestoreInFlight();
    let during: ReturnType<typeof openStoreAtOpen> | undefined;
    await gate.around(async () => { during = openStoreAtOpen(root, id, '/work/a', gate.active); });
    expect(during).toEqual({ ok: false, refusal: expect.objectContaining({ kind: 'refused', code: 'workspace.restore-in-flight' }) });
    expect(existsSync(storeDir(root, id))).toBe(false);
    expect(existsSync(displaced)).toBe(true);
    expect(existsSync(restoreJournal(root, id))).toBe(true);
    expect(gate.active).toBe(false);
    const after = openStoreAtOpen(root, id, '/work/a', gate.active);
    if (!after.ok) throw new Error(after.refusal.headline);
    expect(after.store.cutRestore).toEqual({ reversed: displaced, hadStore: true, staging: join(root, `${id}.restoring-1`), stamp: '2026-10-14T00-00-00-000Z' });
    expect(new StoreDal(after.store.db).listSessions().map((s) => s.session_id)).toEqual(['S-1']);
    after.store.db.close();
    forgetSpelling(after.store.dir);
    expect(existsSync(restoreJournal(root, id))).toBe(false);
  });

  it('(counterfactual) without the in-flight flag the same open reverses the cut under a restore still running', () => {
    const displaced = cutRestore();
    const r = openStoreAtOpen(root, id, '/work/a', false);
    expect(r.ok && r.store.cutRestore?.reversed).toBe(displaced);
    if (r.ok) { r.store.db.close(); forgetSpelling(r.store.dir); }
  });

  it('a place holding no store is refused as what was found, and nothing is created there', () => {
    mkdirSync(storeDir(root, id), { recursive: true });
    const r = openStoreAtOpen(root, id, '/work/a', false);
    expect(r).toEqual({ ok: false, refusal: {
      kind: 'refused', code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept',
      detail: `The place for this workspace's session store exists (${storeDir(root, id)}) and the store is not in it. Nothing was created there, and no session in this workspace can start until it is resolved.`,
    } });
    expect(readdirSync(storeDir(root, id))).toEqual([]);
  });

  it('a cut restore whose store cannot be found is refused with the paths, keeping the journal', () => {
    const displaced = cutRestore();
    rmSync(displaced, { recursive: true });
    const r = openStoreAtOpen(root, id, '/work/a', false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refusal.code).toBe('workspace.store-displaced');
      expect(r.refusal.detail).toContain(storeDir(root, id));
    }
    expect(existsSync(restoreJournal(root, id))).toBe(true);
    expect(existsSync(storeDir(root, id))).toBe(false);
  });
});
