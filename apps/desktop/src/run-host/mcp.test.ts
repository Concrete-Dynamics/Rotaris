import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { LoadedConfiguration } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
import { McpHost } from './mcp.js';

/**
 * Live-run finding D7 (R-067): the spawn evidence resolves a persona's MCP surface with no reserved names and the tool
 * port resolves it again with the persona's native names reserved, so the first spawn of every persona wrote its
 * surface line and REQ-MCP-059's grant count twice. A resolution that says nothing new is logged once; one the reserved
 * names changed (a collision offered under its prefix) is a different surface, and its line is written.
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

  it('D7: the spawn evidence and the tool port resolving the same surface write its surface line and its grant count once', () => {
    const { mcp, cfg, lines } = host();
    const evidence = mcp.evidenceFor(cfg, '/ws', 'tester');
    const surface = mcp.surfaceFor(cfg, '/ws', 'tester', null, new Set(['read_file', 'grep']));
    expect(evidence.granted).toEqual({ ci: ['lookup', 'notes_read'] });
    expect(surface.active[0]!.tools.map((t) => t.callable)).toEqual(['lookup', 'notes_read']);
    expect(surfaceLines(lines)).toHaveLength(1);
    expect(grantLines(lines)).toHaveLength(1);
    // A later spawn of the same persona reads the memo and writes nothing.
    mcp.surfaceFor(cfg, '/ws', 'tester', null, new Set(['read_file', 'grep']));
    mcp.evidenceFor(cfg, '/ws', 'tester');
    expect(surfaceLines(lines)).toHaveLength(1);
    expect(grantLines(lines)).toHaveLength(1);
  });

  // Acceptance finding A41: REQ-MCP-059 calls the grant count a debug log, and it was written at `info`, which
  // PD-MONITOR-002's default threshold keeps in every packaged build. At `debug` it is dropped unless
  // ROTARIS_APP_LOG_LEVEL=debug is set; the persona's surface line stays at `info`.
  it('REQ-MCP-059, PD-MONITOR-002 (A41): the grant count reaches the application log at debug, the surface line at info', () => {
    const { mcp, cfg, lines } = host();
    mcp.evidenceFor(cfg, '/ws', 'tester');
    expect(grantLines(lines).map((l) => l.level)).toEqual(['debug']);
    expect(surfaceLines(lines).map((l) => l.level)).toEqual(['info']);
  });

  it('D7: a surface the reserved names changed — a collision offered under its prefix — is a different surface, and its line is written', () => {
    const { mcp, cfg, lines } = host();
    mcp.evidenceFor(cfg, '/ws', 'tester');
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
    mcp.evidenceFor(cfg, '/ws', 'tester');
    mcp.newConfiguration({ ...cfg, mcp: { ...cfg.mcp, servers: { ci: { ...cfg.mcp.servers['ci']!, description: { changed: true } } } } } as unknown as LoadedConfiguration);
    mcp.evidenceFor(cfg, '/ws', 'tester');
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
      "  fs.writeFileSync(path.join(root, 'pids'), `${process.pid} ${g.pid}`);",
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
    const began = Date.now();
    while (!existsSync(join(root, 'pids')) && Date.now() - began < 10_000) await new Promise((r) => setTimeout(r, 20));
    const pids = readFileSync(join(root, 'pids'), 'utf8').split(' ').map(Number);
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
