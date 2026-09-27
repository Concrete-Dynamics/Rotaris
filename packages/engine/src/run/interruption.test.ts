import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage } from '@rotaris/model';
import type { Interruption } from '@rotaris/contracts';
import { ProjectionOwner } from '../projection-owner.js';
import { SequenceCounters } from '../sequence.js';
import { SessionWriter } from '../session-writer.js';
import { runTurn, type PortToolCall, type PortToolResult, type ToolPort, type TurnDeps } from './turn.js';
import type { LoopSupervisor } from './supervisor.js';
import { answerUnanswered, interruptedResult } from './interruption.js';

/**
 * PD-ORCH-005 clauses 2, 3, 4 and 9 — what a tool call the run's rest cut short leaves in its agent's conversation, and
 * how a turn comes to rest: every call of the step gets a result, a completed call its own, a call cut off or withdrawn
 * the interrupted statement with what it produced, and a call not yet started the statement that it never ran.
 */
const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const SID = 'S-rest' as SessionId;

describe('PD-ORCH-005: the interrupted result', () => {
  it('a call under way is interrupted before it completed, with what it had produced; one never started says it was not run', () => {
    expect(interruptedResult('stop', true, 'half a line')).toBe('This call was interrupted by the stop before it completed, and it was not re-run. Issue it again if it is still needed.\nWhat it had produced before it was cut off:\nhalf a line');
    expect(interruptedResult('pause', false, '')).toBe('This call was not run: it was interrupted by the pause before it started, and it was not re-run. Issue it again if it is still needed.');
    expect(interruptedResult('quit', true, '  ')).toBe('This call was interrupted by quitting the application before it completed, and it was not re-run. Issue it again if it is still needed.');
  });

  it('a call cut by no rest — its agent\'s limit, a cancel — names no rest (found by phase 3\'s second review)', () => {
    expect(interruptedResult(null, true, 'half')).toBe('This call was cut off before it completed, and it was not re-run. Issue it again if it is still needed.\nWhat it had produced before it was cut off:\nhalf');
    expect(interruptedResult(null, false, '')).toBe('This call was not run: its agent was stopped before it started, and it was not re-run. Issue it again if it is still needed.');
  });

  it('after a crash, the calls of a last assistant message with no results and no rows are each answered as never started; anything else is left as it is', () => {
    const none = () => undefined;
    const calls: ChatMessage = { role: 'assistant', content: [{ kind: 'text', text: 'Two.' }, { kind: 'tool-call', callId: 'a', name: 'probe', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'grep', args: '{}' }] };
    const answered = answerUnanswered([{ role: 'user', content: [{ kind: 'text', text: 'go' }] }, calls], 'crash', none);
    expect(answered).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'probe', isError: true, result: interruptedResult('crash', false, '') },
      { kind: 'tool-result', callId: 'b', name: 'grep', isError: true, result: interruptedResult('crash', false, '') },
    ] });
    expect(answerUnanswered([calls, answered!], 'crash', none)).toBeNull();
    expect(answerUnanswered([{ role: 'assistant', content: [{ kind: 'text', text: 'done' }] }], 'crash', none)).toBeNull();
    expect(answerUnanswered([], 'crash', none)).toBeNull();
  });

  it('a call that completed keeps what it returned; only a call cut off before its result arrived is answered as interrupted (found by phase 3\'s fourth review)', () => {
    const calls: ChatMessage = { role: 'assistant', content: [{ kind: 'tool-call', callId: 'w', name: 'write', args: '{}' }, { kind: 'tool-call', callId: 'x', name: 'lint', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'boom', args: '{}' }] };
    const known = new Map([['w', { result: 'wrote the file', isError: false }], ['x', { result: 'two warnings', isError: true }]]);
    expect(answerUnanswered([calls], 'pause', (id) => known.get(id))).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'w', name: 'write', isError: false, result: 'wrote the file' },
      { kind: 'tool-result', callId: 'x', name: 'lint', isError: true, result: 'two warnings' },
      { kind: 'tool-result', callId: 'b', name: 'boom', isError: true, result: interruptedResult('pause', false, '') },
    ] });
  });
});

