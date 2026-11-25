import { describe, expect, it } from 'vitest';
import { INBOUND_HOST_CREDENTIAL_LEASE_MS, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { startSessionRun, checkStartInput, SESSION_START_SANDBOX_MODES, type SessionStartDeps } from './session-start.js';

/**
 * REQ-MCP-124 (ADR-0067): THE SHARED FENCE. The desktop `session.start` and the MCP surface's `rotaris_start_run` both
 * call `startSessionRun`, so the workspace binding, the workspace fence and the run-host admission a desktop start meets
 * are the ones an external caller meets. Three things are proved here:
 *
 * 1. **The same admission path**: an inbound-shaped input (a prompt, the open workspace, no authority field) reaches the
 *    run host as an ordinary `session.start` with the open workspace's id — the same request shape a desktop start sends.
 * 2. **The workspace fence**: a workspace switched between the caller's validation and admission is REFUSED, and nothing
 *    is asked of the host — the advisor's "stale workspace state" case.
 * 3. **An inconsistent internal request is refused before anything is created**: the run host's own invariants, checked
 *    in the coordinator, so a hand-built request cannot reach the host as a stronger run.
 */

interface H {
  readonly deps: SessionStartDeps;
  readonly hostAsked: RunHostRequest[];
  readonly svcAsked: WorkspaceServiceRequest[];
  readonly begins: string[];
  readonly ends: string[];
  /** What the fence reads: mutable, so a case can change the open workspace. */
  readonly open: { current: { workspaceId: string; workspace: string } | null };
}

const WORKSPACE = '/work';

function harness(hostAnswer?: (req: RunHostRequest) => { kind: string; sessionId?: string; code?: string; headline?: string; detail?: string }): H {
  const hostAsked: RunHostRequest[] = [];
  const svcAsked: WorkspaceServiceRequest[] = [];
  const begins: string[] = [];
  const ends: string[] = [];
  const open: H['open'] = { current: { workspaceId: 'ws-1', workspace: WORKSPACE } };
  const host = {
    request: async (req: RunHostRequest) => {
      hostAsked.push(req);
      if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
      const answer = hostAnswer?.(req) ?? { kind: 'session.started', sessionId: 'S-STARTED' };
      return answer;
    },
  };
  const deps = {
    log: () => undefined,
    runHost: host,
    services: new Map([[canonicalPath(WORKSPACE), { link: { request: async (req: WorkspaceServiceRequest) => {
      svcAsked.push(req);
      if (req.kind === 'config.read') return { kind: 'config.snapshot', snapshot: { workspaceRoot: WORKSPACE, loadOk: true, fatal: null, worktreeStorageSubpath: 'worktrees' } };
      if (req.kind === 'worktree.create') return { kind: 'worktree.created', path: '/work/wt', branch: 'b', baseBranch: 'main', baseRevision: 'abc' };
      if (req.kind === 'worktree.checkAttach') return { kind: 'worktree.attachable', path: '/work/wt', branch: 'b', baseBranch: 'main', baseRevision: 'abc' };
      if (req.kind === 'worktree.remove') return { kind: 'worktree.removed', path: '/work/wt' };
      return { kind: 'ack' };
    } } }]]),
    mainWindows: {
      takeMintedSession: () => null,
      beginStart: (_wcId: number, sessionId: string) => { begins.push(sessionId); },
      endStart: (_wcId: number, sessionId: string) => { ends.push(sessionId); },
    },
    notices: { report: async () => ({ id: 1, shown: true }), clearForRunStart: async () => undefined },
    raiseNotice: () => undefined,
    recoveryFor: () => [],
    openWorkspaceRead: async () => open.current,
    confinementNotice: (r: { headline: string; detail?: string | undefined }) => ({ severity: 'error' as const, title: r.headline, message: r.detail ?? r.headline, detail: r.detail ?? r.headline, persistent: true as const, action: { label: 'Open Workspace', action: { kind: 'open-view' as const, view: 'workspace' } } }),
  } as unknown as SessionStartDeps;
  return { deps, hostAsked, svcAsked, begins, ends, open };
}

describe('REQ-MCP-124: the inbound start is the ordinary start, through the same coordinator', () => {
  it('an inbound-shaped input (a prompt, the open workspace) reaches the host as an ordinary session.start', async () => {
    const h = harness();
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'Do the thing.' });
    expect(out).toEqual({ ok: true, value: { sessionId: 'S-STARTED' } });
    const start = h.hostAsked.find((r) => r.kind === 'session.start');
    expect(start).toBeDefined();
    // The workspace is the OPEN one, the prompt is the caller's, and NO authority field rides along.
    expect(start).toMatchObject({ kind: 'session.start', workspaceId: 'ws-1', prompt: 'Do the thing.' });
    expect(start).not.toHaveProperty('sandboxMode');
    expect(start).not.toHaveProperty('boardPermissions');
    expect(start).not.toHaveProperty('effectiveRoot');
    expect(start).not.toHaveProperty('worktree');
    expect(start).not.toHaveProperty('runType');
    expect(start).not.toHaveProperty('initialTodo');
  });

  it('a desktop start may set a sandbox mode; the coordinator passes it through as a desktop choice', async () => {
    const h = harness();
    await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', sandboxMode: 'read-only' });
    const start = h.hostAsked.find((r) => r.kind === 'session.start');
    expect(start).toMatchObject({ sandboxMode: 'read-only' });
  });
});

