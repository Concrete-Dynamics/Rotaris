import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { nodeClocks, canonicalPath } from '@rotaris/platform';
import { type InboundAskHandler, type InboundListenerAsk, type InboundListenerReply, type InboundStartRunAnswer, type InboundRunStatusAnswer, type ProcessEvent, type ProcessReply, type RunHostRequest, type SessionSnapshot, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { InboundListenerLink, portOfChild } from './inbound-exposure.js';
import { createInboundCoordinator, InboundSurfaceRuns } from './inbound-runs.js';
import { createInboundStatusReader, stoppedSession } from './inbound-status.js';
import type { SessionStartDeps } from './session-start.js';
import { createInboundHost } from '../inbound-listener/host.js';
import { InboundToken } from '../inbound-listener/guards.js';
import { listenerAsk, readAnswerEnvelope, readListenerEnvelope } from '../inbound-listener/protocol.js';
import type { InboundListener } from '../inbound-listener/transport.js';

/**
 * BLOCKER 1 of review 1 (2026-11-25): THE PRODUCTION IPC, driven for real. This file wires the TWO REAL ENDS together —
 * `InboundListenerLink` (main) on a fake `UtilityProcess`, and the listener's own message pump — and drives a call as
 * the MCP surface would: the surface asks, the ask crosses the boundary, the coordinator starts the run, the answer
 * comes back.
 *
 * REWORK 2 (review 2, 2026-11-25). The stop reason is now read from where the product publishes it — the run host's
 * terminal `run.result` AND its `publish.snapshot` (`SessionRecordSchema.stopReason`) — and lives with the handle
 * (BLOCKER D); a desktop cancel at a park (BLOCKER C) is driven through the REAL main-side wiring.
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
    // The run host records the session id the start named and echoes it back, as production does (`dispatch.ts`: `req.sessionId ?? randomUUID()`).
    runHost: { request: async (req: RunHostRequest) => { hostAsked.push(req); return req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'session.started', sessionId: req.kind === 'session.start' ? req.sessionId ?? 'S-WIRED' : 'S-WIRED' }; } },
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

/** A published session snapshot with the two fields the surface reads off it (REQ-MCP-123, BLOCKER C/D). */
function snapshot(sessionId: string, executionStatus: string, stopReason: string | null): SessionSnapshot {
  return {
    v: 1, sessionId, seq: 1,
    session: { id: sessionId, executionStatus, stopReason, workspaceRoot: '/work', pendingApprovals: [], pendingQuestions: [] } as never,
  };
}

/** The two ends wired: main's `InboundListenerLink` and the listener's own pump, with a real coordinator behind main. */
function wired(): {
  readonly link: InboundListenerLink;
  readonly host: ReturnType<typeof createInboundHost>;
  readonly runs: InboundSurfaceRuns;
  readonly hostAsked: RunHostRequest[];
  /** Drive the run host's terminal event, as `index.ts` wires `runHost.onEvent`. */
  readonly emitRunResult: (sessionId: string, stopReason: string) => void;
  /** Drive the run host's `publish.snapshot`, as `index.ts` wires it (BLOCKER C/D). */
  readonly emitSnapshot: (sessionId: string, executionStatus: string, stopReason: string | null) => void;
  /** Post a raw ask on the real channel and read the answer correlated to its number (drives a malformed ask). */
  readonly askRaw: (envelope: unknown, ask: number) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>;
  /** What `session.list` answers, keyed by session id. */
  readonly listings: Map<string, { status: string; awaitingInput: boolean }>;
} {
  const { child, parent } = wire();
  const { deps, hostAsked, open } = startDeps();
  const runs = new InboundSurfaceRuns();
  const listings = new Map<string, { status: string; awaitingInput: boolean }>();
  const eventListeners = new Set<(e: ProcessEvent) => void>();
  // The REAL status reader of main (`inbound-status.ts`): `session.list` for the state.
  const status = createInboundStatusReader({
    request: async (req: RunHostRequest): Promise<ProcessReply> => (req.kind === 'session.list'
      ? { kind: 'session.list', sessions: [...listings.entries()].map(([sessionId, row]) => ({ sessionId, label: '', status: row.status, branch: '', relativeTime: '', detail: '', awaitingInput: row.awaitingInput, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null })) }
      : { kind: 'ack' }),
    log: () => undefined,
  });
  const coordinator = createInboundCoordinator({
    start: deps,
    runs,
    openWorkspaceNow: () => open.current,
    readStatus: (workspaceId, sessionId) => status.readStatus(workspaceId, sessionId),
  });
  // As `index.ts` wires it: the run's end releases the slot and keeps its reason; the snapshot settles a park/cancel.
  eventListeners.add((e) => {
    if (e.kind === 'run.result') runs.ended(e.sessionId, e.result.stop_reason, e.result.execution_status);
    else if (e.kind === 'publish.snapshot') { const o = stoppedSession(e.payload); runs.observe(o.sessionId, o.state); }
  });

  const link = new InboundListenerLink(portOfChild(child as never), nodeClocks().timers, () => undefined);
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
    link, host, runs, hostAsked, listings,
    askRaw: (envelope, ask) => new Promise((resolve) => { pending.set(ask, resolve); parent.postMessage(envelope); }),
    emitRunResult: (sessionId, stopReason) => { for (const l of eventListeners) l({ kind: 'run.result', sessionId, result: { status: 'completed', session_id: sessionId, stop_reason: stopReason, summary: '', iterations_completed: 1, tokens: { input: 0, output: 0, total: 0 }, cost: { total: '0' }, error: null, execution_status: 'completed', severity: 'information' } }); },
    emitSnapshot: (sessionId, executionStatus, stopReason) => { for (const l of eventListeners) l({ kind: 'publish.snapshot', payload: snapshot(sessionId, executionStatus, stopReason) }); },
  };
}

