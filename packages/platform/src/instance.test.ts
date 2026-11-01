import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Socket } from 'node:net';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, FakeClock, millis, toIsoUtc, type MachineId } from '@rotaris/kernel';
import { nodeClocks } from './clock.js';
import { claimInstance, endpointFor, inheritInstance, socketDirectoryCandidates, socketPathLimit, type ClaimDeps, type HandOver, type InstanceRecord } from './instance.js';

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
    // A predecessor that records passes is one whose restart is waiting for its successor (main's `startSuccessor`).
    ...(passed === undefined ? {} : { onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true }),
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

  it('an unsolicited successor — no restart pending — is refused: the record is unchanged and the instance stays the only one (REQ-STARTUP-161)', async () => {
    const passed: InstanceRecord[] = [];
    let restartPending = false;
    const predecessor = await claimInstance(deps({ pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => restartPending }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');

    const unsolicited = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), predecessor.record.endpoint);
    expect(unsolicited.outcome).toBe('refused');
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);

    // A claim that supplies no answer at all passes its record to nobody either.
    await predecessor.close();
    const silent = await claimInstance(deps({ pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s) }));
    if (silent.outcome !== 'instance') throw new Error(silent.outcome);
    expect((await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), silent.record.endpoint)).outcome).toBe('refused');
    expect(passed).toEqual([]);
    await silent.close();

    // Once a restart is pending the same announcement passes it.
    restartPending = true;
    const armed = await claimInstance(deps({ pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => restartPending }));
    if (armed.outcome !== 'instance') throw new Error(armed.outcome);
    const successor = await inheritInstance(deps(), armed.record.endpoint);
    expect(successor.outcome).toBe('instance');
    expect(passed).toHaveLength(1);
    await armed.close();
    if (successor.outcome === 'instance') await successor.close();
  });

  it('an accepted successor the record cannot be passed to is reported to the waiting restart, and the record is unchanged — the replacement failed (REQ-STARTUP-121)', async () => {
    const passed: InstanceRecord[] = [];
    const failed: { successor: InstanceRecord; reason: string }[] = [];
    const predecessor = await claimInstance(deps({
      pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true,
      onRecordPassFailed: (successor, reason) => failed.push({ successor, reason }),
      replaceRecord: async () => err({ code: 'document.rename', headline: 'Could not replace the document', detail: 'EBUSY: resource busy or locked' }),
    }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');

    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), predecessor.record.endpoint);
    expect(successor.outcome).toBe('refused');
    // The successor learns which check refused it, and ends; the predecessor's restart is told the same reason.
    if (successor.outcome === 'refused') expect(successor.reason).toContain('the instance record could not be replaced: Could not replace the document — EBUSY');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.successor.pid).toBe(process.pid);
    expect(failed[0]?.reason).toBe('the instance record could not be replaced: Could not replace the document — EBUSY: resource busy or locked');
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    await predecessor.close();
  });

  it('an accepted successor the record cannot be passed to is reported to the waiting restart, and the record is unchanged — the record no longer names this instance (REQ-STARTUP-121, REQ-STARTUP-164)', async () => {
    const passed: InstanceRecord[] = [];
    const failed: string[] = [];
    const predecessor = await claimInstance(deps({
      pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true,
      onRecordPassFailed: (_successor, reason) => failed.push(reason),
    }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    // A reclaim (REQ-STARTUP-164 (3)) rewrote the record for another process meanwhile.
    const other = `${JSON.stringify({ ...predecessor.record, pid: PREDECESSOR_PID + 1_000_000 })}\n`;
    writeFileSync(join(dir, 'instance.json'), other);

    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), predecessor.record.endpoint);
    expect(successor.outcome).toBe('refused');
    if (successor.outcome === 'refused') expect(successor.reason).toContain('the instance record no longer names the running instance');
    expect(failed).toEqual(['the instance record no longer names the running instance']);
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(other);
    await predecessor.close();
  });

  it('an announcement that was never accepted is not reported as a pass failure: no restart pending, or malformed (REQ-STARTUP-161)', async () => {
    const failed: string[] = [];
    const idle = await claimInstance(deps({ pid: PREDECESSOR_PID, acceptSuccessor: () => false, onRecordPassFailed: (_s, reason) => failed.push(reason) }));
    if (idle.outcome !== 'instance') throw new Error(idle.outcome);
    const stray = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), idle.record.endpoint);
    expect(stray.outcome).toBe('refused');
    if (stray.outcome === 'refused') expect(stray.reason).toContain('the running instance is not waiting for a successor');
    await idle.close();

    const armed = await claimInstance(deps({ pid: PREDECESSOR_PID, acceptSuccessor: () => true, onRecordPassFailed: (_s, reason) => failed.push(reason) }));
    if (armed.outcome !== 'instance') throw new Error(armed.outcome);
    const foreign = await inheritInstance(deps({ machineId: 'another-machine' as MachineId, handOverIntervalMs: millis(1_000) }), armed.record.endpoint);
    expect(foreign.outcome).toBe('refused');
    expect(failed).toEqual([]);
    await armed.close();
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

/**
 * A raw peer on one connection: what it was sent, line by line, and whether the other side ended it. It stands in for
 * a successor (or a predecessor) whose timing the test decides, which a real `inheritInstance` cannot be made to have.
 */
