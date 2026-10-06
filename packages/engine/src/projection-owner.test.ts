import { describe, expect, it } from 'vitest';
import { asSessionId, FakeClock } from '@rotaris/kernel';
import type { SessionSnapshot, TranscriptIncrement, TranscriptRow } from '@rotaris/contracts';
import { ProjectionOwner, SequenceCounters, type Publisher } from './index.js';
import type { WireEvent } from './events.js';

/**
 * ADR-0043 (Part R, the twenty-eighth defect): a commit that changes the whole-session record — a child event, a tool
 * event — publishes it; a commit that changes nothing a surface reads from the record does not.
 */
describe('ProjectionOwner — the record is published when the ledger or the tool ring changed it', () => {
  const build = () => {
    const snapshots: SessionSnapshot[] = [];
    const increments: TranscriptIncrement[] = [];
    const publisher: Publisher = { snapshot: (p) => { snapshots.push(p); }, increment: (p) => { increments.push(p); } };
    const clock = new FakeClock();
    const owner = new ProjectionOwner({ sessionId: asSessionId('s1'), seq: new SequenceCounters(), timers: clock, publisher, readSession: () => ({ id: 's1' }) as unknown as SessionSnapshot['session'], readResident: () => [] });
    const event = (kind: string): WireEvent => ({ event: kind as WireEvent['event'], session_id: 's1', timestamp: '2026-09-05T10:00:00.000Z', schema_version: 1 } as WireEvent);
    return { owner, snapshots, increments, event, clock };
  };
  it('a child spawn, a child transition, a tool start and a tool finish each publish the record — coalesced to one per 80 ms tick; a permission decision does not; a save publishes at once', () => {
    const { owner, snapshots, event, clock } = build();
    for (const kind of ['child.spawn', 'child.transition', 'tool.start', 'tool.finish']) { owner.onCommitted({ kind: 'event', ordinal: 1, events: [{ ordinal: 1, event: event(kind), line: '' }] }); clock.advance(80); }
    expect(snapshots.length).toBe(4);
    owner.onCommitted({ kind: 'event', ordinal: 5, events: [{ ordinal: 5, event: event('permission.decision'), line: '' }] });
    clock.advance(200);
    expect(snapshots.length).toBe(4);
    // A burst of tool events within one tick is one read and one publication.
    for (let i = 0; i < 6; i += 1) owner.onCommitted({ kind: 'event', ordinal: 10 + i, events: [{ ordinal: 10 + i, event: event(i % 2 === 0 ? 'tool.start' : 'tool.finish'), line: '' }] });
    expect(snapshots.length).toBe(4);
    clock.advance(80);
    expect(snapshots.length).toBe(5);
    // A save publishes at once and clears a pending record tick.
    owner.onCommitted({ kind: 'event', ordinal: 20, events: [{ ordinal: 20, event: event('child.transition'), line: '' }] });
    owner.onCommitted({ kind: 'save' });
    expect(snapshots.length).toBe(6);
    clock.advance(200);
    expect(snapshots.length).toBe(6);
    // The numbers stay one series (REQ-MONITOR-214).
    expect(snapshots.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

/**
 * REQ-MONITOR-214: an increment carries "the lowest row index whose content may still change, the rows from that index
 * onward", and the replica replaces everything from that index with what the increment carries. H5 of the final duress
 * autopsy at 27a5127 (docs/defects/fixed/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md): a row that
 * settled after ANOTHER agent appended rows behind it was published alone, and the view dropped those rows.
 */
describe('ProjectionOwner — a row committed below the last held row is published with every row after it', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 6, 2, 15, 0) + s * 1000).toISOString();
  const coordinator = { persona: 'orchestrator', name: 'orchestrator' };
  const child = { persona: 'coding-agent', name: 'wave3-verify-result' };
  const row = (index: number, who: object, over: Partial<TranscriptRow>): TranscriptRow =>
    ({ index, at: at(index), ts: at(index).slice(11, 19), body: `row ${index}`, kind: 'agent', settled: true, ...who, ...over }) as TranscriptRow;
  const thinking = (index: number, who: object, settled: boolean) => row(index, who, { kind: 'thinking', settled, ...(settled ? { durationMs: 1709 } : {}) });
  const tool = (index: number, who: object, name: string, settled: boolean) =>
    row(index, who, { kind: 'tool', toolName: name, body: name, callKey: `c${index}`, settled, toolStatus: settled ? 'ok' : 'running', ...(settled ? { durationMs: 5 } : {}) });

  /** The receiving side's rule (REQ-MONITOR-214, `ui-core/replica.ts`): rows below the index untouched, the increment's rows from it. */
  const apply = (held: readonly TranscriptRow[], p: TranscriptIncrement): TranscriptRow[] =>
    [...held.filter((r) => r.index < p.earliestChanged), ...[...p.rows].sort((a, b) => a.index - b.index)];

  it('the duress run\'s order — the child\'s row settled under the coordinator\'s wait, the wait settled under the child\'s rows — leaves the view holding every recorded row', () => {
    const increments: TranscriptIncrement[] = [];
    const owner = new ProjectionOwner({
      sessionId: asSessionId('s1'), seq: new SequenceCounters(), timers: new FakeClock(),
      publisher: { snapshot: () => undefined, increment: (p) => { increments.push(p); } },
      readSession: () => ({ id: 's1' }) as unknown as SessionSnapshot['session'], readResident: () => [],
    });
    const recorded = new Map<number, TranscriptRow>();
    const commit = (r: TranscriptRow) => { recorded.set(r.index, r); owner.onCommitted({ kind: 'row', row: r }); };
    commit(row(0, {}, { kind: 'user', body: 'go', persona: undefined, name: undefined }));
    commit(tool(1, coordinator, 'delegate', true));
    commit(thinking(2, coordinator, false));          // the coordinator's reasoning, still streaming (row 491)
    commit(thinking(3, child, false));                // the child's first row, appended unsettled (492)
    commit(thinking(2, coordinator, true));           // 491 settles UNDER the child's row
    commit(tool(4, coordinator, 'wait_for_tasks', false)); // the wait, running for the child's whole life (493)
    commit(thinking(3, child, true));                 // 492 settles UNDER the wait
    let next = 5;
    for (let k = 0; k < 10; k += 1) {                 // the child's 89 rows, in small (494 to 582)
      commit(tool(next, child, 'terminal', false)); commit(tool(next, child, 'terminal', true)); next += 1;
      commit(thinking(next, child, false)); commit(thinking(next, child, true)); next += 1;
    }
    commit(tool(4, coordinator, 'wait_for_tasks', true)); // the wait settles UNDER all of them (event 2248)
    commit(thinking(next, coordinator, true));        // 583
    commit(row(next + 1, coordinator, { kind: 'agent', body: 'The verifier ran out of time.' })); // 584

    let view: TranscriptRow[] = [];
    for (const p of increments) {
      view = apply(view, p);
      // After every publication the view holds every row recorded so far, each in its latest recorded form.
      const upTo = Math.max(...view.map((r) => r.index), p.earliestChanged);
      expect(view.map((r) => r.index), `after the publication from ${p.earliestChanged}`).toEqual([...recorded.keys()].filter((i) => i <= upTo).sort((a, b) => a - b));
    }
    expect(view).toEqual([...recorded.values()].sort((a, b) => a.index - b.index));
  });

  it('an append, and a settle of the last row, still publish that one row', () => {
    const increments: TranscriptIncrement[] = [];
    const owner = new ProjectionOwner({
      sessionId: asSessionId('s1'), seq: new SequenceCounters(), timers: new FakeClock(),
      publisher: { snapshot: () => undefined, increment: (p) => { increments.push(p); } },
      readSession: () => ({ id: 's1' }) as unknown as SessionSnapshot['session'], readResident: () => [],
    });
    owner.onCommitted({ kind: 'row', row: tool(0, child, 'read_file', false) });
    owner.onCommitted({ kind: 'row', row: tool(0, child, 'read_file', true) });
    owner.onCommitted({ kind: 'row', row: tool(1, child, 'glob', false) });
    expect(increments.map((p) => [p.earliestChanged, p.rows.map((r) => r.index)])).toEqual([[0, [0]], [0, [0]], [1, [1]]]);
    // A row committed below the last carries the rows after it, in index order.
    owner.onCommitted({ kind: 'row', row: tool(0, child, 'read_file', true) });
    expect(increments.at(-1)!.earliestChanged).toBe(0);
    expect(increments.at(-1)!.rows.map((r) => r.index)).toEqual([0, 1]);
  });
});
