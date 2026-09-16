import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { loadConfiguration } from '../load.js';
import { availability, findOnPath, resolveCommand } from './commands.js';
import { describeForRuntime, REMOTE_DESCRIPTION_KEYS, STDIO_DESCRIPTION_KEYS } from './describe.js';
import { DiagnosticSink, warn } from './diagnostics.js';
import { discoveryLocations, parseEnvFile, readDiscoveryFiles } from './discovery-files.js';
import { mergeSecrets, readSecretsFile, resolveRemoteUrl, resolveServerEnvironment } from './environment.js';
import { MCP_ENTRY_DEFAULTS, MCP_ENTRY_KEYS, readMcpServerEntry, type McpServerEntry } from './entry.js';
import { candidateSpellings, filterServerTools, grantDecision, resolvePersonaMcp, narrowAfterUpdate } from './persona.js';
import { MCP_SECTION_HEADING, NO_MCP_SERVERS_LINE, renderMcpSection } from './prompt.js';
import { SHIPPED_MCP_SERVERS, BUILT_IN_PERSONA_MCP_SERVERS } from './defaults.js';

const entry = (over: Partial<McpServerEntry> = {}): McpServerEntry => ({ ...MCP_ENTRY_DEFAULTS, command: 'node', ...over });
const tool = (name: string, description = '') => ({ name, description, inputSchema: { type: 'object' } });

