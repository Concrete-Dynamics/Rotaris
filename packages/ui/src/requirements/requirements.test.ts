import { describe, expect, it } from 'vitest';
import type { BoardCard, BoardProjection, EpicCard, Reachability } from '@rotaris/contracts';
import { DELIVERY_COLUMNS, PANE_KEYS, REVIEW_DECISIONS } from '@rotaris/contracts';
// Part R2 — the pane host's pure half and the registry the board drives it through.
import { createPaneRegistry } from './panes/registry.js';
import { PANE_TITLE, consequenceForDecision, disclosurePending, dispatchNothingStarted, heldLaunch, installedPanesSentence, launchAbandoned } from './panes-host.js';
import { decidedNotice, followDecision } from './panes/presentation.js';
import { arcPath, segmentArcs } from './EvidenceIndicator.js';
import { cardDescription } from './Card.js';
import { DETAIL_SECTIONS, SECTION_EMPTY } from './DetailPanel.js';
import {
  ALERT_GLYPH, CLOSED_DROPDOWN_WIDTH, COLUMN_GAP, COLUMN_MAX, COLUMN_MIN, COLUMN_OVERSCAN_PX, CONFIRM_ACTIONS, OPEN_DROPDOWN_WIDTH, OTHER_CONTROL_HEIGHT, OVERSCAN_CARDS, PRIMARY_CONTROL_HEIGHT, PRIVATE_TRANSFER_TYPE, RAIL_CHARS, RAIL_MARGIN, RELEASED_POOL_CAP, SEARCH_DEBOUNCE_MS,
  alertSeverity, bodyStateOf, dragRefusedOnAxisSentence, dropTargetOptions, epicSummary, epicSummaryLine, headingAccessibleName, inFlightLabelFor, initialColumnBandEnd, mergeAffected, moveActionFor, moveControlState, moveRefusedSentence, moveReachableSentence, moveStartsRun, nothingSelectedSentence, payloadFieldFor, promptWithdrawnSentence, pruneUserFolds, railAccessibleName, realisedBand, rejectedDocumentsSentence, visibleColumnBand,
} from './model.js';

/**
 * Part AK2 — the board's pure model, measured where a browser is not needed. What the board DRAWS is
 * `requirements-proof`'s (Electron, the fixture store); what it DECIDES — the naming table of REQ-TRACE-385, the
 * run-starting rule of 386, the confirmation set of 383, the affected-only merge of 374, the band arithmetic of
 * 358..365, the fold pruning of 316, the epic counts of 282, the move control's three states of 391 — is here.
 */
function card(id: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id, title: `Title ${id}`, column: 'backlog', health: 'healthy', lifecycle: 'approved', kind: 'product', sourcePath: `docs/${id}.md`, sourceKey: 'docs/requirements',
    evidence: { sites: [] }, alerts: [], relations: [], facts: [{ label: 'Source', value: 'docs/requirements' }, { label: 'Units', value: '0' }],
    ...over,
  };
}
function projection(cards: readonly BoardCard[], generation = 1): BoardProjection {
  return { workspace: 'w', generation, producedAt: '2026-09-09T10:00:00Z', source: { kind: 'store', dir: 'docs/requirements', writable: false, canCreate: false }, cards, epics: [], queue: { entries: [], automatic: false, concurrency: 2, stopped: false }, blocked: [], analysisEnabled: false, parseErrors: [] };
}
const reachable = (consequence: string, confirm = true): Reachability => ({ reachable: true, consequence, confirm, glyph: '→', reachableFromSource: ['ready'] });
const refused = (reason: string, from: readonly ('backlog' | 'ready' | 'running' | 'review' | 'needs-update' | 'done')[] = []): Reachability => ({ reachable: false, confirm: false, reason, glyph: '⊘', reachableFromSource: from });