function peer(sock: Socket): { lines: string[]; ended: () => boolean; nextLine: () => Promise<string | undefined> } {
  const lines: string[] = [];
  const waiters: ((line: string | undefined) => void)[] = [];
  let buf = '';
  let ended = false;
  sock.setEncoding('utf8');
  sock.on('data', (chunk: string) => {
    buf += chunk;
    for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const w = waiters.shift();
      if (w) w(line); else lines.push(line);
    }
  });
  const end = () => { ended = true; for (const w of waiters.splice(0)) w(undefined); };
  sock.on('close', end);
  sock.on('error', () => undefined);
  return {
    lines,
    ended: () => ended,
    nextLine: () => {
      const queued = lines.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (ended) return Promise.resolve(undefined);
      return new Promise((resolve) => { waiters.push(resolve); });
    },
  };
}
const openTo = (endpoint: string): Promise<Socket> => new Promise((resolve, reject) => {
  const sock = connect(endpoint);
  sock.once('connect', () => resolve(sock));
  sock.once('error', reject);
});
const successorRecord = (): InstanceRecord => ({ pid: process.pid, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: join(dir, 'successor.sock') });
const settled = () => new Promise((resolve) => { setImmediate(resolve); });
/** Block this process's event loop, as a long synchronous step in main, a debugger or a loaded machine would. */
const blockLoop = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

describe('the record passes only to a successor that is still waiting — the two-step pass (REQ-STARTUP-121, REQ-STARTUP-161, ADR-0055)', () => {
  it('the record is offered, not passed, until the successor acknowledges; the acknowledgement rewrites it and reports the pass', async () => {
    const passed: InstanceRecord[] = [];
    const failed: string[] = [];
    const predecessor = await claimInstance(deps({ pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true, onRecordPassFailed: (_s, r) => failed.push(r) }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');
    const sock = await openTo(predecessor.record.endpoint);
    const successor = peer(sock);
    const announced = successorRecord();
    sock.write(`${JSON.stringify({ successor: announced })}\n`);

    expect(await successor.nextLine()).toBe('{"record":"offered"}');
    // Offered is not passed: the record is still the predecessor's and nothing is reported.
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    expect(passed).toEqual([]);

    sock.write('{"ack":true}\n');
    expect(await successor.nextLine()).toBe('{"ok":true,"record":"passed"}');
    expect(record(join(dir, 'instance.json'))).toEqual(announced);
    expect(passed).toEqual([announced]);
    expect(failed).toEqual([]);
    sock.destroy();
    await predecessor.close();
  });

  it('a successor that closed before answering the offer is not passed the record: it is byte-for-byte intact and the restart fails (REQ-STARTUP-121)', async () => {
    const passed: InstanceRecord[] = [];
    const failed: string[] = [];
    const predecessor = await claimInstance(deps({ pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true, onRecordPassFailed: (_s, r) => failed.push(r) }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');
    // The announcement and the close arrive together: the successor's bound expired before this instance read either.
    const sock = await openTo(predecessor.record.endpoint);
    const successor = peer(sock);
    sock.end(`${JSON.stringify({ successor: successorRecord() })}\n`);
    // Only its writing half is closed, so the offer still reaches it; to the instance it has stopped waiting.
    expect(await successor.nextLine()).toBe('{"record":"offered"}');
    for (let i = 0; i < 20 && failed.length === 0; i += 1) await new Promise((resolve) => { setTimeout(resolve, 10); });

    expect(failed).toEqual(['the successor stopped waiting: it closed its connection before acknowledging the record']);
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    await predecessor.close();
  });

  it('an acknowledgement that does not arrive within the hand-over interval — on the timer port — leaves the record intact and fails the restart; a late one changes nothing', async () => {
    const fake = new FakeClock();
    const passed: InstanceRecord[] = [];
    const failed: string[] = [];
    const predecessor = await claimInstance(deps({ pid: PREDECESSOR_PID, timers: fake.timers, handOverIntervalMs: millis(5_000), onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true, onRecordPassFailed: (_s, r) => failed.push(r) }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');
    const sock = await openTo(predecessor.record.endpoint);
    const successor = peer(sock);
    sock.write(`${JSON.stringify({ successor: successorRecord() })}\n`);
    expect(await successor.nextLine()).toBe('{"record":"offered"}');

    fake.advance(4_999);
    await settled();
    expect(failed).toEqual([]);
    fake.advance(1);
    await settled();
    expect(failed).toEqual(['the successor did not acknowledge the record within the hand-over interval']);
    // The successor, were it still there, is told why and the connection ends.
    expect(JSON.parse((await successor.nextLine()) ?? '{}')).toEqual({ ok: false, reason: 'the successor did not acknowledge the record within the hand-over interval' });

    if (!sock.destroyed) sock.write('{"ack":true}\n');
    await settled();
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    sock.destroy();
    await predecessor.close();
  });

  it('a predecessor whose loop was blocked past the successor\'s bound refuses the buffered announcement: the record is intact, the successor ended, the restart fails (the defect this repairs)', async () => {
    const passed: InstanceRecord[] = [];
    const failed: string[] = [];
    const predecessor = await claimInstance(deps({
      pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), onRecordPassFailed: (_s, r) => failed.push(r),
      // The announcement is read, and the loop then blocks for longer than the successor waits for an answer.
      acceptSuccessor: () => { blockLoop(600); return true; },
    }));
    if (predecessor.outcome !== 'instance') throw new Error(predecessor.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');

    // Deterministic, not a race won by luck: `blockLoop` runs synchronously inside the predecessor's read of the
    // announcement, and the offer is written before that handler returns. By then the successor's 200 ms timer is
    // overdue, and Node's event loop runs its timers phase before the poll phase that would deliver the offer's bytes,
    // so the successor closes before it can read the offer, just as a separate successor process would have.
    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(200) }), predecessor.record.endpoint);
    expect(successor.outcome).toBe('refused');
    for (let i = 0; i < 50 && failed.length === 0 && passed.length === 0; i += 1) await new Promise((resolve) => { setTimeout(resolve, 10); });

    // The one-step pass rewrote the record here for the successor that had just ended, and reported it passed.
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    expect(failed).toEqual(['the successor stopped waiting: it closed its connection before acknowledging the record']);
    // The predecessor is still the instance: a launch now is handed to it, not to the successor that ended.
    const third = await claimInstance(deps(), { workspace: '/ws' });
    expect(third.outcome).toBe('handed-over');
    await predecessor.close();
  });

  it('the ordinary hand-over of a second launch is unchanged: one line in, `{"ok":true}` out, no offer, the connection ended (REQ-STARTUP-162)', async () => {
    const seen: HandOver[] = [];
    const passed: InstanceRecord[] = [];
    const first = await claimInstance(deps({ seen, pid: PREDECESSOR_PID, onRecordPassed: (s) => passed.push(s), acceptSuccessor: () => true }));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');
    const sock = await openTo(first.record.endpoint);
    const launch = peer(sock);
    sock.write('{"workspace":"/w"}\n');
    expect(await launch.nextLine()).toBe('{"ok":true}');
    expect(await launch.nextLine()).toBeUndefined();
    expect(launch.ended()).toBe(true);
    expect(seen).toEqual([{ workspace: '/w' }]);
    expect(passed).toEqual([]);
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    await first.close();
  });
});

describe('the successor\'s side of the two-step pass — REQ-STARTUP-121 (ADR-0055)', () => {
  /** A predecessor the test scripts: it offers, reads the acknowledgement, then does what `after` says. */
  async function scriptedPredecessor(after: (sock: Socket, successor: InstanceRecord) => Promise<void>): Promise<{ endpoint: string; close: () => Promise<void> }> {
    const endpoint = endpointFor(dir, PREDECESSOR_PID, process.platform, dir);
    writeFileSync(join(dir, 'instance.json'), `${JSON.stringify({ pid: PREDECESSOR_PID, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint })}\n`);
    const server = createServer((sock) => {
      const predecessor = peer(sock);
      void (async () => {
        const announced = JSON.parse((await predecessor.nextLine()) ?? '{}') as HandOver;
        sock.write('{"record":"offered"}\n');
        expect(await predecessor.nextLine()).toBe('{"ack":true}');
        if (announced.successor) await after(sock, announced.successor);
      })();
    });
    await new Promise<void>((resolve) => { server.listen(endpoint, resolve); });
    return { endpoint, close: () => new Promise((resolve) => { server.close(() => resolve()); }) };
  }

  it('once it has acknowledged, it waits past its own bound for the predecessor\'s last word, and takes the record when it comes', async () => {
    const predecessor = await scriptedPredecessor(async (sock, successor) => {
      await new Promise((resolve) => { setTimeout(resolve, 500); });
      writeFileSync(join(dir, 'instance.json'), `${JSON.stringify(successor)}\n`);
      sock.end('{"ok":true,"record":"passed"}\n');
    });
    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(200) }), predecessor.endpoint);
    expect(successor.outcome).toBe('instance');
    if (successor.outcome === 'instance') await successor.close();
    await predecessor.close();
  });

  it('a refusal after the acknowledgement ends it with the predecessor\'s reason', async () => {
    const predecessor = await scriptedPredecessor(async (sock) => { sock.end(`${JSON.stringify({ ok: false, reason: 'the instance record could not be replaced: EBUSY' })}\n`); });
    const successor = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), predecessor.endpoint);
    expect(successor.outcome).toBe('refused');
    if (successor.outcome === 'refused') expect(successor.reason).toContain('the instance record could not be replaced: EBUSY');
    await predecessor.close();
  });

  it('a predecessor that ends with no last word leaves the decision to the record: passed when it names this successor, refused when it does not', async () => {
    const rewrote = await scriptedPredecessor(async (sock, successor) => {
      writeFileSync(join(dir, 'instance.json'), `${JSON.stringify(successor)}\n`);
      sock.destroy();
    });
    const taken = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), rewrote.endpoint);
    expect(taken.outcome).toBe('instance');
    if (taken.outcome === 'instance') await taken.close();
    await rewrote.close();

    const vanished = await scriptedPredecessor(async (sock) => { sock.destroy(); });
    const before = readFileSync(join(dir, 'instance.json'), 'utf8');
    const refused = await inheritInstance(deps({ handOverIntervalMs: millis(1_000) }), vanished.endpoint);
    expect(refused.outcome).toBe('refused');
    if (refused.outcome === 'refused') expect(refused.reason).toContain('the running instance ended without passing its record');
    expect(readFileSync(join(dir, 'instance.json'), 'utf8')).toBe(before);
    await vanished.close();
  });
});

