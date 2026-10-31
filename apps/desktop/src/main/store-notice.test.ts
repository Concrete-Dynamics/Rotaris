import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProcessReply } from '@rotaris/contracts';
import { answerUnderHeldRefusal, cutRestoreNotice, holdOpenRefusal, OPEN_PROJECT_SETTINGS, storeRefusalNotice, storeRefusalOf, type HeldOpenRefusal, type StoreNotice } from './store-notice.js';

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

describe('an identifier the open could not read, and a path that is not a folder (REQ-SESSION-197, REQ-SESSION-043, REQ-NOTIFY-044)', () => {
  // The workspace service's words (`workspace-service/identifier-refusal.ts`, `not-a-folder.ts`), as its open answers them.
  const condition = {
    code: 'workspace.identifier-unreadable',
    headline: 'The workspace identifier is present but cannot be read',
    detail: '/w/.rotaris/workspace-id exists, but this workspace cannot be opened by what it holds. Where the identifier belongs it holds "not-an-id". Nothing was written over it.',
  };
  const unreadable: ProcessReply = { kind: 'refused', ...condition };
  const notAFolder: ProcessReply = { kind: 'refused', code: 'workspace.not-a-folder', headline: 'This workspace is a file, not a folder', detail: '/w is a file, so it cannot be opened as a workspace. Nothing was read from it or written to it. Open a folder instead.' };
  const missing = refused('workspace.store-missing', 'x');
  /** `report` answers ids 1, 2, …; `dismiss` records what was withdrawn. */
  const ports = () => {
    const reported: StoreNotice[] = [];
    const dismissed: number[] = [];
    return { reported, dismissed, report: (n: StoreNotice) => { reported.push(n); return Promise.resolve(reported.length); }, dismiss: (id: number) => { dismissed.push(id); } };
  };
  const settled = () => new Promise((r) => setTimeout(r, 0));

  it('the open raises one persistent error notice naming the condition, with no action: nothing in the vocabulary repairs the file', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report, dismiss } = ports();
    const raised = holdOpenRefusal('/w', unreadable, held, report, dismiss);
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

  it('a path that is not a folder is held and raised in the same way, in its own words and with no action', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, report, dismiss } = ports();
    holdOpenRefusal('/w', notAFolder, held, report, dismiss);
    expect(reported).toEqual([{ severity: 'error', headline: 'This workspace is a file, not a folder', detail: '/w is a file, so it cannot be opened as a workspace. Nothing was read from it or written to it. Open a folder instead.' }]);
    expect(holdOpenRefusal('/w', notAFolder, held, report, dismiss)).toBeUndefined();
    expect(reported).toHaveLength(1);
    const answer = answerUnderHeldRefusal({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' }, { workspaceId: undefined }, held.get('/w')?.held);
    expect(answer).toMatchObject({ ok: false, code: 'workspace.not-a-folder', headline: 'This workspace is a file, not a folder' });
  });

  it('the window\'s workspace-scoped refusals then state the condition, never "Open a workspace first" (REQ-SESSION-043)', () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { report, dismiss } = ports();
    holdOpenRefusal('/w', unreadable, held, report, dismiss);
    const answer = answerUnderHeldRefusal({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' }, { workspaceId: undefined }, held.get('/w')?.held);
    expect(answer).toMatchObject({ ok: false, code: 'workspace.identifier-unreadable', headline: 'The workspace identifier is present but cannot be read' });
  });

  it('is raised once while held: a further refused open of that root keeps the first notice, withdraws nothing, and takes the newer words', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, dismissed, report, dismiss } = ports();
    holdOpenRefusal('/w', unreadable, held, report, dismiss);
    const again: ProcessReply = { kind: 'refused', ...condition, detail: 'newer words' };
    expect(holdOpenRefusal('/w', again, held, report, dismiss)).toBeUndefined();
    await settled();
    expect(reported).toHaveLength(1);
    expect(dismissed).toEqual([]);
    expect(held.get('/w')?.held.detail).toBe('newer words');
    expect(await held.get('/w')?.noticeId).toBe(1);
    // Another workspace's identifier is its own condition, raised for itself.
    holdOpenRefusal('/v', unreadable, held, report, dismiss);
    expect(reported).toHaveLength(2);
  });

  it('a hold replaced by another condition for the root withdraws the notice it held, in either order — none is left unreachable', async () => {
    for (const [first, second] of [[unreadable, missing], [missing, unreadable], [notAFolder, unreadable]] as const) {
      const held = new Map<string, HeldOpenRefusal>();
      const { reported, dismissed, report, dismiss } = ports();
      holdOpenRefusal('/w', first, held, report, dismiss);
      holdOpenRefusal('/w', second, held, report, dismiss);
      await settled();
      expect(reported).toHaveLength(2);
      expect(dismissed).toEqual([1]);
      expect(held.get('/w')?.held.code).toBe(second.kind === 'refused' ? second.code : '');
      expect(await held.get('/w')?.noticeId).toBe(2);
    }
  });

  it('a store refusal still raises at every refused open, and the notice it raised before is withdrawn as the new one stands', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, dismissed, report, dismiss } = ports();
    holdOpenRefusal('/s', missing, held, report, dismiss);
    holdOpenRefusal('/s', missing, held, report, dismiss);
    await settled();
    expect(reported.map((n) => n.action)).toEqual([OPEN_PROJECT_SETTINGS, OPEN_PROJECT_SETTINGS]);
    expect(dismissed).toEqual([1]);
  });

  it('raises again once a successful open has cleared the hold, and withdraws nothing for it — that open already did', async () => {
    const held = new Map<string, HeldOpenRefusal>();
    const { reported, dismissed, report, dismiss } = ports();
    holdOpenRefusal('/w', unreadable, held, report, dismiss);
    held.delete('/w'); // what `openWorkspaceInner` does when an open succeeds, withdrawing the notice itself
    holdOpenRefusal('/w', unreadable, held, report, dismiss);
    await settled();
    expect(reported).toHaveLength(2);
    expect(dismissed).toEqual([]);
  });

  it('main\'s open passes every refused answer through holdOpenRefusal, raising through the notice store and withdrawing through it', () => {
    // `index.ts` is a composition root over Electron and cannot be run in a test, so the wiring is read from its source, with
    // every run of whitespace folded to one space so a re-wrap keeps it green and a change of what is called turns it red.
    const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8').replace(/\s+/g, ' ');
    const start = source.indexOf("const opened = await svc.link.request({ kind: 'workspace.open', workspaceRoot: key }");
    expect(start).toBeGreaterThan(-1);
    const refusedBranch = source.slice(start, source.indexOf('return undefined; }', start));
    expect(refusedBranch).toContain("if (opened.kind !== 'workspace.opened') {");
    expect(refusedBranch).toMatch(/holdOpenRefusal\(key, opened, storeRefusals, \(n\) => notices\.report\(\{ severity: n\.severity, title: n\.headline, [^]*?\.then\(\(r\) => r\.id\)\.catch\(\(\) => null\), \(id\) => notices\.dismiss\(id\)\);/);
    // The one place a refusal is held: nothing else in main writes the map.
    expect(source.match(/storeRefusals\.set\(/g)).toBeNull();
    expect(source.match(/holdOpenRefusal\(/g)).toHaveLength(1);
  });
});