describe('the naming table (REQ-TRACE-385) and the run-starting rule (REQ-TRACE-386)', () => {
  it('names exactly the five user moves and the two overriding rules, and nothing else', () => {
    expect(moveActionFor('backlog', 'ready')).toBe('release');
    expect(moveActionFor('needs-update', 'ready')).toBe('release');
    expect(moveActionFor('ready', 'backlog')).toBe('return');
    expect(moveActionFor('review', 'done')).toBe('accept');
    expect(moveActionFor('review', 'ready')).toBe('send-back');
    for (const from of DELIVERY_COLUMNS) expect(moveActionFor(from, 'blocked')).toBe('hold');
    for (const to of DELIVERY_COLUMNS) expect(moveActionFor('blocked', to)).toBe('resume');
    // An empty source or target, an equal pair, or a pair that means nothing yield NO action — not a refusal.
    expect(moveActionFor('', 'ready')).toBeUndefined();
    expect(moveActionFor('ready', '')).toBeUndefined();
    expect(moveActionFor('ready', 'ready')).toBeUndefined();
    expect(moveActionFor('backlog', 'done')).toBeUndefined();
    expect(moveActionFor('done', 'backlog')).toBeUndefined();
    expect(moveActionFor('running', 'review')).toBeUndefined();
  });
  it('starts agent work for the three run-starting actions unconditionally, for resume only into ready, and for nothing else', () => {
    expect(moveStartsRun('release', 'ready')).toBe(true);
    expect(moveStartsRun('rerun', undefined)).toBe(true);
    expect(moveStartsRun('send-back', 'ready')).toBe(true);
    expect(moveStartsRun('resume', 'ready')).toBe(true);
    expect(moveStartsRun('resume', 'backlog')).toBe(false);
    expect(moveStartsRun('resume', 'review')).toBe(false);
    expect(moveStartsRun('accept', 'done')).toBe(false);
    expect(moveStartsRun('hold', 'blocked')).toBe(false);
  });
  it('confirms exactly the three run-starting actions together with the three acceptances (REQ-TRACE-383)', () => {
    expect([...CONFIRM_ACTIONS].sort()).toEqual(['accept', 'accept-change-work', 'accept-proposal', 'release', 'rerun', 'send-back']);
  });
  it('asks the person for a hold\'s reason and a send-back\'s instructions before the engine is asked (REQ-TRACE-389/423)', () => {
    expect(payloadFieldFor('hold')?.field).toBe('reason');
    expect(payloadFieldFor('send-back')?.field).toBe('instructions');
    expect(payloadFieldFor('release')).toBeUndefined();
    expect(payloadFieldFor('send-back')?.refusal).toContain('repeat the previous run unaltered');
  });
  it('names what is happening for every one of the fourteen actions while it is in flight (REQ-TRACE-388)', () => {
    for (const a of ['release', 'return', 'accept', 'rerun', 'send-back', 'reject', 'hold', 'resume', 'answer-blocker', 'edit', 'create', 'accept-proposal', 'accept-change-work', 'keep-worktree'] as const) {
      expect(inFlightLabelFor(a).endsWith('…'), a).toBe(true);
    }
  });
});

