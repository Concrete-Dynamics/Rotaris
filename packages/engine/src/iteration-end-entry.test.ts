import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { SessionWriter } from './index.js';

/**
 * REQ-ORCH-139 with REQ-SESSION-115: an iteration's `iteration_end` timeline entry commits in the transaction that closes the
 * iteration (fin34). It was appended in a write of its own after the close, so a death between the two left a closed
 * iteration with no entry, missing from the follow-up's "last 5 outer-loop iterations".
 */
const HOST = mintMachineId('0000000000000000000000000000000e') as MachineId;
const ENTRY = { message: 'Iteration 1 (first): succeeded', metadata: { iteration: 1, outcome: 'succeeded' } };

describe('the iteration_end entry closes with its iteration (REQ-ORCH-139, REQ-SESSION-115, PD-ORCH-005)', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iteration-end-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function writer() {
    const sessionId = asSessionId('S-iteration-end');
    const created = SessionWriter.create({ dal, sessionId, wall: new FakeClock(), retentionCap: 20_000, warn: () => {}, onCommitted: () => {} }, { workspaceRoot: '/ws', pid: 4242, host: HOST });
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const w = created.value;
    expect(w.openIteration({ iteration: 1, root_task_id: 't1', root_canonical_name: 'root', root_persona: 'orchestrator', todo_task_id: 'a', task: 'first' })).toEqual({ ok: true, value: true });
    return { w, sessionId };
  }

  it('the close and the entry commit together', () => {
    const { w, sessionId } = writer();
    expect(w.endIteration(1, { task: 'first', outcome: 'succeeded', summary: '' }, 'succeeded', undefined, ENTRY).ok).toBe(true);
    expect(dal.iterationsOf(sessionId).map((r) => [r.iteration, r.state])).toEqual([[1, 'closed']]);
    expect(dal.timelineOf(sessionId).filter((e) => e.name === 'iteration_end').map((e) => e.message)).toEqual([ENTRY.message]);
  });

  it('an entry that cannot be written leaves the iteration open: never a closed iteration with no entry', () => {
    const { w, sessionId } = writer();
    const insert = dal.insertTimeline.bind(dal);
    dal.insertTimeline = (...args: Parameters<StoreDal['insertTimeline']>) => { if (args[3] === 'iteration_end') throw new Error('the disk is full'); insert(...args); };
    expect(w.endIteration(1, { task: 'first', outcome: 'succeeded', summary: '' }, 'succeeded', undefined, ENTRY).ok).toBe(false);
    expect(dal.iterationsOf(sessionId).map((r) => [r.iteration, r.state])).toEqual([[1, 'open']]);
    expect(dal.timelineOf(sessionId).filter((e) => e.name === 'iteration_end')).toEqual([]);
  });
});