/**
 * ADR-0055 consequence 14: "a primary that recovers still believes it is the instance. It must therefore re-read the record
 * before acting as one, and where it finds a record naming another process it must stop behaving as the instance rather than
 * compete". Measured not to hold on Windows on 2026-10-21: the resumed primary answered the hand-over queued on its pipe and
 * surfaced its window beside the instance that had reclaimed the record
 * (`docs/defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md`). The suspension is not
 * reproduced here; its result is — the record rewritten under a primary whose endpoint is still listening.
 */
describe('a process the record was reclaimed from stands down — ADR-0055 consequence 14, REQ-STARTUP-161, REQ-STARTUP-164', () => {
  const file = () => join(dir, 'instance.json');

  it('the resumed primary declines the hand-over queued for it and acts on nothing; the record keeps naming the instance that reclaimed it', async () => {
    const primarySeen: HandOver[] = [];
    const declined: { h: HandOver; holder: InstanceRecord | undefined }[] = [];
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen: primarySeen, onHandOverDeclined: (h, holder) => declined.push({ h, holder }) }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);

    // REQ-STARTUP-164 (3), as the second launch performs it while the primary is suspended: the record removed, the claim
    // retried and won.
    rmSync(file());
    const instanceSeen: HandOver[] = [];
    const instance = await claimInstance(deps({ seen: instanceSeen }));
    if (instance.outcome !== 'instance') throw new Error(instance.outcome);

    // The line the second launch had queued on the primary's endpoint before it gave up, read once the primary runs again.
    const sock = await openTo(primary.record.endpoint);
    const queued = peer(sock);
    sock.write('{"workspace":"/w"}\n');
    const answer = JSON.parse((await queued.nextLine()) ?? '{}') as { ok?: unknown; reason?: unknown };

    // THE FALSIFIER: until 2026-10-31 the primary surfaced its window for it — `[{ workspace: '/w' }]` — and answered `{"ok":true}`.
    expect(primarySeen).toEqual([]);
    expect(answer).toEqual({ ok: false, reason: 'the instance record no longer names this process, so it does not act as the instance (ADR-0055)' });
    expect(declined).toEqual([{ h: { workspace: '/w' }, holder: instance.record }]);
    expect(record(file())).toEqual(instance.record);
    expect(instanceSeen).toEqual([]);

    // A launch arriving now is handed to the instance the record names, and the primary still acts on nothing.
    const later = await claimInstance(deps(), { workspace: '/x' });
    expect(later.outcome).toBe('handed-over');
    expect(instanceSeen).toEqual([{ workspace: '/x' }]);
    expect(primarySeen).toEqual([]);

    // The primary's close leaves the instance's record alone.
    await primary.close();
    expect(record(file())).toEqual(instance.record);
    await instance.close();
    expect(existsSync(file())).toBe(false);
  });

  it('between the reclaim\'s removal and its retried claim — no record to read — the primary declines too', async () => {
    const seen: HandOver[] = [];
    const declined: { h: HandOver; holder: InstanceRecord | undefined }[] = [];
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen, onHandOverDeclined: (h, holder) => declined.push({ h, holder }) }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);
    rmSync(file());
    const sock = await openTo(primary.record.endpoint);
    const launch = peer(sock);
    sock.write('{"workspace":"/w"}\n');
    expect(JSON.parse((await launch.nextLine()) ?? '{}')).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
    expect(declined).toEqual([{ h: { workspace: '/w' }, holder: undefined }]);
    await primary.close();
  });

  it('a read of the record that failed shows nothing about who holds it: the instance answers rather than declining into a reclaim (REQ-STARTUP-161, REQ-STARTUP-164)', async () => {
    const seen: HandOver[] = [];
    const declined: HandOver[] = [];
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen, onHandOverDeclined: (h) => declined.push(h) }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);
    // A read that fails with something other than ENOENT, on every platform: EISDIR stands in for EBUSY, EPERM and EMFILE.
    rmSync(file());
    mkdirSync(file());
    const sock = await openTo(primary.record.endpoint);
    const launch = peer(sock);
    sock.write('{"workspace":"/w"}\n');
    // THE FALSIFIER: a decline here is silence to a launch whose record still names this process; it reclaims and becomes a
    // second instance beside one that was answering.
    expect(JSON.parse((await launch.nextLine()) ?? '{}')).toEqual({ ok: true });
    expect(seen).toEqual([{ workspace: '/w' }]);
    expect(declined).toEqual([]);
    rmdirSync(file());
    await primary.close();
  });

  it('a launch that read the record while it named the primary and reached it after the reclaim ends handed to the instance the record names — exactly one instance, its window surfaced (REQ-STARTUP-164 (3), (4))', async () => {
    const primarySeen: HandOver[] = [];
    const instanceSeen: HandOver[] = [];
    // The instance that will have reclaimed the record. Its claim is taken first only so that it is listening when the
    // record comes to name it; the record is then handed back to the primary for the arriving launch to read.
    const instance = await claimInstance(deps({ seen: instanceSeen }));
    if (instance.outcome !== 'instance') throw new Error(instance.outcome);
    const reclaimed = readFileSync(file(), 'utf8');
    rmSync(file());
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen: primarySeen }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);

    // The reclaim lands after the arriving launch read the record naming the primary, and before the primary reads its
    // hand-over: the launch's first timer is the hand-over's bound, armed between the two.
    let landed = false;
    const reclaimAfterRead = {
      after: (delay: Parameters<typeof clocks.timers.after>[0], fn: () => void) => {
        if (!landed) { landed = true; writeFileSync(file(), reclaimed); }
        return clocks.timers.after(delay, fn);
      },
      every: clocks.timers.every.bind(clocks.timers),
    };
    const arriving = await claimInstance(deps({ timers: reclaimAfterRead }), { workspace: '/w' });

    expect(landed).toBe(true);
    // Before the fix the primary acknowledged and surfaced its window for it. With the primary declining but the reclaim still
    // removing whatever stood there, the launch removed the instance's record and became a second instance ('instance').
    expect(arriving.outcome).toBe('handed-over');
    expect(primarySeen).toEqual([]);
    expect(instanceSeen).toEqual([{ workspace: '/w' }]);
    expect(record(file())).toEqual(instance.record);

    if (arriving.outcome === 'instance') await arriving.close();
    await primary.close();
    await instance.close();
  });

  it('a record that came to name a dead process while the hand-over went unanswered is still reclaimed: the launch becomes the instance, never refused (REQ-STARTUP-164 (3))', async () => {
    // A: alive (the parent's pid) and listening, but it never answers.
    const held: Socket[] = [];
    const silent = createServer((sock) => { held.push(sock); });
    const closeSilent = () => new Promise((resolve) => { for (const sock of held) sock.destroy(); silent.close(resolve); });
    const silentEndpoint = process.platform === 'win32' ? `\\\\.\\pipe\\rotaris-silent-${process.pid}` : join(dir, 'silent.sock');
    await new Promise<void>((resolve) => { silent.listen(silentEndpoint, resolve); });
    writeFileSync(file(), `${JSON.stringify({ pid: PREDECESSOR_PID, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: silentEndpoint })}\n`);
    // C: a process that has ended, at an endpoint nothing serves.
    const deadPid = spawnSync(process.execPath, ['-e', '0']).pid as number;
    const dead = `${JSON.stringify({ pid: deadPid, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: join(dir, 'dead.sock') })}\n`;

    // The record is replaced by C inside the hand-over's interval: the launch's first timer is that interval's bound.
    let landed = false;
    const replaceAfterRead = {
      after: (delay: Parameters<typeof clocks.timers.after>[0], fn: () => void) => {
        if (!landed) { landed = true; writeFileSync(file(), dead); }
        return clocks.timers.after(delay, fn);
      },
      every: clocks.timers.every.bind(clocks.timers),
    };
    const launch = await claimInstance(deps({ timers: replaceAfterRead, handOverIntervalMs: millis(300) }), { workspace: '/w' });

    expect(landed).toBe(true);
    // THE FALSIFIER: from 7262da97 until this change the reclaim left any record naming another claim, dead or alive, so the
    // retry lost to C's and the launch ended 'refused' — no window, and nobody running as the instance.
    expect(launch.outcome).toBe('instance');
    if (launch.outcome !== 'instance') { await closeSilent(); return; }
    expect(record(file())).toEqual(launch.record);
    await launch.close();
    await closeSilent();
  });

  it('the reclaim still takes a record that cannot be read: re-reading it before the removal finds nothing to leave (REQ-STARTUP-164 (3))', async () => {
    writeFileSync(file(), '{"pid":');
    const claim = await claimInstance(deps({ handOverIntervalMs: millis(300) }));
    expect(claim.outcome).toBe('instance');
    if (claim.outcome !== 'instance') return;
    expect(record(file())).toEqual(claim.record);
    await claim.close();
  });

  it('a primary the record still names is unchanged: it acts on the hand-over and acknowledges it (REQ-STARTUP-162)', async () => {
    const seen: HandOver[] = [];
    const declined: HandOver[] = [];
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen, onHandOverDeclined: (h) => declined.push(h) }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);
    expect((await claimInstance(deps(), { workspace: '/w' })).outcome).toBe('handed-over');
    expect(seen).toEqual([{ workspace: '/w' }]);
    expect(declined).toEqual([]);
    await primary.close();
  });
});

