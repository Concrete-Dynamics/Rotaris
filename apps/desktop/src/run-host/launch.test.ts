import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { CommandRequestSchema, RunHostRequestSchema } from '@rotaris/contracts';
import type { LiveState } from '@rotaris/config';
import { Sessions } from '@rotaris/engine';
import { answer, DefaultAgentBackend, ScriptedModelClient } from '@rotaris/model';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import type { ConfiguredRun, ConfigureDeps } from './configuration.js';
import { launchSession, leasedSetup, leaseForContinuation, LeaseReportLog, type LaunchRequest } from './launch.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('launch configuration ownership (REQ-TRACE-470/471, REQ-SESSION-138)', () => {
  let dir: string;
  let dal: StoreDal;
  let sessions: Sessions;
  let configuration: ConfigureDeps;
  let live: LiveState;
  let holdPreflight: Promise<void>;
  const setups = new Map<string, ConfiguredRun>();
  const file = (root: string) => join(root, '.rotaris', 'agents.yaml');
  const save = (root: string, model = 'first', mode = 'ask') => {
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    mkdirSync(join(root, 'prompts'), { recursive: true });
    writeFileSync(join(root, 'prompts', 'coding.md'), 'Resolved coding prompt.');
    writeFileSync(file(root), `default_persona: coding-agent\nmodels:\n  selected:\n    provider: openai\n    model_id: ${model}\n    api_key: config-secret\n    auth_provider: provider-one\nlarge_model: selected\nmedium_model: selected\nsmall_model: selected\npersonas:\n  coding-agent:\n    name: Coding agent\n    model: selected\n    system_prompt_file: prompts/coding.md\nruntime:\n  permission_mode: ${mode}\n  max_iterations: 1\n  allow_unsandboxed_autonomous: false\ncompressor:\n  threshold_percentage: 71\nhooks:\n  - event: session_end\n    command: notify --token hook-secret\nmcp_servers:\n  remote:\n    type: http\n    url: https://user:url-secret@example.test/mcp\n    headers:\n      Authorization: Bearer header-secret\n`);
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-launch-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    const clocks = new FakeClock();
    live = { runtime: { permission_mode: 'ask', max_iterations: 17 } };
    setups.clear();
    holdPreflight = Promise.resolve();
    configuration = { clocks, globalDir: join(dir, 'global'), env: {}, scriptedClient: () => { throw new Error('unexpected scripted configuration'); }, onRequest: () => {}, log: () => {}, liveState: () => live, bearers: () => ({}) };
    sessions = new Sessions({
      clocks, pid: 500, host: mintMachineId('0000000000000000000000000000000a'), retentionCap: 20_000,
      warn: () => {}, mintSessionId: () => 'unused', model: null,
      configure: () => { throw new Error('a prepared launch reloaded configuration'); },
      attended: () => false,
      preflight: async () => {
        await holdPreflight;
        return { intent: { category: 'moderate_feature', confidence: null, reason: 'scripted', fallback: true, carried_over: false }, grant: 'none', route: 'work', resolvedPlaybooks: {}, playbookFor: () => '', budgetCell: null, warnings: [] };
      },
      publisher: { increment: () => {}, snapshot: () => {} },
      sessionFilesDir: (_store, id) => join(dir, 'sessions', id),
    });
    save(dir);
  });
  afterEach(async () => {
    await Promise.all([...setups.keys()].map((id) => sessions.running(asSessionId(id))));
    dal.db.close();
    forgetSpelling(dir);
    rmSync(dir, { recursive: true, force: true });
  });
  const launch = (id: string, leaseCredentials: (providers: readonly string[]) => Promise<Readonly<Record<string, string>>>, board = false, root = dir) => {
    const req: LaunchRequest = { kind: 'session.start', workspaceId: root, sessionId: id, prompt: 'answer', ...(board ? { boardPermissions: 'permissive' } : {}) };
    return launchSession(req, {
      workspaceRoot: root, attended: true, configuration, leaseCredentials,
      start: (setup) => {
        setups.set(id, setup);
        // The production configuration and session writer run; the provider adapter answers locally.
        return sessions.start(dal, root, req.prompt, { sessionId: id, setup: { ...setup, model: { ...setup.model, backend: new DefaultAgentBackend(new ScriptedModelClient([answer('done')])) } } });
      },
    });
  };

  it('overlapping board and composer starts retain their captured settings across a delayed lease', async () => {
    const waiting = deferred<Readonly<Record<string, string>>>();
    const lease = vi.fn(() => waiting.promise);
    const saved = readFileSync(file(dir), 'utf8');
    const board = launch('board', lease, true);
    expect(lease).toHaveBeenCalledWith(['provider-one']);
    expect(live).toEqual({ runtime: { permission_mode: 'ask', max_iterations: 17 } });
    live = { runtime: { permission_mode: 'restricted', max_iterations: 23 } };
    save(dir, 'second');
    expect(await launch('composer', async () => ({ 'provider-one': 'composer-bearer' }))).toMatchObject({ kind: 'session.started' });
    waiting.resolve({ 'provider-one': 'board-bearer' });
    expect(await board).toMatchObject({ kind: 'session.started' });
    const b = setups.get('board')!;
    const c = setups.get('composer')!;
    expect(b.runtime).toMatchObject({ permissionMode: 'autonomous', allowUnsandboxedAutonomous: true, iterationLimit: 17 });
    expect(c.runtime).toMatchObject({ permissionMode: 'restricted', allowUnsandboxedAutonomous: false, iterationLimit: 23 });
    expect(b.model.config.model.modelId).toBe('first');
    expect(c.model.config.model.modelId).toBe('second');
    expect(await b.model.config.credentialFor(b.model.config.model)()).toBe('board-bearer');
    expect(await c.model.config.credentialFor(c.model.config.model)()).toBe('composer-bearer');
    expect(b.resilience?.catalogue.find((entry) => entry.key === 'selected')?.usable).toBe(true);
    await Promise.all([sessions.running(asSessionId('board')), sessions.running(asSessionId('composer'))]);
    expect(dal.getSession(asSessionId('board'))?.permission_mode).toBe('autonomous');
    expect(dal.getSession(asSessionId('composer'))?.permission_mode).toBe('restricted');
    expect(JSON.parse(dal.getLaunchAudit(asSessionId('board'))!.payload)).toMatchObject({ permission_mode: 'autonomous', config_snapshot: {
      default_persona: 'coding-agent',
      runtime: { permission_mode: 'autonomous', allow_unsandboxed_autonomous: true, max_iterations: 17 },
      compressor: { threshold_percentage: 71 },
      models: { selected: { api_key: '[redacted]' } },
      personas: { 'coding-agent': { system_prompt_file: 'prompts/coding.md', resolved_system_prompt: 'Resolved coding prompt.' } },
      hooks: { entries: [{ command: 'notify --token ***' }] },
      mcp_servers: { remote: { headers: { Authorization: '[redacted]' } } },
    } });
    expect(JSON.parse(dal.getLaunchAudit(asSessionId('composer'))!.payload)).toMatchObject({ permission_mode: 'restricted', config_snapshot: { runtime: { permission_mode: 'restricted', allow_unsandboxed_autonomous: false, max_iterations: 23 } } });
    expect(dal.getLaunchAudit(asSessionId('board'))!.payload).not.toContain('board-bearer');
    expect(dal.getLaunchAudit(asSessionId('board'))!.payload).not.toContain('config-secret');
    expect(dal.getLaunchAudit(asSessionId('board'))!.payload).not.toContain('hook-secret');
    expect(dal.getLaunchAudit(asSessionId('board'))!.payload).not.toContain('header-secret');
    expect(dal.getLaunchAudit(asSessionId('board'))!.payload).not.toContain('url-secret');
    expect(live).toEqual({ runtime: { permission_mode: 'restricted', max_iterations: 23 } });
    expect(readFileSync(file(dir), 'utf8')).toBe(saved.replace('first', 'second'));
  });

  it('two workspaces retain their model and permission configuration when leases finish in reverse order', async () => {
    const other = join(dir, 'other');
    save(other, 'other-model');
    const waiting = deferred<Readonly<Record<string, string>>>();
    const board = launch('board', () => waiting.promise, true);
    await launch('other', async () => ({ 'provider-one': 'other-bearer' }), false, other);
    waiting.resolve({ 'provider-one': 'board-bearer' });
    await board;
    expect(setups.get('other')?.runtime.permissionMode).toBe('ask');
    expect(setups.get('other')?.model.config.model.modelId).toBe('other-model');
    expect(setups.get('board')?.runtime.permissionMode).toBe('autonomous');
  });

  it.each(['missing', 'throwing'] as const)('a %s credential lease refuses the board launch and preserves settings for the next run', async (failure) => {
    const saved = readFileSync(file(dir), 'utf8');
    const reply = await launch('refused', async () => { if (failure === 'throwing') throw new Error('lease failed'); return {}; }, true);
    expect(reply).toMatchObject({ kind: 'refused', code: 'session.provider-auth' });
    expect(setups.size).toBe(0);
    expect(dal.getSession(asSessionId('refused'))).toBeUndefined();
    await launch('next', async () => ({ 'provider-one': 'next-bearer' }));
    expect(setups.get('next')?.runtime).toMatchObject({ permissionMode: 'ask', allowUnsandboxedAutonomous: false, iterationLimit: 17 });
    expect(live).toEqual({ runtime: { permission_mode: 'ask', max_iterations: 17 } });
    expect(readFileSync(file(dir), 'utf8')).toBe(saved);
  });

  it('a thrown session start preserves live settings and saved configuration', async () => {
    const saved = readFileSync(file(dir), 'utf8');
    await expect(launchSession({ kind: 'session.start', workspaceId: dir, prompt: 'answer', boardPermissions: 'permissive' }, {
      workspaceRoot: dir, attended: true, configuration,
      leaseCredentials: async () => ({ 'provider-one': 'bearer' }),
      start: () => { throw new Error('store failed'); },
    })).rejects.toThrow('store failed');
    expect(live).toEqual({ runtime: { permission_mode: 'ask', max_iterations: 17 } });
    expect(readFileSync(file(dir), 'utf8')).toBe(saved);
  });

  it('a prompt rejected during an active run preserves its prepared setup', async () => {
    const waiting = deferred<void>();
    holdPreflight = waiting.promise;
    try {
      await launch('active', async () => ({ 'provider-one': 'bearer' }), true);
      // The configure adapter throws if a refused prompt attempts another load.
      expect(sessions.prompt(asSessionId('active'), 'another prompt')).toMatchObject({ ok: false, error: { code: 'run-active' } });
    } finally {
      waiting.resolve();
    }
  });

  /**
   * REQ-NOTIFY-060/061 with REQ-SANDBOX-095/097/120: a confinement mode the host cannot deliver (no confinement service
   * is wired here, which the gate reads as unavailable) is refused before any lease or session, as its own class —
   * `session.confinement` — carrying the backend's wording as the detail. It read `session.configuration` before the
   * repair, so main could not tell it from any other configuration refusal.
   */
  it('a refused confinement mode is refused as its own class, before a lease or a session', async () => {
    writeFileSync(file(dir), readFileSync(file(dir), 'utf8').replace('  allow_unsandboxed_autonomous: false\n', '  allow_unsandboxed_autonomous: false\n  sandbox_mode: workspace-write\n'));
    const lease = vi.fn(async () => ({ 'provider-one': 'bearer' }));
    const refused = await launch('confined', lease);
    expect(refused).toMatchObject({ kind: 'refused', code: 'session.confinement', headline: 'The run was refused before it started' });
    expect(refused.kind === 'refused' ? refused.detail : '').not.toBe('');
    expect(lease).not.toHaveBeenCalled();
    expect(setups.size).toBe(0);
  });

  it('fatal configuration refuses before requesting credentials or creating a session', async () => {
    writeFileSync(file(dir), 'runtime: [invalid]\n');
    const lease = vi.fn(async () => ({ 'provider-one': 'bearer' }));
    expect(await launch('invalid', lease, true)).toMatchObject({ kind: 'refused', code: 'session.configuration' });
    expect(lease).not.toHaveBeenCalled();
    expect(setups.size).toBe(0);
    expect(live).toEqual({ runtime: { permission_mode: 'ask', max_iterations: 17 } });
  });

  it('the grant crosses the main-to-host contract and is stripped from a renderer start', () => {
    const request = { kind: 'session.start', workspaceId: dir, prompt: 'answer', boardPermissions: 'permissive' };
    expect(RunHostRequestSchema.parse(request)).toHaveProperty('boardPermissions', 'permissive');
    expect(CommandRequestSchema.parse(request)).not.toHaveProperty('boardPermissions');
    expect(RunHostRequestSchema.safeParse({ ...request, boardPermissions: 'anything' }).success).toBe(false);
  });
});

