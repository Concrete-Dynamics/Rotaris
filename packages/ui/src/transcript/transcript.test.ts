import { describe, expect, it } from 'vitest';
import type { QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { classifyRows } from '@rotaris/ui-core';
import {
  activitySpanMs, activitySummary, capLines, capDiff, familyOf, groupSeverity, groupSummary, isLive, projectDisplay, rowKey,
  segmentFacts, segmentSummary, trailerRows,
  FACT_SEPARATOR, SEGMENT_SEPARATOR, type ProjectOptions,
} from './project.js';
import type { DisplayRow } from './types.js';
import { buildOffsets, captureAnchor, estimateHeight, indexAt, newUpdatesLabel, restoreAnchor, updateShape, visibleRange } from './pool.js';
import { countLabel, indexAll, indexSuffix, matchRow, step } from './search.js';
import { SCROLL_ORIGIN_EPSILON, isOwnScroll } from './scroll.js';
import { LruCache, identityOf, measureKey, reuseKey } from './cache.js';
import { H_MAX, POOL_CAPACITY, ROW_MIN_HEIGHT, capacityFor } from './constants.js';

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
    expect(POOL_CAPACITY).toBe(Math.ceil(H_MAX / ROW_MIN_HEIGHT) + 10);
    // The ONE growth branch: a viewport taller than H_max, which the benchmark's window never reaches.
    expect(capacityFor(900)).toBe(POOL_CAPACITY);
    expect(capacityFor(H_MAX)).toBe(POOL_CAPACITY);
    expect(capacityFor(20_000)).toBeGreaterThan(POOL_CAPACITY);
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
    // A one-line row is one ~17 px text line over the 30 px unit — NOT the old 34 px padding-box term.
    const oneLine = estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'one line' }) });
    expect(oneLine).toBe(ROW_MIN_HEIGHT);
    // Multi-line rows still grow per line.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: 'a\nb\nc' }) })).toBeGreaterThan(oneLine);
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

  // ---- the estimate models WRAPPING (docs/defects/live-rows-are-never-measured.md) ------------------------
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
    // With no width known nothing can be predicted, so the old width-blind count is what is left.
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: paragraph }) }, false)).toBe(ROW_MIN_HEIGHT);
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
    // The defect this pins (docs/defects/…, R0-4): the member opened onto the capped projection because the
    // card's key (`callKey ?? index`) stranded from the key `hygiene` holds the caps against (`rowKey`).
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
