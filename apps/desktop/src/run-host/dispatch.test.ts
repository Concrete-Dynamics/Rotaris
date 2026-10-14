import { describe, expect, it, vi } from 'vitest';
import type { RunHostRequest } from '@rotaris/contracts';
import type { LoadedConfiguration } from '@rotaris/config';
import { dispatch } from './dispatch.js';
import type { RunHost } from './host.js';

/*
 * `launchSession` is replaced by one that hands its `start` a configured setup at once, so a case can read what
 * `session.start`'s own hop does with it; every other case here never reaches it.
 */
vi.mock('./launch.js', () => ({
  launchSession: async (_req: unknown, deps: { start: (setup: unknown, bearers: unknown) => unknown }) => {
    const r = deps.start(launchedSetup, {}) as { ok: boolean; value?: string };
    return r.ok ? { kind: 'session.started', sessionId: r.value } : { kind: 'refused', code: 'test', headline: 'refused' };
  },
}));
let launchedSetup: unknown = null;

/*
 * The retrospective's analysis and capture are replaced by stand-ins that report what the dispatch handed them: the analysis
 * resolves the credential it was given, as a model request would, and the capture names the collector it was handed.
 */
vi.mock('@rotaris/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rotaris/engine')>()),
  analyzeImprovement: async (job: { artifact_id: string }, deps: { credentialFor: (m: unknown) => () => Promise<string>; model: unknown }) => ({ artifact_id: job.artifact_id, credential: await deps.credentialFor(deps.model)() }),
  captureRetrospectiveJob: (_dal: unknown, input: { collectorModel: string }) => ({ artifact_id: 'impart_0000000r', collector_model: input.collectorModel, considered_session_ids: [] }),
}));
vi.mock('./configuration.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./configuration.js')>()),
  retrospectiveOf: (cfg: { analyst: string }) => ({ key: cfg.analyst, model: { providerId: 'p', modelId: cfg.analyst, dialect: 'chat' }, thinking: 'unset' }),
}));

/**
 * PD-ORCH-005 clause 6: the run host's hop of "continue without them". The renderer's command and main's forwarding are
 * pinned beside their own units; this is the hop between them and the engine, where a dropped flag would turn a decline
 * into a resume and nothing else would notice. `dispatch` only destructures its host before the switch, so a host that
 * holds the two members this case reads is enough.
 */
describe('session.continue carries the decline to the engine (PD-ORCH-005 clause 6)', () => {
  const hostFor = (seen: unknown[]) => ({
    continuationLeaseForSession: async () => null,
    log: () => undefined,
    sessions: { continueSession: (...args: unknown[]) => { seen.push(args); return { ok: true, value: { resumed: true, messageLimit: null } }; } },
  }) as unknown as RunHost;

  it('passes `withoutPaused` through when the command declines, and resumes (the default) when it does not', async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    const declined: RunHostRequest = { kind: 'session.continue', sessionId: 'S1', action: 'continue', withoutPaused: true };
    const resumed: RunHostRequest = { kind: 'session.continue', sessionId: 'S1', action: 'continue' };
    expect(await dispatch(declined, host)).toEqual({ kind: 'session.continued', sessionId: 'S1', resumed: true, messageLimit: null });
    expect(await dispatch(resumed, host)).toEqual({ kind: 'session.continued', sessionId: 'S1', resumed: true, messageLimit: null });
    expect(seen).toEqual([['S1', 'continue', { withoutPaused: true }], ['S1', 'continue', { withoutPaused: false }]]);
  });
});

/**
 * REQ-NOTIFY-045 with REQ-PROVIDER-066 (OQ-178's reading, confirmed 2026-10-06 by R-071; the repair of
 * `docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md`): the run host's hop of the
 * retry. A retry launches a run as a prompt does, so the continuation lease is refreshed before the engine is asked, and a
 * lease refusal comes back without the engine ever hearing of it; the engine's refusals reach main with their codes and
 * their words, the confinement gate's under a start's headline (REQ-NOTIFY-061). Pinned after fin8's verifier found no test
 * of this case.
 */