describe('REQ-MCP-001/002/003/005 — the entry schema from a YAML scope', () => {
  it('reads the closed field set with its defaults', () => {
    expect([...MCP_ENTRY_KEYS]).toEqual(['type', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'request_timeout', 'disabled_tools', 'tool_name_map', 'tools', 'enabled']);
    const r = readMcpServerEntry('a', { command: 'x' }, { kind: 'yaml', file: 'agents.yaml' });
    expect(r.entry).toEqual({ ...MCP_ENTRY_DEFAULTS, command: 'x' });
  });
  it('reports EVERY defect, fatal, naming server, transport and field; absent and empty command alike', () => {
    const r = readMcpServerEntry('a', { command: '  ', request_timeout: 0, tool_name_map: { x: 'z', y: 'z' } }, { kind: 'yaml', file: 'agents.yaml' });
    expect(r.entry).toBeNull();
    const errors = r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
    expect(errors).toHaveLength(3);
    expect(errors.some((e) => /mcp_servers\.a\.command: a stdio server needs a command; it is empty/.test(e))).toBe(true);
    expect(errors.some((e) => /request_timeout: must be a whole number of seconds greater than zero, got 0/.test(e))).toBe(true);
    expect(errors.some((e) => /both 'x' and 'y' are renamed to 'z'/.test(e))).toBe(true);
    const absent = readMcpServerEntry('b', {}, { kind: 'yaml', file: 'agents.yaml' });
    expect(absent.diagnostics[0]!.message).toMatch(/it is absent/);
    const remote = readMcpServerEntry('c', { type: 'sse' }, { kind: 'yaml', file: 'agents.yaml' });
    expect(remote.diagnostics[0]!.message).toMatch(/a sse server needs a url/);
    expect(readMcpServerEntry('d', { command: 'x', request_timeout: 1.5 }, { kind: 'yaml', file: 'agents.yaml' }).entry).toBeNull();
  });
  it('from a discovery file the same defects drop the entry alone with a warning naming server and source', () => {
    const r = readMcpServerEntry('a', { args: ['x'] }, { kind: 'discovered', file: 'C:/ws/.mcp.json' });
    expect(r.entry).toBeNull();
    expect(r.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(r.diagnostics[0]!.message).toMatch(/C:\/ws\/\.mcp\.json → a: command .* dropped \(REQ-MCP-023\)/);
  });
});

describe('REQ-MCP-017..024, 027 — the discovery files', () => {
  it('locates the two files per platform and skips user-level discovery when APPDATA is unset', () => {
    expect(discoveryLocations('C:/ws', 'win32', {}, 'C:/home').user).toBeNull();
    expect(discoveryLocations('C:/ws', 'win32', { APPDATA: 'C:/roam' }, 'C:/home').user).toBe(win32.join('C:/roam', 'mcp.json'));
    expect(discoveryLocations('/ws', 'darwin', {}, '/home/u').user).toBe(posix.join('/home/u', 'Library', 'Application Support', 'mcp.json'));
    expect(discoveryLocations('/ws', 'linux', {}, '/home/u').user).toBe(posix.join('/home/u', '.config', 'mcp.json'));
  });
  it('parses envFile lines, strips quotes, lets explicit env win, resolves the two placeholders and warns on another', () => {
    expect(parseEnvFile('# c\nA=1\nB="two"\nC=\'3\'\n\nbad\n')).toEqual({ A: '1', B: 'two', C: '3' });
    const files: Record<string, string> = {
      'C:/ws/.mcp.json': JSON.stringify({ mcpServers: { g: { command: 'node', envFile: '.env', env: { A: 'explicit', W: '${workspaceFolder}', E: '${env:HOME_X}', U: '${other}' }, cwd: '${workspaceFolder}/sub', custom_key: 1 }, 'bad name!': { command: 'x' }, notobj: 3, broken: { url: '' } } }),
      'C:/ws/.env': 'A=file\nB=filed\n',
    };
    const r = readDiscoveryFiles({ workspaceRoot: 'C:/ws', platform: 'win32', env: { HOME_X: 'hx' }, home: 'C:/home', read: (p) => files[p.replace(/\\/g, '/')] ?? null });
    const g = r.value.servers['g']!;
    expect(g.env).toEqual({ A: 'explicit', B: 'filed', W: 'C:/ws', E: 'hx', U: '${other}' });
    expect(g.cwd).toBe(win32.join('C:/ws', 'sub'));
    expect(r.value.origins['g']).toBe('discovered-project');
    const msgs = r.diagnostics.map((d) => d.message);
    expect(msgs.some((m) => /custom_key.*ignored \(REQ-MCP-027\)/.test(m))).toBe(true);
    expect(msgs.some((m) => /bad name!/.test(m))).toBe(true);
    expect(msgs.some((m) => /'notobj' is number/.test(m))).toBe(true);
    expect(msgs.some((m) => /\${other}/.test(m))).toBe(true);
    expect(r.value.servers['broken']).toBeUndefined();
    expect(r.diagnostics.filter((d) => d.key.includes('unknown-key')).map((d) => d.key.replace(/\\/g, '/'))).toEqual(['mcp.unknown-key.C:/ws/.mcp.json.g.custom_key']);
  });
  it('project beats user on a collision; transport by explicit type, else url → http, else stdio', () => {
    const files: Record<string, string> = {
      'C:/roam/mcp.json': JSON.stringify({ servers: { s: { command: 'user-cmd' }, only: { url: 'https://x' } } }),
      'C:/ws/.mcp.json': JSON.stringify({ mcpServers: { s: { command: 'project-cmd' }, t: { type: 'sse', url: 'https://y' } } }),
    };
    const r = readDiscoveryFiles({ workspaceRoot: 'C:/ws', platform: 'win32', env: { APPDATA: 'C:/roam' }, home: 'C:/home', read: (p) => files[p.replace(/\\/g, '/')] ?? null });
    expect(r.value.servers['s']!.command).toBe('project-cmd');
    expect(r.value.origins).toEqual({ s: 'discovered-project', only: 'discovered-user', t: 'discovered-project' });
    expect(r.value.servers['only']!.type).toBe('http');
    expect(r.value.servers['t']!.type).toBe('sse');
  });
  it('a real discovery file is byte-identical after several loads (REQ-MCP-027) and its entries merge under the defaults with the origin map (REQ-MCP-025/026)', () => {
    // These three read REAL files off the host's own filesystem, so the platform they name is the HOST's: the
    // discovery layer spells its paths by the platform it is given, and naming a foreign one here would send it
    // looking for `ws\\.mcp.json` on a machine that has just written `ws/.mcp.json` (found on Linux, 2026-09-16).
    const root = mkdtempSync(join(tmpdir(), 'rotaris-mcp-disc-'));
    const ws = join(root, 'ws');
    mkdirSync(join(ws, '.rotaris'), { recursive: true });
    const globalDir = join(root, 'global');
    mkdirSync(globalDir, { recursive: true });
    const text = '{\n  "mcpServers": {\n    "gamma": { "command": "node", "args": ["g.js"], "weird": true },\n    "web_search": { "url": "https://override.example/mcp" }\n  }\n}\n';
    writeFileSync(join(ws, '.mcp.json'), text);
    writeFileSync(join(globalDir, 'agents.yaml'), 'mcp_servers:\n  alpha: { command: node, args: [a.js] }\n  gamma: { enabled: false }\n');
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'mcp_servers:\n  beta: { command: node, request_timeout: 2 }\nmcp_server_sources:\n  alpha: hand-written\n');
    const hash = () => createHash('sha256').update(readFileSync(join(ws, '.mcp.json'))).digest('hex');
    const before = hash();
    let cfg;
    for (let i = 0; i < 3; i += 1) {
      const r = loadConfiguration({ globalDir, workspaceRoot: ws, env: {}, platform: process.platform, home: root, snapshotPath: null, keepIgnored: false, onPath: () => true });
      expect(r.ok).toBe(true);
      if (r.ok) cfg = r.value;
    }
    expect(hash()).toBe(before);
    const mcp = cfg!.mcp;
    expect(mcp.origins).toEqual({ web_search: 'discovered-project', browser: 'default', code_intelligence: 'default', gamma: 'yaml', alpha: 'yaml', beta: 'yaml' });
    // Field-wise: the YAML `enabled: false` merged onto the discovered gamma keeps its command and args.
    expect(mcp.servers['gamma']!.entry).toMatchObject({ command: 'node', args: ['g.js'], enabled: false });
    // The discovered url overrides the shipped default's url; the shipped timeout survives.
    expect(mcp.servers['web_search']!.entry).toMatchObject({ url: 'https://override.example/mcp', request_timeout: 600, enabled: false });
    expect(mcp.servers['beta']!.description).toEqual({ transport: 'stdio', command: 'node', args: [], env: {}, cwd: ws, timeout: 2 });
    expect(mcp.diagnostics.some((d) => /weird/.test(d.message))).toBe(true);
    // REQ-MCP-008: the hand-written origin map is never read.
    expect(mcp.origins['alpha']).toBe('yaml');
    // REQ-CONFIG-465 / REQ-MCP-091: the switch state at start is the configured value.
    expect(mcp.servers['alpha']!.entry.enabled).toBe(true);
  });
  it('a YAML defect refuses the load naming file, server and field; the same defect in the discovery file drops the entry (REQ-MCP-002/023)', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-mcp-fatal-'));
    const ws = join(root, 'ws');
    mkdirSync(join(ws, '.rotaris'), { recursive: true });
    const globalDir = join(root, 'global');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'mcp_servers:\n  nocmd: { type: stdio }\n  badtimeout: { command: node, request_timeout: -1 }\n');
    const r = loadConfiguration({ globalDir, workspaceRoot: ws, env: {}, platform: process.platform, home: root, snapshotPath: null, keepIgnored: false, onPath: () => true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.lines.some((l) => /mcp_servers\.nocmd\.command/.test(l))).toBe(true);
      expect(r.error.lines.some((l) => /mcp_servers\.badtimeout\.request_timeout/.test(l))).toBe(true);
    }
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), '');
    // `request_timeout` is not a discovery-file key (REQ-MCP-020): it is IGNORED with the unknown-key warning and the entry loads on its remaining keys (REQ-MCP-027) — so the second dropped entry is one with no command at all.
    writeFileSync(join(ws, '.mcp.json'), JSON.stringify({ mcpServers: { nocmd: { type: 'stdio' }, badtimeout: { command: 'node', request_timeout: -1 }, empty: { command: '' }, fine: { command: 'node' } } }));
    const ok = loadConfiguration({ globalDir, workspaceRoot: ws, env: {}, platform: process.platform, home: root, snapshotPath: null, keepIgnored: false, onPath: () => true });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(Object.keys(ok.value.mcp.servers).sort()).toEqual(['badtimeout', 'browser', 'code_intelligence', 'fine', 'web_search']);
      expect(ok.value.mcp.servers['badtimeout']!.entry.request_timeout).toBeNull();
      expect(ok.value.mcp.diagnostics.some((d) => /'request_timeout', which this product does not read/.test(d.message))).toBe(true);
      expect(ok.value.mcp.diagnostics.filter((d) => /dropped \(REQ-MCP-023\)/.test(d.message))).toHaveLength(2);
    }
  });
});