describe('the move control (REQ-TRACE-390..393)', () => {
  const chord = 'Ctrl+M';
  it('prompts for a selection naming the chord in force when nothing is selected', () => {
    const s = moveControlState(undefined, new Map(), chord);
    expect(s.kind).toBe('none');
    expect(s.sentence).toBe(nothingSelectedSentence(chord));
    expect(s.sentence).toContain('Ctrl+M');
  });
  it('aims at the FIRST delivery state the engine reports reachable and puts the consequence in the sentence', () => {
    const c = card('REQ-1');
    const answers = new Map<'ready' | 'done', Reachability>([['ready', reachable('Releasing takes a snapshot.')], ['done', refused('not from backlog', ['ready'])]]);
    const s = moveControlState(c, answers, chord);
    expect(s.kind).toBe('reachable');
    if (s.kind !== 'reachable') throw new Error('unreachable');
    expect(s.to).toBe('ready');
    expect(s.sentence).toBe(moveReachableSentence('REQ-1', 'backlog', 'ready', 'Releasing takes a snapshot.'));
    expect(s.sentence).toContain('Releasing takes a snapshot.');
    expect(s.confirm).toBe(true);
  });
  it('states the refusal with the engine\'s own words unchanged when nothing is reachable', () => {
    const c = card('REQ-2', { column: 'done' });
    const answers = new Map<'ready', Reachability>([['ready', refused('REQ-2 cannot be re-run from done: the engine said so.', [])]]);
    const s = moveControlState(c, answers, chord);
    expect(s.kind).toBe('refused');
    expect(s.sentence).toBe(moveRefusedSentence('REQ-2', 'done', 'ready', 'REQ-2 cannot be re-run from done: the engine said so.'));
    expect(s.sentence.endsWith('the engine said so.')).toBe(true);
  });
  it('builds one drop-target option per delivery column from the engine\'s answers, a refused entry carrying reason and glyph', () => {
    const answers = new Map<'ready', Reachability>([['ready', reachable('Releases.')]]);
    const options = dropTargetOptions(answers);
    expect(options.map((o) => o.target)).toEqual([...DELIVERY_COLUMNS]);
    expect(options.find((o) => o.target === 'ready')).toMatchObject({ reachable: true, consequence: 'Releases.', confirm: true, glyph: '→' });
    const done = options.find((o) => o.target === 'done')!;
    expect(done.reachable).toBe(false);
    expect(done.reason).toBeTruthy();
    expect(done.glyph).toBeTruthy();
  });
  it('refuses a drag in words on a non-delivery axis, naming the chord (REQ-TRACE-297)', () => {
    expect(dragRefusedOnAxisSentence('health', chord)).toContain('health axis');
    expect(dragRefusedOnAxisSentence('health', chord)).toContain('Ctrl+M');
  });
  it('withdraws a stale confirmation in a sentence naming the requirement and the state it left (REQ-TRACE-506)', () => {
    expect(promptWithdrawnSentence('REQ-3', 'send-back', 'review')).toContain('REQ-3 is no longer in Review');
  });
  it('carries the drag payload under a private type, never plain text (REQ-TRACE-396)', () => {
    expect(PRIVATE_TRANSFER_TYPE.startsWith('application/x-')).toBe(true);
    expect(PRIVATE_TRANSFER_TYPE).not.toBe('text/plain');
  });
});

describe('the affected-only merge (REQ-TRACE-374)', () => {
  it('keeps the identity of every card not named and takes the named ones from the new value', () => {
    const a = card('REQ-1'); const b = card('REQ-2'); const c = card('REQ-3');
    const previous = projection([a, b, c], 1);
    const next = projection([card('REQ-1', { column: 'ready' }), card('REQ-2'), card('REQ-3')], 2);
    const merged = mergeAffected(previous, next, ['REQ-1']);
    expect(merged.generation).toBe(2);
    expect(merged.cards[0]).toBe(next.cards[0]);
    expect(merged.cards[0]!.column).toBe('ready');
    expect(merged.cards[1]).toBe(b);
    expect(merged.cards[2]).toBe(c);
  });
  it('takes the whole value when nothing is named, or when there was no board', () => {
    const next = projection([card('REQ-1')], 2);
    expect(mergeAffected(null, next, ['REQ-1'])).toBe(next);
    expect(mergeAffected(projection([card('REQ-1')], 1), next, null)).toBe(next);
  });
  it('drops a card the new value no longer holds and admits one it gained', () => {
    const previous = projection([card('REQ-1'), card('REQ-2')], 1);
    const next = projection([card('REQ-2'), card('REQ-9')], 2);
    const merged = mergeAffected(previous, next, ['REQ-9']);
    expect(merged.cards.map((x) => x.id)).toEqual(['REQ-2', 'REQ-9']);
    expect(merged.cards[0]).toBe(previous.cards[1]);
  });
});

