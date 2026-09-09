import { describe, expect, it } from 'vitest';
import type { BoardAction, ReqId } from '@rotaris/contracts';
import type { DeliveryReadRow, DeliveryRecord } from '@rotaris/store';
import { dedupeAlerts, healthOf, projectBoard, type ProjectionInput } from './projection.js';
import { fixtureParse, fixtureRecord, fixtureReport } from './fixture-store.js';

/**
 * The board projection (Part AK; REQ-TRACE-232..258, 274, 282, 348, 380, 478): one immutable value, every card in
 * exactly one column, health from the three inputs, alerts in the fixed order de-duplicated on the sentence, the
 * four relation tokens the document format can express, epic progress over the non-deprecated population, the
 * queue in the scheduler's order with its reasons.
 */
const record = (state: string, over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({ schemaVersion: 1, state, returnTo: null, acceptedHash: null, snapshotHash: null, snapshotAt: null, acceptedAt: null, updatedAt: '2026-09-09T09:00:00.000Z', units: 0, ...over });
const row = (id: ReqId, state: string, over: Partial<DeliveryRecord> = {}): DeliveryReadRow => ({ kind: 'record', id, record: record(state, over), transitionsEver: 1 });
const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  workspace: 'C:\\ws', generation: 1, producedAt: '2026-09-09T10:00:00.000Z', parse: fixtureParse(), report: fixtureReport(),
  rows: [], runs: [], openBlockers: [], queue: { automatic: false, concurrency: 2, stopped: false }, analysisEnabled: false, inFlight: new Map<ReqId, BoardAction>(), source: { writable: false, canCreate: false },
  ...over,
});

