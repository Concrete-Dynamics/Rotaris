import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage, ModelRequest, ToolSpec } from '@rotaris/model';
import { rebuild } from '@rotaris/engine';
import { scriptedClient } from './scripted-client.js';

/*
 * The scripted client is verification only; these tests pin the step it takes, which is what a driven proof scripts
 * against. PD-ORCH-005 resumes an agent from its own record, and the double must carry on from there rather than take
 * its script from the first step again (the repair of the-scripted-client-restarts-its-script-for-every-run.md).
 */
const TOOLS: readonly ToolSpec[] = ['glob', 'read_file', 'write_file', 'terminal'].map((name) => ({ name, description: name, parameters: {} }));
const CHILD_SYSTEM = 'You are the coder.';
const ORCHESTRATOR_SYSTEM = 'You are the orchestrator of this workspace.';

const text = (role: 'system' | 'user', t: string): ChatMessage => ({ role, content: [{ kind: 'text', text: t }] });
const step = (callId: string, name: string): ChatMessage[] => [
  { role: 'assistant', content: [{ kind: 'text', text: `Calling ${name}. ` }, { kind: 'tool-call', callId, name, args: '{}' }] },
  { role: 'tool', content: [{ kind: 'tool-result', callId, name, result: 'ok', isError: false }] },
];
const request = (messages: readonly ChatMessage[]): ModelRequest => ({
  model: { providerId: 'scripted', modelId: 'scripted', dialect: 'chat' }, messages, thinking: 'unset', signal: new AbortController().signal,
  timeoutMs: 1_000, retries: 0, resolveCredential: async () => '', tools: TOOLS,
});
const settled = () => new Promise<undefined>((resolve) => { setImmediate(() => resolve(undefined)); });
/** The tool the call asked for, `answer` when it streamed a reply instead, or the failure it answered with. */
async function taken(clock: FakeClock, client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<string> {
  const parts = client.stream(request(messages))[Symbol.asyncIterator]();
  for (;;) {
    const next = parts.next();
    let r = await Promise.race([next, settled()]);
    // The streamed reply paces its words on the clock port; the fake clock is moved on until the part arrives.
    while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
    if (r.done === true) return 'answer';
    const part = r.value;
    if (!part.ok) return `failed:${part.error.headline}`;
    if (part.value.kind === 'tool-call') { await parts.return?.(); return part.value.name; }
    if (part.value.kind === 'text' && part.value.delta.startsWith('I ')) { await parts.return?.(); return 'answer'; }
  }
}

describe('scriptedClient — the step a call takes', () => {
  let clock: FakeClock;
  beforeEach(() => { clock = new FakeClock(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('PD-ORCH-005: a fresh agent takes its script from the first step, one step per call', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,write,git');
    const client = scriptedClient(clock, () => {});
    const first = [text('system', CHILD_SYSTEM), text('user', 'TASK: writer\nEXPECTED OUTCOME: done')];
    expect(await taken(clock, client, first)).toBe('glob');
    expect(await taken(clock, client, [...first, ...step('c1', 'glob')])).toBe('write_file');
  });

  it('PD-ORCH-005: a child resumed in a new run takes the step after the ones its own record holds, not its first step again', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,write,git');
    // A new client is what a continue builds (one per run); the child's record carries its first step.
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', CHILD_SYSTEM), text('user', 'TASK: writer\nEXPECTED OUTCOME: done'), ...step('c1', 'glob')];
    expect(await taken(clock, resumed, record)).toBe('write_file');
    expect(await taken(clock, resumed, [...record, ...step('c2', 'write_file')])).toBe('terminal');
  });

  it('PD-ORCH-005: a resumed root carries on from its record too, and the steps it has not taken are still taken in order', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,read,glob');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'pause me'), ...step('c1', 'read_file'), ...step('c2', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('glob');
  });

  it('PD-ORCH-005: a wait prefix and a failed call the record cannot show were consumed before the steps it does show', async () => {
    // `wait:` is a prefix of the step after it and `fail:503` answers with no message, so neither appears in the record;
    // the record's two steps are the two reads, and the resumed root's next step is the glob.
    vi.stubEnv('ROTARIS_SCRIPT', 'fail:503,read,wait:7000,read,glob');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'steer then pause'), ...step('c1', 'read_file'), ...step('c2', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('glob');
  });

  it('PD-ORCH-005: a record longer than the script answers, as the end of the list always has', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'done already'), ...step('c1', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('answer');
  });

  it('PD-ORCH-005: only a key\'s first call in a client is seeded from the record; later calls count on as before', async () => {
    // Two iterations in one run: the second root's record is fresh, and the counter carries on from the first root's steps.
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob,git');
    const client = scriptedClient(clock, () => {});
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    expect(await taken(clock, client, firstRoot)).toBe('read_file');
    expect(await taken(clock, client, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')])).toBe('glob');
  });

  /*
   * The repair of fixed/the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md: the record a resumed agent
   * carries need not hold every step it took. Each client below plays the run up to the pause the way the product would
   * record it (`answered` turns a call into the assistant message `turn.ts` pushes), and a new client — what a continue
   * builds — is handed the record.
   */
  it('PD-ORCH-005: a root resumed in a later iteration of its run carries on from every iteration\'s steps, not only that iteration\'s', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    // Iteration 1: the root reads and globs, and the iteration closes.
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    const one = await answered(clock, unbroken, firstRoot);
    const two = await answered(clock, unbroken, [...firstRoot, one, result(one)]);
    expect([nameOf(one), nameOf(two)]).toEqual(['read_file', 'glob']);
    // Iteration 2: a fresh root, whose one step before the quit is the script's third.
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    const three = await answered(clock, unbroken, secondRoot);
    expect(nameOf(three)).toBe('read_file');
    // The continue resumes iteration 2's root: its record holds one step, and the root has taken three.
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, [...secondRoot, three, result(three)])).toBe('write_file');
  });

  it('PD-ORCH-005: a root whose later iteration holds only a streamed answer carries on after it too', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,answer,git');
    const unbroken = scriptedClient(clock, () => {});
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    expect(nameOf(await answered(clock, unbroken, firstRoot))).toBe('read_file');
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    const reply = await answered(clock, unbroken, secondRoot);
    expect(nameOf(reply)).toBe('answer');
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, [...secondRoot, reply, text('user', 'carry on')])).toBe('terminal');
  });

  it('PD-ORCH-005: a child whose record the compressing pass rewrote carries on from the steps it took, and keeps its key', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,read,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    const task = text('user', 'TASK: writer\nEXPECTED OUTCOME: done');
    let record: ChatMessage[] = [text('system', CHILD_SYSTEM), task];
    for (let i = 0; i < 3; i += 1) { const m = await answered(clock, unbroken, record); record = [...record, m, result(m)]; }
    // The compressing pass condenses all three steps and keeps no turn (`preserve_recent_turns: 0`); the summary is the
    // scripted compressor's own answer, and `rebuild` is the product's reconstruction around it.
    const summary = await answered(clock, unbroken, [text('system', COMPRESSOR_SYSTEM), text('user', 'Condense the agent activity below.')]);
    const summaryText = summary.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const compressed = [text('system', CHILD_SYSTEM), ...rebuild(task, summaryText, [], [])];
    // The rebuilt record still opens with the TASK line, so the child is keyed as it was.
    expect(compressed[1]).toBe(task);
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, compressed)).toBe('write_file');
  });

  it('PD-ORCH-005: a compressed record that kept its latest turns reads them after the summary', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,read,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    const task = text('user', 'TASK: writer\nEXPECTED OUTCOME: done');
    let record: ChatMessage[] = [text('system', CHILD_SYSTEM), task];
    for (let i = 0; i < 3; i += 1) { const m = await answered(clock, unbroken, record); record = [...record, m, result(m)]; }
    const summary = await answered(clock, unbroken, [text('system', COMPRESSOR_SYSTEM), text('user', 'Condense the agent activity below.')]);
    const summaryText = summary.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    // The last step and its result are the one preserved turn; the summary stood for three steps and the turn is the third.
    const compressed = [text('system', CHILD_SYSTEM), ...rebuild(task, summaryText, [], record.slice(-2))];
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, compressed)).toBe('write_file');
  });
});

