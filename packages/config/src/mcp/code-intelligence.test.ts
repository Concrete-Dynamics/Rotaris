import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_NAMES } from '@rotaris/contracts';
import { builtInDefaults } from '../defaults.js';
import {
  CODE_INTELLIGENCE_BINDING, CODE_INTELLIGENCE_DEFAULT_ARGS, CODE_INTELLIGENCE_HOME_SEGMENT, CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE, CODE_INTELLIGENCE_LANGUAGE_SERVERS,
  CODE_INTELLIGENCE_MANIFEST, CODE_INTELLIGENCE_MEMORY_GATE, CODE_INTELLIGENCE_SETUP_STEPS, codeIntelligenceEdit,
  codeIntelligenceEditPaths, codeIntelligenceLanguageServerStore, codeIntelligenceWarmUp,
  deriveSetupInvocation, grantForTiers, hasIndexableExtension, memoriesBlockApplies, neverGrantNames, PROJECT_MEMORIES_BLOCK, tierNames,
} from './code-intelligence.js';
import { CODE_INTELLIGENCE_TOKEN, resolveCommand } from './commands.js';
import { BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS, BUILT_IN_PERSONA_MCP_SERVERS, SHIPPED_MCP_SERVERS } from './defaults.js';
import { renderMcpSection } from './prompt.js';
import type { McpServerEntry } from './entry.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const pins = JSON.parse(readFileSync(join(repo, 'apps', 'desktop', 'scripts', 'code-intelligence', 'pins.json'), 'utf8')) as {
  python: string; distribution: string; version: string;
  languageServers: readonly { language: string; provisioner: string; packages: readonly { name: string; version: string; source: string; license: string }[] }[];
};

/**
 * ADR-0035 / REQ-MCP-011/015/116: `pnpm check` needs no Python — the committed generated module is tested against the
 * committed pins and REQ-MCP-015's counts; `pnpm package` regenerates it against the runtime and refuses a diff.
 */
