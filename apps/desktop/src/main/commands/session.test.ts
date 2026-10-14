import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot, ProcessReply, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
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
  readonly ctx: Pick<CommandContext, 'capturing' | 'clocks' | 'configFatal' | 'dialogs' | 'log' | 'mainWindows' | 'notices' | 'pauseWindows' | 'quitting' | 'raiseNotice' | 'recoveryFor' | 'relay' | 'runFailures' | 'runHost' | 'services' | 'withdrawnByClose'>;
  /** REQ-NOTIFY-030/032: the sessions whose held failure `session.subscribe` released. */
  readonly focused: string[];
  /** PD-ORCH-005 clause 9: what `quitting()` answers. */
  readonly quit: { now: boolean };
  /** REQ-NOTIFY-030/032: `MainWindows.beginStart` / `endStart`, in order, and the host requests already sent at each. */
  readonly starts: { readonly op: 'begin' | 'end'; readonly wcId: number; readonly sessionId: string; readonly hostAskedBefore: number }[];
  /** REQ-NOTIFY-058: the sessions `NoticeStore.clearForRunStart` was called for, in order. */
  readonly cleared: string[];
  /** OQ-279: the workspaces whose clean load a run start reported to the fatal-load notice. */
  readonly loaded: string[];
}

/** The workspace service's resolved view as an isolated start reads it (REQ-GIT-073); only the fields main reads are meaningful. */
function snapshotReply(worktreeStorageSubpath = 'worktrees', fatal: string | null = null): ProcessReply {
  return { kind: 'config.snapshot', snapshot: { workspaceRoot: WORKSPACE, loadOk: fatal === null, fatal, worktreeStorageSubpath } as unknown as ConfigSnapshot };
}
/** A service whose `config.read` answers the default view, every other request going to `rest`. */
const configured = (rest: (req: WorkspaceServiceRequest) => Promise<ProcessReply> | ProcessReply, view: ProcessReply = snapshotReply()) =>
  (req: WorkspaceServiceRequest): Promise<ProcessReply> | ProcessReply => (req.kind === 'config.read' ? view : rest(req));

