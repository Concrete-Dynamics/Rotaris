import { describe, expect, it } from 'vitest';
import type { RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
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
});