describe('REQ-MCP-124: the shared fence re-reads the open workspace before admission', () => {
  it('a workspace SWITCHED between the request and admission refuses the start, and nothing is asked of the host', async () => {
    const h = harness();
    h.open.current = { workspaceId: 'ws-2', workspace: '/other' };
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p' });
    expect(out).toEqual({ ok: false, code: 'session.workspace-changed', headline: expect.stringContaining('changed') });
    expect(h.hostAsked.some((r) => r.kind === 'session.start')).toBe(false);
  });

  it('a workspace that is no longer open at all is refused the same way', async () => {
    const h = harness();
    h.open.current = null;
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p' });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.code).toBe('session.workspace-changed');
    expect(h.hostAsked.some((r) => r.kind === 'session.start')).toBe(false);
  });

  it('the same workspace open at admission passes the fence and reaches the host', async () => {
    const h = harness();
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p' });
    expect(out.ok).toBe(true);
    expect(h.hostAsked.some((r) => r.kind === 'session.start')).toBe(true);
  });
});

describe('REQ-MCP-124: an inconsistent internal request is refused before anything is created', () => {
  it('names the invariants the run host’s own schema states', () => {
    expect(checkStartInput({ workspaceId: '', workspaceRoot: WORKSPACE, prompt: 'p' })).toMatchObject({ code: 'session.workspace-none' });
    expect(checkStartInput({ workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: '   ' })).toMatchObject({ code: 'session.empty' });
    expect(checkStartInput({ workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', sandboxMode: 'unconfined' as never })).toMatchObject({ code: 'session.sandbox-mode' });
    expect(checkStartInput({ workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p' })).toBeNull();
  });

  it('a request with no prompt and no attachment is refused, and no host ask is made', async () => {
    const h = harness();
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: '   ' });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.code).toBe('session.empty');
    expect(h.hostAsked).toEqual([]);
  });

  it('the closed sandbox set is what the product offers', () => {
    expect([...SESSION_START_SANDBOX_MODES]).toEqual(['off', 'workspace-write', 'read-only']);
  });
});

describe('REQ-GIT-022/023: the workspace binding is made before the host is asked', () => {
  it('an isolated start creates the worktree, binds it, and sends effectiveRoot + worktree to the host', async () => {
    const h = harness();
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    expect(out.ok).toBe(true);
    const create = h.svcAsked.find((r) => r.kind === 'worktree.create');
    expect(create).toBeDefined();
    const start = h.hostAsked.find((r) => r.kind === 'session.start');
    expect(start).toMatchObject({ effectiveRoot: '/work/wt', worktree: expect.objectContaining({ worktree_path: '/work/wt', branch: 'b' }) });
  });

  it('REQ-MCP-124 (MAJOR, 2026-11-25): a NO-REPLY does NOT remove the worktree — the host may still start the run with it', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'run-host.unreachable', headline: 'The run host did not answer', detail: 'no reply' }));
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.code).toBe('run-host.unreachable');
    // The tree the start created is KEPT: the host may yet start the run with exactly this working directory.
    await new Promise((r) => setImmediate(r));
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(false);
  });

  it('REQ-MCP-124 (MAJOR D, REWORK 6): a `request.failed` (raised AFTER dispatch, or anywhere) KEEPS the worktree', async () => {
    // `request.failed` is the run host's own dispatch error. It carries no assurance the throw sat before the dispatch, so
    // the tree is KEPT: the run that may already exist must not have its working directory deleted under it.
    const h = harness(() => ({ kind: 'refused', code: 'request.failed', headline: 'the host threw' }));
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.code).toBe('request.failed');
    await new Promise((r) => setImmediate(r));
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(false);
  });

  it('REQ-MCP-124 (MAJOR D, REWORK 6): the no-reply follow-up reads over the WHOLE host worst case, not after one listing', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'run-host.unreachable', headline: 'The run host did not answer' }));
    const scheduled: { fn: () => void; afterMs: number }[] = [];
    const deps = {
      ...h.deps,
      scheduleRecheck: (fn: () => void, afterMs: number) => { scheduled.push({ fn, afterMs }); },
    } as unknown as SessionStartDeps;
    const out = await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' }, hostStartBoundMs: 60_000 });
    expect(out.ok).toBe(false);
    expect(scheduled).toHaveLength(1);
    // The recheck waits past the bound PLUS the host's credential lease — the last moment the host could still be starting.
    expect(scheduled[0]!.afterMs).toBe(60_000 + INBOUND_HOST_CREDENTIAL_LEASE_MS);
  });

  it('REQ-MCP-124: a DEFINITE refusal DOES remove the auto-created worktree (nothing came to exist)', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'session.no-model', headline: 'No model is configured' }));
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    expect(out.ok).toBe(false);
    // The worktree is taken away again, since the host answered that no run exists.
    await new Promise((r) => setImmediate(r));
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(true);
  });

  it('REQ-MCP-124 (Minor, 2026-11-25): a start the host refused only AFTER its bound has its session-created worktree removed', async () => {
    // The follow-up reads `session.list`; with an EMPTY listing (the session never appeared) the tree is removed.
    const h = harness(() => ({ kind: 'refused', code: 'run-host.unreachable', headline: 'The run host did not answer', detail: 'no reply' }));
    const rechecks: (() => void)[] = [];
    const deps = {
      ...h.deps,
      scheduleRecheck: (fn: () => void) => { rechecks.push(fn); },
      runHost: { request: async (req: RunHostRequest) => {
        h.hostAsked.push(req);
        if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
        if (req.kind === 'session.list') return { kind: 'session.list', sessions: [] };
        return { kind: 'refused', code: 'run-host.unreachable', headline: 'x' };
      } },
    } as unknown as SessionStartDeps;
    const out = await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    expect(out.ok).toBe(false);
    // Nothing is removed at once (the host may still start the run).
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(false);
    expect(rechecks).toHaveLength(1);
    rechecks[0]!();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(true);
  });

  it('REQ-MCP-124 (Minor, 2026-11-25): the worktree is KEPT when the session appears after the no-reply', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'run-host.unreachable', headline: 'The run host did not answer' }));
    const rechecks: (() => void)[] = [];
    // The listing carries the session that was ASKED to start (its id comes from the `session.start` request).
    const deps = {
      ...h.deps,
      scheduleRecheck: (fn: () => void) => { rechecks.push(fn); },
      runHost: { request: async (req: RunHostRequest) => {
        h.hostAsked.push(req);
        if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
        if (req.kind === 'session.start') return { kind: 'refused', code: 'run-host.unreachable', headline: 'x' };
        if (req.kind === 'session.list') {
          const started = h.hostAsked.find((r) => r.kind === 'session.start') as { sessionId?: string } | undefined;
          return { kind: 'session.list', sessions: [{ sessionId: started?.sessionId ?? 'none' }] };
        }
        return { kind: 'refused', code: 'run-host.unreachable', headline: 'x' };
      } },
    } as unknown as SessionStartDeps;
    await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', isolation: { branch: 'rotaris/x' } });
    rechecks[0]!();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
    expect(h.svcAsked.some((r) => r.kind === 'worktree.remove')).toBe(false);
  });

  it('REQ-MCP-124 (BLOCKER B, 2026-11-25): the inbound path sets its OWN start bound, above the desktop default', async () => {
    const h = harness();
    const bounds: number[] = [];
    const deps = { ...h.deps, runHost: { request: async (req: RunHostRequest, bound: number) => { if (req.kind === 'session.start') bounds.push(bound); return req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'session.started', sessionId: 'S-STARTED' }; } } } as unknown as SessionStartDeps;
    await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p' });
    await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', hostStartBoundMs: 60_000 });
    expect(bounds).toEqual([10_000, 60_000]);
  });
});

