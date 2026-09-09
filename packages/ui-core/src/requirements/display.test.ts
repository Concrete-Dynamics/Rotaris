import { describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, BOARD_ACTIONS, COLUMN_TOKENS, HEALTH_TOKENS, RELATION_TOKENS, type BoardCard, type EpicCard } from '@rotaris/contracts';
import { AXES, AXIS_DRAGGABLE, EMPTY_COLUMN_SENTENCE, EMPTY_FILTER, HEALTH_GLOSS, NO_FILTER_SENTENCE, NOTHING_OWED, RELATION_LABEL, absoluteMoment, actionLabel, axisOf, axisValue, blockedHeading, blockedRows, blockerWording, cardFacts, columnHeader, columnLabel, columnsFor, describeFilter, distribute, emptinessFolds, epicProgressLine, evidenceSegments, evidenceSummary, executionLine, filterCards, foldDecision, healthGloss, joinCapped, parseFolds, pruneFolds, relativeAge, serializeFolds, sortCards, sortOrderOf } from './display.js';

/**
 * The pure display mapping (Part AK; REQ-TRACE-380): every input supplied, the same inputs the same output; the
 * closed vocabularies mapped totally; health, evidence, delivery state and epic progress passed through untouched.
 */
const card = (id: string, over: Partial<BoardCard> = {}): BoardCard => ({
  id, title: `Title ${id}`, column: 'backlog', health: 'healthy', lifecycle: 'approved', kind: 'product', sourcePath: `docs/${id}.md`, sourceKey: 'docs',
  evidence: { sites: [] }, alerts: [], relations: [], facts: [{ label: 'Source', value: 'docs' }, { label: 'Units', value: '0' }], ...over,
});
const NOW = '2026-09-09T12:00:00Z';

describe('columns (REQ-TRACE-232..236, 293..298)', () => {
  it('REQ-TRACE-234: `<Label> · <count>`, hyphens title-cased, identifiers as-is', () => {
    expect(columnHeader('needs-update', 3)).toBe('Needs Update · 3');
    expect(columnHeader('backlog', 0)).toBe('Backlog · 0');
    expect(columnHeader('REQ-100', 2, true)).toBe('REQ-100 · 2');
    expect(columnLabel('incomplete-traceability')).toBe('Incomplete Traceability');
  });
  it('REQ-TRACE-236: every column token has its own sentence; the delivery axis is fixed and not derived from data', () => {
    for (const t of COLUMN_TOKENS) expect(EMPTY_COLUMN_SENTENCE[t]).toMatch(/belong here/);
    expect(columnsFor('delivery', [])).toEqual(['backlog', 'ready', 'running', 'review', 'needs-update', 'done', 'blocked']);
    expect(columnsFor('delivery', [], [], false)).toEqual(['backlog', 'ready', 'running', 'review', 'needs-update', 'done']);
  });
  it('REQ-TRACE-295/296: closed axes emit every value; open axes only present values with `unset` last; an epic lands in its own column', () => {
    const epics: EpicCard[] = [{ id: 'REQ-100', title: 'E', done: 0, total: 1, children: ['REQ-101'] }];
    const cards = [card('REQ-100'), card('REQ-101', { epic: 'REQ-100' }), card('REQ-9'), card('REQ-201', { epic: 'REQ-200' })];
    expect(columnsFor('health', cards)).toEqual([...HEALTH_TOKENS]);
    expect(columnsFor('epic', cards, epics)).toEqual(['REQ-100', 'REQ-200', 'unset']);
    expect(columnsFor('epic', cards.slice(0, 2), epics)).toEqual(['REQ-100']);
    expect(axisValue(cards[0]!, 'epic', epics)).toBe('REQ-100');
    expect(axisValue(cards[1]!, 'epic', epics)).toBe('REQ-100');
    expect(axisValue(cards[2]!, 'epic', epics)).toBe('unset');
    expect(axisValue(card('x', { priority: 'High' }), 'priority')).toBe('high');
    expect(axisValue(card('x'), 'priority')).toBe('none');
  });
  it('REQ-TRACE-235/298: distribution puts every card in exactly one column; blocked is pinned on delivery and folds into its origin when hidden', () => {
    const cards = [card('REQ-1'), card('REQ-2', { column: 'blocked', returnTo: 'review' }), card('REQ-3', { column: 'done' })];
    const on = distribute('delivery', cards);
    expect([...on.values()].reduce((n, l) => n + l.length, 0)).toBe(3);
    expect(on.get('blocked')!.map((c) => c.id)).toEqual(['REQ-2']);
    const off = distribute('delivery', cards, [], false);
    expect(off.get('review')!.map((c) => c.id)).toEqual(['REQ-2']);
    expect(off.has('blocked')).toBe(false);
  });
  it('REQ-TRACE-297: only the delivery axis is draggable', () => {
    expect(AXES.filter((a) => AXIS_DRAGGABLE[a])).toEqual(['delivery']);
  });
});

