/**
 * The projection runs once per change of its inputs, not once per render (REQ-CHAT-055, REQ-CHAT-154, ADR-0046 step 4).
 *
 * The R-048 measurement round found the append cost at depth in script: three to four synchronous renders per
 * increment, each re-projecting the whole resident window. This pins the mechanism the repair rests on — a render
 * whose inputs are the same objects and values projects nothing — and the boundary of the memo: every input step 4
 * reads is a key, so a change to any one of them projects again.
 */
import { describe, expect, it } from 'vitest';
import type { ApprovalPayload, QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { CAP_DEFAULTS, projectDisplay, type ProjectOptions } from './project.js';
import { changedFrom, createProjector } from './projector.js';

function rows(total: number): TranscriptRow[] {
  return Array.from({ length: total }, (_, i) => {
    const at = new Date(Date.UTC(2026, 8, 6, 9, 0, Math.min(59, i % 60), 0)).toISOString();
    return { index: i, at, ts: at.slice(11, 19), persona: 'orchestrator', name: 'orchestrator', settled: true, kind: i === 0 ? 'user' : 'agent', body: `row ${i}` } as unknown as TranscriptRow;
  });
}

const options = (over: Partial<ProjectOptions> = {}): ProjectOptions => ({
  rows: rows(12), running: false, groupTools: true, showReasoning: false, caps: CAP_DEFAULTS,
  expanded: new Set<string>(), pendingQuestions: [], pendingApprovals: [], ...over,
});

describe('REQ-CHAT-055: the projector projects once per change of its inputs', () => {
  it('answers the same projection, without projecting, while every input is the same object or value', () => {
    let calls = 0;
    const projector = createProjector((o) => { calls += 1; return projectDisplay(o); });
    const o = options();
    const first = projector.project(o);
    expect(first.display.length).toBe(12);
    expect(first.places.length).toBe(12);
    // The three renders an increment causes beside its own — the measurement pass, the pin's scroll event, a
    // whole-session update — hand the projector the same inputs, and get the same arrays back.
    for (let render = 0; render < 3; render += 1) expect(projector.project({ ...o })).toBe(first);
    expect(calls).toBe(1);
    expect(projector.projections).toBe(1);
  });

  it('reads the pending lists and the caps by content, because the view hands it fresh wrappers of the same values', () => {
    const projector = createProjector();
    const o = options();
    const first = projector.project(o);
    // `session.pendingApprovals ?? []` is a new empty array on every render that has none; `caps` may be rebuilt.
    expect(projector.project({ ...o, pendingQuestions: [], pendingApprovals: [], caps: { ...CAP_DEFAULTS } })).toBe(first);
    const approval = { requestId: 'a1', title: 'Write NOTES.md' } as unknown as ApprovalPayload;
    const withOne = projector.project({ ...o, pendingApprovals: [approval] });
    expect(withOne).not.toBe(first);
    expect(projector.project({ ...o, pendingApprovals: [approval] })).toBe(withOne);
    expect(projector.projections).toBe(2);
    // A cap that changed by value is a change, however it is wrapped.
    projector.project({ ...o, pendingApprovals: [approval], caps: { ...CAP_DEFAULTS, tool_result_lines: 3 } });
    expect(projector.projections).toBe(3);
  });

  it('projects again when the rows are a new array — which is how the replica delivers every increment', () => {
    const projector = createProjector();
    const o = options();
    const before = projector.project(o);
    const after = projector.project({ ...o, rows: [...o.rows, ...rows(13).slice(12)] });
    expect(after).not.toBe(before);
    expect(after.display.length).toBe(13);
    expect(projector.projections).toBe(2);
  });

  it('projects again for a change to any other input step 4 reads, and for nothing else', () => {
    const projector = createProjector();
    const o = options();
    projector.project(o);
    const changes: Partial<ProjectOptions>[] = [
      { expanded: new Set(['row:3']) },
      { pendingQuestions: [{ request_id: 'q1', steps: [] } as unknown as QuestionPrompt] },
      { pendingApprovals: [{ requestId: 'a1' } as unknown as ApprovalPayload] },
      { caps: { ...CAP_DEFAULTS, show_tool_inputs: false } },
      { running: true },
      { groupTools: false },
      { showReasoning: true },
      { questionAgent: 'reviewer' },
    ];
    let expected = 1;
    for (const change of changes) {
      projector.project({ ...o, ...change });
      expected += 1;
      expect(projector.projections).toBe(expected);
    }
    // Back to the original inputs: the memo holds only the LAST projection, so this is one more, and then none.
    projector.project(o);
    projector.project(o);
    expect(projector.projections).toBe(expected + 1);
  });

  it('projects what projectDisplay projects — the memo changes how often, never what', () => {
    const projector = createProjector();
    const o = options({ running: true, pendingApprovals: [{ requestId: 'a1', title: 'Write NOTES.md' } as unknown as ApprovalPayload] });
    expect(projector.project(o).display).toEqual(projectDisplay(o));
  });

  describe('the bounded form, with the earliest-changed row read off the arrays', () => {
    const tool = (i: number, status: string, settled: boolean): TranscriptRow => {
      const at = new Date(Date.UTC(2026, 8, 6, 9, 1, Math.min(59, i % 60), 0)).toISOString();
      return { index: i, at, ts: at.slice(11, 19), persona: 'orchestrator', name: 'orchestrator', settled, kind: 'tool', body: 'read_file', toolName: 'read_file', toolStatus: status, callKey: `call-${i}`, startedAt: at, input: '{"path":"README.md"}', output: settled ? `read ${i}` : undefined } as unknown as TranscriptRow;
    };

    it('finds where the update began from the row objects the replica kept, and refuses the shapes it cannot bound', () => {
      const base = rows(12);
      const o = options({ rows: base });
      // An append: the earlier rows are the same objects, so the change begins at the first new one.
      expect(changedFrom(o, { ...o, rows: [...base, ...rows(13).slice(12)] })).toBe(12);
      // The last row replaced in place (a growth tick, a settle): the change begins at it.
      const grown = [...base.slice(0, 11), { ...base[11]!, body: 'row 11 grew' } as TranscriptRow];
      expect(changedFrom(o, { ...o, rows: grown })).toBe(11);
      // An earlier row replaced: the change begins there, whatever follows.
      const earlier = [...base.slice(0, 4), { ...base[4]!, body: 'row 4 changed' } as TranscriptRow, ...base.slice(5)];
      expect(changedFrom(o, { ...o, rows: earlier })).toBe(4);
      // Rows removed, older rows placed above, or nothing but another input changed: the whole window.
      expect(changedFrom(o, { ...o, rows: base.slice(0, 10) })).toBeNull();
      expect(changedFrom(o, { ...o, rows: [...rows(3).map((r) => ({ ...r, index: r.index - 3 }) as TranscriptRow), ...base] })).toBeNull();
      expect(changedFrom(o, { ...o, rows: [...base], running: true })).toBeNull();
      expect(changedFrom(o, { ...o, rows: base })).toBeNull();
    });

    it('agrees with the whole-state projection across a run — appends, growth, settles, a paged-in span, a truncation', () => {
      const projector = createProjector();
      let held = rows(12);
      let o = options({ rows: held, running: true });
      const step = (next: TranscriptRow[], expectIncremental: boolean, over: Partial<ProjectOptions> = {}) => {
        const before = projector.incrementals;
        held = next;
        o = { ...o, rows: held, ...over };
        const { display, places } = projector.project(o);
        expect(display).toEqual(projectDisplay(o));
        expect(places.length).toBe(display.length);
        expect(projector.incrementals - before).toBe(expectIncremental ? 1 : 0);
      };
      projector.project(o);
      step([...held, tool(12, 'running', false)], true);                                   // a tool row appended, live
      step([...held.slice(0, 12), tool(12, 'ok', true)], true);                             // it settles in place
      step([...held, tool(13, 'running', false)], true);                                    // a second call, folding with the first
      step([...held.slice(0, 13), tool(13, 'ok', true), ...rows(15).slice(14)], true);      // it settles and an agent row lands
      step([...held.slice(0, 14), { ...held[14]!, body: 'grown' } as TranscriptRow], true); // the last row grows
      step([...rows(3).map((r) => ({ ...r, index: r.index - 3 }) as TranscriptRow), ...held], false); // older rows paged in above
      step(held.slice(0, 10), false);                                                       // a truncation
      step([...held, ...rows(11).slice(10)], true);                                         // appending again after it
      step(held, false, { running: false });                                                // the run ends: another input
      expect(projector.projections).toBe(10);
      expect(projector.incrementals).toBe(6);
    });
  });
});
