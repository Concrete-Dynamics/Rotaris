import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintWorkspaceId } from '@rotaris/kernel';
import type { Actor, BoardAction, ReqId } from '@rotaris/contracts';
import { DeliveryDal, forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { INTERRUPTED, createDeliveryReader, createDeliveryWriter, createQueueSettings, createTransitions, reapStaleRuns, type BoardInput, type DeliveryReader, type DeliveryWriter, type RequirementNow } from './index.js';
import { fixtureParse, fixtureReport } from './fixture-store.js';

/**
 * `pnpm delivery-proof` (Part AK): the nine assertions the plan states, each an `it` whose title the proof script
 * reads back from vitest's JSON report. Real store, real transition function, the engine faked around the fixture
 * parse (`fixture-store.ts`) until Part AJ's fixture store is merged.
 */
const A = mintWorkspaceId('000000000000000000000000000000ad');
const USER: Actor = { kind: 'user', person: 'owner' };
let root: string;
let r: ResolvedStore;
let reader: DeliveryReader;
let writer: DeliveryWriter;
let clock: FakeClock;
const parse = fixtureParse();
const report = fixtureReport();
const nowOf = (id: ReqId): RequirementNow => { const x = parse.records.find((q) => q.id === id)!; return { id, canonicalHash: x.canonicalHash, lifecycle: x.status, isEpic: x.isEpic }; };
let generation = 0;
const input = (inFlight: ReadonlyMap<ReqId, BoardAction> = new Map()): BoardInput => ({ workspace: 'C:\\ws', generation, producedAt: '2026-09-09T10:00:00.000Z', parse, report, queue: { ...reader.queue(), stopped: false }, analysisEnabled: false, inFlight, source: { writable: false, canCreate: false } });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-proof-'));
  r = openWorkspaceStore(root, A, 'C:\\ws');
  clock = new FakeClock();
  const queue = createQueueSettings();
  reader = createDeliveryReader(r.db, { workspaceKey: 'C:\\ws', queue });
  writer = createDeliveryWriter(reader, createTransitions(r.db, { wall: clock, workspaceKey: 'C:\\ws', queue }));
  generation = 1;
});
afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); });

