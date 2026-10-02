import { describe, expect, it } from 'vitest';
import type { ProcessReply, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { FakeClock } from '@rotaris/kernel';
import { sessionCommands } from './session.js';
import type { ReportInput } from '../notices.js';
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
  /** Notices main reports whole, through the store, rather than through `raiseNotice`'s short form. */
  readonly reported: ReportInput[];
  readonly svcAsked: WorkspaceServiceRequest[];
  readonly hostAsked: RunHostRequest[];
  readonly ctx: Pick<CommandContext, 'capturing' | 'clocks' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'pauseWindows' | 'quitting' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runHost' | 'services'>;
  /** PD-ORCH-005 clause 9: what `quitting()` answers. */
  readonly quit: { now: boolean };
}

function harness(svc: (req: WorkspaceServiceRequest) => Promise<ProcessReply> | ProcessReply, host: (req: RunHostRequest) => Promise<ProcessReply> | ProcessReply): Harness {
  const logs: string[] = [];
  const raised: Harness['raised'] = [];
  const reported: ReportInput[] = [];
  const svcAsked: WorkspaceServiceRequest[] = [];
  const hostAsked: RunHostRequest[] = [];
  const quit = { now: false };
  const ctx = {
    capturing: false,
    clocks: new FakeClock(),
    quitting: () => quit.now,
    dialogs: new Map(),
    log: (m: string) => { logs.push(m); },
    mainWindows: { takeMintedSession: () => 'minted-1' } as unknown as CommandContext['mainWindows'],
    notices: { clearForRunStart: async () => undefined, report: async (input: ReportInput) => { reported.push(input); return { id: reported.length, shown: true }; } } as unknown as CommandContext['notices'],
    pauseWindows: new Map(),
    raiseNotice: (...args: Parameters<CommandContext['raiseNotice']>) => { raised.push({ severity: args[0], headline: args[1], detail: args[2] }); },
    recoveryFor: () => [],
    relay: {} as CommandContext['relay'],
    runHost: { request: async (req: RunHostRequest) => { hostAsked.push(req); return host(req); } },
    services: new Map([[canonicalPath(WORKSPACE), { link: { request: async (req: WorkspaceServiceRequest) => { svcAsked.push(req); return svc(req); } } }]]) as unknown as CommandContext['services'],
  };
  return { logs, raised, reported, svcAsked, hostAsked, ctx, quit };
}

const created = { kind: 'worktree.created', path: `${WORKSPACE}/.rotaris/worktrees/minted-1`, branch: 'rotaris/session/minted-1', baseBranch: 'main', baseRevision: 'abc' } as const;

/*
 * REQ-NOTIFY-060/061 with REQ-SANDBOX-120: the refused confinement mode's notice, for a start, a prompt and a continue.
 * Before the repair of `docs/defects/fixed/a-refused-confinement-start-is-not-reported-as-req-notify-061-says.md` the
 * refusal wording was only the copyable detail, the message was empty, no action was offered, and a prompt's refusal
 * raised no notice at all.
 */
describe('REQ-NOTIFY-061: a sandboxed launch that was refused', () => {
  const WORDING = 'Confinement is unavailable: the bubblewrap launcher is not on PATH. Install bubblewrap (bwrap) and start the run again.';
  const refused = { kind: 'refused', code: 'session.confinement', headline: 'The run was refused before it started', detail: WORDING } as const;
  const host = (req: RunHostRequest): ProcessReply => (req.kind === 'runs.active' ? { kind: 'runs.count', count: 0 } : refused);
  const expected = { severity: 'error', title: 'The run was refused before it started', message: WORDING, detail: WORDING, persistent: true, action: { label: 'Open Workspace', action: { kind: 'open-view', view: 'workspace' } } };

  it('a start: the wording as received in the message and the copyable detail, an action returning to the workspace view, no retry', async () => {
    const h = harness(() => ({ kind: 'ack' }), host);
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Confine this.' }, windowOn('ws-1'));
    expect(out).toMatchObject({ ok: false, code: 'session.confinement' });
    expect(h.reported).toEqual([expected]);
    expect(h.raised).toEqual([]);
  });

  it('a prompt and a continue on an existing session are reported the same way', async () => {
    const h = harness(() => ({ kind: 'ack' }), host);
    const commands = sessionCommands(h.ctx);
    expect(await commands['session.prompt']({ kind: 'session.prompt', sessionId: 'S1', prompt: 'Again.' }, windowOn('ws-1'))).toMatchObject({ ok: false, code: 'session.confinement' });
    expect(await commands['session.continue']({ kind: 'session.continue', sessionId: 'S1', action: 'continue' }, windowOn('ws-1'))).toMatchObject({ ok: false, code: 'session.confinement' });
    expect(h.reported).toEqual([expected, expected]);
    expect(h.raised).toEqual([]);
  });

  it('any other refusal keeps its own notice', async () => {
    const h = harness(() => ({ kind: 'ack' }), (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', count: 0 } : { kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started', detail: 'The configuration could not be loaded.' }));
    await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    expect(h.reported).toEqual([]);
    expect(h.raised).toEqual([{ severity: 'error', headline: 'The run was refused before it started', detail: 'The configuration could not be loaded.' }]);
  });
});

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