describe('session.retry refreshes the lease, then asks the engine, and passes its refusals through (REQ-NOTIFY-045)', () => {
  const hostFor = (order: string[], lease: unknown, answer: unknown) => ({
    continuationLeaseForSession: async (sid: string) => { order.push(`lease ${sid}`); return lease; },
    log: () => undefined,
    sessions: { retry: (sid: string) => { order.push(`retry ${sid}`); return answer; } },
  }) as unknown as RunHost;
  const retry: RunHostRequest = { kind: 'session.retry', sessionId: 'S1' };

  it('acknowledges a retry the engine took, after the lease', async () => {
    const order: string[] = [];
    expect(await dispatch(retry, hostFor(order, null, { ok: true, value: { index: 4 } }))).toEqual({ kind: 'ack' });
    expect(order).toEqual(['lease S1', 'retry S1']);
  });

  it('a lease refusal comes back before the engine is asked', async () => {
    const order: string[] = [];
    const leaseRefused = { kind: 'refused', code: 'credentials.unavailable', headline: 'The provider credentials could not be read' };
    expect(await dispatch(retry, hostFor(order, leaseRefused, { ok: true, value: { index: 4 } }))).toEqual(leaseRefused);
    expect(order).toEqual(['lease S1']);
  });

  it('passes the engine\'s `no-prompt`, `attachment-unavailable` and `confinement` refusals through with their words', async () => {
    const cases: readonly [string, string, string][] = [
      ['no-prompt', 'No prompt has been submitted in this session, so there is nothing to retry.', 'The prompt could not be retried'],
      ['attachment-unavailable', 'The last prompt was not retried, because its image shot.png could not be read back: it is no longer available.', 'The prompt could not be retried'],
      ['confinement', 'Confinement is unavailable: bwrap is not on PATH. Install bubblewrap.', 'The run was refused before it started'],
    ];
    for (const [code, reason, headline] of cases) {
      const order: string[] = [];
      expect(await dispatch(retry, hostFor(order, null, { ok: false, error: { code, reason } }))).toEqual({ kind: 'refused', code: `session.${code}`, headline, detail: reason });
      expect(order).toEqual(['lease S1', 'retry S1']);
    }
    // A run already active is refused in the engine's own words, as a prompt's is.
    expect(await dispatch(retry, hostFor([], null, { ok: false, error: { code: 'run-active', reason: 'A run is already active.' } }))).toEqual({ kind: 'refused', code: 'session.run-active', headline: 'A run is already active.', detail: 'A run is already active.' });
  });
});

/**
 * PD-ORCH-005 clause 9 (defect `an-approval-asked-after-the-last-window-closes-is-denied`, R-067): the revoke's hop. Main
 * marks the revoke its quit causes; a dropped flag would leave the run host unattended with no quit under way, and what an
 * agent asked in the quit's gap would be denied again with nothing else to notice.
 */
describe('presenter.revoke carries the quit to the presenter registry (PD-ORCH-005 clause 9)', () => {
  it('passes `quitting` through, and an unmarked revoke is an ordinary one', async () => {
    const seen: unknown[] = [];
    const host = { log: () => undefined, presenters: { revoke: (...args: unknown[]) => { seen.push(args); } } } as unknown as RunHost;
    expect(await dispatch({ kind: 'presenter.revoke', windowId: '7', quitting: true }, host)).toEqual({ kind: 'ack' });
    expect(await dispatch({ kind: 'presenter.revoke', windowId: '8' }, host)).toEqual({ kind: 'ack' });
    expect(seen).toEqual([['7', true], ['8', false]]);
  });
});

/**
 * REQ-WORKSPACE-092/109 (defect `an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered`,
 * fixed): the run host's shutdown is what ends a code-intelligence setup at an orderly quit. `McpHost.endSetup` is pinned
 * beside its own unit and the group termination in `packages/mcp`; this is the one call that joins them to the quit. With
 * it replaced by `Promise.resolve()` the built app quit in 144 ms and a step and the process it had started were both still
 * running 5 s after the exit (`workspace-proof` 8f measures that end to end). So: `shutdown` asks the setup to end, and
 * neither closes a store nor schedules the exit until the setup has ended.
 */
describe('shutdown ends the code-intelligence setup before the run host exits (REQ-WORKSPACE-092, REQ-WORKSPACE-109)', () => {
  it('calls McpHost.endSetup first and awaits it before the stores close and the exit is scheduled', async () => {
    const order: string[] = [];
    let endSetup: () => void = () => undefined;
    const host = {
      log: () => undefined,
      clocks: { timers: { after: () => { order.push('exit scheduled'); } } },
      improvementControllers: new Map(),
      improvementContexts: new Map(),
      presenters: { stop: () => { order.push('presenters.stop'); } },
      sessions: { closeAll: async () => { order.push('sessions.closeAll'); } },
      stores: new Map([['W1', { db: { close: () => { order.push('store closed'); } } }]]),
      mcp: {
        endSetup: () => { order.push('mcp.endSetup'); return new Promise<void>((resolve) => { endSetup = () => { order.push('setup ended'); resolve(); }; }); },
        discovery: { closeAll: async () => { order.push('discovery.closeAll'); } },
        closeAll: async () => { order.push('mcp.closeAll'); },
      },
    } as unknown as RunHost;
    let replied = false;
    const reply = dispatch({ kind: 'shutdown', deadlineMs: 30_000 }, host).then((r) => { replied = true; return r; });
    // Every other step of the shutdown settles at once; the setup has not ended yet.
    await new Promise((resolve) => setImmediate(resolve));
    expect(order[0]).toBe('mcp.endSetup');
    expect(order).toContain('mcp.closeAll');
    expect(order).not.toContain('store closed');
    expect(order).not.toContain('exit scheduled');
    expect(replied).toBe(false);
    endSetup();
    expect(await reply).toEqual({ kind: 'ack' });
    expect(order.slice(-3)).toEqual(['setup ended', 'store closed', 'exit scheduled']);
  });
});