describe('the code-intelligence binding manifest (REQ-MCP-116)', () => {
  it('pins the distribution and the interpreter the build pins (REQ-MCP-011)', () => {
    expect(CODE_INTELLIGENCE_MANIFEST.distribution).toBe(pins.distribution);
    expect(CODE_INTELLIGENCE_MANIFEST.version).toBe(pins.version);
    expect(CODE_INTELLIGENCE_MANIFEST.python).toBe(pins.python);
    expect(CODE_INTELLIGENCE_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares the language servers the runtime provisions, equal to the pins, each with the four fields (ESC-32; REQ-STARTUP-058, REQ-MCP-118)', () => {
    expect(CODE_INTELLIGENCE_LANGUAGE_SERVERS).toEqual(pins.languageServers);
    expect(CODE_INTELLIGENCE_LANGUAGE_SERVERS.map((l) => l.language)).toEqual(['typescript', 'python']);
    for (const ls of CODE_INTELLIGENCE_LANGUAGE_SERVERS) {
      expect(['npm', 'uvx']).toContain(ls.provisioner);
      expect(ls.packages.length).toBeGreaterThan(0);
      for (const p of ls.packages) {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(p.source).toMatch(/^https:\/\//);
        expect(p.license.length).toBeGreaterThan(0);
      }
    }
    // The store is the runtime's answer, relative to its home, in forward slashes; the joined form ends with it.
    expect(CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE).toMatch(/^[^./][^:]*$/);
    expect(codeIntelligenceLanguageServerStore(join('D:', 'data')).split(/[\\/]/).slice(-CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE.split('/').length)).toEqual(CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE.split('/'));
  });

  it('the sentinel restates the home segment it cannot import, spelled the same (REQ-STARTUP-145)', () => {
    const sentinel = readFileSync(join(repo, 'apps', 'desktop', 'src', 'main', 'sentinel.ts'), 'utf8');
    expect(sentinel).toContain(`'${CODE_INTELLIGENCE_HOME_SEGMENT}'`);
  });

  it('holds REQ-MCP-015\'s four tiers at 10 / 7 / 2 / 1, pairwise disjoint, no never-grant name inside, every name reported', () => {
    expect(tierNames('read')).toHaveLength(10);
    expect(tierNames('edit')).toHaveLength(7);
    expect(tierNames('memoryWrite')).toHaveLength(2);
    expect(tierNames('onboard')).toHaveLength(1);
    const all = [...tierNames('read'), ...tierNames('edit'), ...tierNames('memoryWrite'), ...tierNames('onboard')];
    expect(new Set(all).size).toBe(20);
    const never = neverGrantNames();
    expect(never).toHaveLength(3);
    for (const n of never) expect(all).not.toContain(n);
    const reported = new Set<string>(CODE_INTELLIGENCE_MANIFEST.reportedByServer);
    for (const n of all) expect(reported.has(n)).toBe(true);
    const vocabulary = new Set<string>(CODE_INTELLIGENCE_MANIFEST.vocabulary);
    for (const n of [...all, ...never]) expect(vocabulary.has(n)).toBe(true);
    expect(grantForTiers(['read', 'memoryWrite'])).toHaveLength(12);
    expect(grantForTiers(['read', 'edit', 'memoryWrite'])).toHaveLength(19);
    expect(grantForTiers(['read', 'memoryWrite', 'onboard'])).toHaveLength(13);
  });

  it('names the probe\'s and the block\'s tools from the READ tier (REQ-MCP-071/102)', () => {
    expect(tierNames('read')).toContain(CODE_INTELLIGENCE_MEMORY_GATE[0]);
    expect(tierNames('read')).toContain(CODE_INTELLIGENCE_MEMORY_GATE[1]);
    expect(CODE_INTELLIGENCE_MANIFEST.extensions).toContain('.ts');
    expect(CODE_INTELLIGENCE_MANIFEST.extensions).toContain('.py');
    expect(hasIndexableExtension('index.ts')).toBe(true);
    expect(hasIndexableExtension('README.md')).toBe(false);
    expect(hasIndexableExtension('.gitignore')).toBe(false);
  });

  it('is the only place a runtime tool name is written (REQ-MCP-116)', () => {
    // Every name of the tiers and the never-grant set, as a quoted string literal, anywhere under packages/ and apps/desktop/src
    // except the generated module, this test, and the generator that binds capabilities to names.
    const names = [...tierNames('read'), ...tierNames('edit'), ...tierNames('memoryWrite'), ...tierNames('onboard'), ...neverGrantNames()];
    const pattern = new RegExp(`['"\`](${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})['"\`]`);
    const offenders: string[] = [];
    const skip = new Set(['node_modules', 'dist', 'out', 'release', 'generated', 'spike', 'resources', '.cache']);
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)) continue;
        if (p.endsWith('code-intelligence-manifest.generated.ts') || p.endsWith('code-intelligence.test.ts')) continue;
        if (statSync(p).size > 2_000_000) continue;
        const text = readFileSync(p, 'utf8');
        if (pattern.test(text)) offenders.push(p.slice(repo.length + 1));
      }
    };
    walk(join(repo, 'packages'));
    walk(join(repo, 'apps', 'desktop', 'src'));
    expect(offenders).toEqual([]);
  });
});

/**
 * PD-ORCH-004 / REQ-ORCH-109 (fin32; the a68f121 duress run's D1): a child that edited through the EDIT tier was reported
 * as having changed no workspace paths, because the run counted only the native file tools. The paths an edit-tier call
 * writes are read from its arguments as the manifest names them.
 */
