import { describe, expect, it } from 'vitest';
import type { InboundListenerAsk, InboundRunStatusAnswer, InboundStartRunAnswer } from '@rotaris/contracts';
import { createInboundCoordinator, InboundSurfaceRuns, mintInboundRunHandle, RECONCILE_MAX_STEPS, type ObservedState } from './inbound-runs.js';
import type { SessionStartDeps } from './session-start.js';

/**
 * REQ-MCP-123/124/126/130: main's side of the surface — the single-run slot, the handle scope, and the wiring to the
 * ONE main-side start coordinator. The coordinator is driven with stand-in deps, so the slot's behaviour and the
 * handle's scope are measured without a run host or a window.
 *
 * REWORK 4 (2026-11-25, the design simplification). The timing probe has LEFT the release path: the cases here prove that
 * a slot is freed ONLY on a POSITIVE proof the admitted attempt has ENDED or CAN NEVER START, never on a clock and never
 * on an empty listing. The three blockers of review 4 are proved closed:
 *
 *  - **B1** the handle is returned at the RESERVATION (status `starting`), before the long start, so a listener deadline
 *    can never take it away;
 *  - **B2** a held attempt stays held across any number of empty or unreadable readings; only the product's own state
 *    for the minted session settles it;
 *  - **B3** one object per handle: `starting` and the confirmed run are the SAME handle, an end reaches it, and a desktop
 *    relaunch of the same session may not change a completed handle's answer.
 */

/** A promise a case resolves by hand, so a start's host ask can be held open across another start. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (v: T) => void; readonly reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Harness {
  readonly runs: InboundSurfaceRuns;
  /** REQ-MCP-124: the open workspace the admission reads SYNCHRONOUSLY; a case may change it to prove the refusal. */
  open: { workspaceId: string; workspace: string } | null;
  /** What the run host answers a `session.start` with (a `session.started`, a refusal, or a promise a case settles). */
  hostStart: (req: { kind: string }) => Promise<unknown>;
  /** The session listings the run host answers `session.list` with, keyed by session id. */
  readonly listings: Map<string, { status: string; awaitingInput: boolean; stale?: boolean }>;
  /** The session id the run host was asked to start, once a `session.start` reached it. */
  readonly started: string[];
  /** The ONE reconcile's steps, so a case can drive them synchronously. */
  readonly steps: (() => void)[];
  /** While > 0, the next `readStatus` calls answer `unreadable` (a listing that could not be read), decremented each use. */
  unreadableReads: number;
  /** The bound the coordinator was given for its start: the inbound one, above the host's lease. */
  startBound: number | null;
  /** When true, the coordinator is built WITHOUT `startBoundMs`, so its own default is measured. */
  defaultBound: boolean;
  /** BLOCKER: when set, the shared fence's read rejects — an exception of which NOTHING is known, so the slot is held. */
  fenceThrows: boolean;
  /** BLOCKER: when set, `clearForRunStart` rejects — the run host STARTED the run and the post-work threw. */
  clearForRunStartThrows: boolean;
  /** MAJOR 1: when true, a `session.start` rejects after its bound and its LATE reply is captured rather than discarded. */
  captureLateReply: boolean;
  /** MAJOR 1: the late reply sink the run host was handed, once a `session.start` timed out. */
  lateReply: ((reply: unknown) => void) | null;
  /** MINOR: when set, `readStatus` answers this promise instead of the listing (so a case controls the read's timing). */
  readGate: Promise<unknown> | null;
}

function harness(over: Partial<Harness> = {}): Harness {
  const runs = new InboundSurfaceRuns();
  return {
    runs,
    open: { workspaceId: 'ws-1', workspace: '/work' },
    // The run host records the session id the start named and echoes it back, as production does.
    hostStart: async (req: { kind: string; sessionId?: string }) => ({ kind: 'session.started', sessionId: req.sessionId ?? 'S-REAL' }),
    listings: new Map(),
    started: [],
    steps: [],
    unreadableReads: 0,
    startBound: null,
    defaultBound: false,
    clearForRunStartThrows: false,
    fenceThrows: false,
    captureLateReply: false,
    lateReply: null,
    readGate: null,
    ...over,
  };
}