describe('virtualisation arithmetic (REQ-TRACE-358..365)', () => {
  it('realises one contiguous band beginning at the top, bounded by the viewport and the five-card margin', () => {
    const band = realisedBand(0, 640, 128, 300);
    expect(band.start).toBe(0);
    // 640 / 128 = 5 visible + 1 partial + 5 overscan below.
    expect(band.end).toBe(11);
    expect(band.end - band.start).toBeLessThan(300 / 4);
  });
  it('keeps the realised count bounded as the column is scrolled end to end, and reaches the last card', () => {
    const sizes: number[] = [];
    let last = 0;
    for (let step = 0; step <= 10; step += 1) {
      const scrollTop = (step / 10) * (300 * 128 - 640);
      const band = realisedBand(scrollTop, 640, 128, 300);
      sizes.push(band.end - band.start);
      last = band.end;
    }
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1 + Math.ceil(640 / 128) + 2 * OVERSCAN_CARDS);
    expect(last).toBe(300);
    const top = realisedBand(0, 640, 128, 300);
    const bottom = realisedBand(300 * 128 - 640, 640, 128, 300);
    expect(bottom.start).toBeGreaterThanOrEqual(top.end);
  });
  it('does not grow with the column\'s length', () => {
    const small = realisedBand(0, 640, 128, 30);
    const large = realisedBand(0, 640, 128, 3000);
    expect(large.end - large.start).toBe(small.end - small.start);
  });
  it('realises nothing for an empty column and states the figures the specification fixes', () => {
    expect(realisedBand(0, 640, 128, 0)).toEqual({ start: 0, end: 0 });
    expect(OVERSCAN_CARDS).toBe(5);
    expect(RELEASED_POOL_CAP).toBe(20);
    expect(SEARCH_DEBOUNCE_MS).toBe(150);
    expect([COLUMN_MIN, COLUMN_MAX]).toEqual([276, 340]);
    expect([RAIL_CHARS, RAIL_MARGIN]).toEqual([8, 4]);
    expect([CLOSED_DROPDOWN_WIDTH, OPEN_DROPDOWN_WIDTH]).toEqual([240, 150]);
    expect([PRIMARY_CONTROL_HEIGHT, OTHER_CONTROL_HEIGHT]).toEqual([32, 24]);
  });
});

describe('the columns band — the second dimension (REQ-TRACE-237/239/300, defect AK2-3)', () => {
  /** A row of columns at the specification's minimum width and the design's gap; `from` is where the row starts, so a negative value is a row scrolled sideways. */
  const row = (count: number, from = 0, width = COLUMN_MIN, gap = COLUMN_GAP) =>
    Array.from({ length: count }, (_, i) => ({ left: from + i * (width + gap), right: from + i * (width + gap) + width }));
  const AREA = { left: 0, right: 1264 };

  it('realises the columns the area exposes plus a column of margin, and does not grow with the number of columns', () => {
    const few = visibleColumnBand(row(7), AREA);
    const hundred = visibleColumnBand(row(100), AREA);
    expect(few.start).toBe(0);
    expect(hundred.start).toBe(0);
    expect(hundred.end - hundred.start).toBe(few.end - few.start);
    expect(hundred.end).toBeGreaterThanOrEqual(Math.ceil((AREA.right - AREA.left) / (COLUMN_MIN + COLUMN_GAP)));
    expect(hundred.end).toBeLessThan(10);
  });
  it('follows the row sideways: a band in the middle is disjoint from the band at the start, and the last column is reached at the end', () => {
    const middle = visibleColumnBand(row(100, -14_400), AREA);
    expect(middle.start).toBeGreaterThan(visibleColumnBand(row(100), AREA).end);
    expect(middle.end - middle.start).toBeLessThan(12);
    const end = visibleColumnBand(row(100, -(99 * (COLUMN_MIN + COLUMN_GAP) + COLUMN_MIN - 1264)), AREA);
    expect(end.end).toBe(100);
  });
  it('realises the first column alone rather than all of them when nothing has been laid out', () => {
    expect(visibleColumnBand([{ left: 0, right: 0 }, { left: 0, right: 0 }], { left: 5, right: 5 }, 0)).toEqual({ start: 0, end: 1 });
    expect(visibleColumnBand([], AREA)).toEqual({ start: 0, end: 0 });
  });
  it('sizes the first band from the window before a box exists, and states the figures it assumes', () => {
    expect(initialColumnBandEnd(1264)).toBe(Math.ceil(1264 / (COLUMN_MIN + COLUMN_GAP)) + 2);
    expect(initialColumnBandEnd(0)).toBe(2);
    expect([COLUMN_MIN, COLUMN_GAP, COLUMN_OVERSCAN_PX]).toEqual([276, 12, 138]);
  });
});