describe('REQ-MCP-028..037 — command resolution and the one availability rule', () => {
  const onPath = (x: string) => ['npx', 'uvx', 'node'].includes(x);
  const r = (command: string, args: string[] = [], name = 's') => resolveCommand({ name, command, args, workspaceRoot: 'C:/ws', onPath, binding: null });
  it('the token first, path-likes and known executables unchanged, the shorthands expanded, bare names untouched', () => {
    expect(r('builtin:code-intelligence', ['--x']).value).toEqual({ command: 'builtin:code-intelligence', args: ['--x'], builtin: true });
    for (const c of ['/usr/bin/x', './x', '../x', '~/x', 'C:\\x', 'D:x']) expect(r(c).value.command).toBe(c);
    expect(r('npx', ['-y', 'p']).value).toEqual({ command: 'npx', args: ['-y', 'p'], builtin: false });
    expect(r('uvx:pkg', ['a']).value).toEqual({ command: 'uvx', args: ['pkg', 'a'], builtin: false });
    expect(r('uvx:').value.command).toBe('uvx:');
    expect(r('npm:pkg', ['a']).value).toEqual({ command: 'npx', args: ['-y', 'pkg', 'a'], builtin: false });
    expect(r('@scope/pkg').value).toEqual({ command: 'npx', args: ['-y', '@scope/pkg'], builtin: false });
    expect(r('npm:').value.command).toBe('npm:');
    expect(r('my-server').value).toEqual({ command: 'my-server', args: [], builtin: false });
  });
  it('warns once per process when the runner is missing, still resolving', () => {
    const missing = resolveCommand({ name: 's', command: 'uvx:pkg', args: [], workspaceRoot: null, onPath: () => false, binding: null });
    expect(missing.value.command).toBe('uvx');
    expect(missing.diagnostics[0]!.scope).toBe('process');
    expect(missing.diagnostics[0]!.message).toMatch(/uvx, which is not on PATH/);
  });
  it('the filesystem fill-in appends the root with no path argument and substitutes only for the name filesystem (REQ-MCP-035)', () => {
    expect(r('npx', ['-y', '@modelcontextprotocol/server-filesystem']).value.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', 'C:/ws']);
    const sub = r('npx', ['-y', 'filesystem-mcp', 'C:/no/such/dir'], 'filesystem');
    expect(sub.value.args).toEqual(['-y', 'filesystem-mcp', 'C:/ws']);
    expect(sub.diagnostics[0]!.message).toMatch(/C:\/no\/such\/dir does not exist/);
    expect(r('npx', ['-y', 'filesystem-mcp', 'C:/no/such/dir'], 'other').value.args).toEqual(['-y', 'filesystem-mcp', 'C:/no/such/dir']);
    expect(r('npx', ['-y', 'filesystem-mcp', 'C:/a', 'C:/b'], 'filesystem').value.args).toEqual(['-y', 'filesystem-mcp', 'C:/a', 'C:/b']);
  });
  it('the binding stage is present and inert without the manifest, and appends the two arguments with it (REQ-MCP-034)', () => {
    const binding = { launchSubcommand: 'start-mcp-server', projectPathOption: '--project', projectFromCwdOption: '--project-from-cwd' };
    expect(resolveCommand({ name: 'ci', command: 'uvx', args: ['x', 'start-mcp-server'], workspaceRoot: 'C:/ws', onPath, binding }).value.args).toEqual(['x', 'start-mcp-server', '--project', 'C:/ws']);
    expect(resolveCommand({ name: 'ci', command: 'uvx', args: ['x', 'start-mcp-server', '--project-from-cwd'], workspaceRoot: 'C:/ws', onPath, binding }).value.args).toEqual(['x', 'start-mcp-server', '--project-from-cwd']);
    expect(resolveCommand({ name: 'ci', command: 'uvx', args: ['x', 'start-mcp-server'], workspaceRoot: 'C:/ws', onPath, binding: null }).value.args).toEqual(['x', 'start-mcp-server']);
  });
  it('availability: remote and the token unconditionally, else PATH after resolution, empty never', () => {
    expect(availability(entry({ type: 'http', url: 'x' }), null, () => false)).toEqual({ available: true, why: 'remote' });
    expect(availability(entry({ command: 'builtin:code-intelligence' }), null, () => false)).toEqual({ available: true, why: 'builtin' });
    expect(availability(entry({ command: 'npm:pkg' }), { command: 'npx', args: [], builtin: false }, onPath)).toEqual({ available: true, why: 'on-path' });
    expect(availability(entry({ command: 'ghost' }), { command: 'ghost', args: [], builtin: false }, onPath).available).toBe(false);
    expect(availability(entry({ command: '' }), null, () => true).available).toBe(false);
  });
  it('findOnPath honours PATHEXT on Windows and finds node', () => {
    expect(findOnPath('node', process.env, process.platform)).not.toBeNull();
    expect(findOnPath('definitely-not-a-command-xyz', process.env, process.platform)).toBeNull();
  });
});

describe('REQ-MCP-082/083/087/088/090 — secrets and the environment', () => {
  it('reads a scope read-only, skips empty keys and values, merges workspace over global', () => {
    const g = readSecretsFile('g', 'global', () => 'alpha:\n  KEY: g1\n  OTHER: g2\n  "": nokey\nbeta:\n  EMPTY: ""\nnotmap: 3\n');
    expect(g.value.map((e) => `${e.server}.${e.key}=${e.value}`)).toEqual(['alpha.KEY=g1', 'alpha.OTHER=g2']);
    expect(g.diagnostics).toHaveLength(2);
    const w = readSecretsFile('w', 'workspace', () => 'alpha:\n  KEY: w1\n');
    const merged = mergeSecrets(g.value, w.value);
    expect(merged.map((e) => `${e.server}.${e.key}=${e.value}@${e.scope}`)).toEqual(['alpha.KEY=w1@workspace', 'alpha.OTHER=g2@global']);
    expect(readSecretsFile('x', 'global', () => 'not: [valid').value).toEqual([]);
    expect(readSecretsFile('x', 'global', () => null).value).toEqual([]);
  });
  it('a full-value ${VAR} expands or omits the key; other values kept; secrets overlay last', () => {
    const env = resolveServerEnvironment(entry({ env: { A: '${SET}', B: '${UNSET}', C: 'lit-${SET}', D: 'plain' } }), { SET: 'v' }, { D: 'secret', E: 's2' });
    expect(env).toEqual({ A: 'v', C: 'lit-${SET}', D: 'secret', E: 's2' });
    expect('B' in env).toBe(false);
  });
  it('a remote url substitutes substrings, secret before environment, and warns on an unresolved one', () => {
    const r = resolveRemoteUrl('web_search', 'https://x/?k=${ROTARIS_SEARCH_API_KEY}&z=${ZED}', { ROTARIS_SEARCH_API_KEY: 'env', ZED: 'z' }, { ROTARIS_SEARCH_API_KEY: 'sec' });
    expect(r.value.url).toBe('https://x/?k=sec&z=z');
    const u = resolveRemoteUrl('web_search', 'https://x/?k=${MISSING}', {}, {});
    expect(u.value).toEqual({ url: 'https://x/?k=${MISSING}', unresolved: ['MISSING'] });
    expect(u.diagnostics[0]!.message).toMatch(/could not be resolved/);
    expect(u.diagnostics[0]).toMatchObject({ severity: 'warning', scope: 'load', channels: 'user' });
    // REQ-MCP-040: a server turned off is a choice. Its unresolved placeholder is a state, said once per process.
    const d = resolveRemoteUrl('web_search', 'https://x/?k=${MISSING}', {}, {}, false);
    expect(d.value.unresolved).toEqual(['MISSING']);
    expect(d.diagnostics[0]).toMatchObject({ severity: 'info', scope: 'process', channels: 'log', key: 'mcp.url-unresolved.web_search.MISSING' });
    expect(d.diagnostics.filter((x) => x.severity === 'warning')).toEqual([]);
  });
});

describe('REQ-MCP-043 — the normalised description has exactly the keys', () => {
  it('stdio and remote key sets, timeout absent when unset', () => {
    const s = describeForRuntime(entry({ command: 'node', args: ['x'], env: { A: '1' } }), { command: 'node', args: ['x'], builtin: false }, { A: '1' }, null, 'C:/ws');
    expect(Object.keys(s)).toEqual([...STDIO_DESCRIPTION_KEYS]);
    const st = describeForRuntime(entry({ request_timeout: 5, cwd: 'C:/c' }), null, {}, null, 'C:/ws');
    expect(Object.keys(st)).toEqual([...STDIO_DESCRIPTION_KEYS, 'timeout']);
    expect((st as { cwd: string }).cwd).toBe('C:/c');
    const r = describeForRuntime(entry({ type: 'sse', url: 'u', headers: { H: 'v' } }), null, {}, 'u2', 'C:/ws');
    expect(Object.keys(r)).toEqual([...REMOTE_DESCRIPTION_KEYS, 'headers']);
    expect(r).toEqual({ transport: 'sse', url: 'u2', headers: { H: 'v' } });
  });
});

describe('REQ-MCP-055..062, 038..042 — persona resolution', () => {
  const servers = { alpha: entry(), beta: entry({ disabled_tools: ['deny'], tool_name_map: { orig: 'renamed', clash: 'keep' } }), off: entry({ enabled: false }), ghost: entry({ command: 'ghost' }), failed: entry() };
  const origins = { alpha: 'yaml', beta: 'yaml', off: 'yaml', ghost: 'yaml', failed: 'yaml' } as const;
  const discovered = (name: string) => name === 'failed' ? { tools: [], failed: true } : name === 'alpha' ? { tools: [tool('a2', 'second'), tool('a1')], failed: false } : name === 'beta' ? { tools: [tool('deny'), tool('orig', 'o'), tool('clash'), tool('keep'), tool('beta_pref')], failed: false } : null;
  const base = { servers, origins, sessionDisabled: new Set<string>(), availability: (n: string) => (n === 'ghost' ? { available: false, detail: 'not on PATH' } : { available: true }), discovered, genericTools: [] as string[] };
  it('case (b) unrestricted vs (c) empty list vs (d) named, denial outranking, prefix spellings, rename of survivors only', () => {
    const b = resolvePersonaMcp({ ...base, persona: 'p', carried: ['beta'], grants: null }).value;
    expect(b.active[0]!.tools.map((t) => t.callable)).toEqual(['beta_pref', 'clash', 'keep', 'renamed']);
    const c = resolvePersonaMcp({ ...base, persona: 'p', carried: ['beta'], grants: { beta: [] } }).value;
    expect(c.active[0]!.tools).toEqual([]);
    const d = resolvePersonaMcp({ ...base, persona: 'p', carried: ['beta'], grants: { beta: ['deny', 'pref', 'renamed', 'orig', 'nothing'] } });
    // `deny` stays denied; `pref` matches beta_pref by the unprefixed spelling; `renamed` matches nothing (a replacement name); `orig` matches and is printed renamed; `nothing` is inert.
    expect(d.value.active[0]!.tools.map((t) => `${t.callable}<${t.reported}`)).toEqual(['beta_pref<beta_pref', 'renamed<orig']);
    const inert = d.diagnostics.filter((x) => /inert/.test(x.message)).map((x) => x.key);
    expect(inert).toEqual(['mcp.inert-grant.beta.renamed', 'mcp.inert-grant.beta.nothing']);
    expect(candidateSpellings('beta', 'mcp__beta__x')).toEqual(['mcp__beta__x', 'x']);
    expect(grantDecision('s', 's_t', ['t'], ['s_t'])).toBe('denied');
  });
  it('a rename colliding with another survivor is refused with a warning (REQ-MCP-005)', () => {
    const f = filterServerTools('beta', servers.beta, [tool('clash'), tool('keep')], undefined);
    expect(f.value.map((t) => t.callable)).toEqual(['clash', 'keep']);
    expect(f.diagnostics[0]!.message).toMatch(/refused/);
  });
  it('the drop rules: missing (warning), disabled (info, no warning), unavailable (warning), failed discovery (warning, listed bare)', () => {
    const r = resolvePersonaMcp({ ...base, persona: 'p', carried: ['nope', 'off', 'ghost', 'failed', 'alpha'], grants: null, sessionDisabled: new Set(['alpha']) });
    expect(r.value.dropped.map((d) => `${d.name}:${d.reason}`)).toEqual(['alpha:disabled', 'ghost:unavailable', 'nope:not-configured', 'off:disabled']);
    expect(r.value.active.map((a) => `${a.name}:${a.discoveryFailed}:${a.tools.length}`)).toEqual(['failed:true:0']);
    const warnings = r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
    expect(warnings.some((m) => /'nope', which is not configured/.test(m))).toBe(true);
    expect(warnings.some((m) => /'ghost' is unavailable/.test(m))).toBe(true);
    expect(warnings.some((m) => /'failed' failed tool discovery/.test(m))).toBe(true);
    expect(warnings.some((m) => /off/.test(m) && /disabled/.test(m))).toBe(false);
    expect(r.diagnostics.filter((d) => d.severity === 'info' && /disabled by/.test(d.message))).toHaveLength(2);
  });
  it('a generic tool naming a server is treated as carried with the move-it warning (REQ-MCP-039)', () => {
    const r = resolvePersonaMcp({ ...base, persona: 'p', carried: [], grants: null, genericTools: ['alpha', 'grep'] });
    expect(r.value.active.map((a) => a.name)).toEqual(['alpha']);
    expect(r.diagnostics[0]!.message).toMatch(/move it to mcp_servers/);
  });
  it('an update only narrows: a withdrawn name goes, an introduced one never becomes callable (REQ-MCP-060)', () => {
    const connectTime = [{ callable: 'a1', reported: 'a1', description: '', inputSchema: {} }, { callable: 'a2', reported: 'a2', description: '', inputSchema: {} }];
    expect(narrowAfterUpdate('alpha', servers.alpha, [tool('a2'), tool('a3')], undefined, connectTime).map((t) => t.callable)).toEqual(['a2']);
  });
  it('a name taken by a native tool or an earlier server is offered under the server prefix, only on collision', () => {
    const r = resolvePersonaMcp({ ...base, persona: 'p', carried: ['alpha', 'beta'], grants: null, reservedNames: new Set(['a1']), discovered: (n) => (n === 'alpha' ? { tools: [tool('a1'), tool('shared')], failed: false } : n === 'beta' ? { tools: [tool('shared'), tool('b1')], failed: false } : null) });
    expect(r.value.active.map((a) => a.tools.map((t) => `${t.callable}<${t.reported}`))).toEqual([['alpha_a1<a1', 'shared<shared'], ['b1<b1', 'beta_shared<shared']]);
    expect(r.diagnostics.filter((d) => /offered as/.test(d.message))).toHaveLength(2);
  });
  it('is side-effect free on configuration under repeated resolution (REQ-MCP-009)', () => {
    const before = JSON.stringify(servers);
    for (let i = 0; i < 3; i += 1) resolvePersonaMcp({ ...base, persona: 'p', carried: ['alpha', 'beta'], grants: { beta: ['orig'] } });
    expect(JSON.stringify(servers)).toBe(before);
  });
});

describe('REQ-MCP-101 — the prompt section, character-exact', () => {
  it('renders the no-server line, the bare name, the bold name with child bullets, in code-point order', () => {
    expect(renderMcpSection({ persona: 'p', active: [], dropped: [] })).toBe(`${MCP_SECTION_HEADING}\n\n${NO_MCP_SERVERS_LINE}`);
    const surface = { persona: 'p', dropped: [], active: [
      { name: 'zeta', entry: entry(), origin: 'yaml' as const, discoveryFailed: true, tools: [] },
      { name: 'Alpha', entry: entry(), origin: 'yaml' as const, discoveryFailed: false, tools: [{ callable: 'b', reported: 'b', description: 'B does', inputSchema: {} }, { callable: 'a', reported: 'a', description: '', inputSchema: {} }] },
    ] };
    expect(renderMcpSection(surface)).toBe('## MCP servers\n\n- **`Alpha`**\n  - `a`\n  - `b` — B does\n- `zeta`');
  });
});

describe('REQ-MCP-010/014 — the shipped defaults', () => {
  it('exactly three entries with the fixed names, transports, timeout and enablement; the persona rows', () => {
    expect(Object.keys(SHIPPED_MCP_SERVERS).sort()).toEqual(['browser', 'code_intelligence', 'web_search']);
    const ws = SHIPPED_MCP_SERVERS['web_search'] as Record<string, unknown>;
    expect(ws).toMatchObject({ type: 'http', request_timeout: 600, enabled: false });
    expect(String(ws['url'])).toContain('${ROTARIS_SEARCH_API_KEY}');
    const br = SHIPPED_MCP_SERVERS['browser'] as { command: string; args: string[]; enabled: boolean };
    expect(br.command).toBe('npx');
    expect(br.args[0]).toBe('-y');
    expect(br.args[1]).toMatch(/^@playwright\/mcp@\d+\.\d+\.\d+$/);
    expect(br.args).toContain('--headless');
    expect(br.enabled).toBe(false);
    const ci = SHIPPED_MCP_SERVERS['code_intelligence'] as { command: string; enabled: boolean };
    expect(ci.command).toBe('builtin:code-intelligence');
    // Enabled by default (REQ-CONFIG-181) since ADR-0035 executed on 2026-09-06; the 2026-09-05 deviation (`false`) is recorded in mcp/defaults.ts.
    expect(ci.enabled).toBe(true);
    expect(BUILT_IN_PERSONA_MCP_SERVERS['tester']).toEqual(['browser', 'code_intelligence']);
    expect(BUILT_IN_PERSONA_MCP_SERVERS['librarian']).toEqual(['web_search']);
    expect(BUILT_IN_PERSONA_MCP_SERVERS['gatekeeper']).toEqual([]);
  });
});

describe('the diagnostic sink applies the scopes', () => {
  it('load once per load, process once for ever, session once per session', () => {
    const sink = new DiagnosticSink();
    const l = warn('x', 'load', 'k');
    const p = warn('x', 'process', 'k');
    const s = warn('x', 'session', 'k');
    expect(sink.admit(l)).toBe(true); expect(sink.admit(l)).toBe(false); sink.newLoad(); expect(sink.admit(l)).toBe(true);
    expect(sink.admit(p)).toBe(true); sink.newLoad(); expect(sink.admit(p)).toBe(false);
    expect(sink.admit(s, 'A')).toBe(true); expect(sink.admit(s, 'A')).toBe(false); expect(sink.admit(s, 'B')).toBe(true);
    expect(sink.admit(warn('x', 'load', ''))).toBe(true); expect(sink.admit(warn('x', 'load', ''))).toBe(true);
  });
});
