import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { CODE_INTELLIGENCE_MANIFEST, CODE_INTELLIGENCE_PROJECT_FILE_BYTES, type LoadedConfiguration } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
import { buildPolicy, Gate, PendingApprovals, PolicyContext, realPathOf } from '@rotaris/agent-tools';
import { sessionMetrics } from '@rotaris/engine';
import type { SessionRow } from '@rotaris/store';
import { configurationForExecutionRoot, grantEvidence, McpHost } from './mcp.js';

/**
 * Each test's scratch directory below the temporary directory, removed after the test so a run leaves none behind
 * (docs/defects/fixed/unit-tests-leave-their-temporary-directories-behind.md).
 */
const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

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

  // REQ-MCP-005: a callable a `tool_name_map` renamed carries its reported name in the evidence, so the engine's readers ask the
  // binding manifest by it (docs/defects/fixed/a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write.md).
  it('REQ-MCP-005: the evidence maps a granted renamed callable to its reported name, and says nothing where none is renamed', () => {
    const plain = host();
    expect(grantEvidence(plain.mcp.surfaceFor(plain.cfg, '/ws', 'tester', null)).renamed).toBeUndefined();
    const { mcp, cfg } = host();
    const ci = (cfg.mcp.servers as Record<string, { entry: { tool_name_map: Record<string, string> } }>)['ci']!;
    ci.entry.tool_name_map = { lookup: 'find', notes_write: 'jot' };
    const evidence = grantEvidence(mcp.surfaceFor(cfg, '/ws', 'tester', null));
    expect(evidence.granted).toEqual({ ci: ['find', 'notes_read'] });
    // `notes_write` is renamed but not granted, so it is not carried.
    expect(evidence.renamed).toEqual({ ci: { find: 'lookup' } });
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
  // Run on Windows too since 2026-10-20 (the Windows ARM64 session's B8): the stand-in's SIGTERM handlers are inert there, the
  // ask is `taskkill /T`, which neither process answers, and `/T /F` ends both after the grace: 2,549-2,626 ms in three runs,
  // under REQ-WORKSPACE-109's 5 s.
  it('ends the step under way and what it started, force-killing them after the shutdown\'s grace, and answers once they have gone', async () => {
    const dir = scratchDir('rotaris-setup-end-');
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
    const root = join(scratchDir('rotaris-setup-facts-'), 'project');
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
    const dir = scratchDir('rotaris-setup-facts-');
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
  type Answer = (signal: AbortSignal, hostClock: FakeClock) => { isError: boolean; text: string } | Promise<{ isError: boolean; text: string }>;
  function rig(inputSchema: Record<string, unknown>, answer: Answer = () => ({ isError: false, text: 'edited' })) {
    const lines: { message: string; level: string }[] = [];
    const hostClock = new FakeClock();
    const mcp = new McpHost({ clocks: hostClock, log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [{ name: 'amend_note', description: 'Replace content in a memory.', inputSchema }], failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    const sent: { tool: string; args: Record<string, unknown> }[] = [];
    vi.spyOn(mcp, 'connectionsFor').mockReturnValue({
      connect: async () => ({ onToolsChanged: () => undefined }),
      call: async (_server: string, _d: unknown, tool: string, args: Record<string, unknown>, _timeoutMs: number, signal: AbortSignal) => { sent.push({ tool, args }); return answer(signal, hostClock); },
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
    const dispatch = (args: Record<string, unknown>, signal: AbortSignal = new AbortController().signal) => gate.dispatch({ callId: 'c1', name: 'amend_note', rawArgs: args, persona: 'verifier', agentId: 'verifier', agentName: 'verifier' }, signal);
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

  /*
   * PD-TOOLS-013 revision 2 (OQ-238, GC1, ruled 2026-10-13 under R-072): a call its run cancels reads `interrupted` and files
   * no issue, whatever the tool. The MCP SDK call receives the run's signal (packages/mcp/src/client.ts), and its throw on
   * the abort was recorded `execution_error` with a `tool_error` warning. The allowance-timeout reading is tested first, as
   * fetch tests its deadline before the abort.
   */
  it('a call the run cancels reads interrupted and files no issue; an exhausted allowance still reads timeout; a fault with no cancel still reads execution_error', async () => {
    const run = new AbortController();
    const cut = rig(EDIT_MEMORY, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('This operation was aborted')), { once: true });
      queueMicrotask(() => run.abort());
    }));
    const r = await cut.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' }, run.signal);
    expect(r).toMatchObject({ status: 'failed', isError: true, interrupted: true });
    expect(r.text).toBe("The call to 'amend_note' on MCP server 'notes' was cancelled by the run before it completed; it was not retried.");
    expect(cut.settles[0]).toMatchObject({ failure_kind: 'interrupted' });
    expect(cut.settles[0]).not.toHaveProperty('outcome_kind');
    expect(cut.issues).toEqual([]);

    const exhausted = rig(EDIT_MEMORY, (_signal, hostClock) => { hostClock.advance(300_000); throw new Error('MCP error -32001: Request timed out'); });
    const t = await exhausted.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' });
    expect(t.interrupted).toBeUndefined();
    expect(exhausted.settles[0]).toMatchObject({ failure_kind: 'timeout' });
    expect(exhausted.issues).toEqual([expect.objectContaining({ kind: 'terminal_timeout', severity: 'error' })]);

    const fault = rig(EDIT_MEMORY, () => { throw new Error('the server went away'); });
    const f = await fault.dispatch({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' });
    expect(f.interrupted).toBeUndefined();
    expect(fault.settles[0]).toMatchObject({ failure_kind: 'execution_error' });
    expect(fault.issues).toEqual([expect.objectContaining({ kind: 'tool_error', severity: 'warning' })]);
  });

  it('an allowance that ran out as the run cancelled reads timeout: the allowance is tested before the abort (PD-TOOLS-013 revision 2, fin34\'s review)', async () => {
    // Both land together: the server's timeout error after the whole allowance, the run's signal already aborted. Swapping the
    // two tests in the executor's catch would read this call interrupted.
    const run = new AbortController();
    const both = rig(EDIT_MEMORY, (_signal, hostClock) => { hostClock.advance(300_000); run.abort(); throw new Error('MCP error -32001: Request timed out'); });
    const ctx = { workspaceRoot: '/ws', sessionId: 'S1', agentName: 'verifier', persona: 'verifier', monotonic: new FakeClock(), wall: new FakeClock(), signal: run.signal, warn: () => undefined };
    const obs = await both.executors[0]!.execute({ memory_name: 'm', needle: 'a', repl: 'b', mode: 'literal' }, ctx as never);
    expect(obs).toMatchObject({ isError: true, failureKind: 'timeout' });
    expect(obs.text).toContain('within its allowance of 300 s');
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

/**
 * OQ-245 (XE1, ruled 2026-10-13 under R-072): a cross-file code-intelligence EDIT call changes files its arguments do not
 * name, so the run host observes what it can reach before and after it, whatever it returned
 * (docs/defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
 */
describe('a cross-file EDIT call is observed by the files it changed (OQ-245)', () => {
  // The bundled runtime's names come from the manifest alone (REQ-MCP-116).
  const ACROSS = CODE_INTELLIGENCE_MANIFEST.tiers.edit.replaceAcrossFiles;
  const SCHEMA = { type: 'object', properties: { needle: { type: 'string' }, repl: { type: 'string' }, mode: { type: 'string' }, relative_path: { type: 'string' }, dry_run: { type: 'boolean' } }, required: ['needle', 'repl', 'mode'] };
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  function rig(answer: (root: string) => { isError: boolean; text: string }, serverName = 'code_intelligence') {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-oq245-'));
    roots.push(root);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.ts'), 'export const total = 1;\n');
    writeFileSync(join(root, 'src', 'b.ts'), 'import { total } from "./a";\n');
    writeFileSync(join(root, 'README.md'), 'total\n');
    const mcp = new McpHost({ clocks: new FakeClock(), log: () => undefined, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [{ name: ACROSS, description: 'Replace across files.', inputSchema: SCHEMA }], failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    vi.spyOn(mcp, 'connectionsFor').mockReturnValue({
      connect: async () => ({ onToolsChanged: () => undefined }),
      call: async () => answer(root),
    } as unknown as ReturnType<typeof mcp.connectionsFor>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const cfg = {
      personas: { refactorer: { mcp_servers: [serverName], tools: [] } },
      mcp: { servers: { [serverName]: { name: serverName, entry, origin: 'workspace', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { [serverName]: 'workspace' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    const surface = mcp.surfaceFor(cfg, root, 'refactorer', null);
    const executors = mcp.executorsFor({ cfg, workspaceRoot: root, role: 'refactorer', surface, ctx: { sessionId: 'S1', writer: null }, remove: () => undefined, log: () => undefined });
    const executor = executors.find((e) => e.name === ACROSS)!;
    const ctx = { workspaceRoot: root, sessionId: 'S1', agentName: 'refactorer', persona: 'refactorer', monotonic: new FakeClock(), wall: new FakeClock(), signal: new AbortController().signal, warn: () => undefined };
    return { mcp, root, run: (args: Record<string, unknown>) => executor.execute(args, ctx) };
  }

  it('a whole-project replacement that writes two files and then errs carries both, with its error, on its observation', async () => {
    const r = rig((root) => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      writeFileSync(join(root, 'src', 'b.ts'), 'import { sum } from "./a";\n');
      return { isError: true, text: 'Error: README.md could not be written' };
    });
    const obs = await r.run({ needle: 'total', repl: 'sum', mode: 'literal' });
    expect(obs).toMatchObject({ isError: true, failureKind: 'tool_error', observedPaths: ['src/a.ts', 'src/b.ts'] });
  });

  it('what another agent\'s file tools noted meanwhile is left out, and a preview observes nothing', async () => {
    let journal: { note: (agent: string, paths: string[]) => void } | null = null;
    const r = rig((root) => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      writeFileSync(join(root, 'README.md'), 'a sibling wrote this\n');
      journal!.note('docs-writer', [join(root, 'README.md')]);
      return { isError: false, text: 'Replaced 1 occurrence(s) in 1 file(s)' };
    });
    journal = r.mcp.writes;
    expect((await r.run({ needle: 'total', repl: 'sum', mode: 'literal', relative_path: '' })).observedPaths).toEqual(['src/a.ts']);
    expect((await r.run({ needle: 'total', repl: 'sum', mode: 'literal', dry_run: true })).observedPaths).toBeUndefined();
  });

  it('another server\'s tool named like a cross-file EDIT tool is not observed: the EDIT tier is the code-intelligence server\'s (REQ-MCP-015)', async () => {
    // Before the repair the executor asked the name alone, so a user's own server's tool called like the tier was walked
    // over the whole project and its changes read as an EDIT call's
    // (docs/defects/fixed/another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md).
    const r = rig((root) => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      return { isError: false, text: 'done' };
    }, 'notes');
    const obs = await r.run({ needle: 'total', repl: 'sum', mode: 'literal' });
    expect(obs).toMatchObject({ isError: false });
    expect(obs.observedPaths).toBeUndefined();
    expect(obs.unobserved).toBeUndefined();
  });

  it('a call whose reach cannot be walked is marked unobserved, also when it errs (the fin35 review)', async () => {
    const r = rig(() => ({ isError: true, text: 'Error: the path is outside the project' }));
    const obs = await r.run({ needle: 'total', repl: 'sum', mode: 'literal', relative_path: '../elsewhere' });
    expect(obs).toMatchObject({ isError: true, unobserved: true });
    expect(obs.observedPaths).toBeUndefined();
    const fine = await r.run({ needle: 'total', repl: 'sum', mode: 'literal' });
    expect(fine.unobserved).toBeUndefined();
  });
});

/*
 * PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072): the pinned runtime answered a symbol rename before its language server had
 * loaded the project, so the first rename of a server session renamed the declaring file alone and said it succeeded
 * (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md). Before
 * forwarding the rename the run host sends the referencing-symbol search of the same symbol and file and discards its answer,
 * both within the rename's one REQ-MCP-003 allowance; the search writes no record. The runtime's names and argument names come
 * from the manifest alone (REQ-MCP-116).
 */
describe('a symbol rename is preceded by the referencing-symbol search of the same symbol (PD-MCP-004)', () => {
  const { read, edit } = CODE_INTELLIGENCE_MANIFEST.tiers;
  const [NAME_PATH, RELATIVE_PATH] = CODE_INTELLIGENCE_MANIFEST.warmUps.renameSymbol.arguments as readonly [string, string];
  const SYMBOL_SCHEMA = { type: 'object', properties: { [NAME_PATH]: { type: 'string' }, [RELATIVE_PATH]: { type: 'string' }, new_name: { type: 'string' }, body: { type: 'string' } }, required: [NAME_PATH, RELATIVE_PATH] };
  const RENAME = { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js', new_name: 'countRemaining' };
  type Sent = { tool: string; args: Record<string, unknown>; timeoutMs: number; quiet: boolean };
  type Reply = { isError: boolean; text: string };
  /** The stubbed server: what it does with each request that reaches it, by the tool's reported name. */
  type Answer = (tool: string, signal: AbortSignal, hostClock: FakeClock) => Reply | Promise<Reply>;
  const renamed: Answer = (tool) => ({ isError: false, text: tool === edit.renameSymbol ? 'Successfully renamed (3 changes applied)' : '[{"refs": 2}]' });

  function rig(answer: Answer = renamed, opts: { server?: string; toolNameMap?: Record<string, string> } = {}) {
    const serverName = opts.server ?? 'code_intelligence';
    const root = scratchDir('rotaris-pdmcp004-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'todos.js'), 'export const remaining = 1;\n');
    // A project file covers the workspace, so revision 2's clause 5 (the product's own project file) does not apply here: these
    // cases are clauses 1 to 4 as fin43 built them. Clause 5's cases, with each of these exits, are under "PD-MCP-004 revision 2
    // (OQ-362)" below.
    writeFileSync(join(root, 'tsconfig.json'), '{}\n');
    const lines: { message: string; level: string }[] = [];
    const hostClock = new FakeClock();
    const mcp = new McpHost({ clocks: hostClock, log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    // The persona is offered the rename and another EDIT tool; the search is not granted, and needs no grant (REQ-MCP-064's reading).
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [edit.renameSymbol, edit.replaceSymbolBody].map((name) => ({ name, description: 'x', inputSchema: SYMBOL_SCHEMA })), failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    const sent: Sent[] = [];
    vi.spyOn(mcp, 'connectionsFor').mockReturnValue({
      connect: async () => ({ onToolsChanged: () => undefined }),
      call: async (_server: string, _d: unknown, tool: string, args: Record<string, unknown>, timeoutMs: number, signal: AbortSignal, opts?: { quiet?: boolean }) => { sent.push({ tool, args, timeoutMs, quiet: opts?.quiet === true }); return answer(tool, signal, hostClock); },
    } as unknown as ReturnType<typeof mcp.connectionsFor>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: opts.toolNameMap ?? {}, command: 'ci' };
    const cfg = {
      personas: { refactorer: { mcp_servers: [serverName], tools: [] } },
      mcp: { servers: { [serverName]: { name: serverName, entry, origin: 'workspace', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { [serverName]: 'workspace' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    const surface = mcp.surfaceFor(cfg, root, 'refactorer', null);
    const executors = mcp.executorsFor({ cfg, workspaceRoot: root, role: 'refactorer', surface, ctx: { sessionId: 'S1', writer: null }, remove: () => undefined, log: () => undefined });
    const clock = new FakeClock();
    const issues: Record<string, unknown>[] = [];
    const settles: Record<string, unknown>[] = [];
    let seq = 0;
    const gate = new Gate({
      sessionId: 'S1', workspaceRoot: root, policy: new PolicyContext(buildPolicy({ preset: 'autonomous', workspaceRoot: root })), approvals: new PendingApprovals(clock),
      attended: () => true, presenter: null, headlessPolicy: 'deny', abortHook: null, approvalTimeoutMs: 300_000,
      executors: new Map(executors.map((e) => [e.name, e])), resolvePath: (p) => p, publicTool: () => false,
      monotonic: clock, wall: clock, timers: clock, nextSequence: () => ++seq,
      sink: {
        decision: () => null, approvalRequested: () => undefined, pendingChanged: () => undefined, issue: (i) => { issues.push(i as Record<string, unknown>); },
        timeline: () => undefined, toolOpen: () => ++seq, toolSettle: (_o, _open, s) => { settles.push(s as Record<string, unknown>); }, warn: () => undefined,
      },
    });
    const dispatch = (name: string, args: Record<string, unknown>, signal: AbortSignal = new AbortController().signal) => gate.dispatch({ callId: `c${seq + 1}`, name, rawArgs: args, persona: 'refactorer', agentId: 'refactorer', agentName: 'refactorer' }, signal);
    return { dispatch, sent, issues, settles, lines, executors };
  }

  it('sends the search before the rename, with exactly the symbol and the file, and answers with the rename\'s result alone', async () => {
    const r = rig();
    const result = await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.sent.map((s) => [s.tool, s.args])).toEqual([[read.referencingSymbols, { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js' }], [edit.renameSymbol, RENAME]]);
    expect(result).toMatchObject({ status: 'ok', isError: false, text: 'Successfully renamed (3 changes applied)' });
  });

  it('discards a search answered with an error, and forwards the rename', async () => {
    const r = rig((tool) => (tool === read.referencingSymbols ? { isError: true, text: 'Error: no symbol remaining' } : { isError: false, text: 'Successfully renamed' }));
    const result = await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols, edit.renameSymbol]);
    expect(result).toMatchObject({ status: 'ok', isError: false, text: 'Successfully renamed' });
    expect(r.issues).toEqual([]);
  });

  it('a search that throws for another reason still lets the rename go ahead, said once in the log', async () => {
    const r = rig((tool) => { if (tool === read.referencingSymbols) throw new Error('the language server is not ready'); return { isError: false, text: 'Successfully renamed' }; });
    const result = await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols, edit.renameSymbol]);
    expect(result).toMatchObject({ status: 'ok', text: 'Successfully renamed' });
    expect(r.lines.filter((l) => l.message.includes('PD-MCP-004'))).toEqual([{ level: 'warn', message: expect.stringContaining('the language server is not ready') }]);
  });

  it('a cancel during the search reads interrupted and sends no rename', async () => {
    const run = new AbortController();
    const r = rig((tool, signal) => (tool === read.referencingSymbols
      ? new Promise<Reply>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('This operation was aborted')), { once: true }); queueMicrotask(() => run.abort()); })
      : { isError: false, text: 'Successfully renamed' }));
    const result = await r.dispatch(edit.renameSymbol, RENAME, run.signal);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols]);
    expect(result).toMatchObject({ status: 'failed', isError: true, interrupted: true });
    expect(r.settles[0]).toMatchObject({ failure_kind: 'interrupted' });
  });

  /*
   * OQ-299 (ruled 2026-10-14 under R-072; PD-MCP-004 clause 4): a search that ends after the rename's whole allowance while the
   * run's cancel also holds is the allowance's — REQ-MCP-003's failed call, `timeout`, unsent — whether the search failed or
   * answered, in the order PD-TOOLS-013 revision 2 (c) gives the rename's own catch. Until the ruling the answered search read
   * the cancel first.
   */
  it('a search that fails with the allowance spent and the run cancelled reads timeout, unsent (OQ-299)', async () => {
    const run = new AbortController();
    const r = rig((tool, _signal, hostClock) => {
      if (tool !== read.referencingSymbols) return { isError: false, text: 'Successfully renamed' };
      hostClock.advance(300_001);
      run.abort();
      throw new Error('This operation was aborted');
    });
    const result = await r.dispatch(edit.renameSymbol, RENAME, run.signal);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols]);
    expect(result).toMatchObject({ status: 'failed', isError: true });
    expect(r.settles[0]).toMatchObject({ failure_kind: 'timeout' });
  });

  it('a search that answers with the allowance spent and the run cancelled reads timeout, unsent (OQ-299)', async () => {
    const run = new AbortController();
    const r = rig((tool, _signal, hostClock) => {
      if (tool !== read.referencingSymbols) return { isError: false, text: 'Successfully renamed' };
      hostClock.advance(300_001);
      run.abort();
      return { isError: false, text: '[{"refs": 2}]' };
    });
    const result = await r.dispatch(edit.renameSymbol, RENAME, run.signal);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols]);
    expect(result).toMatchObject({ status: 'failed', isError: true });
    expect(r.settles[0]).toMatchObject({ failure_kind: 'timeout' });
  });

  it('the pair shares one allowance: the rename gets what the search left, and a search that spends it all is the timeout, unsent', async () => {
    const slow = rig((tool, _signal, hostClock) => { if (tool === read.referencingSymbols) hostClock.advance(120_000); return { isError: false, text: 'Successfully renamed' }; });
    await slow.dispatch(edit.renameSymbol, RENAME);
    expect(slow.sent.map((s) => s.timeoutMs)).toEqual([300_000, 180_000]);

    const spent = rig((tool, _signal, hostClock) => { if (tool === read.referencingSymbols) { hostClock.advance(300_000); throw new Error('MCP error -32001: Request timed out'); } return { isError: false, text: 'Successfully renamed' }; });
    const t = await spent.dispatch(edit.renameSymbol, RENAME);
    expect(spent.sent.map((s) => s.tool)).toEqual([read.referencingSymbols]);
    expect(t).toMatchObject({ status: 'failed', isError: true });
    expect(t.text).toBe(`MCP server 'code_intelligence' did not answer '${edit.renameSymbol}' within its allowance of 300 s; the call failed and was not retried (REQ-MCP-003).`);
    expect(spent.settles[0]).toMatchObject({ failure_kind: 'timeout' });

    const answeredLate = rig((tool, _signal, hostClock) => { if (tool === read.referencingSymbols) hostClock.advance(300_000); return { isError: false, text: 'Successfully renamed' }; });
    expect(await answeredLate.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'failed', isError: true });
    expect(answeredLate.sent.map((s) => s.tool)).toEqual([read.referencingSymbols]);
    expect(answeredLate.settles[0]).toMatchObject({ failure_kind: 'timeout' });
  });

  it('a rename the configuration renamed (REQ-MCP-005) is still warmed, by the name the server reports', async () => {
    const r = rig(renamed, { toolNameMap: { [edit.renameSymbol]: 'rename_it' } });
    expect(r.executors.map((e) => e.name)).toContain('rename_it');
    await r.dispatch('rename_it', RENAME);
    expect(r.sent.map((s) => s.tool)).toEqual([read.referencingSymbols, edit.renameSymbol]);
  });

  it('a same-named tool on another server, and every other EDIT tool, is not warmed', async () => {
    const other = rig(renamed, { server: 'notes' });
    await other.dispatch(edit.renameSymbol, RENAME);
    expect(other.sent.map((s) => s.tool)).toEqual([edit.renameSymbol]);
    const body = rig();
    await body.dispatch(edit.replaceSymbolBody, { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js', body: 'export const remaining = 2;' });
    expect(body.sent.map((s) => s.tool)).toEqual([edit.replaceSymbolBody]);
  });

  it('the search is asked quietly, so a transport it loses raises no unreachable notice; the rename is asked as the model\'s call (clause 3)', async () => {
    const r = rig();
    await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.sent.map((s) => [s.tool, s.quiet])).toEqual([[read.referencingSymbols, true], [edit.renameSymbol, false]]);
  });

  it('the search writes no tool-call record, total or issue: the session sees the rename\'s one row', async () => {
    const r = rig();
    await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.sent).toHaveLength(2);
    // The gate opens and settles one row per call the model made — the rename's; the search is the run host's own request.
    expect(r.settles).toHaveLength(1);
    expect(r.settles[0]).toMatchObject({ status: 'ok' });
    expect(r.issues).toEqual([]);
  });
});

/*
 * PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20 under R-072), clause 5: in a workspace no `tsconfig.json` or `jsconfig.json`
 * covers, the TypeScript language server holds the open files alone, so clause 2's search answered `{}` and the rename changed the
 * declaring file alone while saying it succeeded
 * (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md). For a rename whose
 * declaring file the runtime serves with its TypeScript language and no project file covers, the run host places a `jsconfig.json`
 * of the product's own at the root before the search and removes it when the call ends, whatever ended it; renames overlapping at
 * one root share it; a leftover is removed at the next run start and adopted by the next rename; a file whose bytes are not the
 * product's is never removed; and no observation lists the file. A real scratch root and a stubbed server, as the rig above; the
 * runtime's names, the argument names and the file's name come from the manifest alone (REQ-MCP-116).
 */
describe('PD-MCP-004 revision 2 (OQ-362)', () => {
  const { read, edit } = CODE_INTELLIGENCE_MANIFEST.tiers;
  const [NAME_PATH, RELATIVE_PATH] = CODE_INTELLIGENCE_MANIFEST.warmUps.renameSymbol.arguments as readonly [string, string];
  const { written } = CODE_INTELLIGENCE_MANIFEST.projectFiles.renameSymbol;
  const BYTES = CODE_INTELLIGENCE_PROJECT_FILE_BYTES;
  const SCHEMA = { type: 'object', properties: { [NAME_PATH]: { type: 'string' }, [RELATIVE_PATH]: { type: 'string' }, new_name: { type: 'string' }, body: { type: 'string' }, needle: { type: 'string' }, repl: { type: 'string' }, mode: { type: 'string' } } };
  const RENAME = { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js', new_name: 'countRemaining' };
  const TODOS = 'export function remaining(todos) {\n  return todos.length;\n}\n';
  const APP = "import { remaining } from './todos.js';\n\nexport const left = remaining([]);\n";
  type Reply = { isError: boolean; text: string };
  /** What the stubbed server saw at each request: the tool, its arguments, and the bytes of `<root>/jsconfig.json` (null when absent). */
  type Seen = { tool: string; args: Record<string, unknown>; projectFile: string | null };
  type Answer = (tool: string, at: { root: string; signal: AbortSignal; hostClock: FakeClock; args: Record<string, unknown> }) => Reply | Promise<Reply>;
  /** The rename's own edits, as the runtime makes them where the language server sees the whole project. */
  const renamesBoth: Answer = (tool, { root }) => {
    if (tool !== edit.renameSymbol) return { isError: false, text: '{"src/App.jsx": {}}' };
    writeFileSync(join(root, 'src', 'todos.js'), TODOS.replace(/remaining/g, 'countRemaining'));
    writeFileSync(join(root, 'src', 'App.jsx'), APP.replace(/remaining/g, 'countRemaining'));
    return { isError: false, text: "Successfully renamed 'remaining' to 'countRemaining' (2 changes applied)" };
  };
  /** A promise and the function that settles it, for ordering two calls under way at once. */
  const latch = (): { wait: Promise<void>; open: () => void } => {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => { open = resolve; });
    return { wait, open };
  };

  function rig(answer: Answer = renamesBoth, opts: { server?: string; files?: Record<string, string> } = {}) {
    const serverName = opts.server ?? 'code_intelligence';
    const root = scratchDir('rotaris-pdmcp004r2-');
    for (const [path, text] of Object.entries({ 'src/todos.js': TODOS, 'src/App.jsx': APP, ...opts.files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const productFile = join(root, written);
    const lines: { message: string; level: string }[] = [];
    const hostClock = new FakeClock();
    const mcp = new McpHost({ clocks: hostClock, log: (message, level = 'info') => { lines.push({ message, level }); }, acknowledge: () => undefined, parentEnv: {}, productVersion: '0.0.0' });
    vi.spyOn(mcp.discovery, 'peek').mockReturnValue({ tools: [edit.renameSymbol, edit.replaceSymbolBody, edit.replaceAcrossFiles, read.referencingSymbols].map((name) => ({ name, description: 'x', inputSchema: SCHEMA })), failed: false } as unknown as ReturnType<typeof mcp.discovery.peek>);
    vi.spyOn(mcp.discovery, 'discover').mockResolvedValue({ tools: [], failed: false, memoised: true, elapsedMs: 0 } as unknown as Awaited<ReturnType<typeof mcp.discovery.discover>>);
    const seen: Seen[] = [];
    vi.spyOn(mcp, 'connectionsFor').mockReturnValue({
      connect: async () => ({ onToolsChanged: () => undefined }),
      call: async (_server: string, _d: unknown, tool: string, args: Record<string, unknown>, _timeoutMs: number, signal: AbortSignal) => {
        seen.push({ tool, args, projectFile: existsSync(productFile) ? readFileSync(productFile, 'utf8') : null });
        return answer(tool, { root, signal, hostClock, args });
      },
    } as unknown as ReturnType<typeof mcp.connectionsFor>);
    const entry = { type: 'stdio', enabled: true, disabled_tools: [], tool_name_map: {}, command: 'ci' };
    const cfg = {
      personas: { refactorer: { mcp_servers: [serverName], tools: [] } },
      mcp: { servers: { [serverName]: { name: serverName, entry, origin: 'workspace', availability: { available: true }, description: {}, resolved: { command: 'ci', args: [] } } }, origins: { [serverName]: 'workspace' }, diagnostics: [] },
    } as unknown as LoadedConfiguration;
    const surface = mcp.surfaceFor(cfg, root, 'refactorer', null);
    const executors = mcp.executorsFor({ cfg, workspaceRoot: root, role: 'refactorer', surface, ctx: { sessionId: 'S1', writer: null }, remove: () => undefined, log: () => undefined });
    const clock = new FakeClock();
    const issues: Record<string, unknown>[] = [];
    const settles: Record<string, unknown>[] = [];
    let seq = 0;
    let calls = 0;
    const gate = new Gate({
      sessionId: 'S1', workspaceRoot: root, policy: new PolicyContext(buildPolicy({ preset: 'autonomous', workspaceRoot: root })), approvals: new PendingApprovals(clock),
      attended: () => true, presenter: null, headlessPolicy: 'deny', abortHook: null, approvalTimeoutMs: 300_000,
      executors: new Map(executors.map((e) => [e.name, e])), resolvePath: (p) => p, publicTool: () => false,
      monotonic: clock, wall: clock, timers: clock, nextSequence: () => ++seq,
      sink: {
        decision: () => null, approvalRequested: () => undefined, pendingChanged: () => undefined, issue: (i) => { issues.push(i as Record<string, unknown>); },
        timeline: () => undefined, toolOpen: () => ++seq, toolSettle: (_o, _open, s) => { settles.push(s as Record<string, unknown>); }, warn: () => undefined,
      },
    });
    const dispatch = (name: string, args: Record<string, unknown>, signal: AbortSignal = new AbortController().signal, agentName = 'Refactorer 1') => gate.dispatch({ callId: `c${++calls}`, name, rawArgs: args, persona: 'refactorer', agentId: agentName, agentName }, signal);
    /** The application log's lines that name the clause. */
    const revision2 = () => lines.filter((l) => l.message.includes('PD-MCP-004 revision 2'));
    return { mcp, cfg, root, productFile, placedAt: join(realPathOf(root), written), dispatch, seen, issues, settles, lines, revision2 };
  }
  const verbOf = (message: string): string => /\b(placed|adopted|removed)\b/.exec(message)?.[1] ?? message;

  it('(a) a .js declaring file no project file covers: the product\'s file stands for the search and the rename, and is gone when the call returns', async () => {
    const r = rig();
    const result = await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.seen.map((s) => [s.tool, s.projectFile])).toEqual([[read.referencingSymbols, BYTES], [edit.renameSymbol, BYTES]]);
    expect(existsSync(r.productFile)).toBe(false);
    expect(result).toMatchObject({ status: 'ok', isError: false, text: "Successfully renamed 'remaining' to 'countRemaining' (2 changes applied)" });
    expect(r.settles).toHaveLength(1);
    expect(r.settles[0]).toMatchObject({ status: 'ok' });
    expect(r.issues).toEqual([]);
    expect(r.revision2().map((l) => [l.level, verbOf(l.message)])).toEqual([['info', 'placed'], ['info', 'removed']]);
    for (const l of r.revision2()) expect(l.message).toContain(r.placedAt);
  });

  it('(b) the file is removed whatever ends the call: an error result, a thrown fault, a cancel during the search, a search that spends the allowance', async () => {
    const erred = rig((tool) => (tool === edit.renameSymbol ? { isError: true, text: 'Error: no symbol named remaining' } : { isError: false, text: '{}' }));
    expect(await erred.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'failed', isError: true, text: 'Error: no symbol named remaining' });

    const thrown = rig((tool) => { if (tool === edit.renameSymbol) throw new Error('the server went away'); return { isError: false, text: '{}' }; });
    expect(await thrown.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'failed', isError: true });
    expect(thrown.settles[0]).toMatchObject({ failure_kind: 'execution_error' });

    const run = new AbortController();
    const cancelled = rig((tool, { signal }) => (tool === read.referencingSymbols
      ? new Promise<Reply>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('This operation was aborted')), { once: true }); queueMicrotask(() => run.abort()); })
      : { isError: false, text: 'Successfully renamed' }));
    expect(await cancelled.dispatch(edit.renameSymbol, RENAME, run.signal)).toMatchObject({ status: 'failed', isError: true, interrupted: true });
    expect(cancelled.seen.map((s) => s.tool)).toEqual([read.referencingSymbols]);

    const spent = rig((tool, { hostClock }) => { if (tool === read.referencingSymbols) { hostClock.advance(300_000); throw new Error('MCP error -32001: Request timed out'); } return { isError: false, text: 'Successfully renamed' }; });
    expect(await spent.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'failed', isError: true });
    expect(spent.settles[0]).toMatchObject({ failure_kind: 'timeout' });
    expect(spent.seen.map((s) => s.tool)).toEqual([read.referencingSymbols]);

    for (const [name, r] of Object.entries({ erred, thrown, cancelled, spent })) {
      expect(r.seen[0]!.projectFile, name).toBe(BYTES);
      expect(existsSync(r.productFile), name).toBe(false);
      expect(r.revision2().map((l) => [l.level, verbOf(l.message)]), name).toEqual([['info', 'placed'], ['info', 'removed']]);
    }
  });

  it('(c) two renames overlapping at one root share one file: placed once, standing for both, removed once the second to end has ended', async () => {
    const firstRename = latch();
    const releaseFirst = latch();
    let renames = 0;
    const r = rig(async (tool) => {
      if (tool !== edit.renameSymbol) return { isError: false, text: '{}' };
      renames += 1;
      if (renames === 1) { firstRename.open(); await releaseFirst.wait; }
      return { isError: false, text: 'Successfully renamed (2 changes applied)' };
    });
    const first = r.dispatch(edit.renameSymbol, RENAME, undefined, 'Refactorer 1');
    await firstRename.wait;
    expect(await r.dispatch(edit.renameSymbol, { ...RENAME, [NAME_PATH]: 'left', new_name: 'stillLeft' }, undefined, 'Refactorer 2')).toMatchObject({ status: 'ok' });
    // The second has ended and the first still keeps the file.
    expect(readFileSync(r.productFile, 'utf8')).toBe(BYTES);
    releaseFirst.open();
    expect(await first).toMatchObject({ status: 'ok' });
    expect(existsSync(r.productFile)).toBe(false);
    expect(r.seen.map((s) => s.projectFile)).toEqual([BYTES, BYTES, BYTES, BYTES]);
    expect(r.revision2().filter((l) => l.level !== 'debug').map((l) => [l.level, verbOf(l.message)])).toEqual([['info', 'placed'], ['info', 'removed']]);
  });

  it('(d) a leftover with the product\'s bytes is removed at a run\'s preparation, and adopted and then removed by a rename; a file with other bytes is kept', async () => {
    const r = rig();
    writeFileSync(r.productFile, BYTES);
    await r.mcp.prepare(r.cfg, r.root);
    expect(existsSync(r.productFile)).toBe(false);
    expect(r.revision2().map((l) => [l.level, verbOf(l.message)])).toEqual([['info', 'removed']]);
    expect(r.revision2()[0]!.message).toContain(r.placedAt);
    // Left behind again (a run host that ended during a rename): the next rename adopts it, and removes it when it has answered.
    writeFileSync(r.productFile, BYTES);
    expect(await r.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'ok' });
    expect(r.seen.map((s) => s.projectFile)).toEqual([BYTES, BYTES]);
    expect(existsSync(r.productFile)).toBe(false);
    expect(r.revision2().map((l) => [l.level, verbOf(l.message)])).toEqual([['info', 'removed'], ['info', 'adopted'], ['info', 'removed']]);

    // A person's jsconfig.json is never removed, at the preparation or by a rename, and its bytes stay as they were.
    const theirs = '{ "compilerOptions": { "checkJs": true } }\n';
    const p = rig();
    writeFileSync(p.productFile, theirs);
    await p.mcp.prepare(p.cfg, p.root);
    expect(await p.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'ok' });
    expect(readFileSync(p.productFile, 'utf8')).toBe(theirs);
    expect(p.seen.map((s) => s.projectFile)).toEqual([theirs, theirs]);
    expect(p.revision2()).toEqual([]);
  });

  it('(e) a file whose bytes changed while the rename ran is left where it stands, and a warn line says so', async () => {
    const changed = '{ "compilerOptions": { "allowJs": true } }\n';
    const r = rig((tool, at) => { if (tool === edit.renameSymbol) writeFileSync(join(at.root, written), changed); return renamesBoth(tool, at); });
    expect(await r.dispatch(edit.renameSymbol, RENAME)).toMatchObject({ status: 'ok' });
    expect(r.seen[0]!.projectFile).toBe(BYTES);
    expect(readFileSync(r.productFile, 'utf8')).toBe(changed);
    expect(r.revision2().map((l) => [l.level, verbOf(l.message)])).toEqual([['info', 'placed'], ['warn', expect.stringContaining('left where it stands')]]);
    expect(r.revision2()[1]!.message).toContain(r.placedAt);
  });

  it('(f) the rename\'s observedPaths never list the file, also when it is left behind', async () => {
    const r = rig();
    const result = await r.dispatch(edit.renameSymbol, RENAME);
    expect(r.seen[0]!.projectFile).toBe(BYTES);
    expect(result.observation?.observedPaths).toEqual(['src/App.jsx', 'src/todos.js']);

    const left = rig((tool, at) => { if (tool === edit.renameSymbol) writeFileSync(join(at.root, written), '{}\n'); return renamesBoth(tool, at); });
    const leftResult = await left.dispatch(edit.renameSymbol, RENAME);
    expect(left.seen[0]!.projectFile).toBe(BYTES);
    expect(existsSync(left.productFile)).toBe(true);
    expect(leftResult.observation?.observedPaths).toEqual(['src/App.jsx', 'src/todos.js']);
  });

  it('(f) a sibling\'s cross-file replacement observed across the placement, or across the removal, does not list the file', async () => {
    const REPLACE = { needle: 'nothing', repl: 'else', mode: 'literal' };
    const pair = () => {
      const siblingCalled = latch(); const releaseSibling = latch(); const searchReached = latch(); const releaseSearch = latch();
      const r = rig(async (tool, at) => {
        if (tool === edit.replaceAcrossFiles) {
          siblingCalled.open();
          await releaseSibling.wait;
          writeFileSync(join(at.root, 'README.md'), 'a sibling wrote this\n');
          return { isError: false, text: 'Replaced 1 occurrence(s)' };
        }
        if (tool === read.referencingSymbols) { searchReached.open(); await releaseSearch.wait; }
        return renamesBoth(tool, at);
      });
      return { r, siblingCalled, releaseSibling, searchReached, releaseSearch };
    };
    // Across the placement: the sibling looks before the rename places the file, and again while it stands.
    {
      const { r, siblingCalled, releaseSibling, searchReached, releaseSearch } = pair();
      const sibling = r.dispatch(edit.replaceAcrossFiles, REPLACE, undefined, 'Tester 1');
      await siblingCalled.wait;
      const rename = r.dispatch(edit.renameSymbol, RENAME, undefined, 'Refactorer 1');
      await searchReached.wait;
      expect(readFileSync(r.productFile, 'utf8')).toBe(BYTES);
      releaseSibling.open();
      expect((await sibling).observation?.observedPaths).toEqual(['README.md']);
      releaseSearch.open();
      // The rename's window held the sibling's write, which no journal names (the bound OQ-245 states); never the product's file.
      expect((await rename).observation?.observedPaths).toEqual(['README.md', 'src/App.jsx', 'src/todos.js']);
      expect(existsSync(r.productFile)).toBe(false);
    }
    // Across the removal: the sibling looks while the file stands, and again once the rename has removed it.
    {
      const { r, siblingCalled, releaseSibling, searchReached, releaseSearch } = pair();
      const rename = r.dispatch(edit.renameSymbol, RENAME, undefined, 'Refactorer 1');
      await searchReached.wait;
      const sibling = r.dispatch(edit.replaceAcrossFiles, REPLACE, undefined, 'Tester 1');
      await siblingCalled.wait;
      releaseSearch.open();
      expect((await rename).observation?.observedPaths).toEqual(['src/App.jsx', 'src/todos.js']);
      expect(existsSync(r.productFile)).toBe(false);
      releaseSibling.open();
      // Its window saw the file stand and then go: it lists its own file and the rename's (the bound OQ-245 states), never the product's.
      expect((await sibling).observation?.observedPaths).toEqual(['README.md', 'src/App.jsx', 'src/todos.js']);
      expect(r.seen.find((s) => s.tool === read.referencingSymbols)?.projectFile).toBe(BYTES);
    }
  });

  it('guard: nothing is placed where a tsconfig.json or jsconfig.json stands in the declaring file\'s directory, a directory between it and the root, or the root; the person\'s bytes stay as they were', async () => {
    const cases: { files: Record<string, string>; declaring: string }[] = [
      { files: { 'src/tsconfig.json': '{ "include": ["*.js"] }\n' }, declaring: 'src/todos.js' },
      { files: { 'src/jsconfig.json': '{}\n', 'src/lib/deep.js': 'export function remaining() { return 0; }\n' }, declaring: 'src/lib/deep.js' },
      { files: { 'tsconfig.json': '{ "compilerOptions": { "allowJs": true } }\n' }, declaring: 'src/todos.js' },
      { files: { [written]: '{ "compilerOptions": {} }\n' }, declaring: 'src/todos.js' },
    ];
    for (const c of cases) {
      const r = rig(renamesBoth, { files: c.files });
      expect(await r.dispatch(edit.renameSymbol, { ...RENAME, [RELATIVE_PATH]: c.declaring }), c.declaring).toMatchObject({ status: 'ok' });
      for (const [path, text] of Object.entries(c.files)) expect(readFileSync(join(r.root, path), 'utf8'), path).toBe(text);
      expect(r.seen.map((s) => s.projectFile), JSON.stringify(c.files)).toEqual(r.seen.map(() => c.files[written] ?? null));
      if (!(written in c.files)) expect(existsSync(r.productFile)).toBe(false);
      expect(r.revision2()).toEqual([]);
    }
  });

  it('guard: nothing is placed for a .py declaring file, another EDIT tool, the model\'s own reference search, or another server\'s tool of the same name', async () => {
    const py = rig(renamesBoth, { files: { 'tool.py': 'def remaining():\n    return 0\n' } });
    await py.dispatch(edit.renameSymbol, { ...RENAME, [RELATIVE_PATH]: 'tool.py' });
    const body = rig();
    await body.dispatch(edit.replaceSymbolBody, { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js', body: 'export function remaining() { return 0; }' });
    const search = rig();
    await search.dispatch(read.referencingSymbols, { [NAME_PATH]: 'remaining', [RELATIVE_PATH]: 'src/todos.js' });
    const other = rig(renamesBoth, { server: 'notes' });
    await other.dispatch(edit.renameSymbol, RENAME);
    for (const [name, r] of Object.entries({ py, body, search, other })) {
      expect(r.seen.length, name).toBeGreaterThan(0);
      expect(r.seen.map((s) => s.projectFile), name).toEqual(r.seen.map(() => null));
      expect(existsSync(r.productFile), name).toBe(false);
      expect(r.revision2(), name).toEqual([]);
    }
  });

  it('guard: nothing is placed for a declaring file outside the root', async () => {
    for (const declaring of ['../outside.js', join(tmpdir(), 'rotaris-elsewhere', 'outside.js')]) {
      const r = rig();
      await r.dispatch(edit.renameSymbol, { ...RENAME, [RELATIVE_PATH]: declaring });
      expect(r.seen.length, declaring).toBeGreaterThan(0);
      expect(r.seen.map((s) => s.projectFile), declaring).toEqual(r.seen.map(() => null));
      expect(existsSync(r.productFile), declaring).toBe(false);
      expect(r.revision2(), declaring).toEqual([]);
    }
  });
});