/**
 * PD-STARTUP-009 (2026-11-01, the ruling of OQ-460 and OQ-461): clause (4)'s hand-over has an interval of its own, and where
 * it goes unanswered too the launch reclaims the record and attempts the claim a final time. Real sockets and real timers
 * throughout; the record is replaced inside the first interval from the launch's own first timer, the way the stand-down
 * cases above do it, so that clause (3) finds another live claim and leaves it.
 */
describe('a holder that is live and never answers is reclaimed after the second unanswered hand-over — PD-STARTUP-009, REQ-STARTUP-164', () => {
  const file = () => join(dir, 'instance.json');
  const INTERVAL = millis(300);
  const recordLine = (over: Partial<InstanceRecord>): string =>
    `${JSON.stringify({ pid: PREDECESSOR_PID, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), ...over })}\n`;

  /** A process that accepts the hand-over's connection and answers only what `onConnection` makes it answer — by default nothing. */
  async function holder(name: string, onConnection?: (sock: Socket) => void): Promise<{ endpoint: string; connections: number; close: () => Promise<void> }> {
    const held: Socket[] = [];
    const h = {
      endpoint: process.platform === 'win32' ? `\\\\.\\pipe\\rotaris-${name}-${process.pid}` : join(dir, `${name}.sock`),
      connections: 0,
      close: () => new Promise<void>((resolve) => { for (const sock of held) sock.destroy(); server.close(() => resolve()); }),
    };
    const server = createServer((sock) => { held.push(sock); h.connections += 1; onConnection?.(sock); });
    await new Promise<void>((resolve) => { server.listen(h.endpoint, resolve); });
    return h;
  }

  /**
   * The launch's first timer is the first hand-over's bound: the record is replaced as it is armed, inside that interval.
   * `intervals` counts the hand-over bounds armed — the intervals the launch waited, whatever the host's clock did.
   */
  function replacingOnFirstTimer(content: string): ClaimDeps['timers'] & { landed: () => boolean; intervals: () => number } {
    let landed = false;
    let intervals = 0;
    return {
      landed: () => landed,
      intervals: () => intervals,
      after: (delay, fn) => {
        if (!landed) { landed = true; writeFileSync(file(), content); }
        if (delay === INTERVAL) intervals += 1;
        return clocks.timers.after(delay, fn);
      },
      every: clocks.timers.every.bind(clocks.timers),
    };
  }

  it('a live holder that answers neither hand-over: the launch reclaims after the second interval and becomes the instance (the defect this repairs)', async () => {
    const first = await holder('silent-first');
    const second = await holder('silent-second');
    writeFileSync(file(), recordLine({ endpoint: first.endpoint }));
    const secondLine = recordLine({ endpoint: second.endpoint });
    const timers = replacingOnFirstTimer(secondLine);

    const started = performance.now();
    const launch = await claimInstance(deps({ timers, handOverIntervalMs: INTERVAL }), { workspace: '/w' });
    const elapsed = performance.now() - started;

    expect(timers.landed()).toBe(true);
    expect(first.connections).toBe(1);
    expect(second.connections).toBe(1);
    // THE FALSIFIER: until 2026-11-01 this was 'refused' — no window of this launch's own and none surfaced.
    expect(launch.outcome).toBe('instance');
    if (launch.outcome !== 'instance') { await first.close(); await second.close(); return; }
    // Each hand-over waited its own interval, and the final claim followed the second without a third (two intervals; the
    // directive's bound is three). The wall clock gives the lower bound; the count of bounds armed gives the upper one.
    expect(elapsed).toBeGreaterThanOrEqual(2 * INTERVAL);
    expect(timers.intervals()).toBe(2);
    expect(launch.reclaimedFrom).toEqual({ record: JSON.parse(secondLine), live: true, attempts: 3 });
    expect(record(file())).toEqual(launch.record);
    await launch.close();
    expect(existsSync(file())).toBe(false);
    await first.close();
    await second.close();
  });

  it('a holder that answers late, inside clause (4)\'s own interval, is handed to: no reclaim, no rival', async () => {
    const first = await holder('silent-late-first');
    const seen: string[] = [];
    const late = await holder('late', (sock) => {
      sock.setEncoding('utf8');
      sock.on('data', (line: string) => { seen.push(line.trim()); clocks.timers.after(millis(INTERVAL / 2), () => sock.write('{"ok":true}\n')); });
    });
    writeFileSync(file(), recordLine({ endpoint: first.endpoint }));
    const lateLine = recordLine({ endpoint: late.endpoint });
    const timers = replacingOnFirstTimer(lateLine);

    const launch = await claimInstance(deps({ timers, handOverIntervalMs: INTERVAL }), { workspace: '/w' });

    expect(launch.outcome).toBe('handed-over');
    expect(seen).toEqual(['{"workspace":"/w"}']);
    // The late holder's record stands: nothing was reclaimed from it.
    expect(record(file())).toEqual(JSON.parse(lateLine));
    await first.close();
    await late.close();
  });

  it('a record re-created inside the first interval by another launch that became the instance: handed to it, never a rival (REQ-STARTUP-161)', async () => {
    const first = await holder('silent-rival-first');
    const instanceSeen: HandOver[] = [];
    // The instance that claimed meanwhile. Taken first so that it is listening; its record is then set aside and the
    // silent holder's put in its place for the arriving launch to read first.
    const instance = await claimInstance(deps({ seen: instanceSeen }));
    if (instance.outcome !== 'instance') throw new Error(instance.outcome);
    const reclaimed = readFileSync(file(), 'utf8');
    writeFileSync(file(), recordLine({ endpoint: first.endpoint }));
    const timers = replacingOnFirstTimer(reclaimed);

    const arriving = await claimInstance(deps({ timers, handOverIntervalMs: INTERVAL }), { workspace: '/w' });

    expect(arriving.outcome).toBe('handed-over');
    expect(instanceSeen).toEqual([{ workspace: '/w' }]);
    expect(record(file())).toEqual(instance.record);
    await instance.close();
    await first.close();
  });

  it('a record that came to name another machine cannot be handed to and is reclaimed by the final reclaim; one that became malformed during clause (4)\'s interval too', async () => {
    // Another machine's record: live by construction (REQ-SESSION-056), its endpoint served by nothing here.
    const first = await holder('silent-foreign-first');
    writeFileSync(file(), recordLine({ endpoint: first.endpoint }));
    const foreign = recordLine({ pid: 4242, host: 'another-machine', endpoint: join(dir, 'elsewhere.sock') });
    const timers = replacingOnFirstTimer(foreign);
    const launch = await claimInstance(deps({ timers, handOverIntervalMs: INTERVAL }));
    expect(launch.outcome).toBe('instance');
    if (launch.outcome !== 'instance') { await first.close(); return; }
    expect(launch.reclaimedFrom).toEqual({ record: JSON.parse(foreign), live: true, attempts: 3 });
    expect(record(file())).toEqual(launch.record);
    await launch.close();
    await first.close();

    // A live claim that, reached by clause (4)'s hand-over, leaves a malformed record behind and never answers.
    const again = await holder('silent-malformed-first');
    const spoiling = await holder('spoiling', () => { writeFileSync(file(), '{"pid":'); });
    writeFileSync(file(), recordLine({ endpoint: again.endpoint }));
    const spoiled = recordLine({ endpoint: spoiling.endpoint });
    const launch2 = await claimInstance(deps({ timers: replacingOnFirstTimer(spoiled), handOverIntervalMs: INTERVAL }));
    expect(spoiling.connections).toBe(1);
    expect(launch2.outcome).toBe('instance');
    if (launch2.outcome !== 'instance') { await again.close(); await spoiling.close(); return; }
    expect(launch2.reclaimedFrom).toEqual({ record: JSON.parse(spoiled), live: true, attempts: 3 });
    expect(record(file())).toEqual(launch2.record);
    await launch2.close();
    await again.close();
    await spoiling.close();
  });

  it('a holder that answers the first hand-over is never subject to any of this: no interval runs, one connection, handed over', async () => {
    const seen: HandOver[] = [];
    const primary = await claimInstance(deps({ pid: PREDECESSOR_PID, seen }));
    if (primary.outcome !== 'instance') throw new Error(primary.outcome);
    const started = performance.now();
    const launch = await claimInstance(deps({ handOverIntervalMs: INTERVAL }), { workspace: '/w' });
    expect(performance.now() - started).toBeLessThan(INTERVAL);
    expect(launch.outcome).toBe('handed-over');
    expect(seen).toEqual([{ workspace: '/w' }]);
    expect(record(file())).toEqual(primary.record);
    await primary.close();
  });
});