describe('the paths an EDIT-tier call writes (PD-ORCH-004, REQ-MCP-015, REQ-ORCH-109)', () => {
  const edit = CODE_INTELLIGENCE_MANIFEST.tiers.edit;
  const args = CODE_INTELLIGENCE_MANIFEST.editArguments;

  it('names an argument for every capability of the edit tier, and only those', () => {
    expect(Object.keys(args).sort()).toEqual(Object.keys(edit).sort());
  });

  it('reads each edit tool\'s path from the argument the manifest names, under its own name, the collision prefix or another casing', () => {
    for (const [capability, name] of Object.entries(edit)) {
      if (capability === 'replaceAcrossFiles') continue; // its path may be a directory: never listed (OQ-245, below)
      const at = (args as Record<string, { path: string }>)[capability]!.path;
      expect(codeIntelligenceEditPaths(name, { [at]: 'docs/verification.md' })).toEqual(['docs/verification.md']);
      expect(codeIntelligenceEditPaths(`code_intelligence_${name}`, { [at]: 'src/a.ts' })).toEqual(['src/a.ts']);
      expect(codeIntelligenceEditPaths(name.toUpperCase(), { [at]: 'src/b.ts' })).toEqual(['src/b.ts']);
    }
  });

  it('OQ-245: every capability names its scope; the rename and the cross-file replacement reach beyond their path argument, the rest write it', () => {
    const scopes = Object.fromEntries(Object.entries(args).map(([cap, a]) => [cap, (a as { scope: string; reach?: string }).scope + ((a as { reach?: string }).reach ? `:${(a as { reach: string }).reach}` : '')]));
    expect(scopes).toEqual({
      replaceSymbolBody: 'argument', insertBeforeSymbol: 'argument', insertAfterSymbol: 'argument', safeDeleteSymbol: 'argument', replaceInFile: 'argument',
      renameSymbol: 'reach:project', replaceAcrossFiles: 'reach:path',
    });
    // An argument-scope call reaches nothing beyond its file.
    expect(codeIntelligenceEdit(edit.replaceInFile, { relative_path: 'src/a.ts' })).toEqual({ paths: ['src/a.ts'], reach: null });
    expect(codeIntelligenceEdit(edit.safeDeleteSymbol, { relative_path: 'src/a.ts' })).toEqual({ paths: ['src/a.ts'], reach: null });
    // A rename reaches the whole project; what it names without looking is the declaring file.
    expect(codeIntelligenceEdit(edit.renameSymbol, { relative_path: 'src/a.ts', name_path: 'f', new_name: 'g' })).toEqual({ paths: ['src/a.ts'], reach: { base: '' } });
    expect(codeIntelligenceEdit(`code_intelligence_${edit.renameSymbol}`, { relative_path: 'src/a.ts' })?.reach).toEqual({ base: '' });
    // A cross-file replacement reaches its path, a file or a directory, or the whole project; it names no file without looking.
    expect(codeIntelligenceEdit(edit.replaceAcrossFiles, { relative_path: 'src', needle: 'a', repl: 'b' })).toEqual({ paths: [], reach: { base: 'src' } });
    expect(codeIntelligenceEdit(edit.replaceAcrossFiles, { needle: 'a', repl: 'b' })).toEqual({ paths: [], reach: { base: '' } });
    // A preview reaches nothing and names nothing.
    expect(codeIntelligenceEdit(edit.replaceAcrossFiles, { relative_path: 'src', [args.replaceAcrossFiles.preview]: true })).toEqual({ paths: [], reach: null });
    expect(codeIntelligenceEdit('write_file', { path: 'a' })).toBeNull();
  });

  it('is null for every tool outside the edit tier, the native file tools among them', () => {
    for (const name of [...tierNames('read'), ...tierNames('memoryWrite'), ...tierNames('onboard'), ...neverGrantNames(), 'write_file', 'terminal']) {
      expect(codeIntelligenceEditPaths(name, { relative_path: 'docs/a.md' })).toBeNull();
    }
  });

  it('a preview changes nothing, and a call naming no path lists none', () => {
    const across = edit.replaceAcrossFiles;
    expect(codeIntelligenceEditPaths(across, { relative_path: 'src', [args.replaceAcrossFiles.preview]: true })).toEqual([]);
    // OQ-245: a cross-file replacement's path may be a directory, so it is never listed as an edited file (it was until 2026-10-13).
    expect(codeIntelligenceEditPaths(across, { relative_path: 'src', [args.replaceAcrossFiles.preview]: false })).toEqual([]);
    expect(codeIntelligenceEditPaths(across, { needle: 'a', repl: 'b' })).toEqual([]);
    expect(codeIntelligenceEditPaths(edit.replaceInFile, { relative_path: 7 })).toEqual([]);
    expect(codeIntelligenceEditPaths(edit.replaceInFile, null)).toEqual([]);
  });
});

