import { describe, expect, it } from 'vitest';
import type { BlockerPayload, LaunchPreview, ReviewPayload } from '@rotaris/contracts';
import { PANE_KEYS, REVIEW_ELEMENTS } from '@rotaris/contracts';
import { createPaneRegistry } from './registry.js';
import { blockerPresentation, clampConcurrency, disclosureFor, disclosureLines, nothingHolds, queueRows, reviewDecisions, reviewElementDescription, reviewElements, waitingStatement, approvalWaitSentence } from './presentation.js';

/** Part AP — the panes' pure halves (REQ-TRACE-369/375, 419..422, 447..452, 466, 468, 472/474, 478..482). */
describe('REQ-TRACE-369/375: the pane registry', () => {
  it('answers installed for every key without constructing, constructs on first open, reuses after, and refuses a sixth key', () => {
    const r = createPaneRegistry<{ n: number }>();
    let built = 0;
    for (const k of PANE_KEYS) expect(r.installed(k)).toBe(false);
    expect(built).toBe(0);
    const a = r.open('review', () => ({ n: ++built }));
    const b = r.open('review', () => ({ n: ++built }));
    expect(a).toBe(b);
    expect(built).toBe(1);
    expect(r.installed('review')).toBe(true);
    expect(r.installed('queue')).toBe(false);
    expect(r.peek('queue')).toBeUndefined();
    r.discard('review');
    expect(r.installed('review')).toBe(false);
    expect(() => r.installed('graph' as never)).toThrow(/not a pane key/);
    expect(r.keys).toEqual(['review', 'queue', 'editor', 'create', 'blockers']);
  });
});

const payload = (over: Partial<ReviewPayload> = {}): ReviewPayload => ({
  id: 'REQ-101', title: 'T', column: 'review',
  claim: { summary: 'Did it.\nRisk: the cache.', risks: ['Risk: the cache.'], completion: { claimed: true, statement: 'The agent claimed completion; the claim stands unmeasured.' } },
  measurement: { checks: [{ name: 'run', outcome: 'completed' }], verification: 'No verification has been recorded for this requirement.', changedFiles: [{ path: 'src/a.ts', added: 3, removed: 1 }], traceabilityChanges: [], unmetConditions: [] },
  work: { specification: { snapshotHash: 'a'.repeat(32), snapshotAt: '2026-09-09T10:00:00Z', currentHash: 'a'.repeat(32), diverged: false }, units: [{ unit: 'u1', sessionId: 's1', status: 'completed', startedAt: 't', permissions: 'permissive' }], branch: 'rotaris/req/req-101/u1', worktree: 'C:\\w', proposals: [], proposalsState: 'none' },
  ...over,
});
describe('REQ-TRACE-419..422: the review', () => {
  it('carries the twelve elements in the fixed order across the three sides, each with its own empty message, and reads out exactly what it shows', () => {
    const e = reviewElements(payload());
    expect(e.map((x) => x.key)).toEqual([...REVIEW_ELEMENTS]);
    expect(e.map((x) => x.side)).toEqual(['claim', 'claim', 'claim', 'measurement', 'measurement', 'measurement', 'measurement', 'measurement', 'work', 'work', 'work', 'work']);
    expect(reviewElementDescription(e[0]!)).toBe('Did it. Risk: the cache.');
    expect(reviewElementDescription(e[6]!)).toBe('The work produced no traceability change.');
    expect(e[5]!.links).toEqual([{ label: 'Open src/a.ts as a difference', target: { kind: 'diff', path: 'src/a.ts' } }]);
    expect(e[10]!.links).toEqual([{ label: 'Open in the version-control view', target: { kind: 'git' } }]);
    // The three "always states something" elements state something in the empty case too.
    const empty = reviewElements(payload({ claim: { summary: null, risks: [], completion: { claimed: false, statement: 'No run has reported a completion claim.' } }, work: { ...payload().work, specification: { snapshotHash: null, snapshotAt: null, currentHash: 'b'.repeat(32), diverged: false }, units: [], branch: null, worktree: null } }));
    for (const k of ['completion-claim', 'verification', 'specification-version'] as const) expect(empty.find((x) => x.key === k)!.lines).toHaveLength(1);
    expect(reviewElementDescription(empty[0]!)).toBe('The agent wrote no summary.');
    const set = new Set(e.map((x) => x.empty));
    expect(set.size).toBe(12);
  });
  it('exposes exactly six decisions in the fixed order with sentence labels', () => {
    expect(reviewDecisions()).toEqual([
      { action: 'accept', label: 'Accept' }, { action: 'rerun', label: 'Rerun' }, { action: 'send-back', label: 'Send back' }, { action: 'edit', label: 'Edit' }, { action: 'reject', label: 'Reject' }, { action: 'keep-worktree', label: 'Keep worktree' },
    ]);
  });
});

