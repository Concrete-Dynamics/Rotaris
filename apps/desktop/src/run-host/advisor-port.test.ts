import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { parseAdvisorResult } from '@rotaris/contracts';
import { loadConfiguration } from '@rotaris/config';
import { permissivePolicyRead } from '@rotaris/agent-tools';
import { SessionWriter, type AdvisorOps, type AdvisorRequest, type ToolPortContext } from '@rotaris/engine';
import type { ChatMessage, ModelRef } from '@rotaris/model';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { advisorOf, personaResolverFor, runtimeFromConfiguration } from './configuration.js';
import { createToolPort, type ToolPortDeps } from './tools.js';

/**
 * PD-TOOLS-022 at the run host's port: who is offered the `advisor` tool (clauses 4 and 5), what the advisor is handed
 * (clause 2), the count the port keeps (clause 6), and what the configuration resolves (clauses 5, 6, 8).
 */
const yaml = (extra = '', tools: string | null = '[read_file, grep]') => `default_persona: coding-agent
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
  strong:
    provider: openai
    model_id: second
    api_key: k
large_model: strong
medium_model: selected
small_model: selected
personas:
  coding-agent:
    name: Coding agent
    model: selected
${tools === null ? '' : `    tools: ${tools}\n`}runtime:
  permission_mode: autonomous
${extra}`;