describe('the shipped entry and the grants (REQ-MCP-010/014/016)', () => {
  it('ships code_intelligence enabled, on the token, with the manifest\'s launch, transport and mode arguments and no project path', () => {
    const ci = SHIPPED_MCP_SERVERS['code_intelligence'] as { type: string; command: string; args: string[]; enabled: boolean };
    expect(ci.type).toBe('stdio');
    expect(ci.command).toBe(CODE_INTELLIGENCE_TOKEN);
    expect(ci.enabled).toBe(true);
    expect(ci.args).toEqual([...CODE_INTELLIGENCE_DEFAULT_ARGS]);
    expect(ci.args[0]).toBe(CODE_INTELLIGENCE_BINDING.launchSubcommand);
    expect(ci.args).not.toContain(CODE_INTELLIGENCE_BINDING.projectPathOption);
    expect(ci.args).not.toContain(CODE_INTELLIGENCE_BINDING.projectFromCwdOption);
    expect(Object.keys(ci).sort()).toEqual(['args', 'command', 'enabled', 'type']);
  });

  it('grants every persona of REQ-MCP-014 exactly the union of its tiers, and nothing for browser or web_search', () => {
    const personas = builtInDefaults()['personas'] as Record<string, { mcp_servers: string[]; mcp_tools?: Record<string, string[]> }>;
    for (const role of BUILT_IN_ROLE_NAMES) {
      const p = personas[role]!;
      const servers = BUILT_IN_PERSONA_MCP_SERVERS[role] ?? [];
      expect(p.mcp_servers).toEqual([...servers]);
      const tiers = BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS[role];
      if (servers.includes('code_intelligence')) {
        expect(tiers).toBeDefined();
        expect(p.mcp_tools?.['code_intelligence']).toEqual(grantForTiers(tiers!));
        expect(Object.keys(p.mcp_tools ?? {})).toEqual(['code_intelligence']);
      } else {
        expect(p.mcp_tools).toBeUndefined();
      }
    }
    expect(personas['coding-agent']!.mcp_tools!['code_intelligence']).toHaveLength(19);
    expect(personas['orchestrator']!.mcp_tools!['code_intelligence']).toHaveLength(12);
    expect(personas['tester']!.mcp_tools!['code_intelligence']).toHaveLength(19);
    expect(personas['refactorer']!.mcp_tools!['code_intelligence']).toHaveLength(19);
    for (const [, tiers] of Object.entries(BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS)) expect(tiers).not.toContain('onboard');
  });
});