/**
 * Where the hand-over socket lives off Windows (REQ-STARTUP-145, REQ-STARTUP-161, REQ-STARTUP-164). Until fin30 the claim
 * listened under the data directory whatever its length, so a deep one made the listen fail with `EINVAL` and the
 * rejection went unhandled in main — a launch with no window that said nothing
 * (`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`); and it took `XDG_RUNTIME_DIR` with `??`, so
 * a set-but-empty value put the socket in the working directory
 * (`docs/defects/fixed/an-empty-xdg-runtime-dir-puts-the-instance-socket-in-the-working-directory.md`).
 */
describe('the hand-over socket\'s directory — REQ-STARTUP-145, REQ-STARTUP-161, REQ-STARTUP-164', () => {
  const posixHost = process.platform !== 'win32';
  afterEach(() => { vi.unstubAllEnvs(); });
  /** The claim as production makes it: no socket directory of its own, so the candidates decide. */
  const asProduction = (over: Parameters<typeof deps>[0] = {}): ClaimDeps => {
    const { socketDir: _named, ...rest } = deps(over);
    return rest;
  };

  it.skipIf(!posixHost)('a data directory too deep for a unix socket still claims, and a second launch is handed over to it', async () => {
    vi.stubEnv('XDG_RUNTIME_DIR', undefined);
    const deep = join(dir, 'a'.repeat(60), 'b'.repeat(60));
    mkdirSync(deep, { recursive: true });
    const seen: HandOver[] = [];
    const first = await claimInstance(asProduction({ endpointDir: deep, tempDirs: [dir], seen }));
    expect(first.outcome).toBe('instance');
    if (first.outcome !== 'instance') return;
    const endpoint = first.record.endpoint;
    expect(posix.isAbsolute(endpoint)).toBe(true);
    expect(Buffer.byteLength(endpoint)).toBeLessThanOrEqual(socketPathLimit(process.platform));
    expect(endpoint.startsWith(`${deep}/`)).toBe(false);
    // The fallback is a directory of this user's alone, below the temporary directory.
    expect(posix.dirname(endpoint)).toMatch(/\/rotaris-[A-Za-z0-9]{6}$/);
    expect(statSync(posix.dirname(endpoint)).mode & 0o077).toBe(0);
    const second = await claimInstance(asProduction({ endpointDir: deep, tempDirs: [dir] }), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    expect(seen).toEqual([{ workspace: '/w' }]);
    await first.close();
    expect(existsSync(endpoint)).toBe(false);
  });

  it.skipIf(!posixHost)('an empty or relative XDG_RUNTIME_DIR is ignored: the socket is never addressed relative to the working directory', async () => {
    for (const value of ['', 'run']) {
      vi.stubEnv('XDG_RUNTIME_DIR', value);
      const claim = await claimInstance(asProduction({ tempDirs: [dir] }));
      expect(claim.outcome).toBe('instance');
      if (claim.outcome !== 'instance') return;
      expect(posix.isAbsolute(claim.record.endpoint)).toBe(true);
      // The data directory is short enough here, so the socket sits beside the record.
      expect(claim.record.endpoint.startsWith(`${dir}/instance-`)).toBe(true);
      await claim.close();
    }
  });

  it.skipIf(!posixHost)('an absolute XDG_RUNTIME_DIR is where the socket goes, made when it does not exist yet', async () => {
    const runtime = join(dir, 'run');
    vi.stubEnv('XDG_RUNTIME_DIR', runtime);
    const claim = await claimInstance(asProduction({ tempDirs: [dir] }));
    expect(claim.outcome).toBe('instance');
    if (claim.outcome !== 'instance') return;
    expect(claim.record.endpoint.startsWith(`${runtime}/instance-`)).toBe(true);
    await claim.close();
  });

  it.skipIf(!posixHost)('a launch whose endpoint cannot listen anywhere is refused and gives its record back, never left unhandled', async () => {
    vi.stubEnv('XDG_RUNTIME_DIR', undefined);
    const file = join(dir, 'not-a-directory');
    writeFileSync(file, '');
    const claim = await claimInstance(asProduction({ endpointDir: join(file, 'data'), tempDirs: [join(file, 'tmp')] }));
    expect(claim.outcome).toBe('refused');
    if (claim.outcome === 'refused') expect(claim.reason).toContain('could not open its hand-over endpoint');
    // The record it claimed is released, so the next launch claims at once rather than waiting on an endpoint nobody serves.
    expect(existsSync(join(dir, 'instance.json'))).toBe(false);
  });

  it('the candidates, in order: named, runtime, data, then each temporary directory, below which every attempt makes a private directory of its own — each absolute and short enough', () => {
    const at = (over: Partial<Parameters<typeof socketDirectoryCandidates>[0]> = {}) => socketDirectoryCandidates({
      platform: 'linux', pid: 4242, endpointDir: '/home/me/.local/share/rotaris', tempDirs: ['/tmp'], ...over,
    }).map((c) => `${c.dir}${c.private ? ' (private)' : ''}`);
    expect(at({ socketDir: '/s', runtimeDir: '/run/user/1000' })).toEqual(['/s', '/run/user/1000', '/home/me/.local/share/rotaris', '/tmp (private)']);
    // Unset, empty, relative, and a Windows-spelled value are none of them a directory a POSIX launch can name.
    for (const runtimeDir of [undefined, '', 'run', 'D:/run']) {
      expect(at({ runtimeDir })).toEqual(['/home/me/.local/share/rotaris', '/tmp (private)']);
    }
    // A data directory too deep for the socket is passed over: the defect's own shape, the default data directory below a
    // home of sixty-six characters (with a four-digit pid the socket fits only below a home of fifty-eight or fewer).
    const deepHome = `/home/${'x'.repeat(60)}/.local/share/rotaris`;
    expect(at({ endpointDir: deepHome })).toEqual(['/tmp (private)']);
    // A relative temporary directory is skipped; duplicates are kept once.
    expect(at({ tempDirs: ['tmp', '/tmp', '/tmp'] })).toEqual(['/home/me/.local/share/rotaris', '/tmp (private)']);
    // A temporary directory is sized with the per-attempt `rotaris-XXXXXX/` component its socket sits below (OQ-248).
    const name = 'instance-4242-00000000.sock'.length + 1;
    const bare = `/${'t'.repeat(107 - name - 1)}`;
    expect(socketDirectoryCandidates({ platform: 'linux', pid: 4242, endpointDir: bare, tempDirs: [bare] }).map((c) => `${c.dir}${c.private ? ' (private)' : ''}`)).toEqual([bare]);
    const room = `/${'t'.repeat(107 - name - 'rotaris-XXXXXX/'.length - 1)}`;
    expect(socketDirectoryCandidates({ platform: 'linux', pid: 4242, endpointDir: bare, tempDirs: [room] }).map((c) => `${c.dir}${c.private ? ' (private)' : ''}`)).toEqual([bare, `${room} (private)`]);
  });

  // OQ-248 (R-072, 2026-10-13) closes docs/defects/fixed/another-local-user-can-deny-the-instance-sockets-temporary-fallback.md:
  // the private directory below the temporary one is made per attempt under an unpredictable name, so nothing already there
  // can deny it. A file standing where the old shared `rotaris-<uid>` directory went is what another local user could create.
  it.skipIf(!posixHost)('a name already taken below the temporary directory no longer denies the fallback: each attempt makes its own private directory', async () => {
    vi.stubEnv('XDG_RUNTIME_DIR', undefined);
    const deep = join(dir, 'a'.repeat(60), 'b'.repeat(60));
    mkdirSync(deep, { recursive: true });
    const temp = join(dir, 'tmp');
    mkdirSync(temp);
    writeFileSync(join(temp, `rotaris-${process.getuid?.() ?? 0}`), 'not yours');
    const claim = await claimInstance(asProduction({ endpointDir: deep, tempDirs: [temp] }));
    expect(claim.outcome).toBe('instance');
    if (claim.outcome !== 'instance') return;
    const own = posix.dirname(claim.record.endpoint);
    expect(posix.dirname(own)).toBe(temp);
    expect(posix.basename(own)).toMatch(/^rotaris-[A-Za-z0-9]{6}$/);
    expect(statSync(own).mode & 0o077).toBe(0);
    await claim.close();
    expect(existsSync(own)).toBe(false);
  });

  // OQ-248: the endpoint is the record's, so the reclaim that removes a dead process's record removes its endpoint with it
  // (docs/defects/fixed/a-reclaim-leaves-the-dead-instances-socket-behind.md).
  it.skipIf(!posixHost)('a reclaim removes the socket a dead recorded process left, and its own private directory; it leaves a live process\'s endpoint and a name that is not one', async () => {
    const dead = spawnSync(process.execPath, ['-e', '0']).pid as number;
    const own = join(dir, 'rotaris-Ab12Cd');
    mkdirSync(own, { mode: 0o700 });
    const stale = join(own, `instance-${dead}-0123abcd.sock`);
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(stale, resolve));
    writeFileSync(join(dir, 'instance.json'), `${JSON.stringify({ pid: dead, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: stale })}\n`);
    const claim = await claimInstance(deps());
    expect(claim.outcome).toBe('instance');
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(own)).toBe(false);
    await new Promise<void>((resolve) => holder.close(() => resolve()));
    if (claim.outcome === 'instance') await claim.close();
    // A file whose name is not the dead pid's endpoint is not touched.
    const other = join(dir, 'other.sock');
    writeFileSync(other, '');
    writeFileSync(join(dir, 'instance.json'), `${JSON.stringify({ pid: dead, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: other })}\n`);
    const again = await claimInstance(deps());
    expect(again.outcome).toBe('instance');
    expect(existsSync(other)).toBe(true);
    if (again.outcome === 'instance') await again.close();
    // A live process that does not answer is reclaimed from, but its endpoint is its own closer's to remove.
    const silent = join(dir, `instance-${PREDECESSOR_PID}-89abcdef.sock`);
    writeFileSync(silent, '');
    writeFileSync(join(dir, 'instance.json'), `${JSON.stringify({ pid: PREDECESSOR_PID, host: M, acquired_at: toIsoUtc(clocks.wall.instant()), endpoint: silent })}\n`);
    const third = await claimInstance(deps({ handOverIntervalMs: millis(200) }));
    expect(third.outcome).toBe('instance');
    expect(existsSync(silent)).toBe(true);
    if (third.outcome === 'instance') await third.close();
  });

  it('the length is measured in bytes against the platform asked about: 107 on Linux, 103 on macOS', () => {
    expect(socketPathLimit('linux')).toBe(107);
    expect(socketPathLimit('darwin')).toBe(103);
    const name = 'instance-4242-00000000.sock'.length + 1;
    const exactly = (bytes: number) => `/${'d'.repeat(bytes - name - 1)}`;
    const linuxEdge = exactly(107);
    expect(socketDirectoryCandidates({ platform: 'linux', pid: 4242, endpointDir: linuxEdge, tempDirs: [] }).map((c) => c.dir)).toEqual([linuxEdge]);
    expect(socketDirectoryCandidates({ platform: 'linux', pid: 4242, endpointDir: `${linuxEdge}d`, tempDirs: [] })).toEqual([]);
    expect(socketDirectoryCandidates({ platform: 'darwin', pid: 4242, endpointDir: exactly(104), tempDirs: [] })).toEqual([]);
    // A multi-byte character costs its bytes, not one.
    const wide = `/${'é'.repeat(40)}`;
    expect(wide.length + name).toBeLessThan(107);
    expect(socketDirectoryCandidates({ platform: 'linux', pid: 4242, endpointDir: wide, tempDirs: [] })).toEqual([]);
  });
});
