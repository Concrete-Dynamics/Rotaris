import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { millis, type MachineId } from '@rotaris/kernel';
import { nodeClocks } from './clock.js';
import { claimInstance, inheritInstance, type ClaimDeps, type HandOver, type InstanceRecord } from './instance.js';

const M = 'machine-test';
const clocks = nodeClocks();
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-inst-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/**
 * Two "processes" in one: the predecessor takes the parent's pid and the successor this process's, so that a record
 * naming one is never mistaken for the other's (a close removes the record only while it names the closer's pid),
 * and both pids are alive for the liveness probe a later launch makes.
 */
const PREDECESSOR_PID = process.ppid;
function deps(over: Partial<ClaimDeps> & { seen?: HandOver[]; passed?: InstanceRecord[] } = {}): ClaimDeps {
  const { seen, passed, ...rest } = over;
  return {
    recordFile: join(dir, 'instance.json'), endpointDir: dir, socketDir: dir, machineId: M as MachineId, pid: process.pid,
    wall: clocks.wall, timers: clocks.timers, handOverIntervalMs: millis(2_000),
    onHandOver: (h) => seen?.push(h),
    ...(passed === undefined ? {} : { onRecordPassed: (s) => passed.push(s) }),
    ...rest,
  };
}
const record = (file: string): InstanceRecord => JSON.parse(readFileSync(file, 'utf8')) as InstanceRecord;

describe('the update restart as a hand-over of the record — REQ-STARTUP-121, REQ-STARTUP-161, REQ-STARTUP-164 (ADR-0055)', () => {
  it('the successor announces itself, the predecessor rewrites the record atomically and is told; the record is never unheld', async () => {
    const passed: InstanceRecord[] = [];
    const predecessor = await claimInstance(deps({ passed, pid: PREDECESSOR_PID }));
    expect(predecessor.outcome).toBe('instance');
    if (predecessor.outcome !== 'instance') return;
    const before = record(join(dir, 'instance.json'));
    expect(before.endpoint).toBe(predecessor.record.endpoint);
    expect(before.pid).toBe(PREDECESSOR_PID);

    const successorSeen: HandOver[] = [];
    const successor = await inheritInstance(deps({ seen: successorSeen }), predecessor.record.endpoint);
    expect(successor.outcome).toBe('instance');
    if (successor.outcome !== 'instance') return;
    // The record now names the successor: its endpoint, not the predecessor's, and it was passed, not released.
    const after = record(join(dir, 'instance.json'));
    expect(after.endpoint).toBe(successor.record.endpoint);
    expect(after.endpoint).not.toBe(before.endpoint);
    expect(after.pid).toBe(successor.record.pid);
    expect(passed).toEqual([after]);
    expect(existsSync(join(dir, 'instance.json'))).toBe(true);

    // The predecessor closing does NOT remove a record that no longer names it (the successor holds it).
    await predecessor.close();
    expect(existsSync(join(dir, 'instance.json'))).toBe(true);
    expect(record(join(dir, 'instance.json')).endpoint).toBe(successor.record.endpoint);

    // A launch arriving now is handed to the successor, and never starts a third process.
    const third = await claimInstance(deps(), { workspace: '/ws' });
    expect(third.outcome).toBe('handed-over');
    expect(successorSeen).toEqual([{ workspace: '/ws' }]);

    // The successor's own close releases the record it now holds.
    await successor.close();
    expect(existsSync(join(dir, 'instance.json'))).toBe(false);
  });

  it('a successor whose predecessor does not answer is refused within the interval and changes nothing; the predecessor keeps its record', async () => {
    const predecessor = await claimInstance(deps({ pid: PREDECESSOR_PID }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const silent = join(dir, 'nobody.sock');
    const t0 = Date.now();
    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(300) }), silent);
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(successor.outcome).toBe('refused');
    if (successor.outcome === 'refused') expect(successor.reason).toContain('REQ-STARTUP-121');
    expect(record(join(dir, 'instance.json')).endpoint).toBe(predecessor.record.endpoint);
    await predecessor.close();
  });

  it('a malformed successor record is not accepted: the predecessor answers not-passed and keeps the record as it was', async () => {
    const passed: InstanceRecord[] = [];
    const predecessor = await claimInstance(deps({ passed, pid: PREDECESSOR_PID }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    // A successor from another machine is refused: the record stays the predecessor's.
    const foreign = await inheritInstance(deps({ machineId: 'another-machine' as MachineId, handOverIntervalMs: millis(1_000) }), predecessor.record.endpoint);
    expect(foreign.outcome).toBe('refused');
    expect(passed).toEqual([]);
    expect(record(join(dir, 'instance.json')).endpoint).toBe(predecessor.record.endpoint);
    await predecessor.close();
  });

  it('an ordinary hand-over line is unchanged by the successor branch: it surfaces the instance and is acknowledged', async () => {
    const seen: HandOver[] = [];
    const first = await claimInstance(deps({ seen }));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const second = await claimInstance(deps(), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    expect(seen).toEqual([{ workspace: '/w' }]);
    await first.close();
  });
});