/** A coordinator over the harness, with a deterministic mint so a case can name the handle before it is confirmed. */
function coordinator(h: Harness, mint?: () => string): { readonly ask: (a: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>; readonly observe: (sessionId: string, state: ObservedState) => void } {
  let n = 0;
  const startDeps = {
    log: () => undefined,
    runHost: {
      request: async (req: { kind: string; sessionId?: string }, bound?: number, late?: (r: unknown) => void) => {
        if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
        if (req.kind === 'session.start' && typeof req.sessionId === 'string') h.started.push(req.sessionId);
        if (req.kind === 'session.start' && typeof bound === 'number') h.startBound = bound;
        if (req.kind === 'session.start' && h.captureLateReply) { h.lateReply = late ?? null; throw new Error(`no reply to session.start within ${bound ?? 0} ms`); }
        return h.hostStart(req);
      },
    },
    services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined },
    notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => { if (h.clearForRunStartThrows) throw new Error('the notice cleanup failed'); } },
    raiseNotice: () => undefined, recoveryFor: () => [],
    openWorkspaceRead: async () => { if (h.fenceThrows) throw new Error('the fence read failed'); return h.open; },
    confinementNotice: (r: { headline: string }) => ({ severity: 'error' as const, title: r.headline, message: r.headline, detail: r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  const c = createInboundCoordinator({
    start: startDeps,
    runs: h.runs,
    openWorkspaceNow: () => h.open,
    readStatus: async (_workspaceId, sessionId) => {
      // MINOR: a case may hold the read open, so a refusal landing during it is what the caller must still state.
      if (h.readGate !== null) await h.readGate;
      if (h.unreadableReads > 0) { h.unreadableReads -= 1; return { kind: 'unreadable' as const }; }
      const row = h.listings.get(sessionId);
      return row === undefined ? { kind: 'absent' as const } : { kind: 'row' as const, executionStatus: row.status, awaitingInput: row.awaitingInput, stale: row.stale ?? false };
    },
    schedule: (fn) => { h.steps.push(fn); },
    ...(h.defaultBound ? {} : { startBoundMs: 60_000 as never }),
    mintHandle: mint ?? (() => `inr_${(n += 1).toString(16).padStart(32, '0')}`),
  });
  return { ask: c.ask, observe: c.observeSnapshot };
}

/** Let the coordinator's background start settle (its awaits and microtasks). */
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

/** Drive one reconcile step and let it settle. */
const driveStep = async (h: Harness): Promise<void> => { const step = h.steps.shift(); step?.(); await settle(); };

/** A mint that names the FIRST handle and later ones distinctly, so a case can name the handle before it is confirmed. */
const namedMint = (first: string) => { let n = 0; return () => (n++ === 0 ? first : `inr_${n.toString(16).padStart(32, '0')}`); };

describe('REQ-MCP-126: at most one externally started run, refused rather than queued', () => {
  it('takes the slot atomically — a second take while one is held is refused', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-1', `inr_${'1'.repeat(32)}`);
    expect(a.ok).toBe(true);
    expect(runs.take('S-2', `inr_${'2'.repeat(32)}`).ok).toBe(false);
    expect(runs.holder).toBe(`inr_${'1'.repeat(32)}`);
    // The reserved handle is already answerable (REWORK 4, point 2/3).
    expect(runs.byHandle(`inr_${'1'.repeat(32)}`)?.sessionId).toBe('S-1');
  });

  it('a definite refusal of the start admits the next request', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-1', `inr_${'1'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.refuse(`inr_${'1'.repeat(32)}`, { code: 'session.workspace-changed', headline: 'changed' });
    expect(runs.holder).toBeNull();
    expect(runs.take('S-2', `inr_${'2'.repeat(32)}`).ok).toBe(true);
  });

  it('the run’s own end releases the slot; another session’s end does not', () => {
    const runs = new InboundSurfaceRuns();
    runs.take('S-1', `inr_${'1'.repeat(32)}`);
    runs.committed(`inr_${'1'.repeat(32)}`, 'S-1');
    runs.ended('S-OTHER', 'tasks_complete');
    expect(runs.holder).toBe(`inr_${'1'.repeat(32)}`);
    runs.ended('S-1', 'tasks_complete');
    expect(runs.holder).toBeNull();
  });

  it('a second ask while a run is active is refused with the stated reason, and never reaches the start', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    await settle();
    const startsBefore = h.started.length;
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.code).toBe('inbound.run-active');
    expect(out.kind === 'refused' && out.headline).toContain('already active');
    // The refused ask reached no run host: no new `session.start` was made.
    expect(h.started.length).toBe(startsBefore);
  });

  it('a request refused for want of a workspace takes NO slot and leaves no work (REWORK 4, point 2)', async () => {
    const h = harness();
    h.open = null;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind === 'refused' && first.code).toBe('inbound.no-workspace');
    expect(h.runs.holder).toBeNull();
    expect(h.started).toHaveLength(0);
    // A later ask is refused for the SAME reason, not deferred:
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(second.kind === 'refused' && second.code).toBe('inbound.no-workspace');
  });
});

