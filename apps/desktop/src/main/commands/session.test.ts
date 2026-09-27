import { describe, expect, it } from 'vitest';
import type { ProcessReply, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { sessionCommands } from './session.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * R0-2 (`the-start-session-dialog-accepts-and-creates-nothing.md`): the isolated start met a
 * rejecting link as a throw out of the command — an IPC rejection the renderer cannot show — so
 * the composer sat wedged, emptied and silent. ADR-0019 says nothing throws out of a command;
 * these drive `session.start` with links that reject and prove every one refuses instead.
 */
const WORKSPACE = 'D:/work';

function windowOn(workspaceId: string | null): CommandAt {
  return {
    w: {
      workspaceId,
      workspace: WORKSPACE,
      wcId: 7,
      personaWindows: { destroyAll: () => undefined },
    } as unknown as MainWindowState,
    senderId: 7,
    awaitWorkspace: async () => undefined,
  };
}

interface Harness {
  readonly logs: string[];
  readonly raised: { severity: string; headline: string; detail: string | undefined }[];
  readonly svcAsked: WorkspaceServiceRequest[];
  readonly hostAsked: RunHostRequest[];
  readonly ctx: Pick<CommandContext, 'capturing' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'pauseWindows' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runHost' | 'services'>;
}

function harness(svc: (req: WorkspaceServiceRequest) => Promise<ProcessReply> | ProcessReply, host: (req: RunHostRequest) => Promise<ProcessReply> | ProcessReply): Harness {
  const logs: string[] = [];
  const raised: Harness['raised'] = [];
  const svcAsked: WorkspaceServiceRequest[] = [];
  const hostAsked: RunHostRequest[] = [];
  const ctx = {
    capturing: false,
    dialogs: new Map(),
    log: (m: string) => { logs.push(m); },
    mainWindows: { takeMintedSession: () => 'minted-1' } as unknown as CommandContext['mainWindows'],
    notices: { clearForRunStart: async () => undefined } as unknown as CommandContext['notices'],
    pauseWindows: new Map(),
    raiseNotice: (...args: Parameters<CommandContext['raiseNotice']>) => { raised.push({ severity: args[0], headline: args[1], detail: args[2] }); },
    recoveryFor: () => [],
    relay: {} as CommandContext['relay'],
    runHost: { request: async (req: RunHostRequest) => { hostAsked.push(req); return host(req); } },
    services: new Map([[canonicalPath(WORKSPACE), { link: { request: async (req: WorkspaceServiceRequest) => { svcAsked.push(req); return svc(req); } } }]]) as unknown as CommandContext['services'],
  };
  return { logs, raised, svcAsked, hostAsked, ctx };
}

const created = { kind: 'worktree.created', path: `${WORKSPACE}/.rotaris/worktrees/minted-1`, branch: 'rotaris/session/minted-1', baseBranch: 'main', baseRevision: 'abc' } as const;

describe('session.start, driven without a process behind it', () => {
  it('a rejecting worktree link refuses with the cause instead of throwing (R0-2)', async () => {
    const h = harness(
      () => Promise.reject(new Error('no reply to worktree.create within 120000 ms')),
      () => ({ kind: 'session.started', sessionId: 'minted-1' }),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
    expect(out).toEqual({ ok: false, code: 'session.worktree', headline: expect.stringContaining('could not create or attach'), detail: expect.stringContaining('no reply to worktree.create') });
    // The refusal discipline: a notice, a log line, and nothing created behind them.
    expect(h.raised).toHaveLength(1);
    expect(h.raised[0]?.severity).toBe('error');
    expect(h.logs.some((l) => l.startsWith('run refused before start:'))).toBe(true);
    expect(h.hostAsked).toEqual([]);
  });

  it('an unanswered run host refuses and takes the created worktree away again', async () => {
    const h = harness(
      (req) => (req.kind === 'worktree.remove' ? { kind: 'worktree.removed', path: created.path } : { ...created, kind: 'worktree.created' }),
      () => Promise.reject(new Error('no reply to session.start within 10000 ms')),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
    expect(out).toEqual({ ok: false, code: 'run-host.unreachable', headline: 'The session could not be started', detail: expect.stringContaining('no reply to session.start') });
    expect(h.svcAsked.map((r) => r.kind)).toEqual(['worktree.create', 'worktree.remove']);
    expect(h.raised.some((n) => n.severity === 'error')).toBe(true);
    expect(h.logs.some((l) => l.startsWith('run refused:'))).toBe(true);
  });

  it('the early refusals are logged, not only returned', async () => {
    const noWorkspace = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    expect(await sessionCommands(noWorkspace.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn(null)))
      .toEqual({ ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' });
    expect(noWorkspace.logs).toHaveLength(1);

    const both = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    expect(await sessionCommands(both.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', isolation: { branch: 'b' }, attach: { path: 'p' } }, windowOn('ws-1')))
      .toEqual({ ok: false, code: 'session.worktree-options', headline: expect.any(String) });
    expect(both.logs).toHaveLength(1);
    expect(both.svcAsked).toEqual([]);
  });

  it('the isolated happy path carries the minted id and the binding to the run host', async () => {
    const h = harness(
      () => ({ ...created, kind: 'worktree.created' }),
      () => ({ kind: 'session.started', sessionId: 'minted-1' }),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' }, sandboxMode: 'off' }, windowOn('ws-1'));
    expect(out).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
    expect(h.hostAsked).toHaveLength(1);
    expect(h.hostAsked[0]).toMatchObject({ kind: 'session.start', sessionId: 'minted-1', effectiveRoot: created.path, sandboxMode: 'off' });
    expect((h.hostAsked[0] as { worktree?: { created_by_session?: boolean } }).worktree?.created_by_session).toBe(true);
    expect(h.logs.some((l) => l.includes('bound to'))).toBe(true);
  });
});

describe('session.continue (PD-ORCH-005 clause 6)', () => {
  const continued = { kind: 'session.continued', sessionId: 'S1', resumed: true, messageLimit: null } as const;
  it('relays the decline to the run host, and a plain continue without one', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => continued);
    const commands = sessionCommands(h.ctx);
    expect(await commands['session.continue']({ kind: 'session.continue', sessionId: 'S1', action: 'continue', withoutPaused: true }, windowOn('ws-1'))).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
    expect(await commands['session.continue']({ kind: 'session.continue', sessionId: 'S1', action: 'continue' }, windowOn('ws-1'))).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
    expect(h.hostAsked).toEqual([
      { kind: 'session.continue', sessionId: 'S1', action: 'continue', withoutPaused: true },
      { kind: 'session.continue', sessionId: 'S1', action: 'continue' },
    ]);
  });
});