/**
 * REQ-MCP-034/050 (live-run finding D1 at 1763f7f, repaired in
 * `docs/defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`): the discovery
 * `session.start` runs ahead of the run launches what the run will, against the tree it executes in. Before the repair it
 * was handed the workspace's configuration and the workspace's root; `injection-proof`'s isolated launch read the result
 * in the built app, and this case pins the hop without a build.
 */
describe('session.start discovers ahead of the run against the root the run executes in (REQ-MCP-034, REQ-MCP-050)', () => {
  const ws = '/work/ws';
  const tree = '/work/ws/.rotaris/worktrees/s1';
  const cfg = () => {
    const args = ['builtin:code-intelligence', '--', 'start-mcp-server', '--transport', 'stdio', '--project', ws];
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'builtin:code-intelligence', args: ['start-mcp-server', '--transport', 'stdio'] };
    return {
      workspaceRoot: ws,
      mcp: { servers: { code_intelligence: { name: 'code_intelligence', entry, origin: 'default', availability: { available: true }, resolved: { command: '/opt/rotaris', args, builtin: true }, description: { transport: 'stdio', command: '/opt/rotaris', args, env: {}, cwd: ws } } }, origins: { code_intelligence: 'default' }, secrets: [], diagnostics: [] },
    } as unknown as LoadedConfiguration;
  };
  const hostFor = (prepared: [LoadedConfiguration, string][]) => ({
    lease: { isRefusing: () => false },
    stores: new Map([['W1', { root: ws, dal: {} }]]),
    log: () => undefined,
    presenters: { attended: () => true },
    sessionRoots: new Map(), configuredRuns: new Map(), runBearers: new Map(), configured: new Map(), leased: new Map(),
    skills: { onSessionCreated: () => undefined, contextUnits: () => [] },
    mcp: { newConfiguration: () => undefined, prepare: async (c: LoadedConfiguration, root: string) => { prepared.push([c, root]); } },
    sessions: { start: (_dal: unknown, _root: unknown, _prompt: unknown, o: { sessionId: string }) => ({ ok: true, value: o.sessionId }) },
  }) as unknown as RunHost;
  const projectOf = (c: LoadedConfiguration): readonly string[] | null => {
    const d = c.mcp.servers['code_intelligence']!.description;
    return d.transport === 'stdio' ? d.args.slice(-2) : null;
  };

  it('a session in a worktree discovers with the tree\'s root after the project-path option; a base session keeps the workspace\'s', async () => {
    const prepared: [LoadedConfiguration, string][] = [];
    launchedSetup = { cfg: cfg() };
    const isolated: RunHostRequest = { kind: 'session.start', workspaceId: 'W1', sessionId: 'S1', prompt: 'p', effectiveRoot: tree, worktree: { worktree_path: tree, branch: 'rotaris/s1' } } as unknown as RunHostRequest;
    const base: RunHostRequest = { kind: 'session.start', workspaceId: 'W1', sessionId: 'S2', prompt: 'p' } as unknown as RunHostRequest;
    await dispatch(isolated, hostFor(prepared));
    await dispatch(base, hostFor(prepared));
    expect(prepared.map(([, root]) => root)).toEqual([tree, ws]);
    expect(projectOf(prepared[0]![0])).toEqual(['--project', tree]);
    // The anchoring root is absent from the command line; the working directory is `PD-MCP-002`'s (OQ-194 as ruled), not this case's.
    const d = prepared[0]![0].mcp.servers['code_intelligence']!.description;
    expect(d.transport === 'stdio' ? d.args : []).not.toContain(ws);
    expect(projectOf(prepared[1]![0])).toEqual(['--project', ws]);
  });
});

