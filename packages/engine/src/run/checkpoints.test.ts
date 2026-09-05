import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, SessionWriter, type CheckpointCaptureInput, type CheckpointPort, type HookPort, type Publisher } from '../index.js';

/**
 * ADR-0039's engine half, first execution: the run's ONE call per iteration close (REQ-GIT-051) — after
 * `iteration.end` is recorded and before the hooks' `iteration_end`, awaited before the next iteration and before
 * the terminal transaction — and the writer's two units: `recordCheckpoint` (one transaction: the row, the trim,
 * the timeline entry, the event; the event observable only on `publish()`, REQ-GIT-048) and `recordRestore`
 * (REQ-GIT-062/068/155).
 */
const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

describe('engine/run — the checkpoint port at iteration close (ADR-0039, REQ-GIT-045/051)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-ckpt-run-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  let minted = 0;
  function sessionsWith(calls: ScriptedCall[], port: CheckpointPort | null, hooks: HookPort | null = null) {
    const client = new ScriptedModelClient(calls);
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `C${++minted}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      attended: () => true, runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(port ? { checkpoints: () => port } : {}), ...(hooks ? { hooks: () => hooks } : {}),
    });
    return { sessions, client };
  }

  it('captures exactly once per iteration that closes, after iteration.end and before the hooks\' iteration_end, with the iteration number and no credited child', async () => {
    const order: string[] = [];
    const captures: CheckpointCaptureInput[] = [];
    const port: CheckpointPort = { enabled: true, capture: async (input) => { captures.push(input); order.push(`capture:${input.iteration}`); return { outcome: 'recorded', sequence: input.iteration, files: 1, invocations: 11, elapsedMs: 5 }; } };
    const hooks: HookPort = {
      auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
      fireLifecycle: async (event) => { order.push(`hook:${event}`); return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
    };
    const { sessions } = sessionsWith([answer('done')], port, hooks);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(captures).toEqual([{ iteration: 1, childName: '' }]);
    expect(order).toEqual(['hook:session_start', 'capture:1', 'hook:iteration_end', 'hook:session_end']);
    // A run that closes no iteration yields no checkpoint: a port that is not enabled is never called.
    const never: CheckpointPort = { enabled: false, capture: async () => { throw new Error('must not be called'); } };
    const { sessions: s2 } = sessionsWith([answer('again')], never);
    const sid2 = (s2.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await s2.running(sid2)!).status).toBe('completed');
  });

  it('REQ-GIT-045: a port that fails or raises never aborts the run; the failure is a warning', async () => {
    const raising: CheckpointPort = { enabled: true, capture: async () => { throw new Error('boom'); } };
    const { sessions } = sessionsWith([answer('done')], raising);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(warnings.some((w) => /checkpoint port raised after iteration 1: Error: boom/.test(w))).toBe(true);
    const failing: CheckpointPort = { enabled: true, capture: async () => ({ outcome: 'failed', detail: 'Git declined' }) };
    const { sessions: s2 } = sessionsWith([answer('done')], failing);
    const sid2 = (s2.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    expect((await s2.running(sid2)!).status).toBe('completed');
    expect(warnings.some((w) => /checkpoint after iteration 1 was not recorded: Git declined/.test(w))).toBe(true);
  });
});

describe('engine/session-writer — recordCheckpoint and recordRestore (ADR-0039, REQ-GIT-048/049/062/067/068/155)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-ckpt-writer-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  it('one transaction: the row, the trim to keep, the timeline entry, the event; the event reaches the bus only on publish()', () => {
    const sid = asSessionId('W1');
    const committed: string[] = [];
    const created = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => { for (const e of c.events ?? []) committed.push(e.event.event); } }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST, task: 't' });
    if (!created.ok) throw new Error('create');
    const w = created.value;
    for (let n = 1; n <= 3; n += 1) {
      const r = w.recordCheckpoint({ sequence: n, ref: `refs/rotaris/checkpoints/W1/${n}`, commit: `c${n}`, iteration: n, childName: n === 2 ? 'helper' : '', files: ['a.txt', 'b.txt'], kind: 'iteration' }, 2);
      if (!r.ok) throw new Error(r.error.code);
      // REQ-GIT-049: the third insert trims the first; the trimmed row comes back for its ref, after the commit.
      expect(r.value.trimmed.map((t) => [t.sequence, t.commit_id])).toEqual(n === 3 ? [[1, 'c1']] : []);
      expect(committed.filter((e) => e === 'checkpoint.created')).toHaveLength(n - 1);
      r.value.publish();
      r.value.publish();
      expect(committed.filter((e) => e === 'checkpoint.created')).toHaveLength(n);
    }
    expect(dal.listCheckpoints(sid).map((c) => c.sequence)).toEqual([2, 3]);
    expect(dal.checkpointCount(sid)).toBe(2);
    // REQ-GIT-048: the timeline entry's fixed actor, message and metadata.
    const t = dal.timelineOf(sid).filter((e) => e.name === 'checkpoint_created');
    expect(t).toHaveLength(3);
    expect(t[1]).toMatchObject({ actor: 'checkpoints', message: 'Recorded checkpoint 2 over 2 file(s).' });
    expect(JSON.parse(t[1]!.metadata)).toEqual({ sequence: 2, ref: 'refs/rotaris/checkpoints/W1/2', commit: 'c2', iteration: 2, child_name: 'helper', kind: 'iteration', file_count: 2 });
    // REQ-GIT-067: exactly the five fields beside the envelope; changed_paths is a count.
    const ev = JSON.parse(dal.eventsOfKind(sid, 'checkpoint.created')[1]!.payload) as Record<string, unknown>;
    expect(Object.keys(ev).sort()).toEqual(['changed_paths', 'event', 'iteration', 'kind', 'ref', 'schema_version', 'sequence', 'session_id', 'timestamp']);
    expect(ev).toMatchObject({ sequence: 2, ref: 'refs/rotaris/checkpoints/W1/2', kind: 'iteration', iteration: 2, changed_paths: 2 });
    // REQ-GIT-046: a duplicate sequence is refused by the store, not silently overwritten; the writer reports it.
    const dup = w.recordCheckpoint({ sequence: 3, ref: 'r', commit: 'c', iteration: 9, childName: '', files: [], kind: 'iteration' }, 50);
    expect(dup.ok).toBe(false);
  });

  it('a restore attempt: success writes last_restored_sequence and the timeline entry; a refusal writes the warning issue; one event each', () => {
    const sid = asSessionId('W2');
    const committed: string[] = [];
    const created = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => { for (const e of c.events ?? []) committed.push(e.event.event); } }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST, task: 't' });
    if (!created.ok) throw new Error('create');
    const w = created.value;
    const refused = w.recordRestore({ sequence: 4, restored: false, safetySequence: null, changedPaths: 0, blockedReason: 'No checkpoint 4 is recorded for session W2.', forced: false, treeRoot: 'C:/ws', dirtyPaths: [], ref: null, commit: null });
    expect(refused.ok && refused.value.issueId).toMatch(/^[0-9a-f]{12}$/);
    expect(dal.getSession(sid)!.last_restored_sequence).toBeNull();
    const issue = dal.issuesOf(sid)[0]!;
    expect(issue).toMatchObject({ kind: 'checkpoint_restore', severity: 'warning', actor: 'checkpoints', message: 'Restore of checkpoint 4 did not run: No checkpoint 4 is recorded for session W2.' });
    expect(JSON.parse(issue.metadata)).toEqual({ dirty_paths: [], safety_sequence: null, tree_root: 'C:/ws' });
    const ok = w.recordRestore({ sequence: 2, restored: true, safetySequence: 5, changedPaths: 3, blockedReason: '', forced: true, treeRoot: 'C:/ws', dirtyPaths: ['a', 'b'], ref: 'refs/rotaris/checkpoints/W2/2', commit: 'c2' });
    expect(ok.ok).toBe(true);
    expect(dal.getSession(sid)!.last_restored_sequence).toBe(2);
    const t = dal.timelineOf(sid).find((e) => e.name === 'checkpoint_restored')!;
    expect(t).toMatchObject({ actor: 'checkpoints', message: 'Restored the working tree to checkpoint 2 over 3 file(s).' });
    expect(JSON.parse(t.metadata)).toEqual({ sequence: 2, ref: 'refs/rotaris/checkpoints/W2/2', commit: 'c2', safety_sequence: 5, changed_files: 3, dirty_paths: 2, forced: true, tree_root: 'C:/ws' });
    const events = dal.eventsOfKind(sid, 'checkpoint.restored').map((e) => JSON.parse(e.payload) as Record<string, unknown>);
    expect(events).toHaveLength(2);
    expect(Object.keys(events[0]!).sort()).toEqual(['blocked_reason', 'changed_paths', 'event', 'restored', 'safety_sequence', 'schema_version', 'sequence', 'session_id', 'timestamp']);
    expect(events[0]).toMatchObject({ sequence: 4, restored: false, safety_sequence: null, changed_paths: 0, blocked_reason: 'No checkpoint 4 is recorded for session W2.' });
    expect(events[1]).toMatchObject({ sequence: 2, restored: true, safety_sequence: 5, changed_paths: 3, blocked_reason: '' });
    expect(committed.filter((e) => e === 'checkpoint.restored')).toHaveLength(2);
  });
});
