import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { TOOL_IMPLEMENTATIONS, type PermissionPreset } from '@rotaris/contracts';
import { loadConfiguration } from '@rotaris/config';
import { gitReadTool, permissivePolicyRead, TodoList, todoTool } from '@rotaris/agent-tools';
import { SessionWriter, type ToolPortContext } from '@rotaris/engine';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { personaResolverFor, runtimeFromConfiguration } from './configuration.js';
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

  const yaml = (pin: string | null) => `default_persona: coding-agent
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
${pin === null ? '' : `    permission_mode: ${pin}\n`}runtime:
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
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function portFor(pin: string | null, modeOverride: string | null, extra: Pick<ToolPortContext, 'writeClaimFor'> = {}) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), yaml(pin));
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async () => ({ ok: true }), close: () => undefined },
      nextSequence: () => 1, fileStates: new Map(), terminal: null,
      egress: () => permissivePolicyRead,
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
