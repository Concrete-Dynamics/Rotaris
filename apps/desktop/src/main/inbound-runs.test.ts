import { describe, expect, it } from 'vitest';
import type { InboundListenerAsk, InboundRunStatusAnswer, InboundStartRunAnswer } from '@rotaris/contracts';
import { createInboundCoordinator, InboundSurfaceRuns, mintInboundRunHandle } from './inbound-runs.js';
import type { SessionStartDeps } from './session-start.js';

/**
 * REQ-MCP-123/124/126/130: main's side of the surface — the single-run slot, the handle scope, and the wiring to the
 * ONE main-side start coordinator. The coordinator is driven with stand-in deps, so the slot's behaviour and the
 * handle's scope are measured without a run host or a window.
 *
 * Repaired (2026-11-25): the cases here drive the REAL coordinator (`startSessionRun`) over the stand-in run host rather
 * than a private pre-taken slot, and the stop reason is read from the run host's own `run.result`, not injected into
 * `readStatus`. The single-run slot's hold across a lost reply (BLOCKER 2) and the run-host exit hook (MAJOR) are proved
 * here too.
 */

interface Harness {
  readonly runs: InboundSurfaceRuns;
  /** REQ-MCP-124: the open workspace the fence reads; a case may change it to prove the fence refuses. */
  open: { workspaceId: string; workspace: string } | null;
  /** What the run host answers a `session.start` with (a `session.started`, a refusal, or a never-settling promise). */
  hostStart: (req: { kind: string }) => Promise<unknown>;
  /** The session listings the run host answers `session.list` with, keyed by session id. */
  readonly listings: Map<string, { status: string; awaitingInput: boolean }>;
}

function harness(over: Partial<Harness> = {}): Harness {
  const runs = new InboundSurfaceRuns();
  return {
    runs,
    open: { workspaceId: 'ws-1', workspace: '/work' },
    hostStart: async () => ({ kind: 'session.started', sessionId: 'S-REAL' }),
    listings: new Map(),
    ...over,
  };
}