describe('the advisor at the tool port (PD-TOOLS-022)', () => {
  let dir: string;
  let dal: StoreDal;
  let writer: SessionWriter;
  const warnings: string[] = [];
  const other: ModelRef = { providerId: 'openai', modelId: 'an-advisor', dialect: 'chat' };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-advisor-'));
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

  function load(text: string) {
    mkdirSync(join(dir, '.rotaris'), { recursive: true });
    writeFileSync(join(dir, '.rotaris', 'agents.yaml'), text);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: dir });
    if (!loaded.ok) throw new Error('configuration');
    return loaded.value;
  }

  function portWith(advisor: ((agentModel: ModelRef) => AdvisorOps) | null, text = yaml(), extra: Partial<ToolPortContext> = {}) {
    const cfg = load(text);
    const resolver = personaResolverFor(cfg, true, (m) => warnings.push(m));
    const agentModel = resolver.resolve('coding-agent')!.persona.modelRef!;
    const deps: ToolPortDeps = {
      clocks: new FakeClock(), runtime: () => runtimeFromConfiguration(cfg), personas: () => resolver,
      presenter: { present: async () => ({ ok: true }), close: () => undefined },
      nextSequence: () => 1, fileStates: new Map(), terminal: null, egress: () => permissivePolicyRead,
    };
    const port = createToolPort({
      sessionId: asSessionId('S1'), workspaceRoot: dir, writer, persona: 'coding-agent', agentName: 'coding-agent',
      requestedMode: 'autonomous', attended: () => true, warn: (m) => warnings.push(m), abortRun: () => undefined,
      ...(advisor ? { advisor: advisor(agentModel) } : {}), ...extra,
    }, deps);
    return { port, agentModel };
  }

  const opsOf = (model: ModelRef, entryModel: ModelRef, seen: AdvisorRequest[], maxUses = 2): AdvisorOps => ({
    model, entryModel, maxUses,
    consult: async (request) => { seen.push(request); return { ok: true, advice: 'Read the test first.', model: 'strong' }; },
  });

  it('clause 4: an agent whose persona never declared it is offered the tool, last, where the run has an advisor on another model', async () => {
    const { port } = portWith((agent) => opsOf(other, agent, []));
    await port.ready?.();
    expect(port.resolvedTools?.()).toEqual(['read_file', 'grep', 'advisor']);
    expect(port.specs().map((s) => s.name)).toContain('advisor');
    expect(port.advisorUsesLeft?.()).toBe(2);
    expect(warnings.filter((w) => w.includes('advisor'))).toEqual([]);
  });

  it('clause 5: no advisor, or an advisor on the agent\'s own model, offers nothing and logs no removal', async () => {
    const none = portWith(null);
    await none.port.ready?.();
    expect(none.port.resolvedTools?.()).toEqual(['read_file', 'grep']);
    expect(none.port.advisorUsesLeft?.()).toBe(0);

    const same = portWith((agent) => opsOf({ ...agent }, other, []), yaml(), { parentId: 'bg_1', depth: 1 });
    await same.port.ready?.();
    expect(same.port.resolvedTools?.()).toEqual(['read_file', 'grep']);
    expect(warnings.filter((w) => w.includes('advisor'))).toEqual([]);
  });

  it('clause 5: the entry agent is compared by the run\'s entry model, a child by its persona\'s', async () => {
    // The entry agent runs on the entry model, which here IS the advisor's: nothing is offered, whatever the persona names.
    const entry = portWith(() => opsOf(other, other, []), yaml(), { parentId: 'root:1', depth: 0 });
    await entry.port.ready?.();
    expect(entry.port.resolvedTools?.()).not.toContain('advisor');
    // The same persona as a child runs on its own model, which is not the advisor's.
    const child = portWith(() => opsOf(other, other, []), yaml(), { parentId: 'bg_1', depth: 1 });
    await child.port.ready?.();
    expect(child.port.resolvedTools?.()).toContain('advisor');
  });

  it('clauses 2 and 6: a call hands the advisor the calling turn\'s conversation and the question, and the port counts', async () => {
    const seen: AdvisorRequest[] = [];
    const { port } = portWith((agent) => opsOf(other, agent, seen));
    await port.ready?.();
    const conversation: ChatMessage[] = [{ role: 'user', content: [{ kind: 'text', text: 'Fix the parser.' }] }];
    const call = (id: string) => port.dispatch({ callId: id, name: 'advisor', rawArgs: JSON.stringify({ question: 'Is my plan sound?' }), persona: 'coding-agent', agentId: 'coding-agent', agentName: 'coding-agent', conversation: () => conversation }, new AbortController().signal);
    const first = await call('c1');
    expect(first.status).toBe('ok');
    expect(parseAdvisorResult(first.text)).toEqual({ model: 'strong', use: 1, of: 2, advice: 'Read the test first.' });
    expect(seen).toEqual([{ messages: conversation, question: 'Is my plan sound?', agent: 'coding-agent', persona: 'coding-agent' }]);
    expect(port.advisorUsesLeft?.()).toBe(1);
    await call('c2');
    const third = await call('c3');
    expect(third.isError).toBe(true);
    expect(third.text).toContain('consults for this run are spent (2 of 2)');
    expect(seen).toHaveLength(2);
    expect(port.advisorUsesLeft?.()).toBe(0);
  });

  it('the plan gate does not withhold it: a plan is the first of the three moments', async () => {
    const { port } = portWith((agent) => opsOf(other, agent, []), yaml(), { planGateHeld: () => true });
    await port.ready?.();
    expect(port.resolvedTools?.()).toContain('advisor');
  });

  it('a tool_restrictions list that does not name it removes it, as it removes any tool', async () => {
    const { port } = portWith((agent) => opsOf(other, agent, []), yaml().replace('    model: selected\n', '    model: selected\n    tool_restrictions:\n      coding-agent: [read_file]\n'));
    await port.ready?.();
    expect(port.resolvedTools?.()).toEqual(['read_file']);
    expect(port.advisorUsesLeft?.()).toBe(0);
  });

  describe('what the configuration resolves (advisorOf)', () => {
    it('unset, the slot resolves to the large tier with the default cap', () => {
      const a = advisorOf(load(yaml()), false, 600);
      expect(a).toMatchObject({ model: { modelId: 'second' }, label: 'strong', maxUses: 3, timeoutMs: 600_000 });
    });
    it('the slot names the advisor, and its reasoning level travels', () => {
      const a = advisorOf(load(yaml('advisor_model: selected\nadvisor_model_thinking: high\nadvisor:\n  max_uses: 5\n')), false, 600);
      expect(a).toMatchObject({ model: { modelId: 'first' }, label: 'selected', thinking: 'high', maxUses: 5 });
    });
    it('the switch off, or a cap of 0, is no advisor', () => {
      expect(advisorOf(load(yaml('advisor:\n  enabled: false\n')), false, 600)).toBeNull();
      expect(advisorOf(load(yaml('advisor:\n  max_uses: 0\n')), false, 600)).toBeNull();
    });
  });
});