describe('the token\'s launch and the binding (REQ-MCP-033/034)', () => {
  const launch = { command: 'C:\\App\\Rotaris.exe', args: [CODE_INTELLIGENCE_TOKEN, '--'] };
  it('expands the token to the application\'s own executable with the token first, and appends the project path once', () => {
    const r = resolveCommand({ name: 'code_intelligence', command: CODE_INTELLIGENCE_TOKEN, args: [...CODE_INTELLIGENCE_DEFAULT_ARGS], workspaceRoot: 'D:\\ws', onPath: () => false, binding: CODE_INTELLIGENCE_BINDING, builtinLaunch: launch });
    expect(r.value.builtin).toBe(true);
    expect(r.value.command).toBe(launch.command);
    expect(r.value.args).toEqual([CODE_INTELLIGENCE_TOKEN, '--', ...CODE_INTELLIGENCE_DEFAULT_ARGS, CODE_INTELLIGENCE_BINDING.projectPathOption, 'D:\\ws']);
  });
  it('binds any entry that launches the runtime, leaves a present selection alone, and touches no other stdio entry', () => {
    const other = resolveCommand({ name: 'mine', command: 'serena', args: [CODE_INTELLIGENCE_BINDING.launchSubcommand], workspaceRoot: '/w', onPath: () => true, binding: CODE_INTELLIGENCE_BINDING });
    expect(other.value.args).toEqual([CODE_INTELLIGENCE_BINDING.launchSubcommand, CODE_INTELLIGENCE_BINDING.projectPathOption, '/w']);
    const chosen = resolveCommand({ name: 'mine', command: 'serena', args: [CODE_INTELLIGENCE_BINDING.launchSubcommand, CODE_INTELLIGENCE_BINDING.projectFromCwdOption], workspaceRoot: '/w', onPath: () => true, binding: CODE_INTELLIGENCE_BINDING });
    expect(chosen.value.args).toEqual([CODE_INTELLIGENCE_BINDING.launchSubcommand, CODE_INTELLIGENCE_BINDING.projectFromCwdOption]);
    const plain = resolveCommand({ name: 'alpha', command: 'node', args: ['a.js'], workspaceRoot: '/w', onPath: () => true, binding: CODE_INTELLIGENCE_BINDING });
    expect(plain.value.args).toEqual(['a.js']);
  });
});

describe('the derived invocation (REQ-MCP-036)', () => {
  const entry = (patch: Partial<McpServerEntry>): McpServerEntry => ({ type: 'stdio', command: CODE_INTELLIGENCE_TOKEN, args: [...CODE_INTELLIGENCE_DEFAULT_ARGS], url: null, headers: {}, env: {}, cwd: null, enabled: true, request_timeout: null, disabled_tools: [], tool_name_map: {}, tools: [], ...patch } as McpServerEntry);
  it('is the resolved command plus the prefix before the launch subcommand', () => {
    const resolved = { command: 'C:\\App\\Rotaris.exe', args: [CODE_INTELLIGENCE_TOKEN, '--', ...CODE_INTELLIGENCE_DEFAULT_ARGS, CODE_INTELLIGENCE_BINDING.projectPathOption, 'D:\\ws'], builtin: true };
    const r = deriveSetupInvocation(entry({}), resolved);
    expect(r).toEqual({ ok: true, command: 'C:\\App\\Rotaris.exe', args: [CODE_INTELLIGENCE_TOKEN, '--'] });
  });
  it('derives nothing for a remote entry, an empty command, or arguments without the launch subcommand', () => {
    expect(deriveSetupInvocation(entry({ type: 'http', url: 'https://x' }), null)).toMatchObject({ ok: false, reason: expect.stringContaining('not a local launch') });
    expect(deriveSetupInvocation(entry({ command: '' }), null)).toMatchObject({ ok: false, reason: expect.stringContaining('not a local launch') });
    expect(deriveSetupInvocation(entry({ args: ['--transport', 'stdio'] }), { command: 'x', args: ['--transport', 'stdio'], builtin: false })).toMatchObject({ ok: false, reason: expect.stringContaining('no server-launch subcommand') });
  });
  it('orders the three steps with their budgets', () => {
    expect(CODE_INTELLIGENCE_SETUP_STEPS.map((s) => [s.id, s.budgetMs, s.needsCode])).toEqual([['create', 300_000, false], ['index', 1_800_000, true], ['memory', 120_000, true]]);
  });
});