function harness(svc: (req: WorkspaceServiceRequest) => Promise<ProcessReply> | ProcessReply, host: (req: RunHostRequest) => Promise<ProcessReply> | ProcessReply): Harness {
  const logs: string[] = [];
  const raised: Harness['raised'] = [];
  const reported: ReportInput[] = [];
  const svcAsked: WorkspaceServiceRequest[] = [];
  const hostAsked: RunHostRequest[] = [];
  const quit = { now: false };
  const focused: string[] = [];
  const starts: Harness['starts'] = [];
  const cleared: string[] = [];
  const loaded: string[] = [];
  const ctx = {
    capturing: false,
    configFatal: { observe: async () => undefined, loaded: async (root: string) => { loaded.push(root); } },
    clocks: new FakeClock(),
    quitting: () => quit.now,
    dialogs: new Map(),
    log: (m: string) => { logs.push(m); },
    mainWindows: {
      takeMintedSession: () => 'minted-1',
      setMintedSession: () => undefined,
      beginStart: (wcId: number, sessionId: string) => { starts.push({ op: 'begin', wcId, sessionId, hostAskedBefore: hostAsked.length }); },
      endStart: (wcId: number, sessionId: string) => { starts.push({ op: 'end', wcId, sessionId, hostAskedBefore: hostAsked.length }); },
    } as unknown as CommandContext['mainWindows'],
    notices: { clearForRunStart: async (sid: string) => { cleared.push(sid); }, report: async (input: ReportInput) => { reported.push(input); return { id: reported.length, shown: true }; } } as unknown as CommandContext['notices'],
    pauseWindows: new Map(),
    raiseNotice: (...args: Parameters<CommandContext['raiseNotice']>) => { raised.push({ severity: args[0], headline: args[1], detail: args[2] }); },
    recoveryFor: () => [],
    relay: {} as CommandContext['relay'],
    runFailures: { focused: async (sid: string) => { focused.push(sid); } } as unknown as CommandContext['runFailures'],
    runHost: { request: async (req: RunHostRequest) => { hostAsked.push(req); return host(req); } },
    services: new Map([[canonicalPath(WORKSPACE), { link: { request: async (req: WorkspaceServiceRequest) => { svcAsked.push(req); return svc(req); } } }]]) as unknown as CommandContext['services'],
  };
  return { logs, raised, reported, svcAsked, hostAsked, ctx, quit, focused, starts, cleared, loaded };
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
  const host = (req: RunHostRequest): ProcessReply => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : refused);
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

  /*
   * REQ-NOTIFY-045 with REQ-NOTIFY-061: a retry refused at the confinement gate never reached a run either, so main reports
   * it in the same notice — and offers no retry of the retry. Any other refusal of a retry raises nothing here and comes
   * back with its words for the window to show. Pinned after fin8's verifier found main's `session.retry` untested.
   */
  it('a retry is reported the same way, and its other refusals come back with their words and no notice', async () => {
    const h = harness(() => ({ kind: 'ack' }), host);
    const commands = sessionCommands(h.ctx);
    expect(await commands['session.retry']({ kind: 'session.retry', sessionId: 'S1' }, windowOn('ws-1'))).toEqual({ ok: false, code: 'session.confinement', headline: 'The prompt could not be retried', detail: `The run was refused before it started: ${WORDING}` });
    expect(h.hostAsked).toEqual([{ kind: 'session.retry', sessionId: 'S1' }]);
    expect(h.reported).toEqual([expected]);
    expect(h.raised).toEqual([]);
    expect(h.logs.some((l) => l.startsWith('run refused: The run was refused before it started'))).toBe(true);

    const missing = { kind: 'refused', code: 'session.attachment-unavailable', headline: 'The prompt could not be retried', detail: 'The last prompt was not retried, because its image shot.png could not be read back: it is no longer available.' } as const;
    const other = harness(() => ({ kind: 'ack' }), () => missing);
    expect(await sessionCommands(other.ctx)['session.retry']({ kind: 'session.retry', sessionId: 'S1' }, windowOn('ws-1'))).toEqual({ ok: false, code: 'session.attachment-unavailable', headline: 'The prompt could not be retried', detail: `${missing.headline}: ${missing.detail}` });
    expect(other.reported).toEqual([]);
    expect(other.raised).toEqual([]);

    const taken = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    expect(await sessionCommands(taken.ctx)['session.retry']({ kind: 'session.retry', sessionId: 'S1' }, windowOn('ws-1'))).toEqual({ ok: true });
  });

  // OQ-279: a run starts only on a configuration that loaded, so a start reports the workspace's clean load; a refusal does not.
  it('a run that starts clears the workspace\'s fatal-load notice, and a refused one leaves it (OQ-279)', async () => {
    const started = harness(() => ({ kind: 'ack' }), (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'session.started', sessionId: 'S1' }));
    expect((await sessionCommands(started.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'))).ok).toBe(true);
    expect(started.loaded).toEqual([canonicalPath(WORKSPACE)]);
    const refusedStart = harness(() => ({ kind: 'ack' }), (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started', detail: 'The configuration could not be loaded.' }));
    await sessionCommands(refusedStart.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    expect(refusedStart.loaded).toEqual([]);
  });

  it('any other refusal keeps its own notice', async () => {
    const h = harness(() => ({ kind: 'ack' }), (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : { kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started', detail: 'The configuration could not be loaded.' }));
    await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    expect(h.reported).toEqual([]);
    expect(h.raised).toEqual([{ severity: 'error', headline: 'The run was refused before it started', detail: 'The configuration could not be loaded.' }]);
  });
});

describe('session.start, driven without a process behind it', () => {
  it('a rejecting worktree link refuses with the cause instead of throwing (R0-2)', async () => {
    const h = harness(
      configured(() => Promise.reject(new Error('no reply to worktree.create within 120000 ms'))),
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
      configured((req) => (req.kind === 'worktree.remove' ? { kind: 'worktree.removed', path: created.path } : { ...created, kind: 'worktree.created' })),
      () => Promise.reject(new Error('no reply to session.start within 10000 ms')),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
    expect(out).toEqual({ ok: false, code: 'run-host.unreachable', headline: 'The session could not be started', detail: expect.stringContaining('no reply to session.start') });
    expect(h.svcAsked.map((r) => r.kind)).toEqual(['config.read', 'worktree.create', 'worktree.remove']);
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
      configured(() => ({ ...created, kind: 'worktree.created' })),
      () => ({ kind: 'session.started', sessionId: 'minted-1' }),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' }, sandboxMode: 'off' }, windowOn('ws-1'));
    expect(out).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
    expect(h.hostAsked).toHaveLength(1);
    expect(h.hostAsked[0]).toMatchObject({ kind: 'session.start', sessionId: 'minted-1', effectiveRoot: created.path, sandboxMode: 'off' });
    expect((h.hostAsked[0] as { worktree?: { created_by_session?: boolean } }).worktree?.created_by_session).toBe(true);
    expect(h.logs.some((l) => l.includes('bound to'))).toBe(true);
  });

  /*
   * PD-GIT-001 (OQ-224): the start asks the run host ONE count for the window's workspace — the runs a launch there would
   * share a tree with — and forces the default tree on it. fin28's repair round 1 had it ask the instance's count (the empty
   * id), so a launch in an idle project was forced into a worktree by another project's run; that reading is replaced.
   */
  const SHARED_TREE_HINT = 'Another run is already active, so this session gets its own Git worktree. Two runs sharing one working tree would overwrite each other\'s edits.';
  it("a launch in an idle project while another project's run is active shares its own base tree (PD-GIT-001)", async () => {
    const h = harness(
      configured(() => ({ ...created, kind: 'worktree.created' })),
      (req) => (req.kind === 'runs.active'
        ? { kind: 'runs.count', workspaceId: req.workspaceId, count: req.workspaceId === '' ? 1 : 0 }
        : { kind: 'session.started', sessionId: (req as { sessionId: string }).sessionId }),
    );
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    expect(out.ok).toBe(true);
    expect(h.hostAsked[0]).toEqual({ kind: 'runs.active', workspaceId: 'ws-1', scope: 'sharing' });
    expect(h.svcAsked).toEqual([]);
    expect(h.hostAsked.find((r) => r.kind === 'session.start')).not.toHaveProperty('effectiveRoot');
    expect(h.raised).toEqual([]);
  });

  it('a launch while a run shares this workspace\'s tree is forced into a worktree, and says so in an informational notice naming the branch (PD-GIT-001)', async () => {
    const h = harness(
      configured(() => ({ ...created, kind: 'worktree.created' })),
      (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: req.workspaceId, count: 1 } : { kind: 'session.started', sessionId: 'minted-1' }),
    );
    expect(await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'))).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
    expect(h.hostAsked[0]).toEqual({ kind: 'runs.active', workspaceId: 'ws-1', scope: 'sharing' });
    expect(h.svcAsked).toEqual([{ kind: 'config.read', workspaceRoot: canonicalPath(WORKSPACE) }, expect.objectContaining({ kind: 'worktree.create', branch: 'rotaris/session/minted-1' })]);
    expect(h.hostAsked.find((r) => r.kind === 'session.start')).toMatchObject({ sessionId: 'minted-1', effectiveRoot: created.path });
    expect(h.logs.some((l) => l.includes('force-creating isolated worktree rotaris/session/minted-1'))).toBe(true);
    // Raised after the run start's clear, scoped to the new session, so the clear does not take it away.
    expect(h.cleared).toEqual(['minted-1']);
    expect(h.raised).toEqual([{ severity: 'info', headline: SHARED_TREE_HINT, detail: `This session runs on branch ${created.branch}.` }]);
  });

  it('a count that cannot be read forces the worktree, as a run active does (PD-GIT-001)', async () => {
    const h = harness(
      configured(() => ({ ...created, kind: 'worktree.created' })),
      (req) => (req.kind === 'runs.active' ? Promise.reject(new Error('no reply to runs.active within 5000 ms')) : { kind: 'session.started', sessionId: 'minted-1' }),
    );
    expect(await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'))).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
    expect(h.svcAsked).toEqual([{ kind: 'config.read', workspaceRoot: canonicalPath(WORKSPACE) }, expect.objectContaining({ kind: 'worktree.create', branch: 'rotaris/session/minted-1' })]);
    expect(h.raised).toEqual([expect.objectContaining({ severity: 'info', headline: SHARED_TREE_HINT })]);
  });

  it("session.newId answers the dialog's lock from the same count: required above zero or unreadable, not at zero (PD-GIT-001, REQ-GIT-119)", async () => {
    const ask = async (reply: (req: RunHostRequest) => Promise<ProcessReply> | ProcessReply) => {
      const h = harness(() => ({ kind: 'ack' }), reply);
      const out = await sessionCommands(h.ctx)['session.newId']({ kind: 'session.newId' }, windowOn('ws-1'));
      return { out, asked: h.hostAsked };
    };
    const busy = await ask((req) => ({ kind: 'runs.count', workspaceId: (req as { workspaceId: string }).workspaceId, count: 2 }));
    expect(busy.out).toEqual({ ok: true, value: { sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), isolationRequired: true } });
    expect(busy.asked).toEqual([{ kind: 'runs.active', workspaceId: 'ws-1', scope: 'sharing' }]);
    expect((await ask(() => ({ kind: 'runs.count', workspaceId: 'ws-1', count: 0 }))).out).toEqual({ ok: true, value: { sessionId: expect.any(String), isolationRequired: false } });
    expect((await ask(() => Promise.reject(new Error('gone')))).out).toEqual({ ok: true, value: { sessionId: expect.any(String), isolationRequired: true } });
    expect((await ask(() => ({ kind: 'refused', code: 'x', headline: 'no' }))).out).toEqual({ ok: true, value: { sessionId: expect.any(String), isolationRequired: true } });
  });

  /*
   * REQ-GIT-073 / REQ-CONFIG-068 / REQ-GIT-005: docs/defects/fixed/a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md.
   * Main sent the session target with no subpath, so the service placed every tree under `worktrees/` whatever the file said.
   */
  describe('REQ-GIT-073: the configured worktree_storage_subpath reaches worktree creation', () => {
    const started = (req: RunHostRequest): ProcessReply => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: req.workspaceId, count: 1 } : { kind: 'session.started', sessionId: 'minted-1' });
    it('an isolated start sends the subpath the workspace configuration resolves', async () => {
      const h = harness(configured(() => ({ ...created, kind: 'worktree.created' }), snapshotReply('trees/sessions')), started);
      expect(await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'))).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
      expect(h.svcAsked).toEqual([
        { kind: 'config.read', workspaceRoot: canonicalPath(WORKSPACE) },
        { kind: 'worktree.create', workspaceRoot: canonicalPath(WORKSPACE), branch: 'rotaris/session/minted-1', collisionSafe: true, target: { kind: 'session', sessionId: 'minted-1', subpath: 'trees/sessions' } },
      ]);
    });
    it('a start main forces into a worktree (PD-GIT-001) honours it too, and the default is sent as the default', async () => {
      const forced = harness(configured(() => ({ ...created, kind: 'worktree.created' }), snapshotReply('elsewhere')), started);
      expect((await sessionCommands(forced.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'))).ok).toBe(true);
      expect(forced.svcAsked[1]).toMatchObject({ kind: 'worktree.create', target: { kind: 'session', sessionId: 'minted-1', subpath: 'elsewhere' } });
      const plain = harness(configured(() => ({ ...created, kind: 'worktree.created' })), started);
      expect((await sessionCommands(plain.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'))).ok).toBe(true);
      expect(plain.svcAsked[1]).toMatchObject({ target: { kind: 'session', sessionId: 'minted-1', subpath: 'worktrees' } });
    });
    it('an attach reads no configuration: the tree is the one the user named', async () => {
      const h = harness(() => ({ kind: 'worktree.attachable', path: 'D:/trees/mine', branch: 'feature', baseBranch: 'main', baseRevision: 'abc' }), started);
      expect((await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', attach: { path: 'D:/trees/mine' } }, windowOn('ws-1'))).ok).toBe(true);
      expect(h.svcAsked.map((r) => r.kind)).toEqual(['worktree.checkAttach']);
    });
    it('REQ-GIT-071 / REQ-GIT-138: a configuration that does not load refuses the start before any worktree is created', async () => {
      const report = 'worktree_storage_subpath: "requirements/worktrees" resolves to .rotaris/requirements/worktrees, inside the requirement checkout directory (REQ-GIT-138)';
      const h = harness(configured(() => ({ ...created, kind: 'worktree.created' }), snapshotReply('worktrees', report)), started);
      const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
      expect(out).toEqual({ ok: false, code: 'session.configuration', headline: 'The run was refused before it started', detail: report });
      expect(h.svcAsked.map((r) => r.kind)).toEqual(['config.read']);
      expect(h.hostAsked.filter((r) => r.kind === 'session.start')).toEqual([]);
      expect(h.raised).toEqual([{ severity: 'error', headline: 'The run was refused before it started', detail: report }]);
      expect(h.logs.some((l) => l.startsWith('run refused before start: the configuration did not load'))).toBe(true);
    });
    it('an unanswered configuration read refuses the start as an unanswered worktree request does', async () => {
      const h = harness((req) => (req.kind === 'config.read' ? Promise.reject(new Error('no reply to config.read within 10000 ms')) : { ...created, kind: 'worktree.created' }), started);
      const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
      expect(out).toEqual({ ok: false, code: 'session.worktree', headline: expect.stringContaining('could not create or attach'), detail: expect.stringContaining('no reply to config.read') });
      expect(h.svcAsked.map((r) => r.kind)).toEqual(['config.read']);
      expect(h.hostAsked.filter((r) => r.kind === 'session.start')).toEqual([]);
    });
  });

  it('a launch with no run active anywhere shares the base tree (REQ-GIT-120)', async () => {
    const h = harness(configured(() => ({ ...created, kind: 'worktree.created' })), (req) => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: req.workspaceId, count: 0 } : { kind: 'session.started', sessionId: 'minted-1' }));
    expect(await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'))).toEqual({ ok: true, value: { sessionId: 'minted-1' } });
    expect(h.svcAsked).toEqual([]);
    expect(h.hostAsked.find((r) => r.kind === 'session.start')).not.toHaveProperty('effectiveRoot');
  });
});

/*
 * docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md:
 * main learned that the window follows the session it started only at the renderer's `session.subscribe`, so a run failing
 * before it was read as another session's failure. The window now follows it from the moment the run host is asked.
 */
describe('REQ-NOTIFY-030/032: the window that starts a session follows it from the start', () => {
  const idle = (started: (req: RunHostRequest) => ProcessReply) => (req: RunHostRequest): ProcessReply => (req.kind === 'runs.active' ? { kind: 'runs.count', workspaceId: 'ws-1', count: 0 } : started(req));

  it('a base-tree start carries a main-minted id, marked as the window\'s start before the run host is asked', async () => {
    const h = harness(() => ({ kind: 'ack' }), idle((req) => ({ kind: 'session.started', sessionId: (req as { sessionId: string }).sessionId })));
    const out = await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    const asked = h.hostAsked.find((r) => r.kind === 'session.start') as { sessionId?: string } | undefined;
    expect(asked?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(out).toEqual({ ok: true, value: { sessionId: asked?.sessionId } });
    // Marked before the start was sent (only the runs.active probe had gone), and never unmarked.
    expect(h.starts).toEqual([{ op: 'begin', wcId: 7, sessionId: asked?.sessionId, hostAskedBefore: 1 }]);
  });

  it('an isolated start marks the minted id it binds', async () => {
    const h = harness(configured(() => ({ ...created, kind: 'worktree.created' })), () => ({ kind: 'session.started', sessionId: 'minted-1' }));
    await sessionCommands(h.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
    expect(h.starts).toEqual([{ op: 'begin', wcId: 7, sessionId: 'minted-1', hostAskedBefore: 0 }]);
  });

  it('a refused or unanswered start unmarks it: the window follows no session that never came to exist', async () => {
    const refused = harness(() => ({ kind: 'ack' }), idle(() => ({ kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started' })));
    await sessionCommands(refused.ctx)['session.start']({ kind: 'session.start', prompt: 'Hello.' }, windowOn('ws-1'));
    expect(refused.starts.map((s) => s.op)).toEqual(['begin', 'end']);
    expect(refused.starts[1]?.sessionId).toBe(refused.starts[0]?.sessionId);
    const unanswered = harness(configured(() => ({ ...created, kind: 'worktree.created' })), () => Promise.reject(new Error('no reply to session.start within 10000 ms')));
    await sessionCommands(unanswered.ctx)['session.start']({ kind: 'session.start', prompt: 'Write the notes in a worktree.', isolation: { branch: 'rotaris/session/minted-1' } }, windowOn('ws-1'));
    expect(unanswered.starts).toEqual([{ op: 'begin', wcId: 7, sessionId: 'minted-1', hostAskedBefore: 0 }, { op: 'end', wcId: 7, sessionId: 'minted-1', hostAskedBefore: 1 }]);
  });
});

/*
 * REQ-NOTIFY-058 with REQ-NOTIFY-029: every command that launches a run of an existing session clears the standing notice
 * as a start does — a prompt, a retry, a continue that resumed, a plan decision that relaunched — and one the run host
 * refused, or that left the session at rest, clears nothing. Until 2026-10-06 only `session.start` did
 * (docs/defects/fixed/a-prompt-or-retry-that-starts-a-run-does-not-clear-the-sessions-notice.md).
 */
describe('REQ-NOTIFY-058: a run of an existing session starting clears its notice', () => {
  const refused = { kind: 'refused', code: 'session.run-active', headline: 'A run is already active.' } as const;
  it('a prompt and a retry the run host launched clear it; refused ones do not', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    const commands = sessionCommands(h.ctx);
    expect(await commands['session.prompt']({ kind: 'session.prompt', sessionId: 'S1', prompt: 'Again.' }, windowOn('ws-1'))).toEqual({ ok: true });
    expect(await commands['session.retry']({ kind: 'session.retry', sessionId: 'S2' }, windowOn('ws-1'))).toEqual({ ok: true });
    expect(h.cleared).toEqual(['S1', 'S2']);
    const no = harness(() => ({ kind: 'ack' }), () => refused);
    const refusing = sessionCommands(no.ctx);
    expect(await refusing['session.prompt']({ kind: 'session.prompt', sessionId: 'S1', prompt: 'Again.' }, windowOn('ws-1'))).toMatchObject({ ok: false });
    expect(await refusing['session.retry']({ kind: 'session.retry', sessionId: 'S1' }, windowOn('ws-1'))).toMatchObject({ ok: false });
    expect(no.cleared).toEqual([]);
  });
  it('a continue that resumed and a plan decision that relaunched clear it; one that left the session at rest does not', async () => {
    let resumed = true;
    const h = harness(() => ({ kind: 'ack' }), (req) => req.kind === 'session.continue'
      ? { kind: 'session.continued', sessionId: 'S1', resumed, messageLimit: null }
      : { kind: 'session.planResolved', sessionId: 'S1', cycle: 1, relaunched: resumed });
    const commands = sessionCommands(h.ctx);
    await commands['session.continue']({ kind: 'session.continue', sessionId: 'S1', action: 'continue' }, windowOn('ws-1'));
    await commands['session.planDecision']({ kind: 'session.planDecision', sessionId: 'S1', decision: 'approve' }, windowOn('ws-1'));
    expect(h.cleared).toEqual(['S1', 'S1']);
    resumed = false;
    await commands['session.continue']({ kind: 'session.continue', sessionId: 'S1', action: 'cancel' }, windowOn('ws-1'));
    await commands['session.planDecision']({ kind: 'session.planDecision', sessionId: 'S1', decision: 'cancel' }, windowOn('ws-1'));
    expect(h.cleared).toEqual(['S1', 'S1']);
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

  it('PD-SHELL-009: the dock\'s cancel for a session its window\'s close stopped is the stop\'s to withdraw; another session\'s still goes through', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'control.result', result: { ok: true } }));
    const ctx = { ...h.ctx, withdrawnByClose: (sessionId: string) => sessionId === 'S1' };
    expect(await sessionCommands(ctx)['session.control'](cancel, windowOn('ws-1'))).toEqual({ ok: true, value: { ok: true } });
    expect(h.hostAsked).toEqual([]);
    expect(h.logs.some((l) => /left for the stop to withdraw/.test(l))).toBe(true);
    const other = { kind: 'session.control', request: { op: 'cancelQuestions', sessionId: 'S2', args: { requestId: 'Q2' } } } as const;
    await sessionCommands(ctx)['session.control'](other, windowOn('ws-1'));
    expect(h.hostAsked).toEqual([{ kind: 'session.control', request: other.request }]);
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
      mainWindows: { setFollowedSession: () => undefined, followerOfSession: () => undefined } as unknown as CommandContext['mainWindows'],
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

  /*
   * The seam resilience-proof's auth-fallback launches use: the subscription itself held before it takes effect, so a run
   * failing in its first milliseconds certainly ends before the window subscribes (finacc2's A1).
   */
  it('holds the subscription itself the configured time before it takes effect, while capturing', async () => {
    process.env['ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS'] = '500';
    try {
      const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
      const clock = new FakeClock();
      const subscribed: string[] = [];
      const commands = sessionCommands({
        ...h.ctx, capturing: true, clocks: clock,
        relay: { subscribe: (_id: number, sid: string) => { subscribed.push(sid); } } as unknown as CommandContext['relay'],
        mainWindows: { setFollowedSession: () => undefined, followerOfSession: () => undefined } as unknown as CommandContext['mainWindows'],
      });
      const reply = Promise.resolve(commands['session.subscribe'](subscribe, windowOn('ws-1')));
      expect(await settledWithin(reply)).toBe(false);
      expect(subscribed).toEqual([]);
      expect(h.hostAsked).toEqual([]);
      clock.advance(500);
      expect(await reply).toEqual({ ok: true });
      expect(subscribed).toEqual(['S1']);
      expect(h.logs).toEqual(['capture: session.subscribe held 500 ms before it takes effect']);
      // Outside a capture the environment is ignored.
      const quiet = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
      const plain = sessionCommands({ ...quiet.ctx, relay: { subscribe: () => undefined } as unknown as CommandContext['relay'], mainWindows: { setFollowedSession: () => undefined, followerOfSession: () => undefined } as unknown as CommandContext['mainWindows'] });
      expect(await plain['session.subscribe'](subscribe, windowOn('ws-1'))).toEqual({ ok: true });
      expect(quiet.logs).toEqual([]);
    } finally { delete process.env['ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS']; }
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

/*
 * REQ-NOTIFY-030/032: a failure of a session no main window followed is held (`run-failure-notice.ts`); following the
 * session is the focus change that publishes it — its class notice and, for an authentication failure, the recovery dialog.
 */
describe('session.subscribe releases a failure held while the session was not focused (REQ-NOTIFY-030/032)', () => {
  const subscribe = { kind: 'session.subscribe', sessionId: 'S2' } as const;
  const withWindows = (mainWindow: boolean, attach: ProcessReply = { kind: 'ack' }) => {
    const h = harness(() => ({ kind: 'ack' }), () => attach);
    const followed = new Map<number, string>();
    const ctx = {
      ...h.ctx,
      relay: { subscribe: () => undefined } as unknown as CommandContext['relay'],
      mainWindows: {
        // A persona or terminal window subscribing moves no main window's follow (A2): only a main window records it.
        setFollowedSession: (sender: number, sid: string) => { if (mainWindow) followed.set(sender, sid); },
        followerOfSession: (sid: string, ids: readonly number[]) => (ids.some((id) => followed.get(id) === sid) ? {} : undefined),
      } as unknown as CommandContext['mainWindows'],
    };
    return { h, commands: sessionCommands(ctx) };
  };

  it('a main window following the session releases its held failure', async () => {
    const { h, commands } = withWindows(true);
    expect(await commands['session.subscribe'](subscribe, windowOn('ws-1'))).toEqual({ ok: true });
    expect(h.focused).toEqual(['S2']);
  });

  it('a persona or terminal window subscribing, or an attach the run host refused, releases nothing', async () => {
    const aux = withWindows(false);
    await aux.commands['session.subscribe'](subscribe, windowOn('ws-1'));
    expect(aux.h.focused).toEqual([]);
    const refused = withWindows(true, { kind: 'refused', code: 'session.not-live', headline: 'No such session' });
    await refused.commands['session.subscribe'](subscribe, windowOn('ws-1'));
    expect(refused.h.focused).toEqual([]);
  });
});

/*
 * REQ-NOTIFY-031/032 with REQ-MONITOR-249/252: "New session" leaves the run it released carrying on in the background, and
 * the window follows nothing until the next prompt. Before `session.release` the window's follow stayed on that session in
 * main, so the focus test read it as on screen and its ending raised its own notice, not REQ-NOTIFY-031's naming it.
 */
describe('session.release: the window stops following the session, and keeps its relay subscription', () => {
  it('clears the sender\'s follow of that session, unsubscribes nothing and detaches nothing', async () => {
    const h = harness(() => ({ kind: 'ack' }), () => ({ kind: 'ack' }));
    const cleared: [number, string][] = [];
    const unsubscribed: string[] = [];
    const commands = sessionCommands({
      ...h.ctx,
      relay: { unsubscribe: (_id: number, sid: string) => { unsubscribed.push(sid); } } as unknown as CommandContext['relay'],
      mainWindows: { clearFollowedSession: (sender: number, sid: string) => { cleared.push([sender, sid]); } } as unknown as CommandContext['mainWindows'],
    });
    expect(await commands['session.release']({ kind: 'session.release', sessionId: 'S1' }, windowOn('ws-1'))).toEqual({ ok: true });
    expect(cleared).toEqual([[7, 'S1']]);
    expect(unsubscribed).toEqual([]);
    expect(h.hostAsked).toEqual([]);
  });
});

/*
 * REQ-NOTIFY-044 with PD-SHELL-001 (`docs/defects/fixed/a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md`):
 * a `focus-session` notice pressed in a window holding another workspace names a session this window's store does not hold.
 * The press is not dispatched: no error notice replaces the one pressed, and the refusal is logged. A load the session browser
 * asks for keeps raising its refusal as before.
 */
describe('session.resume for a notice action, in a window that does not hold the session (REQ-NOTIFY-044)', () => {
  const foreign = (req: RunHostRequest): ProcessReply => (req.kind === 'session.resume'
    ? { kind: 'refused', code: 'session.no-session', headline: 'The session could not be loaded', detail: 'No session exists under id S-A.' }
    : { kind: 'ack' });

  it('raises no notice and logs the press when the load is a notice action\'s', async () => {
    const h = harness(() => ({ kind: 'ack' }), foreign);
    const out = await sessionCommands(h.ctx)['session.resume']({ kind: 'session.resume', sessionId: 'S-A', fromNotice: true }, windowOn('ws-1'));
    expect(out.ok).toBe(false);
    expect(h.raised).toEqual([]);
    expect(h.logs.some((l) => l.includes('notice action "focus-session" for S-A not dispatched'))).toBe(true);
  });

  it('still raises the refusal for a load the session browser asked for', async () => {
    const h = harness(() => ({ kind: 'ack' }), foreign);
    await sessionCommands(h.ctx)['session.resume']({ kind: 'session.resume', sessionId: 'S-A' }, windowOn('ws-1'));
    expect(h.raised).toEqual([{ severity: 'error', headline: 'The session could not be loaded', detail: 'No session exists under id S-A.' }]);
  });
});
