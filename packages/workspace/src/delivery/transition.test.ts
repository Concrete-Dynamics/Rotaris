import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintWorkspaceId } from '@rotaris/kernel';
import { BOARD_ACTIONS, COLUMN_TOKENS, DELIVERY_COLUMNS, type Actor, type BoardAction, type ColumnToken } from '@rotaris/contracts';
import { DeliveryDal, forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { ACTION_CLASS, CONSEQUENCE, GLYPH, NO_RECORD, actionFor, createQueueSettings, createTransitions, decide, reachability, type DeliveryState, type DeliveryTransitions, type RequirementNow } from './index.js';

/**
 * The transition function (Part AK; REQ-TRACE-382..396, 399, 402, 405; ADR-0041): the closed set, the fixed targets,
 * the user's table, the single-flight admission, the one transaction and the hash comparison — the pure decision
 * first, then the same decisions bound to a real store.
 */
const A = mintWorkspaceId('000000000000000000000000000000ab');
const USER: Actor = { kind: 'user', person: 'owner' };
const at = '2026-09-09T10:00:00.000Z';
const now = (id = 'REQ-101', over: Partial<RequirementNow> = {}): RequirementNow => ({ id, canonicalHash: 'c'.repeat(32), lifecycle: 'approved', isEpic: false, ...over });
const state = (column: ColumnToken, over: Partial<DeliveryState> = {}): DeliveryState => ({ ...NO_RECORD, column, ...over });

describe('the closed action set (REQ-TRACE-382/383)', () => {
  it('names exactly fourteen actions, nine transitions, three run-starters and six confirmations', () => {
    expect(BOARD_ACTIONS).toHaveLength(14);
    const cls = (k: keyof (typeof ACTION_CLASS)[BoardAction]) => BOARD_ACTIONS.filter((a) => ACTION_CLASS[a][k]);
    expect(cls('changesState')).toHaveLength(13);
    expect(cls('changesState')).not.toContain('keep-worktree');
    expect(cls('transition')).toEqual(['release', 'return', 'accept', 'rerun', 'send-back', 'reject', 'hold', 'resume', 'answer-blocker']);
    expect(cls('startsRun')).toEqual(['release', 'rerun', 'send-back']);
    expect(cls('confirm').sort()).toEqual(['accept', 'accept-change-work', 'accept-proposal', 'release', 'rerun', 'send-back']);
    for (const a of BOARD_ACTIONS) expect(CONSEQUENCE[a], a).toMatch(/\.$/);
  });
});

describe('decide — the pure decision (REQ-TRACE-384/385/386)', () => {
  it('REQ-TRACE-385: the user table, exactly', () => {
    expect(actionFor('backlog', 'ready', NO_RECORD)).toBe('release');
    expect(actionFor('needs-update', 'ready', NO_RECORD)).toBe('release');
    expect(actionFor('ready', 'backlog', NO_RECORD)).toBe('return');
    expect(actionFor('review', 'done', NO_RECORD)).toBe('accept');
    expect(actionFor('review', 'ready', NO_RECORD)).toBe('send-back');
    for (const c of DELIVERY_COLUMNS) expect(actionFor(c, 'blocked', NO_RECORD)).toBe('hold');
    for (const c of DELIVERY_COLUMNS) expect(actionFor('blocked', c, NO_RECORD)).toBe('resume');
    expect(actionFor('backlog', 'done', NO_RECORD)).toBeUndefined();
    expect(actionFor('ready', 'ready', NO_RECORD)).toBeUndefined();
  });
  it('REQ-TRACE-384: the fixed targets, and a caller-nominated target that disagrees is refused', () => {
    const r = decide(state('backlog'), now(), 'release', USER, { at });
    expect(r.ok && r.value.to).toBe('ready');
    expect(r.ok && r.value.startsRun).toBe(true);
    expect(r.ok && r.value.next.snapshotHash).toBe('c'.repeat(32));
    const bad = decide(state('backlog'), now(), 'release', USER, { at, target: 'done' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.reason).toMatch(/Release moves REQ-101 to ready, not to done/);
    expect(decide(state('ready'), now(), 'return', USER, { at }).ok && 'backlog');
    const rerun = decide(state('done'), now(), 'rerun', USER, { at });
    expect(rerun.ok && rerun.value.to).toBe('ready');
    const reject = decide(state('review'), now(), 'reject', USER, { at });
    expect(reject.ok && reject.value.to).toBe('ready');
    expect(reject.ok && reject.value.startsRun).toBe(false);
  });
  it('REQ-TRACE-233/463: hold records the origin; a hold out of running returns to ready; resume carries no target', () => {
    const held = decide(state('review'), now(), 'hold', USER, { at, payload: { reason: 'Waiting on legal.' } });
    expect(held.ok && held.value.next.returnTo).toBe('review');
    expect(held.ok && held.value.blocker).toEqual({ kind: 'stated', reason: 'Waiting on legal.', runUnit: null });
    const heldRunning = decide(state('running'), now(), 'hold', USER, { at, payload: { reason: 'x' } });
    expect(heldRunning.ok && heldRunning.value.next.returnTo).toBe('ready');
    const resumed = decide(state('blocked', { returnTo: 'review' }), now(), 'resume', USER, { at });
    expect(resumed.ok && resumed.value.to).toBe('review');
    expect(resumed.ok && resumed.value.startsRun).toBe(false);
    const resumedToReady = decide(state('blocked', { returnTo: 'ready' }), now(), 'resume', USER, { at });
    expect(resumedToReady.ok && resumedToReady.value.startsRun).toBe(true);
    // REQ-TRACE-395: exactly one target.
    const wrong = decide(state('blocked', { returnTo: 'review' }), now(), 'resume', USER, { at, target: 'ready' });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.reason).toMatch(/returns there and nowhere else/);
  });
  it('REQ-TRACE-389/423: a hold without a reason and a send-back without instructions are refused', () => {
    const h = decide(state('ready'), now(), 'hold', USER, { at });
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error.reason).toMatch(/needs a stated reason/);
    const s = decide(state('review'), now(), 'send-back', USER, { at, payload: { instructions: '  ' } });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error.reason).toBe('Sending the agent back needs instructions: the text is what the next run will receive, and submitting nothing would simply repeat the previous run unaltered.');
  });
  it('REQ-TRACE-399/402: accept is refused without a snapshot and when the canonical hash moved since it', () => {
    const none = decide(state('review'), now(), 'accept', USER, { at });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.reason).toMatch(/no delivering run's snapshot/);
    const moved = decide(state('review', { snapshotHash: 'a'.repeat(32) }), now(), 'accept', USER, { at });
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error.reason).toMatch(/changed since the snapshot .* \(snapshot aaaaaaaa, now cccccccc\)/);
    const fine = decide(state('review', { snapshotHash: 'c'.repeat(32) }), now(), 'accept', USER, { at });
    expect(fine.ok && fine.value.to).toBe('done');
    expect(fine.ok && fine.value.next.acceptedHash).toBe('c'.repeat(32));
  });
  it('REQ-TRACE-424: accept, send-back and reject outside review name the state the requirement is actually in', () => {
    for (const a of ['accept', 'send-back', 'reject'] as const) {
      const r = decide(state('backlog'), now(), a, USER, { at, payload: { instructions: 'x' } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.reason).toBe('REQ-101 is not awaiting a review decision: it is in backlog.');
    }
  });
  it('REQ-TRACE-284: an epic offers no delivery action; REQ-TRACE-383: keep-worktree does nothing and says so', () => {
    const e = decide(state('backlog'), now('REQ-100', { isEpic: true }), 'release', USER, { at });
    expect(e.ok).toBe(false);
    const k = decide(state('review'), now(), 'keep-worktree', USER, { at });
    expect(k.ok && k.value.writes).toBe(false);
    expect(k.ok && k.value.to).toBe('review');
  });
  it('edit, create, accept-proposal and accept-change-work are stated refusals in this build (REQ-TRACE-498)', () => {
    for (const a of ['edit', 'create', 'accept-proposal', 'accept-change-work'] as const) {
      const r = decide(state('backlog'), now(), a, USER, { at });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.reason).toMatch(/nothing was written/);
      // Ruled 2026-09-09: the source-write refusals name Part AP and `requirements.source.write`; the improvement-store refusals name OQ-45.
      if (!r.ok) expect(r.error.reason).toMatch(a === 'edit' || a === 'create' ? /requirements\.source\.write.*Part AP/ : /OQ-45/);
    }
  });
});

