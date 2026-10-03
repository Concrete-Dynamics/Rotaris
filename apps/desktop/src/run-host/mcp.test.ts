import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { LoadedConfiguration } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
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
