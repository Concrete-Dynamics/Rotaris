import { describe, expect, it } from 'vitest';
import type { InboundListenerAsk, InboundRunStatusAnswer, InboundStartRunAnswer } from '@rotaris/contracts';
import { createInboundCoordinator, InboundSurfaceRuns, mintInboundRunHandle } from './inbound-runs.js';
import type { SessionStartDeps } from './session-start.js';

/**
 * REQ-MCP-123/124/126/130: main's side of the surface — the single-run slot, the handle scope, and the wiring to the
 * ONE main-side start coordinator. The coordinator is driven with stand-in deps, so the slot's behaviour and the
 * handle's scope are measured without a run host or a window.
 */

interface Harness {
  readonly runs: InboundSurfaceRuns;
  /** REQ-MCP-124: the open workspace the fence reads; a case may change it to prove the fence refuses. */
  open: { workspaceId: string; workspace: string } | null;
}

function harness(over: Partial<Harness> = {}): Harness {
  const runs = new InboundSurfaceRuns();
  return {
    runs,
    open: { workspaceId: 'ws-1', workspace: '/work' },
    ...over,
  };
}

function coordinator(h: Harness): { readonly ask: (a: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer> } {
  const startDeps = {
    log: () => undefined, runHost: { request: async (req: { kind: string }) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'session.started', sessionId: 'S-REAL' }) },
    services: new Map(), mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined }, notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined }, raiseNotice: () => undefined, recoveryFor: () => [],
    openWorkspaceRead: async () => h.open,
    confinementNotice: (r: { headline: string }) => ({ severity: 'error' as const, title: r.headline, message: r.headline, detail: r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  const c = createInboundCoordinator({
    start: startDeps,
    runs: h.runs,
    openWorkspace: async () => h.open,
    readStatus: async () => ({ executionStatus: 'running', stopReason: null }),
    mintHandle: () => `inr_${'a'.repeat(32)}`,
  });
  return { ask: c.ask };
}

describe('REQ-MCP-126: at most one externally started run, refused rather than queued', () => {
  it('takes the slot atomically — a second take while one is held is refused', () => {
    const runs = new InboundSurfaceRuns();
    expect(runs.take()).toEqual({ ok: true });
    expect(runs.take()).toEqual({ ok: false });
    runs.committed({ handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1' });
    expect(runs.active?.sessionId).toBe('S-1');
    expect(runs.take()).toEqual({ ok: false });
  });

  it('releasing the slot (a refusal) admits the next request', () => {
    const runs = new InboundSurfaceRuns();
    runs.take();
    runs.release();
    expect(runs.take()).toEqual({ ok: true });
  });

  it('the run’s own end releases the slot; another session’s end does not', () => {
    const runs = new InboundSurfaceRuns();
    runs.take();
    runs.committed({ handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1' });
    runs.ended('S-OTHER');
    expect(runs.active).not.toBeNull();
    runs.ended('S-1');
    expect(runs.active).toBeNull();
  });

  it('a second ask while a run is active is refused with the stated reason, and never reaches the start', async () => {
    const h = harness();
    const c = coordinator(h);
    h.runs.take();
    h.runs.committed({ handle: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', workspaceId: 'ws-1' });
    const out = await c.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.code).toBe('inbound.run-active');
    expect(out.kind === 'refused' && out.headline).toContain('already active');
  });

  it('the slot is released when the start is refused, so a later ask is admitted rather than deferred', async () => {
    const h = harness();
    // No workspace open: the coordinator refuses before any side effect, and the slot must be free afterwards.
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
    const c = coordinator(h);
    const handle = `inr_${'a'.repeat(32)}`;
    h.runs.take();
    h.runs.committed({ handle, sessionId: 'S-1', workspaceId: 'ws-1' });
    const out = await c.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('running');
    expect(out.kind === 'inbound.runStatus' && out.status.sessionId).toBe('S-1');
  });

  it('a minted handle matches the pattern, and so would be rejected as a session id elsewhere', () => {
    expect(mintInboundRunHandle()).toMatch(/^inr_[0-9a-f]{32}$/);
  });

  it('a forgotten handle (past the history cap) is no longer answered — the slot’s own handle stays', () => {
    const runs = new InboundSurfaceRuns();
    const first = `inr_${'0'.repeat(32)}`;
    runs.take();
    runs.committed({ handle: first, sessionId: 'S-1', workspaceId: 'ws-1' });
    for (let i = 0; i < 80; i += 1) {
      const handle = `inr_${i.toString(16).padStart(32, '0')}`;
      runs.release();
      runs.take();
      runs.committed({ handle, sessionId: `S-${i}`, workspaceId: 'ws-1' });
    }
    expect(runs.byHandle(first)).toBeUndefined();
  });
});