describe('fold pruning (REQ-TRACE-316) and the fold controls\' names (REQ-TRACE-320)', () => {
  it('prunes only project-supplied keys, and only against the columns the store still has', () => {
    const decisions = { backlog: true, blocked: false, 'REQ-100': true, 'REQ-999': true, 'docs/old': false };
    const pruned = pruneUserFolds(decisions, 'epic', ['REQ-100', 'docs/requirements']);
    expect(pruned).toEqual({ backlog: true, blocked: false, 'REQ-100': true });
  });
  it('retains every decision while a closed axis is showing', () => {
    const decisions = { backlog: true, 'REQ-999': true };
    expect(pruneUserFolds(decisions, 'delivery', ['backlog'])).toEqual(decisions);
  });
  it('names the label, the count and the fold action on the heading, and the unfold action on the rail', () => {
    expect(headingAccessibleName('Needs Update', 2)).toBe('Needs Update · 2, fold column');
    expect(railAccessibleName('Done', 0)).toBe('Unfold Done · 0');
  });
});

describe('epic counts (REQ-TRACE-282)', () => {
  it('counts children, their distribution, the traced proportion over the non-deprecated population, runs and blockers', () => {
    const epic: EpicCard = { id: 'REQ-100', title: 'Epic', done: 1, total: 3, children: ['REQ-101', 'REQ-102', 'REQ-103', 'REQ-104'] };
    const cards = [
      card('REQ-101', { column: 'done', evidence: { implementationTrace: 'satisfied', sites: [] } }),
      card('REQ-102', { column: 'running', evidence: { sites: [] } }),
      card('REQ-103', { column: 'blocked', blocker: { kind: 'stated', reason: 'held', answerPaths: ['resume'] }, evidence: { implementationTrace: 'stale', sites: [] } }),
      card('REQ-104', { column: 'backlog', lifecycle: 'deprecated', evidence: { implementationTrace: 'satisfied', sites: [] } }),
    ];
    const s = epicSummary(epic, cards);
    expect(s.children).toBe(4);
    expect(s.distribution).toEqual([{ column: 'backlog', count: 1 }, { column: 'running', count: 1 }, { column: 'done', count: 1 }, { column: 'blocked', count: 1 }]);
    expect([s.tracedOf, s.tracedTotal]).toEqual([2, 3]);
    expect(s.running).toBe(1);
    expect(s.blockers).toBe(1);
    expect(epicSummaryLine(s)).toBe('4 children · 1 backlog, 1 running, 1 done, 1 blocked · 2 of 3 traced · 1 running · 1 blocker');
  });
});

describe('alerts, evidence and the card description (REQ-TRACE-247, 263, 485)', () => {
  it('classifies an alert into one of three severities, each with its own glyph', () => {
    expect(alertSeverity('Verification failing: covering-test.')).toBe('failure');
    expect(alertSeverity('Blocked (stated): held')).toBe('stopped');
    expect(alertSeverity('Missing evidence: implementation-trace.')).toBe('attention');
    expect(alertSeverity('Specification changed since it was accepted.')).toBe('attention');
    expect(new Set(Object.values(ALERT_GLYPH)).size).toBe(3);
  });
  it('lays segments from twelve o\'clock, gapped, closing the ring, never overlapping', () => {
    for (const n of [1, 2, 3]) {
      const arcs = segmentArcs(n);
      expect(arcs).toHaveLength(n);
      expect(arcs[0]!.start).toBeGreaterThanOrEqual(0);
      expect(arcs[0]!.start).toBeLessThan(360 / n);
      for (let i = 1; i < n; i += 1) expect(arcs[i]!.start).toBeGreaterThan(arcs[i - 1]!.start + arcs[i - 1]!.sweep);
      const last = arcs[n - 1]!;
      expect(last.start + last.sweep).toBeLessThanOrEqual(360);
      for (const a of arcs) expect(a.sweep).toBeGreaterThan(0);
    }
    expect(segmentArcs(0)).toEqual([]);
    expect(arcPath(8, 8, 5.5, 7, 346)).toMatch(/^M [\d.]+ [\d.]+ A 5.5 5.5 0 1 1 [\d.]+ [\d.]+$/);
  });
  it('describes a card with the delivery-state word, the health token and its rendered gloss', () => {
    const description = cardDescription(card('REQ-1', { column: 'needs-update', health: 'needs-update' }), 'No execution units yet · never run');
    expect(description.startsWith('Needs Update. Health needs-update: ')).toBe(true);
    expect(description).toContain('specification that has since changed');
  });
  it('builds exactly the five sections of REQ-TRACE-271, in order, each with its own empty message', () => {
    expect([...DETAIL_SECTIONS]).toEqual(['requirement', 'relations', 'execution', 'traceability', 'verification']);
    expect(Object.keys(SECTION_EMPTY)).toEqual([...DETAIL_SECTIONS]);
  });
  it('keeps REQ-TRACE-278/280\'s history panel OUT of the five (defect AK2-4)', () => {
    // The panel has three states of its own and is a different question from the five; spec 08's vocabulary list
    // fixes the sections at five, so the panel is not one of them and carries its own identifier on the surface.
    expect([...DETAIL_SECTIONS]).not.toContain('history');
    expect(DETAIL_SECTIONS).toHaveLength(5);
  });
});