const COMPRESSOR_SYSTEM = 'You condense an agent conversation so the agent can carry on with a shorter history.';

/** The tool a message called, or `answer`. */
function nameOf(message: ChatMessage): string {
  return message.content.find((p) => p.kind === 'tool-call')?.name ?? 'answer';
}
/** The tool result `turn.ts` pushes after a step that called a tool. */
function result(message: ChatMessage): ChatMessage {
  const call = message.content.find((p) => p.kind === 'tool-call');
  if (call?.kind !== 'tool-call') throw new Error('the step called no tool');
  return { role: 'tool', content: [{ kind: 'tool-result', callId: call.callId, name: call.name, result: 'ok', isError: false }] };
}
/** The whole call, as the assistant message `turn.ts` pushes for it: its text, then its tool calls. */
async function answered(clock: FakeClock, client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<ChatMessage> {
  const parts = client.stream(request(messages))[Symbol.asyncIterator]();
  let said = '';
  const calls: { kind: 'tool-call'; callId: string; name: string; args: string }[] = [];
  for (;;) {
    const next = parts.next();
    let r = await Promise.race([next, settled()]);
    while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
    if (r.done === true) break;
    const part = r.value;
    if (!part.ok) throw new Error(part.error.headline);
    if (part.value.kind === 'text') said += part.value.delta;
    if (part.value.kind === 'tool-call') calls.push({ kind: 'tool-call', callId: part.value.callId, name: part.value.name, args: part.value.argsDelta });
  }
  return { role: 'assistant', content: [...(said ? [{ kind: 'text' as const, text: said }] : []), ...calls] };
}
