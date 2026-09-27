import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage } from '@rotaris/model';
import { ProjectionOwner } from '../projection-owner.js';
import { SequenceCounters } from '../sequence.js';
import { SessionWriter } from '../session-writer.js';
import { runTurn, type PortToolResult, type ToolPort, type TurnDeps } from './turn.js';
import type { ConversationRecorder } from './conversation.js';

/**
 * SPIKE — PD-ORCH-005's smallest end-to-end slice, taken as the first act of building it: record ONE agent's
 * conversation as it happens, pause it, restore the record into a new `Conversation`, and continue it against the
 * scripted backend. The findings are written up in `docs/architecture/spikes/agent-resume.md`.
 */
const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const SID = 'S-spike' as SessionId;

describe('SPIKE PD-ORCH-005: one agent recorded, paused, restored and continued', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let writer: SessionWriter;
  let owner: ProjectionOwner;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-resume-spike-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    const w = SessionWriter.create({ dal, sessionId: SID, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => owner?.onCommitted(c) }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    writer = w.value;
    owner = new ProjectionOwner({ sessionId: SID, seq: new SequenceCounters(), timers: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, readSession: () => ({} as never), readResident: () => [] });
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /** The record, as the store would hold it: every message appended, a compression written as a replacement. */
  function memoryRecord(): { readonly messages: ChatMessage[]; readonly recorder: ConversationRecorder; replacements: number } {
    const messages: ChatMessage[] = [];
    const rec = {
      messages, replacements: 0,
      recorder: {
        appended: (m: ChatMessage) => { messages.push(structuredClone(m)); },
        replaced: (ms: readonly ChatMessage[]) => { messages.length = 0; messages.push(...structuredClone([...ms])); rec.replacements += 1; },
      },
    };
    return rec;
  }

  function port(onDispatch: (name: string) => PortToolResult | Promise<PortToolResult>): ToolPort {
    return {
      specs: () => [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }],
      dispatch: async (c) => onDispatch(c.name),
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
  }
  const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} });

  function deps(client: ScriptedModelClient, tools: ToolPort, over: Partial<TurnDeps> = {}): TurnDeps {
    return {
      writer, owner, backend: new DefaultAgentBackend(client), tools, clocks: clock, persona: 'coding-agent', agentName: 'worker', systemPrompt: 'You are the worker.',
      model: MODEL, thinking: 'unset', modelTimeoutMs: 120_000, modelRetries: 0, credentialFor: () => async () => 'k', maxStepsPerTurn: 50, warn: () => undefined,
      dispatched: new Map(), ...over,
    };
  }
  /** What a request carried, less the system message the backend puts first. */
  const sent = (client: ScriptedModelClient, i: number): ChatMessage[] => client.requests[i]!.messages.slice(1) as ChatMessage[];

  it('a paused turn\'s record is exactly its conversation, and a new Conversation built from it continues where it stood', async () => {
    const client = new ScriptedModelClient([
      toolCalls([{ callId: 'c1', name: 'probe', args: { what: 'a' } }], 'Probing.'),
      // After the restore: the continuation's first request carries the whole record and nothing else.
      answer('Finished: probe said result-a.'),
    ]);
    const rec = memoryRecord();
    let paused = false;
    // The pause is accepted while the tool call is in flight; the call finishes and the turn stops before its next step.
    const tools = port(() => { paused = true; return ok('result-a'); });
    const first = await runTurn(deps(client, tools, { recorder: rec.recorder, shouldPause: () => paused }), 'Do the task.', [], new AbortController().signal);
    expect(first.paused).toBe(true);
    expect(client.requests).toHaveLength(1);
    expect(rec.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(rec.messages).toEqual(first.messages);

    // Restore: a NEW turn over a NEW Conversation built from the record alone, with no new message.
    const again = memoryRecord();
    const second = await runTurn(deps(client, tools, { recorder: again.recorder }), null, rec.messages, new AbortController().signal);
    expect(second.report.text).toBe('Finished: probe said result-a.');
    expect(sent(client, 1)).toEqual(rec.messages);
    // The restored conversation records only what it adds; the old record plus this is the whole conversation.
    expect(again.messages.map((m) => m.role)).toEqual(['assistant']);
  });

  it('a call cut off before its result arrived leaves an assistant tool-call with no result: the restore must answer it', async () => {
    const client = new ScriptedModelClient([
      toolCalls([{ callId: 'c1', name: 'probe', args: {} }, { callId: 'c2', name: 'probe', args: {} }], 'Two probes.'),
      answer('I will re-issue the interrupted probe.'),
    ]);
    const rec = memoryRecord();
    const controller = new AbortController();
    let n = 0;
    // The first call completes; the stop arrives during the second.
    const tools = port(async () => { n += 1; if (n === 2) { controller.abort(); return { ...ok('partial'), isError: true, status: 'failed' }; } return ok('first-done'); });
    const first = await runTurn(deps(client, tools, { recorder: rec.recorder }), 'Do it.', [], controller.signal);
    // Today the turn returns on the abort WITHOUT pushing the tool message: the completed call's result is lost too.
    expect(rec.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(first.messages.at(-1)!.role).toBe('assistant');
    // The restore owes a result for EVERY call of that assistant message, or a provider rejects the history (a 400).
    const calls = rec.messages.at(-1)!.content.flatMap((p) => (p.kind === 'tool-call' ? [p] : []));
    const restored: ChatMessage[] = [...rec.messages, { role: 'tool', content: calls.map((c) => ({ kind: 'tool-result' as const, callId: c.callId, name: c.name, isError: true, result: 'The call was interrupted by a stop before it completed and was not re-run.' })) }];
    const second = await runTurn(deps(client, tools), null, restored, new AbortController().signal);
    expect(second.report.text).toContain('re-issue');
    const history = sent(client, 1);
    expect(history.at(-1)!.role).toBe('tool');
    expect(history.at(-1)!.content).toHaveLength(2);
  });

  it('a compression replaces the conversation, so the record must take the replacement or a resume re-sends what was compressed away', async () => {
    const rec = memoryRecord();
    const { Conversation } = await import('./conversation.js');
    const conv = new Conversation([], rec.recorder);
    conv.push({ role: 'user', content: [{ kind: 'text', text: 'original request' }] });
    for (let i = 0; i < 5; i++) {
      conv.push({ role: 'assistant', content: [{ kind: 'tool-call', callId: `c${i}`, name: 'probe', args: '{}' }] });
      conv.push({ role: 'tool', content: [{ kind: 'tool-result', callId: `c${i}`, name: 'probe', result: 'x'.repeat(100), isError: false }] });
    }
    conv.replace([conv.snapshot()[0]!, { role: 'user', content: [{ kind: 'text', text: '[summary of 10 messages]' }] }]);
    expect(rec.replacements).toBe(1);
    expect(rec.messages).toHaveLength(2);
    expect(conv.originalRequest?.content).toEqual([{ kind: 'text', text: 'original request' }]);
  });

  it('prices the record: one message per transaction on the store the run already writes', () => {
    dal.db.exec(`CREATE TABLE spike_messages (session_id TEXT NOT NULL, task_id TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (session_id, task_id, seq))`);
    const insert = dal.db.prepare('INSERT INTO spike_messages (session_id, task_id, seq, body) VALUES (?, ?, ?, ?)');
    const body = JSON.stringify({ role: 'tool', content: [{ kind: 'tool-result', callId: 'c', name: 'terminal', result: 'y'.repeat(4096), isError: false }] });
    const N = 1000;
    const started = performance.now();
    for (let i = 0; i < N; i++) dal.db.transaction(() => insert.run(SID, 'bg_00000001', i, body))();
    const perMessageMs = (performance.now() - started) / N;
    // Recorded in the spike note; asserted loosely so the spike stays a measurement and not a flaky gate.
    expect(perMessageMs).toBeGreaterThan(0);
    process.stdout.write(`SPIKE record append: ${N} messages of ${body.length} B, ${perMessageMs.toFixed(3)} ms per message-transaction\n`);
  });
});