describe('REQ-TRACE-447..452: the blocker presentation is a function of the blocker value alone', () => {
  const b = (over: Partial<NonNullable<BlockerPayload['blocker']>>, paths: BlockerPayload['answerPaths'] = ['resume']): BlockerPayload => ({ id: 'REQ-101', returnTo: 'ready', answerPaths: paths, blocker: { kind: 'stated', reason: 'Waiting on the licence.', options: [], blockingIds: [], runUnit: null, runSessionId: null, raisedAt: 't', ...over } });
  it('a stated block, a conflict side by side, a dependency navigable, a decision with title-cased option labels, and nothing holding', () => {
    expect(blockerPresentation(b({}))).toMatchObject({ heading: expect.any(String), reason: 'Waiting on the licence.', paths: ['resume'], navigable: false, sideBySide: false, returnTo: 'ready' });
    expect(blockerPresentation(b({ kind: 'conflict', blockingIds: ['REQ-102'] }, ['navigate', 'resume']))).toMatchObject({ sideBySide: true, navigable: true, blockingIds: ['REQ-102'] });
    const decision = blockerPresentation(b({ kind: 'decision', options: [{ key: 'keep-both' }, { key: 'drop', label: 'Drop it', consequence: 'The other survives.' }] }, ['choose', 'resume']))!;
    expect(decision.options).toEqual([{ key: 'keep-both', label: 'Keep Both', consequence: null }, { key: 'drop', label: 'Drop it', consequence: 'The other survives.' }]);
    expect(blockerPresentation({ id: 'REQ-101', returnTo: null, answerPaths: ['resume'], blocker: null })).toBeNull();
    expect(nothingHolds('REQ-101')).toBe('Nothing is holding REQ-101.');
  });
});

describe('REQ-TRACE-466/478/481: the queue rows, the statement and the ceiling', () => {
  it('keeps the scheduler\'s order, quotes the reason unaltered, joins the waiting fact, and clamps the concurrency input to 1..64', () => {
    const rows = queueRows({ entries: [{ id: 'REQ-1', unit: 'u1', state: 'executing' }, { id: 'REQ-2', unit: 'u1', state: 'deferred', reason: 'Waiting for a unit slot: 1 of 1 in use.' }], automatic: true, concurrency: 1, stopped: false }, [{ id: 'REQ-1', run: { sessionId: 's', waitingOnPerson: true } }]);
    expect(rows.map((r) => [r.entry.id, r.state, r.reason, r.waitingOnPerson])).toEqual([['REQ-1', 'Executing', null, true], ['REQ-2', 'Deferred', 'Waiting for a unit slot: 1 of 1 in use.', false]]);
    expect(rows[0]!.sessionId).toBe('s');
    expect(waitingStatement('REQ-1', 'u1', 's')).toBe('REQ-1 (unit u1) is waiting on a person in session s; open the session to answer.');
    expect([clampConcurrency(0), clampConcurrency(2.7), clampConcurrency(999), clampConcurrency(Number.NaN)]).toEqual([1, 2, 64, 1]);
  });
});

describe('REQ-TRACE-472/474/468: the disclosure', () => {
  const preview = (over: Partial<LaunchPreview> = {}): LaunchPreview => ({ id: 'REQ-101', action: 'release', unit: 'u1', branch: 'rotaris/req/req-101/u1', worktreePath: 'C:\\w\\.rotaris\\requirements\\worktrees\\x', workspaceUnattended: false, startsNow: true, repository: { ok: true }, approvalTimeoutSeconds: 0, disclosure: 'due', permissions: 'permissive', approvalWait: { seconds: 0, unlimited: true }, ...over });
  it('REQ-TRACE-472: a second card\'s run-starting move after a plain acceptance in this launch shows no dialog, and carries the acceptance as its payload', () => {
    // Main answers `accepted` once a person accepted the disclosure, not permanently, earlier in this launch.
    expect(disclosureFor(preview({ id: 'REQ-102', disclosure: 'accepted' }))).toEqual({ show: false, payload: 'accepted' });
  });
  it('is shown only when due, and the silent states carry their payload; the lines state the permissions, the worktree, the wait and when it begins', () => {
    expect(disclosureFor(preview())).toEqual({ show: true, payload: 'accepted' });
    expect(disclosureFor(preview({ disclosure: 'suppressed' }))).toEqual({ show: false, payload: 'suppressed' });
    expect(disclosureFor(preview({ disclosure: 'off' }))).toEqual({ show: false, payload: 'off' });
    expect(disclosureFor(preview({ disclosure: 'unattended' }))).toEqual({ show: false, payload: 'suppressed' });
    const lines = disclosureLines(preview());
    expect(lines[0]).toMatch(/permissive permission preset for its own duration/);
    expect(lines[1]).toBe('It is confined to the worktree C:\\w\\.rotaris\\requirements\\worktrees\\x on branch rotaris/req/req-101/u1 (unit u1).');
    expect(lines[2]).toBe('An approval or a question waits without limit; stopping the run releases it.');
    expect(lines[3]).toBe('It begins as soon as you accept.');
    expect(approvalWaitSentence({ seconds: 300, unlimited: false })).toMatch(/at most 300 seconds/);
    expect(disclosureLines(preview({ startsNow: false, deferredReason: 'Waiting for a unit slot: 2 of 2 in use.' }))[3]).toBe('It is queued: Waiting for a unit slot: 2 of 2 in use.');
    expect(disclosureLines(preview({ repository: { ok: false, reason: 'not a repo', offerSetup: true } }))[3]).toBe('not a repo');
  });
});