describe('reachability (REQ-TRACE-391..395)', () => {
  it('states one column with the consequence, the confirm flag and the glyph; a refused move carries the engine\'s words and what the source can reach', () => {
    const ok = reachability(state('backlog'), now(), 'backlog', 'ready', USER, at);
    // `reachableFromSource` enumerates DELIVERY columns (the seam's type); the blocked CONDITION is reachable from every column by hold and is not a stage (REQ-TRACE-233).
    expect(ok).toEqual({ reachable: true, consequence: CONSEQUENCE['release'], confirm: true, glyph: GLYPH.reachable, reachableFromSource: ['ready'] });
    const no = reachability(state('backlog'), now(), 'backlog', 'done', USER, at);
    expect(no.reachable).toBe(false);
    expect(no.glyph).toBe(GLYPH.refused);
    expect(no.reason).toBe('REQ-101 cannot move from backlog to done: no board action makes that move. From backlog it can reach: ready.');
    // REQ-TRACE-392: running is the system's alone.
    const run = reachability(state('ready'), now(), 'ready', 'running', USER, at);
    expect(run.reason).toMatch(/Only the system places a requirement into a run/);
    // REQ-TRACE-395: a blocked card reaches exactly its recorded origin.
    const blocked = reachability(state('blocked', { returnTo: 'review' }), now(), 'blocked', 'review', USER, at);
    expect(blocked.reachable).toBe(true);
    expect(blocked.reachableFromSource).toEqual(['review']);
    for (const c of COLUMN_TOKENS) if (c !== 'review' && c !== 'blocked') expect(reachability(state('blocked', { returnTo: 'review' }), now(), 'blocked', c, USER, at).reachable, c).toBe(false);
  });
});