describe('PD-CHAT-002 revision 2 and PD-ORCH-005 clause 9: a question the quit closes is withdrawn, never cancelled', () => {
  const cancel = { kind: 'session.control', request: { op: 'cancelQuestions', sessionId: 'S1', args: { requestId: 'Q1' } } } as const;

  it('the dock\'s cancel while the application stays reaches the run host, as REQ-CHAT-101 has it', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'control.result', result: { ok: true } }));
    await sessionCommands(h.ctx)['session.control'](cancel, windowOn('ws-1'));
    expect(h.hostAsked).toEqual([{ kind: 'session.control', request: cancel.request }]);
  });

  it('the dock\'s cancel sent as the application quits is the quit\'s: nothing reaches the run host, whose shutdown withdraws the question', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'control.result', result: { ok: true } }));
    h.quit.now = true;
    expect(await sessionCommands(h.ctx)['session.control'](cancel, windowOn('ws-1'))).toEqual({ ok: true, value: { ok: true } });
    expect(h.hostAsked).toEqual([]);
    expect(h.logs.some((l) => /left for the quit to withdraw/.test(l))).toBe(true);
    // Any other control still goes through while the quit is under way.
    await sessionCommands(h.ctx)['session.control']({ kind: 'session.control', request: { op: 'pause', sessionId: 'S1', args: {} } }, windowOn('ws-1'));
    expect(h.hostAsked.map((r) => (r as { request: { op: string } }).request.op)).toEqual(['pause']);
  });
});

describe("session.subscribe's verification seam: the reply held after the attach (ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS)", () => {
  // The window a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md was found in: the
  // run is drawn active before this reply settles the renderer's send. part-j-proof's steer-early launch widens it.
  const subscribe = { kind: 'session.subscribe', sessionId: 'S1' } as const;
  const withSeam = (capturing: boolean) => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    const clock = new FakeClock();
    const ctx = {
      ...h.ctx, capturing, clocks: clock,
      relay: { subscribe: () => undefined } as unknown as CommandContext['relay'],
      mainWindows: { setFollowedSession: () => undefined } as unknown as CommandContext['mainWindows'],
    };
    return { h, clock, commands: sessionCommands(ctx) };
  };
  const settledWithin = async (p: Promise<unknown>) => { let settled = false; void p.then(() => { settled = true; }); for (let i = 0; i < 10; i += 1) await Promise.resolve(); return settled; };

  it('holds the reply the configured time after the attach, while capturing', async () => {
    process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS'] = '1500';
    try {
      const { h, clock, commands } = withSeam(true);
      const reply = Promise.resolve(commands['session.subscribe'](subscribe, windowOn('ws-1')));
      expect(await settledWithin(reply)).toBe(false);
      expect(h.hostAsked).toEqual([{ kind: 'session.attach', sessionId: 'S1' }]);
      clock.advance(1499);
      expect(await settledWithin(reply)).toBe(false);
      clock.advance(1);
      expect(await reply).toEqual({ ok: true });
      expect(h.logs).toEqual(['capture: session.subscribe reply held 1500 ms', 'capture: session.subscribe reply released']);
    } finally { delete process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS']; }
  });

  it('holds nothing outside a capture, whatever the environment says', async () => {
    process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS'] = '1500';
    try {
      const { h, commands } = withSeam(false);
      expect(await commands['session.subscribe'](subscribe, windowOn('ws-1'))).toEqual({ ok: true });
      expect(h.logs).toEqual([]);
    } finally { delete process.env['ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS']; }
  });
});