// ---- Part R2: hosting Part AP's five panes, and what the host says (REQ-TRACE-369/375, 422, 463, 472) ----

describe('the pane registry, as the board uses it (REQ-TRACE-369/370/375)', () => {
  it('answers every key without constructing, builds on first use and reuses after', () => {
    const registry = createPaneRegistry<{ readonly openedAt: number }>();
    let built = 0;
    for (const key of PANE_KEYS) expect(registry.installed(key)).toBe(false);
    expect(built).toBe(0);
    const first = registry.open('review', () => { built += 1; return { openedAt: 1 }; });
    const again = registry.open('review', () => { built += 1; return { openedAt: 2 }; });
    expect(built).toBe(1);
    expect(again).toBe(first);
    expect(registry.installed('review')).toBe(true);
    expect(registry.installed('queue')).toBe(false);
    // REQ-TRACE-375 closes the namespace: a sixth key is refused rather than silently accepted.
    expect(() => registry.installed('graph' as never)).toThrow(/not a pane key/);
    // A workspace change discards them: the board rebuilds the registry, which is what `discard` does key by key.
    registry.discard('review');
    expect(registry.installed('review')).toBe(false);
  });
});

describe('what the pane host says (REQ-TRACE-422/463/472)', () => {
  it('gives each of the six review decisions its own consequence for the branch and the worktree', () => {
    const said = REVIEW_DECISIONS.map((action) => consequenceForDecision(action, 'REQ-101'));
    expect(said).toHaveLength(6);
    expect(new Set(said).size).toBe(6);
    for (const sentence of said) expect(sentence).toContain('REQ-101');
    expect(consequenceForDecision('accept', 'REQ-101')).toContain('branch and worktree are left exactly as they are');
    expect(consequenceForDecision('reject', 'REQ-101')).toContain('nothing is deleted and nothing is merged');
    expect(consequenceForDecision('keep-worktree', 'REQ-101')).toContain('continued by hand');
  });
  it('states that nothing was written when a disclosure is pending or abandoned (REQ-TRACE-472)', () => {
    expect(disclosurePending('REQ-101')).toContain('Nothing has been recorded for REQ-101 yet');
    expect(disclosurePending('REQ-101')).toContain('abandoning it leaves everything as it stands');
    expect(launchAbandoned('REQ-101')).toContain('nothing was written');
  });
  it('reports the reason nothing started on the action\'s own result (REQ-TRACE-463)', () => {
    expect(dispatchNothingStarted('REQ-101', 'Waiting for a unit slot: 2 of 2 in use.')).toBe('REQ-101 moved, and no run began: Waiting for a unit slot: 2 of 2 in use.');
  });
  it('names the five panes and reports which are built without building any (REQ-TRACE-370/375)', () => {
    expect(Object.keys(PANE_TITLE)).toEqual([...PANE_KEYS]);
    const registry = createPaneRegistry<{ readonly openedAt: number }>();
    expect(installedPanesSentence(PANE_KEYS, (k) => registry.installed(k))).toContain('asking builds nothing');
    registry.open('queue', () => ({ openedAt: 1 }));
    expect(installedPanesSentence(PANE_KEYS, (k) => registry.installed(k))).toContain('Delivery queue');
  });
});

/**
 * Defect note `a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`: a
 * re-run or a send-back from the review pane starts a run, so the disclosure stands between it and the record. The
 * host answered the pane "nothing has been recorded yet" and then took the decision when the disclosure was accepted
 * without telling the pane, which kept that sentence as a refusal and offered the decisions again. The host now holds
 * the launch and settles it with what the disclosure came to; the pane follows it there. `requirements-proof`'s
 * `review-rerun` stage drives the same path through the built app.
 */
