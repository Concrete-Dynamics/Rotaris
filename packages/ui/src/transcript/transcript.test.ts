import { describe, expect, it } from 'vitest';
import type { QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { classifyRows } from '@rotaris/ui-core';
import { capLines, capDiff, familyOf, groupSeverity, groupSummary, projectDisplay, rowKey, trailerRows, type ProjectOptions } from './project.js';
import type { DisplayRow } from './types.js';
import { buildOffsets, captureAnchor, estimateHeight, indexAt, newUpdatesLabel, restoreAnchor, updateShape, visibleRange } from './pool.js';
import { countLabel, indexAll, indexSuffix, matchRow, step } from './search.js';
import { LruCache, reuseKey } from './cache.js';
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
  rows, running: true, groupTools: true,
  caps: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  expanded: new Set<string>(), pendingQuestions: [], pendingApprovals: [], ...over,
});

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

  it('a height estimate never falls below REQ-CHAT-057\'s 30 px minimum', () => {
    expect(estimateHeight({ shape: 'row', key: 'k', row: row(0, { body: '' }) })).toBeGreaterThanOrEqual(ROW_MIN_HEIGHT);
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
    // REQ-CHAT-065: expanding a group keeps the header and REVEALS its members beneath it.
    const open = projectDisplay(options(rows, { expanded: new Set([group.key]) }));
    expect(open.map((d) => d.shape)).toEqual(['row', 'group', 'row', 'row', 'row', 'row']);
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

  it('REQ-CHAT-065: the header carries the counts, the summed duration, the earliest start and the capped blob', () => {
    const rows = [
      tool(0, 'read_file', { toolStatus: 'ok', durationMs: 100, startedAt: '2026-09-06T09:00:05.000Z', output: 'a' }),
      tool(1, 'read_file', { toolStatus: 'failed', durationMs: 250, startedAt: '2026-09-06T09:00:01.000Z', output: 'b'.repeat(3000) }),
    ];
    const group = asGroup(projectDisplay(options(rows))[0]);
    expect(group.counts).toEqual({ ok: 1, failed: 1, blocked: 0, running: 0 });
    expect(group.durationMs).toBe(350);
    expect(group.startedAt).toBe('2026-09-06T09:00:01.000Z');
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
    expect(projectDisplay(options(rows)).length).toBe(2);
    // A stamped duplicate is a real second burst and is kept.
    expect(projectDisplay(options([think(0, 'x'), think(1, 'x', { durationMs: 10 })])).length).toBe(2);
    // The rule is per agent.
    expect(projectDisplay(options([think(0, 'x'), think(1, 'x', { name: 'other' })])).length).toBe(2);
  });

  it('REQ-CHAT-049: with no run in progress nothing presents as live', () => {
    const rows = [row(0, { kind: 'tool', toolName: 'read_file', toolStatus: 'running', settled: false }), row(1, { kind: 'thinking', settled: false, startedAt: '2026-09-06T09:00:00.000Z' })];
    const display = projectDisplay(options(rows, { running: false }));
    expect(asRow(display[0]).row.toolStatus).toBeUndefined();
    expect(asRow(display[0]).row.settled).toBe(true);
    expect(asRow(display[1]).row.startedAt).toBeUndefined();
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

  it('REQ-CHAT-067: grouping off leaves every tool row its own row', () => {
    const rows = [tool(0, 'read_file'), tool(1, 'read_file'), tool(2, 'read_file')];
    expect(projectDisplay(options(rows, { groupTools: false })).map((d) => d.shape)).toEqual(['row', 'row', 'row']);
  });

  it('REQ-CHAT-069: the scope filter keeps user, system and verifier rows plus the named agent\'s', () => {
    const rows = [row(0, { kind: 'user' }), row(1, { name: 'alpha' }), row(2, { name: 'beta' }), row(3, { kind: 'verifier', name: 'beta' })];
    const display = projectDisplay(options(rows, { scopeAgent: 'alpha', groupTools: false }));
    expect(display.map((d) => (d.shape === 'row' ? d.row.index : -1))).toEqual([0, 1, 3]);
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
