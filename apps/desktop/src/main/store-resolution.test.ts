import { describe, expect, it } from 'vitest';
import type { ProcessReply, RestoreAssessment, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import { establishBox, establishFlow, restoreFlow, type BoxOptions, type FlowWindow, type StoreFlowDeps } from './store-resolution.js';
import type { StoreRefusal } from './store-notice.js';

/**
 * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202 / REQ-SESSION-201: main's restore and "Start a new session store"
 * while the window's open holds `workspace.store-missing`. Every service request, run-host request, question and notice is
 * recorded, so what is asked before anything changes — and what is never sent — is pinned.
 */
const ROOT = '/work/a';
const MISSING: StoreRefusal = { code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept', detail: 'The place … exists and the store is not in it.' };
const DISPLACED: StoreRefusal = { code: 'workspace.store-displaced', headline: 'A restore of this workspace did not finish, and its store could not be put back' };

const assessment = (target: Partial<RestoreAssessment['target']> = {}): RestoreAssessment => ({
  artifact: { workspaceId: 'v1-aaaa', takenAtUtc: '2026-10-14T00:00:00.000Z', sessions: 2, rows: 4, locks: 0, storeUserVersion: 35, lastSeenWorkspacePath: ROOT },
  identifier: { case: 'same', current: 'v1-aaaa' },
  target: { exists: false, placeEmpty: true, sessions: 0, foreignLocks: [], liveLocks: [], ...target },
  refusal: null,
});

function harness(opts: { held?: StoreRefusal; answers?: number[]; replies?: Partial<Record<WorkspaceServiceRequest['kind'], ProcessReply>> } = {}) {
  const sent: WorkspaceServiceRequest[] = [];
  const runHostSent: RunHostRequest[] = [];
  const boxes: BoxOptions[] = [];
  const notices: { severity: string; headline: string; detail?: string }[] = [];
  const reopened: string[] = [];
  const answers = [...(opts.answers ?? [])];
  const replies: Partial<Record<WorkspaceServiceRequest['kind'], ProcessReply>> = {
    'workspace.restore.assess': { kind: 'workspace.restore.assessment', assessment: assessment() },
    'workspace.restore.perform': { kind: 'workspace.restored', report: { ok: true, abandoned: false, leftovers: [], steps: ['9-install'], restoredInto: 'v1-aaaa', identifierEstablished: false, displaced: '/data/workspaces/v1-aaaa.displaced-2026-10-14T06-00-00-000Z' } },
    'workspace.store.establish.assess': { kind: 'workspace.store.establishable', place: '/data/workspaces/v1-aaaa', kept: '/data/workspaces/v1-aaaa.displaced-S', stamp: 'S' },
    'workspace.store.establish.perform': { kind: 'workspace.store.established', place: '/data/workspaces/v1-aaaa', kept: '/data/workspaces/v1-aaaa.displaced-S' },
    ...opts.replies,
  };
  const deps: StoreFlowDeps<FlowWindow> = {
    canonicalPath: (p) => p,
    service: () => ({ request: async (req) => { sent.push(req); return replies[req.kind] ?? { kind: 'refused', code: 'unexpected', headline: req.kind }; } }),
    runHost: { request: async (req) => { runHostSent.push(req); return { kind: 'runs.count', workspaceId: 'v1-aaaa', count: 0 }; } },
    heldRefusal: (root) => (root === ROOT ? opts.held : undefined),
    chooseArtifact: async () => '/backups/a.tar',
    ask: async (_w, box) => { boxes.push(box); return answers.shift() ?? box.cancelId; },
    raiseNotice: (severity, headline, detail) => { notices.push({ severity, headline, ...(detail === undefined ? {} : { detail }) }); },
    reopen: async (root) => { reopened.push(root); },
  };
  return { deps, sent, runHostSent, boxes, notices, reopened };
}
const refused: FlowWindow = { workspace: ROOT, workspaceId: undefined };
const open: FlowWindow = { workspace: ROOT, workspaceId: 'v1-aaaa' };

describe('the restore while the open holds a place with no store (OQ-281)', () => {
  it('is admitted with no workspace identifier, skips the active-run gate, says what was found, and completes the window\'s open', async () => {
    const h = harness({ held: MISSING, answers: [1] });
    const r = await restoreFlow(refused, h.deps);
    expect(r).toEqual({ ok: true, value: { restoredInto: 'v1-aaaa', identifierEstablished: false } });
    expect(h.runHostSent).toEqual([]);
    expect(h.boxes[0]).toMatchObject({ title: 'Restore the session store', defaultId: 0, cancelId: 0, buttons: ['Cancel', 'Restore'] });
    expect(h.boxes[0]!.detail).toBe('The place for this workspace\'s session store exists and the store is not in it. Restoring moves what is in that place aside, keeps it, and puts the backup\'s 2 sessions there.');
    expect(h.sent.map((q) => q.kind)).toEqual(['workspace.restore.assess', 'workspace.restore.perform']);
    expect(h.reopened).toEqual([ROOT]);
    expect(h.notices).toEqual([{ severity: 'info', headline: 'Restored 2 sessions from the backup taken on 2026-10-14T00:00:00.000Z. What was in the place for this workspace\'s session store was kept at /data/workspaces/v1-aaaa.displaced-2026-10-14T06-00-00-000Z.' }]);
  });

  it('Cancel is the default: an unanswered first question performs nothing', async () => {
    const h = harness({ held: MISSING });
    expect(await restoreFlow(refused, h.deps)).toEqual({ ok: true, value: { cancelled: true } });
    expect(h.sent.map((q) => q.kind)).toEqual(['workspace.restore.assess']);
    expect(h.reopened).toEqual([]);
  });

  it('a window with no identifier and no held refusal, or one holding the displaced store OQ-266 left, is still refused as no workspace', async () => {
    for (const held of [undefined, DISPLACED]) {
      const h = harness({ ...(held ? { held } : {}), answers: [1] });
      expect(await restoreFlow(refused, h.deps)).toMatchObject({ ok: false, code: 'workspace.none' });
      expect(h.sent).toEqual([]);
    }
  });

  it('(counterfactual) an open workspace still meets the active-run gate, and its first question names the store it replaces', async () => {
    const h = harness({ answers: [1], replies: { 'workspace.restore.assess': { kind: 'workspace.restore.assessment', assessment: assessment({ exists: true, placeEmpty: false, sessions: 1 }) } } });
    await restoreFlow(open, h.deps);
    expect(h.runHostSent).toEqual([{ kind: 'runs.active', workspaceId: 'v1-aaaa' }]);
    expect(h.boxes[0]!.detail).toMatch(/^The store this backup restores into currently holds 1 session\./);
    expect(h.notices[0]!.headline).toContain('The previous store was kept at');
  });
});

describe('"Start a new session store" (OQ-281, REQ-SESSION-202)', () => {
  it('asks first in the ruling\'s words, with Cancel the default and the cancel', () => {
    expect(establishBox('/data/workspaces/v1-aaaa', '/data/workspaces/v1-aaaa.displaced-S')).toEqual({
      type: 'warning', title: 'Start a new session store',
      message: 'The place for this workspace\'s session store exists (/data/workspaces/v1-aaaa) and the store is not in it.',
      detail: 'Starting a new store recovers nothing that may have been there. If this workspace\'s sessions were moved or copied elsewhere, put them back or restore a backup instead. What is in that place now is moved aside to /data/workspaces/v1-aaaa.displaced-S and kept.',
      buttons: ['Cancel', 'Start a new store'], defaultId: 0, cancelId: 0, noLink: true,
    });
  });

  it('a dismissed or cancelled question changes nothing: the perform is never sent', async () => {
    for (const answers of [[], [0]]) {
      const h = harness({ held: MISSING, answers });
      expect(await establishFlow(refused, h.deps)).toEqual({ ok: true, value: { cancelled: true } });
      expect(h.sent.map((q) => q.kind)).toEqual(['workspace.store.establish.assess']);
      expect(h.reopened).toEqual([]);
    }
  });

  it('confirmed: performed under the assessed stamp, the window\'s open completed, and an info notice names the kept place', async () => {
    const h = harness({ held: MISSING, answers: [1] });
    expect(await establishFlow(refused, h.deps)).toEqual({ ok: true, value: { kept: '/data/workspaces/v1-aaaa.displaced-S' } });
    expect(h.sent).toEqual([{ kind: 'workspace.store.establish.assess', workspaceRoot: ROOT }, { kind: 'workspace.store.establish.perform', workspaceRoot: ROOT, stamp: 'S' }]);
    expect(h.reopened).toEqual([ROOT]);
    expect(h.notices).toEqual([{ severity: 'info', headline: 'A new session store was started', detail: 'What was in the place for this workspace\'s session store was moved aside and kept at /data/workspaces/v1-aaaa.displaced-S. The new store holds no sessions.' }]);
  });

  it('the service\'s re-check refusing at the perform is said, and the window is not reopened', async () => {
    const h = harness({ held: MISSING, answers: [1], replies: { 'workspace.store.establish.perform': { kind: 'refused', code: 'workspace.store-store-present', headline: 'A new session store was not started', detail: 'The session store is in its place again' } } });
    expect(await establishFlow(refused, h.deps)).toMatchObject({ ok: false, code: 'workspace.store-store-present' });
    expect(h.reopened).toEqual([]);
    expect(h.notices).toEqual([{ severity: 'error', headline: 'A new session store was not started', detail: 'A new session store was not started: The session store is in its place again' }]);
  });

  it('is refused without a question where the condition is not held: an open workspace, a displaced store, no refusal at all', async () => {
    for (const [w, held] of [[open, MISSING], [refused, DISPLACED], [refused, undefined]] as const) {
      const h = harness({ ...(held ? { held } : {}), answers: [1] });
      expect(await establishFlow(w, h.deps)).toMatchObject({ ok: false, code: 'workspace.store-not-missing' });
      expect(h.sent).toEqual([]);
      expect(h.boxes).toEqual([]);
    }
  });
});