describe('REQ-MCP-123 (BLOCKER 1, REWORK 4): the handle is returned at the RESERVATION, before the long start', () => {
  it('a start whose host ask is still open answers the caller with the handle immediately', async () => {
    const h = harness();
    const held = deferred<unknown>();
    h.hostStart = async () => held.promise;
    const c = coordinator(h, namedMint(`inr_${'a'.repeat(32)}`));
    // The host ask will never answer within this test: the caller must STILL receive the handle at once.
    const answer = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(answer.kind).toBe('inbound.runStarted');
    expect(answer.kind === 'inbound.runStarted' && answer.run).toBe(`inr_${'a'.repeat(32)}`);
    // The slot is held by that handle, so a second start is refused while the first is still starting.
    expect(h.runs.holder).toBe(`inr_${'a'.repeat(32)}`);
    // And the handle answers a status NOW, while the run host has not answered: `starting`.
    const status = await c.ask({ kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` });
    expect(status.kind).toBe('inbound.runStatus');
    expect(status.kind === 'inbound.runStatus' && status.status.state).toBe('starting');
    // The host then confirms; the SAME handle becomes the live run (REWORK 4, point 4: one object per handle).
    h.listings.set(h.started[0]!, { status: 'running', awaitingInput: false });
    held.resolve({ kind: 'session.started', sessionId: h.started[0]! });
    await settle();
    const live = await c.ask({ kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
  });
});

describe('REQ-MCP-126 (BLOCKER 2, REWORK 4): the slot is freed only on a positive proof, never on a clock', () => {
  it('a start whose host ask never answers keeps the slot across any number of EMPTY readings', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply to session.start within 60000 ms')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // The host never answered, so the attempt is HELD. Many readings that show nothing prove NOTHING and free nothing.
    for (let i = 0; i < 20; i += 1) {
      expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('refused');
      const s = await c.ask({ kind: 'inbound.runStatus', run: handle });
      expect(s.kind === 'inbound.runStatus' && s.status.state).toBe('starting');
    }
    expect(h.runs.holder).toBe(handle);
    // No clock released it: there is no probe step at all for a held attempt that never became a run.
    expect(h.steps).toHaveLength(0);
    // The run then APPEARS (positive evidence): the handle turns live under the SAME handle.
    h.listings.set(h.started[0]!, { status: 'running', awaitingInput: false });
    const live = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
    expect(live.kind === 'inbound.runStatus' && live.status.sessionId).toBe(h.started[0]!);
  });

  it('an unreadable listing never settles the attempt', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    h.unreadableReads = 6;
    for (let i = 0; i < 6; i += 1) {
      const s = await c.ask({ kind: 'inbound.runStatus', run: handle });
      expect(s.kind === 'inbound.runStatus' && s.status.state).toBe('starting');
    }
    expect(h.runs.holder).toBe(handle);
  });

  it('the inbound start waits on its OWN bound, above the run host’s credential lease', async () => {
    const h = harness();
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    await settle();
    expect(h.startBound).toBe(60_000);
  });

  it('the coordinator’s DEFAULT bound is the inbound one, above the run host’s lease', async () => {
    const h = harness({ defaultBound: true });
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    await settle();
    expect(h.startBound).toBe(60_000);
    expect(h.startBound!).toBeGreaterThan(45_000);
  });
});

describe('REQ-MCP-123/126 (REWORK 4, point 5): never_started only once every dispatch path is closed', () => {
  it('a DEFINITE host refusal releases the slot and is kept with the handle as its refusal', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? { kind: 'refused', code: 'session.refused', headline: 'no run' } : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // The slot is FREE: the host answered that no run exists, so this attempt can never start.
    expect(h.runs.holder).toBeNull();
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-NEXT' });
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('inbound.runStarted');
    // And the refused handle states its refusal rather than faking a run (REWORK 4's "a startup failure is a status outcome").
    const stated = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(stated.kind).toBe('refused');
  });

  it('the admission is one SYNCHRONOUS step: two starts issued together admit exactly one (REWORK 4, point 2)', async () => {
    const h = harness();
    const c = coordinator(h);
    // Both asks are made in the same tick, before either has awaited: the slot is checked and taken synchronously, so
    // exactly one takes it and the other is refused — a second take in the same tick can never also succeed.
    const [a, b] = await Promise.all([c.ask({ kind: 'inbound.startRun', prompt: 'A' }), c.ask({ kind: 'inbound.startRun', prompt: 'B' })]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['inbound.runStarted', 'refused']);
    const refused = a.kind === 'refused' ? a : b.kind === 'refused' ? b : null;
    expect(refused?.code).toBe('inbound.run-active');
  });
});

describe('REQ-MCP-123/126 (REWORK 4, point 6): release from the REAL execution lifecycle', () => {
  it('a run parks at the plan gate WITHOUT a reason and HOLDS the slot; a park WITH a reason ALSO HOLDS (REWORK 9)', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // The plan gate can resume the SAME execution, so the slot is HELD through `idle` → `starting` (BLOCKER 3 of review 3).
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    c.observe(sessionId, { executionStatus: 'starting', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // A desktop cancel writes `paused` + `user_cancelled`. REWORK 9: no product field separates that resumable pause from
    // the plan-gate cancel, and a Continue resumes the SAME iteration — so the park HOLDS the slot and the handle, and the
    // held run reports NO stop reason (MAJOR 1).
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBe(handle);
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('paused');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBeNull();
    // Only a TERMINAL end frees it, and only a TERMINAL end names a reason.
    c.observe(sessionId, { executionStatus: 'stopped', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBeNull();
    const ended = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(ended.kind === 'inbound.runStatus' && ended.status.stopReason).toBe('user_cancelled');
  });

  it('a message-limit park WITHOUT a reason holds the slot; a park WITH a reason ALSO holds now — only a terminal state frees it', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    c.observe(sessionId, { executionStatus: 'paused_message_limit', stopReason: null });
    expect(h.runs.holder).not.toBeNull();
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.holder).not.toBeNull();
    // REWORK 9: a `message_limit_reached` park is a resume the same iteration accepts (the desktop's Continue/double), so
    // it HOLDS too — the round-8 "park WITH a reason ends it" arm is gone.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'message_limit_reached' });
    expect(h.runs.holder).not.toBeNull();
    // A TERMINAL status frees it.
    c.observe(sessionId, { executionStatus: 'stopped', stopReason: 'message_limit_reached' });
    expect(h.runs.holder).toBeNull();
  });

  it('the run host’s terminal result frees the slot and keeps the reason with the handle', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    expect(h.runs.holder).toBeNull();
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
  });

  it('REWORK 9 (BLOCKER): a `run.result` whose OWN status is a park does NOT free the slot — only a terminal result does', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A normal desktop PAUSE writes `paused` + `user_cancelled` AND delivers a `run.result` whose execution status is a
    // PARK. A Continue then resumes the SAME open iteration, so this result must NOT release the slot: the blocker.
    h.runs.ended(sessionId, 'user_cancelled', 'paused');
    expect(h.runs.holder).toBe(handle);
    // The handle is still observable and names NO reason (the run has not ended).
    const held = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(held.kind === 'inbound.runStatus' && held.status.state).toBe('paused');
    expect(held.kind === 'inbound.runStatus' && held.status.stopReason).toBeNull();
    // The desktop CONTINUES: the same iteration runs again — the handle follows it, the slot is still held.
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // A second external start is REFUSED (round 8 admitted it here — two runs overlapped).
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    // A TERMINAL result later frees the slot and names its reason.
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    expect(h.runs.holder).toBeNull();
    const ended = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(ended.kind === 'inbound.runStatus' && ended.status.stopReason).toBe('tasks_complete');
  });

  it('REWORK 9: a STALE listing of a PARKED run does not free the slot; a stale listing of a live one still does', async () => {
    const runs = new InboundSurfaceRuns();
    const handle = `inr_${'9'.repeat(32)}`;
    runs.take('S-P', handle);
    runs.committed(handle, 'S-P');
    // The run parked, then its listing reads STALE. A parked session may be continued, so a stale reading proves nothing.
    runs.observe('S-P', { executionStatus: 'paused', stopReason: null, awaitingInput: true });
    expect(runs.reconcile('S-P', { kind: 'row', executionStatus: 'paused', awaitingInput: true, stale: true })).toBe('held');
    expect(runs.holder).toBe(handle);
    // A live (not parked) run whose record stays busy with nothing running it IS the failed-terminal-write case, and ends.
    const handle2 = `inr_${'8'.repeat(32)}`;
    runs.ended('S-P', 'tasks_complete', 'completed');
    runs.take('S-L', handle2);
    runs.committed(handle2, 'S-L');
    expect(runs.reconcile('S-L', { kind: 'row', executionStatus: 'running', awaitingInput: false, stale: true })).toBe('released');
    expect(runs.holder).toBeNull();
  });

  it('MAJOR: the one reconcile ends a run whose terminal write FAILED — a STALE listing frees the slot as TERMINAL', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // The confirmed start armed the one reconcile.
    expect(h.steps.length).toBeGreaterThan(0);
    // The durable image stays busy (the terminal transaction failed) and marks the session STALE — busy while no live
    // process holds its lock (REQ-SESSION-171). The reconcile reads exactly that.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    // A dead run is NOT frozen as running/awaitingInput=true — it is TERMINAL and not waiting (the fault review 4 found).
    expect(out.kind === 'inbound.runStatus' && out.status.state).not.toBe('running');
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
  });

  it('MAJOR: the reconcile never ends a LIVE busy run, and re-arms to catch a LATER failure', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A LIVE busy run (not stale): the reconcile must leave it alone. The listing read settles the attempt as confirmed.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: false });
    await driveStep(h);
    expect(h.runs.holder).not.toBeNull();
    // The step re-armed: a failure later than the first step is still covered.
    expect(h.steps.length).toBeGreaterThan(0);
    // Now the terminal write fails: the next step sees the stale reading and ends it.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
  });

  it('the reconcile never ends an UNREADABLE reading, and re-arms', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    void started;
    await settle();
    h.unreadableReads = 1;
    await driveStep(h);
    expect(h.runs.holder).not.toBeNull();
    expect(h.steps.length).toBeGreaterThan(0);
  });

  it('MINOR (REWORK 6): the reconcile chain is BOUNDED — a run that never resolves stops scheduling steps', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A LIVE busy run every step: the reconcile holds and re-arms, but only up to the cap.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: false });
    // Drive far past the cap; each step re-arms one more until the cap is reached.
    for (let i = 0; i < RECONCILE_MAX_STEPS + 10; i += 1) await driveStep(h);
    // Once the cap is reached no step is scheduled again: the queue is empty and the run is still held (a live run is
    // never ended by the reconcile).
    expect(h.steps).toHaveLength(0);
    expect(h.runs.holder).not.toBeNull();
    // The handle is still settled by the ordinary paths: a terminal result ends it.
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    expect(h.runs.holder).toBeNull();
  });
});

describe('REQ-MCP-123/126 (MAJOR 3/4, REWORK 7): the phase unit on the handle, and the activity-bound reconcile', () => {
  it('MAJOR 3(a): a listing row WITHOUT a reason does not overwrite the snapshot reason the handle holds', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A snapshot carries the product's reason for the session (an interrupted run, which is NOT a terminal end).
    c.observe(sessionId, { executionStatus: 'interrupted', stopReason: 'application_shutdown' });
    expect(h.runs.holder).toBe(handle);
    // A later listing row states NO reason. It is SILENT about the reason, so it must NOT clobber the known one with null
    // (the fault: a reasonless row overwrote a snapshot reason).
    h.listings.set(sessionId, { status: 'interrupted', awaitingInput: false });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    // The slot is HELD (`interrupted` is not terminal), so the answer carries NO reason (MAJOR 1); what matters here is that
    // the row did not CLEAR the reason the handle holds — `stopReasonOf` still reads the snapshot's own.
    expect(h.runs.stopReasonOf(handle)).toBe('application_shutdown');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBeNull();
  });

  it('MAJOR 3(b): a late `run.result` completes an end that was frozen WITHOUT a reason (the write publishes state before the result)', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // The terminal write publishes the STATUS first (a terminal row with no reason), freezing the end with a null reason.
    c.observe(sessionId, { executionStatus: 'completed', stopReason: null });
    expect(h.runs.holder).toBeNull();
    // The terminal `run.result` then arrives with the product's own reason: it ADDS it to the frozen end.
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
  });

  it('MAJOR 3(b): a computed reason is NOT overwritten by a late `run.result`, and an observed reason is not either', () => {
    // A dead run whose terminal write failed is frozen with the engine's own reason, COMPUTED. A later result must not
    // contradict it — it is a positive statement.
    const h1 = harness();
    const runs1 = new InboundSurfaceRuns();
    void h1;
    const composed = `inr_${'c'.repeat(32)}`;
    runs1.take('S-C', composed);
    runs1.committed(composed, 'S-C');
    runs1.reconcile('S-C', { kind: 'absent' });
    expect(runs1.stopReasonOf(composed)).toBe('agent_session_aborted');
    runs1.ended('S-C', 'tasks_complete', 'completed');
    // The computed reason stands: the late result did not rewrite it.
    expect(runs1.stopReasonOf(composed)).toBe('agent_session_aborted');
    // An OBSERVED reason (a park with a reason) is likewise not rewritten by a late result.
    const runs2 = new InboundSurfaceRuns();
    const observed = `inr_${'d'.repeat(32)}`;
    runs2.take('S-D', observed);
    runs2.committed(observed, 'S-D');
    // A TERMINAL status freezes the end, and the reason the phase carried is the observed one.
    runs2.observe('S-D', { executionStatus: 'completed', stopReason: 'user_cancelled', awaitingInput: false });
    expect(runs2.stopReasonOf(observed)).toBe('user_cancelled');
    // A late result that AGREES with the frozen end does not rewrite an already-observed reason.
    runs2.ended('S-D', 'tasks_complete', 'completed');
    expect(runs2.stopReasonOf(observed)).toBe('user_cancelled');
  });

  it('MAJOR 4: the STATUS path ends a run the listing marks STALE — the slot is freed without the reconcile', async () => {
    const h = harness();
    const c = coordinator(h);
    // The start's reply is lost, so no reconcile is armed from it; the run is confirmed only by a LATER reading.
    h.captureLateReply = true;
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    expect(h.runs.holder).toBe(handle);
    // The run's terminal write failed: the durable image stays BUSY with nothing running it, and the listing marks it
    // STALE (REQ-SESSION-171). A plain STATUS query must end it — not only the reconcile.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).not.toBe('running');
    expect(h.runs.holder).toBeNull();
    // A fresh start is admitted once the slot is free.
    h.captureLateReply = false;
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-NEXT' });
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).kind).toBe('inbound.runStarted');
  });

  it('MAJOR 4: a CHANGING state extends the reconcile — a run that keeps making progress is not exhausted by the cap', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A live busy run every step: the reconcile holds and re-arms.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: false });
    // Drive WELL past the cap, but let the run keep CHANGING state between steps — each DIFFERENT snapshot is PROGRESS and
    // must reset the stall counter, so the chain is never exhausted (the cap is a STALL backstop, not a lifetime limit).
    // REWORK 9: an UNCHANGED snapshot would NOT count, which the next case proves.
    for (let i = 0; i < RECONCILE_MAX_STEPS * 2; i += 1) {
      await driveStep(h);
      // Alternate the waiting flag so each published state DIFFERS from the last: real progress.
      c.observe(sessionId, { executionStatus: 'running', stopReason: null, awaitingInput: i % 2 === 0 });
    }
    // The chain is still alive: a terminal write that fails LATE is still caught by a later step.
    expect(h.steps.length).toBeGreaterThan(0);
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
    expect(handle).not.toBe('');
  });

  it('MAJOR 4 (REWORK 9): polling the SAME unchanged row does NOT extend the chain — it exhausts at the cap', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // The run stays in ONE unchanged phase, and a client POLLS it regularly between reconcile steps. The row is readable
    // but never CHANGES, so it is no progress: REWORK 8 reset the counter on every readable row, letting the polling hold
    // the one chain alive indefinitely. REWORK 9 resets only on a CHANGED state, so the chain exhausts at the cap.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const poll = (): Promise<unknown> => c.ask({ kind: 'inbound.runStatus', run: handle });
    for (let i = 0; i < RECONCILE_MAX_STEPS * 3; i += 1) {
      await driveStep(h);
      await poll();
    }
    // The chain is BOUNDED: the cap was reached and no step is scheduled again, while the run is still HELD (an unchanged
    // row never ends a run).
    expect(h.steps).toHaveLength(0);
    expect(h.runs.holder).toBe(handle);
    // And a LATER change is still settled by the ordinary paths (a terminal result ends it).
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    expect(h.runs.holder).toBeNull();
  });

  it('MAJOR 4 (REWORK 8): an UNREADABLE read does NOT extend the chain — polling cannot keep it alive past the cap', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    await settle();
    // Every reconcile step reads UNREADABLE (the listing cannot be read), and a status query is polled between steps. An
    // unreadable reading is NO evidence of progress, so it must NOT reset the stall counter: the chain exhausts at the
    // cap and STOPS scheduling steps, instead of being kept alive indefinitely by the polling (the fault REWORK 7 left).
    // The status query itself reads an ABSENT listing (no row), which is likewise not progress under the fix.
    const poll = (): Promise<unknown> => c.ask({ kind: 'inbound.runStatus', run: handle });
    for (let i = 0; i < RECONCILE_MAX_STEPS * 3; i += 1) {
      h.unreadableReads = 1;
      await driveStep(h);
      await poll();
    }
    // The chain is BOUNDED: the cap was reached and no step is scheduled again, while the run is still HELD (an
    // unreadable reading never ends a run).
    expect(h.steps).toHaveLength(0);
    expect(h.runs.holder).toBe(handle);
  });

  it('MAJOR 3 (REWORK 8) + MAJOR 1 (REWORK 9): a reasonless STATUS row replaces state/waiting but the HELD run reports NO reason', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A prior accepted event left a reason on the handle (a snapshot whose phase then moved on).
    c.observe(sessionId, { executionStatus: 'running', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBe(handle);
    expect(h.runs.stopReasonOf(handle)).toBe('user_cancelled');
    // Now a STATUS listing row reports a PARK (`paused`) and states NO reason. The row is SILENT about the reason, so it
    // must NOT end the run (round 7's fault: a carried-over reason decided the end).
    h.listings.set(sessionId, { status: 'paused', awaitingInput: false });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    // The slot is STILL HELD — the row invented no end — and, since the run is not ended, the answer carries NO reason
    // (MAJOR 1): a stopped run's reason must not ride a held one.
    expect(h.runs.holder).toBe(handle);
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('paused');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBeNull();
  });

  it('MAJOR 3 (REWORK 8): the phase is ONE unit on the handle — a status row replaces state and waiting flag together', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A snapshot states a busy, waiting-on-a-person phase.
    c.observe(sessionId, { executionStatus: 'waiting', stopReason: null, awaitingInput: true });
    // A later status row states a different phase: the state AND the waiting flag are replaced TOGETHER from that ONE row.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
    expect(h.runs.holder).toBe(handle);
  });

  it('MAJOR 5 (REWORK 8): a late `run.result` whose end status DISAGREES with the frozen end does not touch its reason', () => {
    // A foreign delivery is matched to a handle by the SESSION ID ALONE (the named residual gap). A handle whose end was
    // frozen with a null reason must not have that reason filled by a `run.result` that describes a DIFFERENT end status —
    // only a result that AGREES with the frozen end may complete it. REWORK 7 let a differing-status result add its reason.
    const runs = new InboundSurfaceRuns();
    const handle = `inr_${'e'.repeat(32)}`;
    runs.take('S-E', handle);
    runs.committed(handle, 'S-E');
    // The run's own terminal end is frozen as `failed` WITHOUT a reason (the status was published before the result).
    runs.ended('S-E', null, 'failed');
    expect(runs.byHandle(handle)?.endState?.executionStatus).toBe('failed');
    // A later `run.result` for the SAME session but a DIFFERENT end status (`completed`) must NOT complete this end.
    runs.ended('S-E', 'tasks_complete', 'completed');
    expect(runs.stopReasonOf(handle)).toBeUndefined();
    // A result that AGREES with the frozen end does complete it (the same status).
    runs.ended('S-E', 'iteration_limit_reached', 'failed');
    expect(runs.stopReasonOf(handle)).toBe('iteration_limit_reached');
  });
});

describe('REQ-MCP-123 (BLOCKER 3, REWORK 4): ONE object per handle — an end always reaches the caller’s handle', () => {
  it('the reserved handle, once confirmed and ended, answers its own end — not the continuation of the same session', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // The run ends with a reason; the handle is frozen.
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    // A person then CONTINUES the same session at the desktop: the same id is now `running` and waits on a person.
    h.listings.set(sessionId, { status: 'running', awaitingInput: true });
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    // The OLD handle keeps its OWN end state and waiting flag (the B3 fault: it used to report running/null/awaitingInput=true).
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
  });

  it('a late event of a finished attempt cannot touch a NEWER holder', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'A' });
    const sessionA = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    h.runs.ended(sessionA, 'tasks_complete', 'completed');
    // A new start takes the slot.
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'B' });
    const handleB = second.kind === 'inbound.runStarted' ? second.run : '';
    const sessionB = second.kind === 'inbound.runStarted' ? second.sessionId : '';
    await settle();
    expect(h.runs.holder).toBe(handleB);
    // A LATE snapshot for A's session (the old execution) must touch nothing.
    c.observe(sessionA, { executionStatus: 'running', stopReason: null });
    expect(h.runs.holder).toBe(handleB);
    // And a result for B's session ends B and frees the slot.
    h.runs.ended(sessionB, 'no_pending_tasks', 'completed');
    expect(h.runs.holder).toBeNull();
  });

  it('a completed handle is never overwritten by a late refusal of a superseded attempt', () => {
    const runs = new InboundSurfaceRuns();
    runs.take('S-A', `inr_${'a'.repeat(32)}`);
    runs.committed(`inr_${'a'.repeat(32)}`, 'S-A');
    runs.ended('S-A', 'tasks_complete', 'completed');
    // A late refusal for the same (now completed) handle must not clear its frozen end.
    runs.refuse(`inr_${'a'.repeat(32)}`, { code: 'session.refused', headline: 'no run' });
    expect(runs.byHandle(`inr_${'a'.repeat(32)}`)?.endState?.executionStatus).toBe('completed');
    expect(runs.byHandle(`inr_${'a'.repeat(32)}`)?.refusal).toBeNull();
  });
});

describe('REQ-MCP-123/130 (BLOCKER D): the stop reason lives with the HANDLE', () => {
  it('many DESKTOP results do not evict a live handle’s reason', () => {
    const runs = new InboundSurfaceRuns();
    runs.take('S-EXT', `inr_${'e'.repeat(32)}`);
    runs.committed(`inr_${'e'.repeat(32)}`, 'S-EXT');
    runs.ended('S-EXT', 'tasks_complete');
    for (let i = 0; i < 500; i += 1) runs.ended(`S-DESKTOP-${i}`, 'user_cancelled');
    expect(runs.stopReasonOf(`inr_${'e'.repeat(32)}`)).toBe('tasks_complete');
  });

  it('a desktop result for the SAME session cannot displace the reason while the run is running', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const running = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(running.kind === 'inbound.runStatus' && running.status.stopReason).toBeNull();
    // Then the reason arrives; it is shown.
    c.observe(sessionId, { executionStatus: 'completed', stopReason: 'tasks_complete' });
    const after = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(after.kind === 'inbound.runStatus' && after.status.stopReason).toBe('tasks_complete');
  });

  it('a handle past the history cap is no longer answered, and its reason is dropped with it', () => {
    const runs = new InboundSurfaceRuns();
    const first = `inr_${'0'.repeat(32)}`;
    runs.take('S-0', first);
    runs.committed(first, 'S-0');
    runs.ended('S-0', 'tasks_complete');
    for (let i = 1; i <= 80; i += 1) {
      const handle = `inr_${i.toString(16).padStart(32, '0')}`;
      runs.take(`S-${i}`, handle);
      runs.committed(handle, `S-${i}`);
      runs.ended(`S-${i}`, 'tasks_complete');
    }
    expect(runs.byHandle(first)).toBeUndefined();
    expect(runs.stopReasonOf(first)).toBeUndefined();
  });

  it('REQ-MCP-123 (Minor, REWORK 4): the cap may never evict the CURRENT holder’s handle', () => {
    const runs = new InboundSurfaceRuns();
    // 70 runs, each reserved and ended, overflow the 64-handle history, so the OLDEST records are gone.
    for (let i = 0; i <= 70; i += 1) {
      const handle = `inr_${i.toString(16).padStart(32, '0')}`;
      expect(runs.take(`S-${i}`, handle).ok).toBe(true);
      runs.committed(handle, `S-${i}`);
      runs.ended(`S-${i}`, 'tasks_complete');
    }
    // The very first handle is neither the holder nor recent: gone with its reason.
    expect(runs.byHandle(`inr_${(0).toString(16).padStart(32, '0')}`)).toBeUndefined();
    // A fresh run now takes the slot; while it HOLDS, no other take can record a handle, so the cap can never evict it.
    const held = `inr_${'f'.repeat(32)}`;
    expect(runs.take('S-HELD', held).ok).toBe(true);
    expect(runs.holder).toBe(held);
    for (let i = 0; i < 200; i += 1) expect(runs.take(`S-LATE-${i}`, `inr_${(i + 200).toString(16).padStart(32, '0')}`).ok).toBe(false);
    expect(runs.holder).toBe(held);
    expect(runs.byHandle(held)?.sessionId).toBe('S-HELD');
  });
});

describe('REQ-MCP-124: the start is the ordinary start, through the shared coordinator', () => {
  it('the coordinator reaches the run host as an ordinary session.start with the open workspace, and no authority field', async () => {
    const h = harness();
    const asked: { kind: string }[] = [];
    h.hostStart = async (req) => { asked.push(req); return { kind: 'session.started', sessionId: 'S-REAL' }; };
    const c = coordinator(h);
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'Do the thing.' });
    expect(out.kind).toBe('inbound.runStarted');
    await settle();
    const start = asked.find((r) => r.kind === 'session.start');
    expect(start).toMatchObject({ kind: 'session.start', workspaceId: 'ws-1', prompt: 'Do the thing.' });
    for (const field of ['sandboxMode', 'boardPermissions', 'effectiveRoot', 'worktree', 'runType', 'initialTodo']) {
      expect(start, field).not.toHaveProperty(field);
    }
  });
});

describe('REQ-MCP-123/130: only a handle this surface minted is answered', () => {
  it('refuses an unrelated session id and an unknown handle', async () => {
    const h = harness();
    const c = coordinator(h);
    const unrelated = await c.ask({ kind: 'inbound.runStatus', run: 'a-desktop-session-id' });
    expect(unrelated.kind === 'refused' && unrelated.code).toBe('inbound.unknown-run');
    const unknown = await c.ask({ kind: 'inbound.runStatus', run: `inr_${'b'.repeat(32)}` });
    expect(unknown.kind === 'refused' && unknown.code).toBe('inbound.unknown-run');
  });

  it('answers a handle a start committed, in the product’s own vocabulary', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
    expect(out.kind === 'inbound.runStatus' && out.status.sessionId).toBe(sessionId);
  });

  it('REQ-MCP-125: the status reports that the run waits on a person, in the listing’s own fact', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    h.listings.set(sessionId, { status: 'waiting', awaitingInput: true });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(true);
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
  });

  it('a minted handle matches the pattern, and so would be rejected as a session id elsewhere', () => {
    expect(mintInboundRunHandle()).toMatch(/^inr_[0-9a-f]{32}$/);
  });
});

describe('REQ-MCP-126 (REWORK 4, point 7): the run host’s exit releases the slot and closes every open handle', () => {
  it('a crash must not lock the surface, and a handle must not vanish with it', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    await settle();
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    h.runs.abandonAll();
    // The slot is free, so a fresh start is admitted.
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-AFTER' });
    const after = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(after.kind).toBe('inbound.runStarted');
    // The open handle is closed with a terminal state, not lost.
    const closed = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(closed.kind).toBe('inbound.runStatus');
    expect(closed.kind === 'inbound.runStatus' && closed.status.state).not.toBe('starting');
  });
});

describe('REQ-MCP-126 (BLOCKER, REWORK 5): an UNCLEAR exception never frees the slot', () => {
  it('a throw of which nothing is known (the shared fence) HOLDS the slot instead of freeing it', async () => {
    const h = harness();
    // The exception is raised inside `startSessionRun` and carries no assurance that it happened BEFORE the dispatch.
    // Today every exception was read as a definitive refusal (`refuse` → slot free) — which is how two runs come to exist.
    h.fenceThrows = true;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // The slot is HELD: the exception proves nothing, so a second external start is refused.
    expect(h.runs.holder).toBe(handle);
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    // The handle is not `refused` either: it stays open and is settled by the product's own state for its session.
    const status = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(status.kind).toBe('inbound.runStatus');
    expect(status.kind === 'inbound.runStatus' && status.status.state).toBe('starting');
    h.listings.set(first.kind === 'inbound.runStarted' ? first.sessionId : '', { status: 'running', awaitingInput: false });
    const live = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
  });

  it('a generic host error (`request.failed`, raised after dispatch) HOLDS the slot rather than freeing it', async () => {
    const h = harness();
    // `request.failed` is the run host's own dispatch error: it carries NO assurance the start did not dispatch.
    h.hostStart = async (req) => (req.kind === 'session.start' ? { kind: 'refused', code: 'request.failed', headline: 'the host threw' } : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    expect(h.runs.holder).toBe(handle);
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    // The handle is not refused either: it stays open for the product's own state to settle.
    const status = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(status.kind === 'inbound.runStatus' && status.status.state).toBe('starting');
  });

  it('a POST-start failure (the notice cleanup throws) keeps the slot and lets the run be observed', async () => {
    const h = harness();
    // The run host STARTS the run; the post-work (`clearForRunStart`) then throws.
    h.clearForRunStartThrows = true;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // The slot is HELD: the run exists, so a second external start is refused.
    expect(h.runs.holder).toBe(handle);
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    // And the run that WAS started is observed: the handle turns live under the same handle.
    h.listings.set(h.started[0]!, { status: 'running', awaitingInput: false });
    const live = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
    expect(live.kind === 'inbound.runStatus' && live.status.sessionId).toBe(h.started[0]!);
  });

  it('a POST-start failure still arms the reconcile, so a failed terminal write does not hold the slot for good', async () => {
    const h = harness();
    h.clearForRunStartThrows = true;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    expect(h.steps.length).toBeGreaterThan(0);
    h.listings.set(h.started[0]!, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
  });
});

describe('REQ-MCP-123/126 (MAJOR 1, REWORK 5): a LATE definitive refusal still settles the handle', () => {
  it('a refusal that arrives after the bound refuses the handle instead of stranding it', async () => {
    const h = harness();
    const c = coordinator(h);
    // The start's ask times out; the host's LATE reply is handed to the sink main asked for.
    h.captureLateReply = true;
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // Nothing definitive yet: the attempt is held and a second start is refused.
    expect(h.runs.holder).toBe(handle);
    expect(h.lateReply).not.toBeNull();
    // The host now answers DEFINITIVELY (its refusal only arrived after the bound): the handle settles.
    h.lateReply!({ kind: 'refused', code: 'session.refused', headline: 'no run was started' });
    expect(h.runs.holder).toBeNull();
    const stated = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(stated.kind).toBe('refused');
    // And the slot is free for a fresh start.
    h.captureLateReply = false;
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-NEXT' });
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).kind).toBe('inbound.runStarted');
  });

  it('a late CONFIRMATION confirms the handle and arms the reconcile (the run appeared only after the bound)', async () => {
    const h = harness();
    const c = coordinator(h);
    h.captureLateReply = true;
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    expect(h.steps).toHaveLength(0);
    h.lateReply!({ kind: 'session.started', sessionId: h.started[0]! });
    // The late confirmation turns the handle live and arms the one reconcile.
    expect(h.runs.holder).toBe(handle);
    expect(h.steps.length).toBeGreaterThan(0);
    h.listings.set(h.started[0]!, { status: 'running', awaitingInput: false });
    const live = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
  });
});

describe('REQ-MCP-123/126 (MAJOR A/B, REWORK 6; BLOCKER, REWORK 9): the timestamp is NOT an identity, and a PARK never frees the slot', () => {
  it('a Revise (a next phase of THIS run, new runStartedAt) is adopted, and a subsequent park HOLDS the slot (REWORK 9)', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    const sessionId = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    // The run reaches the plan gate: a reasonless park, so the slot HOLDs.
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // The user presses REVISE at the desktop: the NEXT PHASE of the SAME run starts. The product writes `idle` (the
    // continuation's own status) and the session record's runStartedAt is written ANEW — a value the surface would see
    // as "a different execution" under the round-5 timestamp rule. It must NOT be discarded.
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // A desktop CANCEL at the next gate writes `paused` + `user_cancelled`. REWORK 9: the same iteration may be
    // CONTINUED after it, no product field separates the two, so the park HOLDS — the slot is NOT free and the held run
    // reports NO reason (MAJOR 1). The handle stays watchable through the pause, exactly as the advisor required.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBe(handle);
    const held = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(held.kind === 'inbound.runStatus' && held.status.state).toBe('paused');
    expect(held.kind === 'inbound.runStatus' && held.status.stopReason).toBeNull();
    // A SECOND external start is now REFUSED (the blocker: round 8 admitted it and two runs overlapped).
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'q' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    // The handle is NOT frozen: a later continuation of the same session is still observed.
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    const resumed = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(resumed.kind === 'inbound.runStatus' && resumed.status.state).toBe('running');
    // Only a TERMINAL end frees the slot and names the reason.
    c.observe(sessionId, { executionStatus: 'stopped', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBeNull();
    const ended = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(ended.kind === 'inbound.runStatus' && ended.status.stopReason).toBe('user_cancelled');
  });

  it('a park with a reason still HOLDS (the regress guard, REWORK 9): the plan gate, the message limit and a paused/user_cancelled park never free the slot', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    c.observe(sessionId, { executionStatus: 'paused_message_limit', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    c.observe(sessionId, { executionStatus: 'paused', stopReason: null });
    expect(h.runs.holder).toBe(handle);
    // The plainest desktop pause, WITH a reason: STILL held (the blocker's own signal).
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBe(handle);
    c.observe(sessionId, { executionStatus: 'paused_message_limit', stopReason: 'message_limit_reached' });
    expect(h.runs.holder).toBe(handle);
    // A TERMINAL status is the first thing that frees it.
    c.observe(sessionId, { executionStatus: 'completed', stopReason: 'tasks_complete' });
    expect(h.runs.holder).toBeNull();
  });

  it('the phase fields are replaced as ONE unit: a reason the next phase does not carry is CLEARED', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    // A busy phase that nevertheless has a stop reason on its record (a resume writes it, then runs).
    c.observe(sessionId, { executionStatus: 'running', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBe(handle);
    expect(h.runs.stopReasonOf(handle)).toBe('user_cancelled');
    // The next phase carries NO reason: the unit rule CLEARS it (merging only populated fields would keep it standing).
    c.observe(sessionId, { executionStatus: 'starting', stopReason: null });
    expect(h.runs.stopReasonOf(handle)).toBeUndefined();
    // And the waiting flag follows the same unit: it is false on the new phase, whatever it was before.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
  });
});

describe('REQ-MCP-123/126 (MAJOR B, REWORK 6): a confirmation on ANY path arms the one reconcile', () => {
  it('a confirming SNAPSHOT arms the reconcile when the start reply was lost', async () => {
    const h = harness();
    const c = coordinator(h);
    h.captureLateReply = true; // the start's reply is lost; only the snapshot path can confirm it
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    const sessionId = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    expect(h.runs.holder).toBe(handle);
    expect(h.steps).toHaveLength(0);
    // The product publishes the run's state: it CONFIRMS the attempt, so the one reconcile is armed.
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    expect(h.steps.length).toBeGreaterThan(0);
    // A terminal write then fails; the armed reconcile ends it rather than holding the slot for good.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
  });

  it('a confirmation that arrives ONLY through the status listing arms the reconcile, and a failed terminal write then frees the slot', async () => {
    const h = harness();
    const c = coordinator(h);
    // The start's reply is lost and NO snapshot ever comes: the ONLY evidence the run exists is the listing the status
    // read asks for. Round 5 confirmed the handle from that listing but DISCARDED the answer, so no reconcile was armed.
    h.captureLateReply = true;
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    const sessionId = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    expect(h.runs.holder).toBe(handle);
    expect(h.steps).toHaveLength(0);
    // The listing carries the run: this status read is what confirms the attempt.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const live = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(live.kind === 'inbound.runStatus' && live.status.state).toBe('running');
    // THAT confirmation armed the reconcile.
    expect(h.steps.length).toBeGreaterThan(0);
    // The terminal write then fails: the reading is stale (busy with nothing running it), and the armed reconcile ends it.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
  });
});

describe('REQ-MCP-123 (MINOR, REWORK 5): a frozen/refused handle answers before and after the read', () => {
  it('a handle refused WHILE its status read is in flight answers the refusal, not `starting`', async () => {
    const h = harness();
    const c = coordinator(h);
    h.captureLateReply = true;
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    await settle();
    // Hold the status read open, then let a definitive refusal land while it is in flight.
    let release: () => void = () => undefined;
    h.readGate = new Promise<void>((r) => { release = r; });
    const pending = c.ask({ kind: 'inbound.runStatus', run: handle });
    await settle();
    h.lateReply!({ kind: 'refused', code: 'session.refused', headline: 'no run was started' });
    release();
    const out = await pending;
    // The refusal that arrived during the read is stated, rather than being overtaken by a `starting` answer.
    expect(out.kind).toBe('refused');
  });

  it('an already-ended handle is answered from its frozen end without a listing read at all', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    const sessionId = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    h.runs.ended(sessionId, 'tasks_complete', 'completed');
    // A read gate that would HANG the call if it were consulted: the frozen end must be answered without it.
    h.readGate = new Promise<void>(() => undefined);
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
  });
});
