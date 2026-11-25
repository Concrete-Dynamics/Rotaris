import { describe, expect, it } from 'vitest';
import type { InboundListenerAsk, InboundRunStatusAnswer, InboundStartRunAnswer } from '@rotaris/contracts';
import { createInboundCoordinator, InboundSurfaceRuns, mintInboundRunHandle, type ObservedState } from './inbound-runs.js';
import type { SessionStartDeps } from './session-start.js';

/**
 * REQ-MCP-123/124/126/130: main's side of the surface — the single-run slot, the handle scope, and the wiring to the
 * ONE main-side start coordinator. The coordinator is driven with stand-in deps, so the slot's behaviour and the
 * handle's scope are measured without a run host or a window.
 *
 * REWORK 2 (2026-11-25). The cases added here prove the slot's transitions are bound to the ATTEMPT (BLOCKER A), that a
 * lost reply settles from the product state (BLOCKER B), that a desktop cancel at a park frees the slot and keeps the
 * reason (BLOCKER C), and that a reason lives with its handle (BLOCKER D).
 */

/** A promise a case resolves by hand, so a start's host ask can be held open across another start (BLOCKER A). */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (v: T) => void; readonly reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Harness {
  readonly runs: InboundSurfaceRuns;
  /** REQ-MCP-124: the open workspace the fence reads; a case may change it to prove the fence refuses. */
  open: { workspaceId: string; workspace: string } | null;
  /** What the run host answers a `session.start` with (a `session.started`, a refusal, or a promise a case settles). */
  hostStart: (req: { kind: string }) => Promise<unknown>;
  /** The session listings the run host answers `session.list` with, keyed by session id. */
  readonly listings: Map<string, { status: string; awaitingInput: boolean; stale?: boolean }>;
  /** The session id the run host was asked to start, once a `session.start` reached it. */
  readonly started: string[];
  /** Probes the coordinator scheduled (BLOCKER B), so a case can drive them synchronously. */
  readonly probes: (() => void)[];
  /** BLOCKER 2: while > 0, the next `readStatus` calls answer `unreadable` (a listing that could not be read), decremented each use. */
  unreadableReads: number;
  /** The bound the coordinator was given for its start (BLOCKER B): the inbound one, above the host's lease. */
  startBound: number | null;
  /** When true, the coordinator is built WITHOUT `startBoundMs`, so its own default is measured. */
  defaultBound: boolean;
}

function harness(over: Partial<Harness> = {}): Harness {
  const runs = new InboundSurfaceRuns();
  const h: Harness = {
    runs,
    open: { workspaceId: 'ws-1', workspace: '/work' },
    hostStart: async () => ({ kind: 'session.started', sessionId: 'S-REAL' }),
    listings: new Map(),
    started: [],
    probes: [],
    unreadableReads: 0,
    startBound: null,
    defaultBound: false,
    ...over,
  };
  return h;
}