describe('sort and filter (REQ-TRACE-287..292, 302)', () => {
  it('REQ-TRACE-288/289: priority order then digit-aware identifier; an unknown priority ranks after Low', () => {
    const cards = [card('REQ-10', { priority: 'Low' }), card('REQ-9', { priority: 'Low' }), card('REQ-2', { priority: 'Critical' }), card('REQ-3', { priority: 'Urgent' }), card('REQ-1')];
    expect(sortCards(cards, 'priority').map((c) => c.id)).toEqual(['REQ-2', 'REQ-9', 'REQ-10', 'REQ-3', 'REQ-1']);
    expect(sortCards(cards, 'identifier').map((c) => c.id)).toEqual(['REQ-1', 'REQ-2', 'REQ-3', 'REQ-9', 'REQ-10']);
    expect(sortCards([card('a', { health: 'blocked' }), card('b', { health: 'healthy' })], 'health').map((c) => c.id)).toEqual(['b', 'a']);
    expect(sortOrderOf('bogus')).toBe('priority');
    expect(axisOf('by-colour')).toBe('delivery');
  });
  it('REQ-TRACE-290/291: six dimensions, text as a substring of id or title, epic matching the fact or the epic card itself, the rest exact; the summary in fixed order', () => {
    const epics: EpicCard[] = [{ id: 'REQ-100', title: 'E', done: 0, total: 1, children: ['REQ-101'] }];
    const cards = [card('REQ-100', { title: 'Epic' }), card('REQ-101', { epic: 'REQ-100', title: 'Login' }), card('REQ-102', { title: 'Logout', health: 'blocked' })];
    expect(filterCards(cards, { ...EMPTY_FILTER, text: 'log' }).map((c) => c.id)).toEqual(['REQ-101', 'REQ-102']);
    expect(filterCards(cards, { ...EMPTY_FILTER, epic: 'REQ-100' }, epics).map((c) => c.id)).toEqual(['REQ-100', 'REQ-101']);
    expect(filterCards(cards, { ...EMPTY_FILTER, health: 'blocked' }).map((c) => c.id)).toEqual(['REQ-102']);
    expect(describeFilter(EMPTY_FILTER)).toBe(NO_FILTER_SENTENCE);
    expect(describeFilter({ text: 'x', epic: 'REQ-100', source: '', lifecycle: 'approved', health: '', priority: 'High' })).toBe('Filtered by text "x", epic REQ-100, lifecycle approved, priority High.');
  });
});

describe('folds (REQ-TRACE-304, 306, 313, 315, 316)', () => {
  it('a user decision wins; otherwise emptiness folds; the first-run exception holds until a card leaves the entry columns', () => {
    expect(foldDecision(true, false, 5)).toBe(true);
    expect(foldDecision(false, true, 0)).toBe(false);
    expect(foldDecision(undefined, true, 0)).toBe(true);
    expect(foldDecision(undefined, true, 1)).toBe(false);
    expect(emptinessFolds([card('a'), card('b', { column: 'blocked' })])).toBe(false);
    expect(emptinessFolds([card('a'), card('b', { column: 'ready' })])).toBe(true);
  });
  it('stored folds never raise, drop non-boolean members alone, serialise with sorted keys, and prune only project-supplied keys', () => {
    expect(parseFolds('not json')).toEqual({});
    expect(parseFolds('[1]')).toEqual({});
    expect(parseFolds('{"b":true,"a":"yes","c":false}')).toEqual({ b: true, c: false });
    expect(serializeFolds({ b: true, a: false })).toBe('{"a":false,"b":true}');
    expect(pruneFolds({ 'REQ-100': true, 'REQ-200': true }, 'epic', ['REQ-100'])).toEqual({ 'REQ-100': true });
    expect(pruneFolds({ blocked: true }, 'delivery', [])).toEqual({ blocked: true });
  });
});