/**
 * PD-PROVIDER-001: the run host cannot read the provider catalogue, so main's handshake hands it the caps each provider
 * declares, and every later run reads them (`configurationDeps.sharedQuotaCaps`, `modelCapInForce`).
 */
describe('the handshake carries the shared-quota caps the catalogue declares (PD-PROVIDER-001)', () => {
  it('keeps the caps main sent, and a hello that sends none leaves them as they were', async () => {
    const host = { sharedQuotaCaps: {} } as unknown as RunHost;
    expect(await dispatch({ kind: 'hello', sharedQuotaCaps: { deepseek: 3, 'claude-code': 2 } }, host)).toMatchObject({ kind: 'hello', process: 'run-host' });
    expect(host.sharedQuotaCaps).toEqual({ deepseek: 3, 'claude-code': 2 });
    await dispatch({ kind: 'hello' }, host);
    expect(host.sharedQuotaCaps).toEqual({ deepseek: 3, 'claude-code': 2 });
  });
});

/**
 * PD-SHELL-009: the run host's hop of the keyed count and of a workspace stop. A workspace's id counts and stops that
 * workspace's runs, through the store it names, and the empty id counts the instance's (the last window's close, the
 * update's close). Before, every count was instance-wide, so REQ-SHELL-021's gate 3 refused an idle window's switch over
 * another project's run.
 */
describe('runs.active counts the workspace it names, and runs.stopWorkspace stops that workspace alone (PD-SHELL-009)', () => {
  const hostFor = (seen: unknown[]) => ({
    log: () => undefined,
    stores: new Map([['W1', { root: '/ws/one' }], ['W2', { root: '/ws/two' }]]),
    sessions: {
      activeRunCount: (root?: string) => { seen.push(['count', root]); return root === undefined ? 3 : root === '/ws/one' ? 2 : 1; },
      stoppableRunCount: (root: string) => { seen.push(['stoppable', root]); return root === '/ws/one' ? 1 : 0; },
      activeRunsSharing: (root: string) => { seen.push(['sharing', root]); return root === '/ws/one' ? 4 : 0; },
      stopActiveIn: (root: string) => { seen.push(['stop', root]); return root === '/ws/one' ? ['S1', 'S2'] : []; },
    },
  }) as unknown as RunHost;

  it('counts the named workspace through its store, the instance for the empty id, and nothing for a workspace it does not hold', async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W1' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W1', count: 2 });
    expect(await dispatch({ kind: 'runs.active', workspaceId: '' }, host)).toEqual({ kind: 'runs.count', workspaceId: '', count: 3 });
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W9' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W9', count: 0 });
    expect(seen).toEqual([['count', '/ws/one'], ['count', undefined]]);
  });

  it("counts, under `scope: 'stoppable'`, only what the workspace stop would stop — the close box's predicate (fin28 reviewers' finding d)", async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W1', scope: 'stoppable' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W1', count: 1 });
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W1', scope: 'active' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W1', count: 2 });
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W9', scope: 'stoppable' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W9', count: 0 });
    expect(seen).toEqual([['stoppable', '/ws/one'], ['count', '/ws/one']]);
  });

  it("counts, under `scope: 'sharing'`, the runs a launch in the named workspace would share a tree with (PD-GIT-001)", async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W1', scope: 'sharing' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W1', count: 4 });
    expect(await dispatch({ kind: 'runs.active', workspaceId: 'W9', scope: 'sharing' }, host)).toEqual({ kind: 'runs.count', workspaceId: 'W9', count: 0 });
    expect(seen).toEqual([['sharing', '/ws/one']]);
  });

  it('stops the named workspace\'s runs and answers the sessions it stopped', async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    expect(await dispatch({ kind: 'runs.stopWorkspace', workspaceId: 'W1' }, host)).toEqual({ kind: 'runs.stopped', workspaceId: 'W1', sessionIds: ['S1', 'S2'] });
    expect(await dispatch({ kind: 'runs.stopWorkspace', workspaceId: 'W9' }, host)).toEqual({ kind: 'runs.stopped', workspaceId: 'W9', sessionIds: [] });
    expect(seen).toEqual([['stop', '/ws/one']]);
  });
});

/**
 * PD-LIBRARY-002 (ADR-0065 decision 5) with ADR-0030: a retrospective authenticates exactly as a run does — the providers its
 * configuration names leased from main, then the setup completed over THOSE bearers. The live scenario run at `ce5f952` (F2,
 * `docs/defects/fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md`) sent the
 * retrospective's request with no credential: the capture took the workspace's cached setup (`configuredFor`), completed
 * before any lease over an empty bearer map, and the analysis reused it, so a launch with no run before it got a 401.
 */