describe('delivery-proof', () => {
  it('fixture store + empty delivery: every card in backlog', () => {
    const b = reader.board(input());
    expect(b.cards).toHaveLength(7);
    expect(b.cards.every((c) => c.column === 'backlog')).toBe(true);
    expect(b.source.kind).toBe('store');
  });
  it('release moves to ready and writes exactly one history + one audit row in one transaction', async () => {
    const dal = new DeliveryDal(r.db);
    const out = await writer.transition('REQ-101', 'release', USER, { now: nowOf('REQ-101') });
    expect(out).toEqual({ ok: true, value: { id: 'REQ-101', from: 'backlog', to: 'ready', startsRun: true, historyEntry: 1 } });
    expect(dal.historyOf('REQ-101')).toHaveLength(1);
    expect(dal.auditAll()).toHaveLength(1);
    expect(reader.board(input()).cards.find((c) => c.id === 'REQ-101')!.column).toBe('ready');
    // One transaction: a fault at the audit insert leaves state and history unwritten too.
    r.db.exec("CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON delivery_audit BEGIN SELECT RAISE(ABORT, 'injected fault'); END;");
    await expect(writer.transition('REQ-102', 'release', USER, { now: nowOf('REQ-102') })).rejects.toThrow(/injected fault/);
    r.db.exec('DROP TRIGGER temp.fail_audit');
    expect(dal.read('REQ-102')).toBeUndefined();
    expect(dal.historyOf('REQ-102')).toHaveLength(0);
    expect(dal.auditAll()).toHaveLength(1);
  });
  it('a second action on the same requirement while one is in flight is refused with the stated reason and writes nothing', async () => {
    const dal = new DeliveryDal(r.db);
    let release!: () => void;
    const first = writer.transition('REQ-101', 'release', USER, { now: nowOf('REQ-101') }, { beforeCommit: () => new Promise<void>((res) => { release = res; }) });
    await Promise.resolve();
    const second = await writer.transition('REQ-101', 'hold', USER, { now: nowOf('REQ-101') }, { payload: { reason: 'x' } });
    expect(second).toEqual({ ok: false, error: { reason: 'An action on REQ-101 is already in flight; wait for it to settle before starting another (REQ-TRACE-388).' } });
    expect(dal.countAudit()).toBe(0);
    expect(reader.board(input(new Map([['REQ-101', 'release']]))).cards.find((c) => c.id === 'REQ-101')!.inFlight).toEqual({ action: 'release', label: 'Releasing…' });
    release();
    expect((await first).ok).toBe(true);
    expect(dal.countAudit()).toBe(1);
  });
  it('hold/resume round-trips to the origin column', async () => {
    await writer.transition('REQ-101', 'release', USER, { now: nowOf('REQ-101') });
    const held = await writer.transition('REQ-101', 'hold', USER, { now: nowOf('REQ-101') }, { payload: { reason: 'Waiting on the licence decision.' } });
    expect(held.ok && held.value.to).toBe('blocked');
    const b1 = reader.board(input());
    expect(b1.cards.find((c) => c.id === 'REQ-101')).toMatchObject({ column: 'blocked', returnTo: 'ready', health: 'blocked' });
    expect(b1.blocked).toEqual([{ id: 'REQ-101', reason: 'Waiting on the licence decision.', returnTo: 'ready' }]);
    const resumed = await writer.transition('REQ-101', 'resume', USER, { now: nowOf('REQ-101') });
    expect(resumed.ok && resumed.value.to).toBe('ready');
    const b2 = reader.board(input());
    expect(b2.cards.find((c) => c.id === 'REQ-101')!.column).toBe('ready');
    expect(b2.cards.find((c) => c.id === 'REQ-101')!.returnTo).toBeUndefined();
    expect(b2.blocked).toEqual([]);
  });
  it('accept refused when the canonical hash differs from the snapshot', async () => {
    const dal = new DeliveryDal(r.db);
    await writer.transition('REQ-101', 'release', USER, { now: nowOf('REQ-101') });
    writer.recordRunStarted('REQ-101', 'u1', 'sess-1', null, 'autonomous+unsandboxed', { now: nowOf('REQ-101') });
    writer.recordRunEnded('REQ-101', 'u1', 'completed', 'finished', { now: nowOf('REQ-101') });
    const moved = { ...nowOf('REQ-101'), canonicalHash: 'd'.repeat(32) };
    const refused = await writer.transition('REQ-101', 'accept', USER, { now: moved });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.reason).toMatch(/changed since the snapshot its run was taken against/);
    expect(dal.historyOf('REQ-101').map((h) => h.action)).toEqual(['release', 'run-started', 'run-ended']);
    expect(reader.board(input()).cards.find((c) => c.id === 'REQ-101')!.column).toBe('review');
    const accepted = await writer.transition('REQ-101', 'accept', USER, { now: nowOf('REQ-101') });
    expect(accepted.ok && accepted.value.to).toBe('done');
  });
  it('a reader handle offers no write method (structural test over the module graph)', () => {
    expect(Object.keys(reader).sort()).toEqual(['board', 'history', 'queue', 'reachable', 'requirement', 'runningRuns', 'runs']);
    for (const k of Object.keys(reader)) expect(k).not.toMatch(/^(transition|record|answer|set|write)/);
    expect(writer.declares.comparesSpecificationHash).toBe(true);
  });
  it('projection value identical across two reads of one generation', () => {
    const a = reader.board(input());
    const b = reader.board(input());
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.generation).toBe(1);
  });
  it('a refused move carries the engine\'s words and what the source column can reach, without recursing (defect 46)', () => {
    // The forty-sixth defect: a refused probe enumerated the reachable targets by asking `decide`, whose refusals enumerated
    // again — the first refused probe overflowed the stack. The enumeration is now a probe that carries no enumeration of
    // its own (REQ-TRACE-391/394); this pins it against a real store with a requirement that has no delivery row yet.
    const at = '2026-09-09T10:00:00.000Z';
    const refused = reader.reachable('REQ-101', 'backlog', 'done', nowOf('REQ-101'), USER, at);
    expect(refused.reachable).toBe(false);
    expect(refused.reason).toMatch(/From backlog it can reach: ready\./);
    expect(refused.reachableFromSource).toEqual(['ready']);
    const offered = reader.reachable('REQ-101', 'backlog', 'ready', nowOf('REQ-101'), USER, at);
    expect(offered).toMatchObject({ reachable: true, confirm: true, reachableFromSource: ['ready'] });
    expect(offered.consequence).toMatch(/\S/);
  });
  it('reap after a simulated dead run host reports "interrupted, work retained"', async () => {
    await writer.transition('REQ-101', 'release', USER, { now: nowOf('REQ-101') });
    writer.recordRunStarted('REQ-101', 'u1', 'sess-dead', { ref: 'wt-1', path: 'C:\\ws\\.rotaris\\req\\REQ-101-u1', branch: 'req/REQ-101/u1' }, 'autonomous+unsandboxed', { now: nowOf('REQ-101') });
    expect(reader.board(input()).cards.find((c) => c.id === 'REQ-101')!.column).toBe('running');
    const results = reapStaleRuns(reader, writer, new Set(['sess-alive']), (id) => nowOf(id).canonicalHash);
    expect(results).toHaveLength(1);
    expect(results[0]!.statement).toMatch(new RegExp(`^${INTERRUPTED}`));
    expect(results[0]!.held).toBe(true);
    const card = reader.board(input()).cards.find((c) => c.id === 'REQ-101')!;
    expect(card.column).toBe('blocked');
    expect(card.returnTo).toBe('ready');
    expect(card.run).toMatchObject({ sessionId: 'sess-dead', unit: 'u1', interrupted: true });
    expect(card.blocker?.kind).toBe('run-failure');
    expect(card.blocker?.answerPaths).toEqual(['inspect', 'resume']);
    // Work retained: the worktree row is untouched.
    expect(reader.runs('REQ-101')[0]).toMatchObject({ status: 'interrupted', worktreePath: 'C:\\ws\\.rotaris\\req\\REQ-101-u1', branch: 'req/REQ-101/u1' });
    // Nothing reset to the first column; a second reap finds nothing.
    expect(reapStaleRuns(reader, writer, new Set(), (id) => nowOf(id).canonicalHash)).toEqual([]);
  });
});