describe('REQ-MCP-126 (BLOCKER, REWORK 5): the confirmation is reported BEFORE the post-work', () => {
  it('`onStarted` runs before `clearForRunStart`/`configFatal.loaded`, so a throw there cannot erase the start', async () => {
    const h = harness();
    const order: string[] = [];
    const deps = {
      ...h.deps,
      notices: {
        report: async () => ({ id: 1, shown: true }),
        clearForRunStart: async () => { order.push('post-work'); throw new Error('the notice cleanup failed'); },
      },
      configFatal: { loaded: async () => { order.push('config-fatal'); } },
    } as unknown as SessionStartDeps;
    // The producer confirms the start first; the post-work then throws. The caller has the confirmation already.
    const out = await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', onStarted: (sid) => { order.push(`started:${sid}`); } });
    expect(order[0]).toBe('started:S-STARTED');
    // The failure is logged, NOT travelled out: the run exists, so the start is still `ok` and the coordinator holds.
    expect(out).toEqual({ ok: true, value: { sessionId: 'S-STARTED' } });
    expect(order).toContain('post-work');
  });

  it('a start that never reached `session.started` reports no confirmation', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'session.refused', headline: 'no run' }));
    const confirms: string[] = [];
    const out = await startSessionRun(h.deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', onStarted: (sid) => { confirms.push(sid); } });
    expect(out.ok).toBe(false);
    expect(confirms).toEqual([]);
  });

  it('MAJOR 1: the LATE-reply sink is handed to the link (a reply after the bound is not lost)', async () => {
    const h = harness();
    const sinks: ((r: unknown) => void)[] = [];
    const deps = {
      ...h.deps,
      runHost: {
        request: async (req: RunHostRequest, _bound: number, late?: (r: unknown) => void) => {
          if (req.kind === 'runs.active') return { kind: 'runs.count', workspaceId: 'ws-1', count: 0 };
          if (late !== undefined) sinks.push(late);
          throw new Error('no reply to session.start within 60000 ms');
        },
      },
    } as unknown as SessionStartDeps;
    await startSessionRun(deps, { workspaceId: 'ws-1', workspaceRoot: WORKSPACE, prompt: 'p', onLateOutcome: (r) => { sinks.push(() => undefined); void r; } });
    // The sink the caller named was passed down to the host ask, so the link can hand a late reply over.
    expect(sinks.length).toBe(1);
  });
});
