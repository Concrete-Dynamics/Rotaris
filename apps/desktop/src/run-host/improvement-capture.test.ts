import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessReply } from '@rotaris/contracts';
import { captureImprovementJob } from '@rotaris/engine';
import { asSessionId, mintWorkspaceId } from '@rotaris/kernel';
import { forgetSpelling, openWorkspaceStore, StoreDal } from '@rotaris/store';
import { captureAfterRun, dalWhileOpen, type CaptureAfterRunInput, type HostStoreSlot } from './improvement-capture.js';

/**
 * Defect `an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled` (R-067): the run host's
 * post-run capture awaited main's history and then read a store the quit had closed in the meantime. The outcome the
 * specification names — no job (REQ-ORCH-137, REQ-LIBRARY-032) — was reached by a throw nothing caught.
 */
describe('the post-run improvement capture racing a closed store (REQ-ORCH-137, REQ-LIBRARY-032)', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) { forgetSpelling(d); rmSync(d, { recursive: true, force: true }); } });

  function seeded(): StoreDal {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-capture-race-'));
    dirs.push(root);
    const opened = openWorkspaceStore(root, mintWorkspaceId('000000000000000000000000000000ab'), 'C:\\workspace');
    const dal = new StoreDal(opened.db);
    dal.upsertSession({ session_id: 'session-1', workspace_root: 'C:\\workspace', execution_status: 'completed', created_at: '2026-09-29T09:00:00.000Z', updated_at: '2026-09-29T10:00:00.000Z', run_type: 'task_run' });
    dal.updateSessionRun(asSessionId('session-1'), { stop_reason: 'completed' });
    return dal;
  }
  const input: CaptureAfterRunInput = { workspaceId: 'ws', workspaceRoot: 'C:\\workspace', sessionId: 'session-1', generatedAt: '2026-09-29T10:00:00.000Z', timeoutSeconds: 60, collectorModel: 'medium' };
  const emptyHistory: ProcessReply = { kind: 'improvements.result', value: [] };

  it('the first form: capturing on a store the await let close throws, which is what rejected unhandled', async () => {
    const dal = seeded();
    // The inline closure's order: the store located, main asked, the quit closing the store while the ask is in flight.
    await Promise.resolve().then(() => dal.db.close());
    expect(() => captureImprovementJob(dal, { ...input, priorArtifacts: [] })).toThrow(/not open/);
  });

  it('a run the quit ended (`application_shutdown`) yields no job before main is asked or the store is read', async () => {
    const asked: string[] = [];
    const job = await captureAfterRun({
      stopReason: 'application_shutdown', input,
      history: async () => { asked.push('history'); return emptyHistory; },
      currentDal: () => { asked.push('store'); return null; },
      log: () => undefined,
    });
    expect(job).toBeNull();
    expect(asked).toEqual([]);
  });

  it('a store the quit closed while the history was asked yields no job, resolves, and never rejects', async () => {
    const dal = seeded();
    const logged: Array<[string, string]> = [];
    const job = await captureAfterRun({
      stopReason: 'completed', input,
      history: async () => { dal.db.close(); return emptyHistory; },
      currentDal: () => dal,
      log: (m, level) => { logged.push([level, m]); },
    });
    expect(job).toBeNull();
    expect(logged).toEqual([['info', expect.stringMatching(/store closed before its record could be read/)]]);
  });

  it('a store the host has let go of (closed for a restore, or the workspace closed) yields no job', async () => {
    const job = await captureAfterRun({ stopReason: 'completed', input, history: async () => emptyHistory, currentDal: () => null, log: () => undefined });
    expect(job).toBeNull();
  });

  it('any other throw from the capture is logged as a warning and yields no job rather than an error', async () => {
    const dal = seeded();
    const logged: Array<[string, string]> = [];
    const job = await captureAfterRun({
      stopReason: 'completed', input, history: async () => emptyHistory, currentDal: () => dal,
      log: (m, level) => { logged.push([level, m]); },
      capture: () => { throw new Error('boom'); },
    });
    expect(job).toBeNull();
    expect(logged).toEqual([['warn', expect.stringMatching(/capture failed for session-1, no job: boom/)]]);
    dal.db.close();
  });

  it('an open store still yields the job, and a rejected history ask reads as history unavailable', async () => {
    const dal = seeded();
    const logged: Array<[string, string]> = [];
    const job = await captureAfterRun({
      stopReason: 'completed', input, history: () => Promise.reject(new Error('main did not answer')), currentDal: () => dal,
      log: (m, level) => { logged.push([level, m]); },
    });
    expect(job).toMatchObject({ source_session_id: 'session-1', prior_artifacts_available: false, prior_artifacts: [] });
    expect(logged).toEqual([['warn', expect.stringMatching(/history capture failed for session-1: main did not answer/)]]);
    dal.db.close();
  });

  it("host.ts's store check: the located slot's DAL only while the host holds that same slot and its handle is open", () => {
    const dal = seeded();
    const located: HostStoreSlot = { db: dal.db, dal };
    expect(dalWhileOpen(located, located)).toBe(dal);
    // The workspace closed: the host's map no longer holds a slot for it.
    expect(dalWhileOpen(undefined, located)).toBeNull();
    // A restore reopened the store: the map holds a new slot, even one over the same handle.
    expect(dalWhileOpen({ db: dal.db, dal }, located)).toBeNull();
    // The host let go of the handle but kept the slot.
    const dropped: HostStoreSlot = { db: null, dal };
    expect(dalWhileOpen(dropped, dropped)).toBeNull();
    // The quit closed the handle while the history was asked.
    dal.db.close();
    expect(dalWhileOpen(located, located)).toBeNull();
  });
});