function coordinator(h: Harness): { readonly ask: (a: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer> } {
  const startDeps = {
    log: () => undefined,
    runHost: {
      request: async (req: { kind: string }) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : h.hostStart(req)),
    },
    services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined }, notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined }, raiseNotice: () => undefined, recoveryFor: () => [],
    openWorkspaceRead: async () => h.open,
    confinementNotice: (r: { headline: string }) => ({ severity: 'error' as const, title: r.headline, message: r.headline, detail: r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  const c = createInboundCoordinator({
    start: startDeps,
    runs: h.runs,
    openWorkspace: async () => h.open,
    // REQ-MCP-123: the status the REAL read gives — the run host's listing plus whatever terminal reason main holds.
    // This stand-in answers the listing only; the stop reason is proved end to end in `inbound-wiring.test.ts`.
    readStatus: async (_workspaceId, sessionId) => {
      const row = h.listings.get(sessionId);
      return row === undefined ? null : { executionStatus: row.status, stopReason: null, awaitingInput: row.awaitingInput };
    },
    mintHandle: () => `inr_${'a'.repeat(32)}`,
  });
  return { ask: c.ask };
}

describe('REQ-MCP-126: at most one externally started run, refused rather than queued', () => {
  it('takes the slot atomically — a second take while one is held is refused', () => {
    const runs = new InboundSurfaceRuns();
    expect(runs.take('S-1')).toEqual({ ok: true });
    expect(runs.take('S-2')).toEqual({ ok: false });
    runs.committed({ handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1' });
    expect(runs.active?.sessionId).toBe('S-1');
    expect(runs.take('S-3')).toEqual({ ok: false });
  });

  it('releasing the slot (a definite refusal) admits the next request', () => {
    const runs = new InboundSurfaceRuns();
    runs.take('S-1');
    runs.release();
    expect(runs.take('S-2')).toEqual({ ok: true });
  });

  it('the run’s own end releases the slot; another session’s end does not', () => {
    const runs = new InboundSurfaceRuns();
    runs.take('S-1');
    runs.committed({ handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1' });
    runs.ended('S-OTHER');
    expect(runs.active).not.toBeNull();
    runs.ended('S-1');
    expect(runs.active).toBeNull();
  });

  it('a second ask while a run is active is refused with the stated reason, and never reaches the start', async () => {
    const h = harness();
    const c = coordinator(h);
    // A REAL first start through the coordinator, so its slot is taken by an actual run.
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('inbound.runStarted');
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.code).toBe('inbound.run-active');
    expect(out.kind === 'refused' && out.headline).toContain('already active');
  });

  it('the slot is released when the start is refused for a definite reason, so a later ask is admitted rather than deferred', async () => {
    const h = harness();
    // No workspace open: a DEFINTE refusal before any side effect, so the slot must be free afterwards.
    h.open = null;
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('refused');
    expect(h.runs.active).toBeNull();
    // A second ask now proceeds past the slot (and is refused for its own reason, not the slot's).
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(second.kind === 'refused' && second.code).not.toBe('inbound.run-active');
  });
});

describe('REQ-MCP-126 (BLOCKER 2): a lost reply does NOT free the slot', () => {
  it('a start whose host ask never answers keeps the slot, so a second external start is refused', async () => {
    const h = harness();
    // The run host does not answer `session.start` within the coordinator's bound: its `ProcessLink.request` would reject
    // at the bound (its own credential lease can take up to 45 s), so the stand-in rejects the same way.
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply to session.start within 10000 ms')) : { kind: 'ack' });
    const c = coordinator(h);
    const first = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(first.kind).toBe('refused');
    expect(first.kind === 'refused' && first.code).toBe('inbound.start-unconfirmed');
    // The slot is still held: the run may still be being born in the run host.
    const second = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(second.kind).toBe('refused');
    expect(second.kind === 'refused' && second.code).toBe('inbound.run-active');
  });

  it('a run that starts LATE (after the reply was lost) is freed only by ITS OWN end, and by no other session’s', () => {
    // Driven on the slot directly: the held attempt is tied to the session id its `take` named, so only that session's
    // end frees it. (The coordinator mints that id on its own; the tie is the unit under test here.)
    const runs = new InboundSurfaceRuns();
    expect(runs.take('S-HELD')).toEqual({ ok: true });
    // Another session ends: not this attempt's, so the slot stays taken.
    runs.ended('S-SOMEBODY-ELSE');
    expect(runs.take('S-2')).toEqual({ ok: false });
    // The attempt's OWN session ends: now the slot is free.
    runs.ended('S-HELD');
    expect(runs.take('S-3')).toEqual({ ok: true });
  });

  it('the run host’s exit releases the slot (MAJOR: a crash must not lock the surface for good)', async () => {
    const h = harness();
    h.hostStart = async (req) => (req.kind === 'session.start' ? Promise.reject(new Error('no reply to session.start within 10000 ms')) : { kind: 'ack' });
    const c = coordinator(h);
    await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(await c.ask({ kind: 'inbound.startRun', prompt: 'p' })).toMatchObject({ kind: 'refused', code: 'inbound.run-active' });
    h.runs.abandonAll();
    // Now a fresh start is admitted.
    h.hostStart = async () => ({ kind: 'session.started', sessionId: 'S-AFTER' });
    const after = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(after.kind).toBe('inbound.runStarted');
  });
});

describe('REQ-MCP-130: only a handle this surface minted is answered', () => {
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

  it('a forgotten handle (past the history cap) is no longer answered — the slot’s own handle stays', () => {
    const runs = new InboundSurfaceRuns();
    const first = `inr_${'0'.repeat(32)}`;
    runs.take('S-1');
    runs.committed({ handle: first, sessionId: 'S-1', workspaceId: 'ws-1' });
    for (let i = 0; i < 80; i += 1) {
      const handle = `inr_${i.toString(16).padStart(32, '0')}`;
      runs.release();
      runs.take(`S-${i}`);
      runs.committed({ handle, sessionId: `S-${i}`, workspaceId: 'ws-1' });
    }
    expect(runs.byHandle(first)).toBeUndefined();
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
    // REQ-MCP-124: no authority field rides along.
    for (const field of ['sandboxMode', 'boardPermissions', 'effectiveRoot', 'worktree', 'runType', 'initialTodo']) {
      expect(start, field).not.toHaveProperty(field);
    }
  });

  it('a workspace that changed before admission refuses the start (the shared fence), and the slot is released', async () => {
    const h = harness();
    h.open = { workspaceId: 'ws-1', workspace: '/work' };
    // The fence re-reads the open workspace immediately before the host ask; make it a DIFFERENT one.
    const c = createInboundCoordinator({
      start: ({ log: () => undefined, runHost: { request: async () => ({ kind: 'runs.count', workspaceId: 'ws-1', count: 0 }) }, services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined }, notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined }, raiseNotice: () => undefined, recoveryFor: () => [], openWorkspaceRead: async () => ({ workspaceId: 'ws-2', workspace: '/other' }), confinementNotice: () => ({ severity: 'error' as const, title: 't', message: 'm', detail: 'd', persistent: true as const, action: { label: 'l', action: { kind: 'open-view' as const, view: 'workspace' } } }) } as unknown as SessionStartDeps),
      runs: h.runs,
      openWorkspace: async () => h.open,
      readStatus: async () => null,
    });
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind === 'refused' && out.code).toBe('session.workspace-changed');
    expect(h.runs.active).toBeNull();
  });
});
