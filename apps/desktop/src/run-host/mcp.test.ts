import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { LoadedConfiguration } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
import { buildPolicy, Gate, PendingApprovals, PolicyContext } from '@rotaris/agent-tools';
import { sessionMetrics } from '@rotaris/engine';
import type { SessionRow } from '@rotaris/store';
import { configurationForExecutionRoot, grantEvidence, McpHost } from './mcp.js';

/**
 * Live-run finding D7 (R-067): the spawn evidence resolved a persona's MCP surface with no reserved names and the tool
 * port resolved it again with the persona's native names reserved, so the first spawn of every persona wrote its
 * surface line and REQ-MCP-059's grant count twice. A resolution that says nothing new is logged once; one the reserved
 * names changed (a collision offered under its prefix) is a different surface, and its line is written. Since 2026-10-01
 * no spawn resolves a surface (the grant is the port's, recorded once it is ready); a resolution with none reserved
 * stands in here for any second reader of the same surface.
 */
describe('a persona\'s MCP lines on its first spawn (REQ-MCP-059, REQ-MCP-065, REQ-TOOLS-010)', () => {
  const tool = (name: string) => ({ name, description: name, inputSchema: { type: 'object' } });

  function host() {
    const lines: { message: string; level: string }[] = [];
    const mcp = new McpHost({ clocks: new FakeClock(), log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [tool('lookup'), tool('notes_read'), tool('notes_write')], failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const cfg = {
      personas: { tester: { mcp_servers: ['ci'], mcp_tools: { ci: ['lookup', 'notes_read'] }, tools: ['read_file', 'grep'] } },
      mcp: { servers: { ci: { name: 'ci', entry, origin: 'workspace', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { ci: 'workspace' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    return { mcp, cfg, lines };
  }
  const surfaceLines = <T extends { message: string }>(lines: readonly T[]) => lines.filter((l) => l.message.startsWith('mcp: surface for tester'));
  const grantLines = <T extends { message: string }>(lines: readonly T[]) => lines.filter((l) => l.message.includes('2 of 3 tools granted on server \'ci\''));

  it('D7: two readers resolving the same surface write its surface line and its grant count once', () => {
    const { mcp, cfg, lines } = host();
    const evidence = grantEvidence(mcp.surfaceFor(cfg, '/ws', 'tester', null));
    const surface = mcp.surfaceFor(cfg, '/ws', 'tester', null, new Set(['read_file', 'grep']));
    expect(evidence.granted).toEqual({ ci: ['lookup', 'notes_read'] });
    expect(surface.active[0]!.tools.map((t) => t.callable)).toEqual(['lookup', 'notes_read']);
    expect(surfaceLines(lines)).toHaveLength(1);
    expect(grantLines(lines)).toHaveLength(1);
    // A later spawn of the same persona reads the memo and writes nothing.
    mcp.surfaceFor(cfg, '/ws', 'tester', null, new Set(['read_file', 'grep']));
    mcp.surfaceFor(cfg, '/ws', 'tester', null);
    expect(surfaceLines(lines)).toHaveLength(1);
    expect(grantLines(lines)).toHaveLength(1);
  });

  // Acceptance finding A41: REQ-MCP-059 calls the grant count a debug log, and it was written at `info`, which
  // PD-MONITOR-002's default threshold keeps in every packaged build. At `debug` it is dropped unless
  // ROTARIS_APP_LOG_LEVEL=debug is set; the persona's surface line stays at `info`.
  it('REQ-MCP-059, PD-MONITOR-002 (A41): the grant count reaches the application log at debug, the surface line at info', () => {
    const { mcp, cfg, lines } = host();
    mcp.surfaceFor(cfg, '/ws', 'tester', null);
    expect(grantLines(lines).map((l) => l.level)).toEqual(['debug']);
    expect(surfaceLines(lines).map((l) => l.level)).toEqual(['info']);
  });

  it('D7: a surface the reserved names changed — a collision offered under its prefix — is a different surface, and its line is written', () => {
    const { mcp, cfg, lines } = host();
    mcp.surfaceFor(cfg, '/ws', 'tester', null);
    const surface = mcp.surfaceFor(cfg, '/ws', 'tester', null, new Set(['read_file', 'lookup']));
    expect(surface.active[0]!.tools.map((t) => t.callable)).toEqual(['ci_lookup', 'notes_read']);
    const written = surfaceLines(lines);
    expect(written).toHaveLength(2);
    expect(written[1]!.message).toContain('ci[ci_lookup,notes_read]');
    // The grant count is the same fact on both resolutions (a prefix renames, it does not narrow): written once.
    expect(grantLines(lines)).toHaveLength(1);
  });

  it('D7: a new configuration load resolves afresh, and the lines are written again for the new resolution', () => {
    const { mcp, cfg, lines } = host();
    mcp.surfaceFor(cfg, '/ws', 'tester', null);
    mcp.newConfiguration({ ...cfg, mcp: { ...cfg.mcp, servers: { ci: { ...cfg.mcp.servers['ci']!, description: { changed: true } } } } } as unknown as LoadedConfiguration);
    mcp.surfaceFor(cfg, '/ws', 'tester', null);
    expect(surfaceLines(lines)).toHaveLength(2);
    expect(grantLines(lines)).toHaveLength(2);
  });
});

/**
 * REQ-WORKSPACE-092/109: the run host's `shutdown` ends the code-intelligence setup under way before the host exits.
 * Before, nothing in the shutdown reached the setup: at an orderly quit of the built app the step's process and one it had
 * started were both still running 5 s after the application exited (measured 2026-10-01;
 * `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).
 * The stand-in runtime here holds `project create`, ignores the ask to terminate, and starts a descendant that ignores it too.
 */
describe('the setup at the run host\'s shutdown (REQ-WORKSPACE-092, REQ-WORKSPACE-109)', () => {
  it.skipIf(process.platform === 'win32')('ends the step under way and what it started, force-killing them after the shutdown\'s grace, and answers once they have gone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-setup-end-'));
    const standIn = join(dir, 'stand-in.cjs');
    writeFileSync(standIn, [
      "const cp = require('node:child_process');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const [group, verb, root] = process.argv.slice(2);',
      "if (group === 'project' && verb === 'create') {",
      "  const g = cp.spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000)\"], { stdio: 'ignore' });",
      '  // Written whole or not at all: a reader never sees the file created and still empty.',
      "  fs.writeFileSync(path.join(root, 'pids.tmp'), `${process.pid} ${g.pid}`);",
      "  fs.renameSync(path.join(root, 'pids.tmp'), path.join(root, 'pids'));",
      "  process.on('SIGTERM', () => {});",
      '  setTimeout(() => {}, 60000);',
      '} else { process.exit(0); }',
      '',
    ].join('\n'));
    const root = join(dir, 'project');
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    const lines: string[] = [];
    const mcp = new McpHost({ clocks: nodeClocks(), log: (message) => { lines.push(message); }, acknowledge: () => undefined, parentEnv: process.env as Record<string, string>, productVersion: '0.0.0' });
    const launch = { command: process.execPath, args: [standIn, 'start-mcp-server'] };
    const cfg = {
      files: { workspace: { agents: join(root, '.rotaris', 'agents.yaml') } },
      mcp: { servers: { code_intelligence: { name: 'code_intelligence', entry: { type: 'stdio', enabled: true, ...launch }, origin: 'workspace', availability: { available: true }, description: { transport: 'stdio', env: {} }, resolved: launch } }, origins: {}, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    expect(mcp.startSetup(cfg, root).ok).toBe(true);
    // The pids are read once the file holds both, each a real pid: a file seen between its creation and its write reads
    // as `[0]`, and pid 0 would name the test's own process group (the race a verifier found at load, 2026-10-01).
    const pidsWritten = (): number[] => {
      try {
        const found = readFileSync(join(root, 'pids'), 'utf8').trim().split(' ').map(Number);
        return found.length === 2 && found.every((pid) => Number.isInteger(pid) && pid > 0) ? found : [];
      } catch { return []; }
    };
    const began = Date.now();
    let pids = pidsWritten();
    while (pids.length === 0 && Date.now() - began < 10_000) {
      await new Promise((r) => setTimeout(r, 20));
      pids = pidsWritten();
    }
    expect(pids, 'the stand-in wrote its pid and its descendant\'s within 10 s').toHaveLength(2);
    const askedAt = Date.now();
    await mcp.endSetup();
    const tookMs = Date.now() - askedAt;
    // A zombie no one has reaped yet is not running (a container's pid 1 may never reap the orphaned descendant).
    const running = (pid: number): boolean => {
      try { process.kill(pid, 0); } catch { return false; }
      try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
    };
    expect(pids.filter(running)).toEqual([]);
    expect(tookMs).toBeLessThan(5_000);
    expect(mcp.setupStatus().state).toBe('finished');
    expect(mcp.setupStatus().outcome).toBe('cancelled');
    expect(lines).toContain('mcp setup: ended by the run host\'s shutdown');
    // Nothing under way: the next shutdown answers at once.
    await mcp.endSetup();
  }, 20_000);
});

/**
 * REQ-WORKSPACE-091/092, REQ-MCP-099/112: the run host carries each step's facts — `skipped`, `output`, `startError` —
 * onto the status beside its own `detail`, so the initialization coordinator can write the step in its own domain's
 * words while the MCP category keeps the run host's (`docs/defects/fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`).
 * Before this case only `workspace-proof`'s scenario 8g read the mapping, in the built app.
 */
describe('the setup step facts on the run host\'s status (REQ-WORKSPACE-091, REQ-WORKSPACE-092, REQ-MCP-099, REQ-MCP-112)', () => {
  const host = (): McpHost => new McpHost({ clocks: nodeClocks(), log: () => undefined, acknowledge: () => undefined, parentEnv: process.env as Record<string, string>, productVersion: '0.0.0' });
  const configFor = (root: string, command: string, args: string[]): LoadedConfiguration => {
    const launch = { command, args: [...args, 'start-mcp-server'] };
    return {
      files: { workspace: { agents: join(root, '.rotaris', 'agents.yaml') } },
      mcp: { servers: { code_intelligence: { name: 'code_intelligence', entry: { type: 'stdio', enabled: true, ...launch }, origin: 'workspace', availability: { available: true }, description: { transport: 'stdio', env: {} }, resolved: launch } }, origins: {}, diagnostics: [] },
    } as unknown as LoadedConfiguration;
  };
  const project = (files: Record<string, string>): string => {
    const root = join(mkdtempSync(join(tmpdir(), 'rotaris-setup-facts-')), 'project');
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  };
  const finished = async (mcp: McpHost) => {
    const began = Date.now();
    while (mcp.setupStatus().state !== 'finished' && Date.now() - began < 10_000) await new Promise((r) => setTimeout(r, 20));
    const status = mcp.setupStatus();
    expect(status.state, 'the setup finished within 10 s').toBe('finished');
    return status;
  };

  it('carries the marker\'s and the no-code skip as `skipped`, beside the run host\'s own detail', async () => {
    const root = project({ '.serena/project.yml': 'name: p\n', 'README.md': '# docs only\n' });
    const mcp = host();
    expect(mcp.startSetup(configFor(root, process.execPath, ['-e', 'process.exit(9)']), root).ok).toBe(true);
    const status = await finished(mcp);
    expect(status.steps.map((s) => [s.id, s.status, s.skipped])).toEqual([
      ['create', 'succeeded', 'marker-present'], ['index', 'skipped-no-code', 'no-code'], ['memory', 'skipped-no-code', 'no-code'],
    ]);
    expect(status.steps[0]!.detail).toContain('the project already exists');
    expect(status.steps.every((s) => s.output === undefined && s.startError === undefined)).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('carries a step\'s output with no prefix, and leaves a step not attempted without facts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-setup-facts-'));
    const standIn = join(dir, 'stand-in.cjs');
    writeFileSync(standIn, [
      'const [group, verb] = process.argv.slice(2);',
      "if (group === 'project' && verb === 'create') { process.stdout.write('made ä\\n'); process.exit(0); }",
      "process.stderr.write('boom'); process.exit(3);",
      '',
    ].join('\n'));
    const root = project({ 'main.ts': 'export {};\n' });
    const mcp = host();
    expect(mcp.startSetup(configFor(root, process.execPath, [standIn]), root).ok).toBe(true);
    const status = await finished(mcp);
    const [create, index, memory] = status.steps;
    expect([create!.status, create!.output, create!.skipped, create!.startError]).toEqual(['succeeded', 'made ä', undefined, undefined]);
    expect([index!.status, index!.output]).toEqual(['failed', 'boom']);
    expect(index!.detail).toBe('exited with code 3; its last output: boom');
    expect([memory!.status, memory!.output, memory!.skipped, memory!.startError]).toEqual(['not-attempted', undefined, undefined, undefined]);
  });

  it('carries a launch that failed as `startError`, the launch\'s own words', async () => {
    const root = project({ 'main.ts': 'export {};\n' });
    const mcp = host();
    const missing = join(root, 'no-such-runtime');
    expect(mcp.startSetup(configFor(root, missing, []), root).ok).toBe(true);
    const status = await finished(mcp);
    const create = status.steps[0]!;
    expect(create.status).toBe('failed');
    expect(create.startError).toContain('ENOENT');
    expect(create.detail).toBe(`the setup command could not be started: ${create.startError}`);
    expect(create.output).toBeUndefined();
  });
});

/**
 * REQ-MCP-034's isolated-run clause (live-run finding D1 at 1763f7f): the run host hands a run in a worktree the view of
 * its configuration bound to that tree, and its launch lines name the project the launched description carried — what
 * the live run's requirements check reads, since the launch line itself is written at debug.
 */
describe('the configuration and the launch lines of a run in an isolated working tree (REQ-MCP-034, REQ-MCP-050)', () => {
  const ws = '/work/ws';
  const tree = '/work/ws/.rotaris/requirements/worktrees/rotaris-req-req-104-u1';
  const loaded = () => {
    const args = ['builtin:code-intelligence', '--', 'start-mcp-server', '--transport', 'stdio', '--project', ws];
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'builtin:code-intelligence', args: ['start-mcp-server', '--transport', 'stdio'] };
    return {
      workspaceRoot: ws,
      personas: { 'coding-agent': { mcp_servers: ['code_intelligence'], mcp_tools: null, tools: [] } },
      mcp: { servers: { code_intelligence: { name: 'code_intelligence', entry, origin: 'default', availability: { available: true }, resolved: { command: '/opt/rotaris', args, builtin: true }, description: { transport: 'stdio', command: '/opt/rotaris', args, env: {}, cwd: ws } } }, origins: { code_intelligence: 'default' }, secrets: [], diagnostics: [] },
    } as unknown as LoadedConfiguration;
  };

  it('a run in the workspace gets the loaded configuration back; a run in a worktree gets the tree\'s root after the project-path option', () => {
    const cfg = loaded();
    expect(configurationForExecutionRoot(cfg, ws)).toBe(cfg);
    const isolated = configurationForExecutionRoot(cfg, tree);
    const d = isolated.mcp.servers['code_intelligence']!.description;
    expect(d.transport === 'stdio' ? d.args.slice(-2) : null).toEqual(['--project', tree]);
    expect(isolated.personas).toBe(cfg.personas);
  });

  it('the discovery line names the project the discovered description carried', async () => {
    const lines: string[] = [];
    const mcp = new McpHost({ clocks: new FakeClock(), log: (message) => { lines.push(message); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    const discovered: unknown[] = [];
    vi.spyOn(mcp.discovery, 'discover').mockImplementation(async (req) => { discovered.push(req.description); return { tools: [], failed: false, memoised: false, elapsedMs: 5 } as unknown as Awaited<ReturnType<typeof mcp.discovery.discover>>; });
    await mcp.prepare(configurationForExecutionRoot(loaded(), tree), tree);
    expect(discovered).toHaveLength(1);
    expect(lines).toContain(`mcp: discovery of 'code_intelligence' (project ${tree}) listed 0 tool(s) in 5 ms`);
  });
});

/**
 * Live-run finding U3 (duress at 1763f7f): code_intelligence exited 127 at discovery, and every child's recorded grant
 * gave it the fate `connected` with an empty grant, which the inspector printed as "CONNECTED / No tools granted".
 * REQ-MCP-114 names tool discovery having failed (REQ-MCP-042) among the reasons a server reads as dropped; the persona
 * prompt still lists it bare (REQ-MCP-048, REQ-MCP-101), so the surface keeps it active and the evidence decides the fate.
 */
describe('the recorded fate of a server whose tool discovery failed (REQ-MCP-114, REQ-MCP-042)', () => {
  function host(failed: boolean) {
    const mcp = new McpHost({ clocks: new FakeClock(), log: () => undefined, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockImplementation(((req: { name: string }) => req.name === 'broken'
      ? { tools: [], failed, detail: failed ? 'Connection closed (broken exited with code 127)' : '' }
      : { tools: [{ name: 'lookup', description: 'lookup', inputSchema: { type: 'object' } }], failed: false }) as unknown as typeof mcp.discovery.peek);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const server = (name: string) => ({ name, entry, origin: 'default', availability: { available: true }, description: { name }, resolved: { command: 'ci', args: [] } });
    const cfg = {
      personas: { tester: { mcp_servers: ['ci', 'broken'], tools: ['read_file'] } },
      mcp: { servers: { ci: server('ci'), broken: server('broken') }, origins: { ci: 'default', broken: 'default' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    return { mcp, cfg };
  }

  it('records the server dropped for failed discovery, with no granted tools under it', () => {
    const { mcp, cfg } = host(true);
    const surface = mcp.surfaceFor(cfg, '/ws', 'tester', null);
    // The prompt half is unchanged: the server stays listed, bare (REQ-MCP-048, REQ-MCP-101).
    expect(surface.active.map((a) => `${a.name}:${a.discoveryFailed}`)).toEqual(['broken:true', 'ci:false']);
    const evidence = grantEvidence(surface);
    expect(evidence.servers).toEqual([
      { name: 'broken', transport: 'stdio', origin: 'default', fate: 'dropped', reason: 'discovery-failed' },
      { name: 'ci', transport: 'stdio', origin: 'default', fate: 'connected' },
    ]);
    expect(evidence.granted).toEqual({ ci: ['lookup'] });
  });

  it('records a server whose discovery succeeded with no tools as connected', () => {
    const { mcp, cfg } = host(false);
    const evidence = grantEvidence(mcp.surfaceFor(cfg, '/ws', 'tester', null));
    expect(evidence.servers.find((s) => s.name === 'broken')).toEqual({ name: 'broken', transport: 'stdio', origin: 'default', fate: 'connected' });
    expect(evidence.granted).toEqual({ broken: [], ci: ['lookup'] });
  });
});

/**
 * Live-run finding U4 (duress at 1763f7f): one failed discovery reached the application log twice — `ToolDiscovery`'s
 * REQ-MCP-048 warning, then this host's "mcp: discovery of '…' failed (…) in N ms" at info 1 ms later, each with the child's
 * whole stderr. The warning is the one record; `prepare` says a success and nothing of a failure.
 */
describe('McpHost.prepare\'s discovery lines (REQ-MCP-048, U4)', () => {
  function host(failed: boolean) {
    const lines: { message: string; level: string }[] = [];
    const mcp = new McpHost({ clocks: new FakeClock(), log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'discover').mockResolvedValue({ tools: failed ? [] : [{ name: 'lookup', description: '', inputSchema: {} }], failed, detail: failed ? 'Connection closed (ci exited with code 127; stderr: first\nsecond)' : '', elapsedMs: 508, memoised: false } as unknown as Awaited<ReturnType<typeof mcp.discovery.discover>>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const cfg = {
      personas: { tester: { mcp_servers: ['ci'], tools: [] } },
      mcp: { servers: { ci: { name: 'ci', entry, origin: 'default', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { ci: 'default' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    return { mcp, cfg, lines };
  }
  const discoveryLines = (lines: readonly { message: string }[]) => lines.filter((l) => l.message.startsWith('mcp: discovery of '));

  it('writes no line of its own for a failed discovery: the failure is the discovery\'s one warning', async () => {
    const { mcp, cfg, lines } = host(true);
    await mcp.prepare(cfg, '/ws');
    expect(discoveryLines(lines)).toEqual([]);
    expect(lines.filter((l) => /first|second/.test(l.message))).toEqual([]);
    expect(lines.map((l) => l.message)).toContain('mcp: discovery for 1 server(s) finished in 0 ms');
  });

  it('says a successful discovery once, with its tool count and time', async () => {
    const { mcp, cfg, lines } = host(false);
    await mcp.prepare(cfg, '/ws');
    expect(discoveryLines(lines).map((l) => l.message)).toEqual(["mcp: discovery of 'ci' listed 1 tool(s) in 508 ms"]);
  });
});

/**
 * Live-run finding G3 (default run at 27a5127): an MCP executor's `schema` was `z.record(z.string(), z.unknown())`
 * while the model was handed the server's `inputSchema`, so the gate's REQ-TOOLS-032 check passed every object and a
 * call missing three required properties was sent to the server
 * (docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md). The executor now checks
 * a call against the schema the model was given; a valid call is sent exactly as the model wrote it.
 */
describe('an MCP call checked against the input schema the model was given (REQ-TOOLS-032, REQ-SESSION-136)', () => {
  // The schema the run's memory-edit tool advertised (model-traffic line 28 of its requirements scenario), under a name of
  // this test's own: REQ-MCP-116 keeps the bundled runtime's tool names in its manifest alone.
  const EDIT_MEMORY = {
    type: 'object', title: 'applyArguments', required: ['memory_name', 'needle', 'repl', 'mode'],
    properties: {
      memory_name: { title: 'Memory Name', type: 'string' }, needle: { title: 'Needle', type: 'string' }, repl: { title: 'Repl', type: 'string' },
      mode: { title: 'Mode', type: 'string', enum: ['literal', 'regex'] }, allow_multiple_occurrences: { title: 'Allow Multiple Occurrences', type: 'boolean', default: false },
    },
  };

  /** What the stubbed server does with a call that reaches it: answer (normally or `isError`), or throw. */
  type Answer = () => { isError: boolean; text: string };
  function rig(inputSchema: Record<string, unknown>, answer: Answer = () => ({ isError: false, text: 'edited' })) {
    const lines: { message: string; level: string }[] = [];
    const mcp = new McpHost({ clocks: new FakeClock(), log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [{ name: 'amend_note', description: 'Replace content in a memory.', inputSchema }], failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    const sent: { tool: string; args: Record<string, unknown> }[] = [];
    vi.spyOn(mcp, 'connectionsFor').mockReturnValue({
      connect: async () => ({ onToolsChanged: () => undefined }),
      call: async (_server: string, _d: unknown, tool: string, args: Record<string, unknown>) => { sent.push({ tool, args }); return answer(); },
    } as unknown as ReturnType<typeof mcp.connectionsFor>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const cfg = {
      personas: { verifier: { mcp_servers: ['notes'], tools: [] } },
      mcp: { servers: { notes: { name: 'notes', entry, origin: 'workspace', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { notes: 'workspace' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    const surface = mcp.surfaceFor(cfg, '/ws', 'verifier', null);
    const executors = mcp.executorsFor({ cfg, workspaceRoot: '/ws', role: 'verifier', surface, ctx: { sessionId: 'S1', writer: null }, remove: () => undefined, log: () => undefined });
    const clock = new FakeClock();
    const issues: Record<string, unknown>[] = [];
    const settles: Record<string, unknown>[] = [];
    let seq = 0;
    const gate = new Gate({
      sessionId: 'S1', workspaceRoot: '/ws', policy: new PolicyContext(buildPolicy({ preset: 'autonomous', workspaceRoot: '/ws' })), approvals: new PendingApprovals(clock),
      attended: () => true, presenter: null, headlessPolicy: 'deny', abortHook: null, approvalTimeoutMs: 300_000,
      executors: new Map(executors.map((e) => [e.name, e])), resolvePath: (p) => p, publicTool: () => false,
      monotonic: clock, wall: clock, timers: clock, nextSequence: () => ++seq,
      sink: {
        decision: () => null, approvalRequested: () => undefined, pendingChanged: () => undefined, issue: (i) => { issues.push(i as Record<string, unknown>); },
        timeline: () => undefined, toolOpen: () => ++seq, toolSettle: (_o, _open, s) => { settles.push(s as Record<string, unknown>); }, warn: () => undefined,
      },
    });
    const dispatch = (args: Record<string, unknown>) => gate.dispatch({ callId: 'c1', name: 'amend_note', rawArgs: args, persona: 'verifier', agentId: 'verifier', agentName: 'verifier' }, new AbortController().signal);
    return { executors, dispatch, sent, issues, settles, lines };
  }

  it('G3: the run\'s call, missing three required properties, is refused at the gate as invalid_request and never sent', async () => {
    const r = rig(EDIT_MEMORY);
    const result = await r.dispatch({ content: 'notes', memory_name: 'req-104' });
    expect(r.sent).toEqual([]);
    expect(result).toMatchObject({ status: 'failed', isError: true });
    expect(result.text).toContain("The arguments for 'amend_note' do not match its schema");
    expect(result.text).toMatch(/needle: .*; repl: .*; mode: /);
    expect(result.text).toContain('Re-issue the call with corrected arguments.');
    expect(r.settles[0]).toMatchObject({ failure_kind: 'invalid_request' });
    expect(r.issues).toEqual([expect.objectContaining({ kind: 'tool_error' })]);
  });

  it('a value outside the advertised enum, or of the wrong type, is refused the same way', async () => {
    const r = rig(EDIT_MEMORY);
    const wrongMode = await r.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'glob' });
    const wrongType = await r.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal', allow_multiple_occurrences: 'yes' });
    expect(r.sent).toEqual([]);
    expect(wrongMode.text).toContain('mode: ');
    expect(wrongType.text).toContain('allow_multiple_occurrences: ');
  });

  it('a valid call is sent unchanged: no default filled in, no property the schema does not name dropped', async () => {
    const r = rig(EDIT_MEMORY);
    const args = { memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal', extra: { kept: true } };
    const result = await r.dispatch(args);
    expect(result).toMatchObject({ status: 'ok', isError: false, text: 'edited' });
    expect(r.sent).toEqual([{ tool: 'amend_note', args }]);
  });

  /*
   * OQ-208, ruled 2026-10-07 under the owner's delegation (R-072): an `outcome_kind` names how a call ended, and `mcp` names a
   * tool family, so an MCP call's record carries none and keeps its `failure_kind`; REQ-SESSION-139 derives its histogram
   * bucket from `status` and `is_error`. Until the ruling every MCP record carried `outcome_kind: 'mcp'`, succeeding or
   * failing alike, and the c2a9444 duress run's failed memory edit sat inside `mcp 17`.
   */
  it('a call the server answers, fails with isError, or fails by throwing settles with no outcome_kind and keeps its failure_kind (OQ-208 as ruled)', async () => {
    const ok = rig(EDIT_MEMORY);
    expect(await ok.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' })).toMatchObject({ status: 'ok', isError: false });
    expect(ok.settles[0]).not.toHaveProperty('outcome_kind');
    expect(ok.issues).toEqual([]);

    const refused = rig(EDIT_MEMORY, () => ({ isError: true, text: 'no such memory' }));
    expect(await refused.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' })).toMatchObject({ status: 'failed', isError: true });
    expect(refused.settles[0]).toMatchObject({ failure_kind: 'tool_error' });
    expect(refused.settles[0]).not.toHaveProperty('outcome_kind');
    expect(refused.issues).toEqual([expect.objectContaining({ kind: 'tool_error' })]);

    const thrown = rig(EDIT_MEMORY, () => { throw new Error('the server went away'); });
    expect(await thrown.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' })).toMatchObject({ status: 'failed', isError: true });
    expect(thrown.settles[0]).toMatchObject({ failure_kind: 'execution_error' });
    expect(thrown.settles[0]).not.toHaveProperty('outcome_kind');

    // REQ-SESSION-139's histogram over the two records: `success` and `tool_error`, and no `mcp` bucket.
    const record = (s: Record<string, unknown>, n: number) => ({ call_id: `c${n}`, agent_name: 'verifier', tool_name: 'amend_note', status: String(s['status']), elapsed_ms: 1, is_error: s['is_error'] ? 1 : 0, outcome_kind: (s['outcome_kind'] as string | undefined) ?? null, failure_kind: (s['failure_kind'] as string | undefined) ?? null });
    const row = { session_id: 'S1', execution_status: 'completed', updated_at: 't', tokens_input: 0, tokens_output: 0, cost: '0', cost_qualifier: 'unknown', tool_calls: 2 } as unknown as SessionRow;
    const histogram = sessionMetrics(row, [record(ok.settles[0]!, 1), record(refused.settles[0]!, 2)], [], [], 0, 0, 0).tool_outcomes;
    expect(histogram).toMatchObject({ success: 1, tool_error: 1 });
    expect(histogram).not.toHaveProperty('mcp');
  });

  it('the model is still handed the server\'s own input schema', () => {
    const r = rig(EDIT_MEMORY);
    expect(r.executors[0]!.parameters).toEqual(EDIT_MEMORY);
  });

  /*
   * The fin18 verifier's probes, through this rig and a real gate: calls the server's own schema accepts, which the first
   * repair refused on every re-issue — a Unicode property escape zod read without the `u` flag, and an object `items` the
   * gate's array repair rewrote before the check saw it
   * (docs/defects/fixed/the-gate-wraps-an-object-in-an-array-where-the-schema-does-not-expect-one.md).
   */
  it('a valid call is sent unchanged when its pattern is a Unicode property escape, and one the pattern refuses is never sent', async () => {
    const r = rig({ type: 'object', required: ['name'], properties: { name: { type: 'string', pattern: '^\\p{L}+$' } } });
    const ok = await r.dispatch({ name: 'Zoë' });
    expect(ok).toMatchObject({ status: 'ok', text: 'edited' });
    const refused = await r.dispatch({ name: 'Zoë 2' });
    expect(refused).toMatchObject({ status: 'failed' });
    expect(r.settles[1]).toMatchObject({ failure_kind: 'invalid_request' });
    expect(r.sent).toEqual([{ tool: 'amend_note', args: { name: 'Zoë' } }]);
  });

  it('a oneOf decided by a pattern, and an enum of objects, accept the calls the server\'s schema accepts (REQ-TOOLS-032)', async () => {
    const r = rig({ type: 'object', properties: {
      src: { oneOf: [
        { type: 'object', required: ['url'], properties: { url: { type: 'string', pattern: '^https://.+' } } },
        { type: 'object', required: ['url'], properties: { url: { type: 'string', pattern: '^file:' } } },
      ] },
      mode: { enum: [{ kind: 'auto' }, 'off'] },
    } });
    expect(await r.dispatch({ src: { url: 'file:/x' }, mode: { kind: 'auto' } })).toMatchObject({ status: 'ok', text: 'edited' });
    expect(await r.dispatch({ src: { url: 'ftp://x' } })).toMatchObject({ status: 'failed' });
    expect(await r.dispatch({ mode: { kind: 'manual' } })).toMatchObject({ status: 'failed' });
    expect(r.settles.slice(1)).toEqual([expect.objectContaining({ failure_kind: 'invalid_request' }), expect.objectContaining({ failure_kind: 'invalid_request' })]);
    expect(r.sent).toEqual([{ tool: 'amend_note', args: { src: { url: 'file:/x' }, mode: { kind: 'auto' } } }]);
  });

  it('an object `items` the server\'s schema names an object is sent as the object, not wrapped in an array (REQ-TOOLS-032)', async () => {
    const r = rig({ type: 'object', required: ['items'], properties: { items: { type: 'object' } } });
    const result = await r.dispatch({ items: { a: 1 } });
    expect(result).toMatchObject({ status: 'ok', text: 'edited' });
    expect(r.sent).toEqual([{ tool: 'amend_note', args: { items: { a: 1 } } }]);
  });

  it('a schema the product cannot compile leaves the tool callable with the object check alone, said once at info (REQ-MCP-052, REQ-MCP-055, REQ-MCP-059)', async () => {
    // A dialect the validator does not read (draft-04): its `required` would refuse the call, and is not asserted.
    const draft4 = { $schema: 'http://json-schema.org/draft-04/schema#', type: 'object', properties: { path: { type: 'string' } }, required: ['path', 'mode'] };
    const r = rig(draft4);
    const result = await r.dispatch({ path: 'a' });
    expect(result).toMatchObject({ status: 'ok', text: 'edited' });
    expect(r.sent).toEqual([{ tool: 'amend_note', args: { path: 'a' } }]);
    const notArgs = await r.dispatch('[1, 2]' as unknown as Record<string, unknown>);
    expect(notArgs).toMatchObject({ status: 'failed' });
    expect(r.sent).toHaveLength(1);
    const said = r.lines.filter((l) => l.message.includes('could not be compiled'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ level: 'info' });
    expect(said[0]!.message).toContain("'amend_note' on MCP server 'notes'");
  });
});
