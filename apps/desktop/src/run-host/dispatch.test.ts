import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunHostRequest } from '@rotaris/contracts';
import { SKILLS_DEFAULTS, type AsyncDiscoveryPorts, type DiscoveryPorts, type LoadedConfiguration } from '@rotaris/config';
import { FakeClock } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore } from '@rotaris/store';
import type { AvailabilityVerdict } from '@rotaris/agent-tools';
import { configureRun, type ConfigureDeps } from './configuration.js';
import { dispatch } from './dispatch.js';
import type * as Engine from '@rotaris/engine';
import type * as Configuration from './configuration.js';
import type { RunHost } from './host.js';
import { SkillHost } from './skills.js';

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
  ...(await importOriginal<typeof Engine>()),
  analyzeImprovement: async (job: { artifact_id: string }, deps: { credentialFor: (m: unknown) => () => Promise<string>; model: unknown }) => ({ artifact_id: job.artifact_id, credential: await deps.credentialFor(deps.model)() }),
  captureRetrospectiveJob: (_dal: unknown, input: { collectorModel: string }) => ({ artifact_id: 'impart_0000000r', collector_model: input.collectorModel, considered_session_ids: [] }),
}));
vi.mock('./configuration.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Configuration>()),
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
    settleConfinement: async () => null,
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
    settleConfinement: async () => null,
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
    const refusal = { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before running a retrospective.' };
    const host = { ...(hostFor([]) as unknown as Record<string, unknown>), retrospectiveSetup: async () => ({ kind: 'refused', reply: refusal }) } as unknown as RunHost;
    expect(await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, host)).toEqual(refusal);
    expect(await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, host)).toEqual(refusal);
  });

  /*
   * PD-LIBRARY-002: "A workspace with no resolvable retrospective model captures no pass" — `leasedSetup` answers `no-model` only
   * when neither the entry role's model nor the retrospective's resolves, and that is said as the missing analyst, never as an
   * unloadable configuration or an expired job
   * (docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md).
   */
  it('no resolvable model is answered as the missing analyst at the capture and at the analysis', async () => {
    const host = { ...(hostFor([]) as unknown as Record<string, unknown>), retrospectiveSetup: async () => ({ kind: 'no-model', reason: 'No usable model is configured for the entry role, so the run was refused before it started: role coding-agent names no model.' }) } as unknown as RunHost;
    expect(await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, host)).toEqual({ kind: 'refused', code: 'retrospective.no-model', headline: 'No retrospective analyst is configured' });
    expect(await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, host)).toEqual({ kind: 'refused', code: 'improvement.no-model', headline: 'No improvement analyst is configured' });
  });

  /*
   * REQ-NOTIFY-254 (docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md):
   * a configuration that did not load is said as one with the loader's own reason at the capture, and at the analysis as the
   * same — never as "The captured improvement job is no longer available", which the analysis answered until the repair.
   */
  it('an unloadable configuration carries the loader\'s reason at the capture, and is not called an expired job at the analysis', async () => {
    const reason = 'The configuration could not be loaded: agents.yaml line 1: runtime must be a mapping.';
    const host = { ...(hostFor([]) as unknown as Record<string, unknown>), retrospectiveSetup: async () => ({ kind: 'unconfigured', reason }) } as unknown as RunHost;
    expect(await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, host)).toEqual({ kind: 'refused', code: 'retrospective.no-configuration', headline: 'The workspace configuration could not be loaded', detail: reason });
    expect(await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, host)).toEqual({ kind: 'refused', code: 'improvement.no-configuration', headline: 'The workspace configuration could not be loaded', detail: reason });
  });

  /*
   * PD-LIBRARY-002 revision 6 (OQ-363, ruled 2026-10-20 under R-072): "The configuration's load warnings and referential messages
   * are written to the application log when the pass is captured, one warning line each." No retrospective path wrote them
   * anywhere before: only a run's start and continuation write a setup's warnings. The analysis repeats the capture's
   * preparation, so it writes none.
   */
  it('the capture writes each warning of the setup once, at warn, prefixed `retrospective: `; the analysis writes none', async () => {
    const lines: [string, string | undefined][] = [];
    const warned = { ...run('leased-analyst', 'leased-bearer'), warnings: ['configuration: one', 'configuration: two'] };
    const host = {
      ...(hostFor([]) as unknown as Record<string, unknown>),
      log: (m: string, level?: string) => { lines.push([m, level]); },
      retrospectiveSetup: async () => ({ kind: 'configured', setup: warned, bearers: { p: 'leased-bearer' } }),
    } as unknown as RunHost;
    expect(await dispatch({ kind: 'retrospective.capture', workspaceId: 'W1', workspaceRoot: root }, host)).toMatchObject({ kind: 'retrospective.captured' });
    expect(lines.filter(([m]) => m === 'retrospective: configuration: one')).toEqual([['retrospective: configuration: one', 'warn']]);
    expect(lines.filter(([m]) => m === 'retrospective: configuration: two')).toEqual([['retrospective: configuration: two', 'warn']]);
    lines.length = 0;
    expect(await dispatch({ kind: 'improvement.analyze', job } as unknown as RunHostRequest, host)).toMatchObject({ kind: 'improvement.analyzed' });
    expect(lines.filter(([m]) => m.startsWith('retrospective: configuration:'))).toEqual([]);
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

/**
 * OQ-281 (ruled 2026-10-14 under R-072): a restore admitted while the open holds `workspace.store-missing` runs before the run
 * host was ever handed that workspace's store (`workspace.opened` never came). The restore's controls — refuse new runs,
 * close, release, and the reopen main forwards as a release — must acknowledge such a workspace rather than refuse it, or
 * the restore would abandon at step 1 on a bound that never expires (ADR-0058 3a). No change was needed; this pins it.
 */
describe('the restore\'s controls acknowledge a workspace the run host holds no store for (OQ-281)', () => {
  it('refuseRuns, renewLease, closeStore and release each answer workspace.ack and touch no store', async () => {
    const leased: unknown[] = [];
    const host = {
      log: () => undefined,
      stores: new Map(),
      lease: { refuse: (id: string) => leased.push(['refuse', id]), renew: (id: string) => leased.push(['renew', id]), release: (id: string) => leased.push(['release', id]) },
    } as unknown as RunHost;
    for (const req of [
      { kind: 'workspace.refuseRuns', workspaceId: 'W-unknown', leaseMs: 30_000 },
      { kind: 'workspace.renewLease', workspaceId: 'W-unknown', leaseMs: 30_000 },
      { kind: 'workspace.closeStore', workspaceId: 'W-unknown' },
      { kind: 'workspace.release', workspaceId: 'W-unknown' },
    ] as RunHostRequest[]) {
      expect(await dispatch(req, host)).toEqual({ kind: 'workspace.ack', workspaceId: 'W-unknown' });
    }
    expect(leased).toEqual([['refuse', 'W-unknown'], ['renew', 'W-unknown'], ['release', 'W-unknown']]);
    expect((host as unknown as { stores: Map<string, unknown> }).stores.size).toBe(0);
  });
});

/**
 * REQ-CONFIG-111 at ADR-0037's Tier B handover: a live state the load's schema rejects is refused and the state held before
 * stays, so the next run start never meets the value in a scope file's name
 * (docs/defects/fixed/a-live-setting-the-load-schema-rejects-is-reported-in-a-scope-file-that-does-not-hold-it.md).
 */
describe('config.liveState installs only a live state the load\'s schema accepts (REQ-CONFIG-111, REQ-CONFIG-478)', () => {
  const hostFor = (lines: string[]) => ({ log: (m: string) => { lines.push(m); }, liveState: { runtime: { max_depth: 3 } } }) as unknown as RunHost & { liveState: unknown };

  it('acknowledges a valid state and installs it', async () => {
    const lines: string[] = [];
    const host = hostFor(lines);
    expect(await dispatch({ kind: 'config.liveState', state: { runtime: { max_depth: 5 }, compressorThresholdPercentage: 70 } }, host)).toEqual({ kind: 'ack' });
    expect(host.liveState).toEqual({ runtime: { max_depth: 5 }, compressorThresholdPercentage: 70 });
    expect(lines).toEqual([]);
  });

  it('refuses a state with a value the load would reject, naming it, and keeps the state it held', async () => {
    const lines: string[] = [];
    const host = hostFor(lines);
    const r = await dispatch({ kind: 'config.liveState', state: { runtime: { max_depth: 0 }, compressorThresholdPercentage: 0 } }, host);
    expect(r).toEqual({ kind: 'refused', code: 'config.live-state-invalid', headline: 'The live settings were refused', detail: 'runtime.max_depth: must be at least 1, got 0; compressor.threshold_percentage: must be at least 1, got 0' });
    expect(host.liveState).toEqual({ runtime: { max_depth: 3 } });
    expect(lines).toEqual([expect.stringContaining('config: the live settings were refused, the ones held before stay — runtime.max_depth: must be at least 1, got 0')]);
  });
});

/**
 * REQ-SANDBOX-097 with REQ-SANDBOX-095/071 and REQ-SANDBOX-067/068 for the CONTINUATION paths
 * (docs/defects/fixed/a-continuation-before-the-confinement-verdict-settles-is-refused-as-confinement-unavailable.md): a
 * continuation launches a run, so the availability decision is settled before the engine's per-run `configure` reads the
 * cached verdict. Until 2026-10-20 only a run start (`launchSession`) and a `confinement.status` request settled it, and a
 * continuation reached first — after an application restart, the window's own read still in flight — read `peek()` as null
 * and was refused "No OS-level confinement can be used on this host." with no reason and no remediation, even where
 * confinement is available. The engine stands in here as the gate it meets: `configureRun` over the real configuration
 * load, reading the verdict the way `host.ts` hands it (`confinement: () => confinement.peek()`).
 */
describe('a continuation settles the confinement verdict before the engine configures its run (REQ-SANDBOX-097)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-continuation-confinement-'));
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), 'models:\n  selected:\n    provider: openai\n    model_id: m\n    api_key: k\nlarge_model: selected\nmedium_model: selected\nsmall_model: selected\nruntime:\n  sandbox_mode: workspace-write\n');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  /** A `ConfinementService`'s two faces: `peek()` null until the probe answers, which it does only after a delay. */
  const slowConfinement = (settled: AvailabilityVerdict) => {
    let cached: AvailabilityVerdict | null = null;
    return {
      peek: () => cached,
      settle: async (): Promise<AvailabilityVerdict> => {
        if (cached === null) { await new Promise((done) => setTimeout(done, 15)); cached = settled; }
        return cached;
      },
    };
  };
  const available: AvailabilityVerdict = { available: true, backend: 'bubblewrap', reason: '', remediation: '' };
  const unavailable: AvailabilityVerdict = { available: false, backend: 'bubblewrap', reason: 'bwrap was not found on PATH.', remediation: 'Install bubblewrap from your distribution.' };

  type Path = { readonly name: string; readonly req: RunHostRequest; readonly method: string; readonly value: unknown; readonly proceeded: Record<string, unknown> };
  const paths: readonly Path[] = [
    { name: 'session.continue', req: { kind: 'session.continue', sessionId: 'S1', action: 'continue' }, method: 'continueSession', value: { resumed: true, messageLimit: null }, proceeded: { kind: 'session.continued' } },
    { name: 'session.prompt', req: { kind: 'session.prompt', sessionId: 'S1', prompt: 'more' }, method: 'prompt', value: { index: 3 }, proceeded: { kind: 'ack' } },
    { name: 'session.planDecision', req: { kind: 'session.planDecision', sessionId: 'S1', decision: 'approve' }, method: 'planDecision', value: { cycle: 1, relaunched: true }, proceeded: { kind: 'session.planResolved' } },
    { name: 'session.retry', req: { kind: 'session.retry', sessionId: 'S1' }, method: 'retry', value: { index: 3 }, proceeded: { kind: 'ack' } },
    { name: 'session.restartOnFallback (REQ-NOTIFY-070)', req: { kind: 'session.restartOnFallback', sessionId: 'S1' }, method: 'restartOnFallback', value: { failed: { provider: 'openai', model: 'm' }, fallback: { key: 'selected', provider: 'openai', model: 'm' } }, proceeded: { kind: 'session.fallbackRestarted' } },
    { name: 'session.authRestart', req: { kind: 'session.authRestart', sessionId: 'S1', modelKey: null }, method: 'restartAfterAuthFailure', value: { pinned: null }, proceeded: { kind: 'session.authRestarted' } },
  ];

  const hostFor = (confinement: ReturnType<typeof slowConfinement>, path: Path, order: string[]) => {
    const deps: ConfigureDeps = {
      clocks: new FakeClock(), globalDir: join(dir, 'global'), env: {}, scriptedClient: () => { throw new Error('not scripted'); },
      onRequest: () => undefined, log: () => undefined, liveState: () => ({}), bearers: () => ({}), confinement: () => confinement.peek(),
    };
    return {
      log: () => undefined,
      settleConfinement: async () => { const v = await confinement.settle(); order.push('settled'); return v; },
      continuationLeaseForSession: async () => { order.push('lease'); return null; },
      // The engine's continuation: its run's setup through the run host's `configure`, refused as `confinement` by the gate.
      sessions: { [path.method]: () => {
        order.push('configure');
        const r = configureRun(dir, true, deps);
        return r.ok ? { ok: true, value: path.value } : { ok: false, error: { code: r.error.code ?? 'configuration', reason: r.error.reason } };
      } },
    } as unknown as RunHost;
  };

  for (const path of paths) {
    it(`${path.name}: a verdict that settles available after a delay lets the continuation proceed, settled before the lease and the configure`, async () => {
      const order: string[] = [];
      expect(await dispatch(path.req, hostFor(slowConfinement(available), path, order))).toMatchObject(path.proceeded);
      expect(order).toEqual(['settled', 'lease', 'configure']);
    });

    it(`${path.name}: a verdict that settles unavailable refuses with its reason and its remediation (REQ-SANDBOX-095/071)`, async () => {
      const r = await dispatch(path.req, hostFor(slowConfinement(unavailable), path, []));
      expect(r).toMatchObject({ kind: 'refused', code: 'session.confinement' });
      const detail = r.kind === 'refused' ? r.detail ?? '' : '';
      expect(detail).toContain('bwrap was not found on PATH.');
      expect(detail).toContain('Install bubblewrap from your distribution.');
      expect(detail).not.toContain('No OS-level confinement can be used on this host.');
    });
  }
});

