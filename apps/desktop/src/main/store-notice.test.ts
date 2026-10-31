import { describe, expect, it } from 'vitest';
import type { ProcessReply } from '@rotaris/contracts';
import { answerUnderHeldRefusal, cutRestoreNotice, holdOpenRefusal, IDENTIFIER_REFUSALS, identifierRefusalOf, OPEN_PROJECT_SETTINGS, STORE_REFUSALS, storeRefusalNotice, storeRefusalOf, type HeldOpenRefusal, type StoreNotice } from './store-notice.js';

/**
 * What main says about a workspace's store from the open's answer: OQ-266's one info notice for a cut restore the open
 * reversed, and REQ-SESSION-202's refusal held for the listing and raised as what was found.
 */
const refused = (code: string, detail?: string): ProcessReply => ({ kind: 'refused', code, headline: `headline of ${code}`, ...(detail === undefined ? {} : { detail }) });

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

describe('an identifier the open could not read (REQ-SESSION-197, REQ-SESSION-043, REQ-NOTIFY-044)', () => {
  // The workspace service's words (`workspace-service/identifier-refusal.ts`), as its open answers them.
  const condition = {
    code: 'workspace.identifier-unreadable',
    headline: 'The workspace identifier is present but cannot be read',
    detail: '/w/.rotaris/workspace-id exists, but this workspace cannot be opened by what it holds. Where the identifier belongs it holds "not-an-id". Nothing was written over it.',
  };
  const unreadable: ProcessReply = { kind: 'refused', ...condition };
  const opened: ProcessReply = { kind: 'workspace.opened', workspaceId: 'w', storeFile: 'f', schemaVersion: 1 };
  const recorder = () => {
    const reported: StoreNotice[] = [];
    return { reported, report: (n: StoreNotice) => { reported.push(n); return Promise.resolve(reported.length); } };
  };

  it('is its own condition, not one of the store\'s places, and is held in the service\'s own words', () => {
    expect(IDENTIFIER_REFUSALS.has('workspace.identifier-unreadable')).toBe(true);
    expect(STORE_REFUSALS.has('workspace.identifier-unreadable')).toBe(false);
    expect(identifierRefusalOf(unreadable)).toEqual(condition);
    expect(identifierRefusalOf(refused('workspace.store-missing', 'x'))).toBeUndefined();
    expect(identifierRefusalOf(opened)).toBeUndefined();
  });

  it('the open raises one persistent error notice naming the condition, with no action: nothing in the vocabulary repairs the file', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report } = recorder();
    const raised = holdOpenRefusal('/w', unreadable, held, report);
    expect(reported).toEqual([{
      severity: 'error',
      headline: 'The workspace identifier is present but cannot be read',
      detail: '/w/.rotaris/workspace-id exists, but this workspace cannot be opened by what it holds. Where the identifier belongs it holds "not-an-id". Nothing was written over it.',
    }]);
    expect(raised).toEqual(reported[0]);
    expect(reported[0]).not.toHaveProperty('action');
    expect(held.get('/w')?.held.code).toBe('workspace.identifier-unreadable');
    expect(await held.get('/w')?.noticeId).toBe(1);
  });

  it('the window\'s workspace-scoped refusals then state the condition, never "Open a workspace first" (REQ-SESSION-043)', () => {
    const held = new Map<string, HeldOpenRefusal>();
    holdOpenRefusal('/w', unreadable, held, recorder().report);
    const answer = answerUnderHeldRefusal({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' }, { workspaceId: undefined }, held.get('/w')?.held);
    expect(answer).toMatchObject({ ok: false, code: 'workspace.identifier-unreadable', headline: 'The workspace identifier is present but cannot be read' });
  });

  it('is raised once while held: a further refused open of that root keeps the first notice and takes the newer words', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report } = recorder();
    holdOpenRefusal('/w', unreadable, held, report);
    const again: ProcessReply = { kind: 'refused', ...condition, detail: 'newer words' };
    expect(holdOpenRefusal('/w', again, held, report)).toBeUndefined();
    expect(reported).toHaveLength(1);
    expect(held.get('/w')?.held.detail).toBe('newer words');
    expect(await held.get('/w')?.noticeId).toBe(1);
    // Another workspace's identifier is its own condition, raised for itself.
    holdOpenRefusal('/v', unreadable, held, report);
    expect(reported).toHaveLength(2);
  });

  it('raises again once a successful open has cleared the hold, and a store refusal still raises at every refused open', () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report } = recorder();
    holdOpenRefusal('/w', unreadable, held, report);
    held.delete('/w'); // what `openWorkspaceInner` does when an open succeeds
    holdOpenRefusal('/w', unreadable, held, report);
    expect(reported).toHaveLength(2);
    holdOpenRefusal('/s', refused('workspace.store-missing', 'x'), held, report);
    holdOpenRefusal('/s', refused('workspace.store-missing', 'x'), held, report);
    expect(reported.slice(2).map((n) => n.action)).toEqual([OPEN_PROJECT_SETTINGS, OPEN_PROJECT_SETTINGS]);
  });

  it('holds and raises nothing for a refusal that is neither — a restore under way, a failed request — nor for an open that succeeded', () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report } = recorder();
    for (const reply of [refused('workspace.restore-in-flight', 'x'), refused('request.failed'), opened]) expect(holdOpenRefusal('/w', reply, held, report)).toBeUndefined();
    expect(reported).toEqual([]);
    expect(held.size).toBe(0);
  });
});