describe('a retrospective authenticates as a run does: leased first, its setup completed over the bearers it leased (PD-LIBRARY-002, F2)', () => {
  const root = '/work/ws';
  const run = (analyst: string, bearer: string) => ({ cfg: { analyst, runtime: { retrospective_timeout: 300 } }, scripted: false, model: { backend: {}, config: { credentialFor: () => async () => bearer } } });
  const hostFor = (seen: string[]) => ({
    log: () => undefined,
    clocks: { wall: { instant: () => new Date('2026-10-14T00:00:00.000Z') }, timers: { after: () => ({ cancel: () => undefined }) } },
    stores: new Map([['W1', { root, dal: {} }]]),
    improvementContexts: new Map(), improvementControllers: new Map(),
    skills: { retrospectiveInstructionFiles: () => [] },
    ask: async () => ({ kind: 'improvements.result', value: [] }),
    // The workspace's cached setup, completed when no lease had been taken: its credential is the empty one.
    configuredFor: () => { seen.push('configuredFor'); return run('stale-analyst', ''); },
    leaseForWorkspace: async () => { seen.push('leaseForWorkspace'); return null; },
    retrospectiveSetup: async (r: string) => { seen.push(`retrospectiveSetup ${r}`); return { kind: 'configured', setup: run('leased-analyst', 'leased-bearer'), bearers: { p: 'leased-bearer' } }; },
  }) as unknown as RunHost;
  const job = { artifact_id: 'impart_0000000r', pass: 'retrospective', workspace_root: root } as unknown;

  it('the analysis sends the bearer the retrospective leased, never the cached setup\'s', async () => {
    const seen: string[] = [];
    const r = await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, hostFor(seen));
    expect(r).toMatchObject({ kind: 'improvement.analyzed', artifact: { credential: 'leased-bearer' } });
    expect(seen).toEqual([`retrospectiveSetup ${root}`]);
  });

  it('the capture leases before it resolves the collector, and reads it from the leased setup', async () => {
    const seen: string[] = [];
    const r = await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, hostFor(seen));
    expect(r).toMatchObject({ kind: 'retrospective.captured', job: { collector_model: 'leased-analyst' } });
    expect(seen).toEqual([`retrospectiveSetup ${root}`]);
  });

  it('a lease refusal comes back before anything is captured or analysed', async () => {
    const refusal = { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before continuing this run.' };
    const host = { ...(hostFor([]) as unknown as Record<string, unknown>), retrospectiveSetup: async () => ({ kind: 'refused', reply: refusal }) } as unknown as RunHost;
    expect(await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, host)).toEqual(refusal);
    expect(await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, host)).toEqual(refusal);
  });
});

/**
 * REQ-NOTIFY-044 with PD-SHELL-001 (`docs/defects/fixed/a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md`):
 * a resume the engine refuses changes nothing in the run host. A `focus-session` notice pressed in a window holding another
 * workspace asks for a session that window's store does not hold; until 2026-10-14 the run host recorded the session under the
 * asking workspace's root before the refusal, so a session live in the other workspace took its continuation lease against
 * the wrong workspace from then on.
 */
describe('session.resume records the session\'s workspace only once the engine has loaded it (REQ-NOTIFY-044)', () => {
  const hostFor = (roots: Map<string, string>, answer: unknown) => ({
    log: () => undefined,
    stores: new Map([['ws-B', { dal: {}, root: '/work/b' }]]),
    sessionRoots: roots,
    sessions: { resume: () => answer },
  }) as unknown as RunHost;

  it('leaves a session live in another workspace recorded under its own root when the resume is refused', async () => {
    const roots = new Map([['S-A', '/work/a']]);
    const refused = await dispatch({ kind: 'session.resume', workspaceId: 'ws-B', sessionId: 'S-A' }, hostFor(roots, { ok: false, error: { code: 'no-session', reason: 'No session exists under id S-A.' } }));
    expect(refused).toEqual({ kind: 'refused', code: 'session.no-session', headline: 'The session could not be loaded', detail: 'No session exists under id S-A.' });
    expect(roots.get('S-A')).toBe('/work/a');
  });

  it('records the session under the asking workspace when the engine loads it', async () => {
    const roots = new Map<string, string>();
    expect(await dispatch({ kind: 'session.resume', workspaceId: 'ws-B', sessionId: 'S-B' }, hostFor(roots, { ok: true, value: { sessionId: 'S-B' } }))).toEqual({ kind: 'session.resumed', sessionId: 'S-B' });
    expect(roots.get('S-B')).toBe('/work/b');
  });
});
