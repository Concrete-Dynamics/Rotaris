import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_NAMES } from '@rotaris/contracts';
import { builtInDefaults } from '../defaults.js';
import {
  CODE_INTELLIGENCE_BINDING, CODE_INTELLIGENCE_DEFAULT_ARGS, CODE_INTELLIGENCE_MANIFEST, CODE_INTELLIGENCE_MEMORY_GATE, CODE_INTELLIGENCE_SETUP_STEPS,
  deriveSetupInvocation, grantForTiers, hasIndexableExtension, memoriesBlockApplies, neverGrantNames, PROJECT_MEMORIES_BLOCK, tierNames,
} from './code-intelligence.js';
import { CODE_INTELLIGENCE_TOKEN, resolveCommand } from './commands.js';
import { BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS, BUILT_IN_PERSONA_MCP_SERVERS, SHIPPED_MCP_SERVERS } from './defaults.js';
import { renderMcpSection } from './prompt.js';
import type { McpServerEntry } from './entry.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const pins = JSON.parse(readFileSync(join(repo, 'apps', 'desktop', 'scripts', 'code-intelligence', 'pins.json'), 'utf8')) as { python: string; distribution: string; version: string };

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