/**
 * OQ-386 point 1 (ruled 2026-10-21; the repair of
 * `docs/defects/fixed/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md`): the run
 * host answers `workspace.opened` before it warms the skill catalogue, and the warm-up never holds its loop. Until the repair
 * the warm-up was a `queueMicrotask` that ran the synchronous walk before the reaction `index.ts` attaches to post the reply.
 * The tree here is a map behind both kinds of port, each call recorded, and the asynchronous `readFile` can be held open —
 * the slow disk — so a case can look at the run host while the walk is parked.
 */
describe('the run host answers workspace.opened before it warms the skill catalogue, off its loop (OQ-386 point 1)', () => {
  const root = '/ws';
  const skill = (name: string): string => `---\nname: ${name}\ndescription: ${name} does things.\n---\n${name} body\n`;
  const fixture = () => {
    const files = new Map<string, string>([[`${root}/.agents/skills/alpha/SKILL.md`, skill('alpha')]]);
    const calls: string[] = [];
    const isDir = (p: string): boolean => [...files.keys()].some((f) => f.startsWith(`${p}/`));
    const list = (dir: string): string[] => [...new Set([...files.keys()].filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1).split('/')[0]!))];
    const read = (p: string): string => { const v = files.get(p); if (v === undefined) throw new Error(`ENOENT ${p}`); return v; };
    const sync: DiscoveryPorts = {
      readDir: (d) => { calls.push(`sync readDir ${d}`); return list(d); },
      readFile: (f) => { calls.push(`sync readFile ${f}`); return read(f); },
      isDirectory: (d) => { calls.push(`sync isDirectory ${d}`); return isDir(d); },
      isFile: (f) => { calls.push(`sync isFile ${f}`); return files.has(f); },
    };
    let held = false;
    const parked: (() => void)[] = [];
    let failing: Error | null = null;
    const async: AsyncDiscoveryPorts = {
      readDir: async (d) => { calls.push(`async readDir ${d}`); if (failing) throw failing; return list(d); },
      // Answered from the tree as it stood when asked, delivered once released: a slow disk.
      readFile: async (f) => {
        calls.push(`async readFile ${f}`);
        const text = read(f);
        if (held) await new Promise<void>((go) => parked.push(go));
        return text;
      },
      isDirectory: async (d) => { calls.push(`async isDirectory ${d}`); return isDir(d); },
      isFile: async (f) => { calls.push(`async isFile ${f}`); return files.has(f); },
    };
    return {
      files, calls, sync, async,
      hold: () => { held = true; },
      parkedCount: () => parked.length,
      release: () => { held = false; for (const go of parked.splice(0)) go(); },
      fail: (e: Error) => { failing = e; },
    };
  };
  let dir: string;
  // The store the case hands over, migrated first as the workspace service's open leaves it.
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-warm-up-'));
    for (const file of ['store.sqlite', 'cold.sqlite']) { const db = openStore(join(dir, file)); migrateStore(db); db.close(); }
  });
  afterEach(() => { forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const setup = (file = 'store.sqlite') => {
    const fx = fixture();
    const clock = new FakeClock();
    const lines: string[] = [];
    const skills = new SkillHost({
      home: '/home/u', machineDir: '/machine', platform: 'linux', ports: fx.sync, asyncPorts: fx.async, monotonic: clock,
      section: () => ({ ok: true, value: SKILLS_DEFAULTS }), log: (m) => { lines.push(m); },
    });
    const stores = new Map<string, { db: { close: () => void } | null }>();
    const host = {
      clocks: clock, lease: { isRefusing: () => false }, stores, log: (m: string) => { lines.push(m); }, skills,
      sessions: { writer: () => ({ appendRow: () => ({ ok: true, value: { index: 7 } }) }) },
    } as unknown as RunHost;
    const opened: RunHostRequest = { kind: 'workspace.opened', workspaceId: 'W1', storeFile: join(dir, file), workspaceRoot: root };
    const close = () => { for (const s of stores.values()) s.db?.close(); };
    return { fx, clock, lines, skills, host, opened, close };
  };
  /** Lets every job the walk queued run — microtasks and the pending `setImmediate`s between them — up to `limit` turns. */
  const until = async (condition: () => boolean, limit = 200): Promise<void> => {
    for (let i = 0; i < limit && !condition(); i += 1) await new Promise((go) => setImmediate(go));
  };
  const names = (r: unknown): string[] => ((r as { state: { skills: { name: string }[] } }).state.skills.map((s) => s.name));

  it('posts the reply, as index.ts does, before the walk asks the tree anything; the walk starts from a zero-delay timer', async () => {
    const { fx, clock, skills, host, opened, close } = setup();
    try {
      // index.ts: `dispatch(req.data, h).then((r) => reply(env.data.id, r))`.
      const replied = dispatch(opened, host).then((r) => { fx.calls.push('reply posted'); return r; });
      await until(() => false, 5);
      expect(await replied).toEqual({ kind: 'workspace.ack', workspaceId: 'W1' });
      // Before the repair the microtask's synchronous walk stood here, ahead of the reply.
      expect(fx.calls).toEqual(['reply posted']);
      expect(clock.pendingCount()).toBe(1);
      fx.hold();
      clock.advance(0);
      await until(() => fx.parkedCount() > 0);
      // The walk is parked on a slow read, and the run host still answers: its loop is not held.
      expect(fx.parkedCount()).toBe(1);
      expect(await dispatch({ kind: 'ping' }, host)).toEqual({ kind: 'pong' });
      fx.release();
      await skills.settled(root);
      expect(fx.calls[0]).toBe('reply posted');
      expect(fx.calls.slice(1).every((c) => c.startsWith('async '))).toBe(true);
      // The warm catalogue is the one every later ask reads: nothing walks the tree again.
      const before = fx.calls.length;
      expect(skills.state(root).skills.map((s) => s.name)).toEqual(['alpha']);
      expect(fx.calls.length).toBe(before);
    } finally { close(); }
  });

  for (const clear of ['a rescan', 'a session creation'] as const) {
    it(`a warm-up overtaken by ${clear} sets its catalogue aside, so the tree as it stands after the clear is what is read`, async () => {
      const { fx, clock, lines, skills, host, opened, close } = setup();
      try {
        await dispatch(opened, host);
        fx.hold();
        clock.advance(0);
        await until(() => fx.parkedCount() > 0);
        // The warm-up has listed the tree with alpha alone; beta lands now, and the clear comes after it.
        fx.files.set(`${root}/.agents/skills/beta/SKILL.md`, skill('beta'));
        if (clear === 'a rescan') expect(names(await dispatch({ kind: 'skills.rescan', workspaceRoot: root }, host))).toEqual(['alpha', 'beta']);
        else skills.onSessionCreated(root, 's1');
        fx.release();
        await until(() => lines.some((l) => l.includes('was set aside')));
        expect(lines.filter((l) => l.includes('was set aside'))).toEqual([`skills: the discovery begun at the open of ${root} was set aside: a rescan or a session creation cleared the catalogue while it ran`]);
        // Published over the clear, the stale catalogue would read alpha alone.
        expect(names(await dispatch({ kind: 'skills.read', workspaceRoot: root }, host))).toEqual(['alpha', 'beta']);
      } finally { close(); }
    });
  }

  const asks: readonly { readonly name: string; readonly req: RunHostRequest; readonly answer: Record<string, unknown> }[] = [
    { name: 'skills.read', req: { kind: 'skills.read', workspaceRoot: root }, answer: { kind: 'skills.state' } },
    { name: 'skills.forceLoad', req: { kind: 'skills.forceLoad', workspaceRoot: root, sessionId: 's1', name: 'alpha' }, answer: { kind: 'skills.state', loaded: 'alpha' } },
    { name: 'skills.loadFile', req: { kind: 'skills.loadFile', workspaceRoot: root, sessionId: 's1', path: `${root}/.agents/skills/alpha` }, answer: { kind: 'skills.state', loaded: 'alpha' } },
    { name: 'skills.list', req: { kind: 'skills.list', workspaceRoot: root, sessionId: 's1' }, answer: { kind: 'skills.listed', count: 1, index: 7 } },
  ];
  for (const ask of asks) {
    it(`${ask.name} arriving while the warm-up is in flight waits for it and is answered from it, walking the tree once`, async () => {
      const { fx, clock, host, opened, close } = setup();
      try {
        await dispatch(opened, host);
        fx.hold();
        clock.advance(0);
        await until(() => fx.parkedCount() > 0);
        let answered = false;
        const answer = dispatch(ask.req, host).then((r) => { answered = true; return r; });
        await until(() => answered, 20);
        expect(answered).toBe(false);
        fx.release();
        expect(await answer).toMatchObject(ask.answer);
        // One walk: the warm-up listed each root once, and nothing listed or read a root synchronously beside it.
        expect(fx.calls.filter((c) => c === `async readDir ${root}/.agents/skills`)).toHaveLength(1);
        expect(fx.calls.filter((c) => c.startsWith('sync readDir'))).toEqual([]);
      } finally { close(); }
    });
  }

  it('a skills request with no warm-up in flight is answered at once', async () => {
    const { host, close } = setup();
    try {
      expect(names(await dispatch({ kind: 'skills.read', workspaceRoot: root }, host))).toEqual(['alpha']);
    } finally { close(); }
  });

  it('a skills request waiting on a warm-up that fails is still answered, and the failure is logged at the open', async () => {
    const { fx, clock, lines, host, opened, close } = setup('cold.sqlite');
    try {
      await dispatch(opened, host);
      fx.fail(new Error('EIO: i/o error, scandir'));
      clock.advance(0);
      // A failure costs nothing: the waiting ask discovers on a cold cache, as any cold ask does.
      expect(names(await dispatch({ kind: 'skills.read', workspaceRoot: root }, host))).toEqual(['alpha']);
      expect(lines).toContain('skills: discovery on workspace open failed: Error: EIO: i/o error, scandir');
    } finally { close(); }
  });
});