/** Let the port's synchronous emit chain (and its microtasks) settle. */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
/** REWORK 4: the start is answered AT THE RESERVATION and runs behind the answer, so a case that reads the confirmed run must let that background start (through the port and the run host) settle first. */
const settle2 = async (): Promise<void> => { for (let i = 0; i < 60; i += 1) await Promise.resolve(); };

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
    const answer = await w.host.ask({ kind: 'inbound.startRun', prompt: 'Do the wired thing.' });
    expect(answer.kind).toBe('inbound.runStarted');
    await settle2();
    const sessionId = answer.kind === 'inbound.runStarted' ? answer.sessionId : '';
    expect(w.hostAsked.some((r) => r.kind === 'session.start')).toBe(true);
    expect(w.runs.active?.sessionId).toBe(sessionId);
  });

  it('a rotaris_run_status ASK crosses the boundary too, and a second start is refused with the stated reason', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'first' });
    expect(started.kind).toBe('inbound.runStarted');
    await settle2();
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    w.listings.set(sessionId, { status: 'running', awaitingInput: false });
    const status = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(status.kind).toBe('inbound.runStatus');
    const second = await w.host.ask({ kind: 'inbound.startRun', prompt: 'second' });
    expect(second.kind).toBe('refused');
    expect(second.kind === 'refused' && second.code).toBe('inbound.run-active');
  });

  it('a message main cannot read does not break the port: the next valid request still crosses', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    w.link.onAsk(async () => ({ kind: 'refused', code: 'x', headline: 'x' }));
    const reply = await w.link.request({ kind: 'inbound.state' }, 5_000);
    expect(reply).toEqual({ kind: 'inbound.state', state: { listening: true, port: 51234 } });
  });
});

describe('REQ-MCP-123 (BLOCKER D): the stop reason reaches the caller through the REAL status read', () => {
  it('a run that ends with a known stop reason answers that reason, not null', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    w.listings.set(sessionId, { status: 'completed', awaitingInput: false });
    w.emitRunResult(sessionId, 'tasks_complete');
    const out = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
  });

  it('MAJOR (2026-11-25): a LATER desktop continuation of the same session does not change an old handle’s answer', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'p' });
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run ends with a reason and its frozen state.
    w.listings.set(sessionId, { status: 'completed', awaitingInput: false });
    w.emitRunResult(sessionId, 'tasks_complete');
    // A person then CONTINUES the same session at the desktop: the same id is now `running` and waits on a person.
    w.listings.set(sessionId, { status: 'running', awaitingInput: true });
    w.emitSnapshot(sessionId, 'running', null);
    const out = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    // The OLD handle keeps its OWN end state and waiting flag — never the continuation's (today it would report running+true).
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.state).toBe('completed');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('tasks_complete');
    expect(out.kind === 'inbound.runStatus' && out.status.awaitingInput).toBe(false);
  });
});

describe('REQ-MCP-123/126 (BLOCKER C): a desktop cancel at the plan gate settles through the REAL wiring', () => {
  it('the run parks, the user cancels, and the slot frees with the reason — no `run.result` at all', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    const started = await w.host.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(started.kind).toBe('inbound.runStarted');
    const handle = started.kind === 'inbound.runStarted' ? started.run : '';
    const sessionId = started.kind === 'inbound.runStarted' ? started.sessionId : '';
    // The run parks at the plan gate: the product publishes `awaiting_plan_decision` with no reason.
    w.emitSnapshot(sessionId, 'awaiting_plan_decision', null);
    expect(w.runs.active?.sessionId).toBe(sessionId);
    // The user cancels at the desktop: the product publishes `paused` + `user_cancelled`, and NO `run.result`.
    w.listings.set(sessionId, { status: 'paused', awaitingInput: false });
    w.emitSnapshot(sessionId, 'paused', 'user_cancelled');
    // The slot is free, and `rotaris_run_status` names the reason.
    expect(w.runs.active).toBeNull();
    const out = await w.host.ask({ kind: 'inbound.runStatus', run: handle });
    expect(out.kind).toBe('inbound.runStatus');
    expect(out.kind === 'inbound.runStatus' && out.status.stopReason).toBe('user_cancelled');
    // A fresh external start is admitted now.
    const second = await w.host.ask({ kind: 'inbound.startRun', prompt: 'next' });
    expect(second.kind).toBe('inbound.runStarted');
  });
});

describe('REQ-MCP-123/130 (Minor, 2026-11-25): a malformed handle is refused, not dropped', () => {
  it('an ask with a handle of the wrong shape is answered with a refusal rather than timing out', async () => {
    const w = wired();
    await w.link.request({ kind: 'inbound.enable', token: 'tok-wired' }, 5_000);
    await settle();
    // A raw ask the contract does not read (its `run` is not a handle): main must answer with a correlated refusal,
    // never drop it and leave the listener waiting out its own bound (the defect the review named).
    const refusal = await w.askRaw({ ask: 99, request: { kind: 'inbound.runStatus', run: 'not-a-handle' } }, 99);
    expect(refusal.kind).toBe('refused');
    expect(refusal.kind === 'refused' && refusal.code).toBe('inbound.malformed-ask');
  });
});