describe('projectBoard', () => {
  it('REQ-TRACE-235: with an empty delivery store every card is in backlog, exactly one column each, sorted by identifier', () => {
    const b = projectBoard(input());
    expect(b.cards.map((c) => c.id)).toEqual(['REQ-100', 'REQ-101', 'REQ-102', 'REQ-103', 'REQ-104', 'REQ-105', 'REQ-106']);
    expect(b.cards.every((c) => c.column === 'backlog')).toBe(true);
    expect(b.source).toEqual({ kind: 'store', dir: 'docs/requirements', writable: false, canCreate: false });
    expect(b.blocked).toEqual([]);
    expect(b.epics).toEqual([{ id: 'REQ-100', title: 'The epic', done: 0, total: 5, children: ['REQ-101', 'REQ-102', 'REQ-103', 'REQ-104', 'REQ-105', 'REQ-106'] }]);
  });
  it('REQ-TRACE-348/380: the value is deep-frozen and the same inputs give an equal value', () => {
    const a = projectBoard(input());
    const b = projectBoard(input());
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.cards)).toBe(true);
    expect(Object.isFrozen(a.cards[0])).toBe(true);
    expect(Object.isFrozen(a.cards[0]!.facts)).toBe(true);
    expect(a).toEqual(b);
    expect(() => { (a.cards as unknown as unknown[]).push(1); }).toThrow();
  });
  it('REQ-TRACE-252/254: health follows the documented precedence and is the projection\'s alone', () => {
    const b = projectBoard(input({
      rows: [row('REQ-101', 'done', { acceptedHash: fixtureRecord('REQ-101').canonicalHash }), row('REQ-102', 'done', { acceptedHash: 'x'.repeat(32) }), row('REQ-104', 'blocked', { returnTo: 'ready' })],
      openBlockers: [{ req_id: 'REQ-104', seq: 1, kind: 'stated', reason: 'Waiting.', options: '[]', blocking_ids: '[]', run_unit: null, raised_at: 't', answered_at: null, answer: null }],
    }));
    const h = Object.fromEntries(b.cards.map((c) => [c.id, c.health]));
    expect(h).toEqual({ 'REQ-100': 'healthy', 'REQ-101': 'healthy', 'REQ-102': 'needs-update', 'REQ-103': 'incomplete-traceability', 'REQ-104': 'blocked', 'REQ-105': 'incomplete-traceability', 'REQ-106': 'deprecated' });
    // Without the moved accepted hash REQ-102's failing verification shows through.
    expect(healthOf(fixtureRecord('REQ-102'), 'review', null, fixtureReport().evidence['REQ-102']!, ['implementation-trace', 'covering-test', 'verification'])).toBe('verification-failed');
    // The epic owes nothing (no trace, no test, no verification recorded for it) — it is healthy, never incomplete.
    expect(b.cards[0]!.health).toBe('healthy');
  });
  it('REQ-TRACE-245/246: alerts in the fixed order, de-duplicated on the sentence with the earlier spelling kept', () => {
    const b = projectBoard(input({
      rows: [row('REQ-102', 'blocked', { returnTo: 'review', acceptedHash: 'x'.repeat(32), snapshotHash: 'y'.repeat(32) })],
      openBlockers: [
        { req_id: 'REQ-102', seq: 1, kind: 'dependency', reason: 'REQ-101 is not yet delivered.', options: '[]', blocking_ids: '["REQ-101"]', run_unit: null, raised_at: 't', answered_at: null, answer: null },
        { req_id: 'REQ-102', seq: 2, kind: 'stated', reason: 'Waiting on legal.', options: '[]', blocking_ids: '[]', run_unit: null, raised_at: 't', answered_at: null, answer: null },
      ],
    }));
    const c = b.cards.find((x) => x.id === 'REQ-102')!;
    expect(c.alerts).toEqual([
      `Specification changed since it was accepted (accepted xxxxxxxx, now ${fixtureRecord('REQ-102').canonicalHash.slice(0, 8)}).`,
      'Blocked: Waiting on legal.',
      'Blocked (dependency): REQ-101 is not yet delivered.',
      'Missing evidence: covering-test.',
      'Verification failing: verification.',
    ]);
    expect(dedupeAlerts(['Blocked: Same sentence.', 'Blocked (stated): Same sentence.', 'Blocked (stated): Other.'])).toEqual(['Blocked: Same sentence.', 'Blocked (stated): Other.']);
    // The card's blocker is the latest open one, with REQ-TRACE-449's precedence; the blocked summary carries the origin.
    expect(c.blocker).toEqual({ kind: 'stated', reason: 'Waiting on legal.', answerPaths: ['resume'] });
    expect(b.blocked).toEqual([{ id: 'REQ-102', reason: 'Waiting on legal.', returnTo: 'review' }]);
  });
  it('REQ-TRACE-274: the four relation tokens with a data source, sorted by identifier order', () => {
    const b = projectBoard(input());
    const rel = (id: ReqId) => b.cards.find((c) => c.id === id)!.relations;
    expect(rel('REQ-100')).toEqual([101, 102, 103, 104, 105, 106].map((n) => ({ kind: 'children', id: `REQ-${n}` })));
    expect(rel('REQ-101')).toEqual([{ kind: 'parent', id: 'REQ-100' }, { kind: 'derived-requirements', id: 'REQ-105' }]);
    expect(rel('REQ-105')).toEqual([{ kind: 'parent', id: 'REQ-100' }, { kind: 'derived-from', id: 'REQ-101' }]);
    const kinds = new Set(b.cards.flatMap((c) => c.relations.map((r) => r.kind)));
    expect([...kinds].sort()).toEqual(['children', 'derived-from', 'derived-requirements', 'parent']);
  });
  it('REQ-TRACE-282: epic progress counts the non-deprecated children; done is the terminal column', () => {
    const b = projectBoard(input({ rows: [row('REQ-101', 'done'), row('REQ-106', 'done')] }));
    expect(b.epics[0]).toMatchObject({ done: 1, total: 5 });
  });
  it('REQ-TRACE-243: optional facts in the fixed order, omitted cleanly when absent', () => {
    const b = projectBoard(input({ rows: [row('REQ-101', 'ready')] }));
    expect(b.cards.find((c) => c.id === 'REQ-101')!.facts.map((f) => f.label)).toEqual(['Priority', 'Epic', 'Source', 'Last change', 'Units']);
    expect(b.cards.find((c) => c.id === 'REQ-100')!.facts.map((f) => f.label)).toEqual(['Source', 'Units']);
  });
  it('REQ-TRACE-478/483: the queue in the scheduler\'s order with the engine\'s reasons, defaults manual and 2', () => {
    const rows = [row('REQ-101', 'ready', { units: 1 }), row('REQ-102', 'ready'), row('REQ-104', 'ready'), row('REQ-103', 'running', { units: 1 })];
    const runs = [{ req_id: 'REQ-103', unit: 'u1', session_id: 's1', worktree_ref: null, permissions: '', status: 'running', stage: 'implementing', outcome: null, started_at: 't', ended_at: null }];
    const manual = projectBoard(input({ rows, runs }));
    expect(manual.queue.automatic).toBe(false);
    expect(manual.queue.concurrency).toBe(2);
    expect(manual.queue.entries).toEqual([
      { id: 'REQ-103', unit: 'u1', state: 'executing' },
      { id: 'REQ-102', unit: 'u1', state: 'deferred', reason: 'Automatic scheduling is off; nothing begins until you release it from the queue.' },
      { id: 'REQ-101', unit: 'u2', state: 'deferred', reason: 'Automatic scheduling is off; nothing begins until you release it from the queue.' },
      { id: 'REQ-104', unit: 'u1', state: 'deferred', reason: 'Automatic scheduling is off; nothing begins until you release it from the queue.' },
    ]);
    const auto = projectBoard(input({ rows, runs, queue: { automatic: true, concurrency: 2, stopped: false } }));
    expect(auto.queue.entries.map((e) => e.state)).toEqual(['executing', 'next', 'deferred', 'deferred']);
    expect(auto.queue.entries[2]!.reason).toBe('Waiting for a unit slot: 1 of 2 in use.');
    const stopped = projectBoard(input({ rows, runs, queue: { automatic: true, concurrency: 2, stopped: true } }));
    expect(stopped.queue.entries[1]!.reason).toMatch(/^The queue is stopped/);
    // REQ-TRACE-466 is Part AP's: `run` carries the stage, the session and the interrupted flag; waitingOnPerson is false here.
    expect(manual.cards.find((c) => c.id === 'REQ-103')!.run).toEqual({ sessionId: 's1', unit: 'u1', waitingOnPerson: false, stage: 'implementing', interrupted: false });
  });
  it('REQ-CONFIG-192: an unsupported or unreadable record is listed with its history unavailable for that reason, and its neighbours read normally', () => {
    const b = projectBoard(input({ rows: [row('REQ-101', 'ready'), { kind: 'unsupported', id: 'REQ-102', version: 2, raw: '{}' }, { kind: 'unreadable', id: 'REQ-103', version: 'one', raw: '{}' }] }));
    expect(b.cards.find((c) => c.id === 'REQ-102')!.alerts).toContain('Delivery record unsupported (schema version 2); its delivery history is unavailable for that reason.');
    expect(b.cards.find((c) => c.id === 'REQ-103')!.alerts.some((a) => /^Delivery record unreadable/.test(a))).toBe(true);
    expect(b.cards.find((c) => c.id === 'REQ-102')!.column).toBe('backlog');
    expect(b.cards.find((c) => c.id === 'REQ-101')!.column).toBe('ready');
  });
  it('REQ-TRACE-231/498: no parse yields `source: none` with the failure stated in parseErrors and no cards', () => {
    const b = projectBoard(input({ parse: undefined, report: undefined, parseFailure: { kind: 'failed', what: 'the traceability engine', cause: 'not merged' } }));
    expect(b.source).toEqual({ kind: 'none' });
    expect(b.cards).toEqual([]);
    expect(b.parseErrors).toEqual([{ path: 'C:\\ws', message: 'the traceability engine failed: not merged' }]);
  });
  it('REQ-TRACE-388: an in-flight action is rendered with its label', () => {
    const b = projectBoard(input({ inFlight: new Map([['REQ-101', 'release' as BoardAction]]) }));
    expect(b.cards.find((c) => c.id === 'REQ-101')!.inFlight).toEqual({ action: 'release', label: 'Releasing…' });
  });
});