describe('the continuation lease (REQ-PROVIDER-066; a defect note, removed once repaired)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-lease-'));
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), `models:\n  selected:\n    provider: openai\n    model_id: m\n    auth_provider: provider-one\nlarge_model: selected\n`);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const deps = (leaseCredentials: (providers: readonly string[]) => Promise<Readonly<Record<string, string>>>) => ({
    workspaceRoot: dir, attended: true, configuration: {
      clocks: new FakeClock(), globalDir: join(dir, 'global'), env: {}, scriptedClient: () => { throw new Error('not scripted'); },
      onRequest: () => {}, log: () => {}, liveState: () => ({}), bearers: () => ({}),
    }, leaseCredentials,
  });

  it('a lease main resolves publishes the fresh bearers the continuation run will read per request', async () => {
    const seen: string[][] = [];
    const r = await leaseForContinuation(dir, deps(async (providers) => { seen.push([...providers]); return { 'provider-one': 'fresh-bearer' }; }));
    expect(r).toEqual({ kind: 'leased', bearers: { 'provider-one': 'fresh-bearer' } });
    expect(seen).toEqual([['provider-one']]);
  });

  it('an entry provider main cannot resolve refuses with REQ-WORKSPACE-137\'s sentence, as a launch does', async () => {
    const r = await leaseForContinuation(dir, deps(async () => ({})));
    expect(r).toMatchObject({ kind: 'refused', reply: { kind: 'refused', code: 'session.provider-auth' } });
  });

  it('a lease main does not answer refuses, as a launch does — the entry provider is unresolved', async () => {
    const r = await leaseForContinuation(dir, deps(async () => { throw new Error('main did not answer'); }));
    expect(r).toMatchObject({ kind: 'refused', reply: { kind: 'refused', code: 'session.provider-auth' } });
  });

  it('REQ-PROVIDER-068: the opening report is whole, an unchanged one is silent, and only a change is said', () => {
    const lines: string[] = [];
    const reports = new LeaseReportLog();
    const unresolved = { authenticated: ['openrouter'], unresolved: { codex: 'Authentication expired; re-authentication required.', copilot: 'Authentication required' } };
    // The launch: the whole report, which is the one REQ-PROVIDER-068 requires.
    reports.report(dir, unresolved, (m) => lines.push(m));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('leased for openrouter');
    expect(lines[0]).toContain('codex (Authentication expired; re-authentication required.)');
    // Three continuations over state that has not moved: a prompt, a plan decision and a continue.
    for (let i = 0; i < 3; i += 1) reports.report(dir, unresolved, (m) => lines.push(m));
    expect(lines).toHaveLength(1);
    // A provider that authenticated since is said, and only it.
    reports.report(dir, { authenticated: ['openrouter', 'codex'], unresolved: { copilot: 'Authentication required' } }, (m) => lines.push(m));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(`credentials (workspace ${dir}): codex is authenticated`);
    // A reason that changed is said too; another workspace root keeps its own opening report.
    reports.report(dir, { authenticated: ['openrouter', 'codex'], unresolved: { copilot: 'Authentication expired; re-authentication required.' } }, (m) => lines.push(m));
    expect(lines[2]).toContain('copilot is unresolved — Authentication expired');
    reports.report(`${dir}-other`, unresolved, (m) => lines.push(m));
    expect(lines[3]).toContain(`(workspace ${dir}-other)`);
    expect(lines[3]).toContain('leased for openrouter');
    // A lease main did not answer reports nothing at all, and leaves the remembered report alone.
    reports.report(dir, null, (m) => lines.push(m));
    expect(lines).toHaveLength(4);
  });

  /*
   * PD-LIBRARY-002 with ADR-0030 (the live run at ce5f952, F2): a retrospective's setup is completed over the bearers its own
   * lease returned, whatever the workspace's last published map holds (`configuration.bearers`, empty here, as it is in a launch
   * no run has leased in).
   */
  it('leasedSetup: the setup a retrospective runs on sends the bearer it leased, not the empty map a launch with no run holds', async () => {
    const r = await leasedSetup(dir, deps(async () => ({ 'provider-one': 'fresh-bearer' })));
    expect(r.kind).toBe('configured');
    if (r.kind !== 'configured') return;
    expect(r.bearers).toEqual({ 'provider-one': 'fresh-bearer' });
    expect(await r.setup.model.config.credentialFor(r.setup.model.config.model)()).toBe('fresh-bearer');
  });

  /*
   * PD-LIBRARY-002 revision 5 (OQ-300, ruled under R-072): the retrospective's refusal takes REQ-WORKSPACE-137's code and headline
   * with a detail naming the retrospective, which continues no run; the continuation keeps its own sentence.
   */
  it('leasedSetup: an entry provider main cannot resolve refuses with the retrospective\'s sentence, and a configuration that will not load says why', async () => {
    expect(await leasedSetup(dir, deps(async () => ({})))).toEqual({ kind: 'refused', reply: { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before running a retrospective.' } });
    expect(await leaseForContinuation(dir, deps(async () => ({})))).toEqual({ kind: 'refused', reply: { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before continuing this run.' } });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), 'runtime: [invalid]\n');
    const lease = vi.fn(async () => ({ 'provider-one': 'fresh-bearer' }));
    expect(await leasedSetup(dir, deps(lease))).toMatchObject({ kind: 'unconfigured', reason: expect.stringMatching(/^The configuration could not be loaded/) });
    expect(lease).not.toHaveBeenCalled();
  });

  it('a configuration that will not load leases nothing — setupFor refuses with its real report instead', async () => {
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), 'runtime: [invalid]\n');
    const lease = vi.fn(async () => ({ 'provider-one': 'fresh-bearer' }));
    const r = await leaseForContinuation(dir, deps(lease));
    expect(r).toEqual({ kind: 'leased', bearers: {} });
    expect(lease).not.toHaveBeenCalled();
  });
});
