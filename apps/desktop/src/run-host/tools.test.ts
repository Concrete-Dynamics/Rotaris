import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { TOOL_IMPLEMENTATIONS, type ApprovalPayload, type PermissionPreset } from '@rotaris/contracts';
import { loadConfiguration } from '@rotaris/config';
import { anySchema, gitReadTool, permissivePolicyRead, simpleExecutor, TodoList, todoTool, type ToolExecutor } from '@rotaris/agent-tools';
import { SessionWriter, UserPresence, type ToolPortContext } from '@rotaris/engine';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { personaResolverFor, runtimeFromConfiguration, type ConfiguredRun } from './configuration.js';
import type { McpHost } from './mcp.js';
import { createToolPort, isEntryPort, RunHostPresenter, toolSpec, type ToolPortDeps } from './tools.js';

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
  /** The port's clocks, advanced by the PD-TOOLS-005 case to expire an approval wait. */
  let portClock = new FakeClock();
  function portFor(pin: string | null, modeOverride: string | null, extra: Pick<ToolPortContext, 'writeClaimFor' | 'planGateHeld' | 'presence' | 'hooks'> = {}, surface: { tools?: string; mcp?: readonly ToolExecutor[] } = {}) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), yaml(pin, surface.tools ?? null));
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    portClock = new FakeClock();
    const deps: ToolPortDeps = {
      clocks: portClock, runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
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

  /**
   * Live-run finding K1 (R-067): the inspector drew "No tools resolved." for the run-level agent. The port now reports the
   * native set its ONE resolution kept that holds an executor, so the surface shows what the agent can call — and, for a coordinator, not the
   * write, terminal and commit tools its policy withholds (REQ-MONITOR-061).
   */
  it('REQ-MONITOR-060/061: the port reports its resolved native tools — the listing\'s own names, a coordinator\'s withheld tools absent', async () => {
    const coding = portFor(null, null, {}, { tools: '[read_file, grep, write_file]' });
    await coding.ready?.();
    expect(coding.resolvedTools?.()).toEqual(['read_file', 'grep', 'write_file']);
    expect(coding.resolvedTools?.()).toEqual(coding.specs().map((s) => s.name));

    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), yaml(null, null));
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const root = createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'orchestrator', agentName: 'orchestrator', parentId: 'root:1', depth: 0,
      // A delegation runtime is what makes the orchestrator a coordinator (REQ-ORCH-029); nothing here is dispatched.
      delegation: {} as NonNullable<ToolPortContext['delegation']>,
      requestedMode: 'ask', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), abortRun: () => undefined,
    }, { clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver, presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal: null, egress: () => permissivePolicyRead });
    await root.ready?.();
    const resolved = root.resolvedTools?.() ?? [];
    expect(resolved).toEqual(expect.arrayContaining(['read_file', 'grep', 'delegate', 'todo', 'ask_questions']));
    for (const withheld of ['write_file', 'haet_edit', 'haet', 'terminal', 'git_commit']) expect(resolved).not.toContain(withheld);
    expect(resolved).toEqual(root.specs().map((s) => s.name));
  });

  /**
   * PD-TOOLS-005 through the real port: the engine's away holder reaches the gate, which marks it when the configured
   * wait (`runtime.approval_timeout_seconds`, 300 s here) expires unanswered and, while it is marked, resolves the next
   * ask at once with the directive's reason and presents nothing. The return is the engine's (`sessions.ts`); here the
   * holder is cleared directly, and the following ask is brokered again.
   */
  it('PD-TOOLS-005: the run\'s away holder reaches the gate — marked by the expired wait, read before the next prompt, brokered again after the return', async () => {
    const lines: string[] = [];
    const presence = new UserPresence({ record: (m) => lines.push(m) });
    const port = portFor(null, null, { presence });
    const call = (id: string, path: string) => ({ callId: id, name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path, content: 'x' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' });
    const first = port.dispatch(call('c1', 'a.txt'), new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    portClock.advance(299_999);
    expect(presence.away()).toBeNull();
    portClock.advance(1);
    const r1 = await first;
    expect(r1).toMatchObject({ status: 'blocked', isError: true });
    expect(r1.blockedReason).toMatch(/Denied because no answer arrived within 300 seconds\.$/);
    expect(presence.away()).toEqual({ afterSeconds: 300 });
    expect(lines[0]).toMatch(/^user away: an approval in this run went unanswered for 300 seconds/);
    const r2 = await port.dispatch(call('c2', 'b.txt'), new AbortController().signal);
    expect(presented).toHaveLength(1);
    expect(r2.status).toBe('blocked');
    expect(r2.blockedReason).toBe("No rule matched; permission mode 'ask' defaults to ask. The user is treated as away because an earlier approval in this run went unanswered for 300 seconds, so the request was denied.");
    expect(existsSync(join(dir, 'b.txt'))).toBe(false);
    presence.returned();
    const third = port.dispatch(call('c3', 'c.txt'), new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(2));
    expect(port.answerApproval(presented[1]!.request_id, 'once')).toBe(true);
    expect((await third).status).toBe('ok');
    expect(existsSync(join(dir, 'c.txt'))).toBe(true);
  });

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

  it('PD-ORCH-005 clause 9 through the port (found by phase 3\'s review): a rest withdraws a waiting question — recorded as withdrawn, the call never run, no tool error raised', async () => {
    const port = portFor(null, null, {}, { tools: '[read_file, ask_questions]' });
    const call = { callId: 'q1', name: 'ask_questions', rawArgs: JSON.stringify({ steps: [{ id: 'a', title: 'Which one?' }] }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };
    const pending = port.dispatch(call, new AbortController().signal);
    // Under `ask` the call is approved first; the question it then puts is the wait the rest withdraws.
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    expect(port.answerApproval(presented[0]!.request_id, 'once')).toBe(true);
    await vi.waitFor(() => expect(port.pendingQuestions?.()).toHaveLength(1));
    expect(port.withdrawPending?.('stop')).toBe(1);
    const r = await pending;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true });
    expect(r.text).toBe('The questions were withdrawn by the stop before the user answered. Nothing was answered; ask again if the answers are still needed.');
    expect(port.pendingQuestions?.()).toEqual([]);
    const timeline = dal.timelineOf(asSessionId('S1'));
    expect(JSON.parse(timeline.find((t) => t.name === 'question_withdrawn')!.metadata)).toMatchObject({ tool: 'ask_questions', interruption: 'stop' });
    expect(dal.issuesOf(asSessionId('S1')).map((i) => i.kind)).not.toContain('tool_error');
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

  /**
   * An MCP tool offered under a public name is not that public tool (REQ-TOOLS-001 as ADR-0016 reads it): the surface
   * prefixes a server's tool only when its name is taken, so a server's `read_file` reaches a persona whose public set
   * lacks one under the plain name, and until 2026-09-28 the policy's class rules and the plan gate's two enforcement
   * points knew it by that name alone (`docs/defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`).
   */
  it('a server\'s own read_file is withheld at the plan gate like any undeclared tool, and is not granted by ask:read-only-tool (REQ-ORCH-153, REQ-TOOLS-043)', async () => {
    const reads: unknown[] = [];
    const serverRead = simpleExecutor('read_file', 'a server\'s read_file', anySchema, async (a) => { reads.push(a); return { text: 'read', isError: false }; });
    const call = { callId: 'r1', name: 'read_file', rawArgs: JSON.stringify({ path: 'notes.md' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };

    const held = portFor(null, 'autonomous', { planGateHeld: () => true }, { tools: '[grep]', mcp: [serverRead] });
    await held.ready?.();
    expect(held.specs().map((s) => s.name)).not.toContain('read_file');
    expect(warnings.some((w) => w.includes("'read_file' is withheld while this run is held at the plan gate"))).toBe(true);
    const refused = await held.dispatch(call, new AbortController().signal);
    expect(refused).toMatchObject({ status: 'blocked', isError: true });
    expect(refused.text).toContain('held at the plan gate');
    expect(reads).toEqual([]);

    // The same server tool on a run that is not held, under `ask`: the read-only class is the public tools', so it asks.
    const open = portFor(null, null, {}, { tools: '[grep]', mcp: [serverRead] });
    await open.ready?.();
    expect(open.specs().map((s) => s.name)).toContain('read_file');
    const asked = open.dispatch(call, new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    expect(presented[0]).toMatchObject({ tool_name: 'read_file', rule_id: 'preset:ask' });
    expect(open.answerApproval(presented[0]!.request_id, 'deny')).toBe(true);
    expect((await asked).status).toBe('blocked');
    expect(reads).toEqual([]);

    // The public read_file of another persona's port under the same preset is allowed by ask:read-only-tool, no dialog.
    const publicPort = portFor(null, null, {}, { tools: '[read_file]' });
    await publicPort.ready?.();
    writeFileSync(join(dir, 'notes.md'), 'x\n');
    expect((await publicPort.dispatch(call, new AbortController().signal)).status).toBe('ok');
    expect(presented).toHaveLength(1);
  });

  /**
   * REQ-SESSION-094 (the repair of `a-detached-call-still-writes-through-its-tool-gate.md`): when its run ends the engine
   * closes each port. The call it still has open is settled then, before the run's terminal pair, with the statement the
   * engine hands it; when that call returns later its gate writes nothing more — no settle, no `tool.finish`, no issue.
   */
  it('REQ-SESSION-094: a port closed at its run\'s end settles the call it still has open, and the call writes nothing through its gate when it returns', async () => {
    let release!: () => void;
    const late = new Promise<void>((r) => { release = r; });
    const slow = simpleExecutor('slow_tool', 'a call that outlives its run', anySchema, async () => { await late; return { text: 'it failed after the run ended', isError: true }; });
    // The run's tool hooks: a `post_tool` hook the straggler would fire writes into the session and runs a command.
    const hooked: string[] = [];
    const hooks = { preTool: async () => { hooked.push('pre'); return { blocked: false, refusal: '' }; }, postTool: async () => { hooked.push('post'); return { feedback: '' }; } };
    const port = portFor(null, 'autonomous', { hooks }, { tools: '[read_file]', mcp: [slow] });
    await port.ready?.();
    const sid = asSessionId('S1');
    const pending = port.dispatch({ callId: 's1', name: 'slow_tool', rawArgs: '{}', persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);
    await vi.waitFor(() => expect(dal.eventsOfKind(sid, 'tool.start')).toHaveLength(1));
    const statement = 'This call was interrupted by the stop before it completed, and it was not re-run. Issue it again if it is still needed.';
    const settles = vi.spyOn(writer, 'settleToolCall');
    port.close?.(statement);
    const ring = () => dal.db.prepare('SELECT status, is_error, entry FROM tool_calls WHERE session_id = ?').all(sid) as { status: string; is_error: number; entry: string }[];
    expect(ring()).toHaveLength(1);
    expect(ring()[0]).toMatchObject({ status: 'failed', is_error: 1 });
    expect(JSON.parse(ring()[0]!.entry)).toMatchObject({ result: statement });
    expect(dal.eventsOfKind(sid, 'tool.finish')).toHaveLength(1);
    const holdings = () => ({ events: dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind), ring: ring(), issues: dal.issuesOf(sid).length, timeline: dal.timelineOf(sid).length, audit: dal.auditOf(sid).length });
    const before = holdings();
    release();
    const r = await pending;
    // The gate still answers its caller — the engine has stopped listening — but nothing reaches the session.
    expect(r).toMatchObject({ isError: true, text: 'it failed after the run ended' });
    expect(holdings()).toEqual(before);
    // The close's settle is the only one: the late return does not reach the writer at all, not even as a settle the
    // store would refuse (the sink's own guard, pinned here).
    expect(settles).toHaveBeenCalledTimes(1);
    expect(hooked).toEqual(['pre']);
    // A second close finds nothing open and writes nothing.
    port.close?.(statement);
    expect(holdings()).toEqual(before);
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

/**
 * ADR-0019's handshake with REQ-TOOLS-063's queue. Main must acknowledge a present-request within the bound, by showing
 * the dialog or by saying it queued the request behind the one already open. A queued request then waits for its turn
 * unbounded. Before `approval.queued` existed, a request queued behind a dialog left open for more than 10 s was denied
 * "because the approval request could not be shown".
 */
describe('RunHostPresenter (ADR-0019, REQ-TOOLS-063)', () => {
  const payload = (id: string): ApprovalPayload => ({ request_id: id, session_id: 's', agent_id: 'a', persona: 'p', tool_name: 'delegate', command: '', argument_summary: '', rule_id: 'preset:ask', reason: 'r', sequence: 1 });
  const presenterWith = () => {
    const clock = new FakeClock();
    const posted: string[] = [];
    const closed: string[] = [];
    const presenter = new RunHostPresenter({ post: (p) => posted.push(p.request_id), close: (id) => closed.push(id), clocks: clock, shownBoundMs: 10_000 });
    return { clock, posted, closed, presenter };
  };

  it('a request main queued behind its open dialog is not denied at the bound, and resolves when it is shown', async () => {
    const t = presenterWith();
    let settled: unknown = null;
    void t.presenter.present(payload('q1')).then((r) => { settled = r; });
    expect(t.presenter.queued('q1')).toBe(true);
    t.clock.advance(60_000);
    await Promise.resolve();
    expect(settled).toBeNull();
    expect(t.presenter.shown('q1', true)).toBe(true);
    await Promise.resolve();
    expect(settled).toEqual({ ok: true });
  });

  it('a request main never acknowledges is still a presenter error at the bound', async () => {
    const t = presenterWith();
    const r = t.presenter.present(payload('q2'));
    t.clock.advance(10_000);
    expect(await r).toEqual({ ok: false, error: 'main did not confirm the dialog within 10000 ms' });
    expect(t.presenter.queued('q2')).toBe(false);
  });

  it('closing a request still queued releases it and tells main to drop it', async () => {
    const t = presenterWith();
    const r = t.presenter.present(payload('q3'));
    t.presenter.queued('q3');
    t.presenter.close('q3');
    expect(await r).toMatchObject({ ok: false });
    expect(t.closed).toEqual(['q3']);
    expect(t.presenter.shown('q3', true)).toBe(false);
  });
});