function coordinator(h: Harness): { readonly ask: (a: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>; readonly observe: (sessionId: string, state: ObservedState) => void } {
  const startDeps = {
    log: () => undefined,
    runHost: {
      request: async (req: { kind: string; sessionId?: string }, bound?: number) => {
        if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
        if (req.kind === 'session.start' && typeof req.sessionId === 'string') h.started.push(req.sessionId);
        // BLOCKER B: the bound the INBOUND path set for its `session.start`, captured so a case holds it to 60 s.
        if (req.kind === 'session.start' && typeof bound === 'number') h.startBound = bound;
        return h.hostStart(req);
      },
    },
    services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined }, notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined }, raiseNotice: () => undefined, recoveryFor: () => [],
    openWorkspaceRead: async () => h.open,
    confinementNotice: (r: { headline: string }) => ({ severity: 'error' as const, title: r.headline, message: r.headline, detail: r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  const c = createInboundCoordinator({
    start: startDeps,
    runs: h.runs,
    openWorkspace: async () => h.open,
    // REQ-MCP-123: the status the REAL read gives (the run host's listing); the stop reason is fed from the product state.
    readStatus: async (_workspaceId, sessionId) => {
      if (h.unreadableReads > 0) { h.unreadableReads -= 1; return { kind: 'unreadable' as const }; }
      const row = h.listings.get(sessionId);
      return row === undefined ? { kind: 'absent' as const } : { kind: 'row' as const, executionStatus: row.status, awaitingInput: row.awaitingInput, stale: row.stale ?? false };
    },
    // BLOCKER B: the probe is driven synchronously by the case (its steps are queued, run on demand). The absence must
    // span `spanMs` (production uses the inbound start bound); the harness scales it with the interval so its steps
    // reach it in a few drives.
    settleProbe: { schedule: (fn) => { h.probes.push(fn); }, attempts: 3, intervalMs: 1 as never, spanMs: 3 as never },
    // BLOCKER B: the bound the INBOUND path sets; a case may omit it to measure the coordinator's own default.
    ...(h.defaultBound ? {} : { startBoundMs: 60_000 as never }),
    mintHandle: () => `inr_${'a'.repeat(32)}`,
  });
  // The coordinator's own `ask`, exposed directly (the harness records everything the cases need).
  return { ask: c.ask, observe: c.observeSnapshot };
}

describe('REQ-MCP-126: at most one externally started run, refused rather than queued', () => {
  it('takes the slot atomically — a second take while one is held is refused', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-1', `inr_${'1'.repeat(32)}`);
    expect(a.ok).toBe(true);
    expect(runs.take('S-2', `inr_${'2'.repeat(32)}`).ok).toBe(false);
    if (!a.ok) throw new Error('unreachable');
    runs.committed(a.attempt, { handle: `inr_${'1'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1', stopReason: null, endState: null });
    expect(runs.active?.sessionId).toBe('S-1');
    expect(runs.take('S-3', `inr_${'3'.repeat(32)}`).ok).toBe(false);
  });

  it('releasing the slot (a definite refusal) admits the next request', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-1', `inr_${'1'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.release(a.attempt);
    expect(runs.take('S-2', `inr_${'2'.repeat(32)}`).ok).toBe(true);
  });

  it('the run’s own end releases the slot; another session’s end does not', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-1', `inr_${'1'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.committed(a.attempt, { handle: `inr_${'1'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1', stopReason: null, endState: null });
    runs.ended('S-OTHER', 'tasks_complete');
    expect(runs.active).not.toBeNull();
    runs.ended('S-1', 'tasks_complete');
    expect(runs.active).toBeNull();
  });

  it('a second ask while a run is active is refused with the stated reason, and never reaches the start', async () => {
    const h = harness();
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const startsBefore = h.started.length;
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.code).toBe('inbound.run-active');
    expect(out.kind === 'refused' && out.headline).toContain('already active');
    // The refused ask reached no run host: no new `session.start` was made.
    expect(h.started.length).toBe(startsBefore);
  });

  it('the slot is released when the start is refused for a definite reason, so a later ask is admitted rather than deferred', async () => {
    const h = harness();
    h.open = null;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('refused');
    expect(h.runs.active).toBeNull();
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(second.kind === 'refused' && second.code).not.toBe('inbound.run-active');
  });
});