describe('a review decision held behind the launch disclosure (REQ-TRACE-426/472)', () => {
  it('REQ-TRACE-426/472: accepting the disclosure takes the decision, and the pane is told it was recorded — not that nothing was', async () => {
    const held = heldLaunch('REQ-101');
    expect(held.result).toMatchObject({ ok: false, reason: disclosurePending('REQ-101') });
    const waiting: string[] = [];
    const outcome = followDecision(held.result, (s) => waiting.push(s));
    held.settle({ ok: true });
    expect(await outcome).toEqual({ ok: true });
    expect(waiting).toEqual([disclosurePending('REQ-101')]);
    expect(decidedNotice('Rerun', 'REQ-101')).toBe('Rerun recorded for REQ-101. The review you were reading is out of date.');
  });
  it('REQ-TRACE-472: abandoning the disclosure answers the pane with the abandonment, in the host\'s words', async () => {
    const held = heldLaunch('REQ-101');
    const outcome = followDecision(held.result, () => undefined);
    held.abandon();
    expect(await outcome).toEqual({ ok: false, reason: launchAbandoned('REQ-101') });
  });
  it('REQ-TRACE-423: an act refused after the disclosure was accepted reaches the pane in the engine\'s words', async () => {
    const held = heldLaunch('REQ-101');
    const outcome = followDecision(held.result, () => undefined);
    held.settle({ ok: false, reason: 'REQ-101 cannot be re-run: it has no finished unit.' });
    expect(await outcome).toEqual({ ok: false, reason: 'REQ-101 cannot be re-run: it has no finished unit.' });
  });
  it('REQ-TRACE-472: a held launch settles once, so a launch abandoned by being replaced never later reads as taken', async () => {
    const held = heldLaunch('REQ-101');
    const outcome = followDecision(held.result, () => undefined);
    held.abandon();
    held.settle({ ok: true });
    expect(await outcome).toEqual({ ok: false, reason: launchAbandoned('REQ-101') });
  });
  it('REQ-TRACE-422: a decision that waits on no disclosure is its own outcome, and the pane is never told it is waiting', async () => {
    const waiting: string[] = [];
    expect(await followDecision({ ok: true }, (s) => waiting.push(s))).toEqual({ ok: true });
    expect(await followDecision({ ok: false, reason: 'refused' }, (s) => waiting.push(s))).toEqual({ ok: false, reason: 'refused' });
    expect(waiting).toEqual([]);
  });
});

/**
 * Defect 81, found by the first LIVE drive of this board (2026-09-11): a configured store whose every document the
 * engine rejected (REQ-TRACE-022/026) yields no cards, and the body state was decided from the card count alone —
 * so a store that would not parse printed "holds no requirement documents yet" and named nothing, while the
 * projection carried the engine's errors the whole time. The decision is a pure function now, and it is this.
 */
describe('the stated body states (REQ-TRACE-515, over REQ-TRACE-231/380)', () => {
  const dir = { kind: 'store', dir: 'docs/requirements', writable: false, canCreate: false } as const;
  const rejected = [{ path: 'docs/requirements/REQ-TODO-003.md', message: 'docs/requirements/REQ-TODO-003.md: req-id "REQ-TODO-003" is not an identifier of the form REQ-<digits>' }];

  it('tells a store that will not parse from a store nobody has written to', () => {
    const empty = projection([]);
    expect(bodyStateOf({ ...empty, source: { kind: 'none' } })).toBe('source');
    expect(bodyStateOf({ ...empty, source: dir, parseErrors: rejected })).toBe('unparsed');
    expect(bodyStateOf({ ...empty, source: dir })).toBe('store');
  });

  it('states no empty state at all once there is a board, whatever the errors say', () => {
    const board = projection([card('REQ-101')]);
    expect(bodyStateOf(board)).toBe(null);
    expect(bodyStateOf({ ...board, parseErrors: rejected })).toBe(null);
  });

  it('counts the rejected documents for a store that parses only in part (REQ-TRACE-026)', () => {
    expect(rejectedDocumentsSentence(1)).toBe('1 document in the requirement source was rejected and is not on the board.');
    expect(rejectedDocumentsSentence(3)).toBe('3 documents in the requirement source were rejected and are not on the board.');
  });
});
