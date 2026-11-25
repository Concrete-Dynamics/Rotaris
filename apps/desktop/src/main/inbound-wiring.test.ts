import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { nodeClocks, canonicalPath } from '@rotaris/platform';
import { type InboundAskHandler, type InboundListenerAsk, type InboundListenerReply, type InboundStartRunAnswer, type InboundRunStatusAnswer, type ProcessEvent, type ProcessReply, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { InboundListenerLink, portOfChild } from './inbound-exposure.js';
import { createInboundCoordinator, InboundSurfaceRuns } from './inbound-runs.js';
import { createInboundStatusReader } from './inbound-status.js';
import type { SessionStartDeps } from './session-start.js';
import { createInboundHost } from '../inbound-listener/host.js';
import { InboundToken } from '../inbound-listener/guards.js';
import { listenerAsk, readAnswerEnvelope, readListenerEnvelope } from '../inbound-listener/protocol.js';
import type { InboundListener } from '../inbound-listener/transport.js';

/**
 * BLOCKER 1 of the review (2026-11-25): THE PRODUCTION IPC, driven for real. The previous tests answered the two tools
 * through `callInboundTool`/`createInboundHost` with a stand-in, so they never crossed the main↔listener boundary and the
 * two defects there went unseen:
 *
 * 1. main's adapter read `e.data` off the child's message where Electron hands the payload directly (`portOfChild`,
 *    `apps/desktop/src/main/index.ts` does `child.on('message', fn)`), so every message main received was `undefined`;
 * 2. main read the listener's ask through an ad-hoc `{ask, answer}` cast where the listener sends `{ask, request}`
 *    (`InboundAskEnvelopeSchema`), so a `rotaris_start_run` ask was dropped in silence and never reached the coordinator.
 *
 * This file wires the TWO REAL ENDS together — `InboundListenerLink` (main) on a fake `UtilityProcess`, and the listener's
 * own message pump (as `inbound-listener/index.ts` builds it) on a fake `process.parentPort` — and drives a call as the
 * MCP surface would: the surface asks, the ask crosses the boundary, the coordinator starts the run, the answer comes back.
 */

/** Electron's parent-side `UtilityProcess`: `on('message')` hands the listener the PAYLOAD directly. */
class FakeUtilityProcess extends EventEmitter {
  postMessage(message: unknown): void {
    this.emit('child-to-parent', message);
  }
}

/** Electron's child-side `process.parentPort`: `on('message')` hands the listener `{ data }`. */
class FakeParentPort extends EventEmitter {
  postMessage(message: unknown): void {
    this.emit('parent-to-child', message);
  }
}

/** Both ends of one channel, wired as Electron wires them (payload one way, `{ data }` the other). */
function wire(): { readonly child: FakeUtilityProcess; readonly parent: FakeParentPort } {
  const child = new FakeUtilityProcess();
  const parent = new FakeParentPort();
  child.on('child-to-parent', (message: unknown) => { parent.emit('message', { data: message }); });
  parent.on('parent-to-child', (message: unknown) => { child.emit('message', message); });
  return { child, parent };
}

/** A stand-in loopback socket: bind answers a port, unbind clears it (the socket itself is not what this file measures). */
function standInSocket(): InboundListener {
  let bound: { addresses: readonly string[]; port: number } | null = null;
  return {
    binding: () => bound,
    bind: async () => { bound = { addresses: ['127.0.0.1'], port: 51234 }; return bound; },
    unbind: async () => { bound = null; },
  };
}

/** The start coordinator's deps as `inbound-runs.test.ts` builds them: an ordinary start that answers `session.started`. */
function startDeps(): { readonly deps: SessionStartDeps; readonly hostAsked: RunHostRequest[]; readonly open: { current: { workspaceId: string; workspace: string } | null } } {
  const hostAsked: RunHostRequest[] = [];
  const open = { current: { workspaceId: 'ws-1', workspace: '/work' } };
  const deps = {
    log: () => undefined,
    runHost: { request: async (req: RunHostRequest) => { hostAsked.push(req); return req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'session.started', sessionId: 'S-WIRED' }; } },
    services: new Map([[canonicalPath('/work'), { link: { request: async (_req: WorkspaceServiceRequest) => ({ kind: 'ack' }) } }]]),
    mainWindows: { takeMintedSession: () => null, beginStart: () => undefined, endStart: () => undefined },
    notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined },
    raiseNotice: () => undefined,
    recoveryFor: () => [],
    openWorkspaceRead: async () => open.current,
    confinementNotice: (r: { headline: string }) => ({ severity: 'error' as const, title: r.headline, message: r.headline, detail: r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  return { deps, hostAsked, open };
}

/** The two ends wired: main's `InboundListenerLink` and the listener's own pump, with a real coordinator behind main. */
function wired(): {
  readonly link: InboundListenerLink;
  readonly host: ReturnType<typeof createInboundHost>;
  readonly runs: InboundSurfaceRuns;
  readonly hostAsked: RunHostRequest[];
  readonly log: string[];
  /** Drive the run host's terminal event, as `index.ts` wires `runHost.onEvent`. */
  readonly emitRunResult: (sessionId: string, stopReason: string) => void;
  /** What `session.list` answers, keyed by session id. */
  readonly listings: Map<string, { status: string; awaitingInput: boolean }>;
} {
  const { child, parent } = wire();
  const log: string[] = [];
  const { deps, hostAsked, open } = startDeps();
  const runs = new InboundSurfaceRuns();
  const listings = new Map<string, { status: string; awaitingInput: boolean }>();
  const eventListeners = new Set<(e: ProcessEvent) => void>();
  // The REAL status reader of main (`inbound-status.ts`): `session.list` for the state, `run.result` for the stop reason.
  const status = createInboundStatusReader({
    request: async (req: RunHostRequest): Promise<ProcessReply> => (req.kind === 'session.list'
      ? { kind: 'session.list', sessions: [...listings.entries()].map(([sessionId, row]) => ({ sessionId, label: '', status: row.status, branch: '', relativeTime: '', detail: '', awaitingInput: row.awaitingInput, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null })) }
      : { kind: 'ack' }),
    onEvent: (fn) => { eventListeners.add(fn); return () => eventListeners.delete(fn); },
    log: (m) => log.push(m),
  });
  const coordinator = createInboundCoordinator({
    start: deps,
    runs,
    openWorkspace: async () => open.current,
    readStatus: (workspaceId, sessionId) => status.readStatus(workspaceId, sessionId),
  });
  // As `index.ts` wires it: the run's end releases the slot.
  eventListeners.add((e) => { if (e.kind === 'run.result') runs.ended(e.sessionId); });

  const link = new InboundListenerLink(portOfChild(child as never), nodeClocks().timers, (m) => log.push(m));
  link.onAsk(coordinator.ask);

  // The listener's own pump, exactly as `inbound-listener/index.ts` builds it: an ask is posted as `{ ask, request }`,
  // and the answer arrives as `{ ask, answer }`.
  const token = new InboundToken();
  const pending = new Map<number, (a: InboundStartRunAnswer | InboundRunStatusAnswer) => void>();
  let nextAsk = 1;
  const mainAsk: InboundAskHandler = (request: InboundListenerAsk) => {
    const n = nextAsk++;
    return new Promise((resolve) => { pending.set(n, resolve); parent.postMessage(listenerAsk(n, request)); });
  };
  const host = createInboundHost({ token, log: () => undefined, listener: standInSocket(), mainAsk });
  parent.on('message', (event: { data: unknown }) => {
    const answer = readAnswerEnvelope(event.data);
    if (answer !== null) { const p = pending.get(answer.ask); if (p) { pending.delete(answer.ask); p(answer.answer); } return; }
    const envelope = readListenerEnvelope(event.data);
    if (envelope !== null) void host.apply(envelope.request).then((reply: InboundListenerReply) => parent.postMessage({ id: envelope.id, reply }));
  });

  return {
    link, host, runs, hostAsked, log, listings,
    emitRunResult: (sessionId, stopReason) => { for (const l of eventListeners) l({ kind: 'run.result', sessionId, result: { status: 'completed', session_id: sessionId, stop_reason: stopReason, summary: '', iterations_completed: 1, tokens: { input: 0, output: 0, total: 0 }, cost: { total: '0' }, error: null, execution_status: 'completed', severity: 'information' } }); },
  };
}

/** Let the port's synchronous emit chain (and its microtasks) settle. */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

describe('REQ-MCP-120/123/124/126/127: the real main↔listener channel carries a tool call end to end', () => {
  it('enable crosses the boundary (main’s request → the listener → the port it chose)', async () => {
    const w = wired();
    const reply = await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    expect(reply).toEqual({ kind: 'inbound.state', state: { listening: true, port: 51234 } });
    await settle();
  });

  it('a rotaris_start_run ASK crosses the boundary into the coordinator and its answer comes BACK (the whole point of BLOCKER 1)', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    // This is what the MCP surface's `callInboundTool('rotaris_start_run', …)` reduces a call to; the ask leaves the
    // listener as `{ ask, request }` and must be read by main (not dropped) and answered as `{ ask, answer }`.
    const answer = await w.host.ask({ kind: 'inbound.startRun', prompt: 'Do the wired thing.' });
    expect(answer.kind).toBe('inbound.runStarted');
    expect(answer.kind === 'inbound.runStarted' && answer.sessionId).toBe('S-WIRED');
    // The ask really reached the ONE main-side coordinator: the ordinary `session.start` was asked of the run host.
    expect(w.hostAsked.some((r) => r.kind === 'session.start')).toBe(true);
    // And the slot is taken by the run that was actually started.
    expect(w.runs.active?.sessionId).toBe('S-WIRED');
  });

  it('a rotaris_run_status ASK crosses the boundary too, and a second start is refused with the stated reason', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'first' });
    expect(started.kind).toBe('inbound.runStarted');
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    w.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const status = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(status.kind).toBe('inbound.runStatus');
    // REQ-MCP-126: the slot is held across the boundary, so the second ask is refused, never queued.
    const second = await w.host.ask({ kind: 'inbound.startRun', prompt: 'second' });
    expect(second.kind).toBe('refused');
    expect(second.kind === 'refused' && second.code).toBe('inbound.run-active');
  });

  it('a message main cannot read does not break the port: the next valid request still crosses', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    // An unreadable message (neither an ask, a reply nor an event): main must drop it, not throw out of the port handler.
    w.link.onAsk(async () => ({ kind: 'refused', code: 'x', headline: 'x' }));
    // The channel still works after it.
    const reply = await w.link.request({ kind: 'inbound.state' }, 5_000);
    expect(reply).toEqual({ kind: 'inbound.state', state: { listening: true, port: 51234 } });
  });
});

describe('REQ-MCP-123 (BLOCKER 3): the stop reason reaches the caller through the REAL status read', () => {
  it('a run that ends with a known stop reason answers that reason, not null', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(started.kind).toBe('inbound.runStarted');
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run host's own terminal event: the product's own stop reason (REQ-MONITOR-301).
    w.listings.set(sessionId, { status: 'completed', awaitingInput: false });
    w.emitRunResult(sessionId, 'tasks_complete');
    const out = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    // REQ-MCP-125: the caller may observe the wait; the listing's own fact rides along.
    w.listings.set(sessionId, { status: 'waiting', awaitingInput: true });
    w.emitRunResult(sessionId, 'tasks_complete');
    const waiting = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(waiting.kind === 'inbound.runStatus' && waiting.status.awaitingInput).toBe(true);
  });
});
