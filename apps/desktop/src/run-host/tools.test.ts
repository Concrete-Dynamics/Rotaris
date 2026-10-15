import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { TOOL_IMPLEMENTATIONS, type ApprovalPayload, type PermissionPreset } from '@rotaris/contracts';
import { CODE_INTELLIGENCE_BINDING, CODE_INTELLIGENCE_DEFAULT_ARGS, loadConfiguration, renderMcpSection, type LoadedConfiguration, type PersonaMcpSurface } from '@rotaris/config';
import { anySchema, gitReadTool, grantFacets, HAND_OFF_SENTENCE, permissivePolicyRead, REPORT_ARTIFACT_SENTENCE, simpleExecutor, TodoList, todoTool, type TerminalManager, type ToolExecutor } from '@rotaris/agent-tools';
import { resolveDelegationTarget, SessionWriter, UserPresence, type ArtifactOps, type ToolPortContext } from '@rotaris/engine';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { personaResolverFor, runtimeFromConfiguration, type ConfiguredRun } from './configuration.js';
import type { McpHost } from './mcp.js';
import { createToolPort, implementationRole, isEntryPort, RunHostPresenter, toolSpec, type ToolPortDeps } from './tools.js';

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
    presence.attended = true;
    presence.quitting = false;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const presented: ApprovalPayload[] = [];
  /** The port's clocks, advanced by the PD-TOOLS-005 case to expire an approval wait. */
  let portClock = new FakeClock();
  /** PD-ORCH-005 clause 9: the presenter fact as the quit leaves it — no window, the quit under way. */
  const presence = { attended: true, quitting: false };
  function portFor(pin: string | null, modeOverride: string | null, extra: Pick<ToolPortContext, 'writeClaimFor' | 'planGateHeld' | 'presence' | 'hooks' | 'pendingQuestionsOfSession' | 'pendingApprovalsOfSession'> = {}, surface: { tools?: string; mcp?: readonly ToolExecutor[] } = {}) {
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
      quitting: () => presence.quitting,
      // A stand-in MCP host whose one server offers the given executors (ADR-0034's surface, without a server process).
      ...(surface.mcp ? {
        mcp: { prepare: async () => undefined, surfaceFor: () => ({ persona: 'coding-agent', active: [], dropped: [] }), section: () => '', executorsFor: () => [...(surface.mcp ?? [])] } as unknown as McpHost,
        configured: () => ({ cfg }) as unknown as ConfiguredRun,
      } : {}),
    };
    return createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'coding-agent', agentName: 'coding-agent',
      requestedMode: 'ask', modeOverride, attended: () => presence.attended, warn: (m) => warnings.push(m), abortRun: () => undefined, ...extra,
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
   * Live-run finding L14 (R-067): every coordinated run wrote four `warning` lines for the orchestrator's
   * `coordinator_only` removals — the configuration working as designed. REQ-TOOLS-006 obliges the line and names no
   * level; a REQ-TOOLS-006 control's removal is written at `info` (PD-MONITOR-002's default threshold keeps it), and a
   * REQ-TOOLS-004 prerequisite's removal — a declared tool this run cannot provide — stays a warning.
   */
  it('REQ-TOOLS-006: a narrowing control\'s removal is logged at info with the persona and the control; a REQ-TOOLS-004 prerequisite\'s stays a warning', async () => {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), yaml(null, null));
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const infos: string[] = [];
    const deps: ToolPortDeps = { clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver, presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal: null, egress: () => permissivePolicyRead };
    createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'orchestrator', agentName: 'orchestrator', parentId: 'root:1', depth: 0,
      delegation: {} as NonNullable<ToolPortContext['delegation']>,
      requestedMode: 'ask', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), info: (m) => infos.push(m), abortRun: () => undefined,
    }, deps);
    const removed = (lines: readonly string[]) => lines.filter((l) => / removed from orchestrator by /.test(l));
    expect(removed(warnings).filter((l) => l.includes(' by coordinator_only '))).toEqual([]);
    for (const tool of ['terminal', 'write_file', 'haet_edit', 'haet']) expect(removed(infos)).toContain(`tool '${tool}' removed from orchestrator by coordinator_only (REQ-TOOLS-004/006)`);
    // No artifact store was handed to this port: that removal is a prerequisite's, and it is not moved below warning.
    expect(removed(warnings)).toContain("tool 'artifact_read' removed from orchestrator by prerequisite (artifact_store_absent) (REQ-TOOLS-004/006)");
    expect(removed(infos).filter((l) => l.includes(' by prerequisite '))).toEqual([]);

    // The same orchestrator doing the work itself (no delegation runtime) keeps its write and command tools; `terminal`
    // then needs a backend this port was not given, and `delegate` a runtime — prerequisites' removals, still warnings.
    warnings.length = 0;
    infos.length = 0;
    createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'orchestrator', agentName: 'orchestrator', parentId: 'root:1', depth: 0,
      requestedMode: 'ask', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), info: (m) => infos.push(m), abortRun: () => undefined,
    }, deps);
    expect(removed(warnings)).toContain("tool 'terminal' removed from orchestrator by prerequisite (terminal_backend_absent) (REQ-TOOLS-004/006)");
    expect(removed(warnings)).toContain("tool 'delegate' removed from orchestrator by prerequisite (delegation_runtime_absent) (REQ-TOOLS-004/006)");
    expect(removed(infos)).toEqual([]);
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

  /*
   * PD-ORCH-005 clause 9 after a crash, and REQ-SESSION-031 (`docs/defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md`):
   * a question waiting on the user is mirrored to `sessions.pending_questions` — the session's whole list, which the run hands
   * the port — so a crash's record, written from the store, can withdraw it, and the listing can flag the session. The
   * column empties once the prompt is answered.
   */
  it('PD-ORCH-005 clause 9 / REQ-SESSION-031 through the port: a waiting question is mirrored to pending_questions as the session\'s list, and leaves it when answered', async () => {
    const other = { request_id: 'q-other', session_id: 'S1', conversation_id: 'bg_000000c1', agent_id: 'reviewer', persona: 'reviewer', steps: [{ id: 'x', title: 'Other?', description: '', options: [], allow_freeform: true }] };
    let mine: () => readonly unknown[] = () => [];
    const port = portFor(null, null, { pendingQuestionsOfSession: () => [other, ...mine()] as never }, { tools: '[read_file, ask_questions]' });
    mine = () => port.pendingQuestions?.() ?? [];
    const stored = (): { request_id: string }[] => JSON.parse(dal.getSession(asSessionId('S1'))?.pending_questions ?? '[]') as { request_id: string }[];
    const call = { callId: 'q1', name: 'ask_questions', rawArgs: JSON.stringify({ steps: [{ id: 'a', title: 'Which one?' }] }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };
    const pending = port.dispatch(call, new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    expect(port.answerApproval(presented[0]!.request_id, 'once')).toBe(true);
    await vi.waitFor(() => expect(port.pendingQuestions?.()).toHaveLength(1));
    const asked = port.pendingQuestions!()[0]!;
    expect(stored().map((q) => q.request_id)).toEqual(['q-other', asked.request_id]);
    expect(port.answerQuestions?.(asked.request_id, { a: { selected_option: null, freeform_text: 'This one.' } })).toBe(true);
    const r = await pending;
    expect(r).toMatchObject({ status: 'ok' });
    expect(stored().map((q) => q.request_id)).toEqual(['q-other']);
  });

  /*
   * REQ-SESSION-094 for the question mirror (`docs/defects/fixed/a-question-mirror-writes-pending-questions-after-its-port-closed.md`):
   * like the approvals sink, the mirror drops its write once the port is closed, so a question a stop's grace detached
   * cannot write `pending_questions` into a session whose run has ended.
   */
  it('REQ-SESSION-094: a question that ends after its port closed writes nothing to pending_questions', async () => {
    const port = portFor(null, null, {}, { tools: '[read_file, ask_questions]' });
    const stored = (): string | null | undefined => dal.getSession(asSessionId('S1'))?.pending_questions;
    const call = { callId: 'q1', name: 'ask_questions', rawArgs: JSON.stringify({ steps: [{ id: 'a', title: 'Which one?' }] }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };
    const pending = port.dispatch(call, new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    expect(port.answerApproval(presented[0]!.request_id, 'once')).toBe(true);
    await vi.waitFor(() => expect(port.pendingQuestions?.()).toHaveLength(1));
    const asked = port.pendingQuestions!()[0]!;
    expect(JSON.parse(stored() ?? '[]')).toHaveLength(1);
    port.close?.('This call was interrupted by the stop before it completed, and it was not re-run.');
    const before = stored();
    expect(port.answerQuestions?.(asked.request_id, { a: { selected_option: null, freeform_text: 'Late.' } })).toBe(true);
    await pending;
    expect(stored()).toBe(before);
  });

  /*
   * PD-ORCH-005 clause 9 and REQ-SESSION-031 (`docs/defects/fixed/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md`):
   * each agent's port holds its own approvals, and the session has ONE `pending_approvals` column. Two agents of one run
   * waiting at once — two delegated children, each asking — must leave both in the column, and the one still waiting
   * after the other is answered. Before the repair each port wrote its own list: the second overwrote the first, and the
   * first's answer wrote `[]` while the second still waited, so a crash then withdrew nothing.
   */
  it('PD-ORCH-005 clause 9 / REQ-SESSION-031 through two ports: pending_approvals holds the session\'s whole list while two agents wait', async () => {
    const ports: ReturnType<typeof portFor>[] = [];
    const session = () => ports.flatMap((p) => p.pendingApprovals?.() ?? []);
    const first = portFor(null, null, { pendingApprovalsOfSession: session });
    const second = portFor(null, null, { pendingApprovalsOfSession: session });
    ports.push(first, second);
    const stored = (): string[] => (JSON.parse(dal.getSession(asSessionId('S1'))?.pending_approvals ?? '[]') as { request_id: string }[]).map((a) => a.request_id);
    const write = (callId: string, path: string) => ({ callId, name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path, content: 'x' }), persona: 'coding-agent', agentId: callId, agentName: 'coding-agent' });
    const a = first.dispatch(write('a1', 'a.txt'), new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    const b = second.dispatch(write('b1', 'b.txt'), new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(2));
    const [askedA, askedB] = [presented[0]!.request_id, presented[1]!.request_id];
    expect(stored().sort()).toEqual([askedA, askedB].sort());
    // The first agent's answer leaves the second's request standing in the column.
    expect(first.answerApproval(askedA, 'once')).toBe(true);
    await a;
    expect(stored()).toEqual([askedB]);
    expect(second.answerApproval(askedB, 'once')).toBe(true);
    await b;
    expect(stored()).toEqual([]);
  });

  /*
   * Defect `an-approval-asked-after-the-last-window-closes-is-denied` (R-067): the last window's revoke comes at once, the
   * run host's shutdown only after REQ-GIT-101's checkpoint wait. What an agent asks in that gap is the quit's to withdraw.
   */
  it('PD-ORCH-005 clause 9 through the port: an approval asked after the quit closed the last window waits unshown, outlives its budget, and the quit withdraws it — nothing denied', async () => {
    const port = portFor(null, null);
    presence.attended = false;
    presence.quitting = true;
    const pending = port.dispatch({ callId: 'c1', name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path: 'w.txt', content: 'x' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);
    // It is in `pending_approvals` — a wait, not REQ-TOOLS-064's headless resolution — and nothing is shown.
    await vi.waitFor(() => expect(JSON.parse(dal.getSession(asSessionId('S1'))?.pending_approvals ?? '[]')).toHaveLength(1));
    portClock.advance(3_600_000);
    await Promise.resolve();
    expect(presented).toEqual([]);
    expect(dal.auditOf(asSessionId('S1'))).toEqual([]);
    expect(port.withdrawPending?.('quit')).toBe(1);
    const r = await pending;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true });
    expect(r.text).toBe('The approval this call was waiting on was withdrawn by quitting the application; the call was not run.');
    expect(existsSync(join(dir, 'w.txt'))).toBe(false);
    expect(dal.auditOf(asSessionId('S1'))).toEqual([]);
    expect(dal.issuesOf(asSessionId('S1')).map((i) => i.kind)).not.toContain('permission_denied');
  });

  it('PD-ORCH-005 clause 9 with PD-CHAT-002 revision 2 through the port: a question put after the quit closed the last window is held, not discarded, and the quit withdraws it', async () => {
    const port = portFor(null, null, {}, { tools: '[read_file, ask_questions]' });
    const call = { callId: 'q1', name: 'ask_questions', rawArgs: JSON.stringify({ steps: [{ id: 'a', title: 'Which one?' }] }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' };
    const pending = port.dispatch(call, new AbortController().signal);
    await vi.waitFor(() => expect(presented).toHaveLength(1));
    // The quit lands after the call's approval was given and before its question is put.
    presence.attended = false;
    presence.quitting = true;
    expect(port.answerApproval(presented[0]!.request_id, 'once')).toBe(true);
    await vi.waitFor(() => expect(port.pendingQuestions?.()).toHaveLength(1));
    portClock.advance(3_600_000);
    expect(port.pendingQuestions?.()).toHaveLength(1);
    expect(port.withdrawPending?.('quit')).toBe(1);
    const r = await pending;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true });
    expect(r.text).toBe('The questions were withdrawn by quitting the application before the user answered. Nothing was answered; ask again if the answers are still needed.');
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
 * Defect `a-personas-tool-restrictions-never-narrow-its-grant` (acceptance finding A4, R-067): the loader parsed a
 * persona's `tool_restrictions`, the registry had a stage for it, and nothing connected the two, so a configured
 * restriction removed nothing. Built under OQ-145's reading, confirmed 2026-10-06 by R-071: the map's keys are role names (REQ-CONFIG-062), and an
 * agent's grant is narrowed by the allowed-tool list its OWN persona's map gives its name and by the one the map of the
 * persona that DELEGATED it gives that name; a tool survives only a list that names it (REQ-CONFIG-103).
 */
describe('REQ-TOOLS-006 (4): the per-persona tool_restrictions map narrows the grant', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  const warnings: string[] = [];
  const infos: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-restrictions-'));
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
    infos.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function port(personas: string, persona: string, extra: Partial<ToolPortContext> = {}, mcp: readonly ToolExecutor[] = []) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), `default_persona: orchestrator
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
personas:
${personas}runtime:
  permission_mode: ask
`);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal: null,
      egress: () => permissivePolicyRead,
      ...(mcp.length > 0 ? {
        // One server `srv` offering the given executors; the section is the real REQ-MCP-101 renderer and the executors
        // are the ones the surface handed in still holds, so a narrowing that skips the surface shows in the section.
        mcp: {
          prepare: async () => undefined,
          surfaceFor: (): PersonaMcpSurface => ({ persona, dropped: [], active: [{ name: 'srv', entry: { type: 'stdio', command: 'srv', args: [] }, origin: 'workspace', discoveryFailed: false, tools: mcp.map((e) => ({ callable: e.name, reported: e.name, description: e.description, inputSchema: {} })) }] }) as unknown as PersonaMcpSurface,
          section: (surface: PersonaMcpSurface) => renderMcpSection(surface),
          executorsFor: ({ surface }: { surface: PersonaMcpSurface }) => mcp.filter((e) => surface.active.some((s) => s.tools.some((t) => t.callable === e.name))),
        } as unknown as McpHost,
        configured: () => ({ cfg }) as unknown as ConfiguredRun,
      } : {}),
    };
    return createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona, agentName: persona,
      requestedMode: 'ask', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), info: (m) => infos.push(m), abortRun: () => undefined, ...extra,
    }, deps);
  }

  const coder = (restrictions: string) => `  coding-agent:
    name: coding-agent
    model: selected
    tools: [read_file, grep, write_file, haet_edit]
${restrictions}`;

  it('REQ-TOOLS-006 (4) / REQ-CONFIG-103: the entry naming the persona in its own map is an allowed-tool list; every other declared tool is removed and logged with the control', async () => {
    const p = port(coder('    tool_restrictions:\n      coding-agent: [read_file, grep]\n'), 'coding-agent');
    await p.ready?.();
    expect(p.resolvedTools?.()).toEqual(['read_file', 'grep']);
    expect(p.specs().map((s) => s.name)).toEqual(['read_file', 'grep']);
    expect(infos).toContain("tool 'write_file' removed from coding-agent by tool_restrictions (REQ-TOOLS-004/006)");
    expect(infos).toContain("tool 'haet_edit' removed from coding-agent by tool_restrictions (REQ-TOOLS-004/006)");
    // The gate refuses what the listing no longer holds.
    const r = await p.dispatch({ callId: 'c1', name: 'write_file', rawArgs: JSON.stringify({ operation: 'create', path: 'w.txt', content: 'x' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);
    expect(r.isError).toBe(true);
    expect(existsSync(join(dir, 'w.txt'))).toBe(false);
  });

  it('REQ-CONFIG-103: an entity absent from the map is unrestricted, and a map naming only other roles leaves the persona\'s own grant whole', async () => {
    const p = port(coder('    tool_restrictions:\n      tester: [read_file]\n'), 'coding-agent');
    await p.ready?.();
    expect(p.resolvedTools?.()).toEqual(['read_file', 'grep', 'write_file', 'haet_edit']);
    expect(infos.filter((l) => l.includes('by tool_restrictions'))).toEqual([]);
  });

  it('OQ-145: the map of the persona that delegated an agent narrows that agent by the entry naming it — an alias of a tool in the list is its canonical name', async () => {
    const personas = `  orchestrator:
    name: orchestrator
    model: selected
    tool_restrictions:
      coding-agent: [read_file, haet]
${coder('')}`;
    const child = port(personas, 'coding-agent', { parentPersona: 'orchestrator', parentId: 'bg_0a1b2c3d', depth: 1 });
    await child.ready?.();
    expect(child.resolvedTools?.()).toEqual(['read_file', 'haet_edit']);
    // The same persona delegated by a role whose map does not name it keeps its declared tools.
    infos.length = 0;
    const other = port(personas, 'coding-agent', { parentPersona: 'tester', parentId: 'bg_0a1b2c3e', depth: 1 });
    await other.ready?.();
    expect(other.resolvedTools?.()).toEqual(['read_file', 'grep', 'write_file', 'haet_edit']);
  });

  it('OQ-145: both lists bind at once — a tool survives only a list that names it — and neither can add a tool the persona did not declare', async () => {
    const personas = `  orchestrator:
    name: orchestrator
    model: selected
    tool_restrictions:
      coding-agent: [read_file, write_file, terminal]
${coder('    tool_restrictions:\n      coding-agent: [read_file, grep, terminal]\n')}`;
    const child = port(personas, 'coding-agent', { parentPersona: 'orchestrator', parentId: 'bg_0a1b2c3d', depth: 1 });
    await child.ready?.();
    expect(child.resolvedTools?.()).toEqual(['read_file']);
  });

  /**
   * REQ-MCP-065 with REQ-TOOLS-006 (the repair of `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`):
   * the grant a child's row records is what its port reports once ready — the native set the controls left and, per carried
   * server, the tools that joined its callable map — never the persona's declared list.
   */
  it('REQ-MCP-065 / REQ-TOOLS-006: the port reports the grant its controls left — coordinator_only and tool_restrictions removed, an unnamed server tool not granted', async () => {
    const serverTool = simpleExecutor('lookup', 'a server tool', anySchema, async () => ({ text: 'ok', isError: false }));
    const personas = `  coding-agent:
    name: coding-agent
    model: selected
    coordinator_only: true
    tools: [read_file, grep, write_file, terminal, todo, delegate]
    tool_restrictions:
      coding-agent: [read_file, write_file, terminal, delegate]
`;
    const child = port(personas, 'coding-agent', { parentPersona: 'orchestrator', parentId: 'bg_0a1b2c3d', depth: 1, delegation: {} as NonNullable<ToolPortContext['delegation']> }, [serverTool]);
    expect(child.grant?.()).toBeNull();
    await child.ready?.();
    const grant = child.grant?.();
    expect(grant?.tools).toEqual(child.resolvedTools?.());
    expect(grant?.tools).toContain('read_file');
    expect(grant?.tools).toContain('delegate');
    // coordinator_only's two and tool_restrictions' two are not granted.
    for (const removed of ['write_file', 'terminal', 'grep', 'todo']) expect(grant?.tools).not.toContain(removed);
    // The server is carried and connected, and lists no tool: the allowed-tool list does not name `lookup`.
    expect(grant?.mcp).toEqual({ granted: { srv: [] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] });
  });

  // REQ-TOOLS-006 (4) with REQ-MCP-065: an allowed-tool list naming only a server's tool leaves no native tool, and the port
  // reports that empty native grant — which the row records as a grant, not as none
  // (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md).
  it('REQ-TOOLS-006 / REQ-MCP-065: a tool_restrictions list naming only a server tool leaves an empty native grant beside the server tool', async () => {
    const serverTool = simpleExecutor('lookup', 'a server tool', anySchema, async () => ({ text: 'ok', isError: false }));
    const only = port(coder('    tool_restrictions:\n      coding-agent: [lookup]\n'), 'coding-agent', { parentId: 'bg_0a1b2c3d', depth: 1 }, [serverTool]);
    await only.ready?.();
    expect(only.grant?.()).toEqual({ tools: [], mcp: { granted: { srv: ['lookup'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } });
  });

  it('REQ-MCP-065 / REQ-MCP-114: a read_only persona\'s carried server is listed with no granted tool; an unrestricted one lists what it can call', async () => {
    const serverTool = simpleExecutor('lookup', 'a server tool', anySchema, async () => ({ text: 'ok', isError: false }));
    const reader = port(`  coding-agent:
    name: coding-agent
    model: selected
    read_only: true
    tools: [read_file, grep, write_file]
`, 'coding-agent', { parentId: 'bg_0a1b2c3d', depth: 1 }, [serverTool]);
    await reader.ready?.();
    expect(reader.grant?.()).toEqual({ tools: ['read_file', 'grep'], mcp: { granted: { srv: [] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } });

    const open = port(coder(''), 'coding-agent', { parentId: 'bg_0a1b2c3e', depth: 1 }, [serverTool]);
    await open.ready?.();
    expect(open.grant?.()).toEqual({ tools: ['read_file', 'grep', 'write_file', 'haet_edit'], mcp: { granted: { srv: ['lookup'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } });
  });

  it('OQ-145 / REQ-MCP-062: an MCP tool the list does not name is withheld from a restricted agent\'s listing and its prompt section, as a withholding rule withholds a tool outside the registry (ADR-0016)', async () => {
    const serverTool = simpleExecutor('lookup', 'a server tool', anySchema, async () => ({ text: 'ok', isError: false }));
    const restricted = port(coder('    tool_restrictions:\n      coding-agent: [read_file]\n'), 'coding-agent', {}, [serverTool]);
    await restricted.ready?.();
    expect(restricted.specs().map((s) => s.name)).toEqual(['read_file']);
    expect(infos).toContain("tool 'lookup' removed from coding-agent by tool_restrictions (REQ-TOOLS-004/006)");
    // REQ-MCP-062: a printed name is callable — the withheld tool is not printed under its server.
    expect(restricted.promptSection?.()).toBe('## MCP servers\n\n- `srv`');
    const named = port(coder('    tool_restrictions:\n      coding-agent: [read_file, lookup]\n'), 'coding-agent', {}, [serverTool]);
    await named.ready?.();
    expect(named.specs().map((s) => s.name)).toEqual(['read_file', 'lookup']);
    expect(named.promptSection?.()).toBe('## MCP servers\n\n- **`srv`**\n  - `lookup` — a server tool');
  });

  /**
   * REQ-MCP-062 with REQ-ORCH-153 (the repair of `an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md`):
   * while the gate holds, the port's MCP loop withheld every server tool from the callable map and the listing, and the
   * prompt's MCP section, rendered from the surface the loop was given, still printed it — a printed name the agent could
   * not call. The same shape held for a server tool dropped for colliding with a native name. Approval launches a new run,
   * whose ports are built with the gate released, so the tool is printed and callable there.
   */
  it('REQ-MCP-062 / REQ-ORCH-153: a server tool withheld at the plan gate is not printed in the MCP section; on the approved run\'s port it is printed and callable', async () => {
    const calls: unknown[] = [];
    const serverTool = simpleExecutor('lookup', 'a server tool', anySchema, async (a) => { calls.push(a); return { text: 'looked up', isError: false }; });
    const held = port(coder(''), 'coding-agent', { planGateHeld: () => true, requestedMode: 'autonomous' }, [serverTool]);
    await held.ready?.();
    expect(held.specs().map((s) => s.name)).not.toContain('lookup');
    expect(held.promptSection?.()).toBe('## MCP servers\n\n- `srv`');
    expect(held.grant?.()?.mcp.granted).toEqual({ srv: [] });

    const approved = port(coder(''), 'coding-agent', { planGateHeld: () => false, requestedMode: 'autonomous' }, [serverTool]);
    await approved.ready?.();
    expect(approved.specs().map((s) => s.name)).toContain('lookup');
    expect(approved.promptSection?.()).toBe('## MCP servers\n\n- **`srv`**\n  - `lookup` — a server tool');
    const r = await approved.dispatch({ callId: 'l1', name: 'lookup', rawArgs: '{}', persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent' }, new AbortController().signal);
    expect(r).toMatchObject({ status: 'ok', isError: false });
    expect(calls).toHaveLength(1);
  });

  it('REQ-MCP-062: a server tool dropped for colliding with a native tool name is not printed under its server', async () => {
    // The stand-in surface offers the server's tool under the native name itself, the case the port's collision skip guards.
    const serverGrep = simpleExecutor('grep', 'a server grep', anySchema, async () => ({ text: 'server', isError: false }));
    const p = port(coder(''), 'coding-agent', {}, [serverGrep]);
    await p.ready?.();
    expect(warnings.some((w) => w.includes("the tool name 'grep' collides with a native tool of coding-agent"))).toBe(true);
    expect(p.promptSection?.()).toBe('## MCP servers\n\n- `srv`');
    expect(p.grant?.()?.mcp.granted).toEqual({ srv: [] });
  });

  /*
   * OQ-212, ruled 2026-10-07 under R-072, and the repair of
   * docs/defects/fixed/can-publish-artifacts-is-read-and-never-gates-artifact-write.md: REQ-CONFIG-106 and REQ-TOOLS-150 hand a
   * role `artifact_write` only while its `can_publish_artifacts` is true, and REQ-TOOLS-004 records the removal otherwise. The
   * tool port passed the artifact store's presence as the grant, so a declared tool was handed over whatever the flag said.
   */
  const store: ArtifactOps = { write: () => ({ ok: true, id: 'art_00000001', slug: 's' }), read: () => ({ ok: true, text: '' }), list: () => [] };
  const publisher = (flag: string) => `  orchestrator:
    name: orchestrator
    model: selected
    tools: [read_file, artifact_read, artifact_list, artifact_write]
${flag}`;
  const notGranted = "tool 'artifact_write' removed from orchestrator by prerequisite (artifact_publish_not_granted) (REQ-TOOLS-004/006)";

  it('REQ-CONFIG-106 / REQ-TOOLS-004 (OQ-212): a persona declaring `artifact_write` without `can_publish_artifacts: true` is not handed it, and the removal is logged at warning', async () => {
    const p = port(publisher(''), 'orchestrator', { artifacts: store });
    await p.ready?.();
    expect(p.resolvedTools?.()).toEqual(['read_file', 'artifact_read', 'artifact_list']);
    expect(p.specs().map((s) => s.name)).not.toContain('artifact_write');
    expect(warnings).toContain(notGranted);
    const r = await p.dispatch({ callId: 'c1', name: 'artifact_write', rawArgs: JSON.stringify({ slug: 's', title: 't', body: 'b', tags: [] }), persona: 'orchestrator', agentId: 'orchestrator', agentName: 'orchestrator' }, new AbortController().signal);
    expect(r.isError).toBe(true);
    // The flag stated false is the same grant withheld.
    warnings.length = 0;
    const stated = port(publisher('    can_publish_artifacts: false\n'), 'orchestrator', { artifacts: store });
    await stated.ready?.();
    expect(stated.resolvedTools?.()).not.toContain('artifact_write');
    expect(warnings).toContain(notGranted);
  });

  it('REQ-TOOLS-150 (OQ-212): the same persona with `can_publish_artifacts: true` keeps `artifact_write`', async () => {
    const p = port(publisher('    can_publish_artifacts: true\n'), 'orchestrator', { artifacts: store });
    await p.ready?.();
    expect(p.resolvedTools?.()).toEqual(['read_file', 'artifact_read', 'artifact_list', 'artifact_write']);
    expect(p.specs().map((s) => s.name)).toContain('artifact_write');
    expect(warnings.filter((w) => w.includes("'artifact_write'"))).toEqual([]);
  });

  it('OQ-212: the built-in orchestrator declares no `artifact_write`, so it holds none and logs no removal for it', async () => {
    const p = port('', 'orchestrator', { artifacts: store });
    await p.ready?.();
    expect(p.resolvedTools?.()).not.toContain('artifact_write');
    expect([...warnings, ...infos].filter((l) => l.includes("'artifact_write'"))).toEqual([]);
  });
});

/**
 * OQ-213 as ruled under the owner's delegation (R-072), building REQ-ORCH-029's todo clause: the entry port hands its gate the
 * run's todo-list check only where the one resolution left the entry role `todo`; without it nothing is refused and the run
 * is told once. A configured `system_prompt` replaces the instruction text whole (REQ-CONFIG-100) and changes nothing here.
 */
describe('the entry port\'s todo list owed before a second work item (OQ-213, REQ-ORCH-029)', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-todo-list-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    const created = SessionWriter.create(
      { dal, sessionId: asSessionId('S1'), wall: new FakeClock(), retentionCap: 0, warn: () => undefined, onCommitted: () => undefined },
      { workspaceRoot: dir, pid: 1, host: mintMachineId('0000000000000000000000000000000a') },
    );
    if (!created.ok) throw new Error('writer');
    writer = created.value;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /** The entry orchestrator's port over a configured persona; `tools` and `prompt` are the persona's own. */
  function entryPort(orchestrator: string, extra: Partial<ToolPortContext> = {}, terminal: TerminalManager | null = null) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), `default_persona: orchestrator
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
personas:
  orchestrator:
    name: orchestrator
    model: selected
${orchestrator}runtime:
  permission_mode: autonomous
`);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, () => undefined);
    const delegated: string[] = [];
    const delegation = {
      delegate: async (_parent: string, req: { task: string }) => { delegated.push(req.task); return { status: 'queued' as const, canonicalName: `c${delegated.length}`, taskId: `bg_${delegated.length}`, message: 'started' }; },
    } as unknown as NonNullable<ToolPortContext['delegation']>;
    const log: string[] = [];
    let written = false;
    let started = 0;
    const todoList = {
      owed: () => (started >= 1 && !written ? 'a todo list is owed' : null),
      started: () => { started += 1; log.push('started'); },
      unavailable: () => { log.push('unavailable'); },
    };
    const port = createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'orchestrator', agentName: 'orchestrator', parentId: 'root:1', depth: 0, delegation,
      requestedMode: 'autonomous', modeOverride: null, attended: () => true, warn: () => undefined, abortRun: () => undefined,
      readTodo: () => null, writeTodo: () => { written = true; return true; }, todoList, ...extra,
    }, { clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver, presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal, egress: () => permissivePolicyRead });
    const call = (callId: string, name: string, args: Record<string, unknown>) => ({ callId, name, rawArgs: JSON.stringify(args), persona: 'orchestrator', agentId: 'orchestrator', agentName: 'orchestrator' });
    const del = (callId: string, task: string) => port.dispatch(call(callId, 'delegate', { persona: 'coding-agent', task_name: task, task }), new AbortController().signal);
    return { port, delegated, log, call, del };
  }

  it('a configured system_prompt does not lift it: the second delegate waits for the list, and runs once the list is written', async () => {
    const e = entryPort('    tools: [read_file, grep, todo, delegate]\n    system_prompt: You are a lead engineer. Say nothing of todo lists.\n');
    expect((await e.del('d1', 'first')).status).toBe('ok');
    const refused = await e.del('d2', 'second');
    expect(refused).toMatchObject({ status: 'blocked', isError: true, text: 'a todo list is owed' });
    expect(e.delegated).toEqual(['first']);
    const todo = await e.port.dispatch(e.call('t1', 'todo', { operation: 'replace', phases: [{ name: 'Work', tasks: [{ name: 'first' }, { name: 'second' }] }] }), new AbortController().signal);
    expect(todo.status).toBe('ok');
    expect((await e.del('d3', 'second')).status).toBe('ok');
    expect(e.delegated).toEqual(['first', 'second']);
    expect(e.log).toEqual(['started', 'started']);
  });

  it('on a direct-work grant a write is a work item: a write then a terminal call, and the terminal call is refused until the list is written', async () => {
    // A terminal manager the refused call never reaches: the gate refuses before the executor runs.
    let ran = 0;
    const terminal = { backend: { kind: 'posix', file: '/bin/sh' }, setBackgroundLimits: () => undefined, run: () => { ran += 1; } } as unknown as TerminalManager;
    const e = entryPort('    tools: [read_file, grep, todo, delegate]\n', { grant: 'direct-work' }, terminal);
    const write = await e.port.dispatch(e.call('w1', 'write_file', { path: 'notes.txt', content: 'one\n' }), new AbortController().signal);
    expect(write.status).toBe('ok');
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
    const refused = await e.port.dispatch(e.call('t1', 'terminal', { command: 'echo two' }), new AbortController().signal);
    expect(refused).toMatchObject({ status: 'blocked', isError: true, text: 'a todo list is owed' });
    expect(ran).toBe(0);
    expect(e.log).toEqual(['started']);
    expect(e.delegated).toEqual([]);
  });

  it('an entry role whose resolved set holds no todo is never refused, and the run is told once per port', async () => {
    const e = entryPort('    tools: [read_file, grep, delegate]\n');
    expect(e.log).toEqual(['unavailable']);
    for (const task of ['one', 'two', 'three']) expect((await e.del(`d-${task}`, task)).status).toBe('ok');
    expect(e.delegated).toEqual(['one', 'two', 'three']);
  });

  it('a child\'s port carries no check, whatever its context holds', async () => {
    const e = entryPort('    tools: [read_file, grep, todo, delegate]\n', { parentId: 'bg_0a1b2c3d', depth: 1 });
    for (const task of ['one', 'two']) expect((await e.del(`d-${task}`, task)).status).toBe('ok');
    expect(e.log).toEqual([]);
  });
});

/**
 * PD-TOOLS-006 revision 7 with PD-TOOLS-008 revision 2 (OQ-249, ruled 2026-10-07 under R-072): an admitted delegation marks its
 * PENDING item IN_PROGRESS in the caller's own plan and persists it, and the items the caller's non-terminal children hold are
 * outside REQ-TOOLS-145's count. The default live run at a68f121 (edit, #14) could not mark its second running child's item
 * (docs/defects/fixed/a-parallel-delegations-todo-item-cannot-be-marked-in-progress.md).
 */
describe('PD-TOOLS-006 revision 7: an admitted delegation marks its PENDING item IN_PROGRESS', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-mark-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    const created = SessionWriter.create(
      { dal, sessionId: asSessionId('S1'), wall: new FakeClock(), retentionCap: 0, warn: () => undefined, onCommitted: () => undefined },
      { workspaceRoot: dir, pid: 1, host: mintMachineId('0000000000000000000000000000000a') },
    );
    if (!created.ok) throw new Error('writer');
    writer = created.value;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const PLAN = { schema_version: 1 as const, phases: [{ id: 'p0000001', name: 'main', tasks: [
    { id: 'aaaaaaa1', name: 'impl', description: '', state: 'PENDING' as const },
    { id: 'aaaaaaa2', name: 'tests', description: '', state: 'PENDING' as const },
    { id: 'aaaaaaa3', name: 'review', description: '', state: 'PENDING' as const },
    { id: 'aaaaaaa4', name: 'done', description: '', state: 'COMPLETED' as const },
    { id: 'aaaaaaa5', name: 'dropped', description: '', state: 'ABANDONED' as const },
  ] }] };

  /**
   * The entry orchestrator's port over the built-in table, its plan `PLAN`; the port answers each delegation with `answer`
   * (the item the engine resolved travels back as `todoItem`) and the run's held set is `held`.
   */
  function port(answer: (req: { todoItem?: string; continuationOf?: string; taskName: string }) => Record<string, unknown>, held: Set<string> = new Set(), served: Set<string> = new Set(), plan: typeof PLAN = PLAN) {
    const written: { phases: { tasks: { id: string; state: string }[] }[] }[] = [];
    const delegation = {
      delegate: async (_parent: string, req: { todoItem?: string; continuationOf?: string; taskName: string }) => answer(req),
      waitForTasks: async () => ({ immediate: true, requested: 1, text: 'done' }),
    } as unknown as NonNullable<ToolPortContext['delegation']>;
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), 'default_persona: orchestrator\nmodels:\n  selected:\n    provider: openai\n    model_id: first\n    api_key: k\nlarge_model: selected\nmedium_model: selected\nsmall_model: selected\nruntime:\n  permission_mode: autonomous\n');
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, () => undefined);
    const p = createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'orchestrator', agentName: 'orchestrator', parentId: 'root:1', depth: 0, delegation,
      requestedMode: 'autonomous', modeOverride: null, attended: () => true, warn: () => undefined, abortRun: () => undefined,
      readTodo: () => structuredClone(plan), writeTodo: (d) => { written.push(structuredClone(d) as never); return true; }, heldTodoItems: () => held, servedTodoItems: () => served,
    }, { clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver, presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal: null, egress: () => permissivePolicyRead });
    const call = (callId: string, name: string, args: Record<string, unknown>) => p.dispatch({ callId, name, rawArgs: JSON.stringify(args), persona: 'orchestrator', agentId: 'orchestrator', agentName: 'orchestrator' }, new AbortController().signal);
    const stateOf = (doc: (typeof written)[number] | undefined, id: string) => doc?.phases.flatMap((ph) => ph.tasks).find((t) => t.id === id)?.state;
    return { call, written, stateOf, last: () => written[written.length - 1] };
  }
  const accepted = (req: { todoItem?: string; taskName: string }, item: string | undefined = req.todoItem) => ({ status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000001', message: 'Accepted.', ...(item ? { todoItem: item } : {}) });

  it('a named PENDING item is marked and persisted, the observation says so, and a todo call later in the turn keeps the mark', async () => {
    const e = port((req) => accepted(req));
    const r = await e.call('d1', 'delegate', { persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    expect(r.status).toBe('ok');
    expect(r.text).toMatch(/^Task 'tests': queued — Accepted\. Todo item tests \(aaaaaaa2\) is now IN_PROGRESS\.\ntask_id: bg_00000001\n\nTodo state:\n/);
    expect(r.text).toContain('[IN_PROGRESS] tests (aaaaaaa2)');
    expect(e.stateOf(e.last(), 'aaaaaaa2')).toBe('IN_PROGRESS');
    // a later replace that sends the item PENDING restores it IN_PROGRESS (REQ-TOOLS-146), on the port's same list
    const t = await e.call('t1', 'todo', { operation: 'replace', phases: [{ name: 'main', tasks: [{ id: 'aaaaaaa1', name: 'impl' }, { id: 'aaaaaaa2', name: 'tests', state: 'PENDING' }, { id: 'aaaaaaa3', name: 'review' }] }] });
    expect(t.status).toBe('ok');
    expect(e.stateOf(e.last(), 'aaaaaaa2')).toBe('IN_PROGRESS');
  });

  it('IN_PROGRESS, COMPLETED and ABANDONED items are left as they are, and nothing is written for them', async () => {
    const e = port((req) => accepted(req));
    for (const [i, item] of ['aaaaaaa4', 'aaaaaaa5'].entries()) {
      const r = await e.call(`d${i}`, 'delegate', { persona: 'codebase-analyst', task_name: `r${i}`, task: 'TASK: r', todo_item: item });
      expect(r.text).not.toContain('is now IN_PROGRESS');
    }
    expect(e.written).toEqual([]);
    await e.call('d2', 'delegate', { persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    expect(e.written).toHaveLength(1);
    const again = await e.call('d3', 'delegate', { persona: 'tester', task_name: 'tests2', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    expect(again.text).not.toContain('is now IN_PROGRESS');
    expect(e.written).toHaveLength(1);
  });

  it('a rejected delegation marks nothing', async () => {
    const e = port((req) => ({ status: 'rejected', canonicalName: req.taskName, message: 'no' }));
    const r = await e.call('d1', 'delegate', { persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    expect(r.isError).toBe(true);
    expect(e.written).toEqual([]);
  });

  it('a continuation marks the item it inherited, though the call named none', async () => {
    const e = port((req) => accepted(req, req.continuationOf ? 'aaaaaaa1' : undefined));
    const r = await e.call('d1', 'delegate', { persona: 'coding-agent', task_name: 'impl2', task: 'TASK: more', continuation_of: 'bg_00000009' });
    expect(r.text).toContain('Todo item impl (aaaaaaa1) is now IN_PROGRESS.');
    expect(e.stateOf(e.last(), 'aaaaaaa1')).toBe('IN_PROGRESS');
  });

  it('two parallel delegations hold their items IN_PROGRESS, and the coordinator still marks its own item (PD-TOOLS-008 revision 2)', async () => {
    const held = new Set<string>();
    const e = port((req) => { if (req.todoItem) held.add(req.todoItem); return accepted(req); }, held);
    await e.call('d1', 'delegate', { persona: 'coding-agent', task_name: 'impl', task: 'TASK: i', todo_item: 'aaaaaaa1' });
    await e.call('d2', 'delegate', { persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    const own = await e.call('t1', 'todo', { operation: 'update', task_id: 'aaaaaaa3', state: 'IN_PROGRESS' });
    expect(own.status).toBe('ok');
    expect(['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3'].map((id) => e.stateOf(e.last(), id))).toEqual(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS']);
    // with no held set, the coordinator's own mark beside a running child's item is refused, naming it (REQ-TOOLS-145)
    held.clear();
    const refused = await e.call('t2', 'todo', { operation: 'add_task', phase_id: 'p0000001', name: 'extra', state: 'IN_PROGRESS' });
    expect(refused.text).toMatch(/Active task: aaaaaaa1 \(impl\)/);
  });

  /**
   * PD-TOOLS-008 revision 3 (OQ-255, ruled 2026-10-13 under R-072): once both parallel children have ended, the coordinator's
   * usual close — one `replace` sending every item COMPLETED — stores the plan closed. Until then the two items the run had
   * marked stayed IN_PROGRESS under REQ-TOOLS-146 and the `replace` answered success
   * (docs/defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
   */
  it('two parallel delegations marked, both children ended: one whole-list COMPLETED replace leaves the stored plan closed (PD-TOOLS-008 revision 3)', async () => {
    const held = new Set<string>();
    const served = new Set<string>();
    const e = port((req) => { if (req.todoItem) { held.add(req.todoItem); served.add(req.todoItem); } return accepted(req); }, held, served);
    await e.call('d1', 'delegate', { persona: 'coding-agent', task_name: 'impl', task: 'TASK: i', todo_item: 'aaaaaaa1' });
    await e.call('d2', 'delegate', { persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: 'aaaaaaa2' });
    const all = (state: string) => [{ name: 'main', tasks: [['aaaaaaa1', 'impl'], ['aaaaaaa2', 'tests'], ['aaaaaaa3', 'review'], ['aaaaaaa4', 'done'], ['aaaaaaa5', 'dropped']].map(([id, name]) => ({ id, name, state: name === 'dropped' ? 'ABANDONED' : state })) }];
    // while tests still runs, the close keeps its item and says so; impl's child has ended and its item closes
    held.delete('aaaaaaa1');
    const early = await e.call('t1', 'todo', { operation: 'replace', phases: all('COMPLETED') });
    expect(early.status).toBe('ok');
    expect(early.text.split('\n')[0]).toBe("Replaced the todo list: 1 phase, 5 tasks. Kept as they were: tests (aaaaaaa2) IN_PROGRESS, a running delegated agent holds it. Change a task's state with update.");
    expect(['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3'].map((id) => e.stateOf(e.last(), id))).toEqual(['COMPLETED', 'IN_PROGRESS', 'COMPLETED']);
    held.clear();
    const close = await e.call('t2', 'todo', { operation: 'replace', phases: all('COMPLETED') });
    expect(close.text.split('\n')[0]).toBe('Replaced the todo list: 1 phase, 5 tasks.');
    expect(e.last()!.phases.flatMap((ph) => ph.tasks).map((t) => t.state)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'ABANDONED']);
  });

  /**
   * PD-TOOLS-008 revision 4 (OQ-333, ruled 2026-10-15 under R-072): the default live run at 3c03287 (session 3e4b7210,
   * delegation-swarm) delegated three children naming impl101, test101 and doc101 (#7 to #9), which the run marked; once all
   * three had ended (#14), `update verify101 IN_PROGRESS` (#26) was refused naming impl101, and the coordinator closed the three
   * items by hand (#27 to #29) before it could mark its own. Served items no longer count against that mark.
   */
  it('the swarm shape: three delegations end, then the coordinator\'s update verify101 IN_PROGRESS is ok, the delegated items still open (PD-TOOLS-008 revision 4)', async () => {
    const SWARM = { schema_version: 1 as const, phases: [{ id: 'e40a534e', name: 'Reject empty or blank todo titles', tasks: [
      { id: 'impl101', name: 'addTodo refuses empty or blank title in src/todos.js', description: '', state: 'PENDING' as const },
      { id: 'test101', name: 'Test the empty/blank title rule in src/todos.test.js', description: '', state: 'PENDING' as const },
      { id: 'doc101', name: 'Mention the rule in README.md', description: '', state: 'PENDING' as const },
      { id: 'verify101', name: 'Run node --test and confirm the three files', description: '', state: 'PENDING' as const },
    ] }] } as unknown as typeof PLAN;
    const held = new Set<string>();
    const served = new Set<string>();
    const e = port((req) => { if (req.todoItem) { held.add(req.todoItem); served.add(req.todoItem); } return accepted(req); }, held, served, SWARM);
    for (const [i, [persona, item]] of [['coding-agent', 'impl101'], ['tester', 'test101'], ['docs-writer', 'doc101']].entries()) {
      const r = await e.call(`d${i}`, 'delegate', { persona, task_name: item, task: `TASK: ${item}`, todo_item: item });
      expect(r.text).toContain(`(${item}) is now IN_PROGRESS.`);
    }
    // the three children end: nothing is held, all three are still served
    held.clear();
    const mark = await e.call('t26', 'todo', { operation: 'update', task_id: 'verify101', state: 'IN_PROGRESS' });
    expect(mark.status).toBe('ok');
    expect(mark.text.split('\n')[0]).toBe('Updated task Run node --test and confirm the three files (verify101): state.');
    expect(['impl101', 'test101', 'doc101', 'verify101'].map((id) => e.stateOf(e.last(), id))).toEqual(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS']);
    // the coordinator closes each delegated item when it accepts its report, as the resume line asks (PD-TOOLS-006 revision 11)
    const close = await e.call('t27', 'todo', { operation: 'update', task_id: 'impl101', state: 'COMPLETED' });
    expect(close.status).toBe('ok');
  });
});

/**
 * PD-TOOLS-006 revision 4 (OQ-216, ruled 2026-10-07 under R-072): `delegate`'s description states, for each calling agent,
 * what a child of that agent would be granted as each persona — and it is resolved by the function the child's own port
 * applies, so for every persona the description's facets are the facets of the grant that child's port receives.
 */
describe('PD-TOOLS-006 revision 4: delegate tells its caller what each persona\'s child would be granted', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  const warnings: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-catalogue-'));
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

  /** A stand-in terminal backend: the executor is registered (REQ-TOOLS-004's prerequisite met), and nothing here runs a command. */
  const terminal = { setBackgroundLimits: () => undefined } as unknown as NonNullable<ToolPortDeps['terminal']>;
  const delegation = {} as NonNullable<ToolPortContext['delegation']>;

  function setup(personas: string) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), `default_persona: orchestrator
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
${personas === '' ? '' : `personas:\n${personas}`}runtime:
  permission_mode: ask
`);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal, egress: () => permissivePolicyRead,
    };
    const portOf = (persona: string, extra: Partial<ToolPortContext>) => createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona, agentName: persona, delegation, artifacts: undefined,
      requestedMode: 'ask', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), info: () => undefined, abortRun: () => undefined, ...extra,
    }, deps);
    return { resolver, portOf, cfg };
  }

  /** The catalogue as the description states it: persona name → its facets in the description's words. */
  function catalogueOf(description: string): Map<string, string> {
    const m = /not described\): (.*?)\.(?: Aliases: | Your delegates_to | Ask a persona)/.exec(description);
    if (!m) throw new Error(`no catalogue in: ${description}`);
    return new Map(m[1]!.split('; ').map((entry) => { const i = entry.indexOf(' ('); return [entry.slice(0, i), entry.slice(i + 2, -1)] as const; }));
  }
  const descriptionOf = (p: ReturnType<ReturnType<typeof setup>['portOf']>): string => p.specs().find((s) => s.name === 'delegate')!.description;
  const facetsOf = (tools: readonly string[]): string => grantFacets(tools).join(', ') || 'none of these: it neither reads nor writes workspace files nor runs commands';

  async function expectCatalogueMatchesChildGrants(personas: string, caller: string): Promise<Map<string, string>> {
    const { resolver, portOf } = setup(personas);
    const callerPort = portOf(caller, { parentId: 'root:1', depth: 0 });
    const catalogue = catalogueOf(descriptionOf(callerPort));
    expect([...catalogue.keys()]).toEqual(resolver!.delegationTargets());
    for (const role of resolver!.delegationTargets()) {
      const child = portOf(role, { parentPersona: caller, parentId: 'bg_0a1b2c3d', depth: 1 });
      await child.ready?.();
      expect({ role, facets: catalogue.get(role) }).toEqual({ role, facets: facetsOf(child.grant?.()?.tools ?? []) });
    }
    return catalogue;
  }

  it('the built-in table: for every known role, the facets the orchestrator is told are the facets of the grant that role\'s child port receives', async () => {
    const catalogue = await expectCatalogueMatchesChildGrants('', 'orchestrator');
    expect(catalogue.get('docs-writer')).toBe('reads workspace files, writes workspace files');
    expect(catalogue.get('tester')).toBe('reads workspace files, writes workspace files, runs commands');
    expect(catalogue.get('verifier')).toBe('reads workspace files, runs commands');
    expect(catalogue.get('codebase-analyst')).toBe('reads workspace files');
    // A child orchestrator is coordinator-only: it reads, and writes and runs nothing itself.
    expect(catalogue.get('orchestrator')).toBe('reads workspace files');
    const text = descriptionOf(setup('').portOf('orchestrator', { parentId: 'root:1', depth: 0 }));
    expect(text).toContain('Aliases: coder (coding-agent), playwright (ui-verifier).');
  });

  /*
   * OQ-228 (ruled 2026-10-07 under R-072): the catalogue lists the delegation targets — never `intent-classifier` (in the defaults)
   * nor `gatekeeper` (built in), whatever the configuration says of them — and a persona the configuration adds. Under the
   * default configuration it named every `personas:` key (finding P5 at a68f121, 71 of 71 coordinator requests).
   */
  it('OQ-228 (red): the reserved personas are in no catalogue, under the default configuration and one that overrides intent-classifier; a configured persona is', async () => {
    for (const personas of ['', '  intent-classifier:\n    name: intent-classifier\n    model: selected\n    tools: [read_file, write_file]\n  release-manager:\n    name: release-manager\n    model: selected\n    tools: [read_file, grep]\n']) {
      const { resolver, portOf, cfg } = setup(personas);
      expect(Object.keys(cfg.personas)).toContain('intent-classifier');
      const catalogue = catalogueOf(descriptionOf(portOf('orchestrator', { parentId: 'root:1', depth: 0 })));
      expect([...catalogue.keys()]).toEqual(resolver!.delegationTargets());
      expect(catalogue.has('intent-classifier')).toBe(false);
      expect(catalogue.has('gatekeeper')).toBe(false);
      if (personas !== '') expect(catalogue.get('release-manager')).toBe('reads workspace files');
    }
  });

  /*
   * OQ-229 (ruled 2026-10-07 under R-072): a non-empty `delegates_to` narrows the catalogue, and the catalogue is exactly what
   * admission accepts, in both directions; an unnarrowed caller's too.
   */
  it('OQ-229 (red): the catalogue equals what admission accepts, for a narrowed caller and an unnarrowed one', () => {
    const { resolver, portOf } = setup('  orchestrator:\n    name: orchestrator\n    model: selected\n    delegates_to: [codebase-analyst, coding-agent]\n  lead:\n    name: lead\n    model: selected\n    tools: [read_file, delegate]\n');
    for (const [caller, expected] of [['orchestrator', ['codebase-analyst', 'coding-agent']], ['lead', resolver!.delegationTargets()]] as const) {
      const callerPersona = resolver!.resolve(caller)!.persona;
      const port = portOf(caller, caller === 'orchestrator' ? { parentId: 'root:1', depth: 0 } : { parentPersona: 'orchestrator', parentId: 'bg_0a1b2c3d', depth: 1 });
      const description = descriptionOf(port);
      const listed = [...catalogueOf(description).keys()];
      const admitted = [...new Set([...resolver!.delegationTargets(), 'intent-classifier', 'gatekeeper', 'project-initializer'])].filter((n) => resolveDelegationTarget(resolver, n, callerPersona).ok);
      expect(listed).toEqual([...expected]);
      expect(admitted).toEqual(listed);
      expect(description.includes('Your delegates_to (codebase-analyst, coding-agent) narrows this list')).toBe(caller === 'orchestrator');
      if (caller === 'orchestrator') expect(description).toContain('Aliases: coder (coding-agent).');
    }
  });

  it('OQ-229 (red): a global delegates_to narrows the caller, and a workspace [] over it lifts the narrowing', () => {
    mkdirSync(join(dir, 'global'), { recursive: true });
    writeFileSync(join(dir, 'global', 'agents.yaml'), 'personas:\n  orchestrator:\n    name: orchestrator\n    delegates_to: [tester]\n');
    const narrowed = setup('');
    expect([...catalogueOf(descriptionOf(narrowed.portOf('orchestrator', { parentId: 'root:1', depth: 0 }))).keys()]).toEqual(['tester']);
    const lifted = setup('  orchestrator:\n    name: orchestrator\n    model: selected\n    delegates_to: []\n');
    expect([...catalogueOf(descriptionOf(lifted.portOf('orchestrator', { parentId: 'root:1', depth: 0 }))).keys()]).toEqual(lifted.resolver!.delegationTargets());
    rmSync(join(dir, 'global'), { recursive: true, force: true });
  });

  /*
   * PD-TOOLS-006 revision 10 (OQ-334, ruled 2026-10-15 under R-072): the catalogue's "publishes artifacts" is computed from the
   * child's resolved grant — the persona's own `can_publish_artifacts` with the caller's run's store (OQ-212) — and the
   * report-artifact sentence is carried where that store is. Finding F10 at 3c03287: a coordinator briefed a codebase-analyst to
   * publish, and nothing it was offered could say who publishes.
   */
  it('PD-TOOLS-006 revision 10 (red): a persona with artifact_write and can_publish_artifacts reads "publishes artifacts"; without the flag, or with no store, it does not; no built-in does', () => {
    const artifacts: ArtifactOps = { write: () => ({ ok: true, id: 'art_00000001', slug: 's' }), read: () => ({ ok: true, text: '' }), list: () => [] };
    const persona = (flag: string) => `  release-manager:\n    name: release-manager\n    model: selected\n    tools: [read_file, artifact_read, artifact_list, artifact_write]\n${flag}`;
    const flagged = setup(persona('    can_publish_artifacts: true\n'));
    const withStore = descriptionOf(flagged.portOf('orchestrator', { parentId: 'root:1', depth: 0, artifacts }));
    expect(catalogueOf(withStore).get('release-manager')).toBe('reads workspace files, publishes artifacts');
    expect(withStore).toContain(`${HAND_OFF_SENTENCE} ${REPORT_ARTIFACT_SENTENCE} When a child's report`);
    // The same persona under a run with no store: no artifact_write is granted, so neither the word nor the sentence.
    const noStore = descriptionOf(flagged.portOf('orchestrator', { parentId: 'root:1', depth: 0 }));
    expect(catalogueOf(noStore).get('release-manager')).toBe('reads workspace files');
    expect(noStore).not.toContain(REPORT_ARTIFACT_SENTENCE);
    // Without the flag the declared tool is withheld (REQ-TOOLS-004), and the entry says nothing of publishing.
    const unflagged = descriptionOf(setup(persona('')).portOf('orchestrator', { parentId: 'root:1', depth: 0, artifacts }));
    expect(catalogueOf(unflagged).get('release-manager')).toBe('reads workspace files');
    // OQ-212: under the defaults no built-in persona publishes, so every default entry is as it was.
    const defaults = catalogueOf(descriptionOf(setup('').portOf('orchestrator', { parentId: 'root:1', depth: 0, artifacts })));
    expect([...defaults.values()].filter((words) => words.includes('publishes artifacts'))).toEqual([]);
  });

  it('a configured tools: override changes that persona\'s line', async () => {
    const catalogue = await expectCatalogueMatchesChildGrants(`  docs-writer:
    name: docs-writer
    model: selected
    tools: [read_file, grep, write_file, terminal]
`, 'orchestrator');
    expect(catalogue.get('docs-writer')).toBe('reads workspace files, writes workspace files, runs commands');
  });

  it('the caller\'s tool_restrictions entry removes a facet from that persona\'s line — for that caller alone', async () => {
    const personas = `  orchestrator:
    name: orchestrator
    model: selected
    tool_restrictions:
      tester: [read_file, grep, write_file]
  planner:
    name: planner
    model: selected
    tools: [read_file, grep, delegate]
`;
    const catalogue = await expectCatalogueMatchesChildGrants(personas, 'orchestrator');
    expect(catalogue.get('tester')).toBe('reads workspace files, writes workspace files');
    // Another caller's map does not name tester: a child of a planner (configured here to delegate) would still run commands.
    const fromPlanner = await expectCatalogueMatchesChildGrants(personas, 'planner');
    expect(fromPlanner.get('tester')).toBe('reads workspace files, writes workspace files, runs commands');
  });

  /**
   * PD-TOOLS-006 revision 6 (OQ-220) with REQ-ORCH-028: the run reads which delegations are implementation delegations from the
   * same grant the description states, so the todo-item refusal and the description never disagree about a persona.
   */
  it('PD-TOOLS-006 revision 6: implementationRole is the catalogue\'s "writes workspace files", for every known role and caller', async () => {
    const personas = `  orchestrator:
    name: orchestrator
    model: selected
    tool_restrictions:
      tester: [read_file, grep, terminal]
  planner:
    name: planner
    model: selected
    tools: [read_file, grep, delegate]
  refactorer:
    name: refactorer
    model: selected
    read_only: true
  release-manager:
    name: release-manager
    model: selected
    tools: [git_read, write_file, todo]
`;
    const { resolver, portOf } = setup(personas);
    for (const caller of ['orchestrator', 'planner']) {
      const catalogue = catalogueOf(descriptionOf(portOf(caller, { parentId: 'root:1', depth: 0 })));
      const callerPersona = resolver!.resolve(caller)!.persona;
      for (const role of resolver!.delegationTargets()) {
        expect({ caller, role, implementation: implementationRole(resolver!.resolve(role)!.persona, callerPersona) }).toEqual({ caller, role, implementation: catalogue.get(role)!.split(', ').includes('writes workspace files') });
      }
    }
    const of = (role: string, caller = 'orchestrator') => implementationRole(resolver!.resolve(role)!.persona, resolver!.resolve(caller)!.persona);
    expect([of('coding-agent'), of('docs-writer'), of('release-manager')]).toEqual([true, true, true]);
    // The orchestrator's map leaves tester no writer, a planner's does not; read_only and the research roles never write.
    expect([of('tester'), of('tester', 'planner'), of('refactorer'), of('codebase-analyst'), of('verifier')]).toEqual([false, true, false, false, false]);
  });

  it('a read_only persona reads only, and a persona the configuration adds is named with its grant', async () => {
    const catalogue = await expectCatalogueMatchesChildGrants(`  refactorer:
    name: refactorer
    model: selected
    read_only: true
  release-manager:
    name: release-manager
    model: selected
    tools: [git_read, write_file, todo]
  scribe:
    name: scribe
    model: selected
    tools: [todo, fetch]
`, 'orchestrator');
    expect(catalogue.get('refactorer')).toBe('reads workspace files');
    expect(catalogue.get('release-manager')).toBe('reads workspace files, writes workspace files');
    expect(catalogue.get('scribe')).toBe('none of these: it neither reads nor writes workspace files nor runs commands');
  });
});

/**
 * REQ-MCP-034's isolated-run clause, found by the default live run at 1763f7f (finding D1): a run confined to a worktree had
 * its code-intelligence server launched with `--project <the anchoring workspace root>`, so its diagnostics answered from
 * the main checkout. The port hands the MCP host the configuration it launches from; the command line it carries is read
 * here, whole, for a port whose context names a worktree as its execution root.
 */
describe('REQ-MCP-034: the code-intelligence binding of a run in an isolated working tree', () => {
  let dir: string;
  let worktree: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  const warnings: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-isolated-'));
    worktree = join(dir, '.rotaris', 'requirements', 'worktrees', 'rotaris-req-req-104-u1');
    mkdirSync(worktree, { recursive: true });
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

  /** What the port handed the MCP host: the configuration and the root, per call. */
  interface Seen { readonly call: 'prepare' | 'surfaceFor' | 'executorsFor'; readonly cfg: LoadedConfiguration; readonly root: string }

  async function readyPort(effectiveRoot: string | undefined, entry = '') {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), `default_persona: coding-agent
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
    name: coding-agent
    model: selected
    mcp_servers: [code_intelligence]
${entry}runtime:
  permission_mode: autonomous
`);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    const cfg = loaded.value;
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const seen: Seen[] = [];
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async () => ({ ok: true }), close: () => undefined }, nextSequence: () => 1, fileStates: new Map(), terminal: null,
      egress: () => permissivePolicyRead,
      mcp: {
        prepare: async (c: LoadedConfiguration, root: string) => { seen.push({ call: 'prepare', cfg: c, root }); },
        surfaceFor: (c: LoadedConfiguration, root: string): PersonaMcpSurface => { seen.push({ call: 'surfaceFor', cfg: c, root }); return { persona: 'coding-agent', active: [], dropped: [] } as unknown as PersonaMcpSurface; },
        section: () => '',
        executorsFor: (a: { cfg: LoadedConfiguration; workspaceRoot: string }) => { seen.push({ call: 'executorsFor', cfg: a.cfg, root: a.workspaceRoot }); return []; },
      } as unknown as McpHost,
      configured: () => ({ cfg }) as unknown as ConfiguredRun,
    };
    const p = createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, ...(effectiveRoot === undefined ? {} : { effectiveRoot }), writer, persona: 'coding-agent', agentName: 'coding-agent',
      requestedMode: 'autonomous', modeOverride: null, attended: () => true, warn: (m) => warnings.push(m), info: () => undefined, abortRun: () => undefined,
    }, deps);
    await p.ready?.();
    return seen;
  }

  const argsOf = (cfg: LoadedConfiguration, name: string): readonly string[] => {
    const d = cfg.mcp.servers[name]!.description;
    if (d.transport !== 'stdio') throw new Error(`${name} is not a stdio server`);
    return d.args;
  };

  it('the command line every MCP call is handed ends with the project-path option and the worktree\'s root, and the anchoring root is absent', async () => {
    const seen = await readyPort(worktree);
    expect(seen.map((s) => s.call)).toEqual(['prepare', 'surfaceFor', 'executorsFor']);
    for (const s of seen) {
      const args = argsOf(s.cfg, 'code_intelligence');
      expect(args.slice(-2)).toEqual([CODE_INTELLIGENCE_BINDING.projectPathOption, worktree]);
      expect(args).not.toContain(dir);
      expect(args.filter((a) => a === CODE_INTELLIGENCE_BINDING.projectPathOption)).toHaveLength(1);
      expect(s.cfg.mcp.servers['code_intelligence']!.resolved?.args.slice(-2)).toEqual([CODE_INTELLIGENCE_BINDING.projectPathOption, worktree]);
    }
    // Discovery and the surface are memoised per root: the worktree's, so a base-tree run's memo is never reused.
    expect(seen.filter((s) => s.call !== 'executorsFor').map((s) => s.root)).toEqual([worktree, worktree]);
    // PD-MCP-002 (OQ-194): the executors' root, REQ-MCP-070's `lsp_init` root, is the worktree's too; until 2026-10-06 it
    // was the anchoring workspace root.
    expect(seen.find((s) => s.call === 'executorsFor')!.root).toBe(worktree);
  });

  it('a run in the base tree keeps the workspace root, exactly as configured', async () => {
    for (const effectiveRoot of [undefined, dir]) {
      const seen = await readyPort(effectiveRoot);
      for (const s of seen) expect(argsOf(s.cfg, 'code_intelligence').slice(-2)).toEqual([CODE_INTELLIGENCE_BINDING.projectPathOption, dir]);
    }
  });

  it('a project selection the entry already carries is left exactly as configured, isolated or not', async () => {
    const pinned = join(dir, 'elsewhere');
    const entry = `mcp_servers:
  code_intelligence:
    type: stdio
    command: builtin:code-intelligence
    args: [${CODE_INTELLIGENCE_DEFAULT_ARGS.join(', ')}, ${CODE_INTELLIGENCE_BINDING.projectPathOption}, ${pinned}]
`;
    const seen = await readyPort(worktree, entry);
    for (const s of seen) {
      const args = argsOf(s.cfg, 'code_intelligence');
      expect(args.slice(-2)).toEqual([CODE_INTELLIGENCE_BINDING.projectPathOption, pinned]);
      expect(args).not.toContain(worktree);
    }
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

