import { describe, expect, it } from 'vitest';
import type { InboundListenerAsk, InboundRunStatusAnswer, InboundStartRunAnswer } from '@rotaris/contracts';
import { createInboundCoordinator, InboundSurfaceRuns, mintInboundRunHandle, type ObservedState } from './inbound-runs.js';
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
  it('a run parks at the plan gate WITHOUT a reason and HOLDS the slot; the cancel (a park WITH a reason) frees it', async () => {
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
    // The user CANCELS at the desktop: `paused` + `user_cancelled` — a park WITH a reason ends the invocation.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled' });
    expect(h.runs.holder).toBeNull();
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('paused');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('user_cancelled');
  });

  it('a message-limit park WITHOUT a reason holds the slot; only a terminal state or a park WITH a reason frees it', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    await settle();
    c.observe(sessionId, { executionStatus: 'paused_message_limit', stopReason: null });
    expect(h.runs.holder).not.toBeNull();
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.holder).not.toBeNull();
    // A park WITH a reason (the cancel arm) IS an end.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'message_limit_reached' });
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

describe('REQ-MCP-123/126 (MAJOR 2, REWORK 5): a CONFIRMING snapshot arms the reconcile', () => {
  it('a snapshot that confirms an attempt whose reply was lost still arms the one reconcile', async () => {
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
    c.observe(sessionId, { executionStatus: 'running', stopReason: null, executionStartedAt: 't1' });
    expect(h.steps.length).toBeGreaterThan(0);
    // A terminal write then fails; the armed reconcile ends it rather than holding the slot for good.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    await driveStep(h);
    expect(h.runs.holder).toBeNull();
  });
});

describe('REQ-MCP-123/125/126 (MAJOR 2, REWORK 5): the handle is the EXECUTION, not the session', () => {
  it('a DESKTOP continuation of the same session does not hand the old handle its state or waiting flag', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = first.kind === 'inbound.runStarted' ? first.run : '';
    const sessionId = first.kind === 'inbound.runStarted' ? first.sessionId : '';
    await settle();
    // This handle's own execution is fixed by the first state seen.
    c.observe(sessionId, { executionStatus: 'running', stopReason: null, executionStartedAt: 'run-1' });
    // The run parks at the plan gate; the same execution, same start instant: the slot is HELD.
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null, executionStartedAt: 'run-1' });
    expect(h.runs.holder).toBe(handle);
    // A person then CONTINUES the session at the desktop: a NEW execution (`run-2`) of the same session id.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    c.observe(sessionId, { executionStatus: 'running', stopReason: null, executionStartedAt: 'run-2' });
    // The continuation's state must NOT be adopted: the handle keeps its own execution's story (still held at its park).
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    // The listing is still the continuation's (the same session): the record's own state is read, but the handle's slot
    // was not settled by the OTHER execution's park/cancel either.
    expect(h.runs.holder).toBe(handle);
    // The continuation's CANCEL must not free THIS handle's slot (it belongs to run-2).
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled', executionStartedAt: 'run-2' });
    expect(h.runs.holder).toBe(handle);
    // And this execution's own cancel does free it.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled', executionStartedAt: 'run-1' });
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