describe('the project-memories block (REQ-MCP-102)', () => {
  const server = (name: string, command: string, reported: string[]) => ({
    name, origin: 'default' as const, discoveryFailed: false,
    entry: { type: 'stdio', command, args: [], url: null, headers: {}, env: {}, cwd: null, enabled: true, request_timeout: null, disabled_tools: [], tool_name_map: {}, tools: [] } as McpServerEntry,
    tools: reported.map((r) => ({ callable: r, reported: r, description: '', inputSchema: {} })),
  });
  it('appears under the token\'s server iff both gating tools are granted, character-exact, and never elsewhere', () => {
    const [listing, reading] = CODE_INTELLIGENCE_MEMORY_GATE;
    expect(memoriesBlockApplies([listing, reading, 'x'])).toBe(true);
    expect(memoriesBlockApplies([listing])).toBe(false);
    const both = renderMcpSection({ persona: 'p', dropped: [], active: [server('code_intelligence', CODE_INTELLIGENCE_TOKEN, [reading, listing])] });
    expect(both).toBe(['## MCP servers', '', '- **`code_intelligence`**', `  - \`${listing}\``, `  - \`${reading}\``, PROJECT_MEMORIES_BLOCK].join('\n'));
    const one = renderMcpSection({ persona: 'p', dropped: [], active: [server('code_intelligence', CODE_INTELLIGENCE_TOKEN, [listing])] });
    expect(one).not.toContain('Project memories');
    const other = renderMcpSection({ persona: 'p', dropped: [], active: [server('alpha', 'node', [listing, reading])] });
    expect(other).not.toContain('Project memories');
    for (const point of ['before you start exploring the codebase', 'durable findings that are not obvious from the code', 'agent-instruction files out', 'true only of the current run']) expect(PROJECT_MEMORIES_BLOCK).toContain(point);
  });
});

/**
 * PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072): the symbol rename is warmed by the referencing-symbol search of the same
 * symbol and file. The manifest records the pairing by capability and the shared argument names; the resolver answers by the
 * name the server reports and copies exactly those arguments from the call.
 */
describe('the warm-up before a symbol rename (PD-MCP-004, REQ-MCP-116)', () => {
  const { read, edit } = CODE_INTELLIGENCE_MANIFEST.tiers;
  const shared = CODE_INTELLIGENCE_MANIFEST.warmUps.renameSymbol.arguments;

  it('records the rename warmed by the referencing-symbol search, with two shared arguments, both tools reported', () => {
    expect(CODE_INTELLIGENCE_MANIFEST.warmUps).toEqual({ renameSymbol: { tool: 'referencingSymbols', arguments: shared } });
    expect(shared).toHaveLength(2);
    const reported = new Set<string>(CODE_INTELLIGENCE_MANIFEST.reportedByServer);
    expect(reported.has(edit.renameSymbol)).toBe(true);
    expect(reported.has(read.referencingSymbols)).toBe(true);
  });

  it('answers the rename by its reported name with the search and exactly the shared arguments, and nothing for any other tool', () => {
    const call = { [shared[0]]: 'remaining', [shared[1]]: 'src/todos.js', new_name: 'countRemaining' };
    expect(codeIntelligenceWarmUp(edit.renameSymbol, call)).toEqual({ tool: read.referencingSymbols, args: { [shared[0]]: 'remaining', [shared[1]]: 'src/todos.js' } });
    expect(codeIntelligenceWarmUp(edit.renameSymbol, { [shared[0]]: 'remaining' })).toEqual({ tool: read.referencingSymbols, args: { [shared[0]]: 'remaining' } });
    for (const [capability, name] of Object.entries({ ...read, ...edit })) {
      if (capability !== 'renameSymbol') expect(codeIntelligenceWarmUp(name, call)).toBeNull();
    }
    expect(codeIntelligenceWarmUp('renamed_by_the_user', call)).toBeNull();
  });
});