describe('REQ-MCP-126 (BLOCKER A): the slot transitions are bound to the ATTEMPT, not a global counter', () => {
  it('A ends before it commits, B takes, B is refused: the slot is FREE at the end (rot on the current head)', async () => {
    const h = harness();
    const aStart = deferred<unknown>();
    let started = 0;
    h.hostStart = async (req) => { void req; started += 1; return started === 1 ? aStart.promise : { kind: 'refused', code: 'session.refused', headline: 'no run' }; };
    const c = coordinator(h);
    // A starts; its host ask is held open (A is in `startSessionRun`'s tail).
    const a = c.ask({ kind: 'inbound.startRun', prompt: 'A' });
    await Promise.resolve();
    // A's session ends BEFORE its start commits (the race the rework introduced). The attempt's own session id is the
    // one `take` minted (the coordinator passes it through to `session.start`).
    const aSession = h.runs.attempt?.sessionId;
    expect(aSession).toBeDefined();
    h.runs.ended(aSession!, 'tasks_complete');
    // B takes the slot while A is still uncommitted.
    const b = await c.ask({ kind: 'inbound.startRun', prompt: 'B' });
    expect(b.kind).toBe('refused');
    expect(b.kind === 'refused' && b.code).not.toBe('inbound.run-active');
    // A's start finally commits — LATE, with a superseded attempt. It must touch nothing.
    aStart.resolve({ kind: 'session.started', sessionId: aSession! });
    const aOut = await a;
    expect(aOut.kind).toBe('inbound.runStarted');
    // THE SLOT IS FREE: a fresh start is admitted (on the current head the slot would be occupied for good).
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-C' });
    const c3 = await c.ask({ kind: 'inbound.startRun', prompt: 'C' });
    expect(c3.kind).toBe('inbound.runStarted');
    // And the dead A was never entered as the active run.
    expect(h.runs.active?.sessionId).toBe('S-C');
  });

  it('two overlapping attempts: exactly one holds the slot, and the other’s late commit/release changes nothing', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-A', `inr_${'a'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.ended('S-A', 'user_cancelled'); // A's run ended before its start committed
    const b = runs.take('S-B', `inr_${'b'.repeat(32)}`);
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('unreachable');
    // A's late commit: records A's handle, does NOT take the slot, does NOT become active.
    runs.committed(a.attempt, { handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-A', workspaceId: 'ws-1', stopReason: 'user_cancelled', endState: null });
    expect(runs.active).toBeNull();
    expect(runs.attempt?.sessionId).toBe('S-B');
    // A's late RELEASE (were it called) must not free B's reservation: a third take is still refused.
    expect(runs.take('S-C', `inr_${'c'.repeat(32)}`).ok).toBe(false);
    // B commits normally: B is the active run.
    runs.committed(b.attempt, { handle: `inr_${'b'.repeat(32)}`, sessionId: 'S-B', workspaceId: 'ws-1', stopReason: null, endState: null });
    expect(runs.active?.sessionId).toBe('S-B');
    // A handle recorded even for the superseded attempt is answerable (BLOCKER B's "handle comes after").
    expect(runs.byHandle(`inr_${'a'.repeat(32)}`)?.stopReason).toBe('user_cancelled');
  });

  it('a window with a LATE commit of A admits no second run while A is not definitely ended', async () => {
    const h = harness();
    const aStart = deferred<unknown>();
    h.hostStart = async () => aStart.promise;
    const c = coordinator(h);
    const a = c.ask({ kind: 'inbound.startRun', prompt: 'A' });
    await Promise.resolve();
    // A's host ask is open: a second start is refused (the attempt holds the slot).
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'B' });
    expect(second.kind).toBe('refused');
    expect(second.kind === 'refused' && second.code).toBe('inbound.run-active');
    // A is settled as started; it is now the active run, so a third start is still refused.
    aStart.resolve({ kind: 'session.started', sessionId: h.started[0]! });
    await a;
    expect(h.runs.active).not.toBeNull();
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'C' })).kind).toBe('refused');
  });

  it('a release of a superseded attempt cannot delete a newer attempt’s reservation', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-A', `inr_${'a'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.release(a.attempt);
    const b = runs.take('S-B', `inr_${'b'.repeat(32)}`);
    expect(b.ok).toBe(true);
    // A's late release (bound to A) touches nothing: B's reservation stands.
    runs.release(a.attempt);
    expect(runs.attempt?.sessionId).toBe('S-B');
  });
});