describe('actions, time, health, evidence (REQ-TRACE-382, 250, 251, 252, 258..261)', () => {
  it('REQ-TRACE-382: labels replace hyphens and capitalise as a sentence, for all fourteen', () => {
    expect(actionLabel('send-back')).toBe('Send back');
    expect(actionLabel('accept-change-work')).toBe('Accept change work');
    for (const a of BOARD_ACTIONS) expect(actionLabel(a)).toMatch(/^[A-Z][a-z ]+$/);
  });
  it('REQ-TRACE-250: the thresholds, singular and plural, from the supplied clock only', () => {
    expect(relativeAge(undefined, NOW)).toBe('');
    expect(relativeAge('2026-09-09T11:59:30Z', NOW)).toBe('just now');
    expect(relativeAge('2026-09-09T12:00:30Z', NOW)).toBe('just now');
    expect(relativeAge('2026-09-09T11:59:00Z', NOW)).toBe('1 minute ago');
    expect(relativeAge('2026-09-09T11:30:00Z', NOW)).toBe('30 minutes ago');
    expect(relativeAge('2026-09-09T10:59:00Z', NOW)).toBe('1 hour ago');
    expect(relativeAge('2026-09-07T12:00:00Z', NOW)).toBe('2 days ago');
    expect(relativeAge('2026-09-09T11:00:00', NOW)).toBe('2026-09-09T11:00:00');
    expect(relativeAge('2026-09-09T11:00:00Z', undefined)).toBe('2026-09-09T11:00:00Z');
  });
  it('REQ-TRACE-251: local time at minute resolution with the offset only when the stamp carries a zone', () => {
    expect(absoluteMoment('2026-09-09T12:34:56Z', 120)).toBe('2026-09-09 14:34 UTC+02:00');
    expect(absoluteMoment('2026-09-09T00:10:00Z', -330)).toBe('2026-09-08 18:40 UTC-05:30');
    expect(absoluteMoment('2026-09-09T12:34:56', 120)).toBe('2026-09-09T12:34:56');
  });
  it('REQ-TRACE-252: a gloss for each of the seven words and none for an eighth', () => {
    for (const h of HEALTH_TOKENS) expect(healthGloss(h)).toBe(HEALTH_GLOSS[h]);
    expect(() => healthGloss('fine' as never)).toThrow(/closes the set/);
    for (const k of BLOCKER_KINDS) expect(blockerWording(k).heading).toBeTruthy();
    expect(() => blockerWording('weather' as never)).toThrow(/REQ-TRACE-446/);
    for (const r of RELATION_TOKENS) expect(RELATION_LABEL[r]).toBeTruthy();
  });
  it('REQ-TRACE-258/260/261: one segment per owed obligation in order, the states as reported, empty with a reason when nothing is owed', () => {
    const c = card('REQ-1', { evidence: { implementationTrace: 'satisfied', verification: 'failed', sites: [] }, alerts: ['Missing evidence: covering-test.', 'Verification failing: verification.'] });
    const seg = evidenceSegments(c);
    expect(seg.map((s) => [s.kind, s.state])).toEqual([['implementation-trace', 'satisfied'], ['covering-test', 'missing'], ['verification', 'failed']]);
    expect(evidenceSummary(seg)).toBe('Implementation trace: Satisfied · Covering test: Missing · Verification: Failing');
    expect(evidenceSegments(card('REQ-2'))).toEqual([]);
    expect(evidenceSummary([])).toBe(NOTHING_OWED);
  });
  it('REQ-TRACE-249: the execution line is always a sentence, with the age collapsing when unavailable', () => {
    expect(executionLine(card('a'), NOW)).toBe('No execution units yet · never run');
    expect(executionLine(card('a', { facts: [{ label: 'Units', value: '1' }, { label: 'Last run', value: '2026-09-09T11:00:00Z|completed' }] }), NOW)).toBe('1 execution unit · last run 1 hour ago (completed)');
    expect(executionLine(card('a', { facts: [{ label: 'Units', value: '3' }, { label: 'Last run', value: '|interrupted' }] }), NOW)).toBe('3 execution units · last run (interrupted)');
  });
  it('REQ-TRACE-243: last change carries the relative age with the absolute moment as detail; the two counted facts are consumed by the execution line', () => {
    const facts = cardFacts(card('a', { facts: [{ label: 'Priority', value: 'High' }, { label: 'Last change', value: '2026-09-09T11:00:00Z' }, { label: 'Units', value: '2' }] }), NOW, 60);
    expect(facts).toEqual([{ label: 'Priority', value: 'High' }, { label: 'Last change', value: '1 hour ago', detail: '2026-09-09 12:00 UTC+01:00' }]);
    expect(joinCapped(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a, b, c, d and 2 more');
  });
  it('REQ-TRACE-240/282/285: the blocked heading states the true total and lists at most twenty; the epic line', () => {
    expect(blockedHeading(1)).toBe('1 blocked requirement');
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `REQ-${i + 1}`, reason: `Blocked (stated): reason ${i + 1}` }));
    const rows = blockedRows(many);
    expect(rows.rows).toHaveLength(20);
    expect(rows.rows[0]!.reason).toBe('reason 1');
    expect(rows.notListed).toBe(5);
    expect(epicProgressLine({ id: 'e', title: 't', done: 2, total: 4, children: ['a', 'b', 'c', 'd', 'e'] })).toBe('2 of 4 requirements done (1 deprecated child left out)');
    expect(epicProgressLine({ id: 'e', title: 't', done: 0, total: 0, children: [] })).toBe('This epic has no children yet.');
  });
});
