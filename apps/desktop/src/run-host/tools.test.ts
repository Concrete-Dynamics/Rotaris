import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { TOOL_IMPLEMENTATIONS, type ApprovalPayload, type PermissionPreset } from '@rotaris/contracts';
import { loadConfiguration } from '@rotaris/config';
import { anySchema, gitReadTool, permissivePolicyRead, simpleExecutor, TodoList, todoTool, type ToolExecutor } from '@rotaris/agent-tools';
import { SessionWriter, type ToolPortContext } from '@rotaris/engine';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { personaResolverFor, runtimeFromConfiguration, type ConfiguredRun } from './configuration.js';
import type { McpHost } from './mcp.js';
import { createToolPort, isEntryPort, toolSpec, type ToolPortDeps } from './tools.js';

/**
 * Part N's finding: the entry test was written against the root id `root`, which Part B had already made
 * `root:<iteration>`, so the direct-work grant never reached the entry role. The port at depth 0 is the entry.
 */
describe('the entry role\'s tool port (REQ-ORCH-016/025)', () => {
  it.each<[string, { parentId?: string; depth?: number }, boolean]>([
    ['the run\'s root port, first iteration', { parentId: 'root:1', depth: 0 }, true],
    ['the run\'s root port, a later iteration', { parentId: 'root:7', depth: 0 }, true],
    ['a first-level child', { parentId: 'root:1', depth: 1 }, false],
    ['a grandchild', { parentId: 'bg_0a1b2c3d', depth: 2 }, false],
    ['no depth, no parent (a caller outside the run)', {}, true],
    ['no depth, the bare root id', { parentId: 'root' }, true],
    ['no depth, the iteration-suffixed root id', { parentId: 'root:3' }, true],
    ['no depth, a task id', { parentId: 'bg_0a1b2c3d' }, false],
  ])('%s', (_name, ctx, entry) => {
    expect(isEntryPort(ctx)).toBe(entry);
  });
});

/**
 * Found by reading run `a26918e8` (2026-09-16): the advertised schema was Zod's OUTPUT form, in which a field
 * carrying a `.default()` is required. The product therefore told the model that every phase must carry `tasks`
 * while the parser accepted it omitted — a contract advertised and not enforced, in the one built-in tool that
 * takes a batch.
 */
describe('the tool schema the model is handed (REQ-TOOLS-013)', () => {
  const phaseItems = (): Record<string, unknown> => {
    const spec = toolSpec(todoTool(new TodoList()));
    const properties = spec.parameters['properties'] as Record<string, { items: Record<string, unknown> }>;
    return properties['phases']!.items;
  };

  it('advertises the shape of a call about to be MADE, so a defaulted field is not advertised as required', () => {
    expect(phaseItems()['required']).toEqual(['name']);
  });

  it('still advertises what the parser does require', () => {
    const spec = toolSpec(todoTool(new TodoList()));
    expect(spec.parameters['required']).toEqual(['operation']);
    // REQ-TOOLS-144's five reach the model as an enum rather than as a bare string in a prose description.
    const properties = spec.parameters['properties'] as Record<string, { enum?: string[] }>;
    expect(properties['operation']!.enum).toEqual(['replace', 'add_phase', 'add_task', 'update', 'remove_task']);
  });

  it('advertises git_read\'s two operations with ref optional (REQ-TOOLS-193)', () => {
    // The inventory-to-executor link: the name the Tools surface lists is the executor the port wires.
    expect(TOOL_IMPLEMENTATIONS['git_read']).toBe('gitReadTool');
    const spec = toolSpec(gitReadTool('D:/work'));
    expect(spec.name).toBe('git_read');
    expect(spec.parameters['required']).toEqual(['operation']);
    const properties = spec.parameters['properties'] as Record<string, { enum?: string[] }>;
    expect(properties['operation']!.enum).toEqual(['head', 'read_ref']);
  });
});

/**
 * REQ-TOOLS-048/073/074 (narrowed by PD-TOOLS-002): the port is where the requested mode is SELECTED, from the
 * persona's `permission_mode` pin, the session-level override a mid-session change recorded, and
 * `runtime.permission_mode`. Recorded defect, owner-reported 2026-09-21: the override did not exist, so every
 * agent built after a mid-run switch — every delegated child — was constructed with the start-of-run mode.
 */