describe('REQ-MCP-126/123 (BLOCKER B): a lost reply settles from the product state', () => {
  it('a start whose host ask never answers keeps the slot until the probe settles it', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply to session.start within 60000 ms')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('refused');
    expect(first.kind === 'refused' && first.code).toBe('inbound.start-unconfirmed');
    // The held handle is named in the refusal, so the caller can ask for the run even though the start was unconfirmed.
    const handle = first.kind === 'refused' ? first.detail?.match(/inr_[0-9a-f]{32}/)?.[0] : undefined;
    expect(handle).toBeDefined();
    // The slot is still held: the run may still be being born in the run host.
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('refused');
    // The probe runs and finds the session was never created → the slot is freed.
    for (let i = 0; i < 4; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.active).toBeNull();
    // A fresh start is admitted now that the attempt is settled (no run was born).
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-LATER' });
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('inbound.runStarted');
  });

  it('the inbound start waits on its OWN bound, above the run host’s credential lease', async () => {
    const h = harness();
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    // The bound the inbound path set is the inbound one (60 s), not the desktop default (10 s).
    expect(h.startBound).toBe(60_000);
  });

  it('BLOCKER 2 (2026-11-25): a FAILED or EMPTY listing EXTENDS the probe — the slot is not freed while a run may still be born', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind === 'refused' && first.code).toBe('inbound.start-unconfirmed');
    const sessionId = h.started[0]!;
    // The first two listings FAIL (unreadable proves nothing about the run) and the next is EMPTY — under `plan.attempts`
    // clean-absent readings. On the current head a failed/empty listing counted as an absence and freed the slot after the
    // plan's few attempts; here the slot must stay HELD.
    h.unreadableReads = 2;
    for (let i = 0; i < 3; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    // Fewer than `attempts` CONSECUTIVE clean-absent readings: the slot is NOT freed, a second start is refused.
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('refused');
    // The run then APPEARS — the probe settles the attempt into the active run under its handle (not freed).
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    for (let i = 0; i < 4 && h.probes.length > 0; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.active?.sessionId).toBe(sessionId);
  });

  it('BLOCKER 2 (2026-11-25): a later snapshot of the RESERVED session settles THAT attempt, even after a new take', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-A', `inr_${'a'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    // A's run ended (its start is still on its way); B takes the slot.
    runs.ended('S-A', 'tasks_complete', 'completed');
    const b = runs.take('S-B', `inr_${'b'.repeat(32)}`);
    expect(b.ok).toBe(true);
    // A LATE snapshot for A (the RESERVED session) — after B took the slot — must settle A's attempt, not B's.
    runs.observe('S-A', { executionStatus: 'completed', stopReason: 'tasks_complete' });
    expect(runs.attempt?.sessionId).toBe('S-B');
    // A's handle is answerable with its own end state; B is untouched.
    expect(runs.byHandle(`inr_${'a'.repeat(32)}`)?.stopReason).toBe('tasks_complete');
    expect(runs.active).toBeNull();
  });

  it('BLOCKER 2 (2026-11-25): after the probe frees the slot, a later snapshot of the same session starts no second run', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind === 'refused' && first.code).toBe('inbound.start-unconfirmed');
    const sessionId = h.started[0]!;
    // Enough clean-absent readings spanning the worst case: the slot is freed (no run was born).
    for (let i = 0; i < 6; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.attempt).toBeNull();
    // A snapshot of the session whose attempt was dismissed must NOT resurrect a run.
    c.observe(sessionId, { executionStatus: 'running', stopReason: null });
    expect(h.runs.active).toBeNull();
  });

  it('BLOCKER 3 (2026-11-25): `idle` before a relaunch keeps the slot — a plan-approve continuation is not read as an end', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run parks at the plan gate, then the user APPROVES: the product publishes `idle` BEFORE relaunching the same
    // session (`sessions.ts:3080`). On the current head `idle` ended the run and freed the slot; here it must HOLD.
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null });
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.active?.sessionId).toBe(sessionId);
    // The continuation runs: still the same slot, and a second external start is refused.
    c.observe(sessionId, { executionStatus: 'starting', stopReason: null });
    expect(h.runs.active?.sessionId).toBe(sessionId);
    expect((await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).kind).toBe('refused');
    // Its later stop reason is reported correctly.
    c.observe(sessionId, { executionStatus: 'completed', stopReason: 'tasks_complete' });
    expect(h.runs.active).toBeNull();
    const out = await c.ask({ kind: 'inbound.runStatus', run: started.kind === 'inbound.runStarted' ? started.run : '' });
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
  });

  it('BLOCKER 3 (2026-11-25): `idle` at a message-limit continue keeps the slot; only a terminal state or a park WITH a reason frees it', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The message-limit pause, then `continue`: `resolvePause('idle', …)` publishes `idle` before the relaunch.
    c.observe(sessionId, { executionStatus: 'paused_message_limit', stopReason: null });
    expect(h.runs.active?.sessionId).toBe(sessionId);
    c.observe(sessionId, { executionStatus: 'idle', stopReason: null });
    expect(h.runs.active?.sessionId).toBe(sessionId);
    // A park WITH a reason (the cancel arm) IS an end.
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'message_limit_reached' });
    expect(h.runs.active).toBeNull();
  });

  it('MAJOR (2026-11-25): a run whose terminal write failed is ended by the one reconcile — a STALE listing frees the slot', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    expect(h.runs.active?.sessionId).toBe(sessionId);
    // The host's durable image stays busy (the terminal transaction failed) and marks the session STALE — busy while no
    // live process holds its lock (REQ-SESSION-171). The reconcile that ran after the start reads exactly that.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: true });
    for (let i = 0; i < 4 && h.probes.length > 0; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.active).toBeNull();
  });

  it('MAJOR (2026-11-25): the reconcile never ends a LIVE busy run', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // Present and live (not stale): a real run. The reconcile must leave it alone.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false, stale: false });
    for (let i = 0; i < 4 && h.probes.length > 0; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.active?.sessionId).toBe(sessionId);
  });

  it('the coordinator’s DEFAULT bound is the inbound one, above the run host’s lease (REQ-MCP-126, BLOCKER B)', async () => {
    // No `startBoundMs` is passed: the coordinator's own default (`INBOUND_START_BOUND_MS`) must be above the host's
    // `LEASE_ASK_MS` (45 s), or a healthy-but-slow host would again be read as a no-reply.
    const h = harness({ defaultBound: true });
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(h.startBound).toBe(60_000);
    expect(h.startBound!).toBeGreaterThan(45_000);
  });

  it('a run that starts LATE (after the reply was lost) is settled into the active run under its handle', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind === 'refused' && first.code).toBe('inbound.start-unconfirmed');
    const handle = first.kind === 'refused' ? first.detail!.match(/inr_[0-9a-f]{32}/)![0] : '';
    const sessionId = h.started[0]!;
    // The run really was born: the product reports it running. The probe settles the attempt into the active run.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    for (let i = 0; i < 4 && h.probes.length > 0; i += 1) { const step = h.probes.shift(); step?.(); await Promise.resolve(); await Promise.resolve(); }
    expect(h.runs.active?.sessionId).toBe(sessionId);
    // And the handle FOR WHICH the caller got "unconfirmed" now answers the run's status.
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.sessionId).toBe(sessionId);
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
  });

  it('an unknown handle is refused, and no probe can make another session’s state answerable', async () => {
    const h = harness();
    const c = coordinator(h);
    const unrelated = await c.ask({ kind: 'inbound.runStatus', run: `inr_${'b'.repeat(32)}` });
    expect(unrelated.kind === 'refused' && unrelated.code).toBe('inbound.unknown-run');
  });
});

