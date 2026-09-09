import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FakeClock, millis } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { isCancelled, raiseCancelFlag, sharedCancelFlag } from './cancel.js';
import { defaultLayout } from './layout.js';
import { reportItem, reportPhase, throttledSink } from './progress.js';
import { createWorkerExecutor, workerMain, type WorkerLike } from './worker.js';

/**
 * ADR-0040's worker placement over a fake worker pair (the real thread runs in the proof's Electron driver): the
 * job/progress/done protocol, the shared cancel flag, and the grace-then-terminate on a worker that never answers.
 */
class FakePair {
  readonly workerSide = new EventEmitter();
  readonly ownerSide = new EventEmitter();
  terminated = 0;
  /** When true the worker side swallows jobs — a pass wedged inside a pattern. */
  wedged = false;
  readonly worker: WorkerLike;
  constructor() {
    // the worker side: messages posted by the owner arrive here asynchronously, as they would across a thread boundary
    this.worker = {
      postMessage: (v) => { if (!this.wedged) setImmediate(() => this.workerSide.emit('message', v)); },
      on: (event: string, listener: (...args: unknown[]) => void) => this.ownerSide.on(event, listener),
      terminate: () => { this.terminated += 1; return Promise.resolve(0); },
    } as WorkerLike;
    workerMain({ on: (event, listener) => this.workerSide.on(event, listener), postMessage: (v) => setImmediate(() => this.ownerSide.emit('message', v)) }, nodeClocks());
  }
}

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-worker-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const bytes = { artifact: null, debtBaseline: null, orphanModuleBaseline: null, orphanTestBaseline: null, retiredLog: null };

describe('the worker executor', () => {
  it('runs a job across the port pair, forwards progress, and answers with the outcome', async () => {
    put('docs/requirements/a.md', '---\nreq-id: REQ-1\nstatus: draft\n---\n');
    const pair = new FakePair();
    const clock = new FakeClock();
    const executor = createWorkerExecutor(() => pair.worker, clock.timers);
    const phases: string[] = [];
    const outcome = await executor.run({ op: 'parse', root, layout: defaultLayout(), bytes }, { progress: (r) => phases.push(r.phase) });
    expect(outcome.result.ok && (outcome.result.value as { records: unknown[] }).records.length).toBe(1);
    expect(phases).toEqual(['reading']);
    expect(executor.spawned()).toBe(1);
    await executor.run({ op: 'parse', root, layout: defaultLayout(), bytes }, {});
    expect(executor.spawned()).toBe(1);
  });
  it('a cancel raises the shared flag, and a worker that does not answer within the grace is terminated and respawned', async () => {
    const pair = new FakePair();
    pair.wedged = true;
    const clock = new FakeClock();
    const executor = createWorkerExecutor(() => pair.worker, clock.timers, millis(2_000));
    const controller = new AbortController();
    const running = executor.run({ op: 'parse', root, layout: defaultLayout(), bytes }, { signal: controller.signal });
    controller.abort();
    clock.advance(1_999);
    expect(pair.terminated).toBe(0);
    clock.advance(1);
    const outcome = await running;
    expect(outcome.result.ok).toBe(false);
    expect(!outcome.result.ok && outcome.result.error).toEqual({ kind: 'cancelled' });
    expect(pair.terminated).toBe(1);
    pair.wedged = false;
    put('docs/requirements/a.md', '---\nreq-id: REQ-1\nstatus: draft\n---\n');
    const again = await executor.run({ op: 'parse', root, layout: defaultLayout(), bytes }, {});
    expect(again.result.ok).toBe(true);
    expect(executor.spawned()).toBe(2);
  });
  it('a worker that dies fails every pending job, naming the cause, and the next job spawns afresh', async () => {
    const pair = new FakePair();
    pair.wedged = true;
    const executor = createWorkerExecutor(() => pair.worker, new FakeClock().timers);
    const running = executor.run({ op: 'parse', root, layout: defaultLayout(), bytes }, {});
    pair.ownerSide.emit('exit', 7);
    const outcome = await running;
    expect(!outcome.result.ok && outcome.result.error).toEqual({ kind: 'failed', what: 'the traceability worker', cause: 'the worker exited with code 7' });
    executor.dispose();
  });
});

describe('the cancel token and the progress protocol', () => {
  it('REQ-TRACE-220/224: the flag is set from another thread atomically; the signal is one-way', () => {
    const flag = sharedCancelFlag();
    expect(isCancelled({ flag })).toBe(false);
    raiseCancelFlag(flag);
    expect(isCancelled({ flag })).toBe(true);
    expect(isCancelled(undefined)).toBe(false);
  });
  it('REQ-TRACE-213/215/351: phase before items, deadline absent when unlimited, a throwing hook stepped over, throttling only above 20 items', () => {
    const got: string[] = [];
    const errors: string[] = [];
    const host = { sink: (r: { kind: string; phase: string; position?: number; deadlineSeconds?: number }) => { got.push(`${r.kind}:${r.phase}:${r.position ?? (r as { total?: number }).total ?? ''}:${r.deadlineSeconds ?? '-'}`); if (r.position === 2) throw new Error('boom'); }, onHookError: (h: string) => errors.push(h) };
    reportPhase(host, 'checks', 3);
    reportItem(host, 'checks', 'a', 1, 3, undefined, 0);
    reportItem(host, 'checks', 'b', 2, 3, 'detail', 30);
    expect(got).toEqual(['phase:checks:3:-', 'item:checks:1:-', 'item:checks:2:30']);
    expect(errors).toEqual(['progress(item:checks)']);
    reportPhase(undefined, 'reading', 0);
    const clock = new FakeClock();
    const published: number[] = [];
    const sink = throttledSink((r) => { if (r.kind === 'item') published.push(r.position); else published.push(-1); }, clock)!;
    sink({ kind: 'phase', phase: 'recording', total: 25 });
    for (let i = 1; i <= 25; i += 1) { sink({ kind: 'item', phase: 'recording', label: `r${i}`, position: i, total: 25 }); clock.advance(30); }
    expect(published).toEqual([-1, 1, 5, 9, 13, 17, 21, 25]);
    published.length = 0;
    sink({ kind: 'phase', phase: 'recording', total: 3 });
    for (let i = 1; i <= 3; i += 1) sink({ kind: 'item', phase: 'recording', label: `r${i}`, position: i, total: 3 });
    expect(published).toEqual([-1, 1, 2, 3]);
  });
});