describe('the permission mode an agent is BUILT with (REQ-TOOLS-048/073/074)', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  const warnings: string[] = [];

  const yaml = (pin: string | null, tools: string | null = null) => `default_persona: coding-agent
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
personas:
  coding-agent:
    name: Coding agent
    model: selected
${pin === null ? '' : `    permission_mode: ${pin}\n`}${tools === null ? '' : `    tools: ${tools}\n`}runtime:
  permission_mode: ask
`;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-mode-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    const created = SessionWriter.create(
      { dal, sessionId: asSessionId('S1'), wall: new FakeClock(), retentionCap: 0, warn: (m) => warnings.push(m), onCommitted: () => undefined },
      { workspaceRoot: dir, pid: 1, host: mintMachineId('0000000000000000000000000000000a') },
    );
    if (!created.ok) throw new Error('writer');
    writer = created.value;
    warnings.length = 0;
    presented.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const presented: ApprovalPayload[] = [];
  function portFor(pin: string | null, modeOverride: string | null, extra: Pick<ToolPortContext, 'writeClaimFor'> = {}, surface: { tools?: string; mcp?: readonly ToolExecutor[] } = {}) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), yaml(pin, surface.tools ?? null));
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async (p) => { presented.push(p); return { ok: true }; }, close: () => undefined },
      nextSequence: () => 1, fileStates: new Map(), terminal: null,
      egress: () => permissivePolicyRead,
      // A stand-in MCP host whose one server offers the given executors (ADR-0034's surface, without a server process).
      ...(surface.mcp ? {
        mcp: { prepare: async () => undefined, surfaceFor: () => ({ persona: 'coding-agent', active: [], dropped: [] }), section: () => '', executorsFor: () => [...(surface.mcp ?? [])] } as unknown as McpHost,
        configured: () => ({ cfg }) as unknown as ConfiguredRun,
      } : {}),
    };
    return createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'coding-agent', agentName: 'coding-agent',
      requestedMode: 'ask', modeOverride, attended: () => true, warn: (m) => warnings.push(m), abortRun: () => undefined, ...extra,
    }, deps);
  }

  it('PD-TOOLS-006: the engine\'s write-claim predicate reaches the gate, which refuses a claimed write before it runs', async () => {
    const asked: string[] = [];
    const port = portFor(null, 'autonomous', { writeClaimFor: (rel) => { asked.push(rel); return rel.startsWith('src/api/') ? { canonicalName: 'api', persona: 'coding-agent', pattern: 'src/api/**' } : null; } });
    const call = (path: string) => ({ callId: `c-${path}`, name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path, content: 'x' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' });
    const refused = await port.dispatch(call('src/api/users.ts'), new AbortController().signal);
    expect(refused).toMatchObject({ status: 'blocked', isError: true });
    expect(refused.text).toContain('inside the write scope of api (coding-agent)');
    expect(existsSync(join(dir, 'src', 'api', 'users.ts'))).toBe(false);
    const written = await port.dispatch(call('src/ui/view.ts'), new AbortController().signal);
    expect(written.status).toBe('ok');
    expect(asked).toEqual(['src/api/users.ts', 'src/ui/view.ts']);
  });

  it('PD-ORCH-005 clause 9 through the port: a rest withdraws the approval a call waits on, and the call reaches the turn marked interrupted', async () => {
    const port = portFor(null, null);
    const pending = port.dispatch({ callId: 'c1', name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path: 'w.txt', content: 'x' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    expect(port.withdrawPending?.('pause')).toBe(1);
    const r = await pending;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true });
    expect(existsSync(join(dir, 'w.txt'))).toBe(false);
    expect(dal.timelineOf(asSessionId('S1')).map((t) => t.name)).toContain('approval_withdrawn');
    expect(dal.auditOf(asSessionId('S1'))).toEqual([]);
    expect(port.withdrawPending?.('pause')).toBe(0);
  });

  /**
   * PD-TOOLS-004 through the port: the gate's `publicTool` is what keeps a server's own `write_file` — offered under
   * that name to a persona whose public set lacks one — on REQ-TOOLS-024's exact match, while the public `write_file`
   * of another persona's port is scoped by path.
   */
  async function approveForSession(port: ReturnType<typeof portFor>, args: Record<string, unknown>, n: number) {
    const call = { callId: `c${n}`, name: 'write_file', rawArgs: JSON.stringify(args), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };
    const r = port.dispatch(call, new AbortController().signal);
    await vi.waitFor(() => expect(presented.length).toBeGreaterThanOrEqual(n));
    expect(port.answerApproval(presented[n - 1]!.request_id, 'session')).toBe(true);
    return r;
  }
  const again = (port: ReturnType<typeof portFor>, args: Record<string, unknown>) =>
    port.dispatch({ callId: 'again', name: 'write_file', rawArgs: JSON.stringify(args), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);

  it('PD-TOOLS-004: a server\'s own write_file keeps the exact match; the public write_file is scoped by path', async () => {
    const writes: unknown[] = [];
    const serverWrite = simpleExecutor('write_file', 'a server\'s write_file', anySchema, async (a) => { writes.push(a); return { text: 'written', isError: false }; });
    const mcpPort = portFor(null, null, {}, { tools: '[read_file]', mcp: [serverWrite] });
    await mcpPort.ready?.();
    expect(mcpPort.specs().filter((s) => s.name === 'write_file')).toHaveLength(1);
    expect((await approveForSession(mcpPort, { path: 'notes.md', content: 'one' }, 1)).status).toBe('ok');
    expect((await again(mcpPort, { path: 'notes.md', content: 'one' })).status).toBe('ok');
    expect(presented).toHaveLength(1);
    const other = again(mcpPort, { path: 'notes.md', content: 'two' });
    await vi.waitFor(() => expect(presented).toHaveLength(2));
    expect(mcpPort.answerApproval(presented[1]!.request_id, 'deny')).toBe(true);
    expect((await other).status).toBe('blocked');
    expect(writes).toEqual([{ path: 'notes.md', content: 'one' }, { path: 'notes.md', content: 'one' }]);

    const publicPort = portFor(null, null, {}, { tools: '[read_file, write_file]' });
    await publicPort.ready?.();
    expect((await approveForSession(publicPort, { operation: 'create', path: 'mine.md', content: 'one' }, 3)).status).toBe('ok');
    // another operation and content on the same path: no dialog, whatever the executor then makes of it
    await again(publicPort, { operation: 'overwrite', path: 'mine.md', content: 'two' });
    expect(presented).toHaveLength(3);
  });

  it('an agent built after a mid-run switch takes the session override, not the start-of-run mode', () => {
    expect(portFor(null, 'autonomous').currentMode()).toBe<PermissionPreset>('autonomous');
    expect(portFor(null, null).currentMode()).toBe<PermissionPreset>('ask');
  });

  it('REQ-TOOLS-048: the pin wins over a loosening override; an override at least as restrictive wins over the pin', () => {
    expect(portFor('restricted', 'autonomous').currentMode()).toBe<PermissionPreset>('restricted');
    expect(portFor('autonomous', 'ask').currentMode()).toBe<PermissionPreset>('ask');
    // With no override the pin still governs, over `runtime.permission_mode`.
    expect(portFor('restricted', null).currentMode()).toBe<PermissionPreset>('restricted');
  });

  it('REQ-TOOLS-074: a live change that would loosen a pinned agent leaves it under its pin and names the persona', () => {
    const pinned = portFor('restricted', null);
    expect(pinned.setMode('autonomous', 'user')).toMatchObject({ effective: 'restricted', previous: 'restricted', skippedPersona: 'coding-agent' });
    expect(pinned.currentMode()).toBe<PermissionPreset>('restricted');
    // A tightening change reaches a pinned agent; an unpinned one takes either direction.
    const pinnedLoose = portFor('autonomous', null);
    expect(pinnedLoose.setMode('ask', 'user')).toMatchObject({ effective: 'ask' });
    expect(pinnedLoose.setMode('ask', 'user')).not.toHaveProperty('skippedPersona');
    const unpinned = portFor(null, null);
    expect(unpinned.setMode('autonomous', 'user')).toMatchObject({ effective: 'autonomous' });
    expect(unpinned.currentMode()).toBe<PermissionPreset>('autonomous');
  });
});
