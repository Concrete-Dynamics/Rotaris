import { describe, expect, it } from 'vitest';
import type { QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { classifyRows } from '@rotaris/ui-core';
import {
  activitySpanMs, activitySummary, capLines, capDiff, familyOf, groupSeverity, groupSummary, isLive, projectDisplay, rowKey,
  segmentFacts, segmentSummary, trailerRows,
  FACT_SEPARATOR, SEGMENT_SEPARATOR, type ProjectOptions,
} from './project.js';
import type { DisplayRow } from './types.js';
import {
  beginMeasuring, bindRange, buildOffsets, captureAnchor, commitTable, createMeasureLedger, estimateHeight, forgetMeasured, indexAt, markMeasured, measureAtCommit,
  newUpdatesLabel, observeAgain, readHeight, remeasuredSince, restoreAnchor, reuseOffsets, slotRef, updateShape, visibleRange,
} from './pool.js';
import { countLabel, indexAll, indexSuffix, matchRow, step } from './search.js';
import { SCROLL_ORIGIN_EPSILON, isOwnScroll } from './scroll.js';
import { LruCache, identityOf, measureKey, reuseKey } from './cache.js';
import { H_MAX, POOL_CAPACITY, ROW_MIN_HEIGHT, SHORTEST_ROW_HEIGHT, capacityFor } from './constants.js';
import { readFileSync } from 'node:fs';

const row = (index: number, over: Partial<TranscriptRow> = {}): TranscriptRow => ({
  index, kind: 'agent', settled: true, body: `row ${index}`, at: '2026-09-06T09:00:00.000Z', ts: '09:00:00', name: 'orchestrator', persona: 'orchestrator', ...over,
});
const tool = (index: number, toolName: string, over: Partial<TranscriptRow> = {}): TranscriptRow =>
  row(index, { kind: 'tool', body: toolName, toolName, toolStatus: 'ok', callKey: `c${index}`, durationMs: 100, startedAt: `2026-09-06T09:00:0${index % 10}.000Z`, ...over });

/** Narrows one displayed row to the group branch, so a group assertion reads as one. */
const asGroup = (d: DisplayRow | undefined): Extract<DisplayRow, { shape: 'group' }> => {
  if (!d || d.shape !== 'group') throw new Error(`expected a group, got ${d ? d.shape : 'nothing'}`);
  return d;
};
const asRow = (d: DisplayRow | undefined): Extract<DisplayRow, { shape: 'row' }> => {
  if (!d || d.shape !== 'row') throw new Error(`expected a row, got ${d ? d.shape : 'nothing'}`);
  return d;
};
const asTrailer = (d: DisplayRow | undefined): Extract<DisplayRow, { shape: 'trailer' }> => {
  if (!d || d.shape !== 'trailer') throw new Error(`expected a trailer, got ${d ? d.shape : 'nothing'}`);
  return d;
};

/** Part AC: one pending question prompt with the given step titles (REQ-CHAT-092's shape). */
const question = (titles: readonly string[]): QuestionPrompt => ({
  request_id: 'q1', session_id: 's', conversation_id: 'root', agent_id: 'orchestrator', persona: 'orchestrator',
  steps: titles.map((title, i) => ({ id: `s${i}`, title, description: '', options: [], allow_freeform: true })),
});

const options = (rows: readonly TranscriptRow[], over: Partial<ProjectOptions> = {}): ProjectOptions => ({
  // PD-CHAT-004: `showReasoning` defaults OFF here exactly as REQ-CHAT-167 defaults it in the product, so a
  // test that says nothing about it is testing the shipped configuration.
  rows, running: true, groupTools: true, showReasoning: false,
  caps: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  expanded: new Set<string>(), pendingQuestions: [], pendingApprovals: [], ...over,
});

/** A reasoning row of the same agent, so a run can be built out of both categories (PD-CHAT-004). */
const thinking = (index: number, over: Partial<TranscriptRow> = {}): TranscriptRow =>
  row(index, { kind: 'thinking', body: `deliberation ${index}`, durationMs: 2_000, chars: 400, startedAt: `2026-09-06T09:00:0${index % 10}.000Z`, ...over });

describe('ADR-0045 — the pool, its capacity and its geometry', () => {
  it('capacity is a declared product constant, not a function of the window (ADR-0045)', () => {
    expect(POOL_CAPACITY).toBe(Math.ceil(H_MAX / SHORTEST_ROW_HEIGHT) + 10);
    expect(POOL_CAPACITY).toBe(226);
    // The ONE growth branch: a viewport taller than H_max, which the benchmark's window never reaches.
    expect(capacityFor(900)).toBe(POOL_CAPACITY);
    expect(capacityFor(H_MAX)).toBe(POOL_CAPACITY);
    expect(capacityFor(20_000)).toBeGreaterThan(POOL_CAPACITY);
  });

  /*
   * docs/defects/fixed/the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md: PD-CHAT-003 lifted REQ-CHAT-057's
   * 30 px floor off the row's box, and a one-line system notice inside a block drew 23.8 px in the built app (2026-09-30).
   * A capacity counted in 30 px units left the rows past `first + capacity - 1` unbound — blank space at the bottom of a
   * tall viewport (REQ-CHAT-165). The unit is now the shortest a row can draw, whatever it carries.
   */
  it('REQ-CHAT-165 / PD-CHAT-003: inside H_MAX the pool binds every visible row, however short a row PD-CHAT-003 draws', () => {
    // The measured system notice inside a block, and the floor itself: no row the stylesheet draws is shorter.
    for (const height of [23.8, SHORTEST_ROW_HEIGHT]) {
      const count = 2_000;
      const table = buildOffsets(Array.from({ length: count }, () => height));
      for (const viewport of [900, 3_200, 3_430, 3_800, H_MAX]) {
        // At the tail, where nothing lies below and the whole overscan sits above, and in the middle.
        for (const scrollTop of [table.total - viewport, Math.floor(table.total / 2)]) {
          const span = visibleRange(table, scrollTop, viewport, count, capacityFor(viewport));
          const lastVisible = Math.min(count - 1, indexAt(table, scrollTop + viewport));
          expect(span.first <= indexAt(table, scrollTop) && span.last >= lastVisible,
            `${height} px rows at a ${viewport} px viewport, scrolled to ${scrollTop}: bound ${span.first}..${span.last}, visible to ${lastVisible}`).toBe(true);
        }
      }
    }
  });

  it('PD-CHAT-003: the capacity unit is no taller than the shortest row the stylesheet can draw', () => {
    // A continuation row is `.row`'s 4 px top margin, its 1 px border either side and a grid whose role column holds the
    // continuation bar (2 px wide) at its 14 px `min-height`; the first row of a block carries 12 px above it and a role line instead.
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');
    const rule = (selector: string): string => new RegExp(`^${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
    const marginTop = Number(/margin:\s*(\d+)px/.exec(rule('.row'))?.[1]);
    const border = Number(/border:\s*(\d+)px/.exec(rule('.row'))?.[1]);
    const bar = Number(/min-height:\s*(\d+)px/.exec(rule('.row__bar'))?.[1]);
    const floor = marginTop + 2 * border + bar;
    expect(floor).toBe(20);
    expect(SHORTEST_ROW_HEIGHT).toBeLessThanOrEqual(floor);
    // And no taller than the shortest one-line row measured in the built app (2026-09-30).
    expect(SHORTEST_ROW_HEIGHT).toBeLessThanOrEqual(23.8);
  });

  it('the offset table is a prefix sum and locates a row by binary search', () => {
    const table = buildOffsets([30, 40, 50]);
    expect(table.offsets).toEqual([0, 30, 70, 120]);
    expect(table.total).toBe(120);
    expect(indexAt(table, 0)).toBe(0);
    expect(indexAt(table, 29)).toBe(0);
    expect(indexAt(table, 30)).toBe(1);
    expect(indexAt(table, 119)).toBe(2);
  });

  it('the visible span carries the overscan and never exceeds the fixed pool', () => {
    const table = buildOffsets(Array.from({ length: 1000 }, () => 30));
    const span = visibleRange(table, 3000, 600, 1000, POOL_CAPACITY);
    expect(span.first).toBe(90);
    expect(span.last).toBe(130);
    expect(visibleRange(table, 0, 600, 1000, 5)).toEqual({ first: 0, last: 4 });
    // A pool too small for the span with its overscan sheds the overscan — below, then above — before a visible row:
    // rows 100..120 are on screen, and 25 slots bind all of them and four above.
    expect(visibleRange(table, 3000, 600, 1000, 25)).toEqual({ first: 96, last: 120 });
    expect(visibleRange(table, 3000, 600, 1000, 35)).toEqual({ first: 90, last: 124 });
    expect(visibleRange(table, 0, 600, 0, POOL_CAPACITY)).toEqual({ first: 0, last: -1 });
  });

  it('REQ-CHAT-071: the anchor is an identity and an offset, never a stored pixel position', () => {
    const display = [row(0), row(1), row(2)].map((r) => ({ shape: 'row' as const, key: rowKey(r), row: r }));
    const table = buildOffsets([30, 30, 30]);
    const anchor = captureAnchor(display, table, 35);
    expect(anchor).toEqual({ key: 'row:1', offset: -5 });
    // Fifty rows arrive above it: the same identity is found at its new offset, and the reader does not move.
    const grown = [...Array.from({ length: 50 }, (_, i) => row(i - 50)).map((r) => ({ shape: 'row' as const, key: rowKey(r), row: r })), ...display];
    const grownTable = buildOffsets(grown.map(() => 30));
    // row:1 now sits at displayed index 51, so its top is 1530, and the anchor puts it back 5 px above the fold.
    expect(restoreAnchor(grown, grownTable, anchor)).toBe(51 * 30 - -5);
    expect(restoreAnchor(grown, grownTable, { key: 'row:999', offset: 0 })).toBeNull();
  });

  it('REQ-CHAT-053: the four update shapes are told apart, and everything else is `other`', () => {
    const d = (keys: string[]) => keys.map((k) => ({ shape: 'row' as const, key: k, row: row(0) }));
    expect(updateShape(d(['a', 'b']), d(['a', 'b', 'c']))).toBe('append');
    expect(updateShape(d(['a', 'b', 'c']), d(['a', 'b']))).toBe('truncate');
    expect(updateShape(d(['a', 'b']), d(['a', 'b']))).toBe('replace');
    expect(updateShape(d(['a', 'b']), d(['a', 'b', 'c', 'd']))).toBe('append');
    expect(updateShape(d(['a', 'x']), d(['a', 'y', 'z']))).toBe('other');
    // The fourth: the last row keeps its identity and grows while rows are appended after it. Its key is the same on
    // both sides, so the keys alone read this as `append`; what tells it apart is the last row's content
    // (docs/defects/fixed/the-update-shape-never-answers-extend.md).
    const streamed = (body: string) => ({ shape: 'row' as const, key: 'row:1', row: row(1, { body, settled: false }) });
    const a = { shape: 'row' as const, key: 'row:0', row: row(0) };
    const before = [a, streamed('The answer')];
    expect(updateShape(before, [a, streamed('The answer is'), { shape: 'row' as const, key: 'tool:c2', row: tool(2, 'bash') }])).toBe('extend');
    // The same last row, unchanged (the same object, or a new object with the same content), with a row after it: `append`.
    expect(updateShape(before, [a, before[1]!, { shape: 'row' as const, key: 'tool:c2', row: tool(2, 'bash') }])).toBe('append');
    expect(updateShape(before, [a, streamed('The answer'), { shape: 'row' as const, key: 'tool:c2', row: tool(2, 'bash') }])).toBe('append');
    // Extended with nothing after it is the same number of rows replaced in place: `replace`.
    expect(updateShape(before, [a, streamed('The answer is')])).toBe('replace');
    // A group is the last displayed row just as a row is: a run that gains a member while rows follow is an extension.
    const run = (members: number) => asGroup(projectDisplay(options(Array.from({ length: members }, (_, i) => tool(10 + i, 'read_file', { callKey: `r${i}` }))))[0]);
    expect(run(3).key).toBe(run(2).key);
    expect(updateShape([a, run(2)], [a, run(3), { shape: 'row' as const, key: 'row:20', row: row(20) }])).toBe('extend');
    expect(updateShape([a, run(2)], [a, run(2), { shape: 'row' as const, key: 'row:20', row: row(20) }])).toBe('append');
  });

  it('REQ-CHAT-168: the "N new updates" label is written for the count it carries, at zero, one and many', () => {
    expect(newUpdatesLabel(0)).toBe('0 new updates');
    expect(newUpdatesLabel(1)).toBe('1 new update');
    expect(newUpdatesLabel(7)).toBe('7 new updates');
  });

  it('REQ-CHAT-058: a rendering is reused only on identity, content, width and expansion — and never for a live row', () => {
    const settled = { shape: 'row' as const, key: 'k', row: row(0) };
    const live = { shape: 'row' as const, key: 'k', row: row(0, { toolStatus: 'running', kind: 'tool' }) };
    expect(reuseKey(live, 800, false, null)).toBeNull();
    const a = reuseKey(settled, 800, false, null);
    expect(reuseKey(settled, 900, false, null)).not.toBe(a);
    expect(reuseKey(settled, 800, true, null)).not.toBe(a);
    expect(reuseKey({ ...settled, row: row(0, { body: 'different' }) }, 800, false, null)).not.toBe(a);
    expect(reuseKey({ ...settled, key: 'other' }, 800, false, null)).not.toBe(a);
    expect(reuseKey(settled, 800, false, { start: 1, end: 2 })).not.toBe(a);
  });

  it('REQ-UIBENCH-063/086: the rendering cache is bounded by entries and by source characters, least recently used first', () => {
    const cache = new LruCache<string>(2, 1000);
    cache.set('a', 'A', 10); cache.set('b', 'B', 10);
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C', 10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.stats.entries).toBe(2);
    expect(cache.stats.characters).toBe(20);
    expect(cache.stats.hits).toBe(2);
    expect(cache.stats.misses).toBe(1);
    const chars = new LruCache<string>(100, 15);
    chars.set('x', 'X', 10); chars.set('y', 'Y', 10);
    expect(chars.stats.characters).toBeLessThanOrEqual(15);
    // `peek` is the layout pass's read: no recency, no hit.
    const before = cache.stats.hits;
    cache.peek('a');
    expect(cache.stats.hits).toBe(before);
  });

  it('a height estimate never falls below the 30 px unit (PD-CHAT-003: the one-line row, the slot floor)', () => {
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: '' }) })).toBeGreaterThanOrEqual(ROW_MIN_HEIGHT);
  });

  it('PD-CHAT-003: a one-line row estimates content height, not the old padding-box 46 px', () => {
    // A one-line plain row is one text line over the 30 px unit — NOT the old 34 px padding-box term.
    const oneLine = estimateHeight({ shape: 'row', key: 'k', row: row(0, { kind: 'system', body: 'one line' }) });
    expect(oneLine).toBe(ROW_MIN_HEIGHT);
    // An agent message's one line is a Markdown paragraph, which keeps its 8 px bottom margin inside the row (REQ-CHAT-056):
    // the unit and that margin, still well under the old padding box. (This read 30 until 2026-09-30, when the built
    // app drew such a row 33.4 px — docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md.)
    const message = estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'one line' }) });
    expect(message).toBe(ROW_MIN_HEIGHT + 8);
    expect(message).toBeLessThan(46);
    // Multi-line rows still grow per line.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { kind: 'system', body: 'a\nb\nc' }) })).toBeGreaterThan(oneLine);
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'a\n\nb\n\nc' }) })).toBeGreaterThan(message);
  });

  it('a collapsed thinking row estimates its one-line summary, never its hidden body (REQ-CHAT-062/167)', () => {
    // Three hundred streamed reasoning lines are hidden while collapsed; the estimate must not count them.
    const body = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const collapsed = estimateHeight({ shape: 'row', key: 'k', row: row(0, { kind: 'thinking', body }) }, false);
    expect(collapsed).toBeLessThan(60);
    expect(collapsed).toBeGreaterThanOrEqual(ROW_MIN_HEIGHT);
    // Expanded, the body is drawn, so the body-based estimate returns.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { kind: 'thinking', body }) }, true))
      .toBeGreaterThan(collapsed);
    // Other shapes are unaffected by the flag.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'a\nb\nc' }) }, false))
      .toBe(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'a\nb\nc' }) }, true));
  });

  // ---- the estimate is never short of what a new row draws before its first measurement -----------------------
  // docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md: a new
  // row at the tail is positioned by its estimate until the measurement pass reaches it, so an estimate SHORT of what
  // the row draws puts it through the row beneath it for those frames. The figures are the built app's, read from a
  // planted transcript of every row kind below at a 740 px viewport on 2026-09-30 (slot heights, which include the row
  // gap above each row): the first repair covered only the block gap, and `transcript-proof` went on catching a
  // one-line agent message INSIDE a block drawn 33.4 px into the 30 px it was given.

  it('PD-CHAT-003: the first row of a block estimates the 12 px it is drawn below, over what one row inside a block is', () => {
    const shapes: DisplayRow[] = [
      { shape: 'row', key: 'k', row: row(0, { body: 'one line' }) },
      { shape: 'row', key: 't', row: row(0, { kind: 'thinking', body: 'deliberating' }) },
      asGroup(projectDisplay(options([tool(0, 'read'), tool(1, 'read')]))[0]),
    ];
    for (const d of shapes) {
      // `.row--block-start`'s `--rt-space-3` against `.row`'s 4 px: the only difference between the two boxes.
      expect(estimateHeight(d, false, 900, true) - estimateHeight(d, false, 900, false), d.key).toBe(8);
    }
    // A caller that says nothing about the block keeps the estimate it had (a row inside a block).
    expect(estimateHeight(shapes[0]!, false, 900)).toBe(estimateHeight(shapes[0]!, false, 900, false));
  });

  it('PD-CHAT-003 / REQ-CHAT-056: no row kind is estimated short of what the built app drew, inside a block or starting one', () => {
    const WIDTH = 740;
    const PROSE = 'The transcript keeps each row at the height it drew, and until a row has been measured the pane positions it by an estimate of that height, which is why the estimate has to be read against what the built application actually draws on this host and on every other one it ships to, including the wrapped paragraphs an agent writes when it explains what it changed and why the change was needed at all.';
    const at = (over: Partial<TranscriptRow>): DisplayRow => ({ shape: 'row', key: 'k', row: row(0, over) });
    const drawn: [string, DisplayRow, boolean, number][] = [
      // The case transcript-proof caught after the first repair: a one-line agent message INSIDE a block, whose
      // Markdown paragraph keeps its 8 px bottom margin in the row. Estimated 30 before this repair.
      ['one-line agent message inside a block', at({ body: 'The scripted answer, after deliberating.' }), false, 33.4],
      ['one-line agent message starting a block', at({ body: 'agent one line' }), true, 41.4],
      // `.row--user`'s 8 px padding above and below: 11.4 px short before this repair, at both positions.
      ['one-line user message inside a block', at({ kind: 'user', body: 'second user line' }), false, 41.4],
      ['one-line user message starting a block', at({ kind: 'user', body: 'Say something about the notes.' }), true, 49.4],
      ['one-line system notice inside a block', at({ kind: 'system', body: 's2' }), false, 23.8],
      ['one-line system notice starting a block', at({ kind: 'system', body: 'The run completed.' }), true, 31.8],
      ['collapsed reasoning row starting a block', at({ kind: 'thinking', body: 'deliberating' }), true, 33.4],
      ['three Markdown paragraphs', at({ body: 'para one\n\npara two\n\npara three' }), false, 88.3],
      ['a two-item Markdown list starting a block', at({ body: '- item one\n- item two' }), true, 68.9],
      ['a Markdown heading and a paragraph', at({ body: '# Heading\n\nbody' }), false, 71.3],
      ['a six-line user message starting a block', at({ kind: 'user', body: 'u1\nu2\nu3\nu4\nu5\nu6' }), true, 146.6],
      ['a paragraph that wraps to seven lines', at({ body: PROSE }), false, 150.1],
      ['a user message that wraps to seven lines', at({ kind: 'user', body: PROSE }), true, 166.1],
      ['a paragraph of 800 characters that wraps to fourteen lines', at({ body: 'word '.repeat(160) }), false, 286.1],
      ['a five-line diff starting a block', at({ kind: 'diff', name: 'edit', body: '--- a/x\n+++ b/x\n@@\n-a\n+b' }), true, 103.1],
      ['a sixteen-segment activity line starting a block (six drawn lines)',
        asGroup(projectDisplay(options(Array.from({ length: 16 }, (_, i) => tool(i, `inspect-${i}`))))[0]), true, 130.6],
    ];
    for (const [name, d, blockStart, height] of drawn) {
      expect(estimateHeight(d, false, WIDTH, blockStart), name).toBeGreaterThanOrEqual(height);
    }
  });

  // ---- the estimate models WRAPPING (docs/defects/fixed/live-rows-are-never-measured.md) ------------------------
  // The three below are the regression for the constant that used to sit in `estimateHeight`: a group was 36 px
  // however many segments it drew, a body line was a `\n` rather than a drawn line, and the role gutter's own
  // wrapping was not modelled at all. Each one put the row beneath through the middle of the text.

  it('an activity line grows with the segments it draws, because they wrap (PD-CHAT-004, REQ-CHAT-058)', () => {
    const short = asGroup(projectDisplay(options([tool(0, 'read'), tool(1, 'read')]))[0]);
    // PD-CHAT-004 revision 2 folds a family reached again into its own segment, so sixteen calls over four
    // families draw FOUR segments and fit one line. Sixteen distinct names are sixteen segments — the shape
    // this regression is about is the number of segments the line draws, not the number of calls behind them.
    const many = asGroup(projectDisplay(options(
      Array.from({ length: 16 }, (_, i) => tool(i, `inspect-${i}`)),
    ))[0]);
    const WIDTH = 900;
    const one = estimateHeight(short, false, WIDTH);
    const wrapped = estimateHeight(many, false, WIDTH);
    expect(many.segments.length).toBeGreaterThan(short.segments.length);
    // The falsified behaviour: both of these answered 36.
    expect(wrapped).toBeGreaterThan(one);
    expect(wrapped).toBeGreaterThan(36);
    // Narrower means more lines for the same content — the width has to reach the answer for it to be a wrap.
    expect(estimateHeight(many, false, 420)).toBeGreaterThan(wrapped);
  });

  it('a body line is a DRAWN line, not a newline (REQ-CHAT-058)', () => {
    // One paragraph, no newline in it at all, far wider than the 78 % prose measure at this width.
    const paragraph = 'x'.repeat(1_200);
    const drawn = estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: paragraph }) }, false, 900);
    expect(drawn).toBeGreaterThan(ROW_MIN_HEIGHT * 3);
    // With no width known nothing can be predicted, so the old width-blind count — one line — is what is left.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: paragraph }) }, false))
      .toBe(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'one line' }) }, false));
  });

  it('a long agent name costs the row a second line, because the role gutter wraps (REQ-CHAT-057)', () => {
    const short = estimateHeight({ shape: 'row', key: 'k', row: row(0, { name: 'planner', body: 'hi' }) }, false, 900);
    const long = estimateHeight({ shape: 'row', key: 'k', row: row(0, { name: 'requirements-engineer', body: 'hi' }) }, false, 900);
    expect(long).toBeGreaterThan(short);
  });

  it('a LIVE row has a measurement key even though it has no rendering-reuse key (REQ-CHAT-058)', () => {
    const live: DisplayRow = { shape: 'row', key: 'k', row: tool(0, 'bash', { toolStatus: 'running', settled: false }) };
    expect(isLive(live)).toBe(true);
    // Reusing its DRAWING would freeze its clock, so that stays refused...
    expect(reuseKey(live, 900, false, null)).toBeNull();
    // ...but its height is a fact about a node that is on the screen, and refusing to read it was the defect.
    const key = measureKey(live, 900, false, null);
    expect(key).not.toBe('');
    expect(identityOf(key)).toBe('k');
    // The identity survives a content change, which is what lets a streaming row keep the height it just drew
    // instead of falling back to an estimate on every chunk.
    const grown: DisplayRow = { shape: 'row', key: 'k', row: tool(0, 'bash', { toolStatus: 'running', settled: false, body: 'more output' }) };
    const grownKey = measureKey(grown, 900, false, null);
    expect(grownKey).not.toBe(key);
    expect(identityOf(grownKey)).toBe(identityOf(key));
  });
});

/**
 * REQ-CHAT-055: "the work of painting and measuring MUST depend on how many rows are visible and how many rows changed,
 * not on how many rows the transcript holds in total". V8's CPU profile of the built app (2026-09-29, the defect note
 * `appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`, "CPU profile") named the loaded side's extra
 * script per increment: passes over every displayed row in the pane's own code. These pin the two of them that live
 * here — the offset table and the update shape — to the rows an increment changed, and to the answer the whole pass gave.
 */
describe('REQ-CHAT-055 — an increment re-reads only the rows it changed (the offset table and the update shape)', () => {
  const displayed = (index: number, body = `row ${index}`): Extract<DisplayRow, { shape: 'row' }> => {
    const r = row(index, { body });
    return { shape: 'row', key: rowKey(r), row: r };
  };
  /** The pane's height, reduced to what it reads: the row, the width, the expansion and what was measured under the row's identity. */
  const heights = (measured: ReadonlyMap<string, number>, width: number, expanded: ReadonlySet<string>) => (d: DisplayRow): number =>
    (measured.get(d.key) ?? 30 + (d.shape === 'row' ? d.row.body.length % 7 : 0)) + (expanded.has(d.key) ? 50 : 0) + Math.floor(width / 100);

  it('the offset table equals the table built from every height, over a seeded walk of appends, settles, removals, measurements, evictions, resizes and toggles', () => {
    let seed = 0x0ff5e7;
    const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ledger = createMeasureLedger();
    const measured = new Map<string, number>();
    let display: Array<Extract<DisplayRow, { shape: 'row' }>> = Array.from({ length: 40 }, (_, i) => displayed(i));
    let width = 800;
    let expanded: ReadonlySet<string> = new Set();
    let reused = 0;
    for (let step = 0; step < 800; step += 1) {
      const r = rand();
      const top = display.length === 0 ? 0 : display[display.length - 1]!.row.index;
      if (r < 0.35) display = [...display, ...Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, k) => displayed(top + 1 + k))];
      else if (r < 0.5 && display.length > 0) display = [...display.slice(0, -1), displayed(display[display.length - 1]!.row.index, `settled ${step}`)];
      else if (r < 0.58 && display.length > 2) display = display.slice(0, display.length - 1 - Math.floor(rand() * 2));
      else if (r < 0.63 && display.length > 4) { const at = Math.floor(rand() * display.length); display = [...display.slice(0, at), displayed(display[at]!.row.index, `changed ${step}`), ...display.slice(at + 1)]; }
      else if (r < 0.85 && display.length > 0) {
        // One delivery of the measurement pass: it re-measures a few identities, and a bound evicts one.
        beginMeasuring(ledger);
        for (let k = 0; k < 3; k += 1) { const d = display[Math.floor(rand() * display.length)]!; measured.set(d.key, 20 + Math.floor(rand() * 60)); markMeasured(ledger, d.key); }
        if (rand() < 0.3 && measured.size > 0) { const gone = [...measured.keys()][0]!; measured.delete(gone); markMeasured(ledger, gone); }
      }
      else if (r < 0.9) width = 700 + Math.floor(rand() * 3) * 100;
      else if (r < 0.95 && display.length > 0) expanded = new Set([display[Math.floor(rand() * display.length)]!.key]);
      const heightOf = heights(measured, width, expanded);
      const table = ledger.committed;
      const next = reuseOffsets(table, { display, width, expanded, stamp: ledger.stamp }, (identity, since) => remeasuredSince(ledger, identity, since), heightOf);
      const whole = buildOffsets(display.map(heightOf));
      expect(next.offsets, `step ${step}`).toEqual(whole.offsets);
      expect(next.total, `step ${step}`).toBe(whole.total);
      if (table !== null && next.width === table.width && next.expanded === table.expanded) reused += 1;
      // What the pane's layout effect does once React has committed the table.
      commitTable(ledger, next);
    }
    expect(reused).toBeGreaterThan(400);
  });

  it('appending one row at 1,200 reads ONE height, and a measurement reads the rows it measured — never the transcript (fails on the whole pass)', () => {
    const ledger = createMeasureLedger();
    const measured = new Map<string, number>();
    const expanded = new Set<string>();
    let reads = 0;
    const heightOf = (d: DisplayRow) => { reads += 1; return heights(measured, 800, expanded)(d); };
    const remeasured = (identity: string, since: number) => remeasuredSince(ledger, identity, since);
    let display = Array.from({ length: 1_200 }, (_, i) => displayed(i));
    let table = reuseOffsets(null, { display, width: 800, expanded, stamp: ledger.stamp }, remeasured, heightOf);
    expect(reads).toBe(1_200);

    reads = 0;
    display = [...display, displayed(1_200)];
    table = reuseOffsets(table, { display, width: 800, expanded, stamp: ledger.stamp }, remeasured, heightOf);
    // The first form — `buildOffsets(display.map(heightOf))` on every rebuild — read 1,201 here.
    expect(reads).toBe(1);
    expect(table.total).toBe(buildOffsets(display.map(heights(measured, 800, expanded))).total);

    reads = 0;
    beginMeasuring(ledger);
    for (const at of [1_198, 1_199, 1_200]) { measured.set(display[at]!.key, 44); markMeasured(ledger, display[at]!.key); }
    table = reuseOffsets(table, { display, width: 800, expanded, stamp: ledger.stamp }, remeasured, heightOf);
    expect(reads).toBe(3);
    expect(table.offsets).toEqual(buildOffsets(display.map(heights(measured, 800, expanded))).offsets);

    // With nothing re-measured the pane passes no lookup at all, and an append still reads its own row alone.
    reads = 0;
    display = [...display, displayed(1_201)];
    table = reuseOffsets(table, { display, width: 800, expanded, stamp: ledger.stamp }, null, heightOf);
    expect(reads).toBe(1);
    expect(table.offsets).toEqual(buildOffsets(display.map(heights(measured, 800, expanded))).offsets);

    // A resize is not an increment: it reads every row again, as it must.
    reads = 0;
    reuseOffsets(table, { display, width: 900, expanded, stamp: ledger.stamp }, remeasured, heightOf);
    expect(reads).toBe(1_202);
  });

  it('ADR-0045 / PD-CHAT-003: a slot rebound under a new measurement key is observed again, and one still under its key is not', () => {
    const observed = new Map<number, string>();
    // First bound: observed. The same key on the next commit: nothing to do — the observer already delivers its changes.
    expect(observeAgain(observed, 0, 'row:1|a|740|c||')).toBe(true);
    expect(observeAgain(observed, 0, 'row:1|a|740|c||')).toBe(false);
    // A scroll rebinds the slot to another row: observed again, so its size is delivered even if it equals the last row's.
    expect(observeAgain(observed, 0, 'row:2|b|740|c||')).toBe(true);
    // An unbound slot has nothing to measure, and is recorded so the row bound to it next is observed.
    expect(observeAgain(observed, 0, '')).toBe(false);
    expect(observeAgain(observed, 0, 'row:2|b|740|c||')).toBe(true);
    // Slots are independent.
    expect(observeAgain(observed, 1, 'row:2|b|740|c||')).toBe(true);
  });

  // The pane mounts under Electron and this suite has no document, so what pins these two is their source
  // (docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md).
  it('ADR-0045: the measurement observer lives as long as the pane, so a delivery never makes it again', () => {
    // React flushes a pending passive effect before the next render, and the next render can be the delivery's own
    // `flushSync`: an effect that depended on the displayed rows disconnected the delivering observer and observed every
    // slot again, at the depth just delivered, and the browser reported a ResizeObserver loop.
    const pane = readFileSync(new URL('./TranscriptPane.tsx', import.meta.url), 'utf8');
    const body = pane.slice(pane.indexOf('const observer = new ResizeObserver((entries) => {'));
    const deps = /\n {2}\}, \[([^\]]*)\]\);/.exec(body)?.[1]?.split(',').map((d) => d.trim());
    expect(deps).toEqual(['measurements', 'lastByIdentity', 'ledger', 'slotNodes', 'observedKeys']);
  });

  it('ADR-0045: the scroller holds its scrollbar gutter, so a bar that appears inside a delivery narrows no row', () => {
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');
    const scroll = /^\.transcript__scroll \{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(scroll).toContain('overflow: auto');
    expect(scroll).toContain('scrollbar-gutter: stable');
  });

  it('ADR-0045: a measurement delivery\'s render binds the span the pool last committed, so it rebinds no slot', () => {
    // Slots are bound by position: slot i holds row `first + i`. Sixty rows of 40 px, the reader at the tail of a 600 px
    // viewport: the pool binds rows 35 to 59.
    const before = buildOffsets(Array.from({ length: 60 }, () => 40));
    const committed = visibleRange(before, 1_800, 600, 60, POOL_CAPACITY);
    expect(committed).toEqual({ first: 35, last: 59 });
    // A delivery corrects the forty rows above the viewport to 20 px. Read against the scroll offset the render still
    // has, the viewport's span moves, and every slot would hold another row: the size change, inside the delivery and at
    // the depth just delivered, that the browser reported as a ResizeObserver loop.
    const after = buildOffsets([...Array.from({ length: 40 }, () => 20), ...Array.from({ length: 20 }, () => 40)]);
    expect(visibleRange(after, 1_800, 600, 60, POOL_CAPACITY).first).not.toBe(committed.first);
    const needed = visibleRange(after, 1_800, 600, 60, POOL_CAPACITY);
    // Held, the delivery's render binds what the pool committed: every slot keeps its row, repositioned by the new table.
    expect(bindRange(committed, needed, 60, POOL_CAPACITY)).toEqual(committed);
    // Outside a delivery, a render binds the viewport's span.
    expect(bindRange(null, needed, 60, POOL_CAPACITY)).toEqual(needed);
    // A held span that no longer fits the displayed rows, or the pool, is not held.
    expect(bindRange(committed, visibleRange(after, 1_800, 600, 50, POOL_CAPACITY), 50, POOL_CAPACITY)).toEqual(visibleRange(after, 1_800, 600, 50, POOL_CAPACITY));
    expect(bindRange(committed, needed, 60, 20)).toEqual(needed);
  });

  it('ADR-0045: the observer\'s synchronous render is held to the committed span, and released by an ordinary update after it', () => {
    // The pane mounts under Electron and this suite has no document, so what pins the delivery's use of `bindRange` is
    // its source: the hold and the measured version in ONE synchronous render, the release outside it.
    const pane = readFileSync(new URL('./TranscriptPane.tsx', import.meta.url), 'utf8');
    expect(pane).toContain('const range = bindRange(heldRange, needed, display.length, capacity);');
    expect(pane).toContain('useLayoutEffect(() => { committedRange.current = range; });');
    expect(pane).toMatch(/flushSync\(\(\) => \{ setHeldRange\(held\); setMeasuredVersion\(\(v\) => v \+ 1\); \}\);\n\s+setHeldRange\(null\);/);
    expect(pane).not.toContain('flushSync(() => setMeasuredVersion((v) => v + 1))');
  });

  it('ADR-0045: a slot whose node unmounts is forgotten and unobserved, so a node mounted later in it is observed under the key the old one held', () => {
    // With one observer for the pane's life, a capacity that shrank and grew again would otherwise leave the new node
    // unobserved: `observeAgain` remembered the slot under the key the old node held, and the old node stayed observed.
    const refs = new Map<number, (node: { id: string } | null) => void>();
    const nodes = new Map<number, { id: string }>();
    const observed = new Map<number, string>();
    const unobserved: string[] = [];
    const ref = slotRef(refs, 3, nodes, observed, (node) => unobserved.push(node.id));
    // One callback per slot, so React calls it when the node mounts and unmounts, not on every commit.
    expect(slotRef(refs, 3, nodes, observed, () => undefined)).toBe(ref);
    ref({ id: 'first' });
    expect(observeAgain(observed, 3, 'row:7|a|740|c||')).toBe(true);
    ref(null);
    expect(nodes.has(3)).toBe(false);
    expect(unobserved).toEqual(['first']);
    ref({ id: 'second' });
    expect(nodes.get(3)).toEqual({ id: 'second' });
    expect(observeAgain(observed, 3, 'row:7|a|740|c||')).toBe(true);
    expect(observeAgain(observed, 3, 'row:7|a|740|c||')).toBe(false);
  });

  it('the pane\'s height reader takes the measurement, then the identity\'s last height, then the estimate at the row\'s own block start (PD-CHAT-003)', () => {
    const d = displayed(0, 'one line');
    const none = { peek: (): number | undefined => undefined };
    const inside = [{ blockStart: false }];
    const starts = [{ blockStart: true }];
    // Nothing measured: the estimate, read with the block start of the row's OWN position.
    expect(readHeight(d, 0, 800, new Set(), starts, none, none)).toBe(estimateHeight(d, false, 800, true));
    expect(readHeight(d, 0, 800, new Set(), inside, none, none)).toBe(estimateHeight(d, false, 800, false));
    expect(readHeight(d, 0, 800, new Set(), starts, none, none) - readHeight(d, 0, 800, new Set(), inside, none, none)).toBe(8);
    // A position the places do not reach is read as a row inside a block, never as an error.
    expect(readHeight(d, 3, 800, new Set(), starts, none, none)).toBe(estimateHeight(d, false, 800, false));
    // What the identity drew last wins over any estimate, and the row's own measurement over both.
    const last = { peek: (identity: string): number | undefined => (identity === d.key ? 77 : undefined) };
    expect(readHeight(d, 0, 800, new Set(), starts, none, last)).toBe(77);
    const key = measureKey(d, 800, false, null);
    const measured = { peek: (k: string): number | undefined => (k === key ? 55 : undefined) };
    expect(readHeight(d, 0, 800, new Set(), starts, measured, last)).toBe(55);
  });

  /*
   * docs/defects/fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md: a row whose content
   * changes has no measurement under its new key, so the table places it by the height its identity drew last — and a row
   * that GROWS was drawn through the row beneath it until the observer's delivery rendered, a frame later. transcript-proof
   * read 21.8 px on the planted activity line turning live again (52.9 px settled, 74.7 px live).
   */
  it('PD-CHAT-003 / ADR-0045: a row that grows is measured at the commit, so the row beneath it is placed below what it draws', () => {
    const ledger = createMeasureLedger();
    const measurements = new LruCache<number>(100, Number.MAX_SAFE_INTEGER);
    const lastByIdentity = new LruCache<number>(100, Number.MAX_SAFE_INTEGER);
    const places = [{ blockStart: true }, { blockStart: false }];
    const heightOf = (d: DisplayRow, at: number): number => readHeight(d, at, 740, new Set(), places, measurements, lastByIdentity);
    const remeasured = (identity: string, since: number): boolean => remeasuredSince(ledger, identity, since);
    const build = (display: readonly DisplayRow[]) => reuseOffsets(ledger.committed, { display, width: 740, expanded: new Set(), stamp: ledger.stamp }, remeasured, heightOf);
    // Drawn and measured once: the line settled at 52.9 px, the row beneath it at 30.
    const settled = displayed(0, 'settled');
    const beneath = displayed(1);
    for (const [d, h] of [[settled, 52.9], [beneath, 30]] as const) { measurements.set(measureKey(d, 740, false, null), h, 0); lastByIdentity.set(d.key, h, 0); }
    commitTable(ledger, build([settled, beneath]));
    // The same identity carrying new content that draws 74.7 px: before any measurement of it, the table places the row
    // beneath by the identity's last height — 21.8 px inside the row above. This is the defect, as the table reads it.
    const grown = displayed(0, 'live again, with its preview line');
    const before = build([grown, beneath]);
    expect(before.offsets[1]).toBe(52.9);
    commitTable(ledger, before);
    // The commit's pass reads what the bound slots draw now, for exactly the keys with no measurement, and says so.
    const reads: string[] = [];
    const bound = [
      { key: measureKey(grown, 740, false, null), read: () => { reads.push('grown'); return 74.7; } },
      { key: measureKey(beneath, 740, false, null), read: () => { reads.push('beneath'); return 30; } },
      { key: '', read: () => { reads.push('empty'); return 0; } },
    ];
    expect(measureAtCommit(ledger, bound, measurements, lastByIdentity)).toBe(true);
    expect(reads).toEqual(['grown']);
    // The table the pass's render builds places the row beneath at what the row above draws — before that frame is painted.
    const after = build([grown, beneath]);
    expect(after.offsets[1]).toBe(74.7);
    commitTable(ledger, after);
    // Measured, nothing is read again and nothing asks for another render; a row whose new content draws what its identity
    // drew last is filed without asking for one either.
    expect(measureAtCommit(ledger, bound, measurements, lastByIdentity)).toBe(false);
    const same = displayed(0, 'live again, the same height');
    expect(measureAtCommit(ledger, [{ key: measureKey(same, 740, false, null), read: () => 74.7 }], measurements, lastByIdentity)).toBe(false);
    expect(measurements.peek(measureKey(same, 740, false, null))).toBe(74.7);
    expect(reads).toEqual(['grown']);
  });

  it('the offset table hands a row\'s height reader its position, where the pane finds the row\'s block (PD-CHAT-003)', () => {
    const display = Array.from({ length: 5 }, (_, i) => displayed(i));
    const seen: number[] = [];
    const table = reuseOffsets(null, { display, width: 800, expanded: new Set(), stamp: 0 }, null, (_d, at) => { seen.push(at); return at === 0 ? 38 : 30; });
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(table.offsets).toEqual([0, 38, 68, 98, 128, 158]);
    // An appended row is read at its own position, and the rows above it are not read again.
    seen.length = 0;
    reuseOffsets(table, { display: [...display, displayed(5)], width: 800, expanded: table.expanded, stamp: 0 }, null, (_d, at) => { seen.push(at); return 30; });
    expect(seen).toEqual([5]);
  });

  it('the ledger answers an identity re-measured after a stamp, and forgets what a committed table has read', () => {
    const ledger = createMeasureLedger();
    beginMeasuring(ledger);
    markMeasured(ledger, 'row:1');
    expect(remeasuredSince(ledger, 'row:1', 0)).toBe(true);
    expect(remeasuredSince(ledger, 'row:1', 1)).toBe(false);
    expect(remeasuredSince(ledger, 'row:2', 0)).toBe(false);
    beginMeasuring(ledger);
    markMeasured(ledger, 'row:2');
    forgetMeasured(ledger, 1);
    expect([...ledger.marked.keys()]).toEqual(['row:2']);
    expect(remeasuredSince(ledger, 'row:2', 1)).toBe(true);
    // Committing a table built at stamp 2 hands it to the next build and forgets what it read.
    const table = reuseOffsets(null, { display: [], width: 800, expanded: new Set(), stamp: ledger.stamp }, () => false, () => 30);
    commitTable(ledger, table);
    expect(ledger.committed).toBe(table);
    expect(ledger.marked.size).toBe(0);
  });

  it('a bounded measurement cache reports what it evicts or clears, so the table can re-read those rows', () => {
    const evicted: string[] = [];
    const cache = new LruCache<number>(2, Number.MAX_SAFE_INTEGER, (key) => evicted.push(key));
    cache.set('a|1', 30, 0);
    cache.set('b|1', 30, 0);
    cache.set('c|1', 30, 0);
    expect(evicted).toEqual(['a|1']);
    cache.clear();
    expect(evicted).toEqual(['a|1', 'b|1', 'c|1']);
  });

  it('the update shape reads the keys only past the rows both arrays share, and answers what comparing every key answered (REQ-CHAT-053, REQ-CHAT-055)', () => {
    let reads = 0;
    const counted = (d: DisplayRow): DisplayRow => ({ shape: 'row', row: d.shape === 'row' ? d.row : row(0), get key() { reads += 1; return d.key; } });
    const before = Array.from({ length: 1_200 }, (_, i) => counted(displayed(i)));
    const after = [...before, counted(displayed(1_200))];
    expect(updateShape(before, after)).toBe('append');
    // The first form mapped both arrays to their keys: 2,401 reads for one appended row.
    expect(reads).toBeLessThanOrEqual(4);

    // Against the first form's answer, over pairs that share objects, share keys on new objects, and differ. The first
    // form never answered `extend` (docs/defects/fixed/the-update-shape-never-answers-extend.md): its answer stands
    // everywhere else, and where it said `append` the last row's content now decides between `append` and `extend`.
    const oracle = (a: readonly DisplayRow[], b: readonly DisplayRow[]) => {
      const x = a.map((d) => d.key);
      const y = b.map((d) => d.key);
      if (x.length === y.length && x.every((k, i) => k === y[i])) return 'replace';
      const shared = Math.min(x.length, y.length);
      let common = 0;
      while (common < shared && x[common] === y[common]) common += 1;
      if (common === x.length && y.length > x.length) {
        const was = a[x.length - 1];
        const now = b[x.length - 1];
        return was !== undefined && now !== undefined && asRow(was).row.body !== asRow(now).row.body ? 'extend' : 'append';
      }
      if (common === y.length && x.length > y.length) return 'truncate';
      return 'other';
    };
    let seed = 7;
    const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const seen = new Set<string>();
    for (let k = 0; k < 2_000; k += 1) {
      const a = Array.from({ length: Math.floor(rand() * 6) }, (_, i) => displayed(i));
      let b: DisplayRow[] = [...a];
      const op = rand();
      if (op < 0.2) b = [...b, displayed(a.length)];
      else if (op < 0.25 && b.length > 0) b = [...b.slice(0, -1), displayed(a.length - 1, 'grown in place'), displayed(a.length)];
      else if (op < 0.4 && b.length > 0) b = b.slice(0, -1);
      else if (op < 0.6 && b.length > 0) { const at = Math.floor(rand() * b.length); b[at] = displayed(at, 'same key, new object'); }
      else if (op < 0.75 && b.length > 0) { const at = Math.floor(rand() * b.length); b[at] = displayed(100 + at); }
      else if (op < 0.85) b = b.map((d, i) => (rand() < 0.5 ? displayed(i, 'copy') : d));
      const expected = oracle(a, b);
      seen.add(expected);
      expect(updateShape(a, b), `pair ${k}`).toBe(expected);
    }
    expect([...seen].sort()).toEqual(['append', 'extend', 'other', 'replace', 'truncate']);
  });
});

describe('ADR-0046 step 3 — the row-level classification', () => {
  it('counts one insert per row added, one update per changed row, one remove per row removed', () => {
    const held = [row(0), row(1), row(2)];
    expect(classifyRows(held, 3, [row(3)])).toEqual({ insert: 1, remove: 0, update: 0, noop: false });
    expect(classifyRows(held, 1, [row(1, { body: 'changed' }), row(2)])).toEqual({ insert: 0, remove: 0, update: 1, noop: false });
    expect(classifyRows(held, 1, [row(1)])).toEqual({ insert: 0, remove: 1, update: 0, noop: false });
  });

  it('REQ-UIBENCH-064: an application that changed nothing is ONE noop and no row counters', () => {
    const held = [row(0), row(1)];
    expect(classifyRows(held, 1, [row(1)])).toEqual({ insert: 0, remove: 0, update: 0, noop: true });
  });

  it('REQ-UIBENCH-083: the classification is a pure function of the states, so two replays agree exactly', () => {
    const held = [row(0), row(1, { toolStatus: 'ok' })];
    const incoming = [row(1, { toolStatus: 'failed' }), row(2)];
    const a = classifyRows(held, 1, incoming);
    const b = classifyRows([...held], 1, [...incoming]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('ADR-0046 step 4 — the projection', () => {
  it('REQ-CHAT-064: two or more consecutive same-agent same-family tool rows fold into ONE header', () => {
    const rows = [row(0), tool(1, 'read_file'), tool(2, 'glob'), tool(3, 'list_dir'), row(4)];
    const display = projectDisplay(options(rows));
    expect(display.map((d) => d.shape)).toEqual(['row', 'group', 'row']);
    const group = asGroup(display[1]);
    expect(group.members.length).toBe(3);
    expect(group.family).toBe('reading');
    // REQ-CHAT-059: a group is keyed by the FIRST member's key, so it stays open while the group grows.
    expect(group.key).toBe(`group:${rowKey(rows[1]!)}`);
    // REQ-CHAT-065's "reveal its members beneath it" is `Row.tsx`'s to draw, hanging them from PD-CHAT-004's
    // one continuous rule. Step 4 emits the header ALONE and carries the members on it: emitting them a second
    // time as top-level rows drew every member twice the moment a line was opened
    // (`docs/defects/fixed/an-expanded-activity-line-draws-its-members-twice.md`).
    const open = projectDisplay(options(rows, { expanded: new Set([group.key]) }));
    expect(open.map((d) => d.shape)).toEqual(['row', 'group', 'row']);
    expect(asGroup(open[1]).members.map((m) => m.index)).toEqual([1, 2, 3]);
  });

  it('REQ-CHAT-064: an intervening row of another kind ends the run and prevents folding across it', () => {
    const rows = [tool(0, 'read_file'), row(1), tool(2, 'read_file')];
    expect(projectDisplay(options(rows)).map((d) => d.shape)).toEqual(['row', 'row', 'row']);
  });

  it('REQ-CHAT-064: a tool name outside the four lists forms a family of its own', () => {
    expect(familyOf('read_file')).toBe('reading');
    expect(familyOf('str_replace')).toBe('editing');
    expect(familyOf('codebase_search')).toBe('searching');
    expect(familyOf('run_command')).toBe('running');
    expect(familyOf('some_plugin_tool')).toBe('some_plugin_tool');
    const rows = [tool(0, 'some_plugin_tool'), tool(1, 'some_plugin_tool')];
    expect(asGroup(projectDisplay(options(rows))[0]).family).toBe('some_plugin_tool');
  });

  it('REQ-CHAT-066: the structured-questions row and an unsettled live terminal row never fold', () => {
    const questions = [tool(0, 'ask_questions'), tool(1, 'ask_questions')];
    expect(projectDisplay(options(questions)).every((d) => d.shape === 'row')).toBe(true);
    const terminal = [tool(0, 'terminal', { streamId: 's1', settled: false, toolStatus: 'running' }), tool(1, 'terminal')];
    expect(projectDisplay(options(terminal)).every((d) => d.shape === 'row')).toBe(true);
  });

  it('REQ-CHAT-065 / PD-CHAT-004: the header carries the counts, the elapsed SPAN, the earliest start and the capped blob', () => {
    const rows = [
      tool(0, 'read_file', { toolStatus: 'ok', durationMs: 100, startedAt: '2026-09-06T09:00:05.000Z', at: '2026-09-06T09:00:05.100Z', output: 'a' }),
      tool(1, 'read_file', { toolStatus: 'failed', durationMs: 250, startedAt: '2026-09-06T09:00:01.000Z', at: '2026-09-06T09:00:09.000Z', output: 'b'.repeat(3000) }),
    ];
    const group = asGroup(projectDisplay(options(rows))[0]);
    expect(group.counts).toEqual({ ok: 1, failed: 1, blocked: 0, running: 0 });
    // PD-CHAT-004 narrows REQ-CHAT-065's summed duration to the run's SPAN: 09:00:01 → 09:00:09 is 8 s, not
    // the 350 ms of work inside it. The per-segment figure below still sums, which is where the sum lives now.
    expect(group.durationMs).toBe(8_000);
    expect(group.segments[0]!.durationMs).toBe(350);
    expect(group.startedAt).toBe('2026-09-06T09:00:01.000Z');
    expect(group.endedAt).toBe('2026-09-06T09:00:09.000Z');
    expect(group.blob.length).toBe(2000);
    // REQ-CHAT-065: the severity ordering, and a summary that never emits raw tool output.
    expect(groupSeverity(group.counts)).toBe('failed');
    // The summary's order is REQ-CHAT-065's own example, `reading ×4 · 3 ok · 1 failed` — ok first. It is NOT
    // the severity ranking above, which the requirement gives for the header's COLOUR and which runs the other
    // way. Both halves of this batch implemented one of the two and this assertion had the colour ranking.
    expect(groupSummary(group.family, group.counts)).toBe('reading ×2 · 1 ok · 1 failed');
  });

  it('REQ-CHAT-168: a group summary is written for the counts it carries, at one and at many', () => {
    expect(groupSummary('reading', { ok: 1, failed: 0, blocked: 0, running: 0 })).toBe('reading ×1 · 1 ok');
    expect(groupSummary('reading', { ok: 3, failed: 1, blocked: 0, running: 0 })).toBe('reading ×4 · 3 ok · 1 failed');
    expect(groupSeverity({ ok: 2, failed: 0, blocked: 1, running: 1 })).toBe('blocked');
    expect(groupSeverity({ ok: 2, failed: 0, blocked: 0, running: 1 })).toBe('running');
  });

  it('REQ-CHAT-048: an unstamped thinking row equal to the previous one projects to zero rows', () => {
    const think = (i: number, body: string, over: Partial<TranscriptRow> = {}) => row(i, { kind: 'thinking', body, ...over });
    const rows = [think(0, 'the same'), think(1, 'the same'), think(2, 'different')];
    // PD-CHAT-004 folds the two SURVIVING reasoning rows into one activity line, so the dedup is counted in
    // its MEMBERS rather than in the displayed length — the rule under test is which rows survive hygiene.
    expect(asGroup(projectDisplay(options(rows))[0]).members.length).toBe(2);
    expect(projectDisplay(options(rows, { groupTools: false })).length).toBe(2);
    // A stamped duplicate is a real second burst and is kept.
    expect(projectDisplay(options([think(0, 'x'), think(1, 'x', { durationMs: 10 })], { groupTools: false })).length).toBe(2);
    // The rule is per agent — and so is PD-CHAT-004's run, so two agents' rows never fold together either.
    expect(projectDisplay(options([think(0, 'x'), think(1, 'x', { name: 'other', persona: 'other' })])).length).toBe(2);
  });

  /**
   * REQ-CHAT-048's "per agent" read as scoping the whole rule (OQ-91): the comparison is with the SAME agent's
   * immediately previous thinking row, so another agent's reasoning between two equal bursts does not save the repeat.
   * docs/defects/fixed/duplicate-reasoning-hygiene-compares-with-the-previous-thinking-row-of-any-agent.md.
   */
  describe('REQ-CHAT-048 per agent, with two agents\' reasoning interleaved', () => {
    const by = (name: string) => (i: number, body: string, over: Partial<TranscriptRow> = {}) =>
      row(i, { kind: 'thinking', body, name, persona: name, ...over });
    const A = by('A');
    const B = by('B');
    const bodies = (rows: readonly TranscriptRow[]) =>
      projectDisplay(options(rows, { groupTools: false })).map((d) => { const r = asRow(d).row; return `${r.name}:${r.body}`; });

    it('A, B, A-repeat: the repeat of A\'s own previous burst projects to zero rows, and B\'s equal burst is B\'s own', () => {
      expect(bodies([A(0, 'x'), B(1, 'x'), A(2, 'x')])).toEqual(['A:x', 'B:x']);
    });

    it('a repeat with another agent\'s different reasoning between is still dropped', () => {
      expect(bodies([A(0, 'x'), B(1, 'y'), A(2, 'x')])).toEqual(['A:x', 'B:y']);
      // However much of the other agent's reasoning lies between.
      expect(bodies([A(0, 'x'), B(1, 'y'), B(2, 'z'), A(3, 'x'), B(4, 'z')])).toEqual(['A:x', 'B:y', 'B:z']);
    });

    it('an agent\'s next burst that differs from its own previous one is kept, even where it equals another agent\'s', () => {
      expect(bodies([A(0, 'x'), B(1, 'y'), A(2, 'z')])).toEqual(['A:x', 'B:y', 'A:z']);
      expect(bodies([A(0, 'x'), B(1, 'y'), A(2, 'y')])).toEqual(['A:x', 'B:y', 'A:y']);
      // A stamped repeat is a real second burst, per agent as before.
      expect(bodies([A(0, 'x'), B(1, 'y'), A(2, 'x', { durationMs: 10 })])).toEqual(['A:x', 'B:y', 'A:x']);
    });

    it('the bounded projection over the same fixture equals the whole-state one at every append', () => {
      const all = [row(0, { kind: 'user', name: undefined, persona: undefined }), A(1, 'x'), B(2, 'y'), row(3, { name: 'B', persona: 'B' }),
        A(4, 'x'), B(5, 'y'), A(6, 'z'), B(7, 'x'), A(8, 'z', { durationMs: 5 }), A(9, 'z')];
      for (const groupTools of [false, true]) {
        for (let n = 2; n <= all.length; n += 1) {
          const before = options(all.slice(0, n - 1), { groupTools });
          const after = options(all.slice(0, n), { groupTools });
          const bounded = projectDisplay(after, { previous: projectDisplay(before), from: n - 1 });
          expect(bounded, `groupTools ${groupTools}, append of row ${n - 1}`).toEqual(projectDisplay(after));
        }
      }
      // And what they agree on is the per-agent reading: 4 repeats A's 1 across B's 2 and 3, 5 repeats B's 2.
      const kept = projectDisplay(options(all, { groupTools: false })).map((d) => asRow(d).row.index);
      expect(kept).toEqual([0, 1, 2, 3, 6, 7, 8]);
    });
  });

  it('REQ-CHAT-049: with no run in progress nothing presents as live', () => {
    const rows = [row(0, { kind: 'tool', toolName: 'read_file', toolStatus: 'running', settled: false }), row(1, { kind: 'thinking', settled: false, startedAt: '2026-09-06T09:00:00.000Z' })];
    // Grouping off, so the two rows are measured one at a time; PD-CHAT-004 would otherwise fold them into
    // one activity line, which is tested on its own below.
    const display = projectDisplay(options(rows, { running: false, groupTools: false }));
    expect(asRow(display[0]).row.toolStatus).toBeUndefined();
    expect(asRow(display[0]).row.settled).toBe(true);
    expect(asRow(display[1]).row.startedAt).toBeUndefined();
    // PD-CHAT-004: and the activity line they fold into is not live either, so nothing in it counts upward.
    expect(isLive(asGroup(projectDisplay(options(rows, { running: false }))[0]))).toBe(false);
  });

  it('REQ-CHAT-050: an edit-diff row is displayed at most once however often the transcript is re-projected', () => {
    const rows = [tool(0, 'write_file'), row(1, { kind: 'diff', callKey: 'c0', body: 'a.txt +1 -0' }), row(2, { kind: 'diff', callKey: 'c0', body: 'a.txt +1 -0' })];
    expect(projectDisplay(options(rows)).filter((d) => d.shape === 'row' && d.row.kind === 'diff').length).toBe(1);
    const long = ['a.md +60 -0', ...Array.from({ length: 60 }, (_, i) => `[${i}]+ line`)].join('\n');
    const capped = capDiff(long).split('\n');
    expect(capped.length).toBe(52);
    expect(capped.at(-1)).toBe('… +10 more lines, diff truncated');
  });

  it('REQ-CHAT-166: a cap affects only what is drawn, and expansion shows the untruncated value', () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const rows = [tool(0, 'grep', { output })];
    const collapsed = projectDisplay(options(rows));
    expect(asRow(collapsed[0]).row.output!.split('\n').length).toBe(11);
    expect(asRow(collapsed[0]).row.output).toContain('cut short — 20 more lines');
    const open = projectDisplay(options(rows, { expanded: new Set([rowKey(rows[0]!)]) }));
    expect(asRow(open[0]).row.output).toBe(output);
    // REQ-CHAT-168 again: one further line reads "1 more line".
    expect(capLines('a\nb', 1)).toBe('a\n… cut short — 1 more line');
    expect(capLines('a\nb', null)).toBe('a\nb');
    // Results switched off are not drawn at all, and expansion still shows them.
    const hidden = projectDisplay(options(rows, { caps: { show_tool_results: false, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 } }));
    expect(asRow(hidden[0]).row.output).toBe('');
  });

  it('REQ-CHAT-051 / REQ-MONITOR-230: the trailer rows follow every recorded row and are computed, not recorded', () => {
    const display = projectDisplay(options([row(0)], {
      pendingQuestions: [question(['Which branch?', 'Which remote?'])],
      pendingApprovals: [{ request_id: 'a1', agent_id: 'orchestrator', persona: 'orchestrator', command: 'rm -rf build', tool_name: 'terminal', options: [], reason: '', cwd: '' } as never],
      questionAgent: 'orchestrator',
    }));
    expect(display.map((d) => d.shape)).toEqual(['row', 'trailer', 'trailer']);
    expect(asTrailer(display[1]).trailer.text).toBe('2 steps — Which branch?');
    expect(asTrailer(display[2]).trailer.text).toBe('Approval needed — rm -rf build');
    // REQ-CHAT-168 at one: "1 step", never "1 step(s)".
    const one = trailerRows({ pendingQuestions: [question(['Only one?'])], pendingApprovals: [], questionAgent: 'a' });
    expect(asTrailer(one[0]).trailer.text).toBe('1 step — Only one?');
    expect(trailerRows({ pendingQuestions: [], pendingApprovals: [], questionAgent: undefined })).toEqual([]);
    // Part AC — REQ-CHAT-051 defines ONE question trailer: a second conversation's pending prompt adds no row.
    const two = trailerRows({ pendingQuestions: [question(['First?']), { ...question(['Second?']), request_id: 'q2', conversation_id: 'child' }], pendingApprovals: [], questionAgent: 'a' });
    expect(two).toHaveLength(1);
    expect(asTrailer(two[0]).trailer.requestId).toBe('q1');
  });

  it('REQ-CHAT-059: identity is stable and never positional', () => {
    expect(rowKey(row(3, { kind: 'tool', callKey: 'abc' }))).toBe('tool:abc');
    expect(rowKey(row(3, { kind: 'thinking', startedAt: 't0' }))).toBe('think:t0');
    expect(rowKey(row(3, { kind: 'delegation', name: 'writer' }))).toBe('deleg:writer');
    // A tool row with no call key falls back to a content hash rather than to its position.
    expect(rowKey(row(3, { kind: 'tool', body: 'x' }))).toBe(rowKey(row(9, { kind: 'tool', body: 'x' })));
  });

  it('REQ-CHAT-061/166: expanding a member of an activity line lifts the display caps for THAT member', () => {
    // The defect this pins (R0-4;
    // docs/defects/fixed/expanding-a-member-of-an-activity-line-does-not-lift-the-display-caps.md): the member
    // opened onto the capped projection because the card's key (`callKey ?? index`) stranded from the key `hygiene` holds the caps against (`rowKey`).
    const output = Array.from({ length: 30 }, (_, i) => `member line ${i}`).join('\n');
    const rows = [tool(0, 'read_file', { output }), tool(1, 'glob', { output })];
    // Collapsed: the caps hold — the members are projected THROUGH the group's hygiene, thirty lines in the
    // record against the ten-line cap, so what the projection carries out is ten plus the marker. The record
    // itself keeps all thirty (REQ-CHAT-166's "the session record MUST retain the full text").
    expect(rows.map((r) => r.output!.split('\n').length)).toEqual([30, 30]);
    const line = asGroup(projectDisplay(options(rows))[0]);
    expect(line.members.map((m) => m.output!.split('\n').length)).toEqual([11, 11]);
    const member = line.members[0]!;
    // The member's own identity is what step 4 reads: opening it projects it untruncated, and the sibling
    // stays capped — the expansion is per member, not per line.
    const memberKey = rowKey(member);
    const open = projectDisplay(options(rows, { expanded: new Set([memberKey]) }));
    const openLine = asGroup(open[0]);
    expect(openLine.members[0]!.output).toBe(output);
    expect(openLine.members[0]!.output).not.toContain('cut short');
    expect(openLine.members[1]!.output!.split('\n').length).toBe(11);
  });

  it('REQ-CHAT-067 / PD-CHAT-004: grouping off leaves every tool row its own row, and forms no run', () => {
    const rows = [tool(0, 'read_file'), tool(1, 'read_file'), tool(2, 'read_file')];
    expect(projectDisplay(options(rows, { groupTools: false })).map((d) => d.shape)).toEqual(['row', 'row', 'row']);
    const mixed = [thinking(0), tool(1, 'read_file'), thinking(2), tool(3, 'grep')];
    expect(projectDisplay(options(mixed, { groupTools: false })).map((d) => d.shape)).toEqual(['row', 'row', 'row', 'row']);
  });
});

describe('PD-CHAT-004 — the activity line', () => {
  /** The sequence the owner reported: one agent thinking and reading in turn, drawn as two alternating speakers. */
  const alternating = [
    thinking(0, { body: 'first', chars: 2216, durationMs: 16_000, at: '2026-09-06T09:00:16.000Z' }),
    tool(1, 'read_file', { at: '2026-09-06T09:00:17.000Z' }),
    tool(2, 'glob', { at: '2026-09-06T09:00:18.000Z' }),
    thinking(3, { body: 'second', chars: 132, durationMs: 1_000, at: '2026-09-06T09:00:19.000Z' }),
    tool(4, 'read_file', { at: '2026-09-06T09:00:20.000Z' }),
    tool(5, 'list_dir', { at: '2026-09-06T09:00:21.000Z' }),
  ];

  it('one agent\'s tool and reasoning rows fold into ONE line across families and across reasoning', () => {
    const display = projectDisplay(options(alternating));
    expect(display.map((d) => d.shape)).toEqual(['group']);
    const line = asGroup(display[0]);
    expect(line.members.length).toBe(6);
    // The role gutter names WHO. The defect this repairs put `reading` here.
    expect(line.role).toBe('orchestrator');
    // PD-CHAT-004 revision 2: ONE segment per activity word, carrying that word's totals, in the order the
    // words first appear. Revision 1 formed a second `reasoning` and a second `reading` here, which is how a
    // thirty-step run drew a thirty-segment line.
    expect(line.segments.map((s) => s.label)).toEqual(['reasoning', 'reading']);
    expect(line.segments.map((s) => s.members)).toEqual([2, 4]);
  });

  it('a further row extends the line and appends NO displayed row — the anti-flicker property', () => {
    const before = projectDisplay(options(alternating));
    const after = projectDisplay(options([...alternating, tool(6, 'grep', { at: '2026-09-06T09:00:22.000Z' })]));
    expect(before.length).toBe(1);
    expect(after.length).toBe(1);
    // REQ-CHAT-059: and it is still the same row, so the reader's expansion and the pool's slot survive it.
    expect(after[0]!.key).toBe(before[0]!.key);
    // A NEW word extends the line by one segment; a word already on it only moves that segment's totals.
    expect(asGroup(after[0]).segments.map((s) => s.label)).toEqual(['reasoning', 'reading', 'searching']);
    const again = projectDisplay(options([...alternating, tool(6, 'view', { at: '2026-09-06T09:00:22.000Z' })]));
    expect(asGroup(again[0]).segments.map((s) => s.label)).toEqual(['reasoning', 'reading']);
    expect(asGroup(again[0]).segments.map((s) => s.members)).toEqual([2, 5]);
  });

  it('the agent\'s own message, a user prompt and REQ-CHAT-066\'s exempt rows end that agent\'s run', () => {
    const message = [thinking(0), tool(1, 'read_file'), row(2), thinking(3), tool(4, 'read_file')];
    expect(projectDisplay(options(message)).map((d) => d.shape)).toEqual(['group', 'row', 'group']);
    // PD-CHAT-004 revision 2: a USER prompt ends every open run whatever it names — it is the turn boundary
    // the reader drew — and so does a row that names no agent at all.
    const turn = [thinking(0), tool(1, 'read_file'), row(2, { kind: 'user', name: undefined, persona: undefined }), thinking(3), tool(4, 'read_file')];
    expect(projectDisplay(options(turn)).map((d) => d.shape)).toEqual(['group', 'row', 'group']);
    const notice = [thinking(0), tool(1, 'read_file'), row(2, { kind: 'system', name: undefined, persona: undefined }), thinking(3), tool(4, 'read_file')];
    expect(projectDisplay(options(notice)).map((d) => d.shape)).toEqual(['group', 'row', 'group']);
    const exempt = [thinking(0), tool(1, 'ask_questions'), thinking(2), tool(3, 'terminal', { streamId: 's', settled: false, toolStatus: 'running' })];
    expect(projectDisplay(options(exempt)).map((d) => d.shape)).toEqual(['row', 'row', 'row', 'row']);
  });

  /** The screenshot of 2026-09-16: two agents working at once, their rows alternating in the record. */
  const helper = { name: 'helper', persona: 'coding-agent' } as const;
  const interleaved = [
    thinking(0), tool(1, 'read_file'),
    thinking(2, helper), tool(3, 'grep', helper),
    thinking(4), tool(5, 'glob'),
    thinking(6, helper), tool(7, 'codebase_search', helper),
    thinking(8), tool(9, 'read_file'),
  ];

  it('PD-CHAT-004 rev. 2: a second agent\'s row no longer ends a run — two agents draw TWO lines', () => {
    const display = projectDisplay(options(interleaved));
    // Revision 1 cut these ten rows into five lines of two. Each agent now owns exactly one.
    expect(display.map((d) => d.shape)).toEqual(['group', 'group']);
    expect(display.map((d) => asGroup(d).role)).toEqual(['orchestrator', 'coding-agent']);
    expect(display.map((d) => asGroup(d).members.length)).toEqual([6, 4]);
    // Each line sits where its EARLIEST member does — R-017's "display them according to sent first".
    expect(display.map((d) => asGroup(d).members[0]!.index)).toEqual([0, 2]);
    expect(asGroup(display[0]).segments.map((s) => s.label)).toEqual(['reasoning', 'reading']);
    expect(asGroup(display[1]).segments.map((s) => s.label)).toEqual(['reasoning', 'searching']);
  });

  it('PD-CHAT-004 rev. 2: either agent\'s next row extends its own line and appends NO displayed row', () => {
    const before = projectDisplay(options(interleaved));
    const after = projectDisplay(options([...interleaved, tool(10, 'list_dir')]));
    expect(after.length).toBe(before.length);
    expect(after.map((d) => d.key)).toEqual(before.map((d) => d.key));
    expect(asGroup(after[0]).members.length).toBe(7);
    expect(asGroup(after[1]).members.length).toBe(4);
    // And the SECOND agent's next row lengthens the second line, not the tail.
    const child = projectDisplay(options([...interleaved, tool(10, 'grep', helper)]));
    expect(child.length).toBe(before.length);
    expect(asGroup(child[1]).members.length).toBe(5);
  });

  it('PD-CHAT-004 rev. 2: the incremental path finds a clean cut across interleaved runs', () => {
    const whole = projectDisplay(options(interleaved));
    for (const from of [1, 2, 3, 5, 8, 9]) {
      const seeded = projectDisplay(options(interleaved.slice(0, from)));
      const bounded = projectDisplay(options(interleaved), { previous: seeded, from });
      expect(JSON.stringify(bounded)).toBe(JSON.stringify(whole));
    }
    // A run that began before a cut and reaches past it drags the cut below its first member, so no member
    // is left neither reused nor re-projected — the failure a per-pair walk-back would have produced here.
    const grown = [...interleaved, tool(10, 'read_file')];
    expect(JSON.stringify(projectDisplay(options(grown), { previous: whole, from: 10 })))
      .toBe(JSON.stringify(projectDisplay(options(grown))));
  });

  it('REQ-CHAT-167 on keeps reasoning OUT of the run, which is what keeps TranscriptPane\'s expansion shortcut sound', () => {
    const display = projectDisplay(options(alternating, { showReasoning: true }));
    expect(display.map((d) => d.shape)).toEqual(['row', 'group', 'row', 'group']);
    expect(display.filter((d) => d.shape === 'group').every((d) => asGroup(d).segments.every((s) => !s.reasoning))).toBe(true);
  });

  it('the summary is per segment, and a single-family run still reads exactly as REQ-CHAT-065 writes it', () => {
    const single = [tool(0, 'read_file'), tool(1, 'glob'), tool(2, 'view'), tool(3, 'list_dir', { toolStatus: 'failed' })];
    expect(activitySummary(asGroup(projectDisplay(options(single))[0]).segments)).toBe('reading ×4 · 3 ok · 1 failed');
    const line = asGroup(projectDisplay(options(alternating))[0]);
    // 2216 + 132 characters summed ONCE before dividing by 4, and 16 s + 1 s of reasoning — the totals the
    // whole run reached, not one figure per switch between words.
    expect(activitySummary(line.segments)).toBe('reasoning ×2 · 17s · ~587 tok, reading ×4 · 4 ok');
    // The two separators are never the same one, so a segment boundary is readable in the copied text.
    expect(FACT_SEPARATOR).not.toBe(SEGMENT_SEPARATOR);
    // REQ-CHAT-065: and no raw tool output reaches it, however long the members' output was.
    expect(activitySummary(asGroup(projectDisplay(options([tool(0, 'grep', { output: 'SECRET' }), tool(1, 'grep', { output: 'SECRET' })]))[0]).segments)).not.toContain('SECRET');
  });

  it("PD-CHAT-004 rev 3: a segment's facts carry their outcome, and joining them IS the summary", () => {
    const single = [tool(0, 'read_file'), tool(1, 'glob'), tool(2, 'view'), tool(3, 'list_dir', { toolStatus: 'failed' })];
    const segment = asGroup(projectDisplay(options(single))[0]).segments[0]!;
    const facts = segmentFacts(segment);
    // The one property that keeps the drawn line and the copied line from drifting: the renderer walks these
    // parts, copy joins them, and there is one definition of both.
    expect(facts.map((f) => f.text).join(FACT_SEPARATOR)).toBe(segmentSummary(segment));
    expect(segmentSummary(segment)).toBe('reading ×4 · 3 ok · 1 failed');
    // The failure is ONE fact of four. The family word and the ok count state no outcome, so nothing but
    // `1 failed` can take the fail colour — which is the whole of what the revision changes.
    expect(facts.map((f) => [f.text, f.outcome])).toEqual([
      ['reading ×4', null],
      ['3 ok', 'ok'],
      ['1 failed', 'failed'],
    ]);
    expect(facts.filter((f) => f.outcome === 'failed' || f.outcome === 'blocked')).toHaveLength(1);
  });

  it('PD-CHAT-004 rev 3: a reasoning segment states no outcome at all, so no part of it can be coloured as failed', () => {
    const line = asGroup(projectDisplay(options(alternating))[0]);
    const reasoning = line.segments.find((s) => s.reasoning)!;
    // The severity ordering is untouched and still says the run failed where a member did; what may not happen
    // is a reasoning fact taking that colour, because reasoning has no outcome to have failed at.
    expect(segmentFacts(reasoning).every((f) => f.outcome === null)).toBe(true);
    expect(segmentFacts(reasoning).map((f) => f.text).join(FACT_SEPARATOR)).toBe(segmentSummary(reasoning));
  });

  it('PD-CHAT-004 rev 3: a blocked member is a fact of its own, and a clean segment carries no colourable fact', () => {
    const mixed = [tool(0, 'read_file'), tool(1, 'glob', { toolStatus: 'blocked' })];
    const blocked = segmentFacts(asGroup(projectDisplay(options(mixed))[0]).segments[0]!);
    expect(blocked.find((f) => f.outcome === 'blocked')?.text).toBe('1 blocked');
    const clean = segmentFacts(asGroup(projectDisplay(options([tool(0, 'read_file'), tool(1, 'glob')]))[0]).segments[0]!);
    expect(clean.some((f) => f.outcome === 'failed' || f.outcome === 'blocked')).toBe(false);
  });

  it('a reasoning segment sums its characters ONCE before dividing, and a reasoning-only run is never coloured failed', () => {
    const thought = [thinking(0, { chars: 7, durationMs: 1_000 }), thinking(1, { body: 'b', chars: 7, durationMs: 2_000 })];
    const line = asGroup(projectDisplay(options(thought))[0]);
    // 14 ÷ 4 = 3, where rounding each member first would give 1 + 1 = 2.
    expect(line.segments[0]!.tokens).toBe(3);
    expect(line.segments[0]!.durationMs).toBe(3_000);
    expect(line.counts).toEqual({ ok: 0, failed: 0, blocked: 0, running: 0 });
    expect(groupSeverity(line.counts)).toBe('ok');
  });

  it('the line is live while reasoning streams, and its span counts up from the earliest start', () => {
    const streaming = [tool(0, 'read_file', { at: '2026-09-06T09:00:01.000Z' }), thinking(1, { settled: false, durationMs: undefined, startedAt: '2026-09-06T09:00:02.000Z', at: '2026-09-06T09:00:02.000Z' })];
    const line = asGroup(projectDisplay(options(streaming))[0]);
    expect(line.counts.running).toBe(0);
    // The second arm: no tool is running, and the agent is plainly still thinking.
    expect(isLive(line)).toBe(true);
    expect(line.inFlightLabel).toBe('reasoning');
    // The span counts from the earliest member's START (09:00:00), not from its recorded end.
    expect(line.startedAt).toBe('2026-09-06T09:00:00.000Z');
    expect(activitySpanMs(line, Date.parse('2026-09-06T09:00:30.000Z'))).toBe(30_000);
    // REQ-CHAT-049: with no run in progress it neither presents as live nor counts upward.
    expect(activitySpanMs(line, Date.parse('2026-09-06T09:00:30.000Z'), false)).toBe(line.durationMs);
  });

  it('the incremental path and the whole-state path agree on a mixed run', () => {
    const whole = projectDisplay(options(alternating));
    const seeded = projectDisplay(options(alternating.slice(0, 3)));
    const incremental = projectDisplay(options(alternating), { previous: seeded, from: 3 });
    expect(JSON.stringify(incremental)).toBe(JSON.stringify(whole));
  });
});

describe('ADR-0046 step 4 — the incremental bound', () => {
  it('REQ-CHAT-069: the projection does not filter by agent — the surface that owns the toggle does', () => {
    // One requirement, one implementation: `scopedRows` in `TranscriptSurface.tsx` is it, and the projection
    // draws whatever rows it is given (docs/defects/fixed/the-in-projection-scope-filter-is-never-reached.md).
    const rows = [row(0, { kind: 'user' }), row(1, { name: 'alpha' }), row(2, { name: 'beta' }), row(3, { kind: 'verifier', name: 'beta' })];
    const display = projectDisplay(options(rows, { groupTools: false }));
    expect(display.map((d) => (d.shape === 'row' ? d.row.index : -1))).toEqual([0, 1, 2, 3]);
  });

  it('ADR-0046: the projection is bounded by what changed, and the bounded form equals the whole one', () => {
    const rows = [row(0), tool(1, 'read_file'), tool(2, 'read_file'), row(3), row(4)];
    const whole = projectDisplay(options(rows));
    const changed = [...rows.slice(0, 4), row(4, { body: 'changed' })];
    const bounded = projectDisplay(options(changed), { previous: whole, from: 4 });
    expect(bounded).toEqual(projectDisplay(options(changed)));
    // Walking back to the nearest group boundary: a change inside a fold recomputes that fold and nothing earlier.
    const inFold = [...rows]; inFold[2] = tool(2, 'read_file', { toolStatus: 'failed' });
    expect(projectDisplay(options(inFold), { previous: whole, from: 2 })).toEqual(projectDisplay(options(inFold)));
  });

  it('REQ-CHAT-055: an append at 1,200 rows finds its reusable prefix without asking the rows above it where they end', () => {
    // V8's CPU profile of the built app (2026-09-29, the defect note's "CPU profile" section) named the bounded form's
    // passes over the previous display — `lastIndexOf` — among the loaded side's extra script. The first form FILTERED
    // the previous display to the rows below the boundary, then searched it again for the cut and replaced the filter's
    // result with the slice above it: every displayed row asked twice where it ends (four reads of its shape), on every
    // increment. Now a display a bounded projection built carries its reach, and the next one bisects it.
    const held = Array.from({ length: 1_200 }, (_, i) => row(i, { kind: i === 0 ? 'user' : 'agent' }));
    let reads = 0;
    const counted = projectDisplay(options(held)).map((d) => {
      const copy = { ...d };
      Object.defineProperty(copy, 'shape', { get() { reads += 1; return d.shape; }, enumerable: true });
      return copy;
    });
    // A display handed in from elsewhere has no reach yet: it is read once, to build it (two reads of each shape).
    const once = [...held, row(1_200)];
    const first = projectDisplay(options(once), { previous: counted, from: 1_200 });
    expect(reads).toBeLessThanOrEqual(2 * counted.length + 8);
    // The display that projection built carries its reach forward: the next append reads the rows above it not at all.
    reads = 0;
    const twice = [...once, row(1_201)];
    const second = projectDisplay(options(twice), { previous: first, from: 1_201 });
    const asked = reads;
    expect(asked).toBeLessThanOrEqual(8);
    expect(second).toEqual(projectDisplay(options(twice)));
    expect(first).toEqual(projectDisplay(options(once)));
  });
});

describe('REQ-CHAT-074 — search over displayed rows', () => {
  const rows = [row(0, { body: 'nothing here' }), tool(1, 'read_file', { output: 'the NEEDLE is in the fold' }), tool(2, 'read_file', { output: 'plain' })];
  const display = projectDisplay(options(rows));

  it('matches inside a collapsed group through its capped member blob, and lands on the header', () => {
    const found = indexAll(display, 'needle');
    expect(found.length).toBe(1);
    expect(display[found[0]!.at]!.shape).toBe('group');
  });

  it('matches on role, body, tool name and detail, and case-folds', () => {
    expect(matchRow(display[0]!, 0, 'NOTHING')).not.toBeNull();
    expect(matchRow(display[0]!, 0, 'orchestrator')).not.toBeNull();
    expect(matchRow(display[0]!, 0, 'absent')).toBeNull();
    expect(matchRow(display[0]!, 0, '')).toBeNull();
  });

  it('the count label and the wrapping navigation are REQ-CHAT-074\'s, and REQ-CHAT-168 binds the wording', () => {
    expect(countLabel(0, 0)).toBe('0 results');
    expect(countLabel(3, 0)).toBe('1 of 3');
    expect(step(0, 3, -1)).toBe(2);
    expect(step(2, 3, 1)).toBe(0);
    expect(step(0, 0, 1)).toBe(0);
  });

  it('the index is updated over the changed suffix, never rebuilt whole', () => {
    const whole = indexAll(display, 'read_file');
    expect(indexSuffix(whole, display, 'read_file', 1)).toEqual(whole);
  });
});

describe("REQ-CHAT-070: telling the pane's own scroll from the reader's", () => {
  it("reads the position the pane set as the pane's, and any other position as the reader's", () => {
    // Nothing outstanding: every event is the reader's, which is the resting state of a pane at the tail.
    expect(isOwnScroll(null, 0)).toBe(false);
    expect(isOwnScroll(null, 1200)).toBe(false);
    // The pin landed where the pane put it.
    expect(isOwnScroll(1200, 1200)).toBe(true);
    // THE DEFECT, as a number. The pane pinned to 1200 and the reader scrolled to 640 before the pin's own
    // event was delivered. The flag this replaced answered 'mine' here, swallowed the release, and pinned
    // again on the next render; the position says whose it is whatever order the events arrive in.
    expect(isOwnScroll(1200, 640)).toBe(false);
  });

  it('tolerates the sub-pixel readback a device pixel ratio produces, and nothing wider', () => {
    expect(isOwnScroll(1200, 1200 + SCROLL_ORIGIN_EPSILON)).toBe(true);
    expect(isOwnScroll(1200, 1200 - SCROLL_ORIGIN_EPSILON)).toBe(true);
    expect(isOwnScroll(1200, 1201)).toBe(false);
    // One scroll-wheel notch is tens of pixels, so the tolerance can never absorb a reader's gesture.
    expect(isOwnScroll(1200, 1140)).toBe(false);
  });
});
