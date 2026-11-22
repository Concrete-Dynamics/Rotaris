/**
 * PD-CONFIG-014: the `configure` tool, the gate's ruling on it, and the file tools closed to Rotaris's own configuration.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configKeyClass, configureChangeOf, configureSetAlwaysAsks } from '@rotaris/contracts';
import { argumentSummary, buildPolicy, evaluate, permissionRequest, PolicyContext, type EvaluationEnv } from '../policy.js';
import { configureTool, type ConfigurationPort } from './configure.js';
import { checkFence, pathRuleFor, protectedWriteRefusal } from './fence.js';
import type { ToolContext } from './types.js';

const ctx = {} as ToolContext;

function fakePort(initial: Record<string, unknown> = {}): ConfigurationPort & { writes: { key: string; scope: string; value: unknown }[] } {
  const values = new Map(Object.entries(initial));
  const writes: { key: string; scope: string; value: unknown }[] = [];
  return {
    writes,
    read: (key) => ({ value: values.get(key), scope: values.has(key) ? 'workspace' : 'default', file: values.has(key) ? '/ws/.rotaris/agents.yaml' : null }),
    write: async (key, scope, value) => {
      writes.push({ key, scope, value });
      const stated = values.has(key);
      const before = values.get(key);
      values.set(key, value);
      return Promise.resolve({ ok: true as const, file: '/ws/.rotaris/agents.yaml', stated, before });
    },
  };
}

describe('the key classes (PD-CONFIG-014 clause 4)', () => {
  it('an ordinary key changes what a run does, an authority key what it may do, and a credential is never reached', () => {
    for (const k of ['default_persona', 'medium_model', 'runtime.max_iterations', 'personas.coding-agent.model', 'models.local.temperature', 'skills.enabled', 'display.show_tool_inputs', 'instructions.overrides']) expect(configKeyClass(k), k).toBe('ordinary');
    for (const k of ['runtime.permission_mode', 'runtime.sandbox_mode', 'runtime.allow_outside_workspace', 'runtime.network_allowed_hosts', 'mcp_servers', 'mcp_servers.browser.command', 'hooks', 'project_init', 'personas.coding-agent.tools', 'personas.coding-agent', 'models.local.base_url', 'runtime', 'dictation.base_url']) expect(configKeyClass(k), k).toBe('authority');
    for (const k of ['models.local.api_key', 'mcp_servers.x.env.GITHUB_TOKEN', 'dictation.bearer']) expect(configKeyClass(k), k).toBe('never');
    for (const k of ['', 'no_such_key', 'workspace_root', 'medium_model.extra', 'a..b', 'x'.repeat(300)]) expect(configKeyClass(k), k).toBe('unknown');
  });

  it('a set always asks for an authority key and for any key in the global scope', () => {
    expect(configureSetAlwaysAsks('runtime.permission_mode', 'workspace')).toBe(true);
    expect(configureSetAlwaysAsks('medium_model', 'global')).toBe(true);
    expect(configureSetAlwaysAsks('medium_model', 'workspace')).toBe(false);
    expect(configureSetAlwaysAsks('medium_model', undefined)).toBe(false);
  });
});

describe('the gate rules on configure before any grant (PD-CONFIG-014 clauses 3 and 4)', () => {
  const env: EvaluationEnv = { attended: true, workspaceRoot: '/ws', resolvePath: (p) => p, publicTool: () => true };
  const set = (key: string, scope?: string) => permissionRequest('configure', 'orchestrator', { operation: 'set', setting: key, value: 'x', ...(scope ? { scope } : {}) });

  it('read and explain are never gated', () => {
    const policy = buildPolicy({ preset: 'restricted', workspaceRoot: '/ws' });
    expect(evaluate(policy, [], permissionRequest('configure', 'orchestrator', { operation: 'read', setting: 'runtime.permission_mode' }), env).decision).toBe('allow');
    expect(evaluate(policy, [], permissionRequest('configure', 'orchestrator', { operation: 'explain', setting: 'hooks' }), env).decision).toBe('allow');
  });

  it('an authority set asks even under autonomous, and a session grant does not pre-approve it', () => {
    const context = new PolicyContext(buildPolicy({ preset: 'autonomous', workspaceRoot: '/ws' }));
    const req = set('runtime.permission_mode');
    expect(context.evaluate(req, env)).toMatchObject({ decision: 'ask', ruleId: 'builtin:configure-authority', source: 'builtin' });
    context.grant(req, { workspaceRoot: '/ws', resolvePath: (p: string) => p, publicTool: () => true });
    expect(context.evaluate(req, env).decision).toBe('ask');
  });

  it('with no one to ask, an authority set is denied rather than handed to the headless policy', () => {
    const policy = buildPolicy({ preset: 'autonomous', workspaceRoot: '/ws' });
    expect(evaluate(policy, [], set('hooks'), { ...env, attended: false }).decision).toBe('deny');
  });

  it('a global set asks; an ordinary workspace set falls through to the mode in effect', () => {
    const autonomous = buildPolicy({ preset: 'autonomous', workspaceRoot: '/ws' });
    expect(evaluate(autonomous, [], set('medium_model', 'global'), env).decision).toBe('ask');
    const ordinary = evaluate(autonomous, [], set('medium_model'), env);
    expect(ordinary.ruleId).not.toBe('builtin:configure-authority');
    expect(ordinary.decision).toBe('allow');
  });

  it('the dialog shows the setting: its argument name is not masked as a secret\'s', () => {
    expect(argumentSummary(set('runtime.permission_mode'))).toContain('setting=runtime.permission_mode');
  });

  it('an MCP tool offered under the name is not ruled as the public tool', () => {
    const policy = buildPolicy({ preset: 'autonomous', workspaceRoot: '/ws' });
    expect(evaluate(policy, [], set('hooks'), { ...env, publicTool: () => false }).ruleId).not.toBe('builtin:configure-authority');
  });
});

describe('the configure executor (PD-CONFIG-014 clauses 1 and 5)', () => {
  it('reads a value with the file that states it', async () => {
    const tool = configureTool(fakePort({ medium_model: 'local' }));
    const obs = await tool.execute({ operation: 'read', setting: 'medium_model' }, ctx);
    expect(obs.isError).toBe(false);
    expect(obs.text).toContain('medium_model = "local"');
    expect(obs.text).toContain('workspace');
  });

  it('explains the class', async () => {
    const obs = await configureTool(fakePort()).execute({ operation: 'explain', setting: 'runtime.sandbox_mode' }, ctx);
    expect(obs.text).toContain('authority key');
  });

  it('sets one key in the workspace scope by default and says it applies at the next run', async () => {
    const port = fakePort({ medium_model: 'a' });
    const obs = await configureTool(port).execute({ operation: 'set', setting: 'medium_model', value: 'b' }, ctx);
    expect(port.writes).toEqual([{ key: 'medium_model', scope: 'workspace', value: 'b' }]);
    expect(obs.text).toContain('"a" → "b"');
    expect(obs.text).toContain('next run');
  });

  it('refuses a credential, an unknown key and a set with no value, writing nothing', async () => {
    const port = fakePort();
    const tool = configureTool(port);
    expect((await tool.execute({ operation: 'set', setting: 'models.x.api_key', value: 'sk' }, ctx)).isError).toBe(true);
    expect((await tool.execute({ operation: 'read', setting: 'models.x.api_key' }, ctx)).isError).toBe(true);
    expect((await tool.execute({ operation: 'set', setting: 'no_such_key', value: 1 }, ctx)).isError).toBe(true);
    expect((await tool.execute({ operation: 'set', setting: 'medium_model' }, ctx)).isError).toBe(true);
    expect(port.writes).toEqual([]);
  });

  it('reports a refused write as an error', async () => {
    const port: ConfigurationPort = { read: () => ({ value: undefined, scope: 'default', file: null }), write: () => Promise.resolve({ ok: false, error: 'the configuration would not load' }) };
    const obs = await configureTool(port).execute({ operation: 'set', setting: 'runtime.max_iterations', value: -1 }, ctx);
    expect(obs.isError).toBe(true);
    expect(obs.text).toContain('would not load');
  });
});

describe('the file tools never write .rotaris/, .git/ or the global configuration (PD-CONFIG-014 clause 6)', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const root = (): { ws: string; global: string } => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'rotaris-configure-fence-')));
    dirs.push(base);
    const ws = join(base, 'ws');
    const global = join(base, 'config');
    mkdirSync(join(ws, '.rotaris'), { recursive: true });
    mkdirSync(global, { recursive: true });
    return { ws, global };
  };

  it('refuses a write under .rotaris and .git, and reads them as before', () => {
    const { ws } = root();
    const fence = { workspaceRoot: ws, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
    const w = checkFence(fence, '.rotaris/agents.yaml', 'write');
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.message).toContain('configure');
    expect(checkFence(fence, '.git/hooks/pre-commit', 'write').ok).toBe(false);
    expect(checkFence(fence, '.rotaris/agents.yaml', 'read').ok).toBe(true);
    expect(checkFence(fence, 'src/.rotaris-notes.md', 'write').ok).toBe(true);
    expect(checkFence(fence, 'docs/.git/x', 'write').ok).toBe(true);
  });

  it('refuses a write into the global configuration directory even with the outside-workspace opt-out on', () => {
    const { ws, global } = root();
    const fence = { workspaceRoot: ws, allowOutsideWorkspace: true, additionalReadOnlyRoots: [], protectedWriteRoots: [global] };
    expect(checkFence(fence, join(global, 'agents.yaml'), 'write').ok).toBe(false);
    expect(checkFence(fence, join(global, 'agents.yaml'), 'read').ok).toBe(true);
  });

  it('compares the protected name as the platform folds it', () => {
    expect(protectedWriteRefusal('.ROTARIS/agents.yaml', '/x', [], pathRuleFor('win32'))).not.toBeNull();
    expect(protectedWriteRefusal('.ROTARIS/agents.yaml', '/x', [], pathRuleFor('linux'))).toBeNull();
  });
});

describe('the dialog\'s description of a set (PD-CONFIG-014 revision 3, clause 4)', () => {
  it('names the setting, its value now and where, and the value proposed; and nothing for a read', () => {
    const tool = configureTool(fakePort({ 'runtime.permission_mode': 'autonomous' }));
    expect(tool.describeForApproval?.({ operation: 'set', setting: 'runtime.permission_mode', value: 'restricted' })).toEqual({ setting: 'runtime.permission_mode', scope: 'workspace', current: '"autonomous"', currentScope: 'workspace', proposed: '"restricted"' });
    expect(tool.describeForApproval?.({ operation: 'set', setting: 'hooks', value: [], scope: 'global' })).toMatchObject({ scope: 'global', current: null, currentScope: 'default' });
    expect(tool.describeForApproval?.({ operation: 'read', setting: 'hooks' })).toBeNull();
  });

  it('a set\'s result ends with the change as data', async () => {
    const obs = await configureTool(fakePort({ medium_model: 'a' })).execute({ operation: 'set', setting: 'medium_model', value: 'b' }, ctx);
    expect(configureChangeOf(obs.text)).toEqual({ setting: 'medium_model', scope: 'workspace', stated: true, before: 'a', after: 'b' });
  });
});
