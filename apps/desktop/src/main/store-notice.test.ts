import { describe, expect, it } from 'vitest';
import type { ProcessReply } from '@rotaris/contracts';
import { cutRestoreNotice, storeRefusalNotice, storeRefusalOf } from './store-notice.js';

/**
 * What main says about a workspace's store from the open's answer: OQ-266's one info notice for a cut restore the open
 * reversed, and REQ-SESSION-202's refusal held for the listing and raised as what was found.
 */
describe('the cut-restore notice (OQ-266, ruled 2026-10-13 under R-072)', () => {
  const cut = { reversed: '/data/workspaces/v1-x.displaced-2026-10-14T00-00-00-000Z', hadStore: true, staging: '/data/workspaces/v1-x.restoring-1', stamp: '2026-10-14T00-00-00-000Z' };

  it('names the stamp, the sessions put back, that nothing from the backup was applied, the way to apply it and the kept copy', () => {
    expect(cutRestoreNotice(cut)).toEqual({
      severity: 'info',
      headline: 'The restore begun at 2026-10-14T00-00-00-000Z did not finish',
      detail: 'The sessions this workspace had here were put back, and nothing from the backup was applied. Restore again from Settings to apply it. The prepared copy is kept at /data/workspaces/v1-x.restoring-1.',
    });
  });

  it('names no kept copy when the open did not find it there (a copy deleted by hand after the cut)', () => {
    expect(cutRestoreNotice({ ...cut, staging: null }).detail).toBe(
      'The sessions this workspace had here were put back, and nothing from the backup was applied. Restore again from Settings to apply it.',
    );
  });

  it('says the workspace had none here where there was no store before it', () => {
    const n = cutRestoreNotice({ ...cut, reversed: null, hadStore: false });
    expect(n.detail).toMatch(/^This workspace had no sessions here before it, and nothing from the backup was applied\./);
    expect(n.detail).not.toContain('put back');
  });
});

describe('a store the open refused (REQ-SESSION-202, W-31, OQ-266)', () => {
  const refused = (code: string, detail?: string): ProcessReply => ({ kind: 'refused', code, headline: `headline of ${code}`, ...(detail === undefined ? {} : { detail }) });

  it('a place holding no store, and a cut restore whose store could not be put back, are held and raised as errors in the service\'s own words', () => {
    for (const code of ['workspace.store-missing', 'workspace.store-displaced']) {
      const held = storeRefusalOf(refused(code, 'what was found'));
      expect(held).toEqual({ code, headline: `headline of ${code}`, detail: 'what was found' });
      expect(storeRefusalNotice(held!)).toMatchObject({ severity: 'error', headline: `headline of ${code}`, detail: 'what was found' });
    }
  });

  it('OQ-281: the place holding no store opens Settings at Project, where it is resolved; the displaced store, resolved by a rename, carries no action', () => {
    expect(storeRefusalNotice(storeRefusalOf(refused('workspace.store-missing', 'x'))!).action).toEqual({ label: 'Open Project settings', action: { kind: 'open-settings', category: 'project' } });
    expect(storeRefusalNotice(storeRefusalOf(refused('workspace.store-displaced', 'x'))!).action).toBeUndefined();
  });

  it('a restore under way, any other refusal and an open that succeeded hold nothing', () => {
    expect(storeRefusalOf(refused('workspace.restore-in-flight', 'x'))).toBeUndefined();
    expect(storeRefusalOf(refused('workspace.identifier-unreadable'))).toBeUndefined();
    expect(storeRefusalOf({ kind: 'workspace.opened', workspaceId: 'w', storeFile: 'f', schemaVersion: 1 })).toBeUndefined();
  });
});