describe('PD-ORCH-005: a turn comes to rest (runTurn)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let writer: SessionWriter;
  let owner: ProjectionOwner;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-rest-'));
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

  const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} });
  function port(onDispatch: (call: PortToolCall, signal: AbortSignal) => PortToolResult | Promise<PortToolResult>): { tools: ToolPort; dispatched: string[] } {
    const dispatched: string[] = [];
    return {
      dispatched,
      tools: {
        specs: () => [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }],
        dispatch: async (c, signal) => { dispatched.push(c.callId); return onDispatch(c, signal); },
        cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      },
    };
  }
  function deps(client: ScriptedModelClient, tools: ToolPort, over: Partial<TurnDeps> = {}): TurnDeps {
    return {
      writer, owner, backend: new DefaultAgentBackend(client), tools, clocks: clock, persona: 'coding-agent', agentName: 'worker', systemPrompt: 'You are the worker.',
      model: MODEL, thinking: 'unset', modelTimeoutMs: 120_000, modelRetries: 0, credentialFor: () => async () => 'k', maxStepsPerTurn: 50, warn: () => undefined,
      dispatched: new Map(), ...over,
    };
  }
  const three = () => toolCalls([{ callId: 'c1', name: 'probe', args: {} }, { callId: 'c2', name: 'probe', args: {} }, { callId: 'c3', name: 'probe', args: {} }], 'Three probes.');
  const resultsOf = (messages: readonly ChatMessage[]) => messages.at(-1)!.content.flatMap((p) => (p.kind === 'tool-result' ? [{ callId: p.callId, result: p.result }] : []));

  it('clause 3, a stop mid-step: the completed call keeps its result, the cut call is interrupted with its output, the call not started never ran — and the step\'s results are all recorded', async () => {
    const client = new ScriptedModelClient([three(), answer('never')]);
    const stop = new AbortController();
    let rest: Interruption | null = null;
    const { tools, dispatched } = port((c) => {
      if (c.callId === 'c1') return ok('first-done');
      rest = 'stop';
      stop.abort();
      return { ...ok('half'), isError: true, status: 'failed' };
    });
    const recorded: ChatMessage[] = [];
    const out = await runTurn(deps(client, tools, { interruption: () => rest, recorder: { appended: (m) => { recorded.push(m); }, replaced: () => undefined } }), 'Do it.', [], stop.signal);
    expect(out.paused).toBe(true);
    expect(dispatched).toEqual(['c1', 'c2']);
    expect(resultsOf(out.messages)).toEqual([
      { callId: 'c1', result: 'first-done' },
      { callId: 'c2', result: interruptedResult('stop', true, 'half') },
      { callId: 'c3', result: interruptedResult('stop', false, '') },
    ]);
    // The record is the conversation: before the build, the whole `tool` message was lost with the stop (the spike's finding 2).
    expect(recorded.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(client.requests).toHaveLength(1);
  });

  it('clause 2, a pause: the call in flight finishes, no later call of the step starts, and no model step follows', async () => {
    const client = new ScriptedModelClient([three(), answer('never')]);
    let rest: Interruption | null = null;
    const { tools, dispatched } = port((c) => { if (c.callId === 'c1') rest = 'pause'; return ok(`${c.callId}-done`); });
    const out = await runTurn(deps(client, tools, { interruption: () => rest, shouldPause: () => rest !== null }), 'Do it.', [], new AbortController().signal);
    expect(out.paused).toBe(true);
    expect(dispatched).toEqual(['c1']);
    expect(resultsOf(out.messages)).toEqual([
      { callId: 'c1', result: 'c1-done' },
      { callId: 'c2', result: interruptedResult('pause', false, '') },
      { callId: 'c3', result: interruptedResult('pause', false, '') },
    ]);
    expect(client.requests).toHaveLength(1);
  });

  it('clause 2: a pause accepted while the loop supervisor checks (which may call its classifier) allows no model step after the check', async () => {
    const client = new ScriptedModelClient([toolCalls([{ callId: 'c1', name: 'probe', args: {} }], 'One.'), answer('never')]);
    let rest: Interruption | null = null;
    let checks = 0;
    const supervisor = {
      check: async () => { checks += 1; if (checks === 2) rest = 'pause'; return { kind: 'continue' as const }; },
      observe: () => undefined, noteUserInstruction: () => undefined,
    } as unknown as LoopSupervisor;
    const { tools } = port((c) => ok(`${c.callId}-done`));
    const out = await runTurn(deps(client, tools, { supervisor, interruption: () => rest, shouldPause: () => rest !== null }), 'Do it.', [], new AbortController().signal);
    expect(out.paused).toBe(true);
    expect(checks).toBe(2);
    expect(client.requests).toHaveLength(1);
  });

  it('REQ-ORCH-134 (clause 2): a call still in flight when the pause\'s tool deadline passes is cut and recorded as interrupted', async () => {
    const client = new ScriptedModelClient([toolCalls([{ callId: 'c1', name: 'probe', args: {} }], 'One.'), answer('never')]);
    const deadline = new AbortController();
    let rest: Interruption | null = null;
    const { tools } = port(async (_c, signal) => {
      rest = 'pause';
      deadline.abort();
      return signal.aborted ? { ...ok('partial output'), isError: true, status: 'failed' } : ok('finished');
    });
    const out = await runTurn(deps(client, tools, { interruption: () => rest, shouldPause: () => rest !== null, cutCalls: deadline.signal }), 'Do it.', [], new AbortController().signal);
    expect(out.paused).toBe(true);
    expect(resultsOf(out.messages)).toEqual([{ callId: 'c1', result: interruptedResult('pause', true, 'partial output') }]);
  });

  it('clause 9: a call whose approval was withdrawn is recorded as interrupted and never run — never as denied', async () => {
    const client = new ScriptedModelClient([toolCalls([{ callId: 'c1', name: 'probe', args: {} }], 'One.'), answer('never')]);
    let rest: Interruption | null = null;
    const withdrawn = 'The approval this call was waiting on was withdrawn by the pause; the call was not run.';
    const { tools } = port(() => { rest = 'pause'; return { ...ok(withdrawn), isError: true, status: 'blocked', blockedReason: withdrawn, interrupted: true }; });
    const out = await runTurn(deps(client, tools, { interruption: () => rest, shouldPause: () => rest !== null }), 'Do it.', [], new AbortController().signal);
    expect(out.paused).toBe(true);
    expect(resultsOf(out.messages)).toEqual([{ callId: 'c1', result: interruptedResult('pause', false, withdrawn) }]);
    expect(resultsOf(out.messages)[0]!.result).not.toMatch(/denied/i);
  });

  it('REQ-ORCH-088 unchanged: a landing (the same stop-before-the-next-step flag, with no rest) lets every call of the step run', async () => {
    const client = new ScriptedModelClient([three(), answer('never')]);
    let landing = false;
    const { tools, dispatched } = port((c) => { landing = true; return ok(`${c.callId}-done`); });
    const out = await runTurn(deps(client, tools, { interruption: () => null, shouldPause: () => landing }), 'Do it.', [], new AbortController().signal);
    expect(dispatched).toEqual(['c1', 'c2', 'c3']);
    expect(resultsOf(out.messages).map((r) => r.result)).toEqual(['c1-done', 'c2-done', 'c3-done']);
    expect(out.paused).toBe(true);
  });
});