describe('the bound transition (REQ-TRACE-388/399/405; ADR-0041 one transaction)', () => {
  let root: string;
  let r: ResolvedStore;
  let t: DeliveryTransitions;
  let clock: FakeClock;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rotaris-transition-'));
    r = openWorkspaceStore(root, A, 'C:\\ws');
    clock = new FakeClock();
    t = createTransitions(r.db, { wall: clock, workspaceKey: 'C:\\ws', queue: createQueueSettings() });
  });
  afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); });

  it('release writes exactly one history row and one audit row, and the record carries the snapshot hash (REQ-TRACE-387/405)', async () => {
    const dal = new DeliveryDal(r.db);
    const out = await t.transition('REQ-101', 'release', USER, { now: now() });
    expect(out).toEqual({ ok: true, value: { id: 'REQ-101', from: 'backlog', to: 'ready', startsRun: true, historyEntry: 1 } });
    expect(dal.historyOf('REQ-101')).toHaveLength(1);
    expect(dal.auditAll()).toHaveLength(1);
    expect(dal.auditAll()[0]).toMatchObject({ actor: 'user:owner', action: 'release', hash: 'c'.repeat(32) });
    const row = dal.read('REQ-101');
    expect(row?.kind === 'record' && row.record.snapshotHash).toBe('c'.repeat(32));
  });
  it('REQ-TRACE-388: a second action on a requirement with one in flight is refused with the stated reason and writes nothing; another requirement is not bounded', async () => {
    const dal = new DeliveryDal(r.db);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = t.transition('REQ-101', 'release', USER, { now: now() }, { beforeCommit: () => gate });
    await Promise.resolve();
    expect(t.inFlight.has('REQ-101')).toBe(true);
    const second = await t.transition('REQ-101', 'hold', USER, { now: now() }, { payload: { reason: 'x' } });
    expect(second).toEqual({ ok: false, error: { reason: 'An action on REQ-101 is already in flight; wait for it to settle before starting another (REQ-TRACE-388).' } });
    expect(dal.countAudit()).toBe(0);
    const other = await t.transition('REQ-102', 'release', USER, { now: now('REQ-102') });
    expect(other.ok).toBe(true);
    release();
    const done = await first;
    expect(done.ok).toBe(true);
    expect(t.inFlight.size).toBe(0);
    expect(dal.countAudit()).toBe(2);
  });
  it('a rejection in beforeCommit refuses the action with its message and writes nothing (REQ-TRACE-472\'s declined disclosure)', async () => {
    const dal = new DeliveryDal(r.db);
    const out = await t.transition('REQ-101', 'release', USER, { now: now() }, { beforeCommit: () => Promise.reject(new Error('The disclosure was declined.')) });
    expect(out).toEqual({ ok: false, error: { reason: 'The disclosure was declined.' } });
    expect(dal.read('REQ-101')).toBeUndefined();
    expect(dal.countAudit()).toBe(0);
    expect(t.inFlight.size).toBe(0);
  });
  it('hold then resume round-trips to the origin column, raising and answering the blocker in the same transactions', async () => {
    const dal = new DeliveryDal(r.db);
    await t.transition('REQ-101', 'release', USER, { now: now() });
    const held = await t.transition('REQ-101', 'hold', USER, { now: now() }, { payload: { reason: 'Waiting on the licence decision.' } });
    expect(held.ok && held.value.to).toBe('blocked');
    expect(dal.openBlockersOf('REQ-101')).toHaveLength(1);
    const row = dal.read('REQ-101');
    expect(row?.kind === 'record' && row.record.returnTo).toBe('ready');
    const resumed = await t.transition('REQ-101', 'resume', USER, { now: now() });
    expect(resumed.ok && resumed.value.to).toBe('ready');
    expect(resumed.ok && resumed.value.startsRun).toBe(true);
    expect(dal.openBlockersOf('REQ-101')).toHaveLength(0);
    expect(dal.blockersOf('REQ-101')[0]).toMatchObject({ answer: 'resume' });
    expect(dal.historyOf('REQ-101').map((h) => h.action)).toEqual(['release', 'hold', 'resume']);
  });
  it('recordRunStarted writes the run row with its session id in the SAME transaction as the move into running (REQ-TRACE-464); the actor is the system (REQ-TRACE-405)', async () => {
    const dal = new DeliveryDal(r.db);
    await t.transition('REQ-101', 'release', USER, { now: now() });
    const started = t.recordRunStarted('REQ-101', 'u1', 'sess-9', { ref: 'wt-1', path: 'C:\\ws\\.rotaris\\req\\REQ-101-u1', branch: 'req/REQ-101/u1' }, 'autonomous+unsandboxed', { now: now() });
    expect(started.ok && started.value.to).toBe('running');
    expect(dal.runsOf('REQ-101')[0]).toMatchObject({ unit: 'u1', session_id: 'sess-9', status: 'running', permissions: 'autonomous+unsandboxed' });
    expect(dal.historyOf('REQ-101')[1]).toMatchObject({ action: 'run-started', actor: 'system' });
    // A user cannot enter running by any action.
    for (const a of BOARD_ACTIONS) {
      const x = await t.transition('REQ-101', a, USER, { now: now() }, { target: 'running', payload: { reason: 'r', instructions: 'i', option: 'o' } });
      // keep-worktree "does nothing" and reports from === to; every other action either refuses or leaves running.
      expect(x.ok && x.value.to === 'running' && x.value.historyEntry > 0, a).toBe(false);
    }
    const ended = t.recordRunEnded('REQ-101', 'u1', 'completed', 'finished', { now: now() });
    expect(ended.ok && ended.value.to).toBe('review');
    expect(dal.runsOf('REQ-101')[0]).toMatchObject({ status: 'completed', outcome: 'finished' });
    // The review carries the snapshot; the hash matches; accept goes through and records the delivered hash.
    const accepted = await t.transition('REQ-101', 'accept', USER, { now: now() });
    expect(accepted.ok && accepted.value.to).toBe('done');
    const row = dal.read('REQ-101');
    expect(row?.kind === 'record' && row.record.acceptedHash).toBe('c'.repeat(32));
  });
  it('a failed run holds the requirement with a run-failure blocker returning to ready (REQ-TRACE-407/463)', async () => {
    const dal = new DeliveryDal(r.db);
    await t.transition('REQ-101', 'release', USER, { now: now() });
    t.recordRunStarted('REQ-101', 'u1', 'sess-9', null, '', { now: now() });
    const ended = t.recordRunEnded('REQ-101', 'u1', 'failed', 'The suite failed twice and no retries remain.', { now: now() });
    expect(ended.ok && ended.value.to).toBe('blocked');
    expect(dal.openBlockersOf('REQ-101')[0]).toMatchObject({ kind: 'run-failure', run_unit: 'u1' });
    const row = dal.read('REQ-101');
    expect(row?.kind === 'record' && row.record.returnTo).toBe('ready');
  });
  it('REQ-CONFIG-192: a record this build cannot interpret cannot be transitioned and is left as it is', async () => {
    r.db.prepare("INSERT INTO delivery (req_id, schema_version, state, return_to, accepted_hash, snapshot_hash, transitions_ever, updated_at, body) VALUES ('REQ-101', 9, 'ready', NULL, NULL, NULL, 1, 'x', '{}')").run();
    const out = await t.transition('REQ-101', 'return', USER, { now: now() });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.reason).toMatch(/schema version 9, which this build does not support; it is left as it is/);
    expect(new DeliveryDal(r.db).countAudit()).toBe(0);
  });
});