describe('REQ-MCP-123/126 (BLOCKER C): a desktop cancel at a park frees the slot and keeps the reason', () => {
  it('an external run parks at the plan gate, then is cancelled → the slot is free and the reason is answerable', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(started.kind).toBe('inbound.runStarted');
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run parks at the plan gate (no terminal `run.result`), as the product publishes it.
    c.observe(sessionId, { executionStatus: 'awaiting_plan_decision', stopReason: null });
    expect(h.runs.active?.sessionId).toBe(sessionId);
    // The user CANCELS at the desktop: the product writes `paused` + `user_cancelled`, still no `run.result`.
    h.listings.set(sessionId, { status: 'paused', awaitingInput: false });
    c.observe(sessionId, { executionStatus: 'paused', stopReason: 'user_cancelled' });
    // The slot is free without a `run.result`.
    expect(h.runs.active).toBeNull();
    // And `rotaris_run_status` names the reason.
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('paused');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('user_cancelled');
  });

  it('a run that completed without a published reason does not read as still running in the surface text', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    h.listings.set(sessionId, { status: 'completed', awaitingInput: false });
    c.observe(sessionId, { executionStatus: 'completed', stopReason: null });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(h.runs.active).toBeNull();
  });
});

describe('REQ-MCP-123/130 (BLOCKER D): the stop reason lives with the HANDLE', () => {
  it('many DESKTOP results do not evict a live handle’s reason', () => {
    const runs = new InboundSurfaceRuns();
    const a = runs.take('S-EXT', `inr_${'e'.repeat(32)}`);
    if (!a.ok) throw new Error('unreachable');
    runs.committed(a.attempt, { handle: `inr_${'e'.repeat(32)}`, sessionId: 'S-EXT', workspaceId: 'ws-1', stopReason: null, endState: null });
    runs.ended('S-EXT', 'tasks_complete');
    // A flood of desktop runs of OTHER sessions ends — none touches the handle's reason.
    for (let i = 0; i < 500; i += 1) runs.ended(`S-DESKTOP-${i}`, 'user_cancelled');
    expect(runs.stopReasonOf(`inr_${'e'.repeat(32)}`)).toBe('tasks_complete');
  });

  it('a desktop result for the SAME session cannot displace the reason while the run is running', async () => {
    const h = harness();
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run is running: no reason shows however recently the session last stopped.
    h.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const running = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(running.kind === 'inbound.runStatus' && running.status.stopReason).toBeNull();
    // Then the reason arrives; it is shown.
    c.observe(sessionId, { executionStatus: 'completed', stopReason: 'tasks_complete' });
    h.listings.set(sessionId, { status: 'completed', awaitingInput: false });
    const after = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(after.kind === 'inbound.runStatus' && after.status.stopReason).toBe('tasks_complete');
  });

  it('a handle past the history cap is no longer answered, and its reason is dropped with it', () => {
    const runs = new InboundSurfaceRuns();
    const first = `inr_${'0'.repeat(32)}`;
    const a = runs.take('S-0', first);
    if (!a.ok) throw new Error('unreachable');
    runs.committed(a.attempt, { handle: first, sessionId: 'S-0', workspaceId: 'ws-1', stopReason: null, endState: null });
    runs.ended('S-0', 'tasks_complete');
    for (let i = 1; i <= 80; i += 1) {
      const handle = `inr_${i.toString(16).padStart(32, '0')}`;
      const t = runs.take(`S-${i}`, handle);
      if (!t.ok) throw new Error('unreachable');
      runs.committed(t.attempt, { handle, sessionId: `S-${i}`, workspaceId: 'ws-1', stopReason: null, endState: null });
      runs.ended(`S-${i}`, 'tasks_complete');
    }
    expect(runs.byHandle(first)).toBeUndefined();
    expect(runs.stopReasonOf(first)).toBeUndefined();
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
    const start = asked.find((r) => r.kind === 'session.start');
    expect(start).toMatchObject({ kind: 'session.start', workspaceId: 'ws-1', prompt: 'Do the thing.' });
    for (const field of ['sandboxMode', 'boardPermissions', 'effectiveRoot', 'worktree', 'runType', 'initialTodo']) {
      expect(start, field).not.toHaveProperty(field);
    }
  });

  it('a workspace that changed before admission refuses the start (the shared fence), and the slot is released', async () => {
    const h = harness();
    h.open = { workspaceId: 'ws-1', workspace: '/work' };
    const c = createInboundCoordinator({
      start: ({ log: () => undefined, runHost: { request: async () => ({ kind: 'runs.count', workspaceId: 'ws-1', count: 0 }) }, services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined }, notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined }, raiseNotice: () => undefined, recoveryFor: () => [], openWorkspaceRead: async () => ({ workspaceId: 'ws-2', workspace: '/other' }), confinementNotice: () => ({ severity: 'error' as const, title: 't', message: 'm', detail: 'd', persistent: true as const, action: { label: 'l', action: { kind: 'open-view' as const, view: 'workspace' } } }) } as unknown as SessionStartDeps),
      runs: h.runs,
      openWorkspace: async () => h.open,
      readStatus: async () => ({ kind: 'absent' as const }),
    });
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind === 'refused' && out.code).toBe('session.workspace-changed');
    expect(h.runs.active).toBeNull();
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
    h.listings.set('S-REAL', { status: 'running', awaitingInput: false });
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(started.kind).toBe('inbound.runStarted');
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
    expect(out.kind === 'inbound.runStatus' && out.status.sessionId).toBe('S-REAL');
  });

  it('REQ-MCP-125: the status reports that the run waits on a person, in the listing’s own fact', async () => {
    const h = harness();
    h.listings.set('S-REAL', { status: 'waiting', awaitingInput: true });
    const c = coordinator(h);
    const started = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(true);
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
  });

  it('a minted handle matches the pattern, and so would be rejected as a session id elsewhere', () => {
    expect(mintInboundRunHandle()).toMatch(/^inr_[0-9a-f]{32}$/);
  });
});

describe('REQ-MCP-126 (MAJOR): the run host’s exit releases the slot', () => {
  it('a crash must not lock the surface for good', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply')) : { kind: 'ack' });
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    h.runs.abandonAll();
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-AFTER' });
    const after = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(after.kind).toBe('inbound.runStarted');
  });
});
