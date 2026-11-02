import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintWorkspaceId } from '@rotaris/kernel';
import { walCheckpointBeforeClose, walCheckpoint, forgetSpelling, IDLE_WAL_CHECKPOINT_MS, IdleWalCheckpoint, openStore, openWorkspaceStore, StoreDal, type ResolvedStore, type StoreHandle } from './index.js';

/**
 * Hardening C1 (SQLite's "Checkpoint Starvation"): the workspace service's idle PASSIVE checkpoint and its bounded TRUNCATE
 * on an orderly close, measured on the two-connection shape the product runs — the service's connection beside the run
 * host's (`openStore` with no options, as `run-host/dispatch.ts` opens it).
 */
const id = mintWorkspaceId('000000000000000000000000000000c8');
let root: string;
let service: ResolvedStore;
let runHost: StoreHandle;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-checkpoint-'));
  service = openWorkspaceStore(root, id, root);
  runHost = openStore(service.file);
});
afterEach(() => {
  try { runHost.close(); } catch { /* closed by the case */ }
  try { service.db.close(); } catch { /* closed by the case */ }
  forgetSpelling(service.dir);
  rmSync(root, { recursive: true, force: true });
});

/** The run host's writes: committed, logged, and short of the automatic checkpoint's 1,000 pages. */
function write(n: number, from = 0): void {
  const dal = new StoreDal(runHost);
  for (let k = from; k < from + n; k++) dal.upsertSession({ session_id: `S-${k}`, execution_status: 'completed', workspace_root: root, created_at: 't', updated_at: 't' });
}

describe('the idle checkpoint (hardening C1)', () => {
  it('fires once after the connection has gone IDLE_WAL_CHECKPOINT_MS without use, and each use re-arms it', () => {
    const clock = new FakeClock();
    let fired = 0;
    const idle = new IdleWalCheckpoint(clock.timers, IDLE_WAL_CHECKPOINT_MS, () => { fired += 1; });
    idle.touch();
    clock.advance(IDLE_WAL_CHECKPOINT_MS - 1);
    idle.touch();
    clock.advance(IDLE_WAL_CHECKPOINT_MS - 1);
    expect(fired).toBe(0);
    clock.advance(1);
    expect(fired).toBe(1);
    expect(idle.armed).toBe(false);
    clock.advance(IDLE_WAL_CHECKPOINT_MS * 3);
    expect(fired).toBe(1);
    idle.touch();
    idle.cancel();
    clock.advance(IDLE_WAL_CHECKPOINT_MS);
    expect(fired).toBe(1);
  });

  it('a PASSIVE checkpoint on the service\'s connection copies what the run host\'s connection logged', () => {
    write(200);
    const r = walCheckpoint(service.db, 'PASSIVE');
    expect(r).toMatchObject({ mode: 'PASSIVE', busy: false });
    expect(r.logFrames).toBeGreaterThan(0);
    expect(r.checkpointed).toBe(r.logFrames);
  });

  it('(starvation, measured) a reader holding an old snapshot keeps PASSIVE from copying past it; once it ends, all is copied', () => {
    write(50);
    walCheckpoint(service.db, 'PASSIVE');
    // The run host's connection reads, in a transaction it has not ended: its snapshot is the log as it stood.
    runHost.exec('BEGIN');
    runHost.prepare('SELECT count(*) FROM sessions').get();
    const writer = new StoreDal(service.db);
    for (let k = 1000; k < 1100; k++) writer.upsertSession({ session_id: `S-${k}`, execution_status: 'completed', workspace_root: root, created_at: 't', updated_at: 't' });
    const starved = walCheckpoint(service.db, 'PASSIVE');
    expect(starved.busy).toBe(false);
    expect(starved.checkpointed).toBeLessThan(starved.logFrames);
    runHost.exec('COMMIT');
    const after = walCheckpoint(service.db, 'PASSIVE');
    expect(after.checkpointed).toBe(after.logFrames);
  });
});

describe('the orderly close\'s checkpoint (hardening C1)', () => {
  it('truncates the log to nothing where no one is writing', () => {
    write(200);
    expect(statSync(`${service.file}-wal`).size).toBeGreaterThan(0);
    const r = walCheckpointBeforeClose(service.db);
    expect(r).toMatchObject({ mode: 'TRUNCATE', busy: false, logFrames: 0, checkpointed: 0 });
    expect(statSync(`${service.file}-wal`).size).toBe(0);
  });

  it('answers busy at once beside a writer, rather than waiting out the 5 s busy timeout, and puts the timeout back', () => {
    write(20);
    runHost.exec('BEGIN IMMEDIATE');
    runHost.prepare("UPDATE sessions SET updated_at = 'u' WHERE session_id = 'S-1'").run();
    const started = performance.now();
    const r = walCheckpointBeforeClose(service.db);
    const took = performance.now() - started;
    runHost.exec('COMMIT');
    expect(r.mode).toBe('TRUNCATE');
    expect(r.busy).toBe(true);
    expect(took).toBeLessThan(1_000);
    expect(service.db.pragma('busy_timeout', { simple: true })).toBe(5000);
  });
});
