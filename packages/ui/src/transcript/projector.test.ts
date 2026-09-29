/**
 * The projection runs once per change of its inputs, not once per render (REQ-CHAT-055, REQ-CHAT-154, ADR-0046 step 4).
 *
 * The R-048 measurement round found the append cost at depth in script: three to four synchronous renders per
 * increment, each re-projecting the whole resident window. This pins the mechanism the repair rests on — a render
 * whose inputs are the same objects and values projects nothing — and the boundary of the memo: every input step 4
 * reads is a key, so a change to any one of them projects again.
 */
import { describe, expect, it } from 'vitest';
import type { AgentRecord, ApprovalPayload, QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { projectIncrement } from '@rotaris/ui-core';
import { scopedRows } from '../TranscriptSurface.js';
import { CAP_DEFAULTS, projectDisplay, type ProjectOptions } from './project.js';
import { changedFrom, createProjector } from './projector.js';
import { placements } from './Row.js';
import type { DisplayRow } from './types.js';

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
      // The run ends. Until the 2026-09-29 round this was "another input" and projected the whole window; `settle` reads
      // `running` for the rows still streaming or marked running and no others, so it is bounded from the first of them —
      // here none remains, so only what follows the rows is projected again (REQ-CHAT-049, REQ-CHAT-055).
      step(held, true, { running: false });
      expect(projector.projections).toBe(10);
      expect(projector.incrementals).toBe(7);
    });

    it('REQ-CHAT-049 / REQ-CHAT-055: a run beginning or ending at 1,200 rows re-projects from the first row that settles with it, not the window', () => {
      // V8's CPU profile of the built app (2026-09-29, the defect note's "CPU profile" section) named the two whole-window
      // projections each run causes — `foldRuns` over every row when `running` flips — among the loaded side's extra
      // script. Neither flip changes a row that is neither streaming nor marked running.
      let calls = 0;
      let bounded: number | null = null;
      const projector = createProjector((o, incremental) => { calls += 1; bounded = incremental?.from ?? null; return projectDisplay(o, incremental); });
      const held = [...rows(1_200), tool(1_200, 'running', false), tool(1_201, 'ok', true)];
      const idle = options({ rows: held, running: false });
      projector.project(idle);
      const started = { ...idle, running: true };
      expect(projector.project(started).display).toEqual(projectDisplay(started));
      // The live call at 1,200 is the first row that settles with the run: the rows above it are projected as they were.
      expect(bounded).toBe(1_200);
      const settled = [...held.slice(0, 1_200), tool(1_200, 'ok', true), held[1_201]!];
      const ended = { ...started, rows: settled, running: false };
      expect(projector.project(ended).display).toEqual(projectDisplay(ended));
      expect(bounded).toBe(1_200);
      expect(calls).toBe(3);
      expect(projector.incrementals).toBe(2);
    });

    // Fix round 1 of R-062: the first form of `changedFrom` returned the next array's row index at the first differing
    // position even when the previous array's row there was GONE, and the bounded form kept the removed row.
    const indices = (display: readonly DisplayRow[]) => display.map((d) => (d.shape === 'row' ? `row:${d.row.index}` : d.shape === 'group' ? `group:${d.members.map((m) => m.index).join(',')}` : d.shape));
    // Negative indices are rows paged in above (REQ-CHAT-165); they take row 0's instants and keep their own index.
    const said = (i: number, name: string, over: Partial<TranscriptRow> = {}): TranscriptRow => ({ ...rows(Math.max(0, i) + 1)[Math.max(0, i)]!, index: i, body: `row ${i}`, name, persona: 'coder', kind: 'agent', ...over } as TranscriptRow);

    it('REQ-CHAT-069: switching "This task" from one agent to another draws the second agent\'s rows and none of the first\'s', () => {
      const all = [rows(1)[0]!, said(1, 'X'), said(2, 'Y'), said(3, 'Y')];
      const x = { id: 'x', name: 'X', persona: 'coder' } as unknown as AgentRecord;
      const y = { id: 'y', name: 'Y', persona: 'coder' } as unknown as AgentRecord;
      const projector = createProjector();
      const o = options({ rows: scopedRows(all, x) });
      expect(indices(projector.project(o).display)).toEqual(['row:0', 'row:1']);
      // The pane survives the switch (it has no key), so its projector holds X's projection when Y's rows arrive.
      const toY = { ...o, rows: scopedRows(all, y) };
      expect(changedFrom(o, toY)).toBeNull();
      expect(indices(projector.project(toY).display)).toEqual(['row:0', 'row:2', 'row:3']);
      expect(projector.project(toY).display).toEqual(projectDisplay(toY));
      // And back to "All activity": rows inserted below the previous end are not a shape the bounded form takes either.
      const toAll = { ...o, rows: all };
      expect(changedFrom(toY, toAll)).toBeNull();
      expect(projector.project(toAll).display).toEqual(projectDisplay(toAll));
      expect(projector.incrementals).toBe(0);
    });

    it('REQ-EVENTS-052: an increment that removes the row at its earliest-changed index while appending projects without it', () => {
      const held = rows(12);
      const projector = createProjector();
      const o = options({ rows: held });
      projector.project(o);
      // Row 5 removed, rows 6 to 11 re-sent, row 12 appended — the array is LONGER than before.
      const next = { ...o, rows: projectIncrement(held, 5, rows(13).slice(6)) };
      expect(next.rows.length).toBe(12);
      expect(changedFrom(o, next)).toBeNull();
      const { display } = projector.project(next);
      expect(indices(display)).not.toContain('row:5');
      expect(display).toEqual(projectDisplay(next));
      // A row replaced at its own index, with a later one removed behind it, is still bounded — and still right.
      const replaced = { ...next, rows: [...next.rows.slice(0, 7), { ...next.rows[7]!, body: 'row 8 changed' } as TranscriptRow, ...next.rows.slice(9)] };
      expect(changedFrom(next, replaced)).toBe(8);
      expect(projector.project(replaced).display).toEqual(projectDisplay(replaced));
      expect(projector.incrementals).toBe(1);
    });

    it('ADR-0046 step 4: a run member replaced in place by a row that no longer joins the run projects the window, losing none of the run', () => {
      const held = [rows(1)[0]!, tool(1, 'ok', true), tool(2, 'ok', true)];
      const projector = createProjector();
      const o = options({ rows: held });
      expect(indices(projector.project(o).display)).toEqual(['row:0', 'group:1,2']);
      const prose = { ...o, rows: [held[0]!, held[1]!, { ...rows(3)[2]!, kind: 'agent', body: 'now prose' } as TranscriptRow] };
      expect(changedFrom(o, prose)).toBe(2);
      expect(indices(projector.project(prose).display)).toEqual(['row:0', 'row:1', 'row:2']);
      expect(projector.project(prose).display).toEqual(projectDisplay(prose));
    });

    // Fix round 2 of R-062: `cleanCut` decided runs on the RAW rows while `foldRuns` folds the rows hygiene keeps, and
    // the prefix boundary could pass `from` when the rows at and after it were dropped. Both drew something the
    // whole-state form does not, on shapes the bounded form was taking.
    it('REQ-CHAT-048 / PD-CHAT-004: an append after a duplicate live reasoning row joins the run that row no longer interrupts', () => {
      const Y = (i: number, over: Partial<TranscriptRow>) => ({ ...said(i, 'Y'), ...over } as TranscriptRow);
      const held = [
        rows(1)[0]!,
        Y(1, { kind: 'thinking', streamId: 's1', durationMs: 5, body: 'same' }),
        { ...tool(2, 'ok', true), name: 'Y', persona: 'coder', toolName: 'glob', body: 'glob' } as TranscriptRow,
        Y(3, { kind: 'thinking', streamId: 's3', settled: false, body: 'same' }),
      ];
      const projector = createProjector();
      const o = options({ rows: held, running: true });
      expect(indices(projector.project(o).display)).toEqual(['row:0', 'group:1,2']);
      const appended = { ...o, rows: [...held, { ...tool(4, 'ok', true), name: 'Y', persona: 'coder' } as TranscriptRow] };
      expect(changedFrom(o, appended)).toBe(4);
      // The live row at 3 repeats 1's reasoning, so REQ-CHAT-048 projects it to zero rows and 4 joins 1 and 2's run.
      expect(indices(projectDisplay(appended))).toEqual(['row:0', 'group:1,2,4']);
      expect(indices(projector.project(appended).display)).toEqual(['row:0', 'group:1,2,4']);
      expect(projector.project(appended).display).toEqual(projectDisplay(appended));
      expect(projector.incrementals).toBe(1);
    });

    // REQ-CHAT-048 per agent (OQ-91): the bounded form's lookback reaches past another agent's reasoning to the
    // appending agent's OWN previous thinking row, exactly as the whole-state loop carries it.
    it('REQ-CHAT-048: an agent\'s repeat appended after another agent\'s reasoning projects to zero rows in the bounded form too', () => {
      const think = (i: number, name: string, body: string, over: Partial<TranscriptRow> = {}) =>
        said(i, name, { kind: 'thinking', streamId: `s${i}`, body, ...over } as Partial<TranscriptRow>);
      const held = [rows(1)[0]!, think(1, 'X', 'plan'), said(2, 'Y'), think(3, 'Y', 'other'), said(4, 'X'), said(5, 'Y')];
      for (const groupTools of [false, true]) {
        const projector = createProjector();
        const o = options({ rows: held, groupTools, showReasoning: true });
        projector.project(o);
        const appended = { ...o, rows: [...held, think(6, 'X', 'plan')] };
        expect(changedFrom(o, appended)).toBe(6);
        const members = (display: readonly DisplayRow[]) => display.flatMap((d) => (d.shape === 'row' ? [d.row.index] : d.shape === 'group' ? d.members.map((m) => m.index) : []));
        // 6 repeats X's own 1 with Y's 3 between, so it is not drawn — bounded and whole alike.
        expect(members(projectDisplay(appended))).not.toContain(6);
        expect(projector.project(appended).display).toEqual(projectDisplay(appended));
        const differs = { ...o, rows: [...held, think(6, 'X', 'other')] };
        expect(members(projectDisplay(differs))).toContain(6);
        expect(projector.project(differs).display).toEqual(projectDisplay(differs));
        expect(projector.incrementals, `groupTools ${groupTools}`).toBeGreaterThanOrEqual(1);
      }
    });

    it('REQ-CHAT-050: a repeated diff replaced at its own index, with the rows behind it removed, reuses none of them', () => {
      const diff = (i: number, body: string) => ({ ...said(i, 'Y'), kind: 'diff', callKey: 'call-edit', body } as TranscriptRow);
      const held = [rows(1)[0]!, diff(1, 'a.md +1 -0'), said(2, 'Y'), diff(3, 'a.md +1 -0'), said(4, 'Y'), said(5, 'Y')];
      const projector = createProjector();
      const o = options({ rows: held, groupTools: false });
      expect(indices(projector.project(o).display)).toEqual(['row:0', 'row:1', 'row:2', 'row:4', 'row:5']);
      // Row 3 re-sent (still the repeat REQ-CHAT-050 drops), rows 4 and 5 removed: the replica's own upsert.
      const next = { ...o, rows: projectIncrement(held, 3, [{ ...held[3]! }]) };
      expect(next.rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
      expect(changedFrom(o, next)).toBe(3);
      expect(indices(projectDisplay(next))).toEqual(['row:0', 'row:1', 'row:2']);
      expect(projector.project(next).display).toEqual(projectDisplay(next));
    });

    /**
     * A small deterministic generator (mulberry32): appends of every kind across three agents — reasoning with and
     * without a duration, repeating its own body, and edit diffs repeating their call — settles and growth in place, a
     * kind changed in place, removals and re-sends through the replica's own upsert, scope switches through the
     * surface's own filter, truncations, and older rows paged in above. Run over several seeds and every value of the
     * three switches that change what folds, because one seed with no diff rows is how fix round 1's walk passed two
     * divergences it had never generated.
     */
    const walk = (initial: number, config: Pick<ProjectOptions, 'running' | 'groupTools' | 'showReasoning'>, steps: number) => {
      let seed = initial;
      const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
      const names = ['X', 'Y', 'Z'];
      const agents = names.map((name) => ({ id: name.toLowerCase(), name, persona: 'coder' }) as unknown as AgentRecord);
      const make = (i: number): TranscriptRow => {
        const name = pick(names);
        switch (pick(['user', 'agent', 'tool', 'tool', 'tool', 'thinking', 'thinking', 'diff', 'system'])) {
          case 'user': return { ...rows(1)[0]!, index: i };
          case 'system': return { ...said(i, '', { kind: 'system' }), name: undefined, persona: undefined } as unknown as TranscriptRow;
          case 'thinking': {
            const settled = rand() < 0.5;
            return said(i, name, { kind: 'thinking', streamId: `s${i}`, settled, body: `thought ${Math.floor(rand() * 2)}`, ...(settled && rand() < 0.5 ? { durationMs: 5 } : {}) } as Partial<TranscriptRow>);
          }
          case 'diff': return said(i, name, { kind: 'diff', body: `a.md +${Math.floor(rand() * 2)} -0`, ...(rand() < 0.7 ? { callKey: `call-${Math.floor(rand() * 3)}` } : {}) } as Partial<TranscriptRow>);
          case 'tool': return { ...tool(i, rand() < 0.5 ? 'running' : 'ok', rand() < 0.5), name, persona: 'coder' };
          default: return said(i, name);
        }
      };
      let all: TranscriptRow[] = [rows(1)[0]!];
      let scope: AgentRecord | null = null;
      const projector = createProjector();
      const base = options(config);
      let running = config.running;
      for (let step = 0; step < steps; step += 1) {
        const top = all[all.length - 1]!.index;
        const r = rand();
        if (r < 0.4) all = [...all, make(top + 1)];
        else if (r < 0.55) { const at = all.length - 1 - Math.floor(rand() * Math.min(4, all.length - 1)); all = [...all.slice(0, at), { ...all[at]!, settled: true, toolStatus: 'ok', body: `${all[at]!.body}+` } as TranscriptRow, ...all.slice(at + 1)]; }
        else if (r < 0.62 && all.length > 1) { const at = Math.max(1, all.length - 1 - Math.floor(rand() * 3)); all = [...all.slice(0, at), make(all[at]!.index), ...all.slice(at + 1)]; }
        else if (r < 0.72 && all.length > 3) {
          const from = all[Math.max(1, all.length - 1 - Math.floor(rand() * 5))]!.index;
          all = projectIncrement(all, from, [...all.filter((row) => row.index >= from && rand() < 0.6).map((row) => ({ ...row })), ...(rand() < 0.7 ? [make(top + 1)] : [])]);
        }
        else if (r < 0.85) scope = rand() < 0.3 ? null : pick(agents);
        else if (r < 0.9 && all.length > 4) all = all.slice(0, all.length - 2);
        else if (r < 0.93) { const bottom = all[0]!.index; all = [{ ...make(bottom - 1), index: bottom - 1 } as TranscriptRow, ...all]; }
        else all = [...all, make(top + 1), make(top + 2)];
        // A run beginning or ending, beside whatever else the step did (REQ-CHAT-049; the 2026-09-29 round bounds it).
        if (rand() < 0.08) running = !running;
        const o = { ...base, running, rows: scopedRows(all, scope) };
        const projection = projector.project(o);
        expect(projection.display, `seed ${initial.toString(16)} ${JSON.stringify(config)} step ${step}`).toEqual(projectDisplay(o));
        // The places ride with the projection and are built from the previous one's (`placementsFrom`, the
        // 2026-09-29 round): whatever the step did, they are the places of the display computed from nothing.
        expect(projection.places, `places: seed ${initial.toString(16)} ${JSON.stringify(config)} step ${step}`).toEqual(placements(projection.display));
      }
      return projector.incrementals;
    };

    it('agrees with the whole-state projection over a seeded walk of every shape the pane can be handed', () => {
      // Fix round 1's walk, kept: its seed and switches, now with reasoning durations and edit diffs in the mix.
      expect(walk(0x5eed, { running: true, groupTools: true, showReasoning: false }, 600)).toBeGreaterThan(100);
    });

    it('agrees with the whole-state projection over seven seeds and every value of running, grouping and reasoning', () => {
      let bounded = 0;
      for (const seed of [0x5eed, 1, 2, 3, 5, 8, 13]) {
        for (const running of [true, false]) for (const groupTools of [true, false]) for (const showReasoning of [false, true]) {
          bounded += walk(seed, { running, groupTools, showReasoning }, 300);
        }
      }
      // The walks exercised the bounded form, not only the whole window it falls back to.
      expect(bounded).toBeGreaterThan(56 * 50);
    });
  });
});
